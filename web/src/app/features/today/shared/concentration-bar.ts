import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { APP_CONFIG } from '../../../core/config/app-config';
import { ConcentrationEffect } from '../../../core/ideas/idea-finder.models';

/**
 * Share of the client's ELI outstanding in one underlying, against the limit (the white tick).
 * With `toPct` it also shows where an idea would take it. Over the limit is said in words, not only in colour.
 */
@Component({
  selector: 'eli-concentration-bar',
  imports: [MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track" role="img" [attr.aria-label]="label()">
      <span class="fill" [style.width.%]="scale(fromPct())"></span>
      @if (toPct() !== null) {
        <span class="add" [style.left.%]="scale(fromPct())" [style.width.%]="scale(toPct()! - fromPct())"></span>
      }
      <span class="limit" [style.left.%]="scale(limitPct())"></span>
    </div>
    @if (namesTip(); as tip) {
      <p class="caption split" tabindex="0" [matTooltip]="tip" matTooltipClass="eli-tip-lines" [attr.aria-label]="tip"><span class="main">{{ short() }}</span><span class="more">+{{ names()!.length - 1 }} {{ names()!.length === 2 ? 'name' : 'names' }}</span></p>
    } @else {
      <p class="caption" [matTooltip]="label()" [matTooltipShowDelay]="400">{{ short() }}</p>
    }
  `,
  host: { '[class.warn]': 'level() === "warn"', '[class.over]': 'level() === "over"' },
  styles: `
    :host { display: block; max-width: 260px; --bar: var(--eli-status-positive); --txt: var(--eli-text-primary); }
    :host(.warn) { --bar: var(--eli-accent-orange); --txt: var(--eli-accent-orange); }
    :host(.over) { --bar: var(--eli-status-negative); --txt: var(--eli-status-negative-text); }
    .track { position: relative; height: 4px; margin: 4px 0; border-radius: 2px; background: var(--eli-bg-row); }
    .fill { position: absolute; inset: 0 auto 0 0; border-radius: 2px; background: var(--bar); }
    .add { position: absolute; top: 0; bottom: 0; background: var(--bar); opacity: 0.5; }
    .limit { position: absolute; top: -4px; width: 2px; height: 12px; background: var(--eli-text-strong); }
    .caption { margin: 0; overflow: hidden; color: var(--txt); font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s); white-space: nowrap; text-overflow: ellipsis; }
    .caption[tabindex] { cursor: help; &:focus-visible { outline: 2px solid var(--eli-accent-orange); outline-offset: 2px; } }
    .caption.split { display: flex; gap: var(--eli-space-3); text-overflow: clip; }
    .main { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .more { flex: none; color: var(--eli-accent-link); text-decoration: underline dotted; text-underline-offset: 3px; }
  `,
})
export class ConcentrationBar {
  private readonly warnRatio = inject(APP_CONFIG).concentrationWarnRatio;
  readonly underlying = input.required<string>();
  readonly fromPct = input.required<number>();
  readonly toPct = input<number | null>(null);
  readonly limitPct = input.required<number>();
  /** Every name in a worst-of, so the hover can list them; the bar shows the highest. */
  readonly names = input<readonly ConcentrationEffect[] | null>(null);

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

  /** One line: "NVDA 12.3% → 14.1% · limit 20%". */
  protected readonly short = computed(() => {
    const to = this.toPct() === null ? '' : ` → ${this.toPct()!.toFixed(1)}%`;
    const over = this.level() === 'over' ? ', over limit' : '';
    // A name the client does not hold yet reads "new", not "0.0%", so it is not taken for missing data.
    const from = this.toPct() !== null && this.fromPct() === 0 ? 'new' : `${this.fromPct().toFixed(1)}%`;
    return `${this.underlying()} ${from}${to} · limit ${this.limitPct()}%${over}`;
  });

  protected readonly namesTip = computed(() => {
    const names = this.names();
    if (!names || names.length < 2) return null;
    const lines = [...names].sort((a, b) => b.toPct - a.toPct).map((n) => `${n.underlying} ${n.fromPct === 0 ? 'not held' : `${n.fromPct.toFixed(1)}%`} → ${n.toPct.toFixed(1)}%`);
    return [`Worst-of on ${names.length} names. Each counts towards its own limit of ${this.limitPct()}%. The highest is shown:`, ...lines].join('\n');
  });

  protected readonly label = computed(() => {
    const from = `${this.underlying()} ${this.fromPct().toFixed(1)}%`;
    const to = this.toPct() === null ? '' : ` → ${this.toPct()!.toFixed(1)}%`;
    const over = this.level() === 'over' ? ' (over limit)' : '';
    return `${from}${to} of book · limit ${this.limitPct()}%${over}`;
  });
}
