"""SQLAlchemy model for videos table."""

from sqlalchemy import Column, String, Text, Integer, BigInteger, DateTime, CheckConstraint, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from app.models.base import Base


class Video(Base):
    """SQLAlchemy model for the videos table."""

    __tablename__ = "videos"

    video_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    filename = Column(String(255), nullable=False)
    indexeddb_key = Column(String(255), nullable=True)
    cloud_path = Column(String(500), nullable=True)

    upload_status_private = Column(
        Text,
        nullable=False,
        default="pending",
    )
    upload_status_cloud = Column(
        Text,
        nullable=False,
        default="pending",
    )

    __table_args__ = (
        CheckConstraint(
            "upload_status_private IN ('pending', 'uploading', 'success', 'failed')",
            name="check_upload_status_private",
        ),
        CheckConstraint(
            "upload_status_cloud IN ('pending', 'uploading', 'success', 'failed')",
            name="check_upload_status_cloud",
        ),
    )

    retry_count_private = Column(Integer, nullable=False, default=0)
    retry_count_cloud = Column(Integer, nullable=False, default=0)

    size_bytes = Column(BigInteger, nullable=True)
    duration_ms = Column(BigInteger, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_modified = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="videos")

    def __repr__(self) -> str:
        return (
            f"<Video(video_id={self.video_id}, user_id={self.user_id}, filename={self.filename}, "
            f"upload_status_private={self.upload_status_private})>"
        )
