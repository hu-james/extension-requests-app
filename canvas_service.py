"""
Canvas API Service
Handles all Canvas API interactions including assignments, overrides, and notifications
"""
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import requests
from canvasapi import Canvas
from canvasapi.exceptions import CanvasException
from flask import current_app


class CanvasService:
    """Service for interacting with Canvas API"""

    def __init__(self, api_url: str = None, api_token: str = None, access_token: str = None):
        """
        Initialize Canvas service with API credentials

        Args:
            api_url: Canvas base URL (e.g., 'https://ufl.instructure.com')
            api_token: Permanent Canvas API token (fallback)
            access_token: LTI 1.3 OAuth access token (preferred)
        """
        self.api_url = api_url or current_app.config.get('CANVAS_API_URL', '')
        self.api_token = api_token or current_app.config.get('CANVAS_API_TOKEN', '')
        self.access_token = access_token
        self.logger = logging.getLogger(__name__)

        token = self.access_token or self.api_token

        if not self.api_url or not token:
            raise ValueError("Canvas API URL and token are required")

        # Initialize Canvas API client
        self.canvas = Canvas(self.api_url, token)

    def get_course(self, course_id: int):
        """Get course by ID"""
        try:
            return self.canvas.get_course(course_id)
        except CanvasException as e:
            self.logger.error(f"Error fetching course {course_id}: {e}")
            raise

    def get_assignments(self, course_id: int) -> List[Dict[str, Any]]:
        """
        Get all assignments for a course

        Args:
            course_id: Canvas course ID

        Returns:
            List of assignment dictionaries with id, title, dueDate, etc.
        """
        try:
            course = self.canvas.get_course(course_id)
            assignments = course.get_assignments()

            course_timezone = getattr(course, 'time_zone', 'UTC')

            assignment_list = []
            for assignment in assignments:
                # Only include assignments with due dates
                if hasattr(assignment, 'due_at') and assignment.due_at:
                    assignment_list.append({
                        'id': str(assignment.id),
                        'title': assignment.name,
                        'dueDate': assignment.due_at,
                        'courseId': str(course_id),
                        'courseName': course.name,
                        'courseTimezone': course_timezone,
                        'points_possible': getattr(assignment, 'points_possible', 0),
                        'html_url': getattr(assignment, 'html_url', '')
                    })

            self.logger.info(f"Retrieved {len(assignment_list)} assignments for course {course_id} (timezone: {course_timezone})")
            return assignment_list

        except CanvasException as e:
            self.logger.error(f"Error fetching assignments for course {course_id}: {e}")
            raise

    def get_assignment(self, course_id: int, assignment_id: int):
        """Get a specific assignment"""
        try:
            course = self.canvas.get_course(course_id)
            return course.get_assignment(assignment_id)
        except CanvasException as e:
            self.logger.error(f"Error fetching assignment {assignment_id}: {e}")
            raise

    def create_assignment_override(
        self,
        course_id: int,
        assignment_id: int,
        student_id: int,
        new_due_date: datetime
    ) -> Optional[str]:
        """
        Create an assignment override for a specific student

        Args:
            course_id: Canvas course ID
            assignment_id: Canvas assignment ID
            student_id: Canvas user ID
            new_due_date: New due date for the assignment

        Returns:
            Override ID if successful, None otherwise
        """
        try:
            course = self.canvas.get_course(course_id)
            assignment = course.get_assignment(assignment_id)

            # Format the due date as ISO 8601 string
            if new_due_date.tzinfo is None:
                new_due_date = new_due_date.replace(tzinfo=timezone.utc)

            due_date_str = new_due_date.isoformat()

            # Create the override
            override = assignment.create_override(
                assignment_override={
                    'student_ids': [student_id],
                    'due_at': due_date_str,
                    'title': f'Extension for Student {student_id}'
                }
            )

            self.logger.info(
                f"Created assignment override {override.id} for student {student_id} "
                f"on assignment {assignment_id} in course {course_id}"
            )

            return str(override.id)

        except CanvasException as e:
            self.logger.error(
                f"Error creating assignment override for student {student_id} "
                f"on assignment {assignment_id}: {e}"
            )
            raise
        except Exception as e:
            self.logger.error(f"Unexpected error creating assignment override: {e}")
            raise

    def find_student_override(
        self,
        course_id: int,
        assignment_id: int,
        student_id: int
    ) -> Optional[str]:
        """
        Find existing override for a student on an assignment

        Args:
            course_id: Canvas course ID
            assignment_id: Canvas assignment ID
            student_id: Canvas user ID

        Returns:
            Override ID if found, None otherwise
        """
        try:
            course = self.canvas.get_course(course_id)
            assignment = course.get_assignment(assignment_id)

            # Get all overrides for this assignment
            overrides = assignment.get_overrides()

            # Look for override containing this student
            for override in overrides:
                student_ids = getattr(override, 'student_ids', [])
                if student_id in student_ids:
                    self.logger.info(
                        f"Found existing override {override.id} for student {student_id} "
                        f"on assignment {assignment_id}"
                    )
                    return str(override.id)

            return None

        except CanvasException as e:
            self.logger.error(
                f"Error finding override for student {student_id} on assignment {assignment_id}: {e}"
            )
            return None

    def update_assignment_override(
        self,
        course_id: int,
        assignment_id: int,
        override_id: int,
        new_due_date: datetime
    ) -> bool:
        """
        Update an existing assignment override

        Args:
            course_id: Canvas course ID
            assignment_id: Canvas assignment ID
            override_id: Canvas override ID
            new_due_date: New due date for the assignment
        """
        try:
            course = self.canvas.get_course(course_id)
            assignment = course.get_assignment(assignment_id)

            if new_due_date.tzinfo is None:
                new_due_date = new_due_date.replace(tzinfo=timezone.utc)

            due_date_str = new_due_date.isoformat()

            # Update the override
            override = assignment.get_override(override_id)
            override.edit(assignment_override={'due_at': due_date_str})

            self.logger.info(
                f"Updated assignment override {override_id} on assignment {assignment_id}"
            )

            return True

        except CanvasException as e:
            self.logger.error(
                f"Error updating assignment override {override_id}: {e}"
            )
            return False

    def delete_assignment_override(
        self,
        course_id: int,
        assignment_id: int,
        override_id: int
    ) -> bool:
        """Delete an assignment override"""
        try:
            course = self.canvas.get_course(course_id)
            assignment = course.get_assignment(assignment_id)
            override = assignment.get_override(override_id)
            override.delete()

            self.logger.info(f"Deleted assignment override {override_id}")
            return True

        except CanvasException as e:
            self.logger.error(f"Error deleting assignment override {override_id}: {e}")
            return False

    def send_conversation_message(
        self,
        recipient_ids: List[int],
        subject: str,
        body: str,
        course_id: Optional[int] = None
    ) -> bool:
        """
        Send a Canvas conversation (message) to users

        Args:
            recipient_ids: List of Canvas user IDs
            subject: Message subject
            body: Message body (HTML supported)
            course_id: Optional course context

        Returns:
            True if successful, False o
        """
        try:
            conversation = self.canvas.create_conversation(
                recipients=recipient_ids,
                body=body,
                subject=subject,
                context_code=f'course_{course_id}' if course_id else None,
                force_new=True
            )

            self.logger.info(
                f"Sent Canvas conversation to {len(recipient_ids)} recipients: {subject}"
            )

            return True

        except CanvasException as e:
            self.logger.error(f"Error sending Canvas conversation: {e}")
            return False
        except Exception as e:
            self.logger.error(f"Unexpected error sending Canvas conversation: {e}")
            return False

    def get_user(self, user_id: int):
        """Get user by ID"""
        try:
            return self.canvas.get_user(user_id)
        except CanvasException as e:
            self.logger.error(f"Error fetching user {user_id}: {e}")
            raise

    def get_course_user(self, course_id: int, user_id: int):
        """Get user in course context"""
        try:
            course = self.canvas.get_course(course_id)
            return course.get_user(user_id)
        except CanvasException as e:
            self.logger.error(f"Error fetching user {user_id} in course {course_id}: {e}")
            raise

    def notify_extension_request(
        self,
        student_name: str,
        assignment_title: str,
        requested_date: str,
        reason: str,
        instructor_ids: List[int],
        course_id: int
    ) -> bool:
        """
        Notify instructors about a new extension request

        Args:
            student_name: Name of student requesting extension
            assignment_title: Title of assignment
            requested_date: Requested due date (formatted string)
            reason: Student's reason for request
            instructor_ids: List of instructor Canvas IDs
            course_id: Canvas course ID

        Returns:
            True if notification sent successfully
        """
        subject = f"Extension Request: {assignment_title}"
        body = f"""
        <p><strong>New Extension Request</strong></p>
        <ul>
            <li><strong>Student:</strong> {student_name}</li>
            <li><strong>Assignment:</strong> {assignment_title}</li>
            <li><strong>Requested Due Date:</strong> {requested_date}</li>
            <li><strong>Reason:</strong> {reason}</li>
        </ul>
        <p>Please review this request in the Assignment Extension Manager tool.</p>
        """

        return self.send_conversation_message(
            recipient_ids=instructor_ids,
            subject=subject,
            body=body,
            course_id=course_id
        )

    def notify_extension_decision(
        self,
        student_id: int,
        assignment_title: str,
        status: str,
        final_due_date: str,
        instructor_notes: Optional[str],
        course_id: int
    ) -> bool:
        """
        Notify student about extension request decision

        Args:
            student_id: Canvas user ID of student
            assignment_title: Title of assignment
            status: 'approved' or 'denied'
            final_due_date: Final due date (if approved)
            instructor_notes: Optional notes from instructor
            course_id: Canvas course ID

        Returns:
            True if notification sent successfully
        """
        status_text = "Approved" if status == "approved" else "Denied"
        subject = f"Extension Request {status_text}: {assignment_title}"

        body = f"""
        <p>Your extension request for <strong>{assignment_title}</strong> has been <strong>{status_text.lower()}</strong>.</p>
        """

        if status == "approved":
            body += f"<p><strong>New Due Date:</strong> {final_due_date}</p>"

        if instructor_notes:
            body += f"<p><strong>Instructor Notes:</strong> {instructor_notes}</p>"

        return self.send_conversation_message(
            recipient_ids=[student_id],
            subject=subject,
            body=body,
            course_id=course_id
        )

    def get_course_instructors(self, course_id: int) -> List[int]:
        """
        Get list of instructor IDs for a course

        Args:
            course_id: Canvas course ID

        Returns:
            List of Canvas user IDs for instructors
        """
        try:
            course = self.canvas.get_course(course_id)
            enrollments = course.get_enrollments(type=['TeacherEnrollment', 'TaEnrollment'])

            instructor_ids = []
            for enrollment in enrollments:
                if hasattr(enrollment, 'user_id'):
                    instructor_ids.append(enrollment.user_id)

            return instructor_ids

        except CanvasException as e:
            self.logger.error(f"Error fetching instructors for course {course_id}: {e}")
            return []
