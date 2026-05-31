# Multistream Chat Overlay (StreamElements)

A fully customizable, **professional multistream chat overlay** for StreamElements —
shows **Twitch + YouTube + Kick** chat in one unified feed with a clean, modern
"broadcast editorial" look (no AI-slop boxes/gradients), inline alerts, custom
emotes, pronouns, roles, sounds, effects, and GitHub auto-update.

## Features

**Platforms** — Twitch + YouTube (native via StreamElements) + Kick (via the
bundled Railway relay). Per-platform show/hide: use one platform or combine any subset.

**Look & layout**
- 3 style presets: **Editorial** (text on video), **Frosted** (clean glass panel),
  **Slate** (solid chip) — plus full token overrides.
- 3 layouts: **Vertical** (corner column), **Fullscreen** (wide), **Horizontal floating**
  (lane-based floating chips with bob + dynamic opacity + overlap avoidance).
- Left/right align, top/bottom origin, comfortable/compact density, max messages,
  hide-after, message width/gap.
- Distinctive default font (Hanken Grotesk) or any Google font; full color/size control.
- Self-contained: **no external CSS/JS** (no animate.css, no md5) — only the chosen webfont.

**Identity & roles**
- Roles: broadcaster · lead mod · moderator · artist · vip · subscriber · fav list · regular,
  each with its own color (lead mod / fav are user-defined username lists).
- **Pronouns** (opt-in) via pronouns.alejo.io for Twitch users.
- Platform logo and/or colored platform dot; badges; **50 icon-bubble glyphs** or user avatar.
- Username color modes (platform / text / custom / hidden); highlighted keywords.
- 7TV / BTTV / FFZ custom emotes (global + channel), fetched client-side.
- **Shared Chat** (Twitch Stream Together) detection + origin marker.

**Alerts** — inline follow/sub/tip/cheer/raid as refined accent lines, per-type
enable, custom label format, minimum display time, sound per event.

**Effects** — edge-fade mask, perspective tilt (X/Y/Z), crayon texture, and an
opt-in **Liquid Glass refraction** (real SVG, Chromium/OBS; auto-falls back to
glassmorphism elsewhere). Signature liquid entrance + reduced-motion support.

**Testing tools** — fire test chat/alert/Kick messages right from the Fields panel.

## Architecture (hybrid)

| Source | Path |
|---|---|
| Twitch + YouTube + SE alerts | **native** via SE `onEventReceived` — no backend |
| Kick | **Railway relay** → WebSocket → widget (`relay/`) |
| 7TV / BTTV / FFZ + pronouns | public CORS APIs, fetched **client-side** |

Every source is reduced by `normalize*()` into one `UnifiedMessage`; the renderer
only sees that. Styling is driven by **CSS custom properties** set from `widget.js`
(`applyTheme`) on top of a preset token bundle — identical in SE and in `/preview`.

## Repo layout

```
widget/    widget.html · widget.css · widget.json (Fields) · widget.js  ← deploy to SE
preview/   index.html + mock-se.js   ← local SE event simulator
relay/     Railway Node.js service (Kick ingest)
scripts/   serve.mjs (preview server) · build.mjs (validate + version stamp)
docs/      INSTALL.md
```

## Local development

```bash
npm run preview     # http://localhost:5173/preview/index.html  (widen the window!)
npm run validate    # validate widget.json + required files
npm run build       # stamp widgetVersion from package.json (for auto-update)
```

The preview page sends Twitch/YouTube/Kick messages, fires alerts, tests 7TV emotes
and keywords, and live-toggles preset/layout/effects — no StreamElements account needed.

## Deploy

- **Widget**: paste `widget.{html,css,js,json}` into the matching tabs of a SE Custom
  Widget. Configure from the **Fields** panel (14 grouped sections; start at *Style → preset*).
  Full steps in [docs/INSTALL.md](docs/INSTALL.md).
- **Kick relay**: deploy `relay/` to Railway, then set the Relay URL + Kick channel in
  the Multistream group. See [relay/README.md](relay/README.md).

## Auto-update

Hidden `widgetVersion` + `widgetUpdateUrl` let SE offer an "update available" prompt
when the GitHub copy is newer. Release: edit → `npm run build` (stamps the version) →
push to `main`.

## Status

- ✅ Phases 0–5 — scaffold, core render, design system, alerts, effects
- ✅ Phase 6 — Kick relay (code; deploy when needed)
- ✅ Feature parity pass — per-platform, expanded roles, pronouns, icon library,
  horizontal floating, shared chat, full settings audit
- ⬜ TikTok + Ko-fi (future), public publish + live OBS test
