"""User service for database operations."""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.utils.auth import get_password_hash, verify_password
from app.utils.auth import needs_rehash
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
        password: str,
        username: Optional[str] = None,
    ) -> User:
        """Create a new user.

        Args:
            db: Database session
            email: User email
            password: Plain text password (will be hashed)
            username: Optional username

        Returns:
            Created User object
        """
        password_hash = get_password_hash(password)
        user = User(
            email=email,
            username=username,
            password_hash=password_hash,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def authenticate_user(
        db: AsyncSession, 
        email: str, 
        password: str
    ) -> Optional[User]:
        """Authenticate a user with email and password.

        Args:
            db: Database session
            email: User email
            password: Plain text password

        Returns:
            User object if authenticated, None otherwise
        """
        user = await UserService.get_user_by_email(db, email)
        if not user or not user.password_hash:
            return None
        if not verify_password(password, user.password_hash):
            return None

        # If the stored hash uses an older scheme or weaker parameters,
        # rehash the password with the current preferred scheme (argon2)
        # and update the database so next logins use the new hash.
        try:
            if needs_rehash(user.password_hash):
                new_hash = get_password_hash(password)
                user.password_hash = new_hash
                await db.commit()
                await db.refresh(user)
        except Exception:
            # If rehashing fails for any reason, continue returning the user
            # (don't block login for upgrade failure).
            pass

        return user

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
