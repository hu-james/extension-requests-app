import os
import json
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from dotenv import load_dotenv

load_dotenv()

class LTI13Config:
    """LTI 1.3 Configuration"""
    
    # LTI 1.3 Settings
    LTI_TOOL_ID = os.environ.get('LTI_TOOL_ID', 'auto-extend-tool')
    LTI_DEPLOYMENT_ID = os.environ.get('LTI_DEPLOYMENT_ID', '1')
    LTI_CLIENT_ID = os.environ.get('LTI_CLIENT_ID', 'auto-extend-client')
    
    # Canvas Platform Configuration
    LTI_ISSUER = os.environ.get('LTI_ISSUER', 'https://canvas.instructure.com')
    LTI_AUTH_LOGIN_URL = os.environ.get('LTI_AUTH_LOGIN_URL', 'https://canvas.instructure.com/api/lti/authorize_redirect')
    LTI_AUTH_TOKEN_URL = os.environ.get('LTI_AUTH_TOKEN_URL', 'https://canvas.instructure.com/login/oauth2/token')
    LTI_KEY_SET_URL = os.environ.get('LTI_KEY_SET_URL', 'https://canvas.instructure.com/api/lti/security/jwks')
    
    # Tool URLs (will be set dynamically)
    TOOL_BASE_URL = os.environ.get('TOOL_BASE_URL', 'http://localhost:5001')
    
    @property
    def TOOL_LOGIN_URL(self):
        return f"{self.TOOL_BASE_URL}/lti/login"
    
    @property
    def TOOL_LAUNCH_URL(self):
        return f"{self.TOOL_BASE_URL}/lti/launch"
    
    @property
    def TOOL_JWKS_URL(self):
        return f"{self.TOOL_BASE_URL}/lti/jwks"
    
    # Key Management
    PRIVATE_KEY_PATH = os.path.join(os.path.dirname(__file__), 'keys', 'private.pem')
    PUBLIC_KEY_PATH = os.path.join(os.path.dirname(__file__), 'keys', 'public.pem')
    
    @classmethod
    def generate_key_pair(cls):
        """Generate RSA key pair for LTI 1.3"""
        os.makedirs(os.path.dirname(cls.PRIVATE_KEY_PATH), exist_ok=True)
        
        # Generate private key
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )
        
        # Save private key
        with open(cls.PRIVATE_KEY_PATH, 'wb') as f:
            f.write(private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ))
        
        # Save public key
        public_key = private_key.public_key()
        with open(cls.PUBLIC_KEY_PATH, 'wb') as f:
            f.write(public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            ))
        
        return private_key, public_key
    
    @classmethod
    def get_private_key(cls):
        """Load private key"""
        if not os.path.exists(cls.PRIVATE_KEY_PATH):
            cls.generate_key_pair()
        
        with open(cls.PRIVATE_KEY_PATH, 'rb') as f:
            return serialization.load_pem_private_key(f.read(), password=None)
    
    @classmethod
    def get_public_key(cls):
        """Load public key"""
        if not os.path.exists(cls.PUBLIC_KEY_PATH):
            cls.generate_key_pair()
        
        with open(cls.PUBLIC_KEY_PATH, 'rb') as f:
            return serialization.load_pem_public_key(f.read())
    
    @classmethod
    def get_jwks(cls):
        """Generate JWKS (JSON Web Key Set) for public key"""
        public_key = cls.get_public_key()
        public_numbers = public_key.public_numbers()
        
        # Convert to base64url
        import base64
        
        def int_to_base64url_uint(val):
            val_bytes = val.to_bytes((val.bit_length() + 7) // 8, 'big')
            return base64.urlsafe_b64encode(val_bytes).decode('ascii').rstrip('=')
        
        return {
            "keys": [
                {
                    "kty": "RSA",
                    "use": "sig",
                    "kid": "lti-tool-key",
                    "n": int_to_base64url_uint(public_numbers.n),
                    "e": int_to_base64url_uint(public_numbers.e),
                    "alg": "RS256"
                }
            ]
        }

# Create instance
lti_config = LTI13Config()
