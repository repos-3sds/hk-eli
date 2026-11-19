import { Injectable, computed, signal } from '@angular/core';
import { Schedule, ScheduleDraft } from './schedules';

/** Demo schedules with run history, including a run held back by a failed overnight refresh. */
const SEED: readonly Schedule[] = [
  {
    id: 'sch-1', template: 'business-update', scope: 'all', frequency: 'weekly', weekday: 1, time: '09:30',
    recipients: ['u-grace', 'u-tsm-team'], channels: ['email', 'teams'], paused: false,
    runs: [
      { at: '2026-11-02T09:30:00+08:00', status: 'sent', note: 'to 2 recipients' },
      { at: '2026-10-26T09:30:00+08:00', status: 'held', note: 'Overnight refresh failed. Held, then sent at 10:12 after the re-run' },
      { at: '2026-10-19T09:30:00+08:00', status: 'sent', note: 'to 2 recipients' },
    ],
  },
  {
    id: 'sch-2', template: 'pockets', scope: 'district:Kowloon', frequency: 'daily', weekday: 1, time: '09:30',
    recipients: ['u-kelly', 'u-gfm-desk'], channels: ['teams', 'in-app'], paused: true,
    runs: [{ at: '2026-10-30T09:30:00+08:00', status: 'sent', note: 'to 2 recipients' }],
  },
];

/** Schedules for this session (design preview). The gateway runs and stores them in MVP2. */
@Injectable({ providedIn: 'root' })
export class SchedulesStore {
  private counter = 0;
  readonly schedules = signal<readonly Schedule[]>(SEED);
  readonly active = computed(() => this.schedules().filter((s) => !s.paused).length);

  add(draft: ScheduleDraft): Schedule {
    const s: Schedule = { ...draft, id: `sch-new-${++this.counter}`, paused: false, runs: [] };
    this.schedules.update((list) => [s, ...list]);
    return s;
  }

  togglePause(id: string): void {
    this.schedules.update((list) => list.map((s) => (s.id === id ? { ...s, paused: !s.paused } : s)));
  }

  remove(id: string): void {
    this.schedules.update((list) => list.filter((s) => s.id !== id));
  }
}
