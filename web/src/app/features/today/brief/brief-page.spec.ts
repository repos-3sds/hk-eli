import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconTestingModule } from '@angular/material/icon/testing';
import { Router, provideRouter } from '@angular/router';
import { APP_CONFIG } from '../../../core/config/app-config';
import { MockTodayDataSource } from '../../../core/data/mock-today-data-source';
import { TodayDataSource } from '../../../core/data/today-data-source';
import { TEST_CONFIG } from '../../../testing/test-config';
import { TodayStore } from '../today.store';
import { HandoffStore } from '../../../core/handoff/handoff.store';
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
    expect(el.querySelector('.salutation')?.textContent).toContain('Kelly');
    expect(el.querySelector('.greeting')?.textContent).toContain('USD 11.98m matures in the next 10 business days; 3 pockets are below the rollover line.');
    expect(el.querySelectorAll('eli-brief-row')).toHaveLength(3);
    expect(el.querySelector('.more')?.textContent).toContain('Show 9 more clients');
    expect(el.querySelector('eli-scope-switch')?.textContent).toContain('Whole business');
    expect(el.querySelectorAll('.pocket')).toHaveLength(3);
    expect(el.querySelector('.pocket')?.textContent).toContain('Kwun Tong · Treasures');
    expect(el.querySelector('eli-brief-row .meta')?.textContent).toContain('Kwun Tong · RM Srivalli T.');
    expect(el.textContent).toContain('Data as of close Mon 2 Nov');
    expect(el.textContent).toContain('Prices 09:05 HKT today');
    expect(el.textContent).toContain('Internal use only');
    expect(el.querySelector('eli-brief-row .rank')?.textContent).toBe('1');
    expect(el.querySelector('.summary')?.textContent).toContain('12 clients need attention: 6 maturities');
  });

  it('puts the ask box and suggestions in the landing, with tabs for the brief and the calendar', async () => {
    const { el, fixture } = await render();
    expect(el.querySelector('.hero eli-composer')).not.toBeNull();
    expect(el.querySelector('.chip')?.textContent).toContain('Brief me on Chan');
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
    expect(spy).toHaveBeenCalledWith(['/chat'], { queryParams: { q: 'Brief me on Chan', client: 'c-4821' } });
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
    expect(el.querySelectorAll('eli-brief-row')).toHaveLength(12);
  });

  it('narrows the list to a pocket and clears it', async () => {
    const { el, fixture } = await render();
    (el.querySelector('.pocket .eli-link') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.pockets')).toBeNull();
    expect(el.querySelector('.filters')?.textContent).toContain('Showing clients in Kwun Tong · Treasures (rollover 45%)');
    expect([...el.querySelectorAll('eli-brief-row .name')].map((n) => n.textContent)).toEqual(['Chan Tai Man', 'Lee Mei', 'Fung Ray']);
    (el.querySelector('.filters .eli-link') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.pocket')).toHaveLength(3);
  });

  it('adds the selected client to the hand-off list for their owner RM, once', async () => {
    const { el, fixture } = await render();
    const btn = () => [...el.querySelectorAll('eli-brief-row .inline-actions button')].find((b) => /hand-off/.test(b.textContent ?? '')) as HTMLButtonElement;
    btn().click();
    fixture.detectChanges();
    const handoff = TestBed.inject(HandoffStore);
    expect(handoff.draft()).toMatchObject([{ clientName: 'Chan Tai Man', ownerRm: 'Srivalli T.', branch: 'Kwun Tong', reason: 'Maturity', from: 'Today' }]);
    expect(btn().textContent).toContain('On hand-off list');
    expect(btn().disabled).toBe(true);
  });

  it('opens Ideas for a pocket', async () => {
    const { el } = await render();
    const spy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (el.querySelectorAll('.pocket .eli-link')[1] as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith(['/ideas'], { queryParams: { pocket: 'p-kt-tr' } });
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

  it('after a failed overnight run shows no new list, and the last good one only on request, clearly labelled', async () => {
    window.history.replaceState(null, '', '/?freshness=failed');
    try {
      const { el, fixture } = await render();
      expect(el.textContent).toContain('No new list today');
      expect(el.querySelector('eli-brief-row')).toBeNull();
      expect(el.querySelector('.summary')).toBeNull();
      ([...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Show the last good list')) as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.textContent).toContain('Last good list, from close 30 Oct 2026. Not new today.');
      expect(el.querySelectorAll('eli-brief-row').length).toBeGreaterThan(0);
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('asks for feedback on the list', async () => {
    const { el } = await render();
    expect(el.querySelector('eli-feedback')?.textContent).toContain("Was today's list useful?");
  });
});
