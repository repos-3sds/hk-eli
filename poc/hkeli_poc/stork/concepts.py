"""Concept resolution over the semantic catalog (discovery module "Concept Resolution").

The matching rules follow logical-query-mcp's search_catalog, re-implemented in memory (our catalog
is small, so no Elasticsearch is needed) and adapted to HK ELI:

1. Glossary: short forms are also read as their term and their meaning ("KO'd" -> "ko", "knock out").
2. Whole-word matching: a catalog name, alias or coded value matches only when every one of its words
   is in the question, in order. Sharing one word is not a match: "tax status" never finds deal status.
3. Longest match wins: "predicted maturity" beats "maturity"; the same span may name two concepts
   ("outstanding" is both the LIVE population and the HKD measure).
4. Honest gaps: a concept the catalog knows but no published view carries is reported as such, so the
   answer says "not in any view" instead of answering with a different figure.
5. Explicit search (`search`): each concept arrives with up to three alternative wordings and comes back
   `found` or `not_found`, with suggestions that share a word. This is the contract for a model that
   splits the question into concepts.

No model is involved. Code reads the catalog; nothing here invents a value.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field

from ..catalog import Catalog

FILLER = {"a", "an", "the", "of", "in", "on", "for", "is", "are", "that", "which", "with", "all", "our", "to",
          "by", "and", "what", "how", "me", "show", "give", "list", "do", "does", "we", "have", "has", "be"}
MIN_CODE_LENGTH = 2
MAX_FIELDS = 5
MAX_SUGGESTIONS = 3
MAX_ALTERNATIVES = 3


def _stem(t: str) -> str:
    if len(t) > 4 and t.endswith("ies"):
        return t[:-3] + "y"
    if len(t) > 4 and re.search(r"(ch|sh|x)es$", t):
        return t[:-2]
    if len(t) > 2 and t.endswith("s") and not t.endswith("ss"):
        return t[:-1]
    return t


def tokens(text: str, keep_filler: bool = False) -> list[str]:
    out = [_stem(t) for t in re.findall(r"[a-z0-9]+", text.lower().replace("’", "'").replace("'", " "))]
    return out if keep_filler else [t for t in out if t not in FILLER]


@dataclass
class Hit:
    concept: str
    label: str
    kind: str                     # name | value | metric
    text: str                     # catalog wording that matched
    value: str | None = None      # stored value, when a coded value matched
    views: list[str] = field(default_factory=list)
    supported: bool = True        # False: catalog marks it unsupported, or no view carries it
    reason: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Resolution:
    hits: list[Hit]

    def ids(self) -> list[str]:
        return list(dict.fromkeys(h.concept for h in self.hits))

    def values(self, cid: str) -> list[str]:
        return list(dict.fromkeys(h.value for h in self.hits if h.concept == cid and h.value))

    def gaps(self) -> list[Hit]:
        return [h for h in self.hits if not h.supported]

    def summary(self) -> list[dict]:
        return [{"concept": h.concept, "value": h.value, "via": h.text, "in_views": len(h.views),
                 **({"gap": h.reason} if not h.supported else {})} for h in self.hits]


class Matcher:
    def __init__(self, cat: Catalog):
        self.cat = cat
        self.forms: list[tuple[tuple[str, ...], dict]] = []
        for c in cat.concepts:
            views = cat.views_for(c["id"])
            supported = c.get("supported", True) is not False and bool(views or c["kind"] == "parameter")
            reason = ("marked unsupported in the catalog" if c.get("supported") is False
                      else "" if supported else "no published view carries it")
            base = dict(concept=c["id"], label=c.get("label", c["id"]), views=views, supported=supported, reason=reason)
            names = [c.get("label", ""), c["id"].replace("_", " "), *c.get("aliases", [])]
            for n in names:
                self._add(n, dict(base, kind="name", text=n))
            for v in c.get("values", []):
                for spelling in (v["value"], v.get("short", "")):
                    if spelling and len(spelling.replace(" ", "")) >= MIN_CODE_LENGTH:
                        self._add(spelling, dict(base, kind="value", text=spelling, value=v["value"]))
            for alias, value in (c.get("valueAliases") or {}).items():
                self._add(alias, dict(base, kind="value", text=alias, value=value))
        for m in cat.metrics:
            for n in [m["name"], *m.get("synonyms", [])]:
                self._add(n, dict(concept=f"metric:{m['id']}", label=m["name"], kind="metric", text=n,
                                  views=[], supported=True, reason=""))
        self.glossary = []
        for g in cat.glossary:
            spellings = sorted({" ".join(tokens(s, True)) for s in [g["term"], *g.get("aliases", [])] if tokens(s, True)},
                               key=len, reverse=True)
            self.glossary.append((spellings, " ".join(tokens(g["term"], True)),
                                  " ".join(tokens(g["meaning"].split(",")[0], True))))

    def _add(self, text: str, payload: dict) -> None:
        t = tuple(tokens(text, keep_filler=True))
        if t:
            self.forms.append((t, payload))

    # ------------------------------------------------------------- glossary readings
    def readings(self, text: str, keep_filler: bool = False) -> list[list[str]]:
        base = " ".join(tokens(text, keep_filler=True))
        out = [base]
        for use_meaning in (False, True):
            cur = f" {base} "
            for spellings, term, meaning in self.glossary:
                target = meaning if use_meaning else term
                for s in spellings:
                    if f" {s} " in cur:
                        cur = cur.replace(f" {s} ", f" {target} ")
                        break
            cur = cur.strip()
            if cur and cur not in out:
                out.append(cur)
        words = [r.split() for r in out]
        return words if keep_filler else [[w for w in r if w not in FILLER] for r in words]

    # ------------------------------------------------------------- scan a question
    def resolve(self, question: str) -> Resolution:
        """Every catalog concept the question names. Names and coded values are matched in two passes,
        so a longer name ("predicted KO") never hides the value inside it (KO)."""
        found: dict[tuple, Hit] = {}
        spans_of: dict[tuple, set] = {}
        readings = self.readings(question, keep_filler=True)
        for pass_kinds in (("name", "metric"), ("value",)):
            forms = [(f, p) for f, p in self.forms if p["kind"] in pass_kinds]
            for r, words in enumerate(readings):
                spans = []
                for form, p in forms:
                    n = len(form)
                    for i in range(len(words) - n + 1):
                        if tuple(words[i:i + n]) == form:
                            spans.append((i, i + n, p))
                spans.sort(key=lambda s: (-(s[1] - s[0]), s[0]))
                claimed: dict[int, tuple[int, int]] = {}
                for a, b, p in spans:
                    owner = {claimed.get(k) for k in range(a, b)} - {None}
                    if owner and owner != {(a, b)}:
                        continue          # inside a longer match
                    for k in range(a, b):
                        claimed[k] = (a, b)
                    key = (p["concept"], p.get("value"))
                    spans_of.setdefault(key, set()).add((r, a, b))
                    if key not in found:
                        found[key] = Hit(**p)
        # a gap that shares its exact words with a concept a view does carry is not a gap: the office
        # catalog may give a no-view concept a common alias, and that must not block an answerable question
        ok_spans = set().union(*[spans_of[k] for k, h in found.items() if h.supported] or [set()])
        for k, h in list(found.items()):
            if not h.supported and spans_of[k] <= ok_spans:
                del found[k]
        # a concept named both as itself and through one of its values: keep the value hit
        hits = list(found.values())
        with_value = {h.concept for h in hits if h.value}
        return Resolution([h for h in hits if h.value or h.concept not in with_value])

    # ------------------------------------------------------------- explicit concepts
    def _words(self, c: dict) -> set[str]:
        w = set()
        for s in [c.get("label", ""), c["id"].replace("_", " "), c.get("description", ""), *c.get("aliases", [])]:
            w |= set(tokens(s))
        for v in c.get("values", []):
            for s in (v["value"], v.get("short", ""), v.get("meaning", "")):
                w |= set(tokens(s))
        return w

    def search(self, concepts: list) -> dict:
        """logical-query-mcp style: each concept (text + alternatives) is `found` or `not_found`."""
        results, found, missing = [], [], []
        for item in concepts:
            text = item if isinstance(item, str) else item["text"]
            alts = [] if isinstance(item, str) else list(item.get("alternatives", []))[:MAX_ALTERNATIVES]
            matches: dict[str, tuple[int, str]] = {}
            for term in dict.fromkeys([text, *alts]):
                for words in self.readings(term):
                    want = set(words)
                    if not want:
                        continue
                    phrase = tuple(words)
                    for c in self.cat.concepts:
                        names = {tuple(tokens(n)) for n in [c.get("label", ""), c["id"].replace("_", " "), *c.get("aliases", [])]}
                        vals = {tuple(tokens(s)) for v in c.get("values", []) for s in (v["value"], v.get("short", ""))}
                        rank = 0 if phrase in names else 1 if phrase in vals else 2 if want <= self._words(c) else None
                        if rank is not None and (c["id"] not in matches or rank < matches[c["id"]][0]):
                            matches[c["id"]] = (rank, term)
            ordered = sorted(matches.items(), key=lambda kv: kv[1][0])[:MAX_FIELDS]
            r = {"concept": text, "status": "found" if ordered else "not_found"}
            if ordered:
                r["fields"] = [{"id": cid, "label": self.cat.concept(cid).get("label", cid), "via": term,
                                "views": self.cat.views_for(cid)} for cid, (_, term) in ordered]
                found.append(text)
            else:
                share = set(tokens(text))
                r["suggestions"] = [c["id"] for c in self.cat.concepts if share & self._words(c)][:MAX_SUGGESTIONS]
                r["guidance"] = "Not in the catalog. Do not search for it again; say it is not available."
                missing.append(text)
            results.append(r)
        return {"concepts": results, "coverage": {"found": found, "missing": missing}}


_CACHE: dict[str, Matcher] = {}


def matcher(cat: Catalog) -> Matcher:
    m = _CACHE.get(cat.sha256)
    if m is None:
        m = _CACHE[cat.sha256] = Matcher(cat)
    return m
