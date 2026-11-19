package hk.eli.gateway.time;

import hk.eli.gateway.config.EliProperties;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import org.springframework.stereotype.Component;

/** "Today" for the whole gateway: the pinned as-of date, or the real date in the desk's time zone. */
@Component
public class BusinessClock {
  private final EliProperties props;
  private final Clock clock;

  public BusinessClock(EliProperties props, Clock clock) {
    this.props = props;
    this.clock = clock;
  }

  public ZoneId zone() {
    return ZoneId.of(props.timeZone());
  }

  public List<LocalDate> holidays() {
    return props.marketHolidays();
  }

  public LocalDate today() {
    return props.asOfDate() != null ? props.asOfDate() : LocalDate.now(clock.withZone(zone()));
  }

  public ZonedDateTime now() {
    return ZonedDateTime.now(clock.withZone(zone()));
  }

  public LocalDate firstBusinessDay() {
    return BusinessCalendar.rollForward(today(), holidays());
  }

  /** The data date: the last business day before today. */
  public LocalDate businessDate() {
    return BusinessCalendar.previousBusinessDay(firstBusinessDay(), holidays());
  }

  /** "2026-11-03T09:05:00+08:00" for a time on a date in the desk's zone. */
  public String at(LocalDate date, String hhmm) {
    return date + "T" + hhmm + ":00" + zone().getRules().getOffset(date.atStartOfDay()).getId().replace("Z", "+00:00");
  }
}
