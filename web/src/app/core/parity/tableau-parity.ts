/**
 * Tableau parity (R36). The launch users know their Tableau figures, so an answer that disagrees with a
 * dashboard they trust costs more than a missing feature. Each answer type maps to the Tableau view it should
 * agree with; a nightly check (gateway job, after the overnight refresh) compares the figures and the answer
 * says the result: matches, differs and why, or not checked yet. A difference is shown, never hidden.
 *
 * View names are placeholders until the bank shares the launch users' list of views (discovery open question 1).
 */
export type ParityStatus = 'match' | 'mismatch' | 'unchecked';

export interface TableauParity {
  /** The Tableau view the answer should agree with. */
  readonly view: string;
  readonly status: ParityStatus;
  /** For a mismatch: what differs and why. For unchecked: what it waits on. */
  readonly detail?: string;
}

export type ParityTopic = 'rollover' | 'concentration' | 'unmet' | 'maturities' | 'knockouts' | 'client';

/** Demo results of last night's check. Every name and figure is invented. */
export const PARITY_RESULTS: Readonly<Record<ParityTopic, TableauParity>> = {
  rollover: {
    view: 'ELI rollover by branch (demo name)',
    status: 'mismatch',
    detail: 'Kwun Tong · Treasures: 5 of 11 here, 5 of 12 in Tableau. Tableau also counts a maturity that settled after the close; this answer uses the blotter at close.',
  },
  concentration: { view: 'ELI concentration against limits (demo name)', status: 'match' },
  maturities: { view: 'ELI maturity calendar (demo name)', status: 'match' },
  knockouts: { view: 'ELI knock-out watch (demo name)', status: 'unchecked', detail: 'Not checked yet: waiting for the list of Tableau views.' },
  unmet: { view: 'RFQ funnel (demo name)', status: 'unchecked', detail: 'Not checked yet: waiting for the list of Tableau views.' },
  client: { view: 'Client ELI holdings (demo name)', status: 'match' },
};

export function parityLine(p: TableauParity, dataDate: string): string {
  switch (p.status) {
    case 'match':
      return `Matches Tableau: ${p.view}, checked at close ${dataDate}.`;
    case 'mismatch':
      return `Differs from Tableau: ${p.view}. ${p.detail ?? ''}`.trim();
    case 'unchecked':
      return `${p.detail ?? 'Not checked against Tableau yet.'} (${p.view})`;
  }
}
