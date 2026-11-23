"""Office-readiness tests: settings, store, API v1, knowledge base, prompt library and the model guards.

The model gateway is replaced by an in-process stand-in (httpx.MockTransport). Nothing here opens a
network connection.
"""
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from hkeli_poc import app as appmod
from hkeli_poc import config
from hkeli_poc import knowledge as KB
from hkeli_poc import prompts as PR
from hkeli_poc.config import LLMSettings
from hkeli_poc.data import DISTRICTS
from hkeli_poc.db import Store
from hkeli_poc.llm import GatewayClient, OffClient
from hkeli_poc.mock_tableau import InProcessMock
from hkeli_poc.stork import agent
from hkeli_poc.stork.pipeline import answer

client = TestClient(appmod.app)
Q_BRANCH = "Which branches in D1 have the largest TRE maturity in the next 30 days?"


# ---------------------------------------------------------------- settings
def test_safe_defaults():
    c = config.get()
    assert c.host == "127.0.0.1" and c.tableau_mode == "mock" and c.llm.mode == "off" and not c.trust_edge_headers


def test_secret_file_wins_and_missing_file_fails(monkeypatch, tmp_path):
    f = tmp_path / "k"
    f.write_text("from-file\n")
    monkeypatch.setenv("LLM_API_KEY", "from-env")
    monkeypatch.setenv("LLM_API_KEY_FILE", str(f))
    assert config.secret("LLM_API_KEY") == "from-file"
    monkeypatch.setenv("LLM_API_KEY_FILE", str(tmp_path / "nope"))
    with pytest.raises(config.ConfigError) as e:
        config.secret("LLM_API_KEY")
    assert "from-env" not in str(e.value)


@pytest.mark.parametrize("env,msg", [
    ({"LLM_MODE": "gateway"}, "LLM_GATEWAY_URL"),
    ({"LLM_MODE": "gateway", "LLM_GATEWAY_URL": "http://gw.example"}, "https"),
    ({"TRUST_EDGE_HEADERS": "true"}, "EDGE_SHARED_TOKEN"),
    ({"PORT": "80"}, "PORT"),
    ({"TABLEAU_EMBED": "iframe"}, "TABLEAU_EMBED"),
])
def test_bad_settings_fail_loudly(monkeypatch, env, msg):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    with pytest.raises(config.ConfigError) as e:
        config.reload()
    assert msg in str(e.value)


# ---------------------------------------------------------------- store
def test_store_migrates_once_and_keeps_ownership(tmp_path):
    s = Store(tmp_path / "x.sqlite")
    assert s.version() == 2 and s.migrate() == 2
    cid = s.conversation("u1", None)
    assert s.conversation("u1", cid) == cid and s.conversation("u2", cid) != cid   # can't join another user's chat
    tid = s.record_turn(conversation_id=cid, request_id="r" * 8, user_id="u1",
                        answer={"question": "q", "status": "OK", "numbers": [{"id": "n1", "value": 1, "display": "1", "measure": "hkd"}]},
                        latency_ms=5)
    assert s.add_feedback(tid, "u2", 1, None) is None and s.add_feedback(tid, "u1", -1, "wrong branch")
    assert s.counts() == {"conversation": 2, "turn": 1, "llm_call": 0, "feedback": 1}
    s.close()
    assert Store(tmp_path / "x.sqlite").version() == 2   # reopen: no re-migration


# ---------------------------------------------------------------- API v1
def test_ask_records_turn_history_and_feedback():
    r = client.post("/api/v1/ask", json={"question": Q_BRANCH}, headers={"X-Request-Id": "abcd1234efgh"})
    a = r.json()
    assert r.status_code == 200 and a["status"] == "OK" and r.headers["X-Request-Id"] == "abcd1234efgh"
    assert a["turn_id"] and a["conversation_id"] and a["meta"]["understanding"] == "rules" and "_llm_calls" not in a
    h = client.get("/api/v1/history", params={"conversation_id": a["conversation_id"]}).json()["turns"]
    assert h[0]["id"] == a["turn_id"] and h[0]["status"] == "OK"
    assert client.post("/api/v1/feedback", json={"turn_id": a["turn_id"], "rating": 1}).status_code == 200
    assert client.post("/api/v1/feedback", json={"turn_id": "f" * 32, "rating": 1}).status_code == 404
    assert client.post("/api/v1/feedback", json={"turn_id": a["turn_id"], "rating": 0}).status_code == 400


