package hk.eli.gateway.today;

import com.fasterxml.jackson.annotation.JsonInclude;
import hk.eli.gateway.seed.Seed;
import java.util.List;

/** The Today contract. Same shapes as web/src/app/core/models/today.models.ts. */
public final class TodayModels {
  private TodayModels() {}

  public record BusinessDay(String date, int offset) {}

  public record Moment(String id, String clientId, String clientShortName, String type, String date, int offset) {}

  public record MomentStrip(List<BusinessDay> days, List<Moment> moments) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record Signal(String id, String name, boolean met, String rule, String whyItMatters, String caveat, String source) {}

  public record Lead(
      String id, String clientId, String clientName, String clientShortName, String segment, String cifMasked,
      String ownerRm, String branch, String channel, Moment moment, String summary, List<Signal> signals, Seed.Action action) {}

  public record MorningBrief(
      String preparedAt, String businessDate, String preparedFrom, List<String> sources, List<Lead> leads,
      long maturingUsd, List<Seed.Pocket> pockets) {}

  public record ConcentrationLine(String underlying, double sharePct, double limitPct) {}

  public record LeadOutcome(String date, String label, String status) {}

  public record RecentRfq(String date, String description, String status) {}

  public record ClientContext(
      String id, String name, String shortName, String segment, String cifMasked, String rmName, String branch,
      String channel, int riskProfile, long eliOutstandingUsd, long maturingUsd, String lastTradeDate,
      List<ConcentrationLine> concentration, List<LeadOutcome> outcomes, List<RecentRfq> recentRfqs, List<String> linkedWidgets) {}

  public record Terms(double kiPct, double strikePct, double couponPct) {}

  public record Idea(
      String id, int rank, String title, Terms terms, String tenor, String pricedAt, List<Signal> signals,
      Seed.ConcentrationEffect concentration, String reason) {}

  public record RolloverIdeas(
      String clientId, String clientName, String clientShortName, Moment moment, long amountUsd, List<Idea> ideas,
      List<Idea> rankedLower, List<String> callPrep, String outcome, int outcomeWindowBusinessDays) {}

  public record EvidenceRow(String source, String field, String value, String asOf) {}

  public record QuoteRequestReceipt(String requestId, String ideaId, String sentAt, String desk) {}

  public record Freshness(String state, String dataAsOf, String dataRefreshedAt, String pricesAsOf, boolean pricesToday, String pricesExpectedAt) {}
}
