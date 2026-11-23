"""Build HK_ELI.twbx: the proposed (W1-W7) HK_ELI workbook with the synthetic data packaged in.

    cd poc && python scripts/build_twbx.py out/HK_ELI.twbx

Upload it on Tableau Cloud with New -> Upload Workbook (name HK_ELI). It replaces building the 14
sheets by hand (docs/tableau-cloud-setup.md steps 3 and 4). Every sheet carries the fields, captions,
context filters and shown filters the POC's view contract expects.
"""
from __future__ import annotations

import csv
import io
import sys
import uuid
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr  # noqa: F401

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_tableau_data import COLS  # noqa: E402
from hkeli_poc.data import dataset  # noqa: E402

DS = "federated.hkeli"
CSV_NAME = "hk_eli_positions.csv"

# column -> (caption, datatype, role, type)
STR_DIM = ("string", "dimension", "nominal")
FIELDS = {
    "pos_id": ("Pos Id", *STR_DIM), "asset_id": ("Asset Id", *STR_DIM), "deal_status": ("Deal Status", *STR_DIM),
    "bp_div_type": ("Bp Div Type", *STR_DIM), "cust_district": ("Cust District", *STR_DIM),
    "cust_branch": ("Cust Branch", *STR_DIM), "reg_mgr": ("Reg Mgr", *STR_DIM), "rm_name": ("Rm Name", *STR_DIM),
    "cif_id": ("Cif Id", *STR_DIM), "trade_date": ("Trade Date", *STR_DIM),
    "maturity_date": ("Maturity Date", *STR_DIM), "predict_maturity": ("Predict Maturity", *STR_DIM),
    "predict_result": ("Predict Result", *STR_DIM), "trade_currency": ("Trade Currency", *STR_DIM),
    "volume": ("Volume", "real", "dimension", "ordinal"),
    "volume_bu": ("Volume Bu", "real", "measure", "quantitative"),
    "asset_tks": ("Asset Tks", *STR_DIM), "asset_tks_2": ("Asset Tks 2", *STR_DIM),
    "strike_percentage": ("Strike Percentage", "integer", "dimension", "ordinal"),
    "ko_percentage": ("Ko Percentage", "integer", "dimension", "ordinal"),
    "ki_percentage": ("Ki Percentage", "integer", "dimension", "ordinal"),
    "wps": ("Wps", *STR_DIM), "wps_mtm": ("Wps Mtm", "real", "measure", "quantitative"),
    "business_date": ("Business Date", *STR_DIM), "last_refresh": ("Last Refresh", *STR_DIM),
    "days_to_pred_maturity": ("Days To Pred Maturity", "integer", "dimension", "ordinal"),
    **{f"in_n{d}": (f"In N{d}", *STR_DIM) for d in (7, 14, 30, 60, 90)},
    "asset_tks_mtm": ("Asset Tks Mtm", "real", "dimension", "ordinal"),
    "asset_tks_2_mtm": ("Asset Tks 2 Mtm", "real", "dimension", "ordinal"),
    "has_knocked_in": ("Has Knocked In", *STR_DIM),
}
# Tableau parameters (datasource "Parameters"): name -> (caption, datatype, default, domain xml)
PARAMS = {
    "Parameter 1": ("Market Spot", "real", "1.0", "<range granularity='0.01' max='1.2' min='0.5' />"),
    "Parameter 2": ("Shock Ticker", "string", "&quot;&quot;", ""),
    "Parameter 3": ("Shock %", "real", "0.0", "<range granularity='0.01' max='0.5' min='-0.6' />"),
}
SPOT, TICKER, SHOCK = "[Parameters].[Parameter 1]", "[Parameters].[Parameter 2]", "[Parameters].[Parameter 3]"
# Simulated level of each basket stock: the named stock moves by Shock %, then every stock by Market Spot.
LEG1 = f"[asset_tks_mtm] * IIF([asset_tks] = {TICKER}, 1 + {SHOCK}, 1) * {SPOT}"
LEG2 = f"[asset_tks_2_mtm] * IIF([asset_tks_2] = {TICKER}, 1 + {SHOCK}, 1) * {SPOT}"
SIM = f"IF ISNULL([asset_tks_2_mtm]) THEN {LEG1} ELSE MIN({LEG1}, {LEG2}) END"


