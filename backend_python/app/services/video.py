"""Video service for database operations."""

from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.video import Video
import uuid


class VideoService:
    """Service for video database operations."""

    @staticmethod
    async def get_all_videos(db: AsyncSession) -> List[Video]:
        """Get all videos from database.

        Args:
            db: Database session

        Returns:
            List of Video objects
        """
        result = await db.execute(select(Video))
        return result.scalars().all()

    @staticmethod
    async def get_video_by_id(db: AsyncSession, video_id: uuid.UUID) -> Optional[Video]:
        """Get a video by ID.

        Args:
            db: Database session
            video_id: UUID of the video

        Returns:
            Video object if found, None otherwise
        """
        result = await db.execute(select(Video).where(Video.video_id == video_id))
        return result.scalars().first()

    @staticmethod
    async def create_video(
        db: AsyncSession,
        filename: str,
        indexeddb_key: Optional[str] = None,
        cloud_path: Optional[str] = None,
        size_bytes: Optional[int] = None,
        duration_ms: Optional[int] = None,
    ) -> Video:
        """Create a new video record.

        Args:
            db: Database session
            filename: Name of the video file
            indexeddb_key: IndexedDB key
            cloud_path: Cloud storage path
            size_bytes: Size in bytes
            duration_ms: Duration in milliseconds

        Returns:
            Created Video object
        """
        video = Video(
            filename=filename,
            indexeddb_key=indexeddb_key,
            cloud_path=cloud_path,
            size_bytes=size_bytes,
            duration_ms=duration_ms,
        )
        db.add(video)
        await db.commit()
        await db.refresh(video)
        return video

    @staticmethod
    async def update_video(
        db: AsyncSession,
        video_id: uuid.UUID,
        filename: Optional[str] = None,
        cloud_path: Optional[str] = None,
        upload_status_private: Optional[str] = None,
        upload_status_cloud: Optional[str] = None,
    ) -> Optional[Video]:
        """Update a video record.

        Args:
            db: Database session
            video_id: UUID of the video
            filename: New filename
            cloud_path: New cloud path
            upload_status_private: New private upload status
            upload_status_cloud: New cloud upload status

        Returns:
            Updated Video object if found, None otherwise
        """
        video = await VideoService.get_video_by_id(db, video_id)
        if video:
            if filename is not None:
                video.filename = filename
            if cloud_path is not None:
                video.cloud_path = cloud_path
            if upload_status_private is not None:
                video.upload_status_private = upload_status_private
            if upload_status_cloud is not None:
                video.upload_status_cloud = upload_status_cloud
            await db.commit()
            await db.refresh(video)
        return video

    @staticmethod
    async def update_upload_status_private(
        db: AsyncSession,
        video_id: uuid.UUID,
        status: str,
        retry_count: Optional[int] = None,
    ) -> Optional[Video]:
        """Update private upload status.

        Args:
            db: Database session
            video_id: UUID of the video
            status: New status ('pending', 'uploading', 'success', 'failed')
            retry_count: Optional retry count to increment

        Returns:
            Updated Video object if found, None otherwise
        """
        video = await VideoService.get_video_by_id(db, video_id)
        if video:
            video.upload_status_private = status
            if retry_count is not None:
                video.retry_count_private = retry_count
            await db.commit()
            await db.refresh(video)
        return video

    @staticmethod
    async def update_upload_status_cloud(
        db: AsyncSession,
        video_id: uuid.UUID,
        status: str,
        retry_count: Optional[int] = None,
    ) -> Optional[Video]:
        """Update cloud upload status.

        Args:
            db: Database session
            video_id: UUID of the video
            status: New status ('pending', 'uploading', 'success', 'failed')
            retry_count: Optional retry count to increment

        Returns:
            Updated Video object if found, None otherwise
        """
        video = await VideoService.get_video_by_id(db, video_id)
        if video:
            video.upload_status_cloud = status
            if retry_count is not None:
                video.retry_count_cloud = retry_count
            await db.commit()
            await db.refresh(video)
        return video

    @staticmethod
    async def delete_video(db: AsyncSession, video_id: uuid.UUID) -> bool:
        """Delete a video record.

        Args:
            db: Database session
            video_id: UUID of the video

        Returns:
            True if deleted, False if not found
        """
        video = await VideoService.get_video_by_id(db, video_id)
        if video:
            await db.delete(video)
            await db.commit()
            return True
        return False
