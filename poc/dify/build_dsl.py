"""Builds dify/hk-eli-chat.yml, the HK ELI Chatflow that Dify imports (Studio > Import DSL file).

    python dify/build_dsl.py            writes the file
    python dify/build_dsl.py --check    fails if the file on disk is out of date (used by the tests)

The graph is the same one LocalDify walks in hkeli_poc/flow/dify.py. Dify only orchestrates and words:
every step that decides something calls our Python tool service over HTTP, with a bearer key.

  Start (request_id, mode)
   └ Mode? ── reword ─> Reword (HTTP) > Read reword > Word again (LLM) > Answer (rewrite)
      └ answer ─> Context (HTTP) > Read context > Needs model?
                    ├ yes > Understand (LLM) ┐
                    └ no  > No model ────────┴> Model text > Answer from data (HTTP) > Read answer > Wordable?
                                                                ├ yes > Word (LLM) > Answer (worded)
                                                                └ no  > Answer (headline)

Node titles "Context", "Understand", "Answer from data", "Word" and "Reword" are what the widget shows as
stages (flow/run.py STAGE). Dify never sees rows, client ids or Tableau secrets: only request ids, prompts
(identifiers masked) and short JSON.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

OUT = Path(__file__).with_name("hk-eli-chat.yml")

DSL_VERSION = "0.3.0"          # Dify 1.x imports older minor versions with a warning, never a hard stop
PROVIDER = "langgenius/gemini/google"
MODEL = "gemini-3.5-flash"   # 2.5 flash is closed to new keys (Gemini 400, 2026-11-24)
PLUGIN = "langgenius/gemini"   # marketplace plugin Dify offers to install on import


def _llm(nid: str, title: str, sys_ref: str, user_ref: str) -> dict:
    return {"id": nid, "data": {
        "type": "llm", "title": title, "desc": "Gemini words or reads; on failure it returns empty text and the tools fall back.",
        "model": {"provider": PROVIDER, "name": MODEL, "mode": "chat",
                  "completion_params": {"temperature": 0, "response_format": "json"}},
        "prompt_template": [
            {"id": f"{nid}-sys", "role": "system", "text": "{{#%s#}}" % sys_ref},
            {"id": f"{nid}-user", "role": "user", "text": "{{#%s#}}" % user_ref}],
        "context": {"enabled": False, "variable_selector": []},
        "memory": None, "vision": {"enabled": False},
        "error_strategy": "default-value",
        "default_value": [{"key": "text", "type": "string", "value": ""}],
        "retry_config": {"enabled": True, "max_retries": 1, "retry_interval": 1000},
    }}


def _body(nid: str, title: str, fields: dict[str, list[str]]) -> dict:
    """Code node that builds a JSON request body (model text may hold quotes, so no string templating)."""
    args = ", ".join(f"{k}: str" for k in fields)
    obj = ", ".join(f'"{k}": {k} or ""' for k in fields)
    code = f"import json\n\n\ndef main({args}) -> dict:\n    return {{\"body\": json.dumps({{{obj}}})}}\n"
    return {"id": nid, "data": {
        "type": "code", "title": title, "desc": "", "code_language": "python3", "code": code,
        "variables": [{"variable": k, "value_selector": v} for k, v in fields.items()],
        "outputs": {"body": {"type": "string", "children": None}},
    }}


def _http(nid: str, title: str, path: str, body_ref: str, desc: str) -> dict:
    return {"id": nid, "data": {
        "type": "http-request", "title": title, "desc": desc, "method": "post",
        "url": "{{#env.ELI_TOOL_BASE_URL#}}" + path,
        "authorization": {"type": "api-key", "config": {"type": "bearer", "api_key": "{{#env.ELI_TOOL_KEY#}}"}},
        "headers": "Content-Type:application/json", "params": "",
        "body": {"type": "raw-text", "data": [{"type": "text", "value": "{{#%s#}}" % body_ref}]},
        "timeout": {"max_connect_timeout": 10, "max_read_timeout": 60, "max_write_timeout": 10},
        "retry_config": {"enabled": False, "max_retries": 0, "retry_interval": 100},
        "ssl_verify": True,
    }}


def _read(nid: str, title: str, src: str, keys: list[str]) -> dict:
    """Code node that reads the tool's JSON reply into named outputs. A non-200 reply stops the run with
    the tool's error code, which our service turns into an error event for the widget."""
    lines = ["import json", "", "", "def main(status_code: int, body: str) -> dict:",
             "    if status_code != 200:",
             "        raise ValueError(f\"ELI_TOOL_{status_code}: {body[:200]}\")",
             "    d = json.loads(body)",
             "    return {" + ", ".join(f'"{k}": str(d.get("{k}", ""))' for k in keys) + "}"]
    return {"id": nid, "data": {
        "type": "code", "title": title, "desc": "", "code_language": "python3", "code": "\n".join(lines) + "\n",
        "variables": [{"variable": "status_code", "value_selector": [src, "status_code"]},
                      {"variable": "body", "value_selector": [src, "body"]}],
        "outputs": {k: {"type": "string", "children": None} for k in keys},
    }}


