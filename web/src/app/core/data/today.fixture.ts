/**
 * Fictional sample data for the Today tab. Every client, CIF and figure is invented.
 * Dates are stored as business-day offsets from "today" so the strip always reads correctly.
 */
import { LeadActionKind, MomentType, OutcomeStatus, RfqStatus } from '../models/today.models';

export interface FixtureMoment {
  readonly clientId: string;
  readonly type: MomentType;
  readonly offset: number;
}

export interface FixtureClient {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly segment: string;
  readonly cifMasked: string;
  readonly riskProfile: number;
  readonly eliOutstandingUsd: number;
  readonly maturingUsd: number;
  readonly lastTradeDaysAgo: number | null;
  readonly concentration: readonly { underlying: string; sharePct: number }[];
  readonly outcomes: readonly { daysAgo: number; label: string; status: OutcomeStatus }[];
  readonly rfqs: readonly { daysAgo: number; description: string; status: RfqStatus }[];
}

export interface FixtureSignalState {
  readonly id: SignalId;
  readonly met: boolean;
  readonly caveat?: string;
}

export interface FixtureLead {
  readonly clientId: string;
  readonly momentType: MomentType;
  /** {weekday} is filled with the moment's weekday. */
  readonly summary: string;
  readonly action: { kind: LeadActionKind; label: string };
  readonly signals: readonly FixtureSignalState[];
}

export type SignalId = 'moment' | 'cash' | 'history' | 'headroom' | 'engaged' | 'ideas';

export const SIGNAL_CATALOGUE: Record<SignalId, { name: string; rule: string; whyItMatters: string; source: string }> = {
  moment: {
    name: 'Moment within the window',
    rule: 'A maturity, likely knock-out, delivery or idle mark falls within the next 10 business days.',
    whyItMatters: 'The conversation has a natural reason and a date.',
    source: 'EQD master, outstanding stock',
  },
  cash: {
    name: 'Cash or stock coming back',
    rule: 'Notional returns to the account as cash, or shares are delivered.',
    whyItMatters: 'Money that lands idle is the moment a client decides what to do next.',
    source: 'EQD master, settlement schedule',
  },
  history: {
    name: 'Rollover history',
    rule: 'Rolled over 2 of the last 3 maturities within 10 business days.',
    whyItMatters: 'A client who rolled before is the warmest rollover conversation on the list.',
    source: 'EQD master, trades 2024 to 2026',
  },
  headroom: {
    name: 'Concentration headroom',
    rule: 'At least one idea keeps every underlying under the client’s 25% share of ELI outstanding.',
    whyItMatters: 'Ideas can be offered without adding to an underlying the client already holds too much of.',
    source: 'EQD master, outstanding stock',
  },
  engaged: {
    name: 'Recently engaged',
    rule: 'An RFQ or a trade in the last 30 days.',
    whyItMatters: 'The client is already talking to us about ELIs.',
    source: 'RFQ log, blotter',
  },
  ideas: {
    name: 'Ideas available today',
    rule: 'Pre-priced ideas in today’s warehouse match the client’s entitlements and risk profile.',
    whyItMatters: 'There is something concrete to show on the call.',
    source: 'Daily pre-priced ideas warehouse',
  },
};

