# Office checklist

Part A proves the install. Part B are the 13 checks that only the office can run, because they need the
real workbook, the real semantic catalog, the model gateway or the edge. Each check sends back a result line
only (pass/fail, counts, names of views or columns): never values, rows, host names or user names.

## A. Install (from OFFICE.md)

- [ ] A1 `shasum -a 256` of the zip matches APPLY.md
- [ ] A2 `python3.12 -V` is 3.12.x and `uname -m` noted
- [ ] A3 both preflights say every pinned package downloads (or FAIL lines sent back)
- [ ] A4 `pip install --require-hashes` for both lock files, `pip check` clean, nothing built from source
- [ ] A5 `pytest`: 114 passed, 1 skipped (the MariaDB tests run when TEST_MARIADB_URL is set)
- [ ] A6 `office/smoke_test.py`: SMOKE PASS
- [ ] A7 `office/run_eval.py` (mock, model off): eval 20 of 20 pass
- [ ] A8 `office/compare_matcher.py` (mock, model off, packaged catalog): eval 20 of 20 both ways, concepts 15 of 15 with the matcher on, broken: none

## B. Office checks

Set `TABLEAU_MODE=real` and the `TABLEAU_*` lines in `.env` for B1 to B11 (with `TABLEAU_CATALOG=current`
until the W1–W7 changes are published).

| # | Check | How | Send back | If it differs |
|---|---|---|---|---|
| B1 | `vf_` keys: field name or caption | `scripts/check_tableau.py` with `TABLEAU_VF_USE_CAPTIONS=1`, then `=0` | which setting gives `OK` lines | set it in `.env` |
| B2 | Every view published, LUIDs and content URLs found | `scripts/check_tableau.py` | the `MISS` lines and the matched count | rename in the view contract (`workbook.py`) |
| B3 | District and branch values, Team Lead mapping | Look at the workbook's `cust_district` and `cust_branch` value lists | count of districts and branches; do they match the D1–D3 pattern (yes/no) | replace the values in `knowledge/glossary.json` (in the office copy only), re-run the tests |
| B4 | Stored spelling of `predict_result` values | The workbook's filter list for Predict Result | yes/no: `KO`, `EX`, `EXP`, `EXP(Below Strike)` exactly | edit the values in `knowledge/glossary.json` |
| B5 | How each maturity view filters its window (W1) | Open views 5, 6, 7 and note the date filter type | per view: fixed 30 days / relative date / other | tells the owners which W1 option fits |
| B6 | `deal_status` on views 8, 9, 11 and the view 8 exclusion rule | View 8, 9, 11 filters | per view: has LIVE filter yes/no; rule known yes/no | `population` and `hidden_rule` in `workbook.py` |
| B7 | CSV columns and table calculations (W5) | `scripts/check_tableau.py` `DIFF` lines | the `DIFF` lines (column names only) | header mapping in `stork/tableau_client.py` |
| B8 | `market_spot` range and default; scale of `wps_mtm` and MTM% | Views 9 and 10 parameter | range, default, scale (0-1 or 0-100) | scenario support is a later step |
| B9 | Real semantic catalog: does it have a views section like ours | Read the catalog JSON in the office | yes/no, and the top-level key names | shape the catalog loader on it |
| B10 | Row-level security on the detail view (view 7) | Ask "Which TRE clients have WPS 9988 HK maturing in the next 30 days?" as two users with different access | row counts per user (two numbers) | if equal when they should differ, RLS is not applied to Connected App sessions: stop and report |
| B11 | Embed: Connected App domain allowlist and the open decision | `TABLEAU_EMBED=embed`, ask a question, press "Open in Tableau"; then `TABLEAU_EMBED=link` | embed loads yes/no (and the error code if not); link opens yes/no | pick `embed` or `link` for launch |
| B12 | Model gateway call shape | Fill `LLM_*`, set `LLM_MODE=gateway`, run `office/smoke_test.py` then `office/run_eval.py` | the smoke `ask:` line (read by / worded by), the eval count and path lines | adjust `LLM_GATEWAY_PATH`, `LLM_AUTH_HEADER`, `LLM_AUTH_SCHEME`, `LLM_MODEL`; if the gateway needs a client library, see docs/AUDIT.md G3 |
| B13 | Java edge passes identity | With the edge in front: `TRUST_EDGE_HEADERS=true`, `EDGE_SHARED_TOKEN_FILE` set; ask as two users; `GET /api/v1/history` as each | 401 without the token (yes/no); each user sees only their own turns (yes/no) | fix the edge headers |

## C. Semantic catalog and concept matcher

| # | Check | How | Send back | If it differs |
|---|---|---|---|---|
| C1 | The real catalog merges | `office/import_catalog.py --office <catalog json>` | the whole printed block (counts and key names only) | if FAILED, the FAILED line; the packaged catalog stays in use |
| C2 | Answers do not get worse with the real catalog | `CATALOG_PATH=var/catalog-office.json`, then `office/compare_matcher.py` (mock first, then `TABLEAU_MODE=real`) | the printed lines | a `broken:` case number: send it; set `CONCEPT_MATCHER=false` until fixed |
| C3 | Generic aliases on concepts no view carries | the `single_word_aliases_on_no_view` count from C1 | the count | above about 20: read those aliases in the office and remove the generic ones from the merged copy |
| C4 | Value lists in the real catalog | does the catalog list values for districts, branches, predicted result (yes/no each) | three yes/no | if no, keep B3 and B4 (glossary edits) as the source of values |
| C5 | Is there a SQL copy of the ELI data (warehouse table or MariaDB) behind the Tableau extract | ask the data owner | yes/no, and the database type | yes: the later step (logical-query-mcp over MCP for questions outside the 12 views) becomes possible |
| C7 | The store runs on the bank's MariaDB | give the app an empty database and a user with SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES on it; first `TEST_MARIADB_URL=mariadb://user:pw@host:3306/<scratch db> .venv/bin/python -m pytest -q tests/test_store_mariadb.py` (it empties that database), then `DB_URL=mariadb://user@host:3306/<app db>` + `DB_PASSWORD_FILE` in `.env` and start | the pytest line, and `/readyz` showing `store: ok (mariadb, schema 2)` | a failing test name, or the MariaDB version (`SELECT VERSION()`); stay on SQLite until fixed |
| C6 | Can logical-query-mcp itself run here | are MongoDB, Elasticsearch 8 and MariaDB available to us, and are mcp 2.3.0, fastapi, pymongo, elasticsearch 8.19.3, PyMySQL in JFrog | yes/no per item | all yes and C5 yes: plan the MCP step; otherwise stay with the in-process matcher |

When a check changes a file in the office copy, note which file in the reply (not its contents), so the
same change can be made in the source and shipped in the next zip.
