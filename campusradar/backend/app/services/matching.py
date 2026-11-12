"""Request matching & targeted broadcast (rule 2 + rule 4).

The server reduces geo-matching to COUNTS and REQUEST CARDS. Individual
helper positions are never exposed.
"""
from __future__ import annotations

from app.models import enum_val

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import HelpRequest, User
from app.redis_client import publish, rds
from app.services import geo, push

log = logging.getLogger("campusradar.matching")


def _request_card(req: HelpRequest, requester: User) -> dict:
    """The ONLY projection of a request that leaves the server pre-acceptance.

    RULE 3: anonymous handle + gender badge + task info + target pin.
    No email, no name, no photo, no requester live-location.
    """
    return {
        "id": req.id,
        "description": req.description,
        "landmark": req.landmark,
        "lat": req.lat,                      # TARGET pin (by design, rule 3)
        "lng": req.lng,
        "radius_m": req.radius_m,
        "gender_filter": req.gender_filter,
        "status": enum_val(req.status) if hasattr(req.status, "value") else req.status,
        "expires_at": req.expires_at.isoformat(),
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "requester": {
            "handle": requester.handle,
            "gender": enum_val(requester.gender),
            "gender_verified": requester.gender_verified,
        },
    }


async def estimate_reach(db: AsyncSession, lat: float, lng: float,
                         radius_m: int, gender_filter: str, requester_id: str) -> int:
    """Aggregate count for the radar screen: 'N matching helpers online in this zone'."""
    candidates = await geo.search_within(lng, lat, radius_m)
    filtered = await geo.filter_candidates(db, candidates, requester_id, gender_filter)
    return len(filtered)


async def broadcast_new_request(db: AsyncSession, req: HelpRequest, requester: User) -> int:
    """Insert into matching feeds, emit WS events, push the offline."""
    candidates = await geo.search_within(req.lng, req.lat, req.radius_m)
    targets = await geo.filter_candidates(db, candidates, req.requester_id, req.gender_filter)

    card = _request_card(req, requester)
    event = {"type": "new_request", "request": card}

    for uid in targets:
        pipe = rds.pipeline()
        pipe.zadd(f"feed:{uid}", {req.id: req.created_at.timestamp() if req.created_at else 0})
        pipe.expire(f"feed:{uid}", settings.FEED_TTL_SECONDS)
        pipe.sadd(f"subs:{req.id}", uid)
        pipe.expire(f"subs:{req.id}", settings.FEED_TTL_SECONDS)
        await pipe.execute()

        await publish(f"ws:user:{uid}", event)

        from app.services.geo import is_ws_connected
        if not await is_ws_connected(uid):
            await push.send_to_user(
                db, uid,
                title="Help request",
                body=f"{card['requester']['handle']} needs help"
                     f"{(' · ' + card['landmark']) if card['landmark'] else ''}",
                url=f"/feed",
            )
    return len(targets)


async def remove_from_feeds(request_id: str, event_type: str = "feed_removed") -> int:
    """Lock/expire/cancel: pull the card out of every feed it was delivered to."""
    subs = await rds.smembers(f"subs:{request_id}")
    for uid in subs:
        await rds.zrem(f"feed:{uid}", request_id)
        await publish(f"ws:user:{uid}", {"type": event_type, "request_id": request_id})
    await rds.delete(f"subs:{request_id}")
    return len(subs)


async def add_to_feed_single(db: AsyncSession, req: HelpRequest, requester: User, helper_id: str) -> None:
    """Late-matching catch-up: a helper whose heartbeat arrived after creation."""
    await rds.zadd(f"feed:{helper_id}", {req.id: req.created_at.timestamp() if req.created_at else 0})
    await rds.expire(f"feed:{helper_id}", settings.FEED_TTL_SECONDS)
    await rds.sadd(f"subs:{req.id}", helper_id)
    await publish(f"ws:user:{helper_id}", {"type": "new_request", "request": _request_card(req, requester)})


# ----------------------------------------------------------- viewer counter --
async def register_viewer(request_id: str, user_id: str) -> int:
    """RULE 2: distinct-user live viewer set with sliding TTL."""
    pipe = rds.pipeline()
    pipe.sadd(f"viewers:{request_id}", user_id)
    pipe.expire(f"viewers:{request_id}", settings.VIEWER_TTL_SECONDS)
    _, count = await pipe.execute()
    return int(count or 0)


async def drop_viewer(request_id: str, user_id: str) -> int:
    await rds.srem(f"viewers:{request_id}", user_id)
    count = await rds.scard(f"viewers:{request_id}")
    return int(count or 0)


async def viewer_count(request_id: str) -> int:
    return int(await rds.scard(f"viewers:{request_id}") or 0)


async def clear_viewers(request_id: str) -> None:
    await rds.delete(f"viewers:{request_id}")