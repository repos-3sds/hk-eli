"""Stage 3: Python grades what Dify wrote, and reflects (asks for one rewrite) when it fails."""
from __future__ import annotations

from ..llm import Call
from ..stork import agent
from .tools import parse_json
from .refs import Turn


def grade(t: Turn, text: str, lib: dict, model: str, attempt: int) -> list[str]:
    """Check the worded answer against the draft's evidence. On a pass it becomes the answer.

    Same rule as the native pipeline: every number must be a validated figure from this answer,
    no banned phrase, and a headline must be there.
    """
    pr = lib["write_answer"]
    raw = parse_json(text)
    problems = agent.grade_wording(t.draft, raw or {}, None, pr.banned) if raw is not None else ["NOT_JSON"]
    call = Call(step="write_answer", prompt_id=pr.id, prompt_version=pr.version, prompt_sha256=pr.sha256,
                model=model or "dify")
    if problems:
        call.outcome, call.detail = "rejected", ",".join(sorted(set(problems)))[:200]
        t.problems = problems
    else:
        agent.apply_wording(t.draft, raw)
        t.draft["meta"]["insight"] = "gateway"
    t.calls.append(call)
    t.extra["attempts"] = attempt
    return problems


def give_up(t: Turn) -> None:
    """Both attempts failed the check: the template answer stays, and the answer says which path ran."""
    t.draft["meta"]["insight"] = "gateway->template"