def test_old_ask_path_still_works_and_validates():
    assert client.post("/api/ask", json={"question": "What is total outstanding ELI?"}).json()["status"] == "OK"
    assert client.post("/api/v1/ask", json={"question": "x"}).status_code == 422
    assert client.post("/api/v1/ask", json={"question": "What is total outstanding ELI?", "site": "nope"}).status_code == 400


def test_edge_headers_enforced_when_trusted(monkeypatch):
    monkeypatch.setenv("TRUST_EDGE_HEADERS", "true")
    monkeypatch.setenv("EDGE_SHARED_TOKEN", "edge-test-token")
    config.reload()
    q = {"question": "What is total outstanding ELI?"}
    assert client.post("/api/v1/ask", json=q).status_code == 401
    assert client.post("/api/v1/ask", json=q, headers={"X-Edge-Token": "wrong", "X-Eli-User": "a.user"}).status_code == 401
    assert client.post("/api/v1/ask", json=q, headers={"X-Edge-Token": "edge-test-token"}).status_code == 401
    ok = client.post("/api/v1/ask", json=q, headers={"X-Edge-Token": "edge-test-token", "X-Eli-User": "a.user"})
    assert ok.status_code == 200
    # history is per user
    hist = client.get("/api/v1/history", headers={"X-Edge-Token": "edge-test-token", "X-Eli-User": "other.user"}).json()
    assert all(t["id"] != ok.json()["turn_id"] for t in hist["turns"])


def test_health_ready_config_and_headers():
    assert client.get("/healthz").json()["ok"] is True
    r = client.get("/readyz").json()
    assert r["ready"] and set(r["checks"]) == {"store", "knowledge", "prompts", "tableau", "llm"}
    c = client.get("/api/v1/config").json()
    assert c["llm_mode"] == "off" and c["prompts"] == {"understand": "1.1.0", "write_answer": "1.0.0"}
    page = client.get("/")
    csp = page.headers["Content-Security-Policy"]
    assert "default-src 'self'" in csp and "http" not in csp
    assert client.get("/api/v1/config").headers["Cache-Control"] == "no-store"


def test_embed_presentation_link_and_off(monkeypatch):
    monkeypatch.setenv("TABLEAU_EMBED", "link")
    config.reload()
    assert client.post("/api/v1/ask", json={"question": Q_BRANCH}).json()["embed"]["presentation"] == "link"
    monkeypatch.setenv("TABLEAU_EMBED", "off")
    config.reload()
    assert client.post("/api/v1/ask", json={"question": Q_BRANCH}).json()["embed"] is None


# ---------------------------------------------------------------- knowledge base
def test_knowledge_valid_and_matches_mock_data():
    kb = KB.load()
    assert KB.validate(kb) == []
    assert kb.branches == {b: d for d, bs in DISTRICTS.items() for b in bs}


def test_broken_glossary_is_refused(tmp_path):
    for f in ("glossary.json", "intents.json", "domain.md"):
        (tmp_path / f).write_bytes((KB.HERE / f).read_bytes())
    g = json.loads((tmp_path / "glossary.json").read_text())
    g["concepts"][2]["values"].append({"value": ""})
    (tmp_path / "glossary.json").write_text(json.dumps(g))
    with pytest.raises(ValueError):
        KB.load(str(tmp_path))


@pytest.mark.parametrize("q,concept", [
    ("What is the contractual maturity of TRE ELI next month?", "CONCEPT_NOT_SUPPORTED"),
    ("Show all ELI containing 9988 HK", "CONCEPT_NOT_SUPPORTED"),
])
def test_unsupported_concepts_are_refused_not_misread(q, concept):
    a = client.post("/api/v1/ask", json={"question": q}).json()
    assert a["status"] == "UNSUPPORTED" and concept in a["reasons"] and not a["numbers"]


# ---------------------------------------------------------------- prompt library
def test_prompt_library_renders_and_schemas_fit_gemini():
    lib = PR.library()
    kb = KB.load()
    assert set(lib) == {"understand", "write_answer"}
    sch = agent.understand_schema(lib["understand"], kb)
    assert PR.gemini_schema_problems(sch) == []
    assert "Treasures(HK)" in sch["properties"]["segments"]["items"]["enum"]
    with pytest.raises(PR.PromptError):
        lib["understand"].render(question="q")
    assert PR.gemini_schema_problems({"type": "STRING", "enum": ["", "A"]})          # Gemini rejects ""
    assert PR.gemini_schema_problems({"type": ["STRING", "NULL"]})                  # and type lists
    assert len(lib["write_answer"].banned) >= 5