def _if(nid: str, title: str, ref: list[str], value: str, case_id: str) -> dict:
    return {"id": nid, "data": {
        "type": "if-else", "title": title, "desc": "",
        "cases": [{"id": case_id, "case_id": case_id, "logical_operator": "and", "conditions": [
            {"id": f"{nid}-c1", "varType": "string", "variable_selector": ref,
             "comparison_operator": "is", "value": value}]}],
    }}


def _answer(nid: str, title: str, ref: str) -> dict:
    return {"id": nid, "data": {"type": "answer", "title": title, "desc": "", "answer": "{{#%s#}}" % ref,
                                "variables": []}}


def graph() -> tuple[list[dict], list[tuple[str, str, str]]]:
    nodes = [
        {"id": "start", "data": {"type": "start", "title": "Start", "desc": "", "variables": [
            {"variable": "request_id", "label": "request_id", "type": "text-input", "required": True,
             "max_length": 64, "options": []},
            {"variable": "mode", "label": "mode", "type": "select", "required": False,
             "options": ["answer", "reword"], "default": "answer"}]}},
        _if("mode", "Mode?", ["start", "mode"], "reword", "reword"),
        # first pass
        _body("ctx_body", "Context request", {"request_id": ["start", "request_id"]}),
        _http("context", "Context", "/tools/context", "ctx_body.body",
              "Python's rules reading of the question and, if the rules are unsure, the understand prompt."),
        _read("ctx", "Read context", "context", ["needs_model", "rules_intent", "understand_system", "understand_user"]),
        _if("needs", "Needs model?", ["ctx", "needs_model"], "yes", "yes"),
        _llm("understand", "Understand", "ctx.understand_system", "ctx.understand_user"),
        {"id": "nomodel", "data": {"type": "code", "title": "No model", "desc": "", "code_language": "python3",
                                   "code": "def main() -> dict:\n    return {\"text\": \"\"}\n",
                                   "variables": [], "outputs": {"text": {"type": "string", "children": None}}}},
        {"id": "modeltext", "data": {"type": "variable-aggregator", "title": "Model text", "desc": "",
                                     "output_type": "string",
                                     "variables": [["understand", "text"], ["nomodel", "text"]]}},
        _body("ans_body", "Answer request", {"request_id": ["start", "request_id"], "model_text": ["modeltext", "output"]}),
        _http("answer", "Answer from data", "/tools/answer", "ans_body.body",
              "Fetch from Tableau as the user, validate, compose. Rows and figures stay in Python."),
        _read("ans", "Read answer", "answer", ["status", "headline", "wordable", "word_system", "word_user"]),
        _if("wordable", "Wordable?", ["ans", "wordable"], "yes", "yes"),
        _llm("word", "Word", "ans.word_system", "ans.word_user"),
        _answer("out_word", "Answer (worded)", "word.text"),
        _answer("out_head", "Answer (headline)", "ans.headline"),
        # rewrite pass, started by Python when the figure check fails once
        _body("rw_body", "Reword request", {"request_id": ["start", "request_id"]}),
        _http("reword", "Reword", "/tools/reword", "rw_body.body",
              "The wording prompt again with the problems the figure check found."),
        _read("rw", "Read reword", "reword", ["status", "headline", "word_system", "word_user"]),
        _llm("word2", "Word", "rw.word_system", "rw.word_user"),
        _answer("out_rw", "Answer (rewrite)", "word2.text"),
    ]
    edges = [
        ("start", "source", "mode"),
        ("mode", "reword", "rw_body"), ("mode", "false", "ctx_body"),
        ("ctx_body", "source", "context"), ("context", "source", "ctx"), ("ctx", "source", "needs"),
        ("needs", "yes", "understand"), ("needs", "false", "nomodel"),
        ("understand", "source", "modeltext"), ("nomodel", "source", "modeltext"),
        ("modeltext", "source", "ans_body"), ("ans_body", "source", "answer"), ("answer", "source", "ans"),
        ("ans", "source", "wordable"),
        ("wordable", "yes", "word"), ("wordable", "false", "out_head"), ("word", "source", "out_word"),
        ("rw_body", "source", "reword"), ("reword", "source", "rw"), ("rw", "source", "word2"),
        ("word2", "source", "out_rw"),
    ]
    return nodes, edges


