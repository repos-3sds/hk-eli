"""Intent understanding: normaliser, scope guard, rule confidence, 'Did you mean' readings, the guarded model
step, and the variant bench (tests/bench). Model calls go to a fake gateway; nothing touches the network."""
import json
import sys
from datetime import date
from pathlib import Path

import httpx
import pytest

from hkeli_poc import knowledge as KB
from hkeli_poc.config import LLMSettings
from hkeli_poc.llm import GatewayClient, OffClient
from hkeli_poc.mock_tableau import InProcessMock
from hkeli_poc.stork import agent
from hkeli_poc.stork.pipeline import answer
from hkeli_poc.stork.understand import Intent, canonical, normalise, understand

sys.path.insert(0, str(Path(__file__).parent / "bench"))
import bench  # noqa: E402

TODAY = date(2026, 11, 19)


def ask(q, llm=None):
    return answer(q, InProcessMock(), "proposed", llm=llm or OffClient())


def gateway(replies, sent=None):
    """Fake Gemini gateway: each call takes the next reply (dict -> JSON, int -> HTTP status)."""
    replies = list(replies)

    def handler(req):
        if sent is not None:
            sent.append(json.loads(req.content))
        r = replies.pop(0)
        if isinstance(r, int):
            return httpx.Response(r)
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(r)}]}}]})
    s = LLMSettings(mode="gateway", gateway_url="https://gw.example", path_template="/v1/models/{model}:generateContent",
                    model="gemini-test", api_key="k", max_retries=0, timeout_s=2)
    return GatewayClient(s, http=httpx.Client(transport=httpx.MockTransport(handler)))


def reply(intent, conf="high", alts=(), **kw):
    return {"intent": intent, "segments": kw.pop("segments", []), "ranking": False, "needs_clarification": False,
            "confidence": conf, "alternatives": list(alts), **kw}


# ---------------------------------------------------------------- normaliser
@pytest.mark.parametrize("q,want,fixed", [
    ("TRE o/s amt pls", "tre outstanding amount", []),
    ("D1 TRE cust maturing nxt 30d how many ah?", "d1 tre customers maturing next 30 days how many ?", []),
    ("How many TRE custmers are predicted to KO?", "how many tre customers are predicted to ko?", [("custmers", "customers")]),
    ("Which brnaches in D1", "which branches in d1", [("brnaches", "branches")]),
])
def test_normalise_expands_shorthand_and_fixes_keywords(q, want, fixed):
    s, fixes = normalise(q, KB.load())
    assert s == want
    assert [(f["from"], f["to"]) for f in fixes] == fixed


@pytest.mark.parametrize("word", ["portion", "portfolios", "nvidia", "alibaba", "kowloon", "suppose", "notional"])
def test_normalise_leaves_real_words_alone(word):
    s, fixes = normalise(f"what {word} is there", KB.load())
    assert word in s and fixes == []


def test_typo_fix_is_said_in_the_answer():
    a = ask("How many TRE custmers are predicted to KO?")
    assert a["status"] == "OK" and "Read 'custmers' as 'customers'." in a["assumptions"]


# ---------------------------------------------------------------- scope guard
@pytest.mark.parametrize("q,rule", [
    ("Sell the worst-performing stocks in the book", "action_request"),
    ("If NVDA falls 10%, automatically sell all NVDA ELIs", "action_request"),
    ("Please unwind the Tesla positions", "action_request"),
    ("Show me the home addresses of TRE clients", "personal_data"),
    ("Which stocks should we buy next?", "advice"),
    ("What is the total outstanding for bonds?", "other_products"),
    ("What if interest rates rise 1%?", "non_stock_driver"),
    ("How much TRE ELI matured last year?", "matured_history"),
])
def test_out_of_scope_and_unauthorized_are_refused_without_figures(q, rule):
    it = understand(q, TODAY)
    assert rule in [u["id"] for u in it.unsupported]
    a = ask(q)
    assert a["status"] == "UNSUPPORTED" and not a["numbers"] and not a["evidence"]


@pytest.mark.parametrize("q", ["Give me the client and RM list for Alibaba maturing next month",
                               "When was the most recent ELI trade booked?", "Show me the MTM distribution on 9988 HK",
                               "Run a stress test with the whole market down 20%."])
def test_reads_are_not_mistaken_for_actions(q):
    assert not understand(q, TODAY).unsupported


