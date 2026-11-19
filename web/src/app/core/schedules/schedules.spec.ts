import { caution, describe as describeSchedule, nextRun, nextRunLabel, problems, testSendText, ScheduleDraft } from './schedules';

const base: ScheduleDraft = {
  template: 'business-update', scope: 'district:Kowloon', frequency: 'weekly', weekday: 1, time: '09:30',
  recipients: ['u-grace', 'u-tsm-team'], channels: ['email', 'teams'],
};

describe('schedules', () => {
  it('says the schedule in one plain sentence', () => {
    expect(describeSchedule(base)).toBe('Every Monday at 09:30 HKT, Business Update for Kowloon goes to Grace Ho and CBG TSM team by email and Teams.');
    expect(describeSchedule({ ...base, frequency: 'daily', scope: 'all', recipients: [], channels: [] })).toBe(
      'Every business day at 09:30 HKT, Business Update for the whole business goes to nobody yet by no channel yet.',
    );
  });

  it('lists what stops a save, and warns when it runs before prices are in', () => {
    expect(problems(base)).toEqual([]);
    expect(problems({ ...base, recipients: [], channels: [] })).toHaveLength(2);
    expect(caution(base)).toBeNull();
    expect(caution({ ...base, time: '08:30' })).toContain('before 09:30');
    expect(caution({ ...base, time: '08:30', template: 'digibank-funnel' })).toBeNull();
  });

  it('finds the next run, skipping weekends and holidays', () => {
    // Fri 6 Nov 2026 at 10:00: a weekly Monday run is Mon 9 Nov.
    expect(nextRun(base, '2026-11-06', '10:00', [])).toBe('2026-11-09');
    // A daily run later today is today; after its time it is the next business day.
    expect(nextRun({ ...base, frequency: 'daily' }, '2026-11-06', '09:00', [])).toBe('2026-11-06');
    expect(nextRun({ ...base, frequency: 'daily' }, '2026-11-06', '10:00', ['2026-11-09'])).toBe('2026-11-10');
    // Monthly: the first business day of December 2026 is Tue 1 Dec.
    expect(nextRun({ ...base, frequency: 'monthly' }, '2026-11-06', '10:00', [])).toBe('2026-12-01');
    expect(nextRunLabel('2026-11-09', '09:30')).toBe('Mon 9 Nov, 09:30 HKT');
  });

  it('labels a test send internal only', () => {
    expect(testSendText(base)).toContain('[TEST] Business Update · Kowloon');
    expect(testSendText(base).endsWith('Internal use only. Not for clients.')).toBe(true);
  });
});
