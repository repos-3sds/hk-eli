import { firstSentence } from './book-page';

describe('firstSentence', () => {
  it('keeps decimals and stops at the first sentence end', () => {
    expect(firstSentence('Total outstanding ELI is HKD 2.46bn as of 18 Nov. This represents 3 segments.')).toBe('Total outstanding ELI is HKD 2.46bn as of 18 Nov.');
    expect(firstSentence('TRE predicted KO is 10.7% of all outstanding ELI (HKD 263.6m).')).toBe('TRE predicted KO is 10.7% of all outstanding ELI (HKD 263.6m).');
  });
});
