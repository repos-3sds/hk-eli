import { ChangeDetectionStrategy, Component, effect, inject, input, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter, switchMap } from 'rxjs';
import { TodayDataSource } from '../../core/data/today-data-source';
import { FIXTURE_CLIENTS } from '../../core/data/today.fixture';
import { IdeaMatch } from '../../core/ideas/idea-finder.models';
import { IDEA_SIGNALS } from '../../core/ideas/idea-warehouse.fixture';
import { BuildEliDialog, BuildEliData, BuiltEli } from './build-eli-dialog';
import { ConfirmQuoteDialog, ConfirmQuoteData } from './confirm-quote-dialog';
import { ConcentrationBar } from '../today/shared/concentration-bar';
import { EliDatePipe, UsdPipe } from '../today/shared/format';
import { IdeaFinderStore } from './idea-finder.store';
import { FocusChips } from './focus-chips';
import { SignalPicker } from './signal-picker';

/**
 * The Ideas tab, after the Unusual Whales Trade Finder: say what the client wants in plain words, see it as
 * filter chips, pick up to 10 signals (or a starter pack), and get ideas ranked by how many signals line up.
 */
@Component({
  selector: 'eli-idea-finder-page',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, ConcentrationBar, EliDatePipe, UsdPipe, SignalPicker, FocusChips],
  providers: [IdeaFinderStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './idea-finder-page.html',
  styleUrl: './idea-finder-page.scss',
})
export class IdeaFinderPage {
  protected readonly store = inject(IdeaFinderStore);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly today = inject(TodayDataSource);

  protected readonly clients = FIXTURE_CLIENTS;

  /** ?client=… from Today or Chat. */
  readonly client = input<string | undefined>();

  constructor() {
    effect(() => {
      const id = this.client();
      if (id) {
        untracked(() => {
          this.store.setClient(id);
          this.store.choosePack('rollover');
        });
      }
    });
  }

  protected signalName(id: string): string {
    return IDEA_SIGNALS.find((s) => s.id === id)?.name ?? id;
  }

  protected toggleRow(id: string): void {
    this.store.openRow.update((open) => (open === id ? null : id));
  }

  protected onEnter(event: Event): void {
    const key = event as KeyboardEvent;
    if (key.shiftKey || key.isComposing) {
      return;
    }
    event.preventDefault();
    this.store.read();
  }

  protected requestQuote(match: IdeaMatch): void {
    this.confirmAndSend({ title: match.title, terms: match.terms }, match.id, false);
  }

  /** "Build my own ELI": starts from the chips; a request goes through the same confirm step, labelled Custom. */
  protected openBuilder(): void {
    const data: BuildEliData = { filters: this.store.filters(), clientName: this.store.client()?.name ?? null };
    this.dialog
      .open<BuildEliDialog, BuildEliData, BuiltEli>(BuildEliDialog, { data, width: '880px', maxWidth: 'calc(100vw - 32px)', autoFocus: 'dialog' })
      .afterClosed()
      .pipe(filter((built): built is BuiltEli => !!built))
      .subscribe((built) => {
        const { kiPct, strikePct } = built.spec;
        const id = `custom:${built.spec.underlyings.join('-')}:${built.spec.tenorMonths}m:${kiPct}:${strikePct}`;
        this.confirmAndSend({ title: built.title, terms: { kiPct, strikePct, couponPct: built.price.couponPct } }, id, true);
      });
  }

  private confirmAndSend(idea: ConfirmQuoteData['idea'], ideaId: string, custom: boolean): void {
    const client = this.store.client();
    if (!client) {
      return;
    }
    this.dialog
      .open(ConfirmQuoteDialog, { data: { clientName: client.name, idea, custom } satisfies ConfirmQuoteData, width: '520px' })
      .afterClosed()
      .pipe(
        filter((ok) => ok === true),
        switchMap(() => this.today.requestLiveQuote(client.id, ideaId)),
      )
      .subscribe({
        next: (r) => this.snack.open(`${custom ? 'Custom quote' : 'Quote'} request ${r.requestId} sent to the ${r.desk}.`, 'OK', { duration: 6000 }),
        error: () => this.snack.open('The quote request did not go through. Nothing was sent.', 'OK', { duration: 6000 }),
      });
  }
}
