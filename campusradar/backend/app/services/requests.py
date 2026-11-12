"""Request lifecycle: create → accept (atomic lock) → verify PIN → complete,
plus cancel/expire. Rule mapping lives in docs/05-privacy-enforcement.md."""
from __future__ import annotations

from app.models import enum_val

import logging

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import ChatMessage, HelpRequest, RequestStatus, User, utcnow
from app.redis_client import publish, rds
from app.security import generate_handshake_pin
from app.services import geo, matching, push
from app.services.rewards import award_completion

log = logging.getLogger("campusradar.requests")


def request_room(request_id: str) -> str:
    return f"room:request:{request_id}"


def chat_room(request_id: str) -> str:
    return f"room:chat:{request_id}"


def is_participant(req: HelpRequest, user_id: str) -> bool:
    return user_id in (req.requester_id, req.helper_id)


# ------------------------------------------------------------------ accept ---
async def accept(db: AsyncSession, req: HelpRequest, helper: User) -> HelpRequest:
    """Atomically lock an open request for exactly one helper.

    SELECT ... FOR UPDATE + status re-check inside the write transaction →
    if two helpers accept simultaneously, exactly one wins; the loser gets 409.
    """
    locked = (await db.execute(
        select(HelpRequest)
        .where(HelpRequest.id == req.id, HelpRequest.status == RequestStatus.open)
        .with_for_update()
    )).scalar_one_or_none()
    if not locked:
        raise HTTPException(409, "Request is no longer available")

    locked.helper_id = helper.id
    locked.status = RequestStatus.accepted
    locked.accepted_at = utcnow()
    locked.handshake_pin = generate_handshake_pin()      # rule 5: 4-digit handshake PIN

    db.add(ChatMessage(
        request_id=locked.id, sender_id=None, kind="system",
        body="Chat opened. Coordinate here, then meet — the helper must enter the "
             "4-digit PIN (shown on the requester's screen) to complete the task.",
    ))
    await db.commit()
    await db.refresh(locked)
    return locked


async def after_accept(db: AsyncSession, req: HelpRequest, helper: User) -> None:
    """Post-transaction fan-out: feeds, rooms, requester notification."""
    requester = await db.get(User, req.requester_id)

    await matching.remove_from_feeds(req.id, event_type="feed_removed")
    await matching.clear_viewers(req.id)

    helper_card = {"handle": helper.handle, "gender": enum_val(helper.gender),
                   "gender_verified": helper.gender_verified}
    locked_event = {
        "type": "request_locked",
        "request_id": req.id,
        "helper": helper_card,
    }
    await publish(request_room(req.id), locked_event)
    await publish(chat_room(req.id), locked_event)

    if requester:
        await geo.notify_user(requester.id, locked_event)
        await push.send_to_user(db, requester.id, "Request accepted!",
                                f"@{helper.handle} accepted your help request",
                                url=f"/chat/{req.id}")


# ------------------------------------------------------------------ verify ---
async def verify_pin(db: AsyncSession, req: HelpRequest, helper: User, pin: str) -> dict:
    """RULE 5+6: helper enters the requester's 4-digit PIN → completed + points."""
    if req.status != RequestStatus.accepted:
        raise HTTPException(409, f"Request is {enum_val(req.status)}, not awaiting verification")
    if req.helper_id != helper.id:
        raise HTTPException(403, "Only the accepted helper can verify the PIN")
    if req.pin_attempts >= settings.PIN_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many wrong PIN attempts — ask the requester to re-share the PIN")

    if (req.handshake_pin or "") != pin:
        req.pin_attempts += 1
        await db.commit()
        left = settings.PIN_MAX_ATTEMPTS - req.pin_attempts
        raise HTTPException(400, f"Wrong PIN — {left} attempt(s) left")

    req.status = RequestStatus.completed
    req.completed_at = utcnow()
    await db.commit()
    await db.refresh(req)

    points = await award_completion(db, helper, req.id)
    requester = await db.get(User, req.requester_id)

    await matching.remove_from_feeds(req.id, event_type="feed_removed")
    await matching.clear_viewers(req.id)

    completed_event = {
        "type": "request_completed",
        "request_id": req.id,
        "points_awarded": points,
        "helper_total": helper.help_points,
    }
    await publish(chat_room(req.id), completed_event)
    await publish(request_room(req.id), completed_event)

    db.add(ChatMessage(request_id=req.id, sender_id=None, kind="system",
                       body=f"Meet-up verified. {points} Help Points added to @{helper.handle}. "
                            "This chat will auto-lock in 30 minutes."))
    await db.commit()

    if requester:
        await geo.notify_user(requester.id, completed_event)
        await push.send_to_user(db, requester.id, "Task completed ✓",
                                f"+{points} Help Points for @{helper.handle}. "
                                + ("Tap to pay the agreed cash reward via UPI." if float(req.tip_amount or 0) > 0 else ""),
                                url=f"/chat/{req.id}")

    return {
        "points_awarded": points,
        "helper_total_points": helper.help_points,
        "upi": {  # helper receives the money — their VPA goes into the upi:// deep link
            "vpa": helper.upi_vpa,
            "amount": float(req.tip_amount or 0),
        },
    }


# ------------------------------------------------------------------ cancel ---
async def cancel(db: AsyncSession, req: HelpRequest, user: User) -> None:
    if req.requester_id != user.id:
        raise HTTPException(403, "Only the requester can cancel")
    if req.status != RequestStatus.open:
        raise HTTPException(409, f"Cannot cancel a request that is {enum_val(req.status)}")
    req.status = RequestStatus.cancelled
    await db.commit()

    await matching.remove_from_feeds(req.id, event_type="feed_removed")
    await matching.clear_viewers(req.id)
    await publish(request_room(req.id), {"type": "request_cancelled", "request_id": req.id})
    await geo.notify_user(req.requester_id, {"type": "request_cancelled", "request_id": req.id})


# ------------------------------------------------------------------ expire ---
async def expire_open_requests(db: AsyncSession, limit: int = 200) -> list[str]:
    """RULE 7: unaccepted requests die after 20 minutes. Janitor calls this."""
    overdue = (await db.execute(
        select(HelpRequest)
        .where(HelpRequest.status == RequestStatus.open, HelpRequest.expires_at <= utcnow())
        .limit(limit)
        .with_for_update(skip_locked=True)
    )).scalars().all()

    expired: list[tuple[str, str]] = []          # (request_id, requester_id)
    for req in overdue:
        req.status = RequestStatus.expired
        expired.append((req.id, req.requester_id))

    if not expired:
        return []

    await db.commit()
    for req_id, requester_id in expired:
        await matching.remove_from_feeds(req_id, event_type="feed_removed")
        await matching.clear_viewers(req_id)
        await publish(request_room(req_id), {"type": "request_expired", "request_id": req_id})
        await geo.notify_user(requester_id, {"type": "request_expired", "request_id": req_id})
    return [req_id for req_id, _ in expired]


async def notify_expired_requester(db: AsyncSession, req_id: str) -> None:
    req = await db.get(HelpRequest, req_id)
    if not req:
        return
    await geo.notify_user(req.requester_id, {"type": "request_expired", "request_id": req_id})
    await push.send_to_user(db, req.requester_id, "Request expired",
                            f"Nobody accepted your help request within "
                            f"{settings.REQUEST_TTL_MINUTES} minutes. Try widening the radius.",
                            url="/requests")