import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconTestingModule } from '@angular/material/icon/testing';
import { provideRouter } from '@angular/router';
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
  it('shows the strip, the greeting and three ranked rows', async () => {
    const { el } = await render();
    expect(el.querySelectorAll('.day')).toHaveLength(10);
    expect(el.querySelector('.greeting')?.textContent).toContain('4 clients need you today');
    expect(el.querySelectorAll('eli-brief-row')).toHaveLength(3);
    expect(el.textContent).toContain('Show 1 more client (Ho S.');
    expect(el.textContent).toContain('Business date 2 Nov 2026');
    expect(el.querySelector('eli-brief-row .rank')?.textContent).toBe('1');
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
