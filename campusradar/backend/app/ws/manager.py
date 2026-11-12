"""WebSocket connection manager.

Design (campus-scale, single-instance friendly, Redis-fanout ready):
- Every connection owns a Redis PUBSUB subscribed to `ws:user:{uid}` plus any
  rooms it joins (`room:request:{id}`, `room:chat:{id}`).
- Server code publishes JSON events to those channels (services/*), so the
  HTTP side never needs to know which sockets exist.
- ONE sender task consumes an outbox queue → no concurrent `ws.send_text`
  races between the pubsub listener and direct replies.
- Presence flag `ws:conn:{uid}` (TTL 90s, refreshed by keepalives) decides
  whether web-push is fired for a user.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time

from fastapi import WebSocket, WebSocketDisconnect

from app.models import RequestStatus
from app.redis_client import rds
from app.services import chat as chat_svc
from app.services import geo, matching
from app.services.requests import chat_room, is_participant, request_room

log = logging.getLogger("campusradar.ws")

PRESENCE_TTL = 90
CHAT_RATE_LIMIT = 10          # messages per 10s window per connection
CHAT_RATE_WINDOW = 10.0
OUTBOX_MAX = 1000


class Connection:
    def __init__(self, user_id: str, ws: WebSocket) -> None:
        self.user_id = user_id
        self.ws = ws
        self.pubsub = rds.pubsub()
        self.channels: set[str] = set()
        self.outbox: asyncio.Queue = asyncio.Queue(maxsize=OUTBOX_MAX)
        self.listener: asyncio.Task | None = None
        self.sender: asyncio.Task | None = None
        self.chat_timestamps: list[float] = []
        self._closed = asyncio.Event()

    # ------------------------------------------------------------ lifecycle --
    async def start(self) -> None:
        await self.subscribe(f"ws:user:{self.user_id}")
        await self._refresh_presence()
        self.listener = asyncio.create_task(self._listen())
        self.sender = asyncio.create_task(self._send_loop())

    async def _send_loop(self) -> None:
        """Single writer: everything the client receives flows through here."""
        try:
            while not self._closed.is_set():
                data = await self.outbox.get()
                if data is None:
                    break
                await self.ws.send_text(data)
        except (WebSocketDisconnect, RuntimeError):
            self._closed.set()          # client socket is gone
        except asyncio.CancelledError:
            pass

    def push_out(self, payload_json: str) -> None:
        """Queue an outbound frame (drop on a wedged slow client, never block)."""
        if self._closed.is_set():
            return
        try:
            self.outbox.put_nowait(payload_json)
        except asyncio.QueueFull:
            log.warning("outbox full for %s — dropping frame", self.user_id)

    def send_direct(self, payload: dict) -> None:
        """Direct reply to THIS client (snapshot, error)."""
        self.push_out(json.dumps(payload))

    async def _listen(self) -> None:
        try:
            while not self._closed.is_set():
                msg = await self.pubsub.get_message(ignore_subscribe_messages=True, timeout=15)
                if msg is None:
                    await self._refresh_presence()   # keepalive piggyback
                    continue
                data = msg.get("data")
                if isinstance(data, str):
                    self.push_out(data)
        except asyncio.CancelledError:
            pass
        except Exception:  # noqa: BLE001
            log.exception("ws pubsub listener error for %s", self.user_id)
            self._closed.set()

    async def _refresh_presence(self) -> None:
        await rds.set(f"ws:conn:{self.user_id}", "1", ex=PRESENCE_TTL)

    async def close(self) -> None:
        self._closed.set()
        for task in (self.listener, self.sender):
            if task:
                task.cancel()
        try:
            await self.pubsub.aclose()
        except Exception:  # noqa: BLE001
            pass

    # ------------------------------------------------------------- channels --
    async def subscribe(self, channel: str) -> None:
        if channel not in self.channels:
            await self.pubsub.subscribe(channel)
            self.channels.add(channel)

    async def unsubscribe(self, channel: str) -> None:
        if channel in self.channels:
            await self.pubsub.unsubscribe(channel)
            self.channels.discard(channel)


class ConnectionManager:
    def __init__(self) -> None:
        self._by_user: dict[str, set[Connection]] = {}

    def add(self, conn: Connection) -> None:
        self._by_user.setdefault(conn.user_id, set()).add(conn)

    def remove(self, conn: Connection) -> None:
        conns = self._by_user.get(conn.user_id)
        if conns:
            conns.discard(conn)
            if not conns:
                self._by_user.pop(conn.user_id, None)

    @property
    def online_users(self) -> int:
        return len(self._by_user)


manager = ConnectionManager()


# ------------------------------------------------------- client-side events --
async def _rate_ok(conn: Connection) -> bool:
    now = time.monotonic()
    conn.chat_timestamps = [t for t in conn.chat_timestamps if now - t < CHAT_RATE_WINDOW]
    if len(conn.chat_timestamps) >= CHAT_RATE_LIMIT:
        return False
    conn.chat_timestamps.append(now)
    return True


async def handle_client_event(conn: Connection, raw: str, db_factory) -> None:
    """Dispatch one client frame. `db_factory` yields a short-lived session."""
    try:
        event = json.loads(raw)
        etype = event.get("type")
    except (json.JSONDecodeError, AttributeError):
        return

    user_id = conn.user_id

    if etype == "ping":
        await conn._refresh_presence()
        conn.send_direct({"type": "pong", "online_users": manager.online_users})
        return

    if etype == "heartbeat":
        try:
            lat, lng = float(event["lat"]), float(event["lng"])
            await geo.heartbeat(user_id, lat, lng, 90)
            await conn._refresh_presence()
        except (KeyError, TypeError, ValueError):
            pass
        return

    if etype == "view_request":                       # rule 2: live viewer counter
        request_id = str(event.get("request_id", ""))
        async with db_factory() as db:
            from app.models import HelpRequest
            req = await db.get(HelpRequest, request_id)
            if not req:
                return
            if req.requester_id == user_id:            # owner → track room only
                await conn.subscribe(request_room(request_id))
                count = await matching.viewer_count(request_id)
                conn.send_direct({
                    "type": "viewer_count", "request_id": request_id, "count": count,
                    "hint": f"{count} users are currently viewing your request" if count else "",
                })
                return
            # helper: enforce gender filter again before letting them watch
            if req.status == RequestStatus.open:
                if req.gender_filter == "female_only":
                    g = await geo.cached_gender(user_id)
                    if g and g != "female":
                        return                          # server-side exclusion, rule 4
                count = await matching.register_viewer(request_id, user_id)
                await conn.subscribe(request_room(request_id))
                await rds.publish(request_room(request_id), json.dumps({
                    "type": "viewer_count", "request_id": request_id, "count": count,
                }))
        return

    if etype == "leave_request":
        request_id = str(event.get("request_id", ""))
        async with db_factory() as db:
            from app.models import HelpRequest
            req = await db.get(HelpRequest, request_id)
            owner = bool(req and req.requester_id == user_id)
        if not owner:
            count = await matching.drop_viewer(request_id, user_id)
            await rds.publish(request_room(request_id), json.dumps({
                "type": "viewer_count", "request_id": request_id, "count": count,
            }))
        await conn.unsubscribe(request_room(request_id))
        return

    if etype == "join_chat":                          # rule 5: ephemeral chat room
        request_id = str(event.get("request_id", ""))
        async with db_factory() as db:
            from app.models import HelpRequest
            req = await db.get(HelpRequest, request_id)
            if req and is_participant(req, user_id):
                await conn.subscribe(chat_room(request_id))
                await conn._refresh_presence()
        return

    if etype == "chat_message":                       # rule 5: persist + fan out
        request_id = str(event.get("request_id", ""))
        body = str(event.get("body", ""))[:1000]
        kind = str(event.get("kind", "text")) if event.get("kind") in ("text", "quick") else "text"
        if not body.strip() or not await _rate_ok(conn):
            return
        async with db_factory() as db:
            from app.models import HelpRequest, User
            req = await db.get(HelpRequest, request_id)
            sender = await db.get(User, user_id)
            if req and sender:
                try:
                    await chat_svc.post_message(db, req, sender, body, kind)
                except Exception as exc:              # locked chat, non-participant…
                    conn.send_direct({
                        "type": "error", "request_id": request_id,
                        "code": getattr(exc, "status_code", 400),
                        "detail": str(getattr(exc, "detail", exc)),
                    })
        return

    if etype == "chat_typing":
        request_id = str(event.get("request_id", ""))
        await rds.publish(chat_room(request_id), json.dumps({
            "type": "chat_typing", "request_id": request_id, "handle": event.get("handle", ""),
        }))
        return