LAYOUT = {  # column, row
    "start": (0, 1), "mode": (1, 1), "ctx_body": (2, 0), "context": (3, 0), "ctx": (4, 0), "needs": (5, 0),
    "understand": (6, -1), "nomodel": (6, 0), "modeltext": (7, 0), "ans_body": (8, 0), "answer": (9, 0),
    "ans": (10, 0), "wordable": (11, 0), "word": (12, -1), "out_word": (13, -1), "out_head": (12, 0.6),
    "rw_body": (2, 2.2), "reword": (3, 2.2), "rw": (4, 2.2), "word2": (5, 2.2), "out_rw": (6, 2.2),
}


def dsl() -> dict:
    nodes, edges = graph()
    types = {n["id"]: n["data"]["type"] for n in nodes}
    for n in nodes:
        c, r = LAYOUT[n["id"]]
        pos = {"x": 80 + c * 300, "y": 300 + r * 180}
        n.update({"type": "custom", "width": 244, "height": 98, "position": pos, "positionAbsolute": pos,
                  "selected": False, "sourcePosition": "right", "targetPosition": "left"})
        n["data"]["selected"] = False
    return {
        "app": {"name": "HK ELI Chatbot", "mode": "advanced-chat", "icon": "📈", "icon_background": "#0B1F33",
                "description": "Orchestrates the HK ELI Chatbot. Python decides the view, filters and every figure; "
                               "Dify reads the question when the rules are unsure and words the answer. "
                               "*Will be part of Ask-MIRA in future",
                "use_icon_as_answer_icon": False},
        "kind": "app",
        "version": DSL_VERSION,
        "dependencies": [{"current_identifier": None, "type": "marketplace",
                          "value": {"marketplace_plugin_unique_identifier": PLUGIN}}],
        "workflow": {
            "conversation_variables": [],
            "environment_variables": [
                {"id": "env-eli-base", "name": "ELI_TOOL_BASE_URL", "value_type": "string",
                 "value": "http://host.docker.internal:8050", "description": "Where Dify reaches the HK ELI tool service"},
                {"id": "env-eli-key", "name": "ELI_TOOL_KEY", "value_type": "secret", "value": "",
                 "description": "Same value as DIFY_TOOL_KEY on the tool service"}],
            "features": {
                "file_upload": {"enabled": False}, "opening_statement": "", "retriever_resource": {"enabled": False},
                "sensitive_word_avoidance": {"enabled": False}, "speech_to_text": {"enabled": False},
                "suggested_questions": [], "suggested_questions_after_answer": {"enabled": False},
                "text_to_speech": {"enabled": False}},
            "graph": {
                "nodes": nodes,
                "edges": [{"id": f"{s}-{h}-{t}", "source": s, "sourceHandle": h, "target": t, "targetHandle": "target",
                           "type": "custom", "zIndex": 0,
                           "data": {"sourceType": types[s], "targetType": types[t], "isInIteration": False,
                                    "isInLoop": False}}
                          for s, h, t in edges],
                "viewport": {"x": 0, "y": 0, "zoom": 0.6}},
        },
    }


