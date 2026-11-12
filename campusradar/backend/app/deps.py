"""Auth dependencies — JWT bearer for REST, token query-param for WebSocket."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Query, WebSocket, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.security import decode_token

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if creds is None or not creds.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    payload = decode_token(creds.credentials, expected_scope="access")
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return user


def ws_user_id_from_token(token: str) -> str | None:
    payload = decode_token(token, expected_scope="access")
    return payload["sub"] if payload else None


async def ws_current_user_id(ws: WebSocket) -> str | None:
    token = ws.query_params.get("token", "")
    return ws_user_id_from_token(token)


async def get_complete_user(user: User = Depends(get_current_user)) -> User:
    """Endpoints that require an onboarded profile (gender verified)."""
    if not user.profile_complete:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Complete onboarding first (POST /users/onboarding)")
    return user


async def db_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    return (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
