package hk.eli.gateway.chat;

import static hk.eli.gateway.time.BusinessCalendar.shortDate;

import hk.eli.gateway.chat.ChatModels.*;
import hk.eli.gateway.ideas.Num;
import hk.eli.gateway.scope.Scope;
import hk.eli.gateway.seed.Seed;
import hk.eli.gateway.seed.SeedData;
import hk.eli.gateway.today.TodayModels;
import hk.eli.gateway.today.TodayService;
import hk.eli.gateway.web.NotFoundException;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Computes chat answers from the same data the screens use. The figures are always computed here; the AI layer may
 * only reword the text blocks (see {@link hk.eli.gateway.ai.AnswerWording}). A port of mock-chat-data-source.ts.
 */
@Service
public class ChatService {
  static final List<String> SOURCES = List.of("EQD master", "outstanding stock", "RFQ log");
  static final List<String> FALLBACK_FOLLOW_UPS = List.of("Who matures this week?", "Which knock-outs are close to the barrier?", "Brief me on Chan");

  private final TodayService today;
  private final SeedData seed;
  private final AtomicInteger counter = new AtomicInteger();

  public ChatService(TodayService today, SeedData seed) {
    this.today = today;
    this.seed = seed;
  }

  private static boolean has(String regex, String text) {
    return Pattern.compile(regex).matcher(text).find();
  }

  /** Which kind of question this is, for the audit and the wording prompt. */
  public static String intentOf(String text, boolean hasClient) {
    String t = text.toLowerCase(Locale.ROOT);
    if (has("\\b(trade|traded|history|rfqs?|last 90)\\b", t) && hasClient) return "history";
    if (has("\\b(prepare|prep|before i call|know about|call with|tell me about|brief me)\\b", t) && hasClient) return "call-prep";
    if (t.contains("rollover") && has("(below|under|ratio|pocket|baseline)", t)) return "rollover";
    if (has("concentrat|against limit|limits?\\b", t)) return "concentration";
    if (has("not traded|quoted and not|unmet|demand", t)) return "unmet";
    if (t.contains("matur")) return "maturities";
    if (has("knock|barrier|\\bko\\b", t)) return "knockouts";
    if (hasClient) return "call-prep";
    return "fallback";
  }

  public ChatAnswer answer(ChatQuestion q) {
    String text = q.text() == null ? "" : q.text().toLowerCase(Locale.ROOT);
    String named = findClient(text);
    String clientId = named != null ? named : q.clientId();
    String id = "a-" + counter.incrementAndGet();
    // Only a named client, not the picked one, makes a question with no other intent into a brief.
    String intent = intentOf(text, clientId != null);
    if (intent.equals("call-prep") && named == null && !has("\\b(prepare|prep|before i call|know about|call with|tell me about|brief me)\\b", text)) {
      intent = "fallback";
    }
    String date = today.brief(Scope.ALL).businessDate();
    return switch (intent) {
      case "history" -> history(id, clientId, date);
      case "call-prep" -> callPrep(id, clientId, date);
      case "rollover" -> rollover(id, date);
      case "concentration" -> concentration(id, date);
      case "unmet" -> unmet(id, date);
      case "maturities" -> byType(id, "maturity", text.contains("next week") ? "next" : "this", date);
      case "knockouts" -> byType(id, "knockout", "window", date);
      default -> new ChatAnswer(id, List.of(new TextBlock(
          "I can only answer a few kinds of question in this demo: a brief on one client, maturities this week or next, and knock-outs close to the barrier. Try one of these.")),
          FALLBACK_FOLLOW_UPS, date, SOURCES, true, null);
    };
  }

  private ChatAnswer business(String id, List<Block> blocks, List<String> followUps, List<String> sources, String topic, String date) {
    return new ChatAnswer(id, blocks, followUps, date, sources, false, TableauParity.RESULTS.get(topic));
  }

