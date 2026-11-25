"""Conversation state: every turn of a thread is read against the thread, by code, before any data call.

The first test is the 8-turn thread measured live on 25 Nov 2026, where both Dify apps dropped scope
(turn 4 listed all 124 TRE customers instead of the Wan Chai ones, with a normal status).
"""
import pytest
from fastapi.testclient import TestClient

from hkeli_poc import app as appmod
from hkeli_poc.stork import thread as TH
from hkeli_poc.stork.pipeline import demo_today


@pytest.fixture()
def c():
    appmod.ensure_started()
    return TestClient(appmod.app)


def talk(c, turns, conv=None, user=None, engine=None):
    out = []
    h = {"X-Demo-User": user} if user else {}
    for q in turns:
        body = {"question": q}
        if conv:
            body["conversation_id"] = conv
        if engine:
            body["engine"] = engine
        r = c.post("/api/v1/ask", json=body, headers=h)
        assert r.status_code == 200, r.text
        a = r.json()
        conv = a["conversation_id"]
        out.append(a)
    return out


def read(a):
    return (a.get("thread_view") or {}).get("read_as") or a["question"]


def slots(a):
    return a.get("slots") or {}


# ---------------------------------------------------------------- the live failure, turn by turn
THREAD = ["How much TRE ELI is predicted to mature in the next 7 days?",
          "and for the next 30 days?",
          "only Wan Chai",
          "which clients are those?",
          "what about TPC instead?",
          "go back to the first question",
          "now what is total outstanding ELI?",
          "for Treasures only"]


def test_hawk_thread_keeps_scope_on_every_turn(c):
    a = talk(c, THREAD)
    # 1 the topic
    assert a[0]["intent"] == "maturity_calendar" and slots(a[0])["window_days"] == 7
    # 2 refine the window, keep TRE
    assert a[1]["intent"] == "maturity_calendar" and slots(a[1])["window_days"] == 30
    assert slots(a[1])["segments"] == ["Treasures(HK)"] and a[1]["status"].startswith("OK")
    # 3 narrow to a branch, keep TRE and 30 days
    assert slots(a[2])["branch"] == "Wan Chai" and slots(a[2])["window_days"] == 30
    assert a[2]["intent"] == "maturity_calendar"
    assert "Wan Chai" in a[2]["thread_view"]["read_as"]
    # 4 drill: the clients behind that figure, still Wan Chai and 30 days (live: dropped Wan Chai, 124 customers)
    assert a[3]["intent"] == "maturity_detail"
    assert slots(a[3])["branch"] == "Wan Chai" and slots(a[3])["window_days"] == 30
    assert "Wan Chai" in " ".join(a[3]["thread_view"]["carried"])
    # 5 TPC has no maturity figure: say so, change nothing (live: silently switched measure)
    assert a[4]["status"] == "UNSUPPORTED" and "Treasures (HK) only" in a[4]["headline"]
    assert "Wan Chai" in a[4]["headline"]
    # 6 back to the first question
    assert read(a[5]) == THREAD[0] and slots(a[5])["window_days"] == 7 and not slots(a[5]).get("branch")
    # 7 a new topic resets the scope
    assert a[6]["intent"] == "outstanding_total" and not slots(a[6]).get("branch")
    assert not a[6]["thread_view"]["carried"]
    # 8 refine the new topic
    assert a[7]["intent"] == "outstanding_total" and slots(a[7])["segments"] == ["Treasures(HK)"]
    # one conversation throughout
    assert len({x["conversation_id"] for x in a}) == 1


def test_drill_figures_match_the_refined_total(c):
    """The client list after "only Wan Chai" is the Wan Chai list, not the whole TRE book."""
    a = talk(c, THREAD[:4])
    alone = talk(c, ["Which TRE clients at Wan Chai are maturing in the next 30 days?"])[0]
    whole = talk(c, ["Which TRE clients are maturing in the next 30 days?"])[0]
    assert a[3]["numbers"] == alone["numbers"]
    assert a[3]["numbers"] != whole["numbers"]


def test_every_carried_value_is_shown(c):
    a = talk(c, THREAD[:3])
    assert any(x.startswith("Continuing:") and "TRE" in x and "Wan Chai" in x and "next 30 days" in x
               for x in a[2]["assumptions"])
    assert "Start a new topic" in a[2]["followups"]


