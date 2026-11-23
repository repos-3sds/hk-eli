import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { VizFilterCard } from './tableau-viz';

/** A filter change: the values to keep, or null to clear the filter (all values). */
export interface VizFilterChange {
  readonly field: string;
  readonly values: readonly string[] | null;
}

/** The "matures within N days" flags (in_n7 ... in_n90, W1) read as one card, as a user thinks of them. */
const FLAG = /^in[_ ]?n(\d+)$/i;
export function flagDays(c: VizFilterCard): number | null {
  const m = FLAG.exec(c.field) ?? FLAG.exec(c.caption);
  return m ? Number(m[1]) : null;
}

export function summary(c: VizFilterCard): string {
  const a = c.applied;
  if (a === null || (a.length === c.values.length && c.values.every((v) => a.includes(v)))) return 'All';
  if (a.length === 0) return 'None';
  if (a.length === 1) return a[0];
  return `${a.length} of ${c.values.length}`;
}

/**
 * Tableau-style quick filters for one embedded view: a card per published filter, a multi-select list with
 * (All) and a search box, applied at once, and Reset back to the answer's own filters.
 */
@Component({
  selector: 'eli-viz-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'outside($event)', '(keydown.escape)': 'open.set(null)' },
  template: `
    <div class="bar" role="group" [attr.aria-label]="'Filters on ' + view()">
      <span class="lead">Filters</span>
      @if (flags(); as f) {
        <label class="card sel">
          <span class="cap">Matures within</span>
          <select [disabled]="busy()" (change)="pickFlag($any($event.target).value)">
            <option value="" [selected]="f.current === ''">Any time</option>
            @for (d of f.days; track d) {<option [value]="d" [selected]="f.current === '' + d">{{ d }} days</option>}
          </select>
        </label>
      }
      @for (c of lists(); track c.field) {
        <div class="slot">
          <button type="button" class="card" [class.on]="summaryOf(c) !== 'All'" [disabled]="busy()"
                  [attr.aria-expanded]="open() === c.field" (click)="toggle(c.field)">
            <span class="cap">{{ c.caption }}</span><span class="val">{{ summaryOf(c) }}</span><span class="caret" aria-hidden="true">▾</span>
          </button>
          @if (open() === c.field) {
            <div class="menu" role="dialog" [attr.aria-label]="c.caption + ' filter'">
              @if (c.values.length > 8) {
                <input class="find" type="search" placeholder="Search" [attr.aria-label]="'Search ' + c.caption"
                       [value]="query()" (input)="query.set($any($event.target).value)" />
              }
              <label class="opt all"><input type="checkbox" [checked]="summaryOf(c) === 'All'" (change)="all(c, $any($event.target).checked)" />(All)</label>
              <div class="opts">
                @for (v of shown(c); track v) {
                  <label class="opt"><input type="checkbox" [checked]="isOn(c, v)" (change)="tick(c, v, $any($event.target).checked)" />{{ v }}</label>
                } @empty {<span class="none">No match</span>}
              </div>
            </div>
          }
        </div>
      }
      @if (changed()) {
        <button type="button" class="reset" [disabled]="busy()" (click)="reset.emit()">Reset filters</button>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--eli-space-3); padding: var(--eli-space-3) 0 var(--eli-space-4); }
    .lead { color: var(--eli-text-muted); font-size: var(--eli-font-size-xs); text-transform: uppercase; letter-spacing: .04em; margin-right: var(--eli-space-2); }
    .slot { position: relative; }
    .card { display: inline-flex; align-items: center; gap: var(--eli-space-3); height: 28px; padding: 0 var(--eli-space-5); max-width: 260px;
      border: 1px solid var(--eli-border); border-radius: var(--eli-radius-s); background: var(--eli-bg-input); color: var(--eli-text-primary);
      font: inherit; font-size: var(--eli-font-size-xs); cursor: pointer;
      &:hover:not(:disabled) { border-color: var(--eli-accent-link); }
      &:focus-visible, &:focus-within { outline: 2px solid var(--eli-focus-ring); outline-offset: 1px; }
      &:disabled { opacity: .6; cursor: progress; }
      &.on { border-color: var(--eli-accent-blue); } }
    .cap { color: var(--eli-text-muted); white-space: nowrap; }
    .val { color: var(--eli-text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .caret { color: var(--eli-text-muted); font-size: 10px; }
    .sel select { background: transparent; border: 0; color: var(--eli-text-strong); font: inherit; outline: none; cursor: pointer;
      option { background: var(--eli-bg-surface); } }
    .menu { position: absolute; z-index: 5; top: calc(100% + 4px); left: 0; min-width: 220px; max-width: 320px; padding: var(--eli-space-4);
      border: 1px solid var(--eli-border); border-radius: var(--eli-radius-s); background: var(--eli-bg-surface); box-shadow: var(--eli-shadow-overlay); }
    .find { width: 100%; box-sizing: border-box; height: 28px; margin-bottom: var(--eli-space-3); padding: 0 var(--eli-space-4);
      border: 1px solid var(--eli-border); border-radius: var(--eli-radius-s); background: var(--eli-bg-input); color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-xs); }
    .opts { max-height: 240px; overflow-y: auto; }
    .opt { display: flex; align-items: center; gap: var(--eli-space-3); padding: 3px var(--eli-space-2); color: var(--eli-text-primary); font-size: var(--eli-font-size-xs); cursor: pointer;
      &:hover { background: var(--eli-bg-row); } input { accent-color: var(--eli-accent-blue); margin: 0; } }
    .all { border-bottom: 1px solid var(--eli-separator); margin-bottom: var(--eli-space-2); padding-bottom: var(--eli-space-3); }
    .none { display: block; padding: var(--eli-space-3); color: var(--eli-text-muted); font-size: var(--eli-font-size-xs); }
    .reset { height: 28px; padding: 0 var(--eli-space-5); border: 0; background: transparent; color: var(--eli-accent-link); font: inherit; font-size: var(--eli-font-size-xs); cursor: pointer;
      &:hover:not(:disabled) { text-decoration: underline; } &:focus-visible { outline: 2px solid var(--eli-focus-ring); } &:disabled { opacity: .6; } }
  `,
})
export class VizFilters {
  readonly cards = input.required<readonly VizFilterCard[]>();
  readonly view = input('');
  readonly busy = input(false);
  /** Some filter differs from the answer's own, so Reset is offered. */
  readonly changed = input(false);
  readonly change = output<VizFilterChange[]>();
  readonly reset = output<void>();

