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
    const strip = await firstValueFrom(setup().getMomentStrip('all'));
    expect(strip.days.map((d) => d.date)[0]).toBe('2026-11-03');
    const chan = strip.moments.find((m) => m.clientId === 'c-4821');
    expect(chan).toMatchObject({ type: 'maturity', offset: 3, date: '2026-11-06' });
  });

  it('shows the whole business by default and narrows by branch, segment and channel', async () => {
    const ds = setup();
    const all = await firstValueFrom(ds.getMomentStrip('all'));
    const kt = await firstValueFrom(ds.getMomentStrip('branch:Kwun Tong'));
    const tp = await firstValueFrom(ds.getMomentStrip('segment:Treasure Private'));
    const dig = await firstValueFrom(ds.getMomentStrip('channel:digibank'));
    expect(all.moments).toHaveLength(12);
    expect(kt.moments.map((m) => m.clientId).sort()).toEqual(['c-1177', 'c-4821', 'c-7720']);
    expect(tp.moments.map((m) => m.clientId).sort()).toEqual(['c-1093', 'c-6618']);
    expect(dig.moments.map((m) => m.clientId).sort()).toEqual(['c-4402', 'c-5502']);
  });

  it('gives every lead its owner RM, branch and channel, and a lead for every moment', async () => {
    const brief = await firstValueFrom(setup().getMorningBrief('all'));
    expect(brief.leads).toHaveLength(12);
    const chan = brief.leads.find((l) => l.clientId === 'c-4821')!;
    expect(chan).toMatchObject({ ownerRm: 'Srivalli T.', branch: 'Kwun Tong', channel: 'advisory' });
    expect(brief.leads.find((l) => l.clientId === 'c-5502')!.channel).toBe('digibank');
  });

  it('sums maturing notional and lists rollover pockets for the scope, lowest first', async () => {
    const ds = setup();
    const all = await firstValueFrom(ds.getMorningBrief('all'));
    expect(all.pockets.map((p) => p.rolloverPct)).toEqual([45, 67, 75, 82, 86, 88]);
    expect(all.maturingUsd).toBe(11_980_000);
    const central = await firstValueFrom(ds.getMorningBrief('branch:Central'));
    expect(central.pockets.map((p) => p.id)).toEqual(['p-cen-tr', 'p-cen-tp']);
    expect(central.maturingUsd).toBe(4_500_000);
  });

  it('sorts the brief by signals agreeing and fills the weekday', async () => {
    const brief = await firstValueFrom(setup().getMorningBrief('all'));
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
    const brief = await firstValueFrom(ds.getMorningBrief('all'));
    for (const lead of brief.leads) {
      const set = await firstValueFrom(ds.getIdeas(lead.clientId));
      expect(set.ideas.length).toBeGreaterThan(0);
    }
  });

  it('returns nothing in the empty scenario and fails in the error scenario', async () => {
    expect((await firstValueFrom(setup({ mockScenario: 'empty' }).getMorningBrief('all'))).leads).toEqual([]);
    TestBed.resetTestingModule();
    await expect(firstValueFrom(setup({ mockScenario: 'error' }).getMorningBrief('all'))).rejects.toThrow();
  });

  it('issues a receipt for a live-quote request', async () => {
    const receipt = await firstValueFrom(setup().requestLiveQuote('c-4821', 'i-amd-meta-6m'));
    expect(receipt).toMatchObject({ ideaId: 'i-amd-meta-6m', desk: 'SPE desk' });
  });
});
