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
        base = os.environ.get("TABLEAU_BASE_URL")
        if base:
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


@app.post("/api/ask")
def ask(body: Ask):
    if body.site not in SITES:
        raise HTTPException(400, "Unknown site")
    return answer(body.question.strip(), tableau_http(), body.site, scenario=body.scenario)


@app.get("/api/demos")
def list_demos():
    return demos.DEMOS


@app.get("/api/demos/{demo_id}")
def run_demo(demo_id: str):
    d = demos.get(demo_id)
    if not d:
        raise HTTPException(404, "No such demo")
    sc = d.get("scenario")
    return {"demo": d,
            "current": answer(d["question"], tableau_http(), "current", scenario=sc),
            "proposed": answer(d["question"], tableau_http(), "proposed", scenario=sc)}


@app.get("/api/workbook")
def workbook():
    return JSONResponse({s: public_catalog(s) for s in SITES})


@app.get("/healthz")
def health():
    return {"ok": True}
