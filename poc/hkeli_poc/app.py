"""HK ELI Chatbot service: Stork pipeline + mock or real Tableau + demo pages.

Run (office):  .venv/bin/python -m hkeli_poc        (reads .env settings from the environment; binds 127.0.0.1)
Run (dev):     .venv/bin/python -m uvicorn hkeli_poc.app:app --host 127.0.0.1 --port 8050

Where it sits: behind the Java 21 / Spring Boot edge (locked decision). The edge does SSO, rate limits
and the public API, and calls this service on localhost with X-Edge-Token (shared secret) and
X-Eli-User (the signed-in user). With TRUST_EDGE_HEADERS=false (laptop demo) every call runs as
DEFAULT_USER, or as TABLEAU_USER in real-Tableau mode.

API (v1, JSON):
  POST /api/v1/ask        {question, site?, scenario?, conversation_id?, channel?} -> answer + turn_id
  POST /api/v1/ask/stream same body; Server-Sent Events: `stage` per pipeline step, then `answer` (or `error`)
  POST /api/v1/feedback   {turn_id, rating: 1|-1, comment?}
  GET  /api/v1/history    ?conversation_id=&limit=
  GET  /api/v1/history/conversations/{id}   one conversation with every answer in full, oldest first
  GET  /api/v1/config     non-secret settings the UI needs
  GET  /api/embed/config, /api/embed/token   (real Tableau only)
  GET  /healthz (alive)   GET /readyz (store, knowledge base, prompts, Tableau settings)
`POST /api/ask` stays as an alias of /api/v1/ask for the existing pages.
"""
from __future__ import annotations

import hmac
import importlib.util
import json
import logging
import re
import time
import uuid
import queue
import threading
from contextlib import asynccontextmanager
from typing import Literal
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
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
from .stork.pipeline import answer, demo_today
from .stork import thread as TH
from .flow import run as flow_run
from .flow import tools as flow_tools
from .flow import context as flow_context
from .flow import agentic as flow_agentic
from .flow import mcp as flow_mcp
from .flow.dify import DifyClient, DifyError, LocalDify
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
    dify = None
    dify_agent = None


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
    # Dify only: run this question through the Chatflow or the Agent app (for side-by-side comparison).
    # Ignored when ORCHESTRATOR=native, and when the chosen app has no key.
    engine: Literal["chatflow", "agent"] | None = None
    # "insights" = background questions a screen asks on its own (e.g. Today). Stored for audit, left out of history.
    channel: Literal["chat", "insights"] = "chat"


def _real_embed(a: dict) -> dict:
    """Add what <tableau-viz> needs to every view of the topic: the view URL, filters and parameters by caption."""
    s = TR.settings()
    if not s or not a.get("embed"):
        return a
    for e in [a["embed"], *(a.get("embeds") or [])]:
        if e.get("skipped") or e.get("mode") == "real":
            continue
        ev = next((x for x in a.get("evidence", []) if x.get("view") == e["view"]), {})
        e["mode"] = "real"
        e["src"] = TR.embed_src(s, e["view"], ev.get("content_url"))
        e["filters_by_caption"] = {TR.caption(k): v for k, v in e["filters"].items()}
        e["highlight_caption"] = TR.caption(e["highlight_field"]) if e.get("highlight_field") else None
        for p in e.get("parameters") or []:
            p["tableau_name"] = p["caption"]    # changeParameterValueAsync takes the parameter's name as shown
    return a


def run(question: str, site: str, scenario: str | None, user: str = "demo.user", on_step=None, llm=None, word: bool = True):
    ensure_started()
    s = TR.settings()
    kw = dict(user=user, llm=llm or S.llm, lib=S.lib, kb=S.kb, on_step=on_step, word=word)
    if s:  # real Tableau: one workbook, whose contract is set by TABLEAU_CATALOG; no scenarios
        a = _real_embed(answer(question, tableau_http(), s.catalog, **kw))
    else:
        a = answer(question, tableau_http(), site, scenario=scenario, **kw)
    mode = config.get().tableau_embed
    if a.get("embed"):
        for e in [a["embed"], *(a.get("embeds") or [])]:
            e["presentation"] = mode    # embed | link | off: the UI shows the live view, a link, or nothing
        if mode == "off":
            a["embed"] = None
            a["embeds"] = []
    return a


