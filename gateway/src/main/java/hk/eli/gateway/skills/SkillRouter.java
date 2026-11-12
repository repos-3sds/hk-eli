package hk.eli.gateway.skills;

import hk.eli.gateway.chat.ChatService;
import hk.eli.gateway.config.EliProperties;
import hk.eli.gateway.skills.SkillServiceClient.Task;
import hk.eli.gateway.time.BusinessCalendar;
import hk.eli.gateway.time.BusinessClock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Decides which questions the HK ELI skills service answers, and with which skills. Book-level questions go to it;
 * questions about one client, advice, and anything not listed here stay with the gateway's own answers.
 *
 * <p>The plans mirror the service's scenarios: Q1 concentration, Q4 coupons, Q6 maturities and rollovers, Q7 branch
 * concentration, Q8 regional, Q9 digital journey.
 */
@Component
public class SkillRouter {
  /** A routed question: which answer shape to build and the tasks to run. */
  public record Route(String kind, String scenario, List<Task> tasks, boolean localFallback) {}

  static final Pattern BRANCH_CONCENTRATION = Pattern.compile("concentrat\\w* (by|per|across) branch|branch(es)? (concentrat|exposure)");
  static final Pattern BOOK_MATURITIES = Pattern.compile("rollover opportunit|rollover pipeline|maturit(y|ies) and rollovers?|matur\\w* across the book|book matur|whole book");
  static final Pattern REGIONAL = Pattern.compile("\\bregional\\b|by district|by region|district performance");
  static final Pattern DIGITAL = Pattern.compile("digital journey|digibank journey|digibank funnel|journey funnel");
  static final Pattern COUPONS = Pattern.compile("coupons? by product|product yield|weighted coupon|coupon range");

  private final BusinessClock clock;
  private final EliProperties props;

  public SkillRouter(BusinessClock clock, EliProperties props) {
    this.clock = clock;
    this.props = props;
  }

  public Optional<Route> route(String question, boolean hasClient) {
    String t = question.toLowerCase(Locale.ROOT);
    String intent = ChatService.intentOf(question, hasClient, false);
    if (intent.equals("advice")) {
      return Optional.empty();
    }
    Map<String, Object> usd = Map.of("currency", "USD", "days", windowDays());
    if (BRANCH_CONCENTRATION.matcher(t).find()) {
      return Optional.of(new Route("branch", "Q7", List.of(new Task("t0", "eli.branch.concentration", usd)), false));
    }
    if (BOOK_MATURITIES.matcher(t).find()) {
      return Optional.of(new Route("maturities", "Q6", List.of(new Task("t0", "eli.maturity.analyze", usd),
          new Task("t1", "eli.rollover.opportunity", usd)), false));
    }
    if (REGIONAL.matcher(t).find()) {
      return Optional.of(new Route("regional", "Q8", List.of(new Task("t0", "eli.regional.performance", usd)), false));
    }
    if (DIGITAL.matcher(t).find()) {
      return Optional.of(new Route("digital", "Q9", List.of(new Task("t0", "eli.digibank.journey", usd)), false));
    }
    if (COUPONS.matcher(t).find()) {
      return Optional.of(new Route("coupons", "Q4", List.of(new Task("t0", "eli.product.yield", usd)), false));
    }
    if (intent.equals("concentration")) {
      return Optional.of(new Route("concentration", "Q1", List.of(new Task("t0", "eli.risk.concentration", usd)), true));
    }
    return Optional.empty();
  }

  /** Calendar days from the data date to the end of the maturing window (10 business days after today). */
  int windowDays() {
    LocalDate end = BusinessCalendar.addBusinessDays(clock.firstBusinessDay(), props.maturingWindowBusinessDays(), clock.holidays());
    return (int) ChronoUnit.DAYS.between(clock.businessDate(), end);
  }

  /** The last day of the maturing window, for answer wording. */
  LocalDate windowEnd() {
    return BusinessCalendar.addBusinessDays(clock.firstBusinessDay(), props.maturingWindowBusinessDays(), clock.holidays());
  }
}
