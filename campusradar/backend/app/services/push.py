"""Web-Push delivery (VAPID). Fire-and-forget; failures never break requests."""
from __future__ import annotations

import asyncio
import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import PushSubscription
from app.services.geo import is_ws_connected

log = logging.getLogger("campusradar.push")

try:  # pywebpush is optional at import-time so the API still boots without it
    from pywebpush import WebPushException, webpush
except Exception:  # pragma: no cover
    webpush = None
    WebPushException = Exception
    log.warning("pywebpush not installed — push notifications disabled")


async def send_to_user(db: AsyncSession, user_id: str, title: str, body: str, url: str = "/radar") -> None:
    """Push only when the user has NO live WebSocket (they'd already see it in-app)."""
    if webpush is None or not settings.VAPID_PRIVATE_KEY:
        return
    if await is_ws_connected(user_id):
        return
    # .env stores the PEM with literal \n escapes — restore real newlines
    private_key = settings.VAPID_PRIVATE_KEY.replace("\\n", "\n")
    subs = (await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )).scalars().all()
    if not subs:
        return
    payload = json.dumps({"title": title, "body": body, "url": url})
    for sub in subs:
        try:
            await asyncio.to_thread(
                webpush,
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
            )
        except WebPushException as exc:  # dead subscription → drop it
            status = getattr(getattr(exc, "response", None), "status_code", 0)
            if status in (404, 410):
                await db.delete(sub)
                await db.commit()
            log.debug("push failed for %s: %s", user_id, exc)
        except Exception as exc:  # noqa: BLE001
            log.debug("push error for %s: %s", user_id, exc)
