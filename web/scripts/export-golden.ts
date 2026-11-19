/**
 * Contract goldens: runs the web app's own mock data sources (the behaviour the screens were built and tested on)
 * for a fixed set of requests on Tuesday 3 Nov 2026, and writes what they return. The gateway's ContractTest
 * asserts it serves the same JSON for the same requests. Run: npm run export-golden
 * (writes ../gateway/src/test/resources/golden/contract.json).
 */
import '@angular/compiler';
import { DOCUMENT } from '@angular/common';
import { Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP_CONFIG } from '../src/app/core/config/app-config';
import { BusinessClock } from '../src/app/core/time/business-clock';
import { TodayDataSource } from '../src/app/core/data/today-data-source';
import { MockTodayDataSource } from '../src/app/core/data/mock-today-data-source';
import { ChatDataSource } from '../src/app/core/chat/chat-data-source';
import { MockChatDataSource } from '../src/app/core/chat/mock-chat-data-source';
import { IdeaFinderDataSource } from '../src/app/core/ideas/idea-finder-data-source';
import { MockIdeaFinderDataSource } from '../src/app/core/ideas/mock-idea-finder-data-source';
import { NO_FILTERS } from '../src/app/core/ideas/idea-finder.models';
import { TEST_CONFIG } from '../src/app/testing/test-config';
import { BookScope } from '../src/app/core/models/scope';

const out = process.argv[2] ?? '../gateway/src/test/resources/golden';
mkdirSync(out, { recursive: true });

const injector = Injector.create({
  providers: [
    { provide: APP_CONFIG, useValue: TEST_CONFIG },
    { provide: DOCUMENT, useValue: { location: { search: '' } } },
    { provide: BusinessClock },
    { provide: TodayDataSource, useClass: MockTodayDataSource },
    { provide: ChatDataSource, useClass: MockChatDataSource },
    { provide: IdeaFinderDataSource, useClass: MockIdeaFinderDataSource },
  ],
});
const today = injector.get(TodayDataSource);
const chat = injector.get(ChatDataSource);
const ideas = injector.get(IdeaFinderDataSource);

interface Golden {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly body?: unknown;
  readonly response: unknown;
}
const goldens: Record<string, Golden> = {};
async function add(name: string, method: 'GET' | 'POST', path: string, body: unknown, call: () => Promise<unknown>): Promise<void> {
  goldens[name] = { method, path, body, response: await call() };
}

async function main(): Promise<void> {
  const scopes: BookScope[] = ['all', 'branch:Central', 'district:Kowloon', 'rm:Jason Yu', 'segment:Treasures', 'channel:digibank', 'underlying:NVDA'];
  for (const s of scopes) {
    const q = encodeURIComponent(s);
    await add(`brief ${s}`, 'GET', `/today/brief?scope=${q}`, undefined, () => firstValueFrom(today.getMorningBrief(s)));
    await add(`strip ${s}`, 'GET', `/today/moments?scope=${q}`, undefined, () => firstValueFrom(today.getMomentStrip(s)));
  }
  for (const id of ['c-4821', 'c-1093']) {
    await add(`context ${id}`, 'GET', `/clients/${id}/context`, undefined, () => firstValueFrom(today.getClientContext(id)));
    await add(`ideas ${id}`, 'GET', `/clients/${id}/ideas`, undefined, () => firstValueFrom(today.getIdeas(id)));
  }
  await add('evidence all', 'GET', '/evidence?ref=all', undefined, () => firstValueFrom(today.getEvidenceRows('all')));

  const questions: { text: string; clientId: string | null }[] = [
    { text: 'Who matures this week?', clientId: null },
    { text: 'Who matures next week?', clientId: null },
    { text: 'Which knock-outs are close to the barrier?', clientId: null },
    { text: 'Brief me on Chan', clientId: null },
    { text: 'What did Chan trade in the last 90 days?', clientId: null },
    { text: 'Where is rollover below 80% this month?', clientId: null },
    { text: 'Top concentrations against limit', clientId: null },
    { text: 'What was quoted and not traded this week?', clientId: null },
    { text: 'Prepare me for a call', clientId: 'c-1093' },
    { text: 'What is the weather?', clientId: null },
    { text: 'Which branch has the worst rollover and why?', clientId: null },
    { text: 'What will NVDA do next week? Should Chan buy?', clientId: 'c-4821' },
    { text: 'Should we recommend AMD?', clientId: null },
    { text: 'Which names are closest to the limit?', clientId: null },
    { text: 'What did not trade this week?', clientId: 'c-4821' },
    { text: 'Give me an overview of Wong', clientId: null },
  ];
  for (const q of questions) {
    await add(`chat ${q.text}`, 'POST', '/chat/answers', q, () => firstValueFrom(chat.ask(q)));
  }

  for (const text of ['6M, 15% coupon, KI 65 or lower, no more NVDA for Chan, rollover', '9M AAPL something autocallable', 'safer ideas for Wong']) {
    await add(`read ${text}`, 'POST', '/ideas/read', { text }, () => firstValueFrom(ideas.read(text)));
  }
  const searches = [
    { filters: NO_FILTERS, signalIds: ['top-coupon', 'deep-ki', 'rfq-busy'] },
    { filters: { ...NO_FILTERS, clientId: 'c-4821' }, signalIds: ['headroom', 'familiar', 'not-top', 'top-coupon'] },
    { filters: { ...NO_FILTERS, tenorMonths: 6, minCouponPct: 30 }, signalIds: ['top-coupon'] },
    { filters: { ...NO_FILTERS, exclude: ['NVDA'], maxKiPct: 65 }, signalIds: ['coupon-up', 'vol-rich', 'rm-traded', 'fills', 'correlated', 'no-earnings'] },
  ];
  for (const [i, q] of searches.entries()) {
    await add(`search ${i + 1}`, 'POST', '/ideas/search', q, () => firstValueFrom(ideas.search(q)));
  }
  const specs = [
    { underlyings: ['AMD', 'META'], tenorMonths: 6, kiPct: 65, strikePct: 90, clientId: null },
    { underlyings: ['NVDA'], tenorMonths: 3, kiPct: 75, strikePct: 100, clientId: 'c-4821' },
    { underlyings: ['AAPL', 'MSFT', 'TSLA'], tenorMonths: 12, kiPct: 55, strikePct: 85, clientId: null },
  ];
  for (const [i, s] of specs.entries()) {
    await add(`price ${i + 1}`, 'POST', '/ideas/price', s, () => firstValueFrom(ideas.price(s)));
  }

  writeFileSync(join(out, 'contract.json'), JSON.stringify(goldens, null, 1) + '\n');
  console.log(`${Object.keys(goldens).length} goldens written to ${out}`);
}

void main();