# ---------------------------------------------------------------- Dify flow (ORCHESTRATOR=dify | local)
def _flow_answer_fn(t, llm):
    """The `answer` tool's body: the deterministic pipeline as the asking user, model wording left to Dify."""
    return run(t.question, t.site, t.scenario, user=t.user, llm=llm, word=False)


def flow_engine():
    """local: the Chatflow's graph in this process (model = LLM_MODE). dify: the real Dify Service API."""
    cfg = config.get()
    if cfg.orchestrator == "dify" or (cfg.orchestrator == "dify_agent" and cfg.dify_api_key):
        if S.dify is None:
            S.dify = DifyClient(cfg.dify_base_url, cfg.dify_api_key, timeout_s=cfg.dify_timeout_s)
        return S.dify
    return LocalDify(S.llm, _flow_answer_fn, S.lib, S.kb)


def agent_engine():
    """The Dify Agent app (agent-chat): our context pack in, MCP tools for more, Python grades its text."""
    cfg = config.get()
    if S.dify_agent is None:
        S.dify_agent = DifyClient(cfg.dify_base_url, cfg.dify_agent_api_key, timeout_s=cfg.dify_timeout_s)
    return S.dify_agent


def _mode(body: Ask) -> str:
    """native | flow | agent for this question."""
    cfg = config.get()
    if cfg.orchestrator == "native":
        return "native"
    if body.engine == "agent" and cfg.dify_base_url and cfg.dify_agent_api_key:
        return "agent"
    if body.engine == "chatflow" and (cfg.orchestrator in ("local", "dify") or cfg.dify_api_key):
        return "flow"
    return "agent" if cfg.orchestrator == "dify_agent" else "flow"


def _flow(body: Ask, user: str, on_step=None, on_token=None, question: str | None = None,
          thread: dict | None = None) -> dict:
    a = None
    q = (question or body.question).strip()
    if _mode(body) == "agent":
        events = flow_agentic.ask(q, user, body.site, body.scenario, uuid.uuid4().hex,
                                  agent_engine(), S.lib, _flow_answer_fn, thread=thread)
    else:
        events = flow_run.ask(q, user, body.site, body.scenario, uuid.uuid4().hex,
                              flow_engine(), S.lib, S.kb)
    for kind, data in events:
        if kind == "stage" and on_step:
            on_step(data)
        elif kind == "token" and on_token:
            on_token(data)
        elif kind == "answer":
            a = data
    return a


def _thread_state(user: str, conv: str) -> dict | None:
    """The thread state saved with this conversation's last answer (per user; None for a new thread)."""
    turns = S.store.conversation_answers(user, conv) or []
    for t in reversed(turns):
        if t.get("channel", "chat") == "chat" and t.get("answer") and t["answer"].get("thread"):
            return t["answer"]["thread"]
    return None


def _code_reply(body: Ask, r) -> dict:
    """A turn the thread logic answers itself: setting or clearing the focus, or a scope no view carries."""
    rep = r.reply
    blocked = rep.get("code") == "SCOPE_NOT_AVAILABLE"
    return {"question": body.question, "site": body.site, "scenario": body.scenario,
            "status": "UNSUPPORTED" if blocked else "OK", "reasons": [rep.get("code", "THREAD_SCOPE")],
            "caveats": [{"code": rep["code"], "level": "block", "text": rep["headline"]}] if blocked else [],
            "headline": rep["headline"], "bullets": [], "table": None, "chart": None, "numbers": [], "evidence": [],
            "embed": None, "embeds": [], "followups": [f for f in rep.get("followups", []) if f], "as_of": None,
            "scope": "", "assumptions": [], "intent": "thread", "trace": [],
            "meta": {"understanding": "thread", "insight": "template", "orchestrator": "code"}}


