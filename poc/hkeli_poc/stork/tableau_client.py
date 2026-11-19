"""Step 7: Tableau gateway (C11). Signs in as the user and calls Query View Data.

In production this mints a Connected App JWT with sub = the user, so Tableau
row-level security applies. Here it signs in to the mock server. The HTTP
session is injected so the same code runs against the in-process mock, a
separately started mock, or (later) a real server.
"""
from __future__ import annotations

import csv
import io
import re
import time
from datetime import datetime

API = "/tableau/api/3.24"


class TableauError(Exception):
    def __init__(self, code: str, msg: str):
        super().__init__(msg)
        self.code = code


class TableauClient:
    def __init__(self, http, site: str, user: str = "demo.user", scenario: str | None = None):
        self.http, self.site, self.user, self.scenario = http, site, user, scenario
        self._token = None

    def _auth(self):
        if not self._token:
            r = self.http.post(f"{API}/auth/signin", json={"credentials": {"user": self.user, "site": self.site}})
            if r.status_code != 200:
                raise TableauError("TABLEAU_AUTH_ERROR", "Sign-in failed")
            self._token = r.json()["credentials"]["token"]
        return {"X-Tableau-Auth": self._token}

    def views(self) -> list[dict]:
        r = self.http.get(f"{API}/sites/{self.site}/views", headers=self._auth())
        if r.status_code != 200:
            raise TableauError("TABLEAU_QUERY_ERROR", f"View list failed: {r.status_code}")
        return r.json()["views"]["view"]

    def view_data(self, luid: str, vf_query: str):
        url = f"{API}/sites/{self.site}/views/{luid}/data"
        q = vf_query
        if self.scenario:
            q = (q + "&" if q else "") + f"scenario={self.scenario}"
        full = f"{url}?{q}" if q else url
        t0 = time.perf_counter()
        r = self.http.get(full, headers=self._auth())
        ms = round((time.perf_counter() - t0) * 1000)
        if r.status_code == 404:
            raise TableauError("TABLEAU_VIEW_NOT_FOUND", "View not found")
        if r.status_code != 200:
            raise TableauError("TABLEAU_QUERY_ERROR", f"Query failed: {r.status_code}")
        text = r.text
        reader = list(csv.reader(io.StringIO(text)))
        cols, rows = (reader[0], reader[1:]) if reader else ([], [])
        # Transport completeness (04 RQ 11.3 layer 1): every row has the header's width.
        if any(len(x) != len(cols) for x in rows):
            raise TableauError("RESULT_SCHEMA_MISMATCH", "Ragged CSV")
        cols = [_header(c) for c in cols]
        rows = [[_clean(c, v) for c, v in zip(cols, r)] for r in rows]
        return {"columns": cols, "rows": rows, "url": full, "ms": ms, "bytes": len(text)}


_US_DATE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")
_NUM = re.compile(r"^-?[\d,]+(\.\d+)?%?$")


def _clean(col: str, v: str) -> str:
    """Normalise real-server CSV formatting: US dates to ISO, '1,234' to '1234', '38.5%' to '0.385'.
    The mock already returns plain values, so this changes nothing there."""
    v = v.strip()
    m = _US_DATE.match(v)
    if m:
        return datetime(int(m.group(3)), int(m.group(1)), int(m.group(2))).date().isoformat()
    if col != "MTM% (bin)" and _NUM.match(v) and ("," in v or v.endswith("%")):
        n = float(v.rstrip("%").replace(",", ""))
        return repr(n / 100) if v.endswith("%") else (str(int(n)) if n.is_integer() else repr(n))
    return v


_AGG = re.compile(r"^(SUM|AVG|MIN|MAX|ATTR|AGG|CNTD|COUNTD|CNT|COUNT)\((.+)\)$", re.I)
_PREFIX = re.compile(r"^(Sum of |Min\. |Max\. |Attr\. |Agg\. )")


def _header(c: str) -> str:
    """Map the header spellings a real export may use onto the contract names the pipeline reads."""
    c = c.strip()
    m = _AGG.match(c)
    if m:
        agg, name = m.group(1).upper(), m.group(2).strip()
        if agg in ("CNTD", "COUNTD"):
            return "Count of Asset Id" if name == "Asset Id" else f"Distinct count of {name}"
        if agg in ("CNT", "COUNT"):
            return f"Count of {name}"
        if agg == "AVG":
            return f"Avg. {name}"
        return name
    if c == "Distinct count of Asset Id":
        return "Count of Asset Id"
    return _PREFIX.sub("", c)