  private ChatAnswer rollover(String id, String date) {
    var b = seed.business();
    int base = b.rolloverBaselinePct();
    List<Seed.Pocket> pockets = b.pockets().stream().sorted(Comparator.comparingInt(Seed.Pocket::rolloverPct)).toList();
    List<Seed.Pocket> below = pockets.stream().filter(p -> p.rolloverPct() < base).toList();
    String text;
    if (below.isEmpty()) {
      text = "Every pocket is at or above the " + base + "% rollover baseline this month.";
    } else {
      var low = below.get(0);
      text = "Rollover is above the " + base + "% baseline overall, but " + below.size() + " " + (below.size() == 1 ? "pocket is" : "pockets are")
          + " below it this month. " + low.branch() + " · " + low.segment() + " is lowest at " + low.rolloverPct() + "% (" + low.rolledThisMonth()
          + " of " + low.maturedThisMonth() + " rolled), with " + usd(low.maturingUsd()) + " maturing in the next 10 business days.";
    }
    List<List<String>> rows = pockets.stream().map(p -> List.of(p.branch(), p.segment(), p.rolledThisMonth() + " of " + p.maturedThisMonth(), p.rolloverPct() + "%", usd(p.maturingUsd()))).toList();
    List<Integer> flagged = new ArrayList<>();
    for (int i = 0; i < pockets.size(); i++) {
      if (pockets.get(i).rolloverPct() < base) flagged.add(i);
    }
    return business(id, List.of(new TextBlock(text),
        new TableBlock("Rollover this month, by branch and segment", List.of("Branch", "Segment", "Rolled", "Rollover", "Maturing next 10 days"), List.of(2, 3, 4), rows, flagged)),
        List.of("Who matures this week?", "What was quoted and not traded this week?"), List.of("EQD master", "trades this month"), "rollover", date);
  }

  private ChatAnswer concentration(String id, String date) {
    var lines = seed.business().bookConcentration();
    var top = lines.get(0);
    return business(id, List.of(
        new TextBlock(top.underlying() + " is " + Num.plain(top.sharePct()) + "% of all ELI outstanding against a " + Num.plain(top.limitPct())
            + "% limit, the closest name to its limit. Ideas that add " + top.underlying() + " rank lower and say why."),
        new ConcentrationBlock("Share of all ELI outstanding, by underlying", lines.stream().map(l -> new Line(l.underlying(), l.sharePct(), l.limitPct())).toList())),
        List.of("What was quoted and not traded this week?", "Who matures this week?"), List.of("EQD master", "outstanding stock", "name limits"), "concentration", date);
  }

  private ChatAnswer unmet(String id, String date) {
    var all = seed.business().unmetDemand();
    var rows = all.stream().sorted(Comparator.comparingInt((Seed.UnmetQuote d) -> d.quotes() - d.traded()).reversed()).toList();
    int dq = all.stream().filter(d -> d.channel().equals("digibank")).mapToInt(Seed.UnmetQuote::quotes).sum();
    int dt = all.stream().filter(d -> d.channel().equals("digibank")).mapToInt(Seed.UnmetQuote::traded).sum();
    var first = rows.get(0);
    return business(id, List.of(
        new TextBlock(first.underlying() + " had the most quotes that did not trade this week (" + (first.quotes() - first.traded()) + "). On digibank, "
            + dq + " quotes led to " + dt + " trades; most asked for short tenors with high coupons."),
        new TableBlock("Quoted and not traded this week", List.of("Underlying", "Channel", "Quotes", "Traded", "Most asked for"), List.of(2, 3),
            rows.stream().map(d -> List.of(d.underlying(), d.channel().equals("digibank") ? "Digibank" : "Advisory", String.valueOf(d.quotes()), String.valueOf(d.traded()), d.topAsk())).toList(), null)),
        List.of("Top concentrations against limit", "Where is rollover below 80% this month?"), List.of("RFQ log", "digibank quote log", "blotter"), "unmet", date);
  }

