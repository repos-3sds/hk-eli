import { FIXTURE_CLIENTS } from '../data/today.fixture';
import { NO_FILTERS } from './idea-finder.models';
import { ALL_TICKERS, checkSignal, limitCheck, couponLine, filterBlockers, passesFilters, rankIdeas, readIntent, solveCoupon } from './idea-finder-logic';
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
    const over = (m: (typeof matches)[number]) => m.effect!.toPct > m.effect!.limitPct;
    const firstOver = matches.findIndex(over);
    expect(firstOver === -1 || matches.slice(firstOver).every(over)).toBe(true);
  });
});

describe('limit rule (D1)', () => {
  it('without a client, checks the bank book: a name within half a point of its limit is hidden', () => {
    const { matches, hiddenByLimits } = rankIdeas(WAREHOUSE, { filters: NO_FILTERS, signalIds: ['top-coupon'] }, null, '2026-11-04T09:00:00+08:00');
    expect(hiddenByLimits.map((m) => m.id).sort()).toEqual(['w-04', 'w-14']);
    expect(hiddenByLimits[0].limitReason).toContain('NVDA is 24.63% of the bank');
    expect(matches.some((m) => m.underlyings.includes('NVDA'))).toBe(false);
    expect(matches.every((m) => m.limitState !== 'red')).toBe(true);
  });

  it('with a client: amber at 85% of the limit ranks lower with a reason, red is hidden', () => {
    expect(limitCheck({ underlyings: ['AMD'] }, { underlying: 'AMD', fromPct: 10, toPct: 18, limitPct: 25 })).toEqual({ state: 'green', reason: null });
    const amber = limitCheck({ underlyings: ['AMD'] }, { underlying: 'AMD', fromPct: 20, toPct: 22, limitPct: 25 });
    expect(amber.state).toBe('amber');
    expect(amber.reason).toContain('close to the 25% limit');
    expect(limitCheck({ underlyings: ['AMD'] }, { underlying: 'AMD', fromPct: 24, toPct: 26.5, limitPct: 25 }).state).toBe('red');
  });

  it('puts every green idea before any amber one', () => {
    const { matches, hiddenByLimits } = rankIdeas(WAREHOUSE, { filters: NO_FILTERS, signalIds: ['headroom', 'top-coupon'] }, chan, '2026-11-04T09:00:00+08:00');
    const firstAmber = matches.findIndex((m) => m.limitState === 'amber');
    expect(firstAmber === -1 || matches.slice(firstAmber).every((m) => m.limitState === 'amber')).toBe(true);
    expect(hiddenByLimits.every((m) => m.effect!.toPct > m.effect!.limitPct)).toBe(true);
    expect(matches.length + hiddenByLimits.length).toBe(WAREHOUSE.length);
  });
});

describe('filterBlockers', () => {
  it('names the filter that keeps the most ideas out, so an empty result can say what to loosen', () => {
    const f = { ...NO_FILTERS, tenorMonths: 6, minCouponPct: 30 };
    expect(WAREHOUSE.filter((w) => passesFilters(w, f))).toHaveLength(0);
    const [top] = filterBlockers(WAREHOUSE, f);
    expect(top.key).toBe('minCouponPct');
    expect(top.wouldPass).toBeGreaterThan(0);
  });
});

describe('Build my own ELI: coupon solver', () => {
  const base = { underlyings: ['AMD', 'META'], tenorMonths: 6, kiPct: 65, strikePct: 90 };

  it('pays more for more risk: an extra stock, a closer knock-in, a higher strike', () => {
    const c = solveCoupon(base).couponPct;
    expect(solveCoupon({ ...base, underlyings: ['AMD', 'META', 'NVDA'] }).couponPct).toBeGreaterThan(c);
    expect(solveCoupon({ ...base, kiPct: 75 }).couponPct).toBeGreaterThan(c);
    expect(solveCoupon({ ...base, strikePct: 100 }).couponPct).toBeGreaterThan(c);
    expect(solveCoupon({ ...base, kiPct: 55 }).couponPct).toBeLessThan(c);
  });

  it('explains the coupon in plain words and stays in a sane range', () => {
    const r = solveCoupon(base);
    expect(r.couponPct).toBeGreaterThan(2);
    expect(r.couponPct).toBeLessThan(40);
    expect(r.drivers[0]).toContain('AMD, META');
    expect(r.drivers.some((d) => d.startsWith('Worst-of 2'))).toBe(true);
    expect(solveCoupon({ ...base, underlyings: [] }).couponPct).toBe(0);
  });
});
