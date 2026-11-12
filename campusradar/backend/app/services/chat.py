"""Ephemeral chat (rule 5): persistence, history, live publish, auto-lock."""
from __future__ import annotations

from app.models import enum_val

from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import ChatMessage, HelpRequest, RequestStatus, User, utcnow
from app.services.requests import chat_room, is_participant
from app.redis_client import publish, rds


async def history(db: AsyncSession, req: HelpRequest, user_id: str) -> list[ChatMessage]:
    rows = await db.execute(
        select(ChatMessage).where(ChatMessage.request_id == req.id).order_by(ChatMessage.id.asc())
    )
    return list(rows.scalars())


async def post_message(db: AsyncSession, req: HelpRequest, sender: User,
                       body: str, kind: str = "text") -> ChatMessage:
    if not is_participant(req, sender.id):
        raise HTTPException(403, "Not a participant of this chat")
    if req.chat_archived:
        raise HTTPException(423, "This chat is locked (30 min after completion)")
    if req.status in (RequestStatus.expired, RequestStatus.cancelled):
        raise HTTPException(409, f"Chat unavailable — request {enum_val(req.status)}")

    msg = ChatMessage(request_id=req.id, sender_id=sender.id, kind=kind,
                      body=body[:1000].strip() or "(empty)")
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    payload = {
        "type": "chat_message",
        "message": {
            "id": msg.id,
            "request_id": msg.request_id,
            "sender_id": msg.sender_id,
            "kind": msg.kind,
            "body": msg.body,
            "created_at": msg.created_at.isoformat(),
        },
    }
    await publish(chat_room(req.id), payload)

    other_id = req.helper_id if sender.id == req.requester_id else req.requester_id
    if other_id:
        # personal channel → in-app toast if not in the room, web-push if fully offline
        from app.redis_client import publish as publish_event
        await publish_event(f"ws:user:{other_id}", payload)
        from app.services import push as push_svc
        await push_svc.send_to_user(db, other_id, f"@{sender.handle} · chat",
                                    msg.body[:120], url=f"/chat/{req.id}")
    return msg


def lock_deadline(req: HelpRequest) -> object | None:
    """completed_at + 30 min, or None while still open/accepted."""
    if req.completed_at:
        return req.completed_at + timedelta(minutes=settings.CHAT_LOCK_MINUTES)
    return None


async def lock_expired_chats(db: AsyncSession, limit: int = 200) -> list[str]:
    """RULE 5: auto-lock chat 30 minutes after completion."""
    cutoff = utcnow() - timedelta(minutes=settings.CHAT_LOCK_MINUTES)
    rows = (await db.execute(
        select(HelpRequest)
        .where(HelpRequest.status == RequestStatus.completed,
               HelpRequest.chat_archived == False,          # noqa: E712
               HelpRequest.completed_at <= cutoff)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )).scalars().all()

    locked_ids: list[str] = []
    for req in rows:
        req.chat_archived = True
        locked_ids.append(req.id)
    if not rows:
        return []
    await db.commit()

    for req_id in locked_ids:
        msg = ChatMessage(request_id=req_id, sender_id=None, kind="system",
                          body="Chat locked for privacy (30 min after completion).")
        db.add(msg)
    await db.commit()

    for req_id in locked_ids:
        await publish(chat_room(req_id), {"type": "chat_locked", "request_id": req_id})
    return locked_ids


async def purge_old_chats(db: AsyncSession, limit: int = 500) -> int:
    """Ephemeral by design: delete messages CHAT_PURGE_HOURS after completion."""
    cutoff = utcnow() - timedelta(hours=settings.CHAT_PURGE_HOURS)
    req_ids = (await db.execute(
        select(HelpRequest.id)
        .where(HelpRequest.status == RequestStatus.completed, HelpRequest.completed_at <= cutoff)
        .limit(limit)
    )).scalars().all()
    if not req_ids:
        return 0
    from sqlalchemy import delete
    result = await db.execute(delete(ChatMessage).where(ChatMessage.request_id.in_(req_ids)))
    await db.commit()
    return result.rowcount or 0