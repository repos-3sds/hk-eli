/**
 * Fictional daily idea warehouse: pre-priced ELIs with the facts the signals read.
 * Every figure is invented for the demo.
 */
import { IdeaSignal, SignalGroup, StarterPack } from './idea-finder.models';

export interface WarehouseIdea {
  readonly id: string;
  readonly underlyings: readonly string[];
  readonly tenorMonths: number;
  readonly couponPct: number;
  readonly kiPct: number;
  readonly strikePct: number;
  /** Coupon change against last week, in basis points. */
  readonly couponChangeBp: number;
  /** Implied volatility rank over a year, 0 to 100. */
  readonly volRank: number;
  /** HK RMs who traded it this week. */
  readonly rmTrades: number;
  /** RFQs in the last 5 business days. */
  readonly rfqs5d: number;
  /** Share of RFQs that traded, last 30 days. */
  readonly fillRatePct: number;
  /** Correlation between the underlyings (1 for a single stock). */
  readonly correlation: number;
  /** Business days to the next earnings date of any underlying. */
  readonly earningsInDays: number;
}

export const WAREHOUSE: readonly WarehouseIdea[] = [
  { id: 'w-01', underlyings: ['AMD', 'META'], tenorMonths: 6, couponPct: 17.4, kiPct: 65, strikePct: 90, couponChangeBp: 60, volRank: 74, rmTrades: 5, rfqs5d: 14, fillRatePct: 64, correlation: 0.62, earningsInDays: 58 },
  { id: 'w-02', underlyings: ['MSFT', 'GOOGL'], tenorMonths: 6, couponPct: 14.1, kiPct: 70, strikePct: 92, couponChangeBp: 20, volRank: 48, rmTrades: 3, rfqs5d: 9, fillRatePct: 71, correlation: 0.78, earningsInDays: 61 },
  { id: 'w-03', underlyings: ['AVGO'], tenorMonths: 3, couponPct: 15.8, kiPct: 68, strikePct: 90, couponChangeBp: 85, volRank: 81, rmTrades: 2, rfqs5d: 11, fillRatePct: 55, correlation: 1, earningsInDays: 26 },
  { id: 'w-04', underlyings: ['NVDA', 'AMD'], tenorMonths: 6, couponPct: 19.6, kiPct: 62, strikePct: 88, couponChangeBp: 40, volRank: 79, rmTrades: 7, rfqs5d: 22, fillRatePct: 68, correlation: 0.81, earningsInDays: 14 },
  { id: 'w-05', underlyings: ['AAPL'], tenorMonths: 3, couponPct: 9.8, kiPct: 75, strikePct: 95, couponChangeBp: -10, volRank: 32, rmTrades: 4, rfqs5d: 8, fillRatePct: 77, correlation: 1, earningsInDays: 63 },
  { id: 'w-06', underlyings: ['TSLA'], tenorMonths: 3, couponPct: 24.5, kiPct: 60, strikePct: 85, couponChangeBp: 120, volRank: 90, rmTrades: 6, rfqs5d: 19, fillRatePct: 49, correlation: 1, earningsInDays: 40 },
  { id: 'w-07', underlyings: ['AMZN', 'MSFT'], tenorMonths: 9, couponPct: 13.2, kiPct: 65, strikePct: 90, couponChangeBp: 15, volRank: 44, rmTrades: 2, rfqs5d: 6, fillRatePct: 73, correlation: 0.74, earningsInDays: 70 },
  { id: 'w-08', underlyings: ['META'], tenorMonths: 6, couponPct: 16.0, kiPct: 63, strikePct: 90, couponChangeBp: 55, volRank: 69, rmTrades: 3, rfqs5d: 12, fillRatePct: 61, correlation: 1, earningsInDays: 57 },
  { id: 'w-09', underlyings: ['TSM', 'AVGO'], tenorMonths: 6, couponPct: 18.2, kiPct: 64, strikePct: 88, couponChangeBp: 70, volRank: 77, rmTrades: 4, rfqs5d: 15, fillRatePct: 58, correlation: 0.71, earningsInDays: 49 },
  { id: 'w-10', underlyings: ['GOOGL'], tenorMonths: 9, couponPct: 11.4, kiPct: 65, strikePct: 92, couponChangeBp: 5, volRank: 38, rmTrades: 1, rfqs5d: 4, fillRatePct: 80, correlation: 1, earningsInDays: 66 },
  { id: 'w-11', underlyings: ['NFLX', 'META'], tenorMonths: 6, couponPct: 17.9, kiPct: 62, strikePct: 88, couponChangeBp: 35, volRank: 72, rmTrades: 2, rfqs5d: 7, fillRatePct: 52, correlation: 0.55, earningsInDays: 72 },
  { id: 'w-12', underlyings: ['JPM', 'GS'], tenorMonths: 6, couponPct: 12.6, kiPct: 70, strikePct: 93, couponChangeBp: 25, volRank: 41, rmTrades: 3, rfqs5d: 10, fillRatePct: 75, correlation: 0.86, earningsInDays: 52 },
  { id: 'w-13', underlyings: ['AAPL', 'MSFT'], tenorMonths: 12, couponPct: 10.9, kiPct: 60, strikePct: 90, couponChangeBp: 0, volRank: 30, rmTrades: 2, rfqs5d: 5, fillRatePct: 82, correlation: 0.8, earningsInDays: 63 },
  { id: 'w-14', underlyings: ['NVDA'], tenorMonths: 3, couponPct: 21.3, kiPct: 65, strikePct: 88, couponChangeBp: 90, volRank: 85, rmTrades: 8, rfqs5d: 25, fillRatePct: 70, correlation: 1, earningsInDays: 14 },
  { id: 'w-15', underlyings: ['AMD'], tenorMonths: 6, couponPct: 18.8, kiPct: 62, strikePct: 88, couponChangeBp: 45, volRank: 76, rmTrades: 4, rfqs5d: 13, fillRatePct: 60, correlation: 1, earningsInDays: 79 },
  { id: 'w-16', underlyings: ['BABA', 'TCEHY'], tenorMonths: 6, couponPct: 20.1, kiPct: 60, strikePct: 85, couponChangeBp: -30, volRank: 66, rmTrades: 1, rfqs5d: 3, fillRatePct: 38, correlation: 0.69, earningsInDays: 18 },
];

