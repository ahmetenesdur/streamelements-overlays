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

Click **Done**. The settings panel (right side) now shows **14 grouped sections** (138 fields total).

## 3. Connect platforms
- **Twitch**: works once the overlay runs on your Twitch-connected SE account.
- **YouTube**: connect YouTube in SE (**Account → Channels**) and be **live** — SE then
  forwards YouTube chat to the same `message` event the widget already handles.
- **Kick**: deploy the bundled relay to Railway (see [`relay/README.md`](../relay/README.md)),
  then set **Multistream → Relay WebSocket URL (Railway, wss://...)** and
  **Kick channel (slug, or numeric chatroom id if slug fails)**. Leave both blank if you
  don't stream on Kick — Twitch/YouTube still work. If your relay has `RELAY_TOKEN` set,
  paste the same value into **Relay access token (optional, matches RELAY_TOKEN)**.
  Kick moderator/VIP badges render as text chips (Kick provides badge labels, not image URLs).

Per-platform chat visibility is in the same **Multistream** group:
**Show Twitch chat**, **Show YouTube chat**, **Show Kick chat** (each defaults to Yes).

Custom emote providers are also in **Multistream** — **7TV emotes**, **BTTV emotes**, and
**FFZ emotes** (client-side fetch, global + channel; all default to Yes).

## 4. Configure (Fields panel) — simple first
Start at the top **Style** group:
- **Style preset**: `Editorial (text on video, default)` · `Frosted (clean glass panel)` · `Slate (solid chip)`.
  Pick one and you have a polished look instantly.
- **Accent color (leave empty = preset)**: leave empty to use the preset's accent, or set one to recolor
  roles/alerts/keywords/dots at once.
- **Overlay background**: defaults to fully transparent (`rgba(0,0,0,0)`). Set only if you want a tint
  behind the whole chat area.

Then tweak only what you want. Groups: **Style, Test tools, Layout, Typography,
Username & Colors, Badges & Platform, Roles & Highlights, Messages, Animations,
Alerts, Sound, Effects, Advanced glass, Multistream**.
- **Advanced glass** overrides the active preset's surface/blur values only when
  **Override preset surface values = Yes (use values below)**.
- **Effects → Advanced glass refraction (Chromium/OBS only, GPU-heavy — keep Max Messages low)**:
  real SVG liquid-glass refraction. Works in Chromium / OBS; on unsupported renderers it
  auto-falls back to plain glassmorphism. GPU-heavy — keep **Max messages on screen** modest if you enable it.

### Advanced options
- **Messages → Consecutive message grouping**: `Off`, `Inline merge (legacy)`, or
  `Second message stack` (drops the repeated header for a follow-up from the same sender).
  The legacy **Merge consecutive messages from same user** toggle still works and maps to `Inline merge`.
- **Effects → Dynamic opacity for older messages** + **Oldest visible message opacity %**:
  fade older visible rows by age (newest stays fully opaque).
- **Multistream → Shared Chat (Stream Together) origin marker**: shows when a guest-channel
  message arrives in Stream Together (disable to hide the marker entirely).
- **Multistream → Shared chat labels (roomId:name, comma separated)**: e.g.
  `200:Ironmouse,300:Lirik`. Twitch Shared Chat (Stream Together) messages from a mapped
  source room show that name; unmapped rooms still show the shared-chat marker.
- **Multistream → Shared Chat: show participants panel** (+ **Participants panel position**):
  opt-in corner roster of the channels in the current Stream Together session. Your own channel
  is auto-named (from StreamElements) and pinned as the host; guests use the shared-chat labels
  mapping (unmapped rooms show as `#roomId`). The panel only appears once a shared-chat message
  is detected, so it stays hidden on solo streams.
- **Username & Colors → Platform/native username color placement**: render the native
  color on the username text, as a username-background chip, or disable it.
- **Roles & Highlights → Show pronouns (Twitch, via pronouns.alejo.io)**: opt-in pronoun
  tags fetched client-side for Twitch logins.
- **Roles & Highlights → Lead mod usernames / Fav list usernames**: comma-separated lists
  that promote matching chatters to lead-mod or fav roles (each with its own color).
- **Roles & Highlights → Broadcaster icon / Lead mod icon / Mod icon / VIP icon / Subscriber icon / Artist icon / Favorite icon / Regular icon**:
  pick each role's icon from a dropdown — a glyph, the platform logo, or the user avatar.
  Leave it on **Inherit (use global icon)** to use **Icon bubble content (when shown)** from Badges & Platform.
- **Alerts → Show YouTube Super Chat alerts / Show YouTube member alerts / Show channel-point / Store reward alerts**:
  YouTube Super Chat and membership alerts, plus channel-point / SE Store **reward** alerts
  (the `{reward}` token expands to the reward title), shown when StreamElements provides the matching payload.
- **Roles & Highlights → Per-role: color message text / username background chip / message background wash**:
  opt-in toggles that paint each role's message text, username chip, and bubble in that role's own
  color. **Per-role background tint strength %** controls how strong the wash is.
- **Badges & Platform → Enable Twitch dot / Enable YouTube dot / Enable Kick dot**: switch a
  single platform's dot off while keeping the others (the master **Show platform dot indicator**
  must still be on).
- **Effects → Perspective zoom % / Perspective field of view**: pair with **Perspective tilt · X/Y/Z (deg)**
  for a tuned 3D look.
- **Layout → Full screen: float & avoid overlapping**: in the **Full screen (wide column)** layout, scatter
  messages to non-overlapping positions instead of a column — pair with **Dynamic opacity for older messages**
  for a live floating chat.
- **Layout → Horizontal: new messages enter from**: `Right (flow leftward)` or `Left (flow rightward)` when
  using the horizontal ticker layout.
- For the closest competitor-style grouped layout, set **Consecutive message grouping** to
  `Second message stack`, enable **Dynamic opacity for older messages**, and use the `Frosted` or `Slate`
  preset if you want visible bubbles.

## 5. Test
- Use **Test tools → ▶ Test chat message / ▶ Test alert (follow) / ▶ Test Kick message** buttons.
- Or type in your real Twitch/YouTube chat.
- Inline alerts fire on real follows/subs/tips/cheers/raids (toggle per type in **Alerts**).
- **Sound** group: four upload slots (message / follow / sub / tip). Other alert types
  (cheer, raid, gift, Super Chat, reward, etc.) reuse the nearest slot automatically.
- Or run `npm run preview` locally (see [README](../README.md)) — the preview's **Feature demos**
  buttons exercise grouping, shared chat, age fade, float layout, and role colors without going live.

## 6. Use in OBS
Copy the overlay URL (**…→ Copy URL**) into an OBS **Browser Source** at your canvas size.

## 7. Auto-update
The widget carries `widgetVersion` + `widgetUpdateUrl`
(→ this repo's `widget/` folder on `main`). When a newer version is pushed to GitHub,
StreamElements shows an **"update available"** prompt on the widget. To cut a release:
bump `package.json` version → `npm run build` (stamps `widgetVersion`) → commit → push to `main`.
Optionally tag `v*` — the Release workflow validates, tests, and attaches the four widget files
to a GitHub Release.
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
