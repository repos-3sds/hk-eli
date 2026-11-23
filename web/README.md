# HK ELI Chatbot widget (web)

Angular 21 (zoneless, signals, Material) in the Digimarkets shell. Three tabs, all answered by the agent in [`../poc`](../poc/README.md):

- **Today**: greeting, ask box, two suggestions for the role, and insights worked out from the agent's answers over the HK_ELI Tableau views.
- **Chat**: answers with our own chart from the Tableau rows, verified figures, system notes, sources and proofs, and how the answer was produced. Live pipeline steps while it works, Stop, copy and edit, History and feedback stored by the agent (SQLite). "Open in Tableau" opens the same view with the same filters in a new tab.
- **Prompts**: the prompt library, different for each launch role.

Nothing in this app holds business data or client names: every figure and client comes from the agent.

```bash
npm install
npm start          # http://localhost:4200; /api/stork and /tableau go to the agent on :8050 (proxy.conf.json)
npm test
```

Runtime config is `public/config/app-config.json` (`gatewayBaseUrl`, `requestTimeoutMs`, `timeZone`, `asOfDate`, `marketHolidays`).

| Folder | What's there |
| --- | --- |
| `src/app/core/chat/` | `StorkChatDataSource` (ask, live stream, history, feedback), answer models, the prompt library |
| `src/app/core/insights/` | Today's insights, computed from the agent's chart data |
| `src/app/features/book/` | Today |
| `src/app/features/chat/` | Chat: store, answer card, chart, evidence |
| `src/app/features/library/` | Prompts tab |
| `src/app/shell/` | Digimarkets header, rail and widget frame, help |

## What-if card and live Tableau views

A what-if answer (`scenario` from the agent) shows `eli-scenario-card`: a slider over every step the agent
already worked out, with the words, tiles, stacked columns, transitions, breakdown and barrier ladder for the
picked step. Below it, `eli-tableau-views` embeds every view of the topic with the same filters
(`eli-tableau-viz`); the slider calls `changeParameterValueAsync` (Market Spot or Shock %) on each bound view.
Mock views answer over `postMessage`; real views use the Embedding API v3 with a Connected App token. See
`poc/docs/whatif-scenario.md`.
