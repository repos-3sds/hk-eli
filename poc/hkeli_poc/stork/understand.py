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

from ..data import DISTRICTS

SEGMENT_WORDS = [
    (r"\btpc\b|treasures\s*\(?tpc", "Treasures(TPC)"),
    (r"\btre\b|treasures(?!\s*\(?tpc)", "Treasures(HK)"),
    (r"\bpb\b|private bank", "PB"),
]
TICKER_ALIASES = {
    "alibaba": "9988 HK", "baba": "9988 HK", "tencent": "700 HK", "meituan": "3690 HK",
    "xiaomi": "1810 HK", "byd": "1211 HK", "nvidia": "NVDA UW", "nvda": "NVDA UW",
    "intel": "INTC UW", "intc": "INTC UW", "tesla": "TSLA UW", "tsla": "TSLA UW",
    "apple": "AAPL UW", "aapl": "AAPL UW", "amd": "AMD UW",
}
RESULT_WORDS = [
    (r"below strike", "EXP(Below Strike)"),
    (r"\bko\b|knock[\s-]?out", "KO"),
    (r"\bex\b|exercis|physical delivery", "EX"),
    (r"\bexp\b|expire", "EXP"),
]
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
    s = q.lower()
    hints: dict = {"segments": []}
    for pat, val in SEGMENT_WORDS:
        if re.search(pat, s) and val not in hints["segments"]:
            hints["segments"].append(val)
    m = re.search(r"\bd\s?([123])\b", s)
    if m:
        hints["district"] = f"TRE-D{m.group(1)}"
    for d, branches in DISTRICTS.items():
        for b in branches:
            if b.lower() in s:
                hints["branch"] = b
    m = re.search(r"\b(\d{3,4})\s*(?:\.?\s?hk)\b", s)
    if m:
        hints["wps"] = f"{int(m.group(1))} HK"
    for alias, t in TICKER_ALIASES.items():
        if re.search(rf"\b{alias}\b", s):
            hints["wps"] = t
    for pat, val in RESULT_WORDS:
        if re.search(pat, s):
            hints["result"] = val
            break
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
    return hints


def understand(q: str, today: date) -> Intent:
    h = preparse(q, today)
    s = q.lower()
    it = Intent(question=q, segments=h["segments"], district=h.get("district"), branch=h.get("branch"),
                wps=h.get("wps"), result=h.get("result"), window_days=h.get("window_days"),
                on_date=h.get("on_date"), ranking=h["ranking"], hints=h)
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
