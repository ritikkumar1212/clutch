"""SQLAlchemy ORM models — mirror of docs/02-database-schema.sql."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import (
    BIGINT,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import settings
from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    other = "other"


class RequestStatus(str, enum.Enum):
    open = "open"
    accepted = "accepted"
    completed = "completed"
    expired = "expired"
    cancelled = "cancelled"


class Urgency(str, enum.Enum):
    normal = "normal"
    urgent = "urgent"
    emergency = "emergency"


class LedgerReason(str, enum.Enum):
    signup_bonus = "signup_bonus"
    completion = "completion"
    adjustment = "adjustment"


def new_uuid() -> str:
    return str(uuid.uuid4())


def enum_val(v) -> str:
    """String value of an enum member, passing raw strings through.

    Columns are native Postgres enums; values fetched from the DB arrive as
    Python enum members, but freshly assigned literals stay strings until the
    next round-trip. All serialisation paths use this helper to be safe.
    """
    return v.value if hasattr(v, "value") else str(v)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    phone: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    handle: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    gender: Mapped[Gender] = mapped_column(Enum(Gender, name="gender_enum", native_enum=True),
                                           default=Gender.other, nullable=False)
    gender_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    upi_vpa: Mapped[str | None] = mapped_column(Text)
    help_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    profile_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    ledger: Mapped[list["LedgerEntry"]] = relationship(back_populates="user", viewonly=True)


class PhoneOtp(Base):
    __tablename__ = "phone_otps"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    phone: Mapped[str] = mapped_column(Text, nullable=False)
    code_hash: Mapped[str] = mapped_column(Text, nullable=False)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False),
                                         ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HelpRequest(Base):
    __tablename__ = "help_requests"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    requester_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    helper_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"))
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    landmark: Mapped[str | None] = mapped_column(Text)
    lat: Mapped[float] = mapped_column(nullable=False)
    lng: Mapped[float] = mapped_column(nullable=False)
    radius_m: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    urgency: Mapped[Urgency] = mapped_column(Enum(Urgency, name="urgency_enum", native_enum=True),
                                             default=Urgency.normal, nullable=False)
    gender_filter: Mapped[str] = mapped_column(String(16), default="everyone", nullable=False)
    tip_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    status: Mapped[RequestStatus] = mapped_column(Enum(RequestStatus, name="request_status", native_enum=True),
                                                  default=RequestStatus.open, nullable=False)
    handshake_pin: Mapped[str | None] = mapped_column(String(4))
    pin_attempts: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    chat_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_requests_status_expires", "status", "expires_at"),
        Index("idx_requests_requester", "requester_id", "created_at"),
    )

    @staticmethod
    def new_expires_at() -> datetime:
        return utcnow() + timedelta(minutes=settings.REQUEST_TTL_MINUTES)


class LedgerEntry(Base):
    __tablename__ = "help_points_ledger"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False),
                                         ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    request_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("help_requests.id"))
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[LedgerReason] = mapped_column(Enum(LedgerReason, name="ledger_reason", native_enum=True),
                                                 nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="ledger", viewonly=True)

    __table_args__ = (Index("idx_ledger_user", "user_id", "created_at"),)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(UUID(as_uuid=False),
                                            ForeignKey("help_requests.id", ondelete="CASCADE"), nullable=False)
    sender_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(16), default="text", nullable=False)  # text|quick|system
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("idx_chat_request", "request_id", "id"),)
