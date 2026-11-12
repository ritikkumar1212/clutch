"""Background janitor: expiry, stale geo leases, chat lock & purge."""
from __future__ import annotations

import asyncio
import logging

from app.database import SessionLocal
from app.services import chat as chat_svc
from app.services import geo, requests as request_svc

log = logging.getLogger("campusradar.janitor")

INTERVAL_SECONDS = 20


async def _run_cycle() -> None:
    async with SessionLocal() as db:
        try:
            expired = await request_svc.expire_open_requests(db)
            for req_id in expired:
                await request_svc.notify_expired_requester(db, req_id)
            if expired:
                log.info("expired %d request(s): %s", len(expired), expired)

            locked = await chat_svc.lock_expired_chats(db)
            if locked:
                log.info("locked %d chat(s): %s", len(locked), locked)

            purged = await chat_svc.purge_old_chats(db)
            if purged:
                log.info("purged %d ephemeral message(s)", purged)

            stale = await geo.purge_stale()
            if stale:
                log.debug("dropped %d stale geo lease(s)", stale)
        except Exception:  # noqa: BLE001 — janitor must never die
            log.exception("janitor cycle failed")


async def janitor_loop() -> None:
    log.info("janitor started (every %ds)", INTERVAL_SECONDS)
    while True:
        try:
            await _run_cycle()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("janitor loop error")
        await asyncio.sleep(INTERVAL_SECONDS)


def start_janitor() -> asyncio.Task:
    return asyncio.create_task(janitor_loop())
