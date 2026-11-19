"""Run the evaluation set against the current settings and print counts only (no answer text, no data).

    .venv/bin/python office/run_eval.py                 # .env settings (e.g. LLM_MODE=gateway in the office)

Safe to send back: the pass/fail count per check, the understanding/insight paths used, and failing case numbers.
"""
from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hkeli_poc import config  # noqa: E402

config.load_env_file(ROOT / ".env")

from hkeli_poc import app as appmod  # noqa: E402
from hkeli_poc.stork.pipeline import answer  # noqa: E402


def main() -> int:
    if config.get().tableau_mode != "mock":
        print("note  real Tableau: expected statuses assume the mock workbook; compare intents and views only")
    appmod.ensure_started()
    cases = json.loads((ROOT / "tests" / "eval_questions.json").read_text())["cases"]
    paths = collections.Counter()
    fails = []
    for n, c in enumerate(cases, 1):
        a = answer(c["q"], appmod.tableau_http(), "proposed", llm=appmod.S.llm, lib=appmod.S.lib, kb=appmod.S.kb)
        paths[(a["meta"]["understanding"], a["meta"]["insight"])] += 1
        status = "OK" if a["status"] == "OK_WITH_WARNING" else a["status"]
        view = a["evidence"][0]["record_id"] if a["evidence"] else None
        ok = status == c["status"] and (c["intent"] == "*" or a.get("intent") == c["intent"]) and view == c["view"]
        if not ok:
            fails.append(n)
    print(f"eval  {len(cases) - len(fails)} of {len(cases)} pass" + (f"; failing case numbers: {fails}" if fails else ""))
    for (u, i), k in sorted(paths.items()):
        print(f"path  read by {u}, worded by {i}: {k}")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
