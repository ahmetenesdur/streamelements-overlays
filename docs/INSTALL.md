# Install in StreamElements

## 1. Create the Custom Widget
1. StreamElements dashboard → **Streaming Tools → My Overlays**.
2. Open an existing overlay or **New Overlay** (pick your stream resolution, e.g. 1920×1080).
3. In the editor: **+ (Add Widget) → Static / Custom → Custom Widget**.
4. Select the widget → click **⚙ → Open Editor** (the `</>` code editor).

## 2. Paste the four files
The editor has four tabs. Paste each repo file into the matching tab:

| Tab | File |
|---|---|
| **HTML** | [`widget/widget.html`](../widget/widget.html) |
| **CSS** | [`widget/widget.css`](../widget/widget.css) |
| **JS** | [`widget/widget.js`](../widget/widget.js) |
| **FIELDS** | [`widget/widget.json`](../widget/widget.json) |

Click **Done**. The settings panel (right side) now shows **14 grouped sections**.

## 3. Connect platforms
- **Twitch**: works once the overlay runs on your Twitch-connected SE account.
- **YouTube**: connect YouTube in SE (**Account → Channels**) and be **live** — SE then
  forwards YouTube chat to the same `message` event the widget already handles.
- **Kick**: set **Multistream → Relay WebSocket URL** + **Kick channel** (needs the Railway
  relay from Phase 6; until then leave blank — Twitch/YouTube still work).

## 4. Configure (Fields panel) — simple first
Start at the top **Style** group:
- **Style preset**: `Liquid Glass` (default) · `Minimal Flat` · `Solid` · `Neon / Gamer`.
  Pick one and you have a polished look instantly.
- **Accent color**: leave empty to use the preset's accent, or set one to recolor
  roles/alerts/keywords/dots at once.

Then tweak only what you want. Groups: **Style, Test tools, Layout, Typography,
Username & Colors, Badges & Platform, Roles & Highlights, Messages, Animations,
Alerts, Sound, Effects, Advanced glass, Multistream**.
- **Advanced glass** group overrides the preset's glass values only when
  *Override preset glass values = Yes*.
- **Effects → Advanced glass refraction**: real SVG liquid-glass refraction. Works in
  Chromium / OBS; on unsupported renderers it auto-falls back to plain glassmorphism.
  GPU-heavy — keep **Max messages** modest if you enable it.

## 5. Test
- Use **Test tools → Test chat message / Test alert / Test Kick message** buttons.
- Or type in your real Twitch/YouTube chat.
- Inline alerts fire on real follows/subs/tips/cheers/raids (toggle in **Alerts**).

## 6. Use in OBS
Copy the overlay URL (**…→ Copy URL**) into an OBS **Browser Source** at your canvas size.

## 7. Auto-update
The widget carries `widgetVersion` + `widgetUpdateUrl`
(→ this repo's `widget/` folder on `main`). When a newer version is pushed to GitHub,
StreamElements shows an **"update available"** prompt on the widget. To cut a release:
`npm run build` (stamps the version from `package.json`) → commit → push to `main`.
If SE doesn't surface it, re-paste the changed file(s) manually.
