"""Conversation state: what a thread is about, carried from turn to turn by code, not by model memory.

Every question in a thread is resolved here first, before any data call, into a standalone question that the
pipeline (native, Dify Chatflow or Dify Agent) answers as if it were asked alone. The state is small and the
same size at turn 5 or turn 50:

    frame   the current topic: intent plus the values the user named or carried (segment, district, branch,
            stock, predicted result, window or date). Defaults the pipeline adds are not carried.
    first   the thread's first topic, for "go back to the first question"
    stack   earlier topics, newest last (at most 10), for "go back"
    sticky  a standing scope the user set ("focus on TRE from now on"), applied until changed or cleared
    recent  the last 6 turns: question as typed, as read, headline (for the Agent's wording only)

Each turn is put in one stage: new topic, refine (keep everything, change what is named), drill (a new
measure on the same scope, "which clients are those?"), go back, set or clear the standing scope, or the
answer to a clarification. Every carried value is shown on the answer ("Continuing: TRE · Wan Chai · next
30 days"), and a carried value that no view can apply is said, never dropped silently.

The state is saved with each answer (the store keeps it per user and per conversation) and only moves when
the answer is valid: a refusal, an error or a clarification leaves the topic where it was.
"""
from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from datetime import date

from .understand import CATCH_ALL, canonical, preparse, understand

SLOTS = ("segments", "district", "branch", "wps", "wps_list", "result", "window_days", "on_date")
MAX_STACK, MAX_RECENT = 10, 6
SHORT = {"Treasures(HK)": "TRE", "Treasures(TPC)": "TPC", "PB": "PB"}
MATURITY_INTENTS = {"maturity_calendar", "maturity_detail", "maturity_branch", "customer_count_maturity"}
# a new measure on the same scope: these carry the scope when the question names none of its own
DRILL_INTENTS = {"maturity_detail", "customer_count", "customer_count_maturity", "maturity_branch", "district",
                 "wps_exposure", "mtm_distribution", "segment_share", "segment_result_share"}

RESET = re.compile(r"\b(start over|start again|new topic|new question|reset|clear (the )?(focus|filters?|scope|context)|"
                   r"forget (that|it|the (focus|filters?|scope|context))|drop the (focus|filters?|scope))\b")
GO_BACK = re.compile(r"\b(go back|back to|return to|as before|like before)\b|\b(first|original|previous|earlier|last) "
                     r"(question|topic|one)\b")
STICKY = re.compile(r"\b(from now on|going forward|for the rest|for now on|until i say|focus on|let'?s (look at|stick to|"
                    r"keep to|talk about|focus on)|stick to|keep to|limit (it|this|everything) to)\b")
CUE = re.compile(r"^(and|but|also|plus|now|then|ok(ay)?|so|same|only|just|vs|versus|instead|for|in|at|by|on|with|"
                 r"without|what about|how about|compared? (to|with)|split|break|drill|zoom|narrow)\b|"
                 r"\b(that|those|these|them|it|its|same|there|this one|the above|instead|as well|too)\b")
REFERS = re.compile(r"\b(that|those|these|them|it|its|the above|behind (it|that|those|this)|this one)\b")
UNION = re.compile(r"\b(compare|compared|vs|versus|against|both|together|combined|side by side)\b")
CLEAR_SEG = re.compile(r"\b(all segments|every segment|whole book|entire book|overall|all of (it|them))\b")
CLEAR_WPS = re.compile(r"\b(any|all|every) (stock|stocks|underlying|underlyings|wps)\b")
PICK = re.compile(r"^\s*(?:the\s+)?(first|second|third|1st|2nd|3rd|[123])\b|^\s*(?:option|number|no\.?)\s*([123])\b")
ORD = {"first": 0, "1st": 0, "1": 0, "second": 1, "2nd": 1, "2": 1, "third": 2, "3rd": 2, "3": 2}


def empty() -> dict:
    return {"frame": None, "first": None, "stack": [], "sticky": {}, "recent": [], "clarify": None, "turns": 0}


@dataclass
class Resolved:
    asked: str                      # what the user typed
    question: str                   # what the pipeline answers (standalone)
    stage: str                      # new | refine | drill | back | sticky | clear | pick | none
    carried: list[str] = field(default_factory=list)   # human labels of values kept from earlier
    frame: dict | None = None       # the topic this turn will set, if its answer is valid
    note: str | None = None         # shown as an assumption
    reply: dict | None = None       # code answers this turn itself (set or clear the scope, can't carry)
    state: dict = field(default_factory=empty)


