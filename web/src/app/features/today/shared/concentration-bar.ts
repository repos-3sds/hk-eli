import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { APP_CONFIG } from '../../../core/config/app-config';

/**
 * Share of the client's ELI outstanding in one underlying, against the limit (the white tick).
 * With `toPct` it also shows where an idea would take it. Over the limit is said in words, not only in colour.
 */
@Component({
  selector: 'eli-concentration-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track" role="img" [attr.aria-label]="label()">
      <span class="fill" [style.width.%]="scale(fromPct())"></span>
      @if (toPct() !== null) {
        <span class="add" [style.left.%]="scale(fromPct())" [style.width.%]="scale(toPct()! - fromPct())"></span>
      }
      <span class="limit" [style.left.%]="scale(limitPct())"></span>
    </div>
    <p class="caption">{{ label() }}</p>
  `,
  host: { '[class.warn]': 'level() === "warn"', '[class.over]': 'level() === "over"' },
  styles: `
    :host { display: block; max-width: 260px; --bar: var(--eli-status-positive); --txt: var(--eli-text-primary); }
    :host(.warn) { --bar: var(--eli-accent-orange); --txt: var(--eli-accent-orange); }
    :host(.over) { --bar: var(--eli-status-negative); --txt: var(--eli-status-negative); }
    .track { position: relative; height: 4px; margin: 4px 0; border-radius: 2px; background: var(--eli-bg-row); }
    .fill { position: absolute; inset: 0 auto 0 0; border-radius: 2px; background: var(--bar); }
    .add { position: absolute; top: 0; bottom: 0; background: var(--bar); opacity: 0.5; }
    .limit { position: absolute; top: -4px; width: 2px; height: 12px; background: var(--eli-text-strong); }
    .caption { margin: 0; color: var(--txt); font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s); }
  `,
})
export class ConcentrationBar {
  private readonly warnRatio = inject(APP_CONFIG).concentrationWarnRatio;
  readonly underlying = input.required<string>();
  readonly fromPct = input.required<number>();
  readonly toPct = input<number | null>(null);
  readonly limitPct = input.required<number>();

  /** The bar spans 0 to limit + 10 points, so the limit tick sits well inside it. */
  private readonly max = computed(() => this.limitPct() * 1.1 + 2);

  protected scale(pct: number): number {
    return Math.max(0, Math.min(100, (pct / this.max()) * 100));
  }

  protected readonly level = computed(() => {
    const value = this.toPct() ?? this.fromPct();
    if (value > this.limitPct()) {
      return 'over';
    }
    return value >= this.limitPct() * this.warnRatio ? 'warn' : 'ok';
  });

  protected readonly label = computed(() => {
    const from = `${this.underlying()} ${this.fromPct().toFixed(1)}%`;
    const to = this.toPct() === null ? '' : ` → ${this.toPct()!.toFixed(1)}%`;
    const over = this.level() === 'over' ? ' (over limit)' : '';
    return `${from}${to} of book · limit ${this.limitPct()}%${over}`;
  });
}
