"""Server-side rendering of a mock Tableau view as inline SVG / HTML.

Used by the mock embed page and by the static export, so both show the same
picture for the same filter spec.
"""
from __future__ import annotations

import html
from collections import defaultdict

RESULT_COLOURS = {"KO": "#3d8bfd", "EXP": "#6f7d91", "EXP(Below Strike)": "#ef6b4a", "EX": "#2bb3a3"}  # same as chart.js and the workbook
RESULT_ORDER = ["KO", "EXP", "EXP(Below Strike)", "EX"]
INK = "#c9d1dc"
MUTED = "#8a96a8"
GRID = "#2a3342"


def money(x: float) -> str:
    a = abs(x)
    if a >= 1e9:
        return f"HKD {x / 1e9:.2f}bn"
    if a >= 1e6:
        return f"HKD {x / 1e6:.1f}m"
    if a >= 1e3:
        return f"HKD {x / 1e3:.0f}k"
    return f"HKD {x:.0f}"


def _esc(s) -> str:
    return html.escape(str(s))


def _legend(results) -> str:
    items = "".join(
        f'<span class="lg"><i style="background:{RESULT_COLOURS.get(r, "#888")}"></i>{_esc(r)}</span>'
        for r in RESULT_ORDER if r in results)
    return f'<div class="legend">{items}<span class="lg muted">Predicted result</span></div>' if items else ""


def _col(cols, name):
    return cols.index(name) if name in cols else None


def render(view: dict, cols: list[str], rows: list[list[str]], highlight: list[str] | None = None) -> str:
    highlight = set(highlight or [])
    kind = view["kind"]
    if not rows or (kind != "kpi" and not rows[0]):
        return '<div class="empty">No marks for this filter selection.</div>'
    if kind == "kpi":
        return _kpi(cols, rows)
    if kind == "table":
        return _table(cols, rows)
    if kind == "calendar":
        return _calendar(cols, rows)
    if kind == "bubble":
        return _bubble(cols, rows, highlight)
    return _bars(view, cols, rows, highlight)


def _kpi(cols, rows):
    cells = []
    for i, c in enumerate(cols):
        v = rows[0][i] if rows and i < len(rows[0]) else ""
        shown = money(float(v)) if c == "Volume Bu" and v else (v or "–")
        cells.append(f'<div class="kpi"><div class="kpi-label">{_esc(c)}</div><div class="kpi-value">{_esc(shown)}</div></div>')
    return f'<div class="kpis">{"".join(cells)}</div>'


def _table(cols, rows, limit=40):
    head = "".join(f"<th>{_esc(c)}</th>" for c in cols)
    body = []
    for r in rows[:limit]:
        tds = []
        for c, v in zip(cols, r):
            if c in ("Volume Bu",):
                v = f"{float(v):,.0f}"
            tds.append(f"<td>{_esc(v)}</td>")
        body.append(f"<tr>{''.join(tds)}</tr>")
    more = f'<div class="rowcount"><b>{len(rows)}</b> rows in this view' + (f' · first {limit} shown' if len(rows) > limit else '') + '</div>'
    return f'{more}<div class="tablewrap"><table class="vt"><thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table></div>'


def _bars(view, cols, rows, highlight):
    vi = _col(cols, "Volume Bu")
    ri = _col(cols, "Predict Result")
    label_idx = [i for i, c in enumerate(cols) if c in ("Bp Div Type", "Cust District", "Cust Branch", "Wps") ]
    # For branch view, label with branch only; district is grouping context.
    if "Cust Branch" in cols:
        label_idx = [cols.index("Cust District"), cols.index("Cust Branch")]
    stacks: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    results = set()
    for r in rows:
        label = " · ".join(r[i] for i in label_idx) if label_idx else "All"
        res = r[ri] if ri is not None else "_"
        results.add(res)
        stacks[label][res] += float(r[vi] or 0)
    items = sorted(stacks.items(), key=lambda kv: -sum(kv[1].values()))[:16]
    mx = max(sum(s.values()) for _, s in items) or 1
    bar_h, gap, lw, w = 20, 8, 190, 620
    h = len(items) * (bar_h + gap) + 10
    parts = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for n, (label, s) in enumerate(items):
        y = n * (bar_h + gap) + 4
        hl = any(x in highlight for x in label.split(" · "))
        parts.append(f'<text x="{lw - 8}" y="{y + 14}" text-anchor="end" fill="{"#fff" if hl else INK}" '
                     f'font-weight="{"700" if hl else "400"}" font-size="12">{_esc(label)}</text>')
        x = lw
        order = RESULT_ORDER if ri is not None else ["_"]
        for res in order:
            if res not in s:
                continue
            bw = (w - lw - 90) * s[res] / mx
            colour = RESULT_COLOURS.get(res, "#4f8ff7")
            parts.append(f'<rect x="{x:.1f}" y="{y}" width="{max(bw, 0.5):.1f}" height="{bar_h}" fill="{colour}" '
                         f'opacity="{1 if (hl or not highlight) else 0.45}"><title>{_esc(label)} · {_esc(res)} · {money(s[res])}</title></rect>')
            x += bw
        parts.append(f'<text x="{x + 6:.1f}" y="{y + 14}" fill="{MUTED}" font-size="11">{money(sum(s.values()))}</text>')
    parts.append("</svg>")
    return (_legend(results) if ri is not None else "") + "".join(parts)


