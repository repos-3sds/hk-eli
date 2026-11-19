"""Write the synthetic HK ELI positions as a CSV to upload to a Tableau site.

    cd poc && python scripts/export_tableau_data.py out/hk_eli_positions.csv

Column names are lower_snake_case, so Tableau shows them as the captions the POC expects
("cust_district" -> "Cust District", "in_n30" -> "In N30").
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from hkeli_poc.data import dataset  # noqa: E402

COLS = ["pos_id", "asset_id", "deal_status", "bp_div_type", "cust_district", "cust_branch", "reg_mgr", "rm_name",
        "cif_id", "trade_date", "maturity_date", "predict_maturity", "predict_result", "trade_currency", "volume",
        "volume_bu", "asset_tks", "asset_tks_2", "strike_percentage", "ko_percentage", "ki_percentage", "wps",
        "wps_mtm", "business_date", "last_refresh", "days_to_pred_maturity",
        "in_n7", "in_n14", "in_n30", "in_n60", "in_n90"]


def main(out: Path):
    ds = dataset()
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLS)
        for r in ds.rows:
            d = r["days_to_pred_maturity"]
            row = {**r, "last_refresh": ds.last_refresh.isoformat(sep=" ", timespec="minutes"),
                   **{f"in_n{n}": "TRUE" if 0 < d <= n else "FALSE" for n in (7, 14, 30, 60, 90)}}
            w.writerow(["Null" if row.get(c) is None else row.get(c) for c in COLS])
    print(f"wrote {out} ({len(ds.rows)} rows)")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "out/hk_eli_positions.csv"))
