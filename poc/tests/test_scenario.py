"""What-if simulation and the topic bundle of embedded views (mock workbook, rules mode, no network)."""
from datetime import date

import pytest
from fastapi.testclient import TestClient

from hkeli_poc import app as appmod
from hkeli_poc.mock_tableau import InProcessMock, embed_html
from hkeli_poc.stork import scenario as SC
from hkeli_poc.stork.pipeline import answer
from hkeli_poc.stork.understand import parse_shock, understand
from hkeli_poc.workbook import find_view, query_view

TODAY = date(2026, 11, 19)
Q_NVDA = "If NVDA falls below 10%, what happens? How many portfolios will change status?"


# ---------------------------------------------------------------- reading the question
@pytest.mark.parametrize("q,kind,ticker,move", [
    ("If NVDA falls below 10%, what happens?", "single", "NVDA UW", -0.10),
    ("What if Nvidia drops by 15%?", "single", "NVDA UW", -0.15),
    ("what if 9988 HK goes up 5%", "single", "9988 HK", 0.05),
    ("What if NVDA -12%", "single", "NVDA UW", -0.12),
    ("Simulate market spot at 80%", "market", None, -0.20),
    ("What if market spot is 0.9", "market", None, -0.10),
    ("What if the market falls 20%?", "market", None, -0.20),
    ("What happens if Tesla falls?", "single", "TSLA UW", None),
    ("What if market spot goes from 100% to 80%?", "market", None, -0.20),
    ("If I change the market spot from 100 to 80%, what changes?", "market", None, -0.20),
])
def test_shock_is_read_from_the_words(q, kind, ticker, move):
    it = understand(q, TODAY)
    assert it.intent == "scenario_analysis"
    assert (it.shock["kind"], it.shock["ticker"], it.shock["move"]) == (kind, ticker, move)
    assert it.wps is None   # the stock is the shocked underlying, not a WPS filter


def test_falls_below_is_read_as_a_drop_and_said_so():
    sh = parse_shock("If NVDA falls below 10%, what happens?", "NVDA UW")
    assert sh["move"] == -0.10 and "10% drop" in sh["assumption"]


def test_ordinary_questions_are_not_what_ifs():
    for q in ("What is total outstanding ELI?", "Which worst-performing stocks carry the most outstanding ELI?",
              "How much TRE ELI is predicted to mature in the next 7 days?"):
        assert understand(q, TODAY).intent != "scenario_analysis"


# ---------------------------------------------------------------- the engine
@pytest.mark.parametrize("sim,expect", [
    (105, "KO"), (100, "KO"), (99.9, "EXP"), (80, "EXP"), (79.9, "EXP(Below Strike)"), (60, "EXP(Below Strike)"),
    (59.9, "EX"),
])
def test_classify_follows_what_is_hk_eli_5_2(sim, expect):
    assert SC.classify(sim, strike=80, ko=100, ki=60, knocked_in=False)[0] == expect


def test_knocked_in_stays_knocked_in():
    assert SC.classify(70, strike=80, ko=100, ki=60, knocked_in=True)[0] == "EX"


def _positions():
    v = find_view("proposed", "ALL_position_scenario")
    cols, rows, _ = query_view("proposed", v, {"deal_status": ["LIVE"]})
    return SC.positions_from_rows(cols, rows)


def test_no_move_changes_nothing_and_matches_todays_results():
    pos = _positions()
    st = SC.step(pos, SC.Shock("market", move=0.0), 0.0)
    assert st["changed"]["positions"] == 0
    for s in SC.STATUSES:
        assert st["statuses"][s]["positions"] == sum(1 for p in pos if p["status"] == s)


def test_single_stock_moves_only_its_baskets_and_falls_are_monotone():
    res = SC.run(_positions(), SC.Shock("single", "NVDA UW", -0.10))
    assert res.universe["positions"] > 0 and len(res.moves) == 101 and res.moves[-1] == -1.0 and res.moves[res.asked_index] == -0.10
    counts = [g["changed"]["positions"] for g in res.grid]
    assert counts[0] == 0 and counts == sorted(counts)      # a lower level never improves a predicted result
    assert all(g["changed"]["better"] == 0 for g in res.grid)
    seg = sum(b["changed_hkd"] for b in res.grid[10]["by_segment"])
    assert abs(seg - res.grid[10]["changed"]["hkd"]) < 1


