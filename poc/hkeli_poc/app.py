"""HK ELI Chatbot service: Stork pipeline + mock or real Tableau + demo pages.

Run (office):  .venv/bin/python -m hkeli_poc        (reads .env settings from the environment; binds 127.0.0.1)
Run (dev):     .venv/bin/python -m uvicorn hkeli_poc.app:app --host 127.0.0.1 --port 8050

Where it sits: behind the Java 21 / Spring Boot edge (locked decision). The edge does SSO, rate limits
and the public API, and calls this service on localhost with X-Edge-Token (shared secret) and
X-Eli-User (the signed-in user). With TRUST_EDGE_HEADERS=false (laptop demo) every call runs as
DEFAULT_USER, or as TABLEAU_USER in real-Tableau mode.

API (v1, JSON):
  POST /api/v1/ask        {question, site?, scenario?, conversation_id?} -> answer + turn_id
  POST /api/v1/feedback   {turn_id, rating: 1|-1, comment?}
  GET  /api/v1/history    ?conversation_id=&limit=
  GET  /api/v1/config     non-secret settings the UI needs
  GET  /api/embed/config, /api/embed/token   (real Tableau only)
  GET  /healthz (alive)   GET /readyz (store, knowledge base, prompts, Tableau settings)
`POST /api/ask` stays as an alias of /api/v1/ask for the existing pages.
"""
from __future__ import annotations

import hmac
import json
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, demos
from . import knowledge as KB
from . import llm as LLM
from . import prompts as PR
from . import tableau_real as TR
from .db import Store
from .mock_tableau import InProcessMock
from .mock_tableau import router as tableau_router
from .stork.pipeline import answer
from .workbook import SITES, public_catalog

STATIC = Path(__file__).parent / "static"
VERSION = "0.2.0"
log = logging.getLogger("hkeli")
USER_RE = re.compile(r"^[A-Za-z0-9._@\-]{1,128}$")
REQ_RE = re.compile(r"^[A-Za-z0-9\-]{8,64}$")


class State:
    store: Store | None = None
    http = None
    llm = None
    kb: KB.Knowledge | None = None
    lib: dict | None = None


S = State()


def _log_setup(level: str) -> None:
    class JsonFmt(logging.Formatter):
        def format(self, r):
            d = {"ts": self.formatTime(r, "%Y-%m-%dT%H:%M:%S"), "level": r.levelname, "logger": r.name, "msg": r.getMessage()}
            d.update(getattr(r, "extra", {}) or {})
            return json.dumps(d)

    h = logging.StreamHandler()
    h.setFormatter(JsonFmt())
    log.handlers[:] = [h]
    log.setLevel(level.upper())
    log.propagate = False


def startup() -> None:
    cfg = config.get()
    _log_setup(cfg.log_level)
    S.kb = KB.load(str(cfg.knowledge_dir))
    S.lib = PR.library(str(cfg.prompts_dir))
    S.store = Store(cfg.db_path)
    S.llm = LLM.client(cfg.llm)
    S.http = None
    log.info("started", extra={"extra": {"version": VERSION, "tableau": cfg.tableau_mode, "embed": cfg.tableau_embed,
                                         "llm": cfg.llm.mode, "db_schema": S.store.version()}})


@asynccontextmanager
async def lifespan(_app):
    startup()
    yield
    if S.store:
        S.store.close()


app = FastAPI(title="HK ELI Chatbot", version=VERSION, docs_url="/api/docs", redoc_url=None, lifespan=lifespan)
app.include_router(tableau_router)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


def ensure_started() -> None:
    if S.store is None:
        startup()


def tableau_http():
    """HTTP session to Tableau. Default: the in-process mock (same REST shape, no network)."""
    if S.http is None:
        real = TR.settings()
        if real:
            S.http = TR.RealTableauHTTP(real)
        else:
            S.http = InProcessMock()
    return S.http


# ---------------------------------------------------------------- middleware
@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = request.headers.get("X-Request-Id", "")
    rid = rid if REQ_RE.match(rid) else uuid.uuid4().hex
    request.state.request_id = rid
    t0 = time.perf_counter()
    try:
        resp = await call_next(request)
    except Exception:  # never leak a stack trace to the caller
        log.exception("unhandled", extra={"extra": {"request_id": rid, "path": request.url.path}})
        resp = JSONResponse({"status": "SYSTEM_ERROR", "error": "Something went wrong on our side.", "request_id": rid},
                            status_code=500)
    resp.headers["X-Request-Id"] = rid
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers.setdefault("Content-Security-Policy", _csp(request.url.path))
    if request.url.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    log.info("request", extra={"extra": {"request_id": rid, "method": request.method, "path": request.url.path,
                                         "status": resp.status_code, "ms": round((time.perf_counter() - t0) * 1000)}})
    return resp


