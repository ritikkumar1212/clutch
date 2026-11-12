"""CampusRadar backend configuration (env-driven, 12-factor)."""
from __future__ import annotations

import json

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- infra -------------------------------------------------------------
    DATABASE_URL: str = "postgresql+asyncpg://campus:campus@localhost:5432/campus"
    REDIS_URL: str = "redis://localhost:6379/0"

    # --- auth --------------------------------------------------------------
    JWT_SECRET: str = "dev-only-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 30
    # Verified campus domains. Sub-domains allowed automatically
    # (e.g. student.uiet.ac.in matches uiet.ac.in).
    ALLOWED_EMAIL_DOMAINS: str = "pu.ac.in,uiet.ac.in"

    # --- product rules -----------------------------------------------------
    REQUEST_TTL_MINUTES: int = 20        # rule 7: unaccepted requests expire
    CHAT_LOCK_MINUTES: int = 30          # rule 5: auto-lock after completion
    CHAT_PURGE_HOURS: int = 24           # ephemeral purge after lock
    HEARTBEAT_TTL_SECONDS: int = 90      # presence lease per heartbeat
    VIEWER_TTL_SECONDS: int = 900        # viewers:{id} sliding TTL
    FEED_TTL_SECONDS: int = 1800
    PIN_MAX_ATTEMPTS: int = 5

    # --- rewards (rule 6) ---------------------------------------------------
    BASE_POINTS: int = 10
    URGENCY_BONUS: str = '{"normal": 0, "urgent": 5, "emergency": 10}'
    SIGNUP_BONUS: int = 5

    # --- push (rule: web-push) ---------------------------------------------
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:dev@campusradar.local"

    # --- dev conveniences ----------------------------------------------------
    # Echo OTP codes in the API response (NO SMTP configured in dev).
    # Set OTP_DEV_ECHO=false + wire an SMTP provider in production.
    OTP_DEV_ECHO: bool = True

    @property
    def allowed_domains(self) -> list[str]:
        return [d.strip().lower() for d in self.ALLOWED_EMAIL_DOMAINS.split(",") if d.strip()]

    @property
    def urgency_bonus_map(self) -> dict[str, int]:
        return json.loads(self.URGENCY_BONUS)


settings = Settings()
