package hk.eli.gateway.ideas;

import static hk.eli.gateway.ideas.Num.fixed;
import static hk.eli.gateway.ideas.Num.plain;

import hk.eli.gateway.ideas.IdeaModels.*;
import hk.eli.gateway.seed.Seed;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;


/**
 * Pure Idea Finder logic: read plain words into filters, apply hard filters, check signals, apply the single limit
 * rule (D1) and rank by agreement. A port of web/src/app/core/ideas/idea-finder-logic.ts; the tests hold both to
 * the same results.
 */
public final class IdeaLogic {
  public static final double AMBER_SHARE_OF_LIMIT = 0.85;
  /** Within half a point of a book limit, one more trade could breach it, so the bank-wide check treats it as red. */
  static final double BOOK_RED_GAP_PCT = 0.5;
  private static final double PAIR_CORRELATION = 0.65;
  private static final double FUNDING_PCT = 4;

  private static final Set<String> STOP_WORDS = Set.of("a", "an", "the", "for", "and", "or", "with", "to", "of", "in", "on", "me", "my", "some", "ideas", "idea", "eli", "elis", "find", "show", "want", "wants", "client", "please", "around", "about", "at", "least", "than", "is", "he", "she", "they", "that", "who");
  private static final Set<String> FILTER_WORDS = Set.of("coupon", "ki", "knock-in", "more", "no", "lower", "below", "or", "under", "p.a.", "pa", "tenor", "months", "month");

  private final Seed.Ideas ideas;
  private final Seed.Business business;

  public IdeaLogic(Seed.Ideas ideas, Seed.Business business) {
    this.ideas = ideas;
    this.business = business;
  }

  private static void mark(Matcher m, boolean found, Set<String> used) {
    if (found) {
      for (String w : m.group().split("\\s+")) {
        used.add(w.replaceAll("[^a-z0-9.%]", ""));
      }
    }
  }

  /** Reads "6M, 15% coupon, KI 65 or lower, no more NVDA for Chan" into hard filters and a starter pack. */
  public ReadIntent readIntent(String text, List<Seed.Client> clients) {
    String lower = text.toLowerCase(Locale.ROOT);
    Set<String> used = new HashSet<>();

    Matcher tenor = Pattern.compile("\\b(\\d{1,2})\\s*(m|mo|mth|months?)\\b").matcher(lower);
    boolean hasTenor = tenor.find();
    mark(tenor, hasTenor, used);
    Matcher coupon = Pattern.compile("(\\d{1,2}(?:\\.\\d)?)\\s*%?\\s*(?:p\\.?a\\.?\\s*)?coupon|coupon\\s*(?:of|above|over|at least|>=?)?\\s*(\\d{1,2}(?:\\.\\d)?)\\s*%?").matcher(lower);
    boolean hasCoupon = coupon.find();
    mark(coupon, hasCoupon, used);
    Matcher ki = Pattern.compile("\\b(?:ki|knock-?in)\\s*(?:at|of|below|under|at most|<=?)?\\s*(\\d{2})\\s*%?(?:\\s*or\\s*(?:lower|less|below))?").matcher(lower);
    boolean hasKi = ki.find();
    mark(ki, hasKi, used);

    List<String> exclude = new ArrayList<>();
    List<String> include = new ArrayList<>();
    for (String t : ideas.tickers()) {
      String tl = t.toLowerCase(Locale.ROOT);
      Matcher neg = Pattern.compile("\\b(no more|no|avoid|without|not|except|exclude|ex)\\s+(?:\\w+\\s+)?" + Pattern.quote(tl) + "\\b").matcher(lower);
      if (neg.find()) {
        exclude.add(t);
        mark(neg, true, used);
      } else if (Pattern.compile("\\b" + Pattern.quote(tl) + "\\b").matcher(lower).find()) {
        include.add(t);
        used.add(tl);
      }
    }

    Seed.Client client = clients.stream().filter(c -> {
      String family = c.name().split(" ")[0].toLowerCase(Locale.ROOT);
      return lower.contains(c.name().toLowerCase(Locale.ROOT)) || Pattern.compile("\\b" + Pattern.quote(family) + "\\b").matcher(lower).find();
    }).findFirst().orElse(null);
    if (client != null) {
      used.addAll(Arrays.asList(client.name().toLowerCase(Locale.ROOT).split(" ")));
    }

    String packId = null;
    String[][] packWords = {
      {"\\b(roll ?over|maturing|matures|reinvest)\\b", "rollover"},
      {"\\b(safe|safer|defensive|protect\\w*|conservative|sleep)\\b", "defensive"},
      {"\\b(yield|high coupon|income|juicy)\\b", "yield"},
      {"\\b(diversif\\w*|spread|concentrat\\w*)\\b", "diversify"},
      {"\\b(popular|busy|desk|everyone)\\b", "desk"},
    };
    for (String[] pw : packWords) {
      Matcher m = Pattern.compile(pw[0]).matcher(lower);
      if (m.find()) {
        packId = pw[1];
        mark(m, true, used);
        break;
      }
    }

    Double minCoupon = null;
    if (hasCoupon) {
      minCoupon = Double.valueOf(coupon.group(1) != null ? coupon.group(1) : coupon.group(2));
    }
    IdeaFilters filters = new IdeaFilters(
        hasTenor ? Integer.valueOf(tenor.group(1)) : null, minCoupon, hasKi ? Double.valueOf(ki.group(1)) : null,
        include, exclude, client == null ? null : client.id());
    LinkedHashSet<String> ignored = new LinkedHashSet<>();
    for (String raw : lower.split("[\\s,;]+")) {
      String w = raw.replaceAll("[^a-z0-9.%-]", "");
      if (!w.isEmpty() && !used.contains(w) && !STOP_WORDS.contains(w) && !Character.isDigit(w.charAt(0)) && !FILTER_WORDS.contains(w)) {
        ignored.add(w);
      }
    }
    return new ReadIntent(filters, packId, List.copyOf(ignored));
  }