def _csp(path: str) -> str:
    """Nothing loads from the internet. Real-Tableau embed may load the office Tableau server only."""
    ts = TR.settings() if config.get().tableau_mode == "real" else None
    extra = f" {ts.server}" if ts and config.get().tableau_embed == "embed" else ""
    if path.startswith("/api/docs"):
        return "default-src 'self'; frame-ancestors 'none'"
    return ("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
            f"script-src 'self' 'unsafe-inline'{extra}; frame-src 'self'{extra}; connect-src 'self'{extra}; "
            "frame-ancestors 'self'")


def current_user(request: Request) -> str:
    cfg = config.get()
    if cfg.trust_edge_headers:
        tok = request.headers.get("X-Edge-Token", "")
        if not cfg.edge_token or not hmac.compare_digest(tok.encode(), cfg.edge_token.encode()):
            raise HTTPException(401, "Calls must come through the edge")
        user = request.headers.get("X-Eli-User", "")
        if not USER_RE.match(user):
            raise HTTPException(401, "No signed-in user")
        return user
    ts = TR.settings()
    return ts.user if ts else cfg.default_user


# ---------------------------------------------------------------- pages
@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/compare", include_in_schema=False)
def compare():
    return FileResponse(STATIC / "compare.html")


@app.get("/workbook", include_in_schema=False)
def workbook_page():
    return FileResponse(STATIC / "workbook.html")


