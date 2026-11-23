"""The thin Stork pipeline: question in, validated answer object out.

Steps (rediscovery 06 PL 11.3, trimmed for the POC):
  1 pre-parse  2 understand  3 data as-of  4 route  5 plan + validate plan
  6 compile filter spec (vf_ and embed)  7 fetch (Query View Data)
  8 validate result  9 write answer (template insight)  10 compose (embed, follow-ups)

Code decides the view, filters and numbers. The text only uses numbers that
came back from Tableau. Status names follow 05 VI 11.1.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict
from datetime import date
from urllib.parse import quote

from ..svg import money
from ..workbook import CAPTION
from . import plan as P
from . import scenario as SC
from .tableau_client import TableauClient, TableauError
from . import agent
from .. import config, knowledge as KB, prompts as PR
from ..llm import OffClient

SEVERITY = ["SYSTEM_ERROR", "VALIDATION_FAILED", "UNSUPPORTED", "NEEDS_CLARIFICATION", "NO_DATA",
            "PARTIAL", "OK_FALLBACK", "OK_WITH_WARNING", "OK"]


def demo_today() -> date:
    """Business 'today': DEMO_TODAY when set (mock default 2026-11-19), else the clock in APP_TIMEZONE."""
    return config.get().today()


def pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def short(seg: str) -> str:
    return {"Treasures(HK)": "TRE", "Treasures(TPC)": "TPC"}.get(seg, seg)


class Trace:
    def __init__(self, on_step=None):
        self.steps, self._t, self.on_step = [], time.perf_counter(), on_step

    def add(self, name, detail):
        now = time.perf_counter()
        step = {"n": len(self.steps) + 1, "name": name, "detail": detail, "ms": round((now - self._t) * 1000, 1)}
        self.steps.append(step)
        self._t = now
        if self.on_step:
            try:
                self.on_step({"n": step["n"], "name": name, "ms": step["ms"]})   # stage only, no detail
            except Exception:  # a slow or closed listener never breaks the answer
                pass


def _idx(cols, name):
    return cols.index(name) if name in cols else None


def answer(question: str, http, site: str, scenario: str | None = None, user: str = "demo.user",
           llm=None, lib: dict | None = None, kb: KB.Knowledge | None = None, on_step=None) -> dict:
    cfg = config.get()
    today = demo_today()
    llm = llm or OffClient()
    kb = kb or KB.load(str(cfg.knowledge_dir))
    lib = lib or PR.library(str(cfg.prompts_dir))
    calls: list = []
    tr = Trace(on_step)
    client = TableauClient(http, site, user=user, scenario=scenario)
    out = {"question": question, "site": site, "scenario": scenario, "status": "OK", "reasons": [],
           "caveats": [], "headline": "", "bullets": [], "table": None, "chart": None, "numbers": [],
           "evidence": [], "embed": None, "followups": [], "as_of": None, "scope": "", "trace": tr.steps,
           "meta": {"understanding": "rules", "insight": "template", "model": getattr(llm, "model", "off"),
                    "provider": getattr(llm, "provider", "none"),
                    "knowledge_sha256": kb.sha256[:12],
                    "concept_matcher": cfg.concept_matcher,
                    "prompts": {k: f"{p.version}+{p.sha256[:12]}" for k, p in lib.items()}},
           "_llm_calls": calls}

    # 1-2 understand (rules pre-parse, then the model when it is on; code validates and merges)
    it = agent.interpret(question, today, llm, lib, kb, calls)
    out["meta"]["understanding"] = it.source
    out["intent"] = it.intent
    tr.add("Pre-parse", {k: v for k, v in it.hints.items() if v and k not in ("concepts", "gaps", "clarify", "text", "corrections")})
    if cfg.concept_matcher:
        out["concepts"] = [{"concept": c["concept"], "label": c.get("label") or c["concept"],
                            "value": c.get("short") or c.get("value"), "gap": bool(c.get("gap"))}
                           for c in it.concepts if not c["concept"].startswith("metric:") and not c.get("flag")]
        if it.shock:
            # in a what-if the stock is the one being moved, not a worst-performer filter
            shock_label = "Market move" if it.shock["kind"] == "market" else "Stock moved"
            shock_value = (f"spot {round((1 + it.shock['move']) * 100)}%" if it.shock["kind"] == "market" and it.shock["move"] is not None
                           else it.shock["ticker"])
            out["concepts"] = [c for c in out["concepts"] if c["concept"] not in ("wps", "market_spot")]
            if shock_value:
                out["concepts"].insert(0, {"concept": "shock", "label": shock_label, "value": shock_value, "gap": False})
        tr.add("Concepts", {"found": [c["concept"] + (f"={c['value']}" if c["value"] else "") for c in it.concepts
                                      if not c.get("gap")],
                            "not_in_views": [c["concept"] for c in it.concepts if c.get("gap")],
                            "clarify": it.clarify})
    tr.add("Understand", {"intent": it.intent, "grain": it.grain, "assumptions": it.assumptions, "by": it.source})
    out["scope"] = it.scope_line()
    out["assumptions"] = [a for a in it.assumptions if not a.startswith("clarify: ")]
    if it.unsupported:
        u = it.unsupported[0]
        out.update(status="UNSUPPORTED", reasons=["CONCEPT_NOT_SUPPORTED"],
                   headline=(u['user_text'] if u.get('rule') == 'refuse' else f"I can't answer that yet. {u['user_text']}").strip())
        out["caveats"].append({"code": "CONCEPT_NOT_SUPPORTED", "level": "block", "text": u["user_text"]})
        out["scope"] = ""   # the parsed scope would mislead here (e.g. a basket stock shown as WPS)
        out["followups"] = ["What is total outstanding ELI?", "How much TRE ELI is predicted to mature in the next 30 days?"]
        tr.add("Route", {"view": None, "reason": f"unsupported concept {u['id']}"})
        return out
    out["slots"] = {"segments": it.segments, "district": it.district, "branch": it.branch, "wps": it.wps,
                    "result": it.result, "window_days": it.window_days, "on_date": it.on_date}
    out["meta"]["confidence"] = it.confidence
    if it.clarify and it.clarify["code"] == "INTENT_UNSURE":
        opts = it.clarify["options"]
        out.update(status="NEEDS_CLARIFICATION", reasons=["INTENT_UNSURE"],
                   headline=f"I can read that {'two' if len(opts) == 2 else 'a few'} ways, so I haven't run a query yet. "
                            "Pick the answer you want.")
        out["followups"] = [o["question"] for o in opts]
        out["clarify"] = {"code": "INTENT_UNSURE", "concept": "intent", "label": "reading", "text": "",
                          "options": [{"label": o["label"], "question": o["question"], "intent": o["intent"]} for o in opts]}
        tr.add("Route", {"view": None, "reason": "reading unsure: " + ", ".join(o["intent"] for o in opts)})
        return out
    if it.clarify:
        c = it.clarify
        opts = c.get("options") or []
        label = {"cust_district": "district", "cust_branch": "branch"}.get(c["concept"], "value")
        shown = [o.replace("TRE-", "") for o in opts]
        if c["code"] == "VALUE_AMBIGUOUS":
            head = f"'{c['text'].title()}' fits more than one {label}: {', '.join(shown)}. Which one do you mean?"
        else:
            head = (f"I can't find a {label} called {c['text'].upper() if label == 'district' else c['text']}. "
                    f"The {label}s I know are {', '.join(shown)}. Which one do you mean?")
        out.update(status="NEEDS_CLARIFICATION", reasons=[c["code"]], headline=head)
        out["followups"] = [_swap(question, c["text"], o) for o in shown[:3]]
        out["clarify"] = {"code": c["code"], "concept": c["concept"], "label": label, "text": c["text"],
                          "options": [{"label": o, "question": _swap(question, c["text"], o)} for o in shown[:6]]}
        tr.add("Route", {"view": None, "reason": f"{c['code'].lower()} {label}"})
        return out
    if it.intent == "unknown":
        clar = next((a[len("clarify: "):] for a in it.assumptions if a.startswith("clarify: ") and len(a) > 10), None)
        out.update(status="NEEDS_CLARIFICATION", reasons=["AMBIGUOUS_INTENT"],
                   headline="I can answer questions about outstanding ELI, shares by segment, predicted maturity "
                            "(TRE), clients to follow up, WPS exposure, MTM distribution and data freshness. "
                            "Could you rephrase with one of those?")
        if clar:
            out["headline"] = clar
        out["followups"] = ["What is total outstanding ELI?", "Which branches in D1 have the largest TRE maturity in the next 30 days?"]
        return out

    try:
        reg = P.Registry.load(client.views())
    except TableauError as e:
        out.update(status="SYSTEM_ERROR", reasons=[e.code], headline="Tableau is not reachable right now, so I can't answer from data. Please try again shortly.")
        return out
    if reg.collisions:
        out["registry_collisions"] = reg.collisions

    # 3 data as-of (W2)
    anchor, anchor_known = today, False
    if reg.has("data-as-of"):
        asof_view = reg.views["data-as-of"]
        d = client.view_data(asof_view["luid"], "")
        bd = date.fromisoformat(d["rows"][0][0])
        anchor, anchor_known = bd, True
        out["as_of"] = {"business_date": d["rows"][0][0], "last_refresh": d["rows"][0][1], "known": True}
        age = (today - bd).days
        if age > 1:
            out["caveats"].append({"code": "STALE_DATA", "level": "warning",
                                   "text": f"Data is as of {bd:%d %b} and the last refresh was {d['rows'][0][1].replace('T', ' ')}. "
                                           f"It is {age} days old, so the overnight refresh may have failed."})
        tr.add("Data as-of", {"business_date": d["rows"][0][0], "last_refresh": d["rows"][0][1], "age_days": age})
    else:
        out["as_of"] = {"business_date": None, "known": False}
        out["caveats"].append({"code": "AS_OF_UNKNOWN", "level": "info",
                               "text": "Data date unknown: the workbook does not publish its business date or refresh time."})
        tr.add("Data as-of", {"available": False, "anchor": f"today's date {today.isoformat()} (guess)"})

    if it.intent == "data_as_of" and not reg.has("data-as-of"):
        mt = reg.views.get("max-trade-date")
        d = client.view_data(mt["luid"], "") if mt else None
        out.update(status="UNSUPPORTED", reasons=["NO_ELIGIBLE_VIEW"])
        out["headline"] = ("I can't tell how fresh the data is. The workbook does not publish its business date or refresh time."
                           + (f" The latest trade date is {d['rows'][0][0]}, but that is not the data date." if d else ""))
        tr.add("Route", {"view": None, "reason": "no data-as-of view"})
        return out

    if it.intent == "scenario_analysis":
        return _scenario(it, reg, client, out, tr, site, scenario, anchor, anchor_known)

    # 4-6 route, plan, compile
    pl = P.build(it, reg, anchor, anchor_known)
    tr.add("Route", {"view": pl.view["view_name"] if pl.view else None, "record_id": pl.view["record_id"] if pl.view else None})
    out["caveats"] += pl.caveats
    if pl.status != "OK":
        out["status"], out["reasons"] = pl.status, pl.reasons
        out["headline"] = _blocked_text(it, pl)
        tr.add("Plan check", {"status": pl.status, "reasons": pl.reasons})
        return _finish(out)
    vfq = P.vf_query(pl)
    tr.add("Plan check", {"asserted": pl.asserted, "window": pl.window_note, "status": "pass"})
    tr.add("Compile", {"vf": {k: (v if len(v) <= 4 else f"{len(v)} values") for k, v in pl.vf.items()},
                       "embed_filters": list(pl.embed_filters), "embed_cannot_apply": pl.embed_ignored})

    # 7 fetch
    try:
        d = client.view_data(pl.view["luid"], vfq)
    except TableauError as e:
        out.update(status="SYSTEM_ERROR", reasons=[e.code], headline="The Tableau query failed, so I have no figures to show.")
        return _finish(out)
    cols, rows = d["columns"], d["rows"]
    out["evidence"].append({"step": 1, "view": pl.view["view_name"], "record_id": pl.view["record_id"],
                            "luid": pl.view["luid"], "content_url": pl.view.get("content_url"),
                            "request": d["url"], "row_count": len(rows),
                            "columns": cols, "asserted": pl.asserted, "window": pl.window_note})
    tr.add("Fetch", {"rows": len(rows), "bytes": d["bytes"], "ms": d["ms"]})

    # 8 validate
    checks = _validate(it, pl, cols, rows, out)
    if it.intent == "district" and out["status"] == "OK":
        checks.append(_control_total(it, pl, rows, cols, client, reg, out))
    tr.add("Validate", {"checks": checks})

    # 9-10 write and compose
    if out["status"] in ("OK",):
        _write(it, pl, cols, rows, out)
        out["chart"] = _chart(it, pl, cols, rows)
    if out["status"] in ("OK",):
        _finish(out)
        out["meta"]["insight"] = agent.word(out, llm, lib, kb, calls)
    tr.add("Write answer", {"mode": out["meta"]["insight"], "numbers": len(out["numbers"])})
    if pl.view and out["status"] not in ("UNSUPPORTED", "VALIDATION_FAILED", "SYSTEM_ERROR"):
        out["embeds"] = _embeds(site, it, reg, pl, anchor, anchor_known, scenario)
        out["embed"] = out["embeds"][0]
    tr.add("Compose", {"embed": bool(out["embed"]), "views": len(out.get("embeds") or []),
                       "followups": len(out["followups"])})
    return _finish(out)


def _swap(question: str, text: str, option: str) -> str:
    """The user's question with the unclear value replaced by one real option (a follow-up chip)."""
    import re as _re
    q, n = _re.subn(_re.escape(text), option, question, count=1, flags=_re.I)
    return q if n else f"{question.rstrip('?')} in {option}?"


