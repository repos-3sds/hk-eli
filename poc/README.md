# HK ELI Chatbot

An internal chat assistant for the HK ELI book. A user asks a question in plain words; the service reads
the question, picks one of the HK_ELI Tableau views, queries it with exact filters as that user, checks the
result, and answers with the figures, a chart drawn from the same rows, the data date and the evidence.

The rule that shapes everything: **the model only reads the question and words the answer. Code picks the
view, the filters and the numbers.** Every figure in an answer comes from a Tableau view, and the model's
text is rejected if it holds a figure that is not in that evidence.

| Part | Where | What it does |
|---|---|---|
| Service | `hkeli_poc/app.py`, `__main__.py` | FastAPI on 127.0.0.1. API v1, health, pages. Sits behind the Java 21 edge (SSO, limits, audit) |
| Settings | `hkeli_poc/config.py`, `.env.example` | Every setting from the environment; secrets from Vault-rendered files (`<NAME>_FILE`) |
| Pipeline | `hkeli_poc/stork/` | Pre-parse, understand, data date, route, plan check, compile filters, fetch, validate, word, compose |
| Model adapter | `hkeli_poc/llm.py`, `stork/agent.py` | Gemini through the office model gateway: two structured calls, validated and audited, with rule and template fallbacks |
| Store | `hkeli_poc/db.py` | SQLite: conversations, answers, model-call audit, feedback. Numbered migrations |
| Knowledge base | `hkeli_poc/knowledge/` | Glossary (terms, concepts, allowed values), intent list, domain notes. Data, not code |
| Semantic catalog | `hkeli_poc/catalog/`, `stork/concepts.py`, `stork/values.py` | Concepts, the views that carry them, glossary, standard calculations (logical-query-mcp shape). Concept matcher and value translation; the office merges its real catalog with `office/import_catalog.py` |
| Prompt library | `hkeli_poc/prompts/` | Versioned prompts and Gemini response schemas; id, version and sha256 recorded per call |
| Tableau | `hkeli_poc/tableau_real.py`, `mock_tableau.py`, `workbook.py` | Real server (Connected App, per-user REST sign-in, Query View Data, embed) or the built-in mock workbook |
| Pages | `hkeli_poc/static/` | `/` chat with evidence pane, `/compare` W1–W7 side by side, `/workbook` view list |
| Office tools | `office/` | Preflight, clean-zip builder, IT-safe audit, zip verifier, smoke test, evaluation run |

## Office install

The full runbook with expected output is [OFFICE.md](OFFICE.md); the office checks are in
[OFFICE-CHECKLIST.md](OFFICE-CHECKLIST.md). In short, from the project folder:

```bash
python3.12 -V                                                     # 3.12.x
cp pip.conf.example ~/.config/pip/pip.conf                       # then fill in the JFrog index URL
python3.12 office/preflight.py --lock requirements-dev.txt --python 3.12
python3.12 -m venv .venv
.venv/bin/python -m pip install --no-cache-dir --require-hashes -r requirements.txt
.venv/bin/python -m pip install --no-cache-dir --require-hashes -r requirements-dev.txt   # tests only
.venv/bin/python -m pip check
.venv/bin/python -m pytest -q -p no:cacheprovider               # 111 passed
cp .env.example .env                                              # fill in office values
.venv/bin/python office/smoke_test.py                             # SMOKE PASS
./run.sh                                                          # http://127.0.0.1:8050, Ctrl+C to stop
```

Python 3.12, packages from JFrog only, wheels only, hashes checked. No Docker, no Node, no internet at run
time except the office model gateway and the office Tableau server.

## Develop

```bash
python3.12 -m venv .venv && .venv/bin/python -m pip install --require-hashes -r requirements-dev.txt
.venv/bin/python -m pytest -q
.venv/bin/python -m hkeli_poc            # mock Tableau, model off, http://127.0.0.1:8050
```

Change a dependency: edit `requirements.in` (runtime) or `requirements-dev.in` (tests), then recompile
outside the office (commands are at the top of each `.in` file) and re-run the tests in a fresh venv.

