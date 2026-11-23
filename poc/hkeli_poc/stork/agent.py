"""The two model steps, each guarded by code.

Step 2 (interpret): rules pre-parse -> Gemini call 1 (prompt `understand`) -> validate against the
intent list and the glossary -> merge. Hints read by code always win; the model only fills gaps and
picks the intent. Any failure falls back to the rules result, and the answer says which path ran.

Step 9 (word): Gemini call 2 (prompt `write_answer`) gets only validated numbers and table cells.
The number check rejects any text holding a figure that is not in that evidence, or a banned phrase;
then the template text stays. The model never sees raw rows beyond the first table rows.
"""
from __future__ import annotations

import json
import re
import time
from datetime import date

from .. import knowledge as KB
from .. import prompts as PR
from ..llm import Call, LLMError
from .understand import Intent, apply_defaults, grain_for, reading_clarify, readings, understand

TICKER = re.compile(r"^(\d{1,5} HK|[A-Z]{1,6} U[WSNQ])$")
FIG = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _call(step, prompt: PR.Prompt, llm) -> Call:
    return Call(step=step, prompt_id=prompt.id, prompt_version=prompt.version, prompt_sha256=prompt.sha256,
                model=getattr(llm, "model", "off"))


# ---------------------------------------------------------------- step 2: interpret
def understand_schema(prompt: PR.Prompt, kb: KB.Knowledge) -> dict:
    return PR.fill_enums(prompt.schema, {
        "INTENTS": kb.intent_ids, "SEGMENTS": kb.values("bp_div_type"), "DISTRICTS": kb.values("cust_district"),
        "BRANCHES": kb.values("cust_branch"), "RESULTS": kb.values("predict_result")})


def needs_model(base: Intent) -> bool:
    """The model is asked only when the rules are unsure. A what-if, a refusal or a value question
    ("which Bay branch?") is settled by code, and a high-confidence rules reading costs no call."""
    if base.shock or base.unsupported:
        return False
    if base.clarify and base.clarify.get("code") != "INTENT_UNSURE":
        return False
    return base.confidence != "high"


def interpret(question: str, today: date, llm, lib: dict, kb: KB.Knowledge, calls: list) -> Intent:
    """Rules first; Gemini as a guarded classifier when the rules miss or are unsure.

    Outcomes: the rules' reading (no call); the model's reading when it agrees with the rules, picks one of
    the rules' own candidates, or is sure where the rules found nothing; otherwise 2-3 'Did you mean'
    readings for the user to pick. Any model failure falls back to the rules, and the answer says so.
    """
    base = understand(question, today)
    if not getattr(llm, "enabled", False) or not needs_model(base):
        return base
    pr = lib["understand"]
    call = _call("understand", pr, llm)
    t0 = time.perf_counter()
    try:
        hints = {k: v for k, v in base.hints.items()
                 if v and k not in ("unsupported", "concepts", "gaps", "clarify", "text", "corrections")}
        values = dict(question=question, today=today.isoformat(), hints_json=json.dumps(hints),
                      intents_json=json.dumps([{k: i[k] for k in ("id", "grain", "label", "example") if k in i}
                                               for i in kb.intents["intents"]]),
                      glossary_json=json.dumps(_glossary_for_prompt(kb)))
        if "examples_json" in pr.inputs:
            values["examples_json"] = json.dumps([[e, i["id"]] for i in kb.intents["intents"] for e in i.get("examples", [])])
        if "rule_reading" in pr.inputs:
            values["rule_reading"] = ", ".join(base.candidates) or "nothing"
        sys_txt, user_txt = pr.render(**values)
        raw = llm.generate_json(sys_txt, user_txt, understand_schema(pr, kb))
        merged, problems = merge_intent(base, raw, kb, today)
        call.latency_ms = round((time.perf_counter() - t0) * 1000)
    except LLMError as e:
        call.latency_ms = round((time.perf_counter() - t0) * 1000)
        call.outcome, call.detail = ("timeout" if e.code == "TIMEOUT" else "error"), e.code
        calls.append(call)
        base.source = "gateway->rules"
        return base
    if problems:
        call.outcome, call.detail = "rejected", ",".join(problems)[:200]
        calls.append(call)
        base.source = "gateway->rules"
        return base
    calls.append(call)
    return decide(base, merged, raw, kb)


