# Kick Relay

Bridges **Kick chat → WebSocket** so the StreamElements overlay can show Kick
messages in the same unified stream as Twitch/YouTube.

```
Kick (Pusher WS) ──ingest──► relay ──push──► widget (WS)
```

Twitch + YouTube + all alerts arrive natively in StreamElements, so this relay
is **only needed for Kick**. If you don't stream on Kick, skip it.

## Run locally

```bash
cd relay
npm install
npm start          # listens on :8080 (or $PORT)
# health check:    curl localhost:8080/health
```

## Deploy to Railway

1. New project → Deploy from this repo, **root directory = `relay/`**.
2. Railway auto-detects Node (Nixpacks) and runs `npm start`. No env vars required
   (`PORT` is provided by Railway).
3. Generate a public domain. Your widget's **Relay WebSocket URL** is then:
   `wss://<your-app>.up.railway.app`

## Connecting the widget

In the overlay settings → **Multistream** group:
- **Relay WebSocket URL**: `wss://<your-app>.up.railway.app`
- **Kick channel**: your channel **slug** (e.g. `xqc`) **or** the numeric
  **chatroom id**.

### ⚠️ Cloudflare note (important)
Resolving a slug → chatroom id calls `kick.com/api/v2/channels/<slug>`, which
**Cloudflare often blocks from datacenter IPs** (Railway included) → returns 403.
If your slug doesn't connect, pass the **numeric chatroom id** directly instead:

1. Open `https://kick.com/<your-channel>` in a browser.
2. DevTools → Network → filter `pusher` (or `chatrooms`).
3. Find the subscription to `chatrooms.<ID>.v2` → use that `<ID>`.

The relay accepts a numeric id as the channel value and skips the lookup entirely.

## Notes
- Kick's chat connection is **unofficial** (reverse-engineered Pusher channel).
  It's isolated in `src/index.js` with reconnect/backoff; if Kick changes the
  Pusher app key or URL, only that file needs updating.
- One Kick connection is shared per chatroom across all connected widgets.
