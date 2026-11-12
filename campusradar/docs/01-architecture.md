# Phase 1 — System Architecture & Folder Structure

```
┌──────────────────────────────┐         ┌───────────────────────────────┐
│  Next.js PWA (mobile-first)  │  HTTPS  │        FastAPI backend        │
│  Leaflet target-pin picker   │────────▶│  REST  /api/v1/*              │
│  live WS client + reconnect  │  WSS /ws│  WS    /ws?token=JWT          │
│  Web Push (VAPID) via sw.js  │◀────────│  janitor background task      │
└──────────────┬───────────────┘         └───────┬───────────────┬───────┘
               │  only ever:                     │               │
               │  · request cards (no user GPS)  │               │
               │  · aggregate counts             │               │
               │  · your own session             │               │
               ▼                                 ▼               ▼
        ┌─────────────┐                  ┌────────────┐  ┌────────────┐
        │ PostgreSQL  │                  │   Redis    │  │ Web-Push   │
        │ users, OTPs │                  │ geo:helpers│  │ (VAPID) to │
        │ requests,   │                  │ feed:{uid} │  │ offline    │
        │ ledger,     │                  │ viewers:{id│  │ helpers    │
        │ chat_msgs,  │                  │ room:*     │  └────────────┘
        │ push_subs   │                  │ ws:conn:*  │
        └─────────────┘                  └────────────┘
                                          ▲ ALL live GPS lives HERE,
                                            server-side, short leases
```

## The one privacy invariant (rule 1)

**Postgres never stores live coordinates; the browser never receives another
person's coordinates.** The only coordinates in the system are:

1. A helper's own GPS → sent by their own device every ≤25 s → `GEOADD
   geo:helpers` in Redis with a 90 s lease (`helper:expiry` ZSET).
2. A requester's chosen **target pin** (where help is needed) → stored on the
   request row and shown to matched helpers by design.

Matching output is always reduced to *counts* (`/requests/estimate`) or
*request cards* (anonymous handle + badge + target pin) before it leaves the
server. There is no endpoint, event or payload that returns user positions.

## Folder structure

```
campusradar/
├── docker-compose.yml           # Postgres + Redis + API + PWA
├── docs/
│   ├── 01-architecture.md       # this file
│   ├── 02-database-schema.sql   # Phase 1 SQL (also mounted into Postgres initdb)
│   ├── 03-redis-design.md       # Phase 1 Redis keys, TTLs, matching pipeline
│   ├── 04-api-ws-reference.md   # Phase 2 REST + WebSocket protocol
│   └── 05-privacy-enforcement.md# rule-by-rule code map
├── backend/                     # FastAPI (Python 3.12)
│   ├── app/
│   │   ├── main.py              # app + lifespan (janitor) + CORS
│   │   ├── config.py            # env-driven settings
│   │   ├── database.py          # async SQLAlchemy engine
│   │   ├── redis_client.py      # shared aioredis client + publish()
│   │   ├── models.py            # ORM (mirror of 02-database-schema.sql)
│   │   ├── schemas.py           # Pydantic v2 DTOs + validation
│   │   ├── security.py          # PBKDF2, JWT (access/signup scopes), OTP, PIN
│   │   ├── deps.py              # bearer auth, WS token auth, onboarding gate
│   │   ├── handles.py           # anonymous handle generator
│   │   ├── routers/             # auth, users, location, requests, chat, config
│   │   ├── services/            # geo, matching, requests, chat, rewards, push, janitor
│   │   ├── ws/                  # manager.py (per-conn pubsub + outbox), router.py
│   │   └── scripts/             # init_db, seed, gen_vapid, sql_loader
│   ├── tests/e2e_test.py        # real-stack end-to-end scenario
│   └── requirements.txt
└── frontend/                    # Next.js App Router PWA (TypeScript + Tailwind 4)
    ├── public/                  # manifest.json, sw.js, icons/
    ├── src/app/                 # login, signup, onboarding, (app)/{radar,feed,requests,chat,rewards,profile}
    ├── src/components/          # MapPicker, RequestCard, ViewerCounter, PinInput, BottomNav, Badges, PwaSetup
    ├── src/hooks/               # useHeartbeat (rule 1 sender), useGeolocation
    ├── src/lib/                 # api, ws, types, push, upi, geo, categories
    └── Dockerfile
```

## Request lifecycle (state machine)

```
            broadcast: GEOSEARCH radius → filter rule 4 → WS + push to matches
                       ┌──────────────┐
   create (radar) ────▶│    open      │── 20 min without accept ──▶ expired
                       └──┬───────┬───┘        (janitor, rule 7)
             accept       │       │ cancel
        (atomic row lock) │       └────────────▶ cancelled
                          ▼
                     accepted ── chat room opens, PIN shown to requester
                          │  helper enters 4-digit PIN at the meet-up
                          ▼
                     completed ── +10 pts + urgency bonus, ledger row,
                          │       UPI tip deep link to requester
                          │       30 min later: chat auto-locks (rule 5)
                          └──────▶ (24 h later: messages purged)
```

## Real-time event flow

- Every WS connection owns a Redis PUBSUB subscribed to `ws:user:{uid}` and
  any rooms it joins (`room:request:{id}`, `room:chat:{id}`).
- HTTP endpoints never touch sockets directly — they publish JSON events to
  those channels; the per-connection outbox queue serialises delivery.
- Web-Push is fired only when the user has **no** live socket
  (`ws:conn:{uid}` flag, TTL-refreshed by keepalives).
