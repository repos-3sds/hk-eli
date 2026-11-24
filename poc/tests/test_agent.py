"""The Dify Agent variant: code builds the context pack, the agent answers and may call MCP tools, code grades.

FakeAgent stands in for Dify's agent-chat app: it reads the context pack it was sent, may call our MCP server
exactly as Dify would (JSON-RPC tools/call), and streams agent_thought and message events.
"""
import json

import pytest
from fastapi.testclient import TestClient

from hkeli_poc import app as appmod
from hkeli_poc.flow import agentic
from hkeli_poc.flow import mcp as M
from hkeli_poc.flow.dify import DifyError, parse_sse
from hkeli_poc.flow.refs import REFS


@pytest.fixture(scope="module")
def env():
    appmod.ensure_started()
    return appmod.S


def mcp_call(name, args):
    r = M.handle({"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": name, "arguments": args}},
                 appmod._flow_answer_fn)
    return json.loads(r["result"]["content"][0]["text"]), r["result"]["isError"]


class FakeAgent:
    """say(ctx, query, tool_result) -> text. ask = a follow-up question for eli_ask, or None."""

    def __init__(self, say, ask=None):
        self.say, self.ask, self.calls = say, ask, []

    def chat(self, inputs, query, user, conversation_id=None):
        self.calls.append({"query": query, "conversation_id": conversation_id})
        ctx = json.loads(inputs["context"])
        extra = None
        if self.ask and conversation_id is None:
            yield {"event": "agent_thought", "id": "th1", "tool": "eli_ask", "tool_input": ""}
            extra, _ = mcp_call("eli_ask", {"request_id": inputs["request_id"], "question": self.ask})
            yield {"event": "agent_thought", "id": "th1", "tool": "eli_ask", "tool_input": ""}   # Dify repeats it
        text = self.say(ctx, query, extra)
        for i in range(0, len(text), 20):
            yield {"event": "message", "answer": text[i:i + 20]}
        yield {"event": "message_end", "conversation_id": "conv-1", "message_id": f"m{len(self.calls)}"}


def run(q, engine, env):
    ev = list(agentic.ask(q, "demo.user", "proposed", None, "req-agent-" + str(abs(hash(q)))[:10], engine,
                          env.lib, appmod._flow_answer_fn))
    return ev, ev[-1][1]


Q = "What is total outstanding ELI?"


def test_context_pack_is_masked_and_carries_the_figures(env):
    a = appmod._flow_answer_fn(agentic.Turn("r-pack-0001", "demo.user", "Top 10 clients by notional", "proposed",
                                            None, False, None), agentic.Replay("rules", None, None))
    p = agentic.pack(a)
    assert p["figures"] and p["as_of"] and p["template_answer"] == a["headline"]
    cols = p["table"]["columns"]
    for c in set(cols) & agentic.masked.__globals__["ID_COLUMNS"]:
        assert all(r[cols.index(c)] == "(hidden)" for r in p["table"]["rows"])
    assert len(p["table"]["rows"]) <= 10


def test_agent_answer_from_context_passes_the_grade(env):
    eng = FakeAgent(lambda c, q, x: c["template_answer"] + "\n- " + c["scope"])
    ev, a = run(Q, eng, env)
    assert a["status"] == "OK" and a["meta"]["insight"] == "agent" and a["meta"]["orchestrator"] == "dify-agent"
    assert a["headline"] == a["draft_headline"] and a["bullets"][0]
    names = [d["name"] for k, d in ev if k == "stage"]
    assert names[:2] == ["Assemble", "Context"] and names[-1] == "Grade"
    assert [k for k, _ in ev].count("token") >= 1


def test_agent_uses_an_mcp_tool_and_may_quote_its_figures(env):
    eng = FakeAgent(lambda c, q, x: c["template_answer"] + "\n- Treasures: " + x["template_answer"],
                    ask="Outstanding ELI for Treasures")
    ev, a = run(Q, eng, env)
    assert a["meta"]["insight"] == "agent", a["meta"].get("agent_problems")
    assert a["meta"]["agent"]["tools"][0]["tool"] == "eli_ask"
    assert [d["name"] for k, d in ev if k == "stage"].count("Tool:eli_ask") == 1   # shown once


def test_invented_figure_gets_one_rewrite_then_passes(env):
    def say(c, q, x):
        return c["template_answer"] if "rejected" in q else "Outstanding is HKD 987.6M."
    eng = FakeAgent(say)
    _, a = run(Q, eng, env)
    assert a["meta"]["insight"] == "agent" and a["meta"]["agent"]["attempts"] == 2
    assert eng.calls[1]["conversation_id"] == "conv-1" and "FIGURE_NOT_IN_EVIDENCE" in eng.calls[1]["query"]