def _predictive(level: str) -> str:
    """What is HK ELI 5.2 on a simulated worst-of level; the same rules as poc/hkeli_poc/stork/scenario.py."""
    return (f"IF {level} >= [ko_percentage] THEN 'KO' ELSEIF {level} >= [strike_percentage] THEN 'EXP' "
            f"ELSEIF [has_knocked_in] <> 'True' AND {level} >= [ki_percentage] THEN 'EXP(Below Strike)' ELSE 'EX' END")
CSV_TYPES = {k: v[1] for k, v in FIELDS.items()}

# calculated fields: name -> (caption, datatype, role, type, formula)
CALCS = {
    "calc_share": ("Share Of All Segments", "real", "measure", "quantitative",
                   "SUM([volume_bu]) / MIN({FIXED : SUM([volume_bu])})"),
    "calc_customers": ("Customers (all results)", "integer", "measure", "quantitative",
                       "MIN({EXCLUDE [predict_result] : COUNTD([cif_id])})"),
    "calc_max_trade_date": ("Max Trade Date", "string", "measure", "nominal", "MAX([trade_date])"),
    "calc_in_scope": ("Segment In Scope", "string", "dimension", "nominal",
                      "IF [bp_div_type] = 'Treasures(TPC)' THEN 'Excluded' ELSE 'In scope' END"),
    # Display-only labels (strings), so mark labels read "HKD 12.3M" without changing the exported numbers.
    "calc_amount_label": ("Amount (HKD)", "string", "measure", "nominal",
                          "'HKD ' + STR(ROUND(SUM([volume_bu]) / 1000000, 1)) + 'M'"),
    "calc_share_label": ("Share", "string", "measure", "nominal",
                         "STR(ROUND(100 * SUM([volume_bu]) / MIN({FIXED : SUM([volume_bu])}), 1)) + '%'"),
    "calc_mtm_bin": ("MTM% (bin)", "integer", "dimension", "ordinal", "FLOOR([wps_mtm] / 5) * 5"),
    # Simulation. With no stock shock SIM = wps_mtm x Market Spot, which is the office's formula for views 9
    # and 10 today; with Shock Ticker and Shock % set (W8), the named stock moves first.
    "calc_predictive": ("Predictive Result", "string", "dimension", "nominal", _predictive(f"({SIM})")),
    "calc_sim_mtm": ("Sim Wps Mtm", "real", "dimension", "ordinal", f"ROUND({SIM}, 1)"),
    "calc_sim_wps": ("Sim Wps", "string", "dimension", "nominal",
                     f"IF ISNULL([asset_tks_2_mtm]) OR {LEG1} <= {LEG2} THEN [asset_tks] ELSE [asset_tks_2] END"),
    # Basket membership for the shocked stock, so vf_ and applyFilterAsync can keep exposed positions (exact match TRUE)
    "calc_in_shock_basket": ("In Shock Basket", "string", "dimension", "nominal",
                             f"IIF([asset_tks] = {TICKER} OR [asset_tks_2] = {TICKER}, 'TRUE', 'FALSE')"),
}
RESULT_COLOURS = {"KO": "#3d8bfd", "EXP": "#6f7d91", "EXP(Below Strike)": "#ef6b4a", "EX": "#2bb3a3"}
PALETTE = ("<style><style-rule element='mark'><encoding attr='color' field='[none:predict_result:nk]' type='palette'>"
           + "".join(f"<map to='{c}'><bucket>&quot;{k}&quot;</bucket></map>" for k, c in RESULT_COLOURS.items())
           + "</encoding></style-rule></style>")
W1 = ["days_to_pred_maturity", "in_n7", "in_n14", "in_n30", "in_n60", "in_n90"]


def param_xml(n: str) -> str:
    cap, dt, val, dom = PARAMS[n]
    return (f"<column caption={quoteattr(cap)} datatype='{dt}' name='[{n}]' param-domain-type='{'range' if dom else 'any'}' "
            f"role='measure' type='{'quantitative' if dt == 'real' else 'nominal'}' value='{val}'>"
            f"<calculation class='tableau' formula='{val}' />{dom}</column>")


def col_xml(name: str) -> str:
    if name in CALCS:
        cap, dt, role, typ, f = CALCS[name]
        return (f"<column caption={quoteattr(cap)} datatype='{dt}' name='[{name}]' role='{role}' type='{typ}'>"
                f"<calculation class='tableau' formula={quoteattr(f)} /></column>")
    cap, dt, role, typ = FIELDS[name]
    return f"<column caption={quoteattr(cap)} datatype='{dt}' name='[{name}]' role='{role}' type='{typ}' />"


