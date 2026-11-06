import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FreshnessStore } from './freshness';

/**
 * The two clocks as small pills: "Data as of close Mon 2 Nov" and "Prices 09:05 HKT today".
 * A late or failed run turns the pill amber and, unless `compact`, shows a one-line banner under it.
 */
@Component({
  selector: 'eli-freshness-clocks',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.value(); as f) {
      <div class="clocks" role="group" aria-label="How fresh the figures are">
        <span class="clock" [class.warn]="f.state === 'run-failed'">
          <mat-icon svgIcon="database" aria-hidden="true" />{{ store.dataClock() }}
        </span>
        <span class="clock" [class.warn]="!f.pricesToday">
          <mat-icon svgIcon="clock" aria-hidden="true" />{{ store.priceClock() }}
        </span>
      </div>
      @if (!compact() && store.warning(); as w) {
        <p class="banner" role="status"><mat-icon svgIcon="triangle-alert" aria-hidden="true" />{{ w }}</p>
      }
    } @else if (store.freshness.error()) {
      <p class="banner" role="alert">
        <mat-icon svgIcon="triangle-alert" aria-hidden="true" />Could not check how fresh the data is.
        <button type="button" class="eli-link" (click)="store.reload()">Try again</button>
      </p>
    } @else {
      <div class="clocks" aria-busy="true"><span class="eli-skeleton" style="height: 22px; width: 330px"></span></div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--eli-space-4); }
    .clocks { display: flex; flex-wrap: wrap; gap: var(--eli-space-3); }
    .clock {
      display: inline-flex; align-items: center; gap: var(--eli-space-2); height: 22px; padding: 0 var(--eli-space-4);
      border: 1px solid var(--eli-border); border-radius: 11px; color: var(--eli-text-muted-2);
      font-size: var(--eli-font-size-s); white-space: nowrap;
      mat-icon { width: 12px; height: 12px; }
    }
    .clock.warn { border-color: var(--eli-accent-orange); color: var(--eli-accent-orange); }
    .banner {
      display: flex; align-items: flex-start; gap: var(--eli-space-3); margin: 0; padding: var(--eli-space-4) var(--eli-space-6);
      border-left: 3px solid var(--eli-accent-orange); border-radius: var(--eli-radius-s); background: var(--eli-bg-surface);
      color: var(--eli-text-primary); font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s);
      mat-icon { flex: none; width: 14px; height: 14px; margin-top: 2px; color: var(--eli-accent-orange); }
    }
  `,
})
export class FreshnessClocks {
  protected readonly store = inject(FreshnessStore);
  /** Pills only, no banner (for tight places such as answer footers). */
  readonly compact = input(false);
}
