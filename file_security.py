"""
Handles file validation, sanitization, and secure storage
"""
import os
import mimetypes
from werkzeug.utils import secure_filename
from flask import current_app
import settings 

try:
    import magic
    MAGIC_AVAILABLE = True
except ImportError:
    MAGIC_AVAILABLE = False


ALLOWED_MIME_TYPES = {
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'text/plain'
}

class FileValidationError(Exception):
    """Custom exception for file validation errors"""
    pass


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in settings.ALLOWED_EXTENSIONS


def validate_file_size(file_storage):
    """
    Validate file size

    Args:
        file_storage: FileStorage object from request

    Raises:
        FileValidationError: If file is too large
    """
    # Seek to end to get file size
    file_storage.seek(0, os.SEEK_END)
    file_size = file_storage.tell()
    file_storage.seek(0)  # Reset to beginning

    if file_size > settings.MAX_FILE_SIZE:
        raise FileValidationError(
            f"File size ({file_size} bytes) exceeds maximum allowed size ({settings.MAX_FILE_SIZE} bytes)"
        )


def validate_mime_type(file_storage):
    """
    Validate file MIME type using python-magic (if available)

    Args:
        file_storage: FileStorage object from request

    Raises:
        FileValidationError: If MIME type is not allowed
    """
    # Skip MIME validation if python-magic is not available
    if not MAGIC_AVAILABLE:
        current_app.logger.warning("python-magic not available, skipping MIME type validation")
        return None

    try:
        # Read first 2048 bytes for MIME detection
        file_storage.seek(0)
        file_header = file_storage.read(2048)
        file_storage.seek(0)  # Reset to beginning

        # Detect MIME type
        mime = magic.Magic(mime=True)
        detected_mime = mime.from_buffer(file_header)

        if detected_mime not in ALLOWED_MIME_TYPES:
            raise FileValidationError(
                f"File type '{detected_mime}' is not allowed. "
                f"Allowed types: {', '.join(ALLOWED_MIME_TYPES)}"
            )

        return detected_mime

    except Exception as e:
        # If magic fails, fall back to extension-based check
        current_app.logger.warning(f"MIME detection failed, using extension check: {e}")
        return None


def sanitize_filename(filename):
    """
    Sanitize filename to prevent path traversal and other attacks

    Args:
        filename: Original filename

    Returns:
        Sanitized filename
    """

    safe_name = secure_filename(filename)

    safe_name = safe_name.replace('..', '')

    if not safe_name or safe_name == '':
        raise FileValidationError("Invalid filename")

    return safe_name


def validate_upload_path(upload_path):
    """
    Validate that upload path is within allowed directory

    Args:
        upload_path: Full path where file will be saved

    Raises:
        FileValidationError: If path is outside allowed directory
    """
    upload_folder = current_app.config['UPLOAD_FOLDER']
    abs_upload_folder = os.path.abspath(upload_folder)
    abs_upload_path = os.path.abspath(upload_path)

    # Check for path traversal
    if not abs_upload_path.startswith(abs_upload_folder):
        raise FileValidationError("Invalid upload path")


def validate_and_save_file(file_storage, course_id, request_id):
    """
    Validate and save uploaded file securely

    Args:
        file_storage: FileStorage object from request
        course_id: Course ID for organizing uploads
        request_id: Request ID for organizing uploads

    Returns:
        Relative URL path to saved file

    Raises:
        FileValidationError: If validation fails
    """
    if not file_storage or file_storage.filename == '':
        raise FileValidationError("No file provided")

    # Sanitize filename
    original_filename = file_storage.filename
    safe_filename = sanitize_filename(original_filename)

    # Check extension
    if not allowed_file(safe_filename):
        raise FileValidationError(
            f"File extension not allowed. Allowed extensions: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )

    # Validate file size
    validate_file_size(file_storage)

    # Validate MIME type (optional but recommended)
    try:
        validate_mime_type(file_storage)
    except Exception as e:
        current_app.logger.warning(f"MIME type validation skipped: {e}")

    # Create upload directory
    upload_folder = os.path.join(
        current_app.config['UPLOAD_FOLDER'],
        str(course_id),
        str(request_id)
    )
    os.makedirs(upload_folder, exist_ok=True)

    # Build full file path
    file_path = os.path.join(upload_folder, safe_filename)

    # Validate path (prevent path traversal)
    validate_upload_path(file_path)

    # Check if file already exists, add number if it does
    counter = 1
    base_name, extension = os.path.splitext(safe_filename)
    while os.path.exists(file_path):
        safe_filename = f"{base_name}_{counter}{extension}"
        file_path = os.path.join(upload_folder, safe_filename)
        counter += 1

    # Save file
    file_storage.save(file_path)

    current_app.logger.info(f"File saved securely: {file_path}")

    # Return relative URL
    return f'/uploads/{course_id}/{request_id}/{safe_filename}'
