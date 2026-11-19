import { onTestFinished, vi } from 'vitest';
import { APP_CONFIG } from '../config/app-config';
import { TEST_CONFIG } from '../../testing/test-config';
import { TestBed } from '@angular/core/testing';
import { FeedbackStore, summariseWeek, topicGroup, weekAsText, weekStartOf } from './feedback.store';

beforeEach(() => TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: TEST_CONFIG }] }));

describe('FeedbackStore', () => {
  it('keeps one rating per topic, with the role and an optional note', () => {
    const store = TestBed.inject(FeedbackStore);
    store.rate("Today's list", 'down');
    store.rate("Today's list", 'up');
    store.addNote("Today's list", '  Show the owning branch  ');
    expect(store.entries()).toHaveLength(1);
    expect(store.entries()[0]).toMatchObject({ rating: 'up', role: 'wms', note: 'Show the owning branch' });
    expect(store.summary()).toEqual({ up: 1, down: 0, notes: 1 });
  });
});

describe('weekly feedback summary', () => {
  const e = (topic: string, rating: 'up' | 'down', at: string, role = 'wms', note = '') => ({ id: at + topic, topic, rating, note, role, at });

  it('counts the week Monday to Sunday, groups chat answers and puts the least useful view first', () => {
    const w = summariseWeek(
      [
        e("Today's list", 'up', '2026-11-02T09:00:00+08:00'),
        e('Chat answer: Who matures this week?', 'up', '2026-11-03T09:00:00+08:00'),
        e('Chat answer: Rollover by branch', 'down', '2026-11-03T10:00:00+08:00', 'tsm', 'One trade out against Tableau'),
        e('Business Update', 'down', '2026-11-04T10:00:00+08:00', 'tsm'),
        e("Today's list", 'down', '2026-10-30T09:00:00+08:00'),
      ],
      '2026-11-04',
    );
    expect([w.weekStart, w.weekEnd]).toEqual(['2026-11-02', '2026-11-06']);
    expect([w.total, w.up, w.down, w.usefulPct]).toEqual([4, 2, 2, 50]);
    expect(w.byTopic.map((t) => t.topic)).toEqual(['Business Update', 'Chat answers', "Today's list"]);
    expect(w.byTopic[1]).toMatchObject({ up: 1, down: 1, usefulPct: 50, notes: 1 });
    expect(w.byRole).toEqual([{ role: 'wms', total: 2, usefulPct: 100 }, { role: 'tsm', total: 2, usefulPct: 0 }]);
    expect(w.notes[0].note).toBe('One trade out against Tableau');
    expect(topicGroup('Chat answer: x')).toBe('Chat answers');
    expect(weekStartOf('2026-11-08')).toBe('2026-11-02');
  });

  it('copies as text with the internal-use label', () => {
    const w = summariseWeek([e('Shelf console', 'up', '2026-11-03T09:00:00+08:00', 'pm', 'Saves a Tableau tab')], '2026-11-03');
    const text = weekAsText(w, (r) => r.toUpperCase());
    expect(text).toContain('1 ratings, 100% useful');
    expect(text).toContain('Shelf console (PM): "Saves a Tableau tab"');
    expect(text.trim().endsWith('Internal use only. Not for clients.')).toBe(true);
  });

  it('adds this session to the sample entries from earlier in the week', () => {
    // Ratings are stamped with the real time; pin it inside the test clock's week (asOfDate 3 Nov 2026).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-03T10:00:00+08:00'));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const store = TestBed.inject(FeedbackStore);
    const before = store.week().total;
    store.rate('Ideas results', 'up');
    expect(store.week().total).toBe(before + 1);
    store.clear('Ideas results');
    expect(store.week().total).toBe(before);
  });
});
