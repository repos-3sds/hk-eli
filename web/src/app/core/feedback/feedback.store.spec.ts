import { TestBed } from '@angular/core/testing';
import { FeedbackStore } from './feedback.store';

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
