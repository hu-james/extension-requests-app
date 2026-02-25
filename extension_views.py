"""
Extension Request API Views
Handles all API endpoints for extension requests
"""
import os
import json
import logging
from datetime import datetime, timezone
from functools import wraps

from flask import (
    jsonify, request, current_app,
    send_from_directory, abort, session
)

from models import (
    db, User, Course, ExtensionPolicy,
    ExtensionRequest
)
from canvas_service import CanvasService
from file_security import validate_and_save_file, FileValidationError
import settings


logger = logging.getLogger(__name__)


def check_valid_user(f):
    """Decorator to check if user is authenticated via LTI"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from flask import current_app


        lti_authenticated = session.get('lti_authenticated', False)
        lti_user_id = session.get('lti_user_id')

        if not lti_authenticated or not lti_user_id:
            # Check for session token in Authorization header, X-Session-Token header, or query parameter
            auth_header = request.headers.get('Authorization', '')
            token = None

            if auth_header.startswith('Bearer '):
                token = auth_header[7:]
            elif 'X-Session-Token' in request.headers:
                token = request.headers.get('X-Session-Token')
            elif 'token' in request.args:
                # Allow token in query parameter for file downloads/iframes
                token = request.args.get('token')

            if token:
                logger.info(f"Token found: {token[:10]}...")
                if hasattr(current_app, '_session_tokens'):
                    logger.info(f"Token storage has {len(current_app._session_tokens)} tokens")
                    token_data = current_app._session_tokens.get(token)
                    if token_data:
                        # Restore session data from token
                        session.update(token_data)
                        lti_authenticated = True
                        lti_user_id = token_data.get('lti_user_id')
                        logger.info(f"Token validated for user: {token_data.get('lti_user_name')}")
                    else:
                        logger.warning(f"Token not found in storage")
                else:
                    logger.warning(f"Token storage not initialized")

        if not lti_authenticated or not lti_user_id:
            logger.warning(f"Unauthenticated access attempt to {request.endpoint}")
            return jsonify({'error': 'LTI authentication required'}), 401

        if 'course_id' not in kwargs:
            return jsonify({'error': 'No course_id provided'}), 400

        return f(*args, **kwargs)
    return decorated_function


def is_instructor(f):
    """Decorator to check if user has instructor role"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check if user has instructor role in LTI 1.3
        roles = session.get('lti_roles', [])
        is_instructor_role = any(role in settings.INSTRUCTOR_ROLES for role in roles)

        if not is_instructor_role:
            logger.warning(f"Non-instructor access attempt to {request.endpoint}")
            return jsonify({'error': 'Instructor role required'}), 403

        return f(*args, **kwargs)
    return decorated_function


def get_canvas_service():
    """Get Canvas service instance with access token"""
    try:

        use_mock = os.environ.get('USE_MOCK_CANVAS', 'false').lower() == 'true'

        if use_mock:
            from mock_canvas_service import MockCanvasService
            logger.info("Using Mock Canvas Service")
            return MockCanvasService()

        # Use real Canvas API
        api_url = current_app.config.get('CANVAS_API_URL')
        api_token = current_app.config.get('CANVAS_API_TOKEN')

        logger.info(f"Using Real Canvas Service: {api_url}")

        # Try to use LTI access token first, fall back to permanent token
        access_token = session.get('canvas_access_token')
        return CanvasService(
            api_url=api_url,
            api_token=api_token,
            access_token=access_token
        )
    except Exception as e:
        logger.error(f"Error initializing Canvas service: {e}")
        raise


# API Routes

