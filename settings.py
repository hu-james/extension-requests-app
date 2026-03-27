import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Using a placeholder for environment variables.
# If not found in the environment, it will default to the local value, which is set in
# the second parameter. Example:
# os.environ.get("ENVIRONMENT_KEY", "LOCAL_VALUE")
# This makes it a bit easier to use one file for local and environment deployment.

# Secret key used for Flask sessions, etc.
# Can be any randomized string, recommend generating one with os.urandom(24)
secret_key = os.environ.get("SECRET_FLASK")

# Application Logging
LOG_FILE = 'error.log'
LOG_FORMAT = '%(asctime)s [%(levelname)s] {%(filename)s:%(lineno)d} %(message)s'
LOG_LEVEL = 'DEBUG'
LOG_MAX_BYTES = 1024 * 1024 * 5  # 5 MB
LOG_BACKUP_COUNT = 1

# Canvas API Configuration
CANVAS_API_URL = os.environ.get('CANVAS_API_URL', '')
CANVAS_API_TOKEN = os.environ.get('CANVAS_API_TOKEN', '')

# PostgreSQL Configuration
DB_USER = os.environ.get('DB_USER', 'postgres')
DB_PASSWORD = os.environ.get('DB_PASSWORD', '')
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'auto_extend')

# SQLAlchemy Configuration
SQLALCHEMY_DATABASE_URI = os.environ.get(
    'DATABASE_URL',
    f'postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}'
)
SQLALCHEMY_TRACK_MODIFICATIONS = False

# File Upload Configuration
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size
ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'txt'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB per file

# Email Configuration
MAIL_SERVER = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
MAIL_PORT = int(os.environ.get('MAIL_PORT', 587))
MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'True').lower() == 'true'
MAIL_USERNAME = os.environ.get('MAIL_USERNAME', '')
MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')
MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER', MAIL_USERNAME)


INSTRUCTOR_ROLES = [
    'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
    'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper',
    'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',
]
