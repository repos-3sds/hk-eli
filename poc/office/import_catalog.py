"""Merge the office's real semantic catalog into the chatbot's catalog. Runs inside the office only.

    .venv/bin/python office/import_catalog.py --office /path/to/TABLEAU_SEMANTIC_CATALOG_JSON.json
    # then in .env:  CATALOG_PATH=var/catalog-office.json

What it does
- Reads the office catalog (schema 1.3: `concepts` with id, kind, aliases, description; any other keys
  are kept out of the merge and only counted).
- For a concept we already have: adds the office aliases and, when the office lists values, uses the
  office value list (real districts, branches, results) in place of the synthetic one.
- For a concept we don't have: adds it. If no published view carries it, the chatbot reports it as
  "known, but not in any view" instead of answering with a different figure.
- Validates the result and writes it to --out (default var/catalog-office.json, never committed).

What it prints: counts only, no concept names, aliases or values, so the output is safe to send back.
The merged file itself stays in the office.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hkeli_poc import catalog as CAT  # noqa: E402
from hkeli_poc.stork.concepts import FILLER, tokens  # noqa: E402

KIND_MAP = {"measure": "measure", "metric": "measure", "dimension": "dimension", "attribute": "dimension",
            "identifier": "identifier", "id": "identifier", "key": "identifier", "event": "event", "date": "event",
            "status": "status", "parameter": "parameter", "flag": "flag", "boolean": "flag"}
VALUE_KEYS = ("values", "allowed_values", "enum_values", "enumValues", "domain_values")


def _values(oc: dict) -> list[dict] | None:
    for k in VALUE_KEYS:
        raw = oc.get(k)
        if isinstance(raw, list) and raw:
            out = []
            for v in raw:
                if isinstance(v, str) and v.strip():
                    out.append({"value": v.strip()})
                elif isinstance(v, dict) and str(v.get("value", "")).strip():
                    e = {"value": str(v["value"]).strip()}
                    meaning = v.get("meaning") or v.get("label") or v.get("description")
                    if meaning:
                        e["meaning"] = str(meaning)
                    if v.get("short"):
                        e["short"] = str(v["short"])
                    out.append(e)
            seen, uniq = set(), []
            for e in out:
                if e["value"] not in seen:
                    seen.add(e["value"])
                    uniq.append(e)
            return uniq or None
    return None


def merge(base: dict, office: dict) -> tuple[dict, dict]:
    merged = json.loads(json.dumps(base))
    by_id = {c["id"]: c for c in merged["concepts"]}
    n = dict(office_concepts=0, matched=0, added=0, aliases_added=0, value_lists_replaced=0,
             unknown_kind_mapped=0, skipped_no_id=0, added_with_no_view=0, single_word_aliases_on_no_view=0)
    concepts = office.get("concepts")
    if not isinstance(concepts, list):
        raise SystemExit("The office file has no 'concepts' list. Nothing merged.")
    for oc in concepts:
        if not isinstance(oc, dict) or not str(oc.get("id", "")).strip():
            n["skipped_no_id"] += 1
            continue
        n["office_concepts"] += 1
        cid = str(oc["id"]).strip()
        aliases = [a.strip() for a in oc.get("aliases", []) if isinstance(a, str) and a.strip()]
        vals = _values(oc)
        if cid in by_id:
            c = by_id[cid]
            n["matched"] += 1
            have = {a.lower() for a in c["aliases"]}
            for a in aliases:
                if a.lower() not in have:
                    c["aliases"].append(a)
                    have.add(a.lower())
                    n["aliases_added"] += 1
            if not c.get("description") and oc.get("description"):
                c["description"] = str(oc["description"])
            if vals and c.get("values") is not None:
                old = {v["value"]: v for v in c["values"]}
                c["values"] = [dict(old.get(v["value"], {}), **v) for v in vals]
                n["value_lists_replaced"] += 1
        else:
            kind = KIND_MAP.get(str(oc.get("kind", "")).lower())
            if kind is None:
                kind = "dimension"
                n["unknown_kind_mapped"] += 1
            c = {"id": cid, "kind": kind, "label": aliases[0] if aliases else cid.replace("_", " "),
                 "aliases": aliases or [cid.replace("_", " ")], "description": str(oc.get("description", ""))}
            if vals:
                c["values"], c["valueType"] = vals, "enum"
            merged["concepts"].append(c)
            by_id[cid] = c
            n["added"] += 1
    views = {f["name"] for e in merged.get("entities", []) for f in e.get("fields", [])}
    for c in merged["concepts"]:
        if c["id"] not in views and c["kind"] != "parameter":
            if c["id"] not in {x["id"] for x in base["concepts"]}:
                n["added_with_no_view"] += 1
            n["single_word_aliases_on_no_view"] += sum(1 for a in c["aliases"]
                                                       if len([t for t in tokens(a, True) if t not in FILLER]) == 1)
    merged["catalogId"] = f"{base.get('catalogId', 'hkeli')}+office:{office.get('catalog_id', 'unknown')}"
    merged["officeSchemaVersion"] = str(office.get("schema_version", ""))
    n["office_top_level_keys"] = sorted(k for k in office if k not in ("concepts",))
    n["office_other_lists"] = {k: len(v) for k, v in office.items() if isinstance(v, list) and k != "concepts"}
    return merged, n


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--office", required=True, help="path to the office semantic catalog JSON")
    ap.add_argument("--base", default=str(CAT.DEFAULT_PATH), help="catalog to merge into (default: packaged)")
    ap.add_argument("--out", default=str(ROOT / "var" / "catalog-office.json"))
    a = ap.parse_args(argv)
    office = json.loads(Path(a.office).read_text(encoding="utf-8"))
    base = json.loads(Path(a.base).read_text(encoding="utf-8"))
    merged, n = merge(base, office)
    problems = CAT.validate(merged)
    if problems:
        print(f"import  FAILED validation: {len(problems)} problem(s); first: {problems[0].split(' ')[0]} ...")
        return 1
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(merged, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print("import  OK (counts only, safe to send back)")
    for k, v in n.items():
        print(f"  {k}: {v}")
    print(f"  merged_concepts: {len(merged['concepts'])}")
    print("next    set CATALOG_PATH=" + (str(out.relative_to(ROOT)) if out.is_relative_to(ROOT) else str(out))
          + " in .env, then run office/compare_matcher.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
