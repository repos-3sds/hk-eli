// Shared rendering for the HK ELI Chatbot POC. No framework, no build step.
(() => {
const STATUS = {
  OK: ["Answered", "b-ok"],
  OK_WITH_WARNING: ["Answered with caveats", "b-warn"],
  OK_FALLBACK: ["Short answer", "b-warn"],
  PARTIAL: ["Partial", "b-warn"],
  NO_DATA: ["No data", "b-info"],
  NEEDS_CLARIFICATION: ["Needs clarification", "b-info"],
  UNSUPPORTED: ["Can't answer", "b-bad"],
  VALIDATION_FAILED: ["Failed checks", "b-bad"],
  SYSTEM_ERROR: ["System error", "b-bad"],
};
const CAVEAT_LABEL = {
  AS_OF_UNKNOWN: "DATA DATE", STALE_DATA: "STALE DATA", PREDICTIVE: "PREDICTED", DATE_LIST_WORKAROUND: "WORKAROUND",
  WINDOW_NOT_SUPPORTED: "WINDOW", POPULATION_UNDECLARED: "POPULATION", HIDDEN_RULE: "HIDDEN RULE",
  CONTROL_TOTAL_MISMATCH: "TOTALS DON'T RECONCILE", CONTROL_TOTAL_OK: "TOTALS RECONCILE", REGISTRY_COLLISION: "DUPLICATE VIEW ID",
  TABLE_CALC_NOT_EXPORTED: "CALC NOT EXPORTED", SCOPE_MISMATCH: "CHART SCOPE", MEASURE_NOT_PUBLISHED: "NO CUSTOMER COUNT",
  TRE_ONLY: "TRE ONLY",
};

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}

function isNum(s) { return /^(HKD |-)?[\d,.]+(m|bn|k|%)?$/.test(String(s)); }

function renderAnswer(a, opts = {}) {
  const [label, cls] = STATUS[a.status] || [a.status, "b-info"];
  const card = el("article", { class: "card", "aria-label": "Answer" });
  const top = el("div", { class: "card-top" }, el("span", { class: `badge ${cls}` }, label),
    a.scope ? el("span", { class: "scope" }, a.scope) : null);
  if (a.embed && opts.onShow) top.append(el("button", { class: "paneBtn", type: "button", title: "Load the live Tableau view with the same filters",
    onclick: () => opts.onShow(a) }, "Open in Tableau ↗"));
  card.append(top, el("p", { class: "headline" }, a.headline || ""));
  const chart = window.AnswerChart && a.chart ? window.AnswerChart.render(a.chart) : null;
  if (chart) card.append(chart);
  if (a.bullets && a.bullets.length) card.append(el("ul", { class: "bullets" }, a.bullets.map(b => el("li", {}, b))));
  if (a.table && a.table.rows && a.table.rows.length) {
    const host = chart ? el("details", { class: "ev tbl", open: "" }, el("summary", {}, "Show the numbers as a table")) : card;
    if (chart) card.append(host);
    const t = el("table", { class: "t" });
    t.append(el("thead", {}, el("tr", {}, a.table.columns.map((c, i) => el("th", { class: a.table.rows[0] && isNum(a.table.rows[0][i]) ? "n" : null }, c)))));
    t.append(el("tbody", {}, a.table.rows.slice(0, opts.maxRows || 8).map(r => el("tr", {}, r.map(v => el("td", { class: isNum(v) ? "n" : null }, v))))));
    host.append(el("div", { class: "twrap" }, t));
    const hidden = (a.table.rows.length - (opts.maxRows || 8)) + (a.table.more || 0);
    if (hidden > 0) host.append(el("div", { class: "more" }, `+ ${hidden} more rows in the view`));
  }
  const cvs = (a.caveats || []).filter(c => (opts.showInfo !== false || c.level !== "info") && c.text !== a.headline);
  if (cvs.length) card.append(el("div", { class: "caveats" }, cvs.map(c =>
    el("div", { class: `cv ${c.level}` }, el("b", {}, CAVEAT_LABEL[c.code] || c.code), c.text))));
  if (a.as_of) {
    const ao = a.as_of.known
      ? `Data as of ${a.as_of.business_date} · refreshed ${String(a.as_of.last_refresh).replace("T", " ")}`
      : "Data as of: not published by the workbook";
    card.append(el("div", { class: "asof" }, el("span", {}, ao),
      a.evidence && a.evidence[0] ? el("span", {}, `Source: ${a.evidence[0].view}`) : null));
  }
  if (a.followups && a.followups.length && opts.onAsk) card.append(el("div", { class: "chips" },
    a.followups.map(f => el("button", { class: "chip", type: "button", onclick: () => opts.onAsk(f) }, f))));
  // Evidence: what was asked of Tableau, and the pipeline steps.
  if (a.evidence && a.evidence.length) {
    const d = el("details", { class: "ev", open: "" }, el("summary", {}, "Evidence: view, filters and request"));
    for (const e of a.evidence) {
      d.append(el("dl", { class: "kv" },
        el("dt", {}, e.purpose ? "Check" : "View"), el("dd", {}, `${e.view} (${e.record_id})`),
        el("dt", {}, "Request"), el("dd", { class: "mono" }, decodeURIComponent(e.request)),
        el("dt", {}, "Rows"), el("dd", {}, String(e.row_count)),
        e.asserted && e.asserted.length ? [el("dt", {}, "Proven by catalog"), el("dd", {}, e.asserted.join("; "))] : null,
        e.window ? [el("dt", {}, "Window"), el("dd", {}, e.window)] : null));
    }
    if (a.embed) d.append(el("dl", { class: "kv" }, el("dt", {}, "Embed"), el("dd", { class: "mono" }, decodeURIComponent(a.embed.url)),
      el("dt", {}, "Same scope"), el("dd", {}, a.embed.scope_equivalent ? "Yes" : `No: cannot apply ${a.embed.cannot_apply.join(", ")}`)));
    card.append(d);
  }
  if (a.trace && a.trace.length) {
    const d = el("details", { class: "ev", open: "" }, el("summary", {}, `Pipeline: ${a.trace.length} steps`));
    d.append(el("ol", { class: "steps" }, a.trace.map(s => el("li", {}, el("span", { class: "no" }, s.n), el("span", { class: "nm" }, s.name),
      el("span", { class: "dt" }, JSON.stringify(s.detail)), el("span", { class: "ms" }, `${s.ms} ms`)))));
    card.append(d);
  }
  return card;
}

window.POC = { el, renderAnswer, STATUS };
})();