# ---------------------------------------------------------------- ask
class Ask(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    site: str = "proposed"
    scenario: str | None = Field(default=None, max_length=20)
    conversation_id: str | None = Field(default=None, max_length=64)


def _real_embed(a: dict) -> dict:
    """Add what <tableau-viz> needs: the view URL and filters keyed by caption."""
    s = TR.settings()
    e = a.get("embed")
    if not s or not e:
        return a
    ev = next((x for x in a.get("evidence", []) if x.get("view") == e["view"]), {})
    e["mode"] = "real"
    e["src"] = TR.embed_src(s, e["view"], ev.get("content_url"))
    e["filters_by_caption"] = {TR.caption(k): v for k, v in e["filters"].items()}
    e["highlight_caption"] = TR.caption(e["highlight_field"]) if e.get("highlight_field") else None
    return a


def run(question: str, site: str, scenario: str | None, user: str = "demo.user"):
    ensure_started()
    s = TR.settings()
    kw = dict(user=user, llm=S.llm, lib=S.lib, kb=S.kb)
    if s:  # real Tableau: one workbook, whose contract is set by TABLEAU_CATALOG; no scenarios
        a = _real_embed(answer(question, tableau_http(), s.catalog, **kw))
    else:
        a = answer(question, tableau_http(), site, scenario=scenario, **kw)
    mode = config.get().tableau_embed
    if a.get("embed"):
        a["embed"]["presentation"] = mode    # embed | link | off: the UI shows the live view, a link, or nothing
        if mode == "off":
            a["embed"] = None
    return a


@app.post("/api/v1/ask")
@app.post("/api/ask", include_in_schema=False)
def ask(body: Ask, request: Request):
    ensure_started()
    if body.site not in SITES:
        raise HTTPException(400, "Unknown site")
    user = current_user(request)
    rid = request.state.request_id
    t0 = time.perf_counter()
    a = run(body.question.strip(), body.site, body.scenario, user=user)
    calls = [c.as_row() for c in a.pop("_llm_calls", [])]
    ms = round((time.perf_counter() - t0) * 1000)
    conv = S.store.conversation(user, body.conversation_id)
    tid = S.store.record_turn(conversation_id=conv, request_id=rid, user_id=user, answer=a, latency_ms=ms)
    S.store.record_llm_calls(tid, rid, calls)
    a.update(turn_id=tid, conversation_id=conv, request_id=rid, latency_ms=ms)
    log.info("turn", extra={"extra": {"request_id": rid, "turn_id": tid, "status": a["status"], "intent": a.get("intent"),
                                      "understanding": a["meta"]["understanding"], "insight": a["meta"]["insight"], "ms": ms}})
    return a


class Feedback(BaseModel):
    turn_id: str = Field(min_length=8, max_length=64)
    rating: int = Field(ge=-1, le=1)
    comment: str | None = Field(default=None, max_length=1000)


@app.post("/api/v1/feedback")
def feedback(body: Feedback, request: Request):
    ensure_started()
    if body.rating == 0:
        raise HTTPException(400, "rating must be 1 or -1")
    fid = S.store.add_feedback(body.turn_id, current_user(request), body.rating, body.comment)
    if not fid:
        raise HTTPException(404, "No such answer for this user")
    return {"feedback_id": fid}


@app.get("/api/v1/history")
def history(request: Request, conversation_id: str | None = None, limit: int = 50):
    ensure_started()
    return {"turns": S.store.turns(current_user(request), conversation_id, max(1, min(limit, 200)))}


@app.get("/api/v1/config")
def public_config():
    ensure_started()
    cfg = config.get()
    return {"version": VERSION, "tableau_mode": cfg.tableau_mode, "tableau_embed": cfg.tableau_embed,
            "llm_mode": cfg.llm.mode, "model": getattr(S.llm, "model", "off"), "today": cfg.today().isoformat(),
            "knowledge": {"glossary": S.kb.glossary["version"], "intents": S.kb.intents["version"], "sha256": S.kb.sha256[:12]},
            "prompts": {k: p.version for k, p in S.lib.items()}}


# ---------------------------------------------------------------- Tableau embed
@app.get("/api/embed/config")
def embed_config():
    s = TR.settings()
    if not s:
        return {"mode": "mock", "presentation": config.get().tableau_embed}
    return {"mode": "real", "presentation": config.get().tableau_embed, "server": s.server, "site": s.site,
            "script": s.script_url, "workbook": s.workbook, "catalog": s.catalog}


@app.get("/api/embed/token")
def embed_token(request: Request):
    """Short-lived Connected App token for one embed (scope tableau:views:embed), signed for the caller."""
    s = TR.settings()
    if not s:
        raise HTTPException(404, "Real Tableau is not configured (TABLEAU_MODE=real)")
    if config.get().tableau_embed != "embed":
        raise HTTPException(404, "Live embed is switched off (TABLEAU_EMBED)")
    return {"token": TR.connected_app_jwt(s, TR.EMBED_SCOPES, user=current_user(request), ttl=300)}


# ---------------------------------------------------------------- demos (mock only)
@app.get("/api/demos")
def list_demos():
    return demos.DEMOS


@app.get("/api/demos/{demo_id}")
def run_demo(demo_id: str):
    ensure_started()
    d = demos.get(demo_id)
    if not d:
        raise HTTPException(404, "No such demo")
    sc = d.get("scenario")
    if TR.settings():
        raise HTTPException(409, "Side-by-side demos need the mock (both workbook versions). Unset TABLEAU_MODE.")
    kw = dict(llm=S.llm, lib=S.lib, kb=S.kb)
    out = {"demo": d,
           "current": answer(d["question"], tableau_http(), "current", scenario=sc, **kw),
           "proposed": answer(d["question"], tableau_http(), "proposed", scenario=sc, **kw)}
    for k in ("current", "proposed"):
        out[k].pop("_llm_calls", None)
    return out


@app.get("/api/workbook")
def workbook():
    return JSONResponse({s: public_catalog(s) for s in SITES})


# ---------------------------------------------------------------- health
@app.get("/healthz")
def health():
    return {"ok": True, "version": VERSION}


@app.get("/readyz")
def ready():
    checks = {}
    try:
        ensure_started()
        checks["store"] = f"ok (schema {S.store.version()})" if S.store.ping() else "fail"
        checks["knowledge"] = f"ok ({S.kb.glossary['version']})"
        checks["prompts"] = "ok (" + ", ".join(f"{k} {p.version}" for k, p in S.lib.items()) + ")"
        ts = TR.settings()
        checks["tableau"] = "ok (real, settings present)" if ts else "ok (mock)"
        checks["llm"] = f"ok ({config.get().llm.mode})"
    except Exception as e:  # report the failing check by name, never a secret
        checks["error"] = type(e).__name__ + ": " + str(e)[:200]
        return JSONResponse({"ready": False, "checks": checks}, status_code=503)
    return {"ready": True, "checks": checks}
