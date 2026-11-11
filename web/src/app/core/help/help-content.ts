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

export const ROLE_GUIDES: Record<LaunchRole, readonly GuideStep[]> = {
  wms: [
    { title: 'See what needs you today', text: 'Today lists what matures and what is near a knock-out across the business, with how fresh the figures are.', path: '/today', cta: 'Open Today' },
    { title: 'Get the facts on one client', text: 'Ask Chat "Brief me on Chan" for holdings, limits and what matures, ready for the owning RM.', path: '/chat', cta: 'Open Chat' },
    { title: 'Find ideas and hand them off', text: 'Ideas ranks indicative ELIs against the signals you pick. Add the good ones to the hand-off list.', path: '/ideas', cta: 'Open Ideas' },
  ],
  pm: [
    { title: 'Read demand next to the book', text: 'Shelf shows what was quoted this week, beside how full each name is against its limit.', path: '/shelf', cta: 'Open Shelf' },
    { title: 'Pick tomorrow\'s shelf', text: 'Tick ideas before the pricing cut-off and copy the request for the desk.', path: '/shelf', cta: 'Pick the shelf' },
    { title: 'Publish a starter pack', text: 'A published pack shows in every launch user\'s Ideas tab, under "From the product team".', path: '/ideas', cta: 'Open Ideas' },
  ],
  tsm: [
    { title: 'See your team\'s month', text: 'Update starts with rollover by branch and by RM, against the 80% line.', path: '/update', cta: 'Open Update' },
    { title: 'Act on a pocket', text: 'Pick a branch below the line and make a hand-off list of who matures there.', path: '/update', cta: 'See pockets' },
    { title: 'Let the next one come to you', text: 'Set an alert, for example "rollover below 80% in a branch", instant or in the morning digest.', path: '/alerts', cta: 'Open Alerts' },
  ],
};

/** Example questions Chat answers from data, grouped as a first-time user would look for them. */
export const ASK_EXAMPLES: readonly { readonly topic: string; readonly question: string }[] = [
  { topic: 'Maturities', question: 'Who matures this week?' },
  { topic: 'Knock-outs', question: 'Which knock-outs are close to the barrier?' },
  { topic: 'Rollover', question: 'Which branch has the worst rollover?' },
  { topic: 'Concentration', question: 'Top concentrations against limit' },
  { topic: 'Unmet demand', question: 'What was quoted and not traded this week?' },
  { topic: 'One client', question: 'Brief me on Chan' },
  { topic: 'Client history', question: 'What did Chan trade in the last 90 days?' },
];

/** The tabs each role works in most, marked "For you" on the tab rail. */
export const ROLE_HOME_TABS: Record<LaunchRole, readonly string[]> = {
  wms: ['today', 'chat', 'ideas'],
  pm: ['shelf', 'ideas'],
  tsm: ['update', 'alerts'],
};
