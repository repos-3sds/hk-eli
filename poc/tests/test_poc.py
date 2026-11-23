"""End-to-end tests: each W demo breaks on today's workbook and is fixed by the change.

Run: cd poc && python -m pytest -q
"""
import pytest
from fastapi.testclient import TestClient

from hkeli_poc.app import app
from hkeli_poc.workbook import VIEWS, find_view, query_view

client = TestClient(app)


def demo(i):
    r = client.get(f"/api/demos/{i}")
    assert r.status_code == 200
    j = r.json()
    return j["current"], j["proposed"]


def codes(a):
    return {c["code"] for c in a["caveats"]}


def test_twelve_views_today_fourteen_with_w2_and_w8():
    assert len(VIEWS["current"]) == 12
    assert len(VIEWS["proposed"]) == 14


def test_vf_is_exact_match_and_unknown_field_is_ignored():
    v = find_view("current", "ALL_outstanding_District_n30d")
    _, rows_all, _ = query_view("current", v, {})
    _, rows_live, info = query_view("current", v, {"deal_status": ["LIVE"]})
    assert rows_all == rows_live and info["ignored_filters"] == ["deal_status"]


def test_w1_window_beyond_30_days():
    cur, pro = demo("w1")
    assert cur["status"] == "UNSUPPORTED" and "INVALID_TIME_SCOPE" in cur["reasons"]
    assert pro["status"] == "OK" and "vf_in_n60=TRUE" in pro["evidence"][0]["request"]
    assert pro["embed"]["filters"]["in_n60"] == ["TRUE"]


def test_w2_stale_data_is_flagged():
    cur, pro = demo("w2")
    assert "AS_OF_UNKNOWN" in codes(cur) and "DATE_LIST_WORKAROUND" in codes(cur)
    assert "STALE_DATA" in codes(pro) and pro["as_of"]["business_date"] == "2026-11-15"


def test_w3_duplicate_id_hides_customer_view():
    cur, pro = demo("w3")
    assert cur["status"] == "UNSUPPORTED" and "REGISTRY_COLLISION" in cur["reasons"]
    assert pro["status"] == "OK" and pro["numbers"][0]["measure"] == "customers"


def test_w4_control_total():
    cur, pro = demo("w4")
    assert "CONTROL_TOTAL_MISMATCH" in codes(cur) and "POPULATION_UNDECLARED" in codes(cur)
    assert "CONTROL_TOTAL_OK" in codes(pro) and pro["status"] == "OK"


def test_w5_share_needs_exportable_field():
    cur, pro = demo("w5")
    assert cur["status"] == "UNSUPPORTED" and "TABLE_CALC_NOT_EXPORTED" in cur["reasons"]
    share = next(n for n in pro["numbers"] if n["measure"] == "share")
    assert 0 < share["value"] < 1


def test_w6_chart_scope():
    cur, pro = demo("w6")
    assert cur["embed"]["scope_equivalent"] is False and "SCOPE_MISMATCH" in codes(cur)
    assert pro["embed"]["scope_equivalent"] is True


def test_w7_customer_count():
    cur, pro = demo("w7")
    assert cur["status"] == "UNSUPPORTED" and "MEASURE_NOT_PUBLISHED" in cur["reasons"]
    assert pro["numbers"][0]["measure"] == "customers"


def test_share_denominator_survives_segment_filter_with_fixed_lod():
    v = find_view("proposed", "#all_outatanding_segment")
    cols, rows, _ = query_view("proposed", v, {"bp_div_type": ["Treasures(HK)"]})
    share = float(rows[0][cols.index("Share Of All Segments")])
    assert share < 0.9  # a table calc would show 1.0 here


@pytest.mark.parametrize("q,status", [
    ("What is total outstanding ELI?", "OK"),
    ("Who are the PB clients maturing next week?", "UNSUPPORTED"),
    ("Tell me a joke", "NEEDS_CLARIFICATION"),
    ("Show me the distribution on 9988 HK", "OK"),
    ("Which WPS has the largest outstanding ELI exposure overall?", "OK"),
    ("How fresh is the data?", "OK"),
])
def test_other_questions(q, status):
    a = client.post("/api/ask", json={"question": q, "site": "proposed"}).json()
    assert a["status"].startswith(status), (q, a["status"], a["headline"])


def test_numbers_in_headline_come_from_numbers_list():
    a = client.post("/api/ask", json={"question": "Which branches in D1 have the largest TRE maturity in the next 30 days?",
                                      "site": "proposed"}).json()
    for n in a["numbers"]:
        assert n["display"] in a["headline"]


def test_rest_requires_signin():
    assert client.get("/tableau/api/3.24/sites/current/views").status_code == 401
