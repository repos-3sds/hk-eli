package hk.eli.gateway.ideas;

import hk.eli.gateway.seed.Seed;
import java.util.List;

/** The Ideas contract. Same shapes as web/src/app/core/ideas/idea-finder.models.ts. */
public final class IdeaModels {
  private IdeaModels() {}

  public record IdeaFilters(Integer tenorMonths, Double minCouponPct, Double maxKiPct, List<String> include, List<String> exclude, String clientId) {
    public static final IdeaFilters NONE = new IdeaFilters(null, null, null, List.of(), List.of(), null);

    public IdeaFilters {
      include = include == null ? List.of() : List.copyOf(include);
      exclude = exclude == null ? List.of() : List.copyOf(exclude);
    }
  }

  public record ReadRequest(String text) {}

  public record ReadIntent(IdeaFilters filters, String packId, List<String> ignored) {}

  public record IdeaQuery(IdeaFilters filters, List<String> signalIds) {
    public IdeaQuery {
      filters = filters == null ? IdeaFilters.NONE : filters;
      signalIds = signalIds == null ? List.of() : List.copyOf(signalIds);
    }
  }

  public record SignalCheck(String signalId, boolean met, String evidence, String source) {}

  public record Terms(double kiPct, double strikePct, double couponPct) {}

  public record IdeaMatch(
      String id, String title, List<String> underlyings, int tenorMonths, Terms terms, List<SignalCheck> checks, int met,
      Seed.ConcentrationEffect effect, String pricedAt, String limitState, String limitReason) {}

  public record FilterBlocker(String key, String label, int wouldPass) {}

  public record IdeaResults(
      int passedFilters, List<FilterBlocker> blockers, int warehouseSize, List<IdeaMatch> matches, List<IdeaMatch> hiddenByLimits,
      long notionalUsd, String businessDate) {}

  public record CustomEliSpec(List<String> underlyings, int tenorMonths, double kiPct, double strikePct, String clientId) {
    public CustomEliSpec {
      underlyings = underlyings == null ? List.of() : List.copyOf(underlyings);
    }
  }

  public record CustomEliPrice(double couponPct, List<String> drivers, long notionalUsd, Seed.ConcentrationEffect effect, String pricedAt) {}
}
