from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta, timezone

db = SQLAlchemy()

def utc_now():
    """Helper function to get current UTC time with timezone awareness"""
    return datetime.now(timezone.utc)

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    canvas_id = db.Column(db.String(255), unique=True, nullable=False, index=True)
    sortable_name = db.Column(db.String(255))
    email = db.Column(db.String(255))
    sis_id = db.Column(db.String(255))
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now)
    updated_at = db.Column(db.DateTime(timezone=True), default=utc_now, onupdate=utc_now)

class Course(db.Model):
    __tablename__ = 'courses'

    id = db.Column(db.Integer, primary_key=True)
    canvas_id = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(255))
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now)
    updated_at = db.Column(db.DateTime(timezone=True), default=utc_now, onupdate=utc_now)

class Nonce(db.Model):
    """Store used nonces to prevent replay attacks"""
    __tablename__ = 'nonces'

    id = db.Column(db.Integer, primary_key=True)
    nonce = db.Column(db.String(255), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now, index=True)

    @classmethod
    def is_valid(cls, nonce_value):
        """Check if nonce is valid (not used and not expired)"""
        # Nonces expire after 10 minutes
        expiry_time = utc_now() - timedelta(minutes=10)

        # Clean up expired nonces
        cls.query.filter(cls.created_at < expiry_time).delete()
        db.session.commit()

        # Check if nonce has been used
        existing = cls.query.filter_by(nonce=nonce_value).first()
        return existing is None

    @classmethod
    def mark_used(cls, nonce_value):
        """Mark a nonce as used"""
        nonce_record = cls(nonce=nonce_value)
        db.session.add(nonce_record)
        db.session.commit()

class ExtensionPolicy(db.Model):
    __tablename__ = 'extension_policies'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    enable_max_days_extension = db.Column(db.Boolean, default=False)
    max_days_extension = db.Column(db.Integer, default=7)
    require_documentation = db.Column(db.Boolean, default=False)
    notify_on_request = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now)
    updated_at = db.Column(db.DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    course = db.relationship('Course', backref=db.backref('extension_policy', uselist=False))

class ApprovedClient(db.Model):
    """Approved LTI client IDs — one row per registered Canvas organization"""
    __tablename__ = 'approved_clients'

    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(255), unique=True, nullable=False, index=True)
    issuer = db.Column(db.String(255), nullable=False)
    org_name = db.Column(db.String(255))
    approved_by = db.Column(db.String(255))
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    approved_at = db.Column(db.DateTime(timezone=True), default=utc_now)

    @classmethod
    def is_approved(cls, client_id):
        """Check if a client ID is approved and active"""
        record = cls.query.filter_by(client_id=client_id, is_active=True).first()
        return record is not None

class ExtensionRequest(db.Model):
    __tablename__ = 'extension_requests'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    assignment_id = db.Column(db.String(255), nullable=False)
    assignment_title = db.Column(db.String(255))
    original_due_date = db.Column(db.DateTime(timezone=True), nullable=False)
    requested_due_date = db.Column(db.DateTime(timezone=True), nullable=False)
    final_due_date = db.Column(db.DateTime(timezone=True))  # Instructor-approved due date (may differ from requested)
    reason = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending, approved, denied
    instructor_notes = db.Column(db.Text)
    documentation_urls = db.Column(db.JSON)
    # Audit trail
    approved_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    approved_at = db.Column(db.DateTime(timezone=True))
    canvas_override_id = db.Column(db.String(255))  # Canvas assignment override ID
    notification_sent = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now)
    updated_at = db.Column(db.DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    student = db.relationship('User', foreign_keys=[student_id], backref='extension_requests_as_student')
    approved_by = db.relationship('User', foreign_keys=[approved_by_id], backref='extension_requests_approved')
    course = db.relationship('Course', backref='extension_requests')
