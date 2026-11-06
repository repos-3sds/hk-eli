import { PARITY_RESULTS, parityLine } from './tableau-parity';

describe('Tableau parity', () => {
  it('says a match, shows a difference with its reason, and admits what is not checked', () => {
    expect(parityLine(PARITY_RESULTS.concentration, 'Thu 5 Nov')).toBe('Matches Tableau: ELI concentration against limits (demo name), checked at close Thu 5 Nov.');
    expect(parityLine(PARITY_RESULTS.rollover, 'Thu 5 Nov')).toMatch(/^Differs from Tableau: .*blotter at close\.$/);
    expect(parityLine(PARITY_RESULTS.unmet, 'Thu 5 Nov')).toContain('Not checked yet');
  });
});
