import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ChartCategory, ChartSpec, PredictResult } from '../../core/chat/chat.models';

const RESULT_ORDER: readonly PredictResult[] = ['KO', 'EXP', 'EXP(Below Strike)', 'EX', 'All'];
const RESULT_LABEL: Record<PredictResult, string> = { KO: 'KO', EXP: 'Expiry', 'EXP(Below Strike)': 'Expiry below strike', EX: 'Exercised', All: '' };
const RESULT_CLASS: Record<PredictResult, string> = { KO: 'r-ko', EXP: 'r-exp', 'EXP(Below Strike)': 'r-bs', EX: 'r-ex', All: 'r-all' };

/** "HKD 1.20bn", "HKD 12.3m", "HKD 45k": the same money format as the pipeline's headline. */
export function hkd(x: number, unit?: string): string {
  if (unit === 'customers') return `${Math.round(x)}`;
  const a = Math.abs(x);
  if (a >= 1e9) return `HKD ${(x / 1e9).toFixed(2)}bn`;
  if (a >= 1e6) return `HKD ${(x / 1e6).toFixed(1)}m`;
  if (a >= 1e3) return `HKD ${(x / 1e3).toFixed(0)}k`;
  return `HKD ${Math.round(x)}`;
}

function resultsIn(results: Iterable<PredictResult>): PredictResult[] {
  const seen = new Set(results);
  return RESULT_ORDER.filter((r) => r !== 'All' && seen.has(r));
}

const W = 560;
const WIDE = 1200;

/**
 * Our answer chart, drawn from the chart spec the pipeline builds from the Tableau view rows: same numbers as
 * the live view, in our tokens and sizes. Bars for rankings and shares, columns for dates, bubbles for MTM.
 */