def decide(base: Intent, merged: Intent, raw: dict, kb: KB.Knowledge) -> Intent:
    """Combine the rules' and the model's readings. Code decides; the model only votes."""
    m = raw.get("intent")
    conf = raw.get("confidence") if raw.get("confidence") in ("high", "medium", "low") else "medium"
    alts = [a for a in (raw.get("alternatives") or []) if a in kb.intent_ids and a not in ("unknown", m)]
    rules = base.intent
    if m == "unknown":
        # the model is unsure too: keep the rules' reading (or their 'Did you mean' chips)
        base.source = "gateway"
        if rules == "unknown" and not base.clarify and raw.get("needs_clarification") and raw.get("clarification"):
            base.assumptions.append("clarify: " + str(raw["clarification"])[:300])
        return base
    agree = m == rules or (m in base.candidates and conf != "low")
    sure_alone = rules == "unknown" and conf == "high"
    if agree or sure_alone:
        merged.confidence = "high" if m == rules or conf == "high" else "medium"
        if merged.clarify and merged.clarify.get("code") == "INTENT_UNSURE":
            merged.clarify = None
        return merged
    # disagreement, or the model is not sure: ask, with the readings in front
    first = [m, rules] + alts if rules != "unknown" else [m] + alts
    opts = readings(base, first=first)
    if len(opts) < 2:
        return merged
    base.clarify = reading_clarify(base, opts)
    base.source = "gateway"
    base.confidence = "medium"
    return base


def _glossary_for_prompt(kb: KB.Knowledge) -> list[dict]:
    keep = ("id", "label", "terms", "rule", "supported")
    out = []
    for c in kb.glossary["concepts"]:
        d = {k: c[k] for k in keep if k in c}
        if c.get("values"):
            d["values"] = [v["value"] for v in c["values"]]
        out.append(d)
    return out


def merge_intent(base: Intent, raw: dict, kb: KB.Knowledge, today: date) -> tuple[Intent, list[str]]:
    """Validate the model's intent, then merge: code hints win, the model fills gaps."""
    problems = []
    intent = raw.get("intent")
    if intent not in kb.intent_ids:
        problems.append("INTENT_NOT_ALLOWED")
    alts = raw.get("alternatives") or []
    if not isinstance(alts, list) or any(a not in kb.intent_ids for a in alts):
        problems.append("ALTERNATIVE_NOT_ALLOWED")
    segs = raw.get("segments") or []
    if not isinstance(segs, list) or any(s not in kb.values("bp_div_type") for s in segs):
        problems.append("SEGMENT_NOT_ALLOWED")
    for key, cid in (("district", "cust_district"), ("branch", "cust_branch"), ("result", "predict_result")):
        v = raw.get(key)
        if v not in (None, "") and v not in kb.values(cid):
            problems.append(f"{key.upper()}_NOT_ALLOWED")
    wps = raw.get("wps")
    if wps not in (None, "") and not TICKER.match(str(wps)):
        problems.append("WPS_FORMAT")
    wd = raw.get("window_days")
    if wd is not None and (not isinstance(wd, int) or not 1 <= wd <= 366):
        problems.append("WINDOW_OUT_OF_RANGE")
    od = raw.get("on_date")
    if od:
        try:
            if date.fromisoformat(od) < today:
                problems.append("DATE_IN_PAST")
        except (TypeError, ValueError):
            problems.append("DATE_FORMAT")
    if problems:
        return base, problems

    if intent == "unknown" and base.intent != "unknown":
        intent = base.intent      # the model gave up but the rules found a supported intent: use it
    h = base.hints
    it = Intent(question=base.question, hints=h, unsupported=base.unsupported, source="gateway",
                concepts=base.concepts, clarify=base.clarify, candidates=base.candidates, confidence=base.confidence)
    it.assumptions.extend(a for a in base.assumptions if a.startswith("Read '"))
    it.intent = intent
    it.segments = h.get("segments") or segs
    it.district = h.get("district") or raw.get("district") or None
    it.branch = h.get("branch") or raw.get("branch") or None
    it.wps = h.get("wps") or wps or None
    it.result = h.get("result") or raw.get("result") or None
    it.window_days = h.get("window_days") or wd
    it.on_date = h.get("on_date") or od or None
    it.ranking = bool(h.get("ranking") or raw.get("ranking"))
    if raw.get("needs_clarification") and intent == "unknown":
        it.assumptions.append("clarify: " + str(raw.get("clarification") or "")[:300])
    if base.shock:
        # a what-if read by code wins: the named stock is the one being moved, not a WPS filter
        it.intent, it.shock, it.wps = "scenario_analysis", base.shock, None
        it.assumptions.extend(a for a in base.assumptions if a not in it.assumptions)
    it.grain = grain_for(it)
    apply_defaults(it)
    if it.intent != base.intent:
        it.assumptions.append(f"Read as '{intent.replace('_', ' ')}'.")
    return it, []


