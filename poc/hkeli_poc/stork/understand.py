"""Steps 1-2: pre-parse and understanding.

In the target design (rediscovery doc, 06 PL 11.1 C5/C6) a deterministic
pre-parser feeds hints to Gemini call #1, which returns a structured intent.
This POC runs the deterministic path only, so it works with no model key and
gives the same answer every time in front of the workbook owners. The output
shape is the intent contract from agent-intent-classification.md (intent,
grain, filters, time scope, ranking) plus `assumptions[]`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from .. import catalog as CAT
from .. import knowledge as KB
from . import concepts as CON
from .values import translate


def _kb():
    from .. import config
    return KB.load(str(config.get().knowledge_dir))


def _catalog():
    from .. import config
    cfg = config.get()
    if not cfg.concept_matcher:
        return None
    return CAT.load(str(cfg.catalog_path) if cfg.catalog_path else None)


GAP_TEXT = ("{label} is in the catalog, but none of the published HK_ELI views carries it, "
            "so there is no figure I can show for it.")
NOT_A_BRANCH = CON.FILLER | {"which", "each", "every", "per", "largest", "biggest", "top", "most", "by", "my", "this",
                             "that", "those", "these", "their", "other", "any", "some", "same", "one", "d1", "d2", "d3"}


MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


@dataclass
class Intent:
    question: str
    intent: str = "unknown"
    grain: str = ""
    segments: list[str] = field(default_factory=list)
    district: str | None = None
    branch: str | None = None
    wps: str | None = None
    result: str | None = None
    window_days: int | None = None
    on_date: str | None = None
    ranking: bool = False
    assumptions: list[str] = field(default_factory=list)
    hints: dict = field(default_factory=dict)
    unsupported: list[dict] = field(default_factory=list)   # glossary concepts this build can't answer
    source: str = "rules"                                   # rules | gateway | gateway->rules
    concepts: list[dict] = field(default_factory=list)      # catalog concepts the question names (concept matcher)
    clarify: dict | None = None                             # a value the user named that is ambiguous or unknown

    def scope_line(self) -> str:
        bits = []
        bits.append(" + ".join(s.replace("Treasures(HK)", "TRE").replace("Treasures(TPC)", "TPC") for s in self.segments) or "All segments")
        if self.district:
            bits.append(self.district.replace("TRE-", ""))
        if self.branch:
            bits.append(self.branch)
        if self.wps:
            bits.append(f"WPS {self.wps}")
        if self.result:
            bits.append(f"predicted {self.result}")
        if self.on_date:
            bits.append(f"predicted maturity on {self.on_date}")
        elif self.window_days:
            bits.append(f"predicted maturity next {self.window_days} days")
        return " · ".join(bits)


def preparse(q: str, today: date) -> dict:
    """Deterministic hints from the glossary. These are facts the model may not override."""
    kb = _kb()
    s = q.lower()
    hints: dict = {"segments": []}
    for pat, val in kb.value_patterns("bp_div_type"):
        if re.search(pat, s) and val not in hints["segments"]:
            hints["segments"].append(val)
    for pat, val in kb.value_patterns("cust_district"):
        if re.search(pat, s):
            hints["district"] = val
            break
    for b in kb.branches:
        if b.lower() in s:
            hints["branch"] = b
    m = re.search(r"\b(\d{3,4})\s*(?:\.?\s?hk)\b", s)
    if m:
        hints["wps"] = f"{int(m.group(1))} HK"
    for alias, t in kb.ticker_aliases.items():
        if re.search(rf"\b{alias}\b", s):
            hints["wps"] = t
    for pat, val in kb.value_patterns("predict_result"):
        if re.search(pat, s):
            hints["result"] = val
            break
    hints["unsupported"] = [c["id"] for c in kb.unsupported_hits(q)]
    m = re.search(r"next\s+(\d+)\s*(day|week)", s)
    if m:
        n = int(m.group(1))
        hints["window_days"] = n * 7 if m.group(2) == "week" else n
    elif "next week" in s:
        hints["window_days"] = 7
    elif "next month" in s:
        hints["window_days"] = 30
    m = re.search(r"\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", s)
    if m:
        mo = MONTHS[m.group(2)]
        yr = today.year if mo >= today.month - 1 else today.year + 1
        hints["on_date"] = date(yr, mo, int(m.group(1))).isoformat()
    hints["ranking"] = bool(re.search(r"\b(largest|top|most|biggest|highest|rank|which)\b", s))
    cat = _catalog()
    if cat is not None:
        _catalog_hints(q, s, cat, hints)
    return hints


def _catalog_hints(q: str, s: str, cat, hints: dict) -> None:
    """Concept matcher (logical-query-mcp rules) on top of the regex pre-parse.

    Regex hints win. The matcher fills values the regex missed (catalog aliases, for example the office
    catalog's synonyms), reports concepts no view carries, and asks when a named value is ambiguous
    or unknown. Every value still comes from the catalog's lists.
    """
    res = CON.matcher(cat).resolve(q)
    hints["concepts"] = res.summary()
    seg = [v for v in res.values("bp_div_type") if v not in hints["segments"]]
    if not hints["segments"] and seg:
        hints["segments"] = seg
    for key, cid in (("district", "cust_district"), ("branch", "cust_branch"), ("result", "predict_result"), ("wps", "wps")):
        vals = res.values(cid)
        if not hints.get(key) and len(vals) == 1:
            hints[key] = vals[0]
    hints["gaps"] = [{"id": h.concept, "label": h.label} for h in res.gaps() if h.reason == "no published view carries it"]
    # an unknown district number ("D4") is a value the user named: say so instead of answering for all districts
    m = re.search(r"\b(?:district\s*|d\s?)(\d{1,2})\b", s)
    if m and not hints.get("district") and cat.has("cust_district"):
        r = translate(cat, "cust_district", f"D{int(m.group(1))}")
        if r.status in ("exact", "unique"):
            hints["district"] = r.value
        elif r.status == "none":
            hints["clarify"] = {"code": "VALUE_NOT_FOUND", "concept": "cust_district", "text": m.group(0),
                                "options": r.suggestions}
    # "<name> branch": a partial branch name resolves when it fits one branch and is asked about when it fits several
    if not hints.get("branch") and cat.has("cust_branch"):
        for m in re.finditer(r"\b((?:[a-z]+\s)?[a-z]+)\s+branch(?:es)?\b", s):
            words = [w for w in m.group(1).split() if w not in NOT_A_BRANCH]
            if not words:
                continue
            r = translate(cat, "cust_branch", " ".join(words))
            if r.status in ("exact", "unique"):
                hints["branch"] = r.value
                break
            if r.status == "ambiguous":
                hints["clarify"] = {"code": "VALUE_AMBIGUOUS", "concept": "cust_branch", "text": " ".join(words),
                                    "options": r.candidates}
                break


def understand(q: str, today: date) -> Intent:
    h = preparse(q, today)
    s = q.lower()
    it = Intent(question=q, segments=h["segments"], district=h.get("district"), branch=h.get("branch"),
                wps=h.get("wps"), result=h.get("result"), window_days=h.get("window_days"),
                on_date=h.get("on_date"), ranking=h["ranking"], hints=h)
    kb = _kb()
    it.unsupported = [{"id": c["id"], "label": c["label"], "rule": c.get("rule", ""),
                      "user_text": c.get("user_text") or f"Questions about {c['label'].lower()} are not supported yet."} for c in kb.unsupported_hits(q)]
    it.unsupported += [{"id": g["id"], "label": g["label"], "rule": "catalog: no published view carries it",
                        "user_text": GAP_TEXT.format(label=g["label"][:1].upper() + g["label"][1:])} for g in h.get("gaps", [])
                       if g["id"] not in {u["id"] for u in it.unsupported}]
    it.concepts = h.get("concepts", [])
    it.clarify = h.get("clarify")
    maturity = bool(re.search(r"matur|calendar|roll|coming due", s))
    customers = bool(re.search(r"how many\b[^?]*?\b(customers|clients)|number of (customers|clients)|customer count|distinct customers", s))

    if re.search(r"as of|how fresh|data date|refresh|up to date|how old", s):
        it.intent, it.grain = "data_as_of", "kpi"
    elif "trade date" in s:
        it.intent, it.grain = "data_recency", "kpi"
    elif customers and (maturity or it.district or it.branch):
        it.intent, it.grain = "customer_count_maturity", "district" if not it.branch else "branch"
    elif customers:
        it.intent, it.grain = "customer_count", "segment_result"
    elif re.search(r"share|percent|%|proportion", s):
        it.intent = "segment_result_share" if it.result else "segment_share"
        it.grain = "segment_result" if it.result else "segment"
    elif re.search(r"distribution|mtm", s):
        it.intent, it.grain = "mtm_distribution", "mtm_bin"
    elif re.search(r"client|rm list|follow[\s-]?up|positions|who ", s):
        it.intent, it.grain = "maturity_detail", "position"
    elif re.search(r"\bwps\b|worst|exposure|which stock|underlying", s):
        it.intent, it.grain = "wps_exposure", "wps"
    elif "branch" in s and (maturity or it.window_days):
        it.intent, it.grain = "maturity_branch", "branch"
    elif re.search(r"district|compare d", s):
        it.intent, it.grain = "district", "district"
    elif maturity:
        it.intent, it.grain = "maturity_calendar", "date"
    elif re.search(r"outstanding|total|how much", s):
        it.intent, it.grain = "outstanding_total", "kpi"

    return apply_defaults(it)


GRAIN = {"outstanding_total": "kpi", "segment_share": "segment", "segment_result_share": "segment_result",
         "customer_count": "segment_result", "mtm_distribution": "mtm_bin", "maturity_detail": "position",
         "wps_exposure": "wps", "maturity_branch": "branch", "district": "district", "maturity_calendar": "date",
         "data_recency": "kpi", "data_as_of": "kpi", "unknown": ""}


def grain_for(it: Intent) -> str:
    if it.intent == "customer_count_maturity":
        return "branch" if it.branch else "district"
    return GRAIN.get(it.intent, "")


def apply_defaults(it: Intent) -> Intent:
    """Business defaults the spec fixes in code, whoever classified the question (rules or model)."""
    s = it.question.lower()
    maturity = bool(re.search(r"matur|calendar|roll|coming due", s))
    if it.intent.startswith("maturity") or it.intent == "customer_count_maturity":
        if not it.segments:
            it.segments = ["Treasures(HK)"]
            it.assumptions.append("Maturity answers cover Treasures (HK) only, so TRE is assumed.")
        if not it.window_days and not it.on_date:
            it.window_days = 30
            it.assumptions.append("No window given, so the standard next 30 days is used.")
        if maturity:
            it.assumptions.append("'Maturity' means predicted maturity, not contractual maturity.")
    if it.intent == "wps_exposure" and it.window_days is None and ("Treasures(HK)" in it.segments and len(it.segments) == 1):
        it.window_days = 30
        it.assumptions.append("TRE WPS exposure uses the standard next 30 days.")
    return it
