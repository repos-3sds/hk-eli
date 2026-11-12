# HK ELI Chatbot

The HK ELI Chatbot is a Digimarkets widget for Hong Kong Equity-Linked Investment sales. At launch it is for about 70 internal users (GFM WMS specialists, CBG Product Managers and CBG Treasury Sales Managers), internal use only. All data is fictional.

| Part | What it is | Status |
| --- | --- | --- |
| [`web/`](web/README.md) | Angular 21 front end: Digimarkets shell and the HK ELI widget (Today, Chat, Ideas, Shelf, Update, Alerts, Feedback) | Built. Runs on mock data or against the gateway |
| [`gateway/`](gateway/README.md) | Java 21 / Spring Boot 3.5 service behind the API gateway: the same API as the mock, Stork AI wording (Gemini adapter) with guardrails and a prompt audit, MariaDB storage for hand-offs, feedback and the audit | Built on the demo seed. Real data, Stork AI access, Vault and ELK need the bank |
| [`business-db/`](business-db/README.md) | The demo business as one SQLite file in the HK ELI skills layout, built from the gateway seed, with reconciliation tests | Built |
| `skills-service/` | Git submodule: [niharika9714/HK_ELI](https://github.com/niharika9714/HK_ELI) at `e741fd7`, the Stork AI skill planner with typed `eli.*` skills. Unchanged; configured from [`config/skills-service.toml`](config/skills-service.toml) | Runs offline (fixture mode) on our SQLite book; live planning needs the bank's SDK |

## Run both

```bash
cd gateway && mvn spring-boot:run          # http://localhost:8080/api/hk-eli
cd web && npm install && npm run start:gateway   # http://localhost:4200, calls the gateway through a dev proxy
```

`npm start` in `web/` runs the widget on its own mock data, with no gateway.

## Run with the HK ELI skills service

The Chat screen can send book-level questions to the skills service. Client questions and advice stay with the gateway. Use three terminals:

```bash
git submodule update --init      # fetches skills-service at the pinned commit
scripts/start-skills.sh          # builds var/skills/business.sqlite, then serves HK_ELI on :8031 (needs uv; Python 3.12)
scripts/start-gateway.sh         # gateway on :8080 with ELI_SKILLS_ENABLED=true
scripts/start-web.sh             # widget on http://localhost:4200, open /chat
scripts/smoke-test.sh            # 8 questions; the 6 book-level ones must come back from the skills service
```

| Ask, for example | Answered by | Skills (scenario) |
| --- | --- | --- |
| "Top concentrations against limit" | Skills service; falls back to the gateway if it is down | `eli.risk.concentration` (Q1) |
| "Maturities and rollovers across the book" | Skills service | `eli.maturity.analyze` + `eli.rollover.opportunity` (Q6) |
| "Concentration by branch" | Skills service | `eli.branch.concentration` (Q7) |
| "Regional performance by district" | Skills service | `eli.regional.performance` (Q8) |
| "Digibank journey this month" | Skills service | `eli.digibank.journey` (Q9) |
| "Coupons by product" | Skills service | `eli.product.yield` (Q4) |
| Client questions, knock-outs, unmet demand, rollover below baseline | Gateway, as before | none |

The gateway (`gateway/src/main/java/hk/eli/gateway/skills/`) sends a typed plan, not free text, and polls the run. It maps the results into the existing answer blocks. Every figure keeps its evidence record, and the card shows "Demo data · not live", notes on what the answer does not cover, and an evidence table. After reading a run, the gateway deletes that run's saved chat on the service, because the service allows 20 per user. With `ELI_SKILLS_ENABLED` unset, the gateway behaves exactly as before.

Known gaps:
- The gateway signs in with the service's local test profile, which only works on one machine.
- Answers cover the whole HK book, because the skills take no RM or branch scope.
- No AI wording or planning yet. That needs the bank's `ada_genai` SDK, or a Gemini adapter and key.
- The trust line still says "words by AI" in offline mode.

## How the two stay in step

- `npm run export-seed` (in `web/`) writes the web fixtures to `gateway/src/main/resources/seed/`, so both serve the same invented business.
- `npm run export-golden` runs the web app's own mock data sources for 39 requests and writes what they return to `gateway/src/test/resources/golden/contract.json`. The gateway's `ContractTest` fails if it answers any of them differently.

*Will be part of Ask-MIRA in future.
