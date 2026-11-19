import { markQuestion } from './tableau-pane';

describe('markQuestion', () => {
  it('turns a clicked branch into the clients follow-up', () => {
    expect(markQuestion({ 'Cust Branch': 'Central' })).toBe('Show the clients behind Central maturing in the next 30 days');
  });
  it('turns a stock into its distribution', () => {
    expect(markQuestion({ Wps: '9988 HK' })).toBe('Show me the distribution on 9988 HK');
  });
  it('offers nothing for an unknown mark', () => {
    expect(markQuestion({ Other: 'x' })).toBeNull();
  });
});
