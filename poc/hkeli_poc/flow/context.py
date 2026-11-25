"""Stage 1: Python assembles the initial context Dify receives."""
from __future__ import annotations

from .. import config
from ..stork import agent
from ..stork.understand import understand
from .refs import REFS, Turn


def build(request_id: str, user: str, question: str, site: str, scenario: str | None, lib: dict, kb) -> Turn:
    """Rules reading of the question and, when the rules are unsure, the rendered `understand` prompt.

    Terminal cases (a refusal, a value to pick) need no model: needs_model is False and the `answer` tool
    returns them without a fetch, exactly as the native pipeline does.
    """
    today = config.get().today()
    base = understand(question, today)
    need = agent.needs_model(base)
    prompt = agent.understand_prompt(base, question, today, lib, kb) if need else None
    t = Turn(request_id=request_id, user=user, question=question, site=site, scenario=scenario,
             needs_model=need, understand=prompt)
    t.extra["rules"] = {"intent": base.intent, "confidence": base.confidence, "candidates": list(base.candidates)}
    REFS.put(t)
    return t


def package(t: Turn) -> dict:
    """What the `context` tool hands Dify: prompts and flags only (no rows, no secrets)."""
    out = {"request_id": t.request_id, "needs_model": "yes" if t.needs_model else "no",
           "rules_intent": t.extra.get("rules", {}).get("intent", ""),
           "understand_system": "", "understand_user": ""}
    if t.understand:
        sys_txt, user_txt, schema = t.understand
        out["understand_system"] = sys_txt + "\n\nReturn one JSON object only, no code fences. JSON schema:\n" + _compact(schema)
        out["understand_user"] = user_txt
    return out


def _compact(schema: dict) -> str:
    import json
    return json.dumps(schema, separators=(",", ":"))
