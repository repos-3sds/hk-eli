package hk.eli.gateway.agents;

import com.fasterxml.jackson.databind.JsonNode;
import hk.eli.gateway.chat.ChatModels.Block;
import hk.eli.gateway.chat.ChatModels.BulletsBlock;
import hk.eli.gateway.chat.ChatModels.ChatAnswer;
import hk.eli.gateway.chat.ChatModels.Evidence;
import hk.eli.gateway.chat.ChatModels.TableBlock;
import hk.eli.gateway.chat.ChatModels.TextBlock;
import hk.eli.gateway.chat.ChatService;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Turns the agents' final event into our chat answer. The model's Markdown becomes the typed blocks the Chat screen
 * already draws (paragraphs, bullet lists, tables), so the card looks the same whoever answered. Each tool result
 * becomes an evidence record; figures the code check could not find in the data are listed under the answer.
 */
@Component
public class AgentAnswerMapper {
  static final List<String> DEFAULT_FOLLOW_UPS = List.of("Top concentrations against limit", "Who matures this week?", "Which knock-outs are close to the barrier?");
  static final int MAX_TABLE_ROWS = 15;
  private static final Pattern NUMERIC_CELL = Pattern.compile("^[-+]?(USD|HKD)?\\s?[-+]?[\\d,.]+\\s?(%|m|bn|k|bp|bps)?$", Pattern.CASE_INSENSITIVE);
  private static final Pattern LIST_ITEM = Pattern.compile("^\\s*(?:[-*•]|\\d+[.)])\\s+(.*)$");
  private static final Pattern TABLE_RULE = Pattern.compile("^\\|?\\s*:?-{2,}:?\\s*(\\|\\s*:?-{2,}:?\\s*)*\\|?\\s*$");

  public ChatAnswer map(String id, JsonNode fin) {
    JsonNode results = fin.path("results");
    String firstTitle = null;
    for (JsonNode r : results) {
      if (r.path("error").isNull() || r.path("error").isMissingNode()) {
        firstTitle = r.path("title").asText(null);
        break;
      }
    }
    List<Block> blocks = blocksFromMarkdown(fin.path("answer").asText(""), firstTitle);
    if (blocks.stream().noneMatch(b -> b instanceof TableBlock)) {
      TableBlock t = firstResultTable(results);
      if (t != null) {
        blocks.add(t);
      }
    }
    List<String> followUps = new ArrayList<>();
    fin.path("followups").forEach(f -> followUps.add(f.asText()));
    Set<String> sources = new LinkedHashSet<>();
    List<Evidence> evidence = new ArrayList<>();
    Set<String> limitations = new LinkedHashSet<>();
    boolean partial = false;
    int n = 0;
    for (JsonNode r : results) {
      n++;
      String err = r.path("error").isTextual() ? r.path("error").asText() : null;
      if (err != null) {
        partial = true;
        limitations.add("A lookup failed (" + r.path("title").asText(r.path("tool").asText()) + "): " + err);
        continue;
      }
      sources.add(r.path("source").asText());
      int rows = r.path("total_rows").isInt() ? r.path("total_rows").asInt() : r.path("rows").size();
      evidence.add(new Evidence("a" + n, r.path("title").asText(), rows + (rows == 1 ? " row" : " rows"), null,
          r.path("as_of").asText(null), "MOCK", r.path("source").asText(), "Whole HK book"));
      r.path("warnings").forEach(w -> limitations.add(w.asText()));
    }
    sources.add("ELI book, SQLite");
    JsonNode check = fin.path("check");
    Set<String> unmatched = new LinkedHashSet<>();
    check.path("unmatched").forEach(u -> unmatched.add(u.asText()));
    if (!unmatched.isEmpty()) {
      limitations.add("Not found as-is in the data (worked out by the model, or a slip), check before use: " + String.join(", ", unmatched) + ".");
    }
    return new ChatAnswer(id, blocks, followUps.isEmpty() ? DEFAULT_FOLLOW_UPS : followUps, fin.path("as_of").asText(null), List.copyOf(sources),
        false, null, null, "MOCK", partial ? "partial" : "complete", limitations.isEmpty() ? null : List.copyOf(limitations), evidence.isEmpty() ? null : evidence,
        origin(fin, evidence.size()));
  }

