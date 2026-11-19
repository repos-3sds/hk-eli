"""No model: code picks the tool by keywords and writes the answer from the tool's rows.

Used when no model is configured or reachable, and by the tests. Every answer it writes is
labelled "written by code" in the UI, so nobody mistakes it for the agent. It follows the
same loop and tools, so the page, the tools and the figure check can be exercised offline.
"""
from __future__ import annotations

import json
import re
import uuid
from typing import Any

from .base import ModelTurn, TextSink, ToolCall

ROUTES: list[tuple[str, str, dict[str, Any]]] = [
    (r"\b(knock[- ]?out|ko\b|barrier)", "knockout_watch", {}),
    (r"\b(matur|roll|call today|who should i call|expir)", "maturing_deals", {}),
    (r"\b(concentrat|exposure|limit|top underlying|underlying)", "book_concentration", {}),
    (r"\b(idea|warehouse|pitch)", "idea_warehouse", {}),
    (r"\b(rfq|quote|demand|asking)", "unmet_demand", {}),
    (r"\b(conversion|hit rate)", "rfq_conversion", {}),
    (r"\b(trend|monthly|month by month)", "sales_trend", {}),
    (r"\b(branch|sales|revenue)", "sales_by_branch", {}),
    (r"\b(coupon|yield)", "product_coupons", {}),
    (r"\b(digibank|digital|journey)", "digital_journey", {}),
    (r"\b(top clients|largest clients|biggest clients)", "top_clients", {}),
]

FOLLOWUPS = {
    "book_concentration": ["Which clients hold the largest NVDA exposure?", "What matures in the next 10 business days?",
                           "Show this month's RFQs by underlying"],
    "maturing_deals": ["Which maturing clients have not been contacted?", "Show the rollover pipeline",
                       "Which deals are near their knock-out barrier?"],
    "knockout_watch": ["Tell me about Wong Ka Lok", "What matures in the next 10 business days?",
                       "How concentrated is the book?"],
}


def _client_query(text: str) -> str | None:
    m = re.search(r"\b(c-\d{3,5})\b", text, re.I)
    if m:
        return m.group(1)
    m = re.search(r"\b(?:about|for|client|profile of|brief on)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})", text)
    return m.group(1) if m else None


def _fmt(v: Any, key: str) -> str:
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if key.endswith("_usd"):
            return f"USD {v:,.0f}"
        if key.endswith("_pct"):
            return f"{v:g}%"
        return f"{v:,}" if isinstance(v, int) else f"{v:,.2f}"
    return "" if v is None else str(v)


class OfflineProvider:
    name = "offline"
    model = "rules"
    written_by = "code"

    def turn(self, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]],
             on_text: TextSink | None = None) -> ModelTurn:
        last_user = max(i for i, m in enumerate(messages) if m["role"] == "user")
        question = messages[last_user]["text"]
        results = [r for m in messages[last_user + 1:] if m["role"] == "tool" for r in m["results"]]
        if not results:
            name, args = self._route(question)
            if name:
                return ModelTurn(tool_calls=[ToolCall(id=uuid.uuid4().hex[:12], name=name, args=args)])
            text = ("I can answer questions on the ELI book: concentration, maturities and rollovers, clients, "
                    "knock-out watch, RFQs, sales and the idea warehouse. Try one of the suggestions.\n\n"
                    "FOLLOWUPS: How concentrated is the book? | What matures in the next 10 business days? | "
                    "Which deals are near their knock-out barrier?")
        else:
            text = self._write(results)
        if on_text:
            for i in range(0, len(text), 24):
                on_text(text[i:i + 24])
        return ModelTurn(text=text, finish="stop")

    def _route(self, q: str) -> tuple[str | None, dict[str, Any]]:
        who = _client_query(q)
        if who:
            return "client_profile", {"query": who}
        low = q.lower()
        for pattern, name, args in ROUTES:
            if re.search(pattern, low):
                return name, dict(args)
        return None, {}

    def _write(self, results: list[dict[str, Any]]) -> str:
        out: list[str] = []
        name = results[0]["name"]
        for r in results:
            body = json.loads(r["content"])
            if body.get("error"):
                out.append(f"The {r['name'].replace('_', ' ')} data could not be read: {body['error']}")
                continue
            rows, cols = body.get("rows", []), body.get("columns", {})
            if not rows:
                out.append(f"No rows matched in the book as of {body.get('as_of')}. An empty result is not a zero book.")
                continue
            out.append(f"From **{body['source']}**, as of {body['as_of']}:")
            keys = list(cols)[:6]
            out.append("| " + " | ".join(cols[k] for k in keys) + " |")
            out.append("|" + "---|" * len(keys))
            for row in rows[:8]:
                out.append("| " + " | ".join(_fmt(row.get(k), k) for k in keys) + " |")
            if len(rows) > 8:
                out.append(f"\nShowing 8 of {body.get('rows_note', len(rows))} rows.")
            for k, v in (body.get("totals") or {}).items():
                if isinstance(v, (int, float)):
                    out.append(f"- {k.replace('_', ' ')}: {_fmt(v, k)}")
        follow = FOLLOWUPS.get(name, ["How concentrated is the book?", "What matures in the next 10 business days?",
                                      "Show the idea warehouse"])
        return "\n".join(out) + "\n\nFOLLOWUPS: " + " | ".join(follow)
