# Privacy & Product Rules — Where Each One Is Enforced

The seven product rules from the spec, mapped to the exact code that enforces
them. All enforcement is server-side; the client is treated as untrusted.

| # | Rule | Enforcement point |
|---|---|---|
| 1 | **Zero individual user pins on the map** | Coordinates exist in exactly two places: (a) helper GPS → `POST /location/heartbeat` / WS `heartbeat` → `services/geo.py:heartbeat()` → Redis `GEOADD geo:helpers` with a 90 s lease; (b) the requester's chosen target pin (by design visible to helpers). No DB column, endpoint, or WS event ever returns another user's position. The map component (`MapPicker.tsx`) renders only the target pin; matching is university-wide rather than radius-based. |
| 2 | **Live viewer counter** | After posting: `viewers:{request_id}` SET (distinct users, 15-min sliding TTL) → `viewer_count` WS events → `ViewerCounter.tsx` renders "X users are currently viewing your request". Two tabs of the same user count once (SET semantics). Requests are broadcast to all active university users. |
| 3 | **Pre-acceptance anonymity** | `matching._request_card()` is the only pre-acceptance projection: anonymous `handle`, `gender` badge, task info, and target pin. No email/name/photo/room/live-location/reward fields exist on the projection. Cash rewards are negotiated privately after acceptance. |
| 4 | **Asymmetric gender filter (server-side exclusion)** | `geo.filter_candidates()` runs during broadcast: `female_only` keeps only female helpers — male users' `feed:{uid}` ZSETs never receive the item, so there is no WS event, no push, nothing to hide in the UI. Defense-in-depth: `POST /{id}/accept` re-checks (403), WS `view_request` re-checks gender before letting a male watch, and `/requests/late-match` re-checks too. |
| 5 | **Ephemeral chat + handshake PIN** | Accept = `SELECT … FOR UPDATE` row lock + status re-check (exactly one winner; losers get 409). PIN generated at accept, shown only to the requester (`GET /requests/{id}/pin`), verified by the helper (`POST …/verify-pin`, 5-attempt cap). Chat is participant-only (`join_chat` validates), rate-limited, auto-locked 30 min after completion (`chat.lock_expired_chats` in the janitor) and purged 24 h later (`purge_old_chats`). |
| 6 | **Rewards & UPI settlement** | `rewards.award_completion()` credits exactly 10 points, appends an immutable ledger row, updates the balance, emits `points_awarded`, and the leaderboard reads from Postgres. The requester's completion response carries `upi:{vpa, amount}` — the helper's VPA — and the UI builds a `upi://pay?pa=…&am=…&cu=INR` deep link (`lib/upi.ts`). No wallet, no custody: money moves bank-to-bank. |
| 7 | **Campus-only auth & auto-expiry** | `_domain_ok()` (exact or sub-domain of `ALLOWED_EMAIL_DOMAINS`) gates OTP + login; OTP hashed (SHA-256), single-use, 10-min TTL, rate-limited. Gender badge set at onboarding with a confirmation checkbox (`profile_complete` gate on every matching endpoint). Expiry: `help_requests.expires_at = created_at + 20 min`; janitor flips overdue open rows to `expired` every 20 s, removes them from every targeted feed and notifies the requester. |

## Extra hardening worth knowing

- Passwords: PBKDF2-SHA256, 120k iterations, per-user salt.
- JWTs: scope-separated (`access` vs 15-min `signup`), 30-day access tokens.
- OTP comparison: constant-time `secrets.compare_digest`; PIN attempts capped.
- Push is sent ONLY when the user has no live WebSocket (`ws:conn:{uid}` flag).
- Chat rate limit: 10 messages / 10 s per connection.
- CORS: localhost + private LAN ranges only.
- The handshake PIN is stored in the DB so the requester can re-view it; it is
  never included in any payload a helper receives.
