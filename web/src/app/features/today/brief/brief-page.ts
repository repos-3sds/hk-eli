import { ChangeDetectionStrategy, Component, ElementRef, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { MOMENT_LABELS, Moment } from '../../../core/models/today.models';
import { Composer } from '../composer/composer';
import { MomentStrip } from '../moment-strip/moment-strip';
import { TrustLine } from '../shared/trust-line';
import { clockTime } from '../shared/format';
import { TodayStore } from '../today.store';
import { BriefRow } from './brief-row';
import { LeadActions } from './lead-actions';

/**
 * Today landing view, a calm centred column: greeting, headline and short brief, the ask box with suggested
 * questions, then tabs for the morning brief and the 10-day calendar. The client panel opens when a client is picked.
 */
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
  private readonly router = inject(Router);

  protected readonly preparedAt = computed(() => (this.store.brief.hasValue() ? clockTime(this.store.brief.value().preparedAt) : ''));

  protected readonly moreLabel = computed(() => {
    const hidden = this.store.hiddenLeads();
    const who = hidden.map((l) => `${l.clientShortName} · ${MOMENT_LABELS[l.moment.type].toLowerCase()}`).join(', ');
    return `Show ${hidden.length} more ${hidden.length === 1 ? 'client' : 'clients'} (${who})`;
  });

  protected readonly skeletons = [0, 1, 2];

  /** A suggested question goes straight to Chat, with the client in focus. */
  protected askNow(question: string): void {
    const client = this.store.pickedClientId() ?? this.store.openLeads()[0]?.clientId;
    void this.router.navigate(['/rm/chat'], { queryParams: { q: question, client } });
  }

  /** Arrow keys move between the two tabs. */
  protected switchTab(tab: 'brief' | 'calendar', event: Event): void {
    event.preventDefault();
    this.store.landingTab.set(tab);
    queueMicrotask(() => (this.host.nativeElement.querySelector(`#tab-${tab}`) as HTMLElement | null)?.focus());
  }

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
