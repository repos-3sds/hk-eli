import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconTestingModule } from '@angular/material/icon/testing';
import { Router, provideRouter } from '@angular/router';
import { APP_CONFIG } from '../../../core/config/app-config';
import { MockTodayDataSource } from '../../../core/data/mock-today-data-source';
import { TodayDataSource } from '../../../core/data/today-data-source';
import { TEST_CONFIG } from '../../../testing/test-config';
import { TodayStore } from '../today.store';
import { BriefPage } from './brief-page';
import { LeadActions } from './lead-actions';

async function render(scenario: 'normal' | 'empty' | 'error' = 'normal') {
  TestBed.configureTestingModule({
    imports: [MatIconTestingModule],
    providers: [
      provideRouter([]),
      TodayStore,
      LeadActions,
      { provide: APP_CONFIG, useValue: { ...TEST_CONFIG, mockScenario: scenario } },
      { provide: TodayDataSource, useClass: MockTodayDataSource },
    ],
  });
  const fixture = TestBed.createComponent(BriefPage);
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
  }
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('BriefPage', () => {
  it('shows the greeting, the short brief and three ranked rows', async () => {
    const { el } = await render();
    expect(el.querySelector('.salutation')?.textContent).toContain('Srivalli');
    expect(el.querySelector('.greeting')?.textContent).toContain('4 clients need you today');
    expect(el.querySelectorAll('eli-brief-row')).toHaveLength(3);
    expect(el.textContent).toContain('Show 1 more client (Ho S.');
    expect(el.textContent).toContain('Business date 2 Nov 2026');
    expect(el.querySelector('eli-brief-row .rank')?.textContent).toBe('1');
    expect(el.querySelector('.summary')?.textContent).toContain('1 maturity, 1 likely knock-out, 1 stock delivery and 1 idle client. Start with Chan Tai Man: matures');
  });

  it('puts the ask box and suggestions in the landing, with tabs for the brief and the calendar', async () => {
    const { el, fixture } = await render();
    expect(el.querySelector('.hero eli-composer')).not.toBeNull();
    expect(el.querySelector('.chip')?.textContent).toContain('Prepare me for my call with Chan');
    expect(el.querySelector('eli-moment-strip')).toBeNull();
    (el.querySelector('#tab-calendar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.day')).toHaveLength(10);
    expect(el.querySelector('eli-brief-row')).toBeNull();
  });

  it('sends a suggestion straight to Chat with the client in focus', async () => {
    const { el } = await render();
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    (el.querySelector('.chip') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith(['/rm/chat'], { queryParams: { q: 'Prepare me for my call with Chan', client: 'c-4821' } });
  });

  it('marks the client in the panel as selected and moves the selection on a press', async () => {
    const { el, fixture } = await render();
    const rows = () => [...el.querySelectorAll('eli-brief-row .row')] as HTMLButtonElement[];
    expect(rows()[0].getAttribute('aria-pressed')).toBe('true');
    rows()[1].click();
    fixture.detectChanges();
    expect(rows()[0].getAttribute('aria-pressed')).toBe('false');
    expect(rows()[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('starts with the client panel closed, so the selected row carries the actions', async () => {
    const { el, fixture } = await render();
    const actions = () => el.querySelector('eli-brief-row .item.panel-closed .inline-actions');
    expect(actions()?.textContent).toContain('Show rollover ideas');
    TestBed.inject(TodayStore).dockOpen.set(true);
    fixture.detectChanges();
    expect(actions()).toBeNull();
  });

  it('reveals the hidden client', async () => {
    const { el, fixture } = await render();
    (el.querySelector('.more') as HTMLButtonElement).click();
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
    expect(el.querySelectorAll('eli-brief-row')).toHaveLength(4);
  });

  it('says so when nothing needs the RM', async () => {
    const { el } = await render('empty');
    expect(el.textContent).toContain('Nothing needs you urgently today');
    expect(el.querySelectorAll('eli-brief-row')).toHaveLength(0);
  });

  it('shows an error with a retry', async () => {
    const { el } = await render('error');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    expect(el.textContent).toContain('Try again');
  });
});
