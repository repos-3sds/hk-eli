import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { FreshnessStore } from '../../../core/freshness/freshness';
import { longDate } from '../../../core/time/business-calendar';
import { EvidenceDialog } from './evidence-dialog';

/**
 * "Data as of close · Prices · sources · Figures computed, words by AI · Internal use only · View rows" (R20, R29, R37, R39).
 * A late or failed run turns the line amber, so stale figures never look current.
 */
@Component({
  selector: 'eli-trust-line',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.stale]': 'stale()' },
  template: `
    <mat-icon [svgIcon]="stale() ? 'triangle-alert' : 'info'" aria-hidden="true" />
    <span>{{ clocks() }} · {{ sources().join(', ') }} · Figures computed, words by AI · Internal use only</span>
    <button type="button" class="eli-link" (click)="openRows()">View rows</button>
  `,
  styles: `
    :host { display: flex; align-items: center; flex-wrap: wrap; gap: var(--eli-space-3); color: var(--eli-text-muted); font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s); }
    :host(.stale) { color: var(--eli-accent-orange); }
    mat-icon { width: 14px; height: 14px; flex: none; }
    .eli-link { font-size: inherit; }
  `,
})
export class TrustLine {
  private readonly dialog = inject(MatDialog);
  private readonly freshness = inject(FreshnessStore);
  /** Fallback when the clocks have not loaded: the business date of the figures. */
  readonly businessDate = input<string | null>(null);
  readonly sources = input.required<readonly string[]>();
  readonly reference = input('brief');

  protected readonly stale = computed(() => {
    const f = this.freshness.value();
    return !!f && f.state !== 'ready';
  });

  protected readonly clocks = computed(() => {
    const data = this.freshness.dataClock();
    const prices = this.freshness.priceClock();
    if (data && prices) {
      return `${data} · ${prices}`;
    }
    const date = this.businessDate();
    return date ? `Data as of close ${longDate(date)}` : 'Checking how fresh the data is';
  });

  protected openRows(): void {
    this.dialog.open(EvidenceDialog, { data: { reference: this.reference(), title: 'Rows behind these figures' }, width: '720px', maxWidth: '95vw' });
  }
}
