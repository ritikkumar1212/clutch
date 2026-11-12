"""Chat REST: full history for the ephemeral room (live updates ride the WS)."""
from __future__ import annotations

from app.models import enum_val

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_complete_user
from app.models import HelpRequest, User
from app.schemas import ChatOut, MessageOut, PublicUserOut, RewardIn
from app.services.chat import history, lock_deadline, post_message
from app.services.requests import is_participant

router = APIRouter(prefix="/chat", tags=["chat"])


async def _participant_request(db: AsyncSession, request_id: str, user_id: str) -> HelpRequest:
    req = await db.get(HelpRequest, request_id)
    if not req or not is_participant(req, user_id):
        raise HTTPException(404, "Chat not found")
    return req


@router.get("/{request_id}", response_model=ChatOut)
async def open_chat(request_id: str,
                    user: User = Depends(get_complete_user),
                    db: AsyncSession = Depends(get_db)) -> ChatOut:
    req = await _participant_request(db, request_id, user.id)

    other_id = req.helper_id if user.id == req.requester_id else req.requester_id
    other = await db.get(User, other_id) if other_id else None
    if not other:
        raise HTTPException(404, "Chat counterpart missing")

    role = "requester" if user.id == req.requester_id else "helper"
    msgs = await history(db, req, user.id)

    return ChatOut(
        request_id=req.id,
        role=role,                                     # type: ignore[arg-type]
        counterpart=PublicUserOut(handle=other.handle, gender=enum_val(other.gender),
                                  gender_verified=other.gender_verified),
        status=enum_val(req.status) if hasattr(req.status, "value") else str(req.status),
        archived=req.chat_archived,
        lock_at=lock_deadline(req),                    # type: ignore[arg-type]
        tip_amount=float(req.tip_amount or 0),
        messages=[MessageOut.model_validate(m) for m in msgs],
    )


@router.post("/{request_id}/messages", response_model=MessageOut)
async def send_message(request_id: str, payload: dict,
                       user: User = Depends(get_complete_user),
                       db: AsyncSession = Depends(get_db)) -> MessageOut:
    """REST fallback mirroring the WS `chat_message` event."""
    req = await _participant_request(db, request_id, user.id)
    msg = await post_message(db, req, user, str(payload.get("body", "")),
                             str(payload.get("kind", "text")))
    return MessageOut.model_validate(msg)


@router.post("/{request_id}/reward", response_model=ChatOut)
async def set_reward(request_id: str, payload: RewardIn,
                     user: User = Depends(get_complete_user),
                     db: AsyncSession = Depends(get_db)) -> ChatOut:
    """Set the negotiated cash reward while the private chat is active."""
    req = await _participant_request(db, request_id, user.id)
    if enum_val(req.status) != "accepted" or req.chat_archived:
        raise HTTPException(409, "Cash reward can only be changed in an active chat")
    req.tip_amount = payload.amount
    await db.commit()
    await db.refresh(req)
    return await open_chat(request_id, user, db)