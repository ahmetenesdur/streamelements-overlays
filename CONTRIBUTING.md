# Contributing to Multistream Chat Overlay

Thanks for your interest in contributing! This guide will help you get started.

## Project Structure

```
widget/          → StreamElements widget (runs in browser sandbox)
  widget.html    → Minimal markup (SE renders this)
  widget.css     → Design system — CSS custom properties + presets
  widget.js      → All logic: normalize → render → theme
  widget.json    → Field definitions (SE settings UI)
relay/           → Kick chat bridge (deploys to Railway)
  src/index.js   → WebSocket relay server
  test.cjs       → Relay unit tests
preview/         → Local development preview
  index.html     → Preview shell (no SE account needed)
  mock-se.js     → SE event simulator
test/            → Widget unit tests
  harness.cjs    → Lightweight DOM shim (no jsdom)
  widget.test.cjs → Widget logic tests
scripts/         → Build & validation
  build.mjs      → JSON validator + field counter
```

## Development Workflow

### 1. Local Preview

```bash
npm run preview
# Opens http://localhost:3000 with hot-reload
```

The preview simulates the SE environment — all platforms, alerts, and effects work locally.

### 2. Run Tests

```bash
npm test
# Runs: validate → relay tests → widget tests
```

All tests must pass before submitting a PR.

### 3. Build Validation

```bash
node scripts/build.mjs --check
# Validates widget.json field structure
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
ci: add Node 22 to test matrix
```

## Pull Request Checklist

- [ ] `npm test` passes (all tests green)
- [ ] `node scripts/build.mjs --check` validates
- [ ] New features include corresponding test cases
- [ ] CSS changes work across all 16+ presets
- [ ] No external dependencies added to widget/

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

Widget → Relay: `{ type: "subscribe", platform: "kick", channel: "<slug>" }`
Relay → Widget: `{ type: "message", payload: { ...kickFields } }`
Relay → Widget: `{ type: "alert", payload: { type: "sub", ... } }`
