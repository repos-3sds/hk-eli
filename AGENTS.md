# Working on the HK ELI Chatbot

Read [docs/README.md](docs/README.md) first. It points to the business vision and objective, the decisions and stakeholder answers, and the discovery (personas, journeys, requirements R1 to R41). Build to those, in that order of precedence: decisions, then vision, then discovery.

The short version:

- **What it is:** the HK ELI Chatbot, an internal Digimarkets widget for the people who run the Hong Kong ELI business. End user-facing docs with "\*Will be part of Ask-MIRA in future".
- **Objective:** measurable DVC uplift over 2027 to 2029 against the approved business case, from rollover pockets, reactivation and quoted-not-traded, proven by linked conversion against an Oct to Dec 2026 baseline.
- **Launch users (about 70, internal only):** P1 GFM WMS specialist (the GFM desk that sells and structures ELIs for the wealth side), P2 CBG Product Manager, P3 CBG Treasury Sales Manager. They see all trades and use Tableau today. Not RMs yet.
- **Rules that shape every screen:** figures come from data and the model only words them; two freshness clocks (data as of last night's close, prices as of this morning); insight is not advice; rank inside concentration limits; figures must match Tableau.
- **Architecture (Nov 2026 rediscovery, wins over older docs):** the Python Stork agent in `poc/` answers every question from the 12 HK_ELI Tableau views (code picks the view, filters and figures; Gemini only reads the question and writes the words; every figure is checked against the rows). `web/` is the Angular 21 + Material widget (Today, Chat, Prompts), and every figure and client comes from the agent. In the bank, a thin Java 21 / Spring Boot 3.5 edge (SSO, user identity, limits, audit to ELK, Vault) sits in front of the agent; it is not built yet. SQLite is the laptop and office-trial store; production uses MariaDB. Pinned versions and tests throughout.
- **Dify (24 Nov 2026, wins over the line above where they differ):** we are moving from the Stork API to Dify. The UI sends the question, Python assembles the context, Dify processes, fetches through our Python tools (or MCP) and streams, and Python grades and reflects. Two Dify apps are kept and compared: a Chatflow and an Agent (`poc/dify/`, report in `poc/dify/REPORT.md`). Only Python calls Tableau, as the user; Dify never sees client ids or Tableau secrets. Bank UAT stack: Web Components with Polymer Lit in Digimarkets, Java + Spring Boot, Python + Flask AI services, Elasticsearch, Enterprise ELK, ENAAS secrets.
- **Look:** dark Digimarkets style. Screens work standalone; widget-linking features stay visible but switched off.
- **Quality bar:** whole flows with empty, loading, error and success states, shown working with screenshots, self-reviewed against the Digimarkets style guide.
- **Data in this repo is fictional.** Never push to colleague repos.
