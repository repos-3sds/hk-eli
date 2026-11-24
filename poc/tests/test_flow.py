"""The Dify flow: Python context -> Dify (process, fetch through our tools, stream) -> Python grade and reflect.

LocalDify walks the same graph as dify/hk-eli-chat.yml in this process, so these tests need no Dify.
The key guarantee: with the same model replies, the flow gives the same answer as the native pipeline.
"""
import json
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from hkeli_poc import app as appmod
from hkeli_poc import knowledge as KB
from hkeli_poc import prompts as PR
from hkeli_poc.flow import run as flow_run
from hkeli_poc.flow import tools as T
from hkeli_poc.flow.dify import DifyClient, DifyError, LocalDify, parse_sse
from hkeli_poc.flow.refs import REFS
from hkeli_poc.llm import OffClient

sys.path.insert(0, str(Path(__file__).parent / "bench"))
import bench  # noqa: E402

EVAL = [c["q"] for c in json.loads((Path(__file__).parent / "eval_questions.json").read_text())["cases"]]
SAME = ["status", "reasons", "headline", "bullets", "numbers", "caveats", "followups", "intent", "slots", "table",
        "chart", "clarify", "scope", "as_of", "embeds"]


def _is_word(system, schema):
    return "headline" in json.dumps(schema) or '"headline"' in system


class Honest:
    """Reads unsure questions as the first rules candidate; words answers without inventing figures."""
    enabled, model, provider = True, "honest", "test"

    def generate_json(self, system, user, schema):
        if _is_word(system, schema):
            return {"headline": "Here is what the book shows for your question.", "bullets": []}
        return {"intent": "maturity_detail", "segments": [], "ranking": False, "needs_clarification": False,
                "confidence": "high", "alternatives": []}


class LiarOnce:
    """Invents a figure the first time it words an answer; behaves when told about the rejection."""
    enabled, model, provider = True, "liar-once", "test"

    def __init__(self):
        self.word_calls = 0

    def generate_json(self, system, user, schema):
        if _is_word(system, schema):
            self.word_calls += 1
            if "previous text was rejected" in user:
                return {"headline": "Checked answer without new figures.", "bullets": []}
            return {"headline": "Central leads with HKD 987.6M.", "bullets": []}
        return Honest().generate_json(system, user, schema)


@pytest.fixture()
def env():
    appmod.ensure_started()
    return appmod.S


def native(q, llm):
    return appmod.run(q, "proposed", None, user="demo.user", llm=llm)


def flow(q, llm, env, events=None):
    engine = LocalDify(llm, appmod._flow_answer_fn, env.lib, env.kb)
    a = None
    for kind, data in flow_run.ask(q, "demo.user", "proposed", None, "req-" + str(abs(hash(q)))[:12] + "x",
                                   engine, env.lib, env.kb):
        if events is not None:
            events.append((kind, data))
        if kind == "answer":
            a = data
    return a


def pick(a):
    return {k: a.get(k) for k in SAME}


@pytest.mark.parametrize("q", EVAL)
def test_model_off_flow_equals_native(q, env):
    assert pick(flow(q, OffClient(), env)) == pick(native(q, OffClient()))


def test_model_off_parity_on_the_whole_bench(env):
    qs = [c["q"] for c in bench.cases()] + [c["q"] for c in bench.holdout_cases()]
    diffs = [q for q in qs if pick(flow(q, OffClient(), env)) != pick(native(q, OffClient()))]
    assert not diffs, diffs[:5]


@pytest.mark.parametrize("q", EVAL)
def test_model_on_flow_equals_native(q, env):
    f, n = flow(q, Honest(), env), native(q, Honest())
    assert pick(f) == pick(n)
    assert f["meta"]["understanding"] == n["meta"]["understanding"]
    assert f["meta"]["insight"] == n["meta"]["insight"]


def test_grade_rejects_an_invented_figure_and_reflects_once(env):
    llm = LiarOnce()
    a = flow("What is total outstanding ELI?", llm, env)
    assert llm.word_calls == 2
    assert a["headline"] == "Checked answer without new figures."
    assert a["meta"]["insight"] == "gateway"
    outcomes = [c.outcome for c in a["_llm_calls"] if c.step == "write_answer"]
    assert outcomes == ["rejected", "ok"]


