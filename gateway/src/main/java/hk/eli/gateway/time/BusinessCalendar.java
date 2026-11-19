package hk.eli.gateway.time;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;

/** Business-day arithmetic. Weekends and market holidays are skipped. Mirrors web/src/app/core/time/business-calendar.ts. */
public final class BusinessCalendar {
  private BusinessCalendar() {}

  public static boolean isBusinessDay(LocalDate d, Collection<LocalDate> holidays) {
    DayOfWeek w = d.getDayOfWeek();
    return w != DayOfWeek.SATURDAY && w != DayOfWeek.SUNDAY && !holidays.contains(d);
  }

  public static LocalDate rollForward(LocalDate d, Collection<LocalDate> holidays) {
    LocalDate c = d;
    while (!isBusinessDay(c, holidays)) {
      c = c.plusDays(1);
    }
    return c;
  }

  public static LocalDate addBusinessDays(LocalDate d, int n, Collection<LocalDate> holidays) {
    LocalDate c = d;
    int remaining = Math.abs(n);
    int step = n >= 0 ? 1 : -1;
    while (remaining > 0) {
      c = c.plusDays(step);
      if (isBusinessDay(c, holidays)) {
        remaining--;
      }
    }
    return c;
  }

  public static List<LocalDate> nextBusinessDays(LocalDate start, int count, Collection<LocalDate> holidays) {
    List<LocalDate> days = new ArrayList<>();
    LocalDate c = rollForward(start, holidays);
    while (days.size() < count) {
      days.add(c);
      c = addBusinessDays(c, 1, holidays);
    }
    return days;
  }

  public static LocalDate previousBusinessDay(LocalDate d, Collection<LocalDate> holidays) {
    return addBusinessDays(d, -1, holidays);
  }

  /** "Friday". */
  public static String weekdayName(LocalDate d) {
    return d.getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.UK);
  }

  private static final String[] MONTHS = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
  private static final String[] WEEKDAYS = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"};

  /** "3 Nov 2026", as the web app writes it. Fixed English names, so the JVM locale cannot change them ("Sept"). */
  public static String longDate(LocalDate d) {
    return d.getDayOfMonth() + " " + MONTHS[d.getMonthValue() - 1] + " " + d.getYear();
  }

  /** "Tue 3 Nov". */
  public static String shortDate(LocalDate d) {
    return WEEKDAYS[d.getDayOfWeek().getValue() - 1] + " " + d.getDayOfMonth() + " " + MONTHS[d.getMonthValue() - 1];
  }
}
