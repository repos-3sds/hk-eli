import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { AlertRule, metCount } from '../../core/alerts/alerts';
import { AlertsStore } from '../../core/alerts/alerts.store';
import { FeedbackButtons } from '../../core/feedback/feedback-buttons';
import { HandoffOpener } from '../../core/handoff/handoff-opener';
import { HandoffStore } from '../../core/handoff/handoff.store';
import { ROLE_SHORT, SessionService } from '../../core/session/session.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { Schedule, describe, nextRun, nextRunLabel, templateLabel } from '../../core/schedules/schedules';
import { SchedulesStore } from '../../core/schedules/schedules.store';
import { BusinessClock } from '../../core/time/business-clock';
import { shortDate } from '../../core/time/business-calendar';
import { ScheduleOpener } from '../schedules/schedule-opener';

/**
 * Alerts and schedules as a working design preview: plain-word rules ("fire when 2 of these 4 are true"),
 * instant or in the morning digest, quiet hours, and "Make hand-off list" straight from an alert.
 */
@Component({
  selector: 'eli-alerts-page',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatSlideToggleModule, MatTooltipModule, FeedbackButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './alerts-page.html',
  styleUrl: './alerts-page.scss',
})
export class AlertsPage {
  protected readonly store = inject(AlertsStore);
  protected readonly session = inject(SessionService);
  private readonly handoff = inject(HandoffStore);
  private readonly opener = inject(HandoffOpener);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  protected readonly roleShort = ROLE_SHORT;
  protected readonly met = metCount;
  protected readonly schedules = inject(SchedulesStore);
  protected readonly schedule = inject(ScheduleOpener);
  private readonly clock = inject(BusinessClock);
  private readonly config = inject(APP_CONFIG);
  protected readonly describe = describe;
  protected readonly templateLabel = templateLabel;

  protected runWhen(iso: string): string {
    return `${shortDate(iso.slice(0, 10))} ${iso.slice(11, 16)}`;
  }

  protected nextLabel(s: Schedule): string {
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: this.config.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    return nextRunLabel(nextRun(s, this.clock.today(), now, this.clock.holidays), s.time);
  }

  protected removeSchedule(s: Schedule): void {
    this.schedules.remove(s.id);
    this.snack.open(`${templateLabel(s.template)} schedule deleted.`, 'Undo', { duration: 5000 }).onAction().subscribe(() => this.schedules.schedules.update((l) => [s, ...l]));
  }

  protected range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i + 1);
  }

  protected open(rule: AlertRule): void {
    void this.router.navigate([rule.openLink.path], { queryParams: rule.openLink.query });
  }

  /** Puts the alert's clients on the hand-off list, with the alert as the reason. */
  protected makeHandoff(rule: AlertRule): void {
    let added = 0;
    for (const c of rule.clients) {
      if (this.handoff.add({ ...c, reason: `Alert: ${rule.name.toLowerCase()}`, idea: null, underlyings: [], from: 'Today' })) {
        added++;
      }
    }
    this.snack
      .open(added ? `${added} ${added === 1 ? 'client' : 'clients'} added to the hand-off list.` : 'They are already on the hand-off list.', 'Open list', { duration: 4000 })
      .onAction()
      .subscribe(() => this.opener.open());
  }

  protected mute(rule: AlertRule): void {
    this.store.mute(rule.id);
    this.snack
      .open(`"${rule.name}" muted until tomorrow.`, 'Undo', { duration: 5000 })
      .onAction()
      .subscribe(() => this.store.unmute(rule.id));
  }
}
