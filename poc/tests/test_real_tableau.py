"""Real-Tableau mode against a stand-in server that checks what the real one checks.

The stand-in verifies the Connected App JWT (HS256 signature, kid/iss, aud, sub, scopes, exp),
lists the workbook's views like REST 3.x, and answers Query View Data with captions as vf_ keys.
"""
import base64
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl, unquote, urlparse

import httpx
import pytest

from hkeli_poc import tableau_real as TR
from hkeli_poc.stork.pipeline import answer
from hkeli_poc.workbook import CAPTION, VIEWS, query_view

ENV = {"TABLEAU_MODE": "real", "TABLEAU_SERVER": "https://tab.example.com", "TABLEAU_SITE": "hkelipoc",
       "TABLEAU_CLIENT_ID": "cid-1", "TABLEAU_SECRET_ID": "sid-1", "TABLEAU_SECRET_VALUE": "s3cret",
       "TABLEAU_USER": "hawk@example.com"}
CAP2FIELD = {**{v: k for k, v in CAPTION.items()}, **{v: k for k, v in TR.EXTRA_CAPTIONS.items()}}


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def verify_jwt(tok, scopes_needed):
    h, c, sig = tok.split(".")
    want = hmac.new(b"s3cret", f"{h}.{c}".encode(), hashlib.sha256).digest()
    assert hmac.compare_digest(_unb64(sig), want), "bad signature"
    header, claims = json.loads(_unb64(h)), json.loads(_unb64(c))
    assert header == {"alg": "HS256", "typ": "JWT", "kid": "sid-1", "iss": "cid-1"}
    assert claims["aud"] == "tableau" and claims["iss"] == "cid-1" and claims["sub"] == "hawk@example.com"
    assert claims["exp"] - time.time() <= 600 and set(scopes_needed) <= set(claims["scp"])


def fake_server():
    site = "proposed"
    luids = {f"luid-{v['no']}": v for v in VIEWS[site]}

    def handler(req: httpx.Request):
        u = urlparse(str(req.url))
        if u.path.endswith("/auth/signin"):
            body = json.loads(req.content)
            verify_jwt(body["credentials"]["jwt"], TR.REST_SCOPES)
            assert body["credentials"]["site"]["contentUrl"] == "hkelipoc"
            return httpx.Response(200, json={"credentials": {"token": "T", "site": {"id": "site-luid"}}})
        assert req.headers.get("X-Tableau-Auth") == "T"
        if u.path.endswith("/sites/site-luid/views"):
            assert "workbookName:eq:HK_ELI" in unquote(u.query)
            vs = [{"id": k, "name": v["name"].lstrip("#"), "contentUrl": f"HK_ELI/sheets/{v['name'].lstrip('#')}",
                   "viewUrlName": v["name"].lstrip("#")} for k, v in luids.items()]
            return httpx.Response(200, json={"views": {"view": vs}})
        if "/data" in u.path:
            luid = u.path.split("/views/")[1].split("/")[0]
            vf = {}
            for k, v in parse_qsl(u.query):
                assert k.startswith("vf_")
                cap = k[3:]
                assert cap in CAP2FIELD, f"vf_ should use captions, got {cap}"
                vf[CAP2FIELD[cap]] = v.split(",")
            cols, rows, _ = query_view(site, luids[luid], vf)
            text = "\n".join([",".join(cols)] + [",".join(r) for r in rows])
            return httpx.Response(200, text=text)
        return httpx.Response(404)

    return httpx.Client(transport=httpx.MockTransport(handler), base_url="https://tab.example.com")


@pytest.fixture
def real(monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    s = TR.settings()
    return s, TR.RealTableauHTTP(s, http=fake_server())


def test_embed_token_claims(real):
    s, _ = real
    verify_jwt(TR.connected_app_jwt(s, TR.EMBED_SCOPES), ["tableau:views:embed"])


def test_end_to_end_answer_through_real_rest_shape(real):
    s, http = real
    a = answer("Which branches in D1 have the largest TRE maturity in the next 30 days?", http, s.catalog)
    assert a["status"] == "OK", a["headline"]
    assert a["evidence"][0]["content_url"] == "HK_ELI/sheets/TRE_maturity_branch_n30d"
    assert http.unmatched == []


def test_embed_src_and_captions(real):
    s, _ = real
    assert TR.embed_src(s, "#max_trade_date", "HK_ELI/sheets/max_trade_date") == \
        "https://tab.example.com/t/hkelipoc/views/HK_ELI/max_trade_date"
    assert TR.caption("in_n30") == "In N30" and TR.caption("cust_district") == "Cust District"


def test_app_returns_real_embed(monkeypatch, real):
    from fastapi.testclient import TestClient
    from hkeli_poc import app as appmod
    monkeypatch.setattr(appmod, "_http", real[1])
    c = TestClient(appmod.app)
    cfg = c.get("/api/embed/config").json()
    assert cfg["mode"] == "real" and cfg["script"].endswith("/javascripts/api/tableau.embedding.3.latest.min.js")
    a = c.post("/api/ask", json={"question": "Which branches in D1 have the largest TRE maturity in the next 30 days?"}).json()
    e = a["embed"]
    assert e["src"] == "https://tab.example.com/t/hkelipoc/views/HK_ELI/TRE_maturity_branch_n30d"
    assert e["filters_by_caption"]["Cust District"] == ["TRE-D1"] and e["filters_by_caption"]["In N30"] == ["TRUE"]
    assert e["highlight_caption"] == "Cust Branch"
    verify_jwt(c.get("/api/embed/token").json()["token"], ["tableau:views:embed"])


def test_missing_settings_fail_loudly(monkeypatch):
    monkeypatch.setenv("TABLEAU_MODE", "real")
    for k in ENV:
        if k != "TABLEAU_MODE":
            monkeypatch.delenv(k, raising=False)
    with pytest.raises(RuntimeError):
        TR.settings()
