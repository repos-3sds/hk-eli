import {
  addBusinessDays,
  dayLabel,
  isBusinessDay,
  longDate,
  nextBusinessDays,
  offsetLabel,
  previousBusinessDay,
  rollForward,
  shortDate,
  todayIn,
  weekdayName,
} from './business-calendar';

describe('business calendar', () => {
  const holidays = ['2026-12-25'];

  it('skips weekends and holidays', () => {
    expect(isBusinessDay('2026-11-03', holidays)).toBe(true);
    expect(isBusinessDay('2026-11-07', holidays)).toBe(false);
    expect(isBusinessDay('2026-12-25', holidays)).toBe(false);
  });

  it('lists the next 10 business days from a Tuesday', () => {
    const days = nextBusinessDays('2026-11-03', 10, holidays);
    expect(days).toHaveLength(10);
    expect(days[0]).toBe('2026-11-03');
    expect(days[4]).toBe('2026-11-09');
    expect(days[9]).toBe('2026-11-16');
  });

  it('rolls a weekend forward to Monday', () => {
    expect(rollForward('2026-11-07', holidays)).toBe('2026-11-09');
    expect(nextBusinessDays('2026-11-08', 1, holidays)).toEqual(['2026-11-09']);
  });

  it('adds business days across a holiday and backwards over a weekend', () => {
    expect(addBusinessDays('2026-12-24', 1, holidays)).toBe('2026-12-28');
    expect(previousBusinessDay('2026-11-02', holidays)).toBe('2026-10-30');
  });

  it('formats labels', () => {
    expect(dayLabel('2026-11-06')).toBe('Fri 6');
    expect(shortDate('2026-11-06')).toBe('Fri 6 Nov');
    expect(longDate('2026-10-31')).toBe('31 Oct 2026');
    expect(weekdayName('2026-11-05')).toBe('Thursday');
    expect(offsetLabel(0)).toBe('Today');
    expect(offsetLabel(3)).toBe('T-3');
  });

  it('reads today in the desk time zone', () => {
    // 20:00 UTC on 2 Nov is already 3 Nov in Hong Kong.
    expect(todayIn('Asia/Hong_Kong', new Date('2026-11-02T20:00:00Z'))).toBe('2026-11-03');
  });
});
