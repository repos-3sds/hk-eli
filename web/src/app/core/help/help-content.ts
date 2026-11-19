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
  maturing: { term: 'Maturing', definition: 'An ELI whose final date falls in the next 10 business days.' },
};

/** What each launch role does first, in three steps. Shown once on first visit and any time under Help. */
export interface GuideStep {
  readonly title: string;
  readonly text: string;
  readonly path: string;
  readonly cta: string;
}

/** The same steps for every launch role: only the screens the discovery docs cover (Hawk, 2026-11-20). */
const DISCOVERY_GUIDE: readonly GuideStep[] = [
  { title: 'See what needs you today', text: 'Today lists what matures and what is near a knock-out across the business, with how fresh the figures are.', path: '/today', cta: 'Open Today' },
  { title: 'Ask in plain words', text: 'Ask Chat about maturities, knock-outs or concentration. The HK ELI agents answer from the book and every figure is checked.', path: '/chat', cta: 'Open Chat' },
  { title: 'Get the facts on one client', text: 'Ask Chat "Brief me on Chan" for holdings, limits and what matures.', path: '/chat', cta: 'Open Chat' },
];

export const ROLE_GUIDES: Record<LaunchRole, readonly GuideStep[]> = { wms: DISCOVERY_GUIDE, pm: DISCOVERY_GUIDE, tsm: DISCOVERY_GUIDE };

/** Example questions Chat answers from data, grouped as a first-time user would look for them. */
export const ASK_EXAMPLES: readonly { readonly topic: string; readonly question: string }[] = [
  { topic: 'Maturities', question: 'Who matures this week?' },
  { topic: 'Knock-outs', question: 'Which knock-outs are close to the barrier?' },
  { topic: 'Rollover', question: 'Which branch has the worst rollover?' },
  { topic: 'Concentration', question: 'Top concentrations against limit' },
  { topic: 'One client', question: 'Brief me on Chan' },
  { topic: 'Client history', question: 'What did Chan trade in the last 90 days?' },
];

/** The tabs each role works in most, marked "For you" on the tab rail. */
export const ROLE_HOME_TABS: Record<LaunchRole, readonly string[]> = {
  wms: ['today', 'chat'],
  pm: ['today', 'chat'],
  tsm: ['today', 'chat'],
};

/** The glossary terms shown while the screens beyond the discovery docs are hidden (shelf, rollover, hand-offs stay defined). */
export const DISCOVERY_TERMS: readonly TermKey[] = (Object.keys(GLOSSARY) as TermKey[]).filter((k) => !['shelf', 'starter-pack', 'q2t', 'self-directed', 'handoff', 'linked-conversion', 'cutoff', 'signal', 'indicative'].includes(k));
