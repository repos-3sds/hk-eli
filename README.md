# HK ELI Chatbot

The HK ELI Chatbot is a Digimarkets widget for Hong Kong Equity-Linked Investment sales. At launch it is for about 70 internal users (GFM WMS specialists, CBG Product Managers and CBG Treasury Sales Managers), internal use only. All data in this repo is fictional.

| Part | What it is |
| --- | --- |
| [`poc/`](poc/README.md) | The agent: a Python Stork pipeline (FastAPI) that reads the question, picks one of the 12 HK_ELI Tableau views and its filters, queries Tableau, checks every figure and writes the answer (Gemini optional). Ships with a mock Tableau on invented data; `TABLEAU_MODE=real` points it at a real server. |
| [`docs/`](docs/README.md) | Business vision, decisions and discovery (public-safe copies). |
| [`web/`](web/README.md) | Angular 21 widget in the Digimarkets shell: Today, Chat and Prompts. Every figure and client comes from the agent. |

In the bank, a thin Java 21 / Spring Boot edge (SSO, limits, audit) will sit in front of the agent. It is not built yet; the earlier Java back end was removed with the old UI and stays in git history.

## Run

```bash
cd poc && python3 -m uvicorn hkeli_poc.app:app --port 8050   # the agent and mock Tableau
cd web && npm install && npm start                          # http://localhost:4200, /api/stork proxied to :8050
```

*Will be part of Ask-MIRA in future.
