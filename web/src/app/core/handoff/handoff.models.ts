/**
 * Hand-off lists (R38). Launch users do not call clients; they hand a list to the owning RM or branch.
 * HK ELI keeps a record of each hand-off so a later trade can be linked to it (linked, not caused).
 */

export type HandoffStatus = 'sent' | 'linked-trade' | 'window-closed' | 'desk-declined';

export const HANDOFF_STATUS_LABELS: Record<HandoffStatus, string> = {
  sent: 'Sent, window open',
  'linked-trade': 'Linked trade',
  'window-closed': 'Window closed, no trade',
  'desk-declined': 'Desk declined',
};

/** Business days after sending in which a trade can be linked to a hand-off. */
export const LINK_WINDOW_BUSINESS_DAYS = 10;

/** The minimum hand-off record (decision card, settled 4 Nov). */
export interface HandoffItem {
  readonly id: string;
  readonly clientId: string | null;
  readonly clientName: string | null;
  /** Who gets it: the owning RM, the branch, or digibank. */
  readonly ownerRm: string;
  readonly branch: string;
  /** Why it is on the list, in plain words. */
  readonly reason: string;
  /** The idea attached, if any, with its price time. */
  readonly idea: { readonly title: string; readonly terms: string; readonly pricedAt: string } | null;
  readonly underlyings: readonly string[];
  readonly from: 'Today' | 'Ideas' | 'Chat';
  readonly addedAt: string;
}

export interface HandoffOutcome {
  readonly status: HandoffStatus;
  /** For a linked trade: the trade it was linked to. For a desk decline: why. */
  readonly note: string | null;
}

export interface HandoffRecord {
  readonly id: string;
  readonly sentAt: string;
  readonly sentBy: string;
  readonly role: string;
  /** The last business day a trade can be linked. */
  readonly windowEnds: string;
  readonly items: readonly HandoffItem[];
  readonly outcomes: Readonly<Record<string, HandoffOutcome>>;
}

export interface LinkedConversion {
  /** Hand-off items whose window has closed or that already have a linked trade. */
  readonly decided: number;
  readonly linked: number;
  readonly pct: number | null;
  /** The same measure for comparable clients who got no hand-off. */
  readonly noHandoffPct: number;
  readonly open: number;
  readonly declined: number;
}
