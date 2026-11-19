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
       "TABLEAU_USER": "demo.user@example.com"}
CAP2FIELD = {**{v: k for k, v in CAPTION.items()}, **{v: k for k, v in TR.EXTRA_CAPTIONS.items()}}


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def verify_jwt(tok, scopes_needed):
    h, c, sig = tok.split(".")
    want = hmac.new(b"s3cret", f"{h}.{c}".encode(), hashlib.sha256).digest()
    assert hmac.compare_digest(_unb64(sig), want), "bad signature"
    header, claims = json.loads(_unb64(h)), json.loads(_unb64(c))
    assert header == {"alg": "HS256", "typ": "JWT", "kid": "sid-1", "iss": "cid-1"}
    assert claims["aud"] == "tableau" and claims["iss"] == "cid-1" and claims["sub"] == "demo.user@example.com"
    assert claims["exp"] - time.time() <= 600 and set(scopes_needed) <= set(claims["scp"])


def fake_server():
    site = "proposed"
    luids = {f"luid-{v['no']}": v for v in VIEWS[site]}
    issued = []

    def handler(req: httpx.Request):
        u = urlparse(str(req.url))
        if u.path.endswith("/auth/signin"):
            body = json.loads(req.content)
            verify_jwt(body["credentials"]["jwt"], TR.REST_SCOPES)
            assert body["credentials"]["site"]["contentUrl"] == "hkelipoc"
            issued.append(f"T{len(issued)}")
            return httpx.Response(200, json={"credentials": {"token": issued[-1], "site": {"id": "site-luid"}}})
        assert req.headers.get("X-Tableau-Auth") in issued
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
    from hkeli_poc import config
    config.reload()
    s = TR.settings()
    return s, TR.RealTableauHTTP(s, http=fake_server())


def test_embed_token_claims(real):
    s, _ = real
    verify_jwt(TR.connected_app_jwt(s, TR.EMBED_SCOPES), ["tableau:views:embed"])


def test_end_to_end_answer_through_real_rest_shape(real):
    s, http = real
    a = answer("Which branches in D1 have the largest TRE maturity in the next 30 days?", http, s.catalog, user=s.user)
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
    monkeypatch.setattr(appmod.S, "http", real[1])
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


def test_rest_sign_in_is_per_user_and_renews_on_401(real):
    """Row-level security needs sub = the asking user, not one shared service account."""
    s, http = real
    subs = []
    orig = TR.connected_app_jwt

    def spy(settings, scopes, user=None, ttl=300):
        subs.append(user)
        return orig(settings, scopes, user=s.user, ttl=ttl)   # the stand-in only knows one user
    TR.connected_app_jwt, saved = spy, orig
    try:
        r1 = http.post("/x/auth/signin", json={"credentials": {"user": "alice@example.com"}})
        r2 = http.post("/x/auth/signin", json={"credentials": {"user": "bob@example.com"}})
        assert r1.status_code == r2.status_code == 200
        assert subs == ["alice@example.com", "bob@example.com"]
        tok = r1.json()["credentials"]["token"]
        http._drop("alice@example.com")            # simulate an expired session
        r = http.get("/x/sites/s/views", headers={"X-Tableau-Auth": tok})
        assert r.status_code == 200 and subs[-1] == "alice@example.com"    # renewed as alice, not as anyone else
        assert http.get("/x/sites/s/views", headers={"X-Tableau-Auth": "unknown"}).status_code == 401
    finally:
        TR.connected_app_jwt = saved


def test_secret_from_vault_file(monkeypatch, tmp_path):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("TABLEAU_SECRET_VALUE")
    f = tmp_path / "tableau_secret"
    f.write_text("s3cret\n")
    monkeypatch.setenv("TABLEAU_SECRET_VALUE_FILE", str(f))
    assert TR.settings().secret_value == "s3cret"