# ---------------------------------------------------------------- stages
def test_new_topic_after_long_thread_carries_nothing(c):
    a = talk(c, ["How much TRE ELI is predicted to mature in the next 7 days?", "only Wan Chai",
                 "Which worst-performing stocks carry the most outstanding ELI?"])
    assert a[2]["intent"] == "wps_exposure" and not slots(a[2]).get("branch")
    assert not a[2]["thread_view"]["carried"]


def test_replace_only_the_kind_named(c):
    a = talk(c, ["How much TRE ELI at Wan Chai is predicted to mature in the next 7 days?", "make it 14 days"])
    assert slots(a[1])["branch"] == "Wan Chai" and slots(a[1])["window_days"] == 14
    a = talk(c, ["How much TRE ELI at Wan Chai is predicted to mature in the next 7 days?", "what about D2?"])
    assert slots(a[1]).get("district") == "TRE-D2" and not slots(a[1]).get("branch")
    assert slots(a[1])["window_days"] == 7


def test_date_replaces_window(c):
    a = talk(c, ["How much TRE ELI is predicted to mature in the next 30 days?", "and on 24 Nov?"])
    assert slots(a[1])["on_date"] == "2026-11-24" and not slots(a[1]).get("window_days")


def test_standing_focus_applies_until_cleared(c):
    a = talk(c, ["Let's focus on TRE in D1 from now on",
                 "How much is predicted to mature in the next 30 days?",
                 "Which worst-performing stocks carry the most outstanding ELI?",
                 "clear the focus",
                 "Which worst-performing stocks carry the most outstanding ELI?"])
    assert a[0]["status"] == "OK" and "From now on" in a[0]["headline"] and not a[0]["numbers"]
    assert slots(a[1]).get("district") == "TRE-D1" and a[1]["intent"] == "maturity_calendar"
    assert slots(a[2]).get("district") == "TRE-D1" and slots(a[2])["segments"] == ["Treasures(HK)"]
    assert a[3]["thread_view"]["stage"] == "clear"
    assert not slots(a[4]).get("district")


def test_named_value_beats_the_focus(c):
    a = talk(c, ["Focus on D1 from now on", "How much TRE ELI in D3 is predicted to mature in the next 30 days?"])
    assert slots(a[1])["district"] == "TRE-D3"


def test_go_back_to_previous_topic(c):
    a = talk(c, ["What is total outstanding ELI?",
                 "How much TRE ELI is predicted to mature in the next 7 days?",
                 "go back to the previous question"])
    assert a[2]["intent"] == "outstanding_total"


def test_pick_a_reading_by_number(c):
    a = talk(c, ["Tell me about Wan Chai"])
    assert a[0]["status"] == "NEEDS_CLARIFICATION"
    want = a[0]["clarify"]["options"][1]["question"]
    b = talk(c, ["the second one"], conv=a[0]["conversation_id"])[0]
    assert read(b) == want and b["status"].startswith("OK")


def test_no_second_clarification_loop(c):
    a = talk(c, ["Tell me about Wan Chai", "Tell me about Wan Chai"])
    assert a[0]["status"] == "NEEDS_CLARIFICATION"
    assert a[1]["status"].startswith("OK")
    assert a[1]["assumptions"][0].startswith("Read as:")


def test_refusal_does_not_move_the_topic(c):
    a = talk(c, ["How much TRE ELI is predicted to mature in the next 7 days?",
                 "Should my client buy the NVDA ELI?",
                 "only Wan Chai"])
    assert a[2]["intent"] == "maturity_calendar" and slots(a[2])["window_days"] == 7
    assert slots(a[2])["branch"] == "Wan Chai"


# ---------------------------------------------------------------- isolation and length
def test_threads_and_users_stay_apart(c):
    x = talk(c, ["How much TRE ELI is predicted to mature in the next 7 days?", "only Wan Chai"])
    y = talk(c, ["How much TRE ELI is predicted to mature in the next 30 days?"])
    y2 = talk(c, ["and for D2?"], conv=y[0]["conversation_id"])[0]
    assert slots(y2)["window_days"] == 30 and not slots(y2).get("branch")
    # another user cannot read or continue someone else's thread
    assert appmod._thread_state("demo.user", x[0]["conversation_id"])["frame"]["slots"]["branch"] == "Wan Chai"
    assert appmod._thread_state("other.user", x[0]["conversation_id"]) is None
    assert appmod.S.store.conversation("other.user", x[0]["conversation_id"]) != x[0]["conversation_id"]


