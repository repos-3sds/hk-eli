import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Term } from '../../core/help/term';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter } from 'rxjs';
import { FreshnessStore } from '../../core/freshness/freshness';
import { FeedbackButtons } from '../../core/feedback/feedback-buttons';
import { FreshnessClocks } from '../../core/freshness/freshness-clocks';
import { FIXTURE_CLIENTS } from '../../core/data/today.fixture';
import { ownerOf } from '../../core/data/business.fixture';
import { HandoffStore } from '../../core/handoff/handoff.store';
import { HandoffOpener } from '../../core/handoff/handoff-opener';
import { ConcentrationEffect, IdeaMatch } from '../../core/ideas/idea-finder.models';
import { concentrationEffects } from '../../core/ideas/idea-finder-logic';
import { IDEA_SIGNALS } from '../../core/ideas/idea-warehouse.fixture';
import { BuildEliDialog, BuildEliData, BuiltEli } from './build-eli-dialog';
import { ConcentrationBar } from '../today/shared/concentration-bar';
import { UsdPipe } from '../today/shared/format';
import { IdeaFinderStore } from './idea-finder.store';
import { FocusChips } from './focus-chips';
import { SignalPicker } from './signal-picker';

/**
 * The Ideas tab, after the Unusual Whales Trade Finder: say what the client wants in plain words, see it as
 * filter chips, pick up to 10 signals (or a starter pack), and get ideas ranked by how many signals line up.
 */
@Component({
  selector: 'eli-idea-finder-page',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, ConcentrationBar, UsdPipe, SignalPicker, FocusChips, FreshnessClocks, FeedbackButtons, Term],
  providers: [IdeaFinderStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './idea-finder-page.html',
  styleUrl: './idea-finder-page.scss',
})
export class IdeaFinderPage {
  protected readonly store = inject(IdeaFinderStore);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly freshness = inject(FreshnessStore);
  protected readonly copiedId = signal<string | null>(null);
  protected readonly handoff = inject(HandoffStore);
  private readonly opener = inject(HandoffOpener);

  protected readonly clients = FIXTURE_CLIENTS;

  /** ?client=… from Today or Chat. */
  readonly client = input<string | undefined>();
  /** ?pocket=… from a rollover pocket card on Today. */
  readonly pocket = input<string | undefined>();

  constructor() {
    effect(() => {
      const id = this.pocket();
      untracked(() => {
        this.store.setPocket(id ?? null);
        if (id) {
          this.store.choosePack('rollover');
        }
      });
    });
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

  /** Met signals first, so the count reads at a glance; the same order as the dots. */
  protected orderedChecks(m: IdeaMatch): readonly IdeaMatch['checks'][number][] {
    return [...m.checks].sort((a, b) => Number(b.met) - Number(a.met));
  }

  /** "3 of 5 signals line up" and then each signal by name with yes or no, for the hover and screen readers. */
  protected signalsLabel(m: IdeaMatch): string {
    return [`${m.met} of ${m.checks.length} signals line up:`, ...this.orderedChecks(m).map((c) => `${c.met ? 'Yes' : 'No'}: ${this.signalName(c.signalId)}`)].join('\n');
  }

  /** Every name in a worst-of, for the concentration hover. Same rule as the ranking, so the highest matches the bar. */
  protected namesFor(m: IdeaMatch): readonly ConcentrationEffect[] | null {
    const client = this.store.client();
    if (!client || m.underlyings.length < 2 || !this.store.results.hasValue()) return null;
    return concentrationEffects(m, client, this.store.results.value().notionalUsd);
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

  /**
   * "Copy terms": at launch nobody requests a quote for a client from the chatbot (R13 is MVP2), so the terms
   * travel by copy, with their price time and the internal-only label. The confirm-quote dialog stays for MVP2.
   */
  protected copyTerms(match: IdeaMatch): void {
    const { couponPct, kiPct, strikePct } = match.terms;
    this.copy(match.id, `${match.title} · coupon ${couponPct}% p.a. · KI ${kiPct}% · strike ${strikePct}%`);
  }

  /** Whose hand-off list an idea goes to: the client's owner RM, else the pocket's branch, else the desk. */
  protected handoffTarget(): { clientId: string | null; clientName: string | null; ownerRm: string; branch: string; reason: string } {
    const client = this.store.client();
    if (client) {
      const owner = ownerOf(client.id);
      return { clientId: client.id, clientName: client.name, ownerRm: owner?.rmName ?? 'Unassigned', branch: owner?.branch ?? 'Unassigned', reason: `Idea for ${client.name}` };
    }
    const pocket = this.store.pocket();
    if (pocket) {
      return { clientId: null, clientName: null, ownerRm: `${pocket.branch} branch`, branch: pocket.branch, reason: `Idea for the ${pocket.branch} ${pocket.segment} pocket (${pocket.rolloverPct}% rollover)` };
    }
    return { clientId: null, clientName: null, ownerRm: 'All RMs', branch: 'Whole business', reason: 'Idea to share' };
  }

  protected isOnHandoff(match: IdeaMatch): boolean {
    return this.handoff.has(this.handoffTarget().clientId, match.title);
  }

  protected addToHandoff(match: IdeaMatch): void {
    const { couponPct, kiPct, strikePct } = match.terms;
    const added = this.handoff.add({
      ...this.handoffTarget(),
      idea: { title: match.title, terms: `coupon ${couponPct}% p.a. · KI ${kiPct}% · strike ${strikePct}%`, pricedAt: match.pricedAt },
      underlyings: match.underlyings,
      from: 'Ideas',
    });
    this.snack
      .open(added ? `${match.title} added to the hand-off list.` : 'Already on the hand-off list.', 'Open list', { duration: 4000 })
      .onAction()
      .subscribe(() => this.opener.open());
  }

  /** "Build my own ELI": starts from the chips; the solved terms are copied the same way, labelled Custom. */
  protected openBuilder(): void {
    const data: BuildEliData = { filters: this.store.filters(), clientName: this.store.client()?.name ?? null };
    this.dialog
      .open<BuildEliDialog, BuildEliData, BuiltEli>(BuildEliDialog, { data, width: '880px', maxWidth: 'calc(100vw - 32px)', autoFocus: 'dialog' })
      .afterClosed()
      .pipe(filter((built): built is BuiltEli => !!built))
      .subscribe((built) => {
        const { kiPct, strikePct } = built.spec;
        const id = `custom:${built.spec.underlyings.join('-')}:${built.spec.tenorMonths}m:${kiPct}:${strikePct}`;
        this.copy(id, `Custom: ${built.title} · indicative coupon ${built.price.couponPct}% p.a. · KI ${kiPct}% · strike ${strikePct}%`);
      });
  }

  private copy(id: string, terms: string): void {
    const client = this.store.client();
    const text = [terms, client ? `For ${client.name}` : null, `Indicative. ${this.freshness.priceClock() ?? ''}`, 'Internal use only. Not a recommendation.']
      .filter(Boolean)
      .join('\n');
    const done = () => {
      this.copiedId.set(id);
      this.snack.open('Terms copied with their price time and the internal-only label.', 'OK', { duration: 4000 });
      setTimeout(() => this.copiedId.update((c) => (c === id ? null : c)), 2500);
    };
    const failed = () => this.snack.open('Could not copy. Select the terms and copy them by hand.', 'OK', { duration: 5000 });
    if (!navigator.clipboard) {
      failed();
      return;
    }
    navigator.clipboard.writeText(text).then(done, failed);
  }
}
