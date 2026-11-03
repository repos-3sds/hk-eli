import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { ChatDataSource } from '../../core/chat/chat-data-source';
import { ChatAnswer } from '../../core/chat/chat.models';
import { ChatStore } from './chat.store';

const ANSWER: ChatAnswer = { id: 'a1', blocks: [{ kind: 'text', text: 'Hi' }], followUps: [], businessDate: '2026-11-02', sources: [], fallback: false };

describe('ChatStore', () => {
  it('adds a pending turn, then the answer, and clears the draft', () => {
    const reply = new Subject<ChatAnswer>();
    TestBed.configureTestingModule({ providers: [{ provide: ChatDataSource, useValue: { ask: () => reply } }] });
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
    TestBed.configureTestingModule({ providers: [{ provide: ChatDataSource, useValue: { ask } }] });
    const store = TestBed.inject(ChatStore);
    store.send('Hello', null);
    failing.error(new Error('timeout'));
    expect(store.turns()[0].status).toBe('error');
    fail = false;
    store.retry(store.turns()[0].id);
    expect(store.turns()[0].status).toBe('done');
  });

  it('ignores an empty question', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ChatDataSource, useValue: { ask: () => of(ANSWER) } }] });
    const store = TestBed.inject(ChatStore);
    store.send('   ');
    expect(store.turns()).toHaveLength(0);
  });
});
