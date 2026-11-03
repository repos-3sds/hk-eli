import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import { TodayDataSource } from '../../../core/data/today-data-source';
import { Idea, MomentType, RolloverIdeas } from '../../../core/models/today.models';
import { longDate, weekdayName } from '../../../core/time/business-calendar';
import { BusinessClock } from '../../../core/time/business-clock';
import { ConcentrationBar } from '../shared/concentration-bar';
import { MomentChip } from '../shared/moment-chip';
import { OutcomeChip } from '../shared/outcome-chip';
import { TrustLine } from '../shared/trust-line';
import { clockTime, usdCompact } from '../shared/format';
import { momentText } from '../shared/moment-text';
import { TodayStore } from '../today.store';
import { ConfirmQuoteDialog } from './confirm-quote-dialog';
import { IdeaCard } from './idea-card';

const TITLES: Record<MomentType, string> = {
  maturity: 'Rollover ideas for',
  knockout: 'Rollover ideas for',
  exercised: 'Ideas for the delivered stock for',
  idle: 'Reactivation ideas for',
  rfq: 'Ideas for',
};

/** Today, second view: ranked ideas for one client's moment, with call prep (the rollover nudge). */
@Component({
  selector: 'eli-ideas-page',
  imports: [MatButtonModule, MatIconModule, RouterLink, IdeaCard, MomentChip, ConcentrationBar, OutcomeChip, TrustLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ideas-page.html',
  styleUrl: './ideas-page.scss',
})
export class IdeasPage {
  /** From the route: /rm/today/ideas/:clientId */
  readonly clientId = input.required<string>();

  protected readonly store = inject(TodayStore);
  private readonly data = inject(TodayDataSource);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly clock = inject(BusinessClock);

  protected readonly ideas = rxResource({ params: () => this.clientId(), stream: ({ params }) => this.data.getIdeas(params) });
  protected readonly requested = signal<ReadonlySet<string>>(new Set());
  protected readonly businessDate = this.clock.businessDate();

  constructor() {
    // The dock follows the client whose ideas are open.
    effect(() => this.store.pickClient(this.clientId()));
  }

  protected readonly view = computed(() => {
    if (!this.ideas.hasValue()) {
      return null;
    }
    const set: RolloverIdeas = this.ideas.value();
    const count = set.ideas.length;
    const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five'][count] ?? String(count);
    const cash = set.amountUsd > 0 ? `${usdCompact(set.amountUsd)} returns as cash on ${weekdayName(set.moment.date)}. ` : '';
    return {
      set,
      title: `${TITLES[set.moment.type]} ${set.clientName}`,
      chip: momentText(set.moment),
      echo: `Show ${TITLES[set.moment.type].replace(/ for$/, '').toLowerCase()} for ${set.clientShortName} (from the morning brief)`,
      sub: `${cash}${words} ${count === 1 ? 'idea' : 'ideas'} from the daily pre-priced warehouse, filtered by the client's entitlements and concentration. Ranked by how many signals agree.`,
    };
  });

  protected priced(idea: Idea): string {
    return `${longDate(idea.pricedAt.slice(0, 10))}, ${clockTime(idea.pricedAt).replace(' HKT', '')} HKT`;
  }

  protected requestQuote(set: RolloverIdeas, idea: Idea): void {
    this.dialog
      .open(ConfirmQuoteDialog, { data: { clientName: set.clientName, idea }, width: '520px', maxWidth: '95vw' })
      .afterClosed()
      .pipe(
        filter((yes) => yes === true),
        switchMap(() => this.data.requestLiveQuote(set.clientId, idea.id)),
      )
      .subscribe({
        next: (receipt) => {
          this.requested.update((s) => new Set(s).add(idea.id));
          this.snack.open(`Quote request ${receipt.requestId} sent to the ${receipt.desk}.`, 'OK', { duration: 5000 });
        },
        error: () => this.snack.open('The quote request was not sent. Try again.', 'OK', { duration: 6000 }),
      });
  }
}