def test_two_failed_gradings_keep_the_template(env):
    class Liar(LiarOnce):
        def generate_json(self, system, user, schema):
            if _is_word(system, schema):
                return {"headline": "HKD 987.6M everywhere.", "bullets": []}
            return Honest().generate_json(system, user, schema)
    a = flow("What is total outstanding ELI?", Liar(), env)
    n = native("What is total outstanding ELI?", OffClient())
    assert a["headline"] == n["headline"] and "987.6" not in a["headline"]
    assert a["meta"]["insight"] == "gateway->template"


def test_events_stream_stages_then_a_checking_draft_then_the_answer(env):
    ev = []
    flow("What is total outstanding ELI?", Honest(), env, ev)
    kinds = [k for k, _ in ev]
    assert kinds[0] == "stage" and kinds[-1] == "answer"
    labels = [d["label"] for k, d in ev if k == "stage"]
    names = [d["name"] for k, d in ev if k == "stage"]
    assert len(names) == len(set(names)), names       # each stage shows once
    assert labels[:2] == ["Reading the question", "Planning the steps"]
    assert "Querying the view as you" in labels and "Checking the figures" in labels
    drafts = [d for k, d in ev if k == "token"]
    assert drafts and drafts[-1] == {"text": "Here is what the book shows for your question.", "state": "checking"}
    assert kinds.index("token") < kinds.index("answer")


def test_dify_never_sees_rows_or_client_ids(env):
    """What the tools hand Dify: prompts, flags and the headline. Client and position ids are masked."""
    rid = "req-privacy-001"
    from hkeli_poc.flow import context as C
    C.build(rid, "demo.user", "Which clients have TRE ELI maturing in the next 30 days?", "proposed", None, env.lib, env.kb)
    r = T.answer(rid, "", appmod._flow_answer_fn, env.lib, env.kb)
    assert set(r) == {"request_id", "status", "headline", "wordable", "word_system", "word_user"}
    draft = REFS.get(rid).draft
    ids = {row[draft["table"]["columns"].index("Cif Id")] for row in draft["table"]["rows"]}
    assert ids and not any(i in json.dumps(r) for i in ids)
    assert "(hidden)" in r["word_user"]
    REFS.drop(rid)


def test_draft_headline_reads_a_partial_json_stream():
    assert flow_run.draft_headline('{"headline": "TRE leads wi') == "TRE leads wi"
    assert flow_run.draft_headline('{"headline": "A \\"quoted\\" word", "bul') == 'A "quoted" word'
    assert flow_run.draft_headline('{"bullets": []') == ""


# ---------------------------------------------------------------- real Dify client (no network)
SSE = "\n".join([
    'data: {"event": "workflow_started", "workflow_run_id": "w1"}',
    'data: {"event": "node_started", "data": {"title": "Context", "node_type": "tool"}}',
    "event: ping",
    'data: {"event": "message", "answer": "{\\"headline\\": \\"Hi"}',
    'data: {"event": "message", "answer": " there\\"}"}',
    'data: {"event": "message_end", "conversation_id": "c1", "message_id": "m1"}',
    'data: {"event": "workflow_finished", "workflow_run_id": "w1", "data": {"status": "succeeded"}}',
])


def test_parse_sse_keeps_the_events_we_use():
    ev = list(parse_sse(SSE.splitlines()))
    assert [e["event"] for e in ev] == ["node_started", "message", "message", "message_end", "workflow_finished"]
    assert ev[0]["title"] == "Context" and ev[3]["message_id"] == "m1"


def test_dify_client_posts_streaming_with_the_app_key():
    seen = {}

    def handler(req):
        seen["auth"] = req.headers["Authorization"]
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, text=SSE, headers={"content-type": "text/event-stream"})
    c = DifyClient("http://dify.local/", "app-key", http=httpx.Client(transport=httpx.MockTransport(handler)))
    ev = list(c.chat({"request_id": "r1", "mode": "answer"}, "q?", "u1"))
    assert seen["auth"] == "Bearer app-key"
    assert seen["body"]["response_mode"] == "streaming" and seen["body"]["user"] == "u1"
    assert ev[-2]["event"] == "message_end"


def test_dify_client_turns_http_errors_into_dify_error():
    c = DifyClient("http://dify.local", "k", http=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(401))))
    with pytest.raises(DifyError) as e:
        list(c.chat({}, "q", "u"))
    assert e.value.code == "HTTP_401"


