"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

VALID_CATEGORIES = {"ride", "medicine", "printout", "charger", "study", "errand"}
VALID_RADII = {200, 500, 1000, 2000}


# ------------------------------------------------------------------- auth ----
class OtpRequestIn(BaseModel):
    email: EmailStr


class OtpRequestOut(BaseModel):
    ok: bool
    message: str
    dev_code: str | None = None   # ONLY returned when OTP_DEV_ECHO=true (dev)


class OtpVerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class OtpVerifyOut(BaseModel):
    signup_token: str


class SignupIn(BaseModel):
    signup_token: str
    password: str = Field(min_length=8, max_length=72)
    handle: str | None = Field(default=None, min_length=3, max_length=32, pattern=r"^[a-z0-9_]+$")


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthOut(BaseModel):
    token: str
    user: "UserOut"


# ------------------------------------------------------------------ users ----
class OnboardingIn(BaseModel):
    gender: Literal["male", "female", "other"]
    upi_vpa: str | None = Field(default=None, max_length=64, pattern=r"^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,64}$")


class UserOut(BaseModel):
    id: str
    email: str
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
class EstimateIn(BaseModel):
    lat: float
    lng: float
    radius_m: int
    gender_filter: Literal["everyone", "female_only"] = "everyone"

    @field_validator("radius_m")
    @classmethod
    def radius_valid(cls, v: int) -> int:
        if v not in VALID_RADII:
            raise ValueError(f"radius_m must be one of {sorted(VALID_RADII)}")
        return v


class EstimateOut(BaseModel):
    matching_helpers: int


class RequestCreateIn(BaseModel):
    category: str
    description: str = Field(min_length=5, max_length=500)
    landmark: str | None = Field(default=None, max_length=160)
    lat: float
    lng: float
    radius_m: int
    urgency: Literal["normal", "urgent", "emergency"] = "normal"
    gender_filter: Literal["everyone", "female_only"] = "everyone"
    tip_amount: float = Field(default=0, ge=0, le=10_000)

    @field_validator("category")
    @classmethod
    def category_valid(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError("unknown category")
        return v

    @field_validator("radius_m")
    @classmethod
    def radius_valid(cls, v: int) -> int:
        if v not in VALID_RADII:
            raise ValueError(f"radius_m must be one of {sorted(VALID_RADII)}")
        return v


class RequestOut(BaseModel):
    id: str
    category: str
    description: str
    landmark: str | None
    lat: float
    lng: float
    radius_m: int
    urgency: str
    gender_filter: str
    tip_amount: float
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
    tip_amount: float = 0.0            # drives the requester's post-completion UPI button
    messages: list[MessageOut]


AuthOut.model_rebuild()
