package hk.eli.gateway.chat;

import static hk.eli.gateway.time.BusinessCalendar.shortDate;

import hk.eli.gateway.chat.ChatModels.*;
import hk.eli.gateway.config.EliProperties;
import hk.eli.gateway.ideas.IdeaLogic;
import hk.eli.gateway.ideas.IdeaModels.IdeaFilters;
import hk.eli.gateway.ideas.IdeaModels.IdeaQuery;
import hk.eli.gateway.ideas.Num;
import hk.eli.gateway.scope.Scope;
import hk.eli.gateway.seed.Seed;
import hk.eli.gateway.seed.SeedData;
import hk.eli.gateway.today.TodayModels;
import hk.eli.gateway.time.BusinessClock;
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
  static final List<String> FALLBACK_FOLLOW_UPS = List.of("Where is rollover below 80% this month?", "Who matures this week?", "Which knock-outs are close to the barrier?");

  // Same sentences as web/src/app/core/chat/chat-scope.ts.
  static final String CAN_ANSWER =
      "maturities this week or next, knock-outs near the barrier, rollover by branch, concentration against limits, what was quoted and not traded, and a brief or trade history for one client";
  static final String FALLBACK_TEXT = "I can't answer that one yet. I can answer " + CAN_ANSWER + ".";
  static final String DECLINE_TEXT =
      "HK ELI Chatbot doesn't forecast prices or say what a client should buy or sell. Suitability and advice stay with the owning RM. Here is what the data can show instead.";
  /** The pack the Ideas tab opens a client's ideas with; chat ranks with the same one so both say the same. */
  static final String CALL_PREP_PACK = "rollover";

  // Question intents, word for word the same as mock-chat-data-source.ts. Order matters: first match wins.
  static final Pattern ADVICE = Pattern.compile(
      "\\b(should (i|we|he|she|they|the client|\\w+) (buy|sell|invest|hold|switch|add|exit|get out)|buy or sell|recommend\\w*|forecast|predict\\w*|price target|what will \\S+(?: \\S+)? do|will \\S+(?: \\S+)? (go up|go down|rise|fall|drop|rally|crash)|is it a good (time|idea)|worth buying|good buy)\\b");
  static final Pattern UNMET = Pattern.compile("not traded|quoted and not|unmet|demand|did ?n[o']t trade|didn't trade|unconverted|missed quotes|lost quotes");
  static final Pattern HISTORY = Pattern.compile("\\b(trade|traded|trades|history|rfqs?|last 90)\\b");
  static final Pattern BRIEF = Pattern.compile("\\b(prepare|prep|before i call|know about|call with|tell me about|brief me|brief on|summary of|summari[sz]e|overview|update on|status of)\\b");
  static final Pattern ROLLOVER = Pattern.compile("\\broll(ed|s|ing)?[ -]?overs?\\b");
  static final Pattern CONCENTRATION = Pattern.compile("concentrat|against limit|limits?\\b|exposure|heaviest|book share|closest to (its |the )?limit");
  static final Pattern MATURITY = Pattern.compile("matur|expir|falling due|coming due");
  static final Pattern KNOCKOUT = Pattern.compile("knock|barrier|\\bko\\b");

  private final TodayService today;
  private final SeedData seed;
  private final BusinessClock clock;
  private final EliProperties props;
  private final IdeaLogic ideaLogic;
  private final AtomicInteger counter = new AtomicInteger();

  public ChatService(TodayService today, SeedData seed, BusinessClock clock, EliProperties props) {
    this.today = today;
    this.seed = seed;
    this.clock = clock;
    this.props = props;
    this.ideaLogic = new IdeaLogic(seed.ideas(), seed.business());
  }

  private static boolean has(String regex, String text) {
    return Pattern.compile(regex).matcher(text).find();
  }

  /** Which kind of question this is, for the audit and the wording prompt. Same order as the web mock. */
  public static String intentOf(String text, boolean hasClient, boolean named) {
    String t = text.toLowerCase(Locale.ROOT);
    if (ADVICE.matcher(t).find()) return "advice";
    if (UNMET.matcher(t).find()) return "unmet";
    if (HISTORY.matcher(t).find() && hasClient) return "history";
    if (BRIEF.matcher(t).find() && hasClient) return "call-prep";
    if (ROLLOVER.matcher(t).find()) return "rollover";
    if (CONCENTRATION.matcher(t).find()) return "concentration";
    if (MATURITY.matcher(t).find()) return "maturities";
    if (KNOCKOUT.matcher(t).find()) return "knockouts";
    // Only a named client, not the picked one, makes a question with no other intent into a brief.
    if (named) return "call-prep";
    return "fallback";
  }

  public ChatAnswer answer(ChatQuestion q) {
    String text = q.text() == null ? "" : q.text().toLowerCase(Locale.ROOT);
    String named = findClient(text);
    String clientId = named != null ? named : q.clientId();
    String id = "a-" + counter.incrementAndGet();
    String intent = intentOf(text, clientId != null, named != null);
    String date = today.brief(Scope.ALL).businessDate();
    return switch (intent) {
      case "advice" -> decline(id, clientId, date);
      case "history" -> history(id, clientId, date);
      case "call-prep" -> callPrep(id, clientId, date);
      case "rollover" -> rollover(id, date);
      case "concentration" -> concentration(id, date);
      case "unmet" -> unmet(id, date);
      case "maturities" -> byType(id, "maturity", text.contains("next week") ? "next" : "this", date);
      case "knockouts" -> byType(id, "knockout", "window", date);
      default -> new ChatAnswer(id, List.of(new TextBlock(FALLBACK_TEXT)), FALLBACK_FOLLOW_UPS, date, List.of(), true, null);
    };
  }

  /** Forecast or advice: say plainly the tool does not do that, and offer facts instead. No figures, no sources. */
  private ChatAnswer decline(String id, String clientId, String date) {
    var client = clientId == null ? Optional.<Seed.Client>empty() : seed.client(clientId);
    List<String> followUps = client.map(c -> {
      String first = c.name().split(" ")[0];
      return List.of("Brief me on " + first, "What did " + first + " trade in the last 90 days?", "Top concentrations against limit");
    }).orElse(List.of("Top concentrations against limit", "What was quoted and not traded this week?", "Who matures this week?"));
    return new ChatAnswer(id, List.of(new TextBlock(DECLINE_TEXT)), followUps, date, List.of(), true, null);
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
    IdeaLogic.Ranked ideas = rankForClient(clientId);
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
    if (ideas != null && !ideas.matches().isEmpty()) {
      blocks.add(new IdeasBlock(clientId, "Top ideas for USD " + Math.round(ideas.notionalUsd() / 1000.0) + "k, indicative",
          ideas.matches().stream().limit(3).map(m -> new IdeaLine(m.id(), m.title(), m.tenorMonths() + "M", m.terms().couponPct(), m.terms().kiPct(),
              m.effect() == null ? "" : m.effect().underlying() + " " + Num.fixed(m.effect().fromPct(), 1) + "% → " + Num.fixed(m.effect().toPct(), 1) + "%")).toList()));
    }
    List<String> facts = factsForRm(ctx, ideas);
    if (!facts.isEmpty()) {
      blocks.add(new BulletsBlock("Facts for the owning RM", facts));
    }
    return new ChatAnswer(id, blocks, List.of("What did " + first + " trade in the last 90 days?", "Who matures this week?", "Which knock-outs are close to the barrier?"),
        date, SOURCES, false, TableauParity.RESULTS.get("client"));
  }

  /** The same ranking the Ideas tab shows for this client: the rollover pack, no other filters. */
  private IdeaLogic.Ranked rankForClient(String clientId) {
    var client = seed.client(clientId).orElse(null);
    if (client == null) return null;
    var pack = seed.ideas().starterPacks().stream().filter(p -> p.id().equals(CALL_PREP_PACK)).findFirst().orElseThrow();
    var warehouse = "empty".equals(props.scenario()) ? List.<Seed.WarehouseIdea>of() : seed.ideas().warehouse();
    var query = new IdeaQuery(new IdeaFilters(null, null, null, List.of(), List.of(), clientId), pack.signalIds());
    return ideaLogic.rank(warehouse, query, client, clock.at(clock.today(), "09:05"));
  }

  /** Plain facts for the owning RM. Facts only: nothing here tells anyone what to sell. Same sentences as the web mock. */
  static List<String> factsForRm(TodayModels.ClientContext ctx, IdeaLogic.Ranked ideas) {
    List<String> out = new ArrayList<>();
    if (ctx.maturingUsd() > 0) {
      out.add(usd(ctx.maturingUsd()) + " matures in the next 10 business days.");
    }
    ctx.concentration().stream().max(Comparator.comparingDouble(TodayModels.ConcentrationLine::sharePct)).ifPresent(top ->
        out.add("Largest holding is " + top.underlying() + " at " + Num.plain(top.sharePct()) + "% of the client's ELI book, against a " + Num.plain(top.limitPct()) + "% limit."));
    if (ideas != null && !ideas.matches().isEmpty()) {
      var m = ideas.matches().get(0);
      out.add("Idea 1 meets " + m.met() + " of " + m.checks().size() + " rollover signals. The evidence for each is under Why in Ideas.");
    }
    if (ideas != null && !ideas.hiddenByLimits().isEmpty()) {
      int n = ideas.hiddenByLimits().size();
      out.add(n + " " + (n == 1 ? "idea is" : "ideas are") + " hidden because " + (n == 1 ? "it" : "they") + " would take a holding over its limit.");
    }
    return out;
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
