"""What-if engine: move one underlying (or the whole market) and see which ELI change predicted status.

The figures come from code over Tableau rows, never from the model (decision: figures from views or code).
The same `classify` is the mock workbook's calculated field, so the embedded scenario view and this
engine show the same thing, and the pipeline reconciles the two at the asked level.

Model (state it in every answer; it is a sensitivity, not a valuation):
  * An instant move from today's level. Nothing else changes: no time decay, no path, no correlation.
  * Single stock: only that underlying moves; the other basket stock stays where it is, and the worst-of
    is picked again. Market spot: every underlying moves by the same factor, so
    simulated mtm% = wps_mtm x market_spot, the relationship the HK_ELI workbook documents.
  * Predicted result rules (What is HK ELI 5.2), on the simulated worst-of level:
      KO                 sim >= KO%
      EXP                strike% <= sim < KO%
      EXP(Below Strike)  sim < strike% and not knocked in
      EX                 knocked in (already, or sim < KI%)
  * "Near knock-in" = not knocked in, and the simulated worst-of is within NEAR_KI points above KI%.
  * Daily memory KO, KO start dates and observation schedules are not in the views, so a KO here means
    "at or above the KO level", not a confirmed call date.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field

STATUSES = ["KO", "EXP", "EXP(Below Strike)", "EX"]          # best to worst for the holder
RANK = {s: i for i, s in enumerate(STATUSES)}
NEAR_KI = 5.0                                                 # points above the KI barrier
SHORT_SEG = {"Treasures(HK)": "TRE", "Treasures(TPC)": "TPC", "PB": "PB"}

# The columns the engine reads from the position scenario view (proposed W8), by caption.
COLUMNS = {
    "pos_id": "Pos Id", "asset_id": "Asset Id", "cif_id": "Cif Id", "segment": "Bp Div Type",
    "district": "Cust District", "branch": "Cust Branch", "rm": "Rm Name",
    "tks1": "Asset Tks", "tks2": "Asset Tks 2", "m1": "Asset Tks Mtm", "m2": "Asset Tks 2 Mtm",
    "wps": "Wps", "wps_mtm": "Wps Mtm", "strike": "Strike Percentage", "ko": "Ko Percentage",
    "ki": "Ki Percentage", "knocked_in": "Has Knocked In", "status": "Predict Result", "hkd": "Volume Bu",
}


def classify(sim: float, strike: float, ko: float, ki: float, knocked_in: bool) -> tuple[str, bool]:
    """Predicted result for a simulated worst-of level. Returns (result, knocked_in after the move)."""
    kin = bool(knocked_in) or sim < ki
    if sim >= ko:
        return "KO", kin
    if sim >= strike:
        return "EXP", kin
    if not kin:
        return "EXP(Below Strike)", kin
    return "EX", kin


def simulate(p: dict, kind: str, ticker: str | None, move: float) -> dict:
    """One position under one move. p uses the engine's short keys (see COLUMNS)."""
    if kind == "market":
        legs = [(p["tks1"], p["m1"] * (1 + move))] + ([(p["tks2"], p["m2"] * (1 + move))] if p.get("tks2") else [])
    else:
        legs = [(p["tks1"], p["m1"] * (1 + move) if p["tks1"] == ticker else p["m1"])]
        if p.get("tks2"):
            legs.append((p["tks2"], p["m2"] * (1 + move) if p["tks2"] == ticker else p["m2"]))
    wps, sim = min(legs, key=lambda x: x[1])
    status, kin = classify(sim, p["strike"], p["ko"], p["ki"], p["knocked_in"])   # on the exact level, as Tableau does
    return {"wps": wps, "sim": round(sim, 1), "status": status, "knocked_in": kin,
            "near_ki": (not kin) and p["ki"] <= sim < p["ki"] + NEAR_KI}


def positions_from_rows(cols: list[str], rows: list[list[str]]) -> list[dict]:
    """Rows of the position scenario view -> engine positions. Missing columns raise KeyError (caught upstream)."""
    i = {c: n for n, c in enumerate(cols)}
    idx = {k: i[c] for k, c in COLUMNS.items()}
    out = []
    for r in rows:
        g = lambda k: r[idx[k]]  # noqa: E731
        m2 = g("m2")
        out.append({
            "pos_id": g("pos_id"), "asset_id": g("asset_id"), "cif_id": g("cif_id"), "segment": g("segment"),
            "district": "" if g("district") in ("", "Null") else g("district"),
            "branch": "" if g("branch") in ("", "Null") else g("branch"), "rm": g("rm"),
            "tks1": g("tks1"), "tks2": "" if g("tks2") in ("", "Null") else g("tks2"),
            "m1": float(g("m1")), "m2": float(m2) if m2 not in ("", "Null") else None,
            "wps": g("wps"), "wps_mtm": float(g("wps_mtm")), "strike": float(g("strike")), "ko": float(g("ko")),
            "ki": float(g("ki")), "knocked_in": g("knocked_in") in ("True", "TRUE", "true", "1"),
            "status": g("status"), "hkd": float(g("hkd") or 0),
        })
    return out