RESULT_ORDER = ["KO", "EXP", "EXP(Below Strike)", "EX"]


def _stacks(cols, rows, key_fn, label_fn=None):
    """Group rows into categories (key_fn) with HKD split by predicted result, largest first."""
    vi, ri = cols.index("Volume Bu"), _idx(cols, "Predict Result")
    cats: dict = {}
    for r in rows:
        k = key_fn(r)
        c = cats.setdefault(k, {"key": k, "label": label_fn(r) if label_fn else k, "parts": defaultdict(float)})
        c["parts"][r[ri] if ri is not None else "All"] += float(r[vi] or 0)
    out = []
    for c in cats.values():
        parts = [{"result": res, "value": round(c["parts"][res], 2)} for res in RESULT_ORDER + ["All"] if res in c["parts"]]
        out.append({"key": c["key"], "label": c["label"], "parts": parts, "total": round(sum(p["value"] for p in parts), 2)})
    return out


def _chart(it, pl, cols, rows):
    """A chart spec for our own renderer, built from the same view rows the answer used (never from the text)."""
    if not rows:
        return None
    hl = list(pl.embed_highlight or [])
    i = {c: n for n, c in enumerate(cols)}
    if it.intent == "outstanding_total":
        return {"kind": "kpi", "label": "Outstanding ELI", "value": float(rows[0][0] or 0), "unit": "HKD"}
    if it.intent in ("data_as_of", "data_recency"):
        return None
    if it.intent in ("segment_share", "segment_result_share"):
        ri = _idx(cols, "Predict Result")
        cats = _stacks(cols, rows, lambda r: r[i["Bp Div Type"]], lambda r: short(r[i["Bp Div Type"]]))
        share = defaultdict(float)
        for r in rows:
            share[r[i["Bp Div Type"]]] += float(r[i["Share Of All Segments"]] or 0)
        for c in cats:
            c["note"] = pct(share[c["key"]])
        cats.sort(key=lambda c: -c["total"])
        return {"kind": "hbar", "title": "Outstanding ELI by segment" + (" and predicted result" if ri is not None else ""),
                "categories": cats, "highlight": hl, "stacked": ri is not None}
    if it.intent == "customer_count":
        cats = _stacks(cols, rows, lambda r: r[i["Bp Div Type"]], lambda r: short(r[i["Bp Div Type"]]))
        cats.sort(key=lambda c: -c["total"])
        return {"kind": "hbar", "title": "Outstanding ELI by segment and predicted result", "categories": cats,
                "highlight": hl, "stacked": True}
    if it.intent == "maturity_calendar":
        cats = _stacks(cols, rows, lambda r: r[i["Predict Maturity"]], lambda r: _d(r[i["Predict Maturity"]]))
        cats.sort(key=lambda c: c["key"])
        return {"kind": "columns", "title": "TRE predicted maturity by date", "categories": cats, "highlight": hl}
    if it.intent == "maturity_branch":
        cats = _stacks(cols, rows, lambda r: r[i["Cust Branch"]],
                       lambda r: f"{r[i['Cust Branch']]} · {r[i['Cust District']].replace('TRE-', '')}")
        cats.sort(key=lambda c: -c["total"])
        return {"kind": "hbar", "title": "TRE predicted maturity by branch", "categories": cats[:12], "more": max(0, len(cats) - 12),
                "highlight": hl, "stacked": True}
    if it.intent == "district":
        cats = _stacks(cols, rows, lambda r: (r[i["Bp Div Type"]], r[i["Cust District"]]),
                       lambda r: short(r[i["Bp Div Type"]]) + ("" if r[i["Cust District"]] in ("", "Null")
                                                               else " · " + r[i["Cust District"]].replace("TRE-", "")))
        cats.sort(key=lambda c: -c["total"])
        for c in cats:
            c["key"] = c["label"]
        return {"kind": "hbar", "title": "Outstanding ELI by segment and district", "categories": cats, "highlight": hl,
                "stacked": True}
    if it.intent == "wps_exposure":
        cats = _stacks(cols, rows, lambda r: r[i["Wps"]])
        cats.sort(key=lambda c: -c["total"])
        return {"kind": "hbar", "title": "Outstanding ELI by worst-performing stock", "categories": cats[:10],
                "more": max(0, len(cats) - 10), "highlight": hl or [cats[0]["key"]], "stacked": True}
    if it.intent == "mtm_distribution":
        bi, ci, ri = i["MTM% (bin)"], i["Count of Asset Id"], i["Predict Result"]
        wi = _idx(cols, "Wps")
        pts = [{"x": int(str(r[bi]).rstrip("%")), "y": int(float(r[ci])), "size": float(r[i["Volume Bu"]] or 0),
                "result": r[ri], "label": r[wi] if wi is not None else ""} for r in rows]
        return {"kind": "bubble", "title": "Deals by MTM% bin (size = HKD)", "points": pts,
                "highlight": [it.wps] if it.wps else hl, "x_label": "MTM% (bin)", "y_label": "Deal count"}
    if it.intent == "customer_count_maturity":
        key = "Cust Branch" if it.branch else "Cust District"
        ci = i["Customers (all results)"]
        seen = {}
        for r in rows:
            if r[i[key]] not in ("", "Null"):
                seen[r[i[key]]] = int(float(r[ci]))
        cats = [{"key": k, "label": k.replace("TRE-", ""), "parts": [{"result": "All", "value": n}], "total": n}
                for k, n in sorted(seen.items(), key=lambda kv: -kv[1])]
        return {"kind": "hbar", "title": "Distinct customers with predicted maturity", "categories": cats, "unit": "customers",
                "highlight": hl, "stacked": False}
    return None


