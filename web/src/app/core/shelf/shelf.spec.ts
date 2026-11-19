import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { TEST_CONFIG } from '../../testing/test-config';
import { DIGIBANK_FUNNEL, biggestDrop, cutoffStatus, demandLines, shelfCandidates } from './shelf';
import { ShelfStore } from './shelf.store';

describe('Shelf console logic', () => {
  it('puts demand next to concentration, most quoted first, and flags a name at its limit', () => {
    const d = demandLines();
    expect(d[0]).toMatchObject({ underlying: 'NVDA', quotes: 214, traded: 31, quoteToTradePct: 14, digibankShare: 100, bookSharePct: 24.63, limitState: 'red' });
    expect(d.find((x) => x.underlying === 'TSLA')!.limitState).toBe('green');
    expect(d.find((x) => x.underlying === '0700.HK')!.bookSharePct).toBe(7.1);
  });

  it('blocks shelf candidates on a name at its limit', () => {
    const c = shelfCandidates();
    expect(c.filter((x) => x.limitState === 'red').map((x) => x.id).sort()).toEqual(['w-04', 'w-14']);
    expect(c[0].rfqs5d).toBeGreaterThanOrEqual(c[1].rfqs5d);
  });

  it('counts down to the cut-off in HKT, then moves picks to the next day', () => {
    expect(cutoffStatus(new Date('2026-11-04T05:50:00Z'))).toEqual({ passed: false, minutesLeft: 130, text: 'Cut-off 16:00 HKT, in 2h 10m.' });
    expect(cutoffStatus(new Date('2026-11-04T07:45:00Z')).text).toBe('Cut-off 16:00 HKT, in 15m.');
    expect(cutoffStatus(new Date('2026-11-04T08:00:00Z')).passed).toBe(true);
  });

  it('finds the biggest drop in the digibank funnel', () => {
    expect(biggestDrop(DIGIBANK_FUNNEL)).toEqual({ from: 'Saw a price', to: 'Started an order', lostPct: 73 });
  });
});

describe('ShelfStore', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: TEST_CONFIG }] });
    return TestBed.inject(ShelfStore);
  }

  it('ticks ideas but never one at its limit, and records the request', () => {
    const store = setup();
    store.toggle('w-14');
    expect(store.picked().has('w-14')).toBe(false);
    store.toggle('w-01');
    expect(store.picked().has('w-01')).toBe(false);
    store.toggle('w-02');
    expect(store.requestText('5 Nov 2026')).toContain('Shelf for 5 Nov 2026');
    const req = store.markRequested('5 Nov 2026')!;
    expect([...req.ideaIds].sort()).toEqual(['w-02', 'w-09', 'w-15']);
    expect(store.requests()).toHaveLength(1);
  });

  it('publishes a pack once and unpublishes it', () => {
    const store = setup();
    const before = store.published().length;
    store.publish({ name: 'Sleep at night', blurb: 'x', signalIds: ['deep-ki'] });
    store.publish({ name: 'Sleep at night', blurb: 'x', signalIds: ['deep-ki'] });
    expect(store.published()).toHaveLength(before + 1);
    expect(store.published()[0].publishedBy).toBe('Kelly Lau');
    store.unpublish('Sleep at night');
    expect(store.isPublished('Sleep at night')).toBe(false);
  });
});
