"""Location heartbeat — RULE 1: coordinates go to Redis only, never to other clients."""
from __future__ import annotations

from app.models import enum_val

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_complete_user
from app.models import User, utcnow
from app.schemas import HeartbeatIn
from app.services.geo import cache_user_meta, heartbeat

router = APIRouter(prefix="/location", tags=["location"])


@router.post("/heartbeat")
async def location_heartbeat(payload: HeartbeatIn,
                             user: User = Depends(get_complete_user),
                             db: AsyncSession = Depends(get_db)) -> dict:
    await heartbeat(user.id, payload.lat, payload.lng, settings.HEARTBEAT_TTL_SECONDS)
    await cache_user_meta(user.id, enum_val(user.gender), user.handle, user.help_points)
    user.last_seen_at = utcnow()
    await db.commit()
    return {"ok": True, "ttl_seconds": settings.HEARTBEAT_TTL_SECONDS}