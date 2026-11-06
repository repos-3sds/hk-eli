import { aggregatesCover, isBookScope, matchesAggregate, matchesScope, scopeKind, scopeLabel, scopeValue } from './scope';

describe('scope', () => {
  const chan = { branch: 'Kwun Tong', segment: 'Treasures', channel: 'advisory', rmName: 'Srivalli T.', underlyings: ['NVDA', 'AMD'] };

  it('reads kind, value and label', () => {
    expect(scopeKind('rm:Jason Yu')).toBe('rm');
    expect(scopeValue('rm:Jason Yu')).toBe('Jason Yu');
    expect(scopeLabel('underlying:NVDA')).toBe('Holds NVDA');
    expect(isBookScope('district:Kowloon')).toBe(true);
    expect(isBookScope('branch:Nowhere')).toBe(false);
  });

  it('matches a client by district, branch, RM, segment, channel and underlying', () => {
    expect(matchesScope(chan, 'all')).toBe(true);
    expect(matchesScope(chan, 'district:Kowloon')).toBe(true);
    expect(matchesScope(chan, 'district:Hong Kong Island')).toBe(false);
    expect(matchesScope(chan, 'branch:Kwun Tong')).toBe(true);
    expect(matchesScope(chan, 'rm:Srivalli T.')).toBe(true);
    expect(matchesScope(chan, 'rm:Jason Yu')).toBe(false);
    expect(matchesScope(chan, 'segment:Treasures')).toBe(true);
    expect(matchesScope(chan, 'channel:digibank')).toBe(false);
    expect(matchesScope(chan, 'underlying:NVDA')).toBe(true);
    expect(matchesScope(chan, 'underlying:TSLA')).toBe(false);
  });

  it('lets aggregates answer district, branch, segment and channel but not RM or underlying', () => {
    expect(aggregatesCover('district:Kowloon')).toBe(true);
    expect(aggregatesCover('rm:Jason Yu')).toBe(false);
    expect(aggregatesCover('underlying:AMD')).toBe(false);
    const digibank = { branch: 'Digibank', segment: 'Self-directed' };
    expect(matchesAggregate(digibank, 'channel:digibank')).toBe(true);
    expect(matchesAggregate(digibank, 'district:Kowloon')).toBe(false);
    expect(matchesAggregate({ branch: 'Mong Kok', segment: 'Treasures' }, 'district:Kowloon')).toBe(true);
    // RM scope falls back to the whole business for aggregates; the page says so.
    expect(matchesAggregate(digibank, 'rm:Jason Yu')).toBe(true);
  });
});