def _calendar(cols, rows):
    di, ri, vi = cols.index("Predict Maturity"), cols.index("Predict Result"), cols.index("Volume Bu")
    days: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    results = set()
    for r in rows:
        days[r[di]][r[ri]] += float(r[vi] or 0)
        results.add(r[ri])
    keys = sorted(days)
    mx = max(sum(v.values()) for v in days.values()) or 1
    w, h, top, bottom = 640, 220, 10, 40
    bw = max(3.0, (w - 40) / max(len(keys), 1) - 2)
    parts = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">',
             f'<line x1="30" y1="{h - bottom}" x2="{w}" y2="{h - bottom}" stroke="{GRID}"/>']
    for n, k in enumerate(keys):
        x = 32 + n * (bw + 2)
        y = h - bottom
        for res in RESULT_ORDER:
            if res not in days[k]:
                continue
            bh = (h - top - bottom) * days[k][res] / mx
            y -= bh
            parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{bh:.1f}" fill="{RESULT_COLOURS[res]}">'
                         f'<title>{k} · {res} · {money(days[k][res])}</title></rect>')
        if n % max(1, len(keys) // 8) == 0:
            parts.append(f'<text x="{x:.1f}" y="{h - bottom + 16}" fill="{MUTED}" font-size="10">{k[5:]}</text>')
    parts.append(f'<text x="2" y="{top + 10}" fill="{MUTED}" font-size="10">{money(mx)}</text></svg>')
    return _legend(results) + "".join(parts)


def _bubble(cols, rows, highlight):
    bi, wi, ri = cols.index("MTM% (bin)"), cols.index("Wps"), cols.index("Predict Result")
    ci, vi = cols.index("Count of Asset Id"), cols.index("Volume Bu")
    pts = [(int(r[bi].rstrip("%")), r[wi], r[ri], int(r[ci]), float(r[vi])) for r in rows]
    xs = [p[0] for p in pts]
    xmin, xmax = min(xs) - 5, max(xs) + 5
    ymax = max(p[3] for p in pts) + 1
    vmax = max(p[4] for p in pts) or 1
    w, h, pad = 640, 230, 30
    parts = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">',
             f'<line x1="{pad}" y1="{h - pad}" x2="{w - 10}" y2="{h - pad}" stroke="{GRID}"/>']
    for t in range((xmin // 10) * 10, xmax + 1, 10):
        x = pad + (t - xmin) / (xmax - xmin) * (w - pad - 20)
        parts.append(f'<text x="{x:.0f}" y="{h - pad + 14}" fill="{MUTED}" font-size="10" text-anchor="middle">{t}%</text>')
    results = set()
    # Draw highlighted marks last so they sit on top.
    for b, wps, res, cnt, vol in sorted(pts, key=lambda p: (p[1] in highlight, -p[4])):
        results.add(res)
        x = pad + (b + 2.5 - xmin) / (xmax - xmin) * (w - pad - 20)
        y = h - pad - cnt / ymax * (h - 2 * pad)
        r = 4 + 16 * (vol / vmax) ** 0.5
        hl = wps in highlight
        op = 0.85 if (hl or not highlight) else 0.2
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{RESULT_COLOURS.get(res, "#888")}" opacity="{op}">'
                     f'<title>{res} · MTM% (bin) {b}% · WPS {wps} · Deal Count {cnt} · {money(vol)}</title></circle>')
        if hl or (not highlight and r > 11):
            parts.append(f'<text x="{x:.1f}" y="{y + 3:.1f}" fill="#0d1117" font-size="9" text-anchor="middle">{_esc(wps)}</text>')
    parts.append(f'<text x="{w / 2}" y="{h - 4}" fill="{MUTED}" font-size="10" text-anchor="middle">MTM% (bin) of worst-performing stock · y = deal count · size = HKD</text></svg>')
    return _legend(results) + "".join(parts)