  static String origin(JsonNode fin, int lookups) {
    JsonNode check = fin.path("check");
    String checked = check.path("checked").asInt() == 0 ? "no figures to check"
        : "figures checked by code: " + check.path("matched").asInt() + " of " + check.path("checked").asInt() + " found in the data";
    String what = lookups == 0 ? "no lookups" : lookups == 1 ? "1 lookup" : lookups + " lookups";
    if ("code".equals(fin.path("written_by").asText())) {
      return "HK ELI agents · code answer, no model · " + what + " · " + checked;
    }
    return "HK ELI agents · written by AI (" + fin.path("model").asText(fin.path("provider").asText("model")) + ") from " + what + " · " + checked;
  }

  // --- Markdown to blocks ---------------------------------------------------------------------------

  static List<Block> blocksFromMarkdown(String md, String defaultTableTitle) {
    List<Block> out = new ArrayList<>();
    List<String> para = new ArrayList<>();
    List<String> items = new ArrayList<>();
    List<String> table = new ArrayList<>();
    String title = null;
    String[] lines = md.replace("\r", "").split("\n", -1);
    for (String raw : lines) {
      String line = raw.strip();
      boolean isTable = line.startsWith("|");
      var li = LIST_ITEM.matcher(raw);
      boolean isItem = !isTable && li.matches();
      boolean isHeading = line.startsWith("#");
      if (!isTable && !table.isEmpty()) {
        addTable(out, table, title != null ? title : defaultTableTitle);
        table.clear();
        title = null;
      }
      if (!isItem && !items.isEmpty() && !line.isEmpty()) {
        out.add(new BulletsBlock(title == null ? "" : title, List.copyOf(items)));
        items.clear();
        title = null;
      }
      // A lead-in ending with a colon waits across blank lines for the list or table it names.
      boolean leadInWaits = line.isEmpty() && !para.isEmpty() && para.get(para.size() - 1).endsWith(":");
      if ((line.isEmpty() && !leadInWaits) || isTable || isItem || isHeading) {
        if (!para.isEmpty()) {
          String text = String.join(" ", para);
          para.clear();
          // A short lead-in ending with a colon names the list or table that follows.
          if ((isTable || isItem) && text.endsWith(":") && text.length() <= 80) {
            title = leadInTitle(text.substring(0, text.length() - 1));
          } else {
            out.add(new TextBlock(text));
          }
        }
      }
      if (isTable) {
        table.add(line);
      } else if (isItem) {
        items.add(inline(li.group(1)));
      } else if (isHeading) {
        title = inline(line.replaceFirst("^#+\\s*", ""));
      } else if (!line.isEmpty()) {
        para.add(inline(line));
      }
    }
    if (!table.isEmpty()) {
      addTable(out, table, title != null ? title : defaultTableTitle);
    }
    if (!items.isEmpty()) {
      out.add(new BulletsBlock(title == null ? "" : title, List.copyOf(items)));
    }
    if (!para.isEmpty()) {
      out.add(new TextBlock(String.join(" ", para)));
    }
    if (out.isEmpty()) {
      out.add(new TextBlock("The agents returned no answer text."));
    }
    return out;
  }

  /** "Here are the top underlyings by exposure" reads as "Top underlyings by exposure" above a table. */
  static String leadInTitle(String text) {
    String t = text.replaceFirst("(?i)^(here (are|is)|below (are|is)|these are)\\s+(the\\s+)?", "");
    return t.isEmpty() ? text : Character.toUpperCase(t.charAt(0)) + t.substring(1);
  }

