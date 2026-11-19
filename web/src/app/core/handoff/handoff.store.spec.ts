import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { TEST_CONFIG } from '../../testing/test-config';
import { HandoffStore, NewHandoffItem } from './handoff.store';

const chan: NewHandoffItem = { clientId: 'c-4821', clientName: 'Chan Tai Man', ownerRm: 'Srivalli T.', branch: 'Kwun Tong', reason: 'Maturity', idea: null, underlyings: [], from: 'Today' };
const wong: NewHandoffItem = {
  clientId: 'c-1093', clientName: 'Wong Ka Lok', ownerRm: 'Jason Yu', branch: 'Central', reason: 'Likely knock-out',
  idea: { title: 'AMD · 6M', terms: 'coupon 18.8% p.a. · KI 62% · strike 88%', pricedAt: '2026-11-03T09:05:00+08:00' }, underlyings: ['AMD'], from: 'Ideas',
};

function setup() {
  TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: TEST_CONFIG }] });
  return TestBed.inject(HandoffStore);
}

describe('HandoffStore', () => {
  it('adds once per client and idea, and groups by owner', () => {
    const store = setup();
    expect(store.add(chan)).not.toBeNull();
    expect(store.add(chan)).toBeNull();
    store.add(wong);
    store.add({ ...chan, clientId: 'c-7720', clientName: 'Lee Mei' });
    expect(store.count()).toBe(3);
    expect(store.byOwner().map((g) => [g.owner, g.items.length])).toEqual([['Srivalli T. · Kwun Tong', 2], ['Jason Yu · Central', 1]]);
    expect(store.has('c-1093', 'AMD · 6M')).toBe(true);
    expect(store.has('c-1093')).toBe(false);
  });

  it('copies for Teams grouped by RM, with the price time and the internal-only label', () => {
    const store = setup();
    store.add(chan);
    store.add(wong);
    const text = store.teamsText();
    expect(text).toContain('ELI hand-off from Kelly Lau (GFM WMS specialist)');
    expect(text).toContain('For Srivalli T. · Kwun Tong:\n- Chan Tai Man: Maturity.');
    expect(text).toContain('Idea: AMD · 6M, coupon 18.8% p.a. · KI 62% · strike 88% (indicative, priced 09:05 HKT).');
    expect(text.trim().endsWith('checks suitability before any client conversation.')).toBe(true);
    expect(text).toContain('Internal use only');
  });

  it('writes a quoted CSV with one row per item', () => {
    const store = setup();
    store.add({ ...chan, reason: 'Said "maybe"' });
    const [head, row] = store.csv().split('\r\n');
    expect(head).toBe('"Owner RM","Branch","Client","Reason","Idea","Terms","Priced at","Added from","Label"');
    expect(row).toContain('"Said ""maybe"""');
    expect(row.endsWith('"Internal use only"')).toBe(true);
  });

  it('marks the list handed off: a record with a 10-business-day window, every item open', () => {
    const store = setup();
    store.add(chan);
    store.add(wong);
    const before = store.records().length;
    const record = store.markSent()!;
    expect(store.count()).toBe(0);
    expect(store.records()).toHaveLength(before + 1);
    expect(record.windowEnds).toBe('2026-11-17');
    expect(Object.values(record.outcomes).every((o) => o.status === 'sent')).toBe(true);
    expect(store.tab()).toBe('sent');
    expect(store.markSent()).toBeNull();
  });

  it('works out linked conversion from closed windows only, against no hand-off', () => {
    const store = setup();
    const c = store.conversion();
    expect(c).toEqual({ decided: 4, linked: 3, pct: 75, noHandoffPct: 18, open: 2, declined: 1 });
  });

  it('records a desk decline so it does not count as a missed trade', () => {
    const store = setup();
    store.recordDeskDecline('ho-1021', 'hi-5', 'NVDA over the limit');
    const o = store.records().find((r) => r.id === 'ho-1021')!.outcomes['hi-5'];
    expect(o).toEqual({ status: 'desk-declined', note: 'NVDA over the limit' });
    expect(store.conversion()).toMatchObject({ open: 1, declined: 2, pct: 75 });
  });
});
