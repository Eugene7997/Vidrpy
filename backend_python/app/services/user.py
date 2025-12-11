"""User service for database operations."""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.services.video import VideoService
from app.services.supabase import SupabaseStorageService
from datetime import datetime
import uuid
import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


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

    @staticmethod
    async def delete_user(db: AsyncSession, user_id: uuid.UUID) -> bool:
        """Delete a user and all their videos.
        
        This method:
        1. Deletes all video files from Supabase storage
        2. Deletes all video records from database (cascade)
        3. Deletes the user record

        Args:
            db: Database session
            user_id: UUID of the user

        Returns:
            True if deleted successfully, False if user not found
        """
        user = await UserService.get_user_by_id(db, user_id)
        if not user:
            return False
        
        try:
            # Get all videos for this user
            videos = await VideoService.get_videos_by_user(db, user_id)
            
            # Delete video files from Supabase storage
            for video in videos:
                if video.cloud_path:
                    try:
                        # Extract storage path from cloud_path URL
                        parsed_url = urlparse(video.cloud_path)
                        path_parts = parsed_url.path.strip('/').split('/')
                        if 'videos' in path_parts:
                            videos_index = path_parts.index('videos')
                            if videos_index + 1 < len(path_parts):
                                storage_path = '/'.join(path_parts[videos_index + 1:])
                                await SupabaseStorageService.delete_video(storage_path)
                                logger.info(f"Deleted video file from storage: {storage_path}")
                    except Exception as e:
                        logger.error(f"Failed to delete video file for video {video.video_id}: {str(e)}")
                        # Continue with deletion even if storage deletion fails
            
            # Delete user (cascade will delete video records)
            await db.delete(user)
            await db.commit()
            
            logger.info(f"Successfully deleted user {user_id} and all associated videos")
            return True
        except Exception as e:
            logger.error(f"Failed to delete user {user_id}: {str(e)}", exc_info=True)
            await db.rollback()
            raise