# ---------------------------------------------------------------- model guards (fake gateway)
def gateway(replies, calls=None):
    """A stand-in gateway: returns the next reply (dict -> JSON text, int -> HTTP status)."""
    replies = list(replies)

    def handler(req: httpx.Request):
        if calls is not None:
            calls.append(json.loads(req.content))
        r = replies.pop(0)
        if isinstance(r, int):
            return httpx.Response(r)
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(r)}]}}]})
    s = LLMSettings(mode="gateway", gateway_url="https://gw.example", path_template="/v1/models/{model}:generateContent",
                    model="gemini-test", api_key="k", max_retries=1, timeout_s=2)
    return GatewayClient(s, http=httpx.Client(transport=httpx.MockTransport(handler)))


def run(q, llm):
    return answer(q, InProcessMock(), "proposed", llm=llm)


def test_model_reads_question_code_keeps_hints():
    sent = []
    llm = gateway([{"intent": "maturity_branch", "segments": ["PB"], "district": "TRE-D2", "ranking": True,
                    "needs_clarification": False, "window_days": 30},
                   {"headline": "Rewritten.", "bullets": []}], sent)
    a = run(Q_BRANCH, llm)
    assert a["meta"]["understanding"] == "gateway" and a["status"] == "OK"
    assert "TRE-D1" in a["scope"] or "D1" in a["scope"]          # code's D1 beat the model's D2
    assert "PB" not in a["scope"]                                # and its TRE beat the model's PB
    body = sent[0]
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    assert PR.gemini_schema_problems(body["generationConfig"]["responseSchema"]) == []
    assert [c.prompt_id for c in a["_llm_calls"]] == ["understand", "write_answer"]


def test_model_reply_outside_contract_falls_back_to_rules():
    llm = gateway([{"intent": "sell_more_eli", "segments": [], "ranking": False, "needs_clarification": False},
                   {"headline": "x", "bullets": []}])
    a = run(Q_BRANCH, llm)
    assert a["meta"]["understanding"] == "gateway->rules" and a["status"] == "OK"
    assert a["_llm_calls"][0].outcome == "rejected" and "INTENT_NOT_ALLOWED" in a["_llm_calls"][0].detail


def test_gateway_down_falls_back_everywhere():
    a = run(Q_BRANCH, gateway([503, 503, 503, 503]))
    assert a["status"] == "OK" and a["meta"]["understanding"] == "gateway->rules"
    assert a["meta"]["insight"] == "gateway->template"
    assert {c.outcome for c in a["_llm_calls"]} == {"error"}


def test_wording_with_evidence_figures_is_used():
    base = run(Q_BRANCH, OffClient())
    first = base["numbers"][0]["display"]
    llm = gateway([{"intent": "maturity_branch", "segments": ["Treasures(HK)"], "district": "TRE-D1", "ranking": True,
                    "needs_clarification": False},
                   {"headline": f"The top branch has {first} of predicted maturity in the next 30 days.", "bullets": []}])
    a = run(Q_BRANCH, llm)
    assert a["meta"]["insight"] == "gateway" and first in a["headline"] and a["draft_headline"]


@pytest.mark.parametrize("text,problem", [
    ("Central leads with HKD 999.9M.", "FIGURE_NOT_IN_EVIDENCE"),
    ("These deals are guaranteed to knock out.", "BANNED_PHRASE"),
])
def test_wording_with_new_figures_or_promises_is_rejected(text, problem):
    llm = gateway([{"intent": "maturity_branch", "segments": ["Treasures(HK)"], "ranking": True, "needs_clarification": False},
                   {"headline": text, "bullets": []}, {"headline": text, "bullets": []}])
    a = run(Q_BRANCH, llm)
    assert a["meta"]["insight"] == "gateway->template" and text not in a["headline"]
    assert [c.outcome for c in a["_llm_calls"]] == ["ok", "rejected", "rejected"]    # one retry, then the template
    assert problem in a["_llm_calls"][-1].detail


def test_wording_retry_once_then_accepts():
    base = run(Q_BRANCH, OffClient())
    first = base["numbers"][0]["display"]
    llm = gateway([{"intent": "maturity_branch", "segments": ["Treasures(HK)"], "ranking": True, "needs_clarification": False},
                   {"headline": "Central leads with HKD 999.9M.", "bullets": []},
                   {"headline": f"Central leads with {first}.", "bullets": []}])
    a = run(Q_BRANCH, llm)
    assert a["meta"]["insight"] == "gateway" and first in a["headline"]


