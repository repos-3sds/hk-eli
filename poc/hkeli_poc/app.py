"""HK ELI Chatbot POC server: mock Tableau + Stork pipeline + demo pages.

Run:  uvicorn hkeli_poc.app:app --port 8050
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import demos
from .mock_tableau import router as tableau_router
from .stork.pipeline import answer
from . import tableau_real as TR
from .workbook import SITES, public_catalog

STATIC = Path(__file__).parent / "static"
app = FastAPI(title="HK ELI Chatbot POC", docs_url="/api/docs")
app.include_router(tableau_router)
app.mount("/static", StaticFiles(directory=STATIC), name="static")

_http = None


def tableau_http():
    """HTTP session to Tableau. Default: the in-process mock, called over its REST shape."""
    global _http
    if _http is None:
        real = TR.settings()
        base = os.environ.get("TABLEAU_BASE_URL")
        if real:
            _http = TR.RealTableauHTTP(real)
        elif base:
            import httpx
            _http = httpx.Client(base_url=base, timeout=30)
        else:
            from fastapi.testclient import TestClient
            _http = TestClient(app)
    return _http


class Ask(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    site: str = "proposed"
    scenario: str | None = None


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/compare")
def compare():
    return FileResponse(STATIC / "compare.html")


@app.get("/workbook")
def workbook_page():
    return FileResponse(STATIC / "workbook.html")


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


def run(question: str, site: str, scenario: str | None):
    s = TR.settings()
    if s:  # real Tableau: one workbook, whose contract is set by TABLEAU_CATALOG; no scenarios
        return _real_embed(answer(question, tableau_http(), s.catalog))
    return answer(question, tableau_http(), site, scenario=scenario)


@app.post("/api/ask")
def ask(body: Ask):
    if body.site not in SITES:
        raise HTTPException(400, "Unknown site")
    return run(body.question.strip(), body.site, body.scenario)


@app.get("/api/embed/config")
def embed_config():
    s = TR.settings()
    if not s:
        return {"mode": "mock"}
    return {"mode": "real", "server": s.server, "site": s.site, "script": s.script_url, "workbook": s.workbook,
            "catalog": s.catalog}


@app.get("/api/embed/token")
def embed_token():
    """Short-lived Connected App token for one embed (scope tableau:views:embed), signed for the user."""
    s = TR.settings()
    if not s:
        raise HTTPException(404, "Real Tableau is not configured (TABLEAU_MODE=real)")
    return {"token": TR.connected_app_jwt(s, TR.EMBED_SCOPES, ttl=300)}


@app.get("/api/demos")
def list_demos():
    return demos.DEMOS


@app.get("/api/demos/{demo_id}")
def run_demo(demo_id: str):
    d = demos.get(demo_id)
    if not d:
        raise HTTPException(404, "No such demo")
    sc = d.get("scenario")
    if TR.settings():
        raise HTTPException(409, "Side-by-side demos need the mock (both workbook versions). Unset TABLEAU_MODE.")
    return {"demo": d,
            "current": answer(d["question"], tableau_http(), "current", scenario=sc),
            "proposed": answer(d["question"], tableau_http(), "proposed", scenario=sc)}


@app.get("/api/workbook")
def workbook():
    return JSONResponse({s: public_catalog(s) for s in SITES})


@app.get("/healthz")
def health():
    return {"ok": True}
