/* ================================================================
   StreamElements · Multistream Chat Overlay — logic
   ----------------------------------------------------------------
   Pipeline:  raw event ─► normalize*() ─► UnifiedMessage ─► render()
   Sources :  Twitch + YouTube + SE alerts (native onEventReceived)
              Kick (via Railway relay WebSocket, see connectRelay)
   Styling :  applyTheme() writes CSS custom properties + classes,
              so the same code renders in SE and in /preview.
   ================================================================ */

/* eslint-disable no-unused-vars */
(function () {
  'use strict';

  // ---- module state ---------------------------------------------
  let F = {};                       // fieldData (settings)
  let listEl = null;                // .se-chat__list
  let rootEl = null;                // .se-chat
  let total = 0;                    // running message counter (unique ids)
  let lastSenderKey = null;         // for mergeMessages
  const customEmotes = new Map();   // name -> url  (7TV / BTTV / FFZ)
  let relaySocket = null;
  let relayRetry = 0;

  const ROLE_PRIORITY = ['broadcaster', 'moderator', 'vip', 'subscriber'];

  // ================================================================
  //  Boot
  // ================================================================
  window.addEventListener('onWidgetLoad', function (obj) {
    const detail = obj.detail || {};
    F = detail.fieldData || {};
    rootEl = document.getElementById('seChat');
    listEl = document.getElementById('chatList');

    injectCrayonFilter();
    injectFont(F.fontName);
    applyTheme(F);

    // Async enrichments (never block rendering; fail silently).
    loadCustomEmotes().catch(() => {});
    connectRelay();
  });

  // ================================================================
  //  Event router
  // ================================================================
  window.addEventListener('onEventReceived', function (obj) {
    const d = obj.detail || {};
    const listener = d.listener;
    const event = d.event || {};

    if (listener === 'message') {
      const data = event.data || event;
      const u = data && (data.snippet || data.authorDetails || data.avatar)
        ? normalizeYouTube(data)
        : normalizeTwitch(data);
      if (u) handleChat(u);
      return;
    }

    if (listener === 'delete-message') { removeByMsgId(event.msgId); return; }
    if (listener === 'delete-messages') { removeByUser(event.userId); return; }

    if (listener === 'widget-button') { handleButton(event.field); return; }

    // Alert listeners → inline alert render
    if (/-latest$/.test(listener || '')) {
      const u = normalizeAlert(listener, event);
      if (u) { addMessage(u); playSound(u.alert.type); }
    }
  });

  // ================================================================
  //  Normalizers → UnifiedMessage
  //  { platform, msgId, userId, displayName, color, avatar,
  //    badges:[{url,type}], roles:[], emotes:{name:url}, text,
  //    isAction, kind:'chat'|'alert', alert? }
  // ================================================================
  function normalizeTwitch(data) {
    if (!data) return null;
    const tags = data.tags || {};
    if (tags['room-id']) loadChannelEmotes(tags['room-id']).catch(() => {});
    return {
      platform: 'twitch',
      msgId: data.msgId || tags.id || ('t' + Date.now()),
      userId: data.userId || tags['user-id'] || data.nick,
      displayName: data.displayName || tags['display-name'] || data.nick || 'anon',
      color: data.displayColor || tags.color || '',
      avatar: '',
      badges: (data.badges || []).map(b => ({ url: b.url, type: b.type })),
      roles: rolesFromTwitch(tags, data.badges),
      emotes: nativeEmoteMap(data.emotes),
      text: data.text || '',
      isAction: !!data.isAction,
      kind: 'chat'
    };
  }

  function normalizeYouTube(data) {
    const author = data.authorDetails || {};
    const roles = [];
    if (author.isChatOwner) roles.push('broadcaster');
    if (author.isChatModerator) roles.push('moderator');
    if (author.isChatSponsor) roles.push('subscriber');
    return {
      platform: 'youtube',
      msgId: data.msgId || data.id || ('y' + Date.now()),
      userId: data.userId || author.channelId || data.nick,
      displayName: data.displayName || author.displayName || 'anon',
      color: '',
      avatar: data.avatar || author.profileImageUrl || '',
      badges: [],
      roles: roles,
      emotes: nativeEmoteMap(data.emotes),
      text: data.text || (data.snippet && data.snippet.displayMessage) || '',
      isAction: !!data.isAction,
      kind: 'chat'
    };
  }

  // Kick comes pre-shaped from our own relay; keep mapping tolerant.
  function normalizeKick(p) {
    if (!p) return null;
    const roles = [];
    (p.badges || []).forEach(b => {
      const t = (b.type || b).toString().toLowerCase();
      if (t.includes('broadcaster') || t.includes('host')) roles.push('broadcaster');
      else if (t.includes('moderator')) roles.push('moderator');
      else if (t.includes('vip')) roles.push('vip');
      else if (t.includes('sub') || t.includes('founder')) roles.push('subscriber');
    });
    return {
      platform: 'kick',
      msgId: p.msgId || p.id || ('k' + Date.now()),
      userId: p.userId || p.sender || p.displayName,
      displayName: p.displayName || p.sender || 'anon',
      color: p.color || '',
      avatar: p.avatar || '',
      badges: (p.badges || []).filter(b => b.url).map(b => ({ url: b.url, type: b.type })),
      roles: roles,
      emotes: p.emotes || {},
      text: p.text || '',
      isAction: false,
      kind: 'chat'
    };
  }

  function normalizeAlert(listener, e) {
    const map = {
      'follower-latest': 'follow',
      'subscriber-latest': 'sub',
      'tip-latest': 'tip',
      'cheer-latest': 'cheer',
      'raid-latest': 'raid',
      'host-latest': 'host'
    };
    const type = map[listener];
    if (!type) return null;
    if (!alertEnabled(type)) return null;

    const name = e.name || e.displayName || 'Someone';
    const amount = e.amount != null ? e.amount : (e.months || '');
    const tmpl = {
      follow: F.alertLabelFollow || '{name} followed',
      sub: F.alertLabelSub || '{name} subscribed',
      tip: F.alertLabelTip || '{name} tipped {amount}',
      cheer: F.alertLabelCheer || '{name} cheered {amount}',
      raid: F.alertLabelRaid || '{name} raided with {amount}',
      host: '{name} hosted with {amount}'
    }[type];
    const label = tmpl
      .replace(/{name}/g, name)
      .replace(/{amount}/g, amount)
      .replace(/{tier}/g, e.tier || '')
      .replace(/{months}/g, e.amount || '');

    return {
      platform: 'twitch', kind: 'alert', msgId: 'a' + Date.now(),
      userId: name, displayName: name, color: '', avatar: '',
      badges: [], roles: [], emotes: {}, isAction: false,
      text: label,
      alert: { type, amount, label, message: e.message || '' }
    };
  }

  // ================================================================
  //  Chat handling (filters + merge)
  // ================================================================
  function handleChat(u) {
    if (!u.text && u.kind === 'chat') return;
    if (str(F.hideCommands, 'yes') === 'yes' && u.text.trim().startsWith('!')) return;
    if (isIgnored(u.displayName)) return;

    if (str(F.mergeMessages, 'no') === 'yes') {
      const key = u.platform + ':' + u.userId;
      if (key === lastSenderKey) {
        const last = listEl && listEl.lastElementChild &&
          listEl.lastElementChild.querySelector('.msg__text');
        if (last) {
          const span = document.createElement('span');
          span.innerHTML = ' ' + renderText(u.text, u.emotes);
          last.appendChild(span);
          playSound('message');
          return;
        }
      }
      lastSenderKey = key;
    } else {
      lastSenderKey = null;
    }

    addMessage(u);
    playSound('message');
  }

  // ================================================================
  //  Renderer
  // ================================================================
  function addMessage(u) {
    if (!listEl) return;
    total += 1;

    const row = document.createElement('div');
    row.className = 'msg msg--' + u.platform + roleClass(u);
    if (u.kind === 'alert') row.classList.add('msg--alert');
    row.dataset.msgid = u.msgId;
    row.dataset.userid = u.userId;
    row.id = 'msg-' + total;

    const animIn = str(F.animationIn, 'fadeInUp');
    if (str(F.disableAllAnimations, 'no') !== 'yes' && animIn !== 'none') {
      row.classList.add('animate__animated', 'animate__' + animIn);
    }

    const icon = iconMarkup(u);
    const head = u.kind === 'alert' ? '' : headMarkup(u);
    const body = u.kind === 'alert' ? alertBody(u) : ('<span class="msg__text' +
      (u.isAction ? ' is-action' : '') + '">' + renderText(u.text, u.emotes) + '</span>');

    row.innerHTML =
      '<div class="msg__bubble">' +
        icon +
        '<div class="msg__body">' + head + body + '</div>' +
        '<span class="msg__arrow"></span>' +
      '</div>';

    listEl.appendChild(row);
    enforceLimit();
    scheduleRemoval(row, u);
  }

  function headMarkup(u) {
    const badges = u.badges.map(b =>
      '<img class="badge" alt="" src="' + encodeURI(b.url) + '">').join('');
    const logo = '<img class="msg__platform-logo" alt="' + u.platform +
      '" src="' + platformLogo(u.platform) + '">';
    const nameStyle = nameColorStyle(u);
    return '<span class="msg__head">' + logo +
      '<span class="msg__badges">' + badges + '</span>' +
      '<span class="msg__name"' + nameStyle + '>' + htmlEncode(u.displayName) + '</span>' +
      '<span class="msg__colon">:</span></span>';
  }

  function alertBody(u) {
    const sub = u.alert.message
      ? '<div class="alert__sub">' + renderText(u.alert.message, {}) + '</div>' : '';
    return '<span class="alert__label">' + htmlEncode(u.alert.label) + '</span>' + sub;
  }

  function iconMarkup(u) {
    if (u.kind === 'alert') {
      const glyph = { follow: '♥', sub: '★', tip: '$', cheer: '◆', raid: '⚑', host: '⚑' }[u.alert.type] || '★';
      return '<div class="msg__icon"><span class="alert__glyph">' + glyph + '</span></div>';
    }
    const avatar = u.avatar
      ? '<img class="msg__avatar" alt="" src="' + encodeURI(u.avatar) + '">'
      : '<img class="msg__avatar" alt="" src="' + platformLogo(u.platform) + '">';
    return '<div class="msg__icon">' + avatar + '<span class="msg__dot"></span></div>';
  }

  function nameColorStyle(u) {
    const mode = str(F.nickColor, 'user');
    if (mode === 'custom') return ' style="color:var(--custom-nick-color)"';
    if (mode === 'message') return '';
    if (mode === 'remove') return '';
    // user / platform color, with md5 fallback for stable per-user color
    const c = u.color || stableColor(u.displayName);
    return ' style="color:' + c + '"';
  }

  function renderText(text, emoteMap) {
    const all = Object.assign({}, mapFromObject(customEmotes), emoteMap || {});
    const keywords = keywordList();
    const tokens = String(text).split(/(\s+)/); // keep whitespace tokens
    return tokens.map(tok => {
      if (/^\s+$/.test(tok) || tok === '') return tok;
      if (all[tok]) {
        return '<img class="emote" alt="' + htmlEncode(tok) + '" src="' + encodeURI(all[tok]) + '">';
      }
      const enc = htmlEncode(tok);
      if (keywords.length && keywords.indexOf(tok.toLowerCase()) !== -1) {
        return '<span class="kw">' + enc + '</span>';
      }
      return enc;
    }).join('');
  }

  // ---- limit / lifetime -----------------------------------------
  function enforceLimit() {
    const limit = num(F.messagesLimit, 8);
    while (listEl.children.length > limit) {
      listEl.removeChild(listEl.firstElementChild);
    }
  }

  function scheduleRemoval(row, u) {
    let ttl = num(F.hideAfter, 0);
    if (u.kind === 'alert') ttl = Math.max(num(F.alertMinDuration, 8), ttl);
    if (ttl <= 0) return;
    setTimeout(() => animateOut(row), ttl * 1000);
  }

  function animateOut(row) {
    if (!row || !row.parentNode) return;
    const out = str(F.animationOut, 'fadeOut');
    if (str(F.disableAllAnimations, 'no') === 'yes' || out === 'none') { row.remove(); return; }
    const animIn = str(F.animationIn, 'fadeInUp');
    row.classList.remove('animate__' + animIn);
    row.classList.add('animate__animated', 'animate__' + out);
    setTimeout(() => row.remove(), num(F.animationSpeed, 500) + 60);
  }

  function removeByMsgId(id) {
    const el = listEl && listEl.querySelector('[data-msgid="' + cssEsc(id) + '"]');
    if (el) el.remove();
  }
  function removeByUser(uid) {
    if (!listEl) return;
    listEl.querySelectorAll('[data-userid="' + cssEsc(uid) + '"]').forEach(e => e.remove());
  }

  // ================================================================
  //  Theme application (CSS vars + classes + data-attrs)
  // ================================================================
  function applyTheme(f) {
    const r = document.documentElement.style;
    const set = (k, v) => r.setProperty(k, v);

    set('--font-name', "'" + (f.fontName || 'Inter') + "'");
    set('--font-size', num(f.fontSize, 22) + 'px');
    set('--font-weight', str(f.fontWeight, '500'));
    set('--font-color', f.fontColor || 'rgba(255,255,255,1)');
    set('--text-shadow', f.textShadow || 'rgba(0,0,0,0.6) 0 2px 4px');
    set('--emote-size', num(f.emoteSize, 28) + 'px');
    set('--badge-size', Math.round(num(f.fontSize, 22) * 0.92) + 'px');

    set('--row-bg', f.rowBackground || 'rgba(20,20,28,0.55)');
    set('--overlay-bg', f.overlayBackground || 'rgba(0,0,0,0)');
    set('--row-gap', num(f.rowGap, 8) + 'px');
    set('--row-maxwidth', num(f.rowMaxWidth, 460) + 'px');
    set('--row-width', num(f.rowWidth, 100) + '%');

    set('--custom-nick-color', f.customNickColor || 'rgba(120,170,255,1)');
    set('--keyword-color', f.keywordColor || 'rgba(255,221,87,1)');
    set('--keyword-bg', f.keywordBackground || 'rgba(255,221,87,0.14)');

    set('--dot-twitch', f.dotTwitch || '#9146ff');
    set('--dot-youtube', f.dotYouTube || '#ff0000');
    set('--dot-kick', f.dotKick || '#53fc18');

    set('--role-broadcaster', f.colorBroadcaster || '#ff4d4d');
    set('--role-mod', f.colorMod || '#3fb950');
    set('--role-vip', f.colorVip || '#ff7ad9');
    set('--role-sub', f.colorSub || '#6aa0ff');
    set('--alert-accent', f.alertAccent || 'rgba(255,196,0,1)');

    set('--anim-duration', num(f.animationSpeed, 500) + 'ms');
    set('--perspective', num(f.perspective, 0) + 'deg');

    if (!rootEl) return;
    rootEl.dataset.layout = str(f.layoutMode, 'horizontal');
    rootEl.dataset.halign = str(f.hAlign, 'left');
    rootEl.dataset.valign = str(f.vAlign, 'bottom');
    rootEl.dataset.mask = str(f.maskFade, 'none');

    toggle('no-bubble', str(f.bubble, 'bubble') === 'plain');
    toggle('show-arrow', yes(f.showArrow));
    toggle('show-icon', yes(f.showAvatar));
    toggle('show-dot', yes(f.showPlatformDot));
    toggle('show-logo', yes(f.showPlatformLogo));
    toggle('no-badges', !yes(f.displayBadges));
    toggle('no-name', str(f.nickColor, 'user') === 'remove');
    toggle('role-highlight', yes(f.roleHighlight));
    toggle('fx-perspective', num(f.perspective, 0) !== 0);
    toggle('fx-crayon', yes(f.crayonTexture));
    toggle('no-anim', yes(f.disableAllAnimations));
  }

  // ================================================================
  //  Custom emotes (7TV / BTTV / FFZ) — global + channel, async
  // ================================================================
  async function loadCustomEmotes() {
    const tasks = [];
    if (yes(F.enable7tv)) tasks.push(fetch7tvGlobal());
    if (yes(F.enableBttv)) tasks.push(fetchBttvGlobal());
    if (yes(F.enableFfz)) tasks.push(fetchFfzGlobal());
    await Promise.allSettled(tasks);
  }
  // Channel sets are loaded lazily on the first Twitch message (needs room-id).
  let channelEmotesLoaded = false;
  async function loadChannelEmotes(twitchId) {
    if (channelEmotesLoaded || !twitchId) return;
    channelEmotesLoaded = true;
    const tasks = [];
    if (yes(F.enable7tv)) tasks.push(fetch7tvChannel(twitchId));
    if (yes(F.enableBttv)) tasks.push(fetchBttvChannel(twitchId));
    if (yes(F.enableFfz)) tasks.push(fetchFfzChannel(twitchId));
    await Promise.allSettled(tasks);
  }

  async function fetch7tvGlobal() {
    const j = await getJSON('https://7tv.io/v3/emote-sets/global');
    (j.emotes || []).forEach(e => customEmotes.set(e.name, sevenTvUrl(e.id)));
  }
  async function fetch7tvChannel(id) {
    const j = await getJSON('https://7tv.io/v3/users/twitch/' + id);
    const emotes = j && j.emote_set && j.emote_set.emotes ? j.emote_set.emotes : [];
    emotes.forEach(e => customEmotes.set(e.name, sevenTvUrl(e.id)));
  }
  const sevenTvUrl = id => 'https://cdn.7tv.app/emote/' + id + '/2x.webp';

  async function fetchBttvGlobal() {
    const arr = await getJSON('https://api.betterttv.net/3/cached/emotes/global');
    (arr || []).forEach(e => customEmotes.set(e.code, bttvUrl(e.id)));
  }
  async function fetchBttvChannel(id) {
    const j = await getJSON('https://api.betterttv.net/3/cached/users/twitch/' + id);
    [].concat(j.channelEmotes || [], j.sharedEmotes || [])
      .forEach(e => customEmotes.set(e.code, bttvUrl(e.id)));
  }
  const bttvUrl = id => 'https://cdn.betterttv.net/emote/' + id + '/2x';

  async function fetchFfzGlobal() {
    const j = await getJSON('https://api.frankerfacez.com/v1/set/global');
    ffzCollect(j);
  }
  async function fetchFfzChannel(id) {
    const j = await getJSON('https://api.frankerfacez.com/v1/room/id/' + id);
    ffzCollect(j);
  }
  function ffzCollect(j) {
    const sets = (j && j.sets) || {};
    Object.keys(sets).forEach(k => (sets[k].emoticons || []).forEach(e => {
      const u = e.urls && (e.urls['2'] || e.urls['1']);
      if (u) customEmotes.set(e.name, (u.startsWith('//') ? 'https:' + u : u));
    }));
  }

  // ================================================================
  //  Kick relay (Railway) — WebSocket client with backoff
  // ================================================================
  function connectRelay() {
    const url = (F.relayUrl || '').trim();
    if (!url || !/^wss?:\/\//.test(url)) return;
    try {
      relaySocket = new WebSocket(url);
    } catch (e) { return scheduleReconnect(); }

    relaySocket.onopen = () => {
      relayRetry = 0;
      if (F.kickChannel) {
        safeSend({ type: 'subscribe', platform: 'kick', channel: F.kickChannel });
      }
    };
    relaySocket.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m && m.type === 'message') {
        const u = normalizeKick(m.payload || m);
        if (u) { handleChat(u); }
      }
    };
    relaySocket.onclose = scheduleReconnect;
    relaySocket.onerror = () => { try { relaySocket.close(); } catch (_) {} };
  }
  function scheduleReconnect() {
    relayRetry = Math.min(relayRetry + 1, 6);
    setTimeout(connectRelay, 1000 * relayRetry);
  }
  function safeSend(o) { try { relaySocket.send(JSON.stringify(o)); } catch (_) {} }

  // ================================================================
  //  Sound
  // ================================================================
  function playSound(type) {
    if (!yes(F.soundEnabled)) return;
    const url = { message: F.soundMessage, follow: F.soundFollow, sub: F.soundSub, tip: F.soundTip }[type];
    if (!url) return;
    try {
      const a = new Audio(url);
      a.volume = Math.max(0, Math.min(1, num(F.soundVolume, 60) / 100));
      a.play().catch(() => {});
    } catch (_) {}
  }

  // ================================================================
  //  Test buttons (widget-button)
  // ================================================================
  function handleButton(field) {
    // Test buttons bypass the ignored/command filters so they ALWAYS render.
    if (field === 'testMessage') {
      addMessage(normalizeTwitch(sampleTwitch()));
    } else if (field === 'testAlert') {
      const u = normalizeAlert('follower-latest', { name: 'TestUser', amount: 1 });
      if (u) addMessage(u);
    } else if (field === 'testKick') {
      addMessage(normalizeKick({ displayName: 'KickViewer', text: 'Hello from Kick! KEKW',
        color: '#53fc18', badges: [{ type: 'moderator' }] }));
    }
  }

  // ================================================================
  //  Helpers
  // ================================================================
  function rolesFromTwitch(tags, badges) {
    const roles = [];
    const list = (tags.badges || '') + ',' + (badges || []).map(b => b.type).join(',');
    if (/broadcaster/.test(list)) roles.push('broadcaster');
    if (tags.mod === '1' || /moderator/.test(list)) roles.push('moderator');
    if (/vip/.test(list)) roles.push('vip');
    if (tags.subscriber === '1' || /subscriber|founder/.test(list)) roles.push('subscriber');
    return roles;
  }

  function roleClass(u) {
    if (!yes(F.roleHighlight)) return '';
    for (const r of ROLE_PRIORITY) if (u.roles.indexOf(r) !== -1) return ' msg--role-' + r;
    return '';
  }

  function nativeEmoteMap(emotes) {
    const m = {};
    (emotes || []).forEach(e => {
      const url = e.urls ? (e.urls['2'] || e.urls['1'] || e.urls['4']) : e.url;
      if (e.name && url) m[e.name] = url;
    });
    return m;
  }

  function alertEnabled(type) {
    if (!yes(F.showAlerts)) return false;
    const map = { follow: F.alertFollow, sub: F.alertSub, tip: F.alertTip, cheer: F.alertCheer, raid: F.alertRaid, host: 'yes' };
    return yes(map[type] != null ? map[type] : 'yes');
  }

  function isIgnored(name) {
    const list = (F.ignoredUsers || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    return list.indexOf((name || '').toLowerCase()) !== -1;
  }

  function keywordList() {
    return (F.highlightKeywords || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  }

  function platformLogo(p) {
    const svg = {
      twitch: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='5' fill='%239146ff'/><path d='M6 4l-1 4v9h3v3h2l3-3h3l4-4V4z' fill='%23fff'/><rect x='14' y='8' width='1.6' height='4' fill='%239146ff'/><rect x='10' y='8' width='1.6' height='4' fill='%239146ff'/></svg>",
      youtube: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='6' fill='%23ff0000'/><path d='M10 8l6 4-6 4z' fill='%23fff'/></svg>",
      kick: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='5' fill='%2353fc18'/><path d='M7 5h4v4h2V7h2V5h3v5h-2v2h2v5h-3v-2h-2v-2h-2v4H7z' fill='%23111'/></svg>"
    }[p] || "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='6' fill='%23888'/></svg>";
    return 'data:image/svg+xml;utf8,' + svg;
  }

  function injectFont(name) {
    if (!name) return;
    const fam = String(name).trim().replace(/\s+/g, '+');
    const id = 'se-font-' + fam;
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css?family=' + fam + ':300,400,500,700,900&display=swap';
    document.head.appendChild(l);
  }

  function injectCrayonFilter() {
    if (document.getElementById('se-crayon-svg')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'se-crayon-svg';
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = "<filter id='crayon'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' result='n'/><feDisplacementMap in='SourceGraphic' in2='n' scale='1.4'/></filter>";
    document.body.appendChild(svg);
  }

  function stableColor(name) {
    const palette = ['#ff7a7a', '#ffb86b', '#ffe66b', '#7affa1', '#6be7ff', '#8a9bff', '#d18bff', '#ff8ad0'];
    let hash = 0;
    if (typeof md5 === 'function') { const h = md5(name || 'x'); hash = parseInt(h.slice(0, 6), 16); }
    else { for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0; }
    return palette[hash % palette.length];
  }

  // utils
  function htmlEncode(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cssEsc(s) { return String(s == null ? '' : s).replace(/["\\\]]/g, '\\$&'); }
  function mapFromObject(map) { const o = {}; map.forEach((v, k) => { o[k] = v; }); return o; }
  function str(v, d) { return (v == null || v === '') ? d : String(v); }
  function num(v, d) { const n = parseFloat(v); return isNaN(n) ? d : n; }
  function yes(v) { return String(v) === 'yes' || v === true; }
  function toggle(cls, on) { if (rootEl) rootEl.classList.toggle(cls, !!on); }
  function getJSON(url) {
    return fetch(url, { mode: 'cors' }).then(r => r.ok ? r.json() : Promise.reject(r.status));
  }

  function sampleTwitch() {
    return {
      text: 'Test message — multistream chat works!',
      displayName: 'TestUser', nick: 'testuser', userId: '1234',
      displayColor: '#9146ff', isAction: false,
      tags: { badges: 'broadcaster/1', mod: '0', subscriber: '0', 'user-id': '1234', id: 't' + Date.now() },
      badges: [], emotes: []
    };
  }

  // Expose a tiny hook so the preview harness can confirm load.
  window.__seChatReady = true;
})();
