import { LaunchRole } from '../session/session.service';

/** A word a first-time user may not know, in plain words. Shown in the glossary and on hover. */
export interface GlossaryTerm {
  readonly term: string;
  readonly definition: string;
}

export type TermKey =
  | 'eli' | 'ko' | 'ki' | 'barrier' | 'strike' | 'worst-of' | 'tenor' | 'coupon' | 'rollover' | 'q2t' | 'concentration'
  | 'limit' | 'signal' | 'starter-pack' | 'handoff' | 'linked-conversion' | 'indicative' | 'data-clock' | 'price-clock'
  | 'pocket' | 'self-directed' | 'shelf' | 'cutoff' | 'headroom' | 'maturing' | 'exercised' | 'idle' | 'rfq';

export const GLOSSARY: Record<TermKey, GlossaryTerm> = {
  eli: { term: 'ELI', definition: 'Equity-linked investment. A short deposit-like product that pays a fixed coupon; at maturity the client may receive shares instead of cash if the stock falls below the strike.' },
  ko: { term: 'Knock-out (KO)', definition: 'An early end to the ELI. If the stock closes at or above the knock-out level on an observation day, the client gets their money and coupon back early.' },
  barrier: { term: 'Near the barrier', definition: 'The stock is within a few percent of the knock-out level, so the ELI may end early. A chance to talk about what comes next.' },
  ki: { term: 'Knock-in (KI)', definition: 'The level that, if the stock falls to it, turns on the risk of receiving shares at the strike at maturity.' },
  strike: { term: 'Strike', definition: 'The price below which the client receives shares instead of cash at maturity. Shown as a percentage of the price on the trade date.' },
  'worst-of': { term: 'Worst-of', definition: 'An ELI on two or more stocks. What happens at maturity is decided by whichever stock has done worst.' },
  tenor: { term: 'Tenor', definition: 'How long the ELI runs, from trade date to maturity, for example 1 month or 3 months.' },
  coupon: { term: 'Coupon', definition: 'The yield the client earns, quoted per year. Indicative until the desk prices it.' },
  rollover: { term: 'Rollover', definition: 'Of the ELI money that matured this month, the share that went into a new ELI. The baseline is 80%.' },
  q2t: { term: 'Quote to trade', definition: 'Of the ELIs that were priced, the share that became a trade.' },
  concentration: { term: 'Concentration', definition: 'How much of a client\'s, or the bank\'s, ELI money sits on one stock. A worst-of counts towards every stock in it.' },
  limit: { term: 'Limit', definition: 'The most that may sit on one stock. Green is clear, amber is close to it, red would go over it, so ideas on that name are hidden.' },
  signal: { term: 'Signal', definition: 'A yes or no fact about an idea for this client, such as "headroom under the limit" or "stock the client has held before". Ideas rank by how many of your picked signals are a yes.' },
  'starter-pack': { term: 'Starter pack', definition: 'A ready set of signals for a common job, such as rollover. The product team can publish packs for every launch user.' },
  handoff: { term: 'Hand-off list', definition: 'Clients and ideas you pass to the owning RM, who decides suitability and talks to the client. Nothing goes to a client from here.' },
  'linked-conversion': { term: 'Linked conversion', definition: 'A later trade by a client on your hand-off list. It shows a link in time, not that the hand-off caused the trade.' },
  indicative: { term: 'Indicative', definition: 'A guide price from this morning\'s pricing run. The desk gives the firm price.' },
  'data-clock': { term: 'Data clock', definition: 'When the positions data was taken. It refreshes overnight, so figures are as of last business day\'s close.' },
  'price-clock': { term: 'Price clock', definition: 'When this morning\'s indicative prices were run. Amber means prices are not from today yet.' },
  pocket: { term: 'Pocket', definition: 'A branch and client segment whose rollover is below the 80% line this month.' },
  'self-directed': { term: 'Self-directed', definition: 'Trades a client makes in digibank on their own, without an RM. About 90% of digibank ELI trades.' },
  shelf: { term: 'Shelf', definition: 'The ideas the desk prices before the market opens, so they are ready for RMs and digibank.' },
  cutoff: { term: 'Pricing cut-off', definition: 'The latest time the desk takes tomorrow\'s shelf request. To be confirmed by the desk.' },
  headroom: { term: 'Headroom', definition: 'How far a client\'s holding on a stock is under its limit.' },
  exercised: { term: 'Exercised', definition: 'The stock ended below the strike, so the client received shares instead of cash. A chance to talk about the shares now held.' },
  idle: { term: 'Idle 90+ days', definition: 'A client who has held ELIs before but has not traded one in 90 days or more.' },
  rfq: { term: 'Open RFQ', definition: 'A request for a price that was sent to the desk and has not yet been traded or closed.' },
  maturing: { term: 'Predicted maturity', definition: 'When the model expects the ELI to end: the next likely KO date, or the final date if no KO is expected. Shown for Treasures (HK) only.' },
};

