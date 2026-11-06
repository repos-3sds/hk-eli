import { Injectable, computed, signal } from '@angular/core';
import { AlertRule, DEMO_RULES, QuietHours, fires, inQuietHours } from './alerts';

/** Alert rules, quiet hours and the daily digest, for the design preview. Held for the session. */
@Injectable({ providedIn: 'root' })
export class AlertsStore {
  readonly rules = signal<readonly AlertRule[]>(DEMO_RULES);
  readonly quiet = signal<QuietHours>({ from: '19:00', to: '08:00' });
  readonly digestAt = signal('08:30');
  /** Alerts muted for today, by rule id. */
  readonly muted = signal<ReadonlySet<string>>(new Set());

  readonly firing = computed(() => this.rules().filter((r) => fires(r) && !this.muted().has(r.id)));
  readonly instant = computed(() => this.firing().filter((r) => r.delivery === 'instant'));
  readonly inDigest = computed(() => this.firing().filter((r) => r.delivery === 'digest'));
  /** The badge on the Alerts tab. */
  readonly count = computed(() => this.firing().length);
  /** The digest time must not fall in quiet hours, or it would never arrive. */
  readonly digestQuiet = computed(() => inQuietHours(this.digestAt(), this.quiet()));

  setNeeded(id: string, needed: number): void {
    this.patch(id, (r) => ({ ...r, needed: Math.min(Math.max(1, needed), r.conditions.length) }));
  }

  toggle(id: string): void {
    this.patch(id, (r) => ({ ...r, on: !r.on }));
  }

  setDelivery(id: string, delivery: AlertRule['delivery']): void {
    this.patch(id, (r) => ({ ...r, delivery }));
  }

  mute(id: string): void {
    this.muted.update((s) => new Set(s).add(id));
  }

  unmute(id: string): void {
    this.muted.update((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  private patch(id: string, fn: (r: AlertRule) => AlertRule): void {
    this.rules.update((list) => list.map((r) => (r.id === id ? fn(r) : r)));
  }
}
