"""Steps 3-6: registry, routing, plan building and the filter-spec compiler.

Code, not the model, picks the view and the filter values (rediscovery 06 PL
11.4). One plan compiles to both the REST vf_ query and the embed filters
(04 RQ 11.4), so the numbers and the picture show the same scope.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from .understand import Intent

FLAGS = (7, 14, 30, 60, 90)

# Intent -> record ids to try, in order (view-routing.md matrix, simplified).
ROUTES = {
    "outstanding_total": ["outstanding-total-all"],
    "segment_share": ["outstanding-segment"],
    "segment_result_share": ["outstanding-segment-result"],
    # View 4's own id. In today's catalog it shares "outstanding-segment" with view 2.
    "customer_count": ["outstanding-segment-customers", "outstanding-segment"],
    "maturity_calendar": ["maturity-calendar-n30-tre"],
    "maturity_branch": ["maturity-branch-n30-tre"],
    "maturity_detail": ["maturity-details-n30-tre"],
    "district": ["outstanding-district-wps-n30-all"],
    "mtm_distribution": ["outstanding-distribution-wps-n30-all"],
    "data_recency": ["max-trade-date"],
    "data_as_of": ["data-as-of"],
}
# Topic bundles: every published view about the question's topic, primary first. Each one gets the same
# filter spec compiled for it (a filter it doesn't publish is shown as "can't apply", never dropped silently).
TOPICS = {
    "outstanding": ["outstanding-total-all", "outstanding-segment", "outstanding-segment-result",
                    "outstanding-segment-customers"],
    "maturity": ["maturity-calendar-n30-tre", "maturity-branch-n30-tre", "maturity-details-n30-tre"],
    "district": ["outstanding-district-wps-n30-all", "maturity-branch-n30-tre"],
    "wps": ["outstanding-wps-n30-all", "outstanding-wps-n30-tre", "outstanding-distribution-wps-n30-all"],
    "scenario": ["position-scenario-all", "outstanding-wps-n30-all", "outstanding-distribution-wps-n30-all"],
    "data": ["data-as-of", "max-trade-date"],
}
INTENT_TOPIC = {
    "outstanding_total": "outstanding", "segment_share": "outstanding", "segment_result_share": "outstanding",
    "customer_count": "outstanding", "maturity_calendar": "maturity", "maturity_branch": "maturity",
    "maturity_detail": "maturity", "customer_count_maturity": "maturity", "district": "district",
    "wps_exposure": "wps", "mtm_distribution": "wps", "scenario_analysis": "scenario",
    "data_as_of": "data", "data_recency": "data",
}

REQUIRED_MEASURE = {"customer_count": "countd", "customer_count_maturity": "countd_excl"}
TRE_ONLY = {"maturity_calendar", "maturity_branch", "maturity_detail", "customer_count_maturity"}


@dataclass
class Registry:
    views: dict
    collisions: list = field(default_factory=list)

    @classmethod
    def load(cls, view_list: list[dict]) -> "Registry":
        views, collisions = {}, []
        for v in view_list:
            rid = v["record_id"]
            if rid in views:
                collisions.append({"record_id": rid, "kept": views[rid]["view_name"], "dropped": v["view_name"]})
                continue  # first one wins; the second view becomes unreachable
            views[rid] = v
        return cls(views, collisions)

    def has(self, rid):
        return rid in self.views


@dataclass
class Plan:
    status: str = "OK"            # OK or a terminal status decided before any fetch
    reasons: list = field(default_factory=list)
    caveats: list = field(default_factory=list)
    view: dict | None = None
    vf: dict = field(default_factory=dict)
    embed_filters: dict = field(default_factory=dict)
    embed_ignored: list = field(default_factory=list)
    embed_highlight: list = field(default_factory=list)
    embed_highlight_field: str | None = None
    asserted: list = field(default_factory=list)   # population facts proven by the catalog
    anchor: str | None = None
    anchor_known: bool = False
    window_note: str | None = None


def _caveat(plan, code, text, level="warning"):
    plan.caveats.append({"code": code, "text": text, "level": level})


def route(intent: Intent, reg: Registry, plan: Plan) -> None:
    it = intent.intent
    if it in TRE_ONLY and any(s != "Treasures(HK)" for s in intent.segments):
        plan.status = "UNSUPPORTED"
        plan.reasons.append("SEGMENT_NOT_SUPPORTED")
        _caveat(plan, "TRE_ONLY", "Maturity views cover Treasures (HK) only. PB and TPC maturity needs a later worksheet change.", "block")
        return
    if it == "wps_exposure":
        tre_std = intent.segments == ["Treasures(HK)"] and (intent.window_days in (None, 30) or intent.district or intent.branch)
        cands = ["outstanding-wps-n30-tre"] if tre_std else ["outstanding-wps-n30-all"]
    elif it == "customer_count_maturity":
        cands = ["maturity-branch-n30-tre"] if intent.branch else ["outstanding-district-wps-n30-all"]
    else:
        cands = ROUTES.get(it, [])
    for rid in cands:
        if reg.has(rid):
            plan.view = reg.views[rid]
            break
    if not plan.view:
        plan.status = "UNSUPPORTED"
        plan.reasons.append("NO_ELIGIBLE_VIEW")
        return
    need = REQUIRED_MEASURE.get(it)
    if need and need not in plan.view["measures"]:
        plan.status = "UNSUPPORTED"
        hit = [c for c in reg.collisions if c["record_id"] == plan.view["record_id"]]
        if hit:
            plan.reasons.append("REGISTRY_COLLISION")
            _caveat(plan, "REGISTRY_COLLISION",
                    f"Record id '{hit[0]['record_id']}' is used by two views. The registry kept "
                    f"{hit[0]['kept']} and could not reach {hit[0]['dropped']}, which holds the customer counts.", "block")
        else:
            plan.reasons.append("MEASURE_NOT_PUBLISHED")
            _caveat(plan, "MEASURE_NOT_PUBLISHED",
                    "No published view gives distinct customers at this grain. Counting rows or adding up "
                    "customer counts would overcount, because one customer can hold several positions.", "block")


def _window(intent: Intent, plan: Plan, anchor: date, anchor_known: bool) -> None:
    v = plan.view
    n = intent.window_days
    if intent.on_date:
        if "predict_maturity" in v["filters"] or v["record_id"].startswith("maturity"):
            plan.vf["predict_maturity"] = [intent.on_date]
        return
    if not n:
        return
    if "days_to_pred_maturity" in v["filters"]:
        if n in FLAGS:
            plan.vf[f"in_n{n}"] = ["TRUE"]
        else:
            plan.vf["days_to_pred_maturity"] = [str(i) for i in range(1, n + 1)]
        plan.window_note = f"next {n} days from business date {anchor.isoformat()} (W1 field)"
        return
    built = v.get("builtin_window_days")
    if built and n > built:
        plan.status = "UNSUPPORTED"
        plan.reasons.append("INVALID_TIME_SCOPE")
        _caveat(plan, "WINDOW_NOT_SUPPORTED",
                f"This view has a fixed next-{built}-days window built into the sheet, and the data export "
                f"cannot widen it. A next-{n}-days answer is not possible today.", "block")
        return
    if built and n == built:
        plan.window_note = f"next {built} days, fixed in the sheet"
        plan.asserted.append(f"predict_maturity window = next {built} days (built into the sheet)")
        return
    # Workaround: vf_ is exact match only, so list every date in the window.
    dates = [(anchor + timedelta(days=i)).isoformat() for i in range(1, n + 1)]
    plan.vf["predict_maturity"] = dates
    plan.window_note = f"next {n} days as a list of {n} dates from {anchor.isoformat()}"
    _caveat(plan, "DATE_LIST_WORKAROUND",
            f"'Next {n} days' was sent as a list of {n} exact dates, because the export cannot filter a date range. "
            "This is fragile and unverified on the real server." +
            ("" if anchor_known else f" The window starts from today's date ({anchor.isoformat()}) because the workbook "
             "does not publish its data date, so it may not line up with the sheet's own window."))


def build(intent: Intent, reg: Registry, anchor: date, anchor_known: bool, force_view: dict | None = None) -> Plan:
    """force_view: compile the same question for a companion view of the topic bundle (no routing)."""
    plan = Plan()
    if force_view:
        if intent.intent in TRE_ONLY and any(s != "Treasures(HK)" for s in intent.segments) and force_view.get("tre_lock"):
            plan.status = "UNSUPPORTED"
            plan.reasons.append("SEGMENT_NOT_SUPPORTED")
            return plan
        plan.view = force_view
    else:
        route(intent, reg, plan)
    if plan.status != "OK":
        return plan
    v = plan.view
    plan.anchor = anchor.isoformat()
    plan.anchor_known = anchor_known

    # Population: outstanding means LIVE (SV-2). Send it, or prove it from the catalog.
    if v["record_id"] not in ("max-trade-date", "data-as-of"):
        if "deal_status" in v["filters"]:
            plan.vf["deal_status"] = ["LIVE"]
            plan.asserted.append("deal_status = LIVE (sent as a filter)")
        elif v["population"].startswith("LIVE"):
            plan.asserted.append(f"deal_status = LIVE ({v['population']})")
        else:
            _caveat(plan, "POPULATION_UNDECLARED",
                    "This view has no deal status filter and does not declare LIVE only, so these figures may "
                    "include matured deals.")
    if v.get("hidden_rule"):
        if v["hidden_rule"].startswith("excludes"):
            plan.asserted.append(f"published rule: {v['hidden_rule']}")
        else:
            _caveat(plan, "HIDDEN_RULE", "This view applies a segment-exclusion filter whose logic is not published, "
                    "so the bot cannot say which deals are left out.")

    segs = intent.segments
    if segs and not v["tre_lock"] and intent.intent not in ("segment_share", "segment_result_share"):
        plan.vf["bp_div_type"] = list(segs)
    if v["tre_lock"]:
        plan.asserted.append("bp_div_type = Treasures(HK) (fixed in the sheet)")
    if intent.district and intent.intent != "district":
        plan.vf["cust_district"] = [intent.district]
    if intent.district and intent.intent == "district":
        plan.embed_highlight, plan.embed_highlight_field = [intent.district], "cust_district"
    if intent.branch:
        plan.vf["cust_branch"] = [intent.branch]
    if intent.wps and (intent.intent in ("maturity_detail", "mtm_distribution") or
                       (force_view and "wps" in v["filters"] and intent.intent == "wps_exposure")):
        plan.vf["wps"] = [intent.wps]
    sh = intent.shock or {}
    if intent.intent == "scenario_analysis" and sh.get("ticker"):
        if "in_shock_basket" in v["filters"]:
            plan.vf["in_shock_basket"] = ["TRUE"]
        elif "wps" in v["filters"] and v["kind"] == "bubble":
            plan.vf["wps"] = [sh["ticker"]]
            plan.caveats.append({"code": "WPS_ONLY", "level": "info",
                                 "text": f"This view filters by worst-performing stock, so it shows ELI where {sh['ticker']} "
                                         "is the worst performer today, not every ELI that holds it."})

    if intent.result and intent.intent in ("customer_count", "maturity_detail", "district"):
        plan.vf["predict_result"] = [intent.result]

    _window(intent, plan, anchor, anchor_known)
    if plan.status != "OK":
        return plan

    # Compile the embed side from the same spec.
    for f, vals in plan.vf.items():
        if f == "deal_status" and f not in v["filters"]:
            continue
        if f in v["filters"]:
            plan.embed_filters[f] = vals
        elif f in v["dimensions"] and v["kind"] != "table":
            # Not a filter, but a dimension on the chart: highlight the marks instead (05 VI A2).
            plan.embed_highlight = list(dict.fromkeys(plan.embed_highlight + vals))
            plan.embed_highlight_field = f
        else:
            plan.embed_ignored.append(f)
    return plan


def bundle(intent: Intent, reg: Registry, primary: Plan, anchor: date, anchor_known: bool) -> list[tuple[dict, Plan]]:
    """The topic's views with the question compiled for each: [(view, plan)], primary first.

    A view that can't take the question (a fixed window too short, TRE-only for a PB question) comes back with
    its plan's status set, so the screen can say why it is not shown instead of showing a wrong scope.
    """
    topic = INTENT_TOPIC.get(intent.intent)
    out: list[tuple[dict, Plan]] = []
    if primary.view is not None:
        out.append((primary.view, primary))
    seen = {primary.view["record_id"]} if primary.view else set()
    for rid in TOPICS.get(topic, []):
        if rid in seen or not reg.has(rid):
            continue
        v = reg.views[rid]
        # TRE and all-segment variants of the same sheet: keep the one that fits the question's segments
        if rid == "outstanding-wps-n30-tre" and "outstanding-wps-n30-all" in seen:
            continue
        if rid == "outstanding-wps-n30-all" and "outstanding-wps-n30-tre" in seen:
            continue
        seen.add(rid)
        out.append((v, build(intent, reg, anchor, anchor_known, force_view=v)))
    return out


def vf_query(plan: Plan) -> str:
    from urllib.parse import quote
    return "&".join(f"vf_{k}={quote(','.join(v), safe=',()')}" for k, v in plan.vf.items())