def test_state_survives_a_restart(c):
    a = talk(c, ["How much TRE ELI is predicted to mature in the next 7 days?", "only Wan Chai"])
    TH_state = appmod._thread_state("demo.user", a[1]["conversation_id"])
    assert TH_state["frame"]["slots"]["branch"] == "Wan Chai"   # read back from the store, not from memory


@pytest.mark.parametrize("n", [5, 10, 20, 50])
def test_long_thread_scope_never_drifts(c, n):
    """Refine, drill, replace, go back and new topics in a loop: the scope is right on every turn."""
    cycle = [("How much TRE ELI is predicted to mature in the next 7 days?", {"window_days": 7}, None),
             ("only Wan Chai", {"window_days": 7, "branch": "Wan Chai"}, "maturity_calendar"),
             ("which clients are those?", {"window_days": 7, "branch": "Wan Chai"}, "maturity_detail"),
             ("make it 14 days", {"window_days": 14, "branch": "Wan Chai"}, "maturity_detail"),
             ("What is total outstanding ELI?", {}, "outstanding_total"),
             ("for TPC", {"segments": ["Treasures(TPC)"]}, "outstanding_total"),
             ("go back to the first question", {"window_days": 7}, "maturity_calendar")]
    turns = [cycle[i % len(cycle)] for i in range(n)]
    a = talk(c, [q for q, _, _ in turns])
    for i, ((q, want, intent), x) in enumerate(zip(turns, a)):
        for k, v in want.items():
            assert slots(x).get(k) == v, (i, q, k, slots(x))
        if "branch" not in want:
            assert not slots(x).get("branch"), (i, q)
        if intent:
            assert x["intent"] == intent, (i, q, x["intent"])
    st = appmod._thread_state("demo.user", a[-1]["conversation_id"])
    assert len(st["recent"]) <= TH.MAX_RECENT and len(st["stack"]) <= TH.MAX_STACK


# ---------------------------------------------------------------- unit
def test_compose_reads_back_the_same():
    d = demo_today()
    for intent, s in [("maturity_calendar", {"segments": ["Treasures(HK)"], "branch": "Wan Chai", "window_days": 30}),
                      ("maturity_detail", {"segments": ["Treasures(HK)"], "district": "TRE-D2", "window_days": 7}),
                      ("outstanding_total", {"segments": ["Treasures(TPC)"]}),
                      ("customer_count", {"segments": ["Treasures(HK)"], "window_days": 14}),
                      ("maturity_calendar", {"segments": ["Treasures(HK)"], "on_date": "2026-11-24"})]:
        q = TH.compose(intent, s)
        assert TH._check(q, intent, s, d) is not None, q


def test_agent_pack_carries_the_thread():
    from hkeli_poc.flow import agentic
    conv = agentic.conversation({"read_as": "Which TRE clients at Wan Chai are maturing in the next 30 days?",
                                 "carried": ["TRE", "Wan Chai"], "recent": [{"asked": "only Wan Chai",
                                 "read_as": "x", "headline": "HKD 46.0M"}]})
    assert conv["read_as"].startswith("Which TRE clients") and conv["carried_from_earlier"] == ["TRE", "Wan Chai"]
    assert conv["earlier_turns"][0]["answer"] == "HKD 46.0M"


# ---------------------------------------------------------------- the Dify paths use the same thread
def test_chatflow_path_keeps_the_thread(c, monkeypatch):
    monkeypatch.setenv("ORCHESTRATOR", "local")
    from hkeli_poc import config
    config.reload()
    a = talk(c, THREAD[:4])
    assert a[3]["meta"]["orchestrator"] == "dify"
    assert a[3]["intent"] == "maturity_detail" and slots(a[3])["branch"] == "Wan Chai"


def test_rest_agent_tools_need_key_and_request(c, monkeypatch):
    monkeypatch.setenv("DIFY_TOOL_KEY", "k" * 32)
    from hkeli_poc import config
    config.reload()
    assert c.post("/tools/eli_views", json={"request_id": "x" * 16}).status_code == 401
    h = {"Authorization": "Bearer " + "k" * 32}
    assert c.post("/tools/eli_views", json={"request_id": "x" * 16}, headers=h).status_code == 404
    spec = c.get("/tools/openapi.json").json()
    assert {"/tools/eli_ask", "/tools/eli_views"} <= set(spec["paths"])
    req = spec["paths"]["/tools/eli_ask"]["post"]["requestBody"]["content"]["application/json"]["schema"]["required"]
    assert req == ["request_id", "question"]
