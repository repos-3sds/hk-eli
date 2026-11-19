# HK ELI Chatbot · gateway

Java 21, Spring Boot 3.5. Serves `/api/hk-eli`, the paths the widget's gateway data sources call. All data is fictional.

## Run it

```bash
mvn spring-boot:run                                   # today's date, in-memory H2
mvn spring-boot:run -Dspring-boot.run.profiles=demo   # pinned to Tue 3 Nov 2026, as the tests are
mvn test                                              # 56 tests
```

Profiles: `demo` pins the date, `mariadb` uses MariaDB (`DB_URL`, `DB_USER`, `DB_PASSWORD`), `vault` reads secrets from Vault and switches logs to ECS JSON for ELK.

## Endpoints

| Path | What it does |
| --- | --- |
| `GET /freshness` | The two clocks: data as of last close, prices as of this morning |
| `GET /today/moments?scope=`, `GET /today/brief?scope=` | The 10-day strip and the morning brief for a scope (whole business, district, branch, RM, segment, channel, underlying) |
| `GET /clients/{id}/context`, `GET /clients/{id}/ideas` | A client's book and rollover ideas |
| `GET /evidence?ref=` | The rows behind a figure |
| `POST /quotes/requests`, `POST /leads/{id}/not-today` | Quote request to the desk (demo receipt), and "Not today" |
| `POST /ideas/read`, `POST /ideas/search`, `POST /ideas/price` | Idea Finder: plain words to filters, ranked ideas with the single limit rule, coupon for a custom ELI |
| `POST /chat/answers` | A chat answer: computed figures, lead sentence optionally reworded by Stork AI |
| `POST /handoffs`, `GET /handoffs`, `PATCH /handoffs/{id}/items/{itemId}` | Hand-off lists and their outcomes (linked trade, window closed, desk declined) |
| `POST /feedback`, `DELETE /feedback?topic=`, `GET /feedback/week` | Launch feedback and the weekly summary |
| `GET /audit` | The latest prompt-audit entries |
| `GET /actuator/health` | Health |

Errors are RFC 9457 problem details with a plain `detail` the widget can show.

## Where AI is allowed

Figures, tables and lists are always computed from data. Only the lead sentence of a chat answer is sent to Stork AI (Gemini adapter) for rewording, with the computed text as the only source. `Guardrails` rejects the wording if it adds a figure, reads as advice or a promise, adds a name, or runs much longer; then the template wording is shown. Every call is written to `prompt_audit` with the user, role, intent, prompt, model output, outcome and trace id, including when the model is off.

Stork AI is off by default. Turn it on with `STORK_AI_ENABLED=true`, `STORK_AI_ENDPOINT` and `STORK_AI_API_KEY` (from Vault in the bank). The request shape in `StorkAiClient` is our best reading until the Stork AI team confirms it.

## Who is calling

In the demo the widget sends `X-Eli-User` and `X-Eli-Role`. Behind the bank's API gateway the SSO token carries this instead, and `/audit` should be limited to the product team.

## What needs the bank

Real data behind the seed shapes (EQD master, outstanding stock, blotter, RFQ log, digibank quote log), the launch users' Tableau view list for the parity check, the Stork AI endpoint and key, Vault paths, the OTLP and ELK endpoints, and SSO at the API gateway.