export const FIXTURE_CLIENTS: readonly FixtureClient[] = [
  {
    id: 'c-4821', name: 'Chan Tai Man', shortName: 'Chan T.', segment: 'Treasures', cifMasked: '••4821', riskProfile: 4,
    eliOutstandingUsd: 1_240_000, maturingUsd: 420_000, lastTradeDaysAgo: 22,
    concentration: [{ underlying: 'NVDA', sharePct: 23.1 }, { underlying: 'AMD', sharePct: 14.0 }, { underlying: 'TSLA', sharePct: 9.8 }],
    outcomes: [
      { daysAgo: 13, label: 'Rollover ideas · AMD / META', status: 'traded' },
      { daysAgo: 32, label: 'Idle 90 days · reactivation', status: 'window-closed' },
      { daysAgo: 0, label: 'Rollover nudge · NVDA / AMD', status: 'open' },
    ],
    rfqs: [
      { daysAgo: 3, description: 'NVDA / AMD · 6M · KI 65% · coupon 18.2%', status: 'quoted' },
      { daysAgo: 6, description: 'TSLA · 3M · KI 70% · coupon 21.5%', status: 'not-traded' },
    ],
  },
  {
    id: 'c-1093', name: 'Wong Ka Lok', shortName: 'Wong K.L.', segment: 'Treasure Private', cifMasked: '••1093', riskProfile: 5,
    eliOutstandingUsd: 2_310_000, maturingUsd: 260_000, lastTradeDaysAgo: 41,
    concentration: [{ underlying: 'TSLA', sharePct: 18.4 }, { underlying: 'META', sharePct: 12.2 }, { underlying: 'AAPL', sharePct: 7.5 }],
    outcomes: [{ daysAgo: 0, label: 'Knock-out watch · TSLA', status: 'open' }],
    rfqs: [{ daysAgo: 12, description: 'META · 6M · KI 68% · coupon 15.1%', status: 'quoted' }],
  },
  {
    id: 'c-7720', name: 'Lee Mei', shortName: 'Lee M.', segment: 'Treasures', cifMasked: '••7720', riskProfile: 4,
    eliOutstandingUsd: 860_000, maturingUsd: 0, lastTradeDaysAgo: 58,
    concentration: [{ underlying: 'AMD', sharePct: 21.0 }, { underlying: 'MSFT', sharePct: 11.3 }],
    outcomes: [{ daysAgo: 0, label: 'Exercised stock · AMD', status: 'open' }],
    rfqs: [],
  },
  {
    id: 'c-3310', name: 'Ho Siu Fung', shortName: 'Ho S.', segment: 'Treasures', cifMasked: '••3310', riskProfile: 3,
    eliOutstandingUsd: 0, maturingUsd: 0, lastTradeDaysAgo: 94,
    concentration: [],
    outcomes: [{ daysAgo: 0, label: 'Idle 94 days · reactivation', status: 'open' }],
    rfqs: [],
  },
  { id: 'c-5502', name: 'Lam Wing', shortName: 'Lam W.', segment: 'Treasures', cifMasked: '••5502', riskProfile: 4, eliOutstandingUsd: 540_000, maturingUsd: 0, lastTradeDaysAgo: 9, concentration: [{ underlying: 'AAPL', sharePct: 16.0 }], outcomes: [], rfqs: [{ daysAgo: 1, description: 'AAPL · 3M · KI 72% · coupon 12.4%', status: 'open' }] },
  { id: 'c-6618', name: 'Yip Ah Kei', shortName: 'Yip A.', segment: 'Treasure Private', cifMasked: '••6618', riskProfile: 5, eliOutstandingUsd: 1_780_000, maturingUsd: 300_000, lastTradeDaysAgo: 35, concentration: [{ underlying: 'META', sharePct: 19.5 }], outcomes: [], rfqs: [] },
  { id: 'c-2045', name: 'Ng Pui Yee', shortName: 'Ng P.', segment: 'Treasures', cifMasked: '••2045', riskProfile: 4, eliOutstandingUsd: 690_000, maturingUsd: 150_000, lastTradeDaysAgo: 47, concentration: [{ underlying: 'GOOGL', sharePct: 13.0 }], outcomes: [], rfqs: [] },
  { id: 'c-8890', name: 'Tsang Jun', shortName: 'Tsang J.', segment: 'Treasures', cifMasked: '••8890', riskProfile: 4, eliOutstandingUsd: 920_000, maturingUsd: 200_000, lastTradeDaysAgo: 28, concentration: [{ underlying: 'TSLA', sharePct: 22.0 }], outcomes: [], rfqs: [] },
  { id: 'c-1177', name: 'Fung Ray', shortName: 'Fung R.', segment: 'Treasures', cifMasked: '••1177', riskProfile: 3, eliOutstandingUsd: 410_000, maturingUsd: 180_000, lastTradeDaysAgo: 51, concentration: [{ underlying: 'AAPL', sharePct: 10.0 }], outcomes: [], rfqs: [] },
  { id: 'c-4402', name: 'Cheung Lok', shortName: 'Cheung L.', segment: 'Treasures', cifMasked: '••4402', riskProfile: 4, eliOutstandingUsd: 300_000, maturingUsd: 0, lastTradeDaysAgo: 15, concentration: [], outcomes: [], rfqs: [{ daysAgo: 2, description: 'MSFT · 6M · KI 70% · coupon 11.8%', status: 'open' }] },
  { id: 'c-9034', name: 'Ma Ka Wai', shortName: 'Ma K.', segment: 'Treasures', cifMasked: '••9034', riskProfile: 4, eliOutstandingUsd: 760_000, maturingUsd: 220_000, lastTradeDaysAgo: 63, concentration: [{ underlying: 'NVDA', sharePct: 17.2 }], outcomes: [], rfqs: [] },
  { id: 'c-3356', name: 'Kwok Dik', shortName: 'Kwok D.', segment: 'Treasures', cifMasked: '••3356', riskProfile: 4, eliOutstandingUsd: 580_000, maturingUsd: 160_000, lastTradeDaysAgo: 39, concentration: [{ underlying: 'AMD', sharePct: 12.0 }], outcomes: [], rfqs: [] },
];

