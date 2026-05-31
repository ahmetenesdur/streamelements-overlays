# Multistream Chat Overlay (StreamElements)

A fully customizable **multistream chat overlay** for StreamElements: shows
**Twitch + YouTube + Kick** chat in one unified, themeable feed with inline alerts,
custom emotes (7TV/BTTV/FFZ), sound effects, visual effects, and GitHub auto-update.

## Architecture (hybrid)

| Source | Path |
|---|---|
| Twitch + YouTube + SE alerts (follow/sub/tip/cheer/raid) | **native** via SE `onEventReceived` — no backend |
| Kick | **Railway relay** → WebSocket → widget (`relay/`, Phase 6) |
| 7TV / BTTV / FFZ emotes | public CORS APIs, fetched **client-side** in the widget |

Every source is reduced by `normalize*()` into one `UnifiedMessage` model; the
renderer only ever sees that model. Styling is driven by **CSS custom properties**
set from `widget.js` (`applyTheme`) — so the widget renders identically in
StreamElements and in the local preview, with no `{{field}}` templating.

## Repo layout

```
widget/        widget.html · widget.css · widget.json (Fields) · widget.js  ← deploy to SE
preview/       index.html + mock-se.js   ← local SE event simulator
relay/         Railway Node.js service (Kick ingest, Phase 6)
scripts/       serve.mjs (preview server) · build.mjs (validate + version stamp)
```

## Local development

```bash
npm run preview     # http://localhost:5173/preview/index.html
npm run validate    # validate widget.json + required files
npm run build       # stamp widgetVersion from package.json (for auto-update)
```

The preview page has a control panel to send Twitch/YouTube/Kick messages, fire
inline alerts, stress-test, and live-toggle layout/effects — no StreamElements
account needed.

## Deploy to StreamElements

1. Overlay editor → add **Custom Widget** → open the code editor.
2. Paste each file into its tab: `widget.html` → HTML, `widget.css` → CSS,
   `widget.js` → JS, `widget.json` → Fields.
3. Configure everything from the **Fields** panel (12 grouped sections).
4. For Kick, set **Relay WebSocket URL** + **Kick channel** in the Multistream group
   (after deploying `relay/` to Railway).

## Auto-update

The hidden fields `widgetVersion` + `widgetUpdateUrl` let StreamElements offer an
"update available" prompt when the GitHub copy is newer:

- `widgetUpdateUrl` → `https://github.com/ahmetenesdur/streamelements-overlays/blob/main/widget/`
- Release: edit → `npm run build` (bumps `widgetVersion` from `package.json`) →
  push to `main`.

## Status (roadmap)

- ✅ **Phase 0** scaffold + preview harness
- ✅ **Phase 1** core render (Twitch + YouTube, normalize model, badges, native emotes, delete, limit, merge)
- 🟡 **Phase 2** layout & theme Fields (implemented; fullscreen/fonts verification pending)
- 🟡 **Phase 3** roles + keyword highlight (done) · 7TV/BTTV/FFZ (implemented, network verification pending)
- 🟡 **Phase 4** inline alerts (done) · sound + full label config (implemented)
- 🟡 **Phase 5** effects: perspective/mask/crayon (CSS in place)
- ⬜ **Phase 6** Kick relay on Railway
- ⬜ **Phase 7** auto-update + OBS test + publish