  private readonly el = inject(ElementRef<HTMLElement>);
  protected readonly open = signal<string | null>(null);
  protected readonly query = signal('');

  protected readonly lists = computed(() => this.cards().filter((c) => flagDays(c) === null));
  protected readonly flags = computed(() => {
    const f = this.cards().map((c) => ({ c, d: flagDays(c) })).filter((x): x is { c: VizFilterCard; d: number } => x.d !== null);
    if (!f.length) return null;
    f.sort((a, b) => a.d - b.d);
    const on = f.find((x) => x.c.applied?.length === 1 && x.c.applied[0] === 'TRUE');
    return { days: f.map((x) => x.d), current: on ? String(on.d) : '', cards: f };
  });

  protected summaryOf = summary;

  protected isOn(c: VizFilterCard, v: string): boolean {
    return c.applied === null || c.applied.includes(v);
  }

  protected shown(c: VizFilterCard): readonly string[] {
    const q = this.query().trim().toLowerCase();
    return q ? c.values.filter((v) => v.toLowerCase().includes(q)) : c.values;
  }

  protected toggle(field: string): void {
    this.query.set('');
    this.open.update((o) => (o === field ? null : field));
  }

  protected all(c: VizFilterCard, on: boolean): void {
    this.change.emit([{ field: c.field, values: on ? null : [] }]);
  }

  protected tick(c: VizFilterCard, v: string, on: boolean): void {
    const cur = c.applied ?? c.values;
    const next = on ? c.values.filter((x) => x === v || cur.includes(x)) : cur.filter((x) => x !== v);
    this.change.emit([{ field: c.field, values: next.length === c.values.length ? null : next }]);
  }

  /** One window at a time: tick its flag, clear the others. */
  protected pickFlag(days: string): void {
    const f = this.flags();
    if (!f) return;
    this.change.emit(f.cards.map((x) => ({ field: x.c.field, values: String(x.d) === days ? ['TRUE'] : null })));
  }

  protected outside(e: Event): void {
    if (this.open() && !e.composedPath().includes(this.el.nativeElement)) this.open.set(null);
  }
}
