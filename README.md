# Multistream Chat Overlay (StreamElements)

![CI](https://github.com/ahmetenesdur/streamelements-overlays/actions/workflows/ci.yml/badge.svg)

A fully customizable, **professional multistream chat overlay** for StreamElements —
shows **Twitch + YouTube + Kick** chat in one unified feed with a clean, modern
"broadcast editorial" look — soft pastel palette, minimal shadows, no boxes or
gradients — plus inline alerts, custom emotes, pronouns, roles, sounds, effects,
and GitHub auto-update.

## Features

**Platforms** — Twitch + YouTube (native via StreamElements) + Kick (via the
bundled Railway relay). Per-platform show/hide: use one platform or combine any subset.
The Kick relay supports an optional shared access token for public deployments.

**Look & layout**
- 3 style presets: **Editorial** (text on video), **Frosted** (clean glass panel),
  **Slate** (solid chip) — plus full token overrides.
- 3 layouts: **Vertical** (column), **Horizontal** (side-by-side ticker — newest enters
  from the right/left, older clipped, never piles up), **Fullscreen** (wide column).
- **Soft pastel palette** (harmonious role tints + champagne accent) and **minimal shadows**
  by default — depth comes from a hairline top sheen, not heavy drop shadows.
- Left/right align, top/bottom origin, comfortable/compact density, max messages,
  hide-after, message width/gap.
- **Second-message grouping** — legacy inline merge or a stacked follow-up that drops
  the repeated header, plus **dynamic opacity** that fades older visible rows by age.
- Distinctive default font (Hanken Grotesk) or any Google font; full color/size control.
- Self-contained: **no external CSS/JS** (no animate.css, no md5) — only the chosen webfont.

**Identity & roles**
- Roles: broadcaster · lead mod · moderator · artist · vip · subscriber · fav list · regular,
  each with its own color (lead mod / fav are user-defined username lists).
- **Per-role visual matrix** — each role can also color the message text and wear a tinted
  username chip + message-background wash, all derived from that role's own color.
- **Pronouns** (opt-in) via pronouns.alejo.io for Twitch users.
- Platform logo and/or colored platform dot (per-platform enable + color); badges;
  **53 icon-bubble glyphs** or user avatar, with **per-role icon overrides**
  (broadcaster / lead mod / mod / VIP / sub / artist / fav / regular).
- Username color modes (platform / text / custom / hidden); **native color placement** on the
  username text or as a username-background chip; highlighted keywords.
- 7TV / BTTV / FFZ custom emotes (global + channel), fetched client-side — **zero-width emote overlays** supported.
- **Shared Chat** (Twitch Stream Together) detection + origin marker, with optional
  **`roomId:name` origin labels** (auto-colored per channel) so guest-channel messages name their source,
  plus an opt-in **participants panel** — a live, corner-positioned roster of the channels in the
  session (host auto-named, guests labelled), with a running count.

**Alerts** — inline follow / sub / resub / gift / community-gift / tip / cheer / raid / host
as refined accent lines: per-type enable, custom label format, minimum display time,
sound per event (maps cheer/raid/gift/etc. to the nearest configured sound slot).
**YouTube-aware subtypes** — Super Chat and membership alerts get their own labels when
StreamElements provides the platform hints (tolerant detection, falls back to tip/sub).
**Channel-point / Store rewards** via the `redemption-latest` listener, with a `{reward}` label token.

**Effects** — edge-fade mask, perspective tilt (X/Y/Z) with **zoom + field-of-view**, crayon
texture, and an opt-in **Liquid Glass refraction** (real SVG, Chromium/OBS; auto-falls back to
glassmorphism elsewhere). Signature liquid entrance + reduced-motion support.
- **Full-screen float** — an opt-in fullscreen mode that scatters messages to non-overlapping
  positions (collision avoidance), pairs with dynamic age-opacity for a live floating chat.

> **Deferred:** TikTok and Ko-fi ingestion are intentionally out of scope for now — they
> require separate platform/webhook integration beyond the native StreamElements widget event
> surface, so they are planned as their own phase rather than a widget CSS/JS enhancement.

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
relay/     Railway Node.js service (Kick ingest) — see relay/README.md
test/      widget.test.cjs + harness.cjs (pure-Node unit tests)
scripts/   serve.mjs (preview server) · build.mjs (validate + version stamp)
docs/      INSTALL.md
.github/   CI (Node 18/20/22) + tag-triggered GitHub Releases
```

## Local development

```bash
npm run preview     # http://localhost:5173/preview/index.html  (widen the window!)
npm run validate    # validate widget.json + required files
npm run build       # stamp widgetVersion from package.json (for auto-update)
npm test            # validate + relay tests + 75 widget unit tests
```

The preview page sends Twitch/YouTube/Kick messages, fires alerts, tests 7TV emotes
and keywords, live-toggles every Fields setting (138 fields in 14 groups), and
previews against flat test scenes (light / mid-gray / deep-teal / transparency checker).
**Feature demos** buttons exercise message grouping, shared chat + participants panel,
age fade, fullscreen float, and per-role colors — no StreamElements account needed.

## Deploy

- **Widget**: paste `widget.{html,css,js,json}` into the matching tabs of a SE Custom
  Widget. Configure from the **Fields** panel (14 grouped sections; start at *Style → Style preset*).
  Full steps in [docs/INSTALL.md](docs/INSTALL.md).
- **Kick relay**: deploy `relay/` to Railway, then set **Relay WebSocket URL (Railway, wss://...)** +
  **Kick channel (slug, or numeric chatroom id if slug fails)** in the Multistream group.
  See [relay/README.md](relay/README.md).

## Auto-update

Hidden `widgetVersion` + `widgetUpdateUrl` let SE offer an "update available" prompt
when the GitHub copy is newer. To cut a release: bump `package.json` version →
`npm run build` (stamps `widgetVersion`) → commit → push to `main`.
Optionally push a `v*` tag — the **Release** workflow (`.github/workflows/release.yml`)
validates, tests, and attaches the four widget files to a GitHub Release.

## Status

**Current: v1.2.0** · 138 fields · 14 setting groups · 75 widget tests + 11 relay assertions · CI on push/PR (Node 18/20/22)

Shipped and verified in the local preview:

- ✅ **Multistream** — Twitch + YouTube (native SE) + Kick (Railway relay); per-platform show/hide
- ✅ **Layout & style** — vertical / horizontal ticker / fullscreen; Editorial · Frosted · Slate presets; fullscreen float with overlap avoidance
- ✅ **Identity** — roles, pronouns, 53-glyph icon library, per-role icon overrides, 7TV/BTTV/FFZ emotes (incl. zero-width overlays)
- ✅ **Messages** — second-message stack grouping, dynamic age opacity, shared-chat origin labels + participants panel
- ✅ **Roles & alerts** — per-role visual matrix, YouTube Super Chat/member alerts, channel-point rewards, inline alert suite
- ✅ **Effects** — edge fade, perspective tilt (zoom + FOV), crayon texture, liquid-glass refraction (Chromium/OBS)
- ✅ **Reliability** — error boundaries, exponential backoff, relay rate limiting, OBS GPU optimizations

**Roadmap:** public StreamElements library listing · TikTok + Ko-fi ingestion (separate integration phase, intentionally deferred)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.
