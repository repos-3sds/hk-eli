package hk.eli.gateway.seed;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;

/**
 * The demo business, as JSON seed files exported from the web fixtures (npm run export-seed), so the web mock and
 * the gateway serve the same invented data. In production these come from the data mart behind the same shapes.
 */
public final class Seed {
  private Seed() {}

  public record SignalInfo(String name, String rule, String whyItMatters, String source) {}

  public record Concentration(String underlying, double sharePct) {}

  public record PastOutcome(int daysAgo, String label, String status) {}

  public record PastRfq(int daysAgo, String description, String status) {}

  public record Client(
      String id, String name, String shortName, String segment, String cifMasked, int riskProfile,
      long eliOutstandingUsd, long maturingUsd, Integer lastTradeDaysAgo,
      List<Concentration> concentration, List<PastOutcome> outcomes, List<PastRfq> rfqs) {}

  public record Owner(String clientId, String rmName, String branch, String channel) {}

  public record MomentSeed(String clientId, String type, int offset) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record SignalState(String id, boolean met, String caveat) {}

  public record Action(String kind, String label) {}

  public record LeadSeed(String clientId, String momentType, String summary, Action action, List<SignalState> signals) {}

  public record ConcentrationEffect(String underlying, double fromPct, double toPct, double limitPct) {}

  public record IdeaSeed(
      String id, String title, String tenor, double kiPct, double strikePct, double couponPct,
      List<String> signalsMet, ConcentrationEffect concentration, String reason) {}

  public record IdeaSet(String clientId, List<IdeaSeed> ideas, List<IdeaSeed> rankedLower, List<String> callPrep) {}

  public record Today(
      Map<String, SignalInfo> signalCatalogue, List<Client> clients, List<Owner> owners,
      List<MomentSeed> moments, List<LeadSeed> leads, List<IdeaSet> ideaSets) {}

  public record Pocket(
      String id, String branch, String segment, int rolloverPct, int baselinePct, long maturingUsd,
      int maturedThisMonth, int rolledThisMonth) {}

  public record BusinessRow(
      String branch, String segment, String channel, long notionalMtdUsd, long notionalPrevUsd, int trades,
      int rfqs, int rfqsTraded, int matured, int rolled, int activeClients, int idleClients) {}

  public record UnmetQuote(String underlying, String channel, int quotes, int traded, String topAsk) {}

  public record BookLine(String underlying, double sharePct, double limitPct) {}

  public record Business(
      int rolloverBaselinePct, List<Pocket> pockets, List<BusinessRow> rows, List<UnmetQuote> unmetDemand,
      List<BookLine> bookConcentration, Map<String, String> districtOfBranch) {}

  public record WarehouseIdea(
      String id, List<String> underlyings, int tenorMonths, double couponPct, double kiPct, double strikePct,
      int couponChangeBp, int volRank, int rmTrades, int rfqs5d, int fillRatePct, double correlation, int earningsInDays) {}

  public record IdeaSignal(String id, String group, String name, String rule, String why, String caveat, String source, boolean needsClient) {}

  public record SignalGroup(String id, String question) {}

  public record StarterPack(String id, String name, String blurb, List<String> signalIds) {}

  public record Ideas(
      double concentrationLimitPct, long defaultNotionalUsd, List<String> tickers, Map<String, Double> tickerVol,
      List<WarehouseIdea> warehouse, List<IdeaSignal> signals, List<SignalGroup> signalGroups, List<StarterPack> starterPacks) {}
}
