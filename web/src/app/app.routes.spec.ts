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

  it('opens the Product Manager on the shelf console', async () => {
    expect(await go('/', 'pm')).toBe('/shelf');
  });

  it('opens the Treasury Sales Manager on Today', async () => {
    expect(await go('/', 'tsm')).toBe('/update');
  });

  it('redirects old RM links to the same tab, keeping the query', async () => {
    expect(await go('/rm/chat?q=Who%20matures%20this%20week%3F')).toBe('/chat?q=Who%20matures%20this%20week%3F');
  });

  it('redirects an old link to a client\'s ideas to the Ideas tab', async () => {
    expect(await go('/rm/today/ideas/c-4821')).toBe('/ideas?client=c-4821');
  });
});
