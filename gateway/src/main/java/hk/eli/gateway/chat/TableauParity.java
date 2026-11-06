package hk.eli.gateway.chat;

import hk.eli.gateway.chat.ChatModels.Parity;
import java.util.Map;

/**
 * Tableau parity (R36), as in web/src/app/core/parity/tableau-parity.ts. Demo results of last night's check; in
 * production a job after the overnight refresh compares each answer type with its Tableau view and stores the result.
 * View names are placeholders until the bank shares the launch users' list of views.
 */
public final class TableauParity {
  private TableauParity() {}

  private static final String WAITING = "Not checked yet: waiting for the list of Tableau views.";

  public static final Map<String, Parity> RESULTS = Map.of(
      "rollover", new Parity("ELI rollover by branch (demo name)", "mismatch",
          "Kwun Tong · Treasures: 5 of 11 here, 5 of 12 in Tableau. Tableau also counts a maturity that settled after the close; this answer uses the blotter at close."),
      "concentration", new Parity("ELI concentration against limits (demo name)", "match", null),
      "maturities", new Parity("ELI maturity calendar (demo name)", "match", null),
      "knockouts", new Parity("ELI knock-out watch (demo name)", "unchecked", WAITING),
      "unmet", new Parity("RFQ funnel (demo name)", "unchecked", WAITING),
      "client", new Parity("Client ELI holdings (demo name)", "match", null));
}