AGENT_OUT = Path(__file__).with_name("hk-eli-agent.yml")

AGENT_PROMPT = """You are the HK ELI Chatbot for the bank's GFM WMS specialists and CBG product and treasury sales managers.
They run the Hong Kong equity-linked investment (ELI) business and can see all trades.

Our code has already read the question, picked the Tableau view and filters, fetched the data as this user and
checked the figures. You get that as CONTEXT (JSON): figures, up to 10 rows (client and position ids hidden),
scope, data freshness (as_of), caveats, and template_answer, a plain sentence that is already correct.

Request id: {{request_id}}

CONTEXT:
{{context}}

How to answer:
1. Answer from CONTEXT. Lead with the answer in one or two sentences, then up to five short bullets.
2. Use only figures that appear in CONTEXT or in a tool result, written exactly as given (same units and rounding).
   Never add, subtract, average or estimate figures yourself. If a figure you need is missing, call a tool.
3. Tools (pass the request id above every time):
   - eli_ask: one more specific data question, answered by code from the views, when CONTEXT does not cover
     what the user asked (another segment, period, underlying, or a comparison). At most 3 calls.
   - eli_views: which views exist, if you are unsure the data can answer it.
4. Say which data it is (scope) and when (as_of). Keep the caveats that matter.
5. Insight, not advice: never say buy, sell, recommend, should, or predict prices. Describe what the data shows.
6. Client names and ids are hidden from you, not from the user: when table_shown_to_user is true, the user sees the
   full table (with names) beside your answer. For "which clients" or "top N" questions, describe what the table
   shows and refer to it ("the 10 largest are listed in the table below"); never refuse because names are hidden,
   and never guess a name.
7. If status is NEEDS_CLARIFICATION, CONTEXT.readings lists the ways our code could read the question. Pick the
   reading that best fits the user's words, fetch it with eli_ask using that reading's question exactly, then
   answer and say in one line which reading you used. If no reading fits, ask the user one short question instead.
8. If the data cannot answer the question (for example no view splits it the way the user asked), say so plainly
   and give the closest figure you have, labelled for what it is.
9. Use the data's own labels: a total of maturities is not a total of knock-outs. Only call something a knock-out
   (KO), knock-in (KI) or expiry (EXP) when the figure is for that result.
10. Plain English, no tables, no code blocks."""


