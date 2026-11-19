import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface Figure {
  readonly display: string;
  readonly measure: string;
  readonly source: string;
}

type Part = { readonly text: string; readonly figure?: Figure };

const TOKEN = /HKD\s?[\d,.]+\s?(?:bn|b|m|k)?|\d[\d,]*(?:\.\d+)?%/gi;

/** "HKD 2.46bn", "HKD 2.46B" and "hkd2.46bn" all compare equal. */
export function normFigure(s: string): string {
  return s.toLowerCase().replace(/\s|,/g, '').replace(/bn$/, 'b');
}

/** Splits answer text into plain runs and figures that match a verified figure from the pipeline. */
export function splitFigures(text: string, figures: readonly Figure[]): Part[] {
  const byNorm = new Map(figures.map((f) => [normFigure(f.display), f]));
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const f = byNorm.get(normFigure(m[0]));
    if (!f) continue;
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], figure: f });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** The answer's words, with every verified figure shown as a chip that names its Tableau source (Ask MIRA's claim chips). */
@Component({
  selector: 'eli-answer-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="text">@for (p of parts(); track $index) {@if (p.figure) {<span class="fig" tabindex="0" [title]="'Verified against Tableau: ' + p.figure.source + ' (' + p.figure.measure + ')'">{{ p.text }}<span class="tick" aria-hidden="true">✓</span></span>} @else {{{ p.text }}}}</p>`,
  styles: `
    .text { margin: 0; color: var(--eli-text-primary); font-size: var(--eli-font-size-m); line-height: 24px; }
    .fig { display: inline-flex; align-items: baseline; gap: 2px; padding: 0 5px; border-radius: 4px; background: rgb(99 171 255 / 14%); color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); white-space: nowrap; cursor: help;
      &:focus-visible { outline: 2px solid var(--eli-focus-ring); } }
    .tick { color: var(--eli-status-positive-text); font-size: 10px; }
  `,
})
export class AnswerText {
  readonly text = input.required<string>();
  readonly figures = input<readonly Figure[]>([]);
  protected readonly parts = computed(() => splitFigures(this.text(), this.figures()));
}
