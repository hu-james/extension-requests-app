import jwt
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from flask import request, session, redirect
from urllib.parse import urlencode, parse_qs
import requests
from lti13_config import lti_config
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import base64
import settings

# Temporary state storage (in production, use Redis or database)
_state_storage = {}

class LTI13Service:
    """Service class for handling LTI 1.3 authentication and launches"""
    
    def __init__(self, app=None):
        self.app = app
    
    def init_app(self, app):
        self.app = app
    
    def handle_oidc_login(self):
        """Handle OIDC login initiation from Canvas"""
        try:
            # Get required parameters
            iss = request.form.get('iss') or request.args.get('iss')
            login_hint = request.form.get('login_hint') or request.args.get('login_hint')
            target_link_uri = request.form.get('target_link_uri') or request.args.get('target_link_uri')
            lti_message_hint = request.form.get('lti_message_hint') or request.args.get('lti_message_hint')
            client_id = request.form.get('client_id') or request.args.get('client_id')
            
            if not all([iss, login_hint, target_link_uri]):
                raise ValueError("Missing required OIDC parameters")
            
            # Generate state and nonce
            state = str(uuid.uuid4())
            nonce = str(uuid.uuid4())
            
            # Store in temporary storage instead of session
            _state_storage[state] = {
                'nonce': nonce,
                'target_link_uri': target_link_uri,
                'timestamp': time.time(),
                'client_id': client_id or lti_config.LTI_CLIENT_ID
            }
            
            # Also try to store in session as backup
            session['lti_state'] = state
            session['lti_nonce'] = nonce
            session['target_link_uri'] = target_link_uri
                        
            # Build authorization URL
            auth_params = {
                'response_type': 'id_token',
                'scope': 'openid',
                'client_id': client_id or lti_config.LTI_CLIENT_ID,
                'redirect_uri': target_link_uri,
                'login_hint': login_hint,
                'state': state,
                'nonce': nonce,
                'prompt': 'none',
                'response_mode': 'form_post'
            }
            
            if lti_message_hint:
                auth_params['lti_message_hint'] = lti_message_hint
            
            auth_url = f"{lti_config.LTI_AUTH_LOGIN_URL}?{urlencode(auth_params)}"
            
            return redirect(auth_url)
            
        except Exception as e:
            self.app.logger.error(f"OIDC login error: {e}")
            raise
    
    def handle_launch(self):
        """Handle LTI 1.3 launch with JWT token validation"""
        try:
            # Get ID token
            id_token = request.form.get('id_token')
            state = request.form.get('state')
            
            if not id_token:
                raise ValueError("Missing id_token")
            
            stored_data = _state_storage.get(state)
            if stored_data:
                current_time = time.time()
                expired_states = [s for s, data in _state_storage.items()
                                if current_time - data['timestamp'] > 1800]
                for expired_state in expired_states:
                    del _state_storage[expired_state]

                nonce = stored_data['nonce']
                client_id = stored_data.get('client_id', lti_config.LTI_CLIENT_ID)
                del _state_storage[state]
            elif state == session.get('lti_state'):
                nonce = session.get('lti_nonce')
                client_id = lti_config.LTI_CLIENT_ID
            else:
                raise ValueError("Invalid state parameter")

            # Decode and validate JWT
            claims = self.validate_jwt_token(id_token, nonce, client_id)
            
            # Extract LTI claims
            lti_claims = self.extract_lti_claims(claims)
            
            # Store user info in session
            self.store_user_session(lti_claims)
            
            return lti_claims
            
        except Exception as e:
            self.app.logger.error(f"Launch error: {e}")
            raise
    
    def validate_jwt_token(self, id_token, expected_nonce, client_id=None):
        """Validate JWT token signature and claims"""
        client_id = client_id or lti_config.LTI_CLIENT_ID
        try:
            # Decode header to get key ID
            header = jwt.get_unverified_header(id_token)
            kid = header.get('kid')


            unverified_claims = jwt.decode(id_token, options={"verify_signature": False})

            # Get Canvas public keys
            canvas_keys = self.get_canvas_public_keys()

            # Find the key
            public_key = None
            for key in canvas_keys['keys']:
                if key.get('kid') == kid:
                    # Convert JWK to RSA public key
                    public_key = self.jwk_to_rsa_key(key)
                    break

            if not public_key:
                raise ValueError(f"Public key not found for kid: {kid}")

            allowed_issuers = [
                lti_config.LTI_ISSUER,  # http://canvas.docker
                'https://canvas.instructure.com',  
                'http://canvas.instructure.com'
            ]

            # Try decoding with each allowed issuer
            claims = None
            last_error = None
            for allowed_issuer in allowed_issuers:
                try:
                    claims = jwt.decode(
                        id_token,
                        public_key,
                        algorithms=['RS256'],
                        audience=client_id,
                        issuer=allowed_issuer,
                        options={
                            'verify_signature': True,
                            'verify_exp': True,
                            'verify_aud': True,
                            'verify_iss': True,
                            'require': ['exp', 'iat', 'aud', 'iss', 'sub', 'nonce']
                        }
                    )
                    self.app.logger.debug(f"JWT validated with issuer: {allowed_issuer}")
                    break
                except jwt.InvalidIssuerError as e:
                    last_error = e
                    continue

            if claims is None:
                raise last_error or ValueError("Invalid issuer")

            # Verify nonce
            if claims.get('nonce') != expected_nonce:
                raise ValueError("Invalid nonce")

            # Invalidate nonce to prevent replay attacks
            session.pop('lti_nonce', None)
            session.pop('lti_state', None)

            return claims
            
        except Exception as e:
            self.app.logger.error(f"JWT validation error: {e}")
            raise
    
    def jwk_to_rsa_key(self, jwk):
        """Convert JWK to RSA public key"""
        try:
            # Decode base64url encoded values
            n = self.base64url_decode(jwk['n'])
            e = self.base64url_decode(jwk['e'])
            
            # Convert to integers
            n_int = int.from_bytes(n, 'big')
            e_int = int.from_bytes(e, 'big')
            
            # Create RSA public key
            from cryptography.hazmat.primitives.asymmetric import rsa
            from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
            
            public_numbers = RSAPublicNumbers(e_int, n_int)
            public_key = public_numbers.public_key()
            
            return public_key
            
        except Exception as e:
            self.app.logger.error(f"JWK conversion error: {e}")
            raise
    
    def base64url_decode(self, data):
        """Decode base64url encoded data"""
        # Add padding if needed
        padding = 4 - (len(data) % 4)
        if padding != 4:
            data += '=' * padding
        
        return base64.urlsafe_b64decode(data)
    
    def get_canvas_public_keys(self):
        """Fetch Canvas public keys for JWT verification"""
        try:
            response = requests.get(lti_config.LTI_KEY_SET_URL, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            self.app.logger.error(f"Error fetching Canvas keys: {e}")
            raise
    
    def extract_lti_claims(self, claims):
        """Extract LTI-specific claims from JWT"""
        lti_version = claims.get('https://purl.imsglobal.org/spec/lti/claim/version', '')
        message_type = claims.get('https://purl.imsglobal.org/spec/lti/claim/message_type', '')
        
        if lti_version != '1.3.0':
            raise ValueError(f"Unsupported LTI version: {lti_version}")
        
        if message_type != 'LtiResourceLinkRequest':
            raise ValueError(f"Unsupported message type: {message_type}")
        
        # Extract context (course) information
        context = claims.get('https://purl.imsglobal.org/spec/lti/claim/context', {})
        
        # Extract resource link information
        resource_link = claims.get('https://purl.imsglobal.org/spec/lti/claim/resource_link', {})
        
        # Extract user information
        user_info = {
            'sub': claims.get('sub'),
            'name': claims.get('name', ''),
            'email': claims.get('email', ''),
            'given_name': claims.get('given_name', ''),
            'family_name': claims.get('family_name', ''),
        }
        
        # Extract roles
        roles = claims.get('https://purl.imsglobal.org/spec/lti/claim/roles', [])
        
        # Extract custom parameters
        custom = claims.get('https://purl.imsglobal.org/spec/lti/claim/custom', {})
        
        return {
            'user': user_info,
            'context': context,
            'resource_link': resource_link,
            'roles': roles,
            'custom': custom,
            'deployment_id': claims.get('https://purl.imsglobal.org/spec/lti/claim/deployment_id'),
            'target_link_uri': claims.get('https://purl.imsglobal.org/spec/lti/claim/target_link_uri'),
            'full_claims': claims
        }
    
    def store_user_session(self, lti_claims):
        """Store user and context information in session"""
        session['lti_authenticated'] = True
        session['lti_user_id'] = lti_claims['user']['sub']
        session['lti_user_name'] = lti_claims['user']['name']
        session['lti_user_email'] = lti_claims['user']['email']
        session['lti_context_id'] = lti_claims['context'].get('id', '')
        session['lti_context_title'] = lti_claims['context'].get('title', '')
        session['lti_roles'] = lti_claims['roles']
        session['lti_deployment_id'] = lti_claims['deployment_id']
        
        # Store custom parameters
        session['canvas_course_id'] = lti_claims['custom'].get('canvas_course_id', '')
        session['canvas_user_id'] = lti_claims['custom'].get('canvas_user_id', '')
    
    def is_instructor(self):
        """Check if current user has instructor role"""
        roles = session.get('lti_roles', [])
        return any(role in settings.INSTRUCTOR_ROLES for role in roles)
    
    def is_student(self):
        """Check if current user has student role"""
        roles = session.get('lti_roles', [])
        student_roles = [
            'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'
        ]
        return any(role in student_roles for role in roles)
    
    def get_canvas_access_token(self):
        """
        Get Canvas API access token using LTI 1.3 OAuth2 flow
        """
        try:
            # Check if we already have a valid token
            token = session.get('canvas_access_token')
            token_expiry = session.get('canvas_token_expiry')

            if token and token_expiry and datetime.now(timezone.utc) < datetime.fromisoformat(token_expiry):
                return token

            # Request new access token
            data = {
                'grant_type': 'client_credentials',
                'client_assertion_type': 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
                'client_assertion': self._create_client_assertion(),
                'scope': ' '.join([
                    'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
                    'https://purl.imsglobal.org/spec/lti-ags/scope/score',
                    'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly'
                ])
            }

            response = requests.post(
                lti_config.LTI_AUTH_TOKEN_URL,
                data=data,
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
                timeout=10
            )
            response.raise_for_status()
            token_data = response.json()

            # Store token in session
            token = token_data['access_token']
            expires_in = token_data.get('expires_in', 3600)
            expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)

            session['canvas_access_token'] = token
            session['canvas_token_expiry'] = expiry.isoformat()

            return token

        except Exception as e:
            self.app.logger.error(f"Error getting Canvas access token: {e}")
            return None

    def _create_client_assertion(self):
        """Create JWT client assertion for Canvas token request"""
        now = int(time.time())

        payload = {
            'iss': lti_config.LTI_CLIENT_ID,
            'sub': lti_config.LTI_CLIENT_ID,
            'aud': lti_config.LTI_AUTH_TOKEN_URL,
            'iat': now,
            'exp': now + 300,  # 5 minutes
            'jti': str(uuid.uuid4())
        }

        private_key = lti_config.get_private_key()
        token = jwt.encode(payload, private_key, algorithm='RS256')

        return token
