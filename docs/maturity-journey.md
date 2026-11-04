# GFM WMS maturity → seller handoff: reviewable first cut

4 November 2026. Prepared against source checkout 31a937c0b660e78e6c3e783ad47266cd8d9d1bac. All examples are fictional. This working copy is isolated from the original checkout.

## Proposed journey

Scenario: a specialist sees an investment maturing next week. The launch audience is approximately 70 internal GFM WMS, CBG Product Manager and CBG Treasury Sales Manager users. RMs and branches receive work outside the application. The ten-business-day opportunity list preserves the existing discovery-board scope; a next-week-only filter is not yet implemented.

| Step / decision | Information needed | Action | Exceptions and assumptions |
| --- | --- | --- | --- |
| 1. Is this maturity worth investigating now? | Maturity date, event identity, available client scope, notional, owner, rule-based signals and snapshot date; branch/team rollover context if available. | Review the maturity queue and select a client. | Empty snapshot differs from service failure. Current adapter only exposes `team`, not all-trades entitlement. Queue is a starting point, not a validated opportunity score. A maturity does not guarantee reinvestable cash. |
| 2. Is there enough context to form an idea? | Outstanding ELI, maturity amount, last trade, concentration and limits, recent RFQs, owner, risk profile, rules and sources. Current client intent and business priorities must come from people. | Inspect evidence and exceptions; proceed to ideas or stop and clarify with the seller. | Stale/missing profile or owner cannot be interpreted as approval. Existing mock evidence endpoint returns aggregate rows, not actual client transactions: do not present it as client-level proof. Context page exposes the actual signal rules and caveats instead. Business pocket baselines and owner branch mapping remain absent. |
| 3. Which indicative ideas deserve discussion? | Comparable coupon, KI, strike, tenor, underlying exposure, concentration change, signal rationale and exact priced timestamp. | Select up to three shelf ideas, explore existing Idea Finder/custom builder if needed, or request desk pricing after explicit confirmation. | Three-idea limit is a design assumption. Current fixtures contain previous-day 18:00 prices, not morning-run prices. Date labels preserve this. Same-day does not establish freshness; expiry/validity rules need a contract. Over-limit ideas cannot be selected in this cut. Desk-request receipt is not firm terms. On an uncertain request failure, check the desk log before retrying. |
| 4. Can the seller act on this information? | Client/maturity, why now, evidence with sources, selected terms, both clocks, recipient, specialist context, requested next action, any RFQ receipt. | Review the pack and mark a draft prepared. | No channel, recipient directory, persistent draft store, attachment, delivery or acknowledgment is connected. UI says session-only and unsent. Firm-price-before-handoff policy is unresolved; an indicative pack is only an internal discussion draft. |
| 5. What should happen next, and what was observed? | Delivery and acknowledgment evidence, follow-up owner/date, seller response, refreshed blotter and explicit matching rules. | Coordinate follow-up outside this prototype; review existing history separately. | Delivery and acknowledgment remain unknown. No trade is linked to this draft. Proposed same-client/window/related-underlying linkage is a hypothesis; association does not prove causation. Unmatched or absent overnight trades are not proof of failure. |

## Screen flow and visual treatment

`Maturity queue → Context & evidence → Ideas & pricing → Handoff preview → Follow-up`

The persistent shell and navigation are reused. Each step has a numbered navigation control, one main decision area and a quieter working-context panel. Opportunities use compact scan-friendly rows with date, client, reason and signal agreement. Context uses three numeric summaries, a source/rule table and concentration/RFQ cards. Idea cards align terms in four columns and distinguish comparison, explanation, desk request and selection. Handoff is an editable preparation form beside a reviewable pack. Follow-up separates unknown delivery status from historical trades. Narrow widths stack the context panel and cards; wide evidence tables scroll within their container.

Uses existing Digimarkets tokens: Open Sans, navy/slate surfaces, orange small headings, blue primary actions, 4/8px radii and existing spacing scale. The original Figma shell screenshot (node 1:10272) was inspected: dark navy widget, orange caps title, narrow rail and dark input area. Layout is intentionally task-oriented rather than reproducing its large chatbot landing canvas.

