import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { TEST_CONFIG } from '../../testing/test-config';
import { FeedbackStore, WeeklyFeedback } from './feedback.store';

const STORED: WeeklyFeedback = {
  weekStart: '2026-11-02', weekEnd: '2026-11-06', total: 40, up: 30, down: 10, usefulPct: 75,
  byRole: [{ role: 'pm', total: 40, usefulPct: 75 }], byTopic: [{ topic: 'Chat answers', up: 5, down: 5, usefulPct: 50, notes: 1 }], notes: [],
};

describe('FeedbackStore in gateway mode', () => {
  it('stores each rating and shows everyone\'s week from the gateway', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: APP_CONFIG, useValue: { ...TEST_CONFIG, dataSource: 'gateway' } }, provideHttpClient(), provideHttpClientTesting()],
    });
    const store = TestBed.inject(FeedbackStore);
    const http = TestBed.inject(HttpTestingController);

    store.rate("Today's list", 'down', 'Missed one');
    const post = http.expectOne((r) => r.method === 'POST' && r.url === '/api/hk-eli/feedback');
    expect(post.request.body).toEqual({ topic: "Today's list", rating: 'down', note: 'Missed one' });
    post.flush({});
    http.expectOne('/api/hk-eli/feedback/week').flush(STORED);
    expect(store.fromGateway()).toBe(true);
    expect(store.week().total).toBe(40);

    store.clear("Today's list");
    const del = http.expectOne((r) => r.method === 'DELETE');
    expect(del.request.params.get('topic')).toBe("Today's list");
    del.flush(null);
    http.expectOne('/api/hk-eli/feedback/week').flush(STORED);
    http.verify();
  });
});
