"""CampusRadar end-to-end test — runs the REAL stack on embedded Postgres+Redis.

Launches pgserver (embedded PostgreSQL) + redislite (embedded Redis), boots
uvicorn as a subprocess, then drives the complete product lifecycle:

  signup OTP → onboarding → heartbeat → radar estimate → request broadcast →
  live viewer counter → accept race → ephemeral chat → wrong PIN → correct PIN
  → Help Points → leaderboard → female-only exclusion → auto-expiry (rule 7)

Run:  python tests/e2e_test.py
"""
from __future__ import annotations

import asyncio
import json
import os
import pathlib
import signal
import subprocess
import sys
import time
import urllib.request
import uuid

import httpx

BASE = "http://127.0.0.1:8000/api/v1"
WS = "ws://127.0.0.1:8000/ws"
UIET = (30.7633, 76.7870)          # (lat, lng)
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))      # allow `from app...` imports when run as a script

PASS: list[str] = []
FAIL: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    (PASS if ok else FAIL).append(name)
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{(' — ' + extra) if extra else ''}")


def start_infra() -> tuple[str, object, object, object | None]:
    """Embedded Postgres (pgserver) + Redis.

    Prefers redislite; falls back to a system `redis-server` binary on port
    6399 if redislite is unavailable. Returns (db_url, pg, redis, cleanup).
    """
    import pgserver

    pg = pgserver.get_server(f"/tmp/cr-pgdata-{uuid.uuid4().hex[:8]}")
    pg_url = pg.get_uri()  # postgresql://postgres@/postgres?host=/tmp/socket-dir
    sock_dir = pg_url.split("host=")[-1]
    db_url = f"postgresql+asyncpg://postgres@/postgres?host={sock_dir}"

    rl = None
    sys_redis: subprocess.Popen | None = None
    try:
        import redislite  # type: ignore

        rl = redislite.Redis(serverconfig={"port": "6399"})
        for _ in range(50):
            try:
                rl.ping()
                break
            except Exception:
                time.sleep(0.1)
    except Exception:
        sys_redis = subprocess.Popen(
            ["redis-server", "--port", "6399", "--save", "", "--appendonly", "no"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        time.sleep(0.6)
    return db_url, pg, rl, sys_redis


async def apply_schema(db_url: str) -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.scripts.sql_loader import split_sql_statements

    sql = pathlib.Path(__file__).resolve().parents[2] / "docs" / "02-database-schema.sql"
    eng = create_async_engine(db_url)
    async with eng.begin() as conn:
        for stmt in split_sql_statements(sql.read_text()):
            await conn.execute(text(stmt))
    await eng.dispose()


def wait_health(timeout: float = 40) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen("http://127.0.0.1:8000/healthz", timeout=2) as r:
                if r.status == 200:
                    return
        except Exception:
            time.sleep(0.4)
    raise RuntimeError("backend did not become healthy (see /tmp/cr-uvicorn.log)")


async def main() -> None:
    db_url, pg, rl, sys_redis = start_infra()
    await apply_schema(db_url)

    env = {
        **os.environ,
        "DATABASE_URL": db_url,
        "REDIS_URL": "redis://127.0.0.1:6399/0",
        "OTP_DEV_ECHO": "true",
        "REQUEST_TTL_MINUTES": "1",     # fast expiry scenario
        "VAPID_PUBLIC_KEY": "",
        "VAPID_PRIVATE_KEY": "",
    }
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(ROOT), env=env,
        stdout=open("/tmp/cr-uvicorn.log", "w"), stderr=subprocess.STDOUT,
    )
    try:
        wait_health()
        await scenario()
    finally:
        proc.send_signal(signal.SIGINT)
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()
        try:
            pg.cleanup()
        except Exception:
            pass
        if rl:
            try:
                rl.close()
            except Exception:
                pass
        if sys_redis:
            sys_redis.terminate()

    print(f"\n===== {len(PASS)} passed, {len(FAIL)} failed =====")
    if FAIL:
        print("FAILED:", *FAIL, sep="\n  - ")
        sys.exit(1)


# ----------------------------------------------------------------- helpers ---
def rnd_phone(seq: int) -> str:
    return f"+9198{(int(uuid.uuid4().hex[:8], 16) % 9000000) + 1000000}{seq}"


async def signup(client: httpx.AsyncClient, seq: int, gender: str) -> dict:
    phone = rnd_phone(seq)
    r = await client.post(f"{BASE}/auth/request-otp", json={"phone": phone})
    code = r.json()["dev_code"]
    r2 = await client.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "code": code})
    tok = r2.json()["signup_token"]
    r3 = await client.post(f"{BASE}/auth/signup", json={"signup_token": tok, "password": "strongpass123"})
    data = r3.json()
    await client.post(f"{BASE}/users/onboarding", json={"gender": gender},
                      headers={"Authorization": f"Bearer {data['token']}"})
    return data


