"""One question through the Dify flow, as events for the widget: stage, token (draft), answer, error."""
from __future__ import annotations

import json
import re
import time
from typing import Iterator

from . import context as C
from . import grade as G
from .dify import DifyError
from .refs import REFS

STAGE = {"Context": "Planning the steps", "Understand": "Understanding the question",
         "Answer from data": "Querying the view as you", "Word": "Writing the answer",
         "Reword": "Rewriting after the figure check"}
HEAD = re.compile(r'"headline"\s*:\s*"((?:[^"\\]|\\.)*)')


def draft_headline(text: str) -> str:
    """The headline so far, read from a JSON object that is still streaming in."""
    m = HEAD.search(text)
    if not m:
        return ""
    s = m.group(1)
    if s.endswith("\\"):
        s = s[:-1]
    try:
        return json.loads(f'"{s}"')
    except ValueError:
        return s


def ask(question: str, user: str, site: str, scenario: str | None, request_id: str, engine, lib: dict, kb,
        conversation_id: str | None = None) -> Iterator[tuple[str, dict]]:
    """Yields ("stage"|"token", data) while it works, then ("answer", answer) as the last event.

    Raises DifyError when Dify fails before an answer exists; the caller turns it into the error event.
    """
    t0 = time.perf_counter()
    t = C.build(request_id, user, question, site, scenario, lib, kb)
    yield ("stage", {"n": 1, "name": "Assemble", "label": "Reading the question", "ms": 0.0})
    try:
        inputs = {"request_id": request_id, "mode": "answer"}
        gen = _drain(engine, inputs, question, user, conversation_id, t0, 1, worded=True)
        text, end = yield from gen
        if t.draft is None:
            raise DifyError("NO_ANSWER", "Dify finished without calling the answer tool")
        a = t.draft
        if t.word:          # the model worded it: grade, then reflect once, then the template
            n = end["n"] + 1
            yield ("stage", {"n": n, "name": "Grade", "label": "Checking the figures",
                             "ms": round((time.perf_counter() - t0) * 1000, 1)})
            problems = G.grade(t, text, lib, getattr(engine, "model", "dify"), attempt=1)
            if problems:
                text, end = yield from _drain(engine, {"request_id": request_id, "mode": "reword"}, question, user,
                                              conversation_id, t0, n, worded=True)
                problems = G.grade(t, text, lib, getattr(engine, "model", "dify"), attempt=2)
                if problems:
                    G.give_up(t)
        a["_llm_calls"] = t.calls
        a["meta"]["orchestrator"] = "dify"
        a["meta"]["dify"] = {"conversation_id": end.get("conversation_id"), "message_id": end.get("message_id")}
        yield ("answer", a)
    finally:
        REFS.drop(request_id)


def _drain(engine, inputs, query, user, conv, t0, n0, worded):
    """Relay events as they arrive (generator delegation), returning (text, end)."""
    text, end, n = "", {}, n0
    for ev in engine.chat(inputs, query, user, conv):
        k = ev["event"]
        if k == "node_started" and ev.get("title") in STAGE:
            n += 1
            yield ("stage", {"n": n, "name": ev["title"], "label": STAGE[ev["title"]],
                             "ms": round((time.perf_counter() - t0) * 1000, 1)})
        elif k == "message":
            text += ev.get("answer", "")
            h = draft_headline(text) if worded else ""
            if h:
                yield ("token", {"text": h, "state": "checking"})
        elif k == "message_replace":
            text = ev.get("answer", "")
        elif k == "message_end":
            end = ev
        elif k == "error":
            raise DifyError(ev.get("code", "DIFY_ERROR"), ev.get("message", ""))
        elif k == "workflow_finished" and ev.get("status") not in (None, "succeeded"):
            raise DifyError("WORKFLOW_" + str(ev.get("status")).upper(), ev.get("error") or "")
    return text, {"n": n, **end}