def _answer_once(body: Ask, user: str, question: str, on_step, on_token, thread: dict | None) -> dict:
    if _mode(body) == "native":
        return run(question, body.site, body.scenario, user=user, on_step=on_step)
    return _flow(body, user, on_step=on_step, on_token=on_token, question=question, thread=thread)


def _ask(body: Ask, user: str, rid: str, on_step=None, on_token=None) -> dict:
    t0 = time.perf_counter()
    conv = S.store.conversation(user, body.conversation_id)
    chat = body.channel == "chat"
    r = TH.resolve(body.question.strip(), _thread_state(user, conv) if chat else None, demo_today())
    if r.reply:
        a = _code_reply(body, r)
    else:
        ctx = {"read_as": r.question, "carried": r.carried, "recent": r.state.get("recent", [])} if chat else None
        a = _answer_once(body, user, r.question, on_step, on_token, ctx)
        pend = r.state.get("clarify") or {}
        if (a.get("status") == "NEEDS_CLARIFICATION" and pend.get("for") == r.asked and pend.get("count", 0) >= 1
                and (a.get("clarify") or {}).get("options")):
            # asked the same thing again after a clarification: no second round, take the best-supported reading
            pick = a["clarify"]["options"][0]
            r.question, r.stage, r.frame = pick["question"], "pick", TH._frame(pick["question"], demo_today())
            r.note = f"Read as: {pick['question']}"
            a = _answer_once(body, user, r.question, on_step, on_token, ctx)
    a["question"] = body.question
    if r.note:
        a["assumptions"] = [r.note, *[x for x in (a.get("assumptions") or []) if x != r.note]]
    if chat:
        a["thread"] = TH.advance(r, a)
        a["thread_view"] = TH.view(r)
        if a["thread_view"]["carried"] or a["thread_view"]["focus"]:
            a["followups"] = [*(a.get("followups") or [])[:4], "Start a new topic"]
    calls = [c.as_row() for c in a.pop("_llm_calls", [])]
    ms = round((time.perf_counter() - t0) * 1000)
    tid = S.store.record_turn(conversation_id=conv, request_id=rid, user_id=user, answer=a, latency_ms=ms,
                              channel=body.channel)
    S.store.record_llm_calls(tid, rid, calls)
    a.update(turn_id=tid, conversation_id=conv, request_id=rid, latency_ms=ms, channel=body.channel)
    S.store.save_answer(tid, a)   # the whole answer, so History reopens it exactly as shown
    log.info("turn", extra={"extra": {"request_id": rid, "turn_id": tid, "status": a["status"], "intent": a.get("intent"),
                                      "channel": body.channel, "understanding": a["meta"]["understanding"],
                                      "insight": a["meta"]["insight"], "ms": ms}})
    return a


@app.post("/api/v1/ask")
@app.post("/api/ask", include_in_schema=False)
def ask(body: Ask, request: Request):
    ensure_started()
    if body.site not in SITES:
        raise HTTPException(400, "Unknown site")
    try:
        return _ask(body, current_user(request), request.state.request_id)
    except DifyError as e:
        log.warning("dify failed", extra={"extra": {"request_id": request.state.request_id, "code": e.code}})
        return JSONResponse({"status": "SYSTEM_ERROR", "error": "The assistant service is not reachable right now.",
                             "code": "DIFY_" + e.code, "request_id": request.state.request_id}, status_code=503)


