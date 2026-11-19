# HK ELI Chatbot POC: mock Tableau and the W1–W7 worksheet changes

A small, runnable proof of concept to show the HK_ELI workbook owners why we ask for
worksheet changes W1–W7. It has three parts:

1. **Mock Tableau** (`hkeli_poc/workbook.py`, `mock_tableau.py`): the 12 published views of the
   HK_ELI workbook with their view names, record ids, dimensions, measures and filters, on
   synthetic data. Two sites: `current` (the workbook as the spec describes it today) and
   `proposed` (with W1–W7). It offers a REST-like Query View Data endpoint (`vf_` filters, CSV)
   and an embeddable view page.
2. **Thin Stork pipeline** (`hkeli_poc/stork/`): Python, Ask MIRA pattern. Code picks the view,
   the filters and the numbers; the text only uses numbers Tableau returned.
3. **Demo pages**: `/` (chat with the Tableau view beside it), `/compare` (W1–W7 side by side),
   `/workbook` (view list and what each change touches).

All data is invented. Nothing here is production code.

## Run it

| Where | How |
|---|---|
| GitHub Codespaces (no install) | Open the repo on GitHub → Code → Codespaces → create on this branch. The POC starts on port 8050 and opens in the browser. |
| Any machine with Python 3.11+ | `cd poc && ./run.sh` then open http://localhost:8050 |
| Tests | `cd poc && pip install -r requirements.txt && python -m pytest -q` |
| Frozen single page | `cd poc && python scripts/export_static.py out/hk-eli-poc.html` |

## The pipeline (one request)

| # | Step | Code | Spec it follows |
|---|---|---|---|
| 1 | Pre-parse (segment, D1–D3, branch, ticker, window, date) | `stork/understand.py` `preparse` | rediscovery 06 PL 11.1 C5; Filter Resolution |
| 2 | Understand (intent, grain, assumptions) | `understand` | Intent Classification contract; 03 IC 11.2 |
| 3 | Data as-of | `stork/pipeline.py` | 05 VI A6; W2 |
| 4 | Route by grain | `stork/plan.py` `route` | View Routing matrix; SV-5, SV-21 |
| 5 | Plan check (LIVE, TRE lock, window, measures) | `plan.build` | SV-2, SV-3, SV-7, SV-9; Query Generation 9-flag check |
| 6 | Compile one filter spec to `vf_` and embed filters | `plan.build`, `vf_query` | 04 RQ 11.4 (one spec, two compilers) |
| 7 | Query View Data as the user | `stork/tableau_client.py` | 06 PL 5.4; 04 RQ 11.1 |
| 8 | Validate result (empty, filter echo, share column, control totals, chart scope) | `pipeline._validate`, `_control_total` | Result Validation; 04 RQ 11.3; 05 VI A3 |
| 9 | Write the answer from validated numbers | `pipeline._write` | Insight Generation (fallback template); 05 VI A1 |
| 10 | Compose: embed URL, highlight, follow-ups | `pipeline._embed` | 05 VI A2, A4, A5 |

Status names follow the canonical model in rediscovery 05 VI 11.1 (`OK`, `OK_WITH_WARNING`,
`NO_DATA`, `NEEDS_CLARIFICATION`, `UNSUPPORTED`, `VALIDATION_FAILED`, `SYSTEM_ERROR`).

## What each W demo shows

| W | Question | As today | With the change |
|---|---|---|---|
| W1 | Which branches in D1 have the largest TRE predicted maturity in the next 60 days? | Can't answer: 30 days fixed in the sheet, `vf_` has no ranges | `vf_in_n60=TRUE`, chart uses the same filter |
| W2 | How much TRE ELI is predicted to mature in the next 7 days? (refresh failed) | Answers on 4-day-old data, window anchored on today | Reads data as-of, anchors on business date, warns it is stale |
| W3 | How many TRE customers are predicted to KO? | Duplicate record id hides the customer-count view | Routed to view 4, COUNTD answer |
| W4 | Compare outstanding ELI across districts for TRE | Population undeclared; totals don't reconcile with view 1 | LIVE declared; totals reconcile; exclusion rule stated |
| W5 | What percentage of outstanding ELI is TRE predicted KO? | Table calc not in the export; recomputing is not allowed | FIXED-LOD share exports and keeps the denominator |
| W6 | Which TRE clients have WPS 9988 HK maturing in the next 30 days? | Right answer, but the chart can't filter to the stock | Chart and answer match |
| W7 | How many TRE customers in D1 have predicted maturity in the next 30 days? | No customer count at that grain | `{EXCLUDE [Predict Result] : COUNTD([Cif Id])}` on the district view |

## Where the mock takes the cautious reading (to confirm with the owners)

- Views 8, 9 and 11 have no `deal_status` filter, so the mock includes matured deals in them today.
- `PERCENT_OF_TOTAL` on views 2 and 3 is a table calculation; the mock leaves it out of the export.
- View 8's segment-exclusion rule is unknown; with W4 the mock uses "excludes Treasures (TPC)".
- The `current` mock accepts a comma list of dates on `predict_maturity` (the "date list" workaround).
  Whether the real server accepts long lists is unverified, so answers that use it carry a caveat.

## Gaps (stated openly)

- **No Gemini calls yet.** Understanding uses deterministic rules and the answer text uses templates,
  so the demo is repeatable without a key. Gemini #1 (understanding) and #2 (wording with a number
  check) come in step 3 of the plan.
- **No Java 21 / Spring Boot edge.** SSO, rate limits and audit are not in the POC.
- **No real Tableau.** Connected App JWT, LUIDs, RLS and the Embedding API v3 are stood in for by the mock.
  The embed page takes URL filters; it is not `<tableau-viz>`.
- **Scenario (`market_spot`) is not simulated.** Views 9 and 10 list the parameter only.
- **Conversation memory is not kept.** Follow-ups are full questions with the scope written in.
- **Public repo.** This repository is public. The POC uses view and field names from the spec's
  synthetic catalog (`synthetic-hkeli-example`) and invented data only.

*Will be part of Ask-MIRA in future