def _finish(out):
    levels = {c["level"] for c in out["caveats"]}
    if out["status"] == "OK" and "warning" in levels:
        out["status"] = "OK_WITH_WARNING"
    return out


def _blocked_text(it, pl) -> str:
    blocks = [c["text"] for c in pl.caveats if c["level"] == "block"]
    return blocks[0] if blocks else "I can't answer that from the published views."


def _validate(it, pl, cols, rows, out) -> list:
    checks = []
    if not rows or (len(rows) == 1 and all(v == "" for v in rows[0])):
        out.update(status="NO_DATA", reasons=["EMPTY_RESULT"],
                   headline=f"No positions match: {it.scope_line()}. The filters were checked against the value lists, so this is a true zero.")
        checks.append("non-empty: fail -> NO_DATA")
        return checks
    checks.append("non-empty: pass")
    # Filter echo where the field is a column (04 RQ 11.3 layer 3)
    for f, vals in pl.vf.items():
        cap = CAPTION.get(f)
        i = _idx(cols, cap) if cap else None
        if i is not None:
            bad = [r for r in rows if r[i] not in vals]
            if bad:
                out.update(status="VALIDATION_FAILED", reasons=["RESULT_VALIDATION_FAILED"],
                           headline=f"The result contains rows outside the requested {cap}, so I won't use it.")
                checks.append(f"filter echo {f}: fail")
                return checks
            checks.append(f"filter echo {f}: pass")
    if it.intent in ("segment_share", "segment_result_share"):
        if "Share Of All Segments" not in cols:
            out.update(status="UNSUPPORTED", reasons=["TABLE_CALC_NOT_EXPORTED"])
            out["caveats"].append({"code": "TABLE_CALC_NOT_EXPORTED", "level": "block",
                                   "text": "The view's PERCENT_OF_TOTAL is a table calculation and the data export did not include it."})
            out["headline"] = ("I can't give the share. The view's percentage is a table calculation and it did not come "
                               "through the data export. Working it out in the bot is not allowed, because the published "
                               "calculation must be the source (SV-6).")
            checks.append("share column present: fail")
            return checks
        checks.append("share column present: pass")
    if pl.embed_ignored:
        out["caveats"].append({"code": "SCOPE_MISMATCH", "level": "warning",
                               "text": "The chart shows a wider scope than this answer: "
                                       + ", ".join(CAPTION.get(f, f) for f in pl.embed_ignored)
                                       + " is not a filter on this view, so the embedded view cannot apply it."})
        checks.append("chart scope = answer scope: fail (warning)")
    else:
        checks.append("chart scope = answer scope: pass")
    if pl.view["record_id"] not in ("max-trade-date", "data-as-of", "outstanding-total-all", "outstanding-segment"):
        out["caveats"].append({"code": "PREDICTIVE", "level": "info",
                               "text": "Predicted results and maturities are model estimates from the latest market data, not confirmed outcomes."})
    return checks


