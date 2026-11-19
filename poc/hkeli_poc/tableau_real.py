"""Real Tableau: Connected App tokens, REST sign-in, view mapping and embed config.

Turned on by TABLEAU_MODE=real. Settings (environment, never committed):
  TABLEAU_SERVER        e.g. https://<tableau-server>  (no trailing slash; https only)
  TABLEAU_SITE          site content URL, e.g. hkelipoc ("" for the Default site)
  TABLEAU_CLIENT_ID     Connected App client ID
  TABLEAU_SECRET_ID     Connected App secret ID           (secret: or TABLEAU_SECRET_ID_FILE from Vault)
  TABLEAU_SECRET_VALUE  Connected App secret value        (secret: or TABLEAU_SECRET_VALUE_FILE from Vault)
  TABLEAU_USER          Tableau username used when no signed-in user is passed by the edge (demo only).
                        Behind the Java edge every REST sign-in and embed token uses sub = the user.
  TABLEAU_WORKBOOK      workbook name, default HK_ELI
  TABLEAU_CATALOG       which view contract the workbook follows: current | proposed (default proposed)
  TABLEAU_API_VERSION   REST API version, default 3.22
  TABLEAU_EMBED_SCRIPT  path of the Embedding API v3 script on the server
                        (default /javascripts/api/tableau.embedding.3.latest.min.js; pin a version when the server offers one)

Connected App direct trust JWT (Tableau docs, "Configure Connected Apps with Direct Trust"):
header {alg HS256, typ JWT, kid secret_id, iss client_id};
claims {iss client_id, aud "tableau", sub user, jti, exp <= 10 min, scp [...]}.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from dataclasses import dataclass
from urllib.parse import quote

from .workbook import CAPTION, public_catalog

EMBED_SCOPES = ["tableau:views:embed"]
REST_SCOPES = ["tableau:content:read", "tableau:views:download"]


@dataclass(frozen=True)
class Settings:
    server: str
    site: str
    client_id: str
    secret_id: str
    secret_value: str
    user: str
    workbook: str = "HK_ELI"
    catalog: str = "proposed"
    api_version: str = "3.22"
    embed_script: str = "/javascripts/api/tableau.embedding.3.latest.min.js"
    timeout_s: float = 30.0

    @property
    def site_prefix(self) -> str:
        return f"/t/{self.site}" if self.site else ""

    @property
    def script_url(self) -> str:
        return f"{self.server}{self.embed_script}"


def settings() -> Settings | None:
    from .config import secret
    if os.environ.get("TABLEAU_MODE", "mock") != "real":
        return None
    vals = {"TABLEAU_SERVER": os.environ.get("TABLEAU_SERVER"), "TABLEAU_CLIENT_ID": os.environ.get("TABLEAU_CLIENT_ID"),
            "TABLEAU_SECRET_ID": secret("TABLEAU_SECRET_ID"), "TABLEAU_SECRET_VALUE": secret("TABLEAU_SECRET_VALUE"),
            "TABLEAU_USER": os.environ.get("TABLEAU_USER")}
    missing = [k for k, v in vals.items() if not v]
    if missing:
        raise RuntimeError(f"TABLEAU_MODE=real but these are not set: {', '.join(missing)}")
    if not vals["TABLEAU_SERVER"].startswith("https://"):
        raise RuntimeError("TABLEAU_SERVER must use https")
    return Settings(server=vals["TABLEAU_SERVER"].rstrip("/"), site=os.environ.get("TABLEAU_SITE", ""),
                    client_id=vals["TABLEAU_CLIENT_ID"], secret_id=vals["TABLEAU_SECRET_ID"],
                    secret_value=vals["TABLEAU_SECRET_VALUE"], user=vals["TABLEAU_USER"],
                    embed_script=os.environ.get("TABLEAU_EMBED_SCRIPT") or "/javascripts/api/tableau.embedding.3.latest.min.js",
                    timeout_s=float(os.environ.get("TABLEAU_TIMEOUT_S") or 30),
                    workbook=os.environ.get("TABLEAU_WORKBOOK", "HK_ELI"),
                    catalog=os.environ.get("TABLEAU_CATALOG", "proposed"),
                    api_version=os.environ.get("TABLEAU_API_VERSION", "3.22"))


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def connected_app_jwt(s: Settings, scopes: list[str], user: str | None = None, ttl: int = 300) -> str:
    header = {"alg": "HS256", "typ": "JWT", "kid": s.secret_id, "iss": s.client_id}
    now = int(time.time())
    claims = {"iss": s.client_id, "aud": "tableau", "sub": user or s.user, "jti": str(uuid.uuid4()),
              "exp": now + min(ttl, 600), "scp": scopes}
    signing_input = f"{_b64(json.dumps(header, separators=(',', ':')).encode())}.{_b64(json.dumps(claims, separators=(',', ':')).encode())}"
    sig = hmac.new(s.secret_value.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{_b64(sig)}"


def sheet_url_name(view_name: str) -> str:
    """Tableau content URLs drop characters like '#'. 'sheets/#max_trade_date' -> 'max_trade_date'."""
    return view_name.lstrip("#")


class RealTableauHTTP:
    """Speaks the real REST API but exposes the same shape the pipeline's TableauClient expects.

    The pipeline calls  POST {API}/auth/signin, GET {API}/sites/{site}/views, GET .../views/{luid}/data.
    This adapter maps those onto the real server: JWT sign-in, the site's LUID, and the workbook's views
    matched by name to our view contract (record ids, filters, measures).
    """

    SESSION_TTL_S = 200 * 60   # REST tokens last 240 min by default; renew well before

    def __init__(self, s: Settings, http=None):
        import httpx
        self.s = s
        self.http = http or httpx.Client(base_url=s.server, timeout=s.timeout_s)
        self.api = f"/api/{s.api_version}"
        self._sessions: dict[str, tuple[str, str, float]] = {}   # user -> (token, site_id, expires_at)
        self._by_token: dict[str, str] = {}                      # token -> user
        self.unmatched: list[str] = []

    # --- tiny response object compatible with what TableauClient reads
    class _R:
        def __init__(self, status_code, payload=None, text=""):
            self.status_code, self._p, self.text = status_code, payload, text

        def json(self):
            return self._p

    def _signin(self, user: str) -> tuple[str, str]:
        """REST sign-in with a Connected App JWT whose sub is the user, so row-level security applies."""
        sess = self._sessions.get(user)
        if sess and sess[2] > time.time():
            return sess[0], sess[1]
        body = {"credentials": {"jwt": connected_app_jwt(self.s, REST_SCOPES, user=user), "site": {"contentUrl": self.s.site}}}
        r = self.http.post(f"{self.api}/auth/signin", json=body, headers={"Accept": "application/json"})
        r.raise_for_status()
        c = r.json()["credentials"]
        self._sessions[user] = (c["token"], c["site"]["id"], time.time() + self.SESSION_TTL_S)
        self._by_token[c["token"]] = user
        return c["token"], c["site"]["id"]

    def _drop(self, user: str) -> None:
        # The client's old token keeps pointing at this user, so a renewed session is the same user's.
        self._sessions.pop(user, None)

    @property
    def _token(self):  # kept for callers that only need "is anyone signed in"
        return next(iter(self._sessions.values()))[0] if self._sessions else None

    @property
    def _site_id(self):
        return next(iter(self._sessions.values()))[1] if self._sessions else None

    def post(self, path, json=None):  # noqa: A002 - mirrors httpx
        if path.endswith("/auth/signin"):
            user = ((json or {}).get("credentials") or {}).get("user") or self.s.user
            try:
                token, _ = self._signin(user)
            except Exception:  # surfaced as TABLEAU_AUTH_ERROR by the caller
                return self._R(401)
            return self._R(200, {"credentials": {"token": token, "user": user}})
        return self._R(404)

    def get(self, path, headers=None):
        user = self._by_token.get((headers or {}).get("X-Tableau-Auth", ""))
        if user is None:      # never fall back to another identity
            return self._R(401)
        for attempt in (1, 2):
            token, site_id = self._signin(user)
            r = self._get(path, token, site_id)
            if r.status_code != 401 or attempt == 2:
                return r
            self._drop(user)   # expired or revoked: sign in again once
        return r

    def _get(self, path, token, site_id):
        if path.endswith("/views") or "/views?" in path:
            return self._R(200, {"views": {"view": self._views(token, site_id)}})
        if "/data" in path:
            luid_and_q = path.split("/views/", 1)[1]
            luid, _, q = luid_and_q.partition("/data")
            q = q.lstrip("?")
            params = "&".join(p for p in q.split("&") if p and not p.startswith("scenario="))
            params = self._captions(params)
            url = f"{self.api}/sites/{site_id}/views/{luid}/data" + (f"?{params}" if params else "")
            r = self.http.get(url, headers={"X-Tableau-Auth": token})
            return self._R(r.status_code, text=r.text)
        return self._R(404)

    def _captions(self, params: str) -> str:
        """vf_ on the real server uses the field name as shown in the view (often the caption)."""
        if os.environ.get("TABLEAU_VF_USE_CAPTIONS", "1") != "1":
            return params
        out = []
        for p in params.split("&"):
            if p.startswith("vf_"):
                k, _, v = p[3:].partition("=")
                out.append(f"vf_{quote(caption(k))}={v}")
            else:
                out.append(p)
        return "&".join(out)

    def _views(self, token, site_id) -> list[dict]:
        wb = quote(self.s.workbook)
        r = self.http.get(f"{self.api}/sites/{site_id}/views?filter=workbookName:eq:{wb}&pageSize=200",
                          headers={"X-Tableau-Auth": token, "Accept": "application/json"})
        r.raise_for_status()
        real = {v["name"]: v for v in r.json().get("views", {}).get("view", [])}
        real_by_url = {v.get("viewUrlName") or v.get("contentUrl", "").split("/")[-1]: v for v in real.values()}
        out, self.unmatched = [], []
        for v in public_catalog(self.s.catalog):
            hit = real.get(v["view_name"]) or real.get(sheet_url_name(v["view_name"])) or real_by_url.get(sheet_url_name(v["view_name"]))
            if not hit:
                self.unmatched.append(v["view_name"])
                continue
            out.append({**v, "luid": hit["id"], "content_url": hit.get("contentUrl")})
        return out


# Captions the embed and (by default) vf_ use. Our W1 flags get readable captions.
EXTRA_CAPTIONS = {f"in_n{d}": f"In N{d}" for d in (7, 14, 30, 60, 90)}


def caption(field: str) -> str:
    return CAPTION.get(field) or EXTRA_CAPTIONS.get(field) or field


def embed_src(s: Settings, view_name: str, content_url: str | None = None) -> str:
    """<server>/t/<site>/views/<Workbook>/<Sheet>. contentUrl from REST is 'HK_ELI/sheets/<Sheet>'."""
    if content_url and "/sheets/" in content_url:
        wb, sheet = content_url.split("/sheets/", 1)
    else:
        wb, sheet = s.workbook.replace(" ", ""), sheet_url_name(view_name)
    return f"{s.server}{s.site_prefix}/views/{quote(wb)}/{quote(sheet)}"
