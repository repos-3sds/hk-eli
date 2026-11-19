"""Start the service from settings: `.venv/bin/python -m hkeli_poc`.

Binds HOST (default 127.0.0.1) and PORT (default 8050). Runs in the foreground of the terminal that
started it; stop it with Ctrl+C. No reloader, no background process.
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
    if cfg.host not in ("127.0.0.1", "localhost", "::1"):
        print(f"Refusing to bind {cfg.host}: this service listens on 127.0.0.1 only (the edge calls it locally).",
              file=sys.stderr)
        return 2
    import uvicorn
    print(f"HK ELI Chatbot on http://{cfg.host}:{cfg.port}  (Ctrl+C to stop)")
    uvicorn.run("hkeli_poc.app:app", host=cfg.host, port=cfg.port, log_level=cfg.log_level, access_log=False,
                server_header=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
