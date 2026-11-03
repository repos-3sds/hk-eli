import { FIXTURE_CLIENTS } from '../data/today.fixture';
import { NO_FILTERS } from './idea-finder.models';
import { ALL_TICKERS, checkSignal, couponLine, passesFilters, rankIdeas, readIntent } from './idea-finder-logic';
import { WAREHOUSE } from './idea-warehouse.fixture';

const chan = FIXTURE_CLIENTS.find((c) => c.id === 'c-4821')!;

describe('Idea Finder logic', () => {
  it('reads plain words into hard filters, a client and a pack', () => {
    const r = readIntent('6M, 15% coupon, KI 65 or lower, no more NVDA for Chan, rollover', ALL_TICKERS, FIXTURE_CLIENTS);
    expect(r.filters.tenorMonths).toBe(6);
    expect(r.filters.minCouponPct).toBe(15);
    expect(r.filters.maxKiPct).toBe(65);
    expect(r.filters.exclude).toEqual(['NVDA']);
    expect(r.filters.include).toEqual([]);
    expect(r.filters.clientId).toBe('c-4821');
    expect(r.packId).toBe('rollover');
  });

  it('lists the words it did not use, so the RM sees what was ignored', () => {
    const r = readIntent('9M AAPL something autocallable', ALL_TICKERS, FIXTURE_CLIENTS);
    expect(r.filters.include).toEqual(['AAPL']);
    expect(r.ignored).toEqual(['something', 'autocallable']);
  });

  it('applies hard filters before any signal', () => {
    const f = { ...NO_FILTERS, exclude: ['NVDA'], maxKiPct: 65 };
    const kept = WAREHOUSE.filter((w) => passesFilters(w, f));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((w) => !w.underlyings.includes('NVDA') && w.kiPct <= 65)).toBe(true);
  });

  it('says a client signal is not met, and why, when no client is picked', () => {
    const check = checkSignal('headroom', WAREHOUSE[0], { couponLine: couponLine(WAREHOUSE), client: null, notionalUsd: 250_000 });
    expect(check.met).toBe(false);
    expect(check.evidence).toBe('Pick a client');
  });

  it('ranks by how many picked signals line up, then by coupon, with evidence for each', () => {
    const { matches, passed } = rankIdeas(WAREHOUSE, { filters: NO_FILTERS, signalIds: ['top-coupon', 'deep-ki', 'rfq-busy'] }, null, '2026-11-04T09:00:00+08:00');
    expect(passed).toBe(WAREHOUSE.length);
    for (let i = 1; i < matches.length; i++) {
      const [a, b] = [matches[i - 1], matches[i]];
      expect(a.met > b.met || (a.met === b.met && a.terms.couponPct >= b.terms.couponPct)).toBe(true);
    }
    expect(matches[0].checks.map((c) => c.signalId)).toEqual(['top-coupon', 'deep-ki', 'rfq-busy']);
    expect(matches[0].checks.every((c) => c.evidence && c.source)).toBe(true);
    expect(matches[0].effect).toBeNull();
  });

  it('sizes the concentration effect on what the client has maturing', () => {
    const { matches, notionalUsd } = rankIdeas(WAREHOUSE, { filters: NO_FILTERS, signalIds: ['headroom'] }, chan, '2026-11-04T09:00:00+08:00');
    expect(notionalUsd).toBe(chan.maturingUsd);
    expect(matches.every((m) => m.effect !== null)).toBe(true);
  });
});
