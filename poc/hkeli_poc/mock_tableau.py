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
from .workbook import CAPTION, PARAMETERS, SITES, VIEWS, find_view, public_catalog, query_view

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
.hk-tip{position:fixed;z-index:9;display:none;pointer-events:none;max-width:300px;padding:7px 9px;border:1px solid #33405a;border-radius:6px;background:#141b29;color:#fff;font:12px/17px system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.45)}
.tablewrap{overflow-x:auto;border:1px solid #253041;border-radius:6px}
table.vt{border-collapse:collapse;font-size:11px;white-space:nowrap}table.vt th{position:sticky;top:0;background:#1a2230;text-align:left;padding:5px 8px;color:#9fb0c6;font-weight:600}
table.vt td{padding:4px 8px;border-top:1px solid #1d2633}
.rowcount{font-size:12px;color:#8a96a8;margin:0 0 8px}.rowcount b{color:#e8edf4;font-size:15px}
.empty{padding:28px;text-align:center;color:#8a96a8;border:1px dashed #2a3547;border-radius:6px}
.chip.param{border-color:#2bb3a3;color:#5fd3c4}
#hk-viz{transition:opacity .15s}#hk-viz.busy{opacity:.55}
"""

# A small stand-in for the Tableau Embedding API v3 runtime calls, so the widget can drive the mock exactly as it
# drives <tableau-viz>: applyFilterAsync / clearFilterAsync / changeParameterValueAsync, answered with a done
# event, and a firstinteractive event on load. Same origin only.
EMBED_JS = """
(function(){
  var params=new URLSearchParams(location.search), root=document.getElementById('hk-viz');
  function post(m){ if(parent!==window) parent.postMessage(Object.assign({source:'hkeli-viz'},m), location.origin); }
  function render(id){
    root.classList.add('busy');
    var q=new URLSearchParams(params); q.set(':fragment','1');
    fetch(location.pathname+'?'+q.toString(),{credentials:'same-origin'}).then(function(r){
      if(!r.ok) throw new Error('HTTP '+r.status); return r.text();
    }).then(function(h){ root.innerHTML=h; root.classList.remove('busy'); post({event:'done',id:id}); })
      .catch(function(e){ root.classList.remove('busy'); post({event:'error',id:id,message:String(e)}); });
  }
  window.addEventListener('message',function(ev){
    if(ev.origin!==location.origin||!ev.data||ev.data.target!=='hkeli-viz') return;
    var d=ev.data;
    if(d.method==='applyFilterAsync'){ params.set(d.field,(d.values||[]).join(',')); }
    else if(d.method==='clearFilterAsync'){ params.delete(d.field); }
    else if(d.method==='changeParameterValueAsync'){ params.set(d.name,String(d.value)); }
    else return;
    render(d.id);
  });
  // Full height, no inner scroll: tell the host page how tall the view is, now and whenever it changes.
  var last=0;
  if(parent!==window) document.body.style.overflowY='hidden';
  function size(){ var h=Math.ceil(root.getBoundingClientRect().height); if(h!==last){ last=h; post({event:'resize',height:h}); } }
  if(window.ResizeObserver) new ResizeObserver(size).observe(root);
  // Hover info like Tableau's tooltips: each mark's <title> becomes an instant tip that follows the pointer.
  var tip=document.createElement('div'); tip.className='hk-tip'; tip.setAttribute('role','tooltip'); document.body.appendChild(tip);
  function tips(){ Array.prototype.forEach.call(root.querySelectorAll('title'),function(t){
    if(t.parentNode&&t.parentNode.setAttribute){ t.parentNode.setAttribute('data-tip',t.textContent); } t.remove(); }); }
  root.addEventListener('pointermove',function(e){
    var m=e.target.closest&&e.target.closest('[data-tip]');
    if(!m){ tip.style.display='none'; return; }
    var parts=m.getAttribute('data-tip').split(' · ');
    tip.innerHTML=''; parts.forEach(function(p,i){ var d=document.createElement('div'); d.textContent=p; if(!i) d.style.fontWeight='600'; tip.appendChild(d); });
    tip.style.display='block';
    var r=tip.getBoundingClientRect(), x=e.clientX+14, y=e.clientY+14;
    if(x+r.width>innerWidth) x=e.clientX-14-r.width; if(y+r.height>innerHeight) y=e.clientY-14-r.height;
    tip.style.left=Math.max(4,x)+'px'; tip.style.top=Math.max(4,y)+'px';
  });
  root.addEventListener('pointerleave',function(){ tip.style.display='none'; });
  tips();
  new MutationObserver(tips).observe(root,{childList:true});
  post({event:'firstinteractive'});
  size();
})();
"""


def embed_html(site: str, view: dict, filters: dict[str, list[str]], highlight: list[str], stale: bool = False,
               frame: bool = True) -> str:
    applied, ignored, params = {}, [], {}
    for f, vals in filters.items():
        if f in PARAMETERS:
            if f in view.get("parameters", []):
                params[f] = vals
            continue
        (applied.__setitem__(f, vals) if f in view["filters"] else ignored.append(f))
    cols, rows, info = query_view(site, view, {**applied, **params}, stale=stale)
    chips = []
    if view["tre_lock"]:
        chips.append('<span class="chip fixed">Bp Div Type = Treasures(HK) (fixed)</span>')
    if view["window"]:
        chips.append(f'<span class="chip fixed">Predict Maturity: next {view["window"]} days (fixed in sheet)</span>')
    for f, vals in applied.items():
        shown = ", ".join(vals) if len(vals) <= 3 else f"{len(vals)} values"
        chips.append(f'<span class="chip">{html.escape(CAPTION.get(f, f))} = {html.escape(shown)}</span>')
    for f, val in (info.get("parameters") or {}).items():
        if f == "shock_ticker" and not val:
            continue
        shown = f"{val * 100:.0f}%" if f == "market_spot" else (f"{val * 100:+.0f}%" if f == "shock_pct" else str(val))
        chips.append(f'<span class="chip param" title="Tableau parameter">{html.escape(CAPTION.get(f, f))} = {html.escape(shown)}</span>')
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
    return (f"<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
            f"<title>{html.escape(view['name'])}</title><style>{EMBED_CSS}</style></head><body><div id='hk-viz'>{inner}</div>"
            f"<script>{EMBED_JS}</script></body></html>")


@router.get("/{site}/views/{view_name}", response_class=HTMLResponse)
def embed(site: str, view_name: str, request: Request):
    view = find_view(_site(site), view_name)
    if not view:
        raise HTTPException(404, "View not found")
    q = request.query_params
    filters = {k: v.split(",") for k, v in q.items() if not k.startswith(":") and k != "scenario"}
    highlight = q.get(":highlight", "").split(",") if q.get(":highlight") else []
    return embed_html(site, view, filters, highlight, stale=q.get("scenario") == "stale", frame=not q.get(":fragment"))


@router.get("/api/catalog/{site}")
def catalog_json(site: str):
    return JSONResponse(public_catalog(_site(site)))


class InProcessMock:
    """The mock's REST shape called directly in-process (no test client in the serving path).

    Same contract as the HTTP routes above: sign-in token, view list, CSV Query View Data.
    """

    class _R:
        def __init__(self, status_code: int, payload=None, text: str = ""):
            self.status_code, self._p, self.text = status_code, payload, text

        def json(self):
            return self._p

    PREFIX = "/tableau/api/3.24"

    def post(self, path: str, json=None):  # noqa: A002 - mirrors httpx
        if path == f"{self.PREFIX}/auth/signin":
            user = ((json or {}).get("credentials") or {}).get("user", "demo.user")
            token = secrets.token_hex(12)
            _TOKENS[token] = user
            return self._R(200, {"credentials": {"token": token, "user": user}})
        return self._R(404)

    def get(self, path: str, headers=None):
        from urllib.parse import parse_qsl, urlsplit
        tok = (headers or {}).get("X-Tableau-Auth")
        if not tok or tok not in _TOKENS:
            return self._R(401)
        u = urlsplit(path)
        parts = u.path[len(self.PREFIX):].strip("/").split("/")
        # sites/{site}/views  |  sites/{site}/views/{luid}/data
        if len(parts) < 3 or parts[0] != "sites" or parts[1] not in SITES or parts[2] != "views":
            return self._R(404)
        site = parts[1]
        if len(parts) == 3:
            return self._R(200, {"views": {"view": public_catalog(site)}})
        if len(parts) == 5 and parts[4] == "data":
            view = find_view(site, parts[3])
            if not view:
                return self._R(404)
            params = dict(parse_qsl(u.query, keep_blank_values=True))
            cols, rows, _info = query_view(site, view, parse_vf(params), stale=params.get("scenario") == "stale")
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(cols)
            w.writerows(rows)
            return self._R(200, text=buf.getvalue())
        return self._R(404)
