"""Knowledge base: glossary (terms -> concepts -> values), intent list and domain notes.

Data, not code: the office edits the JSON (for example to load the workbook's real branch list)
without touching Python. `validate()` runs at start-up and in the tests, so a broken edit fails
loudly instead of silently changing answers.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Knowledge:
    glossary: dict
    intents: dict
    domain_md: str
    sha256: str

    # --- views the understanding step uses
    def concept(self, cid: str) -> dict:
        for c in self.glossary["concepts"]:
            if c["id"] == cid:
                return c
        raise KeyError(cid)

    def value_patterns(self, cid: str) -> list[tuple[str, str]]:
        return [(p, v["value"]) for v in self.concept(cid).get("values", []) for p in v.get("patterns", [])]

    def short(self, cid: str) -> dict[str, str]:
        return {v["value"]: v.get("short", v["value"]) for v in self.concept(cid).get("values", [])}

    def values(self, cid: str) -> list[str]:
        return [v["value"] for v in self.concept(cid).get("values", [])]

    @property
    def ticker_aliases(self) -> dict[str, str]:
        return dict(self.concept("wps").get("aliases", {}))

    @property
    def branches(self) -> dict[str, str]:
        return {v["value"]: v["district"] for v in self.concept("cust_branch")["values"]}

    @property
    def intent_ids(self) -> list[str]:
        return [i["id"] for i in self.intents["intents"]]

    def intent(self, iid: str) -> dict:
        return next((i for i in self.intents["intents"] if i["id"] == iid), {"id": iid, "label": iid.replace("_", " ")})

    def refuse_hits(self, text: str) -> list[dict]:
        """Requests the chatbot never carries out (act, personal data, advice), from intents.json 'refuse'."""
        s = text.lower()
        return [r for r in self.intents.get("refuse", []) if any(re.search(p, s) for p in r["patterns"])]

    def unsupported_hits(self, text: str) -> list[dict]:
        s = text.lower()
        return [c for c in self.glossary["concepts"]
                if c.get("supported") is False and any(re.search(p, s) for p in c.get("patterns", []))]


def _sha(*parts: bytes) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p)
    return h.hexdigest()


@lru_cache(maxsize=4)
def load(directory: str | None = None) -> Knowledge:
    d = Path(directory) if directory else HERE
    g, i, m = (d / "glossary.json").read_bytes(), (d / "intents.json").read_bytes(), (d / "domain.md").read_bytes()
    k = Knowledge(json.loads(g), json.loads(i), m.decode("utf-8"), _sha(g, i, m))
    problems = validate(k)
    if problems:
        raise ValueError("Knowledge base is invalid: " + "; ".join(problems))
    return k


def validate(k: Knowledge) -> list[str]:
    out = []
    ids = [c["id"] for c in k.glossary.get("concepts", [])]
    if len(ids) != len(set(ids)):
        out.append("duplicate concept id")
    for c in k.glossary["concepts"]:
        for key in ("id", "kind", "label", "terms"):
            if key not in c:
                out.append(f"concept {c.get('id', '?')} has no {key}")
        pats = [p for v in c.get("values", []) for p in v.get("patterns", [])] + c.get("patterns", [])
        for p in pats:
            try:
                re.compile(p)
            except re.error:
                out.append(f"concept {c['id']} has a bad pattern")
        if c.get("supported") is False and not c.get("user_text"):
            out.append(f"concept {c['id']} is unsupported but has no user_text")
        vals = [v["value"] for v in c.get("values", [])]
        if "" in vals or len(vals) != len(set(vals)):
            out.append(f"concept {c['id']} has an empty or duplicate value")
    for need in ("bp_div_type", "cust_district", "cust_branch", "wps", "predict_result"):
        if need not in ids:
            out.append(f"concept {need} is missing")
    districts = set(v["value"] for c in k.glossary["concepts"] if c["id"] == "cust_district" for v in c["values"])
    for c in k.glossary["concepts"]:
        if c["id"] == "cust_branch":
            for v in c["values"]:
                if v.get("district") not in districts:
                    out.append(f"branch {v['value']} names an unknown district")
    for r in k.intents.get("refuse", []):
        if not r.get("user_text") or not r.get("patterns"):
            out.append(f"refuse rule {r.get('id', '?')} needs patterns and user_text")
        for p in r.get("patterns", []):
            try:
                re.compile(p)
            except re.error:
                out.append(f"refuse rule {r.get('id', '?')} has a bad pattern")
    iids = [x["id"] for x in k.intents.get("intents", [])]
    if "unknown" not in iids or len(iids) != len(set(iids)) or "" in iids:
        out.append("intent list must be unique, non-empty and include 'unknown'")
    return out
