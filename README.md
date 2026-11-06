# HK ELI Chatbot

The HK ELI Chatbot is a Digimarkets widget for Hong Kong Equity-Linked Investment sales. At launch it is for about 70 internal users (GFM WMS specialists, CBG Product Managers and CBG Treasury Sales Managers), internal use only. All data is fictional.

| Part | What it is | Status |
| --- | --- | --- |
| [`web/`](web/README.md) | Angular 21 front end: Digimarkets shell and the HK ELI widget (Today, Chat, Ideas, Shelf, Update, Alerts, Feedback) | Built. Runs on mock data or against the gateway |
| [`gateway/`](gateway/README.md) | Java 21 / Spring Boot 3.5 service behind the API gateway: the same API as the mock, Stork AI wording (Gemini adapter) with guardrails and a prompt audit, MariaDB storage for hand-offs, feedback and the audit | Built on the demo seed. Real data, Stork AI access, Vault and ELK need the bank |

## Run both

```bash
cd gateway && mvn spring-boot:run          # http://localhost:8080/api/hk-eli
cd web && npm install && npm run start:gateway   # http://localhost:4200, calls the gateway through a dev proxy
```

`npm start` in `web/` runs the widget on its own mock data, with no gateway.

## How the two stay in step

- `npm run export-seed` (in `web/`) writes the web fixtures to `gateway/src/main/resources/seed/`, so both serve the same invented business.
- `npm run export-golden` runs the web app's own mock data sources for 39 requests and writes what they return to `gateway/src/test/resources/golden/contract.json`. The gateway's `ContractTest` fails if it answers any of them differently.

*Will be part of Ask-MIRA in future.
