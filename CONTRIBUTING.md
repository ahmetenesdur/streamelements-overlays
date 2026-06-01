# Contributing to Multistream Chat Overlay

Thanks for your interest in contributing! This guide will help you get started.

## Project Structure

```
widget/          → StreamElements widget (runs in browser sandbox)
  widget.html    → Minimal markup (SE renders this)
  widget.css     → Design system — CSS custom properties + 3 presets (Editorial/Frosted/Slate)
  widget.js      → All logic: normalize → render → theme
  widget.json    → Field definitions (138 fields, 14 groups — SE settings UI)
relay/           → Kick chat bridge (deploys to Railway)
  src/index.js   → WebSocket relay server
  test.cjs       → Relay unit tests (11 assertions)
preview/         → Local development preview
  index.html     → Preview shell (no SE account needed)
  mock-se.js     → SE event simulator
test/            → Widget unit tests
  harness.cjs    → Lightweight DOM shim (no jsdom)
  widget.test.cjs → Widget logic tests (72 cases)
scripts/         → Build & validation
  build.mjs      → JSON validator, version sync, field counter
  serve.mjs      → Static preview server (port 5173)
docs/            → INSTALL.md
.github/         → CI workflow (Node 18/20/22 matrix) + tag-triggered releases
```

## Development Workflow

### 1. Local Preview

```bash
npm run preview
# → http://localhost:5173/preview/index.html
```

The preview simulates the SE environment — all platforms, alerts, effects, and every
widget field work locally. Use the **Feature demos** buttons to exercise grouping,
shared chat, age fade, float layout, and role colors quickly.

### 2. Run Tests

```bash
npm test
# Runs: validate → relay tests → widget tests (83 assertions total)
```

All tests must pass before submitting a PR. CI (`.github/workflows/ci.yml`) runs the same
suite on every push/PR to `main` across Node 18, 20, and 22. Tag pushes (`v*`) trigger the
separate Release workflow (`.github/workflows/release.yml`), which also runs `npm test`
before attaching widget files to a GitHub Release.

For relay-only changes:

```bash
cd relay && npm ci && npm test
```

### 3. Build Validation

```bash
npm run validate
# alias: node scripts/build.mjs --check
```

Checks: valid `widget.json`, required hidden auto-update fields, version sync between
`package.json` / `widgetVersion` / README, non-empty widget files, field type integrity.

To stamp a new version into `widget.json`:

```bash
npm run build
```

## Code Style

- **No external dependencies** in the widget — it must be self-contained for SE sandbox
- **CSS-first design** — use custom properties and `data-*` attributes over JS DOM manipulation
- **Token-first theming** — all visual values go through CSS custom properties set in `applyTheme()`
- **Defensive normalization** — every `normalize*()` must handle `null`/`undefined` gracefully
- **`htmlEncode()` everything** — all user text must be escaped before `innerHTML` injection

## Commit Messages

Use conventional commits:

```
fix: resolve zero-width emote overlay positioning
feat: add colon separator toggle
refactor: eliminate mapFromObject in renderText
test: add error boundary test case
ci: point npm cache at relay/package-lock.json
docs: align INSTALL field labels with widget.json
```

## Pull Request Checklist

- [ ] `npm test` passes (all 83 assertions green)
- [ ] `npm run validate` passes (version sync if you bumped `package.json`)
- [ ] New features include corresponding test cases in `test/widget.test.cjs` or `relay/test.cjs`
- [ ] CSS/visual changes verified across all **3 style presets** (Editorial, Frosted, Slate) and key layouts (vertical, horizontal, fullscreen)
- [ ] No external dependencies added to `widget/`
- [ ] Field label changes in `widget.json` reflected in `docs/INSTALL.md` where user-facing

## Architecture Notes

### Data Flow

```
SE Event / Relay WS  →  normalize*()  →  UnifiedMessage  →  handleChat()  →  addMessage()  →  DOM
```

### UnifiedMessage Shape

Every platform normalizer produces the same `UnifiedMessage` shape (see JSDoc in `widget.js`). This is the single contract between data ingestion and rendering.

### Emote Pipeline

```
7TV/BTTV/FFZ APIs  →  customEmotes Map  →  renderText()  →  <img class="emote">
                       key: name                              (+ emote--zerowidth for overlays)
                       val: {url, zw}
```

### Relay Protocol

Widget → Relay: `{ type: "subscribe", platform: "kick", channel: "<slug-or-id>", token?: "<RELAY_TOKEN>" }`
Relay → Widget: `{ type: "subscribed", platform: "kick", chatroomId: "<id>" }`
Relay → Widget: `{ type: "message", payload: { ...kickFields } }`
Relay → Widget: `{ type: "alert", payload: { type: "sub", ... } }`

The `token` field is sent only when **Relay access token** is set in the widget and matches
the relay's `RELAY_TOKEN` env var.

See [`relay/README.md`](relay/README.md) for deploy, Cloudflare slug workaround, and token setup.
