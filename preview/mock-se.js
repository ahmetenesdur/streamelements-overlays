/* ================================================================
   Local StreamElements event simulator for the preview page.
   Dispatches the SAME window events SE fires (onWidgetLoad /
   onEventReceived) so widget.js runs through its real code paths.
   ================================================================ */
(function () {
  'use strict';

  const TW = {
    broadcaster: 'https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/3',
    moderator:   'https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/3',
    vip:         'https://static-cdn.jtvnw.net/badges/v1/b817aba4-fad8-49e2-b88a-7cc744dfa6ec/3',
    subscriber:  'https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/3'
  };
  const EMO = {
    Kappa: { '1': 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', '2': 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' },
    LUL:   { '1': 'https://static-cdn.jtvnw.net/emoticons/v2/425618/default/dark/1.0', '2': 'https://static-cdn.jtvnw.net/emoticons/v2/425618/default/dark/2.0' },
    PogChamp: { '1': 'https://static-cdn.jtvnw.net/emoticons/v2/305954156/default/dark/1.0', '2': 'https://static-cdn.jtvnw.net/emoticons/v2/305954156/default/dark/2.0' }
  };

  const SENDERS = [
    { name: 'NightWolf',   color: '#ff6ad5', roles: ['subscriber'] },
    { name: 'PixelQueen',  color: '#6be7ff', roles: ['vip'] },
    { name: 'ModSquad',    color: '#3fb950', roles: ['moderator'] },
    { name: 'TheStreamer', color: '#ff4d4d', roles: ['broadcaster'] },
    { name: 'casual_dave', color: '#ffd86b', roles: [] },
    { name: 'gg_marie',    color: '#8a9bff', roles: ['subscriber'] }
  ];
  const LINES = [
    'this overlay looks insane Kappa',
    'LUL that play was wild',
    'gg well played everyone',
    'PogChamp new personal best!',
    'how do you set this up?',
    'multistream chat is so clean',
    'first time catching the stream, loving it'
  ];

  let id = 0;
  const uid = () => (++id);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function emotesFor(text) {
    const out = [];
    text.split(/\s+/).forEach(tok => { if (EMO[tok]) out.push({ name: tok, urls: EMO[tok], type: 'twitch' }); });
    return out;
  }

  function twitchRaw(text, sender) {
    const s = sender || pick(SENDERS);
    const role = s.roles[0];
    const badges = role && TW[role] ? [{ type: role, url: TW[role] }] : [];
    return {
      service: 'twitch',
      data: {
        text, displayName: s.name, nick: s.name.toLowerCase(), userId: 'u' + uid(),
        displayColor: s.color, isAction: false,
        tags: {
          badges: role ? role + '/1' : '', color: s.color, 'display-name': s.name,
          mod: s.roles.includes('moderator') ? '1' : '0',
          subscriber: s.roles.includes('subscriber') ? '1' : '0',
          'user-id': 'u' + id, 'room-id': '85827806', id: 'tw' + uid()
        },
        badges, emotes: emotesFor(text)
      }
    };
  }

  function youtubeRaw(text, sender) {
    const s = sender || pick(SENDERS);
    return {
      service: 'youtube',
      data: {
        msgId: 'yt' + uid(), userId: 'yc' + id, displayName: s.name,
        avatar: 'https://yt3.ggpht.com/ytc/default-user=s88', text, isAction: false,
        authorDetails: {
          channelId: 'yc' + id, displayName: s.name,
          profileImageUrl: 'https://yt3.ggpht.com/ytc/default-user=s88',
          isChatModerator: s.roles.includes('moderator'),
          isChatOwner: s.roles.includes('broadcaster'),
          isChatSponsor: s.roles.includes('subscriber')
        },
        snippet: { displayMessage: text }, emotes: []
      }
    };
  }

  function dispatch(listener, event) {
    window.dispatchEvent(new CustomEvent('onEventReceived', { detail: { listener, event } }));
  }

  // ---- public actions -------------------------------------------
  const MockSE = {
    fieldData: {},

    load(overrides) {
      Object.assign(this.fieldData, overrides || {});
      window.dispatchEvent(new CustomEvent('onWidgetLoad', {
        detail: {
          fieldData: this.fieldData,
          channel: { username: 'previewer', apiToken: '' },
          session: { data: {} },
          currency: { code: 'USD', name: 'US Dollar', symbol: '$' }
        }
      }));
    },
    set(key, val) { this.fieldData[key] = val; this.load(); },

    twitch() { dispatch('message', twitchRaw(pick(LINES))); },
    youtube() { dispatch('message', youtubeRaw(pick(LINES))); },
    kick() { dispatch('widget-button', { field: 'testKick' }); },

    // Drive the REAL relay code path (normalizeKick) with a Kick-shaped payload,
    // including an inline emote so we exercise emote rendering end-to-end.
    kickRelay() {
      const f = window.__seChat && window.__seChat.relayFrame; if (!f) return;
      f({ type: 'message', payload: {
        msgId: 'k' + uid(), userId: 'ku' + id, displayName: 'KickFan_' + id,
        color: '#53fc18', badges: [{ type: 'moderator', text: 'Moderator' }],
        emotes: { catJAM: 'https://files.kick.com/emotes/39000/fullsize' },
        text: 'kick chat via relay catJAM lets go'
      }});
    },
    // Drive a Kick channel alert (sub / community gift / host) through the relay path.
    kickAlert(kind) {
      const f = window.__seChat && window.__seChat.relayFrame; if (!f) return;
      const p = {
        sub: { type: 'sub', name: 'KickSubber', amount: 3 },
        gift: { type: 'communitygift', sender: 'KickBoss', count: 8 },
        host: { type: 'host', name: 'KickRaider', amount: 230 }
      }[kind || 'sub'];
      f({ type: 'alert', payload: p });
    },
    action() {
      const r = twitchRaw('uses a special move!'); r.data.isAction = true; dispatch('message', r);
    },
    long() { dispatch('message', twitchRaw('this is a really long message to test wrapping and how the bubble grows across multiple lines without breaking the layout at all Kappa')); },
    emote() { dispatch('message', twitchRaw('Kappa Kappa LUL PogChamp Kappa LUL')); },

    // Fetch the SAME global 7TV set the widget loads, then send a message
    // using real emote names so they resolve through the widget's customEmotes.
    seventv() {
      fetch('https://7tv.io/v3/emote-sets/global')
        .then(r => r.json())
        .then(j => {
          const names = (j.emotes || []).map(e => e.name);
          const some = names.sort(() => Math.random() - 0.5).slice(0, 4).join(' ');
          dispatch('message', twitchRaw('7TV: ' + (some || 'no emotes returned')));
        })
        .catch(() => dispatch('message', twitchRaw('7TV fetch failed (offline?)')));
    },
    keywords() {
      MockSE.set('highlightKeywords', 'gg, win, hype, pog, clutch');
      dispatch('message', twitchRaw('gg! that was a clutch win — total hype, (pog) moment'));
    },

    alert(type) {
      const e = {
        follow: ['follower-latest', { name: 'NewFollower' + uid() }],
        sub: ['subscriber-latest', { name: 'LoyalFan', amount: 6, tier: '1000', message: 'love the content!' }],
        tip: ['tip-latest', { name: 'Generous', amount: 25, message: 'keep it up!' }],
        cheer: ['cheer-latest', { name: 'BitLord', amount: 500 }],
        raid: ['raid-latest', { name: 'BigStreamer', amount: 142 }],
        superchat: ['tip-latest', { name: 'YTViewer', amount: '$20', provider: 'youtube', type: 'superchat', message: 'great stream!' }],
        member: ['subscriber-latest', { name: 'YTMember', provider: 'youtube', type: 'member', amount: 1 }],
        reward: ['redemption-latest', { name: 'PointSpender', redemption: 'Hydrate!', amount: 500 }]
      }[type];
      if (e) dispatch(e[0], e[1]);
    },

    // ---- Phase 8 demos --------------------------------------------
    // Two consecutive messages from the SAME sender → second-message stack.
    grouped() {
      MockSE.set('messageGrouping', 'stack');
      const mk = (text) => {
        const e = twitchRaw(text, { name: 'Nani', color: '#6be7ff', roles: ['subscriber'] });
        e.data.displayName = 'Nani'; e.data.userId = 'nani';
        e.data.tags['user-id'] = 'nani'; e.data.tags.id = 'grp-' + uid();
        return e;
      };
      dispatch('message', mk('first grouped message'));
      dispatch('message', mk('second grouped message — same sender, no new header'));
    },
    // A Twitch Shared Chat (Stream Together) message from a mapped source room.
    shared() {
      MockSE.set('sharedChatIndicator', 'yes');
      MockSE.set('sharedChatLabels', '200:Ironmouse');
      const event = twitchRaw('message from a shared chat');
      event.data.displayName = 'GuestViewer'; event.data.userId = 'guest';
      event.data.tags['room-id'] = '100';
      event.data.tags['source-room-id'] = '200';
      event.data.tags['user-id'] = 'guest';
      event.data.tags.id = 'shared-preview-' + uid();
      dispatch('message', event);
    },
    // Fullscreen float: scatter several messages with overlap avoidance.
    floatScene() {
      MockSE.set('layoutMode', 'fullscreen');
      MockSE.set('fullscreenFloat', 'yes');
      MockSE.set('hideAfter', 0);
      MockSE.clear();
      ['floating chat one', 'second message drifts in', 'a third one here',
       'number four floats', 'fifth and counting', 'sixth message', 'lucky seven', 'last one'
      ].forEach((text, i) => {
        const e = twitchRaw(text);
        e.data.displayName = 'Viewer' + i; e.data.userId = 'float' + i;
        e.data.tags['user-id'] = 'float' + i; e.data.tags.id = 'float-' + i + '-' + uid();
        dispatch('message', e);
      });
    },
    // Per-role visual matrix: each role gets its own tinted name + bubble.
    roleMatrix() {
      MockSE.set('roleHighlight', 'yes');
      MockSE.set('roleNameBg', 'yes');
      MockSE.set('roleMsgBg', 'yes');
      MockSE.clear();
      const roles = [
        ['broadcaster', 'TheStreamer', 'broadcaster line'],
        ['moderator', 'ModSquad', 'moderator line'],
        ['vip', 'PixelQueen', 'vip line'],
        ['subscriber', 'NightWolf', 'subscriber line']
      ];
      roles.forEach(([role, name, text]) => {
        const e = twitchRaw(text, { name: name, color: '#cccccc', roles: [role] });
        dispatch('message', e);
      });
    },
    // Four messages so older visible rows fade by age.
    ageFade() {
      MockSE.set('dynamicOpacity', 'yes');
      MockSE.set('oldestMessageOpacity', 35);
      ['one', 'two', 'three', 'four'].forEach((text, index) => {
        const event = twitchRaw('age fade message ' + text);
        event.data.displayName = 'Viewer' + index; event.data.userId = 'age' + index;
        event.data.tags['user-id'] = 'age' + index;
        event.data.tags.id = 'age-preview-' + index + '-' + uid();
        dispatch('message', event);
      });
    },

    deleteLast() {
      const last = document.querySelector('#chatList .msg:last-child');
      if (last) dispatch('delete-message', { msgId: last.dataset.msgid });
    },
    clear() { document.getElementById('chatList').innerHTML = ''; },
    rain(n) { let i = 0; const t = setInterval(() => { (Math.random() < 0.5 ? this.twitch() : this.youtube()); if (++i >= (n || 20)) clearInterval(t); }, 120); }
  };
  window.MockSE = MockSE;

  // ================================================================
  //  Auto-build the settings panel from widget.json — every field
  //  becomes a live control, grouped + collapsible, just like SE.
  // ================================================================
  const GROUP_ORDER = ['Style', 'Layout', 'Typography', 'Username & Colors',
    'Badges & Platform', 'Roles & Highlights', 'Messages', 'Animations',
    'Alerts', 'Sound', 'Effects', 'Advanced glass', 'Multistream', 'Test tools'];

  function el(tag, attrs, text) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function rgbaToHex(c) {
    if (!c) return null;
    const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (m) return '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
    return /^#[0-9a-f]{6}$/i.test(c) ? c : null;
  }

  function controlFor(key, f) {
    const cur = MockSE.fieldData[key];
    const id = 'field-' + key;
    if (f.type === 'dropdown') {
      const s = el('select', { class: 'ctl', id });
      Object.keys(f.options || {}).forEach(v => {
        const o = el('option', { value: v }, f.options[v]);
        if (String(cur) === v) o.selected = true;
        s.appendChild(o);
      });
      s.addEventListener('change', () => MockSE.set(key, s.value));
      return s;
    }
    if (f.type === 'number') {
      const i = el('input', { type: 'number', class: 'ctl', id, autocomplete: 'off' }); i.value = cur != null ? cur : '';
      i.addEventListener('change', () => MockSE.set(key, i.value));
      return i;
    }
    if (f.type === 'slider') {
      const wrap = el('div', { class: 'rangewrap' });
      const i = el('input', { type: 'range', id });
      i.min = f.min != null ? f.min : 0; i.max = f.max != null ? f.max : 100;
      i.step = f.step != null ? f.step : 1; i.value = cur != null ? cur : 0;
      const val = el('span', { class: 'val' }, i.value);
      i.addEventListener('input', () => { val.textContent = i.value; MockSE.set(key, i.value); });
      wrap.appendChild(i); wrap.appendChild(val);
      return wrap;
    }
    if (f.type === 'colorpicker') {
      const wrap = el('div', { class: 'colorwrap' });
      const hex = el('input', { type: 'color', id }); hex.value = rgbaToHex(cur) || '#000000';
      const txt = el('input', { type: 'text', autocomplete: 'off', spellcheck: 'false' }); txt.value = cur || ''; txt.placeholder = 'empty';
      hex.addEventListener('input', () => { txt.value = hex.value; MockSE.set(key, hex.value); });
      txt.addEventListener('change', () => { MockSE.set(key, txt.value); const h = rgbaToHex(txt.value); if (h) hex.value = h; });
      wrap.appendChild(hex); wrap.appendChild(txt);
      return wrap;
    }
    // text / googleFont / sound-input
    const i = el('input', { type: 'text', class: 'ctl', id, autocomplete: 'off', spellcheck: 'false' });
    i.value = cur != null ? cur : '';
    i.placeholder = f.type === 'sound-input' ? 'sound URL' : (f.type === 'googleFont' ? 'Google font name' : '');
    i.addEventListener('change', () => MockSE.set(key, i.value));
    return i;
  }

  function buildFields(json) {
    const host = document.getElementById('fields');
    if (!host) return;
    const groups = {};
    Object.keys(json).forEach(k => {
      const f = json[k];
      if (f.type === 'hidden') return;
      const g = f.group || 'Other';
      (groups[g] = groups[g] || []).push([k, f]);
    });
    const order = GROUP_ORDER.filter(g => groups[g])
      .concat(Object.keys(groups).filter(g => GROUP_ORDER.indexOf(g) === -1));
    order.forEach((g, gi) => {
      const det = el('details', { class: 'grp' }); if (gi === 0) det.open = true;
      det.appendChild(el('summary', null, g));
      const pad = el('div', { class: 'pad' });
      groups[g].forEach(([key, f]) => {
        if (f.type === 'button') {
          const b = el('button', { class: 'sim fieldbtn', type: 'button' }, f.label || key);
          b.addEventListener('click', () => dispatch('widget-button', { field: key }));
          pad.appendChild(b); return;
        }
        const wide = f.type === 'text' || f.type === 'googleFont' || f.type === 'sound-input';
        const row = el('div', { class: 'field' + (wide ? ' wide' : '') });
        row.appendChild(el('label', { for: 'field-' + key }, f.label || key));
        row.appendChild(controlFor(key, f));
        pad.appendChild(row);
      });
      det.appendChild(pad);
      host.appendChild(det);
    });
  }

  // ---- wire simulator actions + scene ---------------------------
  function wire() {
    document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'rain') return MockSE.rain(20);
      if (a.startsWith('alert:')) return MockSE.alert(a.split(':')[1]);
      if (typeof MockSE[a] === 'function') MockSE[a]();
    }));
    const scene = document.querySelector('[data-scene]');
    if (scene) scene.addEventListener('change', () => {
      const stage = document.getElementById('stage');
      stage.className = '';
      if (scene.value) stage.classList.add(scene.value);
    });
  }

  // ---- boot: load widget.json defaults, build panel, start ------
  fetch('../widget/widget.json')
    .then(r => r.json())
    .then(json => {
      const fd = {};
      Object.keys(json).forEach(k => { fd[k] = json[k].value; });
      MockSE.fieldData = fd;
      wire();
      buildFields(json);
      MockSE.load();
      MockSE.twitch(); MockSE.youtube(); MockSE.alert('follow');
    })
    .catch(err => { console.error('Failed to load widget.json', err); });
})();
