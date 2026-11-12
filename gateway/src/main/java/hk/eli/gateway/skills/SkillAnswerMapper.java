package hk.eli.gateway.skills;

import com.fasterxml.jackson.databind.JsonNode;
import hk.eli.gateway.chat.ChatModels.Block;
import hk.eli.gateway.chat.ChatModels.ChatAnswer;
import hk.eli.gateway.chat.ChatModels.ConcentrationBlock;
import hk.eli.gateway.chat.ChatModels.Evidence;
import hk.eli.gateway.chat.ChatModels.Fact;
import hk.eli.gateway.chat.ChatModels.FactsBlock;
import hk.eli.gateway.chat.ChatModels.Line;
import hk.eli.gateway.chat.ChatModels.TableBlock;
import hk.eli.gateway.chat.ChatModels.TextBlock;
import hk.eli.gateway.chat.ChatService;
import hk.eli.gateway.ideas.Num;
import hk.eli.gateway.seed.Seed;
import hk.eli.gateway.seed.SeedData;
import hk.eli.gateway.skills.SkillRouter.Route;
import hk.eli.gateway.time.BusinessCalendar;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;
import org.springframework.stereotype.Component;

/**
 * Turns a completed skills-service run into our chat answer: the same typed blocks the Chat screen already draws,
 * plus the run's evidence, source mode (LIVE or MOCK), status and limitations. Every figure in a block is a value from
 * the run's results, and each has an evidence record; the lead sentence is written here from those values.
 */
@Component
public class SkillAnswerMapper {
  static final int MAX_EVIDENCE = 80;

  private final SeedData seed;
  private final SkillRouter router;

  public SkillAnswerMapper(SeedData seed, SkillRouter router) {
    this.seed = seed;
    this.router = router;
  }

  public ChatAnswer map(String id, Route route, JsonNode run) {
    JsonNode answer = run.path("answer");
    String asOf = firstText(answer.path("analysis").path("results"), "as_of");
    List<Block> blocks;
    List<String> followUps;
    switch (route.kind()) {
      case "concentration" -> {
        blocks = concentration(rows(answer, "t0"));
        followUps = List.of("Concentration by branch", "Maturities and rollovers across the book", "Who matures this week?");
      }
      case "maturities" -> {
        blocks = maturities(rows(answer, "t0"), rows(answer, "t1"));
        followUps = List.of("Top concentrations against limit", "Where is rollover below 80% this month?", "Who matures this week?");
      }
      case "branch" -> {
        blocks = branch(rows(answer, "t0"));
        followUps = List.of("Top concentrations against limit", "Regional performance by district");
      }
      case "regional" -> {
        blocks = regional(rows(answer, "t0"));
        followUps = List.of("Digibank journey this month", "Concentration by branch");
      }
      case "digital" -> {
        blocks = digital(rows(answer, "t0"));
        followUps = List.of("Regional performance by district", "What was quoted and not traded this week?");
      }
      case "coupons" -> {
        blocks = coupons(rows(answer, "t0"));
        followUps = List.of("Top concentrations against limit", "Maturities and rollovers across the book");
      }
      default -> throw new IllegalStateException("No answer shape for " + route.kind());
    }
    List<String> skills = route.tasks().stream().map(SkillServiceClient.Task::skillId).toList();
    List<String> sources = new ArrayList<>();
    sources.add("HK ELI skills service (" + route.scenario() + ": " + String.join(", ", skills) + ")");
    sources.add("ELI book, SQLite");
    String modes = String.join("+", texts(answer.path("source_modes")));
    return new ChatAnswer(id, blocks, followUps, asOf, sources, false, null, run.path("run_id").asText(null),
        modes.isEmpty() ? null : modes, answer.path("status").asText(null), limitations(answer, route), evidence(answer));
  }

  // --- answer shapes ------------------------------------------------------------------------------

