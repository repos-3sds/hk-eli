import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ChatDataSource } from '../../core/chat/chat-data-source';
import { ChatAnswer } from '../../core/chat/chat.models';
import { FIXTURE_CLIENTS } from '../../core/data/today.fixture';

export type TurnStatus = 'pending' | 'done' | 'error' | 'stopped';
export type Feedback = 'up' | 'down' | null;

export interface ChatTurn {
  readonly id: string;
  readonly question: string;
  readonly clientId: string | null;
  readonly askedAt: Date;
  readonly status: TurnStatus;
  /** While pending: which step the answer is on (0 find, 1 read, 2 write). */
  readonly stage: number;
  readonly answer?: ChatAnswer;
  readonly answeredAt?: Date;
  readonly error?: string;
  readonly feedback: Feedback;
}

export interface PastConversation {
  readonly id: string;
  readonly title: string;
  readonly startedAt: Date;
  readonly turns: readonly ChatTurn[];
}

/** What the user sees while an answer is being put together, step by step. */
export const ANSWER_STAGES = ['Finding the client and the question', 'Reading the blotter, fixings and RFQ log', 'Writing the answer'] as const;
const STAGE_DELAYS_MS = [350, 900];

/**
 * The conversation. Lives for the whole session, so leaving the Chat tab and coming back keeps it.
 * "New chat" files the current conversation under History (this session only; nothing is stored).
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly data = inject(ChatDataSource);
  private counter = 0;
  private readonly running = new Map<string, { sub: Subscription; timers: ReturnType<typeof setTimeout>[] }>();

  readonly turns = signal<readonly ChatTurn[]>([]);
  readonly history = signal<readonly PastConversation[]>([]);
  readonly draft = signal('');
  /** The client the next question is about, if any (picked on Today or in the ask box). */
  readonly clientId = signal<string | null>(null);

  readonly busy = computed(() => this.turns().some((t) => t.status === 'pending'));
  readonly clientShortName = computed(() => FIXTURE_CLIENTS.find((c) => c.id === this.clientId())?.shortName ?? null);
  /** The conversation's name: its first question. */
  readonly title = computed(() => this.turns()[0]?.question ?? null);
  readonly lastQuestion = computed(() => this.turns().at(-1)?.question ?? null);

  send(question: string, clientId: string | null = this.clientId()): void {
    const text = question.trim();
    if (!text || this.busy()) {
      return;
    }
    const id = `t-${++this.counter}`;
    this.turns.update((t) => [...t, { id, question: text, clientId, askedAt: new Date(), status: 'pending', stage: 0, feedback: null }]);
    this.draft.set('');
    this.run(id);
  }

  retry(turnId: string): void {
    this.patch(turnId, { status: 'pending', stage: 0, error: undefined });
    this.run(turnId);
  }

  /** Stops the answer being worked on. Nothing has been sent anywhere, so stopping is always safe. */
  stop(): void {
    for (const t of this.turns()) {
      if (t.status === 'pending') {
        this.finish(t.id);
        this.patch(t.id, { status: 'stopped' });
      }
    }
  }

  rate(turnId: string, feedback: Feedback): void {
    this.patch(turnId, { feedback });
  }

  /** Files the current conversation under History and starts an empty one. */
  newChat(): void {
    this.stop();
    const turns = this.turns();
    if (turns.length > 0) {
      this.history.update((h) => [{ id: `c-${++this.counter}`, title: turns[0].question, startedAt: turns[0].askedAt, turns }, ...h]);
    }
    this.turns.set([]);
    this.draft.set('');
  }

  /** Reopens a past conversation; the current one goes to History in its place. */
  reopen(conversationId: string): void {
    const past = this.history().find((c) => c.id === conversationId);
    if (!past) {
      return;
    }
    this.history.update((h) => h.filter((c) => c.id !== conversationId));
    this.newChat();
    this.turns.set(past.turns);
  }

  clear(): void {
    this.stop();
    this.turns.set([]);
  }

  private run(turnId: string): void {
    const turn = this.turns().find((t) => t.id === turnId);
    if (!turn) {
      return;
    }
    const timers = STAGE_DELAYS_MS.map((ms, i) => setTimeout(() => this.advance(turnId, i + 1), ms));
    const entry = { sub: new Subscription(), timers };
    this.running.set(turnId, entry);
    entry.sub = this.data.ask({ text: turn.question, clientId: turn.clientId }).subscribe({
      next: (answer) => {
        this.finish(turnId);
        this.patch(turnId, { status: 'done', answer, answeredAt: new Date() });
      },
      error: () => {
        this.finish(turnId);
        this.patch(turnId, { status: 'error', error: 'The answer did not come back in time. Nothing was sent anywhere.' });
      },
    });
  }

  private advance(turnId: string, stage: number): void {
    const turn = this.turns().find((t) => t.id === turnId);
    if (turn?.status === 'pending' && turn.stage < stage) {
      this.patch(turnId, { stage });
    }
  }

  private finish(turnId: string): void {
    const entry = this.running.get(turnId);
    if (entry) {
      entry.timers.forEach(clearTimeout);
      entry.sub.unsubscribe();
      this.running.delete(turnId);
    }
  }

  private patch(turnId: string, change: Partial<ChatTurn>): void {
    this.turns.update((list) => list.map((t) => (t.id === turnId ? { ...t, ...change } : t)));
  }
}
