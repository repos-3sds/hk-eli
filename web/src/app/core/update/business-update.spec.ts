import { ROLLOVER_POCKETS } from '../data/business.fixture';
import { BUSINESS_ROWS, buildBusinessUpdate, rowsInScope, updateAsText } from './business-update';

const conv = { decided: 4, linked: 3, pct: 75, noHandoffPct: 18, open: 2, declined: 1 };

describe('Business Update', () => {
  it('has 15 sections, each with a summary, a source and a question for Chat', () => {
    const u = buildBusinessUpdate('all', '3 Nov 2026', conv);
    expect(u.sections).toHaveLength(15);
    expect(new Set(u.sections.map((s) => s.id)).size).toBe(15);
    expect(u.sections.every((s) => s.summary && s.source && s.ask)).toBe(true);
    expect(u.sections.every((s) => !s.wholeBusinessOnly)).toBe(true);
  });

  it('agrees with Today: rollover at 80% overall, the same pockets and the same maturing notional', () => {
    const u = buildBusinessUpdate('all', '3 Nov 2026', conv);
    const head = u.sections[0];
    expect(head.figures!.find((f) => f.label === 'Rollover')!.value).toBe('80%');
    expect(head.figures!.find((f) => f.label === 'Maturing, 10 days')!.value).toBe('USD 12.0m');
    for (const p of ROLLOVER_POCKETS) {
      const row = BUSINESS_ROWS.find((r) => r.branch === p.branch && r.segment === p.segment)!;
      expect([row.matured, row.rolled]).toEqual([p.maturedThisMonth, p.rolledThisMonth]);
    }
    const rollover = u.sections.find((s) => s.id === 'rollover')!;
    expect(rollover.table!.rows[0]).toEqual(['Kwun Tong · Treasures', '11', '5', '45%']);
    expect(rollover.table!.flagged).toEqual([0, 1, 2]);
  });

  it('cuts client-level sections by RM and shows aggregate sections for the whole business, saying so', () => {
    const u = buildBusinessUpdate('rm:Jason Yu', '3 Nov 2026', conv);
    const byId = (id: string) => u.sections.find((s) => s.id === id)!;
    expect(byId('headline').wholeBusinessOnly).toBe(true);
    expect(byId('headline').summary).toContain('the whole business');
    expect(byId('events').wholeBusinessOnly).toBe(false);
    expect(byId('events').summary).toContain('Jason Yu');
    expect(rowsInScope('district:Kowloon').map((r) => r.branch).sort()).toEqual(['Kwun Tong', 'Mong Kok', 'Tsim Sha Tsui']);
  });

  it('slices by scope, and marks book-level sections as whole business', () => {
    expect(rowsInScope('branch:Central').map((r) => r.segment)).toEqual(['Treasure Private', 'Treasures']);
    expect(rowsInScope('channel:digibank').map((r) => r.branch)).toEqual(['Digibank']);
    const kt = buildBusinessUpdate('branch:Kwun Tong', '3 Nov 2026', conv);
    expect(kt.sections[0].summary).toContain('USD 6.1m traded month to date in Kwun Tong, down 27%');
    expect(kt.sections.filter((s) => s.wholeBusinessOnly).map((s) => s.id)).toEqual(['unmet', 'underlyings', 'concentration', 'handoffs', 'mix']);
    const dig = buildBusinessUpdate('channel:digibank', '3 Nov 2026', conv);
    expect(dig.sections.find((s) => s.id === 'unmet')!.table!.rows.every((r) => r[1] === 'Digibank')).toBe(true);
  });

  it('copies as text with the data date and the internal-only label', () => {
    const text = updateAsText(buildBusinessUpdate('all', '3 Nov 2026', conv));
    expect(text.startsWith('HK ELI Business Update · Whole business · data as of close 3 Nov 2026')).toBe(true);
    expect(text).toContain('15. Tenor and knock-in mix');
    expect(text.trim().endsWith('Internal use only.')).toBe(true);
  });

  it('lists the team by RM, lowest rollover first, adding up to the branch rows', () => {
    const team = buildBusinessUpdate('all', '3 Nov 2026', conv).sections.find((s) => s.id === 'team')!;
    expect(team.table!.rows[0][0]).toBe('Srivalli T.');
    expect(team.table!.rows[0][4]).toBe('29%');
    expect(team.table!.flagged!.length).toBeGreaterThan(0);
    const kt = BUSINESS_ROWS.find((r) => r.branch === 'Kwun Tong')!;
    const ktRms = team.table!.rows.filter((r) => r[1] === 'Kwun Tong');
    expect(ktRms.reduce((s, r) => s + Number(r[2]), 0)).toBe(kt.matured);
    expect(ktRms.reduce((s, r) => s + Number(r[3]), 0)).toBe(kt.rolled);
  });
});
