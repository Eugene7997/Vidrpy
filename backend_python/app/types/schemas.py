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
    user_id: UUID
    upload_status_private: str
    upload_status_cloud: str
    retry_count_private: int
    retry_count_cloud: int
    created_at: datetime
    last_modified: datetime

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    """Base model for user data."""
    
    email: str = Field(..., max_length=320)
    username: Optional[str] = Field(None, max_length=100)


class UserCreate(BaseModel):
    """Model for user registration."""
    
    email: str = Field(..., max_length=320)
    password: str = Field(..., min_length=8, max_length=100)
    username: Optional[str] = Field(None, max_length=100)


class UserLogin(BaseModel):
    """Model for user login."""
    
    email: str = Field(..., max_length=320)
    password: str = Field(..., min_length=1)


class UserResponse(UserBase):
    """Model for user response."""
    
    user_id: UUID
    created_at: datetime
    last_modified: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Model for authentication token response."""
    
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
