/**
 * The CBG Product Manager's console (R21, R25): what clients ask for next to how full the book is, tomorrow's
 * shelf picked before the pricing cut-off, starter packs published to everyone, and the digibank quote funnel.
 * Demo data; the cut-off time is to be confirmed by the desk (open question 2).
 */
import { BOOK_CONCENTRATION, UNMET_DEMAND } from '../data/business.fixture';
import { limitCheck } from '../ideas/idea-finder-logic';
import { LimitState } from '../ideas/idea-finder.models';
import { WAREHOUSE } from '../ideas/idea-warehouse.fixture';

/** When tomorrow's shelf must reach the desk for bulk pricing, HKT. To be confirmed. */
export const PRICING_CUTOFF_HKT = '16:00';

export interface DemandLine {
  readonly underlying: string;
  readonly quotes: number;
  readonly traded: number;
  readonly quoteToTradePct: number;
  readonly digibankShare: number;
  readonly topAsk: string;
  readonly bookSharePct: number | null;
  readonly limitPct: number;
  readonly limitState: LimitState;
}

/** Demand by underlying next to the bank's book concentration, most quoted first. */
export function demandLines(): DemandLine[] {
  const names = [...new Set(UNMET_DEMAND.map((u) => u.underlying))];
  return names
    .map((u) => {
      const rows = UNMET_DEMAND.filter((r) => r.underlying === u);
      const quotes = rows.reduce((s, r) => s + r.quotes, 0);
      const traded = rows.reduce((s, r) => s + r.traded, 0);
      const book = BOOK_CONCENTRATION.find((b) => b.underlying === u);
      const limitPct = book?.limitPct ?? 25;
      const share = book?.sharePct ?? null;
      const state: LimitState = share === null ? 'green' : share >= limitPct - 0.5 ? 'red' : share >= limitPct * 0.85 ? 'amber' : 'green';
      return {
        underlying: u,
        quotes,
        traded,
        quoteToTradePct: quotes ? Math.round((traded / quotes) * 100) : 0,
        digibankShare: quotes ? Math.round((rows.filter((r) => r.channel === 'digibank').reduce((s, r) => s + r.quotes, 0) / quotes) * 100) : 0,
        topAsk: rows.sort((a, b) => b.quotes - a.quotes)[0].topAsk,
        bookSharePct: share,
        limitPct,
        limitState: state,
      };
    })
    .sort((a, b) => b.quotes - a.quotes);
}

export interface ShelfCandidate {
  readonly id: string;
  readonly title: string;
  readonly underlyings: readonly string[];
  readonly terms: string;
  readonly couponPct: number;
  readonly rfqs5d: number;
  readonly limitState: LimitState;
  readonly limitReason: string | null;
}

/** Warehouse ideas as candidates for tomorrow's shelf, busiest first; the book-level limit rule applies. */
export function shelfCandidates(): ShelfCandidate[] {
  return WAREHOUSE.map((w) => {
    const limit = limitCheck(w, null);
    return {
      id: w.id,
      title: `${w.underlyings.join(' / ')}${w.underlyings.length > 1 ? ' worst-of' : ''} · ${w.tenorMonths}M`,
      underlyings: w.underlyings,
      terms: `KI ${w.kiPct}% · strike ${w.strikePct}% · today ${w.couponPct}%`,
      couponPct: w.couponPct,
      rfqs5d: w.rfqs5d,
      limitState: limit.state,
      limitReason: limit.reason,
    };
  }).sort((a, b) => b.rfqs5d - a.rfqs5d);
}

export type CutoffState = { readonly passed: boolean; readonly minutesLeft: number; readonly text: string };

/** Minutes to the cut-off in HKT, and the words for it. After the cut-off, picks go to the next business day. */
export function cutoffStatus(now: Date, cutoff = PRICING_CUTOFF_HKT, timeZone = 'Asia/Hong_Kong'): CutoffState {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')!.value);
  const m = Number(parts.find((p) => p.type === 'minute')!.value);
  const [ch, cm] = cutoff.split(':').map(Number);
  const left = ch * 60 + cm - (h * 60 + m);
  if (left <= 0) {
    return { passed: true, minutesLeft: 0, text: `Cut-off ${cutoff} HKT has passed. Picks now go to the desk for the next business day.` };
  }
  const span = left >= 60 ? `${Math.floor(left / 60)}h ${left % 60}m` : `${left}m`;
  return { passed: false, minutesLeft: left, text: `Cut-off ${cutoff} HKT, in ${span}.` };
}

export interface FunnelStage {
  readonly stage: string;
  readonly count: number;
}

/** Digibank self-directed quote funnel this week. */
export const DIGIBANK_FUNNEL: readonly FunnelStage[] = [
  { stage: 'Opened the ELI quote screen', count: 4120 },
  { stage: 'Set the parameters', count: 2310 },
  { stage: 'Saw a price', count: 1980 },
  { stage: 'Started an order', count: 540 },
  { stage: 'Traded', count: 380 },
];

export interface ParameterSet {
  readonly set: string;
  readonly priced: number;
  readonly traded: number;
  /** Where most of them stopped, read from the quote log. */
  readonly dropOff: string;
}

export const DIGIBANK_PARAMETER_SETS: readonly ParameterSet[] = [
  { set: 'NVDA · 3M · KI 70%', priced: 412, traded: 31, dropOff: 'Saw a price: coupon came back under 20%' },
  { set: 'TSLA · 3M · KI 65%', priced: 301, traded: 22, dropOff: 'Saw a price: coupon came back under 24%' },
  { set: '0700.HK · 6M · KI 75%', priced: 188, traded: 18, dropOff: 'Started an order: minimum ticket USD 50k' },
  { set: 'AAPL · 3M · KI 72%', priced: 160, traded: 26, dropOff: 'Set the parameters: KI below 70% not offered' },
  { set: 'AMD · 6M · KI 65%', priced: 122, traded: 15, dropOff: 'Saw a price' },
];

/** Biggest drop between two stages, for the funnel headline. */
export function biggestDrop(stages: readonly FunnelStage[]): { from: string; to: string; lostPct: number } {
  let best = { from: '', to: '', lostPct: 0 };
  for (let i = 1; i < stages.length; i++) {
    const lost = Math.round((1 - stages[i].count / stages[i - 1].count) * 100);
    if (lost > best.lostPct) best = { from: stages[i - 1].stage, to: stages[i].stage, lostPct: lost };
  }
  return best;
}
