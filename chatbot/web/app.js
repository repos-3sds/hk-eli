// HK ELI Chatbot page: talks to /api/config, /api/health and /api/chat (Server-Sent Events).
(function () {
  const $ = (id) => document.getElementById(id);
  const md = window.ELIMarkdown;
  const els = {
    log: $("log"), empty: $("empty"), suggestions: $("suggestions"), persona: $("persona"), provider: $("provider"),
    form: $("composer"), q: $("question"), send: $("send"), stop: $("stop"), newChat: $("new-chat"),
    status: $("status-bar"), statusText: $("status-text"),
  };
  const state = { config: null, health: null, history: [], busy: false, controller: null };
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
  };
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const niceDate = (iso) => { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return `${d} ${months[m - 1]} ${y}`; };
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ---------------------------------------------------------------- boot
  async function boot() {
    try {
      const [config, health] = await Promise.all([fetch("/api/config").then(r => r.json()), fetch("/api/health").then(r => r.json())]);
      state.config = config; state.health = health;
      config.personas.forEach(p => els.persona.add(new Option(p.label, p.id)));
      els.persona.value = store.get("eli.persona") || "wms";
      config.providers.forEach(p => {
        const o = new Option(p.label + (p.ready ? "" : " (not available here)"), p.id);
        o.disabled = !p.ready; els.provider.add(o);
      });
      const saved = store.get("eli.provider");
      const savedOk = config.providers.some(p => p.id === saved && p.ready);
      els.provider.value = savedOk ? saved : config.default_provider;
      renderSuggestions();
      renderStatus();
    } catch (e) {
      setStatus("error", "Cannot reach the chatbot service. Check that it is running, then reload the page.");
      els.send.disabled = true;
    }
    els.q.focus();
  }

  function setStatus(kind, text) {
    els.status.classList.toggle("status-bar--error", kind === "error");
    els.status.querySelector(".status-dot").className = "status-dot" + (kind === "ok" ? "" : ` status-dot--${kind}`);
    els.statusText.textContent = text;
  }

  function renderStatus() {
    const h = state.health;
    if (!h.ok) {
      setStatus("error", h.skills && !h.skills.ok ? h.skills.detail : (h.data_error || "The book could not be read."));
      return;
    }
    const load = (h.freshness.loads || []).find(l => l.source === "eqd_master_outstanding");
    const loaded = load ? ` · loaded overnight ${load.loaded_at.slice(11, 16)} HKT` : "";
    const prov = (state.config.providers.find(p => p.id === els.provider.value) || {}).label || "";
    setStatus(els.provider.value === "offline" ? "warn" : "ok",
      `Book as of ${niceDate(h.freshness.as_of)}${loaded} · ${h.tools} tools · ${prov}`);
  }

  function renderSuggestions() {
    els.suggestions.innerHTML = "";
    (state.config.suggestions[els.persona.value] || []).forEach(s => els.suggestions.appendChild(chip(s)));
  }

  function chip(text) {
    const b = el("button", "chip"); b.type = "button"; b.textContent = text;
    b.addEventListener("click", () => ask(text));
    return b;
  }

  // ---------------------------------------------------------------- scrolling
  const nearBottom = () => els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 120;
  const toBottom = (force) => { if (force || nearBottom()) els.log.scrollTop = els.log.scrollHeight; };

  // ---------------------------------------------------------------- a turn
  function ask(text) {
    const question = (text || "").trim();
    if (!question || state.busy) return;
    els.empty.hidden = true;
    const u = el("div", "turn turn--user"); const b = el("div", "bubble"); b.textContent = question; u.appendChild(b);
    els.log.appendChild(u);
    const card = newCard();
    els.log.appendChild(card.root);
    toBottom(true);
    els.q.value = ""; autosize();
    run(question, card);
  }

  function newCard() {
    const root = el("div", "turn turn--bot");
    const box = el("article", "card"); box.setAttribute("aria-busy", "true");
    const who = el("div", "card__who", `<img src="/assets/brand-mark.svg" alt=""><span>HK ELI Chatbot</span>`);
    const steps = el("ul", "steps");
    const thinking = el("div", "thinking", "<span></span><span></span><span></span>");
    thinking.setAttribute("aria-label", "Working");
    const answer = el("div", "answer");
    box.append(who, steps, thinking, answer);
    root.appendChild(box);
    return { root, box, who, steps, thinking, answer, stepById: {}, buffer: "" };
  }

  function busy(on) {
    state.busy = on;
    els.send.hidden = on; els.stop.hidden = !on;
    els.persona.disabled = on; els.provider.disabled = on;
  }

  async function run(question, card) {
    busy(true);
    state.controller = new AbortController();
    let finished = false;
    try {
      const resp = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: state.controller.signal,
        body: JSON.stringify({ question, persona: els.persona.value, provider: els.provider.value, history: state.history }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = raw.split("\n").find(l => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "final" || ev.type === "error") finished = true;
          handle(ev, card, question);
        }
      }
      if (!finished) showError(card, "The answer stopped before it finished. Please ask again.", question);
    } catch (e) {
      if (e.name === "AbortError") showStopped(card, question);
      else showError(card, e.message || "Something went wrong.", question);
    } finally {
      busy(false);
      card.box.removeAttribute("aria-busy");
      state.controller = null;
      els.q.focus();
    }
  }

  function visibleText(t) { return t.replace(/\n?\s*FOLLOWUPS:[\s\S]*$/, "").replace(/\n?\s*FOLLOWUPS?:?\s*$/i, ""); }

  function handle(ev, card, question) {
    switch (ev.type) {
      case "start":
        card.who.querySelector("span").textContent = ev.written_by === "code" ? "HK ELI Chatbot · code answer" : "HK ELI Chatbot";
        break;
      case "tool_start": {
        const li = el("li", "step", `<span class="step__icon"><span class="spinner" aria-hidden="true"></span></span><span class="step__label"></span>`);
        li.querySelector(".step__label").textContent = ev.label + "…";
        card.steps.appendChild(li); card.stepById[ev.id] = li; toBottom();
        break;
      }
      case "tool_end": {
        const li = card.stepById[ev.id]; if (!li) break;
        const ok = !ev.error;
        li.classList.toggle("step--error", !ok);
        li.querySelector(".step__icon").innerHTML = ok ? '<span class="tick" aria-label="done">✓</span>' : '<span class="cross" aria-label="failed">✕</span>';
        li.querySelector(".step__label").innerHTML = `${md.escape(ev.title)} <span class="step__meta">· ${ok ? `${ev.rows} row${ev.rows === 1 ? "" : "s"}` : md.escape(ev.error)}</span>`;
        break;
      }
      case "delta":
        card.thinking.hidden = true;
        card.buffer += ev.text;
        card.answer.classList.add("answer--streaming");
        card.answer.innerHTML = md.render(visibleText(card.buffer));
        toBottom();
        break;
      case "discard":
        card.buffer = ""; card.answer.innerHTML = ""; card.thinking.hidden = false;
        break;
      case "final":
        finish(card, ev, question);
        break;
      case "error":
        showError(card, ev.message, question);
        break;
    }
  }

  function finish(card, ev, question) {
    card.thinking.hidden = true;
    card.answer.classList.remove("answer--streaming");
    card.answer.innerHTML = md.render(ev.answer);
    card.box.appendChild(checkLine(ev));
    if (ev.results && ev.results.length) card.box.appendChild(sources(ev.results));
    if (ev.followups && ev.followups.length) {
      const f = el("div", "followups", '<div class="followups__label">Ask next</div>');
      const c = el("div", "chips"); ev.followups.forEach(t => c.appendChild(chip(t))); f.appendChild(c);
      card.box.appendChild(f);
    }
    card.box.appendChild(metaLine(ev));
    state.history.push({ role: "user", text: question }, { role: "assistant", text: ev.answer });
    toBottom();
  }

  function checkLine(ev) {
    const c = ev.check || {};
    const line = el("div", "check");
    if (ev.written_by === "code") {
      line.innerHTML = '<span class="check__badge check__badge--code">Code answer</span><span>No model ran. Figures are copied from the data by code.</span>';
    } else if (c.status === "all-matched") {
      line.innerHTML = `<span class="check__badge check__badge--ok">Checked</span><span>All ${c.checked} figure${c.checked === 1 ? "" : "s"} match the book data.</span>`;
    } else if (c.status === "some-unmatched") {
      const list = c.unmatched.map(md.escape).join(", ");
      line.innerHTML = `<span class="check__badge check__badge--warn">Review</span><span>${c.matched} of ${c.checked} figures match the data. Not found as a single value: <strong>${list}</strong>. This can be a total the model worked out; check it before you use it.</span>`;
    } else {
      line.innerHTML = '<span class="check__badge check__badge--code">No figures</span><span>This answer has no figures to check.</span>';
    }
    return line;
  }

  const fmt = (v, kind) => {
    if (v == null || v === "") return "";
    if (typeof v === "number") {
      if (kind === "money") return "USD " + Math.round(v).toLocaleString("en-US");
      if (kind === "pct") return `${+v.toFixed(2)}%`;
      return v.toLocaleString("en-US");
    }
    return String(v);
  };

  function sources(results) {
    const d = el("details", "sources");
    const n = results.length;
    d.appendChild(el("summary", null, `Data used: ${n} source${n === 1 ? "" : "s"}`));
    results.forEach(r => {
      const s = el("div", "source");
      const total = r.total_rows != null ? r.total_rows : r.rows.length;
      s.innerHTML = `<div class="source__head"><span class="source__title">${md.escape(r.title)}</span>
        <span class="source__meta">${md.escape(r.source || "")} · as of ${md.escape(niceDate(r.as_of))} · ${total} row${total === 1 ? "" : "s"}</span></div>`;
      if (r.error) {
        s.appendChild(el("p", "source__meta", "Could not be read: " + md.escape(r.error)));
      } else if (r.rows.length) {
        const cols = r.columns.slice(0, 7);
        let h = '<div class="table-wrap"><table><thead><tr>';
        cols.forEach(c => { h += `<th${["money", "pct", "number"].includes(c.kind) ? ' class="num"' : ""}>${md.escape(c.label)}</th>`; });
        h += "</tr></thead><tbody>";
        r.rows.slice(0, 50).forEach(row => {
          h += "<tr>"; cols.forEach(c => { h += `<td${["money", "pct", "number"].includes(c.kind) ? ' class="num"' : ""}>${md.escape(fmt(row[c.key], c.kind))}</td>`; }); h += "</tr>";
        });
        s.appendChild(el("div", null, h + "</tbody></table></div>"));
      } else {
        s.appendChild(el("p", "source__meta", "No rows matched."));
      }
      d.appendChild(s);
    });
    return d;
  }

  function metaLine(ev) {
    const m = el("div", "meta");
    const who = ev.written_by === "code" ? "Written by code (no model)" : `Written by ${ev.provider} · ${ev.model}`;
    const tok = ev.usage && ev.usage.input_tokens ? ` · ${(ev.usage.input_tokens + (ev.usage.output_tokens || 0)).toLocaleString()} tokens` : "";
    const left = el("span", null, `${md.escape(who)} · ${(ev.ms / 1000).toFixed(1)}s${tok}`);
    const copy = el("button", "btn btn--link"); copy.type = "button"; copy.textContent = "Copy answer";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(ev.answer); copy.textContent = "Copied"; }
      catch { copy.textContent = "Copy not allowed here"; }
      setTimeout(() => { copy.textContent = "Copy answer"; }, 1600);
    });
    m.append(left, copy);
    return m;
  }

  function showError(card, message, question) {
    card.thinking.hidden = true;
    card.box.classList.add("card--error");
    card.answer.classList.remove("answer--streaming");
    const p = el("p", null); p.textContent = message;
    const retry = el("button", "btn btn--ghost"); retry.type = "button"; retry.textContent = "Try again";
    retry.addEventListener("click", () => { card.root.previousElementSibling?.remove(); card.root.remove(); ask(question); });
    card.answer.innerHTML = "<p><strong>I couldn't finish this answer.</strong></p>";
    card.answer.append(p, retry);
  }

  function showStopped(card, question) {
    card.thinking.hidden = true;
    card.answer.classList.remove("answer--streaming");
    const note = el("p", "source__meta"); note.textContent = "Stopped. Nothing was saved from this answer.";
    card.answer.appendChild(note);
  }

  // ---------------------------------------------------------------- composer
  function autosize() { els.q.style.height = "auto"; els.q.style.height = Math.min(els.q.scrollHeight, 160) + "px"; }
  els.q.addEventListener("input", autosize);
  els.q.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(els.q.value); }
  });
  els.form.addEventListener("submit", (e) => { e.preventDefault(); ask(els.q.value); });
  els.stop.addEventListener("click", () => state.controller && state.controller.abort());
  els.persona.addEventListener("change", () => { store.set("eli.persona", els.persona.value); renderSuggestions(); });
  els.provider.addEventListener("change", () => { store.set("eli.provider", els.provider.value); renderStatus(); });
  els.newChat.addEventListener("click", () => {
    if (state.busy) state.controller.abort();
    state.history = [];
    [...els.log.querySelectorAll(".turn")].forEach(t => t.remove());
    els.empty.hidden = false; els.q.focus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.busy) state.controller.abort();
  });

  boot();
})();
