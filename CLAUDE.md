# HK ELI Chatbot: guidance for agents

Read this first. It records the decisions agreed on 19 Nov 2026, after a clean rediscovery of the "ELI Agentic Sales Analytics" spec. These decisions replace earlier design work. The Angular UI, the earlier Java gateway and the Moment Console design are set aside for now.

This repo is public. Don't commit internal bank material: people's names, internal figures, credentials, the real Tableau semantic catalog, or real data.

## What we are building

An internal chatbot for ELI (Equity Linked Investment) sales teams in Hong Kong. Users ask about the live ELI book in plain words. Every answer:
- is a number taken from Tableau
- is checked before it is shown
- comes with a short insight
- shows the same Tableau view, with the same filters, embedded beside it

It is a book-monitoring and predicted-KO/maturity opportunity tool. It is not a sales-performance tool.

Launch users are internal specialists and product managers, about 70 people. Nothing is client-facing.

## Decisions (19 Nov 2026)

1. **Launch scope.** Launch for all segments: TRE (Treasures HK), TPC and PB. Book, segment and worst-stock answers work for everyone. Maturity and predicted-KO answers cover TRE only, and each answer says so. A PB or TPC maturity question gets that limitation, never a guess. Adding PB/TPC maturity views is a later workbook change.
2. **Platform.** Python Stork, in the Ask MIRA pattern, plus a Java edge.
   - **Java 21 / Spring Boot edge:** sign-in (SSO), rate limits, the public API and audit.
   - **Python Stork service:** the question pipeline, Gemini (through the bank's adapter) and Tableau data.
   - They talk through versioned JSON Schema contracts. There is no Dify.
3. **Tableau changes.** We ask the workbook owners for 5 launch-blocking changes and 2 cheap ones:
   - **W1:** day-window field for predicted maturity
   - **W2:** data as-of date
   - **W3:** fix the duplicate view ID
   - **W4:** live-deals-only filter on 3 views
   - **W5:** confirm that calculations survive the data export
   - **W6:** worst-stock filter
   - **W7:** customer counts

   We make the ask by showing them a working proof of concept on a mock Tableau.
4. **Office checks.** 13 yes/no checks run in the office against the real Tableau and catalog. Only the differences come back. Nothing confidential leaves the office.
5. **Code decides, Gemini understands and writes.**
   - Gemini call 1 turns the question into intent, grain and concepts, and flags ambiguity.
   - Code then routes to a view using the spec's routing matrix and selection priority, resolves filters and builds the query.
   - Gemini call 2 writes the insight, and a checker rejects any number that isn't in the result.
   - Where the matrix gives several valid views or none, code may give Gemini a shortlist of only the compatible views, or ask the user.
6. **Ambiguity.** Ask only when the readings would change the answer materially and context can't settle them, for example predicted or contractual maturity. Ask for the one missing thing, never "more details". Resolve safe shorthand (TRE, D1, "next 30 days") automatically.
7. **Our own code.** A colleague's Stork prototype is a reference only. We take its good ideas: per-user Tableau sign-in, refuse rather than guess, hard limits, the chart and summary using the same filters, and quote checks. All code here is written fresh and improves on it.

## Core data rules

- Count only LIVE deals. Notional is `SUM(volume_bu)`.
- Never add customer counts (`COUNTD(cif_id)`) across groups.
- Keep percent-of-total denominators.
- Always label predicted fields as predicted, and scenario values as simulated.
- `wps` means the worst-performing stock only.
- Get numbers from Tableau "Query View Data" with `vf_` filters, as the signed-in user. No VizQL Data Service in v1.

## Plan

1. Lock decisions. Done.
2. Build the mock Tableau with the 12 views, as a proof of concept to show the workbook owners.
3. Build the Stork pipeline module by module (intent, concepts, routing, filters, query, validation, insight and errors). Each module gets tests from the spec examples and an evaluation set.
4. Build the chat, with the Tableau view embedded beside each answer.

*Will be part of Ask-MIRA in future
