import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { TEST_CONFIG } from '../../testing/test-config';
import { callerInterceptor } from './caller.interceptor';
import { SessionService } from './session.service';

describe('callerInterceptor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: TEST_CONFIG },
        provideHttpClient(withInterceptors([callerInterceptor])),
        provideHttpClientTesting(),
      ],
    });
  });

  it('tells the gateway who is asking, and follows a role switch', () => {
    const http = TestBed.inject(HttpClient);
    const ctl = TestBed.inject(HttpTestingController);
    http.get('/api/hk-eli/freshness').subscribe();
    let req = ctl.expectOne('/api/hk-eli/freshness');
    expect(req.request.headers.get('X-Eli-Role')).toBe('wms');
    expect(req.request.headers.get('X-Eli-User')).toBe('Kelly Lau');
    req.flush({});
    TestBed.inject(SessionService).switchRole('pm');
    http.get('/api/hk-eli/feedback/week').subscribe();
    req = ctl.expectOne('/api/hk-eli/feedback/week');
    expect(req.request.headers.get('X-Eli-Role')).toBe('pm');
    req.flush({});
  });

  it('sends nothing to other hosts', () => {
    const http = TestBed.inject(HttpClient);
    const ctl = TestBed.inject(HttpTestingController);
    http.get('config/app-config.json').subscribe();
    const req = ctl.expectOne('config/app-config.json');
    expect(req.request.headers.has('X-Eli-User')).toBe(false);
    req.flush({});
  });
});
