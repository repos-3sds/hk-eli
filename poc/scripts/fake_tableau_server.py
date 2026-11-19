"""A stand-in Tableau server for checking real mode without a Tableau site.

It speaks the parts of REST 3.x the POC uses (JWT sign-in, view list, Query View Data with
caption vf_ keys) and serves a fake /javascripts/api/tableau.embedding.3.latest.min.js that
defines <tableau-viz>. The fake element checks the token, reads <viz-filter> children, renders
the mock chart for that view, records selectMarksByValueAsync calls and can fire mark selection.

    TABLEAU_FAKE_SECRET=s3cret uvicorn scripts.fake_tableau_server:app --port 8060
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sys
from pathlib import Path
from urllib.parse import parse_qsl

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response  # noqa: E402

from hkeli_poc import tableau_real as TR  # noqa: E402
from hkeli_poc.mock_tableau import embed_html  # noqa: E402
from hkeli_poc.workbook import CAPTION, VIEWS, query_view  # noqa: E402

SITE = os.environ.get("TABLEAU_FAKE_CATALOG", "proposed")
SECRET = os.environ.get("TABLEAU_FAKE_SECRET", "s3cret").encode()
CAP2FIELD = {**{v: k for k, v in CAPTION.items()}, **{v: k for k, v in TR.EXTRA_CAPTIONS.items()}}
LUIDS = {f"luid-{v['no']}": v for v in VIEWS[SITE]}
BY_SHEET = {v["name"].lstrip("#"): v for v in VIEWS[SITE]}
app = FastAPI()


def _check(tok: str, scope: str):
    try:
        h, c, sig = tok.split(".")
        want = hmac.new(SECRET, f"{h}.{c}".encode(), hashlib.sha256).digest()
        ok = hmac.compare_digest(base64.urlsafe_b64decode(sig + "=" * (-len(sig) % 4)), want)
        claims = json.loads(base64.urlsafe_b64decode(c + "=" * (-len(c) % 4)))
    except Exception:
        ok, claims = False, {}
    if not ok or scope not in claims.get("scp", []):
        raise HTTPException(401, "Invalid Connected App token")


@app.post("/api/{ver}/auth/signin")
async def signin(ver: str, request: Request):
    body = await request.json()
    _check(body["credentials"]["jwt"], "tableau:views:download")
    return {"credentials": {"token": "fake-session", "site": {"id": "site-luid", "contentUrl": body["credentials"]["site"]["contentUrl"]}}}


@app.get("/api/{ver}/sites/{site}/views")
def views(ver: str, site: str):
    return {"views": {"view": [{"id": k, "name": v["name"].lstrip("#"), "contentUrl": f"HK_ELI/sheets/{v['name'].lstrip('#')}",
                                "viewUrlName": v["name"].lstrip("#")} for k, v in LUIDS.items()]}}


@app.get("/api/{ver}/sites/{site}/views/{luid}/data")
def data(ver: str, site: str, luid: str, request: Request):
    vf = {CAP2FIELD.get(k[3:], k[3:]): v.split(",") for k, v in parse_qsl(request.url.query) if k.startswith("vf_")}
    cols, rows, _ = query_view(SITE, LUIDS[luid], vf)
    return PlainTextResponse("\n".join([",".join(cols)] + [",".join(r) for r in rows]), media_type="text/csv")


@app.get("/fake-viz/{sheet}", response_class=HTMLResponse)
def fake_viz(sheet: str, request: Request):
    v = BY_SHEET[sheet]
    filters = {CAP2FIELD.get(k, k): val.split(",") for k, val in request.query_params.items() if k not in (":hl",)}
    hl = request.query_params.get(":hl", "")
    html = embed_html(SITE, v, filters, hl.split(",") if hl else [])
    return html.replace("Mock Tableau · synthetic data", "Fake Tableau server · &lt;tableau-viz&gt;")


FAKE_JS = r"""
class FakeViz extends HTMLElement {
  async connectedCallback() {
    await Promise.resolve();
    const src = this.getAttribute("src"), token = this.getAttribute("token") || "";
    const sheet = decodeURIComponent(src.split("/").pop());
    const params = new URLSearchParams();
    for (const f of this.querySelectorAll("viz-filter")) params.set(f.getAttribute("field"), f.getAttribute("value"));
    window.__vizLog = { src, tokenParts: token.split(".").length, filters: Object.fromEntries(params), highlights: [] };
    const frame = document.createElement("iframe");
    frame.style.cssText = "width:100%;height:100%;border:0";
    this.style.display = "block";
    const draw = () => { frame.src = "__ORIGIN__/fake-viz/" + encodeURIComponent(sheet) + "?" + params.toString(); };
    this.workbook = { activeSheet: { selectMarksByValueAsync: async (sel) => {
      window.__vizLog.highlights.push(sel);
      params.set(":hl", sel[0].value.join(",")); draw();
    } } };
    draw();
    this.append(frame);
    if (token.split(".").length !== 3) {
      this.dispatchEvent(new CustomEvent("vizloaderror", { detail: { message: JSON.stringify({ statusCode: 401 }) } }));
      return;
    }
    frame.onload = () => { if (!this._first) { this._first = true; this.dispatchEvent(new CustomEvent("firstinteractive")); } };
  }
  // Test hook: pretend the user clicked a mark.
  selectMark(row) {
    const cols = Object.keys(row);
    this.dispatchEvent(new CustomEvent("markselectionchanged", { detail: { getMarksAsync: async () => ({
      data: [{ columns: cols.map(fieldName => ({ fieldName })), data: [cols.map(c => ({ formattedValue: row[c] }))] }] }) } }));
  }
}
customElements.define("tableau-viz", FakeViz);
customElements.define("viz-filter", class extends HTMLElement {});
"""


@app.get("/javascripts/api/tableau.embedding.3.latest.min.js")
def fake_js(request: Request):
    origin = f"{request.url.scheme}://{request.url.netloc}"
    # Module scripts load cross-origin only with CORS, as Tableau's own server allows.
    return Response(FAKE_JS.replace("__ORIGIN__", origin), media_type="application/javascript",
                    headers={"Access-Control-Allow-Origin": "*"})


@app.get("/t/{site}/views/{wb}/{sheet}")
def view_page(site: str, wb: str, sheet: str, request: Request):
    return fake_viz(sheet, request)


@app.get("/healthz")
def health():
    return JSONResponse({"ok": True})
