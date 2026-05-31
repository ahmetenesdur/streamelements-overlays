/* ================================================================
   Multistream Chat Overlay — Kick relay (Railway)
   ----------------------------------------------------------------
   Kick chat is NOT delivered natively by StreamElements, so this
   small service bridges it:

     Kick (Pusher WS)  ──ingest──►  relay  ──push──►  widget (WS)

   - Widgets connect to this server's WebSocket and send
       { type:'subscribe', platform:'kick', channel:'<slug-or-id>' }
   - The relay opens ONE Kick Pusher connection per chatroom (shared
     across all widgets watching it) and forwards each chat message as
       { type:'message', payload:{...} }
     shaped exactly for the widget's normalizeKick().

   Kick connection is unofficial (reverse-engineered Pusher channel);
   it is isolated here with reconnect/backoff so the widget never has
   to care. If Kick changes things, only this file needs updating.
   ================================================================ */
'use strict';

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 8080;

// Kick's public Pusher app (same one kick.com uses in the browser).
const KICK_PUSHER_URL =
  'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false';

const BROWSERish = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36',
  Accept: 'application/json',
};

// ---------------------------------------------------------------
//  Kick chatroom registry — one Pusher connection per chatroom.
// ---------------------------------------------------------------
/** chatroomId -> { ws, slug, subscribers:Set<WebSocket>, retry, alive } */
const rooms = new Map();

/** Resolve a channel slug to its numeric chatroom id (or accept an id directly). */
async function resolveChatroomId(channel) {
  const raw = String(channel || '').trim().toLowerCase();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw; // already a numeric chatroom id
  try {
    const res = await fetch('https://kick.com/api/v2/channels/' + encodeURIComponent(raw), {
      headers: BROWSERish,
    });
    if (!res.ok) {
      console.warn(`[kick] channel lookup for "${raw}" returned ${res.status} ` +
        `(Cloudflare may be blocking the server) — pass the numeric chatroom id instead.`);
      return null;
    }
    const json = await res.json();
    const id = json && json.chatroom && json.chatroom.id;
    return id ? String(id) : null;
  } catch (e) {
    console.warn('[kick] channel lookup failed:', e.message);
    return null;
  }
}

function ensureRoom(chatroomId, slug) {
  let room = rooms.get(chatroomId);
  if (room) return room;
  room = { ws: null, slug: slug || chatroomId, subscribers: new Set(), retry: 0, alive: false };
  rooms.set(chatroomId, room);
  connectKick(chatroomId);
  return room;
}

function connectKick(chatroomId) {
  const room = rooms.get(chatroomId);
  if (!room) return;

  const ws = new WebSocket(KICK_PUSHER_URL);
  room.ws = ws;

  ws.on('open', () => {
    room.retry = 0;
    ws.send(JSON.stringify({
      event: 'pusher:subscribe',
      data: { auth: '', channel: `chatrooms.${chatroomId}.v2` },
    }));
    console.log(`[kick] connected → chatrooms.${chatroomId}.v2 (${room.slug})`);
  });

  ws.on('message', (buf) => {
    let frame;
    try { frame = JSON.parse(buf.toString()); } catch { return; }

    if (frame.event === 'pusher:ping') {
      ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
      return;
    }
    if (frame.event === 'App\\Events\\ChatMessageEvent') {
      let data;
      try { data = JSON.parse(frame.data); } catch { return; }
      const payload = toUnifiedKick(data);
      if (payload) broadcast(chatroomId, { type: 'message', payload });
    }
  });

  ws.on('close', () => scheduleKickReconnect(chatroomId));
  ws.on('error', () => { try { ws.close(); } catch {} });
}

function scheduleKickReconnect(chatroomId) {
  const room = rooms.get(chatroomId);
  if (!room) return;
  if (room.subscribers.size === 0) { rooms.delete(chatroomId); return; } // nobody left → drop
  room.retry = Math.min(room.retry + 1, 6);
  setTimeout(() => connectKick(chatroomId), 1000 * room.retry);
}

// Kick ChatMessageEvent → widget normalizeKick() shape.
function toUnifiedKick(data) {
  if (!data) return null;
  const sender = data.sender || {};
  const identity = sender.identity || {};
  const { text, emotes } = parseKickContent(data.content || '');
  return {
    msgId: data.id,
    userId: sender.id || sender.slug || sender.username,
    displayName: sender.username || 'anon',
    color: identity.color || '',
    avatar: '',
    badges: (identity.badges || []).map((b) => ({ type: b.type || b.text || '' })),
    emotes,
    text,
  };
}

// Kick inlines emotes as "[emote:ID:NAME]". Convert to a {name:url} map and
// leave the bare NAME in the text so the widget's renderText can swap it in.
function parseKickContent(content) {
  const emotes = {};
  const text = String(content).replace(/\[emote:(\d+):([^\]]+)\]/g, (_, id, name) => {
    emotes[name] = `https://files.kick.com/emotes/${id}/fullsize`;
    return name;
  });
  return { text, emotes };
}

// ---------------------------------------------------------------
//  Widget-facing WebSocket server.
// ---------------------------------------------------------------
function broadcast(chatroomId, msg) {
  const room = rooms.get(chatroomId);
  if (!room) return;
  const data = JSON.stringify(msg);
  for (const sub of room.subscribers) {
    if (sub.readyState === WebSocket.OPEN) sub.send(data);
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (client) => {
  client._rooms = new Set();
  client.isAlive = true;
  client.on('pong', () => { client.isAlive = true; });

  client.on('message', async (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }
    if (msg && msg.type === 'subscribe' && msg.platform === 'kick') {
      const chatroomId = await resolveChatroomId(msg.channel);
      if (!chatroomId) {
        client.send(JSON.stringify({ type: 'error', error: 'kick_channel_unresolved', channel: msg.channel }));
        return;
      }
      const room = ensureRoom(chatroomId, String(msg.channel));
      room.subscribers.add(client);
      client._rooms.add(chatroomId);
      client.send(JSON.stringify({ type: 'subscribed', platform: 'kick', chatroomId }));
    }
  });

  client.on('close', () => {
    for (const id of client._rooms) {
      const room = rooms.get(id);
      if (room) room.subscribers.delete(client);
    }
  });
});

// Drop dead widget sockets (Railway/proxies can leave zombies).
const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) { client.terminate(); continue; }
    client.isAlive = false;
    try { client.ping(); } catch {}
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => console.log(`[relay] listening on :${PORT}`));
