import { TestBed } from '@angular/core/testing';
import { DEMO_RULES, fires, inQuietHours, metCount } from './alerts';
import { AlertsStore } from './alerts.store';

describe('Alerts preview', () => {
  it('fires a rule when enough of its plain-word conditions are true', () => {
    const pocket = DEMO_RULES.find((r) => r.id === 'r-pocket')!;
    expect(metCount(pocket)).toBe(3);
    expect(fires(pocket)).toBe(true);
    expect(fires({ ...pocket, needed: 4 })).toBe(false);
    expect(fires({ ...pocket, on: false })).toBe(false);
  });

  it('handles quiet hours across midnight', () => {
    const q = { from: '19:00', to: '08:00' };
    expect(inQuietHours('23:30', q)).toBe(true);
    expect(inQuietHours('07:59', q)).toBe(true);
    expect(inQuietHours('08:30', q)).toBe(false);
    expect(inQuietHours('12:00', { from: '12:00', to: '14:00' })).toBe(true);
  });

  it('counts firing alerts for the badge, splits instant from digest, and mutes for today', () => {
    const store = TestBed.inject(AlertsStore);
    expect(store.count()).toBe(3);
    expect(store.instant().map((r) => r.id)).toEqual(['r-pocket', 'r-limit']);
    expect(store.inDigest().map((r) => r.id)).toEqual(['r-knockout']);
    store.mute('r-limit');
    expect(store.count()).toBe(2);
    store.setNeeded('r-pocket', 9);
    expect(store.rules()[0].needed).toBe(4);
    expect(store.count()).toBe(1);
    store.digestAt.set('07:30');
    expect(store.digestQuiet()).toBe(true);
  });
});