export const FIXTURE_MOMENTS: readonly FixtureMoment[] = [
  { clientId: 'c-3310', type: 'idle', offset: 0 },
  { clientId: 'c-5502', type: 'rfq', offset: 0 },
  { clientId: 'c-1093', type: 'knockout', offset: 1 },
  { clientId: 'c-4821', type: 'maturity', offset: 3 },
  { clientId: 'c-6618', type: 'maturity', offset: 3 },
  { clientId: 'c-7720', type: 'exercised', offset: 4 },
  { clientId: 'c-2045', type: 'maturity', offset: 5 },
  { clientId: 'c-8890', type: 'knockout', offset: 7 },
  { clientId: 'c-1177', type: 'maturity', offset: 7 },
  { clientId: 'c-4402', type: 'rfq', offset: 7 },
  { clientId: 'c-9034', type: 'maturity', offset: 7 },
  { clientId: 'c-3356', type: 'maturity', offset: 8 },
];

export const FIXTURE_LEADS: readonly FixtureLead[] = [
  {
    clientId: 'c-4821', momentType: 'maturity',
    summary: 'ELI on NVDA / AMD worst-of matures {weekday}. USD 420k returns as cash. Rolled over 2 of the last 3 maturities. NVDA is already 23.1% of the book, so rollover ideas avoid NVDA.',
    action: { kind: 'rollover-ideas', label: 'Show rollover ideas' },
    signals: [
      { id: 'moment', met: true }, { id: 'cash', met: true },
      { id: 'history', met: true, caveat: 'His last two rollovers added NVDA, which is now near his limit.' },
      { id: 'headroom', met: true }, { id: 'engaged', met: true }, { id: 'ideas', met: false },
    ],
  },
  {
    clientId: 'c-1093', momentType: 'knockout',
    summary: 'TSLA closed 1.8% below the knock-out barrier yesterday. If it knocks out on {weekday}, USD 260k returns early with coupon paid.',
    action: { kind: 'knockout-ideas', label: 'Show rollover ideas' },
    signals: [
      { id: 'moment', met: true }, { id: 'cash', met: true }, { id: 'history', met: false },
      { id: 'headroom', met: true }, { id: 'engaged', met: true }, { id: 'ideas', met: false },
    ],
  },
  {
    clientId: 'c-7720', momentType: 'exercised',
    summary: 'AMD stock expected to be delivered below strike. 3,000 shares will land in the account. Ideas to use the stock: covered ELI or switch.',
    action: { kind: 'exercised-stock-ideas', label: 'Show exercised-stock ideas' },
    signals: [
      { id: 'moment', met: true }, { id: 'cash', met: true }, { id: 'history', met: false },
      { id: 'headroom', met: true }, { id: 'engaged', met: false }, { id: 'ideas', met: false },
    ],
  },
  {
    clientId: 'c-3310', momentType: 'idle',
    summary: 'No ELI trade for 94 days after three trades a quarter last year. Nothing outstanding, so any idea starts from a clean book.',
    action: { kind: 'reactivation-ideas', label: 'Show reactivation ideas' },
    signals: [
      { id: 'moment', met: true }, { id: 'cash', met: false }, { id: 'history', met: false },
      { id: 'headroom', met: true }, { id: 'engaged', met: false }, { id: 'ideas', met: false },
    ],
  },
];

