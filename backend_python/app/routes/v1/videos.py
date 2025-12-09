from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import uuid
import logging
from urllib.parse import urlparse

from app.db import get_db
from app.services.video import VideoService
from app.services.supabase import SupabaseStorageService
from app.types.schemas import VideoCreate, VideoResponse, VideoUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/videos")

# TODO: pagination, filtering, sorting, error handling (severely lacking except for upload)

@router.get("/", response_model=List[VideoResponse])
async def get_videos(db: AsyncSession = Depends(get_db)):
    """Get all videos."""
    videos = await VideoService.get_all_videos(db)
    return videos


@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(video_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get a specific video by ID."""
    video = await VideoService.get_video_by_id(db, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


@router.post("/", response_model=VideoResponse)
async def create_video(video_data: VideoCreate, db: AsyncSession = Depends(get_db)):
    """Create a new video record."""
    video = await VideoService.create_video(
        db,
        filename=video_data.filename,
        indexeddb_key=video_data.indexeddb_key,
        cloud_path=video_data.cloud_path,
        size_bytes=video_data.size_bytes,
        duration_ms=video_data.duration_ms,
    )
    return video


@router.post("/{video_id}/upload")
async def upload_video(
    video_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a video file to Supabase storage."""
    video = await VideoService.get_video_by_id(db, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        # Update status to uploading
        await VideoService.update_video(
            db,
            video_id,
            upload_status_private="uploading",
            upload_status_cloud="uploading",
        )

        # Read file data
        file_data = await file.read()

        # Upload to Supabase storage
        try:
            cloud_path = await SupabaseStorageService.upload_video(
                str(video_id),
                file_data,
                file.filename or video.filename,
            )
        except Exception as upload_error:
            logger.error(f"Supabase upload error for video {video_id}: {str(upload_error)}")
            # Update status to failed
            try:
                await VideoService.update_video(
                    db,
                    video_id,
                    upload_status_private="failed",
                    upload_status_cloud="failed",
                )
            except Exception as db_error:
                logger.error(f"Failed to update video status to failed: {str(db_error)}")
            raise HTTPException(status_code=500, detail=f"Upload failed: {str(upload_error)}")

        # Update video record with cloud path and success status
        await VideoService.update_video(
            db,
            video_id,
            cloud_path=cloud_path,
            upload_status_private="success",
            upload_status_cloud="success",
        )

        logger.info(f"Successfully uploaded video {video_id}")

        return {
            "message": "Video uploaded successfully",
            "video_id": str(video_id),
            "cloud_path": cloud_path,
        }
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error during upload for video {video_id}: {str(e)}", exc_info=True)
        # Try to update status to failed
        try:
            await VideoService.update_video(
                db,
                video_id,
                upload_status_private="failed",
                upload_status_cloud="failed",
            )
        except Exception as db_error:
            logger.error(f"Failed to update video status to failed: {str(db_error)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.patch("/{video_id}", response_model=VideoResponse)
async def update_video(
    video_id: uuid.UUID,
    video_data: VideoUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a video record (rename, status, etc)."""
    video = await VideoService.get_video_by_id(db, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    updated_video = await VideoService.update_video(
        db,
        video_id,
        filename=video_data.filename,
        upload_status_private=video_data.upload_status_private,
        upload_status_cloud=video_data.upload_status_cloud,
    )
    return updated_video


@router.delete("/{video_id}")
async def delete_video(video_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Delete a video record and its file from storage."""
    video = await VideoService.get_video_by_id(db, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        # Extract the storage file path from cloud_path (which doesn't change on rename)
        # Format: https://{project}.supabase.co/storage/v1/object/public/videos/{video_id}/{filename}
        storage_path = None
        if video.cloud_path:
            try:
                parsed_url = urlparse(video.cloud_path)
                # Extract path after /storage/v1/object/public/videos/
                # Path format: storage/v1/object/public/videos/{video_id}/{filename}
                path_parts = parsed_url.path.strip('/').split('/')
                # Find the index of 'videos' and get everything after it
                if 'videos' in path_parts:
                    videos_index = path_parts.index('videos')
                    if videos_index + 1 < len(path_parts):
                        # Get {video_id}/{filename}
                        storage_path = '/'.join(path_parts[videos_index + 1:])
                        logger.info(f"Extracted storage path from cloud_path: {storage_path}")
                    else:
                        logger.error(f"Invalid cloud_path format - no path after 'videos': {video.cloud_path}")
                else:
                    logger.error(f"Could not find 'videos' in cloud_path: {video.cloud_path}")
            except Exception as parse_error:
                logger.error(f"Failed to parse cloud_path '{video.cloud_path}': {str(parse_error)}", exc_info=True)
        
        # Delete file from storage if we have a valid path
        if storage_path:
            delete_success = await SupabaseStorageService.delete_video(storage_path)
            if not delete_success:
                logger.warning(f"Storage deletion returned False for path: {storage_path}")
        elif video.cloud_path:
            logger.warning(f"Could not extract storage path from cloud_path, skipping storage deletion: {video.cloud_path}")

        # Delete database record
        await VideoService.delete_video(db, video_id)

        logger.info(f"Successfully deleted video {video_id}")

        return {"message": "Video deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete video {video_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")