  private ChatAnswer callPrep(String id, String clientId, String date) {
    var brief = today.brief(Scope.ALL);
    var ctx = today.context(clientId);
    TodayModels.RolloverIdeas ideas;
    try {
      ideas = today.ideas(clientId);
    } catch (NotFoundException e) {
      ideas = null;
    }
    var lead = brief.leads().stream().filter(l -> l.clientId().equals(clientId)).findFirst().orElse(null);
    String first = ctx.name().split(" ")[0];
    List<Block> blocks = new ArrayList<>();
    blocks.add(new TextBlock(lead != null
        ? ctx.name() + " is in today's brief: " + lead.summary() + " " + lead.signals().stream().filter(TodayModels.Signal::met).count() + " of " + lead.signals().size() + " signals agree."
        : ctx.name() + " is not in today's brief, so there is no dated moment today. Here is the client's book."));
    blocks.add(new FactsBlock(List.of(
        new Fact("ELI outstanding", usd(ctx.eliOutstandingUsd())),
        new Fact("Maturing in 10 days", usd(ctx.maturingUsd())),
        new Fact("Last trade", ctx.lastTradeDate() == null ? "None" : shortDate(LocalDate.parse(ctx.lastTradeDate()))),
        new Fact("Risk profile", String.valueOf(ctx.riskProfile())))));
    if (!ctx.concentration().isEmpty()) {
      blocks.add(new ConcentrationBlock("Concentration, share of ELI outstanding", ctx.concentration().stream().map(c -> new Line(c.underlying(), c.sharePct(), c.limitPct())).toList()));
    }
    if (ideas != null && !ideas.ideas().isEmpty()) {
      blocks.add(new IdeasBlock(clientId, "Top ideas for USD " + Math.round(ideas.amountUsd() / 1000.0) + "k, indicative",
          ideas.ideas().stream().limit(3).map(i -> new IdeaLine(i.id(), i.title(), i.tenor(), i.terms().couponPct(), i.terms().kiPct(),
              i.concentration().underlying() + " " + Num.fixed(i.concentration().fromPct(), 1) + "% → " + Num.fixed(i.concentration().toPct(), 1) + "%")).toList()));
      if (!ideas.callPrep().isEmpty()) {
        blocks.add(new BulletsBlock("Points for the owning RM", ideas.callPrep()));
      }
    }
    return new ChatAnswer(id, blocks, List.of("What did " + first + " trade in the last 90 days?", "Who matures this week?", "Which knock-outs are close to the barrier?"),
        date, SOURCES, false, TableauParity.RESULTS.get("client"));
  }

  private static String status(String s) {
    return s.replaceFirst("-", " ");
  }

  private ChatAnswer history(String id, String clientId, String date) {
    var ctx = today.context(clientId);
    String first = ctx.name().split(" ")[0];
    List<String> outcomes = ctx.outcomes().stream().map(o -> shortDate(LocalDate.parse(o.date())) + " · " + o.label() + " · " + status(o.status())).toList();
    List<String> rfqs = ctx.recentRfqs().stream().map(r -> shortDate(LocalDate.parse(r.date())) + " · " + r.description() + " · " + status(r.status())).toList();
    List<Block> blocks = new ArrayList<>();
    blocks.add(new TextBlock(ctx.name() + ": last ELI trade " + (ctx.lastTradeDate() == null ? "not on record" : shortDate(LocalDate.parse(ctx.lastTradeDate()))) + ", "
        + outcomes.size() + " " + (outcomes.size() == 1 ? "lead" : "leads") + " in the last 90 days and " + rfqs.size() + " " + (rfqs.size() == 1 ? "RFQ" : "RFQs") + " in the last 30."));
    if (!outcomes.isEmpty()) blocks.add(new BulletsBlock("Leads and outcomes, from the blotter", outcomes));
    if (!rfqs.isEmpty()) blocks.add(new BulletsBlock("Recent RFQs", rfqs));
    return new ChatAnswer(id, blocks, List.of("Brief me on " + first, "Who matures this week?"), date, SOURCES, false, TableauParity.RESULTS.get("client"));
  }

  /** Index of the last strip day in the current week. */
  static int endOfWeekIndex(List<TodayModels.BusinessDay> days) {
    for (int i = 1; i < days.size(); i++) {
      if (LocalDate.parse(days.get(i).date()).getDayOfWeek().getValue() < LocalDate.parse(days.get(i - 1).date()).getDayOfWeek().getValue()) {
        return i - 1;
      }
    }
    return days.size() - 1;
  }

