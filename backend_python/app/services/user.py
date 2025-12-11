"""User service for database operations."""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from datetime import datetime
import uuid


class UserService:
    """Service for user database operations."""

    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> Optional[User]:
        """Get a user by ID.

        Args:
            db: Database session
            user_id: UUID of the user

        Returns:
            User object if found, None otherwise
        """
        result = await db.execute(select(User).where(User.user_id == user_id))
        return result.scalars().first()

    @staticmethod
    async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
        """Get a user by email.

        Args:
            db: Database session
            email: Email address

        Returns:
            User object if found, None otherwise
        """
        result = await db.execute(select(User).where(User.email == email))
        return result.scalars().first()

    @staticmethod
    async def create_user(
        db: AsyncSession,
        email: str,
        username: Optional[str] = None,
        google_id: Optional[str] = None,
    ) -> User:
        """Create a new user.

        Args:
            db: Database session
            email: User email
            username: Optional username
            google_id: Optional Google user ID

        Returns:
            Created User object
        """
        user = User(
            email=email,
            username=username,
            google_id=google_id,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def get_or_create_user_by_google(
        db: AsyncSession,
        email: str,
        google_id: str,
        username: Optional[str] = None,
    ) -> User:
        """Get existing user by Google ID or email, or create a new one.

        Args:
            db: Database session
            email: User email from Google
            google_id: Google user ID
            username: Optional username (from Google name)

        Returns:
            User object
        """
        # First try to find by Google ID
        user = await UserService.get_user_by_google_id(db, google_id)
        if user:
            return user
        
        # Then try to find by email (in case user already exists)
        user = await UserService.get_user_by_email(db, email)
        if user:
            # Update with Google ID if not already set
            if not user.google_id:
                user.google_id = google_id
                await db.commit()
                await db.refresh(user)
            return user
        
        # Create new user
        return await UserService.create_user(db, email=email, username=username, google_id=google_id)

    @staticmethod
    async def get_user_by_google_id(db: AsyncSession, google_id: str) -> Optional[User]:
        """Get a user by Google ID.

        Args:
            db: Database session
            google_id: Google user ID

        Returns:
            User object if found, None otherwise
        """
        result = await db.execute(select(User).where(User.google_id == google_id))
        return result.scalars().first()

    @staticmethod
    async def update_last_login(db: AsyncSession, user_id: uuid.UUID) -> Optional[User]:
        """Update user's last login timestamp.

        Args:
            db: Database session
            user_id: UUID of the user

        Returns:
            Updated User object if found, None otherwise
        """
        user = await UserService.get_user_by_id(db, user_id)
        if user:
            user.last_login = datetime.utcnow()
            await db.commit()
            await db.refresh(user)
        return user
