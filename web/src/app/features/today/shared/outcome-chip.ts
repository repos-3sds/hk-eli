import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OUTCOME_LABELS, OutcomeStatus } from '../../../core/models/today.models';

/** Lead outcome read from the blotter: Traded, Window closed, Open. */
@Component({
  selector: 'eli-outcome-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ text() }}`,
  host: { '[class]': 'status()' },
  styles: `
    :host {
      display: inline-flex; align-items: center; height: 22px; padding: var(--eli-space-1) var(--eli-space-4);
      border: 1px solid var(--c); border-radius: var(--eli-radius-pill); color: var(--c);
      font-size: var(--eli-font-size-s); font-weight: var(--eli-weight-semibold); white-space: nowrap;
      --c: var(--eli-text-muted-2);
    }
    :host(.traded) { --c: var(--eli-status-positive); }
    :host(.window-closed), :host(.not-traded) { --c: var(--eli-text-muted); }
  `,
})
export class OutcomeChip {
  readonly status = input.required<OutcomeStatus>();
  protected readonly text = computed(() => OUTCOME_LABELS[this.status()]);
}
