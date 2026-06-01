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
  relay from Phase 6; until then leave blank — Twitch/YouTube still work). If your
  Railway relay has `RELAY_TOKEN` set, paste the same value into **Relay access token**.

## 4. Configure (Fields panel) — simple first
Start at the top **Style** group:
- **Style preset**: `Editorial` (default, text on video) · `Frosted` (clean glass panel) · `Slate` (solid chip).
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

### Competitive-parity options (Phase 8)
- **Messages → Consecutive message grouping**: `Off`, `Inline merge (legacy)`, or
  `Second message stack` (drops the repeated header for a follow-up from the same sender).
  The legacy **Merge messages** toggle still works and maps to `Inline merge`.
- **Effects → Dynamic opacity for older messages** + **Oldest visible message opacity %**:
  fade older visible rows by age (newest stays fully opaque).
- **Multistream → Shared chat labels**: comma-separated `roomId:name` pairs, e.g.
  `200:Ironmouse,300:Lirik`. Twitch Shared Chat (Stream Together) messages from a mapped
  source room show that name; unmapped rooms still show the shared-chat marker.
- **Multistream → Shared Chat: show participants panel** (+ **Participants panel position**):
  opt-in corner roster of the channels in the current Stream Together session. Your own channel
  is auto-named (from StreamElements) and pinned as the host; guests use the `Shared chat labels`
  mapping (unmapped rooms show as `#roomId`). The panel only appears once a shared-chat message
  is detected, so it stays hidden on solo streams.
- **Username & Colors → Platform/native username color placement**: render the native
  color on the username text, as a username-background chip, or disable it.
- **Roles & Highlights → per-role icons**: pick each role's icon from a dropdown — a glyph,
  the platform logo, or the user avatar. Leave it on **Inherit** to use the global icon style.
- **Alerts → Super Chat / Member / Reward**: YouTube Super Chat and membership alerts, plus
  channel-point / SE Store **reward** alerts (the `{reward}` token expands to the reward title),
  shown when StreamElements provides the matching payload.
- **Roles & Highlights → Per-role: message text / username chip / message background**: opt-in
  toggles that paint each role's message text, username chip, and bubble in that role's own
  color. **Per-role background tint strength %** controls how strong the wash is.
- **Badges & Platform → Enable Twitch/YouTube/Kick dot**: switch a single platform's dot off
  while keeping the others (the master **Show platform dot** must still be on).
- **Effects → Perspective zoom % / field of view**: pair with the X/Y/Z tilt for a tuned
  3D look.
- **Layout → Full screen: float & avoid overlapping**: in the `Full screen` layout, scatter
  messages to non-overlapping positions instead of a column — pair with **Dynamic opacity**
  for a live floating chat.
- For the closest competitor-style grouped layout, set **Consecutive message grouping** to
  `Second message stack`, enable **Dynamic opacity**, and use the `Frosted` or `Slate`
  preset if you want visible bubbles.

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

## 8. Share / publish (one-click install for others)

The four-file paste above is the install path. To give other streamers a **one-click**
install (like a marketplace widget), share the overlay itself:

1. In **My Overlays**, open the **⋯** menu on the overlay → **Share** → **Create share link**.
2. Anyone opening that link gets **"Add to my overlays"** — the widget (all four files +
   field defaults) is copied into their account in one click. No file pasting, no `widget.io`.
3. It works in **OBS / OBS Studio / Streamlabs OBS** as a Browser Source like any SE overlay.

> Listing it in the **public StreamElements overlay library** is a separate, manual submission
> through StreamElements (maintainer step) — it can't be automated from this repo. Until then,
> the **share link** above already delivers the same one-click experience.
