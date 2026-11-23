"""Golden figures for the intent bench, from plain Python over the mock dataset.

This file does not import the pipeline, the planner, the mock workbook's query engine or the what-if
engine. It reads the raw synthetic rows (hkeli_poc.data) and applies the business definitions from the
discovery docs directly, so a bench pass means two independent routes reached the same figure.

golden(intent, slots) returns the expected first figure of the answer (numbers[0].value), or None when the
bench does not check a figure for that reading.
"""
from __future__ import annotations

from collections import defaultdict

from hkeli_poc.data import dataset

TRE = "Treasures(HK)"


def _rows():
    return dataset(False).rows


def _bd():
    return dataset(False).business_date


def _live(rows):
    return [r for r in rows if r["deal_status"] == "LIVE"]


def _in_window(r, days):
    return 0 < (r["predict_maturity"] - _bd()).days <= days


def _seg(rows, segs):
    return [r for r in rows if not segs or r["bp_div_type"] in segs]


def _place(rows, s):
    if s.get("district"):
        rows = [r for r in rows if r["cust_district"] == s["district"]]
    if s.get("branch"):
        rows = [r for r in rows if r["cust_branch"] == s["branch"]]
    return rows


def _hkd(rows):
    return sum(r["volume_bu"] for r in rows)


def _max_group(rows, key):
    g = defaultdict(float)
    for r in rows:
        g[r[key]] += r["volume_bu"]
    return max(g.values()) if g else None


def golden(intent: str, s: dict):
    segs = s.get("segments") or []
    live = _live(_rows())
    w = s.get("window_days")
    if intent == "outstanding_total":
        return _hkd(_seg(live, segs))
    if intent == "segment_share":
        if len(segs) != 1:
            return None
        return round(_hkd(_seg(live, segs)) / _hkd(live), 4)
    if intent == "segment_result_share":
        rows = [r for r in _seg(live, segs) if not s.get("result") or r["predict_result"] == s["result"]]
        return round(_hkd(rows) / _hkd(live), 4) if len(segs) == 1 else None
    if intent == "customer_count":
        rows = [r for r in _seg(live, segs) if not s.get("result") or r["predict_result"] == s["result"]]
        return len({r["cif_id"] for r in rows}) if segs else None
    tre_window = [r for r in live if r["bp_div_type"] == TRE and _in_window(r, w or 30)]
    if intent == "customer_count_maturity":
        return len({r["cif_id"] for r in _place(tre_window, s)})
    if intent == "maturity_calendar":
        return _hkd(_place(tre_window, s))
    if intent == "maturity_branch":
        return _max_group(_place(tre_window, s), "cust_branch")
    if intent == "maturity_detail":
        rows = [r for r in _place(tre_window, s) if not s.get("wps") or r["wps"] == s["wps"]]
        return len(rows)
    if intent == "district":
        rows = [r for r in _seg(live, segs) if r["bp_div_type"] != "Treasures(TPC)" and r["cust_district"]]
        return _max_group(rows, "cust_district")
    if intent == "wps_exposure":
        rows = _seg(live, segs)
        if segs == [TRE]:
            rows = [r for r in rows if _in_window(r, w or 30)]
        rows = [r for r in _place(rows, s) if not s.get("wps") or r["wps"] == s["wps"]]
        return _max_group(rows, "wps")
    if intent == "mtm_distribution":
        rows = [r for r in _place(_seg(live, segs), s) if not s.get("wps") or r["wps"] == s["wps"]]
        return _hkd(rows)
    if intent == "data_recency":
        return max(r["trade_date"] for r in _rows()).isoformat()
    if intent == "data_as_of":
        return _bd().isoformat()
    return None


def same(expected, got) -> bool:
    if expected is None:
        return True
    if isinstance(expected, str) or isinstance(got, str):
        return str(expected) == str(got)
    return abs(float(got) - float(expected)) <= max(0.5, abs(float(expected)) * 1e-6) or \
        (abs(float(expected)) < 2 and abs(float(got) - float(expected)) < 6e-5)
