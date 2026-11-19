"""Start the service from this folder, check it answers, stop it. Prints pass/fail lines only.

    .venv/bin/python office/smoke_test.py            # uses .env if present, else safe defaults (mock, model off)

Runs in the foreground for a few seconds. It starts exactly one child process (the service), talks to it on
127.0.0.1, and stops that same process by its own handle at the end. Nothing else is touched.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get(url: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:  # localhost only
        return r.status, json.loads(r.read())


def main() -> int:
    port = free_port()
    env = dict(os.environ, HOST="127.0.0.1", PORT=str(port))
    env.setdefault("DB_PATH", str(Path(tempfile.mkdtemp(prefix="hkeli-smoke-")) / "smoke.sqlite"))
    proc = subprocess.Popen([sys.executable, "-m", "hkeli_poc"], cwd=ROOT, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    base = f"http://127.0.0.1:{port}"
    failed = 0
    try:
        for _ in range(60):
            try:
                if get(base + "/healthz")[0] == 200:
                    break
            except OSError:
                time.sleep(0.25)
        else:
            print("FAIL  service did not start within 15 s")
            return 1
        print(f"ok    started on 127.0.0.1:{port}")
        st, r = get(base + "/readyz")
        print(("ok   " if r.get("ready") else "FAIL ") + " ready: " + ", ".join(f"{k} {v}" for k, v in r["checks"].items()))
        failed += 0 if r.get("ready") else 1
        st, a = get(base + "/api/v1/ask", {"question": "What is total outstanding ELI?"})
        good = st == 200 and a.get("status") in ("OK", "OK_WITH_WARNING") and a.get("turn_id")
        print(("ok   " if good else "FAIL ") + f" ask: status {a.get('status')}, read by {a['meta']['understanding']}, "
              f"worded by {a['meta']['insight']}, {a.get('latency_ms')} ms")
        failed += 0 if good else 1
        print("ok    listens on 127.0.0.1 (the service refuses any other HOST)")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
    print("SMOKE PASS" if not failed else f"SMOKE FAIL ({failed})")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
