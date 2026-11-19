"""Check a real Tableau site against the POC's view contract, before demoing.

    cd poc && TABLEAU_MODE=real python scripts/check_tableau.py      (reads the TABLEAU_* settings)

It signs in with the Connected App, finds the workbook's views, pulls each view's data once
and compares the CSV columns with what the pipeline expects. Only names and counts are printed.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hkeli_poc import tableau_real as TR  # noqa: E402
from hkeli_poc.stork.tableau_client import TableauClient  # noqa: E402
from hkeli_poc.workbook import find_view, query_view  # noqa: E402


def main() -> int:
    s = TR.settings()
    if not s:
        print("Set TABLEAU_MODE=real and the TABLEAU_* values first (see docs/tableau-cloud-setup.md).")
        return 2
    http = TR.RealTableauHTTP(s)
    client = TableauClient(http, s.catalog, user=s.user)
    try:
        views = client.views()
    except Exception as e:  # noqa: BLE001
        print(f"FAIL sign-in or view list: {e}")
        return 1
    print(f"OK   signed in to {s.server} site '{s.site or 'Default'}' as {s.user}")
    print(f"OK   {len(views)} views matched in workbook {s.workbook}")
    for name in http.unmatched:
        print(f"MISS {name}: no sheet with this name is published")
    bad = 0
    for v in views:
        expected_cols, _, _ = query_view(s.catalog, find_view(s.catalog, v["view_name"]), {})
        try:
            d = client.view_data(v["luid"], "")
        except Exception as e:  # noqa: BLE001
            print(f"FAIL {v['view_name']}: {e}")
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
