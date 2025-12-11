"""Authentication routes for user registration and login."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.db import get_db
from app.services.user import UserService
from app.utils.auth import create_access_token
from app.types.schemas import UserCreate, UserLogin, TokenResponse, UserResponse
from app.utils.dependencies import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register a new user.
    
    Args:
        user_data: User registration data
        db: Database session
        
    Returns:
        Token and user information
        
    Raises:
        HTTPException: If email already exists
    """
    # Check if user already exists
    existing_user = await UserService.get_user_by_email(db, user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    
    # Create new user
    user = await UserService.create_user(
        db,
        email=user_data.email,
        password=user_data.password,
        username=user_data.username,
    )
    
    # Update last login
    await UserService.update_last_login(db, user.user_id)
    
    # Create access token
    access_token = create_access_token(data={"sub": str(user.user_id)})
    
    logger.info(f"New user registered: {user.email}")
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return token.
    
    Args:
        credentials: User login credentials
        db: Database session
        
    Returns:
        Token and user information
        
    Raises:
        HTTPException: If credentials are invalid
    """
    # Authenticate user
    user = await UserService.authenticate_user(db, credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Update last login
    await UserService.update_last_login(db, user.user_id)
    
    # Create access token
    access_token = create_access_token(data={"sub": str(user.user_id)})
    
    logger.info(f"User logged in: {user.email}")
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
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