# ---------------------------------------------------------------- reading values
def named(q: str, today: date) -> dict:
    """The values the user typed in this message (no defaults), and the normalised text."""
    h = preparse(q, today)
    out = {k: copy.deepcopy(h.get(k)) for k in SLOTS if h.get(k)}
    out["_text"] = h["text"]
    return out


def label(slots: dict) -> list[str]:
    bits = []
    if slots.get("segments"):
        bits.append(" + ".join(SHORT.get(s, s) for s in slots["segments"]))
    if slots.get("district"):
        bits.append(slots["district"].replace("TRE-", ""))
    if slots.get("branch"):
        bits.append(slots["branch"])
    if slots.get("wps_list"):
        bits.append("WPS " + ", ".join(slots["wps_list"]))
    elif slots.get("wps"):
        bits.append("WPS " + slots["wps"])
    if slots.get("result"):
        bits.append("predicted " + slots["result"])
    if slots.get("on_date"):
        bits.append("on " + _d(slots["on_date"]))
    elif slots.get("window_days"):
        bits.append(f"next {slots['window_days']} days")
    return bits


def _d(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{int(d)} {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][int(m) - 1]}"


def merge(base: dict, new: dict, text: str) -> dict:
    """Carry `base`, replace each kind the message names with its new value (only that kind)."""
    out = {k: copy.deepcopy(v) for k, v in base.items() if k in SLOTS and v}
    if CLEAR_SEG.search(text):
        out.pop("segments", None)
    if CLEAR_WPS.search(text):
        out.pop("wps", None)
        out.pop("wps_list", None)
    for k in SLOTS:
        if not new.get(k):
            continue
        if k == "segments" and out.get("segments") and UNION.search(text):
            out["segments"] = list(dict.fromkeys(out["segments"] + new["segments"]))
            continue
        out[k] = copy.deepcopy(new[k])
        if k == "district" and out.get("branch") and not new.get("branch"):
            out.pop("branch")                       # a new district: the old branch was inside another one
        if k == "branch" and not new.get("district"):
            out.pop("district", None)               # a branch names its own district
        if k == "wps" and not new.get("wps_list"):
            out.pop("wps_list", None)
        if k == "window_days":
            out.pop("on_date", None)
        if k == "on_date":
            out.pop("window_days", None)
    return out


# ---------------------------------------------------------------- writing the standalone question
def compose(intent: str, slots: dict) -> str:
    """One plain question for this intent and these values, which the rules read back the same way."""
    from .understand import Intent
    it = Intent(question="", intent=intent, segments=list(slots.get("segments") or []),
                district=slots.get("district"), branch=slots.get("branch"), wps=slots.get("wps"),
                wps_list=list(slots.get("wps_list") or []), result=slots.get("result"),
                window_days=slots.get("window_days"), on_date=slots.get("on_date"))
    if intent == "customer_count" and (it.window_days or it.on_date or it.branch or it.district):
        intent = "customer_count_maturity"
    q = canonical(intent, it).rstrip("?")
    q = _fit(q, intent, it)
    return q + "?"


def _fit(q: str, intent: str, it) -> str:
    """Add what canonical() leaves out for this intent, so every carried value is in the question."""
    low = q.lower()
    seg = " + ".join(SHORT.get(s, s) for s in it.segments)
    if seg and seg.lower() not in low and intent not in MATURITY_INTENTS:
        q += f" for {seg}"
    if it.branch and it.branch.lower() not in low:
        q += f" at {it.branch}"
    elif it.district and it.district.replace("TRE-", "").lower() not in low:
        q += f" in {it.district.replace('TRE-', '')}"
    if len(it.wps_list) > 1 and not all(w.lower() in low for w in it.wps_list):
        q += " for " + ", ".join(it.wps_list)
    elif it.wps and it.wps.lower() not in low:
        q += f" with WPS {it.wps}"
    if it.result and it.result.lower() not in low:
        q += f" predicted {it.result}"
    if it.on_date:
        q = re.sub(r" in the next \d+ days", "", q)
        if _d(it.on_date).lower() not in low:
            q += f" on {_d(it.on_date)}"
    elif it.window_days and f"next {it.window_days} days" not in low:
        q += f" in the next {it.window_days} days"
    return q


