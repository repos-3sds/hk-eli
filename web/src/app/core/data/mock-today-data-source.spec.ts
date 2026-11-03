import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { TEST_CONFIG } from '../../testing/test-config';
import { MockTodayDataSource } from './mock-today-data-source';

function setup(overrides: Partial<typeof TEST_CONFIG> = {}) {
  TestBed.configureTestingModule({
    providers: [MockTodayDataSource, { provide: APP_CONFIG, useValue: { ...TEST_CONFIG, ...overrides } }],
  });
  return TestBed.inject(MockTodayDataSource);
}

describe('MockTodayDataSource', () => {
  it('builds the strip from today with dated moments', async () => {
    const strip = await firstValueFrom(setup().getMomentStrip('my-book'));
    expect(strip.days.map((d) => d.date)[0]).toBe('2026-11-03');
    const chan = strip.moments.find((m) => m.clientId === 'c-4821');
    expect(chan).toMatchObject({ type: 'maturity', offset: 3, date: '2026-11-06' });
  });

  it('keeps team-only clients out of My book', async () => {
    const ds = setup();
    const mine = await firstValueFrom(ds.getMomentStrip('my-book'));
    const team = await firstValueFrom(ds.getMomentStrip('team'));
    expect(mine.moments.some((m) => m.clientId === 'c-9034')).toBe(false);
    expect(team.moments.some((m) => m.clientId === 'c-9034')).toBe(true);
  });

  it('sorts the brief by signals agreeing and fills the weekday', async () => {
    const brief = await firstValueFrom(setup().getMorningBrief('my-book'));
    const met = brief.leads.map((l) => l.signals.filter((s) => s.met).length);
    expect(met).toEqual([...met].sort((a, b) => b - a));
    expect(brief.leads[0].clientName).toBe('Chan Tai Man');
    expect(brief.leads[0].summary).toContain('matures Friday');
    expect(brief.businessDate).toBe('2026-11-02');
  });

  it('puts the idea that breaches the limit in ranked lower', async () => {
    const ideas = await firstValueFrom(setup().getIdeas('c-4821'));
    expect(ideas.ideas.every((i) => i.concentration.toPct <= i.concentration.limitPct)).toBe(true);
    expect(ideas.rankedLower[0].concentration.toPct).toBeGreaterThan(25);
    expect(ideas.callPrep[0]).toContain('Friday');
  });

  it('gives every brief client an ideas set', async () => {
    const ds = setup();
    const brief = await firstValueFrom(ds.getMorningBrief('my-book'));
    for (const lead of brief.leads) {
      const set = await firstValueFrom(ds.getIdeas(lead.clientId));
      expect(set.ideas.length).toBeGreaterThan(0);
    }
  });

  it('returns nothing in the empty scenario and fails in the error scenario', async () => {
    expect((await firstValueFrom(setup({ mockScenario: 'empty' }).getMorningBrief('my-book'))).leads).toEqual([]);
    TestBed.resetTestingModule();
    await expect(firstValueFrom(setup({ mockScenario: 'error' }).getMorningBrief('my-book'))).rejects.toThrow();
  });

  it('issues a receipt for a live-quote request', async () => {
    const receipt = await firstValueFrom(setup().requestLiveQuote('c-4821', 'i-amd-meta-6m'));
    expect(receipt).toMatchObject({ ideaId: 'i-amd-meta-6m', desk: 'SPE desk' });
  });
});