  List<Block> concentration(List<JsonNode> rows) {
    if (rows.isEmpty()) {
      return List.of(new TextBlock("No outstanding positions in scope, so there is nothing to rank. An empty result is not a zero book."));
    }
    Map<String, Double> limits = seed.business().bookConcentration().stream()
        .collect(Collectors.toMap(Seed.BookLine::underlying, Seed.BookLine::limitPct));
    double defaultLimit = seed.business().bookConcentration().isEmpty() ? 25 : seed.business().bookConcentration().get(0).limitPct();
    JsonNode closest = rows.stream().max(Comparator.comparingDouble(r -> share(r) / limits.getOrDefault(r.path("underlying").asText(), defaultLimit))).orElseThrow();
    String u = closest.path("underlying").asText();
    long flagged = rows.stream().filter(r -> r.path("review_flag").asBoolean()).count();
    String text = u + " is " + pct(share(closest)) + "% of all ELI outstanding against a " + Num.plain(limits.getOrDefault(u, defaultLimit))
        + "% limit, the closest name to its limit. " + (flagged == 0 ? "None of the top " + rows.size() + " underlyings is over the review threshold."
        : flagged + " of the top " + rows.size() + " " + (flagged == 1 ? "is" : "are") + " over the review threshold.");
    List<Line> lines = rows.stream().limit(5)
        .map(r -> new Line(r.path("underlying").asText(), round2(share(r)), limits.getOrDefault(r.path("underlying").asText(), defaultLimit))).toList();
    List<List<String>> table = rows.stream().map(r -> List.of(r.path("underlying").asText(), ChatService.usd(r.path("notional").asLong()),
        pct(share(r)) + "%", String.valueOf(r.path("clients").asInt()), ChatService.usd(r.path("upcoming_maturity_notional").asLong()))).toList();
    List<Integer> flaggedRows = new ArrayList<>();
    for (int i = 0; i < rows.size(); i++) {
      if (rows.get(i).path("review_flag").asBoolean()) flaggedRows.add(i);
    }
    return List.of(new TextBlock(text),
        new ConcentrationBlock("Share of all ELI outstanding, by underlying", lines),
        new TableBlock("Top " + rows.size() + " underlyings, whole HK book", List.of("Underlying", "Outstanding", "Share", "Clients", "Maturing next 10 business days"),
            List.of(1, 2, 3, 4), table, flaggedRows.isEmpty() ? null : flaggedRows));
  }

  List<Block> maturities(List<JsonNode> maturing, List<JsonNode> rollovers) {
    String end = BusinessCalendar.shortDate(router.windowEnd());
    if (maturing.isEmpty()) {
      return List.of(new TextBlock("Nothing in the book matures between now and " + end + "."));
    }
    long total = maturing.stream().mapToLong(r -> r.path("notional").asLong()).sum();
    int deals = maturing.stream().mapToInt(r -> r.path("deals").asInt()).sum();
    JsonNode busiest = maturing.stream().max(Comparator.comparingLong(r -> r.path("notional").asLong())).orElseThrow();
    long contacted = sumWhere(rollovers, "contacted", "opportunities");
    long all = rollovers.stream().mapToLong(r -> r.path("opportunities").asLong()).sum();
    String text = ChatService.usd(total) + " in " + deals + " deals matures across the whole book by " + end + ". The busiest day is "
        + BusinessCalendar.shortDate(LocalDate.parse(busiest.path("maturity").asText())) + " with " + ChatService.usd(busiest.path("notional").asLong()) + ". "
        + (all == 0 ? "None of these maturities is marked eligible for a rollover yet."
        : contacted + " of " + all + " deals eligible for a rollover have been contacted.");
    List<Block> blocks = new ArrayList<>();
    blocks.add(new TextBlock(text));
    blocks.add(new FactsBlock(List.of(new Fact("Maturing by " + end, ChatService.usd(total)), new Fact("Deals", String.valueOf(deals)),
        new Fact("Rollover contacted", contacted + " of " + all), new Fact("Not contacted, notional", ChatService.usd(sumWhere(rollovers, "not_contacted", "notional"))))));
    blocks.add(new TableBlock("Maturing by day", List.of("Date", "Deals", "Notional"), List.of(1, 2),
        maturing.stream().map(r -> List.of(BusinessCalendar.shortDate(LocalDate.parse(r.path("maturity").asText())), String.valueOf(r.path("deals").asInt()),
            ChatService.usd(r.path("notional").asLong()))).toList(), null));
    if (!rollovers.isEmpty()) {
      blocks.add(new TableBlock("Rollover status of eligible maturities", List.of("Status", "Deals", "Notional"), List.of(1, 2),
          rollovers.stream().map(r -> List.of(statusText(r.path("status").asText()), String.valueOf(r.path("opportunities").asInt()),
              ChatService.usd(r.path("notional").asLong()))).toList(), null));
    }
    return blocks;
  }