  private ChatAnswer byType(String id, String type, String window, String date) {
    var strip = today.strip(Scope.ALL);
    var brief = today.brief(Scope.ALL);
    int weekEnd = endOfWeekIndex(strip.days());
    String w = window;
    List<TodayModels.Moment> moments = filter(strip.moments(), type, w, weekEnd);
    String leadIn = "";
    if (moments.isEmpty() && w.equals("this")) {
      var next = filter(strip.moments(), type, "next", weekEnd);
      if (!next.isEmpty()) {
        moments = next;
        leadIn = "Nothing matures this week. ";
        w = "next";
      }
    }
    List<ClientRow> rows = new ArrayList<>();
    for (var m : moments) {
      var c = seed.client(m.clientId()).orElseThrow();
      var lead = brief.leads().stream().filter(l -> l.clientId().equals(m.clientId()) && l.moment().type().equals(type)).findFirst().orElse(null);
      Long amount = type.equals("maturity") ? Long.valueOf(c.maturingUsd()) : (c.maturingUsd() == 0 ? null : c.maturingUsd());
      rows.add(new ClientRow(m.clientId(), c.name(), type, shortDate(LocalDate.parse(m.date())) + " · " + (m.offset() == 0 ? "Today" : "T-" + m.offset()), amount,
          lead != null ? "In today's brief · " + lead.signals().stream().filter(TodayModels.Signal::met).count() + "/6 signals" : "Not in the brief"));
    }
    String label = type.equals("maturity") ? (w.equals("next") ? "maturities next week" : "maturities this week") : "likely knock-outs in the next 10 business days";
    long total = rows.stream().mapToLong(r -> r.amountUsd() == null ? 0 : r.amountUsd()).sum();
    List<Block> blocks = new ArrayList<>();
    if (rows.isEmpty()) {
      blocks.add(new TextBlock("No " + label + " across the business."));
    } else {
      String l = rows.size() == 1 ? label.replace("maturities", "maturity").replace("knock-outs", "knock-out") : label;
      blocks.add(new TextBlock(leadIn + rows.size() + " " + l + (total > 0 ? ", " + usd(total) + " in all" : "") + ". " + rows.get(0).name() + " is first, " + rows.get(0).when().split(" · ")[0] + "."));
      blocks.add(new ClientRowsBlock(type.equals("maturity") ? "Maturing" : "Close to the barrier", rows));
    }
    List<String> followUps = new ArrayList<>(rows.stream().limit(2).map(r -> "Brief me on " + r.name().split(" ")[0]).toList());
    followUps.add(type.equals("maturity") ? "Which knock-outs are close to the barrier?" : "Who matures this week?");
    return new ChatAnswer(id, blocks, followUps, date, SOURCES, false, TableauParity.RESULTS.get(type.equals("maturity") ? "maturities" : "knockouts"));
  }

  private static List<TodayModels.Moment> filter(List<TodayModels.Moment> all, String type, String window, int weekEnd) {
    return all.stream()
        .filter(m -> m.type().equals(type) && (window.equals("this") ? m.offset() <= weekEnd : !window.equals("next") || m.offset() > weekEnd))
        .sorted(Comparator.comparingInt(TodayModels.Moment::offset))
        .toList();
  }

  /** A client named in the question, matched on family name or full name. */
  String findClient(String text) {
    return seed.today().clients().stream().filter(c -> {
      String[] parts = c.name().toLowerCase(Locale.ROOT).split(" ");
      return text.contains(c.name().toLowerCase(Locale.ROOT)) || has("\\b" + Pattern.quote(parts[0]) + "\\b", text);
    }).map(Seed.Client::id).findFirst().orElse(null);
  }

  public static String usd(long value) {
    if (value >= 1_000_000) {
      return "USD " + Num.fixed(value / 1_000_000.0, 2) + "m";
    }
    return value == 0 ? "USD 0" : "USD " + Math.round(value / 1000.0) + "k";
  }
}
