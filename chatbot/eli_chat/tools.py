"""The tools the agent can call. One list, one shape.

Each tool has a name, a description the model reads to decide when to call it, a JSON schema
for its arguments, and a handler that returns a `ToolResult`. Two kinds:

* **HK_ELI skill** tools run one of Niharika's twelve `eli.*` business skills unchanged
  (`skills.run_skill`). Her reviewed SQL, her evidence records, her warnings.
* **Book query** tools run a fixed query on our extra columns (`book.py`): client names, RMs,
  knock-out distance, RFQ terms, the idea warehouse.

Arguments are validated here by code before anything runs, whatever the model sent.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Callable

from . import book, skills

MAX_MODEL_ROWS = 25


@dataclass
class Column:
    key: str
    label: str
    kind: str = "text"          # text | money | pct | number | date


@dataclass
class ToolResult:
    tool: str
    title: str
    source: str                 # e.g. "HK_ELI skill eli.risk.concentration"
    source_kind: str            # "skill" | "book"
    as_of: str
    columns: list[Column]
    rows: list[dict[str, Any]]
    totals: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    total_rows: int | None = None
    error: str | None = None

    def for_model(self) -> str:
        """What the model reads: compact JSON, rows capped, every figure as it will be checked."""
        body: dict[str, Any] = {
            "tool": self.tool, "source": self.source, "as_of": self.as_of, "currency": "USD",
            "columns": {c.key: c.label for c in self.columns},
            "rows": self.rows[:MAX_MODEL_ROWS],
        }
        shown = min(len(self.rows), MAX_MODEL_ROWS)
        total = self.total_rows if self.total_rows is not None else len(self.rows)
        if total > shown:
            body["rows_note"] = f"showing {shown} of {total} rows"
        if self.totals:
            body["totals"] = self.totals
        if self.notes:
            body["notes"] = self.notes
        if self.error:
            body = {"tool": self.tool, "error": self.error}
        elif not self.rows:
            body["empty"] = "No rows matched. Say so plainly; an empty result is not a zero book."
        return json.dumps(body, default=str, separators=(",", ":"))

    def for_ui(self) -> dict[str, Any]:
        d = asdict(self)
        d["rows"] = self.rows[:50]
        return d


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable[[dict[str, Any], str], ToolResult]
    label: str                  # what the UI shows while it runs, e.g. "Checking book concentration"

    def schema(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "parameters": self.parameters}


# ---------------------------------------------------------------- helpers

def _num(v: Any) -> Any:
    """Her outputs carry ratios as strings ('0.2463...'). Turn numeric strings into numbers."""
    if isinstance(v, str):
        try:
            return float(v)
        except ValueError:
            return v
    return v


def _pct(ratio: Any) -> float | None:
    r = _num(ratio)
    return round(float(r) * 100, 2) if isinstance(r, (int, float)) else None


def _int_arg(args: dict, key: str, default: int, lo: int, hi: int) -> int:
    try:
        v = int(args.get(key, default))
    except (TypeError, ValueError):
        v = default
    return max(lo, min(hi, v))


def _str_arg(args: dict, key: str, max_len: int = 80) -> str:
    v = args.get(key)
    return str(v).strip()[:max_len] if v not in (None, "") else ""


def _skill(skill_id: str, persona: str, days: int = 5) -> tuple[list[dict], dict]:
    out = skills.run_skill(skill_id, persona, days=days)
    data = out.get("data", {})
    return [{k: _num(v) for k, v in r.items()} for r in data.get("rows", [])], out


def _names() -> dict[str, dict[str, Any]]:
    return {r["id"]: r for r in book.rows("SELECT id, name, rm_name, branch, segment FROM customers")}


def _skill_result(tool: str, title: str, skill_id: str, columns: list[Column], rows: list[dict],
                  out: dict, **kw: Any) -> ToolResult:
    data = out.get("data", {})
    return ToolResult(tool=tool, title=title, source=f"HK_ELI skill {skill_id}", source_kind="skill",
                      as_of=data.get("as_of", ""), columns=columns, rows=rows,
                      warnings=list(out.get("warnings", []))[:3], **kw)


# ---------------------------------------------------------------- HK_ELI skill tools

def t_concentration(args: dict, persona: str) -> ToolResult:
    raw, out = _skill("eli.risk.concentration", persona, days=_int_arg(args, "days", 14, 1, 366))
    limits = {r["underlying"]: r["limit_pct"] for r in
              book.rows("SELECT underlying, limit_pct FROM underlying_limits WHERE scope='book'")}
    rows = [{
        "underlying": r["underlying"], "notional_usd": r["notional"], "share_pct": _pct(r.get("share")),
        "limit_pct": limits.get(r["underlying"]), "over_review_threshold": bool(r.get("review_flag")),
        "clients": r["clients"], "worst_of_notional_usd": r["worst_of_notional"],
        "maturing_in_window_usd": r.get("upcoming_maturity_notional"),
    } for r in raw]
    total = book.one("SELECT sum(notional) AS t FROM positions WHERE snapshot=(SELECT as_of FROM metadata)")
    return _skill_result("book_concentration", "Book concentration by underlying", "eli.risk.concentration", [
        Column("underlying", "Underlying"), Column("notional_usd", "Exposure", "money"),
        Column("share_pct", "Share of book", "pct"), Column("limit_pct", "Limit", "pct"),
        Column("clients", "Clients", "number"), Column("maturing_in_window_usd", "Maturing in window", "money"),
    ], rows, out, totals={"book_notional_usd": total["t"] if total else None},
        notes=["Exposure is look-through: a worst-of deal counts under each underlying in its basket.",
               "Review threshold is 25% of book per underlying."])


def t_maturities(args: dict, persona: str) -> ToolResult:
    days = _int_arg(args, "days", 14, 1, 120)
    rows, out = _skill("eli.maturity.analyze", persona, days=days)
    rows = [{"maturity_date": r["maturity"], "deals": r["deals"], "notional_usd": r["notional"]} for r in rows]
    return _skill_result("maturity_calendar", f"Maturities in the next {days} calendar days", "eli.maturity.analyze", [
        Column("maturity_date", "Maturity", "date"), Column("deals", "Deals", "number"),
        Column("notional_usd", "Notional (legs)", "money")], rows, out,
        totals={"deals": sum(r["deals"] for r in rows), "notional_usd": sum(r["notional_usd"] or 0 for r in rows)},
        notes=["Notional sums basket legs (look-through), so a worst-of deal is counted in full once per leg weight."])


def t_rollovers(args: dict, persona: str) -> ToolResult:
    days = _int_arg(args, "days", 14, 1, 120)
    rows, out = _skill("eli.rollover.opportunity", persona, days=days)
    rows = [{"status": r["status"].replace("_", " "), "opportunities": r["opportunities"],
             "notional_usd": r["notional"]} for r in rows]
    return _skill_result("rollover_pipeline", f"Rollover opportunities, next {days} calendar days",
                         "eli.rollover.opportunity", [
        Column("status", "Status"), Column("opportunities", "Deals", "number"),
        Column("notional_usd", "Notional", "money")], rows, out)


def t_sales_by_branch(args: dict, persona: str) -> ToolResult:
    rows, out = _skill("eli.sales.performance", persona)
    total = sum(r["sales"] or 0 for r in rows)
    rows = [{"branch": r["branch"], "sales_usd": r["sales"],
             "share_pct": round(100 * (r["sales"] or 0) / total, 2) if total else None} for r in rows]
    return _skill_result("sales_by_branch", "ELI sales by branch (all trades on file)", "eli.sales.performance", [
        Column("branch", "Branch"), Column("sales_usd", "Sales", "money"), Column("share_pct", "Share", "pct")],
        rows, out, totals={"sales_usd": total},
        notes=["Revenue is not in the book (NULL), so only traded notional is shown."])


def t_sales_trend(args: dict, persona: str) -> ToolResult:
    raw, out = _skill("eli.sales.trend", persona)
    months: dict[str, float] = {}
    for r in raw:
        months[r["trade_date"][:7]] = months.get(r["trade_date"][:7], 0) + (r["sales"] or 0)
    last = _int_arg(args, "months", 12, 1, 36)
    rows = [{"month": m, "sales_usd": v} for m, v in sorted(months.items())][-last:]
    return _skill_result("sales_trend", "Monthly ELI sales", "eli.sales.trend", [
        Column("month", "Month"), Column("sales_usd", "Sales", "money")], rows, out,
        notes=["Monthly totals are summed by the chatbot from the skill's daily rows."])


def t_rfq_conversion(args: dict, persona: str) -> ToolResult:
    rows, out = _skill("eli.rfq.conversion", persona)
    rows = [{"rfqs": r["rfqs"], "traded": r["won"], "conversion_pct": _pct(r.get("conversion"))} for r in rows]
    return _skill_result("rfq_conversion", "RFQ to trade conversion (all RFQs on file)", "eli.rfq.conversion", [
        Column("rfqs", "RFQs", "number"), Column("traded", "Traded", "number"),
        Column("conversion_pct", "Conversion", "pct")], rows, out)


def t_product_coupons(args: dict, persona: str) -> ToolResult:
    rows, out = _skill("eli.product.yield", persona)
    rows = [{"product": r["product"], "legs": r["positions"], "min_coupon_pct": r["min_coupon"],
             "max_coupon_pct": r["max_coupon"],
             "weighted_coupon_pct": round(r["weighted_coupon"], 2) if r.get("weighted_coupon") else None}
            for r in rows]
    return _skill_result("product_coupons", "Quoted coupons by product", "eli.product.yield", [
        Column("product", "Product"), Column("legs", "Positions (legs)", "number"),
        Column("min_coupon_pct", "Min coupon", "pct"), Column("max_coupon_pct", "Max coupon", "pct"),
        Column("weighted_coupon_pct", "Notional-weighted coupon", "pct")], rows, out,
        notes=["Coupon is not realised return.", "The skill counts basket legs, not deals."])


def t_top_clients(args: dict, persona: str) -> ToolResult:
    raw, out = _skill("eli.client.intelligence", persona)
    names = _names()
    agg: dict[str, dict[str, Any]] = {}
    for r in raw:
        a = agg.setdefault(r["client"], {"client_id": r["client"], "notional_usd": 0, "deals": 0})
        a["notional_usd"] += r["notional"] or 0
        a["deals"] += r["positions"] or 0
    ranked = sorted(agg.values(), key=lambda a: -a["notional_usd"])
    limit = _int_arg(args, "limit", 10, 1, 25)
    rows = [{**a, "name": names.get(a["client_id"], {}).get("name", ""),
             "rm": names.get(a["client_id"], {}).get("rm_name", ""),
             "branch": names.get(a["client_id"], {}).get("branch", "")} for a in ranked[:limit]]
    return _skill_result("top_clients", f"Top {limit} clients by outstanding", "eli.client.intelligence", [
        Column("name", "Client"), Column("client_id", "ID"), Column("rm", "RM"), Column("branch", "Branch"),
        Column("notional_usd", "Outstanding", "money"), Column("deals", "Deals", "number")], rows, out,
        total_rows=len(ranked), notes=["Names and RMs are joined from the customer table by the chatbot."])


def t_branch_exposure(args: dict, persona: str) -> ToolResult:
    raw, out = _skill("eli.branch.concentration", persona)
    branch = _str_arg(args, "branch").lower()
    rows = [{"branch": r["branch"], "underlying": r["underlying"], "notional_usd": r["notional"]}
            for r in raw if not branch or r["branch"].lower() == branch]
    return _skill_result("branch_exposure", "Exposure by branch and underlying" + (f" ({args['branch']})" if branch else ""),
                         "eli.branch.concentration", [
        Column("branch", "Branch"), Column("underlying", "Underlying"),
        Column("notional_usd", "Exposure", "money")], rows, out)


def t_regional(args: dict, persona: str) -> ToolResult:
    rows, out = _skill("eli.regional.performance", persona)
    total = sum(r["sales"] or 0 for r in rows)
    rows = [{"branch": r["branch"], "district": r["district"], "sales_usd": r["sales"],
             "share_pct": round(100 * (r["sales"] or 0) / total, 2) if total else None} for r in rows]
    return _skill_result("regional_performance", "Sales by branch and district", "eli.regional.performance", [
        Column("branch", "Branch"), Column("district", "District"), Column("sales_usd", "Sales", "money")], rows, out)


def t_digital(args: dict, persona: str) -> ToolResult:
    rows, out = _skill("eli.digibank.journey", persona)
    return _skill_result("digital_journey", "digibank journey stages", "eli.digibank.journey", [
        Column("stage", "Stage"), Column("events", "Events", "number"), Column("clients", "Clients", "number")],
        rows, out)


def t_engagement(args: dict, persona: str) -> ToolResult:
    rows, out = _skill("eli.client.engagement", persona)
    return _skill_result("client_engagement", "Client engagement events", "eli.client.engagement", [
        Column("kind", "Kind"), Column("events", "Events", "number"), Column("clients", "Clients", "number")],
        rows, out, notes=["Only trades and RFQs are recorded. Calls and meetings are not in the book."])


# ---------------------------------------------------------------- book query tools

def t_find_client(args: dict, persona: str) -> ToolResult:
    q = _str_arg(args, "query")
    cols = [Column("field", "Field"), Column("value", "Value")]
    base = dict(tool="client_profile", source="Book query: customers, positions, rfqs, rollovers",
                source_kind="book", as_of=book.as_of())
    if not q:
        return ToolResult(title="Client profile", columns=cols, rows=[], error="Give a client name or id.", **base)
    like = f"%{q.lower()}%"
    found = book.rows("""SELECT * FROM customers WHERE lower(id)=? OR lower(name) LIKE ? OR lower(short_name) LIKE ?
                         OR cif_masked LIKE ? ORDER BY (lower(id)=?) DESC, name LIMIT 6""",
                      (q.lower(), like, like, f"%{q[-4:]}", q.lower()))
    if not found:
        return ToolResult(title=f"Client profile: {q}", columns=cols, rows=[], **base)
    if len(found) > 1 and found[0]["id"].lower() != q.lower() and q.lower() not in found[0]["name"].lower():
        return ToolResult(title=f"Clients matching {q}", columns=[Column("id", "ID"), Column("name", "Name"),
                          Column("branch", "Branch"), Column("rm_name", "RM")],
                          rows=[{k: c[k] for k in ("id", "name", "branch", "rm_name")} for c in found],
                          notes=["More than one client matches. Ask which one."], **base)
    c = found[0]
    end = book.window_end(10)
    deals = book.rows("""SELECT id, product, group_concat(underlying, '/') AS basket, sum(notional) AS notional_usd,
                         max(coupon) AS coupon_pct, max(maturity) AS maturity, max(settlement) AS settlement,
                         min(last_vs_ko_pct) AS last_vs_ko_pct, max(shares_deliverable) AS shares_deliverable
                         FROM positions WHERE client=? AND snapshot=(SELECT as_of FROM metadata)
                         GROUP BY id, product ORDER BY maturity""", (c["id"],))
    rfqs = book.rows("""SELECT id, created, status, basket, tenor_months, coupon_pct, ki_pct FROM rfqs
                        WHERE client=? ORDER BY created DESC LIMIT 5""", (c["id"],))
    rolls = book.rows("""SELECT maturity, status, notional FROM rollovers WHERE client=? ORDER BY maturity DESC LIMIT 6""",
                      (c["id"],))
    outstanding = sum(d["notional_usd"] or 0 for d in deals)
    maturing = [d for d in deals if book.today() <= d["maturity"] <= end]
    profile = {
        "client_id": c["id"], "name": c["name"], "cif": c["cif_masked"], "segment": c["segment"],
        "branch": c["branch"], "rm": c["rm_name"], "risk_profile": c["risk_profile"], "channel": c["channel"],
        "last_trade_date": c["last_trade_date"], "outstanding_usd": outstanding, "deals": len(deals),
        "maturing_in_10_business_days_usd": sum(d["notional_usd"] or 0 for d in maturing),
    }
    return ToolResult(title=f"Client profile: {c['name']}", columns=[
        Column("id", "Deal"), Column("basket", "Basket"), Column("notional_usd", "Notional", "money"),
        Column("coupon_pct", "Coupon", "pct"), Column("maturity", "Maturity", "date"),
        Column("settlement", "Settlement")], rows=deals, totals=profile,
        notes=[f"Recent RFQs: {json.dumps(rfqs, default=str)}", f"Past maturities and rollovers: {json.dumps(rolls)}",
               "last_vs_ko_pct is the underlying's distance to its knock-out barrier (negative = below)."], **base)


def t_maturing_clients(args: dict, persona: str) -> ToolResult:
    days = _int_arg(args, "business_days", 10, 1, 30)
    branch = _str_arg(args, "branch")
    end = book.window_end(days)
    sql = """SELECT p.id AS deal, p.client AS client_id, c.name, c.rm_name AS rm, p.branch,
                    group_concat(p.underlying, '/') AS basket, sum(p.notional) AS notional_usd, max(p.maturity) AS maturity,
                    max(p.settlement) AS settlement, max(p.shares_deliverable) AS shares_deliverable,
                    coalesce(max(r.status), 'not eligible') AS rollover_status
             FROM positions p JOIN customers c ON c.id = p.client
             LEFT JOIN rollovers r ON r.position_id = p.id AND r.eligible = 1
             WHERE p.snapshot = (SELECT as_of FROM metadata) AND p.maturity >= ? AND p.maturity <= ?"""
    params: tuple = (book.today(), end)
    if branch:
        sql += " AND lower(p.branch) = ?"
        params += (branch.lower(),)
    sql += " GROUP BY p.id ORDER BY p.maturity, notional_usd DESC"
    rows = book.rows(sql, params)
    for r in rows:
        r["rollover_status"] = r["rollover_status"].replace("_", " ")
    return ToolResult(tool="maturing_deals", title=f"Deals maturing in the next {days} business days (to {end})",
                      source="Book query: positions, customers, rollovers", source_kind="book", as_of=book.as_of(),
                      columns=[Column("maturity", "Maturity", "date"), Column("name", "Client"), Column("rm", "RM"),
                               Column("basket", "Basket"), Column("notional_usd", "Notional", "money"),
                               Column("settlement", "Settlement"), Column("rollover_status", "Rollover")],
                      rows=rows, totals={"deals": len(rows), "notional_usd": sum(r["notional_usd"] or 0 for r in rows),
                                         "not_contacted": sum(1 for r in rows if r["rollover_status"] == "not contacted"),
                                         "not_contacted_notional_usd": sum(r["notional_usd"] or 0 for r in rows
                                                                           if r["rollover_status"] == "not contacted"),
                                         "clients": len({r["client_id"] for r in rows})},
                      total_rows=len(rows))


def t_knockout_watch(args: dict, persona: str) -> ToolResult:
    within = float(args.get("within_pct", 5) or 5)
    rows = book.rows("""SELECT p.id AS deal, c.name, c.rm_name AS rm, p.underlying, p.last_vs_ko_pct,
                               p.next_ko_observation, sum(p.notional) AS notional_usd
                        FROM positions p JOIN customers c ON c.id = p.client
                        WHERE p.snapshot=(SELECT as_of FROM metadata) AND p.last_vs_ko_pct IS NOT NULL
                          AND abs(p.last_vs_ko_pct) <= ?
                        GROUP BY p.id, p.underlying ORDER BY abs(p.last_vs_ko_pct)""", (within,))
    return ToolResult(tool="knockout_watch", title=f"Deals within {within:g}% of the knock-out barrier",
                      source="Book query: positions.last_vs_ko_pct", source_kind="book", as_of=book.as_of(),
                      columns=[Column("name", "Client"), Column("underlying", "Underlying"),
                               Column("last_vs_ko_pct", "Vs KO barrier", "pct"),
                               Column("next_ko_observation", "Next KO observation", "date"),
                               Column("notional_usd", "Notional", "money"), Column("rm", "RM")],
                      rows=rows, notes=["Distances are from the last close in the overnight load, not live prices."])


def t_unmet_demand(args: dict, persona: str) -> ToolResult:
    month = book.as_of()[:7]
    rows = book.rows("""SELECT underlying, channel, count(*) AS quotes,
                               sum(CASE WHEN status='won' THEN 1 ELSE 0 END) AS traded,
                               sum(CASE WHEN status='lost' THEN 1 ELSE 0 END) AS not_traded
                        FROM rfqs WHERE substr(created,1,7)=? GROUP BY underlying, channel
                        ORDER BY quotes DESC, underlying LIMIT 20""", (month,))
    return ToolResult(tool="unmet_demand", title=f"RFQs this month ({month}) by underlying and channel",
                      source="Book query: rfqs", source_kind="book", as_of=book.as_of(),
                      columns=[Column("underlying", "Underlying"), Column("channel", "Channel"),
                               Column("quotes", "Quotes", "number"), Column("traded", "Traded", "number"),
                               Column("not_traded", "Not traded", "number")], rows=rows)


def t_ideas(args: dict, persona: str) -> ToolResult:
    u = _str_arg(args, "underlying").upper()
    sql = "SELECT * FROM idea_warehouse"
    params: tuple = ()
    if u:
        sql += " WHERE upper(basket) LIKE ?"
        params = (f"%{u}%",)
    rows = book.rows(sql + " ORDER BY rfqs_5d DESC, coupon_pct DESC", params)
    return ToolResult(tool="idea_warehouse", title="Idea warehouse" + (f" for {u}" if u else ""),
                      source="Book query: idea_warehouse", source_kind="book", as_of=book.as_of(),
                      columns=[Column("basket", "Basket"), Column("tenor_months", "Tenor (m)", "number"),
                               Column("coupon_pct", "Indicative coupon", "pct"), Column("ki_pct", "KI", "pct"),
                               Column("strike_pct", "Strike", "pct"), Column("rfqs_5d", "RFQs 5d", "number"),
                               Column("fill_rate_pct", "Fill rate", "pct")], rows=rows,
                      notes=["Coupons are indicative from the morning pricing load, not executable quotes."])


# ---------------------------------------------------------------- registry

def _obj(props: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "object", "properties": props or {}}


TOOLS: list[Tool] = [
    Tool("book_concentration", "Exposure by underlying across the whole ELI book (HK_ELI skill eli.risk.concentration): "
         "notional, share of book, limit, clients, and how much matures soon. Use for concentration, limits, top underlyings.",
         _obj({"days": {"type": "integer", "description": "Window in calendar days for the maturing column", "minimum": 1, "maximum": 366}}),
         t_concentration, "Checking book concentration"),
    Tool("maturing_deals", "List of individual deals maturing in the next N business days with client name, RM, basket, "
         "notional, settlement and whether the rollover has been discussed. Use for 'what matures', 'who should I call', rollovers by client.",
         _obj({"business_days": {"type": "integer", "minimum": 1, "maximum": 30},
               "branch": {"type": "string", "description": "Optional branch name, e.g. Central"}}),
         t_maturing_clients, "Listing maturing deals"),
    Tool("maturity_calendar", "Maturities grouped by date for the next N calendar days (HK_ELI skill eli.maturity.analyze).",
         _obj({"days": {"type": "integer", "minimum": 1, "maximum": 120}}), t_maturities, "Building the maturity calendar"),
    Tool("rollover_pipeline", "Eligible rollover opportunities by contact status for upcoming maturities (HK_ELI skill eli.rollover.opportunity).",
         _obj({"days": {"type": "integer", "minimum": 1, "maximum": 120}}), t_rollovers, "Reading the rollover pipeline"),
    Tool("client_profile", "One client's profile: segment, RM, risk profile, outstanding deals, maturing amount, recent RFQs and past rollovers. "
         "Takes a name, part of a name, or client id like c-4821.",
         {"type": "object", "properties": {"query": {"type": "string", "description": "Client name or id"}}, "required": ["query"]},
         t_find_client, "Looking up the client"),
    Tool("top_clients", "Largest clients by ELI outstanding with RM and branch (HK_ELI skill eli.client.intelligence).",
         _obj({"limit": {"type": "integer", "minimum": 1, "maximum": 25}}), t_top_clients, "Ranking clients"),
    Tool("knockout_watch", "Deals whose underlying is close to its knock-out barrier at the last close.",
         _obj({"within_pct": {"type": "number", "description": "Distance threshold in percent, default 5", "minimum": 0.1, "maximum": 50}}),
         t_knockout_watch, "Checking knock-out distances"),
    Tool("sales_by_branch", "Total ELI traded notional by branch (HK_ELI skill eli.sales.performance).", _obj(),
         t_sales_by_branch, "Totalling sales by branch"),
    Tool("sales_trend", "Monthly ELI traded notional over time (HK_ELI skill eli.sales.trend).",
         _obj({"months": {"type": "integer", "minimum": 1, "maximum": 36}}), t_sales_trend, "Building the sales trend"),
    Tool("regional_performance", "Sales by branch and district (HK_ELI skill eli.regional.performance).", _obj(),
         t_regional, "Reading regional performance"),
    Tool("branch_exposure", "Exposure by branch and underlying (HK_ELI skill eli.branch.concentration).",
         _obj({"branch": {"type": "string", "description": "Optional branch name"}}), t_branch_exposure, "Reading branch exposure"),
    Tool("rfq_conversion", "How many RFQs were quoted and how many traded (HK_ELI skill eli.rfq.conversion).", _obj(),
         t_rfq_conversion, "Checking RFQ conversion"),
    Tool("unmet_demand", "This month's RFQs by underlying and channel, traded vs not traded. Use for client demand and what is being asked for.",
         _obj(), t_unmet_demand, "Reading this month's RFQs"),
    Tool("product_coupons", "Coupon range and notional-weighted coupon by product (HK_ELI skill eli.product.yield).", _obj(),
         t_product_coupons, "Reading coupons by product"),
    Tool("idea_warehouse", "Pre-built ELI ideas with indicative coupon, KI, strike, recent RFQs and fill rate. Optional underlying filter.",
         _obj({"underlying": {"type": "string", "description": "Ticker, e.g. NVDA"}}), t_ideas, "Searching the idea warehouse"),
    Tool("digital_journey", "digibank journey funnel: events and clients by stage (HK_ELI skill eli.digibank.journey).", _obj(),
         t_digital, "Reading the digibank journey"),
    Tool("client_engagement", "Engagement events (trades, RFQs) and distinct clients (HK_ELI skill eli.client.engagement).", _obj(),
         t_engagement, "Reading engagement"),
]

BY_NAME: dict[str, Tool] = {t.name: t for t in TOOLS}


def run(name: str, args: dict[str, Any] | None, persona: str = "") -> ToolResult:
    """Run one tool by name. Never raises: a failure comes back as a ToolResult with `error`."""
    tool = BY_NAME.get(name)
    if tool is None:
        return ToolResult(tool=name, title=name, source="", source_kind="", as_of="", columns=[], rows=[],
                          error=f"No tool called {name}.")
    try:
        return tool.handler(dict(args or {}), persona)
    except skills.SkillsUnavailable as exc:
        return ToolResult(tool=name, title=tool.label, source="", source_kind="skill", as_of="", columns=[], rows=[],
                          error=str(exc))
    except Exception as exc:  # noqa: BLE001 - reported to the model and the UI, never swallowed
        return ToolResult(tool=name, title=tool.label, source="", source_kind="", as_of="", columns=[], rows=[],
                          error=f"{type(exc).__name__}: {exc}")