# ---------------------------------------------------------------- HTTP surface
def test_stream_endpoint_in_local_mode(monkeypatch):
    monkeypatch.setenv("ORCHESTRATOR", "local")
    from hkeli_poc import config
    config.reload()
    c = TestClient(appmod.app)
    r = c.post("/api/v1/ask/stream", json={"question": "What is total outstanding ELI?"})
    assert r.status_code == 200
    kinds = [l[7:] for l in r.text.splitlines() if l.startswith("event: ")]
    assert kinds[0] == "stage" and kinds[-1] == "answer"
    a = json.loads(r.text.strip().split("data: ")[-1])
    assert a["meta"]["orchestrator"] == "dify" and a["status"] == "OK" and a["turn_id"]


def test_tool_endpoints_need_the_tool_key(monkeypatch):
    monkeypatch.setenv("DIFY_TOOL_KEY", "tool-secret")
    from hkeli_poc import config
    config.reload()
    c = TestClient(appmod.app)
    assert c.post("/tools/context", json={"request_id": "abcdefgh1"}).status_code == 401
    r = c.post("/tools/context", json={"request_id": "abcdefgh1"}, headers={"Authorization": "Bearer tool-secret"})
    assert r.status_code == 404 and r.json() == {"error": "UNKNOWN_REQUEST"}
    spec = c.get("/tools/openapi.json").json()
    assert set(spec["paths"]) == {"/tools/context", "/tools/answer", "/tools/reword"}


def test_tool_answer_over_http_runs_the_pipeline(monkeypatch, env):
    monkeypatch.setenv("DIFY_TOOL_KEY", "tool-secret")
    from hkeli_poc import config
    from hkeli_poc.flow import context as C
    config.reload()
    c = TestClient(appmod.app)
    C.build("req-http-0001", "demo.user", "What is total outstanding ELI?", "proposed", None, env.lib, env.kb)
    h = {"Authorization": "Bearer tool-secret"}
    ctx = c.post("/tools/context", json={"request_id": "req-http-0001"}, headers=h).json()
    assert ctx["needs_model"] == "no"
    r = c.post("/tools/answer", json={"request_id": "req-http-0001", "model_text": ""}, headers=h).json()
    assert r["status"] == "OK" and r["wordable"] == "yes" and "write" in r["word_system"].lower() or r["word_user"]
    REFS.drop("req-http-0001")


# --- the importable Chatflow (dify/hk-eli-chat.yml) ----------------------------------------------------

def _dsl():
    import importlib.util
    from pathlib import Path
    p = Path(__file__).resolve().parents[1] / "dify" / "build_dsl.py"
    spec = importlib.util.spec_from_file_location("build_dsl", p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_dsl_file_is_current():
    m = _dsl()
    assert m.OUT.read_text() == m.render(), "run python dify/build_dsl.py"


def test_dsl_graph_is_sound():
    import re
    from hkeli_poc.flow.run import STAGE
    d = _dsl().dsl()
    nodes = {n["id"]: n["data"] for n in d["workflow"]["graph"]["nodes"]}
    edges = d["workflow"]["graph"]["edges"]
    for e in edges:
        assert e["source"] in nodes and e["target"] in nodes
        if nodes[e["source"]]["type"] == "if-else":
            assert e["sourceHandle"] in {c["case_id"] for c in nodes[e["source"]]["cases"]} | {"false"}
    # every node reachable from start, every path ends at an answer
    seen, todo = set(), ["start"]
    while todo:
        n = todo.pop()
        if n not in seen:
            seen.add(n)
            todo += [e["target"] for e in edges if e["source"] == n]
    assert seen == set(nodes)
    for nid, n in nodes.items():
        if not any(e["source"] == nid for e in edges):
            assert n["type"] == "answer", nid
    # the stage titles the widget shows all exist; outputs referenced in templates exist
    assert set(STAGE) <= {n["title"] for n in nodes.values()}
    text = json.dumps(d)
    for nid, var in re.findall(r"\{\{#([a-z_0-9]+)\.([A-Za-z_]+)#\}\}", text):
        if nid == "env":
            assert var in {v["name"] for v in d["workflow"]["environment_variables"]}
            continue
        n = nodes[nid]
        outs = set(n.get("outputs", {})) | ({"text"} if n["type"] == "llm" else set()) | \
            ({"body", "status_code"} if n["type"] == "http-request" else set())
        assert var in outs, (nid, var)
    # Dify only ever calls our tool endpoints
    assert {n["url"].split("#}}")[1] for n in nodes.values() if n["type"] == "http-request"} == \
        {"/tools/context", "/tools/answer", "/tools/reword"}
