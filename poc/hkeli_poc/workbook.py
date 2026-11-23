"""Mock HK_ELI Tableau workbook: the 12 published views, in two versions.

Site "current"  = the workbook as the discovery transcripts describe it today,
                  including the gaps W1-W7.
Site "proposed" = the same workbook with the W1-W7 changes applied.

View names, record ids, dimensions, measures and filters come from
"Semantic and Tableu Views/semantic-and-tableau-views.md" (summarised in
rediscovery/02-semantic-catalog-and-views.md, table 4a). Where the transcripts
leave behaviour open, the mock takes the cautious reading and says so in
`assumption` - those are exactly the points W1-W7 ask the owners to confirm.
"""
from __future__ import annotations

import hashlib
from collections import defaultdict
from datetime import date, timedelta

from .data import Dataset, dataset

LIVE_ONLY = "LIVE"
TRE = "Treasures(HK)"

CAPTION = {
    "bp_div_type": "Bp Div Type", "predict_result": "Predict Result",
    "cust_district": "Cust District", "cust_branch": "Cust Branch",
    "predict_maturity": "Predict Maturity", "wps": "Wps", "rm_name": "Rm Name",
    "cif_id": "Cif Id", "pos_id": "Pos Id", "trade_currency": "Trade Currency",
    "volume": "Volume", "asset_tks": "Asset Tks", "asset_tks_2": "Asset Tks 2",
    "strike_percentage": "Strike Percentage", "ko_percentage": "Ko Percentage",
    "ki_percentage": "Ki Percentage", "deal_status": "Deal Status",
    "days_to_pred_maturity": "Days To Pred Maturity", "mtm_bin": "MTM% (bin)",
    "predictive_result": "Predictive Result", "asset_id": "Asset Id", "asset_tks_mtm": "Asset Tks Mtm",
    "asset_tks_2_mtm": "Asset Tks 2 Mtm", "wps_mtm": "Wps Mtm", "has_knocked_in": "Has Knocked In",
    "sim_wps": "Sim Wps", "sim_wps_mtm": "Sim Wps Mtm", "in_shock_basket": "In Shock Basket",
    "market_spot": "Market Spot", "shock_ticker": "Shock Ticker", "shock_pct": "Shock %",
}
# Tableau parameters the simulation sheets expose. Values arrive on the same query string as filters.
PARAMETERS = {"market_spot": 1.0, "shock_ticker": "", "shock_pct": 0.0}
FLAG_WINDOWS = (7, 14, 30, 60, 90)
W1_FIELDS = {"days_to_pred_maturity", *(f"in_n{d}" for d in FLAG_WINDOWS)}

SITES = ("current", "proposed")


