import { APP_CONFIG } from '../../core/config/app-config';
import { TEST_CONFIG } from '../../testing/test-config';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { ChatDataSource } from '../../core/chat/chat-data-source';
import { ChatAnswer } from '../../core/chat/chat.models';
import { ChatStore } from './chat.store';

const ANSWER: ChatAnswer = { id: 'a1', blocks: [{ kind: 'text', text: 'Hi' }], followUps: [], businessDate: '2026-11-02', sources: [], fallback: false };

describe('ChatStore', () => {
  it('adds a pending turn, then the answer, and clears the draft', () => {
    const reply = new Subject<ChatAnswer>();
    TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: TEST_CONFIG }, { provide: ChatDataSource, useValue: { ask: () => reply } }] });
    const store = TestBed.inject(ChatStore);
    store.draft.set('Who matures this week?');
    store.send(store.draft());
    expect(store.draft()).toBe('');
    expect(store.busy()).toBe(true);
    reply.next(ANSWER);
    expect(store.turns()[0].status).toBe('done');
    expect(store.busy()).toBe(false);
  });

  it('shows an error and retries', () => {
    let fail = true;
    const ask = vi.fn(() => (fail ? new Subject<ChatAnswer>() : of(ANSWER)));
    const failing = new Subject<ChatAnswer>();
    ask.mockReturnValueOnce(failing);
    TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: TEST_CONFIG }, { provide: ChatDataSource, useValue: { ask } }] });
    const store = TestBed.inject(ChatStore);
    store.send('Hello');
    failing.error(new Error('timeout'));
    expect(store.turns()[0].status).toBe('error');
    fail = false;
    store.retry(store.turns()[0].id);
    expect(store.turns()[0].status).toBe('done');
  });

  it('ignores an empty question', () => {
    TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: TEST_CONFIG }, { provide: ChatDataSource, useValue: { ask: () => of(ANSWER) } }] });
    const store = TestBed.inject(ChatStore);
    store.send('   ');
    expect(store.turns()).toHaveLength(0);
  });

  it('stops a pending answer without sending anything, and files the chat under History on New chat', () => {
    const reply = new Subject<ChatAnswer>();
    TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: TEST_CONFIG }, { provide: ChatDataSource, useValue: { ask: () => reply } }] });
    const store = TestBed.inject(ChatStore);
    store.send('Who matures this week?');
    store.stop();
    expect(store.turns()[0].status).toBe('stopped');
    expect(store.busy()).toBe(false);
    reply.next(ANSWER);
    expect(store.turns()[0].status).toBe('stopped');
    store.newChat();
    expect(store.turns()).toHaveLength(0);
    expect(store.history()[0].title).toBe('Who matures this week?');
    store.reopen(store.history()[0].id);
    expect(store.turns()[0].question).toBe('Who matures this week?');
    expect(store.history()).toHaveLength(0);
  });

  it('records feedback on an answer', () => {
    TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: TEST_CONFIG }, { provide: ChatDataSource, useValue: { ask: () => of(ANSWER) } }] });
    const store = TestBed.inject(ChatStore);
    store.send('Hello');
    store.rate(store.turns()[0].id, 'up');
    expect(store.turns()[0].feedback).toBe('up');
  });

  it('reopens a stored conversation with every answer in full, falling back to the headline for old turns', () => {
    const stored = [
      { turnId: 'T2', conversationId: 'C1', askedAt: '2026-11-23T10:01:00Z', question: 'And PB?', status: 'OK', headline: 'PB headline' },
      { turnId: 'T1', conversationId: 'C1', askedAt: '2026-11-23T10:00:00Z', question: 'If NVDA falls 10%?', status: 'OK', headline: 'NVDA headline' },
    ];
    const full: ChatAnswer = { ...ANSWER, id: 'full', blocks: [{ kind: 'text', text: 'The whole what-if answer' }], followUps: ['What if 20%?'] };
    const saved = new Subject<readonly { turnId: string; answer: ChatAnswer | null }[] | null>();
    const storedConversation = vi.fn(() => saved);
    TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: TEST_CONFIG }, {
      provide: ChatDataSource, useValue: { ask: () => of(ANSWER), storedHistory: () => of(stored), storedConversation } }] });
    const store = TestBed.inject(ChatStore);
    store.reopenStored('C1');
    expect(storedConversation).toHaveBeenCalledWith('C1');
    expect(store.turns().map((t) => t.question)).toEqual(['If NVDA falls 10%?', 'And PB?']);
    expect(store.turns()[0].answer?.writtenBy).toBe('Loading the saved answer…');
    saved.next([{ turnId: 'T1', answer: full }, { turnId: 'T2', answer: null }]);
    const [first, second] = store.turns();
    expect(first.answer?.blocks).toEqual(full.blocks);
    expect(first.answer?.followUps).toEqual(['What if 20%?']);
    expect(first.answer?.turnId).toBe('T1');                       // feedback still goes to the stored turn
    expect(second.answer?.blocks).toEqual([{ kind: 'text', text: 'PB headline' }]);
    expect(second.answer?.writtenBy).toContain('headline only');
    expect(store.conversationId()).toBe('C1');
  });

  it('keeps the headline when the saved answers cannot be loaded', () => {
    const stored = [{ turnId: 'T1', conversationId: 'C1', askedAt: '2026-11-23T10:00:00Z', question: 'Q', status: 'OK', headline: 'H' }];
    TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: TEST_CONFIG }, {
      provide: ChatDataSource, useValue: { ask: () => of(ANSWER), storedHistory: () => of(stored), storedConversation: () => of(null) } }] });
    const store = TestBed.inject(ChatStore);
    store.reopenStored('C1');
    expect(store.turns()[0].answer?.blocks).toEqual([{ kind: 'text', text: 'H' }]);
    expect(store.turns()[0].answer?.writtenBy).toContain('headline only');
  });
});
