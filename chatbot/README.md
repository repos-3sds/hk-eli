# HK ELI Chatbot

*Will be part of Ask-MIRA in future

A chat page and API where internal HK ELI staff ask about the ELI book in plain words. Python agents: the model picks which tools to call, code runs them on the overnight SQLite book, the model writes the answer, and code checks every figure in it against the data before it is shown.

Launch users: GFM WMS specialists, CBG Product Managers and CBG Treasury Sales Managers. Internal only. The data refreshes overnight.

## Run it

```bash
chatbot/scripts/start.sh
```

Then open http://127.0.0.1:8040. The first run creates `chatbot/.venv`, installs the pinned packages, fetches the `skills-service` submodule and builds `business-db/out/business.sqlite` if they are missing.

Put a Gemini key in `chatbot/.env` (copy `.env.example`). Without one, the page uses local Ollama if it answers, and otherwise a no-model mode where code picks the tool and writes the answer (labelled "code answer").

Tests (offline, no model, no network):

```bash
cd chatbot && PYTHONPATH=. .venv/bin/python -m unittest discover -s tests -v
```

Screenshots of the flow in step order: `scripts/walkthrough.mjs` (needs `playwright-core` and a Chromium; see the file's header).

## How it is built

Same pattern as the Ask-MIRA engine in `local-llm-fintech-eval` (`agents/mira_agents/engine/loop.py`), cut down to HK ELI:

| Part | File | What it does |
|---|---|---|
| Tools | `eli_chat/tools.py` | 17 tools. 12 wrap Niharika's `eli.*` business skills unchanged. 5 are fixed queries on our extra book columns (client names, RMs, knock-out distance, RFQ terms, idea warehouse) that her skills do not read yet. Arguments are checked by code. |
| Skills bridge | `eli_chat/skills.py` | Imports her `BusinessAnalytics` (reviewed SQL, no model SQL) from the `skills-service` submodule and runs it on our book in USD. Her code is not copied or changed. |
| Agent loop | `eli_chat/agent.py` | Model chooses tools, up to 6 rounds, then answers. Streams events: tool steps, answer text, final card. |
| Figure check | `eli_chat/claims.py` | Every amount, percentage and count in the answer must equal a value in the tool results, within the rounding shown. Unmatched figures are listed under the answer. |
| Prompts | `eli_chat/prompts.py` | The one system prompt, the three personas and their suggested questions. |
| Models | `eli_chat/providers/` | One Gemini adapter over the google-genai client surface: public Gemini here, Stork (`ada_genai` `VertexClient`) in the office, same code. Plus local Ollama (`qwen3:8b`) and the no-model mode. One setting: `ELI_MODEL_PROVIDER`. |
| API and page | `eli_chat/server.py`, `web/` | Standard-library HTTP server. `GET /api/health`, `GET /api/config`, `POST /api/chat` (Server-Sent Events). Dark Digimarkets widget using the tokens from `web/src/styles/_tokens.scss`. |

## Standards this follows, and where it does not yet

- Follows: pinned versions (`requirements.txt`, `requirements.lock`), tests, credentials only in `.env` or the environment, read-only database access, no model-written SQL, Stork rules from `STORK-SETUP.md` (schema cleaner, thought signatures, low thinking, one client per process).
- Gaps, stated openly:
  - The bank stack is Java 21 / Spring Boot and Angular. This is a Python agent service. The plan is for it to sit behind the gateway as the agent sidecar, and for the Angular chat tab to call it, rather than replace either.
  - No sign-in or per-persona entitlements yet: every persona sees the whole HK book, and the server binds to 127.0.0.1 only.
  - The figure check reports, it does not block. A total or share the model works out itself shows as "Review".
  - No OpenTelemetry, ELK or Vault wiring yet. Logs go to stdout.
  - Data is the synthetic demo book (as of 2 Nov 2026). Revenue and prices are not in it.
