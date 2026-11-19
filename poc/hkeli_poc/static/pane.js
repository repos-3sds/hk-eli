// Evidence pane: shows the Tableau view behind an answer.
// mock mode: an iframe to the mock server's view page.
// real mode: Tableau Embedding API v3 <tableau-viz>, signed with a Connected App token for the user,
//            filtered with the same filters the data query used, the answer's marks highlighted,
//            and mark selection offered back as a follow-up question.
(() => {
  let cfg = null, scriptLoading = null;

  async function config() {
    if (!cfg) {
      try { cfg = await (await fetch("/api/embed/config")).json(); } catch { cfg = { mode: "mock" }; }
    }
    return cfg;
  }

  function loadScript(src) {
    if (!scriptLoading) {
      scriptLoading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.type = "module"; s.src = src;
        s.onload = () => customElements.whenDefined("tableau-viz").then(resolve);
        s.onerror = () => reject(new Error("Tableau's embedding script didn't load from " + src));
        document.head.append(s);
      });
    }
    return scriptLoading;
  }

  function message(host, title, detail) {
    const box = Object.assign(document.createElement("div"), { className: "pane-empty" });
    const inner = document.createElement("div");
    inner.append(Object.assign(document.createElement("div"), { textContent: title }));
    if (detail) inner.append(Object.assign(document.createElement("p"), { className: "scope", textContent: detail }));
    box.append(inner);
    host.replaceChildren(box);
  }

  // Turn a selected mark into a follow-up question the pipeline understands (hint only, never evidence).
  function markQuestion(row) {
    if (row["Cust Branch"]) return `Show the clients behind ${row["Cust Branch"]} maturing in the next 30 days`;
    if (row["Predict Maturity"]) {
      const d = new Date(row["Predict Maturity"]);
      if (!isNaN(d)) return `Give me the client and RM list for the ${d.getDate()} ${d.toLocaleString("en", { month: "short" })} maturity`;
    }
    if (row["Cust District"] && row["Cust District"] !== "Null") return `Which branches in ${row["Cust District"].replace("TRE-", "")} have the largest TRE maturity in the next 30 days?`;
    if (row["Wps"]) return `Show me the distribution on ${row["Wps"]}`;
    return null;
  }

  async function showReal(host, a, onAsk) {
    const c = await config();
    message(host, "Loading the Tableau view…");
    try { await loadScript(c.script); }
    catch (e) { message(host, "Couldn't load Tableau.", e.message + ". Check that this browser can reach your Tableau site."); return; }
    let token;
    try { token = (await (await fetch("/api/embed/token")).json()).token; }
    catch { message(host, "Couldn't get a sign-in token for Tableau.", "The chatbot service didn't return one."); return; }

    const viz = document.createElement("tableau-viz");
    viz.id = "tableauViz";
    viz.setAttribute("src", a.embed.src);
    viz.setAttribute("token", token);
    viz.setAttribute("toolbar", "hidden");
    viz.setAttribute("hide-tabs", "");
    viz.setAttribute("width", "100%");
    viz.setAttribute("height", "100%");
    for (const [field, values] of Object.entries(a.embed.filters_by_caption || {})) {
      const f = document.createElement("viz-filter");
      f.setAttribute("field", field);
      f.setAttribute("value", values.join(","));
      viz.append(f);
    }
    viz.addEventListener("firstinteractive", async () => {
      if (a.embed.highlight && a.embed.highlight.length && a.embed.highlight_caption) {
        try {
          await viz.workbook.activeSheet.selectMarksByValueAsync(
            [{ fieldName: a.embed.highlight_caption, value: a.embed.highlight }], "select-replace");
        } catch (e) { console.warn("highlight failed", e); }
      }
    });
    viz.addEventListener("markselectionchanged", async ev => {
      try {
        const marks = await ev.detail.getMarksAsync();
        const t = marks.data && marks.data[0];
        if (!t || !t.data.length) return;
        const row = Object.fromEntries(t.columns.map((col, i) => [col.fieldName, t.data[0][i].formattedValue]));
        const q = markQuestion(row);
        if (q && onAsk) offer(host, q, onAsk);
      } catch (e) { console.warn("mark read failed", e); }
    });
    viz.addEventListener("vizloaderror", ev => {
      let why = "";
      try { why = JSON.parse(ev.detail.message).statusCode; } catch { why = ev.detail && ev.detail.errorCode; }
      message(host, "Tableau refused to show this view.",
        `Check the view exists in the workbook, the Connected App is enabled, and its domain allowlist includes this site. (${why || "no detail"})`);
    });
    host.replaceChildren(viz);
  }

  function offer(host, q, onAsk) {
    host.querySelector(".mark-ask")?.remove();
    const b = Object.assign(document.createElement("button"), { className: "chip mark-ask", type: "button", textContent: "Ask: " + q });
    b.addEventListener("click", () => { b.remove(); onAsk(q); });
    host.append(b);
  }

  async function show(host, a, onAsk) {
    if (!a || !a.embed) return false;
    const c = await config();
    if (c.mode === "real" && a.embed.mode === "real") { await showReal(host, a, onAsk); return true; }
    const f = document.createElement("iframe");
    f.title = "Embedded Tableau view"; f.src = a.embed.url;
    host.replaceChildren(f);
    return true;
  }

  window.Pane = { show, config };
})();
