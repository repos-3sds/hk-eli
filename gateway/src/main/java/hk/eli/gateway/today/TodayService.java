package hk.eli.gateway.today;

import static hk.eli.gateway.time.BusinessCalendar.addBusinessDays;
import static hk.eli.gateway.time.BusinessCalendar.longDate;
import static hk.eli.gateway.time.BusinessCalendar.nextBusinessDays;
import static hk.eli.gateway.time.BusinessCalendar.previousBusinessDay;
import static hk.eli.gateway.time.BusinessCalendar.weekdayName;

import hk.eli.gateway.config.EliProperties;
import hk.eli.gateway.scope.Scope;
import hk.eli.gateway.seed.Seed;
import hk.eli.gateway.seed.SeedData;
import hk.eli.gateway.time.BusinessClock;
import hk.eli.gateway.today.TodayModels.*;
import hk.eli.gateway.web.NotFoundException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Service;

/** Today: the strip, the morning brief, a client's context and rollover ideas. Mirrors the web mock data source. */
@Service
public class TodayService {
  static final List<String> SIGNAL_ORDER = List.of("moment", "cash", "history", "headroom", "engaged", "ideas");

  private final SeedData seed;
  private final BusinessClock clock;
  private final EliProperties props;
  private final FreshnessSource freshness;
  private final AtomicInteger quoteCounter = new AtomicInteger();

  public TodayService(SeedData seed, BusinessClock clock, EliProperties props, FreshnessSource freshness) {
    this.seed = seed;
    this.clock = clock;
    this.props = props;
    this.freshness = freshness;
  }

  private boolean empty() {
    return "empty".equals(props.scenario());
  }

  public Freshness freshness() {
    return freshness.current();
  }

  Seed.Client client(String id) {
    return seed.client(id).orElseThrow(() -> new NotFoundException("No client " + id));
  }

  boolean inScope(String clientId, Scope scope) {
    Seed.Client c = client(clientId);
    var owner = seed.owner(clientId).orElse(null);
    var subject = new Scope.Subject(
        owner == null ? null : owner.branch(), c.segment(), owner == null ? null : owner.channel(),
        owner == null ? null : owner.rmName(), c.concentration().stream().map(Seed.Concentration::underlying).toList());
    return scope.matches(subject, seed.business().districtOfBranch());
  }

  public List<Moment> moments(Scope scope) {
    if (empty()) {
      return List.of();
    }
    LocalDate start = clock.firstBusinessDay();
    return seed.today().moments().stream()
        .filter(m -> inScope(m.clientId(), scope))
        .map(m -> new Moment(
            "m-" + m.clientId() + "-" + m.type(), m.clientId(), client(m.clientId()).shortName(), m.type(),
            addBusinessDays(start, m.offset(), clock.holidays()).toString(), m.offset()))
        .toList();
  }

  public MomentStrip strip(Scope scope) {
    List<LocalDate> dates = nextBusinessDays(clock.firstBusinessDay(), props.businessDaysAhead(), clock.holidays());
    List<BusinessDay> days = new ArrayList<>();
    for (int i = 0; i < dates.size(); i++) {
      days.add(new BusinessDay(dates.get(i).toString(), i));
    }
    return new MomentStrip(days, moments(scope).stream().filter(m -> m.offset() < days.size()).toList());
  }

  Signal signal(String id, boolean met, String caveat) {
    Seed.SignalInfo info = seed.today().signalCatalogue().get(id);
    return new Signal(id, info.name(), met, info.rule(), info.whyItMatters(), caveat, info.source());
  }

  public MorningBrief brief(Scope scope) {
    List<Moment> moments = moments(scope);
    List<Lead> leads = new ArrayList<>();
    for (Moment m : moments) {
      Seed.Client c = client(m.clientId());
      Seed.LeadSeed fixture = seed.today().leads().stream()
          .filter(l -> l.clientId().equals(m.clientId()) && l.momentType().equals(m.type()))
          .findFirst()
          .orElseGet(() -> GenericLeads.lead(c, m.type()));
      var owner = seed.owner(c.id()).orElse(null);
      Map<String, Seed.SignalState> byId = new HashMap<>();
      fixture.signals().forEach(s -> byId.put(s.id(), s));
      List<Signal> signals = SIGNAL_ORDER.stream()
          .map(id -> {
            Seed.SignalState s = byId.get(id);
            return signal(id, s != null && s.met(), s == null ? null : s.caveat());
          })
          .toList();
      leads.add(new Lead(
          "lead-" + c.id() + "-" + m.type(), c.id(), c.name(), c.shortName(), c.segment(), c.cifMasked(),
          owner == null ? "Unassigned" : owner.rmName(), owner == null ? "Unassigned" : owner.branch(),
          owner == null ? "advisory" : owner.channel(), m,
          fixture.summary().replace("{weekday}", weekdayName(LocalDate.parse(m.date()))), signals, fixture.action()));
    }
    leads.sort(Comparator.<Lead>comparingLong(l -> -l.signals().stream().filter(Signal::met).count())
        .thenComparingInt(l -> l.moment().offset()));
    return new MorningBrief(
        clock.at(clock.today(), "07:10"), clock.businessDate().toString(), "yesterday's blotter, fixings and RFQ log",
        List.of("EQD master", "outstanding stock"), leads, empty() ? 0 : maturingInScope(scope), empty() ? List.of() : pocketsInScope(scope));
  }

