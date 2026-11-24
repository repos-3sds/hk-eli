"""The Agent variant, to compare with the Chatflow.

Python does the context engineering first: it reads the question, picks the Tableau view and filters, fetches
as the user, validates and composes, then masks client and position ids. That "context pack" goes to a Dify
Agent app (agent-chat) with the question. The agent answers from it, and may call our MCP tools (flow/mcp.py)
when it needs more data. Python then grades the agent's text against every figure it was given (the pack and
each tool result), asks for one rewrite, and otherwise keeps the template answer.

Refusals, clarifications and empty results never reach the agent: code answers them, as in the Chatflow.
"""
from __future__ import annotations

import json
import re
import time
from typing import Iterator

from ..stork import agent
from .dify import DifyError
from .refs import REFS, Turn
from .tools import Replay, masked

MAX_TOOL_CALLS = 4
TOOL_LABEL = {"eli_ask": "Looking up more data", "eli_views": "Checking which views exist"}


def pack(a: dict, rows: int = 10) -> dict:
    """What the agent may see of an answer: figures, a few masked rows, scope, freshness, caveats."""
    m = masked(a)
    tbl = m.get("table") or {}
    return {
        "question": a.get("question", ""), "status": a.get("status", ""),
        "template_answer": a.get("headline", ""),
        "view": (a.get("evidence") or [{}])[0].get("view", ""), "scope": a.get("scope", ""),
        "as_of": a.get("as_of") or {},
        "figures": [{k: n.get(k) for k in ("id", "display", "measure")} for n in a.get("numbers", [])],
        "table": {"columns": tbl.get("columns", []), "rows": tbl.get("rows", [])[:rows],
                  "rows_total": len(tbl.get("rows", []))},
        "caveats": [c["text"] for c in a.get("caveats", [])],
        "assumptions": list(a.get("assumptions") or []),
        "table_shown_to_user": bool(tbl.get("rows")),   # the widget shows the full table, real names, beside the text
        "readings": [{"label": o.get("label", ""), "question": o.get("question", "")}
                     for o in ((a.get("clarify") or {}).get("options") or [])][:5],
    }


def resolvable(a: dict) -> bool:
    """A question our rules read several ways: the agent may pick a reading and fetch it with eli_ask."""
    return a.get("status") == "NEEDS_CLARIFICATION" and bool((a.get("clarify") or {}).get("options"))


def evidence(t: Turn) -> list[dict]:
    return t.extra.setdefault("evidence", [])


def allowed(t: Turn) -> set[str]:
    out: set[str] = set()
    for a in evidence(t):
        out |= agent.evidence_figures(a)
    return out


def tool_ask(t: Turn, question: str, answer_fn) -> dict:
    """MCP `eli_ask`: another data question, answered by code as the same user. Its figures join the evidence."""
    n = t.extra.get("tool_calls", 0)
    if n >= MAX_TOOL_CALLS:
        return {"error": "TOO_MANY_TOOL_CALLS", "limit": MAX_TOOL_CALLS}
    t.extra["tool_calls"] = n + 1
    sub = Turn(request_id=t.request_id, user=t.user, question=question.strip()[:500], site=t.site,
               scenario=t.scenario, needs_model=False, understand=None)
    a = answer_fn(sub, Replay("rules", None, None))
    a.pop("_word_step", None)
    evidence(t).append(a)
    t.extra.setdefault("tools_used", []).append({"tool": "eli_ask", "question": sub.question, "status": a["status"]})
    return pack(a)


def build(request_id: str, user: str, question: str, site: str, scenario: str | None, answer_fn) -> Turn:
    t = Turn(request_id=request_id, user=user, question=question, site=site, scenario=scenario,
             needs_model=False, understand=None)
    a = answer_fn(t, Replay("rules", None, None))   # rules reading; code picks the view, filters and figures
    a.pop("_word_step", None)
    t.draft = a
    evidence(t).append(a)
    REFS.put(t)
    return t


BULLET = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")


def split_text(text: str) -> tuple[str, list[str]]:
    """Agent prose to the widget's headline and bullets: first paragraph, then list lines."""
    lines = [ln.strip() for ln in text.strip().splitlines()]
    head, bullets, rest = "", [], []
    for ln in lines:
        if not ln:
            continue
        if BULLET.match(ln):
            bullets.append(BULLET.sub("", ln).strip())
        elif not head:
            head = ln.strip("# ").strip()
        else:
            rest.append(ln)
    return head, bullets + rest