def _check(q: str, intent: str, slots: dict, today: date) -> str | None:
    """The intent the rules read from the composed question, or None when a value would be lost."""
    it = understand(q, today)
    if it.intent == "unknown" or it.clarify:
        return None
    got = named(q, today)
    for k in ("district", "branch", "wps", "result", "window_days", "on_date"):
        if slots.get(k) and got.get(k) != slots[k]:
            if k == "district" and slots.get("branch"):
                continue
            return None
    if slots.get("segments") and sorted(got.get("segments") or []) != sorted(slots["segments"]):
        if not (intent in MATURITY_INTENTS and slots["segments"] == ["Treasures(HK)"]):
            return None
    return it.intent


# ---------------------------------------------------------------- the turn
def resolve(question: str, state: dict | None, today: date) -> Resolved:
    st = copy.deepcopy(state) if state else empty()
    q = question.strip()
    new = named(q, today)
    text = new.pop("_text")
    r = Resolved(asked=q, question=q, stage="new", state=st)
    frame = st.get("frame")
    sticky = st.get("sticky") or {}

    # 1. clear the context
    if RESET.search(text):
        st.update(frame=None, sticky={}, clarify=None)
        rest = RESET.sub("", text).strip(" ,.;:-")
        if len(rest.split()) < 3:
            r.stage, r.reply = "clear", {"headline": "OK, starting fresh. Nothing from earlier is carried now.",
                                         "followups": ["What is total outstanding ELI?",
                                                       "How much TRE ELI is predicted to mature in the next 30 days?"]}
            return r
        frame, sticky = None, {}

    # 2. the answer to the last clarification ("the second one")
    pend = st.get("clarify")
    if pend and pend.get("options"):
        m = PICK.match(text)
        pick = None
        if m:
            i = ORD.get((m.group(1) or m.group(2) or "").lower())
            if i is not None and i < len(pend["options"]):
                pick = pend["options"][i]
        else:
            pick = next((o for o in pend["options"] if o.get("label") and o["label"].lower() == text.strip(" ?.!")), None)
        if pick:
            r.stage, r.question = "pick", pick["question"]
            r.frame = _frame(pick["question"], today)
            return r

    # 3. go back to an earlier topic
    if GO_BACK.search(text) and (st.get("first") or st.get("stack")):
        target = st["first"] if re.search(r"\b(first|original)\b", text) else (st["stack"][-1] if st["stack"] else st["first"])
        if target:
            r.stage, r.question, r.frame = "back", target["question"], copy.deepcopy(target)
            r.note = f"Back to: {target['question']}"
            return r

    # 4. a standing scope for the rest of the thread
    base_it = understand(q, today)
    if base_it.unsupported:        # advice or a concept no view has: answered as asked, the topic stays put
        return r
    scope_only = base_it.intent == "unknown" or base_it.intent in CATCH_ALL and not re.search(r"outstanding|total|how much", text)
    if STICKY.search(text) and any(new.get(k) for k in SLOTS) and scope_only:
        st["sticky"] = merge(sticky, new, text)
        shown = " · ".join(label(st["sticky"]))
        r.stage = "sticky"
        r.reply = {"headline": f"OK. From now on I'll keep to {shown} unless you name something else. "
                               "Say \"clear the focus\" to drop it.",
                   "followups": [compose("outstanding_total", st["sticky"])]}
        if frame:   # the current topic takes the new scope too
            r.frame = {**frame, "slots": merge(frame["slots"], new, text)}
        return r

    # 5. refine or drill the current topic, or start a new one
    words = len(re.findall(r"[a-z0-9]+", text))
    has_vals = any(new.get(k) for k in SLOTS)
    cue = bool(CUE.search(text))
    refers = bool(REFERS.search(text))
    new_intent = base_it.intent if base_it.intent != "unknown" and not base_it.clarify else None
    if new_intent in CATCH_ALL and not re.search(r"outstanding|\btotal\b|\bbook\b", text):
        new_intent = None          # "how much ..." alone keeps the measure
    if frame:
        if new_intent is None and (has_vals or cue):
            r.stage, intent = "refine", frame["intent"]
        elif new_intent and (refers or (new_intent in DRILL_INTENTS and not has_vals and words <= 6)
                             or (cue and new_intent == frame["intent"])):
            r.stage, intent = "drill", new_intent
        elif new_intent is None and words <= 4 and not has_vals:
            r.stage, intent = "refine", frame["intent"]
        else:
            r.stage = "new"
    if r.stage in ("refine", "drill"):
        slots = merge(frame["slots"], new, text)
        if intent in MATURITY_INTENTS and any(s != "Treasures(HK)" for s in slots.get("segments") or []):
            seg = " + ".join(SHORT.get(s, s) for s in slots["segments"])
            keep = " · ".join(label({k: v for k, v in slots.items() if k != "segments"}))
            r.reply = {"headline": f"Maturity figures cover Treasures (HK) only, so I have no {seg} maturity figure"
                                   f"{' for ' + keep if keep else ''}. Nothing else was changed.",
                       "followups": [compose("outstanding_total", {"segments": slots["segments"]}),
                                     frame["question"]],
                       "code": "SCOPE_NOT_AVAILABLE"}
            return r
        cq = compose(intent, slots)
        got = _check(cq, intent, slots, today)
        if got is None:          # a value would be lost on the way: answer as typed and say so
            r.stage, r.note = "new", "Read on its own: I couldn't carry the earlier scope into this question."
            return _apply_sticky(r, sticky, new, text, today)
        r.question = cq
        r.carried = [b for b in label(slots) if b not in label(new)]
        r.frame = {"intent": got, "slots": slots, "question": cq}
        if r.carried:
            r.note = "Continuing: " + " · ".join(label(slots)) + "."
        return r
    return _apply_sticky(r, sticky, new, text, today)


