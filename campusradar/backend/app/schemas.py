"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime
import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

def normalize_phone(raw: str) -> str:
    """Normalize a 10-digit Indian mobile number or E.164 string to +<digits>."""
    cleaned = re.sub(r"[\s\-().]+", "", raw.strip())
    if re.fullmatch(r"\d{10}", cleaned):
        return f"+91{cleaned}"
    if re.fullmatch(r"0\d{10}", cleaned):
        return f"+91{cleaned[1:]}"
    if re.fullmatch(r"91\d{10}", cleaned):
        return f"+{cleaned}"
    if re.fullmatch(r"\+[1-9]\d{7,14}", cleaned):
        return cleaned
    raise ValueError("Enter a valid 10-digit mobile number or E.164 format (e.g. +919876543210)")


# ------------------------------------------------------------------- auth ----
class OtpRequestIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, v: str) -> str:
        return normalize_phone(v)


class OtpRequestOut(BaseModel):
    ok: bool
    message: str
    dev_code: str | None = None   # ONLY returned when OTP_DEV_ECHO=true (dev)


class OtpVerifyIn(BaseModel):
    phone: str
    code: str = Field(min_length=6, max_length=6)

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, v: str) -> str:
        return normalize_phone(v)


class OtpVerifyOut(BaseModel):
    signup_token: str


class SignupIn(BaseModel):
    signup_token: str
    password: str = Field(min_length=8, max_length=72)
    handle: str | None = Field(default=None, min_length=3, max_length=32, pattern=r"^[a-z0-9_]+$")


class LoginIn(BaseModel):
    phone: str
    password: str

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, v: str) -> str:
        return normalize_phone(v)


class AuthOut(BaseModel):
    token: str
    user: "UserOut"


# ------------------------------------------------------------------ users ----
class OnboardingIn(BaseModel):
    gender: Literal["male", "female", "other"]
    upi_vpa: str | None = Field(default=None, max_length=64, pattern=r"^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,64}$")


class UserOut(BaseModel):
    id: str
    phone: str
    handle: str
    gender: str
    gender_verified: bool
    upi_vpa: str | None
    help_points: int
    profile_complete: bool

    model_config = {"from_attributes": True}


class PublicUserOut(BaseModel):
    """Anonymous projection — what other users are allowed to see."""
    handle: str
    gender: str
    gender_verified: bool


class LeaderboardRow(BaseModel):
    rank: int
    handle: str
    gender: str
    help_points: int


class LedgerRow(BaseModel):
    id: int
    points: int
    reason: str
    note: str | None
    request_id: str | None
    created_at: datetime


# --------------------------------------------------------------- location ----
class HeartbeatIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


# --------------------------------------------------------------- requests ----
class RequestCreateIn(BaseModel):
    description: str = Field(min_length=5, max_length=500)
    landmark: str | None = Field(default=None, max_length=160)
    lat: float
    lng: float
    gender_filter: Literal["everyone", "female_only"] = "everyone"


class RequestOut(BaseModel):
    id: str
    description: str
    landmark: str | None
    lat: float
    lng: float
    gender_filter: str
    status: str
    expires_at: datetime
    accepted_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime | None = None
    requester: PublicUserOut | None = None
    helper: PublicUserOut | None = None
    distance_m: int | None = None       # computed client-side normally; filled when requested

    model_config = {"from_attributes": True}


class RequestDetailOut(RequestOut):
    viewer_count: int | None = None     # only for the requester
    viewers_hint: str | None = None
    helper_upi_vpa: str | None = None   # exposed only post-completion, only to the requester (rule 6)


class AcceptOut(BaseModel):
    request: RequestOut
    chat_ready: bool


class VerifyPinIn(BaseModel):
    pin: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class RewardIn(BaseModel):
    amount: float = Field(ge=0, le=10_000)


class VerifyPinOut(BaseModel):
    ok: bool
    points_awarded: int | None = None
    helper_total_points: int | None = None
    upi: dict | None = None   # {vpa, amount} — enables the requester's "Pay via UPI" button


# ------------------------------------------------------------------- chat ----
class MessageOut(BaseModel):
    id: int
    request_id: str
    sender_id: str | None
    kind: str
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatOut(BaseModel):
    request_id: str
    role: Literal["requester", "helper"]
    counterpart: PublicUserOut
    status: str
    archived: bool
    lock_at: datetime | None = None
    tip_amount: float = 0.0            # negotiated private-chat cash reward
    messages: list[MessageOut]


AuthOut.model_rebuild()
