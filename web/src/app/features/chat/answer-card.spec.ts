import { TestBed } from '@angular/core/testing';
import { MatIconTestingModule } from '@angular/material/icon/testing';
import { provideRouter } from '@angular/router';
import { APP_CONFIG } from '../../core/config/app-config';
import { ChatAnswer } from '../../core/chat/chat.models';
import { TEST_CONFIG } from '../../testing/test-config';
import { AnswerCard } from './answer-card';
import { TodayDataSource } from '../../core/data/today-data-source';
import { MockTodayDataSource } from '../../core/data/mock-today-data-source';

const BASE: ChatAnswer = {
  id: 's1',
  blocks: [{ kind: 'text', text: 'NVDA is 24.63% of all ELI outstanding against a 25% limit.' }],
  followUps: [],
  businessDate: '2026-11-02',
  sources: ['HK ELI skills service (Q1: eli.risk.concentration)'],
  fallback: false,
};

function render(answer: ChatAnswer) {
  TestBed.configureTestingModule({
    imports: [MatIconTestingModule],
    providers: [provideRouter([]), { provide: APP_CONFIG, useValue: TEST_CONFIG }, { provide: TodayDataSource, useClass: MockTodayDataSource }],
  });
  const fixture = TestBed.createComponent(AnswerCard);
  fixture.componentRef.setInput('answer', answer);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('AnswerCard with a skills-service answer', () => {
  it('labels demo data and names the source', () => {
    const el = render({ ...BASE, sourceMode: 'MOCK', status: 'complete' });
    expect(el.querySelector('.mode')?.textContent).toContain('Demo data · not live');
    expect(el.querySelector('.mode')?.classList).toContain('mock');
    expect(el.textContent).toContain('Answered by the HK ELI skills service');
    expect(el.querySelector('.partial')).toBeNull();
  });

  it('flags a partial answer and lists what it does not cover', () => {
    const el = render({ ...BASE, sourceMode: 'MOCK', status: 'partial', limitations: ['Sums every recorded trade, not only this month.'] });
    expect(el.querySelector('.partial')?.textContent).toContain('Partial answer');
    expect(el.querySelector('.notes')?.textContent).toContain('Sums every recorded trade');
  });

  it('shows the evidence behind each figure, formatted by unit', () => {
    const el = render({
      ...BASE,
      sourceMode: 'MOCK',
      evidence: [
        { id: 'E1', label: 'notional · NVDA', value: '147780000', unit: 'USD', asOf: '2026-11-02', sourceMode: 'MOCK', source: 'mock:business hk-eli-seed-1.0' },
        { id: 'E2', label: 'share · NVDA', value: '0.2463', unit: 'ratio', asOf: '2026-11-02', sourceMode: 'MOCK', source: 'mock:business hk-eli-seed-1.0' },
      ],
    });
    expect(el.querySelector('.evidence summary')?.textContent).toContain('Evidence behind these figures (2)');
    const cells = Array.from(el.querySelectorAll('.evidence td.num')).map((td) => td.textContent?.trim());
    expect(cells).toEqual(['USD 147.78m', '24.63%']);
  });

  it('shows none of this for an answer the gateway computed', () => {
    const el = render(BASE);
    expect(el.querySelector('.origin')).toBeNull();
    expect(el.querySelector('.evidence')).toBeNull();
    expect(el.querySelector('.notes')).toBeNull();
  });
});
