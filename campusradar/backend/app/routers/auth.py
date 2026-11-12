"""Auth: phone-number OTP → signup → JWT."""
from __future__ import annotations

from app.models import enum_val

import logging
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.handles import generate_handle
from app.models import PhoneOtp, User, utcnow
from app.redis_client import rds
from app.schemas import (AuthOut, LoginIn, OtpRequestIn, OtpRequestOut,
                         OtpVerifyIn, OtpVerifyOut, SignupIn, UserOut)
from app.security import (create_token, generate_otp, hash_password,
                          sha256_hex, verify_password)
from app.services.rewards import award_signup_bonus

log = logging.getLogger("campusradar.auth")
router = APIRouter(prefix="/auth", tags=["auth"])

SIGNUP_TOKEN_TTL_MINUTES = 15
OTP_TTL_MINUTES = 10


# ------------------------------------------------------------ request OTP ----
@router.post("/request-otp", response_model=OtpRequestOut)
async def request_otp(payload: OtpRequestIn, db: AsyncSession = Depends(get_db)) -> OtpRequestOut:
    phone = payload.phone

    # simple abuse guard: 5 codes / 10 min per phone number
    rate_key = f"rate:otp:{phone}"
    hits = await rds.incr(rate_key)
    if hits == 1:
        await rds.expire(rate_key, 600)
    if hits > 5:
        raise HTTPException(429, "Too many codes requested — try again in a few minutes")

    code = generate_otp()
    db.add(PhoneOtp(
        phone=phone,
        code_hash=sha256_hex(code),
        expires_at=utcnow() + timedelta(minutes=OTP_TTL_MINUTES),
    ))
    await db.commit()

    log.info("OTP for %s: %s (dev log — wire SMS provider in production)", phone, code)
    return OtpRequestOut(
        ok=True,
        message=f"Verification code sent to {phone}",
        dev_code=code if settings.OTP_DEV_ECHO else None,
    )


# ------------------------------------------------------------- verify OTP ----
@router.post("/verify-otp", response_model=OtpVerifyOut)
async def verify_otp(payload: OtpVerifyIn, db: AsyncSession = Depends(get_db)) -> OtpVerifyOut:
    phone = payload.phone
    rows = (await db.execute(
        select(PhoneOtp)
        .where(PhoneOtp.phone == phone,
               PhoneOtp.consumed == False,                    # noqa: E712
               PhoneOtp.expires_at > utcnow())
        .order_by(PhoneOtp.created_at.desc())
        .limit(3)
    )).scalars().all()

    if not any(secrets.compare_digest(sha256_hex(payload.code), r.code_hash) for r in rows):
        raise HTTPException(400, "Invalid or expired code")

    for r in rows:
        if secrets.compare_digest(sha256_hex(payload.code), r.code_hash):
            r.consumed = True
    await db.commit()

    return OtpVerifyOut(
        signup_token=create_token(phone, scope="signup", expire_minutes=SIGNUP_TOKEN_TTL_MINUTES)
    )


# ----------------------------------------------------------------- signup ----
@router.post("/signup", response_model=AuthOut)
async def signup(payload: SignupIn, db: AsyncSession = Depends(get_db)) -> AuthOut:
    from app.security import decode_token
    token_payload = decode_token(payload.signup_token, expected_scope="signup")
    if not token_payload:
        raise HTTPException(400, "Signup session expired — verify your phone number again")
    phone = str(token_payload["sub"])

    existing = (await db.execute(select(User).where(User.phone == phone))).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Account already exists — log in instead")

    # unique anonymous handle (auto-generated if not requested)
    taken: set[str] = set((await db.execute(select(User.handle))).scalars())
    handle = (payload.handle or "").lower().strip() or generate_handle(taken)
    if handle in taken:
        raise HTTPException(409, "That handle is taken — pick another")

    user = User(
        phone=phone,
        phone_verified=True,
        password_hash=hash_password(payload.password),
        handle=handle,
    )
    db.add(user)
    await db.flush()
    await award_signup_bonus(db, user)
    await db.commit()

    from app.services.geo import cache_user_meta
    await cache_user_meta(user.id, enum_val(user.gender), user.handle, user.help_points)

    return AuthOut(token=create_token(user.id, scope="access"), user=UserOut.model_validate(user))


# ------------------------------------------------------------------- login ---
@router.post("/login", response_model=AuthOut)
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)) -> AuthOut:
    phone = payload.phone
    user = (await db.execute(select(User).where(User.phone == phone))).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Wrong phone number or password")
    return AuthOut(token=create_token(user.id, scope="access"), user=UserOut.model_validate(user))