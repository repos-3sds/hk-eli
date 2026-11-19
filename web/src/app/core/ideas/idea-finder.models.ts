/**
 * Idea Finder contract, after the Unusual Whales Trade Finder pattern: hard filters narrow the warehouse,
 * then ideas are ranked by how many of the RM's picked signals line up (N of M). No AI score.
 */

export type SignalGroupId = 'coupon' | 'desk' | 'protection' | 'client';

export interface SignalGroup {
  readonly id: SignalGroupId;
  /** The plain question the group answers. */
  readonly question: string;
}

/** One rule an idea meets or not. The three parts make the hover card. */
export interface IdeaSignal {
  readonly id: string;
  readonly group: SignalGroupId;
  readonly name: string;
  /** What it checks, in plain words. */
  readonly rule: string;
  /** Why an RM would care. */
  readonly why: string;
  /** What it does not tell you. */
  readonly caveat: string;
  readonly source: string;
  /** Needs a client picked (fit-to-client signals). */
  readonly needsClient: boolean;
}

export interface StarterPack {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly signalIds: readonly string[];
}

/** Hard filters ("Narrow your focus"). They remove ideas; they never count as signals. */
export interface IdeaFilters {
  readonly tenorMonths: number | null;
  readonly minCouponPct: number | null;
  readonly maxKiPct: number | null;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly clientId: string | null;
}

export const NO_FILTERS: IdeaFilters = { tenorMonths: null, minCouponPct: null, maxKiPct: null, include: [], exclude: [], clientId: null };

/** What the plain-words box understood. */
export interface ReadIntent {
  readonly filters: IdeaFilters;
  readonly packId: string | null;
  /** Words the reader did not use, shown so the RM knows what was ignored. */
  readonly ignored: readonly string[];
}

export interface IdeaQuery {
  readonly filters: IdeaFilters;
  readonly signalIds: readonly string[];
}

export interface SignalCheck {
  readonly signalId: string;
  readonly met: boolean;
  /** The figure behind the answer, e.g. "17.4% vs 15.1% top-quartile line". */
  readonly evidence: string;
  readonly source: string;
}

export interface ConcentrationEffect {
  readonly underlying: string;
  readonly fromPct: number;
  readonly toPct: number;
  readonly limitPct: number;
}

/**
 * The single limit rule (D1, settled 4 Nov). Green ranks normally. Amber (at 85% of a limit or more) ranks lower
 * and says why. Red leaves the Top 5 for "Hidden by limits" and needs a desk override.
 */
export type LimitState = 'green' | 'amber' | 'red';

export const AMBER_SHARE_OF_LIMIT = 0.85;

export interface IdeaMatch {
  readonly id: string;
  readonly title: string;
  readonly underlyings: readonly string[];
  readonly tenorMonths: number;
  readonly terms: { readonly kiPct: number; readonly strikePct: number; readonly couponPct: number };
  readonly checks: readonly SignalCheck[];
  readonly met: number;
  readonly effect: ConcentrationEffect | null;
  readonly pricedAt: string;
  readonly limitState: LimitState;
  /** Why it ranks lower or is hidden, in plain words; null when green. */
  readonly limitReason: string | null;
}

/** One hard filter, and how many warehouse ideas would pass without it. Used to explain an empty result. */
export interface FilterBlocker {
  readonly key: 'tenorMonths' | 'minCouponPct' | 'maxKiPct' | 'include' | 'exclude';
  readonly label: string;
  readonly wouldPass: number;
}

export interface IdeaResults {
  readonly passedFilters: number;
  /** Filters ranked by how many ideas each one keeps out, most first. */
  readonly blockers: readonly FilterBlocker[];
  readonly warehouseSize: number;
  readonly matches: readonly IdeaMatch[];
  /** Red under the limit rule: kept out of the ranking, shown apart, need a desk override. */
  readonly hiddenByLimits: readonly IdeaMatch[];
  readonly notionalUsd: number;
  readonly businessDate: string;
}

/** "Build my own ELI": the terms the RM chose when nothing in the warehouse fits. */
export interface CustomEliSpec {
  readonly underlyings: readonly string[];
  readonly tenorMonths: number;
  readonly kiPct: number;
  readonly strikePct: number;
  readonly clientId: string | null;
}

/** The coupon solved for those terms, from an indicative price. The desk gives the live one. */
export interface CustomEliPrice {
  readonly couponPct: number;
  /** What moved the coupon, in plain words, biggest first. */
  readonly drivers: readonly string[];
  readonly notionalUsd: number;
  readonly effect: ConcentrationEffect | null;
  readonly pricedAt: string;
}