  public List<Seed.Pocket> pocketsInScope(Scope scope) {
    if (!scope.aggregatesCover()) {
      return List.of();
    }
    return seed.business().pockets().stream()
        .filter(p -> scope.matchesAggregate(p.branch(), p.segment(), null, seed.business().districtOfBranch()))
        .sorted(Comparator.comparingInt(Seed.Pocket::rolloverPct))
        .toList();
  }

  long maturingInScope(Scope scope) {
    if (scope.aggregatesCover()) {
      return pocketsInScope(scope).stream().mapToLong(Seed.Pocket::maturingUsd).sum();
    }
    return seed.today().clients().stream().filter(c -> inScope(c.id(), scope)).mapToLong(Seed.Client::maturingUsd).sum();
  }

  public ClientContext context(String clientId) {
    Seed.Client c = client(clientId);
    LocalDate today = clock.today();
    var owner = seed.owner(c.id()).orElse(null);
    return new ClientContext(
        c.id(), c.name(), c.shortName(), c.segment(), c.cifMasked(),
        owner == null ? "Unassigned" : owner.rmName(), owner == null ? "Unassigned" : owner.branch(),
        owner == null ? "advisory" : owner.channel(), c.riskProfile(), c.eliOutstandingUsd(), c.maturingUsd(),
        c.lastTradeDaysAgo() == null ? null : today.minusDays(c.lastTradeDaysAgo()).toString(),
        c.concentration().stream().map(x -> new ConcentrationLine(x.underlying(), x.sharePct(), 25)).toList(),
        c.outcomes().stream().map(o -> new LeadOutcome(today.minusDays(o.daysAgo()).toString(), o.label(), o.status())).toList(),
        c.rfqs().stream().map(r -> new RecentRfq(today.minusDays(r.daysAgo()).toString(), r.description(), r.status())).toList(),
        List.of());
  }

  public RolloverIdeas ideas(String clientId) {
    Seed.Client c = client(clientId);
    Moment moment = moments(Scope.ALL).stream().filter(m -> m.clientId().equals(clientId)).findFirst()
        .orElseThrow(() -> new NotFoundException("No moment for " + clientId));
    Seed.IdeaSet set = seed.today().ideaSets().stream().filter(s -> s.clientId().equals(clientId)).findFirst()
        .orElseGet(() -> GenericLeads.ideaSet(c));
    String pricedAt = clock.at(clock.businessDate(), "18:00");
    List<Idea> ideas = new ArrayList<>();
    for (int i = 0; i < set.ideas().size(); i++) {
      ideas.add(toIdea(set.ideas().get(i), i + 1, pricedAt));
    }
    List<Idea> lower = new ArrayList<>();
    for (int i = 0; i < set.rankedLower().size(); i++) {
      lower.add(toIdea(set.rankedLower().get(i), set.ideas().size() + i + 1, pricedAt));
    }
    String weekday = weekdayName(LocalDate.parse(moment.date()));
    return new RolloverIdeas(
        clientId, c.name(), c.shortName(), moment, c.maturingUsd(), ideas, lower,
        set.callPrep().stream().map(l -> l.replace("{weekday}", weekday)).toList(), "open", props.maturingWindowBusinessDays());
  }

  private Idea toIdea(Seed.IdeaSeed f, int rank, String pricedAt) {
    return new Idea(
        f.id(), rank, f.title(), new Terms(f.kiPct(), f.strikePct(), f.couponPct()), f.tenor(), pricedAt,
        SIGNAL_ORDER.stream().map(id -> signal(id, f.signalsMet().contains(id), null)).toList(), f.concentration(), f.reason());
  }

  public List<EvidenceRow> evidence(String reference) {
    String asOf = longDate(clock.businessDate());
    var moments = seed.today().moments();
    java.util.function.Function<String, String> count = t -> String.valueOf(moments.stream().filter(m -> m.type().equals(t)).count());
    List<EvidenceRow> rows = List.of(
        new EvidenceRow("EQD master", "Trades maturing in window", count.apply("maturity"), asOf),
        new EvidenceRow("EQD master", "Likely knock-outs (within 2% of barrier)", count.apply("knockout"), asOf),
        new EvidenceRow("Outstanding stock", "Deliveries below strike", count.apply("exercised"), asOf),
        new EvidenceRow("Blotter", "Clients idle 90+ days", count.apply("idle"), asOf),
        new EvidenceRow("RFQ log", "Open RFQs", count.apply("rfq"), asOf));
    if (reference.startsWith("client:")) {
      String who = reference.substring(7);
      return rows.stream().map(r -> new EvidenceRow(r.source(), r.field() + " (" + who + ")", r.value(), r.asOf())).toList();
    }
    return rows;
  }

  /** Demo receipt. In production this posts to the SPE desk's RFQ queue (R13, MVP2) after the user confirms. */
  public QuoteRequestReceipt requestQuote(String clientId, String ideaId) {
    client(clientId);
    return new QuoteRequestReceipt(
        "RFQ-GW-" + String.format("%04d", quoteCounter.incrementAndGet()), ideaId, clock.now().toOffsetDateTime().toString(), "SPE desk");
  }

  /** Used by the freshness source and the chat answers. */
  public LocalDate previousClose() {
    return previousBusinessDay(clock.businessDate(), clock.holidays());
  }
}