def init_extension_routes(app):
    """Initialize all extension request API routes"""

    @app.route('/api/courses/<int:course_id>/assignments', methods=['GET'])
    @check_valid_user
    def list_assignments(course_id):
        """Get all assignments for a course"""
        try:
            canvas = get_canvas_service()
            assignments = canvas.get_assignments(course_id)

            logger.info(f"Retrieved {len(assignments)} assignments for course {course_id}")
            return jsonify(assignments)

        except Exception as e:
            logger.error(f"Error fetching assignments for course {course_id}: {e}", exc_info=True)
            return jsonify({'error': f'Failed to fetch assignments: {str(e)}'}), 500

    @app.route('/api/courses/<int:course_id>/extension-requests', methods=['POST'])
    @check_valid_user
    def create_extension_request(course_id):
        """Create extension request(s) for student"""
        try:
            canvas_user_id = session.get('canvas_user_id')
            user = User.query.filter_by(canvas_id=str(canvas_user_id)).first()
            course = Course.query.filter_by(canvas_id=str(course_id)).first()

            if not user or not course:
                logger.error(f"Invalid user ({canvas_user_id}) or course ({course_id})")
                return jsonify({'error': 'Invalid user or course'}), 400

            # Parse form data
            data = json.loads(request.form.get('data'))

            # Validate required fields
            if not data.get('assignmentIds') or not data.get('reason'):
                return jsonify({'error': 'Missing required fields'}), 400

            if len(data['assignmentIds']) == 0:
                return jsonify({'error': 'At least one assignment must be selected'}), 400

            # Validate reason field length and content
            reason = str(data.get('reason', '')).strip()
            if not reason:
                return jsonify({'error': 'Reason cannot be empty'}), 400
            if len(reason) > 10000:
                return jsonify({'error': 'Reason must be less than 10,000 characters'}), 400

            # Store validated reason
            data['reason'] = reason

            # Validate assignmentIds count (prevent DoS)
            if len(data['assignmentIds']) > 50:
                return jsonify({'error': 'Cannot request extensions for more than 50 assignments at once'}), 400

            # Get course policy to validate request
            policy = ExtensionPolicy.query.filter_by(course_id=course.id).first()
            if not policy:
                # Create default policy if none exists
                policy = ExtensionPolicy(course_id=course.id)
                db.session.add(policy)
                db.session.commit()

            # Handle file uploads with security validation
            files = request.files.getlist('documentation')
            documentation_urls = []

            # Check if documentation is required
            if policy.require_documentation and not files:
                return jsonify({
                    'error': 'Documentation is required by course policy. Please upload supporting documents.'
                }), 400

            canvas = get_canvas_service()
            requests_created = []

            for assignment_id in data['assignmentIds']:
                try:
                    # Get assignment from Canvas
                    assignment = canvas.get_assignment(course_id, assignment_id)

                    # Parse requested due date
                    # The frontend sends datetime-local format: "YYYY-MM-DDTHH:MM"
                    requested_due_date_str = data['requestedDueDates'].get(assignment_id)
                    if not requested_due_date_str:
                        logger.warning(f"No requested due date for assignment {assignment_id}")
                        continue

                    # Parse and add seconds if not present
                    if 'T' in requested_due_date_str and len(requested_due_date_str.split('T')[1]) == 5:
                        # Add seconds to match ISO format (HH:MM -> HH:MM:00)
                        requested_due_date_str += ':00'

                    requested_due_date = datetime.fromisoformat(
                        requested_due_date_str.replace('Z', '+00:00')
                    )

                    # Validate extension length
                    # Handle both string and datetime objects from Canvas/Mock
                    if isinstance(assignment.due_at, str):
                        original_due_date = datetime.fromisoformat(
                            assignment.due_at.replace('Z', '+00:00')
                        )
                    else:
                        original_due_date = assignment.due_at

                    # For naive datetimes (no timezone), we treat them as "wall clock" time
                    # This follows Canvas convention where "11:59 PM" means "11:59 PM" regardless of timezone
                    # Only add timezone if BOTH are naive (to allow comparison)
                    if original_due_date.tzinfo is None and requested_due_date.tzinfo is None:
                        original_due_date = original_due_date.replace(tzinfo=timezone.utc)
                        requested_due_date = requested_due_date.replace(tzinfo=timezone.utc)
                    elif original_due_date.tzinfo is None:
                        original_due_date = original_due_date.replace(tzinfo=timezone.utc)
                    elif requested_due_date.tzinfo is None:
                        requested_due_date = requested_due_date.replace(tzinfo=timezone.utc)

                    extension_days = (requested_due_date - original_due_date).days

                    # Only validate max days if the policy has it enabled
                    if policy.enable_max_days_extension and extension_days > policy.max_days_extension:
                        return jsonify({
                            'error': f'Extension request exceeds maximum allowed days ({policy.max_days_extension})'
                        }), 400

                    if extension_days < 0:
                        return jsonify({
                            'error': f'Requested due date must be after original due date. Assignment "{assignment.name}" is due on {original_due_date.strftime("%Y-%m-%d %I:%M %p UTC")}'
                        }), 400

                    # Create extension request
                    ext_request = ExtensionRequest(
                        student_id=user.id,
                        course_id=course.id,
                        assignment_id=str(assignment_id),
                        assignment_title=assignment.name,
                        original_due_date=original_due_date,
                        requested_due_date=requested_due_date,
                        reason=data['reason']
                    )

                    # Add to session and flush to get the ID
                    db.session.add(ext_request)
                    db.session.flush()  

                    # Handle documentation for first request only (shared across assignments)
                    if len(requests_created) == 0 and files:
                        for file in files:
                            try:
                                # Validate and save file securely
                                url = validate_and_save_file(file, course_id, ext_request.id)
                                documentation_urls.append(url)
                            except FileValidationError as e:
                                logger.error(f"File validation error: {e}")
                                db.session.rollback()
                                return jsonify({'error': str(e)}), 400
                        ext_request.documentation_urls = documentation_urls
                    elif len(requests_created) > 0:
                        # Share documentation URLs from first request
                        ext_request.documentation_urls = documentation_urls

                    requests_created.append(ext_request)

                except Exception as e:
                    logger.error(f"Error processing assignment {assignment_id}: {e}", exc_info=True)
                    continue

            # Check if any requests were successfully created
            if not requests_created:
                logger.error("No extension requests were successfully created")
                return jsonify({'error': 'Failed to create extension requests.'}), 400

            db.session.commit()

            # Send notification to instructors if enabled
            if policy.notify_on_request and requests_created:
                try:
                    instructor_ids = canvas.get_course_instructors(course_id)
                    if instructor_ids:
                        assignment_titles = ", ".join([r.assignment_title for r in requests_created])
                        canvas.notify_extension_request(
                            student_name=user.sortable_name or user.email,
                            assignment_title=assignment_titles,
                            requested_date=requested_due_date.strftime('%Y-%m-%d %I:%M %p'),
                            reason=data['reason'],
                            instructor_ids=instructor_ids,
                            course_id=course_id
                        )
                except Exception as e:
                    logger.error(f"Error sending notification: {e}")
                    # Don't fail the request if notification fails

            logger.info(f"Created {len(requests_created)} extension requests for user {user.id}")

            return jsonify({
                'message': f'Extension request{"s" if len(requests_created) > 1 else ""} created successfully',
                'requests': [{
                    'id': r.id,
                    'assignmentTitle': r.assignment_title,
                    'status': r.status
                } for r in requests_created]
            })

        except Exception as e:
            db.session.rollback()
            logger.error(f"Error creating extension request: {e}", exc_info=True)
            return jsonify({'error': 'Failed to create extension request'}), 500

    @app.route('/api/courses/<int:course_id>/extension-requests/student', methods=['GET'])
    @check_valid_user
    def list_student_requests(course_id):
        """Get all extension requests for current student"""
        try:
            canvas_user_id = session.get('canvas_user_id')
            user = User.query.filter_by(canvas_id=str(canvas_user_id)).first()
            course = Course.query.filter_by(canvas_id=str(course_id)).first()

            if not user or not course:
                return jsonify({'error': 'Invalid user or course'}), 400

            requests = ExtensionRequest.query.filter_by(
                student_id=user.id,
                course_id=course.id
            ).order_by(ExtensionRequest.created_at.desc()).all()

            logger.info(f"Retrieved {len(requests)} extension requests for student {user.id}")

            return jsonify([{
                'id': r.id,
                'assignmentId': r.assignment_id,
                'assignmentTitle': r.assignment_title,
                'originalDueDate': r.original_due_date.isoformat(),
                'requestedDueDate': r.requested_due_date.isoformat(),
                'finalDueDate': r.final_due_date.isoformat() if r.final_due_date else None,
                'status': r.status,
                'reason': r.reason,
                'instructorNotes': r.instructor_notes if r.status in ['approved', 'denied'] else None,
                'documentation': r.documentation_urls,
                'createdAt': r.created_at.isoformat(),
                'updatedAt': r.updated_at.isoformat()
            } for r in requests])

        except Exception as e:
            logger.error(f"Error listing student requests: {e}")
            return jsonify({'error': 'Failed to fetch requests'}), 500

    @app.route('/api/courses/<int:course_id>/extension-requests/instructor', methods=['GET'])
    @check_valid_user
    @is_instructor
    def list_instructor_requests(course_id):
        """Get all extension requests for course (instructor view)"""
        try:
            course = Course.query.filter_by(canvas_id=str(course_id)).first()
            if not course:
                return jsonify({'error': 'Invalid course'}), 400

            # Optional status filter
            status_filter = request.args.get('status')

            query = ExtensionRequest.query.filter_by(course_id=course.id)
            if status_filter:
                query = query.filter_by(status=status_filter)

            requests = query.order_by(ExtensionRequest.created_at.desc()).all()

            logger.info(f"Retrieved {len(requests)} extension requests for course {course_id}")

            return jsonify([{
                'id': r.id,
                'studentId': r.student_id,
                'studentName': r.student.sortable_name,
                'studentEmail': r.student.email,
                'assignmentId': r.assignment_id,
                'assignmentTitle': r.assignment_title,
                'originalDueDate': r.original_due_date.isoformat(),
                'requestedDueDate': r.requested_due_date.isoformat(),
                'finalDueDate': r.final_due_date.isoformat() if r.final_due_date else None,
                'status': r.status,
                'reason': r.reason,
                'instructorNotes': r.instructor_notes,
                'documentation': r.documentation_urls or [],
                'canvasOverrideId': r.canvas_override_id,
                'createdAt': r.created_at.isoformat(),
                'updatedAt': r.updated_at.isoformat(),
                'approvedBy': r.approved_by.sortable_name if r.approved_by else None,
                'approvedAt': r.approved_at.isoformat() if r.approved_at else None
            } for r in requests])

        except Exception as e:
            logger.error(f"Error listing instructor requests: {e}")
            return jsonify({'error': 'Failed to fetch requests'}), 500

    @app.route('/api/courses/<int:course_id>/extension-requests/<int:request_id>', methods=['PATCH'])
    @check_valid_user
    @is_instructor
    def update_extension_request(course_id, request_id):
        """Update extension request (approve/deny)"""
        try:
            data = request.get_json()
            course = Course.query.filter_by(canvas_id=str(course_id)).first()
            if not course:
                return jsonify({'error': 'Invalid course'}), 400

            ext_request = ExtensionRequest.query.get(request_id)
            if not ext_request or ext_request.course_id != course.id:
                return jsonify({'error': 'Invalid request'}), 404

            # Get instructor user
            canvas_user_id = session.get('canvas_user_id')
            instructor = User.query.filter_by(canvas_id=str(canvas_user_id)).first()

            # Update status
            new_status = data.get('status')
            if new_status and new_status in ['approved', 'denied']:
                ext_request.status = new_status
                ext_request.approved_by_id = instructor.id if instructor else None
                ext_request.approved_at = datetime.now(timezone.utc)

            # Update notes with validation
            if 'notes' in data:
                notes = str(data.get('notes', '')).strip()
                if len(notes) > 5000:
                    return jsonify({'error': 'Instructor notes must be less than 5,000 characters'}), 400
                ext_request.instructor_notes = notes if notes else None

            # Handle approval
            if ext_request.status == 'approved':
                # Determine final due date (instructor override or student request)
                final_due_date = ext_request.requested_due_date
                if data.get('newDueDate'):
                    final_due_date = datetime.fromisoformat(
                        data['newDueDate'].replace('Z', '+00:00')
                    )

                ext_request.final_due_date = final_due_date

                # Validate the final due date against current policy
                # This handles the edge case where policy was changed after the request was submitted
                policy = ExtensionPolicy.query.filter_by(course_id=course.id).first()
                if policy:
                    # Edge case 1: Check extension length against current policy
                    # Ensure both dates have timezones for comparison
                    original_due = ext_request.original_due_date
                    final_due = final_due_date

                    if original_due.tzinfo is None:
                        original_due = original_due.replace(tzinfo=timezone.utc)
                    if final_due.tzinfo is None:
                        final_due = final_due.replace(tzinfo=timezone.utc)

                    extension_days = (final_due - original_due).days

                    # Only log warning if the policy has max days enabled
                    if policy.enable_max_days_extension and extension_days > policy.max_days_extension:
                        logger.warning(
                            f"Instructor approving request {request_id} with {extension_days} days, "
                            f"which exceeds current policy limit of {policy.max_days_extension} days"
                        )
                        # Allow it but log a warning - instructor has discretion

                    # Edge case 2: Check documentation requirement
                    # Policy might now require documentation, but old request doesn't have it
                    if policy.require_documentation:
                        has_docs = ext_request.documentation_urls and len(ext_request.documentation_urls) > 0
                        if not has_docs:
                            logger.warning(
                                f"Approving request {request_id} without documentation, "
                                f"but current policy requires documentation. "
                                f"Request was submitted before policy change."
                            )
                            # Allow approval - request was made under old policy
                            # Instructor is explicitly choosing to approve despite missing docs

                # Create or update Canvas assignment override
                try:
                    canvas = get_canvas_service()

                    # Check if an override already exists for this request
                    if ext_request.canvas_override_id:
                        # Update existing override
                        logger.info(f"Updating existing Canvas override {ext_request.canvas_override_id} for request {request_id}")
                        success = canvas.update_assignment_override(
                            course_id=course_id,
                            assignment_id=int(ext_request.assignment_id),
                            override_id=int(ext_request.canvas_override_id),
                            new_due_date=final_due_date
                        )
                        if not success:
                            raise Exception("Failed to update existing override")
                        logger.info(f"Updated Canvas override {ext_request.canvas_override_id} for request {request_id}")
                    else:
                        # Check if Canvas already has an override for this student/assignment
                        # This handles cases where override exists but wasn't saved to our DB
                        existing_override_id = canvas.find_student_override(
                            course_id=course_id,
                            assignment_id=int(ext_request.assignment_id),
                            student_id=int(ext_request.student.canvas_id)
                        )

                        if existing_override_id:
                            # Found existing override - update it instead of creating new one
                            logger.info(f"Found existing Canvas override {existing_override_id}, updating instead of creating")
                            success = canvas.update_assignment_override(
                                course_id=course_id,
                                assignment_id=int(ext_request.assignment_id),
                                override_id=int(existing_override_id),
                                new_due_date=final_due_date
                            )
                            if not success:
                                raise Exception("Failed to update existing override")
                            # Save the override ID to our database for future reference
                            ext_request.canvas_override_id = existing_override_id
                            logger.info(f"Updated and saved Canvas override {existing_override_id} for request {request_id}")
                        else:
                            # Create new override
                            override_id = canvas.create_assignment_override(
                                course_id=course_id,
                                assignment_id=int(ext_request.assignment_id),
                                student_id=int(ext_request.student.canvas_id),
                                new_due_date=final_due_date
                            )
                            ext_request.canvas_override_id = override_id
                            logger.info(f"Created Canvas override {override_id} for request {request_id}")
                except Exception as e:
                    logger.error(f"Failed to create/update Canvas override: {e}")
                    db.session.rollback()
                    return jsonify({'error': f'Failed to create/update assignment override in Canvas: {str(e)}'}), 500

            db.session.commit()

            # Send notification to student
            if ext_request.status in ['approved', 'denied']:
                try:
                    canvas = get_canvas_service()
                    canvas.notify_extension_decision(
                        student_id=int(ext_request.student.canvas_id),
                        assignment_title=ext_request.assignment_title,
                        status=ext_request.status,
                        final_due_date=ext_request.final_due_date.strftime('%Y-%m-%d %I:%M %p') if ext_request.final_due_date else '',
                        instructor_notes=ext_request.instructor_notes,
                        course_id=course_id
                    )
                    ext_request.notification_sent = True
                    db.session.commit()
                except Exception as e:
                    logger.error(f"Failed to send notification: {e}")
                    # Don't fail the request if notification fails

            logger.info(f"Updated extension request {request_id} to status {ext_request.status}")

            # Return full request object to avoid missing fields in frontend
            return jsonify({
                'id': ext_request.id,
                'studentId': ext_request.student_id,
                'studentName': ext_request.student.sortable_name,
                'studentEmail': ext_request.student.email,
                'assignmentId': ext_request.assignment_id,
                'assignmentTitle': ext_request.assignment_title,
                'originalDueDate': ext_request.original_due_date.isoformat(),
                'requestedDueDate': ext_request.requested_due_date.isoformat(),
                'finalDueDate': ext_request.final_due_date.isoformat() if ext_request.final_due_date else None,
                'status': ext_request.status,
                'reason': ext_request.reason,
                'instructorNotes': ext_request.instructor_notes,
                'documentation': ext_request.documentation_urls or [],
                'canvasOverrideId': ext_request.canvas_override_id,
                'createdAt': ext_request.created_at.isoformat(),
                'updatedAt': ext_request.updated_at.isoformat(),
                'approvedBy': ext_request.approved_by.sortable_name if ext_request.approved_by else None,
                'approvedAt': ext_request.approved_at.isoformat() if ext_request.approved_at else None
            })

        except Exception as e:
            db.session.rollback()
            logger.error(f"Error updating extension request: {e}", exc_info=True)
            return jsonify({'error': 'Failed to update request'}), 500

    @app.route('/api/courses/<int:course_id>/extension-policy', methods=['GET'])
    @check_valid_user
    def get_extension_policy(course_id):
        """Get extension policy for course"""
        try:
            course = Course.query.filter_by(canvas_id=str(course_id)).first()
            if not course:
                return jsonify({'error': 'Invalid course'}), 400

            policy = ExtensionPolicy.query.filter_by(course_id=course.id).first()
            if not policy:
                # Create default policy
                policy = ExtensionPolicy(course_id=course.id)
                db.session.add(policy)
                db.session.commit()

            return jsonify({
                'enableMaxDaysExtension': policy.enable_max_days_extension,
                'maxDaysExtension': policy.max_days_extension,
                'requireDocumentation': policy.require_documentation,
                'notifyOnRequest': policy.notify_on_request
            })

        except Exception as e:
            logger.error(f"Error fetching policy: {e}")
            return jsonify({'error': 'Failed to fetch policy'}), 500

    @app.route('/api/courses/<int:course_id>/extension-policy', methods=['PUT'])
    @check_valid_user
    @is_instructor
    def update_extension_policy(course_id):
        """Update extension policy for course"""
        try:
            data = request.get_json()
            course = Course.query.filter_by(canvas_id=str(course_id)).first()
            if not course:
                return jsonify({'error': 'Invalid course'}), 400

            policy = ExtensionPolicy.query.filter_by(course_id=course.id).first()
            if not policy:
                policy = ExtensionPolicy(course_id=course.id)
                db.session.add(policy)

            # Update policy fields with validation
            if 'enableMaxDaysExtension' in data:
                policy.enable_max_days_extension = bool(data['enableMaxDaysExtension'])
            if 'maxDaysExtension' in data:
                max_days = int(data['maxDaysExtension'])
                if max_days < 1 or max_days > 365:
                    return jsonify({'error': 'Max days extension must be between 1 and 365 days'}), 400
                policy.max_days_extension = max_days
            if 'requireDocumentation' in data:
                policy.require_documentation = bool(data['requireDocumentation'])
            if 'notifyOnRequest' in data:
                policy.notify_on_request = bool(data['notifyOnRequest'])

            db.session.commit()

            logger.info(f"Updated policy for course {course_id}")

            return jsonify({
                'enableMaxDaysExtension': policy.enable_max_days_extension,
                'maxDaysExtension': policy.max_days_extension,
                'requireDocumentation': policy.require_documentation,
                'notifyOnRequest': policy.notify_on_request
            })

        except Exception as e:
            db.session.rollback()
            logger.error(f"Error updating policy: {e}")
            return jsonify({'error': 'Failed to update policy'}), 500

    @app.route('/uploads/<int:course_id>/<int:request_id>/<path:filename>')
    @check_valid_user
    def download_file(course_id, request_id, filename):
        """Download uploaded documentation file"""
        try:
            # Validate access permissions
            course = Course.query.filter_by(canvas_id=str(course_id)).first()
            if not course:
                abort(404)

            ext_request = ExtensionRequest.query.get(request_id)
            if not ext_request or ext_request.course_id != course.id:
                abort(404)

            # Check if user is instructor or the student who uploaded the file
            canvas_user_id = session.get('canvas_user_id')
            user = User.query.filter_by(canvas_id=str(canvas_user_id)).first()

            if not user:
                abort(401)

            # Allow access if user is the student or has instructor role
            is_student_owner = ext_request.student_id == user.id
            roles = session.get('lti_roles', [])
            is_instructor_role = any(role in settings.INSTRUCTOR_ROLES for role in roles)

            if not (is_student_owner or is_instructor_role):
                logger.warning(f"Unauthorized file access attempt by user {user.id}")
                abort(403)

            return send_from_directory(
                os.path.join(
                    current_app.config['UPLOAD_FOLDER'],
                    str(course_id),
                    str(request_id)
                ),
                filename
            )

        except Exception as e:
            logger.error(f"Error downloading file: {e}")
            return jsonify({'error': 'Failed to download file'}), 500
