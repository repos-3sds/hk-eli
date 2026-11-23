"""Filter-value translation (discovery module "Filter Resolution").

Turns the user's wording for a value into the value stored in Tableau, the way logical-query-mcp's
engine translates filter values: exact spellings first, then a name search; several matches means
ask, none means say so with the closest real values. Code never guesses a value that is not listed.
"""
from __future__ import annotations

import difflib
from dataclasses import dataclass, field

from ..catalog import Catalog
from .concepts import tokens


@dataclass
class ValueResult:
    status: str                    # exact | unique | ambiguous | none
    text: str
    value: str | None = None
    candidates: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)


def _spellings(v: dict) -> list[str]:
    return [s for s in (v["value"], v.get("short", ""), v.get("meaning", "")) if s]


def translate(cat: Catalog, concept_id: str, text: str) -> ValueResult:
    """Translate `text` into one stored value of `concept_id`."""
    vals = cat.values(concept_id)
    want = tokens(text, keep_filler=True)
    if not want:
        return ValueResult("none", text)
    for v in vals:
        if any(tokens(s, keep_filler=True) == want for s in _spellings(v)):
            return ValueResult("exact", text, v["value"])
    # name search: every word of the text starts a word of the value (like LIKE '%text%', but by word)
    cands = []
    for v in vals:
        words = tokens(v["value"], keep_filler=True) + tokens(v.get("short", ""), keep_filler=True)
        if all(any(w.startswith(t) for w in words) for t in want):
            cands.append(v["value"])
    if len(cands) == 1:
        return ValueResult("unique", text, cands[0], cands)
    if cands:
        return ValueResult("ambiguous", text, None, cands)
    labels = {s.lower(): v["value"] for v in vals for s in _spellings(v)}
    close = difflib.get_close_matches(text.lower(), list(labels), n=3, cutoff=0.6)
    return ValueResult("none", text, None, [], list(dict.fromkeys(labels[c] for c in close)) or [v["value"] for v in vals])