@Component({
  selector: 'eli-answer-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = spec();
    <figure class="ch" [class]="'ch ch-' + s.kind" [class.compact]="compact()">
      @if (s.title && !compact()) {<figcaption>{{ s.title }}</figcaption>}
      @switch (s.kind) {
        @case ('kpi') {
          <div class="kpi"><span class="kpi-v">{{ money(s.value) }}</span><span class="kpi-l">{{ s.label }}</span></div>
        }
        @case ('hbar') {
          <div class="rows" role="list">
            @for (r of bars(); track r.key) {
              <div class="row" role="listitem" [class.dim]="r.dim" [class.hl]="r.hl">
                <span class="lab" [title]="r.label">{{ r.label }}</span>
                <span class="bar">
                  @for (p of r.parts; track p.result) {
                    <span [class]="p.cls" [style.width.%]="p.pct" [title]="p.title"></span>
                  }
                </span>
                <span class="val">{{ r.value }}@if (r.note) {<small> {{ r.note }}</small>}</span>
              </div>
            }
          </div>
          @if (s.more) {<p class="more">+ {{ s.more }} more in the view</p>}
        }
        @case ('columns') {
          @let c = cols();
          <svg [attr.viewBox]="'0 0 ' + w + ' ' + c.h" role="img" [attr.aria-label]="s.title ?? 'Chart'">
            @for (g of c.grid; track g.y) {
              <line [attr.x1]="c.l" [attr.x2]="w" [attr.y1]="g.y" [attr.y2]="g.y" class="grid" />
              <text [attr.x]="c.l - 6" [attr.y]="g.y + 3" class="axis" text-anchor="end">{{ g.label }}</text>
            }
            @for (r of c.rects; track $index) {
              <rect [attr.x]="r.x" [attr.y]="r.y" [attr.width]="r.w" [attr.height]="r.h" [attr.class]="r.cls"><title>{{ r.title }}</title></rect>
            }
            @for (t of c.ticks; track $index) {
              <text [attr.x]="t.x" [attr.y]="c.h - 6" class="axis" text-anchor="middle">{{ t.label }}</text>
            }
          </svg>
        }
        @case ('bubble') {
          @let b = bubbles();
          <svg [attr.viewBox]="'0 0 ' + w + ' ' + b.h" role="img" [attr.aria-label]="s.title ?? 'Chart'">
            @for (g of b.grid; track g.y) {
              <line [attr.x1]="b.l" [attr.x2]="w - 10" [attr.y1]="g.y" [attr.y2]="g.y" class="grid" />
              <text [attr.x]="b.l - 6" [attr.y]="g.y + 3" class="axis" text-anchor="end">{{ g.label }}</text>
            }
            @for (t of b.ticks; track t.x) {
              <text [attr.x]="t.x" [attr.y]="b.h - 8" class="axis" text-anchor="middle">{{ t.label }}</text>
            }
            @for (d of b.dots; track $index) {
              <circle [attr.cx]="d.cx" [attr.cy]="d.cy" [attr.r]="d.r" [attr.class]="d.cls"><title>{{ d.title }}</title></circle>
              @if (d.text) {<text [attr.x]="d.cx" [attr.y]="d.cy - d.r - 4" class="plab" text-anchor="middle">{{ d.text }}</text>}
            }
          </svg>
        }
      }
      @if (legend().length) {
        <div class="legend">
          @for (r of legend(); track r) {<span><i [class]="cls(r)"></i>{{ label(r) }}</span>}
        </div>
      }
    </figure>
  `,
  styles: `
    :host { display: block; --r-ko: #3d8bfd; --r-exp: #6f7d91; --r-bs: #ef6b4a; --r-ex: #2bb3a3; --r-all: var(--eli-accent-link); }
    .ch { margin: 0; display: flex; flex-direction: column; gap: var(--eli-space-5); }
    figcaption { color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
    .r-ko { background: var(--r-ko); fill: var(--r-ko); } .r-exp { background: var(--r-exp); fill: var(--r-exp); }
    .r-bs { background: var(--r-bs); fill: var(--r-bs); } .r-ex { background: var(--r-ex); fill: var(--r-ex); }
    .r-all { background: var(--r-all); fill: var(--r-all); }
    .kpi { display: flex; flex-direction: column; gap: var(--eli-space-2); }
    .kpi-v { color: var(--eli-text-strong); font-size: 28px; line-height: 34px; font-weight: var(--eli-weight-semibold); font-variant-numeric: tabular-nums; }
    .kpi-l { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .rows { display: flex; flex-direction: column; gap: var(--eli-space-3); }
    .row { display: grid; grid-template-columns: minmax(90px, 160px) minmax(0, 1fr) auto; gap: var(--eli-space-5); align-items: center; font-size: var(--eli-font-size-s); }
    .compact .row { grid-template-columns: minmax(70px, 120px) minmax(0, 1fr) auto; }
    .row.dim { opacity: 0.5; } .row.hl .lab { color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); }
    .lab { color: var(--eli-text-primary); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .bar { display: flex; height: 14px; border-radius: 2px; overflow: hidden; background: var(--eli-bg-canvas); span { height: 100%; } }
    .val { color: var(--eli-text-strong); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; small { color: var(--eli-text-muted); font-size: var(--eli-font-size-xs); } }
    .more { margin: 0; color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    svg { width: 100%; height: auto; display: block; }
    .grid { stroke: var(--eli-separator); stroke-width: 1; }
    .axis { fill: var(--eli-text-muted); font-size: 10px; }
    .plab { fill: var(--eli-text-strong); font-size: 10px; font-weight: 600; }
    circle { fill-opacity: 0.75; stroke: var(--eli-bg-dock); stroke-width: 1; }
    circle.dim { fill-opacity: 0.2; }
    .legend { display: flex; flex-wrap: wrap; gap: var(--eli-space-6); color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs);
      span { display: inline-flex; align-items: center; gap: var(--eli-space-3); } i { width: 10px; height: 10px; border-radius: 2px; } }
  `,
})
export class AnswerChart {
  readonly spec = input.required<ChartSpec>();
  /** A smaller version for Today's tiles: no caption, narrower labels. */
  readonly compact = input(false);
  /** A full-width tile: a wider drawing area, so date columns stay a sensible height. */
  readonly wide = input(false);
  protected get w(): number {
    return this.wide() ? WIDE : W;
  }

  protected money(x: number): string {
    return hkd(x);
  }
  protected cls(r: PredictResult): string {
    return RESULT_CLASS[r];
  }
  protected label(r: PredictResult): string {
    return RESULT_LABEL[r];
  }

  protected readonly legend = computed(() => {
    const s = this.spec();
    if (s.kind === 'hbar') return s.stacked === false ? [] : resultsIn(s.categories.flatMap((c) => c.parts.map((p) => p.result)));
    if (s.kind === 'columns') return resultsIn(s.categories.flatMap((c) => c.parts.map((p) => p.result)));
    if (s.kind === 'bubble') return resultsIn(s.points.map((p) => p.result));
    return [];
  });

  protected readonly bars = computed(() => {
    const s = this.spec();
    if (s.kind !== 'hbar') return [];
    const max = Math.max(...s.categories.map((c) => c.total), 1);
    const hl = new Set(s.highlight ?? []);
    return s.categories.map((c: ChartCategory) => ({
      key: c.key,
      label: c.label,
      dim: hl.size > 0 && !hl.has(c.key),
      hl: hl.has(c.key),
      value: hkd(c.total, s.unit),
      note: c.note,
      parts: c.parts
        .filter((p) => p.value > 0)
        .map((p) => ({
          result: p.result,
          cls: RESULT_CLASS[p.result] ?? 'r-all',
          pct: (100 * p.value) / max,
          title: `${c.label}${p.result !== 'All' ? ' · ' + RESULT_LABEL[p.result] : ''}: ${hkd(p.value, s.unit)}`,
        })),
    }));
  });

  protected readonly cols = computed(() => {
    const s = this.spec();
    const h = 190, l = 44, b = 22, t = 6;
    if (s.kind !== 'columns') return { h, l, grid: [], rects: [], ticks: [] };
    const cats = s.categories;
    const max = Math.max(...cats.map((c) => c.total), 1);
    const w = this.wide() ? WIDE : W;
    const step = (w - l) / Math.max(cats.length, 1);
    const bw = Math.max(2, Math.min(18, step * 0.72));
    const grid = [0, 1, 2, 3].map((g) => ({ y: h - b - ((h - b - t) * g) / 3, label: hkd((max * g) / 3).replace('HKD ', '') }));
    const every = Math.ceil(cats.length / (this.wide() ? 16 : 8));
    const rects: { x: number; y: number; w: number; h: number; cls: string; title: string }[] = [];
    const ticks: { x: number; label: string }[] = [];
    cats.forEach((c, n) => {
      let y = h - b;
      const x = l + n * step + (step - bw) / 2;
      for (const p of c.parts) {
        const hgt = Math.max(0, ((h - b - t) * p.value) / max);
        y -= hgt;
        rects.push({ x, y, w: bw, h: hgt, cls: RESULT_CLASS[p.result] ?? 'r-all', title: `${c.label} · ${RESULT_LABEL[p.result] || p.result}: ${hkd(p.value)}` });
      }
      if (n % every === 0) ticks.push({ x: x + bw / 2, label: c.label });
    });
    return { h, l, grid, rects, ticks };
  });

  protected readonly bubbles = computed(() => {
    const s = this.spec();
    const h = 230, l = 34, b = 26, t = 10, r = 10;
    if (s.kind !== 'bubble' || !s.points.length) return { h, l, grid: [], ticks: [], dots: [] };
    const pts = s.points;
    const x0 = Math.min(...pts.map((p) => p.x)) - 5, x1 = Math.max(...pts.map((p) => p.x)) + 5;
    const y1 = Math.max(...pts.map((p) => p.y), 1) * 1.1;
    const smax = Math.max(...pts.map((p) => p.size), 1);
    const w = this.wide() ? WIDE : W;
    const X = (v: number) => l + ((w - l - r) * (v - x0)) / (x1 - x0);
    const Y = (v: number) => h - b - ((h - b - t) * v) / y1;
    // One WPS on the chart: every bubble is that stock, so labels add nothing.
    const single = new Set(pts.map((p) => p.label)).size <= 1;
    const hl = new Set(single ? [] : (s.highlight ?? []));
    const grid = [0, 1, 2, 3].map((g) => ({ y: Y(Math.round((y1 * g) / 3)), label: String(Math.round((y1 * g) / 3)) }));
    const ticks: { x: number; label: string }[] = [];
    for (let v = Math.ceil(x0 / 10) * 10; v <= x1; v += 10) ticks.push({ x: X(v), label: `${v}%` });
    const sorted = [...pts].sort((a, c) => Number(hl.has(a.label)) - Number(hl.has(c.label)) || c.size - a.size);
    const dots = sorted.map((p) => {
      const on = !hl.size || hl.has(p.label);
      return {
        cx: X(p.x),
        cy: Y(p.y),
        r: 3 + 13 * Math.sqrt(p.size / smax),
        cls: `${RESULT_CLASS[p.result] ?? 'r-all'}${on ? '' : ' dim'}`,
        title: `${p.label} · ${p.x}% · ${RESULT_LABEL[p.result] || p.result} · ${p.y} deals · ${hkd(p.size)}`,
        text: hl.size && hl.has(p.label) ? p.label : '',
      };
    });
    return { h, l, grid, ticks, dots };
  });
}