def test_llm_calls_are_audited_with_prompt_version(monkeypatch):
    monkeypatch.setattr(appmod.S, "llm", gateway([{"intent": "outstanding_total", "segments": [], "ranking": False,
                                                   "needs_clarification": False}, 500, 500]))
    a = client.post("/api/v1/ask", json={"question": "What is total outstanding ELI?"}).json()
    rows = appmod.S.store._con.execute("SELECT step, prompt_version, outcome FROM llm_call WHERE turn_id = ?",
                                       (a["turn_id"],)).fetchall()
    assert [tuple(r) for r in rows] == [("understand", "1.1.0", "ok"), ("write_answer", "1.0.0", "error")]


def test_empty_auth_scheme_sends_key_alone(monkeypatch):
    monkeypatch.setenv("LLM_MODE", "gateway")
    monkeypatch.setenv("LLM_GATEWAY_URL", "https://gw.example")
    monkeypatch.setenv("LLM_AUTH_HEADER", "x-goog-api-key")
    monkeypatch.setenv("LLM_AUTH_SCHEME", "")
    monkeypatch.setenv("LLM_API_KEY", "k123")
    s = config.reload().llm
    assert s.auth_scheme == "" and GatewayClient(s)._headers()["x-goog-api-key"] == "k123"
    monkeypatch.delenv("LLM_AUTH_SCHEME")
    assert GatewayClient(config.reload().llm)._headers()["x-goog-api-key"] == "Bearer k123"


def test_model_unknown_does_not_override_a_rules_intent():
    llm = gateway([{"intent": "unknown", "segments": [], "ranking": False, "needs_clarification": True,
                    "clarification": "Which stock?"}, 500, 500, 500])
    a = run("Where is Alibaba exposure?", llm)
    assert a["intent"] == "wps_exposure" and a["status"] == "OK" and a["meta"]["understanding"] == "gateway"
    assert a["meta"]["provider"] == "Gemini" and a["meta"]["model"] == "gemini-test"


def test_named_stock_exposure_leads_with_that_stock():
    a = run("What is our exposure to Tencent?", OffClient())
    assert a["intent"] == "wps_exposure" and a["headline"].startswith("700 HK carries")
    assert a["meta"]["provider"] == "none"


def test_insights_channel_is_audited_but_not_history():
    hdr = {"X-Request-Id": "insight-0001"}
    a = client.post("/api/v1/ask", json={"question": "What is total outstanding ELI?", "channel": "insights"}, headers=hdr).json()
    assert a["channel"] == "insights" and a["turn_id"]
    chat = client.get("/api/v1/history", params={"limit": 200}).json()["turns"]
    assert all(t["id"] != a["turn_id"] for t in chat)
    ins = client.get("/api/v1/history", params={"channel": "insights", "limit": 200}).json()["turns"]
    assert any(t["id"] == a["turn_id"] for t in ins)
    assert client.post("/api/v1/ask", json={"question": "What is total outstanding ELI?", "channel": "other"}).status_code == 422


def test_stream_sends_stages_then_the_answer():
    with client.stream("POST", "/api/v1/ask/stream", json={"question": Q_BRANCH}) as r:
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
        text = "".join(r.iter_text())
    events = [(b.split("\n")[0][7:], json.loads(b.split("\n")[1][6:])) for b in text.strip().split("\n\n")]
    kinds = [k for k, _ in events]
    assert kinds[-1] == "answer" and kinds.count("stage") == 11 and set(kinds) == {"stage", "answer"}
    assert events[0][1]["label"] == "Reading the question" and "detail" not in events[0][1]
    assert events[-1][1]["status"] == "OK" and events[-1][1]["turn_id"]


def test_v1_database_upgrades_in_place(tmp_path):
    import sqlite3
    from hkeli_poc import db
    p = tmp_path / "old.sqlite"
    con = sqlite3.connect(p)
    con.executescript(db.MIGRATIONS[0][1])
    con.execute("CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
    con.execute("INSERT INTO schema_version VALUES (1, 'x')")
    con.execute("INSERT INTO conversation VALUES ('c1','u','t','t')")
    con.execute("INSERT INTO turn (id, conversation_id, request_id, user_id, created_at, question, status)"
                " VALUES ('t1','c1','r','u','t','q','OK')")
    con.commit(); con.close()
    s = db.Store(p)
    assert s.version() == 2
    assert [t["id"] for t in s.turns("u")] == ["t1"] and s.turns("u", channel="insights") == []
