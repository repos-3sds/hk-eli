import { Injectable, computed, inject, signal } from '@angular/core';
import { LaunchRole, SessionService } from '../../core/session/session.service';

const KEY = 'eli.firstRun.dismissed';

/** Which roles have dismissed the first-run guide. Kept in this browser only; losing it just shows the guide again. */
@Injectable({ providedIn: 'root' })
export class FirstRunStore {
  private readonly session = inject(SessionService);
  private readonly dismissed = signal<ReadonlySet<LaunchRole>>(this.read());

  readonly show = computed(() => !this.dismissed().has(this.session.role()));

  dismiss(): void {
    this.dismissed.update((s) => new Set(s).add(this.session.role()));
    this.write();
  }

  reopen(): void {
    this.dismissed.update((s) => {
      const n = new Set(s);
      n.delete(this.session.role());
      return n;
    });
    this.write();
  }

  private read(): ReadonlySet<LaunchRole> {
    try {
      return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as LaunchRole[]);
    } catch {
      return new Set();
    }
  }

  private write(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.dismissed()]));
    } catch {
      /* Private window or blocked storage: the guide simply shows again next time. */
    }
  }
}
