"""Requests: radar estimate, create+broadcast, targeted feed, accept, PIN verify."""
from __future__ import annotations

from app.models import enum_val

import logging
import time
from datetime import timedelta
from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_complete_user
from app.models import HelpRequest, RequestStatus, User, utcnow
from app.redis_client import rds
from app.schemas import (AcceptOut, EstimateIn, EstimateOut, PublicUserOut,
                         RequestCreateIn, RequestDetailOut, RequestOut, VerifyPinIn, VerifyPinOut)
from app.services import matching
from app.services.geo import notify_user
from app.services.requests import (accept as accept_svc, after_accept,
                                   cancel as cancel_svc, is_participant)
from app.services.requests import verify_pin as verify_pin_svc

log = logging.getLogger("campusradar.requests")
router = APIRouter(prefix="/requests", tags=["requests"])


def _public(user: User) -> dict:
    return {"handle": user.handle, "gender": enum_val(user.gender),
            "gender_verified": user.gender_verified}


async def _load_requester(db: AsyncSession, requester_id: str) -> User:
    user = await db.get(User, requester_id)
    if not user:
        raise HTTPException(404, "Requester not found")
    return user


# ------------------------------------------------- radar reach (rule 2) ------
@router.post("/estimate", response_model=EstimateOut)
async def estimate(payload: EstimateIn,
                   user: User = Depends(get_complete_user),
                   db: AsyncSession = Depends(get_db)) -> EstimateOut:
    count = await matching.estimate_reach(db, payload.lat, payload.lng,
                                          payload.radius_m, payload.gender_filter, user.id)
    return EstimateOut(matching_helpers=count)


