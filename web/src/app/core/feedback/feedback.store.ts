import { Injectable, computed, inject, signal } from '@angular/core';
import { SessionService } from '../session/session.service';
import { BusinessClock } from '../time/business-clock';
import { addDays } from '../time/business-calendar';
import { FEEDBACK_EARLIER_THIS_WEEK } from './feedback.fixture';

export type FeedbackRating = 'up' | 'down';

export interface FeedbackEntry {
  readonly id: string;
  /** What the feedback is about, e.g. "Today's list" or "Chat answer: Who matures this week?". */
  readonly topic: string;
  readonly rating: FeedbackRating;
  readonly note: string;
  readonly role: string;
  /** ISO date-time. */
  readonly at: string;
  /** Demo entries from earlier in the week, so the summary has something to show. */
  readonly sample?: boolean;
}

export interface FeedbackTopicLine {
  readonly topic: string;
  readonly up: number;
  readonly down: number;
  readonly usefulPct: number;
  readonly notes: number;
}

export interface WeeklyFeedback {
  /** Monday and Friday of the week, ISO dates. */
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly total: number;
  readonly up: number;
  readonly down: number;
  readonly usefulPct: number;
  readonly byRole: readonly { role: string; total: number; usefulPct: number }[];
  /** Least useful first: what needs fixing leads. */
  readonly byTopic: readonly FeedbackTopicLine[];
  /** Newest first. */
  readonly notes: readonly FeedbackEntry[];
}

/** Chat answers are grouped into one line in the summary; each answer keeps its own rating. */
export function topicGroup(topic: string): string {
  return topic.startsWith('Chat answer:') ? 'Chat answers' : topic;
}

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 100) : 0;
}

/** Monday of the week that holds `iso`. */
export function weekStartOf(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

/** The weekly summary (R40): good feedback is the gate for going wider, so it is read every week. */
export function summariseWeek(entries: readonly FeedbackEntry[], anyDayInWeek: string): WeeklyFeedback {
  const weekStart = weekStartOf(anyDayInWeek);
  const weekEnd = addDays(weekStart, 4);
  const inWeek = entries.filter((e) => e.at.slice(0, 10) >= weekStart && e.at.slice(0, 10) <= addDays(weekStart, 6));
  const up = inWeek.filter((e) => e.rating === 'up').length;
  const roles = [...new Set(inWeek.map((e) => e.role))];
  const topics = [...new Set(inWeek.map((e) => topicGroup(e.topic)))];
  const byTopic = topics
    .map((topic) => {
      const list = inWeek.filter((e) => topicGroup(e.topic) === topic);
      const tUp = list.filter((e) => e.rating === 'up').length;
      return { topic, up: tUp, down: list.length - tUp, usefulPct: pct(tUp, list.length), notes: list.filter((e) => e.note).length };
    })
    .sort((a, b) => a.usefulPct - b.usefulPct || b.down - a.down || a.topic.localeCompare(b.topic));
  return {
    weekStart,
    weekEnd,
    total: inWeek.length,
    up,
    down: inWeek.length - up,
    usefulPct: pct(up, inWeek.length),
    byRole: roles.map((role) => {
      const list = inWeek.filter((e) => e.role === role);
      return { role, total: list.length, usefulPct: pct(list.filter((e) => e.rating === 'up').length, list.length) };
    }),
    byTopic,
    notes: inWeek.filter((e) => e.note).sort((a, b) => b.at.localeCompare(a.at)),
  };
}

/**
 * Feedback from the launch users (R40). Internal use only until feedback is good, so every view asks.
 * Held for the session here, on top of sample entries from earlier in the week; the gateway stores it
 * (POST /feedback) and the weekly summary reads from there once wired.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackStore {
  private readonly session = inject(SessionService);
  private readonly clock = inject(BusinessClock);
  private counter = 0;

  readonly entries = signal<readonly FeedbackEntry[]>([]);
  readonly summary = computed(() => {
    const all = this.entries();
    return { up: all.filter((e) => e.rating === 'up').length, down: all.filter((e) => e.rating === 'down').length, notes: all.filter((e) => e.note).length };
  });

  /** This week's summary: sample entries from earlier in the week plus everything rated this session. */
  readonly week = computed(() => {
    const today = this.clock.businessDate();
    return summariseWeek([...FEEDBACK_EARLIER_THIS_WEEK(today), ...this.entries()], today);
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

  /** Taking a rating back removes it from the summary. */
  clear(topic: string): void {
    this.entries.update((list) => list.filter((e) => e.topic !== topic));
  }

  ratingFor(topic: string): FeedbackRating | null {
    return this.entries().find((e) => e.topic === topic)?.rating ?? null;
  }
}

/** Plain text for Teams or email, with the internal-use label (R39). */
export function weekAsText(w: WeeklyFeedback, roleLabel: (role: string) => string): string {
  const lines = [
    `HK ELI Chatbot · launch feedback · week of ${w.weekStart}`,
    `${w.total} ratings, ${w.usefulPct}% useful (${w.up} useful, ${w.down} not useful).`,
    '',
    'By role:',
    ...w.byRole.map((r) => `- ${roleLabel(r.role)}: ${r.total} ratings, ${r.usefulPct}% useful`),
    '',
    'By view, least useful first:',
    ...w.byTopic.map((t) => `- ${t.topic}: ${t.usefulPct}% useful (${t.up} up, ${t.down} down, ${t.notes} notes)`),
  ];
  if (w.notes.length) {
    lines.push('', 'Notes:', ...w.notes.map((n) => `- ${topicGroup(n.topic)} (${roleLabel(n.role)}): "${n.note}"`));
  }
  lines.push('', 'Internal use only. Not for clients.');
  return lines.join('\n');
}
