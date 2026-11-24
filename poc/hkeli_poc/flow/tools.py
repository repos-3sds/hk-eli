"""Stage 2: the tools the Dify Chatflow calls. Code still decides the view, the filters and every figure."""
from __future__ import annotations

import json
import re

from ..llm import LLMError
from ..stork import agent
from .refs import REFS, Turn

FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.S)


class ToolError(Exception):
    def __init__(self, code: str, status: int = 400):
        super().__init__(code)
        self.code, self.status = code, status


def turn(request_id: str) -> Turn:
    t = REFS.get(request_id or "")
    if not t:
        raise ToolError("UNKNOWN_REQUEST", 404)
    return t


def parse_json(text: str | dict | None) -> dict | None:
    """The model's JSON as Dify passes it on (text, maybe fenced). None when absent or not an object."""
    if isinstance(text, dict):
        return text
    if not text or not str(text).strip():
        return None
    try:
        v = json.loads(FENCE.sub("", str(text).strip()))
    except ValueError:
        return None
    return v if isinstance(v, dict) else None


class Replay:
    """Stands in for the model inside pipeline.answer: replays what Dify's model returned for `understand`."""
    provider = "dify"

    def __init__(self, model: str, raw: dict | None, error: str | None):
        self.model = model or "dify"
        self._raw, self._error = raw, error
        self.enabled = raw is not None or error is not None

    def generate_json(self, system: str, user: str, schema: dict) -> dict:
        self.enabled = False
        if self._raw is None:
            raise LLMError(self._error or "BAD_RESPONSE")
        return self._raw


def answer(request_id: str, model_text: str | dict | None, answer_fn, lib: dict, kb, model: str = "dify") -> dict:
    """Run the deterministic pipeline (fetch from Tableau as the user, validate, compose) with the model's
    reading replayed, and hand Dify the `write_answer` prompt when the answer may be worded."""
    t = turn(request_id)
    raw = parse_json(model_text) if t.needs_model else None
    error = None
    if t.needs_model and raw is None:
        error = "NOT_JSON" if str(model_text or "").strip() else "NO_MODEL_OUTPUT"
    llm = Replay(model, raw, error) if t.needs_model else Replay(model, None, None)
    a = answer_fn(t, llm)
    t.calls = a.get("_llm_calls", [])
    t.draft = a
    can_word = bool(a.pop("_word_step", False)) and agent.wordable(a)   # only where the native pipeline words
    res = {"request_id": t.request_id, "status": a["status"], "headline": a.get("headline", ""),
           "wordable": "yes" if can_word else "no", "word_system": "", "word_user": ""}
    if can_word:
        t.word = agent.word_prompt(masked(a), lib, kb)
        res.update(_word_inputs(t))
    return res


ID_COLUMNS = {"Cif Id", "Pos Id", "RM", "Rm Name", "Customer", "Customer Name"}


def masked(a: dict) -> dict:
    """The answer as the wording model may see it: client and position identifiers masked (Dify stores its
    prompts in its run log, so they never carry who the client is)."""
    tbl = a.get("table") or {}
    cols = tbl.get("columns") or []
    hide = {i for i, c in enumerate(cols) if c in ID_COLUMNS}
    if not hide:
        return a
    rows = [["(hidden)" if i in hide else v for i, v in enumerate(r)] for r in tbl.get("rows", [])]
    return {**a, "table": {**tbl, "rows": rows}}


def reword(request_id: str) -> dict:
    """The `write_answer` prompt again, with the problems the grade found (one rewrite only)."""
    t = turn(request_id)
    if not t.word:
        raise ToolError("NOTHING_TO_REWORD", 409)
    res = {"request_id": t.request_id, "status": t.draft["status"] if t.draft else "", "wordable": "yes",
           "headline": (t.draft or {}).get("headline", "")}
    res.update(_word_inputs(t, problems=t.problems))
    return res


def _word_inputs(t: Turn, problems: list[str] | None = None) -> dict:
    sys_txt, user_txt, schema = t.word
    sys_txt += "\n\nReturn one JSON object only, no code fences. JSON schema:\n" + json.dumps(schema, separators=(",", ":"))
    if problems:
        user_txt += ("\n\nYour previous text was rejected by the figure check: " + ", ".join(sorted(set(problems)))
                     + ". Use only the figures given above, exactly as written, and none of the banned phrases.")
    return {"word_system": sys_txt, "word_user": user_txt}


def openapi(base_url: str) -> dict:
    """OpenAPI 3.0 schema for Dify's custom tool provider ("eli-tools"). Auth: API key, Bearer, DIFY_TOOL_KEY."""
    def op(op_id: str, summary: str, extra: dict | None = None, out: dict | None = None) -> dict:
        props = {"request_id": {"type": "string", "description": "The request id Dify received as an input"}}
        props.update(extra or {})
        return {"post": {"operationId": op_id, "summary": summary,
                         "requestBody": {"required": True, "content": {"application/json": {"schema": {
                             "type": "object", "required": ["request_id"], "properties": props}}}},
                         "responses": {"200": {"description": "OK", "content": {"application/json": {"schema": {
                             "type": "object", "properties": out or {}}}}}}}}
    s = {"type": "string"}
    return {
        "openapi": "3.0.1",
        "info": {"title": "HK ELI tools", "version": "1.0.0",
                 "description": "Deterministic steps of the HK ELI Chatbot. Code picks the view, filters and figures."},
        "servers": [{"url": base_url}],
        "paths": {
            "/tools/context": op("eli_context", "Rules reading and the understand prompt for this request",
                                 out={"needs_model": s, "rules_intent": s, "understand_system": s, "understand_user": s}),
            "/tools/answer": op("eli_answer", "Fetch from Tableau as the user, validate, compose; returns the wording prompt",
                                {"model_text": {"type": "string", "description": "The understand model's JSON text, or empty"}},
                                out={"status": s, "headline": s, "wordable": s, "word_system": s, "word_user": s}),
            "/tools/reword": op("eli_reword", "The wording prompt again with the problems the figure check found",
                                out={"status": s, "headline": s, "word_system": s, "word_user": s}),
        },
    }
