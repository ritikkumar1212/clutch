# Phase 1 — Redis Key Design (Geo-Tracking, Live Viewers, Ephemeral Rooms)

Redis is the **only** place live GPS coordinates exist. Nothing here is ever
returned to clients as an individual position — matching results are reduced
to counts or request cards before they leave the server.

## 1. Geo presence (server-side only)

| Key | Type | Purpose | TTL |
|---|---|---|---|
| `geo:helpers` | GEO (ZSET, lon/lat/member=userId) | `GEOADD` on every heartbeat, `GEOSEARCH` for radius matching | — |
| `helper:expiry` | ZSET (score = expiry epoch-ms) | Per-user presence lease; heartbeat refreshes to `now + 90s`. Janitor removes stale members from both sets | — |
| `user:meta:{userId}` | HASH `{gender, handle, help_points}` | Hot cache so gender filtering never needs a DB round-trip during broadcast | — |

**Matching pipeline** (`services/geo.py`):

```
GEOSEARCH geo:helpers FROMLONLAT lng lat BYRADIUS r m ASC
  → filter: ZSCORE helper:expiry uid >= now      (alive only)
  → filter: uid != requester                     (self)
  → filter: gender rule                          (female_only → keep only female, via user:meta)
  → count (estimate endpoint) or fan-out (broadcast)
```

## 2. Targeted feed (rule 4 — server-side exclusion)

| Key | Type | Purpose | TTL |
|---|---|---|---|
| `feed:{userId}` | ZSET (score = request created epoch) | Requests matched *to this helper only*. A male user's feed simply never contains a "Female Helpers Only" item — exclusion happens before insertion | 30 min |
| `subs:{requestId}` | SET of userIds | Reverse index: who received this request, so lock/expire/cancel can `ZREM` from every feed + push `feed_removed` | 30 min |

## 3. Live viewer counter (rule 2)

| Key | Type | Purpose | TTL |
|---|---|---|---|
| `viewers:{requestId}` | SET of userIds | Distinct users currently viewing the card (`SADD` on open, `SREM` on leave). `SCARD` = the "X users are currently viewing your request" number | 15 min sliding |

Viewer count is published over the request room channel; the set stores user
IDs, so two tabs of the same user count once.

## 4. Pub/Sub rooms (real-time fan-out)

| Channel | Subscribers | Events |
|---|---|---|
| `ws:user:{userId}` | every connection of that user | `new_request`, `request_locked`, `points_awarded`, `chat_message` (offline peer), `request_completed`, `feed_removed` |
| `room:request:{requestId}` | requester + viewers of a request | `viewer_count`, `request_locked`, `request_expired`, `request_cancelled` |
| `room:chat:{requestId}` | the two participants in the chat page | `chat_message`, `chat_typing`, `chat_locked` |

Each WebSocket connection owns its own `PUBSUB` handle and subscribes to its
user channel plus any rooms it joins — no shared dispatcher, no missed
messages.

## 5. Presence & rate limiting

| Key | Type | Purpose | TTL |
|---|---|---|---|
| `ws:conn:{userId}` | STRING | Push-decision flag: web-push fires only when this key is **missing** (user has no live socket). Refreshed every ≤25 s by WS keepalive ping so crashed sockets self-heal | 90 s |
| `rate:otp:{email}` | counter | Max 5 OTP emails / 10 min | 10 min |

## 6. Request TTL semantics

- **DB is the source of truth**: `help_requests.expires_at = created_at + 20 min`.
- The janitor task (every 20 s) flips overdue `open` rows to `expired`,
  `ZREM`s them from every `feed:{uid}` (via `subs:{id}`), drops
  `viewers:{id}`, and notifies the requester + subscribers.
- Redis feed TTL (30 min) is just a safety net; correctness never depends on it.
