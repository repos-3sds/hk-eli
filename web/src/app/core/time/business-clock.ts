import { Injectable, inject } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { previousBusinessDay, rollForward, todayIn } from './business-calendar';

/** "Today" for the whole app: the configured as-of date, or the real date in the desk's time zone. */
@Injectable({ providedIn: 'root' })
export class BusinessClock {
  private readonly config = inject(APP_CONFIG);

  get holidays(): readonly string[] {
    return this.config.marketHolidays;
  }

  /** The calendar date today (may be a weekend). */
  today(): string {
    return this.config.asOfDate ?? todayIn(this.config.timeZone);
  }

  /** The business day the strip starts on. */
  firstBusinessDay(): string {
    return rollForward(this.today(), this.holidays);
  }

  /** The data date of the morning brief: the last business day before today. */
  businessDate(): string {
    return previousBusinessDay(this.firstBusinessDay(), this.holidays);
  }

  /** Hour of day in the desk's time zone, for the greeting. */
  hour(now: Date = new Date()): number {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: this.config.timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
  }
}