def _control_total(it, pl, rows, cols, client, reg, out) -> str:
    """District totals must reconcile with total outstanding for the same scope (04 RQ 11.3 layer 5)."""
    tv = reg.views.get("outstanding-total-all")
    if not tv or pl.window_note:
        return "control total: skipped"
    segs = [s for s in (it.segments or []) if s != "Treasures(TPC)"]
    q = "vf_deal_status=LIVE" + (f"&vf_bp_div_type={quote(','.join(segs), safe=',()')}" if segs else
                                 "&vf_bp_div_type=Treasures(HK),PB")
    d = client.view_data(tv["luid"], q)
    total = float(d["rows"][0][0] or 0)
    vi = cols.index("Volume Bu")
    got = sum(float(r[vi]) for r in rows)
    out["evidence"].append({"step": 2, "view": tv["view_name"], "record_id": tv["record_id"], "request": d["url"],
                            "row_count": 1, "purpose": "control total"})
    if abs(got - total) > max(1.0, total * 0.001):
        out["caveats"].append({"code": "CONTROL_TOTAL_MISMATCH", "level": "warning",
                               "text": f"District figures add up to {money(got)}, but outstanding (LIVE) for the same segments is "
                                       f"{money(total)}. The district view probably includes matured deals."})
        return f"control total vs view 1: fail ({money(got)} vs {money(total)})"
    out["caveats"].append({"code": "CONTROL_TOTAL_OK", "level": "info",
                           "text": f"District figures reconcile with total outstanding ({money(total)})."})
    return "control total vs view 1: pass"


def _num(out, value, display, measure, source):
    nid = f"n{len(out['numbers']) + 1}"
    out["numbers"].append({"id": nid, "value": value, "display": display, "measure": measure, "source": source})
    return display


def _sum_by(cols, rows, keys):
    vi = cols.index("Volume Bu")
    idx = [cols.index(k) for k in keys]
    agg = defaultdict(float)
    for r in rows:
        agg[tuple(r[i] for i in idx)] += float(r[vi] or 0)
    return sorted(agg.items(), key=lambda kv: -kv[1])


