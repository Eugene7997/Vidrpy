import os
import logging
# from typing import Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


class Settings:
    """Application settings loaded from environment variables."""
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Video Recorder App")
    PROJECT_VERSION: str = os.getenv("PROJECT_VERSION", "0.1.0")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", 8000))
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    ALLOWED_ORIGINS: list[str] = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

    def __init__(self):
        """Initialize settings and validate required configurations."""
        if not self.DATABASE_URL:
            raise ValueError(
                "DATABASE_URL environment variable is required.\n"
                "Please create a .env file in backend_python/ directory.\n"
            )


def setup_logging() -> logging.Logger:
    """Set up logging configuration based on settings.

    Returns:
        Configured logger instance.
    """
    logging.basicConfig(
        level=logging.DEBUG if settings.DEBUG else logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)-8s - %(module)s:%(funcName)s:%(lineno)d - %(message)s",
    )

    return logging.getLogger("uvicorn")


settings = Settings()
