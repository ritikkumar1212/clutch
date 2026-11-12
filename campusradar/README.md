# CampusRadar — UIET Chandigarh Help Network

A hyper-local, peer-to-peer **campus help network PWA**. Students drop a
target pin on a map, pick a radius, and broadcast urgent help requests
(rides, medicine runs, printouts, chargers, study help, errands). Nearby
online students get matched in real time, accept, coordinate in an ephemeral
chat, verify the meet-up with a 4-digit **Handshake PIN**, and earn
**Help Points** (+ optional UPI tips).

Built **privacy-first**: no individual user ever appears on any map.

---

## Table of contents

1. [Feature tour](#feature-tour)
2. [The privacy model](#the-privacy-model)
3. [Tech stack](#tech-stack)
4. [Phase 1 — architecture, folder structure, database & Redis schema](#phase-1--architecture-folder-structure-database--redis-schema)
5. [Phase 2 — backend API & WebSocket engine](#phase-2--backend-api--websocket-engine)
6. [Phase 3 — mobile-first PWA frontend](#phase-3--mobile-first-pwa-frontend)
7. [Phase 4 — run it (Docker or manual)](#phase-4--run-it)
8. [Testing the full loop in 5 minutes](#testing-the-full-loop-in-5-minutes)
9. [Automated end-to-end test](#automated-end-to-end-test)
10. [Web push & PWA install](#web-push--pwa-install)
11. [Production checklist](#production-checklist)

---

## Feature tour

| Screen | What it does |
|---|---|
| **Campus Radar** (`/radar`) | Leaflet map (dark CARTO tiles over OSM data). Tap to drop the **target pin**, drag to fine-tune, switch radius chips **200 m / 500 m / 1 km / 2 km** — a translucent circle follows. A live aggregate readout shows *"N matching helpers online in this zone"* (never who or where). Category picker, urgency (+bonus preview), optional ₹ tip, and — for female users — the **"Female helpers only"** toggle. |
| **Feed** (`/feed`) | Only requests the server *targeted to you* (geo + gender filter). Accept with one tap; taken requests vanish live via WS. |
| **Tasks** (`/requests`) | Your posted requests with the **live viewer counter** ("X users are currently viewing your request"), the Handshake PIN reveal, and everything you're helping with. |
| **Chat** (`/chat/[id]`) | Ephemeral two-person room: quick-reply chips ("On my way", "Reached the gate", "5 mins away"…), the requester's PIN reveal, the helper's 4-box PIN entry, completion → points → one-tap **Pay via UPI**. Auto-locks 30 min after completion. |
| **Help Points** (`/rewards`) | Balance, ledger history, anonymous campus leaderboard. |
| **Profile** (`/profile`) | UPI ID for receiving tips, PWA install button, push opt-in, privacy explainer. |

## The privacy model

| Rule | How it's enforced |
|---|---|
| **1. Zero individual user pins** | GPS exists only in Redis (`GEOADD geo:helpers`, 90 s lease). No endpoint or WS event returns another person's coordinates — matching results are reduced to counts and anonymous cards. The map renders only *your own* target pin. |
| **2. Aggregate reach + live viewers** | `POST /requests/estimate` returns a number, not users. `viewers:{id}` SET drives the live "X users are currently viewing" counter (distinct users, two tabs count once). |
| **3. Pre-acceptance anonymity** | Cards carry anonymous `handle` + verified gender badge + task + target pin + tip. Real names/photos are never collected; UPI VPA is exposed only *after* completion, only to the payer. |
| **4. Asymmetric gender filter** | `female_only` requests are filtered **on the server during broadcast** — male users never receive the WS event, push, or feed item (there is no client-side hiding). Re-checked again at accept (403) and at WS view. |
| **5. Ephemeral chat + handshake PIN** | Accept is an atomic row lock (one winner, losers 409). PIN shown only to the requester; helper enters it to complete. Chat locks 30 min after completion, purges 24 h later. |
| **6. Rewards & UPI** | +10 base + urgency bonus (urgent +5 / emergency +10) into an append-only ledger; leaderboard updates. Tip settlement is a `upi://pay?pa=…&am=…&cu=INR` deep link — no wallet, money moves bank-to-bank. |
| **7. Campus-only auth + auto-expiry** | OTP-verified `@pu.ac.in` / `@uiet.ac.in` (sub-domains allowed), gender badge at onboarding, and unaccepted requests **expire after 20 minutes** (janitor task). |

Full rule→code mapping: [`docs/05-privacy-enforcement.md`](docs/05-privacy-enforcement.md).

## Tech stack

- **Frontend**: Next.js (App Router) + React 19 + TypeScript + Tailwind CSS 4, Leaflet + OpenStreetMap/CARTO tiles, PWA manifest + service worker (Web Push via VAPID), strictly mobile-first.
- **Backend**: FastAPI (Python 3.12) with WebSockets, Pydantic v2, SQLAlchemy 2 async + asyncpg.
- **Data**: PostgreSQL (users, OTPs, requests, ledger, chat messages, push subscriptions) + Redis (GEOADD/GEOSEARCH geo matching, targeted feeds, live viewer sets, pub/sub rooms, presence flags).

---

## Phase 1 — architecture, folder structure, database & Redis schema

- [`docs/01-architecture.md`](docs/01-architecture.md) — system diagram, folder map, request state machine, event flow.
- [`docs/02-database-schema.sql`](docs/02-database-schema.sql) — canonical PostgreSQL schema (enums `gender_enum`, `request_status`, `urgency_enum`, `ledger_reason`; tables `users`, `email_otps`, `push_subscriptions`, `help_requests`, `help_points_ledger`, `chat_messages`). **Note: there is intentionally no table for live user coordinates.**
- [`docs/03-redis-design.md`](docs/03-redis-design.md) — every key, TTL and the matching pipeline:
  - `geo:helpers` (GEO) + `helper:expiry` (ZSET lease) + `user:meta:{uid}` (gender cache)
  - `feed:{uid}` (targeted feed ZSET) + `subs:{id}` (reverse index for lock/expire fan-out)
  - `viewers:{id}` (live viewer SET) · `room:request:{id}` / `room:chat:{id}` (pub/sub) · `ws:conn:{uid}` (push-decision flag) · `rate:otp:{email}`

## Phase 2 — backend API & WebSocket engine

FastAPI app in `backend/app/`: auth (OTP + JWT), location heartbeat, radius geo-query with server-side gender filtering, live viewer tracking, full request lifecycle (create → atomic accept → PIN verify → complete/cancel/expire), ephemeral chat, rewards/ledger/leaderboard, web-push, and the WebSocket engine (`ws/manager.py`: per-connection Redis pubsub + single-writer outbox queue).

Full REST + WS protocol: [`docs/04-api-ws-reference.md`](docs/04-api-ws-reference.md). Interactive OpenAPI at `http://localhost:8000/docs`.

## Phase 3 — mobile-first PWA frontend

Next.js App Router app in `frontend/src/`: Campus Radar with pin/radius selector + aggregate count, targeted feed with accept flow, live viewer counter, ephemeral chat + PIN verification, UPI tip + Help Points screens. Real-time via a reconnecting WS singleton with room replay (`lib/ws.ts`); GPS heartbeat every 25 s (`hooks/useHeartbeat.ts`).

## Phase 4 — run it

### Option A — Docker (recommended)

```bash
cd campusradar
docker compose up --build
```

- PWA → **http://localhost:3000** (Chrome/Android: *Install app*; iOS 16.4+: *Add to Home Screen* from Safari share sheet)
- API docs → http://localhost:8000/docs
- Postgres `localhost:5432` (campus/campus) — schema auto-applied on first boot
- Redis `localhost:6379`

Phone on the same Wi-Fi: rebuild `web` with your LAN IP so the phone can reach the API:

```bash
NEXT_PUBLIC_API_BASE=http://192.168.1.24:8000/api/v1 \
NEXT_PUBLIC_WS_BASE=ws://192.168.1.24:8000/ws \
docker compose up --build web
```

### Option B — manual (dev-friendly)

```bash
# 1. Infra (or use the compose services: docker compose up db redis)
#    Postgres on 5432 (campus/campus/campus) + Redis on 6379

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python -m app.scripts.init_db                        # apply docs/02-database-schema.sql
python -m app.scripts.seed                           # 10 demo users around UIET (password: campus123)
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend
npm install
cp .env.local.example .env.local                     # point at the backend (LAN IP for phones)
npm run dev                                          # http://localhost:3000
```

> Demo accounts after seeding: `aarav.sharma@pu.ac.in`, `isha.kaur@uiet.ac.in`, … (password `campus123`), all profile-complete, all with live presence leases near the UIET centre for ~30 min — so the radar estimator shows realistic counts immediately.

## Testing the full loop in 5 minutes

1. Open **two browsers** (or a browser + an incognito window). Sign up both with campus emails — dev mode shows the OTP code right on the signup screen (`OTP_DEV_ECHO=true`).
2. On both, complete onboarding (pick gender; helper adds a UPI ID).
3. **Helper**: allow location permission, stay on the Feed.
4. **Requester**: Radar → tap the map near your helper → pick a radius → watch the *"N matching helpers online in this zone"* readout → pick Medicine, Urgent, ₹20 tip → **Broadcast request**.
5. Helper: the card drops into the feed instantly (WS `new_request`) + a web-push if the tab is closed. **Accept & help** → ephemeral chat opens.
6. Requester: Tasks screen shows *"1 user is currently viewing your request"* turning into the locked state; reveal the **Handshake PIN**.
7. Chat both ways (quick-reply chips), then helper enters the PIN → **+15 Help Points** (+10 base +5 urgent), ledger row, leaderboard updates.
8. Requester sees the one-tap **Pay ₹20 via UPI** button (`upi://pay?pa=helper@upi&am=20.00&cu=INR`).
9. Post another request and don't accept it — the janitor flips it to **expired** after 20 minutes and removes it from every feed.

## Automated end-to-end test

`backend/tests/e2e_test.py` boots a **real** stack (embedded Postgres via
`pgserver` + embedded/system Redis) and drives the whole lifecycle — campus
email gating, OTP signup, onboarding, heartbeat, radar estimates, broadcast
fan-out, female-only exclusion, live viewer counter, concurrent accept race,
chat, wrong/correct PIN, points, leaderboard, ledger, chat lock and
auto-expiry:

```bash
cd backend
pip install -r requirements.txt httpx websockets pgserver   # redislite optional
python tests/e2e_test.py
```

## Web push & PWA install

1. Generate VAPID keys once:
   ```bash
   cd backend && python -m app.scripts.gen_vapid
   ```
   Paste the three printed lines into `backend/.env` (or the compose env) and restart.
2. In the PWA: Profile → **Enable help-request notifications** (permission + subscription saved server-side).
3. Push fires **only** when the user has no live WebSocket — in-app users see events instantly instead. Dead subscriptions (404/410) are pruned automatically.
4. Install: Chrome shows an *Install app* button in Profile (`beforeinstallprompt`); iOS: Share → *Add to Home Screen* (push needs iOS ≥ 16.4 installed to the home screen).

## Production checklist

- [ ] Set a real `JWT_SECRET`; disable `OTP_DEV_ECHO`; wire SMTP for OTP delivery.
- [ ] Gender self-attestation → admin/student-ID verification queue (flip `gender_verified` server-side; see note in `routers/users.py`).
- [ ] Move the handshake PIN to a hashed column if you don't need requester re-view.
- [ ] Run `redis-server` with AOF if you want feeds to survive restarts (they're ephemeral by design — correctness lives in Postgres).
- [ ] TLS everywhere (PWA + geolocation + service worker require secure origins). Terminate WSS at your reverse proxy.
- [ ] Rate-limit `/auth/*` at the edge; consider per-IP limits on `request-otp`.
- [ ] Scale-out: the WS layer already fans out via Redis pub/sub — multiple `uvicorn` workers/instances need sticky WS sessions (or a single WS node) at campus scale.
