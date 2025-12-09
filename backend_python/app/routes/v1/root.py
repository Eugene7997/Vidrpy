from fastapi import APIRouter
from app.config.settings import settings

router = APIRouter(prefix="/api/v1")


@router.get("/")
async def read_root():
    return {"message": f"Welcome to the {settings.PROJECT_NAME} API!"}


@router.get("/health")
async def health_check():
    return {"status": "ok", "message": f"{settings.PROJECT_NAME} is still alive."}
