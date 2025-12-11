"""Google OAuth 2.0 utilities for token verification."""

from google.auth.transport import requests
from google.oauth2 import id_token
from app.config.settings import settings
import logging

logger = logging.getLogger(__name__)


def verify_google_token(token: str) -> dict:
    """Verify a Google ID token and return user information.
    
    Args:
        token: Google ID token from OAuth flow
        
    Returns:
        Dictionary containing user information (sub, email, name, etc.)
        
    Raises:
        ValueError: If token is invalid or verification fails
    """
    try:
        # Verify the token
        idinfo = id_token.verify_oauth2_token(
            token,
            requests.Request(),
            settings.GOOGLE_CLIENT_ID
        )
        
        # Verify the issuer
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Wrong issuer.')
        
        return idinfo
    except ValueError as e:
        logger.error(f"Google token verification failed: {e}")
        raise ValueError(f"Invalid Google token: {e}")

