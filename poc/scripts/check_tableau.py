"""Check a real Tableau site against the POC's view contract, before demoing.

    .venv/bin/python scripts/check_tableau.py      (reads TABLEAU_* from .env or the environment)

It signs in with the Connected App, finds the workbook's views, pulls each view's data once
and compares the CSV columns with what the pipeline expects. Only view and column names, counts and
pass/fail are printed (no server, user, values or rows), so the output can be sent back from the office.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hkeli_poc import config  # noqa: E402
from hkeli_poc import tableau_real as TR  # noqa: E402
from hkeli_poc.stork.tableau_client import TableauClient  # noqa: E402
from hkeli_poc.workbook import find_view, query_view  # noqa: E402


def main() -> int:
    config.load_env_file()
    s = TR.settings()
    if not s:
        print("Set TABLEAU_MODE=real and the TABLEAU_* values in .env first (see .env.example).")
        return 2
    http = TR.RealTableauHTTP(s)
    client = TableauClient(http, s.catalog, user=s.user)
    try:
        views = client.views()
    except Exception as e:  # noqa: BLE001
        print(f"FAIL sign-in or view list: {type(e).__name__}")
        return 1
    print("OK   signed in with the Connected App")
    print(f"OK   {len(views)} views matched the {s.catalog} contract")
    for name in http.unmatched:
        print(f"MISS {name}: no sheet with this name is published")
    bad = 0
    for v in views:
        expected_cols, _, _ = query_view(s.catalog, find_view(s.catalog, v["view_name"]), {})
        try:
            d = client.view_data(v["luid"], "")
        except Exception as e:  # noqa: BLE001
            print(f"FAIL {v['view_name']}: {getattr(e, 'code', type(e).__name__)}")
            bad += 1
            continue
        missing = [c for c in expected_cols if c not in d["columns"]]
        extra = [c for c in d["columns"] if c not in expected_cols]
        status = "OK  " if not missing else "DIFF"
        bad += bool(missing)
        print(f"{status} {v['view_name']}: {len(d['rows'])} rows" + (f"; missing {missing}" if missing else "")
              + (f"; extra {extra}" if extra else ""))
    print("Done." if not bad else f"{bad} view(s) need attention.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
