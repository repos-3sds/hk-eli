# HK ELI Chatbot: implementation audit for the office move (19 Nov 2026)

Audited: the POC in `poc/` at commit `ad4dcf6` (branch of the "Build POC to show Tableau owners" work).
Against: the discovery transcripts (`hk-eli-discover/`, 11 modules), the rediscovery architecture
(components C1–C19), the locked decisions, the bank's engineering standards (pinned versions, tests,
config through environment or Vault, structured logs), and the office handoff pack of 18 Nov (office
constraints, JFrog versions, IT-safe audit, clean-zip recipe).

Severity: **Critical** blocks office use or breaks a locked decision. **High** is a security or correctness
risk in normal use. **Medium** is a real gap with a workaround. **Low** is polish or later work.
Status: **Fixed** in this change, **Open** (with the owner or office check that closes it).

## Summary

| Area | Standard followed | Before | After | Open |
|---|---|---|---|---|
| Backend | Bank stack (Python service, pinned, tested), office constraints §2–4, C4/C18/C19 | 1 Critical, 3 High | Fixed | Java edge (C2), OTel export |
| API | Rediscovery C2/C14 answer object, versioned REST | 1 High, 2 Medium | Fixed | Typed response model (Low) |
| Database | Locked: SQLite for now; C3 conversation, C18 audit and feedback | 1 Critical (none existed) | Fixed | Carry-forward, retention |
| Agent configuration | Locked: model reads and words, code decides; C5, C6, C13, C17; EH §26 | 1 Critical (no model at all), 1 High, 1 Medium | Fixed | Gateway call shape (office B12) |
| Tableau integration | C10, C11, C15; Connected Apps direct trust; embed undecided | 1 Critical (one identity for all users), 1 High, 3 Medium | Fixed | Live-site checks B1–B11, embed decision |
| Knowledge base and glossary | Concept and Filter Resolution transcripts; C7 | 1 High (hard-coded in Python) | Fixed | Real value lists (B3, B4), full catalog (B9) |
| Prompt library | Insight Generation §3–6; C6/C13; Gemini schema subset | 1 Critical (no prompts) | Fixed | Per-view insight guidance (Low) |
| Office package | Office handoff pack (JFrog pins, hashes, IT-safe, clean zip) | 1 Critical | Fixed, verify READY | 3 test-only packages to prove in JFrog |

Tests: 31 before, 83 after (all pass on the JFrog-pinned versions, Python 3.12, from a fresh venv with
hashes). Evaluation set: 20 questions, 20 pass in rules mode.

## 1. Backend

