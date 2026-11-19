import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadState } from '../../core/data/load-state';
import { pageLoad } from '../../core/data/page-load';
import { FeedbackStore, topicGroup, weekAsText } from '../../core/feedback/feedback.store';
import { LaunchRole, ROLE_SHORT } from '../../core/session/session.service';
import { dayMonth } from '../../core/time/business-calendar';

/**
 * Feedback this week (R40). Good feedback is the gate for going wider than the ~70 launch users, so the
 * product team reads this every week: how useful each view was, by role, and every note people left.
 */
@Component({
  selector: 'eli-feedback-page',
  imports: [MatButtonModule, MatIconModule, LoadState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback-page.html',
  styleUrl: './feedback-page.scss',
})
export class FeedbackPage {
  protected readonly load = pageLoad('The feedback store did not answer in time.');
  private readonly store = inject(FeedbackStore);
  private readonly snack = inject(MatSnackBar);
  protected readonly week = this.store.week;

  constructor() {
    this.store.refresh();
  }
  protected readonly range = computed(() => `${dayMonth(this.week().weekStart)} to ${dayMonth(this.week().weekEnd)}`);
  protected readonly group = topicGroup;
  protected readonly hasSamples = computed(() => !this.store.fromGateway() && this.store.week().total > this.store.entries().length);

  protected role(role: string): string {
    return ROLE_SHORT[role as LaunchRole] ?? role;
  }

  protected when(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' });
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(weekAsText(this.week(), (r) => this.role(r)));
      this.snack.open('Copied with the internal-use label', undefined, { duration: 2500 });
    } catch {
      this.snack.open('Copy did not work in this browser. Select the text instead.', undefined, { duration: 4000 });
    }
  }
}