@dataclass
class Shock:
    kind: str                      # single | market
    ticker: str | None = None      # single only
    move: float = -0.10            # the asked move, e.g. -0.10; market spot 80% = -0.20
    assumption: str | None = None  # how the words were read, said in the answer

    @property
    def spot(self) -> float:
        return round(1 + self.move, 4)

    def label(self, move: float | None = None) -> str:
        m = self.move if move is None else move
        if self.kind == "market":
            return f"Market spot {round((1 + m) * 100)}%"
        if m == 0:
            return f"{self.ticker} unchanged"
        return f"{self.ticker} {'falls' if m < 0 else 'rises'} {abs(round(m * 100))}%"


def grid_moves(shock: Shock) -> list[float]:
    """Slider steps, 1 point apart, from 0 to at least 30% in the asked direction (to the asked move if larger)."""
    span = max(30, min(60, round(abs(shock.move) * 100)))
    sign = -1 if shock.move <= 0 else 1
    return [round(sign * k / 100, 2) for k in range(0, span + 1)]


def _hkd(x: float) -> str:
    from ..svg import money
    return money(x)


def _breakdown(changed: list[tuple[dict, dict]], exposed: list[dict], key, label=lambda k: k, top: int | None = None):
    tot, ch, chn = defaultdict(float), defaultdict(float), defaultdict(int)
    for p in exposed:
        tot[key(p)] += p["hkd"]
    for p, _s in changed:
        ch[key(p)] += p["hkd"]
        chn[key(p)] += 1
    rows = [{"key": k, "label": label(k), "changed_hkd": round(ch[k], 2), "changed_positions": chn[k],
             "exposed_hkd": round(tot[k], 2)} for k in tot]
    rows.sort(key=lambda r: (-r["changed_hkd"], -r["exposed_hkd"]))
    return rows[:top] if top else rows


def step(positions: list[dict], shock: Shock, move: float) -> dict:
    sims = [(p, simulate(p, shock.kind, shock.ticker, move)) for p in positions]
    changed = [(p, s) for p, s in sims if s["status"] != p["status"]]
    statuses = {st: {"hkd": 0.0, "positions": 0} for st in STATUSES}
    for _p, s in sims:
        statuses[s["status"]]["hkd"] += _p["hkd"]
        statuses[s["status"]]["positions"] += 1
    trans = defaultdict(lambda: {"positions": 0, "hkd": 0.0})
    for p, s in changed:
        t = trans[(p["status"], s["status"])]
        t["positions"] += 1
        t["hkd"] += p["hkd"]
    ki_new = [(p, s) for p, s in sims if s["knocked_in"] and not p["knocked_in"]]
    near = [(p, s) for p, s in sims if s["near_ki"]]
    ko_lost = [(p, s) for p, s in changed if p["status"] == "KO"]
    total = sum(p["hkd"] for p in positions)
    ch_hkd = sum(p["hkd"] for p, _ in changed)
    return {
        "move": move,
        "label": shock.label(move),
        "statuses": {k: {"hkd": round(v["hkd"], 2), "positions": v["positions"]} for k, v in statuses.items()},
        "changed": {"positions": len(changed), "deals": len({p["asset_id"] for p, _ in changed}),
                    "customers": len({p["cif_id"] for p, _ in changed}), "hkd": round(ch_hkd, 2),
                    "share": round(ch_hkd / total, 4) if total else 0.0,
                    "worse": sum(1 for p, s in changed if RANK[s["status"]] > RANK[p["status"]]),
                    "better": sum(1 for p, s in changed if RANK[s["status"]] < RANK[p["status"]])},
        "transitions": sorted(({"from": a, "to": b, "positions": v["positions"], "hkd": round(v["hkd"], 2)}
                               for (a, b), v in trans.items()), key=lambda t: -t["hkd"]),
        "knock_in_new": {"positions": len(ki_new), "hkd": round(sum(p["hkd"] for p, _ in ki_new), 2)},
        "near_ki": {"positions": len(near), "hkd": round(sum(p["hkd"] for p, _ in near), 2)},
        "ko_lost": {"positions": len(ko_lost), "hkd": round(sum(p["hkd"] for p, _ in ko_lost), 2)},
        "by_segment": _breakdown(changed, positions, lambda p: p["segment"], lambda k: SHORT_SEG.get(k, k)),
        "by_district": _breakdown(changed, positions, lambda p: p["district"] or "No district",
                                  lambda k: k.replace("TRE-", "") if k != "No district" else "PB / TPC (no district)"),
        "by_branch": _breakdown([(p, s) for p, s in changed if p["branch"]], [p for p in positions if p["branch"]],
                                lambda p: p["branch"], top=10),
    }


