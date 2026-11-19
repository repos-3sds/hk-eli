# Working on the HK ELI Chatbot

Read [docs/README.md](docs/README.md) first. It points to the business vision and objective, the decisions and stakeholder answers, and the discovery (personas, journeys, requirements R1 to R41). Build to those, in that order of precedence: decisions, then vision, then discovery.

The short version:

- **What it is:** the HK ELI Chatbot, an internal Digimarkets widget for the people who run the Hong Kong ELI business. End user-facing docs with "\*Will be part of Ask-MIRA in future".
- **Objective:** measurable DVC uplift over 2027 to 2029 against the approved business case, from rollover pockets, reactivation and quoted-not-traded, proven by linked conversion against an Oct to Dec 2026 baseline.
- **Launch users (about 70, internal only):** P1 GFM WMS specialist (the GFM desk that sells and structures ELIs for the wealth side), P2 CBG Product Manager, P3 CBG Treasury Sales Manager. They see all trades and use Tableau today. Not RMs yet.
- **Rules that shape every screen:** figures come from data and the model only words them; two freshness clocks (data as of last night's close, prices as of this morning); insight is not advice; rank inside concentration limits; every hand-off is marked internal only and ends in a recorded outcome; figures must match Tableau.
- **Stack:** Java 21 / Spring Boot 3.5 (`gateway/`), Angular 21 + Material (`web/`), MariaDB, Elasticsearch, OpenTelemetry/ELK, Vault, pinned versions, tests. Stork AI is the orchestrator with the Gemini adapter. No Dify.
- **Look:** dark Digimarkets style. Screens work standalone; widget-linking features stay visible but switched off.
- **Quality bar:** whole flows with empty, loading, error and success states, shown working with screenshots, self-reviewed against the Digimarkets style guide.
- **Data in this repo is fictional.** Never push to colleague repos.