# A field use in a sheet: (derivation, field). derivation in none|sum|avg|ctd|usr
DER = {"none": "None", "sum": "Sum", "avg": "Avg", "ctd": "CountD", "usr": "User"}


def inst(der: str, field: str) -> str:
    if der in ("none", "usr"):
        typ = FIELDS[field][3] if field in FIELDS else CALCS[field][3]
        suffix = {"nominal": "nk", "ordinal": "ok", "quantitative": "qk"}[typ]
    else:
        suffix = "qk"
    return f"[{der}:{field}:{suffix}]"


def ref(der: str, field: str) -> str:
    return f"[{DS}].{inst(der, field)}"


def inst_xml(der: str, field: str) -> str:
    i = inst(der, field)
    typ = {"nk": "nominal", "ok": "ordinal", "qk": "quantitative"}[i[-3:-1]]
    return f"<column-instance column='[{field}]' derivation='{DER[der]}' name='{i}' pivot='key' type='{typ}' />"


def member_filter(field: str, values: list[str], context: bool, exclude: bool = False) -> str:
    lvl = inst("none", field)
    ctx = " context='true'" if context else ""
    members = "".join(f"<groupfilter function='member' level='{lvl}' member={quoteattr(chr(34) + v + chr(34))} />"
                      for v in values)
    if exclude:
        body = (f"<groupfilter function='except' user:ui-domain='database' user:ui-enumeration='exclusive' "
                f"user:ui-marker='enumerate'><groupfilter function='level-members' level='{lvl}' />{members}</groupfilter>")
    elif len(values) == 1:
        body = members.replace("<groupfilter function='member'",
                               "<groupfilter function='member' user:ui-domain='database' user:ui-enumeration='inclusive' "
                               "user:ui-marker='enumerate'", 1)
    else:
        body = (f"<groupfilter function='union' user:ui-domain='database' user:ui-enumeration='inclusive' "
                f"user:ui-marker='enumerate'>{members}</groupfilter>")
    return f"<filter class='categorical' column='{ref('none', field)}'{ctx}>{body}</filter>"


def all_filter(field: str) -> str:
    lvl = inst("none", field)
    return (f"<filter class='categorical' column='{ref('none', field)}'>"
            f"<groupfilter function='level-members' level='{lvl}' user:ui-enumeration='all' user:ui-marker='enumerate' />"
            f"</filter>")


