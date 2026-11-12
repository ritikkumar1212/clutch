"""WebSocket endpoint: /ws?token=<JWT>"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.deps import ws_user_id_from_token
from app.ws.manager import Connection, handle_client_event, manager

log = logging.getLogger("campusradar.ws")
router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = Query("")) -> None:
    user_id = ws_user_id_from_token(token)
    if not user_id:
        await ws.close(code=4401, reason="invalid token")
        return

    await ws.accept()
    conn = Connection(user_id, ws)
    manager.add(conn)
    log.info("ws connect %s (%d users online)", user_id, manager.online_users)
    try:
        await conn.start()
        while True:
            raw = await ws.receive_text()
            await handle_client_event(conn, raw, SessionLocal)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        log.exception("ws fatal error for %s", user_id)
    finally:
        await conn.close()
        manager.remove(conn)
        log.info("ws disconnect %s (%d users online)", user_id, manager.online_users)