def agent_dsl() -> dict:
    """Dify's "Agent" app type (agent-chat, function calling on Gemini). Its MCP tools are added in Dify after
    import (Tools > MCP > hk-eli), because Dify ties them to the server it registered, not to this file."""
    return {
        "app": {"name": "HK ELI Agent", "mode": "agent-chat", "icon": "🧭", "icon_background": "#0B1F33",
                "description": "Agent variant of the HK ELI Chatbot, for comparison with the Chatflow. Code builds the "
                               "context (view, filters, figures); the agent answers and may call HK ELI MCP tools; code "
                               "grades every figure. *Will be part of Ask-MIRA in future",
                "use_icon_as_answer_icon": False},
        "kind": "app",
        "version": DSL_VERSION,
        "dependencies": [{"current_identifier": None, "type": "marketplace",
                          "value": {"marketplace_plugin_unique_identifier": PLUGIN}}],
        "model_config": {
            "agent_mode": {"enabled": True, "max_iteration": 5, "strategy": "function_call", "tools": [],
                           "prompt": None},
            "model": {"provider": PROVIDER, "name": MODEL, "mode": "chat", "completion_params": {"temperature": 0}},
            "pre_prompt": AGENT_PROMPT,
            "prompt_type": "simple",
            "user_input_form": [
                {"text-input": {"variable": "request_id", "label": "request_id", "required": True,
                                "max_length": 64, "default": ""}},
                {"paragraph": {"variable": "context", "label": "context", "required": True, "max_length": 30000,
                               "default": ""}}],
            "opening_statement": "", "suggested_questions": [],
            "suggested_questions_after_answer": {"enabled": False},
            "speech_to_text": {"enabled": False}, "text_to_speech": {"enabled": False},
            "retriever_resource": {"enabled": False}, "annotation_reply": {"enabled": False},
            "more_like_this": {"enabled": False}, "sensitive_word_avoidance": {"enabled": False},
            "file_upload": {"image": {"enabled": False, "number_limits": 3, "transfer_methods": ["local_file"]}},
            "dataset_configs": {"retrieval_model": "multiple", "datasets": {"datasets": []}},
            "dataset_query_variable": "",
            "chat_prompt_config": {}, "completion_prompt_config": {},
        },
    }


# --- a small YAML writer (no PyYAML in the pinned requirements) -------------------------------------------

def _scalar(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return json.dumps(v)
    return json.dumps(v, ensure_ascii=False)   # a JSON string is a valid YAML double-quoted scalar


def _yaml(v, ind: int = 0) -> list[str]:
    pad = "  " * ind
    out: list[str] = []
    if isinstance(v, dict):
        if not v:
            return [pad + "{}"]
        for k, x in v.items():
            if isinstance(x, str) and "\n" in x:
                out.append(f"{pad}{k}: |" if x.endswith("\n") and not x.endswith("\n\n") else f"{pad}{k}: |-")
                out += [(pad + "  " + ln) if ln else "" for ln in x.rstrip("\n").split("\n")]
            elif isinstance(x, (dict, list)) and x:
                out.append(f"{pad}{k}:")
                out += _yaml(x, ind + 1)
            else:
                out.append(f"{pad}{k}: {_scalar(x) if not isinstance(x, (dict, list)) else ('{}' if isinstance(x, dict) else '[]')}")
        return out
    if isinstance(v, list):
        if not v:
            return [pad + "[]"]
        for x in v:
            if isinstance(x, (dict, list)) and x:
                sub = _yaml(x, ind + 1)
                out.append(pad + "- " + sub[0].lstrip())
                out += sub[1:]
            else:
                out.append(pad + "- " + (_scalar(x) if not isinstance(x, (dict, list)) else "[]"))
        return out
    return [pad + _scalar(v)]


def render() -> str:
    head = "# HK ELI Chatflow for Dify 1.16. Generated by dify/build_dsl.py; edit that file, not this one.\n"
    return head + "\n".join(_yaml(dsl())) + "\n"


def render_agent() -> str:
    head = "# HK ELI Agent (Dify Agent app) for Dify 1.16. Generated by dify/build_dsl.py; edit that file, not this one.\n"
    return head + "\n".join(_yaml(agent_dsl())) + "\n"


if __name__ == "__main__":
    files = {OUT: render(), AGENT_OUT: render_agent()}
    if "--check" in sys.argv:
        stale = [p.name for p, t in files.items() if not p.exists() or p.read_text() != t]
        sys.exit(f"out of date: {', '.join(stale)}: run python dify/build_dsl.py" if stale else 0)
    for p, t in files.items():
        p.write_text(t)
        print(f"wrote {p} ({len(t.splitlines())} lines)")