STAGE_LABEL = {"Pre-parse": "Reading the question", "Concepts": "Matching catalog terms",
               "Understand": "Understanding the question",
               "Data as-of": "Checking the data date", "Route": "Choosing the Tableau view",
               "Plan check": "Checking the plan", "Compile": "Building the filters",
               "Fetch": "Querying the view as you", "Validate": "Checking the result",
               "Write answer": "Writing the answer", "Compose": "Composing"}


@app.post("/api/v1/ask/stream")
def ask_stream(body: Ask, request: Request):
    """Same answer as /api/v1/ask, streamed as Server-Sent Events.

    event: stage   data: {"n", "name", "label", "ms"}   one per pipeline step, as it finishes
    event: token   data: {"text", "state": "checking"}   Dify flow only: the draft headline so far, not yet graded
    event: answer  data: <the full answer object>       last event on success
    event: error   data: {"status": "SYSTEM_ERROR", "request_id"}
    """
    ensure_started()
    if body.site not in SITES:
        raise HTTPException(400, "Unknown site")
    user, rid = current_user(request), request.state.request_id   # checked before the stream starts
    q: queue.Queue = queue.Queue()
    done = object()

    def work():
        try:
            a = _ask(body, user, rid,
                     on_step=lambda st: q.put(("stage", {**st, "label": st.get("label") or STAGE_LABEL.get(st["name"], st["name"])})),
                     on_token=lambda tk: q.put(("token", tk)))
            q.put(("answer", a))
        except DifyError as e:
            log.warning("dify failed", extra={"extra": {"request_id": rid, "code": e.code}})
            q.put(("error", {"status": "SYSTEM_ERROR", "error": "The assistant service is not reachable right now.",
                             "code": "DIFY_" + e.code, "request_id": rid}))
        except Exception:  # same envelope as the JSON endpoint, no internals
            log.exception("stream failed", extra={"extra": {"request_id": rid}})
            q.put(("error", {"status": "SYSTEM_ERROR", "error": "Something went wrong on our side.", "request_id": rid}))
        q.put(done)

    threading.Thread(target=work, name=f"ask-{rid[:8]}", daemon=True).start()

    def events():
        while True:
            item = q.get()
            if item is done:
                return
            kind, data = item
            yield f"event: {kind}\ndata: {json.dumps(data)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


# ---------------------------------------------------------------- tools the Dify Chatflow calls
class ToolReq(BaseModel):
    request_id: str = Field(min_length=8, max_length=64)
    model_text: str | None = Field(default=None, max_length=20000)


def _tool_auth(request: Request) -> None:
    """Dify sends `Authorization: Bearer <DIFY_TOOL_KEY>`. The request id itself is a one-off random handle,
    valid for five minutes and only while that question is being answered."""
    key = config.get().dify_tool_key
    got = request.headers.get("Authorization", "")
    if not key or not hmac.compare_digest(got.encode(), f"Bearer {key}".encode()):
        raise HTTPException(401, "Tool key required")


def _tool(fn):
    try:
        return fn()
    except flow_tools.ToolError as e:
        return JSONResponse({"error": e.code}, status_code=e.status)


@app.post("/tools/context", tags=["dify-tools"])
def tool_context(body: ToolReq, request: Request):
    """Stage 1 output: rules reading and, when the rules are unsure, the `understand` prompt for Dify's model."""
    ensure_started()
    _tool_auth(request)
    return _tool(lambda: flow_context.package(flow_tools.turn(body.request_id)))


@app.post("/tools/answer", tags=["dify-tools"])
def tool_answer(body: ToolReq, request: Request):
    """Fetch from Tableau as the asking user, validate and compose. Returns the `write_answer` prompt when the
    answer may be worded, else the final headline. Rows and figures stay here."""
    ensure_started()
    _tool_auth(request)
    return _tool(lambda: flow_tools.answer(body.request_id, body.model_text, _flow_answer_fn, S.lib, S.kb,
                                           model="dify"))


