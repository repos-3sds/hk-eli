import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { newTraceparent, traceInterceptor } from './trace.interceptor';

describe('trace interceptor', () => {
  it('builds a W3C traceparent', () => {
    expect(newTraceparent()).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it('adds one trace id per request and keeps an existing one', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([traceInterceptor])), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);

    http.get('/a').subscribe();
    http.get('/b', { headers: { traceparent: 'keep-me' } }).subscribe();

    expect(ctrl.expectOne('/a').request.headers.get('traceparent')).toMatch(/^00-/);
    expect(ctrl.expectOne('/b').request.headers.get('traceparent')).toBe('keep-me');
    ctrl.verify();
  });
});
