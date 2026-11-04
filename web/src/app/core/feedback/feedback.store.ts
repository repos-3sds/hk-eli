import { Injectable, computed, inject, signal } from '@angular/core';
import { SessionService } from '../session/session.service';

export type FeedbackRating = 'up' | 'down';

export interface FeedbackEntry {
  readonly id: string;
  /** What the feedback is about, e.g. "Today's list" or "Ideas results". */
  readonly topic: string;
  readonly rating: FeedbackRating;
  readonly note: string;
  readonly role: string;
  readonly at: string;
}

/**
 * Feedback from the launch users (R40). Internal use only until feedback is good, so every view asks.
 * Held for the session here; the gateway stores it for the weekly summary once wired.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackStore {
  private readonly session = inject(SessionService);
  private counter = 0;

  readonly entries = signal<readonly FeedbackEntry[]>([]);
  readonly summary = computed(() => {
    const all = this.entries();
    return { up: all.filter((e) => e.rating === 'up').length, down: all.filter((e) => e.rating === 'down').length, notes: all.filter((e) => e.note).length };
  });

  /** One rating per topic: a new rating replaces the earlier one. */
  rate(topic: string, rating: FeedbackRating, note = ''): FeedbackEntry {
    const entry: FeedbackEntry = { id: `fb-${++this.counter}`, topic, rating, note: note.trim(), role: this.session.role(), at: new Date().toISOString() };
    this.entries.update((list) => [...list.filter((e) => e.topic !== topic), entry]);
    return entry;
  }

  addNote(topic: string, note: string): void {
    this.entries.update((list) => list.map((e) => (e.topic === topic ? { ...e, note: note.trim() } : e)));
  }

  ratingFor(topic: string): FeedbackRating | null {
    return this.entries().find((e) => e.topic === topic)?.rating ?? null;
  }
}
