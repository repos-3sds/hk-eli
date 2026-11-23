import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { EvidenceBlock } from '../../core/chat/chat.models';
import { AnswerEvidence } from './answer-evidence';

const BLOCK: EvidenceBlock = {
  kind: 'evidence',
  views: [{ view: 'ALL_position_scenario', request: 'vf_deal_status=LIVE', rows: 101, proven: [] }],
  steps: [{ n: 1, name: 'Pre-parse', detail: 'wps=NVDA UW', ms: 8 }],
  assumptions: [],
};

describe('AnswerEvidence', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [AnswerEvidence], providers: [provideZonelessChangeDetection()] }));

  it('starts with "Sources and proofs" and "How this was produced" collapsed, and opens each on click', async () => {
    const f = TestBed.createComponent(AnswerEvidence);
    f.componentRef.setInput('block', BLOCK);
    f.componentRef.setInput('figures', [{ display: '30', measure: 'positions', source: 'ALL_position_scenario' }]);
    await f.whenStable();
    const details = [...(f.nativeElement as HTMLElement).querySelectorAll('details')];
    expect(details.map((d) => d.querySelector('summary')?.textContent)).toEqual([
      expect.stringContaining('Sources and proofs'),
      expect.stringContaining('How this was produced'),
    ]);
    expect(details.map((d) => d.open)).toEqual([false, false]);
    details[0].querySelector('summary')!.click();
    expect(details[0].open).toBe(true);
  });
});