def test_two_failures_keep_the_template(env):
    eng = FakeAgent(lambda c, q, x: "Outstanding is HKD 987.6M, so clients should buy more.")
    _, a = run(Q, eng, env)
    assert a["meta"]["insight"] == "agent->template" and a["headline"] == a.get("draft_headline", a["headline"])
    assert "agent_text" not in a and len(eng.calls) == 2


def test_empty_agent_text_keeps_the_template_without_a_rewrite(env):
    eng = FakeAgent(lambda c, q, x: "")
    _, a = run(Q, eng, env)
    assert a["meta"]["insight"] == "agent->template" and len(eng.calls) == 1


def test_refusals_never_reach_the_agent(env):
    eng = FakeAgent(lambda c, q, x: "should not be called")
    _, a = run("Should my client buy the NVDA ELI?", eng, env)
    assert a["status"] == "UNSUPPORTED" and eng.calls == [] and a["meta"]["insight"] == "template"


def test_tool_calls_are_capped_and_need_a_live_request(env):
    t = agentic.build("req-cap-00001", "demo.user", Q, "proposed", None, appmod._flow_answer_fn)
    for _ in range(agentic.MAX_TOOL_CALLS):
        out, err = mcp_call("eli_ask", {"request_id": t.request_id, "question": Q})
        assert not err and out["status"] == "OK"
    out, err = mcp_call("eli_ask", {"request_id": t.request_id, "question": Q})
    assert err and out["error"] == "TOO_MANY_TOOL_CALLS"
    REFS.drop(t.request_id)
    out, err = mcp_call("eli_ask", {"request_id": t.request_id, "question": Q})
    assert err and out["error"] == "UNKNOWN_REQUEST"


def test_mcp_protocol_over_http(monkeypatch, env):
    monkeypatch.setenv("DIFY_TOOL_KEY", "tool-secret")
    from hkeli_poc import config
    config.reload()
    c = TestClient(appmod.app)
    h = {"Authorization": "Bearer tool-secret"}
    init = {"jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "dify"}}}
    assert c.post("/mcp", json=init).status_code == 401
    r = c.post("/mcp", json=init, headers=h).json()
    assert r["result"]["protocolVersion"] == "2025-03-26" and "tools" in r["result"]["capabilities"]
    assert c.post("/mcp", json={"jsonrpc": "2.0", "method": "notifications/initialized"}, headers=h).status_code == 202
    tools = c.post("/mcp", json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, headers=h).json()
    assert {t["name"] for t in tools["result"]["tools"]} == {"eli_ask", "eli_views"}
    t = agentic.build("req-mcp-00001", "demo.user", Q, "proposed", None, appmod._flow_answer_fn)
    r = c.post("/mcp", headers=h, json={"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {
        "name": "eli_views", "arguments": {"request_id": t.request_id}}}).json()
    views = json.loads(r["result"]["content"][0]["text"])["views"]
    assert len(views) >= 10 and views[0]["purpose"]
    bad = c.post("/mcp", headers=h, json={"jsonrpc": "2.0", "id": 4, "method": "nope"}).json()
    assert bad["error"]["code"] == -32601
    assert c.get("/mcp").status_code == 405
    REFS.drop(t.request_id)


def test_stream_endpoint_routes_to_the_agent(monkeypatch, env):
    monkeypatch.setenv("ORCHESTRATOR", "local")
    from hkeli_poc import config
    config.reload()
    eng = FakeAgent(lambda c, q, x: c["template_answer"])
    monkeypatch.setattr(appmod, "agent_engine", lambda: eng)
    monkeypatch.setattr(appmod, "_mode", lambda body: "agent" if body.engine == "agent" else "flow")
    c = TestClient(appmod.app)
    r = c.post("/api/v1/ask/stream", json={"question": Q, "engine": "agent"})
    a = json.loads(r.text.strip().split("data: ")[-1])
    assert a["meta"]["orchestrator"] == "dify-agent" and a["meta"]["insight"] == "agent" and a["turn_id"]
    r = c.post("/api/v1/ask/stream", json={"question": Q, "engine": "chatflow"})
    assert json.loads(r.text.strip().split("data: ")[-1])["meta"]["orchestrator"] == "dify"