  List<Block> branch(List<JsonNode> rows) {
    if (rows.isEmpty()) {
      return List.of(new TextBlock("No outstanding positions in scope by branch."));
    }
    JsonNode top = rows.get(0);
    List<JsonNode> shown = rows.stream().limit(10).toList();
    return List.of(new TextBlock("The largest single exposure by branch is " + top.path("underlying").asText() + " in " + top.path("branch").asText()
            + " at " + ChatService.usd(top.path("notional").asLong()) + ". The table shows the top " + shown.size() + " of " + rows.size() + " branch and underlying pairs."),
        new TableBlock("Largest exposures by branch and underlying", List.of("Branch", "Underlying", "Outstanding"), List.of(2),
            shown.stream().map(r -> List.of(r.path("branch").asText(), r.path("underlying").asText(), ChatService.usd(r.path("notional").asLong()))).toList(), null));
  }

  List<Block> regional(List<JsonNode> rows) {
    if (rows.isEmpty()) {
      return List.of(new TextBlock("No recorded trades in scope."));
    }
    long total = rows.stream().mapToLong(r -> r.path("sales").asLong()).sum();
    JsonNode top = rows.get(0);
    return List.of(new TextBlock(top.path("branch").asText() + " has the most recorded ELI sales at " + ChatService.usd(top.path("sales").asLong()) + " of "
            + ChatService.usd(total) + " across " + rows.size() + " branches."),
        new TableBlock("Recorded sales by branch and district", List.of("Branch", "District", "Sales"), List.of(2),
            rows.stream().map(r -> List.of(r.path("branch").asText(), r.path("district").asText(), ChatService.usd(r.path("sales").asLong()))).toList(), null));
  }

  List<Block> digital(List<JsonNode> rows) {
    if (rows.isEmpty()) {
      return List.of(new TextBlock("No Digibank journey events this month."));
    }
    long quotes = sumWhere(rows, "quote", "events");
    long trades = sumWhere(rows, "trade", "events");
    long quoteClients = sumWhere(rows, "quote", "clients");
    String rate = quotes == 0 ? "" : " That is " + Num.fixed(100.0 * trades / quotes, 1) + " trades for every 100 quotes.";
    return List.of(new TextBlock("This month on Digibank, " + quoteClients + " clients asked for " + quotes + " quotes and " + trades + " trades went through." + rate),
        new TableBlock("Digibank journey this month", List.of("Stage", "Events", "Clients"), List.of(1, 2),
            rows.stream().map(r -> List.of(stageText(r.path("stage").asText()), String.valueOf(r.path("events").asLong()), String.valueOf(r.path("clients").asLong()))).toList(), null));
  }

  List<Block> coupons(List<JsonNode> rows) {
    if (rows.isEmpty()) {
      return List.of(new TextBlock("No outstanding positions in scope."));
    }
    String parts = rows.stream().map(r -> pct1(r.path("weighted_coupon").asDouble()) + "% on " + productText(r.path("product").asText()))
        .collect(Collectors.joining(" and "));
    return List.of(new TextBlock("The notional-weighted coupon on outstanding deals is " + parts + ". Coupon is what a deal pays if it runs to term, not a realised return."),
        new TableBlock("Coupons on outstanding deals, by product", List.of("Product", "Basket legs", "Lowest", "Highest", "Weighted"), List.of(1, 2, 3, 4),
            rows.stream().map(r -> List.of(productText(r.path("product").asText()), String.valueOf(r.path("positions").asInt()), pct1(r.path("min_coupon").asDouble()) + "%",
                pct1(r.path("max_coupon").asDouble()) + "%", pct1(r.path("weighted_coupon").asDouble()) + "%")).toList(), null));
  }

  // --- evidence and limitations --------------------------------------------------------------------

