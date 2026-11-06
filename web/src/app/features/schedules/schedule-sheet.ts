import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { APP_CONFIG } from '../../core/config/app-config';
import { BookScope } from '../../core/models/scope';
import {
  CHANNEL_LABELS, Channel, Frequency, RECIPIENT_DIRECTORY, ReportTemplate, SNAP_TIMES, ScheduleDraft, TEMPLATES,
  caution, describe, nextRun, nextRunLabel, problems,
} from '../../core/schedules/schedules';
import { SchedulesStore } from '../../core/schedules/schedules.store';
import { BusinessClock } from '../../core/time/business-clock';
import { ScopeSwitch } from '../today/shared/scope-switch';

export interface ScheduleSheetData {
  readonly template?: ReportTemplate;
  readonly scope?: BookScope;
}

/** One schedule form with a live summary (R33). Design preview: saving keeps it for this session only. */
@Component({
  selector: 'eli-schedule-sheet',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatDialogModule, MatIconModule, ScopeSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './schedule-sheet.html',
  styleUrl: './schedule-sheet.scss',
})
export class ScheduleSheet {
  private readonly data = inject<ScheduleSheetData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private readonly ref = inject(MatDialogRef<ScheduleSheet>);
  private readonly store = inject(SchedulesStore);
  private readonly snack = inject(MatSnackBar);
  private readonly clock = inject(BusinessClock);
  private readonly config = inject(APP_CONFIG);

  protected readonly templates = TEMPLATES;
  protected readonly snapTimes = SNAP_TIMES;
  protected readonly directory = RECIPIENT_DIRECTORY;
  protected readonly channels: readonly Channel[] = ['email', 'teams', 'in-app'];
  protected readonly channelLabels = CHANNEL_LABELS;
  protected readonly weekdays = [
    { n: 1, l: 'Mon' }, { n: 2, l: 'Tue' }, { n: 3, l: 'Wed' }, { n: 4, l: 'Thu' }, { n: 5, l: 'Fri' },
  ];

  protected readonly template = signal<ReportTemplate>(this.data.template ?? 'business-update');
  protected readonly scope = signal<BookScope>(this.data.scope ?? 'all');
  protected readonly frequency = signal<Frequency>('weekly');
  protected readonly weekday = signal(1);
  protected readonly time = signal('09:30');
  protected readonly recipients = signal<readonly string[]>([]);
  protected readonly picked = signal<readonly Channel[]>(['email']);
  protected readonly tried = signal(false);

  protected readonly draft = computed<ScheduleDraft>(() => ({
    template: this.template(), scope: this.scope(), frequency: this.frequency(), weekday: this.weekday(),
    time: this.time(), recipients: this.recipients(), channels: this.picked(),
  }));
  protected readonly summary = computed(() => describe(this.draft()));
  protected readonly caution = computed(() => caution(this.draft()));
  protected readonly problems = computed(() => problems(this.draft()));
  protected readonly next = computed(() => {
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: this.config.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    const day = nextRun(this.draft(), this.clock.today(), now, this.clock.holidays);
    return nextRunLabel(day, this.time());
  });

  protected toggleRecipient(id: string): void {
    this.recipients.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  protected toggleChannel(c: Channel): void {
    this.picked.update((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));
  }

  protected testSend(): void {
    this.snack.open('Test sent to you only, marked TEST and internal use only (demo)', undefined, { duration: 3000 });
  }

  protected save(): void {
    this.tried.set(true);
    if (this.problems().length) {
      return;
    }
    this.store.add(this.draft());
    this.snack.open(`Scheduled. First run ${this.next()}. Find it under Alerts, Schedules.`, undefined, { duration: 4000 });
    this.ref.close(true);
  }

  protected close(): void {
    this.ref.close(false);
  }
}
