import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { SessionService } from './core/session/session.service';

@Component({ template: '' })
class Blank {}

/** Same redirects as the app, with every tab swapped for a blank page so nothing loads. */
const testRoutes = routes.map((r) => (r.loadComponent ? { ...r, loadComponent: undefined, component: Blank, children: r.children?.map((c) => (c.loadComponent ? { ...c, loadComponent: undefined, component: Blank } : c)) } : r));

describe('routes', () => {
  async function go(url: string, role?: 'wms' | 'pm' | 'tsm'): Promise<string> {
    TestBed.configureTestingModule({ providers: [provideRouter(testRoutes)] });
    if (role) TestBed.inject(SessionService).switchRole(role);
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return router.url;
  }

  it('opens on Today without an rm prefix', async () => {
    expect(await go('/')).toBe('/today');
  });

  it('opens every launch role on Today', async () => {
    expect(await go('/', 'pm')).toBe('/today');
  });

  it('opens the Treasury Sales Manager on Today', async () => {
    expect(await go('/', 'tsm')).toBe('/today');
  });

  for (const tab of ['/ideas', '/shelf', '/update', '/alerts', '/feedback']) {
    it(`sends ${tab}, beyond the discovery docs, to Today`, async () => {
      expect(await go(tab)).toBe('/today');
    });
  }

  it('redirects old RM links to the same tab, keeping the query', async () => {
    expect(await go('/rm/chat?q=Who%20matures%20this%20week%3F')).toBe('/chat?q=Who%20matures%20this%20week%3F');
  });

  it('sends an old link to a client\'s ideas to Today, since Ideas is hidden', async () => {
    expect(await go('/rm/today/ideas/c-4821')).toBe('/today');
  });
});