def _apply_sticky(r: Resolved, sticky: dict, new: dict, text: str, today: date) -> Resolved:
    """A new topic: only the standing scope is carried, into the values the question leaves open."""
    it = understand(r.asked, today)
    if not sticky or it.intent == "unknown" or it.clarify or it.unsupported:
        r.frame = _frame(r.asked, today)
        return r
    slots = merge(sticky, new, text)
    if it.intent in MATURITY_INTENTS and any(s != "Treasures(HK)" for s in slots.get("segments") or []):
        slots.pop("segments")
    cq = compose(it.intent, slots)
    got = _check(cq, it.intent, slots, today)
    if got is None:
        r.frame = _frame(r.asked, today)
        r.note = "Your standing focus (" + " · ".join(label(sticky)) + ") doesn't apply to this question."
        return r
    r.question = cq
    r.carried = [b for b in label(slots) if b not in label(new)]
    r.frame = {"intent": got, "slots": slots, "question": cq}
    if r.carried:
        r.note = "Keeping your focus: " + " · ".join(label(slots)) + "."
    return r


def _frame(q: str, today: date) -> dict | None:
    it = understand(q, today)
    if it.intent == "unknown" or it.clarify or it.unsupported or it.shock:
        return None
    n = named(q, today)
    n.pop("_text", None)
    return {"intent": it.intent, "slots": n, "question": q}


# ---------------------------------------------------------------- after the answer
def advance(r: Resolved, answer: dict) -> dict:
    """The state to save with this answer. The topic moves only when the answer is valid."""
    st = copy.deepcopy(r.state)
    st["turns"] = st.get("turns", 0) + 1
    ok = answer.get("status") in ("OK", "OK_WITH_WARNING") and not r.reply
    if answer.get("status") == "NEEDS_CLARIFICATION" and answer.get("clarify"):
        prev = st.get("clarify") or {}
        st["clarify"] = {"options": [{"label": o.get("label", ""), "question": o["question"]}
                                     for o in answer["clarify"].get("options") or [] if o.get("question")],
                         "for": r.asked, "count": (prev.get("count", 0) + 1) if prev.get("for") == r.asked else 1}
    else:
        st["clarify"] = None
    if r.stage == "sticky" and r.frame:
        st["frame"] = r.frame
    if ok and r.frame:
        cur = st.get("frame")
        if cur and cur.get("question") != r.frame.get("question") and r.stage in ("new", "back", "pick"):
            st["stack"] = (st.get("stack") or [])[-(MAX_STACK - 1):] + [cur]
        st["frame"] = r.frame
        if not st.get("first"):
            st["first"] = r.frame
    st["recent"] = (st.get("recent") or [])[-(MAX_RECENT - 1):] + [
        {"asked": r.asked[:300], "read_as": r.question[:300], "headline": (answer.get("headline") or "")[:300],
         "status": answer.get("status", "")}]
    return st


def view(r: Resolved) -> dict:
    """What the answer shows about the thread."""
    return {"stage": r.stage, "read_as": r.question if r.question != r.asked else None,
            "carried": r.carried, "focus": label(r.state.get("sticky") or {})}