  public static boolean passes(Seed.WarehouseIdea idea, IdeaFilters f) {
    if (f.tenorMonths() != null && idea.tenorMonths() != f.tenorMonths()) return false;
    if (f.minCouponPct() != null && idea.couponPct() < f.minCouponPct()) return false;
    if (f.maxKiPct() != null && idea.kiPct() > f.maxKiPct()) return false;
    if (f.exclude().stream().anyMatch(t -> idea.underlyings().contains(t))) return false;
    return f.include().isEmpty() || f.include().stream().anyMatch(t -> idea.underlyings().contains(t));
  }

  /** For each hard filter that is set: how many ideas would pass with only that filter removed. */
  public static List<FilterBlocker> blockers(List<Seed.WarehouseIdea> warehouse, IdeaFilters f) {
    List<FilterBlocker> out = new ArrayList<>();
    java.util.function.BiConsumer<String[], IdeaFilters> add = (kl, relaxed) ->
        out.add(new FilterBlocker(kl[0], kl[1], (int) warehouse.stream().filter(w -> passes(w, relaxed)).count()));
    if (f.tenorMonths() != null) add.accept(new String[] {"tenorMonths", "Tenor " + f.tenorMonths() + "M"}, new IdeaFilters(null, f.minCouponPct(), f.maxKiPct(), f.include(), f.exclude(), f.clientId()));
    if (f.minCouponPct() != null) add.accept(new String[] {"minCouponPct", "Coupon at least " + plain(f.minCouponPct()) + "%"}, new IdeaFilters(f.tenorMonths(), null, f.maxKiPct(), f.include(), f.exclude(), f.clientId()));
    if (f.maxKiPct() != null) add.accept(new String[] {"maxKiPct", "KI at most " + plain(f.maxKiPct()) + "%"}, new IdeaFilters(f.tenorMonths(), f.minCouponPct(), null, f.include(), f.exclude(), f.clientId()));
    if (!f.include().isEmpty()) add.accept(new String[] {"include", "Only " + String.join(", ", f.include())}, new IdeaFilters(f.tenorMonths(), f.minCouponPct(), f.maxKiPct(), List.of(), f.exclude(), f.clientId()));
    if (!f.exclude().isEmpty()) add.accept(new String[] {"exclude", "No " + String.join(", ", f.exclude())}, new IdeaFilters(f.tenorMonths(), f.minCouponPct(), f.maxKiPct(), f.include(), List.of(), f.clientId()));
    out.sort(Comparator.comparingInt(FilterBlocker::wouldPass).reversed());
    return out;
  }

  /** Where the trade would take the client's most affected underlying. */
  public Seed.ConcentrationEffect effect(List<String> underlyings, Seed.Client client, long notionalUsd) {
    double out = client.eliOutstandingUsd();
    double total = out + notionalUsd;
    double per = (double) notionalUsd / underlyings.size();
    Seed.ConcentrationEffect worst = null;
    for (String u : underlyings) {
      double from = client.concentration().stream().filter(c -> c.underlying().equals(u)).mapToDouble(Seed.Concentration::sharePct).findFirst().orElse(0);
      double to = total > 0 ? ((from / 100) * out + per) / total * 100 : 100;
      var e = new Seed.ConcentrationEffect(u, from, Num.round1(to), ideas.concentrationLimitPct());
      if (worst == null || e.toPct() > worst.toPct()) {
        worst = e;
      }
    }
    return worst;
  }

