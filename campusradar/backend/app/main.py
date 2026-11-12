"""CampusRadar API — FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.redis_client import rds
from app.services.janitor import start_janitor
from app.ws.router import router as ws_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("campusradar")


@asynccontextmanager
async def lifespan(app: FastAPI):
    janitor = None
    try:
        await rds.ping()
        log.info("redis connected (%s)", settings.REDIS_URL)
    except Exception as exc:  # noqa: BLE001 — surface loudly, keep booting
        log.error("redis unreachable: %s", exc)
    janitor = start_janitor()
    yield
    if janitor:
        janitor.cancel()
    await rds.aclose()


app = FastAPI(
    title="CampusRadar API",
    description="Hyper-local peer-to-peer campus help network (UIET Chandigarh). "
                "Privacy-first: no individual user pins, server-side geo matching.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)  # /ws

from app.routers import auth, chat, config, location, requests, users  # noqa: E402

API = "/api/v1"
app.include_router(auth.router, prefix=API)
app.include_router(users.router, prefix=API)
app.include_router(location.router, prefix=API)
app.include_router(requests.router, prefix=API)
app.include_router(chat.router, prefix=API)
app.include_router(config.router, prefix=API)


@app.get("/healthz", tags=["ops"])
async def healthz() -> dict:
    redis_ok = False
    try:
        redis_ok = await rds.ping()
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "redis": redis_ok, "service": "campusradar"}
