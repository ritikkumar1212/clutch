"""Chat REST: full history for the ephemeral room (live updates ride the WS)."""
from __future__ import annotations

from app.models import enum_val

import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_complete_user
from app.models import HelpRequest, User
from app.schemas import ChatOut, MessageOut, PublicUserOut, RewardIn
from app.services.chat import history, lock_deadline, post_message
from app.services.requests import is_participant
from app.config import settings

router = APIRouter(prefix="/chat", tags=["chat"])
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
ALLOWED_UPLOAD_PREFIXES = ("image/", "application/pdf", "text/plain")
ALLOWED_AUDIO_TYPES = ("audio/",)


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


async def _save_upload(request_id: str, user_id: str, upload: UploadFile,
                       allowed_prefixes: tuple[str, ...]) -> tuple[str, str]:
    content_type = upload.content_type or "application/octet-stream"
    if not content_type.startswith(allowed_prefixes):
        raise HTTPException(415, "This file type is not supported")
    data = await upload.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File must be 15 MB or smaller")
    folder = Path(settings.UPLOAD_DIR) / request_id
    folder.mkdir(parents=True, exist_ok=True)
    suffix = Path(upload.filename or "").suffix[:10]
    filename = f"{user_id}_{uuid4().hex}{suffix}"
    (folder / filename).write_bytes(data)
    return f"{settings.PUBLIC_API_URL}/uploads/{request_id}/{filename}", content_type


@router.post("/{request_id}/uploads", response_model=MessageOut)
async def upload_message(request_id: str,
                         file: UploadFile = File(...),
                         user: User = Depends(get_complete_user),
                         db: AsyncSession = Depends(get_db)) -> MessageOut:
    req = await _participant_request(db, request_id, user.id)
    is_audio = (file.content_type or "").startswith("audio/")
    allowed = ALLOWED_AUDIO_TYPES if is_audio else ALLOWED_UPLOAD_PREFIXES
    url, content_type = await _save_upload(request_id, user.id, file, allowed)
    payload = json.dumps({
        "url": url,
        "name": file.filename or "attachment",
        "mime": content_type,
    })
    msg = await post_message(db, req, user, payload, "audio" if is_audio else "attachment")
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