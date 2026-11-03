import { ChangeDetectionStrategy, Component, ElementRef, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MOMENT_LABELS, Moment } from '../../../core/models/today.models';
import { Composer } from '../composer/composer';
import { MomentStrip } from '../moment-strip/moment-strip';
import { TrustLine } from '../shared/trust-line';
import { clockTime } from '../shared/format';
import { TodayStore } from '../today.store';
import { BriefRow } from './brief-row';
import { LeadActions } from './lead-actions';

/** Today, first view: the moment strip and the morning brief. Order: greeting and short brief, the ask box, the strip, then the ranked brief list (its actions sit in the right-hand panel). */
@Component({
  selector: 'eli-brief-page',
  imports: [MatButtonModule, MatIconModule, Composer, MomentStrip, BriefRow, TrustLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './brief-page.html',
  styleUrl: './brief-page.scss',
})
export class BriefPage {
  protected readonly store = inject(TodayStore);
  protected readonly actions = inject(LeadActions);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly preparedAt = computed(() => (this.store.brief.hasValue() ? clockTime(this.store.brief.value().preparedAt) : ''));

  protected readonly moreLabel = computed(() => {
    const hidden = this.store.hiddenLeads();
    const who = hidden.map((l) => `${l.clientShortName} · ${MOMENT_LABELS[l.moment.type].toLowerCase()}`).join(', ');
    return `Show ${hidden.length} more ${hidden.length === 1 ? 'client' : 'clients'} (${who})`;
  });

  protected readonly skeletons = [0, 1, 2];

  /** A chip in the strip was pressed: bring that client's lead into view if it is in the brief. */
  protected onStripPick(moment: Moment): void {
    const index = this.store.matchingLeads().findIndex((l) => l.clientId === moment.clientId);
    if (index < 0) {
      return;
    }
    if (index >= this.store.visibleLeads().length) {
      this.store.showAllLeads.set(true);
    }
    queueMicrotask(() => {
      const el = this.host.nativeElement.querySelector(`#lead-${this.store.matchingLeads()[index].id}`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
}
