import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, linkedSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { FeedbackButtons } from '../../core/feedback/feedback-buttons';
import { FreshnessClocks } from '../../core/freshness/freshness-clocks';
import { FreshnessStore } from '../../core/freshness/freshness';
import { HandoffStore } from '../../core/handoff/handoff.store';
import { BookScope, SCOPE_OPTIONS } from '../../core/models/today.models';
import { BusinessClock } from '../../core/time/business-clock';
import { SessionService } from '../../core/session/session.service';
import { longDate } from '../../core/time/business-calendar';
import { buildBusinessUpdate, updateAsText } from '../../core/update/business-update';
import { ScopeSwitch } from '../today/shared/scope-switch';

/**
 * The Business Update tab (R2): the monthly Tableau routine as 14 sections, sliced by the same scope switch
 * as Today, every section stamped with its data date. Figures are computed; nothing here is written by AI.
 */
@Component({
  selector: 'eli-business-update-page',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, ScopeSwitch, FreshnessClocks, FeedbackButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './business-update-page.html',
  styleUrl: './business-update-page.scss',
})
export class BusinessUpdatePage {
  private readonly clock = inject(BusinessClock);
  private readonly handoff = inject(HandoffStore);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly freshness = inject(FreshnessStore);
  private readonly session = inject(SessionService);
  /** The TSM opens here (R41): point straight at team performance and the lists. */
  protected readonly isTsm = computed(() => this.session.role() === 'tsm');

  /** ?scope=… so a link can open the update for one branch, segment or digibank. */
  readonly scopeParam = input<string | undefined>(undefined, { alias: 'scope' });
  protected readonly scope = linkedSignal<BookScope>(() => {
    const s = this.scopeParam();
    return (SCOPE_OPTIONS.find((o) => o.id === s)?.id ?? 'all') as BookScope;
  });

  protected readonly dataDate = computed(() => this.freshness.value()?.dataAsOf ?? this.clock.businessDate());
  protected readonly dataDateText = computed(() => longDate(this.dataDate()));
  protected readonly update = computed(() => buildBusinessUpdate(this.scope(), this.dataDateText(), this.handoff.conversion()));

  protected go(id: string): void {
    // Scroll only the sections column, so the widget and the page around it stay put.
    const box = this.host.nativeElement.querySelector('.sections') as HTMLElement | null;
    const target = this.host.nativeElement.querySelector(`#sec-${id}`) as HTMLElement | null;
    if (box && target) {
      box.scrollTo({ top: target.offsetTop - box.offsetTop, behavior: 'smooth' });
      target.focus({ preventScroll: true });
    }
  }

  protected ask(question: string): void {
    void this.router.navigate(['/chat'], { queryParams: { q: question } });
  }

  protected copyAll(): void {
    const text = updateAsText(this.update());
    const failed = () => this.snack.open('Could not copy. Select the text and copy it by hand.', 'OK', { duration: 5000 });
    if (!navigator.clipboard) {
      failed();
      return;
    }
    navigator.clipboard.writeText(text).then(() => this.snack.open('Business Update copied with its data date and the internal-only label.', 'OK', { duration: 4000 }), failed);
  }
}