  static double couponLine(List<Seed.WarehouseIdea> warehouse) {
    double[] sorted = warehouse.stream().mapToDouble(Seed.WarehouseIdea::couponPct).sorted().toArray();
    return sorted.length == 0 ? 0 : sorted[(int) Math.floor(sorted.length * 0.75)];
  }

  record Ctx(double couponLine, Seed.Client client, long notionalUsd) {}

  SignalCheck check(String signalId, Seed.WarehouseIdea idea, Ctx ctx) {
    Seed.IdeaSignal signal = ideas.signals().stream().filter(s -> s.id().equals(signalId)).findFirst().orElse(null);
    String source = signal == null ? "" : signal.source();
    Seed.Client c = ctx.client();
    java.util.function.BiFunction<Boolean, String, SignalCheck> r = (met, ev) -> new SignalCheck(signalId, met, ev, source);
    return switch (signalId) {
      case "top-coupon" -> r.apply(idea.couponPct() >= ctx.couponLine(), plain(idea.couponPct()) + "% against the " + plain(ctx.couponLine()) + "% top-quartile line");
      case "coupon-up" -> r.apply(idea.couponChangeBp() >= 50, (idea.couponChangeBp() >= 0 ? "+" : "") + fixed(idea.couponChangeBp() / 100.0, 2) + " points on last week");
      case "vol-rich" -> r.apply(idea.volRank() >= 70, "Vol rank " + idea.volRank() + " of 100");
      case "rm-traded" -> r.apply(idea.rmTrades() >= 3, idea.rmTrades() + " HK " + (idea.rmTrades() == 1 ? "RM" : "RMs") + " this week");
      case "rfq-busy" -> r.apply(idea.rfqs5d() >= 10, idea.rfqs5d() + " RFQs in 5 days");
      case "fills" -> r.apply(idea.fillRatePct() >= 60, idea.fillRatePct() + "% of RFQs traded");
      case "deep-ki" -> r.apply(idea.kiPct() <= 65, "KI " + plain(idea.kiPct()) + "%");
      case "correlated" -> r.apply(idea.correlation() >= 0.7, idea.underlyings().size() == 1 ? "Single stock" : "Correlation " + fixed(idea.correlation(), 2));
      case "no-earnings" -> r.apply(idea.earningsInDays() > 20, "Next earnings in " + idea.earningsInDays() + " business days");
      case "headroom" -> {
        if (c == null) yield r.apply(false, "Pick a client");
        var e = effect(idea.underlyings(), c, ctx.notionalUsd());
        yield r.apply(e.toPct() <= e.limitPct(), e.underlying() + " " + fixed(e.fromPct(), 1) + "% → " + fixed(e.toPct(), 1) + "%, limit " + plain(e.limitPct()) + "%");
      }
      case "familiar" -> {
        if (c == null) yield r.apply(false, "Pick a client");
        List<String> held = idea.underlyings().stream().filter(u -> c.concentration().stream().anyMatch(x -> x.underlying().equals(u))).toList();
        yield r.apply(!held.isEmpty(), held.isEmpty() ? "Holds none of these" : "Already holds " + String.join(", ", held));
      }
      case "not-top" -> {
        if (c == null) yield r.apply(false, "Pick a client");
        var top = c.concentration().stream().max(Comparator.comparingDouble(Seed.Concentration::sharePct)).orElse(null);
        if (top == null) yield r.apply(true, "No ELI outstanding");
        yield r.apply(!idea.underlyings().contains(top.underlying()), "Largest holding is " + top.underlying() + " at " + plain(top.sharePct()) + "%");
      }
      default -> r.apply(false, "Unknown signal");
    };
  }

  record Limit(String state, String reason) {}

  /** The single limit rule (D1): client-level when a client is picked, else the bank's own book by underlying. */
  Limit limit(List<String> underlyings, Seed.ConcentrationEffect effect) {
    if (effect != null) {
      if (effect.toPct() > effect.limitPct()) {
        return new Limit("red", "Would take the client's " + effect.underlying() + " to " + fixed(effect.toPct(), 1) + "%, over the " + plain(effect.limitPct()) + "% limit.");
      }
      if (effect.toPct() >= effect.limitPct() * AMBER_SHARE_OF_LIMIT) {
        return new Limit("amber", "Takes the client's " + effect.underlying() + " to " + fixed(effect.toPct(), 1) + "%, close to the " + plain(effect.limitPct()) + "% limit.");
      }
      return new Limit("green", null);
    }
    var worst = business.bookConcentration().stream()
        .filter(b -> underlyings.contains(b.underlying()))
        .max(Comparator.comparingDouble(b -> b.sharePct() / b.limitPct()))
        .orElse(null);
    if (worst == null) {
      return new Limit("green", null);
    }
    if (worst.sharePct() >= worst.limitPct() - BOOK_RED_GAP_PCT) {
      return new Limit("red", worst.underlying() + " is " + plain(worst.sharePct()) + "% of the bank's ELI book, within half a point of the " + plain(worst.limitPct()) + "% name limit.");
    }
    if (worst.sharePct() >= worst.limitPct() * AMBER_SHARE_OF_LIMIT) {
      return new Limit("amber", worst.underlying() + " is " + plain(worst.sharePct()) + "% of the bank's ELI book, close to the " + plain(worst.limitPct()) + "% name limit.");
    }
    return new Limit("green", null);
  }

