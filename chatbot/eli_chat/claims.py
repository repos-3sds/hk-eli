"""Checks every figure in an answer against the tool results it was written from.

A figure is *matched* when some number in the evidence equals it within the rounding the
answer shows ("USD 12.4m" matches 12,437,000; "25%" matches 24.63). Figures the model derived
(a sum of two rows) or invented are *unmatched* and shown to the user under the answer. This
is the base version of the claims contract: it reports, it does not block (see README).
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable

_SCALE = {"k": 1e3, "thousand": 1e3, "m": 1e6, "mn": 1e6, "mm": 1e6, "million": 1e6,
          "b": 1e9, "bn": 1e9, "billion": 1e9}

FIGURE = re.compile(
    r"(?P<cur>USD|HKD|US\$|\$)?\s?"
    r"(?P<num>-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)"
    r"(?:\s?(?P<unit>%|bp|bps|k|mn|mm|m|bn|b|thousand|million|billion)(?![a-z]))?",
    re.I)

# Things that look like numbers but are identifiers or dates.
_SKIP = [
    re.compile(r"\b\d{4}-\d{2}(?:-\d{2})?\b"),                    # 2026-11-02, 2026-11
    re.compile(r"\b[cCPRTw]-?\d{2,6}\b"),                           # c-4821, P00004, R00001, w-01
    re.compile(r"••\d+"),                                           # masked CIF
    re.compile(r"\b\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s\d{4})?\b", re.I),
    re.compile(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s\d{1,2}(?:,?\s\d{4})?\b", re.I),
    re.compile(r"\b(?:Q[1-4]|H[12])\s?\d{4}\b"),
    re.compile(r"\b\d+\s?(?:-\s?)?(?:months?|business days?|calendar days?|days?|weeks?|years?)\b", re.I),
]


@dataclass
class Check:
    checked: int = 0
    matched: int = 0
    unmatched: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        if not self.checked:
            return "no-figures"
        return "all-matched" if not self.unmatched else "some-unmatched"

    def as_dict(self) -> dict[str, Any]:
        return {**asdict(self), "status": self.status}


def _numbers_in(obj: Any) -> Iterable[float]:
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        yield float(obj)
    elif isinstance(obj, str):
        for m in re.finditer(r"-?\d+(?:\.\d+)?", obj.replace(",", "")):
            yield float(m.group())
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _numbers_in(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from _numbers_in(v)


def evidence_numbers(tool_payloads: Iterable[str], extra_text: str = "") -> list[float]:
    nums: set[float] = set()
    for payload in tool_payloads:
        try:
            nums.update(_numbers_in(json.loads(payload)))
        except (json.JSONDecodeError, TypeError):
            nums.update(_numbers_in(payload))
    nums.update(_numbers_in(extra_text))
    derived = set()
    for n in nums:
        derived.update({abs(n), n * 100, n / 100})   # ratio <-> percent, sign written as words
    return sorted(nums | derived)


def _mask(text: str) -> str:
    for rx in _SKIP:
        text = rx.sub(lambda m: " " * len(m.group()), text)
    return text


def check(answer: str, tool_payloads: Iterable[str], question: str = "") -> Check:
    body = answer.split("FOLLOWUPS:")[0]
    evidence = evidence_numbers(tool_payloads, question)
    result = Check()
    for m in FIGURE.finditer(_mask(body)):
        raw_num = m.group("num")
        unit = (m.group("unit") or "").lower()
        cur = m.group("cur")
        value = float(raw_num.replace(",", ""))
        # Bare small integers ("3 clients", "top 5") are counted only when they carry a unit or currency.
        if not unit and not cur and "." not in raw_num and abs(value) <= 12:
            continue
        decimals = len(raw_num.split(".")[1]) if "." in raw_num else 0
        scale = _SCALE.get(unit, 1.0)
        tol = 0.5 * (10 ** -decimals) * scale + 1e-9
        if unit in ("", "%") and decimals == 0 and abs(value) >= 1000:
            tol = 0.5                                     # an exact amount written in full
        readings = [(value * scale, tol)]
        if unit == "m" and not cur and value <= 60 and not decimals:
            readings.append((value, 1e-9))                # "6m" as a tenor in months
        result.checked += 1
        if any(abs(abs(t) - e) <= tl for t, tl in readings for e in evidence):
            result.matched += 1
        else:
            result.unmatched.append(m.group().strip())
    return result