def _write(it, pl, cols, rows, out):
    v = pl.view
    src = v["view_name"]
    vi = _idx(cols, "Volume Bu")
    total = sum(float(r[vi] or 0) for r in rows) if vi is not None else 0
    scope = it.scope_line()
    win = f"next {it.window_days} days" if it.window_days and not it.on_date else (f"on {it.on_date}" if it.on_date else "")

    if it.intent == "outstanding_total":
        out["headline"] = f"Outstanding ELI ({scope}) is {_num(out, total, money(total), 'hkd', src)}."
        out["followups"] = ["What share of outstanding ELI is TRE?", "Compare outstanding ELI across districts"]

    elif it.intent in ("segment_share", "segment_result_share"):
        si, shi = cols.index("Bp Div Type"), cols.index("Share Of All Segments")
        ri = _idx(cols, "Predict Result")
        want = it.segments or ["Treasures(HK)"]
        sel = [r for r in rows if r[si] in want and (ri is None or not it.result or r[ri] == it.result)]
        parts = []
        for r in sel:
            label = short(r[si]) + (f" predicted {r[ri]}" if ri is not None and it.result else "")
            parts.append(f"{label} is {_num(out, float(r[shi]), pct(float(r[shi])), 'share', src)} of all outstanding ELI "
                         f"({_num(out, float(r[vi]), money(float(r[vi])), 'hkd', src)})")
        out["headline"] = ("; ".join(parts) + ".") if parts else "No matching segment row."
        out["bullets"].append("The share uses the all-segment total as the denominator, taken from the view's own share field.")
        ordered = sel + [r for r in rows if r not in sel]
        out["table"] = {"columns": ["Segment"] + (["Predicted result"] if ri is not None else []) + ["HKD", "Share of all"],
                        "rows": [[short(r[si])] + ([r[ri]] if ri is not None else []) + [money(float(r[vi])), pct(float(r[shi]))] for r in ordered]}
        pl.embed_highlight, pl.embed_highlight_field = list(want), "bp_div_type"

    elif it.intent == "customer_count":
        ci, ri, si = cols.index("Distinct count of Cif Id"), cols.index("Predict Result"), cols.index("Bp Div Type")
        if it.result:
            r0 = rows[0]
            segtxt = " + ".join(short(x) for x in it.segments) or "All-segment"
            out["headline"] = (f"{_num(out, int(r0[ci]), r0[ci], 'customers', src)} distinct {segtxt} customers are predicted to "
                               f"{it.result}, holding {_num(out, float(r0[vi]), money(float(r0[vi])), 'hkd', src)} of outstanding ELI.")
        else:
            out["headline"] = f"Distinct customers by predicted result ({scope}). These counts can't be added up, because one customer can hold positions in more than one result."
        out["table"] = {"columns": ["Segment", "Predicted result", "Customers", "HKD"],
                        "rows": [[short(r[si]), r[ri], r[ci], money(float(r[vi]))] for r in rows]}

    elif it.intent == "maturity_calendar":
        by = _sum_by(cols, rows, ["Predict Maturity"])
        top = by[:3]
        where = f" in {it.district.replace('TRE-', '')}" if it.district else ""
        where += f", {it.branch} branch" if it.branch else ""
        out["headline"] = (f"{_num(out, total, money(total), 'hkd', src)} of TRE ELI{where} is predicted to mature in the {win or 'window'}"
                           f", counted from {pl.anchor} ({'business date' if pl.anchor_known else 'today, because the data date is unknown'}). The largest date is "
                           f"{_d(top[0][0][0])} with {_num(out, top[0][1], money(top[0][1]), 'hkd', src)}.")
        out["table"] = {"columns": ["Predicted maturity", "HKD"], "rows": [[_d(k[0]), money(x)] for k, x in by[:8]]}
        out["followups"] = [f"Give me the client and RM list for the {_d(top[0][0][0])} maturity"]

    elif it.intent == "maturity_branch":
        by = _sum_by(cols, rows, ["Cust District", "Cust Branch"])
        ci = _idx(cols, "Customers (all results)")
        cust = {}
        if ci is not None:
            for r in rows:
                cust[(r[0], r[1])] = r[ci]
        lead = by[0]
        if len(by) == 1:
            out["headline"] = (f"{lead[0][1]} has {_num(out, lead[1], money(lead[1]), 'hkd', src)} of TRE predicted maturity "
                               f"in the {win}.")
        else:
            out["headline"] = (f"{lead[0][1]} leads with {_num(out, lead[1], money(lead[1]), 'hkd', src)} of TRE predicted "
                               f"maturity in the {win}, followed by {by[1][0][1]} at "
                               f"{_num(out, by[1][1], money(by[1][1]), 'hkd', src)}. Total "
                               f"{_num(out, total, money(total), 'hkd', src)} across {len(by)} branches.")
        out["table"] = {"columns": ["District", "Branch", "HKD"] + (["Customers"] if cust else []),
                        "rows": [[k[0].replace("TRE-", ""), k[1], money(x)] + ([cust.get(k, "")] if cust else []) for k, x in by]}
        out["followups"] = [f"Show the clients behind {lead[0][1]} maturing in the {win}"]
        pl.embed_highlight, pl.embed_highlight_field = [lead[0][1]], "cust_branch"

    elif it.intent == "maturity_detail":
        idx = {c: i for i, c in enumerate(cols)}
        custs = len({r[idx["Cif Id"]] for r in rows})
        out["headline"] = (f"{_num(out, len(rows), str(len(rows)), 'positions', src)} positions for "
                           f"{_num(out, custs, str(custs), 'customers', src)} customers, "
                           f"{_num(out, total, money(total), 'hkd', src)} in total ({scope}).")
        out["bullets"].append("This is a position list for follow-up. Contact details are not in the view, and none are added.")
        rows_sorted = sorted(rows, key=lambda r: -float(r[idx["Volume Bu"]]))
        out["table"] = {"columns": ["Pred. maturity", "Branch", "RM", "Cif Id", "Pos Id", "Result", "WPS", "HKD"],
                        "rows": [[_d(r[idx["Predict Maturity"]]), r[idx["Cust Branch"]], r[idx["Rm Name"]], r[idx["Cif Id"]],
                                  r[idx["Pos Id"]], r[idx["Predict Result"]], r[idx["Wps"]], money(float(r[idx["Volume Bu"]]))]
                                 for r in rows_sorted[:10]], "more": max(0, len(rows) - 10)}

    elif it.intent == "district":
        by = _sum_by(cols, rows, ["Bp Div Type", "Cust District"])
        ci = _idx(cols, "Customers (all results)")
        cust = {}
        if ci is not None:
            for r in rows:
                cust[(r[0], r[1])] = r[ci]
        named = [(k, x) for k, x in by if k[1] != "Null"]
        out["headline"] = (f"Outstanding ELI by district ({scope}): " + ", ".join(
            f"{k[1].replace('TRE-', '')} {_num(out, x, money(x), 'hkd', src)}" for k, x in named[:3])
            + f". Total in view {_num(out, total, money(total), 'hkd', src)}.")
        for a in pl.asserted:
            if a.startswith("published rule"):
                out["bullets"].append("By the view's published rule, Treasures (TPC) is excluded (mock rule for this demo).")
        if any(k[1] == "Null" for k, _ in by):
            out["bullets"].append("PB and TPC have no district, so they show as Null and are not reported as a named district.")
        out["table"] = {"columns": ["Segment", "District", "HKD"] + (["Customers"] if cust else []),
                        "rows": [[short(k[0]), k[1].replace("TRE-", ""), money(x)] + ([cust.get(k, "")] if cust else []) for k, x in by]}
        if named:
            out["followups"] = [f"Which branches in {named[0][0][1].replace('TRE-', '')} have the largest TRE maturity in the next 30 days?"]

    elif it.intent == "wps_exposure":
        by = _sum_by(cols, rows, ["Wps"])
        named = next(((k, x, n) for n, (k, x) in enumerate(by, 1) if k[0] == it.wps), None) if it.wps else None
        if it.wps and not named:
            out["bullets"].append(f"{it.wps} is not the worst-performing stock of any ELI in this scope.")
        if named:
            (k, x, rank) = named
            out["headline"] = (f"{k[0]} carries {_num(out, x, money(x), 'hkd', src)} of outstanding ELI as the worst-performing stock "
                               f"({_num(out, x / total, pct(x / total), 'share', src + ' (sum ratio)')} of {_num(out, total, money(total), 'hkd', src)}), "
                               f"rank {rank} of {len(by)}. The largest is {by[0][0][0]} at {_num(out, by[0][1], money(by[0][1]), 'hkd', src)}.")
            out["table"] = {"columns": ["WPS", "HKD"], "rows": [[kk[0], money(xx)] for kk, xx in by[:8]]}
            out["followups"] = [f"Show me the distribution on {k[0]}"]
            pl.embed_highlight, pl.embed_highlight_field = [k[0]], "wps"
        else:
            out["headline"] = (f"{by[0][0][0]} is the largest WPS exposure at {_num(out, by[0][1], money(by[0][1]), 'hkd', src)}"
                               f" ({_num(out, by[0][1] / total, pct(by[0][1] / total), 'share', src + ' (sum ratio)')} of {money(total)}), "
                               f"followed by {by[1][0][0]} and {by[2][0][0]}.")
            out["table"] = {"columns": ["WPS", "HKD"], "rows": [[k[0], money(x)] for k, x in by[:8]]}
            out["followups"] = [f"Show me the distribution on {by[0][0][0]}"]

    elif it.intent == "mtm_distribution":
        bi, ci = cols.index("MTM% (bin)"), cols.index("Count of Asset Id")
        ri = cols.index("Predict Result")
        rows_s = sorted(rows, key=lambda r: int(r[bi].rstrip("%")))
        out["headline"] = (f"{it.wps or 'All WPS'}: {_num(out, total, money(total), 'hkd', src)} across "
                           f"{len(rows_s)} MTM bins and results. Lowest bin {rows_s[0][bi]} ({rows_s[0][ri]}).")
        out["table"] = {"columns": ["MTM% (bin)", "Predicted result", "Deal count", "HKD"],
                        "rows": [[r[bi], r[ri], r[ci], money(float(r[vi]))] for r in rows_s]}

    elif it.intent == "customer_count_maturity":
        ci = cols.index("Customers (all results)")
        key_cols = ["Cust Branch"] if it.branch else ["Bp Div Type", "Cust District"]
        seen = {}
        for r in rows:
            seen[tuple(r[cols.index(k)] for k in key_cols)] = (r[ci])
        by = dict(_sum_by(cols, rows, key_cols))
        items = [(k, n, by[k]) for k, n in seen.items() if k[-1] != "Null"]
        if len(items) == 1:
            k, n, x = items[0]
            out["headline"] = (f"{_num(out, int(n), n, 'customers', src)} distinct TRE customers in {k[-1].replace('TRE-', '')} "
                               f"have predicted maturity in the {win}, holding {_num(out, x, money(x), 'hkd', src)}.")
        else:
            out["headline"] = f"Distinct customers with predicted maturity in the {win}, by district."
        out["table"] = {"columns": [c.replace("Cust ", "") for c in key_cols] + ["Customers", "HKD"],
                        "rows": [[*(p.replace("TRE-", "") for p in k), n, money(x)] for k, n, x in items]}

    elif it.intent == "data_recency":
        out["headline"] = f"The latest trade date in the data is {_num(out, rows[0][0], rows[0][0], 'date', src)}."
        out["bullets"].append("This is the newest trade, not the data date or the refresh time (SV-18).")

    elif it.intent == "data_as_of":
        out["headline"] = (f"Data is as of {_num(out, rows[0][0], rows[0][0], 'date', src)} (business date), "
                           f"last refreshed {rows[0][1].replace('T', ' ')}.")