# ---------------------------------------------------------------- confidence and readings
def test_confidence_high_single_reading_and_medium_two_readings():
    assert understand("What is total outstanding ELI?", TODAY).confidence == "high"
    it = understand("Which TRE branches in D1 have the biggest WPS exposure maturing in the next 30 days?", TODAY)
    assert it.confidence == "medium" and it.candidates[:2] == ["wps_exposure", "maturity_branch"]
    assert understand("Tell me a joke", TODAY).confidence == "none"


def test_values_without_a_question_get_did_you_mean_chips_offline():
    a = ask("TRE Wan Chai")
    assert a["status"] == "NEEDS_CLARIFICATION" and a["reasons"] == ["INTENT_UNSURE"] and not a["numbers"]
    opts = a["clarify"]["options"]
    assert 2 <= len(opts) <= 3 and opts[0]["intent"] == "maturity_branch"
    assert a["headline"].startswith("I can read that a few ways")


def test_no_signals_keeps_the_general_rephrase_message():
    a = ask("Tell me a joke")
    assert a["status"] == "NEEDS_CLARIFICATION" and a["reasons"] == ["AMBIGUOUS_INTENT"] and "clarify" not in a


SLOTS = [dict(), dict(segments=["Treasures(HK)"]), dict(segments=["PB"], result="EX"),
         dict(segments=["Treasures(HK)"], district="TRE-D2", window_days=14),
         dict(segments=["Treasures(HK)"], branch="Mong Kok", window_days=7), dict(wps="9988 HK", window_days=30)]


@pytest.mark.parametrize("slots", SLOTS, ids=[str(i) for i in range(len(SLOTS))])
def test_every_chip_question_reads_back_as_its_reading(slots):
    """Pressing a chip must answer what the chip says: its question reads back as that intent, confidently."""
    for iid in KB.load().intent_ids:
        if iid in ("unknown", "scenario_analysis"):
            continue
        q = canonical(iid, Intent(question="x", **slots))
        it = understand(q, TODAY)
        assert (it.intent, it.confidence) == (iid, "high"), q
        for k in CARRIES.get(iid, ()):
            if slots.get(k):
                assert getattr(it, k) == slots[k], (q, k)


# the filters each chip question carries over (others don't apply to that view)
CARRIES = {"customer_count_maturity": ("district", "branch", "window_days"), "maturity_calendar": ("district", "branch", "window_days"),
           "maturity_branch": ("district", "window_days"), "maturity_detail": ("district", "branch", "wps", "window_days"),
           "mtm_distribution": ("wps", "district", "branch"), "segment_result_share": ("result",), "customer_count": ("result",)}


def test_pressing_each_chip_gives_an_answer():
    a = ask("TRE Wan Chai")
    for o in a["clarify"]["options"]:
        b = ask(o["question"])
        assert b["intent"] == o["intent"] and b["status"] in ("OK", "OK_WITH_WARNING"), o


# ---------------------------------------------------------------- the guarded model step
def test_confident_rules_make_no_model_call():
    a = ask("What is total outstanding ELI?", gateway([{"headline": "x", "bullets": []}]))
    assert a["meta"]["understanding"] == "rules"
    assert [c.prompt_id for c in a["_llm_calls"]] == ["write_answer"]


def test_model_resolves_a_reading_the_rules_were_unsure_about():
    sent = []
    q = "Which TRE branches in D1 have the biggest WPS exposure maturing in the next 30 days?"
    a = ask(q, gateway([reply("maturity_branch", segments=["Treasures(HK)"], district="TRE-D1"), 500], sent))
    assert a["meta"]["understanding"] == "gateway" and a["intent"] == "maturity_branch" and a["status"] == "OK"
    user = sent[0]["contents"][0]["parts"][0]["text"]
    assert "Worked examples" in user and "wps_exposure, maturity_branch" in user   # few-shot and the rules' reading


def test_model_sure_where_rules_found_nothing_is_used_and_said():
    q = "Is the dataset current or stale?"
    assert understand(q, TODAY).intent == "unknown"
    a = ask(q, gateway([reply("data_as_of"), 500]))
    assert a["intent"] == "data_as_of" and a["status"] == "OK" and "Read as 'data as of'." in a["assumptions"]


