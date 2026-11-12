"""Password hashing (PBKDF2-SHA256), JWT helpers and OTP utilities."""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings


# ---------------------------------------------------------------- passwords --
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return f"pbkdf2${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, expected = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return hmac.compare_digest(digest.hex(), expected)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


# ---------------------------------------------------------------------- JWT --
def create_token(subject: str, scope: str,
                 expire_days: float | None = None,
                 expire_minutes: int | None = None) -> str:
    now = datetime.now(timezone.utc)
    if expire_minutes:
        delta = timedelta(minutes=expire_minutes)
    elif expire_days:
        delta = timedelta(days=expire_days)
    else:
        delta = timedelta(days=settings.JWT_EXPIRE_DAYS)
    payload = {
        "sub": subject,
        "scope": scope,
        "iat": now,
        "exp": now + delta,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str, expected_scope: str | None = None) -> dict | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if expected_scope and payload.get("scope") != expected_scope:
        return None
    return payload


# ---------------------------------------------------------------------- OTP --
def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def generate_handshake_pin() -> str:
    return f"{secrets.randbelow(10_000):04d}"
