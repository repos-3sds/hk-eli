# Decisions and stakeholder answers

What has been settled since discovery, and who settled it. These override anything older in [discovery.md](discovery.md), the original HK ELI Figma or the colleague repos. Don't reopen them without asking the product lead.

## Stakeholder answers (the bank's business stakeholders, 4 Nov 2026)

These replace the earlier RM-first assumptions.

| Topic | Answer |
| --- | --- |
| Launch users | About 70 internal users: GFM WMS specialists, CBG Product Managers and CBG Treasury Sales Managers. They are Tableau users today with day-to-day (D2D) use cases. **Not RMs at this stage.** |
| What WMS means | Wealth Management Sales and Specialists: the GFM desk that sells and structures products like ELIs for the wealth side. GFM is Global Financial Markets, CBG is Consumer Banking Group. |
| What users can see | All trades and holdings |
| Baseline | Rollover runs at 80%+ today. Reactivation and quote-to-trade "depend" and still need a definition. |
| Digibank | 90% of digibank trades are self-directed |
| Exposure | Internal use only. Nothing client-facing until feedback is good and the product is fully ready. |
| Data freshness | The dataset refreshes overnight; pricing refreshes in the morning. Every view shows both clocks. |

The internal deck's quote-count and district rollover figures are single examples, not averages.

## Product decisions

| Decision | Detail | By |
| --- | --- | --- |
| Name | "HK ELI Chatbot", a standalone chatbot, not Ask Mira for now. Docs and screens end with the note "\*Will be part of Ask-MIRA in future". | Product lead, 3 Nov |
| Launch-user approach | The product is built around four steps for P1 GFM WMS specialist, P2 CBG Product Manager and P3 CBG Treasury Sales Manager: see the business, find the exceptions, prepare the response, hand off and prove it. RMs come later. See "Product approach for the launch users" in [discovery.md](discovery.md) and R36 to R41. | Product lead agreed, 4 Nov |
| Our own flows | Flows and journeys are our own design, based on discovery, the requirements, the business vision and the Unusual Whales Trade Finder review. The original HK ELI Figma is a starting point for look only (layout, colours, logo, header), not for flows (for example, not its CP01 to CP05 idea pack). | Product lead, 4 Nov |
| First scenario | GFM WMS specialist: maturing opportunity, then evidence, indicative ideas, hand-off, outcome | Product lead, 4 Nov |
| Hand-off | The hand-off leaves the tool (copy for Teams, CSV), marked "Internal use only. Not for clients.", and is recorded so conversion can be read from the blotter | Discovery decision card, accepted 4 Nov |
| Conversion wording | A trade after a hand-off shows linkage, not cause. Count "linked conversion" (same client, inside the window, related underlying) and compare with pockets that got no hand-off. | Product lead, 4 Nov |
| Lead outcome | Captured automatically from the blotter (R18). No lead ownership or reminders for now. | Product lead |
| Must-haves for go-live | R18 and R21, plus R24, R25 and R36 to R40 from the 4 Nov answers | Product lead |
| Phases | Track "MVP1 design" and "MVP1 build" separately (alerts and scheduler are designed in MVP1, built in MVP2) | Product lead |
| Done means | Measured against the launch-user approach, R36 to R41 and the stakeholder answers first | Product lead, 6 Nov |
| Audit priority | Fix the GFM WMS specialist flow first, then all critical first-time-user audit gaps | Product lead, 11 Nov |

## Technical decisions

| Decision | Detail | By |
| --- | --- | --- |
| Orchestrator | No Dify. Stork AI is the orchestrator, using its Gemini adapter for now. | Product lead, 3 Nov |
| Where AI is allowed | Figures, tables and lists are computed from data. The model only rewords the lead sentence of a chat answer, behind guardrails, with every call written to the prompt audit. See [gateway/README.md](../gateway/README.md). | Business vision principle 1, R1, R20 |
| Stack | The bank's engineering standards: Java 21 and Spring Boot 3.5, Angular 21 with Angular Material, MariaDB, Elasticsearch, OpenTelemetry and ELK, Vault, pinned versions, tests. Where the standards conflict with the points above (name, Stork AI, look), ours win. | Product lead, 3 Nov |
| Look | A dark Digimarkets-style widget, following the Digimarkets style guide, not the NPA or Inter look | Product lead, 3 Nov |
| Standalone screens | Screens work on their own. Widget-linking features (link icon, send to linked widgets) stay on screen but switched off. | Product lead, 3 Nov |
| Repository | All new code goes to this repo, github.com/repos-3sds/hk-eli. Never push to colleague repos (they are reference only). | Product lead, 3 Nov |

## Quality bar (the product lead's standing rule)

- Deliver complete flows end to end, not single screens. Every state counts: empty, loading, error and success.
- With each delivery, show the flow working, with screenshots or a walkthrough in step order, and a plain explanation of what the user does, what they see, and why.
- The chat experience must be polished: clear conversation structure, good typing and streaming feel, readable answer cards, consistent spacing and type, keyboard and focus handling, and helpful follow-ups.
- Self-review the UI against the Digimarkets style guide before handing over: alignment, spacing, contrast, copy and consistency.
- State which standard each piece follows. Raise gaps openly.

## Still open (needs the bank)

From discovery's open questions and the gateway: the launch users' Tableau view list (for R36 parity), the pricing cut-off time, how reactivation and quote-to-trade are measured, how lists reach sellers today, what counts as "good feedback" for widening to RMs, whether the digibank channel owner is a separate role, what "GC" means in the alert cards, real data behind the seed shapes, Stork AI endpoint and key, Vault paths, OTLP and ELK endpoints, and SSO at the API gateway.

## Other sources

| What | Where |
| --- | --- |
| Business Vision (live doc) | https://claude.ai/artifact/5PFzVjYm6PhVegKnBMog3k |
| Discovery Ultimate Edition (live doc) | https://claude.ai/artifact/65VGAxNmRegCAAew6qfYGP |
| UI impact plan for the launch users | https://claude.ai/artifact/CQT7BPm8PV3pTQgYQA3mDp |
| Repo coverage map | https://claude.ai/artifact/EQVmQeyDhVJfrZVFEPQ5Fk |
| FigJam discovery board (journeys, v2 scenarios, decision cards) | https://www.figma.com/board/itaYUQlu3xqwZDGVOl0Mik |
| Redesign in Figma (Digimarkets style guide, 9 screens) | https://www.figma.com/design/pNUYfynYbQZT6cP1LFAg2Y |
| Unusual Whales Trade Finder notes | [reference/unusual-whales-trade-finder-review.md](reference/unusual-whales-trade-finder-review.md) |

---

\*Will be part of Ask-MIRA in future