def sheet(name: str, *, rows=(), cols=(), mark="Automatic", color=None, size=None, text=(), label=(),
          tooltip=(), fixed=None, shown=(), title="", sort=None, zoom="entire-view", tpl=None, big=False, label_mode=None,
          params=()) -> tuple[str, str]:
    """fixed: list of (field, values, context, exclude). shown: fields with an all-values shown filter."""
    fixed = fixed or []
    uses: list[tuple[str, str]] = []
    for u in [*rows, *cols, *([color] if color else []), *([size] if size else []), *text, *label, *tooltip]:
        if u not in uses:
            uses.append(u)
    filter_fields = [f for f, *_ in fixed] + [f for f in shown if f not in [x for x, *_ in fixed]]
    for f in filter_fields:
        if ("none", f) not in uses:
            uses.append(("none", f))
    fields = []
    for _, f in uses:
        if f not in fields:
            fields.append(f)
        if f in CALCS:
            for dep in ("volume_bu", "predict_result", "cif_id", "trade_date", "wps_mtm", "bp_div_type", "asset_tks",
                        "asset_tks_2", "asset_tks_mtm", "asset_tks_2_mtm", "strike_percentage", "ko_percentage",
                        "ki_percentage", "has_knocked_in"):  # fields a calc reads
                if f"[{dep}]" in CALCS[f][4] and dep not in fields:
                    fields.append(dep)
    deps = "".join(col_xml(f) for f in fields) + "".join(inst_xml(d, f) for d, f in uses)
    filters = "".join(member_filter(f, v, c, e) for f, v, c, e in fixed)
    filters += "".join(all_filter(f) for f in shown if f not in [x for x, *_ in fixed])
    slices = "".join(f"<column>{ref('none', f)}</column>" for f in filter_fields)
    enc = ""
    if color:
        enc += f"<color column='{ref(*color)}' />"
    if size:
        enc += f"<size column='{ref(*size)}' />"
    enc += "".join(f"<text column='{ref(*t)}' />" for t in [*text, *label])
    enc += "".join(f"<tooltip column='{ref(*t)}' />" for t in tooltip)
    fmts = ""
    sort_xml = (f"<sort class='computed' column='{ref('none', sort)}' direction='DESC' using='{ref(*SUM)}' />"
                if sort else "")
    title_xml = (f"<layout-options><title><formatted-text><run fontsize='12'>{escape(title)}</run></formatted-text></title>"
                 f"</layout-options>" if title else "")
    label_xml = ""
    if tpl:
        size = "26" if big else "10"
        runs = "".join(f"<run fontsize='{size}'>{escape(chunk) if not isinstance(chunk, tuple) else '&lt;' + ref(*chunk) + '&gt;'}</run>"
                       for chunk in tpl)
        label_xml = f"<customized-label><formatted-text>{runs}</formatted-text></customized-label>"
    if big:
        fmts += ("<style-rule element='cell'><format attr='font-size' value='28' /><format attr='text-align' value='center' />"
                 "<format attr='vertical-align' value='center' /></style-rule>")
    shelf = lambda items: " / ".join(ref(*i) for i in items)  # noqa: E731
    r = shelf(rows)
    c = shelf(cols)
    ws = (f"<worksheet name={quoteattr(name)}>{title_xml}<table><view>"
          f"<datasources>" + ("<datasource name='Parameters' />" if params else "")
          + f"<datasource caption='HK ELI positions' name='{DS}' /></datasources>"
          + ("<datasource-dependencies datasource='Parameters'>" + "".join(param_xml(p) for p in params)
             + "</datasource-dependencies>" if params else "")
          + f"<datasource-dependencies datasource='{DS}'>{deps}</datasource-dependencies>"
          f"{filters}" + (f"<slices>{slices}</slices>" if slices else "") + sort_xml +
          f"<aggregation value='true' /></view><style>{fmts}</style>"
          f"<panes><pane selection-relaxation-option='selection-relaxation-allow'><view><breakdown value='auto' /></view>"
          f"<mark class='{mark}' />" + (f"<encodings>{enc}</encodings>" if enc else "") + label_xml
          + ("<style><style-rule element='mark'><format attr='mark-labels-show' value='true' />"
             + (f"<format attr='mark-labels-mode' value='{label_mode}' />" if label_mode else "")
             + "</style-rule></style>"
             if label else "") + "</pane></panes>"
          f"<rows>{('(' + r + ')') if len(rows) > 1 else r}</rows><cols>{('(' + c + ')') if len(cols) > 1 else c}</cols>"
          f"</table><simple-id uuid='{{{str(uuid.uuid5(uuid.NAMESPACE_URL, 'hkeli/' + name)).upper()}}}' /></worksheet>")
    legend = f"<card param='{ref(*color)}' type='color' />" if color and color[0] == "none" else ""
    legend += "".join(f"<card param='[Parameters].[{p}]' type='parameter' />" for p in params)
    win = (f"<window class='worksheet' maximized='true' name={quoteattr(name)}><cards>"
           f"<edge name='left'><strip size='160'><card type='pages' /><card type='filters' /><card type='marks' /></strip></edge>"
           f"<edge name='top'><strip size='31'><card type='title' /></strip></edge>"
           + (f"<edge name='right'><strip size='130'>{legend}</strip></edge>" if legend else "") +
           f"</cards><viewpoint><zoom type='{zoom}' /></viewpoint>"
           f"<simple-id uuid='{{{str(uuid.uuid5(uuid.NAMESPACE_URL, 'hkeli-win/' + name)).upper()}}}' /></window>")
    return ws, win


AMT = ("usr", "calc_amount_label")
SHARE = ("usr", "calc_share_label")
LIVE = ("deal_status", ["LIVE"], True, False)
TRE = ("bp_div_type", ["Treasures(HK)"], True, False)
N = lambda f: ("none", f)  # noqa: E731
SUM = ("sum", "volume_bu")
CUST = ("usr", "calc_customers")