async def heartbeat(client: httpx.AsyncClient, token: str, lat: float, lng: float) -> None:
    await client.post(f"{BASE}/location/heartbeat", json={"lat": lat, "lng": lng},
                      headers={"Authorization": f"Bearer {token}"})


# ---------------------------------------------------------------- scenario ---
async def scenario() -> None:
    import websockets

    async with httpx.AsyncClient(timeout=20) as c:
        print("\n— phase A: auth & onboarding")
        r = await c.post(f"{BASE}/auth/request-otp", json={"phone": "12345"})
        check("invalid phone blocked", r.status_code == 422, f"got {r.status_code}")

        requester = await signup(c, 1, "female")
        helper = await signup(c, 2, "male")
        helper2 = await signup(c, 3, "male")
        check("signup returns token+user", bool(requester.get("token")) and bool(requester["user"]["handle"]))
        check("signup bonus granted (+5)", requester["user"]["help_points"] >= 5,
              str(requester["user"]["help_points"]))

        rq_tok = {"Authorization": f"Bearer {requester['token']}"}
        hp_tok = {"Authorization": f"Bearer {helper['token']}"}
        h2_tok = {"Authorization": f"Bearer {helper2['token']}"}

        print("\n— phase B: presence (university-wide broadcast)")
        await heartbeat(c, helper["token"], UIET[0] + 0.0005, UIET[1] + 0.0005)
        await heartbeat(c, helper2["token"], UIET[0] + 0.001, UIET[1] + 0.001)
        await heartbeat(c, requester["token"], UIET[0], UIET[1])

        print("\n— phase C: broadcast & feed")
        req_lat, req_lng = UIET[0] + 0.0003, UIET[1] + 0.0003

        ws_h = await websockets.connect(f"{WS}?token={helper['token']}")
        ws_rq = await websockets.connect(f"{WS}?token={requester['token']}")
        ws_h2 = await websockets.connect(f"{WS}?token={helper2['token']}")
        await asyncio.sleep(0.3)  # let subscriptions settle

        r = await c.post(f"{BASE}/requests", headers=rq_tok, json={
            "category": "medicine", "description": "Need paracetamol from the shop near Student Centre",
            "landmark": "Gate No. 2, Student Centre", "lat": req_lat, "lng": req_lng,
            "radius_m": 500, "urgency": "urgent", "gender_filter": "everyone", "tip_amount": 20,
        })
        created = r.json()
        check("request created (open, TTL set)", r.status_code == 200 and created["status"] == "open",
              f"broadcast: {created.get('viewers_hint')}")

        ev_h = json.loads(await asyncio.wait_for(ws_h.recv(), 5))
        ev_h2 = json.loads(await asyncio.wait_for(ws_h2.recv(), 5))
        check("both helpers got WS new_request (everyone filter)",
              ev_h["type"] == "new_request" and ev_h2["type"] == "new_request")

        card = ev_h["request"]
        check("pre-acceptance card is anonymous (rule 3)",
              card["requester"]["handle"] == requester["user"]["handle"]
              and "phone" not in card["requester"] and "email" not in card["requester"] and "name" not in card["requester"])

        feed = (await c.get(f"{BASE}/requests/feed", headers=hp_tok)).json()
        check("helper REST feed contains the request", any(x["id"] == created["id"] for x in feed))

        print("\n— phase D: female-only request never reaches males (rule 4)")
        r = await c.post(f"{BASE}/requests", headers=rq_tok, json={
            "category": "ride", "description": "Lift needed to the sector 11 market ASAP",
            "landmark": "UIET Block A", "lat": req_lat, "lng": req_lng,
            "radius_m": 2000, "urgency": "emergency", "gender_filter": "female_only", "tip_amount": 30,
        })
        foid = r.json()["id"]
        male_feed = (await c.get(f"{BASE}/requests/feed", headers=hp_tok)).json()
        check("male feed excludes female-only item", all(x["id"] != foid for x in male_feed))

        # male WS must NOT receive an event for it — flush with ping, inspect next frames
        await ws_h.send(json.dumps({"type": "ping"}))
        got_fo = False
        for _ in range(4):
            try:
                frame = json.loads(await asyncio.wait_for(ws_h.recv(), 5))
            except asyncio.TimeoutError:
                break
            if frame.get("type") == "new_request" and frame.get("request", {}).get("id") == foid:
                got_fo = True
                break
            if frame.get("type") == "pong":
                break
        check("male WS receives no female-only broadcast", not got_fo)

        # a female helper joining late must still get it via late-match
        fhelper = await signup(c, 4, "female")
        await heartbeat(c, fhelper["token"], req_lat - 0.0008, req_lng - 0.0008)
        r = await c.post(f"{BASE}/requests/late-match", headers={"Authorization": f"Bearer {fhelper['token']}"})
        check("late-match adds female helper to female-only feed", r.json()["added"] >= 1, str(r.json()))
        f_feed = (await c.get(f"{BASE}/requests/feed", headers={"Authorization": f"Bearer {fhelper['token']}"})).json()
        check("female helper feed contains female-only item", any(x["id"] == foid for x in f_feed))

        print("\n— phase E: live viewer counter (rule 2)")
        await ws_rq.send(json.dumps({"type": "view_request", "request_id": created["id"]}))  # owner tracks room
        await asyncio.sleep(0.3)
        await ws_h.send(json.dumps({"type": "view_request", "request_id": created["id"]}))   # helper views
        got_vc = False
        vc_val = None
        for _ in range(10):
            try:
                frame = json.loads(await asyncio.wait_for(ws_rq.recv(), 5))
            except asyncio.TimeoutError:
                break
            if frame.get("type") == "viewer_count" and frame.get("request_id") == created["id"]:
                vc_val = frame.get("count")
                if vc_val >= 1:
                    got_vc = True
                    break
                # count=0 snapshots can precede the increment — keep reading
        check("requester receives live viewer_count >= 1", got_vc, f"count={vc_val}")

        print("\n— phase F: accept race & lock (rule 5)")
        a1 = asyncio.create_task(c.post(f"{BASE}/requests/{created['id']}/accept", headers=hp_tok))
        a2 = asyncio.create_task(c.post(f"{BASE}/requests/{created['id']}/accept", headers=h2_tok))
        r1, r2 = await asyncio.gather(a1, a2)
        winners = [r for r in (r1, r2) if r.status_code == 200]
        losers = [r for r in (r1, r2) if r.status_code != 200]
        check("exactly one helper wins the accept race", len(winners) == 1 and len(losers) == 1,
              f"codes: {r1.status_code}/{r2.status_code}")
        check("loser gets 409", bool(losers) and losers[0].status_code == 409)

        locked_ev = None
        for _ in range(10):
            try:
                frame = json.loads(await asyncio.wait_for(ws_rq.recv(), 5))
            except asyncio.TimeoutError:
                break
            if frame.get("type") == "request_locked":
                locked_ev = frame
                break
        check("requester notified request_locked (anonymous helper card)",
              bool(locked_ev) and locked_ev["helper"]["handle"] == helper["user"]["handle"])

        print("\n— phase G: ephemeral chat + PIN handshake (rules 5-6)")
        await ws_h.send(json.dumps({"type": "join_chat", "request_id": created["id"]}))
        await ws_rq.send(json.dumps({"type": "join_chat", "request_id": created["id"]}))
        await asyncio.sleep(0.3)

        await c.post(f"{BASE}/chat/{created['id']}/messages", headers=hp_tok,
                     json={"body": "On my way", "kind": "quick"})
        chat_ev = None
        for _ in range(10):
            try:
                frame = json.loads(await asyncio.wait_for(ws_rq.recv(), 5))
            except asyncio.TimeoutError:
                break
            if frame.get("type") == "chat_message":
                chat_ev = frame
                break
        check("quick-reply message delivered live to requester",
              bool(chat_ev) and chat_ev["message"]["body"] == "On my way")

        hist = (await c.get(f"{BASE}/chat/{created['id']}", headers=rq_tok)).json()
        check("chat history has system + helper messages",
              hist["role"] == "requester" and len(hist["messages"]) >= 2)

        pin = (await c.get(f"{BASE}/requests/{created['id']}/pin", headers=rq_tok)).json()["pin"]
        check("requester has 4-digit handshake PIN", len(pin) == 4 and pin.isdigit(), pin)

        wrong = "0000" if pin != "0000" else "9999"
        r = await c.post(f"{BASE}/requests/{created['id']}/verify-pin", headers=hp_tok, json={"pin": wrong})
        check("wrong PIN rejected", r.status_code == 400, f"{r.status_code}")

        r = await c.post(f"{BASE}/requests/{created['id']}/verify-pin", headers=hp_tok, json={"pin": pin})
        body = r.json()
        check("correct PIN completes + awards 15 pts (10 base + 5 urgent)",
              r.status_code == 200 and body.get("points_awarded") == 15,
              f"awarded={body.get('points_awarded')}")

        r = await c.post(f"{BASE}/requests/{created['id']}/verify-pin", headers=h2_tok, json={"pin": pin})
        check("non-helper cannot verify", r.status_code in (403, 404, 409))

        me = (await c.get(f"{BASE}/users/me", headers=hp_tok)).json()
        check("helper balance = signup 5 + 15", me["help_points"] == 20, str(me["help_points"]))

        lb = (await c.get(f"{BASE}/users/leaderboard", headers=rq_tok)).json()
        check("leaderboard is anonymous", bool(lb) and "phone" not in lb[0] and "email" not in lb[0] and bool(lb[0]["handle"]))

        ledger = (await c.get(f"{BASE}/users/me/ledger", headers=hp_tok)).json()
        check("ledger records completion (+15)", any(x["points"] == 15 for x in ledger))

        print("\n— phase H: chat lock & auto-expiry (rules 5+7)")
        r = await c.post(f"{BASE}/requests", headers=rq_tok, json={
            "category": "printout", "description": "Print 10 pages of DBMS notes, spiral bound",
            "landmark": "Library", "lat": req_lat, "lng": req_lng,
            "radius_m": 200, "urgency": "normal", "gender_filter": "everyone", "tip_amount": 10,
        })
        exp_id = r.json()["id"]
        check("open request created for expiry test", r.status_code == 200)
        print("  … waiting ~80s for janitor (REQUEST_TTL_MINUTES=1 in test env)")
        await asyncio.sleep(80)
        mine = (await c.get(f"{BASE}/requests/mine", headers=rq_tok)).json()
        statuses = {x["id"]: x["status"] for x in mine["created"]}
        check("unaccepted request auto-expired (rule 7)",
              statuses.get(exp_id) == "expired", statuses.get(exp_id, "missing"))

        for sock in (ws_h, ws_h2, ws_rq):
            await sock.close()

    await asyncio.sleep(0.1)


if __name__ == "__main__":
    asyncio.run(main())