def test_model_unsure_where_rules_found_nothing_asks_with_its_readings():
    q = "Roughly what slice of the ELI book belongs to Private Banking?"
    a = ask(q, gateway([reply("segment_share", "low", ["outstanding_total"], segments=["PB"])]))
    assert a["status"] == "NEEDS_CLARIFICATION" and a["reasons"] == ["INTENT_UNSURE"]
    assert [o["intent"] for o in a["clarify"]["options"]][:2] == ["segment_share", "outstanding_total"]


def test_rules_and_model_disagree_asks_with_both_readings():
    q = "Which TRE branches in D1 have the biggest WPS exposure maturing in the next 30 days?"
    a = ask(q, gateway([reply("district", "high")]))
    assert a["status"] == "NEEDS_CLARIFICATION" and not a["numbers"] and not a["evidence"]
    assert [o["intent"] for o in a["clarify"]["options"]][:2] == ["district", "wps_exposure"]


@pytest.mark.parametrize("bad,problem", [
    (reply("sell_more_eli"), "INTENT_NOT_ALLOWED"),
    (reply("maturity_branch", alts=["make_up_a_view"]), "ALTERNATIVE_NOT_ALLOWED"),
    (reply("maturity_branch", district="TRE-D9"), "DISTRICT_NOT_ALLOWED"),
])
def test_model_reply_outside_the_list_falls_back_to_rules(bad, problem):
    q = "Which TRE branches in D1 have the biggest WPS exposure maturing in the next 30 days?"
    a = ask(q, gateway([bad, 500]))
    assert a["meta"]["understanding"] == "gateway->rules" and a["intent"] == "wps_exposure"
    assert a["_llm_calls"][0].outcome == "rejected" and problem in a["_llm_calls"][0].detail


def test_model_cannot_pick_the_view():
    """A 'view' in the model's reply is ignored: code routes from the intent."""
    q = "Which TRE branches in D1 have the biggest WPS exposure maturing in the next 30 days?"
    a = ask(q, gateway([dict(reply("maturity_branch", segments=["Treasures(HK)"]), view="max-trade-date"), 500]))
    assert a["evidence"][0]["record_id"] == "maturity-branch-n30-tre"


def test_offline_model_off_falls_back_to_rules_everywhere():
    res = bench.run(lambda q: ask(q, OffClient()))
    assert res["total"]["llm_calls"] == 0


# ---------------------------------------------------------------- the variant bench
def test_bench_rules_mode_scores_above_the_floor():
    """Rules only, offline. Before this change: 84 of 168. The floor stops a change from quietly losing ground."""
    res = bench.run(lambda q: ask(q))
    fails = [(r["variant"], r["q"], r["problems"]) for r in res["rows"] if not r["pass"]]
    assert res["total"]["passed"] >= 160, fails
    assert res["by_variant"]["base"]["pass"] == 24 and res["by_variant"]["unauthorized"]["pass"] == 24, fails


def test_holdout_rules_mode_no_worse_than_measured():
    """Held-out wordings the rules were not tuned on. Measured 38 of 42 with 2 wrong; a wrong answer is worse
    than asking back, so that count may not grow."""
    res = bench.run(lambda q: ask(q), which="holdout")
    assert res["total"]["passed"] >= 38 and res["total"]["wrong"] <= 2, [r for r in res["rows"] if not r["pass"]]


def test_must_fail_made_up_figures_never_reach_the_answer():
    """A model that reads every question as 'high confidence' and words every answer with an invented figure:
    the number check must keep every made-up figure out, and bad readings must not produce figures."""
    class Liar:
        enabled, model, provider = True, "liar", "test"

        def generate_json(self, system, user, schema):
            if "headline" in json.dumps(schema):
                return {"headline": "Central leads with HKD 987.6M and 4321 clients.", "bullets": ["Up 55.5% on last week."]}
            return reply("maturity_detail", "high")
    res = bench.run(lambda q: ask(q, Liar()))
    for r in res["rows"]:
        assert "987.6" not in r["problems"]
    for c in bench.cases()[:40]:
        a = ask(c["q"], Liar())
        text = " ".join([a["headline"]] + a.get("bullets", []))
        assert "987.6" not in text and "4321" not in text and "55.5" not in text, c["q"]


def test_bench_writes_an_excel_summary(tmp_path):
    res = bench.run(lambda q: ask(q))
    p = tmp_path / "bench.xlsx"
    bench.write_xlsx(p, {"rules": res})
    import zipfile
    with zipfile.ZipFile(p) as z:
        assert {"xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"} <= set(z.namelist())
        assert b"Pass rate" in z.read("xl/worksheets/sheet1.xml")