def sheets():
    detail_dims = ["predict_maturity", "cust_district", "cust_branch", "rm_name", "cif_id", "predict_result",
                   "trade_currency", "volume", "asset_tks", "asset_tks_2", "strike_percentage", "ko_percentage",
                   "ki_percentage", "pos_id", "wps"]
    tre_shown = ["deal_status", "cust_district", "cust_branch", "predict_maturity", *W1]
    scenario_dims = ["pos_id", "asset_id", "cif_id", "bp_div_type", "cust_district", "cust_branch", "rm_name", "asset_tks",
                     "asset_tks_2", "asset_tks_mtm", "asset_tks_2_mtm", "wps", "wps_mtm", "strike_percentage",
                     "ko_percentage", "ki_percentage", "has_knocked_in", "predict_result", "predict_maturity",
                     "calc_sim_wps", "calc_sim_mtm", "calc_predictive"]
    return [
        # Spec: "Outstanding notional KPI"
        sheet("all_outatanding_total", mark="Text", text=[SUM], big=True, fixed=[LIVE], shown=["deal_status", "bp_div_type"],
              title="Outstanding ELI, HKD (live positions)"),
        # Spec: Rows bp_div_type; Text SUM(volume_bu) and its percentage of total
        sheet("all_outatanding_segment", rows=[N("bp_div_type")], mark="Text", text=[AMT, SHARE],
              tooltip=[SUM, ("usr", "calc_share")], zoom="fit-width",
              fixed=[LIVE], shown=["deal_status", "bp_div_type"], title="Outstanding ELI by segment, share of all segments"),
        # Spec: Rows bp_div_type > predict_result; colour predict_result; Text "<amount> (<share>)"
        sheet("all_outatanding_segment_result", rows=[N("bp_div_type"), N("predict_result")], mark="Text",
              color=N("predict_result"), text=[AMT, SHARE], tooltip=[SUM, ("usr", "calc_share")], fixed=[LIVE],
              zoom="fit-width",
              shown=["deal_status", "bp_div_type"], title="Outstanding ELI by segment and predicted result, share of all"),
        # Spec: Columns bp_div_type; Rows SUM; colour predict_result; Labels SUM and COUNTD(cif_id)
        sheet("segment_outstanding", cols=[N("bp_div_type")], rows=[SUM], mark="Bar", color=N("predict_result"),
              label=[AMT, ("ctd", "cif_id")], fixed=[LIVE],
              shown=["deal_status", "bp_div_type", "predict_maturity", *W1],
              title="Outstanding ELI and customers by segment and predicted result"),
        # Spec: Columns DAY(predict_maturity); Rows SUM; colour predict_result; label SUM
        sheet("TRE_maturity_calendar_n30d", cols=[N("predict_maturity")], rows=[SUM], mark="Bar",
              color=N("predict_result"), tooltip=[AMT, CUST], fixed=[TRE, LIVE], shown=tre_shown,
              title="TRE predicted maturity by date (HKD)"),
        # Spec: Columns cust_district > cust_branch, predict_result; Rows SUM
        sheet("TRE_maturity_branch_n30d", cols=[N("cust_district"), N("cust_branch")], rows=[SUM], mark="Bar",
              color=N("predict_result"), tooltip=[CUST, AMT], fixed=[TRE, LIVE], shown=tre_shown,
              title="TRE predicted maturity by district and branch (HKD)"),
        # Spec: position-level drill-down list
        sheet("TRE_maturity_detail_n30d", rows=[N(d) for d in detail_dims], mark="Text",
              text=[SUM, ("avg", "wps_mtm")], fixed=[TRE, LIVE], shown=[*tre_shown, "wps"], zoom="fit-width",
              title="TRE predicted maturity: clients and positions"),
        # Spec: Columns bp_div_type (> cust_district); Rows SUM; colour predict_result; label SUM
        sheet("ALL_outstanding_District_n30d", cols=[N("bp_div_type"), N("cust_district")], rows=[SUM], mark="Bar",
              color=N("predict_result"), tooltip=[AMT, CUST],
              fixed=[("calc_in_scope", ["In scope"], True, False), LIVE],
              shown=["deal_status", "bp_div_type", "predict_maturity", *W1],
              title="Outstanding ELI by segment and district (excludes TPC)"),
        # Spec: Rows wps; Columns SUM; segmented by predict_result
        # Spec: Rows wps; Columns SUM; colour predictive_result; Market Spot parameter control
        sheet("ALL_outstanding_simulation_n30d", rows=[N("wps")], cols=[SUM], mark="Bar", color=N("calc_predictive"),
              tooltip=[AMT, N("predict_result")], fixed=[LIVE], shown=["deal_status", "bp_div_type", "predict_maturity", *W1],
              sort="wps", zoom="fit-width", params=["Parameter 1"],
              title="Outstanding ELI by worst-performing stock, predictive result at Market Spot (all segments)"),
        sheet("TRE_outstanding_simulation_n30d", rows=[N("wps")], cols=[SUM], mark="Bar", color=N("calc_predictive"),
              tooltip=[AMT, N("predict_result")], fixed=[TRE, LIVE],
              shown=["cust_district", "cust_branch", "predict_maturity", *W1], params=["Parameter 1"],
              sort="wps", zoom="fit-width", title="TRE outstanding ELI by worst-performing stock, at Market Spot"),
        # Spec: Columns MTM% (bin); Rows deal count; colour predict_result; size SUM; label wps
        sheet("ALL_outstanding_distribution_n30d", cols=[N("calc_mtm_bin")], rows=[("ctd", "asset_id")], mark="Circle",
              size=SUM, color=N("predict_result"), label=[N("wps")], tooltip=[AMT], fixed=[LIVE], label_mode="selection",
              shown=["deal_status", "bp_div_type", "cust_district", "cust_branch", "predict_maturity", *W1],
              title="MTM distribution: deals by MTM% bin, size = HKD"),
        # Spec: "Data-recency KPI"
        sheet("max_trade_date", mark="Text", text=[("usr", "calc_max_trade_date")], big=True, shown=["bp_div_type"],
              title="Latest trade date"),
        sheet("data_as_of", mark="Text", text=[N("business_date"), N("last_refresh")], big=True,
              title="Data as of (business date, last refresh)"),
        # W8: position level, every basket stock against strike, KI and KO, with a single-stock shock
        sheet("ALL_position_scenario", rows=[N(d) for d in scenario_dims], mark="Text", text=[SUM],
              color=N("calc_predictive"), fixed=[LIVE], zoom="fit-width",
              shown=["deal_status", "bp_div_type", "cust_district", "cust_branch", "calc_in_shock_basket", "wps", "predict_result"],
              params=["Parameter 1", "Parameter 2", "Parameter 3"],
              title="Position scenario: predictive result after a stock move and Market Spot"),
    ]