  List<Evidence> evidence(JsonNode answer) {
    List<Evidence> out = new ArrayList<>();
    for (JsonNode e : answer.path("evidence")) {
      if (out.size() == MAX_EVIDENCE) break;
      List<String> dims = new ArrayList<>();
      e.path("dimensions").fields().forEachRemaining(d -> {
        if (!d.getKey().equals("currency")) dims.add(d.getValue().asText());
      });
      String label = e.path("metric").asText(e.path("calculation_id").asText()).replace('_', ' ') + (dims.isEmpty() ? "" : " · " + String.join(" · ", dims));
      String scope = String.join(", ", texts(e.path("authorization_scope")));
      out.add(new Evidence(e.path("id").asText(), label, e.path("value").asText(null), e.path("unit").asText(null), e.path("as_of").asText(null),
          e.path("source_mode").asText(null), e.path("source_id").asText() + " " + e.path("source_version").asText(), scope.isEmpty() ? null : scope));
    }
    return out.isEmpty() ? null : out;
  }

  List<String> limitations(JsonNode answer, Route route) {
    LinkedHashSet<String> out = new LinkedHashSet<>();
    for (String w : texts(answer.path("warnings"))) {
      if (w.startsWith("SYNTHETIC demonstration data")) {
        out.add("Demo data. The metric definitions are not yet approved by the business.");
      } else if (w.startsWith("Date window uses fixed fixture as-of date")) {
        if (route.kind().equals("maturities") || route.kind().equals("concentration")) out.add("Dates count from the data date, " + w.replaceAll(".*as-of date (\\S+);.*", "$1") + ", and include the last day of the window.");
      } else if (w.startsWith("Underlying is fixture primary allocation")) {
        out.add("Shares are look-through: each basket leg counts its own notional. Only the top 10 underlyings are listed, but shares are of the whole book.");
      } else if (w.startsWith("Offline fixture mode")) {
        out.add("Offline mode: figures come straight from the skills, with no AI wording.");
      } else {
        out.add(w);
      }
    }
    switch (route.kind()) {
      case "maturities" -> out.add("Whole HK book, not only your clients. Ask \"Who matures this week?\" for your own clients.");
      case "regional" -> out.add("Sums every recorded trade, not only this month.");
      case "coupons" -> out.add("Counts basket legs, so a two-name worst-of counts twice.");
      default -> { }
    }
    return out.isEmpty() ? null : List.copyOf(out);
  }

  // --- helpers ---------------------------------------------------------------------------------------

  static List<JsonNode> rows(JsonNode answer, String task) {
    JsonNode r = answer.path("analysis").path("results").path(task).path("rows");
    return r.isArray() ? StreamSupport.stream(r.spliterator(), false).toList() : List.of();
  }

  static String firstText(JsonNode results, String field) {
    for (JsonNode r : results) {
      if (r.hasNonNull(field)) return r.path(field).asText();
    }
    return null;
  }

  static List<String> texts(JsonNode array) {
    List<String> out = new ArrayList<>();
    array.forEach(n -> out.add(n.asText()));
    return out;
  }

  static long sumWhere(List<JsonNode> rows, String key, String field) {
    return rows.stream().filter(r -> key.equals(r.path("status").asText(r.path("stage").asText()))).mapToLong(r -> r.path(field).asLong()).sum();
  }

  static double share(JsonNode row) {
    return row.path("share").isNull() ? 0 : Double.parseDouble(row.path("share").asText("0"));
  }

  static double round2(double ratio) {
    return Math.round(ratio * 10000) / 100.0;
  }

  static String pct(double ratio) {
    return Num.plain(round2(ratio));
  }

  static String pct1(double value) {
    return Num.plain(Num.round1(value));
  }

  static String statusText(String status) {
    return switch (status) {
      case "contacted" -> "Contacted";
      case "not_contacted" -> "Not contacted";
      default -> status.replace('_', ' ');
    };
  }

  static String productText(String product) {
    return switch (product) {
      case "ELI" -> "single-name ELIs";
      case "ELI worst-of" -> "worst-of ELIs";
      default -> product;
    };
  }

  static String stageText(String stage) {
    return switch (stage) {
      case "quote" -> "Quote requested";
      case "trade" -> "Traded";
      default -> stage;
    };
  }
}
