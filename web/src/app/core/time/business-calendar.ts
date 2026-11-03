/**
 * Business-day arithmetic on ISO dates (YYYY-MM-DD). Weekends and the configured
 * market holidays are skipped. Pure functions, so the strip, the brief and the tests agree.
 */

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = parse(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}

export function isBusinessDay(iso: string, holidays: readonly string[]): boolean {
  const day = parse(iso).getUTCDay();
  return day !== 0 && day !== 6 && !holidays.includes(iso);
}

/** The first business day on or after `iso`. */
export function rollForward(iso: string, holidays: readonly string[]): string {
  let current = iso;
  while (!isBusinessDay(current, holidays)) {
    current = addDays(current, 1);
  }
  return current;
}

/** The business day `n` business days after `iso` (n may be negative). */
export function addBusinessDays(iso: string, n: number, holidays: readonly string[]): string {
  let current = iso;
  let remaining = Math.abs(n);
  const step = n >= 0 ? 1 : -1;
  while (remaining > 0) {
    current = addDays(current, step);
    if (isBusinessDay(current, holidays)) {
      remaining -= 1;
    }
  }
  return current;
}

/** `count` business days starting with `start` (rolled forward if it is not a business day). */
export function nextBusinessDays(start: string, count: number, holidays: readonly string[]): string[] {
  const days: string[] = [];
  let current = rollForward(start, holidays);
  while (days.length < count) {
    days.push(current);
    current = addBusinessDays(current, 1, holidays);
  }
  return days;
}

/** The last business day before `iso`: the data date of a morning brief. */
export function previousBusinessDay(iso: string, holidays: readonly string[]): string {
  return addBusinessDays(iso, -1, holidays);
}

/** Today's ISO date in a time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** "Thu 6" */
export function dayLabel(iso: string): string {
  const date = parse(iso);
  return `${WEEKDAYS_SHORT[date.getUTCDay()]} ${date.getUTCDate()}`;
}

/** "Thu 6 Nov" */
export function shortDate(iso: string): string {
  const date = parse(iso);
  return `${WEEKDAYS_SHORT[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]}`;
}

/** "06 Nov" */
export function dayMonth(iso: string): string {
  const date = parse(iso);
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS_SHORT[date.getUTCMonth()]}`;
}

/** "31 Oct 2026" */
export function longDate(iso: string): string {
  const date = parse(iso);
  return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "Thursday" */
export function weekdayName(iso: string): string {
  return WEEKDAYS_LONG[parse(iso).getUTCDay()];
}

/** "Today" for 0, otherwise "T-3". */
export function offsetLabel(offset: number): string {
  return offset === 0 ? 'Today' : `T-${offset}`;
}
