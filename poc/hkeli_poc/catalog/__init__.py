"""Semantic catalog: business concepts, the views that carry them, glossary and standard calculations.

The file follows the logical-query-mcp catalog shape (datasources, entities, relationships, glossary,
metrics) plus a `concepts` list in the office catalog's style. Code reads it; the model never adds to it.
`validate()` runs at load time and in the tests, so a broken edit (for example in the office merge)
fails loudly instead of quietly changing answers.

The office points CATALOG_PATH at its merged copy (office/import_catalog.py). Without it the packaged
synthetic catalog is used.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_PATH = HERE / "hkeli_catalog.json"
KINDS = {"measure", "dimension", "identifier", "event", "status", "parameter", "flag"}


@dataclass(frozen=True)
class Catalog:
    data: dict
    sha256: str
    path: str

    @property
    def concepts(self) -> list[dict]:
        return self.data["concepts"]

    @property
    def glossary(self) -> list[dict]:
        return self.data.get("glossary", [])

    @property
    def metrics(self) -> list[dict]:
        return self.data.get("metrics", [])

    @property
    def entities(self) -> list[dict]:
        return self.data.get("entities", [])

    def concept(self, cid: str) -> dict:
        for c in self.concepts:
            if c["id"] == cid:
                return c
        raise KeyError(cid)

    def has(self, cid: str) -> bool:
        return any(c["id"] == cid for c in self.concepts)

    def views_for(self, cid: str) -> list[str]:
        """Record ids of the views whose fields include this concept."""
        return [e["recordId"] for e in self.entities if any(f["name"] == cid for f in e.get("fields", []))]

    def values(self, cid: str) -> list[dict]:
        return self.concept(cid).get("values", [])


def validate(data: dict) -> list[str]:
    out = []
    cons = data.get("concepts")
    if not isinstance(cons, list) or not cons:
        return ["catalog has no concepts"]
    ids = [c.get("id") for c in cons]
    if len(ids) != len(set(ids)) or None in ids or "" in ids:
        out.append("concept ids must be unique and non-empty")
    for c in cons:
        cid = c.get("id", "?")
        if c.get("kind") not in KINDS:
            out.append(f"concept {cid} has an unknown kind")
        al = c.get("aliases")
        if not isinstance(al, list) or not all(isinstance(a, str) and a.strip() for a in al):
            out.append(f"concept {cid} needs a list of non-empty aliases")
        vals = [v.get("value") for v in c.get("values", [])]
        if "" in vals or None in vals or len(vals) != len(set(vals)):
            out.append(f"concept {cid} has an empty or duplicate value")
    known = set(ids)
    for e in data.get("entities", []):
        if not e.get("recordId"):
            out.append(f"entity {e.get('name', '?')} has no recordId")
        for f in e.get("fields", []):
            if f.get("name") not in known:
                out.append(f"view {e.get('recordId', '?')} field {f.get('name')} is not a concept")
    for g in data.get("glossary", []):
        if not g.get("term") or not g.get("meaning"):
            out.append(f"glossary entry {g.get('id', '?')} needs a term and a meaning")
    return out


def _load_bytes(raw: bytes, path: str) -> Catalog:
    data = json.loads(raw)
    problems = validate(data)
    if problems:
        raise ValueError("Catalog is invalid: " + "; ".join(problems[:10]))
    return Catalog(data, hashlib.sha256(raw).hexdigest(), path)


@lru_cache(maxsize=4)
def load(path: str | None = None) -> Catalog:
    p = Path(path) if path else DEFAULT_PATH
    return _load_bytes(p.read_bytes(), str(p))


def from_dict(data: dict) -> Catalog:
    raw = json.dumps(data, sort_keys=True).encode()
    return _load_bytes(raw, "<memory>")