export const SIGNAL_GROUPS: readonly SignalGroup[] = [
  { id: 'coupon', question: 'Is the coupon worth it?' },
  { id: 'desk', question: 'What are other RMs and clients doing?' },
  { id: 'protection', question: 'How much protection is there?' },
  { id: 'client', question: 'Does it fit this client?' },
];

export const IDEA_SIGNALS: readonly IdeaSignal[] = [
  { id: 'top-coupon', group: 'coupon', name: 'Top-quartile coupon', rule: 'Coupon is in the top 25% of today’s warehouse.', why: 'The client gets paid well for the risk compared with what else is on offer today.', caveat: 'A high coupon usually means more risk, not a bargain.', source: 'Idea warehouse, 18:00 pricing', needsClient: false },
  { id: 'coupon-up', group: 'coupon', name: 'Coupon up this week', rule: 'Coupon is at least 0.5 points higher than last week.', why: 'A reason to call now: the same idea pays more than it did.', caveat: 'It may be higher because volatility rose.', source: 'Idea warehouse, week-on-week', needsClient: false },
  { id: 'vol-rich', group: 'coupon', name: 'Volatility is rich', rule: 'Implied volatility is in the top 30% of its one-year range.', why: 'Selling volatility pays more when it is high, which lifts the coupon.', caveat: 'High volatility can stay high; the knock-in is more likely.', source: 'Fixings, implied vol', needsClient: false },
  { id: 'rm-traded', group: 'desk', name: 'Other RMs traded it', rule: 'At least 3 HK RMs traded it this week.', why: 'Peers found clients who wanted it; easier to explain.', caveat: 'Popular is not the same as suitable for this client.', source: 'Blotter, this week', needsClient: false },
  { id: 'rfq-busy', group: 'desk', name: 'Busy in RFQs', rule: 'At least 10 RFQs in the last 5 business days.', why: 'The desk is pricing it often, so a live quote comes back fast.', caveat: 'Many RFQs can also mean many clients said no.', source: 'RFQ log, 5 days', needsClient: false },
  { id: 'fills', group: 'desk', name: 'Usually trades', rule: 'At least 60% of its RFQs traded in the last 30 days.', why: 'Clients who see it tend to say yes.', caveat: 'Small samples swing; check the RFQ count too.', source: 'RFQ log, 30 days', needsClient: false },
  { id: 'deep-ki', group: 'protection', name: 'Deep knock-in', rule: 'Knock-in at 65% of spot or lower.', why: 'The stock can fall a third or more before the capital is at risk.', caveat: 'Deep knock-ins come with lower coupons.', source: 'Idea warehouse, terms', needsClient: false },
  { id: 'correlated', group: 'protection', name: 'Underlyings move together', rule: 'Correlation of 0.7 or more (or a single stock).', why: 'In a worst-of, stocks that move together make the worst one less likely to drag.', caveat: 'Correlation breaks down in a sell-off.', source: 'Fixings, 1-year correlation', needsClient: false },
  { id: 'no-earnings', group: 'protection', name: 'No earnings in the first month', rule: 'No earnings date in the next 20 business days.', why: 'Avoids a results-day gap right after the trade.', caveat: 'Other news can still move the stock.', source: 'Corporate events calendar', needsClient: false },
  { id: 'headroom', group: 'client', name: 'Stays under the limit', rule: 'After the trade, no underlying goes above the client’s 25% limit.', why: 'Keeps the book within the concentration policy.', caveat: 'Uses ELI outstanding only, not the whole portfolio.', source: 'EQD master, outstanding stock', needsClient: true },
  { id: 'familiar', group: 'client', name: 'Client knows the stock', rule: 'The client already holds an ELI on at least one of these underlyings.', why: 'Easier conversation; the client follows the name.', caveat: 'Familiar can also mean more concentration.', source: 'EQD master, outstanding stock', needsClient: true },
  { id: 'not-top', group: 'client', name: 'Avoids the largest holding', rule: 'Does not add to the client’s largest underlying.', why: 'Spreads risk instead of piling into one name.', caveat: 'The client may want more of what they like.', source: 'EQD master, outstanding stock', needsClient: true },
];

export const STARTER_PACKS: readonly StarterPack[] = [
  { id: 'rollover', name: 'Rollover for a maturing client', blurb: 'Fits the book, pays well, peers are trading it.', signalIds: ['headroom', 'not-top', 'familiar', 'top-coupon', 'rm-traded'] },
  { id: 'yield', name: 'Yield hunter', blurb: 'The best coupons, rising this week, and they trade.', signalIds: ['top-coupon', 'coupon-up', 'vol-rich', 'fills'] },
  { id: 'defensive', name: 'Sleep at night', blurb: 'Deep protection and fewer surprises.', signalIds: ['deep-ki', 'correlated', 'no-earnings', 'fills'] },
  { id: 'desk', name: 'What the desk is busy with', blurb: 'Popular this week and quick to quote.', signalIds: ['rm-traded', 'rfq-busy', 'fills', 'coupon-up'] },
  { id: 'diversify', name: 'Diversify a concentrated book', blurb: 'Adds new names without breaking limits.', signalIds: ['headroom', 'not-top', 'correlated', 'deep-ki'] },
];

export const MAX_SIGNALS = 10;
export const CONCENTRATION_LIMIT_PCT = 25;
export const DEFAULT_NOTIONAL_USD = 250_000;
