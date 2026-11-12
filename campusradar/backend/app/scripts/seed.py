"""Seed demo users around the UIET Chandigarh campus (for local testing).

Creates 10 verified users (password: campus123), credits points, and plants
their presence leases in Redis GEO so the radar estimator and feed show real
counts for ~30 minutes. Run:  python -m app.scripts.seed
"""
from __future__ import annotations

from app.models import enum_val

import asyncio
import math

# UIET Panjab University, Sector 14, Chandigarh
UIET_LAT, UIET_LNG = 30.7633, 76.7870

SEED_USERS = [
    ("+919876500001", "swift_panda",   "male",   120),
    ("+919876500002", "bright_falcon", "female", 95),
    ("+919876500003", "calm_otter",    "male",   60),
    ("+919876500004", "lucky_heron",   "female", 88),
    ("+919876500005", "quiet_lynx",    "male",   42),
    ("+919876500006", "golden_fox",    "female", 73),
    ("+919876500007", "misty_wolf",    "male",   31),
    ("+919876500008", "sunny_dolphin", "female", 54),
    ("+919876500009", "rapid_badger",  "male",   19),
    ("+919876500010", "wild_sparrow",  "female", 67),
]

OFFSET_M = [80, 150, 230, 310, 400, 480, 560, 650, 720, 800]
ANGLE = [0.4, 1.1, 1.8, 2.5, 3.2, 3.9, 4.6, 5.3, 6.0, 0.8]


def offset(lat: float, lng: float, dist_m: float, bearing_rad: float) -> tuple[float, float]:
    d_lat = (dist_m * math.cos(bearing_rad)) / 111_320
    d_lng = (dist_m * math.sin(bearing_rad)) / (111_320 * math.cos(math.radians(lat)))
    return lat + d_lat, lng + d_lng


async def main() -> None:
    from sqlalchemy import select

    from app.config import settings
    from app.database import SessionLocal, engine
    from app.models import Gender, User
    from app.security import hash_password
    from app.services.geo import cache_user_meta, heartbeat

    async with SessionLocal() as db:
        for i, (phone, handle, gender, points) in enumerate(SEED_USERS):
            existing = (await db.execute(select(User).where(User.phone == phone))).scalar_one_or_none()
            if existing:
                user = existing
            else:
                user = User(
                    phone=phone,
                    phone_verified=True,
                    password_hash=hash_password("campus123"),
                    handle=handle,
                    gender=Gender(gender),
                    gender_verified=True,
                    upi_vpa=f"{handle.split('_')[0]}@upi",
                    help_points=points,
                    profile_complete=True,
                )
                db.add(user)
                await db.flush()
            await cache_user_meta(user.id, enum_val(user.gender), user.handle, user.help_points)
            lat, lng = offset(UIET_LAT, UIET_LNG, OFFSET_M[i], ANGLE[i])
            await heartbeat(user.id, lat, lng, ttl_seconds=1800)
        await db.commit()
    await engine.dispose()

    female_online = sum(1 for (_, _, g, _) in SEED_USERS if g == "female")
    print(f"seeded {len(SEED_USERS)} users (password: campus123), presence leased for 30 min")
    print(f"online demo helpers: {len(SEED_USERS)} ({female_online} female)")


if __name__ == "__main__":
    asyncio.run(main())