| # | Sev | Finding | Status |
|---|---|---|---|
| B1 | Critical | Served on `0.0.0.0` (`run.sh`, devcontainer). The office allows `127.0.0.1` only. | Fixed: `HOST` defaults to 127.0.0.1 and `python -m hkeli_poc` refuses any other address |
| B2 | High | `run.sh` built a venv and installed on the fly from pins JFrog has not served (fastapi 0.115.6, uvicorn 0.32.1, pydantic 2.10.4), without hashes, with whatever `python3` was found. | Fixed: JFrog-proven pins, hashed universal lock for 3.12, `.python-version`, `run.sh` no longer installs |
| B3 | High | No central settings. Three modules read the environment on their own; `DEMO_TODAY` defaulted to 19 Nov 2026 in real mode too, so live answers would have counted windows from a frozen date. | Fixed: `config.py` (validated, fails with the setting's name, never its value); real mode uses the clock in `APP_TIMEZONE` |
| B4 | High | The serving path called the mock through FastAPI's `TestClient` (a test tool, deprecated with httpx in Starlette 1.x). | Fixed: `InProcessMock` with the same REST shape |
| B5 | Medium | No request id, no structured logs, an unhandled error could return a stack trace. | Fixed: JSON logs to stdout (ELK-ready), `X-Request-Id`, a `SYSTEM_ERROR` envelope with no internals |
| B6 | Medium | No security headers. | Fixed: CSP `default-src 'self'` (plus the office Tableau server only when embedding), nosniff, no-referrer, `no-store` on the API |
| B7 | High | The Java 21 / Spring Boot edge (locked decision 2: SSO, limits, API, audit) does not exist. | Open: the contract it must meet is built and tested here (`X-Edge-Token`, `X-Eli-User`, `X-Request-Id`, `TRUST_EDGE_HEADERS`). Building it is the next step; Maven needs single-threaded JFrog downloads |
| B8 | Low | OpenTelemetry traces and metrics (bank standard) are not emitted. | Open: logs carry request id and timings; add the OTel exporter once the office collector endpoint is known |

## 2. API

| # | Sev | Finding | Status |
|---|---|---|---|
| A1 | High | No identity: every call ran as `demo.user`, and `/api/embed/token` handed a Tableau embed token for the configured user to any caller. | Fixed: user from the edge (shared secret checked in constant time), embed token `sub` = the caller, issued only when `TABLEAU_EMBED=embed` |
| A2 | Medium | No versioning, conversation id, history or feedback. | Fixed: `/api/v1/ask`, `/feedback`, `/history`, `/config`; `/api/ask` kept as an alias for the pages |
| A3 | Medium | No readiness check. | Fixed: `/readyz` checks store, knowledge base, prompts, Tableau settings and model mode |
| A4 | Low | The answer is an untyped dict in OpenAPI. | Open: the shape is fixed by tests; a Pydantic response model can follow once the edge consumes it |
| A5 | — | Rate limits, CSRF and input limits beyond length are the edge's job (C2). | Open with B7 |

## 3. Database (SQLite for now)

| # | Sev | Finding | Status |
|---|---|---|---|
| D1 | Critical | There was no database: no record of questions and answers, no model-call audit, no feedback, nowhere to keep a conversation. | Fixed: `db.py`, standard library `sqlite3`, WAL, numbered migrations in `schema_version`. Tables `conversation`, `turn` (question, intent, view, filters, status, figures, timings, which path answered), `llm_call` (prompt id, version, sha256, model, latency, outcome; no prompt or answer text), `feedback`. A user can only read and rate their own answers |
| D2 | Medium | Follow-up carry-forward (Filter Resolution §18) is not implemented; follow-ups are full questions. | Open: the conversation table is in place for it |
| D3 | Low | No retention rule for stored questions. | Open: office decision (questions are internal data; the file never leaves the laptop) |
| D4 | Low | MariaDB later (bank standard). | Open: all SQL sits in `db.py` behind plain functions; migrations port one to one |

## 4. Agent configuration

| # | Sev | Finding | Status |
|---|---|---|---|
| G1 | Critical | No model calls at all. Understanding was regular expressions and answers were templates, so the two Gemini steps of the locked design did not exist. | Fixed: `llm.py` calls the office model gateway with Gemini `generateContent` and a response schema. Call 1 (`understand`) returns the intent contract; code checks every value against the intent list and glossary, keeps its own hints, and falls back to the rules on any problem. Call 2 (`write_answer`) sees only validated figures and table cells; a number check rejects any figure not in that evidence and any banned phrase, retries once, then keeps the template (C13, EH §26). Every call is audited |
| G2 | High | Model, timeout, retries and temperature were not configurable. | Fixed: `LLM_*` settings, key from a Vault file, office CA bundle, TLS always on, https enforced |
| G3 | Medium | The gateway's exact path and auth header are not known outside the office. If the office must use a client library instead of HTTP, the adapter is one class (`GatewayClient.generate_json`). | Open: office check B12 |
| G4 | Medium | Misreads the spec forbids: "contractual maturity" was answered as predicted maturity (Concept Resolution §11), and "ELI containing 9988 HK" as WPS = 9988 HK (§14). | Fixed: unsupported concepts in the glossary stop the answer with a plain reason |
| G5 | Low | No evaluation set. | Fixed: `tests/eval_questions.json` (20 cases) in the tests, and `office/run_eval.py` runs it with the real model and prints counts only |

## 5. Tableau integration

| # | Sev | Finding | Status |
|---|---|---|---|
| T1 | Critical | Real mode signed in to REST once, as `TABLEAU_USER`, for every user. Row-level security would not apply (C11 requires `sub` = the user). | Fixed: one REST session per user, renewed before expiry and once on a 401; an unknown session is refused, never mapped to another identity |
| T2 | High | Connected App secrets only from plain environment variables. | Fixed: `TABLEAU_SECRET_ID_FILE`, `TABLEAU_SECRET_VALUE_FILE` (Vault-rendered files) |
| T3 | Medium | The REST token was never renewed (240-minute default), so answers would start failing after a few hours. | Fixed (T1) |
| T4 | Medium | The embed decision is open: the POC proposed own charts plus "Open in Tableau" instead of the live embed. | Fixed as a setting: `TABLEAU_EMBED=embed` (live view, same filters, marks highlighted), `link` (opens the view on the server with the same filters), `off`. The decision stays open: office check B11 |
| T5 | Medium | The embedding script is the server's `latest` path (not pinned). | Open: `TABLEAU_EMBED_SCRIPT` makes it a setting; pin a versioned path if the office server offers one |
| T6 | Medium | `TABLEAU_SERVER` accepted `http://`. | Fixed: https only |
| T7 | — | Not yet run on a live office site: captions versus field names, value spellings, LUIDs, RLS. | Open: office checks B1–B10 (`scripts/check_tableau.py` now prints only names, counts and pass/fail) |
| T8 | Low | No per-user result cache until the next overnight refresh (C11). | Open: not needed for about 70 users |
| T9 | Low | `TABLEAU_CATALOG` defaults to `proposed`; the office workbook is `current` until W1–W7 land. | Open: set `TABLEAU_CATALOG=current` in the office `.env` (in the checklist) |

## 6. Knowledge base and glossary

| # | Sev | Finding | Status |
|---|---|---|---|
| K1 | High | There was no glossary or knowledge base as content. Segment words, ticker aliases, result words and branches were hard-coded in three Python files, so the office could not load the real value lists without changing code. | Fixed: `knowledge/glossary.json` (14 concepts with terms, allowed values, patterns and rules, including the unsupported ones), `intents.json` (13 intents plus unknown), `domain.md` (facts the answer writer may use). Validated at start-up; the understanding step and the prompts read them |
| K2 | Medium | Districts, branches and tickers are synthetic. | Open: office checks B3, B4 (edit the JSON in the office copy, re-run the tests) |
| K3 | Low | No Team Lead ID-to-name mapping. | Open: B3 |
| K4 | — | The full semantic catalog JSON cannot leave the office; `workbook.py` holds our draft view contract. | Open: B9 decides the loader's shape |

## 7. Prompt library

| # | Sev | Finding | Status |
|---|---|---|---|
| P1 | Critical | No prompts existed (with G1). | Fixed: `prompts/understand.v1.md`, `write_answer.v1.md` with JSON response schemas. Front matter: id, version, inputs, output schema, checks, banned phrases, changelog. The loader refuses a prompt whose placeholders and inputs differ; the schema check keeps to what Gemini accepts (no empty enum values, no type lists, known keys only); id, version and sha256 go into each answer's meta and the audit table |
| P2 | Low | Per-view insight guidance (Insight Generation §7–18) is not yet split into view-specific prompt parts. | Open |

## 8. Office package

| # | Sev | Finding | Status |
|---|---|---|---|
| O1 | Critical | Not installable in the office: unproven pins, no hashes, no Python version file, no `.env.example`, no preflight, no APPLY guide. | Fixed: `requirements.in` / `requirements.txt` (hashed, universal, Python 3.12, every runtime pin from the office's proven set), `requirements-dev.*`, `requirements-nohash.txt`, `.python-version`, `.env.example`, `pip.conf.example`, `office/` tools, `OFFICE.md`, `OFFICE-CHECKLIST.md`, APPLY.md beside the zip |
| O2 | Medium | Internal names in shipped files (a product name, a style-guide name, a person's name in a test). | Fixed: removed from every file that ships. The project's "will be part of" note is kept outside the zip only, because the office rule forbids internal system names inside it |
| O3 | Low | The Tableau Cloud trial workbook and its setup guide were built for another environment. | Fixed: kept in git, left out of the zip |
| O4 | — | Test-only packages not yet proven in the office JFrog: pytest 8.3.4, pluggy 1.5.0, iniconfig 2.0.0 (colorama 0.4.6 is Windows-only). | Open: the preflight proves them; runtime packages are all from the proven set |

## Open items, in the order we suggest

1. Run the office checklist (part A, then B1–B13) and send back the result lines.
2. Build the Java 21 edge to the contract in section 2 (B7).
3. Decide embed or link for launch after B11.
4. Load the real value lists into the glossary (B3, B4) and shape the catalog loader (B9).
5. Conversation carry-forward (D2), OTel export (B8), per-view prompt guidance (P2).
