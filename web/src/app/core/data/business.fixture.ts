/**
 * Fictional business-wide sample data for the launch users (GFM WMS, CBG PM, CBG TSM), who see all trades.
 * Every branch, RM, client and figure is invented. Rollover is 80%+ overall (stakeholder answer, 4 Nov);
 * the pockets below that line are single examples, not averages.
 */

export type Channel = 'advisory' | 'digibank';

export interface ClientOwner {
  readonly clientId: string;
  readonly rmName: string;
  readonly branch: string;
  readonly channel: Channel;
}

/** Who owns each fixture client. Handoffs go to this RM or branch. */
export const CLIENT_OWNERS: readonly ClientOwner[] = [
  { clientId: 'c-4821', rmName: 'Srivalli T.', branch: 'Kwun Tong', channel: 'advisory' },
  { clientId: 'c-1093', rmName: 'Jason Yu', branch: 'Central', channel: 'advisory' },
  { clientId: 'c-7720', rmName: 'Srivalli T.', branch: 'Kwun Tong', channel: 'advisory' },
  { clientId: 'c-3310', rmName: 'Mandy Chow', branch: 'Mong Kok', channel: 'advisory' },
  { clientId: 'c-5502', rmName: 'Digibank', branch: 'Digibank', channel: 'digibank' },
  { clientId: 'c-6618', rmName: 'Jason Yu', branch: 'Central', channel: 'advisory' },
  { clientId: 'c-2045', rmName: 'Mandy Chow', branch: 'Mong Kok', channel: 'advisory' },
  { clientId: 'c-8890', rmName: 'Peter Leung', branch: 'Tsim Sha Tsui', channel: 'advisory' },
  { clientId: 'c-1177', rmName: 'Srivalli T.', branch: 'Kwun Tong', channel: 'advisory' },
  { clientId: 'c-4402', rmName: 'Digibank', branch: 'Digibank', channel: 'digibank' },
  { clientId: 'c-9034', rmName: 'Peter Leung', branch: 'Tsim Sha Tsui', channel: 'advisory' },
  { clientId: 'c-3356', rmName: 'Mandy Chow', branch: 'Mong Kok', channel: 'advisory' },
];

export function ownerOf(clientId: string): ClientOwner | null {
  return CLIENT_OWNERS.find((o) => o.clientId === clientId) ?? null;
}

/** Rollover this month by branch and segment, against the 80% baseline. */
export interface RolloverPocket {
  readonly id: string;
  readonly branch: string;
  readonly segment: string;
  readonly rolloverPct: number;
  readonly baselinePct: number;
  /** ELI notional maturing in the next 10 business days in this pocket. */
  readonly maturingUsd: number;
  readonly maturedThisMonth: number;
  readonly rolledThisMonth: number;
}

export const ROLLOVER_BASELINE_PCT = 80;

export const ROLLOVER_POCKETS: readonly RolloverPocket[] = [
  { id: 'p-kt-tr', branch: 'Kwun Tong', segment: 'Treasures', rolloverPct: 45, baselinePct: 80, maturingUsd: 3_800_000, maturedThisMonth: 11, rolledThisMonth: 5 },
  { id: 'p-mk-tr', branch: 'Mong Kok', segment: 'Treasures', rolloverPct: 67, baselinePct: 80, maturingUsd: 1_450_000, maturedThisMonth: 9, rolledThisMonth: 6 },
  { id: 'p-tst-tr', branch: 'Tsim Sha Tsui', segment: 'Treasures', rolloverPct: 75, baselinePct: 80, maturingUsd: 980_000, maturedThisMonth: 8, rolledThisMonth: 6 },
  { id: 'p-cen-tp', branch: 'Central', segment: 'Treasure Private', rolloverPct: 88, baselinePct: 80, maturingUsd: 2_600_000, maturedThisMonth: 34, rolledThisMonth: 30 },
  { id: 'p-cen-tr', branch: 'Central', segment: 'Treasures', rolloverPct: 86, baselinePct: 80, maturingUsd: 1_900_000, maturedThisMonth: 28, rolledThisMonth: 24 },
  { id: 'p-dig', branch: 'Digibank', segment: 'Self-directed', rolloverPct: 82, baselinePct: 80, maturingUsd: 1_250_000, maturedThisMonth: 50, rolledThisMonth: 41 },
];

/** Quotes on digibank and through the desk that did not trade this week (R25). */
export interface UnmetQuote {
  readonly underlying: string;
  readonly channel: Channel;
  readonly quotes: number;
  readonly traded: number;
  readonly topAsk: string;
}

export const UNMET_DEMAND: readonly UnmetQuote[] = [
  { underlying: 'NVDA', channel: 'digibank', quotes: 214, traded: 31, topAsk: '3M · KI 70% · coupon 20%+' },
  { underlying: 'TSLA', channel: 'digibank', quotes: 166, traded: 22, topAsk: '3M · KI 65% · coupon 24%+' },
  { underlying: 'AMD', channel: 'advisory', quotes: 58, traded: 9, topAsk: '6M · KI 65% · coupon 17%' },
  { underlying: '0700.HK', channel: 'digibank', quotes: 97, traded: 18, topAsk: '6M · KI 75% · coupon 12%' },
  { underlying: 'META', channel: 'advisory', quotes: 41, traded: 12, topAsk: '6M · KI 68% · coupon 15%' },
];

/** Share of all ELI outstanding by underlying, against the 25% name limit. */
export const BOOK_CONCENTRATION: readonly { underlying: string; sharePct: number; limitPct: number }[] = [
  { underlying: 'NVDA', sharePct: 24.63, limitPct: 25 },
  { underlying: 'TSLA', sharePct: 17.9, limitPct: 25 },
  { underlying: 'AMD', sharePct: 14.2, limitPct: 25 },
  { underlying: 'META', sharePct: 9.6, limitPct: 25 },
  { underlying: '0700.HK', sharePct: 7.1, limitPct: 25 },
];