def grade(t: Turn, text: str, banned: list[str]) -> list[str]:
    if not text.strip():
        return ["EMPTY"]
    return agent.check_wording(text, allowed(t), banned)


def ask(question: str, user: str, site: str, scenario: str | None, request_id: str, engine, lib: dict,
        answer_fn, conversation_id: str | None = None) -> Iterator[tuple[str, dict]]:
    """Yields ("stage"|"token", data) then ("answer", answer). Raises DifyError if Dify fails first."""
    t0 = time.perf_counter()

    def ms():
        return round((time.perf_counter() - t0) * 1000, 1)

    yield ("stage", {"n": 1, "name": "Assemble", "label": "Reading the question", "ms": 0.0})
    t = build(request_id, user, question, site, scenario, answer_fn)
    yield ("stage", {"n": 2, "name": "Context", "label": "Querying the view as you", "ms": ms()})
    a, n = t.draft, 2
    try:
        if not (agent.wordable(a) or resolvable(a)):   # refusal, nothing found, value to pick: code answers
            a["meta"]["orchestrator"] = "dify-agent"
            a["meta"]["insight"] = "template"
            yield ("answer", a)
            return
        inputs = {"request_id": request_id, "context": json.dumps(pack(a), separators=(",", ":"))}
        banned = lib["write_answer"].banned
        text, end, n = yield from _drain(engine, inputs, question, user, conversation_id, t0, n)
        n += 1
        yield ("stage", {"n": n, "name": "Grade", "label": "Checking the figures", "ms": ms()})
        problems = grade(t, text, banned)
        attempts = 1
        if problems and text.strip() and end.get("conversation_id"):
            attempts = 2
            fix = ("Your previous answer was rejected by the figure check (" + ", ".join(sorted(set(problems)))[:300]
                   + "). Rewrite it using only figures from the context or from tool results, exactly as written, "
                   "and none of the banned phrases.")
            text, end2, n = yield from _drain(engine, inputs, fix, user, end["conversation_id"], t0, n)
            end = {**end, **{k: v for k, v in end2.items() if v}}
            problems = grade(t, text, banned)
        if not agent.wordable(a):
            # the agent picked a reading: the last answer it fetched becomes the base, the clarification goes
            done = [e for e in evidence(t)[1:] if agent.wordable(e)]
            if done and not problems:
                a = {**done[-1], "meta": {**done[-1].get("meta", {}), **{k: v for k, v in a["meta"].items()
                                                                          if k in ("request_id",)}}}
                a["question"] = question
                a["assumptions"] = list(a.get("assumptions") or []) + ["Read as: " + done[-1].get("question", "")]
            else:
                problems = problems or ["NO_READING_FETCHED"]
        if problems:
            a["meta"]["insight"] = "agent->template"
            a["meta"]["agent_problems"] = sorted(set(problems))[:10]
        else:
            head, bullets = split_text(text)
            a["draft_headline"] = a["headline"]
            a["headline"], a["bullets"] = head, bullets[:6]
            a["agent_text"] = text
            a["meta"]["insight"] = "agent"
        a["meta"]["orchestrator"] = "dify-agent"
        a["meta"]["agent"] = {"attempts": attempts, "tools": t.extra.get("tools_used", []),
                              "conversation_id": end.get("conversation_id"), "message_id": end.get("message_id")}
        yield ("answer", a)
    finally:
        REFS.drop(request_id)


def _drain(engine, inputs, query, user, conv, t0, n0):
    text, end, n, seen = "", {}, n0, set()
    for ev in engine.chat(inputs, query, user, conv):
        k = ev["event"]
        if k == "agent_thought" and ev.get("tool"):
            for name in [x.strip() for x in str(ev["tool"]).split(";") if x.strip()]:
                if (ev.get("id"), name) in seen:
                    continue
                seen.add((ev.get("id"), name))
                n += 1
                yield ("stage", {"n": n, "name": "Tool:" + name, "label": TOOL_LABEL.get(name, "Using " + name),
                                 "ms": round((time.perf_counter() - t0) * 1000, 1)})
        elif k == "message":
            text += ev.get("answer", "")
            yield ("token", {"text": text.strip()[:600], "state": "checking"})
        elif k == "message_replace":
            text = ev.get("answer", "")
        elif k == "message_end":
            end = ev
        elif k == "error":
            raise DifyError(ev.get("code", "DIFY_ERROR"), ev.get("message", ""))
        elif k == "workflow_finished" and ev.get("status") not in (None, "succeeded", "partial-succeeded"):
            raise DifyError("WORKFLOW_" + str(ev.get("status")).upper(), ev.get("error") or "")
    return text, end, n
