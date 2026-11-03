import { clockTime, usdCompact } from './format';
import { callName, momentText } from './moment-text';

describe('format helpers', () => {
  it('compacts USD', () => {
    expect(usdCompact(1_240_000)).toBe('USD 1.24m');
    expect(usdCompact(2_000_000)).toBe('USD 2m');
    expect(usdCompact(420_000)).toBe('USD 420k');
    expect(usdCompact(0)).toBe('USD 0');
  });

  it('reads the clock time', () => {
    expect(clockTime('2026-11-03T07:10:00+08:00')).toBe('07:10 HKT');
  });

  it('words a moment chip', () => {
    const base = { id: 'm', clientId: 'c', clientShortName: 'Chan T.', date: '2026-11-06', offset: 3 };
    expect(momentText({ ...base, type: 'maturity' })).toBe('Matures Fri 6 Nov · T-3');
    expect(momentText({ ...base, type: 'knockout' })).toBe('Likely knock-out Fri 6 Nov · T-3');
    expect(callName('Chan Tai Man')).toBe('Chan');
  });
});
