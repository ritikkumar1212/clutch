"""Shared async Redis client (single connection pool, no connect at import)."""
from __future__ import annotations

import redis.asyncio as aioredis

from app.config import settings

rds = aioredis.from_url(settings.REDIS_URL, decode_responses=True)


async def publish(channel: str, payload: dict) -> None:
    """Fire a JSON event down a pub/sub channel."""
    import json

    await rds.publish(channel, json.dumps(payload))
