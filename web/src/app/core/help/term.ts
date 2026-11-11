import { Directive, inject, input, effect } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';
import { GLOSSARY, TermKey } from './help-content';

/**
 * Hover (or focus) definition for a term a first-time user may not know: `<span eliTerm="ko">KO</span>`.
 * Dotted underline, the glossary definition as a tooltip, and the same words in the Help glossary.
 */
@Directive({
  selector: '[eliTerm]',
  hostDirectives: [MatTooltip],
  host: { class: 'eli-term', tabindex: '0', '[attr.aria-description]': 'text()' },
})
export class Term {
  readonly eliTerm = input.required<TermKey>();
  private readonly tooltip = inject(MatTooltip);
  protected text = () => GLOSSARY[this.eliTerm()]?.definition ?? '';

  constructor() {
    this.tooltip.position = 'above';
    effect(() => {
      this.tooltip.message = this.text();
    });
  }
}
