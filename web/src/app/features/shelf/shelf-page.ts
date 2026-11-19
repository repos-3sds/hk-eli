import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Term } from '../../core/help/term';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LoadState } from '../../core/data/load-state';
import { pageLoad } from '../../core/data/page-load';
import { FeedbackButtons } from '../../core/feedback/feedback-buttons';
import { FreshnessClocks } from '../../core/freshness/freshness-clocks';
import { STARTER_PACKS } from '../../core/ideas/idea-warehouse.fixture';
import { DIGIBANK_FUNNEL, DIGIBANK_PARAMETER_SETS, PRICING_CUTOFF_HKT, biggestDrop, cutoffStatus, demandLines } from '../../core/shelf/shelf';
import { ShelfStore } from '../../core/shelf/shelf.store';
import { BusinessClock } from '../../core/time/business-clock';
import { addBusinessDays, longDate } from '../../core/time/business-calendar';
import { MyPacksStore } from '../idea-finder/my-packs.store';

/**
 * Shelf console for the CBG Product Manager (R21, R25): demand next to concentration, tomorrow's shelf picked
 * before the pricing cut-off, starter packs published to everyone, and where digibank clients drop off.
 */
@Component({
  selector: 'eli-shelf-page',
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule, MatTooltipModule, FreshnessClocks, FeedbackButtons, LoadState, Term],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shelf-page.html',
  styleUrl: './shelf-page.scss',
})
export class ShelfPage {
  protected readonly load = pageLoad('The RFQ log and digibank quote log did not answer in time.');
  protected readonly store = inject(ShelfStore);
  private readonly myPacks = inject(MyPacksStore);
  private readonly clock = inject(BusinessClock);
  private readonly snack = inject(MatSnackBar);

  protected readonly demand = demandLines();
  protected readonly funnel = DIGIBANK_FUNNEL;
  protected readonly sets = DIGIBANK_PARAMETER_SETS;
  protected readonly drop = biggestDrop(DIGIBANK_FUNNEL);
  protected readonly cutoffTime = PRICING_CUTOFF_HKT;

  private readonly now = signal(new Date());
  protected readonly cutoff = computed(() => cutoffStatus(this.now()));
  /** The day the picks are priced for: tomorrow, or the day after once the cut-off has passed. */
  protected readonly forDate = computed(() => longDate(addBusinessDays(this.clock.firstBusinessDay(), this.cutoff().passed ? 2 : 1, this.clock.holidays)));

  /** Packs the PM can publish: the built-in starter packs and their own saved packs. */
  protected readonly publishable = computed(() => [
    ...STARTER_PACKS.map((p) => ({ name: p.name, blurb: p.blurb, signalIds: p.signalIds, mine: false })),
    ...this.myPacks.packs().map((p) => ({ name: p.name, blurb: `${p.signalIds.length} signals, saved by you`, signalIds: p.signalIds, mine: true })),
  ]);

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected barWidth(count: number): number {
    return Math.round((count / this.funnel[0].count) * 100);
  }

  protected copyRequest(): void {
    const text = this.store.requestText(this.forDate());
    const failed = () => this.snack.open('Could not copy. Select the list and copy it by hand.', 'OK', { duration: 5000 });
    if (!navigator.clipboard) {
      failed();
      return;
    }
    navigator.clipboard.writeText(text).then(() => this.snack.open('Shelf request copied for the desk.', 'OK', { duration: 4000 }), failed);
  }

  protected markRequested(): void {
    const req = this.store.markRequested(this.forDate());
    if (req) {
      this.snack.open(`Recorded: ${req.ideaIds.length} ideas sent to the desk for ${req.forDate}.`, 'OK', { duration: 4000 });
    }
  }
}
