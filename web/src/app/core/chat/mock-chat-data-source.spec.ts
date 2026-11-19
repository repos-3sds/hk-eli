import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { MockTodayDataSource } from '../data/mock-today-data-source';
import { TodayDataSource } from '../data/today-data-source';
import { TEST_CONFIG } from '../../testing/test-config';
import { ChatAnswer } from './chat.models';
import { MockChatDataSource } from './mock-chat-data-source';
import { DECLINE_TEXT } from './chat-scope';
import { IdeaFinderDataSource } from '../ideas/idea-finder-data-source';
import { MockIdeaFinderDataSource } from '../ideas/mock-idea-finder-data-source';
import { NO_FILTERS } from '../ideas/idea-finder.models';
import { STARTER_PACKS } from '../ideas/idea-warehouse.fixture';

function setup(scenario: 'normal' | 'error' = 'normal'): MockChatDataSource {
  TestBed.configureTestingModule({
    providers: [
      MockChatDataSource,
      { provide: APP_CONFIG, useValue: { ...TEST_CONFIG, mockScenario: scenario } },
      { provide: TodayDataSource, useClass: MockTodayDataSource },
      { provide: IdeaFinderDataSource, useClass: MockIdeaFinderDataSource },
    ],
  });
  return TestBed.inject(MockChatDataSource);
}

const kinds = (a: ChatAnswer) => a.blocks.map((b) => b.kind);

describe('MockChatDataSource', () => {
  it('gives the same top ideas and concentration as the Ideas tab for that client', async () => {
    const ds = setup();
    const a = await firstValueFrom(ds.ask({ text: 'Brief me on Chan', clientId: null }));
    const pack = STARTER_PACKS.find((p) => p.id === 'rollover')!;
    const r = await firstValueFrom(TestBed.inject(IdeaFinderDataSource).search({ filters: { ...NO_FILTERS, clientId: 'c-4821' }, signalIds: pack.signalIds }));
    const block = a.blocks.find((b) => b.kind === 'ideas');
    expect(block && block.kind === 'ideas' ? block.ideas.map((i) => i.id) : []).toEqual(r.matches.slice(0, 3).map((m) => m.id));
    expect(block && block.kind === 'ideas' ? block.ideas[0].concentration : '').toBe(
      `${r.matches[0].effect!.underlying} ${r.matches[0].effect!.fromPct.toFixed(1)}% → ${r.matches[0].effect!.toPct.toFixed(1)}%`,
    );
  });

  it('keeps the facts for the RM free of advice words', async () => {
    const a = await firstValueFrom(setup().ask({ text: 'Brief me on Chan', clientId: null }));
    const facts = a.blocks.find((b) => b.kind === 'bullets');
    const text = facts && facts.kind === 'bullets' ? facts.items.join(' ') : '';
    expect(text).toContain('Largest holding is NVDA');
    expect(text).not.toMatch(/\b(offer|explain|recommend|should|sell)\b/i);
  });

  it('declines forecast and advice questions, even with a client named, and shows no figures', async () => {
    for (const q of ['What will NVDA do next week? Should Chan buy?', 'Should we recommend AMD?', 'Is it a good time to buy TSLA?']) {
      const a = await firstValueFrom(setup().ask({ text: q, clientId: 'c-4821' }));
      expect(a.fallback).toBe(true);
      expect(kinds(a)).toEqual(['text']);
      expect((a.blocks[0] as { text: string }).text).toBe(DECLINE_TEXT);
      expect(a.sources).toEqual([]);
      TestBed.resetTestingModule();
    }
  });

  it('understands everyday rephrasings of the questions it can answer', async () => {
    const cases: [string, string][] = [
      ['Which branch has the worst rollover and why?', 'Kwun Tong · Treasures is lowest at 45%'],
      ['How are rollovers doing by branch?', 'Kwun Tong · Treasures is lowest at 45%'],
      ['Which names are closest to the limit?', 'closest name to its limit'],
      ['What did not trade this week?', 'did not trade this week'],
      ['What expires this week?', 'Chan Tai Man is first'],
    ];
    for (const [q, expected] of cases) {
      const a = await firstValueFrom(setup().ask({ text: q, clientId: null }));
      expect(a.fallback, q).toBe(false);
      expect((a.blocks[0] as { text: string }).text, q).toContain(expected);
      TestBed.resetTestingModule();
    }
  });

  it('prepares a call for a named client with book, concentration, ideas and facts', async () => {
    const a = await firstValueFrom(setup().ask({ text: 'Brief me on Chan', clientId: null }));
    expect(a.fallback).toBe(false);
    expect(kinds(a)).toEqual(['text', 'facts', 'concentration', 'ideas', 'bullets']);
    expect((a.blocks[0] as { text: string }).text).toContain("Chan Tai Man is in today's brief");
  });

  it('uses the client in context when the question does not name one', async () => {
    const a = await firstValueFrom(setup().ask({ text: 'What should I know before I call?', clientId: 'c-1093' }));
    expect((a.blocks[0] as { text: string }).text).toContain('Wong Ka Lok');
  });

  it('lists this week’s maturities in date order', async () => {
    const a = await firstValueFrom(setup().ask({ text: 'Who matures this week?', clientId: null }));
    const rows = a.blocks.find((b) => b.kind === 'clients');
    expect(rows && rows.kind === 'clients' ? rows.rows.map((r) => r.name) : []).toEqual(['Chan Tai Man', 'Yip Ah Kei']);
  });

  it('lists likely knock-outs', async () => {
    const a = await firstValueFrom(setup().ask({ text: 'Which knock-outs are close to the barrier?', clientId: null }));
    const rows = a.blocks.find((b) => b.kind === 'clients');
    expect(rows && rows.kind === 'clients' ? rows.rows[0].name : '').toBe('Wong Ka Lok');
  });

  it('suggests questions when it does not understand', async () => {
    const a = await firstValueFrom(setup().ask({ text: 'What is the weather?', clientId: null }));
    expect(a.fallback).toBe(true);
    expect((a.blocks[0] as { text: string }).text).toContain('rollover by branch');
    expect(a.sources).toEqual([]);
    expect(a.followUps.length).toBeGreaterThan(0);
  });

  it('fails when the data behind it fails', async () => {
    await expect(firstValueFrom(setup('error').ask({ text: 'Who matures this week?', clientId: null }))).rejects.toThrow();
  });

  it('answers the launch-role questions with breakdown tables from data', async () => {
    const ds = setup();
    const rollover = await firstValueFrom(ds.ask({ text: 'Where is rollover below 80% this month?', clientId: null }));
    expect(kinds(rollover)).toEqual(['text', 'table']);
    expect((rollover.blocks[0] as { text: string }).text).toContain('Kwun Tong · Treasures is lowest at 45%');
    const conc = await firstValueFrom(ds.ask({ text: 'Top concentrations against limit', clientId: null }));
    expect(kinds(conc)).toEqual(['text', 'concentration']);
    const unmet = await firstValueFrom(ds.ask({ text: 'What was quoted and not traded this week?', clientId: null }));
    expect(kinds(unmet)).toEqual(['text', 'table']);
    expect(unmet.sources).toContain('digibank quote log');
  });
});