def test_every_step_has_checked_words_and_the_gate_rejects_new_numbers():
    res = SC.run(_positions(), SC.Shock("single", "NVDA UW", -0.10))
    assert all(g["narrative_checked"] for g in res.grid)
    assert len({g["narrative"] for g in res.grid}) > 10      # the words follow the slider
    assert not SC.figures_ok("42 positions change", ["41"])


def test_ladder_paths_follow_the_slider():
    res = SC.run(_positions(), SC.Shock("single", "NVDA UW", -0.20))
    row = res.ladder[0]
    assert len(row["path"]) == len(res.moves) and row["path"][0][1] == row["now"]["status"]


# ---------------------------------------------------------------- the workbook's Market Spot parameter
def test_market_spot_100_equals_todays_result_and_80_moves_some():
    v = find_view("proposed", "ALL_outstanding_simulation_n30d")
    cols, rows, _ = query_view("proposed", v, {"deal_status": ["LIVE"], "market_spot": ["1"]})
    ri, pi = cols.index("Predict Result"), cols.index("Predictive Result")
    assert all(r[ri] == r[pi] for r in rows)
    cols, rows, info = query_view("proposed", v, {"deal_status": ["LIVE"], "market_spot": ["80%"]})
    assert info["parameters"]["market_spot"] == 0.8 and any(r[ri] != r[pi] for r in rows)


def test_embed_page_shows_parameters_and_answers_runtime_calls():
    v = find_view("proposed", "ALL_outstanding_simulation_n30d")
    page = embed_html("proposed", v, {"deal_status": ["LIVE"], "market_spot": ["0.8"]}, [])
    assert "Market Spot = 80%" in page and "changeParameterValueAsync" in page and "firstinteractive" in page
    frag = embed_html("proposed", v, {"market_spot": ["0.8"]}, [], frame=False)
    assert "<html" not in frag and "Market Spot = 80%" in frag
    c = TestClient(appmod.app)
    r = c.get("/tableau/proposed/views/ALL_outstanding_simulation_n30d?deal_status=LIVE&market_spot=0.9&:fragment=1")
    assert r.status_code == 200 and "<html" not in r.text and "Market Spot = 90%" in r.text


# ---------------------------------------------------------------- the pipeline
def test_nvda_what_if_answers_with_counts_grid_and_reconciled_figures():
    a = answer(Q_NVDA, InProcessMock(), "proposed")
    assert a["status"] in ("OK", "OK_WITH_WARNING") and a["intent"] == "scenario_analysis"
    sc = a["scenario"]
    g = sc["grid"][sc["asked_index"]]
    assert sc["move"] == -0.10 and sc["checked"] and g["changed"]["positions"] > 0
    assert a["headline"] == g["narrative"] and "10% drop" in " ".join(a["bullets"] + a["assumptions"])
    checks = next(t for t in a["trace"] if t["name"] == "Validate")["detail"]["checks"]
    assert any("sheet Predictive Result = engine" in c and c.endswith("pass") for c in checks)
    assert any(c["code"] == "SIMULATED" for c in a["caveats"])
    # every view of the topic, the slider bound where the view can show the move
    embeds = a["embeds"]
    assert [e["record_id"] for e in embeds][:2] == ["position-scenario-all", "outstanding-wps-n30-all"]
    assert embeds[0]["bind"] == "shock_pct" and {p["name"] for p in embeds[0]["parameters"]} >= {"shock_ticker", "shock_pct"}
    assert embeds[1]["bind"] is None and embeds[1]["notes"]
    assert embeds[0]["filters"].get("in_shock_basket") == ["TRUE"]


def test_market_spot_what_if_binds_every_simulation_view():
    a = answer("What if the market spot is 80%?", InProcessMock(), "proposed")
    assert a["scenario"]["kind"] == "market" and a["scenario"]["control"]["name"] == "market_spot"
    binds = {e["record_id"]: e.get("bind") for e in a["embeds"]}
    assert binds["position-scenario-all"] == "market_spot" and binds["outstanding-wps-n30-all"] == "market_spot"


