"""Geo presence & radius matching (Phase 2 core).

PRIVACY RULE 1: coordinates live ONLY in Redis. This module's outputs are
user-ID lists or aggregate counts — exact positions of other users are never
serialised into any API or WS payload.
"""
from __future__ import annotations

import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.redis_client import publish, rds

GEO_KEY = "geo:helpers"
EXPIRY_KEY = "helper:expiry"
META_KEY = "user:meta:{user_id}"


def _now_ms() -> int:
    return int(time.time() * 1000)


async def heartbeat(user_id: str, lat: float, lng: float, ttl_seconds: int) -> None:
    """Record helper presence. Called on every POST /location/heartbeat."""
    expiry = _now_ms() + ttl_seconds * 1000
    await rds.geoadd(GEO_KEY, (lng, lat, user_id))
    await rds.zadd(EXPIRY_KEY, {user_id: expiry})


async def alive_ids(member_ids: list[str]) -> list[str]:
    """Filter members whose presence lease (helper:expiry) is still valid."""
    if not member_ids:
        return []
    now = _now_ms()
    pipe = rds.pipeline()
    for m in member_ids:
        pipe.zscore(EXPIRY_KEY, m)
    scores = await pipe.execute()
    return [m for m, s in zip(member_ids, scores) if s is not None and float(s) >= now]


async def search_within(lng: float, lat: float, radius_m: int) -> list[str]:
    """User IDs alive within `radius_m` metres of (lat, lng), nearest first."""
    try:
        members = await rds.geosearch(GEO_KEY, longitude=lng, latitude=lat,
                                      radius=radius_m, unit="m", sort="ASC")
    except Exception:
        return []
    return await alive_ids([m for m in members if m])


async def purge_stale() -> int:
    """Janitor: drop expired presence leases from both sets."""
    now = _now_ms()
    stale = await rds.zrangebyscore(EXPIRY_KEY, "-inf", now)
    if not stale:
        return 0
    await rds.zrem(GEO_KEY, *stale)
    await rds.zremrangebyscore(EXPIRY_KEY, "-inf", now)
    return len(stale)


# ------------------------------------------------------------- gender cache --
async def cache_user_meta(user_id: str, gender: str, handle: str, help_points: int) -> None:
    await rds.hset(META_KEY.format(user_id=user_id),
                   mapping={"gender": gender, "handle": handle, "help_points": help_points})


async def cached_gender(user_id: str) -> str | None:
    return await rds.hget(META_KEY.format(user_id=user_id), "gender")


async def genders_for(db: AsyncSession, user_ids: list[str]) -> dict[str, str]:
    """Gender per user — Redis cache first, Postgres fallback (write-through)."""
    result: dict[str, str] = {}
    missing: list[str] = []
    for uid in user_ids:
        g = await cached_gender(uid)
        if g:
            result[uid] = g
        else:
            missing.append(uid)
    if missing:
        rows = (await db.execute(select(User.id, User.gender).where(User.id.in_(missing)))).all()
        for uid, gender in rows:
            g = gender.value if hasattr(gender, "value") else str(gender)
            result[uid] = g
            # write ONLY the gender field — a full hset would clobber the
            # cached handle/help_points with blanks (gender is all we need)
            await rds.hset(META_KEY.format(user_id=uid), "gender", g)
    return result


async def filter_candidates(
    db: AsyncSession,
    candidate_ids: list[str],
    requester_id: str,
    gender_filter: str,
) -> list[str]:
    """Apply product rules to a GEOSEARCH result set.

    RULE 4 (asymmetric gender filter): `female_only` removes every male user
    here on the SERVER — they never enter a feed, never receive a WS event,
    never get a push. There is nothing to hide client-side.
    """
    candidates = [c for c in candidate_ids if c != requester_id]
    if gender_filter == "female_only":
        gender_map = await genders_for(db, candidates)
        candidates = [c for c in candidates if gender_map.get(c) == "female"]
    return candidates


# ------------------------------------------------------- ws presence / push --
async def is_ws_connected(user_id: str) -> bool:
    return bool(await rds.exists(f"ws:conn:{user_id}"))


async def notify_user(user_id: str, payload: dict) -> None:
    await publish(f"ws:user:{user_id}", payload)


__all__ = [
    "heartbeat", "search_within", "alive_ids", "purge_stale", "filter_candidates",
    "genders_for", "cache_user_meta", "is_ws_connected", "notify_user",
]
