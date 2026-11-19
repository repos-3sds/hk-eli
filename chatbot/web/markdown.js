// A small, safe Markdown renderer for answers: escapes all HTML first, then supports
// paragraphs, **bold**, *italic*, `code`, headings, bullet and numbered lists, and pipe tables.
(function () {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  const isNum = (s) => /^[-+]?(USD|HKD|\$)?\s?[-+]?[\d,.]+\s?(%|k|m|mn|bn|bp)?$/i.test(s.trim());
  const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  function table(lines) {
    const head = cells(lines[0]);
    const body = lines.slice(2).map(cells);
    const numCol = head.map((_, i) => body.length > 0 && body.every((r) => !r[i] || isNum(r[i])));
    let h = '<div class="table-wrap"><table><thead><tr>';
    head.forEach((c, i) => { h += `<th${numCol[i] ? ' class="num"' : ""}>${inline(c)}</th>`; });
    h += "</tr></thead><tbody>";
    body.forEach((r) => {
      h += "<tr>";
      head.forEach((_, i) => { h += `<td${numCol[i] ? ' class="num"' : ""}>${inline(r[i] || "")}</td>`; });
      h += "</tr>";
    });
    return h + "</tbody></table></div>";
  }

  function render(md) {
    const lines = (md || "").replace(/\r/g, "").split("\n");
    let out = "", i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const block = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) block.push(lines[i++]);
        out += table(block);
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { out += `<h4>${inline(h[2])}</h4>`; i++; continue; }
      if (/^\s*[-*•]\s+/.test(line)) {
        out += "<ul>";
        while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) out += `<li>${inline(lines[i++].replace(/^\s*[-*•]\s+/, ""))}</li>`;
        out += "</ul>";
        continue;
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        out += "<ol>";
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) out += `<li>${inline(lines[i++].replace(/^\s*\d+[.)]\s+/, ""))}</li>`;
        out += "</ol>";
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s|#{1,4}\s)/.test(lines[i])) para.push(lines[i++]);
      if (para.length) out += `<p>${para.map(inline).join("<br>")}</p>`;
      else { out += `<p>${inline(lines[i++])}</p>`; }
    }
    return out;
  }

  window.ELIMarkdown = { render, escape: esc };
})();