  private static void addTable(List<Block> out, List<String> lines, String title) {
    List<List<String>> rows = new ArrayList<>();
    for (String l : lines) {
      if (TABLE_RULE.matcher(l).matches()) {
        continue;
      }
      String body = l.replaceAll("^\\|", "").replaceAll("\\|\\s*$", "");
      List<String> cells = new ArrayList<>();
      for (String c : body.split("\\|", -1)) {
        cells.add(inline(c.strip()));
      }
      rows.add(cells);
    }
    if (rows.size() < 2) {
      if (rows.size() == 1) {
        out.add(new TextBlock(String.join(" · ", rows.get(0))));
      }
      return;
    }
    List<String> header = rows.get(0);
    List<List<String>> data = new ArrayList<>();
    for (List<String> r : rows.subList(1, rows.size())) {
      List<String> fixed = new ArrayList<>(r);
      while (fixed.size() < header.size()) fixed.add("");
      data.add(List.copyOf(fixed.subList(0, header.size())));
    }
    out.add(new TableBlock(title == null ? "Breakdown" : title, header, numericColumns(header.size(), data), data, null));
  }

  static List<Integer> numericColumns(int cols, List<List<String>> data) {
    List<Integer> numeric = new ArrayList<>();
    for (int c = 0; c < cols; c++) {
      int num = 0;
      int filled = 0;
      for (List<String> r : data) {
        String v = r.get(c).replace(" ", "");
        if (v.isEmpty() || v.equals("-") || v.equals("—")) continue;
        filled++;
        if (NUMERIC_CELL.matcher(v).matches()) num++;
      }
      if (filled > 0 && num * 2 > filled) numeric.add(c);
    }
    return numeric;
  }

  /** Strips inline Markdown (bold, italics, code, links) so the card shows clean text. */
  static String inline(String s) {
    return s.replaceAll("\\*\\*(.+?)\\*\\*", "$1").replaceAll("__(.+?)__", "$1").replaceAll("(?<![\\w*])\\*(?!\\s)(.+?)(?<!\\s)\\*(?![\\w*])", "$1")
        .replaceAll("`([^`]+)`", "$1").replaceAll("\\[([^\\]]+)]\\([^)]+\\)", "$1").strip();
  }

  /** The first tool result with rows, as a table, for answers that did not include one. */
  static TableBlock firstResultTable(JsonNode results) {
    for (JsonNode r : results) {
      if (r.path("error").isTextual() || r.path("rows").isEmpty()) continue;
      List<String> header = new ArrayList<>();
      List<String> keys = new ArrayList<>();
      List<String> kinds = new ArrayList<>();
      List<Integer> numeric = new ArrayList<>();
      int i = 0;
      for (JsonNode c : r.path("columns")) {
        header.add(c.path("label").asText());
        keys.add(c.path("key").asText());
        String kind = c.path("kind").asText("text");
        kinds.add(kind);
        if (!kind.equals("text") && !kind.equals("date")) numeric.add(i);
        i++;
      }
      List<List<String>> rows = new ArrayList<>();
      for (JsonNode row : r.path("rows")) {
        if (rows.size() >= MAX_TABLE_ROWS) break;
        List<String> cells = new ArrayList<>();
        for (int k = 0; k < keys.size(); k++) cells.add(cell(row.path(keys.get(k)), kinds.get(k)));
        rows.add(cells);
      }
      int total = r.path("total_rows").isInt() ? r.path("total_rows").asInt() : r.path("rows").size();
      String title = r.path("title").asText() + (total > rows.size() ? " (top " + rows.size() + " of " + total + ")" : "");
      return new TableBlock(title, header, numeric, rows, null);
    }
    return null;
  }

  static String cell(JsonNode v, String kind) {
    if (v.isMissingNode() || v.isNull()) return "—";
    return switch (kind) {
      case "money" -> v.isNumber() ? ChatService.usd(Math.round(v.asDouble())) : v.asText();
      case "pct" -> v.isNumber() ? String.format(Locale.ROOT, "%.2f%%", v.asDouble()) : v.asText();
      case "number" -> v.isNumber() ? (v.asDouble() == Math.rint(v.asDouble()) ? String.format(Locale.ROOT, "%,d", v.asLong()) : String.format(Locale.ROOT, "%,.2f", v.asDouble())) : v.asText();
      default -> v.asText();
    };
  }
}