@app.post("/tools/reword", tags=["dify-tools"])
def tool_reword(body: ToolReq, request: Request):
    """The `write_answer` prompt again with the problems the figure check found (one rewrite)."""
    ensure_started()
    _tool_auth(request)
    return _tool(lambda: flow_tools.reword(body.request_id))


@app.post("/mcp", tags=["dify-tools"])
async def mcp_endpoint(request: Request):
    """MCP server (Streamable HTTP, JSON responses) for the Dify Agent app: eli_ask and eli_views."""
    ensure_started()
    _tool_auth(request)
    try:
        msg = json.loads(await request.body())
    except ValueError:
        return JSONResponse({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}},
                            status_code=400)
    if isinstance(msg, list):
        out = [r for r in (await _mcp_one(m) for m in msg) if r is not None]
        return JSONResponse(out) if out else Response(status_code=202)
    r = await _mcp_one(msg)
    return JSONResponse(r) if r is not None else Response(status_code=202)


async def _mcp_one(m):
    import anyio   # the tools run the (blocking) pipeline
    return await anyio.to_thread.run_sync(flow_mcp.handle, m, _flow_answer_fn)


@app.get("/mcp", include_in_schema=False)
def mcp_get():
    """No server-initiated stream: every reply comes back on the POST."""
    return Response(status_code=405, headers={"Allow": "POST"})


class AskToolReq(BaseModel):
    request_id: str = Field(min_length=8, max_length=64)
    question: str = Field(min_length=2, max_length=500)


@app.post("/tools/eli_ask", tags=["dify-tools"])
def tool_eli_ask(body: AskToolReq, request: Request):
    """The Agent's `eli_ask` as a REST custom tool (same as the MCP tool), for a Dify without MCP."""
    ensure_started()
    _tool_auth(request)
    out = flow_mcp.call("eli_ask", body.model_dump(), _flow_answer_fn)
    return JSONResponse(out, status_code=404 if out.get("error") == "UNKNOWN_REQUEST" else 200)


@app.post("/tools/eli_views", tags=["dify-tools"])
def tool_eli_views(body: ToolReq, request: Request):
    """The Agent's `eli_views` as a REST custom tool."""
    ensure_started()
    _tool_auth(request)
    out = flow_mcp.call("eli_views", {"request_id": body.request_id}, _flow_answer_fn)
    return JSONResponse(out, status_code=404 if out.get("error") == "UNKNOWN_REQUEST" else 200)


@app.get("/tools/openapi.json", tags=["dify-tools"])
def tool_openapi(request: Request):
    """OpenAPI 3 schema for Dify's custom tool provider (Tools > Custom > Create)."""
    base = config.get().dify_tool_base_url or str(request.base_url).rstrip("/")
    return flow_tools.openapi(base)


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
def history(request: Request, conversation_id: str | None = None, limit: int = 50,
            channel: Literal["chat", "insights"] = "chat"):
    ensure_started()
    return {"turns": S.store.turns(current_user(request), conversation_id, max(1, min(limit, 200)), channel)}


@app.get("/api/v1/history/conversations/{conversation_id}")
def history_conversation(conversation_id: str, request: Request):
    """One of this user's conversations with every answer in full (as /api/v1/ask returned it), oldest first."""
    ensure_started()
    turns = S.store.conversation_answers(current_user(request), conversation_id[:64])
    if turns is None:
        raise HTTPException(404, "No such conversation for this user")
    return {"conversation_id": conversation_id, "turns": turns}


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
        mode = config.get().llm.mode
        if mode == "stork" and importlib.util.find_spec("ada_genai") is None:
            checks["llm"] = "warn (stork: ada_genai not installed, answers fall back to rules and templates)"
        else:
            checks["llm"] = f"ok ({mode})"
    except Exception as e:  # report the failing check by name, never a secret
        checks["error"] = type(e).__name__ + ": " + str(e)[:200]
        return JSONResponse({"ready": False, "checks": checks}, status_code=503)
    return {"ready": True, "checks": checks}
