"""The HTTP surface: the chat page and a small JSON + Server-Sent Events API. Standard library only.

    GET  /                 the chat page (web/index.html)
    GET  /assets/<file>    page assets (web/)
    GET  /api/health       provider, model, data date, skills status
    GET  /api/config       personas, suggested questions, model choices
    POST /api/chat         {question, persona, provider?, history?} -> text/event-stream of agent events

Run: `python -m eli_chat.server` from chatbot/ (see README). Binds to 127.0.0.1 by default:
internal users only, no auth yet (README, gaps).
"""
from __future__ import annotations

import json
import logging
import mimetypes
import sys
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from . import agent, book, prompts, providers, settings, skills, tools

log = logging.getLogger("eli_chat")
MAX_BODY = 64 * 1024


def health() -> dict[str, Any]:
    ok, msg = skills.available()
    try:
        default = providers.build()
        prov = {"provider": default.name, "model": default.model, "written_by": default.written_by}
    except Exception as exc:  # noqa: BLE001
        prov = {"provider": None, "model": None, "error": str(exc)}
    data: dict[str, Any] = {"name": settings.APP_NAME, "note": settings.APP_NOTE, "skills": {"ok": ok, "detail": msg},
                            "tools": len(tools.TOOLS), **prov}
    try:
        data.update(freshness=book.freshness(), today=book.today())
    except Exception as exc:  # noqa: BLE001
        data.update(freshness=None, data_error=str(exc))
    data["ok"] = ok and data.get("freshness") is not None
    return data


def config() -> dict[str, Any]:
    return {
        "name": settings.APP_NAME, "note": settings.APP_NOTE,
        "personas": [{"id": k, "label": v["label"]} for k, v in prompts.PERSONAS.items()],
        "suggestions": prompts.SUGGESTIONS,
        "providers": providers.choices(),
        "default_provider": providers.build().name,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "HKELIChatbot/0.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        log.info("%s %s", self.address_string(), fmt % args)

    # -- helpers -----------------------------------------------------------------------------
    def _send(self, status: int, body: bytes, ctype: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, data: Any) -> None:
        self._send(status, json.dumps(data, default=str).encode(), "application/json; charset=utf-8")

    def _static(self, rel: str) -> None:
        path = (settings.WEB_DIR / rel).resolve()
        if settings.WEB_DIR.resolve() not in path.parents or not path.is_file():
            self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript",):
            ctype += "; charset=utf-8"
        self._send(HTTPStatus.OK, path.read_bytes(), ctype)

    # -- routes ------------------------------------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802
        route = self.path.split("?", 1)[0]
        if route in ("/", "/index.html"):
            self._static("index.html")
        elif route.startswith("/assets/"):
            self._static(route[len("/assets/"):])
        elif route == "/api/health":
            self._json(HTTPStatus.OK, health())
        elif route == "/api/config":
            self._json(HTTPStatus.OK, config())
        else:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/api/chat":
            self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._json(HTTPStatus.BAD_REQUEST, {"error": "Send a JSON body under 64 KB."})
            return
        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            self._json(HTTPStatus.BAD_REQUEST, {"error": "Body is not valid JSON."})
            return
        question = str(body.get("question", "")).strip()
        if not question or len(question) > 2000:
            self._json(HTTPStatus.BAD_REQUEST, {"error": "Ask a question of 1 to 2,000 characters."})
            return
        persona = body.get("persona") if body.get("persona") in prompts.PERSONAS else "wms"
        wanted = body.get("provider")
        try:
            provider = providers.build(wanted if wanted in {"gemini", "stork", "ollama", "offline"} else None)
        except Exception as exc:  # noqa: BLE001
            self._json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(exc)})
            return
        history = body.get("history") if isinstance(body.get("history"), list) else []

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "close")
        self.end_headers()
        t0 = time.monotonic()
        last = ""
        try:
            for event in agent.run_turn(question, provider, persona, history):
                last = event["type"]
                self.wfile.write(f"event: {event['type']}\ndata: {json.dumps(event, default=str)}\n\n".encode())
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            log.info("client left mid-answer")
            return
        log.info("chat persona=%s provider=%s last=%s ms=%d", persona, provider.name, last,
                 int((time.monotonic() - t0) * 1000))
        self.close_connection = True


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout)
    h = health()
    if not h.get("ok"):
        log.warning("starting with problems: skills=%s data=%s", h["skills"], h.get("data_error"))
    httpd = ThreadingHTTPServer((settings.HOST, settings.PORT), Handler)
    httpd.daemon_threads = True
    log.info("%s on http://%s:%d  provider=%s model=%s  data as of %s", settings.APP_NAME, settings.HOST,
             settings.PORT, h.get("provider"), h.get("model"), (h.get("freshness") or {}).get("as_of"))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
