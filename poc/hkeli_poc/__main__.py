"""Start the service from settings: `.venv/bin/python -m hkeli_poc`.

Binds HOST (default 127.0.0.1) and PORT (default 8050). Runs in the foreground of the terminal that
started it; stop it with Ctrl+C. No reloader, no background process.

In a container (OpenShift UAT) the pod must listen on all interfaces so the Service can reach it.
Set ALLOW_PUBLIC_BIND=true together with HOST=0.0.0.0; the image does this. Without it, any address
other than loopback is refused, as before.
"""
from __future__ import annotations

import sys

from . import config


def main() -> int:
    config.load_env_file()
    try:
        cfg = config.get()
    except config.ConfigError as e:
        print(f"Setting problem: {e}. See .env.example.", file=sys.stderr)
        return 2
    public_ok = config.allow_public_bind()
    if cfg.host not in ("127.0.0.1", "localhost", "::1") and not public_ok:
        print(f"Refusing to bind {cfg.host}: this service listens on 127.0.0.1 only (the edge calls it locally).",
              file=sys.stderr)
        print("In a container set ALLOW_PUBLIC_BIND=true (the image does).", file=sys.stderr)
        return 2
    import uvicorn
    print(f"HK ELI Chatbot on http://{cfg.host}:{cfg.port}  (Ctrl+C to stop)")
    uvicorn.run("hkeli_poc.app:app", host=cfg.host, port=cfg.port, log_level=cfg.log_level, access_log=False,
                server_header=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
