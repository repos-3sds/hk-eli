/**
 * The Prompt Library: every question the HK ELI Chatbot answers, grouped the way the discovery docs group them
 * (agent-intent-classification.md, section 3, the 14 primary intents; view-routing.md for the view). Each prompt
 * was checked against the pipeline: it routes to the view shown and returns an answer.
 */
import { LaunchRole } from '../session/session.service';

export interface LibraryPrompt {
  readonly question: string;
  /** What the answer gives, in one line. */
  readonly gives: string;
  readonly view: string;
  /** Not answerable yet: the reason, shown instead of asking. */
  readonly unavailable?: string;
  /** The personas this question is for. Each persona sees only its own library. */
  readonly roles: readonly LaunchRole[];
}

export interface LibraryCategory {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  /** The discovery intents this category covers. */
  readonly intents: readonly string[];
  readonly prompts: readonly LibraryPrompt[];
}

export const PROMPT_LIBRARY: readonly LibraryCategory[] = [
  {
    id: 'book', title: 'Book overview', icon: 'chart-column', intents: ['outstanding_total', 'segment_analysis'],
    prompts: [
      { question: 'What is the total outstanding ELI?', gives: 'One figure for all segments', view: 'all_outatanding_total' , roles: ['pm', 'tsm'] },
      { question: 'How much TRE ELI is outstanding?', gives: 'Treasures (HK) outstanding', view: 'all_outatanding_total' , roles: ['pm', 'tsm'] },
      { question: 'How much PB ELI is outstanding?', gives: 'Private Bank outstanding', view: 'all_outatanding_total' , roles: ['pm', 'tsm'] },
      { question: 'What share of outstanding ELI does each segment hold?', gives: 'TRE, PB and TPC shares of the book', view: 'all_outatanding_segment' , roles: ['pm', 'tsm'] },
    ],
  },
  {
    id: 'results', title: 'Predicted results', icon: 'shield-alert', intents: ['segment_result_analysis', 'customer_count_analysis'],
    prompts: [
      { question: 'What percentage of outstanding ELI is TRE predicted KO?', gives: 'Share and amount predicted to knock out', view: 'all_outatanding_segment_result' , roles: ['pm', 'wms'] },
      { question: 'What percentage of outstanding ELI is PB predicted EXP?', gives: 'Share and amount predicted to expire', view: 'all_outatanding_segment_result' , roles: ['pm', 'wms'] },
      { question: 'How many TRE customers are predicted to KO?', gives: 'Distinct customers and their amount', view: 'segment_outstanding' , roles: ['pm', 'wms'] },
      { question: 'How many customers are predicted to KO by segment?', gives: 'Customer counts by segment and result', view: 'segment_outstanding' , roles: ['pm'] },
    ],
  },
  {
    id: 'maturity', title: 'Maturities (Treasures)', icon: 'calendar-clock', intents: ['maturity_calendar', 'maturity_branch_analysis'],
    prompts: [
      { question: 'Show the TRE maturity calendar for the next 30 days', gives: 'Predicted maturity by date, split by result', view: 'TRE_maturity_calendar_n30d' , roles: ['wms', 'tsm'] },
      { question: 'How much TRE ELI is predicted to mature in the next 7 days?', gives: 'This week\'s predicted maturities', view: 'TRE_maturity_calendar_n30d' , roles: ['wms', 'tsm'] },
      { question: 'When is the maturity concentration in the next 60 days?', gives: 'The peak dates over 60 days', view: 'TRE_maturity_calendar_n30d' , roles: ['wms', 'tsm'] },
      { question: 'Which branches have the most TRE maturities in the next 30 days?', gives: 'Branches ranked by predicted maturity', view: 'TRE_maturity_branch_n30d' , roles: ['wms', 'tsm'] },
      { question: 'Which branches in D1 have the largest TRE maturity in the next 30 days?', gives: 'One district\'s branches, ranked', view: 'TRE_maturity_branch_n30d' , roles: ['tsm'] },
      { question: 'How many TRE customers in D1 have predicted maturity in the next 30 days?', gives: 'Distinct customers maturing in a district', view: 'TRE_maturity_branch_n30d' , roles: ['tsm'] },
    ],
  },
  {
    id: 'followup', title: 'Clients to follow up', icon: 'user-round', intents: ['maturity_detail'],
    prompts: [
      { question: 'Which clients have ELIs maturing in the next 30 days?', gives: 'Client, RM and position list from the agent', view: 'TRE_maturity_detail_n30d' , roles: ['wms', 'tsm'] },
      { question: 'Who should sales follow up in Kwun Tong this month?', gives: 'Clients and RMs to call first', view: 'TRE_maturity_detail_n30d' , roles: ['tsm', 'wms'] },
      { question: 'Which TRE clients have WPS 9988 HK maturing in the next 30 days?', gives: 'Clients with one stock maturing', view: 'TRE_maturity_detail_n30d' , roles: ['wms'] },
      { question: 'Which TRE clients are predicted to expire below strike in the next 30 days?', gives: 'Clients who may receive shares', view: 'TRE_maturity_detail_n30d' , roles: ['wms', 'tsm'] },
    ],
  },
  {
    id: 'district', title: 'Districts', icon: 'building', intents: ['district_analysis'],
    prompts: [
      { question: 'Compare outstanding ELI across districts for TRE', gives: 'D1, D2 and D3 side by side, with control total', view: 'ALL_outstanding_District_n30d' , roles: ['tsm', 'pm'] },
    ],
  },
  {
    id: 'stocks', title: 'Stocks and risk', icon: 'layers', intents: ['wps_exposure_analysis', 'mtm_distribution_analysis', 'scenario_analysis'],
    prompts: [
      { question: 'Which WPS has the largest outstanding ELI exposure overall?', gives: 'Worst-performing stocks ranked by exposure', view: 'ALL_outstanding_simulation_n30d' , roles: ['wms', 'pm'] },
      { question: 'Which worst-performing stocks have the largest TRE exposure in the next 30 days?', gives: 'TRE exposure by stock, next 30 days', view: 'TRE_outstanding_simulation_n30d' , roles: ['wms', 'pm'] },
      { question: 'Where is Alibaba exposure?', gives: '9988 HK\'s exposure and rank', view: 'ALL_outstanding_simulation_n30d' , roles: ['wms'] },
      { question: 'Show the MTM distribution of outstanding ELI', gives: 'Deals and amounts by MTM % bucket', view: 'ALL_outstanding_distribution_n30d' , roles: ['pm', 'wms'] },
      { question: 'Show the MTM distribution for 9988 HK', gives: 'One stock\'s MTM buckets', view: 'ALL_outstanding_distribution_n30d' , roles: ['pm', 'wms'] },
      { question: 'What if the market drops 10%?', gives: 'Scenario on market spot', view: 'ALL_outstanding_simulation_n30d', unavailable: 'Needs the market_spot parameter on the simulation views (discovery: scenario_analysis). Not in the POC yet.' , roles: ['wms', 'pm'] },
    ],
  },
  {
    id: 'data', title: 'Data freshness', icon: 'clock', intents: ['data_recency'],
    prompts: [
      { question: 'How fresh is the data?', gives: 'Business date and last refresh', view: 'data_as_of' , roles: ['wms', 'pm', 'tsm'] },
      { question: 'What is the latest trade date?', gives: 'Newest trade in the data', view: 'max_trade_date' , roles: ['wms', 'pm', 'tsm'] },
    ],
  },
];

/** What each persona's library is for, shown at its top. */
export const LIBRARY_FOCUS: Record<LaunchRole, string> = {
  wms: 'Maturities and the clients behind them, predicted KOs and single-stock exposure',
  pm: 'The book, segment shares, predicted results, stock exposure and the MTM spread',
  tsm: 'Your districts and branches: outstanding, maturities and who to follow up',
};

/** The library for one persona: only its questions, empty categories left out. */
export function libraryFor(role: LaunchRole): readonly LibraryCategory[] {
  return PROMPT_LIBRARY.map((c) => ({ ...c, prompts: c.prompts.filter((p) => p.roles.includes(role)) })).filter((c) => c.prompts.length > 0);
}
