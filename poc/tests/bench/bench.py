"""Intent bench runner: every evaluation question x 6 variants, scored on intent, view, status, filters and
golden figures, with latency and model calls per case.

Used by tests/test_bench.py (rules mode, offline, must stay above the floor) and office/run_bench.py
(any mode, prints counts only and can write an Excel summary).
"""
from __future__ import annotations

import json
import time
from collections import Counter, defaultdict
from pathlib import Path

from golden import golden, same

HERE = Path(__file__).resolve().parent
BENCH = json.loads((HERE / "intent_bench.json").read_text())
REFUSE = {"out_of_scope": {"UNSUPPORTED", "NEEDS_CLARIFICATION"}, "unauthorized": {"UNSUPPORTED"}}


def cases() -> list[dict]:
    out = []
    for g in BENCH["groups"]:
        base = g["expect"]
        out.append({"group": g["base"], "variant": "base", "q": g["base"], "expect": base})
        for v in BENCH["variants"][1:]:
            spec = g[v]
            exp = {**base, **{k: val for k, val in spec.get("expect", {}).items() if k != "slots"}}
            exp["slots"] = {**base.get("slots", {}), **spec.get("expect", {}).get("slots", {})}
            if v in REFUSE:
                exp = {"intent": "*", "status": REFUSE[v], "view": None, "slots": {}}
            out.append({"group": g["base"], "variant": v, "q": spec["q"], "expect": exp})
    return out


HOLDOUT = json.loads((HERE / "holdout.json").read_text())


def holdout_cases() -> list[dict]:
    out = []
    for c in HOLDOUT["cases"]:
        e = c["expect"]
        if "refuse" in e:
            e = {"intent": "*", "view": None, "slots": {},
                 "status": {"UNSUPPORTED"} if e["refuse"] == "unsupported" else {"UNSUPPORTED", "NEEDS_CLARIFICATION"}}
        out.append({"group": "holdout", "variant": c["kind"], "q": c["q"], "expect": e})
    return out


def _slots(a: dict) -> dict:
    if "slots" in a:
        return a["slots"]
    # older builds do not return slots: read them the way the pipeline did
    from datetime import date

    from hkeli_poc.stork.understand import understand
    it = understand(a["question"], date(2026, 11, 19))
    return {"segments": it.segments, "district": it.district, "branch": it.branch, "wps": it.wps,
            "result": it.result, "window_days": it.window_days}


def score(case: dict, a: dict, figures: bool = True) -> list[str]:
    """Problems with one answer (empty = pass)."""
    e = case["expect"]
    p = []
    status = "OK" if a["status"] == "OK_WITH_WARNING" else a["status"]
    want = e["status"] if isinstance(e["status"], (set, list)) else {e["status"]}
    if status not in want:
        p.append(f"status {status}")
    if e["intent"] != "*" and a.get("intent") != e["intent"]:
        p.append(f"intent {a.get('intent')}")
    view = a["evidence"][0]["record_id"] if a.get("evidence") else None
    if view != e["view"]:
        p.append(f"view {view}")
    if status != "OK" and a.get("numbers"):
        p.append("figures on a non-answer")
    if e.get("slots") and status == "OK":
        got = _slots(a)
        for k, v in e["slots"].items():
            g = got.get(k)
            if (sorted(g or []) if k == "segments" else g) != (sorted(v or []) if k == "segments" else v):
                p.append(f"{k} {g!r}")
    if figures and status == "OK" and e["intent"] not in ("*", "scenario_analysis") and not p:
        exp = golden(e["intent"], {**_slots(a)})
        got = a["numbers"][0]["value"] if a.get("numbers") else None
        if not same(exp, got):
            p.append(f"figure {got} != golden {exp}")
    return p


