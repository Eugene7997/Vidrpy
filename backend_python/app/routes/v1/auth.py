"""Authentication routes for Google OAuth 2.0."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.db import get_db
from app.services.user import UserService
from app.utils.auth import create_access_token
from app.utils.google_oauth import verify_google_token
from app.types.schemas import GoogleTokenRequest, TokenResponse, UserResponse
from app.utils.dependencies import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@router.post("/google", response_model=TokenResponse)
async def google_auth(token_request: GoogleTokenRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user with Google OAuth 2.0 token.
    
    Args:
        token_request: Google ID token from OAuth flow
        db: Database session
        
    Returns:
        Token and user information
        
    Raises:
        HTTPException: If token is invalid
    """
    try:
        # Verify Google token
        google_user_info = verify_google_token(token_request.token)
        
        # Extract user information
        google_id = google_user_info.get("sub")
        email = google_user_info.get("email")
        name = google_user_info.get("name")
        
        if not google_id or not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Google token: missing user information",
            )
        
        # Get or create user
        user = await UserService.get_or_create_user_by_google(
            db,
            email=email,
            google_id=google_id,
            username=name,
        )
        
        # Update last login
        await UserService.update_last_login(db, user.user_id)
        
        # Create access token
        access_token = create_access_token(data={"sub": str(user.user_id)})
        
        logger.info(f"User authenticated via Google: {user.email}")
        
        return TokenResponse(
            access_token=access_token,
            user=UserResponse.model_validate(user),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current authenticated user information.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        User information
    """
    return UserResponse.model_validate(current_user)