/** The glossary terms the discovery docs use. Terms for the hidden screens (shelf, rollover, hand-offs) stay defined but are not shown. */
export const DISCOVERY_TERMS: readonly TermKey[] = ['eli', 'ko', 'ki', 'barrier', 'strike', 'worst-of', 'tenor', 'coupon', 'exercised', 'data-clock', 'maturing'];

/** What each launch role does first, in three steps. Shown once on first visit and any time under Help. */
export interface GuideStep {
  readonly title: string;
  readonly text: string;
  readonly path: string;
  readonly cta: string;
}

/** The same three steps for every launch role: the screens the discovery docs cover. */
const DISCOVERY_GUIDE: readonly GuideStep[] = [
  { title: 'See the book at a glance', text: 'Today shows outstanding ELI, the predicted KO share, the next 30 days of Treasures maturities and the largest WPS exposures, each from a Tableau view.', path: '/today', cta: 'Open Today' },
  { title: 'Ask in plain words', text: 'Ask Chat "Which branches have the most TRE maturities in the next 30 days?" The answer shows the figures, a chart and the Tableau view it came from.', path: '/chat', cta: 'Open Chat' },
  { title: 'Check it in Tableau', text: 'Every answer has "Open in Tableau", which opens the same view with the same filters, so you can check the numbers yourself.', path: '/today', cta: 'Back to Today' },
];

export const ROLE_GUIDES: Record<LaunchRole, readonly GuideStep[]> = { wms: DISCOVERY_GUIDE, pm: DISCOVERY_GUIDE, tsm: DISCOVERY_GUIDE };

/** Example questions Chat answers from the HK_ELI Tableau views, grouped as a first-time user would look for them. */
export const ASK_EXAMPLES: readonly { readonly topic: string; readonly question: string }[] = [
  { topic: 'Outstanding', question: 'What is the total outstanding ELI?' },
  { topic: 'Segments', question: 'What share of outstanding ELI does each segment hold?' },
  { topic: 'Predicted KO', question: 'What percentage of outstanding ELI is TRE predicted KO?' },
  { topic: 'Maturities', question: 'Which branches have the most TRE maturities in the next 30 days?' },
  { topic: 'Clients', question: 'Show the clients behind Central maturing in the next 30 days' },
  { topic: 'WPS exposure', question: 'Which WPS has the largest outstanding ELI exposure overall?' },
  { topic: 'Districts', question: 'Compare outstanding ELI across districts for TRE' },
  { topic: 'MTM', question: 'Show the MTM distribution of outstanding ELI' },
  { topic: 'Freshness', question: 'How fresh is the data?' },
];

/** The tabs each role works in most, marked "For you" on the tab rail. */
export const ROLE_HOME_TABS: Record<LaunchRole, readonly string[]> = {
  wms: ['today', 'chat'],
  pm: ['today', 'chat'],
  tsm: ['today', 'chat'],
};
