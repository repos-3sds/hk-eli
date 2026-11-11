import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { TEST_CONFIG } from '../../../testing/test-config';
import { ConcentrationBar } from './concentration-bar';

function render(inputs: { underlying: string; fromPct: number; toPct?: number; limitPct: number }) {
  TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: TEST_CONFIG }] });
  const fixture = TestBed.createComponent(ConcentrationBar);
  for (const [k, v] of Object.entries(inputs)) {
    fixture.componentRef.setInput(k, v);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ConcentrationBar', () => {
  it('is plain under the warning line', () => {
    const el = render({ underlying: 'AMD', fromPct: 14, limitPct: 25 });
    expect(el.className).not.toMatch(/warn|over/);
    expect(el.textContent).toContain('AMD 14.0% · limit 25%');
  });

  it('warns near the limit', () => {
    expect(render({ underlying: 'NVDA', fromPct: 23.1, limitPct: 25 }).classList).toContain('warn');
  });

  it('says over limit in words when an idea would breach it', () => {
    const el = render({ underlying: 'NVDA', fromPct: 23.1, toPct: 27.9, limitPct: 25 });
    expect(el.classList).toContain('over');
    expect(el.textContent).toContain('NVDA 23.1% → 27.9% · limit 25%, over limit');
  });
});
