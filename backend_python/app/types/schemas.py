"""Pydantic models for request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class VideoBase(BaseModel):
    """Base model for video data."""

    filename: str = Field(..., min_length=1, max_length=255)
    indexeddb_key: Optional[str] = Field(None, max_length=255)
    cloud_path: Optional[str] = Field(None, max_length=500)
    size_bytes: Optional[int] = None
    duration_ms: Optional[int] = None


class VideoCreate(VideoBase):
    """Model for creating a video."""

    pass


class VideoUpdate(BaseModel):
    """Model for updating a video."""

    filename: Optional[str] = None
    upload_status_private: Optional[str] = None
    upload_status_cloud: Optional[str] = None
    retry_count_private: Optional[int] = None
    retry_count_cloud: Optional[int] = None


class VideoResponse(VideoBase):
    """Model for video response."""

    video_id: UUID
    upload_status_private: str
    upload_status_cloud: str
    retry_count_private: int
    retry_count_cloud: int
    created_at: datetime
    last_modified: datetime

    class Config:
        from_attributes = True
