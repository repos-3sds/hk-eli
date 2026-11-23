"""Compare answers with the concept matcher off and on. Prints counts and case numbers only.

    .venv/bin/python office/compare_matcher.py            # uses .env (CATALOG_PATH, LLM_MODE, TABLEAU_MODE)

It runs two question sets, each twice (CONCEPT_MATCHER=false, then true):
- tests/eval_questions.json      the 20-case evaluation set (must not get worse)
- tests/concept_questions.json   discovery Concept Resolution examples plus value and gap cases

Safe to send back: pass counts per mode, the status totals, and the numbers of the cases whose
status, intent or view changed between modes. No question text, answer text or data is printed.
"""
from __future__ import annotations

import collections
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hkeli_poc import config  # noqa: E402

config.load_env_file(ROOT / ".env")

from hkeli_poc import app as appmod  # noqa: E402
from hkeli_poc.stork.pipeline import answer  # noqa: E402

SETS = {"eval": ROOT / "tests" / "eval_questions.json", "concepts": ROOT / "tests" / "concept_questions.json"}


def _run(cases: list[dict]) -> list[dict]:
    out = []
    for c in cases:
        a = answer(c["q"], appmod.tableau_http(), "proposed", llm=appmod.S.llm, lib=appmod.S.lib, kb=appmod.S.kb)
        status = "OK" if a["status"] == "OK_WITH_WARNING" else a["status"]
        view = a["evidence"][0]["record_id"] if a["evidence"] else None
        ok = status == c["status"] and (c["intent"] == "*" or a.get("intent") == c["intent"]) and view == c["view"]
        out.append({"status": status, "intent": a.get("intent"), "view": view, "ok": ok})
    return out


def main() -> int:
    mock = config.get().tableau_mode == "mock"
    if not mock:
        print("note  real Tableau: expected statuses assume the mock workbook; read the changed-case lists")
    results: dict = {}
    for mode in ("false", "true"):
        os.environ["CONCEPT_MATCHER"] = mode
        config.reload()
        appmod.S.http = None
        appmod.ensure_started()
        for name, path in SETS.items():
            results[(name, mode)] = _run(json.loads(path.read_text())["cases"])
    worse = 0
    for name in SETS:
        off, on = results[(name, "false")], results[(name, "true")]
        n = len(off)
        changed = [i for i, (a, b) in enumerate(zip(off, on), 1) if (a["status"], a["intent"], a["view"]) != (b["status"], b["intent"], b["view"])]
        fixed = [i for i, (a, b) in enumerate(zip(off, on), 1) if b["ok"] and not a["ok"]]
        broke = [i for i, (a, b) in enumerate(zip(off, on), 1) if a["ok"] and not b["ok"]]
        worse += len(broke)
        print(f"{name:8}  matcher off {sum(r['ok'] for r in off)} of {n} pass | matcher on {sum(r['ok'] for r in on)} of {n} pass")
        print(f"          changed cases: {changed or 'none'} | fixed: {fixed or 'none'} | broken: {broke or 'none'}")
        for label, rs in (("off", off), ("on", on)):
            totals = collections.Counter(r["status"] for r in rs)
            print(f"          statuses ({label}): " + ", ".join(f"{k} {v}" for k, v in sorted(totals.items())))
    cfg = config.get()
    print(f"catalog   {'office merge' if cfg.catalog_path else 'packaged synthetic'}; understanding: "
          f"{'gateway' if cfg.llm and cfg.llm.enabled else 'rules'}")
    return 1 if worse else 0


if __name__ == "__main__":
    raise SystemExit(main())