def test_dify_agent_events_are_parsed():
    lines = ['data: {"event": "agent_thought", "id": "t1", "tool": "eli_ask", "tool_input": "{}"}',
             'data: {"event": "agent_message", "answer": "Hi"}',
             'data: {"event": "message_end", "conversation_id": "c", "message_id": "m"}']
    ev = list(parse_sse(lines))
    assert ev[0] == {"event": "agent_thought", "id": "t1", "tool": "eli_ask", "tool_input": "{}"}
    assert ev[1] == {"event": "message", "answer": "Hi"}


def test_dify_error_before_an_answer_raises(env):
    class Down:
        def chat(self, *a, **k):
            yield {"event": "error", "code": "provider_not_initialize", "message": "x"}
    with pytest.raises(DifyError):
        run(Q, Down(), env)


def test_agent_dsl_is_an_agent_app():
    import importlib.util
    from pathlib import Path
    p = Path(__file__).resolve().parents[1] / "dify" / "build_dsl.py"
    spec = importlib.util.spec_from_file_location("build_dsl_a", p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    assert m.AGENT_OUT.read_text() == m.render_agent(), "run python dify/build_dsl.py"
    d = m.agent_dsl()
    assert d["app"]["mode"] == "agent-chat" and d["model_config"]["agent_mode"]["strategy"] == "function_call"
    assert "{{request_id}}" in d["model_config"]["pre_prompt"] and "{{context}}" in d["model_config"]["pre_prompt"]
    names = [list(f.values())[0]["variable"] for f in d["model_config"]["user_input_form"]]
    assert names == ["request_id", "context"]


def test_agent_resolves_a_vague_question_by_fetching_a_reading(env):
    q = "What is predicted to knock out this week?"
    seen = {}

    class Picker(FakeAgent):
        def chat(self, inputs, query, user, conversation_id=None):
            ctx = json.loads(inputs["context"])
            seen["ctx"] = ctx
            pick = ctx["readings"][0]["question"]
            yield {"event": "agent_thought", "id": "t1", "tool": "eli_ask", "tool_input": ""}
            res, _ = mcp_call("eli_ask", {"request_id": inputs["request_id"], "question": pick})
            text = res["template_answer"] + "\n- Read as: " + pick
            yield {"event": "message", "answer": text}
            yield {"event": "message_end", "conversation_id": "c", "message_id": "m"}

    _, a = run(q, Picker(None), env)
    assert seen["ctx"]["status"] == "NEEDS_CLARIFICATION" and seen["ctx"]["readings"]
    assert a["status"] == "OK" and a["meta"]["insight"] == "agent" and a["numbers"]
    assert any(x.startswith("Read as: ") for x in a["assumptions"])


def test_vague_question_without_a_fetch_keeps_the_clarification(env):
    _, a = run("What is predicted to knock out this week?", FakeAgent(lambda c, q, x: "Which do you mean?"), env)
    assert a["status"] == "NEEDS_CLARIFICATION" and a["meta"]["insight"] == "agent->template"


@pytest.mark.parametrize("q", ["Compare outstanding ELI for Treasures and Treasures Private Client",
                               "TRE vs TPC outstanding", "Outstanding ELI by segment"])
def test_comparisons_by_segment_get_the_segment_view(q, env):
    a = appmod.run(q, "proposed", None, llm=agentic.Replay("rules", None, None), word=False)
    assert a["intent"] == "segment_share" and a["status"] == "OK"


def test_label_check_catches_maturities_called_knock_outs(env):
    from hkeli_poc.stork import agent as AG
    a = appmod.run("How much TRE ELI is predicted to mature in the next 7 days?", "proposed", None,
                   llm=agentic.Replay("rules", None, None), word=False)
    assert AG.label_problems("HKD 175.6M of TRE ELI is predicted to knock out in the next 7 days.", [a]) == \
        ["LABEL_NOT_IN_DATA:KO"]
    assert AG.label_problems(a["headline"], [a]) == []
    ko = appmod.run("How much TRE ELI is predicted to knock out in the next 30 days?", "proposed", None,
                    llm=agentic.Replay("rules", None, None), word=False)
    assert AG.label_problems("This is predicted to knock out.", [ko]) == []


def test_agent_mislabel_gets_a_rewrite(env):
    def say(c, q, x):
        return c["template_answer"] if "rejected" in q else c["template_answer"].replace("mature", "knock out")
    eng = FakeAgent(say)
    _, a = run("How much TRE ELI is predicted to mature in the next 7 days?", eng, env)
    assert a["meta"]["agent"]["attempts"] == 2 and a["meta"]["insight"] == "agent"
    assert "LABEL_NOT_IN_DATA:KO" in eng.calls[1]["query"]
