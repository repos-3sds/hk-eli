package hk.eli.gateway.today;

import hk.eli.gateway.seed.Seed;
import java.util.List;
import java.util.stream.Stream;

/** Plain leads and idea sets for moments with no curated story: the facts only. Mirrors the web mock. */
final class GenericLeads {
  private GenericLeads() {}

  static Seed.LeadSeed lead(Seed.Client c, String type) {
    String amount = c.maturingUsd() >= 1000 ? "USD " + Math.round(c.maturingUsd() / 1000.0) + "k" : null;
    double heaviest = c.concentration().isEmpty() ? 0 : c.concentration().get(0).sharePct();
    boolean engaged = (c.lastTradeDaysAgo() == null ? 999 : c.lastTradeDaysAgo()) <= 30 || c.rfqs().stream().anyMatch(r -> r.daysAgo() <= 30);
    String summary;
    String label;
    String kind;
    switch (type) {
      case "maturity" -> {
        summary = "ELI matures {weekday}." + (amount != null ? " " + amount + " returns as cash." : "");
        label = "Show rollover ideas";
        kind = "rollover-ideas";
      }
      case "knockout" -> {
        summary = "Close to the knock-out barrier. If it knocks out on {weekday}, " + (amount != null ? amount : "the notional") + " returns early.";
        label = "Show rollover ideas";
        kind = "knockout-ideas";
      }
      case "exercised" -> {
        summary = "Stock expected to be delivered below strike {weekday}.";
        label = "Show exercised-stock ideas";
        kind = "exercised-stock-ideas";
      }
      case "idle" -> {
        summary = "No ELI trade for " + (c.lastTradeDaysAgo() == null ? 90 : c.lastTradeDaysAgo()) + "+ days.";
        label = "Show reactivation ideas";
        kind = "reactivation-ideas";
      }
      default -> {
        summary = (c.rfqs().isEmpty() ? "An RFQ" : c.rfqs().get(0).description()) + " is still open. Quoted, not yet traded.";
        label = "Show ideas";
        kind = "rollover-ideas";
      }
    }
    boolean cash = type.equals("maturity") || type.equals("knockout") || type.equals("exercised");
    return new Seed.LeadSeed(c.id(), type, summary, new Seed.Action(kind, label), List.of(
        new Seed.SignalState("moment", true, null), new Seed.SignalState("cash", cash, null),
        new Seed.SignalState("history", false, null), new Seed.SignalState("headroom", heaviest < 21, null),
        new Seed.SignalState("engaged", engaged, null), new Seed.SignalState("ideas", false, null)));
  }

  static Seed.IdeaSet ideaSet(Seed.Client c) {
    String avoid = c.concentration().isEmpty() ? "none" : c.concentration().get(0).underlying();
    List<String> pick = Stream.of("MSFT", "GOOGL", "AAPL", "META", "AMD").filter(u -> !u.equals(avoid)).toList();
    return new Seed.IdeaSet(c.id(), List.of(
        idea("i-g1-" + c.id(), pick.get(0), pick.get(1), "6M", 70, 88, 13.2, "Keeps away from " + avoid + ", the largest holding."),
        idea("i-g2-" + c.id(), pick.get(2), pick.get(3), "3M", 72, 90, 11.6, "Shorter tenor and a higher barrier for a cautious restart.")),
        List.of(),
        List.of("Open with what changed for " + c.name().split(" ")[0] + " since the last trade.", "Walk through idea #1 first; it adds no concentration."));
  }

  private static Seed.IdeaSeed idea(String id, String a, String b, String tenor, double ki, double strike, double coupon, String reason) {
    return new Seed.IdeaSeed(id, a + " / " + b + " worst-of · " + tenor, tenor, ki, strike, coupon, List.of("moment", "headroom"),
        new Seed.ConcentrationEffect(a, 0, 6.5, 25), reason);
  }
}
