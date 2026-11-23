"""Build the HK ELI semantic catalog (hkeli_poc/catalog/hkeli_catalog.json).

The catalog follows the logical-query-mcp catalog shape (datasources, entities with fields,
relationships, glossary, metrics; camelCase keys), with two HK ELI additions:

- `concepts`: the master list of business concepts, in the office catalog's own style
  (id, kind, aliases, description, values). The concept matcher searches this list.
- each entity is one published Tableau view, and carries its `recordId`, `tableauView` and `intents`.

Sources: the mock workbook (hkeli_poc/workbook.py, proposed site = the 12 views plus W1-W7),
the glossary (hkeli_poc/knowledge/glossary.json) and the discovery transcripts for the descriptions.
Everything here is synthetic. In the office, office/import_catalog.py merges the real
TABLEAU_SEMANTIC_CATALOG_JSON into a copy of this file, so the real catalog never leaves.

    python scripts/build_catalog.py          # rewrite the catalog
    python scripts/build_catalog.py --check  # fail if the committed file is out of date (used by the tests)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hkeli_poc.workbook import VIEWS  # noqa: E402

OUT = ROOT / "hkeli_poc" / "catalog" / "hkeli_catalog.json"
GLOSSARY = ROOT / "hkeli_poc" / "knowledge" / "glossary.json"

# Measures in the view list -> the concept they aggregate.
MEASURE_FIELD = {
    "sum": "volume_bu", "pct": "volume_bu", "countd": "cif_id", "countd_excl": "cif_id",
    "avg_wps_mtm": "wps_mtm", "count_asset": "deal_count", "max_trade_date": "trade_date",
    "business_date": "business_date", "last_refresh": "last_refresh",
}

# Plain descriptions for glossary concepts (the glossary keeps the rules; these say what the field is).
DESCRIPTIONS = {
    "volume_bu": "Outstanding notional of a position in HKD equivalent. 'Outstanding' always means SUM(volume_bu) over live deals.",
    "deal_status": "Lifecycle status of the deal. Outstanding means LIVE.",
    "bp_div_type": "Business segment of the customer: Treasures (HK), Treasures Private Client, Private Banking.",
    "cif_id": "Customer identifier. Customer counts are distinct counts and never add up across groups.",
    "cust_district": "Sales district of the customer. Treasures (HK) only.",
    "cust_branch": "Servicing branch of the customer. Treasures (HK) only.",
    "reg_mgr_onebank_id": "Team lead above the relationship manager.",
    "rm_name": "Relationship manager who serves the customer.",
    "wps": "Worst-performing stock of the ELI's basket today. Not the same as any stock in the basket.",
    "predict_result": "Model estimate of how the ELI ends: KO, EXP, EXP(Below Strike) or EX. Never a confirmed outcome.",
    "predict_maturity": "Predicted maturity date: next observation date if KO is predicted, otherwise contractual maturity.",
    "maturity_date": "Contractual (scheduled) maturity date of the ELI.",
    "basket_membership": "Whether a stock is any underlying of the ELI's basket, not just the worst performer.",
    "market_spot": "Scenario multiplier on market prices used by the simulation views.",
    "trade_date": "Date the ELI was traded.",
}

VALUE_MEANINGS = {
    "LIVE": "Live, outstanding deal",
    "Treasures(HK)": "Treasures Hong Kong", "Treasures(TPC)": "Treasures Private Client", "PB": "Private Banking",
    "KO": "Knock-out predicted", "EXP": "Expiry above strike predicted",
    "EXP(Below Strike)": "Expiry below strike predicted, cash settled", "EX": "Exercise predicted, stock delivered",
}

# Concepts that the views carry but the glossary does not list.
EXTRA = [
    dict(id="pos_id", kind="identifier", label="Position", aliases=["position", "position ID", "deal reference"],
         description="Identifier of one ELI position."),
    dict(id="trade_currency", kind="dimension", label="Trade currency", aliases=["currency", "trade currency", "deal currency"],
         description="Currency the ELI was traded in."),
    dict(id="volume", kind="measure", label="Notional in trade currency", aliases=["notional in trade currency", "original notional"],
         description="Notional of the position in its trade currency."),
    dict(id="asset_tks", kind="dimension", label="Underlying 1", aliases=["underlying 1", "first underlying", "stock 1"],
         description="Ticker of the first underlying stock."),
    dict(id="asset_tks_2", kind="dimension", label="Underlying 2", aliases=["underlying 2", "second underlying", "stock 2"],
         description="Ticker of the second underlying stock."),
    dict(id="strike_percentage", kind="measure", label="Strike %", aliases=["strike", "strike level", "strike percentage"],
         description="Strike level as a percentage of the initial price."),
    dict(id="ko_percentage", kind="measure", label="KO barrier %", aliases=["KO barrier", "knock-out barrier", "KO level", "KO percentage"],
         description="Knock-out barrier as a percentage of the initial price."),
    dict(id="ki_percentage", kind="measure", label="KI barrier %", aliases=["KI barrier", "knock-in barrier", "KI level", "KI percentage"],
         description="Knock-in barrier as a percentage of the initial price."),
    dict(id="days_to_pred_maturity", kind="measure", label="Days to predicted maturity",
         aliases=["days to maturity", "days until maturity", "days left"],
         description="Business days from the data date to the predicted maturity (W1 field)."),
    dict(id="mtm_bin", kind="dimension", label="MTM % bin", aliases=["MTM", "mark to market", "MTM distribution", "distribution", "MTM bin"],
         description="Mark-to-market of the worst-performing stock, in 10% bins."),
    dict(id="wps_mtm", kind="measure", label="WPS MTM %", aliases=["WPS MTM", "average MTM"],
         description="Mark-to-market of the worst-performing stock, as a percentage."),
    dict(id="deal_count", kind="measure", label="Deal count", aliases=["number of deals", "deal count", "count of deals"],
         description="Number of positions in the group."),
    dict(id="business_date", kind="event", label="Business date", aliases=["data date", "as of date", "business date"],
         description="Close of business date the data describes (W2 view)."),
    dict(id="last_refresh", kind="event", label="Last refresh", aliases=["last refresh", "refresh time", "last updated"],
         description="When the extract last refreshed (W2 view)."),
]
for n in (7, 14, 30, 60, 90):
    EXTRA.append(dict(id=f"in_n{n}", kind="flag", label=f"Predicted maturity within {n} days",
                      aliases=[f"next {n} days flag", f"N{n}D"],
                      description=f"Published flag: predicted maturity falls in the next {n} days (W1 field)."))

# Concepts the office catalog knows (first photographed page, ELI terms) that no published view carries.
# They exist so the matcher can say "known, but not in any view" instead of guessing.
NOT_IN_VIEWS = [
    dict(id="announcement_date", kind="event", label="Result announcement date",
         aliases=["announcement date", "result announcement date", "final result announcement date",
                  "outcome announcement date", "result publication date"],
         description="Expected date on which the issuer publishes the final fixing or maturity result."),
    dict(id="asset_geo_exchange", kind="dimension", label="Underlying exchange country",
         aliases=["asset 1 exchange geography", "underlying 1 exchange country", "primary listing market country",
                  "stock exchange geography 1", "listing venue country 1", "exchange country"],
         description="Country of the exchange where underlying 1 is primarily listed."),
    dict(id="coupon", kind="measure", label="Coupon", aliases=["coupon", "coupon rate", "yield", "annualised coupon"],
         description="Coupon (yield) the ELI pays."),
    dict(id="tenor", kind="measure", label="Tenor", aliases=["tenor", "tenure", "deal length", "duration of the deal"],
         description="Length of the ELI from trade to contractual maturity."),
    dict(id="issuer", kind="dimension", label="Issuer", aliases=["issuer", "issuing bank", "counterparty"],
         description="Issuer of the ELI."),
]

GLOSSARY_TERMS = [
    ("ko", "KO", ["KO'd", "KOd", "knocked out", "knock out"], "knock-out", "predict_result"),
    ("ki", "KI", ["knocked in", "knock in"], "knock-in", "ki_percentage"),
    ("rm", "RM", ["RMs"], "relationship manager", "rm_name"),
    ("wps", "WPS", ["worst performer"], "worst-performing stock", "wps"),
    ("tre", "TRE", ["Treasures HK"], "Treasures (HK) segment", "bp_div_type"),
    ("tpc", "TPC", [], "Treasures Private Client segment", "bp_div_type"),
    ("pb", "PB", ["private bank"], "Private Banking segment", "bp_div_type"),
    ("cif", "CIF", [], "customer", "cif_id"),
    ("mtm", "MTM", ["mark-to-market"], "mark to market", "mtm_bin"),
    ("eli", "ELI", ["ELIs", "equity linked investment"], "equity-linked investment", "volume_bu"),
    ("n30d", "N30D", ["next 30 days"], "predicted maturity in the next 30 days", "in_n30"),
]

METRICS = [
    dict(id="outstanding", name="Outstanding notional", formula="sum(volume_bu)", conditions="deal_status = 'LIVE'",
         description="Total outstanding ELI in HKD equivalent.", synonyms=["outstanding", "total outstanding", "exposure", "notional"]),
    dict(id="share_of_outstanding", name="Share of outstanding", formula="sum(volume_bu) / total(sum(volume_bu))",
         conditions="deal_status = 'LIVE'", description="A group's percentage of total outstanding.",
         synonyms=["share", "percentage", "proportion", "percent of total"]),
    dict(id="distinct_customers", name="Distinct customers", formula="count_distinct(cif_id)", conditions="deal_status = 'LIVE'",
         description="Number of distinct customers. Not additive across groups.",
         synonyms=["customers", "clients", "number of customers", "customer count", "how many customers"]),
]


def concepts() -> list[dict]:
    g = json.loads(GLOSSARY.read_text())
    out = []
    for c in g["concepts"]:
        d = {"id": c["id"], "kind": c["kind"], "label": c["label"], "aliases": list(c["terms"]),
             "description": DESCRIPTIONS.get(c["id"], c.get("rule", ""))}
        if c["id"] == "cif_id":
            d["aliases"] += ["customer", "customers", "client", "clients"]
        if c["id"] == "predict_maturity":
            d["aliases"] += ["maturity", "maturing", "mature", "matures", "maturity calendar"]
        if c["id"] == "cust_branch":
            d["aliases"] += ["branches"]
        vals = []
        for v in c.get("values", []):
            e = {"value": v["value"], "meaning": VALUE_MEANINGS.get(v["value"], "")}
            if v.get("short") and v["short"] != v["value"]:
                e["short"] = v["short"]
            if v.get("district"):
                e["district"] = v["district"]
            vals.append(e)
        if vals:
            d["values"] = vals
            d["valueType"] = "enum"
        elif c["id"] in ("wps", "rm_name", "reg_mgr_onebank_id"):
            d["valueType"] = "lookup"
        if c["id"] == "wps" and c.get("aliases"):
            d["valueAliases"] = dict(c["aliases"])
        if c.get("supported") is False:
            d["supported"] = False
            d["userText"] = c.get("user_text", "")
        out.append(d)
    out += [dict(c) for c in EXTRA]
    out += [dict(c, inViews=False) for c in NOT_IN_VIEWS]
    return out


def entities(cons: list[dict]) -> list[dict]:
    by_id = {c["id"]: c for c in cons}
    out = []
    for v in VIEWS["proposed"]:
        fields = []
        for f in list(v["dims"]) + list(v["filters"]) + [MEASURE_FIELD[m] for m in v["measures"]] + list(v["parameters"]):
            if f in fields:
                continue
            fields.append(f)
        out.append({
            "id": v["record_id"], "datasourceId": "hk_eli_workbook", "name": v["name"],
            "recordId": v["record_id"], "tableauView": v["name"],
            "purpose": v["title"], "usage": "Intents: " + ", ".join(v["intents"]),
            "grain": " x ".join(v["dims"][:3]) if v["dims"] else "single figure",
            "synonyms": [], "enabled": True, "intents": list(v["intents"]),
            "fields": [{"name": f, "type": by_id[f]["kind"], "description": by_id[f]["description"],
                        "synonyms": by_id[f]["aliases"][:6], "valueType": by_id[f].get("valueType", "free"),
                        "enumValues": [{"value": x["value"], "meaning": x.get("meaning", "")}
                                       for x in by_id[f].get("values", [])]} for f in fields],
        })
    return out


def build() -> dict:
    cons = concepts()
    return {
        "schemaVersion": "hkeli-catalog/1",
        "catalogId": "synthetic-hkeli",
        "about": "HK ELI semantic catalog in the logical-query-mcp shape, plus a concepts list. Synthetic. "
                 "Built by scripts/build_catalog.py; the office merges the real catalog with office/import_catalog.py.",
        "usecase": {"id": "hk_eli", "name": "HK ELI"},
        "datasources": [{"id": "hk_eli_workbook", "name": "HK_ELI Tableau workbook", "plugin": "tableau",
                         "host": "", "port": 0, "database": "HK_ELI",
                         "description": "Published HK_ELI views, read with REST Query View Data as the user."}],
        "entities": entities(cons),
        "relationships": [],
        "glossary": [{"id": i, "term": t, "aliases": a, "meaning": m, "mapsTo": to} for i, t, a, m, to in GLOSSARY_TERMS],
        "metrics": METRICS,
        "concepts": cons,
    }


def render() -> str:
    return json.dumps(build(), indent=1, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    text = render()
    if "--check" in argv:
        if not OUT.exists() or OUT.read_text() != text:
            print("catalog is out of date: run python scripts/build_catalog.py")
            return 1
        print("catalog is up to date")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text)
    d = build()
    print(f"wrote {OUT.relative_to(ROOT)}: {len(d['entities'])} views, {len(d['concepts'])} concepts, "
          f"{len(d['glossary'])} glossary terms, {len(d['metrics'])} metrics")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
