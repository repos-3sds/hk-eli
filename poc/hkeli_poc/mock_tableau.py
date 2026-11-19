"""Mock Tableau Server: REST-like Query View Data plus an embeddable view page.

Endpoints (shaped like Tableau REST API 3.x and the view URL):
  POST /tableau/api/3.24/auth/signin                     -> token for a user (Connected App stand-in)
  GET  /tableau/api/3.24/sites/{site}/views              -> view list with LUIDs (catalog views section)
  GET  /tableau/api/3.24/sites/{site}/views/{luid}/data  -> CSV, filters as vf_<field>=v1,v2
  GET  /tableau/{site}/views/{view_name}?field=v1,v2     -> embeddable view (what <tableau-viz> would show)

Behaviour that mirrors real Tableau and matters for W1-W7:
  * vf_ is exact match only (comma list allowed). No ranges, no "next N days".
  * a vf_ on a field the worksheet does not carry is silently ignored.
  * the embed can only filter fields that are published as filters on the view.
"""
from __future__ import annotations

import csv
import html
import io
import secrets

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse

from . import svg
from .workbook import CAPTION, SITES, VIEWS, find_view, public_catalog, query_view

router = APIRouter(prefix="/tableau")
_TOKENS: dict[str, str] = {}


def _site(site: str) -> str:
    if site not in SITES:
        raise HTTPException(404, f"Site '{site}' not found")
    return site


@router.post("/api/3.24/auth/signin")
async def signin(request: Request):
    body = await request.json()
    user = (body.get("credentials", {}) or {}).get("user", "demo.user")
    token = secrets.token_hex(12)
    _TOKENS[token] = user
    return {"credentials": {"token": token, "user": user}}


def _check(token: str | None):
    if not token or token not in _TOKENS:
        raise HTTPException(401, "Signin required (X-Tableau-Auth)")


@router.get("/api/3.24/sites/{site}/views")
def list_views(site: str, x_tableau_auth: str | None = Header(default=None)):
    _check(x_tableau_auth)
    return {"views": {"view": public_catalog(_site(site))}}


def parse_vf(params) -> dict[str, list[str]]:
    vf = {}
    for k, v in params.items():
        if k.startswith("vf_"):
            vf[k[3:]] = [x for x in v.split(",") if x != ""]
    return vf


@router.get("/api/3.24/sites/{site}/views/{luid}/data")
def view_data(site: str, luid: str, request: Request, x_tableau_auth: str | None = Header(default=None)):
    _check(x_tableau_auth)
    view = find_view(_site(site), luid)
    if not view:
        raise HTTPException(404, "View not found")
    stale = request.query_params.get("scenario") == "stale"
    cols, rows, _info = query_view(site, view, parse_vf(request.query_params), stale=stale)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    w.writerows(rows)
    return PlainTextResponse(buf.getvalue(), media_type="text/csv")


EMBED_CSS = """
:root{color-scheme:dark}
body{margin:0;background:#11161f;color:#c9d1dc;font:13px/1.45 Inter,system-ui,-apple-system,Segoe UI,sans-serif}
.bar{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;padding:8px 12px;border-bottom:1px solid #253041;background:#0d1219}
.bar b{color:#e8edf4;font-weight:600}.tag{white-space:nowrap;font-size:11px;padding:1px 7px;border-radius:9px;border:1px solid #33415a;color:#8a96a8}
.tag.proposed{border-color:#2bb3a3;color:#5fd3c4}.tag.current{border-color:#f2a83b;color:#f6c070}
.filters{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-bottom:1px solid #1d2633}
.chip{font-size:11px;padding:2px 8px;border-radius:4px;background:#1a2230;border:1px solid #2a3547}
.chip.off{border-style:dashed;color:#ef8d8d;border-color:#7a3a3a;background:transparent}
.chip.fixed{color:#8a96a8}
.body{padding:12px}.muted{color:#8a96a8}.small{font-size:11px}
.legend{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 8px;font-size:11px}.lg{display:flex;align-items:center;gap:5px}
.lg i{width:10px;height:10px;border-radius:2px;display:inline-block}
.chart{width:100%;max-width:720px;height:auto;display:block}
.kpis{display:flex;gap:16px;flex-wrap:wrap}.kpi{background:#161d29;border:1px solid #253041;border-radius:6px;padding:14px 18px;min-width:180px}
.kpi-label{color:#8a96a8;font-size:11px;text-transform:uppercase;letter-spacing:.04em}.kpi-value{font-size:24px;color:#e8edf4;margin-top:4px}
.tablewrap{overflow:auto;max-height:360px;border:1px solid #253041;border-radius:6px}
table.vt{border-collapse:collapse;font-size:11px;white-space:nowrap}table.vt th{position:sticky;top:0;background:#1a2230;text-align:left;padding:5px 8px;color:#9fb0c6;font-weight:600}
table.vt td{padding:4px 8px;border-top:1px solid #1d2633}
.rowcount{font-size:12px;color:#8a96a8;margin:0 0 8px}.rowcount b{color:#e8edf4;font-size:15px}
.empty{padding:28px;text-align:center;color:#8a96a8;border:1px dashed #2a3547;border-radius:6px}
"""


def embed_html(site: str, view: dict, filters: dict[str, list[str]], highlight: list[str], stale: bool = False,
               frame: bool = True) -> str:
    applied, ignored = {}, []
    for f, vals in filters.items():
        (applied.__setitem__(f, vals) if f in view["filters"] else ignored.append(f))
    cols, rows, _ = query_view(site, view, applied, stale=stale)
    chips = []
    if view["tre_lock"]:
        chips.append('<span class="chip fixed">Bp Div Type = Treasures(HK) (fixed)</span>')
    if view["window"]:
        chips.append(f'<span class="chip fixed">Predict Maturity: next {view["window"]} days (fixed in sheet)</span>')
    for f, vals in applied.items():
        shown = ", ".join(vals) if len(vals) <= 3 else f"{len(vals)} values"
        chips.append(f'<span class="chip">{html.escape(CAPTION.get(f, f))} = {html.escape(shown)}</span>')
    for f in ignored:
        chips.append(f'<span class="chip off" title="Not a published filter on this view, so the embed cannot apply it">'
                     f'{html.escape(CAPTION.get(f, f))}: not a filter on this view</span>')
    body = svg.render(view, cols, rows, highlight)
    inner = f"""<div class="bar"><b>{html.escape(view['name'])}</b><span class="tag">HK_ELI</span>
<span class="tag {site}">{'Workbook with W1–W7' if site == 'proposed' else 'Workbook today'}</span>
<span class="muted small" style="margin-left:auto">Mock Tableau · synthetic data</span></div>
<div class="filters">{''.join(chips) or '<span class="muted small">No filters</span>'}</div>
<div class="body">{body}</div>"""
    if not frame:
        return inner
    return f"<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>{html.escape(view['name'])}</title><style>{EMBED_CSS}</style></head><body>{inner}</body></html>"


@router.get("/{site}/views/{view_name}", response_class=HTMLResponse)
def embed(site: str, view_name: str, request: Request):
    view = find_view(_site(site), view_name)
    if not view:
        raise HTTPException(404, "View not found")
    q = request.query_params
    filters = {k: v.split(",") for k, v in q.items() if not k.startswith(":") and k != "scenario"}
    highlight = q.get(":highlight", "").split(",") if q.get(":highlight") else []
    return embed_html(site, view, filters, highlight, stale=q.get("scenario") == "stale")


@router.get("/api/catalog/{site}")
def catalog_json(site: str):
    return JSONResponse(public_catalog(_site(site)))