def test_todays_workbook_says_single_stock_needs_w8_and_offers_market_spot():
    a = answer("What if NVDA falls 10%?", InProcessMock(), "current")
    assert a["status"] == "UNSUPPORTED" and "W8" in a["headline"] and not a["numbers"]
    assert any("market spot" in f for f in a["followups"])
    m = answer("What if the market spot is 80%?", InProcessMock(), "current")
    assert m["status"] in ("OK", "OK_WITH_WARNING") and m["evidence"][0]["record_id"] == "outstanding-wps-n30-all"
    assert "W8" in m["headline"]


def test_no_size_asks_instead_of_guessing():
    a = answer("What happens if Tesla falls?", InProcessMock(), "proposed")
    assert a["status"] == "NEEDS_CLARIFICATION" and not a["numbers"]
    assert [o["question"] for o in a["clarify"]["options"]] == [f"What if TSLA UW falls {x}%?" for x in (5, 10, 20)]


def test_stock_in_no_basket_is_a_true_zero():
    a = answer("What if 9999 HK falls 10%?", InProcessMock(), "proposed")
    assert a["status"] == "NO_DATA" and "9999 HK" in a["headline"]


def test_topic_bundle_renders_every_maturity_view_with_the_same_filters():
    a = answer("Which branches in D1 have the largest TRE predicted maturity in the next 60 days?", InProcessMock(), "proposed")
    ids = [e["record_id"] for e in a["embeds"]]
    assert ids == ["maturity-branch-n30-tre", "maturity-calendar-n30-tre", "maturity-details-n30-tre"]
    for e in a["embeds"]:
        assert e["filters"]["cust_district"] == ["TRE-D1"] and e["filters"]["in_n60"] == ["TRUE"]
    assert a["embed"] == a["embeds"][0]


def test_topic_bundle_flags_a_view_that_cannot_take_the_scope():
    a = answer("Which branches in D1 have the largest TRE predicted maturity in the next 60 days?", InProcessMock(), "current")
    assert a["status"] == "UNSUPPORTED"     # fixed 30-day sheets: no embed at all, never a wrong scope
    assert not a.get("embeds")


def test_what_if_survives_the_model_reading():
    """With the gateway on, the model's intent is merged in; the what-if code read (stock, size) must win."""
    from hkeli_poc import knowledge as KB
    from hkeli_poc.stork.agent import merge_intent
    base = understand(Q_NVDA, TODAY)
    raw = {"intent": "scenario_analysis", "wps": "NVDA UW", "segments": [], "ranking": False}
    it, problems = merge_intent(base, raw, KB.load(), TODAY)
    assert problems == []
    assert it.shock == base.shock and it.shock["move"] == -0.10
    assert it.wps is None and it.intent == "scenario_analysis" and it.grain == "position"


@pytest.mark.parametrize("level,status", [(102.3, "KO"), (92.5, "EXP"), (75.0, "EXP(Below Strike)"), (72.1, "EXP(Below Strike)"), (69.9, "EX")])
def test_rules_match_the_documentation_extract(level, status):
    """Worked examples from the HK ELI documentation extract (KO 100%, strike 85%, KI 70%, not knocked in)."""
    assert SC.classify(level, 85.0, 100.0, 70.0, False)[0] == status


def test_every_slider_step_fits_the_tableau_parameter_ranges():
    """Real Tableau refuses changeParameterValueAsync outside a parameter's range, so the slider must stay inside it."""
    from hkeli_poc.stork.pipeline import PARAM_META
    for q in (Q_NVDA, "What if market spot goes from 100% to 80%?"):
        sc = answer(q, InProcessMock(), "proposed")["scenario"]
        for m in sc["moves"]:
            if sc["kind"] == "market":
                assert PARAM_META["market_spot"]["min"] <= round(1 + m, 2) <= PARAM_META["market_spot"]["max"]
            else:
                assert PARAM_META["shock_pct"]["min"] <= m <= PARAM_META["shock_pct"]["max"]
