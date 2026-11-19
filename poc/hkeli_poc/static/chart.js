// Our own answer charts, drawn from the chart spec the pipeline builds from the Tableau view rows.
// Same numbers as the live Tableau view; our design tokens and sizes. No libraries.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const RESULT_CLASS = { "KO": "r-ko", "EXP": "r-exp", "EXP(Below Strike)": "r-bs", "EX": "r-ex", "All": "r-all" };
  const RESULT_LABEL = { "KO": "KO", "EXP": "Expiry", "EXP(Below Strike)": "Expiry below strike", "EX": "Exercised", "All": "" };

  function h(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) n.setAttribute(k, v);
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  }
  function s(tag, attrs = {}, ...kids) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  }
  function hkd(x, unit) {
    if (unit === "customers") return `${Math.round(x)}`;
    const a = Math.abs(x);
    if (a >= 1e9) return `HKD ${(x / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `HKD ${(x / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `HKD ${(x / 1e3).toFixed(0)}K`;
    return `HKD ${Math.round(x)}`;
  }
  function legend(results) {
    const shown = results.filter(r => r !== "All");
    if (!shown.length) return null;
    return h("div", { class: "ch-legend" }, shown.map(r => h("span", {}, h("i", { class: RESULT_CLASS[r] || "r-all" }), RESULT_LABEL[r] || r)));
  }
  function resultsIn(cats) {
    const seen = new Set();
    cats.forEach(c => c.parts.forEach(p => seen.add(p.result)));
    return ["KO", "EXP", "EXP(Below Strike)", "EX", "All"].filter(r => seen.has(r));
  }

  function kpi(spec) {
    return h("div", { class: "ch-kpi" }, h("div", { class: "ch-kpi-v" }, hkd(spec.value)),
      h("div", { class: "ch-kpi-l" }, spec.label));
  }

  // Horizontal bars, one row per category, stacked by predicted result. Highlighted rows stay full strength.
  function hbar(spec) {
    const cats = spec.categories;
    const max = Math.max(...cats.map(c => c.total), 1);
    const hl = new Set(spec.highlight || []);
    const rows = h("div", { class: "ch-rows", role: "list" });
    for (const c of cats) {
      const dim = hl.size && !hl.has(c.key);
      const bar = h("div", { class: "ch-bar" });
      for (const p of c.parts) {
        if (p.value <= 0) continue;
        bar.append(h("span", { class: RESULT_CLASS[p.result] || "r-all", style: `width:${(100 * p.value / max).toFixed(2)}%`,
          title: `${c.label}${p.result !== "All" ? " · " + (RESULT_LABEL[p.result] || p.result) : ""}: ${hkd(p.value, spec.unit)}` }));
      }
      rows.append(h("div", { class: `ch-row${dim ? " dim" : ""}${hl.has(c.key) ? " hl" : ""}`, role: "listitem" },
        h("span", { class: "ch-lab", title: c.label }, c.label), bar,
        h("span", { class: "ch-val" }, hkd(c.total, spec.unit), c.note ? h("small", {}, " " + c.note) : null)));
    }
    return h("div", {}, rows, spec.more ? h("div", { class: "ch-more" }, `+ ${spec.more} more in the view`) : null,
      spec.stacked ? legend(resultsIn(cats)) : null);
  }

  // Vertical stacked columns over dates.
  function columns(spec) {
    const cats = spec.categories, W = 560, H = 190, L = 44, B = 22, T = 6;
    const max = Math.max(...cats.map(c => c.total), 1);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "ch-svg", role: "img", "aria-label": spec.title });
    const step = (W - L) / cats.length, bw = Math.max(2, Math.min(18, step * 0.72));
    for (let g = 0; g <= 3; g++) {
      const v = (max * g) / 3, y = H - B - ((H - B - T) * g) / 3;
      svg.append(s("line", { x1: L, x2: W, y1: y, y2: y, class: "ch-grid" }),
        s("text", { x: L - 6, y: y + 3, class: "ch-axis", "text-anchor": "end" }, hkd(v).replace("HKD ", "")));
    }
    const every = Math.ceil(cats.length / 8);
    cats.forEach((c, n) => {
      let y = H - B;
      const x = L + n * step + (step - bw) / 2;
      for (const p of c.parts) {
        const hgt = ((H - B - T) * p.value) / max;
        y -= hgt;
        svg.append(s("rect", { x, y, width: bw, height: Math.max(0, hgt), class: RESULT_CLASS[p.result] || "r-all" },
          s("title", {}, `${c.label} · ${RESULT_LABEL[p.result] || p.result}: ${hkd(p.value)}`)));
      }
      if (n % every === 0) svg.append(s("text", { x: x + bw / 2, y: H - 6, class: "ch-axis", "text-anchor": "middle" }, c.label));
    });
    return h("div", {}, svg, legend(resultsIn(cats)));
  }

  // Bubbles: x = MTM% bin, y = deal count, area = HKD, colour = predicted result. Labels only on highlighted WPS.
  function bubble(spec) {
    const pts = spec.points, W = 560, H = 230, L = 34, B = 26, T = 10, R = 10;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x0 = Math.min(...xs) - 5, x1 = Math.max(...xs) + 5, y1 = Math.max(...ys, 1) * 1.1;
    const smax = Math.max(...pts.map(p => p.size), 1);
    const X = v => L + ((W - L - R) * (v - x0)) / (x1 - x0), Y = v => H - B - ((H - B - T) * v) / y1;
    // One WPS on the chart: every bubble is that stock, so labels add nothing.
    const single = new Set(pts.map(p => p.label)).size <= 1;
    const hl = new Set(single ? [] : (spec.highlight || []));
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "ch-svg", role: "img", "aria-label": spec.title });
    for (let g = 0; g <= 3; g++) {
      const v = Math.round((y1 * g) / 3), y = Y(v);
      svg.append(s("line", { x1: L, x2: W - R, y1: y, y2: y, class: "ch-grid" }), s("text", { x: L - 6, y: y + 3, class: "ch-axis", "text-anchor": "end" }, v));
    }
    for (let v = Math.ceil(x0 / 10) * 10; v <= x1; v += 10) svg.append(s("text", { x: X(v), y: H - 8, class: "ch-axis", "text-anchor": "middle" }, `${v}%`));
    const sorted = [...pts].sort((a, b) => (hl.has(a.label) - hl.has(b.label)) || b.size - a.size);
    for (const p of sorted) {
      const on = !hl.size || hl.has(p.label);
      svg.append(s("circle", { cx: X(p.x), cy: Y(p.y), r: 3 + 13 * Math.sqrt(p.size / smax), class: `${RESULT_CLASS[p.result] || "r-all"} ch-dot${on ? "" : " dim"}` },
        s("title", {}, `${p.label} · ${p.x}% · ${RESULT_LABEL[p.result] || p.result} · ${p.y} deals · ${hkd(p.size)}`)));
      if (hl.size && hl.has(p.label)) svg.append(s("text", { x: X(p.x), y: Y(p.y) - 6 - 13 * Math.sqrt(p.size / smax), class: "ch-plab", "text-anchor": "middle" }, p.label));
    }
    return h("div", {}, svg, legend(["KO", "EXP", "EXP(Below Strike)", "EX"].filter(r => pts.some(p => p.result === r))));
  }

  function render(spec) {
    if (!spec) return null;
    const body = { kpi, hbar, columns, bubble }[spec.kind];
    if (!body) return null;
    return h("figure", { class: `ch ch-${spec.kind}` }, spec.title ? h("figcaption", {}, spec.title) : null, body(spec));
  }

  window.AnswerChart = { render, hkd };
})();