## Modes

| Setting | Values | Default |
|---|---|---|
| `TABLEAU_MODE` | `mock` (synthetic HK_ELI workbook, no network) / `real` (office Tableau server) | `mock` |
| `TABLEAU_EMBED` | `embed` (live view in the side pane) / `link` (open the view on the server) / `off` | `embed` |
| `LLM_MODE` | `off` (rules and templates) / `gateway` (Gemini through the office gateway) | `off` |
| `TRUST_EDGE_HEADERS` | `true` behind the Java edge (needs `EDGE_SHARED_TOKEN`) / `false` laptop demo | `false` |

Each answer says how it was produced (`meta.understanding`: rules, gateway, or gateway->rules when the model
failed a check; `meta.insight`: template, gateway, or gateway->template).

## API (v1)

| Call | Body or query | Returns |
|---|---|---|
| `POST /api/v1/ask` | `{question, site?, scenario?, conversation_id?, channel?}` (`channel`: `chat` default, or `insights` for questions a screen asks on its own; both are stored, only `chat` shows in history) | answer: status, headline, bullets, table, chart, caveats, evidence, embed, followups, as_of, meta, turn_id, conversation_id, request_id |
| `POST /api/v1/feedback` | `{turn_id, rating: 1 or -1, comment?}` | `{feedback_id}` (only on the caller's own answers) |
| `POST /api/v1/ask/stream` | same body as `/api/v1/ask` | Server-Sent Events: one `stage` event per pipeline step (`n`, `name`, `label`, `ms`) as it finishes, then one `answer` event with the same object as `/api/v1/ask` (or `error`) |
| `GET /api/v1/history` | `conversation_id?`, `limit?`, `channel?` (default `chat`) | the caller's recent turns in that channel |
| `GET /api/v1/config` | | non-secret settings and content versions |
| `GET /healthz`, `GET /readyz` | | alive; ready with store, knowledge, prompts, Tableau and model checks |
| `GET /api/embed/config`, `GET /api/embed/token` | | real Tableau only: embed settings and a 5-minute embed token for the caller |

Status values: `OK`, `OK_WITH_WARNING`, `NO_DATA`, `NEEDS_CLARIFICATION`, `UNSUPPORTED`,
`VALIDATION_FAILED`, `SYSTEM_ERROR`. Behind the edge, calls carry `X-Edge-Token` and `X-Eli-User`;
`X-Request-Id` is echoed or created.

## The mock workbook and W1–W7

The mock holds the 12 published HK_ELI views on synthetic data, in two versions: `current` (as the spec
describes it today) and `proposed` (with worksheet changes W1–W7). `/compare` runs one question per change
on both. All data is invented. `scripts/check_tableau.py` compares a real site with the view contract and
prints only names, counts and pass/fail.

## Semantic catalog and concept matcher

The catalog (`hkeli_poc/catalog/hkeli_catalog.json`, built by `scripts/build_catalog.py`) lists every
business concept, its aliases and allowed values, and which published views carry it. The shape follows
logical-query-mcp's catalog (datasources, entities, relationships, glossary, metrics) plus a `concepts` list
in the office catalog's own style, so the office's real catalog can be merged in without leaving the office.

The concept matcher runs inside the pre-parse step, after the regex hints, using logical-query-mcp's rules
re-implemented in memory: glossary readings of short forms, whole-word matching only, longest match first,
and an honest gap when the catalog knows a concept that no view carries. Value translation asks when a named
value fits several stored values ("Bay branch") and says so when it fits none ("D4"). Regex hints still win,
every value still comes from a list, and no model is involved. `CONCEPT_MATCHER=false` turns it off;
`office/compare_matcher.py` shows what changes.

## Known gaps

See [docs/AUDIT.md](docs/AUDIT.md), section "Open items". The main ones: the Java 21 edge is not built
yet, the live-embed decision is open (both ways work), the real value lists and the model gateway's exact
call shape are office checks, and conversation carry-forward is not implemented.
