import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TodayDataSource } from '../data/today-data-source';
import { Freshness } from '../models/today.models';
import { shortDate } from '../time/business-calendar';

/** "09:05 HKT" from an ISO timestamp with an offset. */
function hktTime(iso: string): string {
  const match = /T(\d{2}:\d{2})/.exec(iso);
  return match ? `${match[1]} HKT` : '';
}

/** "Data as of close Mon 2 Nov" */
export function dataClockText(f: Freshness): string {
  return `Data as of close ${shortDate(f.dataAsOf)}`;
}

/** "Prices 09:05 HKT today" or "Prices from Mon 2 Nov 09:05 HKT" */
export function priceClockText(f: Freshness): string {
  return f.pricesToday ? `Prices ${hktTime(f.pricesAsOf)} today` : `Prices from ${shortDate(f.pricesAsOf.slice(0, 10))} ${hktTime(f.pricesAsOf)}`;
}

/** What the amber banner says when a run is late or failed. Null on a normal day. */
export function freshnessWarning(f: Freshness): string | null {
  switch (f.state) {
    case 'prices-late':
      return `This morning's prices are not in yet${f.pricesExpectedAt ? ` (expected ${hktTime(f.pricesExpectedAt)})` : ''}. Ideas show the last prices, marked with their date, and priced hand-offs wait until the run lands.`;
    case 'run-failed':
      return `Last night's data refresh did not finish. Figures are as of close ${shortDate(f.dataAsOf)}, so there is no "new today" list. Nothing was changed; the screens refresh when the run lands.`;
    default:
      return null;
  }
}

/** The two clocks for the whole app (R37). One load per session; every screen reads the same answer. */
@Injectable({ providedIn: 'root' })
export class FreshnessStore {
  private readonly data = inject(TodayDataSource);

  readonly freshness = rxResource({ stream: () => this.data.getFreshness() });

  readonly value = computed<Freshness | null>(() => (this.freshness.hasValue() ? this.freshness.value() : null));
  readonly dataClock = computed(() => (this.value() ? dataClockText(this.value()!) : null));
  readonly priceClock = computed(() => (this.value() ? priceClockText(this.value()!) : null));
  readonly warning = computed(() => (this.value() ? freshnessWarning(this.value()!) : null));
  /** Priced hand-offs and "new today" wording depend on these. */
  readonly pricesReady = computed(() => this.value()?.pricesToday ?? false);
  readonly runFailed = computed(() => this.value()?.state === 'run-failed');

  reload(): void {
    this.freshness.reload();
  }
}