def run(ask, figures: bool = True, which: str = "bench") -> dict:
    """ask(question) -> answer dict. Returns per-case rows and per-variant counts.

    Each row's outcome is pass, asked (wrong reading avoided: the answer asked back and showed no figures) or
    wrong (a confident answer to a different question, or a figure that is not the golden one).
    """
    rows = []
    for c in (cases() if which == "bench" else holdout_cases()):
        t0 = time.perf_counter()
        a = ask(c["q"])
        ms = round((time.perf_counter() - t0) * 1000)
        probs = score(c, a, figures)
        calls = a.get("_llm_calls") or []
        asked = bool(probs) and a["status"] == "NEEDS_CLARIFICATION" and not a.get("numbers")
        rows.append({"variant": c["variant"], "q": c["q"], "group": c["group"], "pass": not probs,
                     "outcome": "pass" if not probs else "asked" if asked else "wrong",
                     "problems": "; ".join(probs), "status": a["status"], "intent": a.get("intent"),
                     "path": a["meta"]["understanding"], "llm_calls": len(calls), "ms": ms})
    by = defaultdict(Counter)
    for r in rows:
        by[r["variant"]]["n"] += 1
        by[r["variant"]]["pass"] += r["pass"]
        by[r["variant"]]["llm_calls"] += r["llm_calls"]
    total = Counter(n=len(rows), passed=sum(r["pass"] for r in rows), llm_calls=sum(r["llm_calls"] for r in rows),
                    asked=sum(r["outcome"] == "asked" for r in rows), wrong=sum(r["outcome"] == "wrong" for r in rows))
    ms = sorted(r["ms"] for r in rows)
    return {"rows": rows, "by_variant": {k: dict(v) for k, v in by.items()}, "total": dict(total),
            "p50_ms": ms[len(ms) // 2], "p95_ms": ms[int(len(ms) * 0.95) - 1]}


def report(res: dict, label: str) -> str:
    t = res["total"]
    lines = [f"{label}: {t['passed']} of {t['n']} pass ({100 * t['passed'] / t['n']:.1f}%), asked back {t['asked']}, "
             f"wrong {t['wrong']}; model calls {t['llm_calls']}, p50 {res['p50_ms']} ms, p95 {res['p95_ms']} ms"]
    for v in BENCH["variants"]:
        if v not in res["by_variant"]:
            continue
        b = res["by_variant"].get(v, {"n": 0, "pass": 0})
        lines.append(f"  {v:<15} {b['pass']:>3} of {b['n']}")
    return "\n".join(lines)


# ------------------------------------------------------------------ Excel summary (no extra packages)
def _cell(ref: str, v) -> str:
    if isinstance(v, bool):
        return f'<c r="{ref}" t="b"><v>{int(v)}</v></c>'
    if isinstance(v, (int, float)):
        return f'<c r="{ref}"><v>{v}</v></c>'
    s = str(v).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{s}</t></is></c>'


def _col(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def _sheet(rows: list[list]) -> str:
    body = "".join(f'<row r="{i}">' + "".join(_cell(f"{_col(j)}{i}", v) for j, v in enumerate(r, 1)) + "</row>"
                   for i, r in enumerate(rows, 1))
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/'
            f'spreadsheetml/2006/main"><sheetData>{body}</sheetData></worksheet>')


def write_xlsx(path: Path, results: dict[str, dict]) -> None:
    """results: {label: run() result}. Sheet 1 summary by variant and label, then one case sheet per label."""
    import zipfile
    labels = list(results)
    summary = [["Variant"] + [f"{lb} pass" for lb in labels] + ["Cases"]]
    for v in BENCH["variants"]:
        summary.append([v] + [results[lb]["by_variant"].get(v, {}).get("pass", 0) for lb in labels]
                       + [results[labels[0]]["by_variant"].get(v, {}).get("n", 0)])
    summary.append(["Total"] + [results[lb]["total"]["passed"] for lb in labels] + [results[labels[0]]["total"]["n"]])
    summary.append(["Asked back"] + [results[lb]["total"]["asked"] for lb in labels] + [""])
    summary.append(["Wrong answer"] + [results[lb]["total"]["wrong"] for lb in labels] + [""])
    summary.append(["Pass rate %"] + [round(100 * results[lb]["total"]["passed"] / results[lb]["total"]["n"], 1) for lb in labels] + [""])
    summary.append(["Model calls"] + [results[lb]["total"]["llm_calls"] for lb in labels] + [""])
    summary.append(["p50 ms"] + [results[lb]["p50_ms"] for lb in labels] + [""])
    summary.append(["p95 ms"] + [results[lb]["p95_ms"] for lb in labels] + [""])
    sheets = [("Summary", summary)]
    for lb in labels:
        head = ["Variant", "Question", "Outcome", "Problems", "Status", "Intent", "Read by", "Model calls", "ms"]
        sheets.append((lb[:31], [head] + [[r["variant"], r["q"], r["outcome"], r["problems"], r["status"], r["intent"] or "",
                                           r["path"], r["llm_calls"], r["ms"]] for r in results[lb]["rows"]]))
    ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",
                   '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                   '<Default Extension="xml" ContentType="application/xml"/>'
                   '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                   + "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                             for i in range(1, len(sheets) + 1)) + "</Types>")
        z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                                  f'<Relationship Id="rId1" Type="{ns}/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                                      f'xmlns:r="{ns}"><sheets>' + "".join(f'<sheet name="{n}" sheetId="{i}" r:id="rId{i}"/>' for i, (n, _) in enumerate(sheets, 1))
                                      + "</sheets></workbook>")
        z.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   + "".join(f'<Relationship Id="rId{i}" Type="{ns}/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, len(sheets) + 1))
                   + "</Relationships>")
        for i, (_, rows) in enumerate(sheets, 1):
            z.writestr(f"xl/worksheets/sheet{i}.xml", _sheet(rows))