  private static int order(String state) {
    return switch (state) {
      case "green" -> 0;
      case "amber" -> 1;
      default -> 2;
    };
  }

  public record Ranked(List<IdeaMatch> matches, List<IdeaMatch> hiddenByLimits, int passed, long notionalUsd) {}

  /** Green first, then amber with its reason, each by signals met then coupon. Red never ranks: it goes to Hidden by limits. */
  public Ranked rank(List<Seed.WarehouseIdea> warehouse, IdeaQuery query, Seed.Client client, String pricedAt) {
    long notional = client != null && client.maturingUsd() > 0 ? client.maturingUsd() : ideas.defaultNotionalUsd();
    Ctx ctx = new Ctx(couponLine(warehouse), client, notional);
    List<Seed.WarehouseIdea> passed = warehouse.stream().filter(w -> passes(w, query.filters())).toList();
    List<IdeaMatch> all = new ArrayList<>();
    for (Seed.WarehouseIdea w : passed) {
      List<SignalCheck> checks = query.signalIds().stream().map(id -> check(id, w, ctx)).toList();
      var effect = client != null ? effect(w.underlyings(), client, notional) : null;
      Limit lim = limit(w.underlyings(), effect);
      String title = String.join(" / ", w.underlyings()) + (w.underlyings().size() > 1 ? " worst-of" : "") + " · " + w.tenorMonths() + "M";
      all.add(new IdeaMatch(w.id(), title, w.underlyings(), w.tenorMonths(), new Terms(w.kiPct(), w.strikePct(), w.couponPct()), checks,
          (int) checks.stream().filter(SignalCheck::met).count(), effect, pricedAt, lim.state(), lim.reason()));
    }
    all.sort(Comparator.<IdeaMatch>comparingInt(m -> order(m.limitState()))
        .thenComparing(Comparator.comparingInt(IdeaMatch::met).reversed())
        .thenComparing(Comparator.comparingDouble((IdeaMatch m) -> m.terms().couponPct()).reversed()));
    return new Ranked(
        all.stream().filter(m -> !m.limitState().equals("red")).toList(),
        all.stream().filter(m -> m.limitState().equals("red")).toList(),
        passed.size(), notional);
  }

  public record Solved(double couponPct, List<String> drivers) {}

  /** Indicative coupon for a custom ELI (demo model; production asks the desk's pricer). */
  public Solved solveCoupon(CustomEliSpec spec) {
    int n = spec.underlyings().size();
    if (n == 0) {
      return new Solved(0, List.of());
    }
    double vol = spec.underlyings().stream().mapToDouble(t -> ideas.tickerVol().getOrDefault(t, 0.35)).sum() / n;
    double worstOf = 1 + (n - 1) * (1 - PAIR_CORRELATION) * 0.6;
    double shape = 0.55 + ((spec.kiPct() - 65) / 100) * 1.5 + ((spec.strikePct() - 90) / 100) * 1.2;
    double tenor = Math.pow(6.0 / spec.tenorMonths(), 0.15);
    double raw = FUNDING_PCT + vol * worstOf * shape * tenor * 40;
    double coupon = Num.round1(Math.min(40, Math.max(2, raw)));
    List<String> drivers = new ArrayList<>();
    drivers.add("Volatility averages " + Math.round(vol * 100) + "% across " + String.join(", ", spec.underlyings()));
    if (n > 1) drivers.add("Worst-of " + n + " stocks: the client takes the weakest one, which adds coupon");
    String ki = plain(spec.kiPct());
    drivers.add(spec.kiPct() <= 60 ? "Knock-in " + ki + "% is deep protection, which costs coupon"
        : spec.kiPct() >= 70 ? "Knock-in " + ki + "% is close, which adds coupon" : "Knock-in " + ki + "% is in the usual range");
    if (spec.strikePct() != 90) {
      String st = plain(spec.strikePct());
      drivers.add(spec.strikePct() > 90 ? "Strike " + st + "% means more downside, which adds coupon" : "Strike " + st + "% means less downside, which costs coupon");
    }
    return new Solved(coupon, drivers);
  }

}