def _d(iso: str) -> str:
    try:
        return date.fromisoformat(iso).strftime("%d %b")
    except ValueError:
        return iso


PARAM_META = {
    "market_spot": {"caption": "Market Spot", "kind": "percent", "min": 0.0, "max": 2.0, "step": 0.01},
    "shock_ticker": {"caption": "Shock Ticker", "kind": "text"},
    "shock_pct": {"caption": "Shock %", "kind": "percent", "min": -1.0, "max": 1.0, "step": 0.01},
}


def _param_values(view: dict, shock: dict | None, move: float | None) -> dict:
    """Parameter values for one view at one slider level. A view that can't express the move keeps its default."""
    vals = {}
    if not view.get("parameters"):
        return vals
    m = 0.0 if move is None else move
    if shock and shock.get("kind") == "single":
        if "shock_ticker" in view["parameters"]:
            vals.update(shock_ticker=shock["ticker"], shock_pct=round(m, 4), market_spot=1.0)
        else:
            vals["market_spot"] = 1.0
    elif shock and shock.get("kind") == "market":
        vals["market_spot"] = round(1 + m, 4)
        if "shock_ticker" in view["parameters"]:
            vals.update(shock_ticker="", shock_pct=0.0)
    else:
        vals["market_spot"] = 1.0
    return vals


def _embed(site, pl, scenario, *, role="primary", shock=None, move=None, why_not=None):
    from urllib.parse import urlencode
    v = pl.view
    params = {k: ",".join(x) for k, x in pl.embed_filters.items()}
    pvals = _param_values(v, shock, move)
    params.update({k: str(x) for k, x in pvals.items()})
    if pl.embed_highlight:
        params[":highlight"] = ",".join(pl.embed_highlight)
    if scenario:
        params["scenario"] = scenario
    q = urlencode(params, safe=",():")
    # Which parameter the screen's slider drives on this view (None: the view can't show the move)
    bind = None
    if shock and shock.get("kind") == "single" and "shock_pct" in v.get("parameters", []):
        bind = "shock_pct"
    elif shock and shock.get("kind") == "market" and "market_spot" in v.get("parameters", []):
        bind = "market_spot"
    notes = [c["text"] for c in pl.caveats if c["code"] in ("WPS_ONLY",)]
    if shock and v.get("parameters") and not bind:
        notes.append("This view's only parameter is Market Spot, which moves every stock at once, so it stays at 100% "
                     "for a single-stock what-if.")
    return {"view": v["view_name"], "record_id": v["record_id"], "title": v.get("title") or v["view_name"],
            "role": role, "kind": v.get("kind"),
            "url": f"/tableau/{site}/views/{quote(v['view_name'])}" + (f"?{q}" if q else ""),
            "filters": pl.embed_filters, "highlight": pl.embed_highlight,
            "highlight_field": pl.embed_highlight_field,
            "parameters": [{"name": k, "value": x, **PARAM_META[k]} for k, x in pvals.items()],
            "bind": bind, "notes": notes,
            "cannot_apply": pl.embed_ignored, "scope_equivalent": not pl.embed_ignored}


def _embeds(site, it, reg, pl, anchor, anchor_known, scenario, shock=None, move=None) -> list[dict]:
    """Every view of the topic, the same filter spec compiled for each (one plan per view)."""
    out = []
    for n, (v, vp) in enumerate(P.bundle(it, reg, pl, anchor, anchor_known)):
        if vp.status != "OK":
            out.append({"view": v["view_name"], "record_id": v["record_id"], "title": v.get("title") or v["view_name"],
                        "role": "related", "skipped": True,
                        "why_not": _blocked_text(it, vp) if vp.caveats else
                        "This view can't show the same scope as the answer, so it is left out."})
            continue
        out.append(_embed(site, vp, scenario, role="primary" if n == 0 else "related", shock=shock, move=move))
    return out


