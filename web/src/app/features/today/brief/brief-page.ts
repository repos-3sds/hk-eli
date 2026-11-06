import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { MOMENT_LABELS, Moment, Pocket } from '../../../core/models/today.models';
import { ScopeSwitch } from '../shared/scope-switch';
import { Composer } from '../composer/composer';
import { MomentStrip } from '../moment-strip/moment-strip';
import { TrustLine } from '../shared/trust-line';
import { FeedbackButtons } from '../../../core/feedback/feedback-buttons';
import { FreshnessClocks } from '../../../core/freshness/freshness-clocks';
import { FreshnessStore } from '../../../core/freshness/freshness';
import { EliDatePipe, UsdPipe } from '../shared/format';
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
  imports: [MatButtonModule, MatIconModule, Composer, MomentStrip, BriefRow, TrustLine, FreshnessClocks, FeedbackButtons, EliDatePipe, UsdPipe, ScopeSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './brief-page.html',
  styleUrl: './brief-page.scss',
})
export class BriefPage {
  protected readonly store = inject(TodayStore);
  protected readonly actions = inject(LeadActions);
  protected readonly freshness = inject(FreshnessStore);
  /** After a failed overnight run, the user can still look at the last good list, clearly labelled. */
  protected readonly showLastGood = signal(false);
  protected readonly clock = clockTime;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly router = inject(Router);


  protected readonly moreLabel = computed(() => {
    const hidden = this.store.hiddenLeads();
    if (hidden.length > 3) {
      return `Show ${hidden.length} more clients`;
    }
    const who = hidden.map((l) => `${l.clientShortName} · ${MOMENT_LABELS[l.moment.type].toLowerCase()}`).join(', ');
    return `Show ${hidden.length} more ${hidden.length === 1 ? 'client' : 'clients'} (${who})`;
  });

  protected readonly skeletons = [0, 1, 2];

  /** A suggested question goes straight to Chat, with the client in focus. */
  protected askNow(question: string): void {
    const client = this.store.pickedClientId() ?? this.store.openLeads()[0]?.clientId;
    void this.router.navigate(['/chat'], { queryParams: { q: question, client } });
  }

  /** Ideas for a pocket: the Ideas tab opens with that branch and segment in the brief line. */
  protected ideasForPocket(pocket: Pocket): void {
    void this.router.navigate(['/ideas'], { queryParams: { pocket: pocket.id } });
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
