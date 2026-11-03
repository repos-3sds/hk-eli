import { Injectable, computed, inject, signal } from '@angular/core';
import { ChatDataSource } from '../../core/chat/chat-data-source';
import { ChatAnswer } from '../../core/chat/chat.models';
import { FIXTURE_CLIENTS } from '../../core/data/today.fixture';

export interface ChatTurn {
  readonly id: string;
  readonly question: string;
  readonly clientId: string | null;
  readonly status: 'pending' | 'done' | 'error';
  readonly answer?: ChatAnswer;
  readonly error?: string;
}

/** The conversation. Lives for the whole session, so leaving the Chat tab and coming back keeps it. */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly data = inject(ChatDataSource);
  private counter = 0;

  readonly turns = signal<readonly ChatTurn[]>([]);
  readonly draft = signal('');
  /** The client the next question is about, if any (handed over from Today). */
  readonly clientId = signal<string | null>(null);

  readonly busy = computed(() => this.turns().some((t) => t.status === 'pending'));
  readonly clientShortName = computed(() => FIXTURE_CLIENTS.find((c) => c.id === this.clientId())?.shortName ?? null);

  send(question: string, clientId: string | null = this.clientId()): void {
    const text = question.trim();
    if (!text) {
      return;
    }
    const id = `t-${++this.counter}`;
    this.turns.update((t) => [...t, { id, question: text, clientId, status: 'pending' }]);
    this.draft.set('');
    this.run(id);
  }

  retry(turnId: string): void {
    this.patch(turnId, { status: 'pending', error: undefined });
    this.run(turnId);
  }

  clear(): void {
    this.turns.set([]);
  }

  private run(turnId: string): void {
    const turn = this.turns().find((t) => t.id === turnId);
    if (!turn) {
      return;
    }
    this.data.ask({ text: turn.question, clientId: turn.clientId }).subscribe({
      next: (answer) => this.patch(turnId, { status: 'done', answer }),
      error: () => this.patch(turnId, { status: 'error', error: 'The answer did not come back in time. Nothing was sent to the client.' }),
    });
  }

  private patch(turnId: string, change: Partial<ChatTurn>): void {
    this.turns.update((list) => list.map((t) => (t.id === turnId ? { ...t, ...change } : t)));
  }
}