def narrative(shock: Shock, st: dict, universe: dict) -> tuple[str, list[str]]:
    """The answer's words for one slider step, from that step's figures only. Returns (text, figures used)."""
    figs: list[str] = []

    def f(s: str) -> str:
        figs.append(s)
        return s

    n, hkd = universe["positions"], universe["hkd"]
    if shock.kind == "market":
        what = f"If the market spot is {f(str(round((1 + st['move']) * 100)))}% (every underlying {f(str(abs(round(st['move'] * 100))))}% {'lower' if st['move'] < 0 else 'higher'})"
        pool = f"the {f(str(n))} live positions ({f(_hkd(hkd))})"
    else:
        what = f"If {shock.ticker} {'falls' if st['move'] < 0 else 'rises'} {f(str(abs(round(st['move'] * 100))))}%"
        pool = f"the {f(str(n))} live positions with {shock.ticker} in the basket ({f(_hkd(hkd))})"
    if st["move"] == 0:
        return (f"At today's levels nothing changes. This covers {pool}; move the slider to see which "
                f"positions would change predicted status."), figs
    c = st["changed"]
    if c["positions"] == 0:
        txt = f"{what}, none of {pool} changes predicted status."
        if st["near_ki"]["positions"]:
            txt += f" {f(str(st['near_ki']['positions']))} would sit within {f(str(int(NEAR_KI)))} points of knock-in."
        return txt, figs
    txt = (f"{what}, {f(str(c['positions']))} of {pool} change predicted status: "
           f"{f(_hkd(c['hkd']))}, {f(str(round(c['share'] * 100, 1)))}% of that notional, across "
           f"{f(str(c['customers']))} customers.")
    t = st["transitions"][0]
    txt += f" The largest move is {t['from']} to {t['to']}: {f(str(t['positions']))} positions, {f(_hkd(t['hkd']))}."
    if st["knock_in_new"]["positions"]:
        txt += (f" {f(str(st['knock_in_new']['positions']))} positions would knock in "
                f"({f(_hkd(st['knock_in_new']['hkd']))}).")
    if st["near_ki"]["positions"]:
        txt += f" {f(str(st['near_ki']['positions']))} more would sit within {f(str(int(NEAR_KI)))} points of knock-in."
    seg = st["by_segment"][0]
    if seg["changed_hkd"]:
        txt += f" Most of the change is in {seg['label']} ({f(_hkd(seg['changed_hkd']))})."
    return txt, figs


FIG = re.compile(r"\d[\d,]*(?:\.\d+)?")


def figures_ok(text: str, figs: list[str], extra: tuple[str, ...] = ()) -> bool:
    """Gate on the serial path: every number in the words must be one of this step's figures."""
    allowed = set()
    for s in list(figs) + list(extra):
        allowed.update(FIG.findall(s))
    return all(x in allowed for x in FIG.findall(text))


def ladder(positions: list[dict], shock: Shock, moves: list[float], asked: float, top: int = 10) -> list[dict]:
    """The positions that move most at the asked level, each with its worst-of path along the slider."""
    sims = {p["pos_id"]: simulate(p, shock.kind, shock.ticker, asked) for p in positions}
    ranked = sorted(positions, key=lambda p: (sims[p["pos_id"]]["status"] == p["status"], -p["hkd"]))[:top]
    out = []
    for p in ranked:
        path = [simulate(p, shock.kind, shock.ticker, m) for m in moves]
        out.append({
            "pos_id": p["pos_id"], "cif_id": p["cif_id"], "segment": SHORT_SEG.get(p["segment"], p["segment"]),
            "branch": p["branch"], "hkd": p["hkd"], "basket": [x for x in (p["tks1"], p["tks2"]) if x],
            "strike": p["strike"], "ki": p["ki"], "ko": p["ko"], "knocked_in": p["knocked_in"],
            "now": {"wps": p["wps"], "mtm": p["wps_mtm"], "status": p["status"]},
            "path": [[x["sim"], x["status"], x["wps"]] for x in path],
        })
    return out


@dataclass
class Result:
    shock: Shock
    universe: dict
    moves: list[float]
    grid: list[dict] = field(default_factory=list)
    ladder: list[dict] = field(default_factory=list)
    asked_index: int = 0


def run(positions: list[dict], shock: Shock) -> Result:
    if shock.kind == "single":
        exposed = [p for p in positions if shock.ticker in (p["tks1"], p["tks2"])]
    else:
        exposed = list(positions)
    moves = grid_moves(shock)
    universe = {"positions": len(exposed), "deals": len({p["asset_id"] for p in exposed}),
                "customers": len({p["cif_id"] for p in exposed}), "hkd": round(sum(p["hkd"] for p in exposed), 2),
                "as_wps": sum(1 for p in exposed if shock.kind == "single" and p["wps"] == shock.ticker)}
    res = Result(shock=shock, universe=universe, moves=moves)
    asked = round(shock.move, 2)
    res.asked_index = min(range(len(moves)), key=lambda k: abs(moves[k] - asked))
    for m in moves:
        st = step(exposed, shock, m)
        text, figs = narrative(shock, st, universe)
        st["narrative"] = text
        st["narrative_checked"] = figures_ok(text, figs)
        res.grid.append(st)
    res.ladder = ladder(exposed, shock, moves, moves[res.asked_index])
    return res
