package hk.eli.gateway.today;

import static hk.eli.gateway.time.BusinessCalendar.previousBusinessDay;

import hk.eli.gateway.time.BusinessClock;
import hk.eli.gateway.today.TodayModels.Freshness;
import java.time.LocalDate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Demo clocks: ready, prices-late or run-failed, set by {@code eli.freshness-state}. */
@Component
public class DemoFreshnessSource implements FreshnessSource {
  private final BusinessClock clock;
  private final String state;

  public DemoFreshnessSource(BusinessClock clock, @Value("${eli.freshness-state:ready}") String state) {
    this.clock = clock;
    this.state = state;
  }

  @Override
  public Freshness current() {
    LocalDate today = clock.today();
    LocalDate close = clock.businessDate();
    return switch (state) {
      case "run-failed" -> new Freshness("run-failed", previousBusinessDay(close, clock.holidays()).toString(), null, clock.at(today, "09:05"), true, null);
      case "prices-late" -> new Freshness("prices-late", close.toString(), clock.at(today, "05:40"), clock.at(close, "09:05"), false, clock.at(today, "09:30"));
      default -> new Freshness("ready", close.toString(), clock.at(today, "05:40"), clock.at(today, "09:05"), true, null);
    };
  }
}