export interface FixtureIdea {
  readonly id: string;
  readonly title: string;
  readonly tenor: string;
  readonly kiPct: number;
  readonly strikePct: number;
  readonly couponPct: number;
  readonly signalsMet: readonly SignalId[];
  readonly concentration: { underlying: string; fromPct: number; toPct: number; limitPct: number };
  readonly reason: string;
}

export interface FixtureIdeaSet {
  readonly clientId: string;
  readonly ideas: readonly FixtureIdea[];
  readonly rankedLower: readonly FixtureIdea[];
  readonly callPrep: readonly string[];
}

export const FIXTURE_IDEAS: readonly FixtureIdeaSet[] = [
  {
    clientId: 'c-4821',
    ideas: [
      { id: 'i-amd-meta-6m', title: 'AMD / META worst-of · 6M', tenor: '6M', kiPct: 65, strikePct: 85, couponPct: 17.4, signalsMet: ['moment', 'cash', 'history', 'headroom', 'engaged'], concentration: { underlying: 'AMD', fromPct: 14.0, toPct: 19.2, limitPct: 25 }, reason: 'Same tenor and KI he rolled into last time; no NVDA.' },
      { id: 'i-msft-googl-6m', title: 'MSFT / GOOGL worst-of · 6M', tenor: '6M', kiPct: 70, strikePct: 88, couponPct: 14.1, signalsMet: ['moment', 'cash', 'headroom', 'engaged'], concentration: { underlying: 'MSFT', fromPct: 0, toPct: 5.8, limitPct: 25 }, reason: 'Spreads risk away from chips; lower coupon, higher barrier.' },
      { id: 'i-avgo-3m', title: 'AVGO · 3M', tenor: '3M', kiPct: 68, strikePct: 90, couponPct: 15.8, signalsMet: ['moment', 'cash', 'headroom'], concentration: { underlying: 'AVGO', fromPct: 4.2, toPct: 9.9, limitPct: 25 }, reason: 'Shorter tenor if he wants cash back sooner.' },
    ],
    rankedLower: [
      { id: 'i-nvda-amd-6m', title: 'NVDA / AMD worst-of · 6M', tenor: '6M', kiPct: 65, strikePct: 85, couponPct: 18.2, signalsMet: ['moment', 'cash', 'history'], concentration: { underlying: 'NVDA', fromPct: 23.1, toPct: 27.9, limitPct: 25 }, reason: 'Highest coupon, but it would take NVDA over the client’s 25% limit. Shown last, only to answer first if the client asks for NVDA.' },
    ],
    callPrep: [
      '{weekday}’s ELI pays back USD 420k plus the final coupon. Ask what he wants the cash to do next.',
      'He liked AMD last time. Idea #1 keeps AMD and adds META at the same 6M tenor, without more NVDA.',
      'If he asks for NVDA again, explain it is close to his 25% limit and offer #2 to spread risk.',
    ],
  },
];