# ---------------------------------------------------------------- step 9: word
def evidence_figures(out: dict) -> set[str]:
    corpus = [n["display"] for n in out.get("numbers", [])]
    corpus += [str(n["value"]) for n in out.get("numbers", [])]
    tbl = out.get("table") or {}
    corpus += [str(c) for r in tbl.get("rows", []) for c in r]
    corpus += [out.get("scope", ""), out.get("question", ""), json.dumps(out.get("as_of") or {})]
    corpus += [c["text"] for c in out.get("caveats", [])] + list(out.get("assumptions") or [])
    corpus.append(out.get("headline", ""))
    return {_norm(f) for f in FIG.findall(" ".join(corpus))}


def _norm(f: str) -> str:
    f = f.replace(",", "")
    return f.rstrip("0").rstrip(".") if "." in f else f


def check_wording(text: str, allowed: set[str], banned: list[str]) -> list[str]:
    problems = []
    for f in FIG.findall(text):
        if _norm(f) not in allowed:
            problems.append(f"FIGURE_NOT_IN_EVIDENCE:{f}")
    low = text.lower()
    for b in banned:
        if b.lower() in low:
            problems.append("BANNED_PHRASE")
    return problems


def word(out: dict, llm, lib: dict, kb: KB.Knowledge, calls: list) -> str:
    """Returns the insight mode for meta. Changes out['headline'] / out['bullets'] only when checks pass."""
    if not getattr(llm, "enabled", False):
        return "template"
    if out["status"] not in ("OK", "OK_WITH_WARNING") or not out.get("numbers"):
        return "template"
    pr = lib["write_answer"]
    tbl = out.get("table") or {}
    values = dict(
        question=out["question"], scope=out.get("scope", ""), view_label=(out.get("evidence") or [{}])[0].get("view", ""),
        as_of=json.dumps(out.get("as_of") or {}),
        numbers_json=json.dumps([{k: n[k] for k in ("id", "display", "measure")} for n in out["numbers"]]),
        table_json=json.dumps({"columns": tbl.get("columns", []), "rows": tbl.get("rows", [])[:10]}),
        caveats_json=json.dumps([c["text"] for c in out.get("caveats", [])]),
        assumptions_json=json.dumps(out.get("assumptions") or []),
        draft_headline=out.get("headline", ""), domain_md=kb.domain_md)
    allowed = evidence_figures(out)
    # Spec (C13, EH 26): one retry when the text fails the number check, then the template.
    for _attempt in (1, 2):
        call = _call("write_answer", pr, llm)
        t0 = time.perf_counter()
        try:
            sys_txt, user_txt = pr.render(**values)
            raw = llm.generate_json(sys_txt, user_txt, PR.fill_enums(pr.schema, {}))
        except LLMError as e:
            call.latency_ms = round((time.perf_counter() - t0) * 1000)
            call.outcome, call.detail = ("timeout" if e.code == "TIMEOUT" else "error"), e.code
            calls.append(call)
            return "gateway->template"      # the adapter already retried transport errors
        call.latency_ms = round((time.perf_counter() - t0) * 1000)
        head = str(raw.get("headline") or "").strip()
        bullets = [str(b).strip() for b in (raw.get("bullets") or []) if str(b).strip()][:3]
        problems = ["EMPTY"] if not head else check_wording(" ".join([head] + bullets), allowed, pr.banned)
        if problems:
            call.outcome, call.detail = "rejected", ",".join(sorted(set(problems)))[:200]
            calls.append(call)
            continue
        calls.append(call)
        out["draft_headline"] = out["headline"]
        out["headline"] = head
        out["bullets"] = bullets + [b for b in out.get("bullets", []) if b not in bullets]
        return "gateway"
    return "gateway->template"


__all__ = ["interpret", "decide", "needs_model", "word", "merge_intent", "check_wording", "evidence_figures", "understand_schema"]
