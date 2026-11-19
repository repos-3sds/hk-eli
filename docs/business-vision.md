# HK ELI Chatbot: Business Vision

Copied from the [Business Vision Claude Doc](https://claude.ai/artifact/5PFzVjYm6PhVegKnBMog3k) (version of 4 Nov 2026). If the two differ, the Claude Doc is newer; update this file to match.

Public version: people's names, the money figures of the business case and figures from the internal deck are left out. The full text is in the linked Claude Doc for those with access.

## Vision

**Every maturing ELI, every idle client and every unanswered quote reaches the right person, with a priced idea, before the moment passes.**

The HK ELI Chatbot turns ELI business data into insights, alerts and ready-to-pitch opportunities for the people who run the Hong Kong ELI business. At launch that is about 70 internal users: GFM WMS specialists, CBG Product Managers and CBG Treasury Sales Managers, who see all trades and hand the follow-up to the sellers. It is a standalone chatbot inside the Digimarkets workspace, going live in January 2027, internal only until feedback is good.

**Mission:** replace manual analysis and quote hunting with one trusted assistant that tells each person what needs them today, why, and what to offer.

**What success looks like by end 2029:** the business case's cumulative uplift delivered and measured against a pre-launch baseline, rollover held above its 80% norm with the pockets below it closed, quote-to-trade lifted where clients quote and walk away, and GFM WMS specialists finding a priced idea in seconds instead of dozens of RFQs.

This vision builds on the [discovery](discovery.md), which holds the personas, journeys and requirements behind it.

**Updated 4 Nov 2026** for the stakeholder answers: launch users are GFM WMS specialists, CBG Product Managers and CBG Treasury Sales Managers (not RMs), rollover already runs above 80%, 90% of digibank trades are self-directed, everything stays internal, data refreshes overnight and pricing in the morning.

## Problem and opportunity

ELI is growing across advisory and digibank channels, but finding the next sale still depends on people reading blotters and asking the desk for quotes. The money is in moments that pass quickly and are missed today.

| Today | Evidence | Opportunity |
| --- | --- | --- |
| Rollover runs above 80% overall, but the pockets below it are found by hand, often too late | Rollover 80%+ overall (4 Nov answers), yet single districts fall well below it while large notional is maturing | Pockets below baseline with pre-priced rollover ideas and a list to hand to sellers |
| Dormant clients get no reason to be called | Hundreds of inactive clients and a falling active-client count in the internal example | Reactivation leads with a reason and an idea |
| Pricing an idea is a trial-and-error loop | Clients send dozens of quotes in one session and never trade; 90% of digibank trades are self-directed | A daily pre-priced ideas warehouse with a top 5 shortlist |
| Reviews are assembled manually and arrive after the fact | Monthly reviews built from several tables | A scheduled 14-section Business Update and threshold alerts |
| Nobody can see whether a lead converted | No lead outcome in the deck or Figma | Outcome read from the blotter, so the uplift is measurable |
| Ideas can push the book into concentration breach | A single underlying makes up a large share of outstanding in the sample data | Concentration-aware ranking of ideas |

## Who it serves

At launch the users are about 70 people who run the HK ELI business and use Tableau for it today; they see all trades and reach clients through the sellers they hand work to. RMs and branch specialists join after good internal feedback.

| User | Value proposition | Mode | When |
| --- | --- | --- | --- |
| GFM WMS specialist (sells and structures ELIs for the wealth side) | "Shows me what is maturing, knocking out or quoted but not traded across the book, with priced ideas I can send to the sellers." | Pull: morning view, chat, ideas | Launch |
| CBG Product Manager | "Lets me set tomorrow's shelf from real demand, digibank included, inside concentration limits." | Both | Launch |
| CBG Treasury Sales Manager | "Tells me where rollover or activation slips, and gives me a list to hand my team." | Both: team view, lists, alerts later | Launch |
| Business leaders and sponsors | "Shows whether the business case is real." | Push: Business Update, uplift tracker | Launch, by report |
| Relationship Managers and branch specialists | "Tells me who to call today, why, and what to offer." | Pull | After good internal feedback |

The SPE pricing desk, Operations, the data and platform team and governance are not users, but each must say yes: the desk prices the shelf each morning, Ops supplies fixing results in the overnight refresh, and governance signs off what the chatbot may say and export.

## Product scope

One HK ELI Chatbot surface carries four pillars: 1a Conversational BI, 1b Client Opportunities and Leads, 1c Sales Insights and Idea Discovery, 1d Alerts and Automation Hub. MVP1, an 8-week build, delivers the chatbot and sales dashboard with insights, leads and ideas; alerts and scheduled reports are designed in MVP1 and built in MVP2.

**In MVP1:** a morning business view and plain-language BI that match Tableau, the Business Update, rollover, reactivation and quoted-not-traded opportunities across all trades, hand-off of ideas and lists to sellers, outcome capture, the top 5 ideas from this morning's prices, PM shelf curation, the digibank quote funnel, concentration-aware ranking, freshness labels and in-app feedback. **Later:** live SPE fallback, personalised ideas, threshold alerts and scheduled reports, the Fixing Visibility Hub, RM and branch users, client-ready material, and digibank outreach.

**Out of scope for now:** trade execution, advice or suitability statements, anything shown to clients, and RM or branch users until internal feedback is good.

## Business case and success metrics

The 2026 build is expected to return DVC uplift over 2027 to 2029, growing each year and many times the cost (figures in the internal Business Vision doc). The uplift comes from rollover and reactivation conversion, lead identification, sales productivity, customer acquisition, and turnover and revenue.

The case can only be claimed if it is measured, so every metric below is compared against a baseline from the master blotter and RFQ log for Oct to Dec 2026. Rollover already runs above 80% (4 Nov answers); reactivation and quote-to-trade "depend" and must be defined before targets are set.

| Metric | What it shows | Source | Baseline | Target |
| --- | --- | --- | --- | --- |
| **DVC uplift vs plan (north star)** | Is the 2027 uplift on plan? | Blotter, finance | Zero before go-live | The 2027 plan figure |
| Rollover ratio | Share of maturing or knocked-out notional that rolls into a new ELI, overall and per pocket | Blotter, fixing results | 80%+ overall today; per-branch figures to pull for Oct to Dec 2026 | Hold the overall; close pockets below it (set after baseline) |
| Reactivation rate | Share of 90-day-inactive clients who trade again | Blotter, client mapping | Depends; definition to agree | Set after baseline |
| Quote-to-trade ratio | RFQs that turn into trades, advisory and digibank | RFQ log, blotter | Depends; definition to agree | Set after baseline |
| List conversion | Clients on a handed-out list who trade within the outcome window | List log, blotter | Starts at go-live | Set after the first quarter |
| Time to a priced idea | Minutes from an ask to a shortlist | Chatbot logs | Dozens of quotes over most of an hour today | Under 1 minute (aim) |
| Launch adoption | Weekly active users out of about 70 | Chatbot logs | Starts at go-live | Set with the launch group |
| Feedback | Share of answers and views rated useful | In-app feedback | Starts at go-live | Agree what "good feedback" means before widening to RMs |
| Trust | Answers with an unsourced figure, or one that differs from Tableau | Audit sample, Tableau check | Starts at go-live | Zero tolerated |

## Guiding principles

Seven rules decide trade-offs when scope, speed and trust conflict.

1. **Figures come from data, words come from the model.** Every number is computed by SQL or a Python skill; the LLM never estimates, infers or fabricates a metric.
2. **Always stamped, always traceable.** Every answer shows its business date and can be traced to its source table.
3. **Insight is not advice.** A lead or idea is never a recommendation or a suitability statement; everything stays internal until feedback is good and the product is fully ready.
4. **Grow inside the limits.** Idea ranking respects concentration limits, so growth never pushes the book into breach.
5. **Every lead ends in an outcome.** If we cannot tell whether a lead converted, we cannot claim the uplift.
6. **One chatbot, scoped by role.** The same engine serves the whole business, a district, a branch or a team; launch users see all trades, and entitlements will narrow the view when RMs join.
7. **Say how fresh it is.** Data is as of last night's close and prices are as of this morning; every view and export shows both, and says so when a refresh is late.

## Roadmap

The build runs Sep to Dec 2026 and goes live in January 2027 for about 70 internal users: GFM WMS specialists, CBG Product Managers and CBG Treasury Sales Managers. RMs and branch specialists join only after the launch group's feedback is good and the product is fully ready.

The baseline must be captured during the build (Oct to Dec 2026), or year 1 uplift cannot be measured. MVP2 (alerts, scheduled reports, personalised ideas, live SPE fallback, Fixing Visibility Hub) follows go-live; its dates are not set yet. Years 2 and 3 carry larger uplift targets. Later, the HK ELI Chatbot joins Ask-MIRA.

## Risks, stakeholders and next steps

The biggest risk is shipping a good chatbot that cannot prove its uplift; the second is figures that differ from the Tableau views the launch users already trust.

### Risks and dependencies

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Figures differ from Tableau | Launch users stop trusting it and go back to Tableau | Get their top Tableau views; check parity before go-live (R36) |
| No lead outcome data | The business case cannot be shown | Build R18 before go-live; capture the Oct to Dec 2026 baseline now |
| No user research in the 8-week plan | Views and lists miss how the launch users actually work | About 10 interviews with GFM WMS, CBG PM and CBG TSM users before the designs freeze |
| PM shelf curation has no tool | The ideas warehouse is stale or irrelevant | Build the PM console (R21) in MVP1 |
| Ideas add to concentration | Book drifts into breach; governance blocks launch | Concentration-aware ranking (R22) |
| A wrong or invented figure | Loss of trust, compliance exposure | Data-only figures, business-date stamp, prompt audit |
| SPE pricing latency or errors | Slow or failed quotes | Daily pre-priced warehouse; live SPE only for firm quotes, with circuit breaker |
| Fixing data reaches owners late | Rollover nudges miss their window | Agree fixing data timing with Ops; Fixing Visibility Hub in MVP2 |
| Digibank privacy | Self-directed RFQs may not be shown to RMs later | Moot at launch (no RMs); get a ruling before RMs join |

### Stakeholders

Sponsors, a product owner, and owners for product and data, UX and UI, LLM and APIs, the SPE bulk-rate API and ideas warehouse, data and Tableau, and process and governance. Names are in the internal Business Vision doc.

### Next steps

- [ ] Agree this vision with the sponsors and product owner
- [ ] Pull one month of blotter and RFQ log to size the opportunity, and lock the Oct to Dec 2026 baseline
- [ ] Agree the revamped approach for the launch users, then plan the UI changes; run about 10 interviews with GFM WMS, CBG PM and CBG TSM users, the SPE desk, Ops and compliance
- [ ] Add R18 (lead outcome) and R21 (PM shelf curation) to the MVP1 build plan
- [ ] Prototype rollover pockets below baseline with the launch users
- [ ] Answer the open questions: the launch users' Tableau views, pricing cut-off, how reactivation and quote-to-trade are measured, how lists reach sellers, what counts as good feedback

---

\*Will be part of Ask-MIRA in future