# ------------------------------------------------------------ create ---------
@router.post("", response_model=RequestDetailOut)
async def create_request(payload: RequestCreateIn,
                         user: User = Depends(get_complete_user),
                         db: AsyncSession = Depends(get_db)) -> RequestDetailOut:
    req = HelpRequest(
        requester_id=user.id,
        category=payload.category,
        description=payload.description.strip(),
        landmark=payload.landmark,
        lat=payload.lat,
        lng=payload.lng,
        radius_m=payload.radius_m,
        urgency=payload.urgency,                      # type: ignore[arg-type]
        gender_filter=payload.gender_filter,
        tip_amount=payload.tip_amount,
        status=RequestStatus.open,
        expires_at=HelpRequest.new_expires_at(),      # rule 7: 20-minute TTL
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    reach = await matching.broadcast_new_request(db, req, user)

    return RequestDetailOut(
        **matching._request_card(req, user),          # noqa: SLF001 — same projection, one source of truth
        viewer_count=0,
        viewers_hint=f"broadcast to {reach} matching helper(s) online in this zone",
    )


# --------------------------------------------------------------- feed --------
@router.get("/feed", response_model=list[RequestOut])
async def my_feed(user: User = Depends(get_complete_user),
                  db: AsyncSession = Depends(get_db)) -> list[RequestOut]:
    """Only requests the server TARGETED to this user (rule 4 lives in matching.py)."""
    ids = await rds.zrevrange(f"feed:{user.id}", 0, 49)
    if not ids:
        return []
    rows = (await db.execute(
        select(HelpRequest, User)
        .join(User, HelpRequest.requester_id == User.id)
        .where(HelpRequest.id.in_(ids), HelpRequest.status == RequestStatus.open)
    )).all()
    cards = {req.id: RequestOut(**matching._request_card(req, requester)) for req, requester in rows}
    return [cards[i] for i in ids if i in cards]      # preserve GEOSEARCH proximity order


# ---------------------------------------------------------------- mine -------
@router.get("/mine")
async def mine(user: User = Depends(get_complete_user),
               db: AsyncSession = Depends(get_db)) -> dict:
    """Everything I created + everything I accepted, newest first."""
    created = (await db.execute(
        select(HelpRequest).where(HelpRequest.requester_id == user.id)
        .order_by(HelpRequest.created_at.desc()).limit(30)
    )).scalars().all()
    helping = (await db.execute(
        select(HelpRequest).where(HelpRequest.helper_id == user.id)
        .order_by(HelpRequest.accepted_at.desc()).limit(30)
    )).scalars().all()

    async def shape(req: HelpRequest) -> dict:
        requester = await db.get(User, req.requester_id)
        helper = await db.get(User, req.helper_id) if req.helper_id else None
        out = matching._request_card(req, requester) if requester else {}
        out["helper"] = _public(helper) if helper else None
        out["viewer_count"] = await matching.viewer_count(req.id) if req.requester_id == user.id else None
        out["has_pin"] = bool(req.handshake_pin)
        return out

    return {
        "created": [await shape(r) for r in created],
        "helping": [await shape(r) for r in helping],
    }


# ---------------------------------------------------------------- detail -----
async def _can_view(req: HelpRequest, user_id: str) -> bool:
    if is_participant(req, user_id):
        return True
    if req.status == RequestStatus.open:
        return bool(await rds.zscore(f"feed:{user_id}", req.id))
    return False


@router.get("/{request_id}", response_model=RequestDetailOut)
async def detail(request_id: str,
                 user: User = Depends(get_complete_user),
                 db: AsyncSession = Depends(get_db)) -> RequestDetailOut:
    req = await db.get(HelpRequest, request_id)
    if not req or not await _can_view(req, user.id):
        raise HTTPException(404, "Request not found or not visible to you")
    requester = await _load_requester(db, req.requester_id)
    card = matching._request_card(req, requester)
    out = RequestDetailOut(**card)
    if req.requester_id == user.id:
        count = await matching.viewer_count(request_id)
        out.viewer_count = count
        out.viewers_hint = f"{count} users are currently viewing your request" if count else "waiting for the first view…"
        if req.status == RequestStatus.completed and req.helper_id:
            helper = await db.get(User, req.helper_id)
            # exposed ONLY post-completion, ONLY to the payer (rule 6)
            out.helper_upi_vpa = helper.upi_vpa if helper else None
    return out


@router.post("/{request_id}/view")
async def register_view(request_id: str,
                        user: User = Depends(get_complete_user)) -> dict:
    """REST fallback for the WS `view_request` event (same viewer set)."""
    count = await matching.register_viewer(request_id, user.id)
    return {"viewers": count}


# --------------------------------------------------------- pin (requester) ---
@router.get("/{request_id}/pin")
async def get_pin(request_id: str,
                  user: User = Depends(get_complete_user),
                  db: AsyncSession = Depends(get_db)) -> dict:
    req = await db.get(HelpRequest, request_id)
    if not req or req.requester_id != user.id:
        raise HTTPException(404, "Request not found")
    if req.status not in (RequestStatus.accepted, RequestStatus.completed) or not req.handshake_pin:
        raise HTTPException(409, "PIN is available once a helper accepts")
    return {"pin": req.handshake_pin,
            "attempts_left": settings.PIN_MAX_ATTEMPTS - req.pin_attempts}


# ---------------------------------------------------------------- accept -----
@router.post("/{request_id}/accept", response_model=AcceptOut)
async def accept(request_id: str,
                 user: User = Depends(get_complete_user),
                 db: AsyncSession = Depends(get_db)) -> AcceptOut:
    req = await db.get(HelpRequest, request_id)
    if not req:
        raise HTTPException(404, "Request not found")
    if req.gender_filter == "female_only" and enum_val(user.gender) != "female":
        # rule 4: males should never even reach this card — belt & suspenders
        raise HTTPException(403, "This request is for female helpers only")
    if req.requester_id == user.id:
        raise HTTPException(400, "You cannot accept your own request")

    req = await accept_svc(db, req, user)
    await after_accept(db, req, user)

    requester = await db.get(User, req.requester_id)
    return AcceptOut(
        request=RequestOut(**matching._request_card(req, requester)),
        chat_ready=True,
    )


# ---------------------------------------------------------------- cancel -----
@router.post("/{request_id}/cancel")
async def cancel(request_id: str,
                 user: User = Depends(get_complete_user),
                 db: AsyncSession = Depends(get_db)) -> dict:
    req = await db.get(HelpRequest, request_id)
    if not req:
        raise HTTPException(404, "Request not found")
    await cancel_svc(db, req, user)
    return {"ok": True}


# ------------------------------------------------------------ verify PIN -----
@router.post("/{request_id}/verify-pin", response_model=VerifyPinOut)
async def verify_pin(request_id: str, payload: VerifyPinIn,
                     user: User = Depends(get_complete_user),
                     db: AsyncSession = Depends(get_db)) -> VerifyPinOut:
    req = await db.get(HelpRequest, request_id)
    if not req:
        raise HTTPException(404, "Request not found")
    result = await verify_pin_svc(db, req, user, payload.pin)
    return VerifyPinOut(ok=True, **result)


# ------------------------------------------------- late-arriving helpers -----
@router.post("/late-match")
async def late_match(user: User = Depends(get_complete_user),
                     db: AsyncSession = Depends(get_db)) -> dict:
    """Catch-up for helpers whose heartbeat arrived after a request was created:
    any open request whose target pin is within `radius_m` of the helper's
    CURRENT Redis position gets added to their feed once."""
    from app.services.geo import EXPIRY_KEY, GEO_KEY

    pos = await rds.geopos(GEO_KEY, user.id)
    if not pos or pos[0] is None:
        return {"added": 0}
    lng, lat = float(pos[0][0]), float(pos[0][1])
    expiry = await rds.zscore(EXPIRY_KEY, user.id)
    if not expiry or float(expiry) < time.time() * 1000:
        return {"added": 0}

    open_reqs = (await db.execute(
        select(HelpRequest).where(
            HelpRequest.status == RequestStatus.open,
            HelpRequest.expires_at > utcnow(),
            HelpRequest.created_at > utcnow() - timedelta(minutes=25),
        ).order_by(HelpRequest.created_at.desc()).limit(100)
    )).scalars().all()

    added = 0
    for req in open_reqs:
        if req.gender_filter == "female_only" and enum_val(user.gender) != "female":
            continue                                     # rule 4 again, server-side
        distance = _haversine_m(lat, lng, req.lat, req.lng)
        if distance <= req.radius_m and not await rds.zscore(f"feed:{user.id}", req.id):
            requester = await db.get(User, req.requester_id)
            if requester and requester.id != user.id:
                await matching.add_to_feed_single(db, req, requester, user.id)
                added += 1
    return {"added": added}


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = radians(lat1), radians(lat2)
    dp, dl = radians(lat2 - lat1), radians(lng2 - lng1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 6_371_000 * 2 * asin(sqrt(a))