def _luid(site: str, record: str, name: str) -> str:
    h = hashlib.sha1(f"{site}/{name}/{record}".encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _views(site: str) -> list[dict]:
    p = site == "proposed"
    # Fields the worksheet does not carry: a vf_ on them is silently ignored,
    # as Tableau does for a field that is not in the view's data.
    no_w1 = set() if p else set(W1_FIELDS)
    views = [
        dict(no=1, record_id="outstanding-total-all", name="#all_outatanding_total",
             title="Outstanding ELI, total", kind="kpi", dims=[],
             measures=["sum"], filters=["deal_status", "bp_div_type"],
             missing=set(W1_FIELDS), live_context=p,
             intents=["outstanding_total"]),
        dict(no=2, record_id="outstanding-segment", name="#all_outatanding_segment",
             title="Outstanding ELI by segment, with share", kind="bar",
             dims=["bp_div_type"], measures=["sum", "pct"],
             filters=["deal_status", "bp_div_type"], missing=set(W1_FIELDS), live_context=p,
             intents=["segment_share"]),
        dict(no=3, record_id="outstanding-segment-result", name="#all_outatanding_segment_result",
             title="Outstanding ELI by segment and predicted result, share of overall", kind="bar",
             dims=["bp_div_type", "predict_result"], measures=["sum", "pct"],
             filters=["deal_status", "bp_div_type"], missing=set(W1_FIELDS), live_context=p,
             intents=["segment_result_share"]),
        dict(no=4, record_id="outstanding-segment-customers" if p else "outstanding-segment",
             name="segment_outstanding",
             title="Outstanding ELI and distinct customers by segment and predicted result", kind="bar",
             dims=["bp_div_type", "predict_result"], measures=["sum", "countd"],
             filters=["deal_status", "bp_div_type", "predict_maturity"] + (sorted(W1_FIELDS) if p else []),
             missing=no_w1, live_context=p, intents=["customer_count"]),
        dict(no=5, record_id="maturity-calendar-n30-tre", name="TRE_maturity_calendar_n30d",
             title="TRE predicted maturity calendar", kind="calendar",
             dims=["predict_maturity", "predict_result"],
             measures=["sum"] + (["countd_excl"] if p else []),
             filters=["deal_status", "predict_maturity", "cust_district", "cust_branch"] + (sorted(W1_FIELDS) if p else []),
             missing=no_w1, tre_lock=True, window=None if p else 30, live_context=p,
             intents=["maturity_calendar"]),
        dict(no=6, record_id="maturity-branch-n30-tre", name="TRE_maturity_branch_n30d",
             title="TRE predicted maturity by district and branch", kind="bar",
             dims=["cust_district", "cust_branch", "predict_result"],
             measures=["sum"] + (["countd_excl"] if p else []),
             filters=["deal_status", "predict_maturity", "cust_district", "cust_branch"] + (sorted(W1_FIELDS) if p else []),
             missing=no_w1, tre_lock=True, window=None if p else 30, live_context=p,
             intents=["maturity_branch"]),
        dict(no=7, record_id="maturity-details-n30-tre", name="TRE_maturity_detail_n30d",
             title="TRE predicted maturity detail (sales follow-up list)", kind="table",
             dims=["predict_maturity", "cust_district", "cust_branch", "rm_name", "cif_id",
                   "predict_result", "trade_currency", "volume", "asset_tks", "asset_tks_2",
                   "strike_percentage", "ko_percentage", "ki_percentage", "pos_id", "wps"],
             measures=["sum", "avg_wps_mtm"],
             filters=["deal_status", "predict_maturity", "cust_district", "cust_branch"]
             + (["wps"] + sorted(W1_FIELDS) if p else []),
             missing=no_w1, tre_lock=True, window=None if p else 30, live_context=p,
             intents=["maturity_detail"]),
        dict(no=8, record_id="outstanding-district-wps-n30-all", name="ALL_outstanding_District_n30d",
             title="Outstanding ELI by segment and district", kind="bar",
             dims=["bp_div_type", "cust_district", "predict_result"],
             measures=["sum"] + (["countd_excl"] if p else []),
             filters=(["deal_status"] if p else []) + ["predict_maturity", "bp_div_type"] + (sorted(W1_FIELDS) if p else []),
             missing=no_w1 | (set() if p else {"deal_status"}),
             include_matured=not p, exclude_segments=["Treasures(TPC)"],
             hidden_rule_documented=p, live_context=p, intents=["district"]),
        dict(no=9, record_id="outstanding-wps-n30-all", name="ALL_outstanding_simulation_n30d",
             title="WPS exposure, any segment, any window (Market Spot simulation)", kind="bar",
             dims=["wps", "predict_result", "predictive_result"], measures=["sum"],
             filters=(["deal_status"] if p else []) + ["bp_div_type", "predict_maturity"] + (sorted(W1_FIELDS) if p else []),
             missing=no_w1 | (set() if p else {"deal_status"}),
             include_matured=not p, parameters=["market_spot"], live_context=p,
             intents=["wps_exposure"]),
        dict(no=10, record_id="outstanding-wps-n30-tre", name="TRE_outstanding_simulation_n30d",
             title="TRE WPS exposure (Market Spot simulation)", kind="bar",
             dims=["wps", "predict_result", "predictive_result"], measures=["sum"],
             filters=["predict_maturity", "cust_district", "cust_branch"] + (sorted(W1_FIELDS) if p else []),
             missing=no_w1, tre_lock=True, window=None if p else 30, parameters=["market_spot"],
             live_context=True, intents=["wps_exposure"]),
        dict(no=11, record_id="outstanding-distribution-wps-n30-all", name="ALL_outstanding_distribution_n30d",
             title="MTM distribution by WPS", kind="bubble",
             dims=["mtm_bin", "wps", "predict_result"], measures=["count_asset", "sum"],
             filters=(["deal_status"] if p else []) + ["predict_maturity", "bp_div_type", "cust_district", "cust_branch"]
             + (sorted(W1_FIELDS) if p else []),
             missing=no_w1 | (set() if p else {"deal_status"}),
             include_matured=not p, live_context=p, intents=["mtm_distribution"]),
        dict(no=12, record_id="max-trade-date", name="#max_trade_date",
             title="Latest trade date", kind="kpi", dims=[], measures=["max_trade_date"],
             filters=["bp_div_type"], missing=set(W1_FIELDS), include_matured=True,
             intents=["data_recency"]),
    ]
    if p:
        views.append(dict(no=13, record_id="data-as-of", name="#data_as_of",
                          title="Data as of (business date and last refresh)", kind="kpi", dims=[],
                          measures=["business_date", "last_refresh"], filters=[], missing=set(),
                          include_matured=True, intents=["data_as_of"], new=True))
    if p:
        # W8 (new ask): one position-level sheet across all segments with every basket stock's level,
        # the barriers and the knock-in flag, plus two parameters for a single-stock shock. It lets the
        # what-if engine and the embedded view move one stock, not only the whole market.
        views.append(dict(no=14, record_id="position-scenario-all", name="ALL_position_scenario",
                          title="Position scenario: every basket stock against strike, KI and KO", kind="table",
                          dims=["pos_id", "asset_id", "cif_id", "bp_div_type", "cust_district", "cust_branch", "rm_name",
                                "asset_tks", "asset_tks_2", "asset_tks_mtm", "asset_tks_2_mtm", "wps", "wps_mtm",
                                "strike_percentage", "ko_percentage", "ki_percentage", "has_knocked_in",
                                "predict_result", "predict_maturity", "sim_wps", "sim_wps_mtm", "predictive_result"],
                          measures=["sum"],
                          filters=["deal_status", "bp_div_type", "cust_district", "cust_branch", "in_shock_basket", "wps",
                                   "predict_result"],
                          missing=set(W1_FIELDS), live_context=True, parameters=["market_spot", "shock_ticker", "shock_pct"],
                          intents=["scenario_analysis"], new=True))
    for v in views:
        v.setdefault("tre_lock", False)
        v.setdefault("window", None)
        v.setdefault("include_matured", False)
        v.setdefault("exclude_segments", [])
        v.setdefault("hidden_rule_documented", False)
        v.setdefault("parameters", [])
        v.setdefault("live_context", False)
        v.setdefault("new", False)
        v["luid"] = _luid(site, v["record_id"], v["name"])
        v["content_url"] = f"HK_ELI/sheets/{v['name'].lstrip('#')}"
        v["site"] = site
    return views


VIEWS = {s: _views(s) for s in SITES}


def find_view(site: str, key: str) -> dict | None:
    for v in VIEWS[site]:
        if key in (v["luid"], v["name"], v["name"].lstrip("#")):
            return v
    return None


# ---------------------------------------------------------------- query engine

def _value(row: dict, field: str, bd: date) -> str:
    if field.startswith("in_n"):
        d = int(field[4:])
        return "TRUE" if 0 < row["days_to_pred_maturity"] <= d else "FALSE"
    v = row.get(field)
    if v is None:
        return "Null"
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _population(view: dict, ds: Dataset) -> list[dict]:
    """Rows after the worksheet's own (published) filters."""
    bd = ds.business_date
    rows = list(ds.rows)
    if view["tre_lock"]:
        rows = [r for r in rows if r["bp_div_type"] == TRE]
        rows = [r for r in rows if r["deal_status"] == LIVE_ONLY]
    if view["window"]:
        rows = [r for r in rows if 0 < (r["predict_maturity"] - bd).days <= view["window"]]
    if view["exclude_segments"]:
        rows = [r for r in rows if r["bp_div_type"] not in view["exclude_segments"]]
    if view["live_context"] and not view["include_matured"]:
        # Proposed workbook: deal_status = LIVE is a context filter, so FIXED /
        # EXCLUDE calculations also see LIVE rows only (W4 / W5).
        rows = [r for r in rows if r["deal_status"] == LIVE_ONLY]
    return rows


def _mtm_bin(x: float) -> int:
    return int(x // 5 * 5)  # 5-point bins, as the mock worksheet defines them


def _fmt_num(x: float) -> str:
    return f"{x:.2f}".rstrip("0").rstrip(".")


def _param(params: dict, name: str):
    raw = (params.get(name) or [None])[0]
    if raw in (None, ""):
        return PARAMETERS[name]
    if name == "shock_ticker":
        return raw
    x = float(str(raw).rstrip("%"))
    if name == "market_spot" and x > 3:      # "80" or "80%" means 0.80, as the Tableau parameter box shows it
        x = x / 100
    if name == "shock_pct" and abs(x) >= 1:  # "-10" means -10%
        x = x / 100
    return x


def _simulate(rows: list[dict], view: dict, params: dict, info: dict) -> list[dict]:
    """The simulation sheets' calculated fields: Predictive Result after Market Spot (and, W8, a single-stock shock).

    Same rules as the what-if engine (stork/scenario.py), so the embedded view and the answer agree.
    """
    from .stork.scenario import simulate
    spot = _param(params, "market_spot")
    ticker = _param(params, "shock_ticker") if "shock_ticker" in view["parameters"] else ""
    shock = _param(params, "shock_pct") if "shock_pct" in view["parameters"] else 0.0
    info["parameters"] = {"market_spot": spot, **({"shock_ticker": ticker, "shock_pct": shock} if ticker else {})}
    out = []
    for r in rows:
        p = {"tks1": r["asset_tks"], "tks2": r["asset_tks_2"], "m1": r["asset_tks_mtm"],
             "m2": r["asset_tks_2_mtm"], "strike": r["strike_percentage"], "ko": r["ko_percentage"],
             "ki": r["ki_percentage"], "knocked_in": r["has_knocked_in"]}
        if ticker and shock:   # W8: move one stock first, then apply Market Spot to every stock
            p["m1"] = p["m1"] * (1 + shock) if p["tks1"] == ticker else p["m1"]
            if p["m2"] is not None and p["tks2"] == ticker:
                p["m2"] = p["m2"] * (1 + shock)
        s = simulate(p, "market", None, spot - 1)
        out.append(dict(r, predictive_result=s["status"], sim_wps=s["wps"], sim_wps_mtm=s["sim"],
                        in_shock_basket="TRUE" if ticker and ticker in (r["asset_tks"], r["asset_tks_2"]) else "FALSE"))
    return out


def query_view(site: str, view: dict, vf: dict[str, list[str]], stale: bool = False):
    """Return (columns, rows, info). rows are lists of strings, like the CSV."""
    ds = dataset(stale)
    bd = ds.business_date
    info = {"ignored_filters": [], "business_date": bd.isoformat()}

    if view["no"] == 13:
        cols = ["Business Date", "Last Refresh"]
        return cols, [[bd.isoformat(), ds.last_refresh.isoformat(timespec="minutes")]], info

    vf = dict(vf)
    params = {k: vf.pop(k) for k in list(vf) if k in PARAMETERS}
    pop = _population(view, ds)
    if view["parameters"]:
        pop = _simulate(pop, view, params, info)
    fixed_total = sum(r["volume_bu"] for r in pop)  # FIXED LOD: before dimension filters
    rows = pop
    for field, values in vf.items():
        if field in view["missing"] or (field == "in_shock_basket" and field not in view["filters"]):
            info["ignored_filters"].append(field)
            continue
        wanted = set(values)
        rows = [r for r in rows if _value(r, field, bd) in wanted]

    if view["no"] == 12:
        mx = max((r["trade_date"] for r in rows), default=None)
        return ["Max Trade Date"], [[mx.isoformat() if mx else ""]], info

    dims = view["dims"]
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        key = tuple(_mtm_bin(r["wps_mtm"]) if d == "mtm_bin" else _value(r, d, bd) for d in dims)
        groups[key].append(r)

    # EXCLUDE [Predict Result] COUNTD(cif_id): customers across results, per row's other dims
    excl: dict[tuple, set] = defaultdict(set)
    if "predict_result" in dims:
        idx = dims.index("predict_result")
        for key, rs in groups.items():
            excl[key[:idx] + key[idx + 1:]].update(r["cif_id"] for r in rs)

    filtered_total = sum(r["volume_bu"] for r in rows)
    cols = [CAPTION.get(d, d) for d in dims]
    for m in view["measures"]:
        cols += {
            "sum": ["Volume Bu"],
            "pct": ["Share Of All Segments"] if site == "proposed" else [],
            "countd": ["Distinct count of Cif Id"],
            "countd_excl": ["Customers (all results)"],
            "count_asset": ["Count of Asset Id"],
            "avg_wps_mtm": ["Avg. Wps Mtm"],
        }[m]
    out = []
    for key in sorted(groups):
        rs = groups[key]
        line = [str(k) + ("%" if dims[i] == "mtm_bin" else "") for i, k in enumerate(key)]
        s = sum(r["volume_bu"] for r in rs)
        for m in view["measures"]:
            if m == "sum":
                line.append(_fmt_num(s))
            elif m == "pct":
                # Current: PERCENT_OF_TOTAL is a table calculation and the mock
                # assumes the CSV export does not carry it (W5 asks to verify).
                # Proposed: FIXED-LOD share, computed before dimension filters.
                if site == "proposed":
                    line.append(f"{s / fixed_total:.4f}" if fixed_total else "")
            elif m == "countd":
                line.append(str(len({r["cif_id"] for r in rs})))
            elif m == "countd_excl":
                idx = dims.index("predict_result")
                line.append(str(len(excl[key[:idx] + key[idx + 1:]])))
            elif m == "count_asset":
                line.append(str(len({r["asset_id"] for r in rs})))
            elif m == "avg_wps_mtm":
                line.append(_fmt_num(sum(r["wps_mtm"] for r in rs) / len(rs)))
        out.append(line)
    if not dims:
        line = []
        for m in view["measures"]:
            if m == "sum":
                line.append(_fmt_num(filtered_total))
        out = [line]
    info["population_rows"] = len(pop)
    return cols, out, info


def public_catalog(site: str) -> list[dict]:
    """What the workbook 'publishes' about itself (the catalog's views section)."""
    out = []
    for v in VIEWS[site]:
        out.append({
            "record_id": v["record_id"], "view_name": v["name"], "luid": v["luid"],
            "title": v["title"], "kind": v["kind"], "intents": v["intents"],
            "dimensions": v["dims"], "measures": v["measures"], "filters": v["filters"],
            "parameters": v["parameters"], "tre_lock": v["tre_lock"],
            "builtin_window_days": v["window"],
            "population": ("LIVE (context filter)" if v["live_context"] and not v["include_matured"]
                           else "LIVE via deal_status filter" if "deal_status" in v["filters"]
                           else "LIVE (TRE lock)" if v["tre_lock"]
                           else "undeclared"),
            "hidden_rule": ("excludes Treasures(TPC)" if v["hidden_rule_documented"]
                            else "published segment-exclusion filter (logic not shown)" if v["exclude_segments"]
                            else None),
            "new": v["new"],
        })
    return out
