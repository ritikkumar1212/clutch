"""Public runtime config for the frontend (VAPID public key only — never the private key)."""
from __future__ import annotations

from fastapi import APIRouter

from app.config import settings

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/public")
async def public_config() -> dict:
    return {
        "vapid_public_key": settings.VAPID_PUBLIC_KEY or None,
        "request_ttl_minutes": settings.REQUEST_TTL_MINUTES,
        "chat_lock_minutes": settings.CHAT_LOCK_MINUTES,
    }
