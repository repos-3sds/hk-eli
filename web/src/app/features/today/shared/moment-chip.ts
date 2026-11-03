import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MomentType } from '../../../core/models/today.models';

/** A label with the moment type's colour on its left edge. The words carry the meaning; the colour helps scanning. */
@Component({
  selector: 'eli-moment-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'cls()' },
  styles: `
    :host {
      display: inline-flex; align-items: center; gap: var(--eli-space-3); min-height: 24px;
      padding: var(--eli-space-2) var(--eli-space-4); border-left: 3px solid var(--edge);
      border-radius: var(--eli-radius-s); background: var(--eli-bg-row);
      color: var(--eli-text-primary); font-size: var(--eli-font-size-s); font-weight: var(--eli-weight-semibold);
      line-height: var(--eli-line-height-s); white-space: nowrap;
    }
    :host(.maturity) { --edge: var(--eli-moment-maturity); }
    :host(.knockout) { --edge: var(--eli-moment-knockout); }
    :host(.exercised) { --edge: var(--eli-moment-exercised); }
    :host(.idle) { --edge: var(--eli-moment-idle); }
    :host(.rfq) { --edge: var(--eli-moment-rfq); }
  `,
})
export class MomentChip {
  readonly type = input.required<MomentType>();
  protected readonly cls = computed(() => this.type());
}
