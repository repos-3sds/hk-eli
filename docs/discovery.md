# HK ELI Discovery: Ultimate Edition

Copied from the [Discovery Ultimate Edition Claude Doc](https://claude.ai/artifact/65VGAxNmRegCAAew6qfYGP) (version of 4 Nov 2026). If the two differ, the Claude Doc is newer; update this file to match.

Public version: people's names, the money figures of the business case and figures from the internal deck are left out. The full text is in the linked Claude Doc for those with access. Citations to the deck photos are removed too. The [business vision](business-vision.md) sits on top of this doc, and [decisions](decisions.md) lists what was settled after it.

## Summary

The HK ELI Chatbot wins its business case by turning maturing, knocked-out and dormant positions into new trades, and it must prove that by recording what happened after each lead. Everything below is tested against one question: does it turn data into an action that converts a rollover, reactivates a client, closes an RFQ or saves sales time, without breaking risk or suitability rules?

This is the single discovery reference. It keeps the earlier [Windows discovery doc](https://claude.ai/artifact/9EuUjJjRfTtsU7zWxhh5A7) as its base and folds in five findings from the parallel Fable draft: the contract lifecycle journey, the digibank channel persona and journey, Product Manager shelf curation, concentration-aware idea ranking, and lead outcome tracking as a go-live must-have.

Sources are the internal project deck, the HK-ELI Figma file and the product lead's decisions of 3 Nov 2026. Claims marked (hypothesis) still need checking in interviews. No user interviews have been run yet.

**Version of 4 Nov 2026: launch users changed.** The business stakeholders answered the open discovery questions, and the answers replace earlier assumptions. Launch is for about 70 internal users: GFM WMS specialists (the desk that sells and structures ELIs for the wealth side), CBG Product Managers and CBG Treasury Sales Managers. They use Tableau for day-to-day work today and can see all trades. RMs are not users at this stage. Rollover already runs above 80%, 90% of digibank trades are self-directed, nothing is client-facing until feedback is good, data refreshes overnight and pricing refreshes in the morning. Personas, journeys, needs, requirements (R1 to R35 revised, R36 to R41 added), insights and decisions below are updated to match.

## Business context

The deck's vision is to "transform ELI business data into actionable intelligence, proactive alerts, and targeted opportunities that enable faster, data-driven sales decisions", along a Data, Insights, Opportunities, Actions flow.

- **Problem:** ELI is growing across advisory and digibank channels, but people still rely on manual analysis to find opportunities and drive follow-up.
- **Money:** uplift in each of 2027, 2028 and 2029 that grows each year, against the 2026 build cost (figures in the internal docs).
- **Timeline:** kick-off Aug 2026, build Sep to Dec 2026, go-live Jan 2027. MVP1 is an 8-week build of the chatbot and sales dashboard.
- **Where the uplift comes from:** rollover and reactivation conversion, lead identification, sales productivity, customer acquisition, and turnover and revenue. Concentration risk is the main guardrail.
- **Data sources:** EQD Blotter, Client Mapping, digibank ELI RFQ log and Fixing Result.

The product is organised in four pillars, all reached through one HK ELI Chatbot surface inside the Digimarkets workspace:

| Pillar | What it does | Figma |
| --- | --- | --- |
| 1a Conversational BI | Plain-language questions, figures computed from data, the 14-section Business Update | HK ELI Chatbot (C01 to C05), Business Update |
| 1b Client Opportunities and Leads | Rollover, reactivation and open-RFQ leads with a next best action | Alerts and Leads |
| 1c Sales Insights and Idea Discovery | Saved insights, Idea Explorer over a daily pre-priced warehouse | Prompt Library, Idea Explorer (I01 to I04), idea packs |
| 1d Alerts and Automation Hub | Threshold alerts and scheduled reports | Alert creation (A01 to A06), Scheduler (S01 to S06) |

## Personas

At launch the HK ELI Chatbot serves about 70 internal users in three roles, all of whom use Tableau for day-to-day work today and can see every ELI trade. RMs and Treasury Specialists in the branches are not users at this stage; they come later, once internal feedback is good (stakeholder answers, 4 Nov 2026).

### Launch personas

| # | Persona | Day-to-day job | Pain today | Key need | Evidence |
| --- | --- | --- | --- | --- | --- |
| P1 | GFM WMS specialist (Wealth Management Sales and Specialists, the GFM desk that sells and structures ELIs for the wealth side) | Structure and price ELI ideas for the wealth business, answer RM and branch asks, and push timely ideas out to the sellers who cover the clients | Pricing is a trial-and-error loop (the deck's single example: dozens of quotes in one session for one client); maturities, knock-outs and quoted-not-traded flow are found by filtering Tableau and the blotter by hand | One place that shows what is maturing, knocking out or quoted but not traded across all trades, with already-priced ideas ready to send to the sellers | Product lead, 4 Nov; deck |
| P2 | CBG Product Manager (ELI) | Grow ELI demand across advisory and digibank while keeping concentration inside limits; choose the shelf the desk prices each morning | Manual monthly reviews; late sight of concentration; no tool to set the shelf; 90% of digibank trades are self-directed, so most demand never reaches a seller | Demand and concentration side by side, a console for tomorrow's priced shelf, the digibank quote funnel, and the Business Update | Deck; 4 Nov answers |
| P3 | CBG Treasury Sales Manager | Lift rollover, reactivation and quote-to-trade across branches and treasury sales teams | Sees a slip after the fact in Tableau; builds priority lists for the teams by hand; cannot tell whether a list converted | Pockets below baseline by branch, segment and team, a list they can hand to a team in one step, and its conversion afterwards | Deck; 4 Nov answers |

P1 is the most hands-on user: closest to the old Treasury Specialist role, but working across the whole wealth book instead of one client at a time. P2 and P3 work at the level of the business and act through others.

### Later, indirect and supporting personas

| Persona | Role at launch | When it changes |
| --- | --- | --- |
| Relationship Manager (RM) | Not a user. Receives ideas and lists from P1 and P3 through today's channels | After good internal feedback and full readiness |
| Branch Treasury / Investment Specialist | Not a user. Receives lists from P3 | Same as RMs |
| Business leaders and sponsors | Receive the Business Update and the uplift tracker | Reports only in MVP1 |
| Digibank channel owner | Folded into P2 at launch (hypothesis, to confirm) | If the role is separate, it gets the funnel view |
| Structurer / SPE pricing desk | Prices the shelf each morning; fewer repetitive bespoke asks | Supplier throughout |
| Operations (fixing) | Produces KO, KI, maturity and exercise results in the overnight refresh | Supplier throughout |
| Data and platform team | Runs the overnight dataset refresh and the morning pricing load | Supplier throughout |
| Governance and compliance | Entitlements, non-advice and the internal-only rule | Approver; signs off any client-facing use later |
| End client, advisory and digibank self-directed | Indirect: the source of every signal; sees nothing from the chatbot | Not before full readiness |

## Product approach for the launch users

For launch, the HK ELI Chatbot is an internal desk tool for the people who run the HK ELI business: it replaces their daily Tableau checks with plain questions and a morning view of the whole business, finds where money is slipping, prepares priced ideas, and hands the follow-up to the sellers. Sellers are reached through these users, not directly.

The work of all three roles follows the same four steps, so the product is built around them:

1. **See the business.** A morning view of the whole HK ELI book after the overnight refresh: what matures, knocks out or is exercised in the next 10 business days, what was quoted and not traded, and where concentration sits. Any question in plain words, answered with the same figures as Tableau.
2. **Find the exceptions.** Rollover already runs above 80%, so the value is in the pockets below it (a branch, segment, underlying or RM), in idle clients and in quotes that did not trade. Each pocket shows the money at stake and how many signals agree.
3. **Prepare the response.** Priced ideas from this morning's shelf, ranked inside concentration limits (P1); tomorrow's shelf and starter packs (P2); a priority list for a team (P3).
4. **Hand off and prove it.** Send an idea or a list to the sellers through today's channels, marked internal only, then see from the blotter whether it converted.

| Area | Earlier approach (RM-first) | Approach for launch users |
| --- | --- | --- |
| Who opens it | An RM working their own book | P1, P2 and P3 working the whole business |
| Unit of work | One client to call today | A pocket of clients, an idea or a list to hand out |
| Scope | My book, my team | Whole HK, then district, branch, RM, segment, channel (advisory or digibank), underlying |
| Ending action | Call the client | Hand an idea or list to sellers; set the shelf; follow conversion |
| Pricing | Live quote on request | This morning's priced shelf; live quotes stay MVP2 |
| Freshness | One business date | Two clocks: data as of last night's close, prices as of this morning |
| Trust | Figures computed from data | The same, plus the same numbers as their Tableau views |
| Exposure | Internal, client material later | Internal only; nothing client-facing until feedback is good |
| Success at launch | Lead conversion | Adoption and feedback from about 70 users, then conversion by list |

Each role opens on its own start view of the same product: P1 on the morning view of maturities, knock-outs and quoted-not-traded with ideas; P2 on demand, concentration and the shelf; P3 on team performance against baseline and lists. What the earlier work got right stays: signals that agree instead of an AI score, evidence behind every row, concentration-aware ranking, and lead outcome read from the blotter.

## Journeys

Most of today's friction sits in rebuilding the same Tableau views, finding the exceptions by hand, and never knowing whether the follow-up converted. Six journeys cover the launch users and the clients behind them; J3, the contract lifecycle, is the one that carries the money. All of them run on data refreshed overnight and prices refreshed in the morning (J5).

### J1. GFM WMS specialist: from the morning view to ideas in sellers' hands

| Stage | What they do | Pain today | HK ELI Chatbot moment |
| --- | --- | --- | --- |
| 1. Start of day | Check what matures, knocks out or gets exercised soon, and what was quoted but not traded | Several Tableau views, the fixing file and blotter extracts | Morning view of the whole book after the overnight refresh, stamped with the data date |
| 2. Pick where to act | Choose the clients, RMs or underlyings that need an idea first | Manual filtering; small pockets missed | Pockets ranked by money at stake and how many signals agree, with the evidence rows |
| 3. Prepare the idea | Find a structure that fits the client or the pocket | Quote hunting, errors and invalid quotes | Ideas from this morning's priced shelf, top 5, refined by prompt, ranked inside concentration limits |
| 4. Answer an ask | An RM or branch asks for something on tech, 6 months, 15% coupon | Vague ask, 9 parameters to set | Plain words turned into the 9 pricing parameters; build-your-own with an indicative coupon |
| 5. Hand off | Send the idea and the client list to the RM or branch | Copying values into email or chat | Share or export the idea and list, marked internal only |
| 6. Follow up | See what traded | Nobody knows | Outcome read from the blotter |

### J2. CBG Treasury Sales Manager: from a slip to a team list

| Stage | What they do | Pain today | HK ELI Chatbot moment |
| --- | --- | --- | --- |
| 1. Review | Look at rollover, reactivation and quote-to-trade by branch and team | Tableau, after the fact | Team view against baseline (rollover 80%+), with the data date |
| 2. Spot a slip | A branch or segment rolls over well below 80%, or active clients fall | Found late, if at all | A pocket card naming branch, team, notional at stake and the clients in it |
| 3. Build a list | Clients maturing, idle or quoted-not-traded in that pocket | Built by hand in Excel | A list with the reason and a priced idea per client |
| 4. Hand to the team | Send the list to the branch specialists and RMs | Email and spreadsheets | Export or share, internal only |
| 5. Check | Did the list convert next week? | Unknown | Conversion by list, read from the blotter |

### J3. The ELI contract lifecycle

Every exit from an ELI is a sales moment: cash back is a rollover chance, and stock delivered after exercise is its own conversation. In the deck's example one district's rollover ratio fell far below baseline while a large block of its contracts was maturing, mostly at one branch; many key positions were exercised in one month, blocking a standard rollover and leaving many customers with pending rollovers or inactive. The nudge has to land before maturity, not after.

*[Diagram in the source doc: ELI contract lifecycle · 3 exits, 2 sales moments]*

Knock-out and maturity both return cash and lead to a rollover pitch; exercise delivers stock and needs a different conversation (R23).

### J4. CBG Product Manager: shelf, concentration and digibank demand

- Each day, before the morning pricing run, choose which underlyings and structures go into SPE bulk pricing for the ideas warehouse. No screen exists for this today.
- Watch demand: RFQs by underlying and sector, trending baskets, and what was quoted but not traded. With 90% of digibank trades self-directed, most of the demand signal is in the digibank quote log.
- Watch risk: top 10 concentrations and worst-of exposure, with breaches. One underlying holds a large share of outstanding in the sample data.
- Publish starter packs for P1 and P3.
- Read the monthly Business Update and adjust the shelf and the digibank journey.

### J5. A day of data: overnight refresh, morning pricing

1. Overnight: the dataset refreshes (blotter, fixing results, RFQ log, client mapping). Everything the chatbot says is as of the previous business day's close.
2. Morning: the desk prices the shelf P2 chose the day before, and the ideas warehouse fills.
3. Working day: users ask, drill and hand off. Every view shows two clocks, data as of last night's close and prices as of this morning.
4. Before the pricing run lands, ideas show yesterday's prices with a clear label. If a refresh fails, the chatbot says so instead of showing old figures as new.
5. A firm, live price comes only from the desk, outside the chatbot until MVP2.

### J6. Self-directed digibank client

Opens "Let's build your ELI", sets the 9 parameters, quotes, repeats dozens of times and leaves without trading. For the Product Manager this is a funnel problem. For the Treasury Sales Manager it is high intent with no conversion, which becomes a list for the team; showing it to RMs later needs a privacy decision.

With 90% of digibank trades self-directed, this journey is where most quote-to-trade value sits. At launch it is read through analytics by P2 and through lists by P3; nothing reaches the client.

### Later phase: RM and branch specialist journeys

The earlier journeys "RM: from morning list to rollover" and "TS: from client ask to priced idea" are parked until RMs and branch specialists join, after good internal feedback. They remain the long-term design target, and P1's journey reuses most of the TS steps.

## Needs

The launch users need to see the whole business without rebuilding Tableau views, to be shown where money is slipping, and to hand the follow-up to sellers in one step; everyone needs figures that match what they already trust.

| Persona | When... | I want... | So I can... |
| --- | --- | --- | --- |
| P1 GFM WMS specialist | the day starts | what matures, knocks out, gets exercised or was quoted but not traded, across all trades, with the data date | decide where to push ideas first |
| P1 GFM WMS specialist | an RM or branch asks for an idea | priced ideas from this morning's shelf in seconds, inside concentration limits | answer while the client is still engaged |
| P1 GFM WMS specialist | I have the idea and the clients | to send both to the RM or branch in one step, marked internal only | stop copying values between tools |
| P2 Product Manager | I set tomorrow's shelf | demand (quoted, traded, quoted but not traded, digibank included) and concentration side by side, before the pricing cut-off | pick the bulk-pricing universe and stay inside limits |
| P2 Product Manager | digibank clients quote and leave | a quote funnel by parameter and drop-off | improve the build-your-ELI journey |
| P3 Treasury Sales Manager | rollover or activation slips | a pocket card naming branch, team, notional and clients, and a list I can hand over | fix it this week instead of next month |
| P3 Treasury Sales Manager | a list has gone out | its conversion, read from the blotter | know which lists and teams work |
| All launch users | any figure looks odd | the rows behind it and the same number Tableau shows | trust it and explain it to others |
| All launch users | the chatbot gets something wrong or right | to say so in one click | shape it before it reaches RMs |
| Leaders | a period closes | a short narrative and uplift against the case | judge whether the business case is real |
| SPE desk | the shelf arrives | it in a clean format before the morning run | price it on time |
| Governance | anything is shown or exported | traceable figures, AI labelled, internal only | sign off the launch |

## Requirements

Forty-one requirements: 27 are Must for go-live. The 4 Nov answers re-point R1 to R35 at the launch users, raise the hand-off (R24) and the digibank funnel (R25) to Must, park client-facing material (R19), and add R36 to R41. Numbering is kept from earlier versions; the last column says what changed on 4 Nov. Phase separates what is designed in MVP1 from what the 8-week build delivers.

| ID | Requirement | Personas | Pillar | Priority | Phase | Changed on 4 Nov |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Plain-language questions answered with figures computed from data; the LLM only words the answer | P1, P2, P3 | 1a | Must | MVP1 build | Users are Tableau users, so answers must match their Tableau figures (R36) |
| R2 | Business Update in the fixed 14-section format, stamped with the latest business date | P2, P3, leaders | 1a | Must | MVP1 build | More central: it replaces a manual monthly Tableau routine |
| R3 | Views by district, branch, RM, segment, channel, product and underlying; launch users see all trades | P1, P2, P3 | 1a | Must | MVP1 build | Entitlement is now all trades; channel (advisory or digibank) added |
| R4 | Stock concentration and worst-of exposure, with breaches and affected clients | P2, P1, governance | 1a | Must | MVP1 build | No change |
| R5 | Maturity calendar with predicted result (KO, EXP, EXP below strike, EX) | P1, P3 | 1b | Must | MVP1 build | No change |
| R6 | Rollover opportunities for maturing or knocked-out notes, grouped into pockets below the 80% baseline, with a drill to clients | P1, P3 | 1b | Must | MVP1 build | Was an RM call lead; now an opportunity across the business |
| R7 | Reactivation opportunities: clients with no trade in 90+ days, by branch and segment | P1, P3 | 1b | Must | MVP1 build | Baseline "depends": define it first (open question 3) |
| R8 | Quoted, not traded: RFQs with no trade, advisory and digibank self-directed, as analytics and lists | P1, P2, P3 | 1b | Must | MVP1 build | Digibank included, since 90% of its trades are self-directed and users see all trades; client outreach still later |
| R9 | Each opportunity carries its reason, context and a next action for the seller | P1, P3 | 1b | Must | MVP1 build | Next action is for the seller the list goes to |
| R10 | Saved insight cards that can be modified and re-run | P1, P2, P3 | 1c | Should | MVP1 build | Replaces saved Tableau views |
| R11 | Idea search that extracts the 9 pricing parameters from plain words | P1, P2 | 1c | Must | MVP1 build | P1 is the main user |
| R12 | Top 5 ideas from this morning's priced warehouse, then refine by prompt; each idea shows when it was priced | P1 | 1c | Must | MVP1 build | Priced time shown (R37) |
| R13 | Live SPE pricing fallback with circuit breaker for trading hours and latency | P1, SPE desk | 1c | Should | MVP2 | No live quote request at launch |
| R14 | Personalised ideas from client trades, digital footprint and CIO house view | P1 | 1c | Could | MVP2 | No change |
| R15 | Threshold alerts by product, branch, measure and period | P2, P3 | 1d | Should | MVP1 design, MVP2 build | More valuable: managers prefer push |
| R16 | Scheduled reports to authorised recipients, with preview and run history | P2, P3, leaders | 1d | Should | MVP1 design, MVP2 build | No change |
| R17 | Fixing Visibility Hub: fixing results as a daily digest | P1, Ops | 1b | Should | MVP2 | Digest goes to P1 at launch, owner RMs later |
| R18 | Lead outcome capture: mark each opportunity traded or not within 10 business days (proposed) from the blotter, with a conversion and uplift view by list | P3, P1, leaders | 1b | Must | MVP1 build | Conversion also measured per handed-out list |
| R19 | Client-ready payoff explainer and idea pack | none at launch | 1c | Won't for launch | After good feedback and compliance sign-off | Internal only until fully ready |
| R20 | Guardrails: no advice or suitability claims, data-only figures, prompt audit, AI content labelled | All | Platform | Must | MVP1 build | Adds the internal-only rule (R39) |
| R21 | PM shelf curation: choose underlyings and structures for the morning bulk pricing; publish starter packs | P2 | 1c | Must | MVP1 build | P2 is now a primary user |
| R22 | Concentration-aware idea ranking: ideas that add to a breached or near-limit name rank lower and are flagged | P1, P2, governance | 1c | Must | MVP1 build | No change |
| R23 | Exercised-stock opportunities: client now holds stock, so suggest an ELI on it or an exit | P1, P3 | 1b | Should | MVP1 build | No change |
| R24 | Hand off: share or export any idea, pocket or list to sellers, with reasons, marked internal only | P1, P3 | 1b, 1d | Must | MVP1 build | Raised from Should; RMs are not in the tool, so the hand-off leaves it |
| R25 | Digibank quote-funnel and channel analytics | P2 | 1a | Must | MVP1 build | Raised from Should: 90% of digibank trades are self-directed |
| R26 | Data tables for new payoffs (Stepdown, BEN) | P2, data team | Work item 2 | Should | MVP1 build | No change |

R18 stays light: it reads outcomes from the blotter, so nobody logs anything. Ownership, status and reminders stay a later item.

### Additions from the Unusual Whales Trade Finder review

These nine requirements come from a walkthrough of Unusual Whales Trade Finder, Chat and Automations on 3 Nov 2026 (the "Unusual Whales discovery approach" in the Figma checklist). Most of them change how existing items work. The full notes are in [reference/unusual-whales-trade-finder-review.md](reference/unusual-whales-trade-finder-review.md).

| ID | Requirement | Personas | Pillar | Priority | Phase | Extends |
| --- | --- | --- | --- | --- | --- | --- |
| R27 | Rank by agreement: score each opportunity and idea by how many signals it matches ("3 of 6", "every signal agrees") and group results into those tiers; no opaque AI score | P1, P2, P3 | 1b, 1c | Must | MVP1 build | R9, R12, R22 |
| R28 | Three-part signal cards: every reason and idea filter shows what it is (the exact rule in plain words), why it matters, and keep in mind (caveats) | P1, P2, P3, governance | 1b, 1c | Must | MVP1 build | R9, R20 |
| R29 | Evidence on each row: expanding an opportunity or idea shows the trades, maturities or RFQs behind each signal, with a link to the source table | P1, P3, governance | 1b, 1c | Must | MVP1 build | R9, R36 |
| R30 | Intent-framed starter packs named for a business situation, such as "Rollover pockets below baseline", "Yield inside concentration limits", "Exercised into stock" or "Quoted, didn't buy (digibank)" | P1, P2, P3 | 1b, 1c | Should | MVP1 build | R21 (P2 curates the packs) |
| R31 | Hard filters stay hard: scope, segment, channel and concentration limits filter results and never count toward the agreement score | P1, P2, P3, governance | 1b, 1c | Must | MVP1 build | R3, R22, R38 |
| R32 | One-click handoff to chat: "Ask the HK ELI Chatbot about this" on every row, pocket, alert and report, with that context shown as a chip and 3 follow-up questions specific to it | P1, P2, P3 | All | Should | MVP1 build | R1 |
| R33 | One schedule form with a live summary, snap times, templates, several recipients, email, Teams and in-app delivery, test send, run history, pause and resume | P2, P3, leaders | 1d | Should | MVP1 design, MVP2 build | R16 |
| R34 | Multi-signal threshold alerts that people can see and edit ("3 of these 6"), each with its evidence and the chat handoff, quiet hours and a digest option | P2, P3 | 1d | Should | MVP1 design, MVP2 build | R15 |
| R35 | Morning business view: each weekday after the overnight refresh, the whole business or the user's chosen scope, grouped by how many signals each pocket hits, with next actions and a useful empty state | P1, P3 | 1b, 1d | Must | MVP1 build | R5 to R9, O1; was the RM's own-book digest |

What to avoid: Unusual Whales counts its "Narrow your focus" options as extra signals, so adding a liquidity filter grew one result set from 121 to 144 and diluted the score. R31 prevents this. Their reports also have no sources, so the HK ELI Chatbot keeps the business-date stamp and the source line on every output.

### Additions from the stakeholder answers (4 Nov 2026)

Six requirements follow directly from the stakeholder answers. Five are Must because launch users will compare every figure with Tableau, and widening to RMs depends on their feedback.

| ID | Requirement | Personas | Pillar | Priority | Phase | Why |
| --- | --- | --- | --- | --- | --- | --- |
| R36 | Tableau parity: the launch users' top day-to-day Tableau questions are answerable in chat with the same figures, and a mismatch is flagged rather than hidden | P1, P2, P3 | 1a | Must | MVP1 build | They are key Tableau users on D2D use cases; needs the list of dashboards (open question 1) |
| R37 | Two freshness clocks on every view and export: "Data as of close <date>" (overnight refresh) and "Prices as of <time> HKT" (morning pricing); clear states when pricing has not landed or a refresh failed | All | Platform | Must | MVP1 build | Dataset refreshes overnight, pricing in the morning |
| R38 | Scope switch: whole HK, district, branch, RM, segment, channel and underlying, replacing "my book" and "my team" | P1, P2, P3 | 1a, 1b | Must | MVP1 build | Users view all trades |
| R39 | Internal only: no client-facing output or client-sending action; every export and copy carries "Internal use only. Not for clients." | All | Platform | Must | MVP1 build | Internal until good feedback and fully ready |
| R40 | In-app feedback on every answer, view and list (useful or not, with an optional note), reported weekly | P1, P2, P3 | Platform | Must | MVP1 build | Good feedback is the gate for going wider |
| R41 | Role start views: the same product opens on the right first view per role (P1 morning view and ideas, P2 demand, concentration and shelf, P3 team performance and lists) | P1, P2, P3 | All | Should | MVP1 build | Three roles with different daily jobs |

## Insights and opportunities

With rollover already above 80%, the money is in the exceptions and in quotes that never trade, and the launch users reach clients only through the sellers they hand work to; finding the exceptions, handing them off and proving conversion is the product.

### Insights

- **Rollover is mostly working; the pockets are not.** At 80%+ the headroom is under 20% of maturing notional, concentrated in pockets; the deck's single example is one district far below it, not an average. Show exceptions against the baseline, not every maturity.
- **Quote-to-trade is the larger untapped lever.** 90% of digibank trades are self-directed, and the deck's example client sent dozens of quotes in one session without trading. P2 can act on it through the shelf and journey, P3 through lists.
- **A later trade shows linkage, not cause.** A trade after a handoff may have happened anyway. Count "linked conversion" with a match rule (same client, inside the window, related underlying) and compare with pockets that got no handoff before claiming uplift.
- **Two of three baselines are undefined.** Reactivation and quote-to-trade "depend", so the case cannot be measured until they are defined by segment and channel from the Oct to Dec 2026 data.
- **These users replace Tableau, so trust means the same numbers.** One mismatch with a dashboard they know will cost more adoption than any missing feature (R36).
- **The value reaches clients second-hand.** Launch users act through RMs and branch specialists who are not in the tool, so the hand-off (R24) and conversion by list (R18) are the proof of value.
- **It is a planning tool, not a live one.** Data is as of last night's close and prices are as of this morning; labels must say so, and live quotes stay with the desk.
- **Seventy internal users make validation cheap.** Feedback is the gate to widening, so build it in from day one (R40) and interview from the same group.
- **Growth and concentration still pull against each other.** One underlying holds a large share of outstanding in the sample data; unweighted ranking would push the book further into breach.
- **Product Managers feed the experience but have no screen.** The warehouse is only as good as the shelf they pick before the morning run.
- **Ops fixing is a quiet dependency.** Every rollover starts when a fixing result lands in the overnight refresh.

### Opportunities, ranked by fit to the business case

| # | Opportunity | Personas | Value lever | Effort (rough) |
| --- | --- | --- | --- | --- |
| O1 | Rollover pockets below baseline: maturities and likely KOs grouped where rollover lags 80%, with pre-priced, concentration-filtered ideas and a list to hand off | P1, P3 | Rollover conversion | Medium (R6, R12, R24, R18) |
| O2 | Quoted, not traded: digibank and advisory RFQs without a trade, as a funnel for P2 and lists for P3 | P2, P3 | Quote-to-trade | Medium (R8, R25) |
| O3 | Morning business view and chat that match Tableau | P1, P2, P3 | Adoption, productivity | Medium (R35, R36, R37) |
| O4 | PM shelf console using demand and concentration | P2 | Idea relevance, risk | Medium (R21) |
| O5 | Conversion tracker by handed-out list | P3, leaders | Proves the case | Low to medium (R18, R24) |
| O6 | Concentration-aware ranking | P1, P2, governance | Risk guardrail | Low (R22) |
| O7 | Reactivation cohorts by branch and segment | P3 | Reactivation | Low to medium (R7) |
| O8 | Exercised-stock playbook | P1 | Reactivation, AUM retention | Low to medium (R23) |

O1 is still the first thing to prototype, now for P1 and P3: it touches the largest money pool and runs entirely on data that already refreshes overnight.

## Decisions, open questions and validation

the stakeholder answers of 4 Nov settle users, entitlements, baseline, digibank, client exposure and freshness; eight questions remain, and about ten interviews with the launch users plus one data check should come before the designs freeze.

### Decisions

| Question | Decision | Decided by |
| --- | --- | --- |
| Product name | "HK ELI Chatbot", standalone for now; it will become part of Ask-MIRA later | Product lead |
| Launch users | About 70: GFM WMS specialists, CBG Product Managers and CBG Treasury Sales Managers. No RMs at this stage. Replaces "RM and TS, RM view default" and the one-district RM pilot | Stakeholders, 4 Nov |
| What "WMS" means | Wealth Management Sales and Specialists: the GFM desk that sells and structures ELIs for the wealth side | Product lead, 4 Nov |
| What users can see | All trades and holdings. Replaces "RMs see their own clients" | Stakeholders, 4 Nov |
| Lead ownership and reminders | Not needed now; outcome is captured automatically (R18) | Product lead |
| Must-haves before go-live | R18 and R21 (accepted by Product lead); R24, R25 and R36 to R40 proposed on 4 Nov | Product lead; 4 Nov additions to confirm |
| Baseline for the case | Rollover runs at 80%+ today. Reactivation and quote-to-trade "depend" and must be defined from the Oct to Dec 2026 blotter and RFQ log | Stakeholders, 4 Nov |
| Digibank scope | 90% of digibank trades are self-directed. In scope for analytics and internal lists; no client outreach | Stakeholders, 4 Nov; scope reading ours |
| Client-facing material | Internal only until feedback is good and the product is fully ready | Stakeholders, 4 Nov |
| Data freshness | Dataset refreshes overnight; pricing refreshes in the morning; a live firm quote comes from the desk (in-chatbot live quotes are MVP2) | Stakeholders, 4 Nov |
| Approach order | Revamp the approach around the new personas first; plan UI changes after it is agreed | Product lead, 4 Nov |
| Phase labels | Track "MVP1 design" and "MVP1 build" separately | Product lead |

### Open questions for the bank team

1. Which Tableau dashboards and questions do the three roles use every day? This is the parity list for R36.
2. What time does morning pricing land, and what is the cut-off for choosing tomorrow's shelf?
3. How should reactivation and quote-to-trade be measured, since the baseline "depends": by segment, channel or period?
4. How do ideas and lists reach RMs and branch specialists today (email, Teams, CRM), and is an Excel export allowed?
5. Do GFM WMS specialists need to request a live quote from inside the chatbot at launch, or is this morning's price enough?
6. Is the digibank channel owner a separate role, or part of the CBG Product Manager's job?
7. What counts as "good feedback" for widening to RMs: a score, a usage level, a sign-off?
8. What does "GC" mean in the alert cards, and which segments are in scope (Premier, Treasures, GC)?

Answered on 4 Nov: who the users are, what they see, the rollover baseline, digibank, client-facing content and freshness. The digibank privacy question is moot at launch because no RMs use the tool, and returns when they join.

### Validation plan

| Who | How many | What to learn |
| --- | --- | --- |
| GFM WMS specialists | 3 to 4 | Morning routine, the Tableau views they open, how ideas reach RMs, what makes a good shortlist |
| CBG Product Managers | 2 | How the shelf is chosen and by when, digibank funnel, review cadence |
| CBG Treasury Sales Managers | 2 to 3 | How they spot a slip, how lists reach teams, what conversion they track |
| SPE desk, Ops, Compliance | 1 each | Pricing cut-off, fixing timing, what the chatbot must never say or export |

Data check: pull one month of the master blotter and RFQ log to measure rollover by branch against the 80% baseline, size the pockets below it, and define reactivation and quote-to-trade; and collect the top 10 Tableau views for parity.

---

*Will be part of Ask-MIRA in future
