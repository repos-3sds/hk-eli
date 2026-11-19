"""The agent loop: the model chooses tools, code runs them, the model writes the answer, code checks it.

One turn yields events the page renders as they arrive:

    start      {provider, model, written_by}
    tool_start {id, name, label, args}
    tool_end   {id, name, title, source, rows, error, ms}
    delta      {text}                      the answer as it streams (FOLLOWUPS line included; the page hides it)
    discard    {}                          text streamed in a turn that then called tools: working notes, not the answer
    final      {answer, followups, results, check, provider, model, written_by, tools_used, ms, usage}
    error      {message}

The loop is bounded (`MAX_TOOL_ROUNDS`). Tools never raise into it; a tool failure goes back to
the model as an error result, which the prompt tells it to say plainly.
"""
from __future__ import annotations

import queue
import re
import threading
import time
from typing import Any, Iterator

from . import book, claims, prompts, settings, tools
from .providers import Provider, ProviderError


def split_followups(text: str) -> tuple[str, list[str]]:
    m = re.search(r"\n?\s*FOLLOWUPS:\s*(.+?)\s*$", text, re.S)
    if not m:
        return text.strip(), []
    follow = [f.strip(" -*•\t") for f in m.group(1).split("|")]
    return text[:m.start()].strip(), [f for f in follow if f][:3]


def history_messages(history: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Earlier turns from the page, as plain text (tool calls are not replayed)."""
    out: list[dict[str, Any]] = []
    for h in (history or [])[-settings.MAX_HISTORY_TURNS * 2:]:
        role = h.get("role")
        text = str(h.get("text", ""))[:4000]
        if role in ("user", "assistant") and text:
            out.append({"role": role, "text": text})
    return out


def run_turn(question: str, provider: Provider, persona: str = "wms",
             history: list[dict[str, Any]] | None = None) -> Iterator[dict[str, Any]]:
    started = time.monotonic()
    yield {"type": "start", "provider": provider.name, "model": provider.model, "written_by": provider.written_by}
    system = prompts.system_prompt(persona, book.as_of(), book.today())
    messages = history_messages(history) + [{"role": "user", "text": question}]
    schemas = [t.schema() for t in tools.TOOLS]
    results: list[tools.ToolResult] = []
    payloads: list[str] = []
    usage: dict[str, int] = {}

    for round_no in range(settings.MAX_TOOL_ROUNDS + 1):
        offer = schemas if round_no < settings.MAX_TOOL_ROUNDS else []   # last round: answer, no more tools
        streamed = False
        outcome: dict[str, Any] = {}
        for kind, value in _stream(provider, system, messages, offer, outcome):
            streamed = True
            yield {"type": "delta", "text": value}
        if "error" in outcome:
            yield {"type": "error", "message": outcome["error"]}
            return
        turn = outcome["turn"]
        for k, v in (turn.usage or {}).items():
            if isinstance(v, int):
                usage[k] = usage.get(k, 0) + v
        if not turn.tool_calls:
            answer, followups = split_followups(turn.text)
            if not answer:
                yield {"type": "error", "message": "The model returned an empty answer. Please ask again."}
                return
            check = claims.check(answer, payloads, question)
            yield {
                "type": "final", "answer": answer, "followups": followups,
                "results": [r.for_ui() for r in results], "check": check.as_dict(),
                "provider": provider.name, "model": provider.model, "written_by": provider.written_by,
                "tools_used": [r.tool for r in results], "ms": int((time.monotonic() - started) * 1000),
                "usage": usage, "as_of": book.as_of(),
            }
            return
        # Text the model wrote alongside a tool call is working notes, not the answer.
        if streamed:
            yield {"type": "discard"}
        messages.append({"role": "assistant", "text": turn.text, "tool_calls": turn.tool_calls, "raw": turn.raw})
        tool_msg: dict[str, Any] = {"role": "tool", "results": []}
        for call in turn.tool_calls:
            tool = tools.BY_NAME.get(call.name)
            yield {"type": "tool_start", "id": call.id, "name": call.name, "args": call.args,
                   "label": tool.label if tool else call.name}
            t0 = time.monotonic()
            result = tools.run(call.name, call.args, persona)
            payload = result.for_model()
            results.append(result)
            if not result.error:
                payloads.append(payload)
            tool_msg["results"].append({"id": call.id, "name": call.name, "content": payload})
            yield {"type": "tool_end", "id": call.id, "name": call.name, "title": result.title,
                   "source": result.source, "rows": len(result.rows), "error": result.error,
                   "ms": int((time.monotonic() - t0) * 1000)}
        messages.append(tool_msg)

    yield {"type": "error", "message": "The agent used its tool budget without writing an answer."}


def _stream(provider: Provider, system: str, messages: list[dict[str, Any]], offer: list[dict[str, Any]],
            outcome: dict[str, Any]) -> Iterator[tuple[str, str]]:
    """Run one model turn on a worker thread and yield its text as it arrives."""
    q: queue.Queue = queue.Queue()

    def work() -> None:
        try:
            outcome["turn"] = provider.turn(system, messages, offer, on_text=lambda t: q.put(("text", t)))
        except ProviderError as exc:
            outcome["error"] = str(exc)
        except Exception as exc:  # noqa: BLE001 - said to the user, never swallowed
            outcome["error"] = f"{type(exc).__name__}: {exc}"
        finally:
            q.put(("done", ""))

    threading.Thread(target=work, daemon=True).start()
    while True:
        kind, value = q.get()
        if kind == "done":
            return
        yield kind, value
