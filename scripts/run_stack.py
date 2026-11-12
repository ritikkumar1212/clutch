"""Start the CampusRadar demo stack (embedded Postgres + Redis + uvicorn) and block.

Intended to be launched under setsid from browser_e2e.sh; killing the process
group tears down everything (SIGTERM handler stops uvicorn + redis).
"""
from __future__ import annotations

import os
import pathlib
import signal
import subprocess
import sys
import time
import urllib.request

BACKEND = pathlib.Path("/home/z/my-project/campusradar/backend")
sys.path.insert(0, str(BACKEND))

RUNNING: list[subprocess.Popen] = []


def shutdown(*_: object) -> None:
    for proc in RUNNING:
        try:
            proc.terminate()
        except Exception:
            pass
    sys.exit(0)


signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)


def wait_http(url: str, timeout: float, ok: bool = True) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if (r.status == 200) == ok:
                    return
        except Exception:
            pass
        time.sleep(0.4)
    raise RuntimeError(f"timeout waiting for {url}")


def main() -> None:
    import pgserver

    pg = pgserver.get_server("/tmp/cr-demo-pg")
    sock = pg.get_uri().split("host=")[-1]
    db_url = f"postgresql+asyncpg://postgres@/postgres?host={sock}"

    redis = subprocess.Popen(
        ["redis-server", "--port", "6399", "--save", "", "--appendonly", "no"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    RUNNING.append(redis)
    time.sleep(0.8)

    env = {
        **os.environ,
        "DATABASE_URL": db_url,
        "REDIS_URL": "redis://127.0.0.1:6399/0",
        "OTP_DEV_ECHO": "true",
        "PYTHONUNBUFFERED": "1",
    }

    # schema (idempotent) + demo users with presence leases
    subprocess.run([sys.executable, "-m", "app.scripts.init_db"], cwd=BACKEND, env=env, check=True)
    subprocess.run([sys.executable, "-m", "app.scripts.seed"], cwd=BACKEND, env=env, check=True)

    uvicorn = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=BACKEND, env=env,
        stdout=open("/tmp/cr-uvicorn-demo.log", "w"), stderr=subprocess.STDOUT,
    )
    RUNNING.append(uvicorn)
    wait_http("http://127.0.0.1:8000/healthz", 45)
    print("stack ready: postgres(socket) + redis:6399 + api:8000", flush=True)

    while True:
        time.sleep(3600)


if __name__ == "__main__":
    main()
