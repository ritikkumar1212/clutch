-- ============================================================================
-- CampusRadar — PostgreSQL schema (Phase 1)
-- Campus help network for UIET Chandigarh
--
-- PRIVACY NOTE: There is intentionally NO table storing live user GPS
-- coordinates. Helper/requester positions live ONLY in Redis (geo:helpers)
-- with short TTLs. Postgres stores only the *target pin* of a request
-- (where help is needed), which is by-design visible to matched helpers.
--
-- Applied automatically by docker-compose (postgres initdb mount) or via:
--   python -m app.scripts.init_db
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- ---------------------------------------------------------------- enums -----
DO $$ BEGIN
  CREATE TYPE gender_enum AS ENUM ('male', 'female', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE request_status AS ENUM ('open', 'accepted', 'completed', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE urgency_enum AS ENUM ('normal', 'urgent', 'emergency');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ledger_reason AS ENUM ('signup_bonus', 'completion', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------- users -----
-- Identity = anonymous handle (@swift_panda). Real names/photos are never
-- collected. Gender is captured at onboarding and surfaced only as a
-- verified M/F badge (rule 3 & 5 of the privacy model).
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,              -- must end with an allowed campus domain
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,    -- OTP verified before signup completes
  password_hash   TEXT NOT NULL,                     -- PBKDF2-SHA256, salted
  handle          TEXT NOT NULL UNIQUE,              -- anonymous handle, e.g. swift_panda
  gender          gender_enum NOT NULL DEFAULT 'other',
  gender_verified BOOLEAN NOT NULL DEFAULT FALSE,    -- set at onboarding
  upi_vpa         TEXT,                              -- optional; used ONLY to build upi:// deep links post-completion
  help_points     INTEGER NOT NULL DEFAULT 0,
  profile_complete BOOLEAN NOT NULL DEFAULT FALSE,   -- gender onboarded?
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_points ON users (help_points DESC);

-- OTP codes issued to campus emails during signup (10-min TTL, single use)
CREATE TABLE IF NOT EXISTS email_otps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,        -- sha256 of the 6-digit code
  consumed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otps_email ON email_otps (email, created_at DESC);

-- Web-Push subscriptions (one row per browser/endpoint)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id);

-- -------------------------------------------------------- help_requests -----
-- Lifecycle: open --accept--> accepted --verify PIN--> completed
--            open --timeout 20 min--> expired   |   open --cancel--> cancelled
CREATE TABLE IF NOT EXISTS help_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES users(id),
  helper_id     UUID REFERENCES users(id),
  category      TEXT NOT NULL,          -- ride | medicine | printout | charger | study | errand
  description   TEXT NOT NULL,
  landmark      TEXT,                   -- human label of the target pin (reverse-geocoded client-side)
  lat           DOUBLE PRECISION NOT NULL,   -- TARGET pin only — never the requester's live location
  lng           DOUBLE PRECISION NOT NULL,
  radius_m      INTEGER NOT NULL DEFAULT 500 CHECK (radius_m IN (200, 500, 1000, 2000)),
  urgency       urgency_enum NOT NULL DEFAULT 'normal',
  gender_filter TEXT NOT NULL DEFAULT 'everyone' CHECK (gender_filter IN ('everyone', 'female_only')),
  tip_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  status        request_status NOT NULL DEFAULT 'open',
  handshake_pin TEXT,                   -- 4-digit PIN shown to requester only; helper enters it to confirm
  pin_attempts  SMALLINT NOT NULL DEFAULT 0, -- capped at 5 wrong tries
  chat_archived BOOLEAN NOT NULL DEFAULT FALSE,  -- set 30 min after completion by janitor
  expires_at    TIMESTAMPTZ NOT NULL,   -- created_at + 20 min for open requests
  accepted_at   TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requests_status_expires ON help_requests (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_requests_requester      ON help_requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_helper         ON help_requests (helper_id, created_at DESC);

-- --------------------------------------------------- help_points_ledger -----
-- Append-only point history; users.help_points is the materialised balance.
CREATE TABLE IF NOT EXISTS help_points_ledger (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES help_requests(id) ON DELETE SET NULL,
  points     INTEGER NOT NULL,       -- +10 base + urgency bonus, or +5 signup bonus
  reason     ledger_reason NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON help_points_ledger (user_id, created_at DESC);

-- -------------------------------------------------------- chat_messages -----
-- Ephemeral: janitor purges rows 24h after completion (configurable).
-- sender_id NULL = system message (e.g. "Chat archived").
CREATE TABLE IF NOT EXISTS chat_messages (
  id         BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  sender_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL DEFAULT 'text',   -- text | quick | system
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_request ON chat_messages (request_id, id);
