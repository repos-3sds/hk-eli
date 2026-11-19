/**
 * Questions the discovery docs cover, one per family of the 12 HK_ELI Tableau views
 * (view-routing.md, agent-intent-classification.md). Chat starters and Today's tiles both use them,
 * and every one is answered by the Stork pipeline from a Tableau view, never from the model's memory.
 */
export interface DiscoveryQuestion {
  readonly id: string;
  readonly icon: string;
  readonly title: string;
  readonly question: string;
  /** The view the pipeline routes it to, shown on Today. */
  readonly view: string;
}

export const DISCOVERY_QUESTIONS = {
  outstanding: { id: 'outstanding', icon: 'chart-column', title: 'Outstanding ELI', question: 'What is the total outstanding ELI?', view: 'all_outatanding_total' },
  segments: { id: 'segments', icon: 'chart-column', title: 'Share by segment', question: 'What share of outstanding ELI does each segment hold?', view: 'all_outatanding_segment' },
  koCustomers: { id: 'koCustomers', icon: 'user-round', title: 'Customers predicted to KO', question: 'How many TRE customers are predicted to KO?', view: 'segment_outstanding' },
  calendar: { id: 'calendar', icon: 'calendar-clock', title: 'Maturity calendar, next 30 days', question: 'Show the TRE maturity calendar for the next 30 days', view: 'TRE_maturity_calendar_n30d' },
  branches: { id: 'branches', icon: 'calendar-clock', title: 'Branches with the most maturities', question: 'Which branches have the most TRE maturities in the next 30 days?', view: 'TRE_maturity_branch_n30d' },
  districts: { id: 'districts', icon: 'chart-column', title: 'Outstanding by district', question: 'Compare outstanding ELI across districts for TRE', view: 'ALL_outstanding_District_n30d' },
  wps: { id: 'wps', icon: 'shield-alert', title: 'Largest WPS exposure', question: 'Which WPS has the largest outstanding ELI exposure overall?', view: 'ALL_outstanding_simulation_n30d' },
  mtm: { id: 'mtm', icon: 'chart-column', title: 'MTM distribution', question: 'Show the MTM distribution of outstanding ELI', view: 'ALL_outstanding_distribution_n30d' },
  koShare: { id: 'koShare', icon: 'chart-column', title: 'Predicted KO share', question: 'What percentage of outstanding ELI is TRE predicted KO?', view: 'all_outatanding_segment_result' },
  clients: { id: 'clients', icon: 'user-round', title: 'Clients to follow up', question: 'Show the clients behind Central maturing in the next 30 days', view: 'TRE_maturity_detail_n30d' },
  freshness: { id: 'freshness', icon: 'history', title: 'Data freshness', question: 'How fresh is the data?', view: 'data_as_of' },
} as const satisfies Record<string, DiscoveryQuestion>;

/** What the pipeline can answer, in the user's words. */
export const PIPELINE_CAN_ANSWER =
  'outstanding ELI and its split by segment, district and predicted result, predicted maturities for Treasures (by date, branch and client), WPS exposure, the MTM distribution, customer counts and how fresh the data is';
