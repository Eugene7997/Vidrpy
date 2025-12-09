"""Main FastAPI application"""

from fastapi import FastAPI
import asyncio
from fastapi.middleware.cors import CORSMiddleware
from app.config.settings import settings, setup_logging
from app.routes.v1 import videos, root
from app.services.supabase import ensure_bucket_exists

async def lifespan(app: FastAPI):
    """Async lifespan context manager for startup and shutdown events."""
    logger = setup_logging()
    logger.info("Starting Backend server ...")

    # Initialize Supabase bucket
    await ensure_bucket_exists()

    try:
        yield
    except asyncio.CancelledError:
        # This happens on Ctrl+C
        logger.info("Lifespan cancelled, shutting down...")
        raise
    finally:
        logger.info("Shutting down Backend server ...")

    logger.info("Shutting down Backend server ...")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Returns:
        Configured FastAPI application instance.
    """

    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.PROJECT_VERSION,
        lifespan=lifespan
    )
    
    origins = settings.ALLOWED_ORIGINS

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(root.router)
    app.include_router(videos.router)

    return app


app = create_app()
