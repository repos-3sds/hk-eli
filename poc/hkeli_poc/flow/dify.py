"""Talking to Dify: the Service API stream (DifyClient) and an in-process stand-in (LocalDify) that walks
the same graph as dify/hk-eli-chat.yml, for tests and for laptops without Dify.

Both yield the same small event dicts:
    {"event": "node_started", "title": "..."}     a node began (the widget shows it as a stage)
    {"event": "message", "answer": "..."}         a chunk of the streamed answer text
    {"event": "message_end", "conversation_id", "message_id"}
    {"event": "error", "code", "message"}
"""
from __future__ import annotations

import json
from typing import Iterator

import httpx

from ..llm import LLMError
from . import context as C
from . import tools as T


class DifyError(Exception):
    def __init__(self, code: str, msg: str = ""):
        super().__init__(msg or code)
        self.code = code


def parse_sse(lines: Iterator[str]) -> Iterator[dict]:
    """Dify sends `data: {json}` lines; the event name is inside the JSON. `ping` and blanks are skipped."""
    for line in lines:
        if not line or not line.startswith("data:"):
            continue
        body = line[5:].strip()
        if not body:
            continue
        try:
            ev = json.loads(body)
        except ValueError:
            continue
        kind = ev.get("event")
        if kind == "ping":
            continue
        if kind == "node_started":
            yield {"event": "node_started", "title": (ev.get("data") or {}).get("title", ""),
                   "node_type": (ev.get("data") or {}).get("node_type", "")}
        elif kind in ("message", "agent_message"):
            yield {"event": "message", "answer": ev.get("answer", "")}
        elif kind == "message_replace":
            yield {"event": "message_replace", "answer": ev.get("answer", "")}
        elif kind == "message_end":
            yield {"event": "message_end", "conversation_id": ev.get("conversation_id"), "message_id": ev.get("message_id")}
        elif kind == "workflow_finished":
            d = ev.get("data") or {}
            yield {"event": "workflow_finished", "status": d.get("status"), "error": d.get("error"),
                   "workflow_run_id": ev.get("workflow_run_id")}
        elif kind == "error":
            yield {"event": "error", "code": str(ev.get("code") or "DIFY_ERROR"), "message": str(ev.get("message") or "")[:300]}


class DifyClient:
    """POST /v1/chat-messages with response_mode=streaming (Dify Service API, app key in the header)."""

    def __init__(self, base_url: str, api_key: str, timeout_s: float = 60.0, http: httpx.Client | None = None):
        self.base = base_url.rstrip("/")
        self.key = api_key
        self.http = http or httpx.Client(timeout=httpx.Timeout(timeout_s, connect=10.0))
        self.model = "dify"

    def chat(self, inputs: dict, query: str, user: str, conversation_id: str | None = None) -> Iterator[dict]:
        body = {"inputs": inputs, "query": query, "response_mode": "streaming", "user": user}
        if conversation_id:
            body["conversation_id"] = conversation_id
        try:
            with self.http.stream("POST", f"{self.base}/v1/chat-messages", json=body,
                                  headers={"Authorization": f"Bearer {self.key}"}) as r:
                if r.status_code >= 400:
                    r.read()
                    raise DifyError(f"HTTP_{r.status_code}", r.text[:300])
                yield from parse_sse(r.iter_lines())
        except httpx.TimeoutException as e:
            raise DifyError("TIMEOUT", str(e)) from e
        except httpx.HTTPError as e:
            raise DifyError("UNREACHABLE", str(e)) from e


class LocalDify:
    """The Chatflow's graph, run in this process. Model nodes call `llm` (off, gateway, stork or a fake)."""

    def __init__(self, llm, answer_fn, lib: dict, kb, chunk: int = 24):
        self.llm, self.answer_fn, self.lib, self.kb, self.chunk = llm, answer_fn, lib, kb, chunk
        self.model = getattr(llm, "model", "off")

    def _model(self, system: str, user: str) -> str:
        if not getattr(self.llm, "enabled", False):
            return ""
        try:
            return json.dumps(self.llm.generate_json(system, user, {}))
        except LLMError:
            return ""          # the LLM node's fail branch: empty text, the tools fall back

    def _stream(self, text: str) -> Iterator[dict]:
        for i in range(0, len(text), self.chunk):
            yield {"event": "message", "answer": text[i:i + self.chunk]}

    def chat(self, inputs: dict, query: str, user: str, conversation_id: str | None = None) -> Iterator[dict]:
        rid = inputs["request_id"]
        if inputs.get("mode") == "reword":
            yield {"event": "node_started", "title": "Reword"}
            w = T.reword(rid)
            yield {"event": "node_started", "title": "Word"}
            yield from self._stream(self._model(w["word_system"], w["word_user"]))
            yield {"event": "message_end", "conversation_id": conversation_id, "message_id": None}
            return
        yield {"event": "node_started", "title": "Context"}
        c = C.package(T.turn(rid))
        model_text = ""
        if c["needs_model"] == "yes":
            yield {"event": "node_started", "title": "Understand"}
            model_text = self._model(c["understand_system"], c["understand_user"])
        yield {"event": "node_started", "title": "Answer from data"}
        r = T.answer(rid, model_text, self.answer_fn, self.lib, self.kb, model=self.model)
        if r["wordable"] == "yes":
            yield {"event": "node_started", "title": "Word"}
            text = self._model(r["word_system"], r["word_user"])
            yield from self._stream(text)
        else:
            yield from self._stream(r["headline"])
        yield {"event": "message_end", "conversation_id": conversation_id, "message_id": None}
