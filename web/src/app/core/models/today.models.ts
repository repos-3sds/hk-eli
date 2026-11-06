/**
 * The Today tab's data contract. The mock data source and the gateway return the same shapes,
 * so the screens never know which one is behind them.
 */

/** The five kinds of moment the strip shows. */
export type MomentType = 'maturity' | 'knockout' | 'exercised' | 'idle' | 'rfq';

export const MOMENT_TYPES: readonly MomentType[] = ['maturity', 'knockout', 'exercised', 'idle', 'rfq'];

export const MOMENT_LABELS: Record<MomentType, string> = {
  maturity: 'Maturity',
  knockout: 'Likely knock-out',
  exercised: 'Exercised',
  idle: 'Idle 90+ days',
  rfq: 'Open RFQ',
};

export type { BookScope, ScopeOption, ScopeGroup } from './scope';
export { SCOPE_OPTIONS, scopeLabel } from './scope';

/** One business day in the strip. `offset` 0 is today; T-n means n business days from today. */
export interface BusinessDay {
  readonly date: string;
  readonly offset: number;
}

/** A dated event for one client (a maturity, a likely knock-out, ...). */
export interface Moment {
  readonly id: string;
  readonly clientId: string;
  readonly clientShortName: string;
  readonly type: MomentType;
  readonly date: string;
  readonly offset: number;
}

export interface MomentStrip {
  readonly days: readonly BusinessDay[];
  readonly moments: readonly Moment[];
}

/** One of the rules that decide whether a lead is worth a call. Read from data, never made up by a model. */
export interface Signal {
  readonly id: string;
  readonly name: string;
  readonly met: boolean;
  readonly rule: string;
  readonly whyItMatters: string;
  readonly caveat?: string;
  readonly source: string;
}

export type LeadActionKind = 'rollover-ideas' | 'exercised-stock-ideas' | 'knockout-ideas' | 'reactivation-ideas';

/** A client who needs attention today, with the reason in plain words and who owns the client. */
export interface Lead {
  readonly id: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly clientShortName: string;
  readonly segment: string;
  readonly cifMasked: string;
  /** The RM (or "Digibank") a handoff goes to. */
  readonly ownerRm: string;
  readonly branch: string;
  readonly channel: 'advisory' | 'digibank';
  readonly moment: Moment;
  /** Plain-words summary. Worded by the model from computed figures. */
  readonly summary: string;
  readonly signals: readonly Signal[];
  readonly action: { readonly kind: LeadActionKind; readonly label: string };
}

/** Rollover this month for one branch and segment, against the baseline. Below the line is an exception worth a look. */
export interface Pocket {
  readonly id: string;
  readonly branch: string;
  readonly segment: string;
  readonly rolloverPct: number;
  readonly baselinePct: number;
  readonly maturedThisMonth: number;
  readonly rolledThisMonth: number;
  /** ELI notional maturing in the next 10 business days in this pocket. */
  readonly maturingUsd: number;
}

export interface MorningBrief {
  readonly preparedAt: string;
  readonly businessDate: string;
  readonly preparedFrom: string;
  readonly sources: readonly string[];
  readonly leads: readonly Lead[];
  /** Notional maturing in the next 10 business days across the scope. */
  readonly maturingUsd: number;
  /** Rollover pockets in the scope, lowest first. */
  readonly pockets: readonly Pocket[];
}

export interface ConcentrationLine {
  readonly underlying: string;
  readonly sharePct: number;
  readonly limitPct: number;
}

export type OutcomeStatus = 'traded' | 'window-closed' | 'open' | 'not-traded';

export const OUTCOME_LABELS: Record<OutcomeStatus, string> = {
  traded: 'Traded',
  'window-closed': 'Window closed',
  open: 'Open',
  'not-traded': 'Not traded',
};

export interface LeadOutcome {
  readonly date: string;
  readonly label: string;
  readonly status: OutcomeStatus;
}

export type RfqStatus = 'quoted' | 'not-traded' | 'traded' | 'open';

export const RFQ_LABELS: Record<RfqStatus, string> = {
  quoted: 'Quoted',
  'not-traded': 'Not traded',
  traded: 'Traded',
  open: 'Open',
};

export interface RecentRfq {
  readonly date: string;
  readonly description: string;
  readonly status: RfqStatus;
}

/** What the context dock shows for one client. */
export interface ClientContext {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly segment: string;
  readonly cifMasked: string;
  readonly rmName: string;
  readonly branch: string;
  readonly channel: 'advisory' | 'digibank';
  readonly riskProfile: number;
  readonly eliOutstandingUsd: number;
  readonly maturingUsd: number;
  readonly lastTradeDate: string | null;
  readonly concentration: readonly ConcentrationLine[];
  readonly outcomes: readonly LeadOutcome[];
  readonly recentRfqs: readonly RecentRfq[];
  /** Widgets this client could be sent to. Empty until HK ELI is linked to other widgets. */
  readonly linkedWidgets: readonly string[];
}

/** A pre-priced idea from the daily warehouse. Indicative, not a live quote. */
export interface Idea {
  readonly id: string;
  readonly rank: number;
  readonly title: string;
  readonly terms: { readonly kiPct: number; readonly strikePct: number; readonly couponPct: number };
  readonly tenor: string;
  readonly pricedAt: string;
  readonly signals: readonly Signal[];
  readonly concentration: { readonly underlying: string; readonly fromPct: number; readonly toPct: number; readonly limitPct: number };
  readonly reason: string;
}

export interface RolloverIdeas {
  readonly clientId: string;
  readonly clientName: string;
  readonly clientShortName: string;
  readonly moment: Moment;
  readonly amountUsd: number;
  readonly ideas: readonly Idea[];
  readonly rankedLower: readonly Idea[];
  readonly callPrep: readonly string[];
  readonly outcome: OutcomeStatus;
  readonly outcomeWindowBusinessDays: number;
}

/** A row behind a figure, shown by "View rows". */
export interface EvidenceRow {
  readonly source: string;
  readonly field: string;
  readonly value: string;
  readonly asOf: string;
}

export interface QuoteRequestReceipt {
  readonly requestId: string;
  readonly ideaId: string;
  readonly sentAt: string;
  readonly desk: string;
}

/**
 * The two clocks every screen shows (R37). The dataset refreshes overnight (data as of last close);
 * prices refresh in the morning. Either run can be late or fail, and the screens must say so.
 */
export type FreshnessState = 'ready' | 'prices-late' | 'run-failed';

export interface Freshness {
  readonly state: FreshnessState;
  /** Close date the data describes. When the overnight run failed, the last good close. */
  readonly dataAsOf: string;
  /** When the overnight run finished (ISO with offset), or null when it failed. */
  readonly dataRefreshedAt: string | null;
  /** When the prices used were run (ISO with offset). */
  readonly pricesAsOf: string;
  /** True when pricesAsOf is from this morning's run. */
  readonly pricesToday: boolean;
  /** When this morning's prices are expected, while they are late (ISO with offset). */
  readonly pricesExpectedAt: string | null;
}
