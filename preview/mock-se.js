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
      syncPresetUI();
    },
    set(key, val) { this.fieldData[key] = val; this.load(); },

    // Pick a style preset from the gallery / top-bar switcher. It wins over any
    // active quick-start scene, so the gallery is the source of truth for the look.
    setPreset(p) {
      this.fieldData.stylePreset = p;
      this.fieldData.quickSetupPreset = 'manual';
      this.load();
      syncControlPanel();
    },

    // Restore every field to its widget.json default (+ optional overrides) and
    // clear the chat — so each Feature demo is self-contained no matter what was
    // clicked before (e.g. the Float demo's fullscreen layout no longer leaks).
    resetFields(overrides) {
      this.fieldData = Object.assign({}, this.defaults || {}, overrides || {});
      this.load();
      this.clear();
      syncControlPanel();
    },

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

    // ---- Feature demos --------------------------------------------
    // Two consecutive messages from the SAME sender → second-message stack.
    grouped() {
      MockSE.resetFields({ messageGrouping: 'stack' });
      const mk = (text) => {
        const e = twitchRaw(text, { name: 'Nani', color: '#6be7ff', roles: ['subscriber'] });
        e.data.displayName = 'Nani'; e.data.userId = 'nani';
        e.data.tags['user-id'] = 'nani'; e.data.tags.id = 'grp-' + uid();
        return e;
      };
      dispatch('message', mk('first grouped message'));
      dispatch('message', mk('second grouped message — same sender, no new header'));
    },
    // Twitch Shared Chat (Stream Together): two guest channels → origin labels
    // + the participants panel (host auto-named from the channel, guests mapped).
    shared() {
      MockSE.resetFields({ sharedChatIndicator: 'yes', sharedChatPanel: 'yes', sharedChatLabels: '200:Ironmouse,300:Lirik' });
      const mk = (name, room, text) => {
        const e = twitchRaw(text);
        e.data.displayName = name; e.data.userId = name.toLowerCase();
        e.data.tags['room-id'] = '100';
        e.data.tags['source-room-id'] = room;
        e.data.tags['user-id'] = name.toLowerCase();
        e.data.tags.id = 'shared-' + uid();
        return e;
      };
      dispatch('message', mk('GuestViewer', '200', "I'm chatting from Ironmouse's chat!"));
      dispatch('message', mk('LirikFan', '300', 'Hi Lirik, love this collab stream!'));
    },
    // Fullscreen float: scatter several messages with overlap avoidance.
    floatScene() {
      MockSE.resetFields({ layoutMode: 'fullscreen', fullscreenFloat: 'yes', hideAfter: 0 });
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
      MockSE.resetFields({ roleHighlight: 'yes', roleNameBg: 'yes', roleMsgBg: 'yes' });
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
      MockSE.resetFields({ dynamicOpacity: 'yes', oldestMessageOpacity: 35 });
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
    reset() { MockSE.resetFields(); },   // restore all default settings + clear chat
    rain(n) { let i = 0; const t = setInterval(() => { (Math.random() < 0.5 ? this.twitch() : this.youtube()); if (++i >= (n || 20)) clearInterval(t); }, 120); }
  };
  window.MockSE = MockSE;

  // ================================================================
  //  Auto-build the settings panel from widget.json — every field
  //  becomes a live control, grouped + collapsible, just like SE.
  // ================================================================
  const GROUP_ORDER = ['Style', 'Layout', 'Typography', 'Username & Colors',
    'Badges & Platform', 'Roles & Highlights', 'Messages', 'Animations',
    'Alerts', 'Sound', 'Effects', 'Advanced glass', 'Multistream'];

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
    const label = f.label || key;
    if (f.type === 'dropdown') {
      const s = el('select', { class: 'ctl', id, name: key });
      Object.keys(f.options || {}).forEach(v => {
        const o = el('option', { value: v }, f.options[v]);
        if (String(cur) === v) o.selected = true;
        s.appendChild(o);
      });
      s.addEventListener('change', () => MockSE.set(key, s.value));
      return s;
    }
    if (f.type === 'number') {
      const i = el('input', { type: 'number', class: 'ctl', id, name: key, autocomplete: 'off', inputmode: 'decimal' }); i.value = cur != null ? cur : '';
      i.addEventListener('input', () => MockSE.set(key, i.value));
      i.addEventListener('change', () => MockSE.set(key, i.value));
      return i;
    }
    if (f.type === 'slider') {
      const wrap = el('div', { class: 'rangewrap' });
      const i = el('input', { type: 'range', id, name: key });
      i.min = f.min != null ? f.min : 0; i.max = f.max != null ? f.max : 100;
      i.step = f.step != null ? f.step : 1; i.value = cur != null ? cur : 0;
      const val = el('span', { class: 'val' }, i.value);
      i.addEventListener('input', () => { val.textContent = i.value; MockSE.set(key, i.value); });
      wrap.appendChild(i); wrap.appendChild(val);
      return wrap;
    }
    if (f.type === 'colorpicker') {
      const wrap = el('div', { class: 'colorwrap' });
      const hex = el('input', { type: 'color', id, name: key, 'aria-label': label + ' color picker' }); hex.value = rgbaToHex(cur) || '#000000';
      const txt = el('input', {
        type: 'text',
        class: 'color-text',
        id: id + '-text',
        name: key + 'Text',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': label + ' CSS color value'
      }); txt.value = cur || ''; txt.placeholder = 'empty';
      hex.addEventListener('input', () => { txt.value = hex.value; MockSE.set(key, hex.value); });
      txt.addEventListener('input', () => { MockSE.set(key, txt.value); const h = rgbaToHex(txt.value); if (h) hex.value = h; });
      txt.addEventListener('change', () => { MockSE.set(key, txt.value); const h = rgbaToHex(txt.value); if (h) hex.value = h; });
      wrap.appendChild(hex); wrap.appendChild(txt);
      return wrap;
    }
    // text / googleFont / sound-input
    const i = el('input', { type: 'text', class: 'ctl', id, name: key, autocomplete: 'off', spellcheck: 'false' });
    i.value = cur != null ? cur : '';
    i.placeholder = f.type === 'sound-input' ? 'sound URL' : (f.type === 'googleFont' ? 'Google font name' : '');
    i.addEventListener('input', () => MockSE.set(key, i.value));
    i.addEventListener('change', () => MockSE.set(key, i.value));
    return i;
  }

  function syncControlPanel() {
    Object.keys(MockSE.fieldData || {}).forEach(key => {
      const val = MockSE.fieldData[key];
      const input = document.getElementById('field-' + key);
      if (!input) return;
      if (input.type === 'color') {
        input.value = rgbaToHex(val) || '#000000';
        const text = document.getElementById('field-' + key + '-text');
        if (text) text.value = val || '';
        return;
      }
      input.value = val != null ? val : '';
      if (input.type === 'range') {
        const out = input.parentElement && input.parentElement.querySelector('.val');
        if (out) out.textContent = input.value;
      }
    });
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

  // ---- preset gallery + top-bar switcher ------------------------
  // Representative card visuals (not the exact tokens — a quick read of each look).
  const PRESET_META = [
    { key: 'editorial', name: 'Editorial', desc: 'Type on video', accent: '#e8c99a', bg: '#15161b', chip: 'rgba(255,255,255,0.82)' },
    { key: 'frosted',   name: 'Frosted',   desc: 'Liquid glass',  accent: '#bcd3ff', bg: '#2b3140', chip: 'rgba(255,255,255,0.8)' },
    { key: 'slate',     name: 'Slate',     desc: 'Solid onyx',    accent: '#e8c99a', bg: '#13151b', chip: 'rgba(255,255,255,0.82)' },
    { key: 'pulse',     name: 'Pulse',     desc: 'High energy',   accent: '#7c9cff', bg: '#141621', chip: 'rgba(255,255,255,0.82)' },
    { key: 'daylight',  name: 'Daylight',  desc: 'Light print',   accent: '#b9762e', bg: '#f4f1ea', chip: 'rgba(28,26,24,0.82)' },
    { key: 'terminal',  name: 'Terminal',  desc: 'Dev mono',      accent: '#8bf2a6', bg: '#0d0f0d', chip: 'rgba(139,242,166,0.7)' }
  ];

  function buildPresetSwitch() {
    const host = document.getElementById('presetSwitch');
    if (!host) return;
    PRESET_META.forEach(p => {
      const b = el('button', { type: 'button', class: 'seg', 'data-preset': p.key, 'aria-pressed': 'false', title: p.name + ' — ' + p.desc });
      b.style.setProperty('--seg-accent', p.accent);
      b.innerHTML = '<span class="seg-dot"></span>' + p.name;
      b.addEventListener('click', () => MockSE.setPreset(p.key));
      host.appendChild(b);
    });
  }

  function buildPresetGallery() {
    const host = document.getElementById('gallery');
    if (!host) return;
    PRESET_META.forEach(p => {
      const card = el('button', { type: 'button', class: 'gcard', 'data-preset': p.key, 'aria-pressed': 'false', 'aria-label': p.name + ' preset — ' + p.desc });
      card.style.setProperty('--g-bg', p.bg);
      card.style.setProperty('--g-accent', p.accent);
      card.style.setProperty('--g-chip', p.chip);
      card.innerHTML =
        '<span class="gcard-vis">' +
          '<span class="gcard-row"><span class="gcard-chip w1"></span><span class="gcard-chip w2"></span></span>' +
          '<span class="gcard-row"><span class="gcard-chip w1"></span><span class="gcard-chip w3"></span></span>' +
        '</span>' +
        '<span class="gcard-meta"><span class="gcard-name">' + p.name + '</span><span class="gcard-desc">' + p.desc + '</span></span>';
      card.addEventListener('click', () => MockSE.setPreset(p.key));
      host.appendChild(card);
    });
  }

  // Reflect the resolved preset on the switcher + gallery (called after every load).
  function syncPresetUI() {
    const chat = document.getElementById('seChat');
    const p = chat ? chat.dataset.preset : '';
    document.querySelectorAll('#presetSwitch .seg, #gallery .gcard').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.preset === p));
    });
  }

  // ---- inspector search: filter settings by label ---------------
  function wireSearch() {
    const input = document.getElementById('search');
    const clearBtn = document.getElementById('searchClear');
    const panel = document.getElementById('panel');
    if (!input) return;
    const srch = input.closest('.srch');
    const apply = () => {
      const q = input.value.trim().toLowerCase();
      if (srch) srch.classList.toggle('has-value', !!q);
      let anyVisible = false;
      document.querySelectorAll('#fields .grp').forEach(grp => {
        let visible = 0;
        grp.querySelectorAll('.field').forEach(field => {
          const lbl = field.querySelector('label');
          const match = !q || (lbl && lbl.textContent.toLowerCase().includes(q));
          field.hidden = !match;
          if (match) visible++;
        });
        grp.querySelectorAll('.fieldbtn').forEach(b => {
          const match = !q || (b.textContent || '').toLowerCase().includes(q);
          b.hidden = !match; if (match) visible++;
        });
        grp.hidden = !!q && visible === 0;
        if (!grp.hidden) anyVisible = true;
        if (q) grp.open = true;
      });
      const test = document.querySelector('.grp[data-group="Test"]');
      if (test) test.hidden = !!q;            // hide the test tools while searching settings
      if (panel) panel.classList.toggle('no-results', !!q && !anyVisible);
    };
    input.addEventListener('input', apply);
    if (clearBtn) clearBtn.addEventListener('click', () => { input.value = ''; apply(); input.focus(); });
  }

  // ---- device frame + motion freeze -----------------------------
  function wireDevice() {
    const sel = document.getElementById('deviceSel');
    const stage = document.getElementById('stage');
    if (!sel || !stage) return;
    const labels = { desktop: 'Desktop', obs: 'OBS 1920 × 1080', mobile: 'Mobile 9:16' };
    sel.addEventListener('change', () => {
      stage.dataset.device = sel.value;
      stage.dataset.label = labels[sel.value] || sel.value;
    });
  }
  function wireMotion() {
    const btn = document.getElementById('motionToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(next));
      btn.textContent = next ? 'Frozen' : 'Motion';
      MockSE.set('disableAllAnimations', next ? 'yes' : 'no');
    });
  }

  // ---- boot: load widget.json defaults, build panel, start ------
  fetch('../widget/widget.json')
    .then(r => r.json())
    .then(json => {
      const fd = {};
      Object.keys(json).forEach(k => { fd[k] = json[k].value; });
      MockSE.fieldData = fd;
      MockSE.defaults = JSON.parse(JSON.stringify(fd));   // pristine baseline for resetFields()
      wire();
      buildFields(json);
      buildPresetSwitch();
      buildPresetGallery();
      wireSearch();
      wireDevice();
      wireMotion();
      MockSE.load();
      MockSE.twitch(); MockSE.youtube(); MockSE.alert('follow');
    })
    .catch(err => { console.error('Failed to load widget.json', err); });
})();
