# Phase 2 — REST API & WebSocket Reference

Base URL: `http://<host>:8000/api/v1` — bearer JWT on every authed route.
Interactive docs: `http://<host>:8000/docs` (OpenAPI).

## Auth (phone OTP)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/request-otp` | `{phone}` | Normalizes 10-digit Indian or E.164 numbers. Rate-limited 5 / 10 min. Returns `dev_code` only when `OTP_DEV_ECHO=true` |
| POST | `/auth/verify-otp` | `{phone, code}` | 10-min TTL, single-use → returns short-lived `signup_token` |
| POST | `/auth/signup` | `{signup_token, password, handle?}` | handle auto-generated `adjective_animal` if omitted; +5 signup bonus |
| POST | `/auth/login` | `{phone, password}` | returns bearer JWT + user profile |

## Users / onboarding

| Method | Path | Notes |
|---|---|---|
| GET | `/users/me` | full own profile (phone visible only to self) |
| POST | `/users/onboarding` | `{gender: male\|female\|other, upi_vpa?}` → sets the verified badge; **required before any matching endpoint** (403 gate) |
| GET | `/users/leaderboard` | top 20, anonymous rows only: `{rank, handle, gender, help_points}` |
| GET | `/users/me/ledger` | Help-Points history |
| POST | `/users/push-subscription` | `{endpoint, keys:{p256dh, auth}}` |
| GET | `/config/public` | `{vapid_public_key, request_ttl_minutes, chat_lock_minutes}` |

## Location (rule 1 — coordinates never leave the server)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/location/heartbeat` | `{lat, lng}` | `GEOADD geo:helpers` + 90 s lease. Also accepted as a WS `heartbeat` event |

## Requests

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/requests/estimate` | `{lat, lng, radius_m, gender_filter}` | **aggregate count** for the radar screen ("N matching helpers online in this zone"). `radius_m ∈ {200,500,1000,2000}` |
| POST | `/requests` | `{category, description, landmark?, lat, lng, radius_m, urgency, gender_filter, tip_amount}` | creates + broadcasts (WS `new_request` + web-push). Response includes `viewers_hint` with the reach |
| GET | `/requests/feed` | — | only what the server TARGETED to this user (rule 4), proximity-ordered |
| GET | `/requests/mine` | — | created + helping, with live `viewer_count` for own rows |
| GET | `/requests/{id}` | — | detail; requester also gets `viewer_count`, `viewers_hint`, and post-completion `helper_upi_vpa` (rule 6) |
| POST | `/requests/{id}/view` | — | REST fallback for the WS viewer counter |
| GET | `/requests/{id}/pin` | — | requester only, after accept: `{pin, attempts_left}` |
| POST | `/requests/{id}/accept` | — | atomic row lock → first helper wins, others get 409; blocks male users on `female_only` (403) |
| POST | `/requests/{id}/verify-pin` | `{pin}` | helper only → completed; awards points; returns `{points_awarded, helper_total_points, upi:{vpa, amount}}` |
| POST | `/requests/{id}/cancel` | — | requester only, while open |
| POST | `/requests/late-match` | — | catch-up: helpers whose heartbeat landed after creation get open requests within radius added once |
| GET | `/chat/{id}` | — | participants only: `{role, counterpart, status, archived, lock_at, messages[]}` |
| POST | `/chat/{id}/messages` | `{body, kind}` | REST fallback mirroring the WS chat event |

## WebSocket `GET /ws?token=<JWT>`

Single socket per app session. Client → server frames:

| type | payload | effect |
|---|---|---|
| `ping` | — | refreshes presence flag, replies `pong` |
| `heartbeat` | `{lat, lng}` | same as REST heartbeat |
| `view_request` | `{request_id}` | owner → joins `room:request:*`, gets `viewer_count` snapshot; helper → gender-gated (rule 4), `SADD viewers:{id}` + publish |
| `leave_request` | `{request_id}` | `SREM` + publish updated count |
| `join_chat` | `{request_id}` | participants only → joins `room:chat:*` |
| `chat_message` | `{request_id, body, kind:"text"\|"quick"}` | persist + fan-out (rate-limited 10 / 10 s) |
| `chat_typing` | `{request_id}` | ephemeral typing indicator |

Server → client events (all JSON, typed in `frontend/src/lib/types.ts`):
`new_request`, `feed_removed`, `viewer_count`, `request_locked`,
`request_completed`, `request_expired`, `request_cancelled`,
`chat_message`, `chat_typing`, `chat_locked`, `points_awarded`,
`error`, `pong`.

## Validation constants

- categories: `ride, medicine, printout, charger, study, errand`
- radii: `200, 500, 1000, 2000` metres
- urgency: `normal (+0) / urgent (+5) / emergency (+10)` — on top of the +10 base
- request TTL 20 min · chat lock 30 min after completion · chat purge 24 h
- PIN: 4 digits, max 5 wrong attempts
