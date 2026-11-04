import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_CONFIG } from '../../core/config/app-config';
import { MockTodayDataSource } from '../../core/data/mock-today-data-source';
import { TodayDataSource } from '../../core/data/today-data-source';
import { TEST_CONFIG } from '../../testing/test-config';
import { MaturityFlow } from './maturity-flow';

async function render(scenario = 'normal') {
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: APP_CONFIG, useValue: { ...TEST_CONFIG, mockScenario: scenario } }, { provide: TodayDataSource, useClass: MockTodayDataSource }] });
  const fixture = TestBed.createComponent(MaturityFlow);
  const settle = async () => {
    fixture.detectChanges();
    await new Promise(r => setTimeout(r, 0));
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
  };
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
  return { fixture, el, settle, button };
}

describe('MaturityFlow', () => {
  it('keeps an internal draft gated by selected terms and recipient, and does not infer delivery or attribution', async () => {
    const { el, settle, button } = await render();
    (el.querySelector('.opportunity') as HTMLButtonElement).click(); await settle();
    button('Compare ideas').click(); await settle();
    expect(el.textContent).toContain('Previous-day / older');
    expect(button('Prepare handoff').disabled).toBe(true);
    button('Select for handoff').click(); await settle();
    button('Prepare handoff').click(); await settle();
    expect(button('Mark draft prepared').disabled).toBe(true);
    const recipient = el.querySelector('#recipient') as HTMLInputElement;
    recipient.value = 'Demo branch'; recipient.dispatchEvent(new Event('input')); await settle();
    button('Mark draft prepared').click(); await settle();
    expect(el.textContent).toContain('It has not been sent or saved to a shared system');
    button('Review follow-up').click(); await settle();
    expect(el.textContent).toContain('delivery unrecorded');
    expect(el.textContent).toContain('Client history · not attributed to this draft');
    expect(el.textContent).toContain('Unknown');
  });
  it('distinguishes an empty snapshot from a failed request', async () => {
    const { el } = await render('empty');
    expect(el.textContent).toContain('No maturities in this window');
    expect(el.querySelector('[role=alert]')).toBeNull();
  });
  it('provides an explicit retry when the snapshot fails', async () => {
    const { el, button } = await render('error');
    expect(el.querySelector('[role=alert]')?.textContent).toContain('could not be loaded');
    expect(button('Try again').disabled).toBe(false);
  });
});
