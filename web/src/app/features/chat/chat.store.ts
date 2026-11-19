import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, map } from 'rxjs';
import { AskEvent, ChatDataSource, StoredTurn } from '../../core/chat/chat-data-source';
import { ChatAnswer } from '../../core/chat/chat.models';
import { FeedbackStore } from '../../core/feedback/feedback.store';
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
  /** Steps the pipeline reported as done, when it streams them (PR #8 /ask/stream). */
  readonly live?: readonly string[];
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
/** The pipeline's own steps, in order. Shown live while it works; the real timeline replaces them when the answer lands. */
export const ANSWER_STAGES = [
  'Reading the question',
  'Choosing the Tableau view and filters',
  'Fetching rows from Tableau',
  'Checking the results',
  'Writing the answer and checking every figure',
] as const;
const STAGE_DELAYS_MS = [700, 1600, 2600, 3600];

/**
 * The conversation. Lives for the whole session, so leaving the Chat tab and coming back keeps it.
 * "New chat" files the current conversation under History (this session only; nothing is stored).
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly data = inject(ChatDataSource);
  private readonly feedback = inject(FeedbackStore);
  private counter = 0;
  private readonly running = new Map<string, { sub: Subscription; timers: ReturnType<typeof setTimeout>[] }>();

  readonly turns = signal<readonly ChatTurn[]>([]);
  readonly history = signal<readonly PastConversation[]>([]);
  readonly draft = signal('');
  /** The client the next question is about, if any (picked on Today or in the ask box). */
  readonly clientId = signal<string | null>(null);

  /** The server-side conversation the current turns belong to (SQLite), once the first answer names it. */
  readonly conversationId = signal<string | null>(null);
  /** Stored questions from the server, newest first; null when the source keeps no store. */
  readonly stored = signal<readonly StoredTurn[] | null>(null);
  /** Stored conversations other than the open one, newest first. */
  readonly storedConversations = computed<readonly PastConversation[]>(() => {
    const all = this.stored();
    if (!all) return [];
    const groups = new Map<string, StoredTurn[]>();
    for (const t of all) {
      if (t.conversationId === this.conversationId()) continue;
      groups.set(t.conversationId, [...(groups.get(t.conversationId) ?? []), t]);
    }
    return [...groups.entries()].map(([id, list]) => {
      const oldest = [...list].reverse();
      return { id, title: oldest[0].question, startedAt: new Date(oldest[0].askedAt), turns: oldest.map((s) => this.fromStored(s)) };
    });
  });

  readonly busy = computed(() => this.turns().some((t) => t.status === 'pending'));
  readonly clientShortName = computed(() => FIXTURE_CLIENTS.find((c) => c.id === this.clientId())?.shortName ?? null);
  /** The conversation's name: its first question. */
  readonly title = computed(() => this.turns()[0]?.question ?? null);
  readonly lastQuestion = computed(() => this.turns().at(-1)?.question ?? null);

  constructor() {
    this.refreshStored();
  }

  /** Reloads the stored history, where the source keeps one. */
  refreshStored(): void {
    this.data.storedHistory?.().subscribe((s) => this.stored.set(s));
  }

  /** Reopens a stored conversation: its questions and headlines come back, and new questions continue it. */
  reopenStored(conversationId: string): void {
    const past = this.storedConversations().find((c) => c.id === conversationId);
    if (!past) return;
    this.newChat();
    this.turns.set(past.turns);
    this.conversationId.set(conversationId);
  }

  /** Puts a past question back in the ask box to change and send again. */
  edit(turnId: string): void {
    const turn = this.turns().find((t) => t.id === turnId);
    if (turn) this.draft.set(turn.question);
  }

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
    this.patch(turnId, { status: 'pending', stage: 0, live: undefined, error: undefined });
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
    const stored = this.turns().find((t) => t.id === turnId)?.answer?.turnId;
    if (stored && feedback) this.data.sendFeedback?.(stored, feedback === 'up' ? 1 : -1)?.subscribe();
    // Chat answers count in the weekly feedback summary too (R40), one rating per question.
    const turn = this.turns().find((t) => t.id === turnId);
    if (turn) {
      const topic = `Chat answer: ${turn.question.length > 60 ? turn.question.slice(0, 57) + '…' : turn.question}`;
      if (feedback) {
        this.feedback.rate(topic, feedback);
      } else {
        this.feedback.clear(topic);
      }
    }
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
    this.conversationId.set(null);
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
    const streams = this.data.streams === true && typeof this.data.askStream === 'function';
    const timers = streams ? [] : STAGE_DELAYS_MS.map((ms, i) => setTimeout(() => this.advance(turnId, i + 1), ms));
    const entry = { sub: new Subscription(), timers };
    this.running.set(turnId, entry);
    if (streams) this.patch(turnId, { live: [] });
    const q = { text: turn.question, clientId: turn.clientId, conversationId: this.conversationId() };
    const source = streams ? this.data.askStream(q) : this.data.ask(q).pipe(map((answer): AskEvent => ({ kind: 'answer', answer })));
    entry.sub = source.subscribe({
      next: (ev) => {
        if (ev.kind === 'stage') {
          const now = this.turns().find((t) => t.id === turnId);
          if (now?.status === 'pending') this.patch(turnId, { live: [...(now.live ?? []), ev.label] });
          return;
        }
        const answer = ev.answer;
        this.finish(turnId);
        this.patch(turnId, { status: 'done', answer, answeredAt: new Date() });
        if (answer.conversationId) {
          this.conversationId.set(answer.conversationId);
          this.refreshStored();
        }
      },
      error: () => {
        this.finish(turnId);
        this.patch(turnId, { status: 'error', error: 'The answer did not come back in time. Try again.' });
      },
    });
  }

  private fromStored(s: StoredTurn): ChatTurn {
    const at = new Date(s.askedAt);
    return {
      id: `t-${++this.counter}`,
      question: s.question,
      clientId: null,
      askedAt: at,
      answeredAt: at,
      status: 'done',
      stage: 0,
      feedback: null,
      answer: {
        id: s.turnId,
        blocks: [{ kind: 'text', text: s.headline || 'No answer was stored for this question.' }],
        followUps: [],
        businessDate: '',
        sources: [],
        fallback: s.status !== 'OK',
        turnId: s.turnId,
        conversationId: s.conversationId,
        status: s.status,
        writtenBy: 'Saved answer: the headline only. Ask again for the figures, chart and sources.',
      },
    };
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
