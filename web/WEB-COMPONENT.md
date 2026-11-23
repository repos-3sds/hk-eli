# HK ELI Chatbot as a web component

The Digimarkets team integrates widgets as web components. This build turns the same widget source in `web/` into one custom element, `<hk-eli-chatbot>`. The standalone app used for the UAT demo is not changed: `npm run build` gives byte-identical output with or without this build in the repo.

*Will be part of Ask-MIRA in future.*

## Build

```bash
cd web
npm ci
npm run build:element      # dist/web-component/hk-eli-chatbot.js
npm run smoke:element      # loads the bundle in a DOM and checks it registers once, with no globals
npm run serve:element      # host test page on http://localhost:4300, /api/stork goes to the agent on :8050
```

GitHub Actions (`.github/workflows/web-component.yml`) runs the same steps on every push or pull request that touches `web/`, after the unit tests and the standalone build. The bundle is kept on the run as the artifact `hk-eli-chatbot-web-component` (30 days).

`dist/web-component/` holds:

| File | What it is |
| --- | --- |
| `hk-eli-chatbot.js` | The whole widget in one self-running script: code, lazy tabs, styles, icons and the Open Sans font (Latin subsets). About 800 kB, 280 kB gzipped. It makes no other requests except to the agent's API. |
| `hk-eli-chatbot.js.sha256` | Checksum, for the Digimarkets release record. |
| `manifest.json` | Version (package version plus commit), size, checksum, attributes and events. |
| `3rdpartylicenses.txt` | Licences of the bundled packages. |
| `index.html` | The host test page. |

## Embed

```html
<script src="hk-eli-chatbot.js"></script>
<hk-eli-chatbot api-base-url="/api/stork" role="wms" style="height: 870px"></hk-eli-chatbot>
```

The element fills the box the host gives it (minimum height 480 px). It shows the widget frame (title bar, tab rail, Today, Chat, Prompts). The Digimarkets header and side bar are not included, because the host draws them.

### Attributes

| Attribute | Default | Notes |
| --- | --- | --- |
| `api-base-url` | `/api/stork` | The agent's API, or the Java edge in front of it. Required in practice. |
| `config-url` | none | A JSON file in the same shape as `public/config/app-config.json`. Attributes win over it. |
| `role` | demo user | `wms`, `pm` or `tsm`. Changes apply in place. |
| `user-name` | demo user | Display name for the greeting and the demo identity header. Changes apply in place. |
| `time-zone` | `Asia/Hong_Kong` | |
| `as-of-date` | none | `YYYY-MM-DD`, to pin "today" for a demo. |
| `request-timeout-ms` | `20000` | |
| `start-tab` | `today` | `today`, `chat` or `library`. |

Any other attribute change restarts the widget with the new settings. A bad value stops the start, shows the reason inside the element and fires `hk-eli-error`.

### Property

`el.accessTokenProvider = () => token` (or a function returning a Promise). When set, calls to the agent's API through Angular's HttpClient carry `Authorization: Bearer <token>`. See gap 3.

### Events

Both bubble and cross the shadow boundary.

- `hk-eli-ready`, `detail.version`: the widget is up.
- `hk-eli-error`, `detail.message`: it could not start.

## How it works

- `src/elements/main.ts` is a second entry point. It reuses the app's routes, providers and components unchanged. The only files outside `src/elements/` that change are `angular.json` (a new `element` build configuration), `tsconfig.app.json` (excludes `src/elements/`), `package.json` and the lock file (scripts, plus `esbuild` pinned at the version Angular already uses).
- Each element runs its own small Angular application, so two widgets on one page don't share state.
- **Shadow DOM.** The widget renders in a shadow root. The app's global CSS (tokens, Material theme, shared classes) is rewritten so `:root`, `html` and `body` become `:host`, and goes first in the shadow root so component styles still win, as in the standalone app. Host page CSS doesn't reach the widget, and the widget's CSS doesn't leak out (screenshot 07).
- **Fonts.** Browsers ignore `@font-face` inside a shadow root, so the element registers Open Sans once on the host document, with the font files inlined.
- **Material overlays.** Menus, tooltips, dialogs and snack bars are placed inside the shadow root, not in `document.body`, so they keep the widget's styles (screenshots 04 to 06).
- **Routing.** Tabs route in memory. The widget never reads or writes the host page's address bar or history.
- **One file.** esbuild re-bundles Angular's output (including the lazy tab chunks) into one IIFE with the CSS baked in. The build fails if a dynamic `import()` is left.

## Screenshots

Taken from the host test page with the agent running locally (mock Tableau, model off). In `docs/web-component/`:

1. `01-standalone-today.png`: the standalone app, for comparison.
2. `02-host-today.png`: the element on a host page, Today tab.
3. `03-host-chat-answer.png`: a Chat answer with its pipeline steps.
4. `04-host-tooltip.png`: a Material tooltip inside the shadow root.
5. `05-host-history-menu.png`: the History menu (overlay) inside the shadow root.
6. `06-host-help-dialog.png`: the Help side sheet (dialog).
7. `07-host-noisy-css-pm.png`: loud host CSS (lime text, uppercase, pink buttons) stays outside; role switched to CBG PM in place.
8. `08-host-agent-down.png`: the agent can't be reached; the widget's own error state with Try again.
9. `09-host-bad-config.png`: a bad attribute (`role="rm"`); the element says why it didn't start.
10. `10-host-narrow-prompts.png`: a narrow host column; the widget switches to its compact layout.

## Gaps

1. **Live answers skip the interceptors.** The chat stream (`StorkChatDataSource.askStream`) calls `fetch` directly, so neither the token nor the demo identity headers reach `/v1/ask/stream`. This is true in the standalone app too. It's a small change in one file, left out here so the UAT app stays unchanged.
2. **"Open in Tableau" links.** The agent sends `/tableau/...` links relative to the page. Embedded, they resolve against the Digimarkets origin. Real Tableau links should come back absolute from the agent (or the edge).
3. **SSO hand-off.** The `accessTokenProvider` hook is ready, but the bank's edge isn't built yet. Digimarkets needs to confirm how it hands the token to a widget (property, event, or a shared session cookie on the same domain).
4. **Help and role picker.** In the standalone app they sit in the Digimarkets header, which the element doesn't include. Help is still reachable from the first-run card ("What can I ask?", "Glossary"). The role comes from the `role` attribute. The prompt library text still says "switch role in the header".
5. **Dialogs cover the whole page.** The Help side sheet uses fixed positioning, so it covers the host page, not just the widget. Fine for a full-screen widget; confirm with Digimarkets.
6. **Fonts.** Only the Latin and Latin Extended subsets are inlined (Greek, Cyrillic and others fall back to the system font). If Digimarkets already loads Open Sans, the inlined copy can be dropped to save about 110 kB.
7. **Bundle size.** 800 kB (280 kB gzipped), because Angular, Material and the font are all inside. If Digimarkets shares Angular across widgets, a module-federation build could share it instead.
8. **Pinned workflow actions** use version tags, not commit SHAs. Pin to SHAs if the bank's GitHub policy asks for it.
9. **Not yet tried inside the real Digimarkets shell.** The host test page is a stand-in.