Loading, service error with retry, valid empty opportunity list, empty idea set, missing RFQ history, previous-day price, over-limit idea and uncertain desk-request states have explicit copy. Keyboard focus is visible; step controls are navigation with `aria-current=step`; status changes use status/alert roles; selected actions expose pressed state. No animation is required.

## Role involvement: hypotheses to validate

- **CBG Product Manager:** owns/curates the priced shelf, helps resolve concentration and product availability, and reviews aggregated shelf demand. No mandatory approval gate has been inserted. Limit-setting authority is unverified.
- **CBG Treasury Sales Manager:** identifies branch/team pockets, coordinates the responsible seller and reviews follow-up gaps with GFM WMS. Does not approve every client idea by default.
- **GFM WMS specialist:** investigates the opportunity and prepares an explainable internal handoff. The seller confirms the client's current intent and any execution/suitability requirements through existing processes.

## Evidence reviewed

- [Discovery board, proposed GFM WMS journey](https://www.figma.com/board/itaYUQlu3xqwZDGVOl0Mik?node-id=20-1246): five stages, overnight/morning clocks, indicative/firm pricing and handoff-channel questions.
- Board nodes 1:5 and 1:9: three launch personas, approximately 70 users, Tableau/SPE/email/Teams/Excel touchpoints. Board personas remain proto-personas.
- Board nodes 21:1265, 21:1312: PM shelf decisions and TSM gap/follow-up decisions; 21:1359 explicitly leaves routing, pricing clocks and causal claims open.
- [HK ELI visual reference](https://www.figma.com/design/1P7HFxz01fdOBMo4YPEz8d?node-id=1-10272); repository `web/src/styles/_tokens.scss` and `web/README.md` document the adopted Digimarkets visual language.
- Existing Today data contracts/mock fixtures, business clock/calendar, evidence and concentration components, Idea Finder/custom builder and quote confirmation flow. No applicable AGENTS.md found at the checkout or ancestor paths checked. No board mutations were made.

## Implementation scope and remaining gaps

Added only the maturity feature's TS/template/styles, a lazy `/rm/maturity` route and a Maturity tab. Existing `/rm` paths and RM-first screens remain to preserve unrelated work; these are technical legacy paths, not a claim about launch roles. Current session service still uses its pre-existing fictional RM identity. Product-wide identity, entitlement and terminology migration is outside this first cut.

The queue, client and ideas use `TodayDataSource`, not a second data model. Desk requests reuse the existing adapter and provide confirmation/receipt/error feedback. No backend service was added. Pack preparation is session-local and cannot send messages or imply delivery. Existing Idea Finder is linked for broader/custom exploration; returning selections from that screen into the draft remains a gap.

Priority validation: all-trades permissions and branch mapping; specialist prioritisation; client-level evidence rows; PM/TSM responsibilities; morning-run publication time and quote validity; whether indicative internal handoffs are permitted; approved channel/recipient verification; durable follow-up owner/date and delivery state; explicit trade matching and measurement design. The board's 58 quotes / ~45 minutes and D3 ~45% are single examples, not benchmarks.

## Verification

- Production build passed; component stylesheet is 6.77kB, 772 bytes above the existing 6kB warning budget and below its 10kB error budget. No budget was raised.
- 13 test files / 71 tests passed, including three new regression tests for handoff gating/non-attribution and distinct empty/error snapshot states.
- Browser walkthrough: selected Chan's 9 November maturity, reviewed evidence, compared prior-day indicative terms, selected an idea, entered a fictional recipient/action, prepared the unsent draft and reviewed unknown delivery/acknowledgment plus unattributed history.
- Browser also verified initial loading, valid empty snapshot and error with retry. No real desk request, message, deployment or board edit was made during testing. A narrow 800px browser viewport was also visually checked; smaller mobile widths remain unverified.
- Local preview: http://127.0.0.1:4304/rm/maturity (server must remain running). Use `?scenario=empty`, `?scenario=error` or `?scenario=slow` for adapter states. Prices in the existing fixture naturally show the older-price state.