# ---------------------------------------------------------------- what-if (scenario_analysis)
def _pct(m: float) -> str:
    return f"{abs(round(m * 100))}%"


def _scenario(it, reg, client, out, tr, site, scen, anchor, anchor_known):
    """Move one stock (or the market) and show which ELI change predicted status. Figures from code over view rows."""
    sh = it.shock or {}
    out["caveats"].append({"code": "SIMULATED", "level": "info",
                           "text": "Simulated, not a valuation or a forecast: an instant move from today's level with "
                                   "everything else unchanged (no time decay, no path, no correlation). KO here means at "
                                   "or above the KO level, not a confirmed call date; daily memory KO and observation "
                                   "dates are not in the views."})
    if sh.get("kind") == "single" and not sh.get("ticker"):
        out.update(status="NEEDS_CLARIFICATION", reasons=["SCENARIO_TARGET_MISSING"],
                   headline="Which stock should move, or the whole market? For example: 'What if NVDA falls 10%?' "
                            "or 'What if the market spot is 90%?'")
        opts = ["What if NVDA falls 10%?", "What if 9988 HK falls 10%?", "What if the market spot is 90%?"]
        out["followups"] = opts
        out["clarify"] = {"code": "SCENARIO_TARGET_MISSING", "concept": "scenario", "label": "scenario", "text": "",
                          "options": [{"label": o.replace("What if ", "").rstrip("?"), "question": o} for o in opts]}
        tr.add("Route", {"view": None, "reason": "what-if without a stock or market"})
        return out
    if sh.get("move") is None:
        who = sh.get("ticker") or "the market"
        out.update(status="NEEDS_CLARIFICATION", reasons=["SCENARIO_SIZE_MISSING"],
                   headline=f"How big a move should I apply to {who}? I won't pick a scenario size for you.")
        if sh.get("kind") == "market":
            opts = [f"What if the market spot is {x}%?" for x in (95, 90, 80)]
        else:
            opts = [f"What if {who} falls {x}%?" for x in (5, 10, 20)]
        out["followups"] = opts
        out["clarify"] = {"code": "SCENARIO_SIZE_MISSING", "concept": "scenario", "label": "move", "text": "",
                          "options": [{"label": o.split()[-1].rstrip("?") if sh.get("kind") != "market" else
                                       o.split()[-1].rstrip("?"), "question": o} for o in opts]}
        tr.add("Route", {"view": None, "reason": "what-if without a size"})
        return out

    shock = SC.Shock(kind=sh["kind"], ticker=sh.get("ticker"), move=sh["move"], assumption=sh.get("assumption"))
    if not reg.has("position-scenario-all"):
        return _scenario_aggregate(it, reg, client, out, tr, site, scen, anchor, anchor_known, shock)

    view = reg.views["position-scenario-all"]
    pl = P.build(it, reg, anchor, anchor_known, force_view=view)
    tr.add("Route", {"view": view["view_name"], "record_id": view["record_id"], "shock": shock.label()})
    pvals = _param_values(view, sh, shock.move)
    vfq = P.vf_query(pl) + "".join(f"&vf_{k}={quote(str(x), safe='')}" for k, x in pvals.items())
    tr.add("Plan check", {"asserted": pl.asserted, "parameters": pvals, "status": "pass"})
    tr.add("Compile", {"vf": pl.vf, "parameters": pvals, "embed_filters": list(pl.embed_filters)})
    try:
        d = client.view_data(view["luid"], vfq)
    except TableauError as e:
        out.update(status="SYSTEM_ERROR", reasons=[e.code], headline="The Tableau query failed, so I have no figures to show.")
        return _finish(out)
    cols, rows = d["columns"], d["rows"]
    out["evidence"].append({"step": 1, "view": view["view_name"], "record_id": view["record_id"], "luid": view["luid"],
                            "content_url": view.get("content_url"), "request": d["url"], "row_count": len(rows),
                            "columns": cols, "asserted": pl.asserted, "window": None})
    tr.add("Fetch", {"rows": len(rows), "bytes": d["bytes"], "ms": d["ms"]})
    try:
        positions = SC.positions_from_rows(cols, rows)
    except (KeyError, ValueError) as e:
        out.update(status="VALIDATION_FAILED", reasons=["SCENARIO_COLUMNS_MISSING"],
                   headline=f"The scenario view is missing a column the what-if needs ({e}), so I won't guess.")
        return _finish(out)
    res = SC.run(positions, shock)
    if not res.universe["positions"]:
        who = shock.ticker or "this scope"
        out.update(status="NO_DATA", reasons=["EMPTY_RESULT"],
                   headline=f"No live ELI has {who} in its basket ({it.scope_line().split(' · what-if')[0]}), "
                            "so this move changes nothing.")
        out["followups"] = ["What if the market spot is 90%?", "Which worst-performing stocks carry the most outstanding ELI?"]
        tr.add("Validate", {"checks": ["exposed positions: 0 -> NO_DATA"]})
        return _finish(out)

    # 8 validate: the sheet's own Predictive Result at the asked level must match the engine (same rules, two places)
    asked = res.grid[res.asked_index]
    checks = [f"exposed positions: {res.universe['positions']}"]
    pi, vi = cols.index("Predictive Result"), cols.index("Volume Bu")
    by_view = defaultdict(float)
    exposed_ids = None
    if shock.kind == "single":
        exposed_ids = {p["pos_id"] for p in positions if shock.ticker in (p["tks1"], p["tks2"])}
    idi = cols.index("Pos Id")
    for r in rows:
        if exposed_ids is None or r[idi] in exposed_ids:
            by_view[r[pi]] += float(r[vi] or 0)
    diffs = [s for s in SC.STATUSES if abs(by_view.get(s, 0.0) - asked["statuses"][s]["hkd"]) > 1.0]
    if diffs:
        out.update(status="VALIDATION_FAILED", reasons=["SCENARIO_RECONCILE_FAILED"],
                   headline="The Tableau sheet and the what-if engine disagree on the simulated results "
                            f"({', '.join(diffs)}), so I won't show either.")
        checks.append("sheet vs engine at the asked level: fail")
        tr.add("Validate", {"checks": checks})
        return _finish(out)
    checks.append("sheet Predictive Result = engine, at the asked level: pass")
    bad = [g["move"] for g in res.grid if not g["narrative_checked"]]
    checks.append("narrative figures = step figures, every step: " + ("pass" if not bad else f"fail at {bad}"))
    for g in res.grid:
        if not g["narrative_checked"]:   # gate on the serial path: drop words that fail, keep the figures
            g["narrative"] = f"{g['label']}: see the figures below."
    tr.add("Validate", {"checks": checks})

    # 9 write: the words for the asked level are the same template the slider shows at that level
    src = view["view_name"] + " + what-if engine"
    c = asked["changed"]
    _num(out, c["positions"], str(c["positions"]), "positions", src)
    _num(out, c["hkd"], money(c["hkd"]), "hkd", src)
    _num(out, c["customers"], str(c["customers"]), "customers", src)
    _num(out, res.universe["positions"], str(res.universe["positions"]), "positions", src)
    _num(out, res.universe["hkd"], money(res.universe["hkd"]), "hkd", src)
    out["headline"] = asked["narrative"]
    if shock.assumption:
        out["bullets"].append(shock.assumption)
    if shock.kind == "single":
        out["bullets"].append(f"{shock.ticker} is in the basket of {res.universe['positions']} live positions "
                              f"({money(res.universe['hkd'])}); it is the worst performer today in {res.universe['as_wps']} of them.")
    else:
        out["bullets"].append("Market spot moves every underlying by the same factor: simulated level = worst-of level x market spot.")
    end = (f"a market spot of {round((1 + res.moves[-1]) * 100)}%" if shock.kind == "market"
           else f"{'-' if res.moves[-1] < 0 else '+'}{_pct(res.moves[-1])}")
    out["bullets"].append(f"Move the slider to see every level from today to {end}; the words, charts and Tableau views follow it.")
    if asked["transitions"]:
        out["table"] = {"columns": ["From", "To", "Positions", "HKD"],
                        "rows": [[t["from"], t["to"], str(t["positions"]), money(t["hkd"])] for t in asked["transitions"]]}
    out["scenario"] = {
        "kind": shock.kind, "ticker": shock.ticker, "label": shock.label(), "move": shock.move,
        "assumption": shock.assumption, "near_ki_points": SC.NEAR_KI,
        "control": ({"name": "shock_pct", "caption": f"{shock.ticker} move", "unit": "move"} if shock.kind == "single"
                    else {"name": "market_spot", "caption": "Market spot", "unit": "spot"}),
        "moves": res.moves, "asked_index": res.asked_index, "universe": res.universe,
        "grid": res.grid, "ladder": res.ladder, "statuses": SC.STATUSES,
        "source": src, "checked": not bad,
    }
    ticker = shock.ticker
    out["followups"] = ([f"What if {ticker} falls {_pct(min(-0.2, shock.move * 2))}?", "What if the market spot is 90%?"]
                        if shock.kind == "single" else
                        [f"What if the market spot is {round((1 + shock.move) * 100) - 10}%?",
                         "What if NVDA falls 10%?"])
    out["followups"].append("Which worst-performing stocks carry the most outstanding ELI?")
    _finish(out)
    tr.add("Write answer", {"mode": "template (every slider step)", "steps": len(res.grid), "numbers": len(out["numbers"])})
    out["embeds"] = _embeds(site, it, reg, pl, anchor, anchor_known, scen, shock=sh, move=shock.move)
    out["embed"] = out["embeds"][0]
    tr.add("Compose", {"views": len(out["embeds"]), "slider_steps": len(res.moves)})
    return out