def twb() -> str:
    rel_cols = "".join(f"<column datatype='{CSV_TYPES[c]}' name='{c}' ordinal='{i}' />" for i, c in enumerate(COLS))
    ds_cols = "".join(col_xml(c) for c in COLS) + "".join(col_xml(c) for c in CALCS)
    ws, wins = zip(*sheets())
    return ("<?xml version='1.0' encoding='utf-8' ?>\n"
            "<workbook original-version='18.1' source-build='2024.2.0 (20242.24.0613.0835)' source-platform='mac' "
            "version='18.1' xmlns:user='http://www.tableausoftware.com/xml/user'>"
            "<preferences><preference name='ui.encoding.shelf.height' value='24' />"
            "<preference name='ui.shelf.height' value='26' /></preferences>"
            "<datasources><datasource hasconnection='false' inline='true' name='Parameters' version='18.1'>"
            "<aliases enabled='yes' />" + "".join(param_xml(n) for n in PARAMS) + "</datasource>"
            f"<datasource caption='HK ELI positions' inline='true' name='{DS}' version='18.1'>"
            "<connection class='federated'><named-connections>"
            "<named-connection caption='hk_eli_positions' name='textscan.hkeli'>"
            f"<connection class='textscan' directory='Data/Datasources' filename='{CSV_NAME}' password='' server='' />"
            "</named-connection></named-connections>"
            f"<relation connection='textscan.hkeli' name='{CSV_NAME}' table='[hk_eli_positions#csv]' type='table'>"
            f"<columns character-set='UTF-8' header='yes' locale='en_US' separator=','>{rel_cols}</columns>"
            "</relation></connection>"
            f"<aliases enabled='yes' />{ds_cols}"
            "<column-instance column='[predict_result]' derivation='None' name='[none:predict_result:nk]' pivot='key' type='nominal' />"
            "<layout dim-ordering='alphabetic' measure-ordering='alphabetic' "
            "show-structure='true' />" + PALETTE + "</datasource></datasources>"
            f"<worksheets>{''.join(ws)}</worksheets>"
            f"<windows source-height='30'>{''.join(wins)}</windows></workbook>")


def csv_text() -> str:
    ds = dataset()
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(COLS)
    for r in ds.rows:
        d = r["days_to_pred_maturity"]
        row = {**r, "last_refresh": ds.last_refresh.isoformat(sep=" ", timespec="minutes"),
               **{f"in_n{n}": "TRUE" if 0 < d <= n else "FALSE" for n in (7, 14, 30, 60, 90)}}
        w.writerow(["" if row.get(c) is None else row.get(c) for c in COLS])
    return buf.getvalue()


def main(out: Path):
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("HK_ELI.twb", twb())
        z.writestr(f"Data/Datasources/{CSV_NAME}", csv_text())
    print(f"wrote {out} ({out.stat().st_size} bytes, {len(sheets())} sheets)")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "out/HK_ELI.twbx"))
