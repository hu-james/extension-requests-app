import settings


class Config(object):
    # LTI 1.3 Configuration
    LTI_CLIENT_ID = settings.LTI_CLIENT_ID
    LTI_ISSUER = settings.LTI_ISSUER


class BaseConfig(object):
    DEBUG = False
    TESTING = False
    # LTI 1.3 Configuration
    LTI_CLIENT_ID = settings.LTI_CLIENT_ID
    LTI_ISSUER = settings.LTI_ISSUER


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    TESTING = True


class TestingConfig(BaseConfig):
    DEBUG = False
    TESTING = True