def _scenario_aggregate(it, reg, client, out, tr, site, scen, anchor, anchor_known, shock):
    """Today's workbook: only Market Spot on the WPS simulation sheet. No single stock, no counts."""
    if shock.kind == "single":
        out.update(status="UNSUPPORTED", reasons=["SCENARIO_VIEW_MISSING"],
                   headline=f"I can't move {shock.ticker} on its own with today's workbook. The views only carry each "
                            "ELI's worst-performing stock, not every basket stock's level or the knock-in flag, and the "
                            "only scenario control is Market Spot, which moves every stock at once. Worksheet ask W8 "
                            "adds a position-level scenario sheet.")
        out["caveats"].append({"code": "SCENARIO_VIEW_MISSING", "level": "block", "text": out["headline"]})
        out["followups"] = [f"What if the market spot is {round((1 + shock.move) * 100)}%?",
                            f"Which worst-performing stocks carry the most outstanding ELI?"]
        tr.add("Route", {"view": None, "reason": "single-stock what-if needs W8"})
        return _finish(out)
    rid = "outstanding-wps-n30-all"
    if not reg.has(rid):
        out.update(status="UNSUPPORTED", reasons=["NO_ELIGIBLE_VIEW"], headline="No published view can run a market scenario.")
        return _finish(out)
    view = reg.views[rid]
    pl = P.build(it, reg, anchor, anchor_known, force_view=view)
    tr.add("Route", {"view": view["view_name"], "record_id": rid, "shock": shock.label()})
    vfq = P.vf_query(pl) + f"&vf_market_spot={shock.spot}"
    d = client.view_data(view["luid"], vfq)
    cols, rows = d["columns"], d["rows"]
    out["evidence"].append({"step": 1, "view": view["view_name"], "record_id": rid, "luid": view["luid"],
                            "request": d["url"], "row_count": len(rows), "columns": cols, "asserted": pl.asserted})
    tr.add("Fetch", {"rows": len(rows), "bytes": d["bytes"], "ms": d["ms"]})
    if "Predictive Result" not in cols:
        out.update(status="UNSUPPORTED", reasons=["SCENARIO_COLUMNS_MISSING"],
                   headline="The simulation view did not return Predictive Result, so I can't show the scenario.")
        return _finish(out)
    ri, pi, vi = cols.index("Predict Result"), cols.index("Predictive Result"), cols.index("Volume Bu")
    moved = defaultdict(float)
    total = 0.0
    for r in rows:
        x = float(r[vi] or 0)
        total += x
        if r[ri] != r[pi]:
            moved[(r[ri], r[pi])] += x
    ch = sum(moved.values())
    src = view["view_name"]
    out["headline"] = (f"At market spot {round(shock.spot * 100)}%, {_num(out, ch, money(ch), 'hkd', src)} of "
                       f"{_num(out, total, money(total), 'hkd', src)} outstanding ELI changes predicted result "
                       f"(the sheet's Predictive Result). Position and customer counts need worksheet ask W8.")
    out["table"] = {"columns": ["From", "To", "HKD"],
                    "rows": [[a, b, money(x)] for (a, b), x in sorted(moved.items(), key=lambda kv: -kv[1])]}
    out["caveats"].append({"code": "SCENARIO_AGGREGATE", "level": "warning",
                           "text": "Today's workbook gives notional only. Counts, the slider and the barrier view need W8."})
    tr.add("Validate", {"checks": ["Predictive Result column present: pass"]})
    _finish(out)
    out["embeds"] = _embeds(site, it, reg, pl, anchor, anchor_known, scen, shock=it.shock, move=shock.move)
    out["embed"] = out["embeds"][0]
    return out
