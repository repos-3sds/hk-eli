import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { ScenarioBreakdown, ScenarioSpec, ScenarioStatus, ScenarioStep } from '../../core/chat/chat.models';

export const STATUS_ORDER: readonly ScenarioStatus[] = ['KO', 'EXP', 'EXP(Below Strike)', 'EX'];
const STATUS_LABEL: Record<ScenarioStatus, string> = { KO: 'KO', EXP: 'Expiry', 'EXP(Below Strike)': 'Below strike', EX: 'Exercised' };
const STATUS_CLASS: Record<ScenarioStatus, string> = { KO: 'r-ko', EXP: 'r-exp', 'EXP(Below Strike)': 'r-bs', EX: 'r-ex' };

/** The agent's money format (poc svg.money), so the tiles read the same as the words next to them. */
export function money(x: number): string {
  const a = Math.abs(x);
  if (a >= 1e9) return `HKD ${(x / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `HKD ${(x / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `HKD ${(x / 1e3).toFixed(0)}K`;
  return `HKD ${Math.round(x)}`;
}

/** "−10%" for a move, "90%" for a market spot. */
export function levelLabel(spec: ScenarioSpec, move: number): string {
  const pct = Math.round(move * 100);
  if (spec.control.unit === 'spot') return `${100 + pct}%`;
  return pct === 0 ? '0%' : `${pct < 0 ? '−' : '+'}${Math.abs(pct)}%`;
}

/** Split the words so figures can be emphasised; nothing is added or changed. */
export function emphasise(text: string): { t: string; num: boolean }[] {
  return text.split(/(HKD [\d,.]+[KMB]?|\d[\d,.]*%?)/).filter(Boolean).map((t) => ({ t, num: /^(HKD |\d)/.test(t) }));
}

type Breakdown = 'segment' | 'district' | 'branch';
export type ScenarioTab = 'changes' | 'positions' | 'views' | 'details';

let uidSeq = 0;
const CW = 600;
const CH = 170;
const CL = 58;

/**
 * The what-if card. The agent sends every slider step already worked out (counts, notional, transitions,
 * breakdowns, words); moving the slider only picks a step, so the words, tiles and charts change together and
 * never drift from the figures. The level is also sent out, so the embedded Tableau views follow it.
 */
@Component({
  selector: 'eli-scenario-card',
  imports: [MatIconModule, MatSliderModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scenario-card.html',
  styleUrl: './scenario-card.scss',
})
export class ScenarioCard {
  readonly spec = input.required<ScenarioSpec>();
  /** How many Tableau views are projected into the views tab (0 hides the tab). */
  readonly viewCount = input(0);
  /** Whether the answer's sources, notes and numbers are projected into a details tab. */
  readonly hasDetails = input(false);
  /** The level the user picked (a move such as -0.15), for the Tableau views beside it. */
  readonly level = output<number>();

  protected readonly uid = `eli-sc-${++uidSeq}`;
  protected readonly index = signal(0);
  protected readonly breakdown = signal<Breakdown>('segment');
  protected readonly tab = signal<ScenarioTab>('changes');
  protected readonly statuses = STATUS_ORDER;
  protected readonly cw = CW;
  protected readonly ch = CH;

  constructor() {
    // Start at the level the question asked for.
    effect(() => this.index.set(this.spec().asked_index));
  }

  protected readonly step = computed<ScenarioStep>(() => this.spec().grid[this.index()]);
  protected readonly move = computed(() => this.spec().moves[this.index()]);
  protected readonly asked = computed(() => this.index() === this.spec().asked_index);
  protected readonly words = computed(() => emphasise(this.step().narrative));
  protected readonly last = computed(() => this.spec().moves.length - 1);
  protected readonly title = computed(() => {
    const s = this.spec();
    return s.kind === 'market' ? `Market spot ${levelLabel(s, this.move())}` : `${s.ticker} ${levelLabel(s, this.move())}`;
  });
  protected readonly presets = computed(() => {
    const s = this.spec();
    const want = new Set([0, 5, 10, 20, 30, 50, 75, 100, Math.round(Math.abs(s.move) * 100)]);
    return s.moves
      .map((m, i) => ({ i, m, label: i === 0 ? 'Today' : levelLabel(s, m), asked: i === s.asked_index }))
      .filter((p) => want.has(Math.round(Math.abs(p.m) * 100)));
  });

  /** The overview (tiles and chart) always shows; the detail sections sit below it behind tabs. */
  protected readonly tabs = computed(() => {
    const st = this.step();
    const out: { id: ScenarioTab; label: string; count: number | null }[] = [
      { id: 'changes', label: 'What changes', count: st.changed.positions },
      { id: 'positions', label: 'Positions vs barriers', count: this.spec().ladder.length || null },
    ];
    if (this.viewCount() > 0) out.push({ id: 'views', label: 'Tableau views', count: this.viewCount() });
    if (this.hasDetails()) out.push({ id: 'details', label: 'Sources and notes', count: null });
    return out;
  });

  protected onTabKey(ev: KeyboardEvent): void {
    const ids = this.tabs().map((t) => t.id);
    const i = ids.indexOf(this.tab());
    const next = ev.key === 'ArrowRight' ? (i + 1) % ids.length : ev.key === 'ArrowLeft' ? (i - 1 + ids.length) % ids.length
      : ev.key === 'Home' ? 0 : ev.key === 'End' ? ids.length - 1 : -1;
    if (next < 0) return;
    ev.preventDefault();
    this.tab.set(ids[next]);
    (ev.currentTarget as HTMLElement).querySelector<HTMLElement>(`#${this.uid}-tab-${ids[next]}`)?.focus();
  }

  protected readonly tiles = computed(() => {
    const s = this.spec();
    const st = this.step();
    const u = s.universe;
    const pool = s.kind === 'market' ? 'live' : `holding ${s.ticker}`;
    return [
      { label: 'Change predicted status', value: `${st.changed.positions}`, sub: `of ${u.positions} positions ${pool} · ${st.changed.deals} deals` },
      { label: 'Notional affected', value: money(st.changed.hkd), sub: `${(st.changed.share * 100).toFixed(1)}% of ${money(u.hkd)}` },
      { label: 'Portfolios (customers)', value: `${st.changed.customers}`, sub: `of ${u.customers} customers ${pool}` },
      { label: 'Knock-in', value: `${st.knock_in_new.positions} new`, sub: `${st.near_ki.positions} more within ${s.near_ki_points} pts of KI`,
        warn: st.knock_in_new.positions > 0 },
    ];
  });

  /** Stacked columns: exposed notional by predicted result at every step. The selected step is full colour. */
  protected readonly columns = computed(() => {
    const s = this.spec();
    const max = Math.max(...s.grid.map((g) => STATUS_ORDER.reduce((a, k) => a + g.statuses[k].hkd, 0)), 1);
    const n = s.grid.length;
    const slot = (CW - CL - 4) / n;
    const bw = Math.max(4, slot - 3);
    const plotH = CH - 30;
    const bars = s.grid.map((g, i) => {
      let y = CH - 22;
      const x = CL + i * slot + (slot - bw) / 2;
      const parts = STATUS_ORDER.filter((k) => g.statuses[k].hkd > 0).map((k) => {
        const h = (plotH * g.statuses[k].hkd) / max;
        y -= h;
        return { k, cls: STATUS_CLASS[k], x, y, w: bw, h, title: `${g.label}: ${STATUS_LABEL[k]} ${money(g.statuses[k].hkd)}, ${g.statuses[k].positions} positions` };
      });
      return { i, x, w: bw, parts };
    });
    const every = n > 41 ? 10 : 5; // 101 steps: a label every 10 points, so they never touch
    const ticks = s.moves
      .map((m, i) => ({ i, m }))
      .filter(({ m }) => Math.round(Math.abs(m) * 100) % every === 0)
      .map(({ m, i }) => ({ x: CL + i * slot + slot / 2, label: levelLabel(s, m) }))
      // the end labels sit inside the chart, so "−100%" is never cut off at the edge
      .map((t) => ({ ...t, anchor: t.x > CW - 24 ? 'end' : 'middle', x: t.x > CW - 24 ? CW : t.x }));
    const grid = [0, 0.5, 1].map((f) => ({ y: CH - 22 - plotH * f, label: money(max * f).replace('HKD ', '') }));
    return { bars, ticks, grid };
  });

  protected readonly legend = computed(() => STATUS_ORDER.map((k) => ({ k, cls: STATUS_CLASS[k], label: STATUS_LABEL[k] })));

  protected readonly rows = computed<{ r: ScenarioBreakdown; pct: number; track: number }[]>(() => {
    const st = this.step();
    const list = this.breakdown() === 'segment' ? st.by_segment : this.breakdown() === 'district' ? st.by_district : st.by_branch;
    const max = Math.max(...list.map((r) => r.exposed_hkd), 1);
    return list.slice(0, 8).map((r) => ({ r, pct: (100 * r.changed_hkd) / max, track: (100 * r.exposed_hkd) / max }));
  });

  /** One scale for the whole slider range (it never shifts while sliding): every level any step reaches, in 25s. */
  protected readonly ladderScale = computed(() => {
    const vals = this.spec().ladder.flatMap((r) => [r.ki, r.strike, r.ko, r.now.mtm, ...r.path.map((p) => p[0])]);
    const lo = Math.max(0, Math.min(40, Math.floor(Math.min(...vals, 100) / 25) * 25));
    const hi = Math.max(140, Math.ceil(Math.max(...vals, 100) / 25) * 25);
    const every = hi - lo > 150 ? 50 : 25;
    const ticks = [];
    for (let v = Math.ceil(lo / every) * every; v <= hi; v += every) ticks.push({ v, x: ((v - lo) / (hi - lo)) * 100 });
    return { lo, hi, ticks };
  });

  /** The positions that move most, each against its own KI, strike and KO, from today to the picked level. */
  protected readonly ladder = computed(() => {
    const s = this.spec();
    const i = this.index();
    const { lo, hi } = this.ladderScale();
    const x = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
    return s.ladder.map((r) => {
      const [sim, status, wps] = r.path[i];
      return {
        r, sim, status, wps,
        ki: x(r.ki), strike: x(r.strike), ko: x(r.ko), now: x(r.now.mtm), at: x(sim),
        cls: STATUS_CLASS[status], nowCls: STATUS_CLASS[r.now.status], changed: status !== r.now.status,
        label: `${r.cif_id} · ${r.segment}${r.branch ? ' · ' + r.branch : ''}`,
        basket: r.basket.join(' + '),
      };
    });
  });

  protected select(i: number): void {
    const n = Math.max(0, Math.min(this.last(), i));
    this.index.set(n);
    this.level.emit(this.spec().moves[n]);
  }

  protected onSlider(v: number): void {
    this.select(v);
  }

  /** The number in the % box: the size of the move (10 for −10%), or the market spot (90 for 90%). */
  protected levelNumber(i: number): number {
    const m = this.spec().moves[i];
    return this.spec().control.unit === 'spot' ? Math.round((1 + m) * 100) : Math.abs(Math.round(m * 100));
  }
  protected readonly inputMin = computed(() => Math.min(this.levelNumber(0), this.levelNumber(this.last())));
  protected readonly inputMax = computed(() => Math.max(this.levelNumber(0), this.levelNumber(this.last())));
  /** "−" before the box for a fall, "+" for a rise; none for market spot, which is a level, not a move. */
  protected readonly inputSign = computed(() => {
    const s = this.spec();
    return s.control.unit === 'spot' ? '' : s.moves[this.last()] < 0 ? '−' : '+';
  });

  /** A typed %: the nearest slider step (1 point apart), kept inside the range. A sign typed with a move is ignored. */
  protected onTyped(box: HTMLInputElement): void {
    const raw = parseFloat(box.value.replace('−', '-'));
    if (Number.isFinite(raw)) {
      const v = this.spec().control.unit === 'spot' ? raw : Math.abs(raw);
      const moves = this.spec().moves;
      let best = 0;
      moves.forEach((_m, k) => {
        if (Math.abs(this.levelNumber(k) - v) < Math.abs(this.levelNumber(best) - v)) best = k;
      });
      this.select(best);
    }
    box.value = String(this.levelNumber(this.index())); // show what was applied, also when the same step or a bad value
  }

  protected statusLabel(k: ScenarioStatus): string {
    return STATUS_LABEL[k];
  }
  protected statusClass(k: ScenarioStatus): string {
    return STATUS_CLASS[k];
  }
  protected money(x: number): string {
    return money(x);
  }
  protected levelText(i: number): string {
    return levelLabel(this.spec(), this.spec().moves[i]);
  }
}
