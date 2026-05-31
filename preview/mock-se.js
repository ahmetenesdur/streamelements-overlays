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
        raid: ['raid-latest', { name: 'BigStreamer', amount: 142 }]
      }[type];
      if (e) dispatch(e[0], e[1]);
    },

    deleteLast() {
      const last = document.querySelector('#chatList .msg:last-child');
      if (last) dispatch('delete-message', { msgId: last.dataset.msgid });
    },
    clear() { document.getElementById('chatList').innerHTML = ''; },
    rain(n) { let i = 0; const t = setInterval(() => { (Math.random() < 0.5 ? this.twitch() : this.youtube()); if (++i >= (n || 20)) clearInterval(t); }, 120); }
  };
  window.MockSE = MockSE;

  // ---- wire control panel ---------------------------------------
  function wire() {
    document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'bg') return document.getElementById('stage').classList.toggle('scene');
      if (a === 'rain') return MockSE.rain(20);
      if (a.startsWith('alert:')) return MockSE.alert(a.split(':')[1]);
      if (typeof MockSE[a] === 'function') MockSE[a]();
    }));
    document.querySelectorAll('[data-set]').forEach(sel => sel.addEventListener('change', () =>
      MockSE.set(sel.dataset.set, sel.value)));
    document.querySelectorAll('[data-toggle]').forEach(cb => cb.addEventListener('change', () =>
      MockSE.set(cb.dataset.toggle, cb.checked ? 'yes' : 'no')));
    document.querySelectorAll('[data-color]').forEach(inp => inp.addEventListener('input', () =>
      MockSE.set(inp.dataset.color, inp.value)));
    const pers = document.querySelector('[data-pers]');
    if (pers) pers.addEventListener('change', () => MockSE.set('perspective', pers.checked ? 12 : 0));
    const scene = document.querySelector('[data-scene]');
    if (scene) scene.addEventListener('change', () => {
      const stage = document.getElementById('stage');
      stage.className = '';            // drop all scene-* classes
      if (scene.value) stage.classList.add(scene.value);
    });
  }

  // ---- boot: load widget.json defaults, then start --------------
  fetch('../widget/widget.json')
    .then(r => r.json())
    .then(json => {
      const fd = {};
      Object.keys(json).forEach(k => { fd[k] = json[k].value; });
      MockSE.fieldData = fd;
      wire();
      MockSE.load();
      // seed a couple of messages so the stage isn't empty on open
      MockSE.twitch(); MockSE.youtube(); MockSE.alert('follow');
    })
    .catch(err => { console.error('Failed to load widget.json', err); });
})();
