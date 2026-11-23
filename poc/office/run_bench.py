"""Run the intent variant bench (tests/bench) against the current settings and print counts only.

    .venv/bin/python office/run_bench.py                    # .env settings (LLM_MODE=gateway in the office)
    .venv/bin/python office/run_bench.py --xlsx bench.xlsx  # also write an Excel summary (counts, bench wording)
    .venv/bin/python office/run_bench.py --compare-off      # run once with the model off, once as configured

Safe to send back: pass counts per variant, asked-back and wrong counts, model calls, latency, and the
failing bench questions (all invented wording). No answer text and no data figures are printed.
With real Tableau the golden figures (mock data) are skipped; intents, views and statuses are still scored.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests" / "bench"))

from hkeli_poc import config  # noqa: E402

config.load_env_file(ROOT / ".env")

import bench  # noqa: E402

from hkeli_poc import app as appmod  # noqa: E402
from hkeli_poc.llm import OffClient  # noqa: E402
from hkeli_poc.stork.pipeline import answer  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", help="write an Excel summary to this path")
    ap.add_argument("--compare-off", action="store_true", help="also run with the model off")
    ap.add_argument("--quiet", action="store_true", help="counts only, no failing questions")
    a = ap.parse_args()
    appmod.ensure_started()
    mock = config.get().tableau_mode == "mock"
    if not mock:
        print("note  real Tableau: golden figures skipped; expected statuses assume the mock workbook")
    runs = {}
    clients = ([("model off", OffClient())] if a.compare_off else []) + [(f"model {appmod.S.llm.model}", appmod.S.llm)]
    for label, llm in clients:
        def ask(q, llm=llm):
            return answer(q, appmod.tableau_http(), "proposed", llm=llm, lib=appmod.S.lib, kb=appmod.S.kb)
        for which in ("bench", "holdout"):
            res = bench.run(ask, figures=mock, which=which)
            runs[f"{which} {label}"] = res
            print(bench.report(res, f"{which} {label}"))
            if not a.quiet:
                for r in res["rows"]:
                    if not r["pass"]:
                        print(f"    {r['outcome']:<5} {r['variant']:<14} {r['q']}  [{r['problems']}]")
    if a.xlsx:
        bench.write_xlsx(Path(a.xlsx), runs)
        print(f"wrote {a.xlsx}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
