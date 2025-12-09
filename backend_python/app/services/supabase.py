"""Supabase client and storage management."""

from supabase import create_client, Client
from app.config.settings import settings
import logging
import asyncio

logger = logging.getLogger(__name__)

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

supabase_admin: Client = None
if settings.SUPABASE_SERVICE_ROLE_KEY:
    supabase_admin = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

# Bucket name for storing videos
VIDEOS_BUCKET = "videos"


async def ensure_bucket_exists():
    """Ensure the videos bucket exists in Supabase storage."""
    if not supabase_admin:
        logger.warning("SUPABASE_SERVICE_ROLE_KEY not set, skipping bucket creation check")
        return

    try:
        await asyncio.to_thread(lambda: supabase_admin.storage.get_bucket(VIDEOS_BUCKET))
        logger.info(f"Bucket '{VIDEOS_BUCKET}' exists")
    except Exception as e:
        try:
            logger.info(f"Creating bucket '{VIDEOS_BUCKET}'...")
            await asyncio.to_thread(
                lambda: supabase_admin.storage.create_bucket(
                    VIDEOS_BUCKET,
                    options={"public": True},  # Make bucket publicly readable
                )
            )
            logger.info(f"Bucket '{VIDEOS_BUCKET}' created successfully")
        except Exception as create_error:
            logger.error(f"Failed to create bucket: {create_error}")


class SupabaseStorageService:
    """Service for managing files in Supabase storage."""

    @staticmethod
    async def upload_video(video_id: str, file_data: bytes, filename: str) -> str:
        """Upload a video file to Supabase storage.

        Args:
            video_id: UUID of the video
            file_data: Binary file data
            filename: Original filename

        Returns:
            Public URL of the uploaded file

        Raises:
            Exception: If upload fails
        """
        try:
            if not supabase_admin:
                raise Exception("SUPABASE_SERVICE_ROLE_KEY not configured for uploads")

            # Create file path with video_id as folder
            file_path = f"{video_id}/{filename}"

            logger.info(f"Starting upload for video {video_id}, file size: {len(file_data)} bytes")

            # Upload to Supabase in thread pool (blocking operation)
            # Use supabase_admin (service role key) to bypass RLS policies
            response = await asyncio.to_thread(
                lambda: supabase_admin.storage.from_(VIDEOS_BUCKET).upload(
                    file_path,
                    file_data,
                    file_options={"content-type": "video/webm"},
                )
            )

            logger.info(f"Upload response: {response}")
            logger.info(f"Uploaded video {video_id} to Supabase storage at path: {file_path}")

            # Get public URL
            public_url = await asyncio.to_thread(lambda: supabase.storage.from_(VIDEOS_BUCKET).get_public_url(file_path))

            logger.info(f"Generated public URL for video {video_id}: {public_url}")

            return public_url
        except Exception as e:
            logger.error(f"Failed to upload video {video_id}: {str(e)}", exc_info=True)
            raise

    @staticmethod
    async def delete_video(storage_path: str) -> bool:
        """Delete a video file from Supabase storage.
        
        Deletes the file using the storage path (e.g., "{video_id}/{filename}").
        The storage_path should be extracted from cloud_path, which doesn't change on rename.

        Args:
            storage_path: Storage path like "{video_id}/{filename}"

        Returns:
            True if deleted successfully, False otherwise
        """
        try:
            if not supabase_admin:
                raise Exception("SUPABASE_SERVICE_ROLE_KEY not configured for deletions")

            # Delete the file using its storage path
            await asyncio.to_thread(lambda: supabase_admin.storage.from_(VIDEOS_BUCKET).remove([storage_path]))
            logger.info(f"Deleted video file from storage: {storage_path}")

            return True
        except Exception as e:
            logger.error(f"Failed to delete video file {storage_path}: {str(e)}")
            return False

    @staticmethod
    def get_public_url(video_id: str, filename: str) -> str:
        """Get the public URL for a video.

        Args:
            video_id: UUID of the video
            filename: Filename

        Returns:
            Public URL of the file
        """
        file_path = f"{video_id}/{filename}"
        return supabase.storage.from_(VIDEOS_BUCKET).get_public_url(file_path)
