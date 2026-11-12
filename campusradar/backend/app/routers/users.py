"""Users: profile, onboarding (gender badge), leaderboard, ledger, push subs."""
from __future__ import annotations

from app.models import enum_val

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Gender, PushSubscription, User, enum_val
from app.schemas import (LeaderboardRow, LedgerRow, OnboardingIn, UserOut)
from app.services.geo import cache_user_meta
from app.services.rewards import leaderboard, user_ledger

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/onboarding", response_model=UserOut)
async def onboarding(payload: OnboardingIn,
                     user: User = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)) -> UserOut:
    """Set gender (verified M/F badge) + optional UPI VPA.

    NOTE (production): gender verification here is self-attestation with a UI
    confirmation. Swap in an admin-review or student-ID flow by flipping
    `gender_verified` from a verification queue instead.
    """
    user.gender = Gender(payload.gender)
    user.gender_verified = True
    if payload.upi_vpa:
        user.upi_vpa = payload.upi_vpa
    user.profile_complete = True
    await db.commit()
    await cache_user_meta(user.id, enum_val(user.gender), user.handle, user.help_points)
    return UserOut.model_validate(user)


@router.get("/leaderboard", response_model=list[LeaderboardRow])
async def get_leaderboard(db: AsyncSession = Depends(get_db),
                          _: User = Depends(get_current_user)) -> list[LeaderboardRow]:
    """Anonymous by design: handles + gender badge + points only."""
    top = await leaderboard(db, limit=20)
    return [
        LeaderboardRow(rank=i + 1, handle=u.handle, gender=enum_val(u.gender), help_points=u.help_points)
        for i, u in enumerate(top)
    ]


@router.get("/me/ledger", response_model=list[LedgerRow])
async def my_ledger(user: User = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)) -> list[LedgerRow]:
    entries = await user_ledger(db, user.id)
    return [LedgerRow(id=e.id, points=e.points, reason=e.reason.value if hasattr(e.reason, "value") else e.reason,
                      note=e.note, request_id=e.request_id, created_at=e.created_at) for e in entries]


@router.post("/push-subscription")
async def save_push_subscription(payload: dict,
                                 user: User = Depends(get_current_user),
                                 db: AsyncSession = Depends(get_db)) -> dict:
    endpoint = payload.get("endpoint")
    keys = payload.get("keys") or {}
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        return {"ok": False, "detail": "invalid subscription"}
    existing = (await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == endpoint)
    )).scalar_one_or_none()
    if existing:
        existing.user_id = user.id
        existing.p256dh = keys["p256dh"]
        existing.auth = keys["auth"]
    else:
        db.add(PushSubscription(user_id=user.id, endpoint=endpoint,
                                p256dh=keys["p256dh"], auth=keys["auth"]))
    await db.commit()
    return {"ok": True}