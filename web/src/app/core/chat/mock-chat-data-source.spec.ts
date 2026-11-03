import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { MockTodayDataSource } from '../data/mock-today-data-source';
import { TodayDataSource } from '../data/today-data-source';
import { TEST_CONFIG } from '../../testing/test-config';
import { ChatAnswer } from './chat.models';
import { MockChatDataSource } from './mock-chat-data-source';

function setup(scenario: 'normal' | 'error' = 'normal'): MockChatDataSource {
  TestBed.configureTestingModule({
    providers: [
      MockChatDataSource,
      { provide: APP_CONFIG, useValue: { ...TEST_CONFIG, mockScenario: scenario } },
      { provide: TodayDataSource, useClass: MockTodayDataSource },
    ],
  });
  return TestBed.inject(MockChatDataSource);
}

const kinds = (a: ChatAnswer) => a.blocks.map((b) => b.kind);

describe('MockChatDataSource', () => {
  it('prepares a call for a named client with book, concentration, ideas and talking points', async () => {
    const a = await firstValueFrom(setup().ask({ text: 'Prepare me for my call with Chan', clientId: null }));
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
    expect(a.followUps.length).toBeGreaterThan(0);
  });

  it('fails when the data behind it fails', async () => {
    await expect(firstValueFrom(setup('error').ask({ text: 'Who matures this week?', clientId: null }))).rejects.toThrow();
  });
});
