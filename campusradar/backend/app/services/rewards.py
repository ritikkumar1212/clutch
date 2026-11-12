"""Help Points rewards engine (rule 6): +10 base + urgency bonus, ledger, leaderboard."""
from __future__ import annotations

from app.models import enum_val

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import LedgerEntry, LedgerReason, Urgency, User
from app.redis_client import rds
from app.services.geo import cache_user_meta, notify_user


def completion_points(urgency: Urgency) -> int:
    bonus = settings.urgency_bonus_map.get(urgency.value if hasattr(urgency, "value") else str(urgency), 0)
    return settings.BASE_POINTS + bonus


async def award_completion(
    db: AsyncSession, helper: User, request_id: str, urgency: Urgency
) -> int:
    """Credit points, append ledger row, refresh caches, notify the helper."""
    points = completion_points(urgency)
    helper.help_points += points
    db.add(LedgerEntry(
        user_id=helper.id,
        request_id=request_id,
        points=points,
        reason=LedgerReason.completion,
        note=f"base {settings.BASE_POINTS} + urgency bonus "
             f"{points - settings.BASE_POINTS} ({urgency.value})",
    ))
    await db.commit()
    await cache_user_meta(helper.id, enum_val(helper.gender), helper.handle, helper.help_points)
    await notify_user(helper.id, {
        "type": "points_awarded",
        "points": points,
        "total": helper.help_points,
        "request_id": request_id,
    })
    return points


async def award_signup_bonus(db: AsyncSession, user: User) -> None:
    user.help_points += settings.SIGNUP_BONUS
    db.add(LedgerEntry(user_id=user.id, points=settings.SIGNUP_BONUS,
                       reason=LedgerReason.signup_bonus, note="Welcome to CampusRadar"))


async def user_ledger(db: AsyncSession, user_id: str, limit: int = 50) -> list[LedgerEntry]:
    rows = await db.execute(
        select(LedgerEntry).where(LedgerEntry.user_id == user_id)
        .order_by(LedgerEntry.created_at.desc()).limit(limit)
    )
    return list(rows.scalars())


async def leaderboard(db: AsyncSession, limit: int = 20) -> list[User]:
    rows = await db.execute(
        select(User).order_by(User.help_points.desc(), User.created_at.asc()).limit(limit)
    )
    return list(rows.scalars())


async def refresh_leaderboard_cache(user_id: str, points: int, handle: str, gender: str) -> None:
    await rds.hset(f"user:meta:{user_id}", mapping={"help_points": points, "handle": handle, "gender": gender})