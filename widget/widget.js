/* ================================================================
   StreamElements · Multistream Chat Overlay — logic
   ----------------------------------------------------------------
   Pipeline:  raw event ─► normalize*() ─► UnifiedMessage ─► render()
   Sources :  Twitch + YouTube + SE alerts (native onEventReceived)
              Kick (via Railway relay WebSocket, see connectRelay)
   Styling :  applyTheme() writes CSS custom properties + classes,
              so the same code renders in SE and in /preview.
   ================================================================ */

(function () {
  'use strict';

  /**
   * @typedef {Object} UnifiedMessage
   * @property {'twitch'|'youtube'|'kick'} platform
   * @property {string}  msgId
   * @property {string}  userId
   * @property {string}  [login]
   * @property {string}  displayName
   * @property {string}  color
   * @property {string}  avatar
   * @property {Array<{url?:string, type:string, text?:string}>} badges
   * @property {string[]} roles
   * @property {Object<string,string>} emotes
   * @property {string}  text
   * @property {boolean} isAction
   * @property {boolean} [shared]
   * @property {string} [roomId]
   * @property {string} [sharedSourceRoomId]
   * @property {string} [sharedSourceLabel]
   * @property {'chat'|'alert'} kind
   * @property {AlertData} [alert]
   */

  /**
   * @typedef {Object} AlertData
   * @property {'follow'|'sub'|'resub'|'gift'|'communitygift'|'tip'|'cheer'|'raid'|'host'|'superchat'|'member'|'reward'} type
   * @property {string|number} amount
   * @property {string} label
   * @property {string} message
   */

  // ---- module state ---------------------------------------------
  let F = {};                       // fieldData (settings)
  let listEl = null;                // .se-chat__list
  let rootEl = null;                // .se-chat
  let participantsEl = null;        // .se-chat__participants (lazy)
  let channelName = '';             // host channel (from onWidgetLoad) — labels host in roster
  let total = 0;                    // running message counter (unique ids)
  let lastSenderKey = null;         // for mergeMessages
  const sharedRooms = new Map();    // roomId -> {roomId,label,host} (Shared Chat participants)
  const customEmotes = new Map();   // name -> {url,zw} | url  (7TV / BTTV / FFZ)
  const channelEmoteIds = new Set();// Twitch room ids whose channel emotes should refresh with globals
  const channelEmotesLoaded = new Set();
  let relaySocket = null;
  let relayRetry = 0;
  let emoteLastLoad = 0;            // timestamp of last emote fetch (for TTL refresh)

  const ROLE_PRIORITY = ['broadcaster', 'leadmod', 'moderator', 'artist', 'vip', 'subscriber', 'fav', 'regular'];
  const QUICK_SETUP_PRESETS = {
    cleanEditorial: {
      stylePreset: 'editorial',
      layoutMode: 'vertical',
      density: 'comfortable',
      showAvatar: 'no',
      showArrow: 'no',
      showPlatformLogo: 'yes',
      showPlatformDot: 'no',
      messageGrouping: 'off',
      dynamicOpacity: 'no',
      fullscreenFloat: 'no',
      roleHighlight: 'no',
      roleNameBg: 'no',
      roleMsgBg: 'no',
      roleMsgText: 'no'
    },
    frostedStack: {
      stylePreset: 'frosted',
      layoutMode: 'vertical',
      density: 'comfortable',
      showAvatar: 'yes',
      showArrow: 'yes',
      showPlatformLogo: 'yes',
      showPlatformDot: 'no',
      messageGrouping: 'stack',
      dynamicOpacity: 'yes',
      oldestMessageOpacity: 38,
      fullscreenFloat: 'no'
    },
    multistreamMinimal: {
      stylePreset: 'editorial',
      layoutMode: 'vertical',
      density: 'compact',
      showAvatar: 'no',
      showArrow: 'no',
      showPlatformLogo: 'no',
      showPlatformDot: 'yes',
      dotTwitchOn: 'yes',
      dotYouTubeOn: 'yes',
      dotKickOn: 'yes',
      messageGrouping: 'stack',
      dynamicOpacity: 'yes',
      oldestMessageOpacity: 40,
      sharedChatIndicator: 'yes'
    },
    bottomTicker: {
      stylePreset: 'slate',
      layoutMode: 'horizontal',
      hDirection: 'right',
      density: 'compact',
      messagesLimit: 10,
      rowMaxWidth: 420,
      showAvatar: 'no',
      showArrow: 'no',
      showPlatformLogo: 'no',
      showPlatformDot: 'yes',
      messageGrouping: 'off',
      dynamicOpacity: 'no',
      fullscreenFloat: 'no'
    },
    fullscreenFloat: {
      stylePreset: 'frosted',
      layoutMode: 'fullscreen',
      fullscreenFloat: 'yes',
      density: 'comfortable',
      messagesLimit: 12,
      rowWidth: 100,
      showAvatar: 'yes',
      showArrow: 'yes',
      showPlatformLogo: 'yes',
      showPlatformDot: 'no',
      messageGrouping: 'off',
      dynamicOpacity: 'yes',
      oldestMessageOpacity: 35
    },
    roleRich: {
      stylePreset: 'frosted',
      layoutMode: 'vertical',
      density: 'comfortable',
      showAvatar: 'yes',
      showArrow: 'yes',
      displayBadges: 'yes',
      showPlatformLogo: 'yes',
      showPlatformDot: 'no',
      messageGrouping: 'stack',
      roleHighlight: 'yes',
      roleNameBg: 'yes',
      roleMsgBg: 'yes',
      roleMsgText: 'no',
      nativeColorPlacement: 'background'
    }
  };
  // Per-preset COLOR + FONT identity. applyTheme resolves each token as
  // `user field -> preset value -> global default`. Surface/structure lives in
  // CSS [data-preset]; this is the slice applyTheme must own because it sets
  // those tokens unconditionally and injects webfonts. Distinctive, non-cliché
  // accents + fonts (never Inter / a purple gradient) give each its own feel.
  const PRESET_THEME = {
    editorial: { accent: '#e8c99a', font: 'Hanken Grotesk' },
    frosted:   { accent: '#bcd3ff', font: 'Hanken Grotesk' },
    slate:     { accent: '#e8c99a', font: 'Hanken Grotesk' },
    pulse:     { accent: '#7c9cff', font: 'Bricolage Grotesque' },
    daylight:  {
      accent: '#b9762e', font: 'Hanken Grotesk', nameFont: 'Instrument Serif',
      ink: 'rgba(28,26,24,0.94)', nick: '#4a63b8',
      dotTwitch: '#7a52c8', dotYouTube: '#cc3b3b', dotKick: '#3a9e2a',
      roles: {
        broadcaster: '#c0445c', leadmod: '#1f8f7e', mod: '#2f9c57',
        artist: '#b5631f', vip: '#b54a93', sub: '#4a63b8', fav: '#9a7416'
      }
    },
    terminal:  { accent: '#8bf2a6', font: 'Space Mono', nameFont: 'Space Mono' }
  };
  const pronounCache = {};   // twitch login -> short pronoun label ('' = none)
  let pronounMap = null;     // id -> short label (loaded once)

  // ================================================================
  //  Boot
  // ================================================================
  window.addEventListener('onWidgetLoad', function (obj) {
    const detail = obj.detail || {};
    F = applyQuickSetup(detail.fieldData || {});
    const ch = detail.channel || {};
    channelName = ch.username || ch.name || ch.displayName || channelName;
    rootEl = document.getElementById('seChat');
    listEl = document.getElementById('chatList');

    injectLiquidGlassFilter();
    injectCrayonFilter();
    injectFont(F.fontName);
    applyTheme(F);

    // Async enrichments (never block rendering; fail silently).
    loadCustomEmotes().catch(function() {});
    emoteLastLoad = Date.now();
    loadPronounMap();
    connectRelay();
  });

  // ================================================================
  //  Event router
  // ================================================================
  window.addEventListener('onEventReceived', function (obj) {
    try {
      var d = obj.detail || {};
      var listener = d.listener;
      var event = d.event || {};

      if (listener === 'message') {
        var data = event.data || event;
        var u = data && (data.snippet || data.authorDetails || data.avatar)
          ? normalizeYouTube(data)
          : normalizeTwitch(data);
        if (u) handleChat(u);
        return;
      }

      if (listener === 'delete-message') { removeByMsgId(event.msgId); return; }
      if (listener === 'delete-messages') { removeByUser(event.userId); return; }

      if (listener === 'event:skip') {
        var lastAlert = listEl && listEl.querySelector('.msg--alert:last-child');
        if (lastAlert) animateOut(lastAlert);
        return;
      }

      var buttonField = buttonFieldFromEvent(listener, d, event);
      if (buttonField) { handleButton(buttonField); return; }

      // Alert listeners → inline alert render
      if (/-latest$/.test(listener || '')) {
        var au = normalizeAlert(listener, event);
        if (au) { addMessage(au); playSound(au.alert.type); }
      }
    } catch (err) {
      if (debugMode()) console.warn('[se-chat] event error:', err);
    }
  });

  function applyQuickSetup(fields) {
    const raw = Object.assign({}, fields || {});
    const preset = String(raw.quickSetupPreset || 'manual');
    const overrides = QUICK_SETUP_PRESETS[preset];
    if (!overrides) {
      raw.quickSetupPreset = 'manual';
      return raw;
    }
    return Object.assign(raw, overrides, { quickSetupPreset: preset });
  }

  function buttonFieldFromEvent(listener, detail, event) {
    const nestedListener = event && event.listener;
    if (listener !== 'widget-button' && nestedListener !== 'widget-button') return '';
    return String((event && event.field) || (detail && detail.field) || '');
  }

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
    // Shared Chat (Stream Together): message originates in another channel.
    const srcRoom = tags['source-room-id'];
    const shared = !!(srcRoom && tags['room-id'] && srcRoom !== tags['room-id']);
    const sharedSourceRoomId = shared ? String(srcRoom) : '';
    return {
      platform: 'twitch',
      roomId: tags['room-id'] ? String(tags['room-id']) : '',
      shared: shared,
      sharedSourceRoomId: sharedSourceRoomId,
      sharedSourceLabel: sharedSourceRoomId ? sharedLabelForRoom(sharedSourceRoomId) : '',
      msgId: data.msgId || tags.id || ('t' + Date.now()),
      userId: data.userId || tags['user-id'] || data.nick,
      login: (data.nick || tags.login || data.displayName || '').toLowerCase(),
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
      badges: (p.badges || []).map(b => ({
        url: b.url || '',
        type: b.type || '',
        text: b.text || ''
      })).filter(b => b.url || b.text),
      roles: roles,
      emotes: p.emotes || {},
      text: p.text || '',
      isAction: false,
      kind: 'chat'
    };
  }

  // Maps the 6 native SE alert listeners → our alert types. subscriber-latest
  // is split into sub / resub / gift / community-gift per the SDK event fields.
  // (tip-latest also carries YouTube Super Chat; subscriber-latest also carries
  // YouTube memberships.) No channel-points/superchat listeners exist in the SDK.
  // YouTube reuses Twitch's tip/subscriber listeners for Super Chats and
  // memberships. These detectors stay tolerant: they only re-classify when the
  // payload clearly says so, otherwise the legacy tip/sub behavior is kept.
  function lowerEventText(e, keys) {
    return keys.map(k => String(e && e[k] || '').toLowerCase()).join(' ');
  }
  function isYouTubePayload(e) {
    return /youtube|yt/.test(lowerEventText(e, ['provider', 'platform', 'source', 'service']));
  }
  function isSuperchatPayload(e) {
    return isYouTubePayload(e) && /superchat|super chat/.test(lowerEventText(e, ['type', 'kind', 'activityType', 'name']));
  }
  function isMemberPayload(e) {
    return isYouTubePayload(e) && /member|membership|sponsor/.test(lowerEventText(e, ['type', 'kind', 'activityType']));
  }

  function normalizeAlert(listener, e) {
    let type = null;
    if (listener === 'follower-latest') type = 'follow';
    else if (listener === 'cheer-latest') type = 'cheer';
    else if (listener === 'tip-latest') type = isSuperchatPayload(e) ? 'superchat' : 'tip';
    else if (listener === 'raid-latest') type = 'raid';
    else if (listener === 'host-latest') type = 'host';
    else if (listener === 'redemption-latest') type = 'reward';   // SE Store / channel-point redemption
    else if (listener === 'subscriber-latest') {
      if (e.playedAsCommunityGift) return null;          // already shown by the community-gift alert
      if (isMemberPayload(e)) type = 'member';            // YouTube membership
      else if (e.bulkGifted || e.isCommunityGift) type = 'communitygift';
      else if (e.gifted) type = 'gift';
      else if (num(e.amount, 1) > 1) type = 'resub';
      else type = 'sub';
    } else return null;

    if (!alertEnabled(type)) return null;

    const name = e.name || e.displayName || 'Someone';
    const sender = e.sender || name;
    const amount = e.amount != null ? e.amount : (e.months != null ? e.months : '');
    const count = e.count != null ? e.count : (e.amount != null ? e.amount : '');
    // Channel-point / SE Store reward title (varies by payload shape).
    const reward = e.redemption || e.reward || e.rewardTitle || e.title || '';
    const tmpl = {
      follow: F.alertLabelFollow || '{name} followed',
      sub: F.alertLabelSub || '{name} subscribed',
      resub: F.alertLabelResub || '{name} resubscribed ({amount} months)',
      gift: F.alertLabelGift || '{sender} gifted a sub to {name}',
      communitygift: F.alertLabelCommunityGift || '{sender} gifted {count} subs',
      tip: F.alertLabelTip || '{name} tipped {amount}',
      cheer: F.alertLabelCheer || '{name} cheered {amount} bits',
      raid: F.alertLabelRaid || '{name} raided with {amount} viewers',
      host: F.alertLabelHost || '{name} hosted with {amount} viewers',
      superchat: F.alertLabelSuperchat || '{name} sent a Super Chat {amount}',
      member: F.alertLabelMember || '{name} became a member',
      reward: F.alertLabelReward || '{name} redeemed {reward}'
    }[type];
    const label = String(tmpl)
      .replace(/{name}/g, name)
      .replace(/{sender}/g, sender)
      .replace(/{reward}/g, reward)
      .replace(/{amount}/g, amount)
      .replace(/{count}/g, count)
      .replace(/{months}/g, amount)
      .replace(/{tier}/g, e.tier || '');

    return {
      platform: 'twitch', kind: 'alert', msgId: 'a' + Date.now() + '-' + (++total),
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
    if (!u.text && (u.kind === 'chat')) return;
    maybeRefreshEmotes();
    if (!platformEnabled(u.platform)) return;     // single-platform / combine filter
    if (str(F.hideCommands, 'yes') === 'yes' && u.text.trim().startsWith('!')) return;
    if (isIgnored(u.displayName)) return;
    applyCustomRoles(u);                            // lead mod / fav / regular
    recordSharedParticipants(u);                    // Shared Chat roster (no-op unless shared)

    const mode = groupingMode();
    if (mode !== 'off') {
      const key = senderKey(u);
      const lastRow = listEl && listEl.lastElementChild;
      if (key === lastSenderKey && lastRow && !lastRow.classList.contains('msg--alert')) {
        const appended = mode === 'stack'
          ? appendStackedMessage(lastRow, u)
          : appendInlineMessage(lastRow, u);
        if (appended) {
          playSound('message');
          refreshDynamicOpacity();
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

  function groupingMode() {
    const explicit = str(F.messageGrouping, '');
    if (explicit) return explicit;
    return str(F.mergeMessages, 'no') === 'yes' ? 'inline' : 'off';
  }

  function senderKey(u) {
    return u.platform + ':' + (u.userId || u.login || u.displayName);
  }

  function appendInlineMessage(row, u) {
    const html = ' ' + renderText(u.text, u.emotes);
    const text = row && row.querySelector && row.querySelector('.msg__text');
    if (text && typeof text.insertAdjacentHTML === 'function') {
      text.insertAdjacentHTML('beforeend', html);
    } else if (!appendBeforeBodyClose(row, html, true)) {
      return false;
    }
    row.dataset.lastMsgid = u.msgId;
    return true;
  }

  function appendStackedMessage(row, u) {
    const html = '<span class="msg__text msg__text--continued' +
      (u.isAction ? ' is-action' : '') + '">' + renderText(u.text, u.emotes) + '</span>';
    const body = row && row.querySelector && row.querySelector('.msg__body');
    if (body && typeof body.insertAdjacentHTML === 'function') {
      body.insertAdjacentHTML('beforeend', html);
    } else if (!appendBeforeBodyClose(row, html, false)) {
      return false;
    }
    row.dataset.lastMsgid = u.msgId;
    return true;
  }

  function appendBeforeBodyClose(row, html, insideText) {
    if (!row || typeof row.innerHTML !== 'string') return false;
    const marker = insideText ? '</span></div><span class="msg__arrow"' : '</div><span class="msg__arrow"';
    const index = row.innerHTML.lastIndexOf(marker);
    if (index === -1) return false;
    row.innerHTML = row.innerHTML.slice(0, index) + html + row.innerHTML.slice(index);
    return true;
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
    if (u.shared) row.classList.add('msg--shared');
    row.dataset.msgid = u.msgId;
    row.dataset.userid = u.userId;
    if (u.login) row.dataset.userlogin = u.login;
    row.id = 'msg-' + total;

    const animIn = str(F.animationIn, 'liquidIn');
    if (str(F.disableAllAnimations, 'no') !== 'yes' && animIn !== 'none') {
      row.classList.add('animate__animated', 'animate__' + animIn);
      // When the entrance animation ends: release the GPU layer AND strip the
      // entrance classes. The keyframe ends at opacity:1 with fill-mode:both, so
      // leaving it on would permanently override the inline opacity that
      // dynamic-opacity (age fade) writes. Guard against a row that is already
      // exiting (animateOut swaps in the out-animation classes).
      let entranceCleaned = false;
      const cleanupEntrance = function () {
        if (entranceCleaned) return;
        entranceCleaned = true;
        row.style.willChange = 'auto';
        if (row.classList.contains('animate__' + animIn)) {
          row.classList.remove('animate__animated', 'animate__' + animIn);
        }
        row.removeEventListener('animationend', cleanupEntrance);
      };
      row.addEventListener('animationend', cleanupEntrance, { once: true });
      setTimeout(cleanupEntrance, num(F.animationSpeed, 460) + 120);
    }

    const icon = iconMarkup(u);
    const head = u.kind === 'alert' ? '' : headMarkup(u);
    const body = u.kind === 'alert' ? alertBody(u) : ('<span class="msg__text' +
      (u.isAction ? ' is-action' : '') + '">' + renderText(u.text, u.emotes) + '</span>');

    row.innerHTML =
      '<div class="msg__bubble">' +
        icon +
        '<div class="msg__body">' + head + body + '</div>' +
        '<span class="msg__arrow" aria-hidden="true"></span>' +
      '</div>';

    listEl.appendChild(row);
    enforceLimit();
    refreshDynamicOpacity();
    // Fullscreen float: drop the row at a non-overlapping absolute position.
    if (isFullscreenFloat()) placeFloating(row);
    // In horizontal mode keep the newest message scrolled into view.
    if (str(F.layoutMode, 'vertical') === 'horizontal') {
      const toRight = str(F.hDirection, 'right') === 'right';
      listEl.scrollLeft = toRight ? listEl.scrollWidth : 0;
    }
    scheduleRemoval(row, u);
  }

  function headMarkup(u) {
    const badges = u.badges.map(b => {
      if (b.url) {
        return '<img class="badge" alt="' + htmlEncode(b.type || 'badge') + '" src="' + encodeURI(b.url) + '">';
      }
      if (b.text) {
        return '<span class="badge badge--text" title="' + htmlEncode(b.type || 'badge') + '">' +
          htmlEncode(b.text) + '</span>';
      }
      return '';
    }).join('');
    const logo = '<img class="msg__platform-logo" alt="' + u.platform +
      '" src="' + platformLogo(u.platform) + '">';
    const nameStyle = nameColorStyle(u);
    const shared = (u.shared && yes(F.sharedChatIndicator))
      ? '<span class="msg__shared" title="shared chat">⤵</span>' +
        (u.sharedSourceLabel
          ? '<span class="msg__shared-label" style="color:' + stableColor(u.sharedSourceLabel) +
            '">' + htmlEncode(u.sharedSourceLabel) + '</span>'
          : '')
      : '';
    return '<span class="msg__head">' + shared + logo +
      '<span class="msg__badges">' + badges + '</span>' +
      '<span class="msg__name' + nameClass(u) + '"' + nameStyle + '>' + htmlEncode(u.displayName) + '</span>' +
      pronounTag(u) +
      '<span class="msg__colon">:</span></span>';
  }

  function alertBody(u) {
    const sub = u.alert.message
      ? '<div class="alert__sub">' + renderText(u.alert.message, {}) + '</div>' : '';
    return '<span class="alert__label">' + htmlEncode(u.alert.label) + '</span>' + sub;
  }

  // Per-role icon overrides. Each field value can be a Unicode glyph,
  // 'platform', or 'avatar'; empty falls back to the global iconStyle.
  const ROLE_ICON_FIELD = {
    broadcaster: 'iconBroadcaster', leadmod: 'iconLeadMod', moderator: 'iconMod',
    vip: 'iconVip', subscriber: 'iconSub', artist: 'iconArtist',
    fav: 'iconFav', regular: 'iconRegular'
  };
  function primaryRole(u) {
    for (const r of ROLE_PRIORITY) {
      if (u.roles.indexOf(r) !== -1) return r;
    }
    return 'regular';
  }
  function iconStyleForMessage(u) {
    const field = ROLE_ICON_FIELD[primaryRole(u)];
    const roleIcon = field ? str(F[field], '') : '';
    return roleIcon || str(F.iconStyle, 'avatar');
  }

  function iconMarkup(u) {
    if (u.kind === 'alert') {
      const glyph = { follow: '♥', sub: '★', resub: '★', gift: '✦', communitygift: '✦', tip: '$', cheer: '◆', raid: '⚑', host: '⌂', superchat: '$', member: '★', reward: '◈' }[u.alert.type] || '★';
      return '<div class="msg__icon"><span class="alert__glyph">' + glyph + '</span></div>';
    }
    const style = iconStyleForMessage(u);
    let inner;
    if (style === 'platform') {
      inner = '<img class="msg__avatar" alt="" src="' + platformLogo(u.platform) + '">';
    } else if (style !== 'avatar') {
      // A chosen glyph icon (emoji) — shown for every message.
      inner = '<span class="msg__glyphicon">' + htmlEncode(style) + '</span>';
    } else {
      inner = '<img class="msg__avatar" alt="" src="' +
        encodeURI(u.avatar || platformLogo(u.platform)) + '">';
    }
    return '<div class="msg__icon">' + inner + '<span class="msg__dot"></span></div>';
  }

  function sharedLabelForRoom(roomId) {
    const id = String(roomId || '').trim();
    if (!id) return '';
    const pairs = String(F.sharedChatLabels || '').split(',');
    for (const pair of pairs) {
      const idx = pair.indexOf(':');
      if (idx === -1) continue;
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (key === id && value) return value;
    }
    return '';
  }

  // ---- Shared Chat participants panel ----------------------------
  // A live roster of the channels in a Twitch Stream Together session.
  // Honest by construction: it only lists rooms we actually detect from
  // `source-room-id` (+ the host room), named via the sharedChatLabels map
  // (host auto-named from the onWidgetLoad channel). No avatars — guest
  // channel images aren't reliably available — auto-colored name chips instead.
  function recordSharedParticipants(u) {
    if (!u || !u.shared) return;
    let changed = false;
    if (u.roomId && !sharedRooms.has(u.roomId)) {
      const hostLabel = sharedLabelForRoom(u.roomId) || channelName || ('#' + u.roomId);
      sharedRooms.set(u.roomId, { roomId: u.roomId, label: hostLabel, host: true });
      changed = true;
    }
    const g = u.sharedSourceRoomId;
    if (g && !sharedRooms.has(g)) {
      sharedRooms.set(g, { roomId: g, label: u.sharedSourceLabel || ('#' + g), host: false });
      changed = true;
    }
    if (changed) renderParticipants();
  }

  // Host first, then guests in arrival order.
  function sharedRosterEntries() {
    const all = Array.from(sharedRooms.values());
    return all.filter(e => e.host).concat(all.filter(e => !e.host));
  }

  function ensureParticipantsEl() {
    if (participantsEl || !rootEl) return participantsEl;
    participantsEl = document.createElement('div');
    participantsEl.className = 'se-chat__participants';
    rootEl.appendChild(participantsEl);
    return participantsEl;
  }

  function renderParticipants() {
    if (!rootEl) return;
    const entries = sharedRosterEntries();
    if (!yes(F.sharedChatPanel) || entries.length === 0) {
      if (participantsEl) {
        participantsEl.innerHTML = '';
        participantsEl.classList.remove('is-visible');
      }
      return;
    }
    ensureParticipantsEl();
    participantsEl.dataset.pos = str(F.sharedChatPanelPos, 'top-right');
    participantsEl.classList.add('is-visible');
    const items = entries.map(function (e) {
      return '<li class="se-chat__participant' + (e.host ? ' is-host' : '') + '">' +
        '<span class="se-chat__participant-dot" style="background:' + stableColor(e.label) + '"></span>' +
        '<span class="se-chat__participant-name">' + htmlEncode(e.label) + '</span>' +
        (e.host ? '<span class="se-chat__participant-host">host</span>' : '') +
        '</li>';
    }).join('');
    participantsEl.innerHTML =
      '<div class="se-chat__participants-head">Shared chat · ' + entries.length + '</div>' +
      '<ul class="se-chat__participants-list">' + items + '</ul>';
  }

  // Map the highest-priority role to its CSS color variable.
  const ROLE_VAR = {
    broadcaster: '--role-broadcaster', leadmod: '--role-leadmod', moderator: '--role-mod',
    artist: '--role-artist', vip: '--role-vip', subscriber: '--role-sub',
    fav: '--role-fav', regular: '--role-regular'
  };
  function roleColorVar(u) {
    for (const r of ROLE_PRIORITY) {
      if (u.roles.indexOf(r) === -1) continue;
      // "regular" keeps the platform/user color unless a custom color is set.
      if (r === 'regular' && !str(F.colorRegular, '')) return null;
      if (ROLE_VAR[r]) return ROLE_VAR[r];
    }
    return null;
  }

  function nameColorStyle(u) {
    const mode = str(F.nickColor, 'user');
    if (mode === 'remove') return '';
    // Role color wins when role highlighting is on (so it isn't masked by the
    // inline platform/user color). This is the visible cue for roles.
    if (yes(F.roleHighlight)) {
      const rv = roleColorVar(u);
      if (rv) return ' style="color:var(' + rv + ')"';
    }
    if (mode === 'custom') return ' style="color:var(--custom-nick-color)"';
    if (mode === 'message') return '';
    const placement = str(F.nativeColorPlacement, 'text');
    if (placement === 'off') return '';
    // user / platform color, with a stable per-user fallback color
    const c = safeCssColor(u.color) || stableColor(u.displayName);
    if (placement === 'background') return ' style="background-color:' + c + '"';
    return ' style="color:' + c + '"';
  }

  function nameClass(u) {
    if (str(F.nickColor, 'user') !== 'user') return '';
    if (yes(F.roleHighlight) && roleColorVar(u)) return '';
    return str(F.nativeColorPlacement, 'text') === 'background' ? ' msg__name--chip' : '';
  }

  function renderText(text, emoteMap) {
    var nativeEmotes = emoteMap || {};
    var keywords = keywordList();
    var tokens = String(text).split(/(\s+)/); // keep whitespace tokens
    return tokens.map(function (tok) {
      if (/^\s+$/.test(tok) || tok === '') return tok;
      // Native emotes take priority, then custom (7TV/BTTV/FFZ)
      var emoteUrl = nativeEmotes[tok] || null;
      var isZW = false;
      if (!emoteUrl && customEmotes.has(tok)) {
        var entry = customEmotes.get(tok);
        if (typeof entry === 'string') { emoteUrl = entry; }
        else { emoteUrl = entry.url; isZW = !!entry.zw; }
      }
      if (emoteUrl) {
        var cls = 'emote' + (isZW ? ' emote--zerowidth' : '');
        return '<img class="' + cls + '" alt="' + htmlEncode(tok) + '" src="' + encodeURI(emoteUrl) + '">';
      }
      var enc = htmlEncode(tok);
      if (keywords.length) {
        // Strip surrounding punctuation so "gg!" / "(win)" still match "gg" / "win".
        var bare = tok.replace(/^[^0-9A-Za-z_]+|[^0-9A-Za-z_]+$/g, '').toLowerCase();
        if (bare && keywords.indexOf(bare) !== -1) return '<span class="kw">' + enc + '</span>';
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

  function refreshDynamicOpacity() {
    if (!listEl) return;
    const rows = Array.prototype.slice.call(listEl.children);
    if (!yes(F.dynamicOpacity) || rows.length <= 1) {
      rows.forEach(row => { row.style.opacity = ''; });
      return;
    }
    const min = Math.max(0.1, Math.min(1, num(F.oldestMessageOpacity, 38) / 100));
    const maxIndex = rows.length - 1;
    rows.forEach(function (row, index) {
      const t = maxIndex === 0 ? 1 : index / maxIndex;
      const opacity = min + ((1 - min) * t);
      row.style.opacity = String(Math.round(opacity * 100) / 100);
    });
  }

  // ---- Fullscreen float / collision avoidance ---------------------
  // Two axis-aligned rects overlap if they overlap on BOTH axes (with padding).
  function rectsOverlap(a, b, pad) {
    return !(a.x + a.w + pad <= b.x || b.x + b.w + pad <= a.x ||
             a.y + a.h + pad <= b.y || b.y + b.h + pad <= a.y);
  }
  // Find a spot for a rw×rh box inside cw×ch that clears every occupied rect.
  // Sampling-based: returns the first collision-free spot, else the least-bad
  // one. rng is injectable so the placement is deterministic in tests.
  function pickFloatPosition(cw, ch, rw, rh, occupied, opts) {
    opts = opts || {};
    const pad = opts.pad != null ? opts.pad : 8;
    const tries = opts.tries || 40;
    const rng = opts.rng || Math.random;
    const maxX = Math.max(0, cw - rw), maxY = Math.max(0, ch - rh);
    let best = null, bestHits = Infinity;
    for (let i = 0; i < tries; i++) {
      const x = Math.round(rng() * maxX), y = Math.round(rng() * maxY);
      const cand = { x: x, y: y, w: rw, h: rh };
      let hits = 0;
      for (let j = 0; j < occupied.length; j++) {
        if (rectsOverlap(cand, occupied[j], pad)) hits++;
      }
      if (hits === 0) return { x: x, y: y, fit: true };
      if (hits < bestHits) { bestHits = hits; best = { x: x, y: y, fit: false }; }
    }
    return best || { x: 0, y: 0, fit: false };
  }

  function isFullscreenFloat() {
    return str(F.layoutMode, 'vertical') === 'fullscreen' && yes(F.fullscreenFloat);
  }

  // Measure the freshly added row + its siblings and drop it at a
  // non-overlapping absolute position within the fullscreen stage.
  function placeFloating(row) {
    if (!listEl || !row) return;
    const cw = listEl.clientWidth || 0, ch = listEl.clientHeight || 0;
    const rw = row.offsetWidth || 0, rh = row.offsetHeight || 0;
    if (!cw || !ch || !rw || !rh) return;     // not laid out yet → skip gracefully
    const occupied = [];
    Array.prototype.forEach.call(listEl.children, function (el) {
      if (el === row) return;
      occupied.push({
        x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0,
        w: el.offsetWidth || 0, h: el.offsetHeight || 0
      });
    });
    const pos = pickFloatPosition(cw, ch, rw, rh, occupied, { pad: 10 });
    row.style.position = 'absolute';
    row.style.left = pos.x + 'px';
    row.style.top = pos.y + 'px';
  }

  function scheduleRemoval(row, u) {
    // hideAfter is the master "auto-hide" control. 0 = keep forever (only the
    // messagesLimit removes rows). Same behaviour in every layout.
    let ttl = num(F.hideAfter, 0);
    if (ttl <= 0) return;                                       // never auto-hide
    // For alerts, ensure they stay at least alertMinDuration (a floor, not a cap).
    if (u.kind === 'alert') ttl = Math.max(num(F.alertMinDuration, 8), ttl);
    setTimeout(() => animateOut(row), ttl * 1000);
  }

  function animateOut(row) {
    if (!row || !row.parentNode) return;
    const out = str(F.animationOut, 'liquidOut');
    row.style.opacity = '';
    if (str(F.disableAllAnimations, 'no') === 'yes' || out === 'none') {
      row.remove();
      refreshDynamicOpacity();
      return;
    }
    const animIn = str(F.animationIn, 'liquidIn');
    row.classList.remove('animate__' + animIn);
    row.classList.add('animate__animated', 'animate__' + out);
    setTimeout(() => {
      row.remove();
      refreshDynamicOpacity();
    }, num(F.animationSpeed, 460) + 60);
  }

  function removeByMsgId(id) {
    const el = listEl && listEl.querySelector('[data-msgid="' + cssEsc(id) + '"]');
    if (el) {
      el.remove();
      refreshDynamicOpacity();
    }
  }
  function removeByUser(uid) {
    if (!listEl) return;
    listEl.querySelectorAll('[data-userid="' + cssEsc(uid) + '"]').forEach(e => e.remove());
    refreshDynamicOpacity();
  }

  // ================================================================
  //  Theme application (CSS vars + classes + data-attrs)
  // ================================================================
  function applyTheme(f) {
    // Write tokens as inline style on the .se-chat root (not :root) so they beat
    // the [data-preset] stylesheet defaults — inline > stylesheet on the same
    // element — which is what lets EVERY override win on EVERY preset (surface
    // included), and keeps the pre-JS :root paint as the no-JS fallback.
    const r = (rootEl || document.documentElement).style;
    const set = (k, v) => r.setProperty(k, v);
    const clear = k => r.removeProperty(k);
    const hasOverride = v => v != null && String(v).trim() !== '' && String(v).trim() !== 'auto';
    // setIf: write override tokens when present; clear stale inline tokens when
    // the user returns a field to empty / preset-driven.
    // This is the heart of "preset gives great defaults, you override only what you touch".
    const setIf = (k, v) => { hasOverride(v) ? set(k, v) : clear(k); };

    // ---- Per-preset identity (color + font): user field -> preset -> default ----
    const preset = str(f.stylePreset, 'editorial');
    const pt = PRESET_THEME[preset] || PRESET_THEME.editorial;
    const userFont = (f.fontName && String(f.fontName).trim()) || '';
    const bodyFont = userFont || pt.font || 'Hanken Grotesk';
    const nameFont = pt.nameFont || bodyFont;

    // ---- Typography (always applied) ----
    injectFont(bodyFont);                          // ensure the chosen webfont is loaded (idempotent)
    if (nameFont !== bodyFont) injectFont(nameFont);
    set('--font-name', "'" + bodyFont + "'");
    set('--name-font', "'" + nameFont + "'");
    set('--font-size', num(f.fontSize, 22) + 'px');
    set('--font-weight', str(f.fontWeight, '500'));
    set('--font-color', f.fontColor || pt.ink || 'rgba(255,255,255,0.96)');
    setIf('--text-shadow', f.textShadow);
    set('--emote-size', num(f.emoteSize, 28) + 'px');
    set('--badge-size', Math.round(num(f.fontSize, 22) * 0.92) + 'px');

    // ---- Layout footprint (always applied) ----
    set('--row-gap', num(f.rowGap, 9) + 'px');
    set('--row-maxwidth', num(f.rowMaxWidth, 460) + 'px');
    set('--row-width', num(f.rowWidth, 100) + '%');

    // ---- Accent: user override -> preset accent -> default. Overlay simple-first. ----
    set('--accent', (f.accent && String(f.accent).trim()) || pt.accent || '#e8c99a');
    set('--overlay-bg', f.overlayBackground || 'rgba(0,0,0,0)');

    // ---- Surface overrides (only when the gate is on) ----
    if (yes(f.glassOverride)) {
      setIf('--surface', f.glassTint);
      hasOverride(f.glassBlur) ? set('--surface-blur', num(f.glassBlur, 22) + 'px') : clear('--surface-blur');
      hasOverride(f.glassSaturate) ? set('--surface-saturate', String(num(f.glassSaturate, 112) / 100)) : clear('--surface-saturate');
      hasOverride(f.glassRadius) ? set('--surface-radius', num(f.glassRadius, 16) + 'px') : clear('--surface-radius');
      hasOverride(f.glassShadow) ? set('--shadow', '0 2px 10px -6px rgba(0,0,0,' + (num(f.glassShadow, 30) / 100) + ')') : clear('--shadow');
      hasOverride(f.glassHighlight) ? set('--sheen', 'inset 0 1px 0 rgba(255,255,255,' + (num(f.glassHighlight, 10) / 100) + ')') : clear('--sheen');
      num(f.glassEdge, 0) > 0 ? set('--edge', 'inset ' + num(f.glassEdge, 0) + 'px 0 0 var(--accent)') : clear('--edge');
    } else {
      ['--surface', '--surface-blur', '--surface-saturate', '--surface-radius', '--shadow', '--sheen', '--edge'].forEach(clear);
    }

    // ---- Username / highlight / dots / roles ----
    // Fallbacks mirror the widget.json field defaults, so clearing a color
    // field returns it to the documented default (not a stale legacy tone).
    set('--custom-nick-color', f.customNickColor || pt.nick || '#abc2f2');
    setIf('--keyword-color', f.keywordColor);   // empty → follows --accent

    set('--dot-twitch', f.dotTwitch || pt.dotTwitch || '#a98be8');
    set('--dot-youtube', f.dotYouTube || pt.dotYouTube || '#ef7479');
    set('--dot-kick', f.dotKick || pt.dotKick || '#6fdd54');

    // Roles: user field -> preset palette (e.g. Daylight's darker ink set) -> default.
    const rt = pt.roles || {};
    const role = (k, field, dflt) => f[field] || rt[k] || dflt;
    const rBroadcaster = role('broadcaster', 'colorBroadcaster', '#f2969d');
    const rMod = role('mod', 'colorMod', '#90d9a4');
    const rVip = role('vip', 'colorVip', '#efa8d6');
    const rSub = role('sub', 'colorSub', '#a7bef2');
    const rLeadmod = role('leadmod', 'colorLeadMod', '#84d2c2');
    const rArtist = role('artist', 'colorArtist', '#f4b083');
    const rFav = role('fav', 'colorFav', '#f1d396');
    set('--role-broadcaster', rBroadcaster);
    set('--role-mod', rMod);
    set('--role-vip', rVip);
    set('--role-sub', rSub);
    set('--role-leadmod', rLeadmod);
    set('--role-artist', rArtist);
    set('--role-fav', rFav);
    setIf('--role-regular', f.colorRegular);   // empty → regulars keep their own color

    // Role icon bubble tints (used by .role-highlight .msg--role-* .msg__icon).
    set('--role-bubble-broadcaster', rBroadcaster);
    set('--role-bubble-mod', rMod);
    set('--role-bubble-vip', rVip);
    set('--role-bubble-sub', rSub);
    set('--role-bubble-leadmod', rLeadmod);
    set('--role-bubble-artist', rArtist);
    set('--role-bubble-fav', rFav);
    // Per-role visual matrix tint strength (used by name/message backgrounds).
    set('--role-tint', Math.max(4, Math.min(60, num(f.roleTintStrength, 18))) + '%');

    set('--anim-duration', num(f.animationSpeed, 460) + 'ms');

    // Perspective tilt (X/Y/Z) + zoom / field of view
    const px = num(f.perspectiveX, 0), py = num(f.perspectiveY, 0), pz = num(f.perspectiveZ, 0);
    set('--persp-x', px + 'deg');
    set('--persp-y', py + 'deg');
    set('--persp-z', pz + 'deg');
    const zoom = Math.max(0.5, Math.min(1.6, num(f.perspectiveZoom, 100) / 100));
    const fov = Math.max(350, Math.min(1800, num(f.perspectiveFov, 1000)));
    set('--persp-zoom', String(zoom));
    set('--persp-fov', fov + 'px');

    if (!rootEl) return;
    rootEl.dataset.preset = str(f.stylePreset, 'editorial');
    rootEl.dataset.layout = str(f.layoutMode, 'vertical');
    rootEl.dataset.halign = str(f.hAlign, 'left');
    rootEl.dataset.valign = str(f.vAlign, 'bottom');
    rootEl.dataset.hdir = str(f.hDirection, 'right');
    rootEl.dataset.density = str(f.density, 'comfortable');
    rootEl.dataset.mask = str(f.maskFade, 'none');

    toggle('show-icon', yes(f.showAvatar));
    toggle('show-arrow', yes(f.showArrow));
    toggle('show-dot', yes(f.showPlatformDot));
    toggle('no-dot-twitch', f.dotTwitchOn != null && !yes(f.dotTwitchOn));
    toggle('no-dot-youtube', f.dotYouTubeOn != null && !yes(f.dotYouTubeOn));
    toggle('no-dot-kick', f.dotKickOn != null && !yes(f.dotKickOn));
    toggle('show-logo', yes(f.showPlatformLogo));
    toggle('no-badges', !yes(f.displayBadges));
    toggle('no-name', str(f.nickColor, 'user') === 'remove');
    toggle('role-highlight', yes(f.roleHighlight));
    toggle('role-namebg', yes(f.roleNameBg));
    toggle('role-msgbg', yes(f.roleMsgBg));
    toggle('role-msgtext', yes(f.roleMsgText));
    toggle('fx-perspective', px !== 0 || py !== 0 || pz !== 0);
    toggle('fx-float', str(f.layoutMode, 'vertical') === 'fullscreen' && yes(f.fullscreenFloat));
    toggle('fx-crayon', yes(f.crayonTexture));
    // Real SVG refraction — opt-in AND only where the renderer can composite
    // it (Chromium / OBS). Otherwise stay on safe glassmorphism (no class).
    toggle('fx-advanced-glass', yes(f.glassAdvanced) && advancedGlassSupported());
    toggle('no-anim', yes(f.disableAllAnimations));
    toggle('show-colon', yes(f.showColon));

    renderParticipants();   // reflect live panel toggle / position changes
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
  async function loadChannelEmotes(twitchId, force) {
    const id = String(twitchId || '').trim();
    if (!id) return;
    channelEmoteIds.add(id);
    if (!force && channelEmotesLoaded.has(id)) return;
    channelEmotesLoaded.add(id);
    const tasks = [];
    if (yes(F.enable7tv)) tasks.push(fetch7tvChannel(id));
    if (yes(F.enableBttv)) tasks.push(fetchBttvChannel(id));
    if (yes(F.enableFfz)) tasks.push(fetchFfzChannel(id));
    await Promise.allSettled(tasks);
  }

  async function fetch7tvGlobal() {
    const j = await getJSON('https://7tv.io/v3/emote-sets/global');
    (j.emotes || []).forEach(function (e) {
      var isZW = !!((e.data && e.data.flags || e.flags || 0) & (1 << 8));
      customEmotes.set(e.name, { url: sevenTvUrl(e.id), zw: isZW });
    });
  }
  async function fetch7tvChannel(id) {
    const j = await getJSON('https://7tv.io/v3/users/twitch/' + id);
    const emotes = j && j.emote_set && j.emote_set.emotes ? j.emote_set.emotes : [];
    emotes.forEach(function (e) {
      var isZW = !!((e.data && e.data.flags || e.flags || 0) & (1 << 8));
      customEmotes.set(e.name, { url: sevenTvUrl(e.id), zw: isZW });
    });
  }
  const sevenTvUrl = id => 'https://cdn.7tv.app/emote/' + id + '/2x.webp';

  async function fetchBttvGlobal() {
    const arr = await getJSON('https://api.betterttv.net/3/cached/emotes/global');
    (arr || []).forEach(function (e) { customEmotes.set(e.code, { url: bttvUrl(e.id), zw: false }); });
  }
  async function fetchBttvChannel(id) {
    const j = await getJSON('https://api.betterttv.net/3/cached/users/twitch/' + id);
    [].concat(j.channelEmotes || [], j.sharedEmotes || [])
      .forEach(function (e) { customEmotes.set(e.code, { url: bttvUrl(e.id), zw: false }); });
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
    Object.keys(sets).forEach(function (k) { (sets[k].emoticons || []).forEach(function (e) {
      var u = e.urls && (e.urls['2'] || e.urls['1']);
      if (u) {
        var url = u.startsWith('//') ? 'https:' + u : u;
        var isZW = !!(e.modifier || e.zeroWidth);
        customEmotes.set(e.name, { url: url, zw: isZW });
      }
    }); });
  }

  // ================================================================
  //  Kick relay (Railway) — WebSocket client with backoff
  // ================================================================
  function connectRelay() {
    const url = (F.relayUrl || '').trim();
    if (!url || !/^wss?:\/\//.test(url)) {
      if (relaySocket) { try { relaySocket.onclose = null; relaySocket.close(); } catch (_) {} relaySocket = null; }
      return;
    }
    if (relaySocket) {
      try { relaySocket.onclose = null; relaySocket.close(); } catch (_) {}
      relaySocket = null;
    }
    try {
      relaySocket = new WebSocket(url);
    } catch (e) { return scheduleReconnect(); }

    relaySocket.onopen = () => {
      relayRetry = 0;
      if (F.kickChannel) {
        const msg = { type: 'subscribe', platform: 'kick', channel: F.kickChannel };
        if (F.relayToken) msg.token = F.relayToken;
        safeSend(msg);
      }
    };
    relaySocket.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (!m) return;
      if (m.type === 'message') {
        const u = normalizeKick(m.payload || m);
        if (u) handleChat(u);
      } else if (m.type === 'alert') {
        const u = normalizeKickAlert(m.payload || m);
        if (u) { addMessage(u); playSound(u.alert.type); }
      } else if (m.type === 'subscribed') {
        if (debugMode()) console.log('[relay] Kick subscribed:', m.chatroomId);
      } else if (m.type === 'error') {
        // Surface relay problems instead of failing silently (e.g. Cloudflare
        // blocked the slug lookup → pass the numeric chatroom id instead).
        if (debugMode()) console.warn('[relay] error:', m.error, m.channel || '');
      }
    };
    relaySocket.onclose = scheduleReconnect;
    relaySocket.onerror = () => { try { relaySocket.close(); } catch (_) {} };
  }

  // Relay Kick alert payload → inline alert (reuses chat-alert rendering).
  function normalizeKickAlert(p) {
    if (!p || !p.type) return null;
    if (!alertEnabled(p.type)) return null;
    const name = p.name || 'Someone';
    const sender = p.sender || name;
    const amount = p.amount != null ? p.amount : '';
    const count = p.count != null ? p.count : '';
    const tmpl = {
      sub: F.alertLabelSub || '{name} subscribed',
      gift: F.alertLabelGift || '{sender} gifted a sub to {name}',
      communitygift: F.alertLabelCommunityGift || '{sender} gifted {count} subs',
      host: F.alertLabelHost || '{name} hosted with {amount} viewers'
    }[p.type] || '{name}';
    const label = String(tmpl)
      .replace(/{name}/g, name).replace(/{sender}/g, sender)
      .replace(/{amount}/g, amount).replace(/{count}/g, count);
    return {
      platform: 'kick', kind: 'alert', msgId: 'ka' + Date.now() + '-' + (++total),
      userId: name, displayName: name, color: '', avatar: '',
      badges: [], roles: [], emotes: {}, isAction: false,
      text: label, alert: { type: p.type, amount, label, message: '' }
    };
  }
  function scheduleReconnect() {
    relayRetry = Math.min(relayRetry + 1, 8);
    var base = Math.min(1000 * Math.pow(2, relayRetry), 30000);
    var jitter = Math.random() * base * 0.3;
    setTimeout(connectRelay, base + jitter);
  }
  function safeSend(o) { try { relaySocket.send(JSON.stringify(o)); } catch (_) {} }

  // ================================================================
  //  Sound
  // ================================================================
  function soundSlotFor(type) {
    return {
      message: 'message',
      follow: 'follow',
      sub: 'sub', resub: 'sub', gift: 'sub', communitygift: 'sub', member: 'sub',
      tip: 'tip', cheer: 'tip', superchat: 'tip', reward: 'tip', raid: 'tip', host: 'tip'
    }[type] || type;
  }

  function playSound(type) {
    if (!yes(F.soundEnabled)) return;
    const slot = soundSlotFor(type);
    const url = { message: F.soundMessage, follow: F.soundFollow, sub: F.soundSub, tip: F.soundTip }[slot];
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
    if (/artist/.test(list)) roles.push('artist');
    if (/vip/.test(list)) roles.push('vip');
    if (tags.subscriber === '1' || /subscriber|founder/.test(list)) roles.push('subscriber');
    return roles;
  }

  // User-defined roles (lead mod / fav list) + "regular" fallback, applied to
  // every message regardless of platform.
  function applyCustomRoles(u) {
    if (inCsv(F.leadModUsers, u.displayName) && u.roles.indexOf('leadmod') === -1) u.roles.unshift('leadmod');
    if (inCsv(F.favUsers, u.displayName) && u.roles.indexOf('fav') === -1) u.roles.push('fav');
    if (u.roles.length === 0) u.roles.push('regular');
  }
  function inCsv(csv, name) {
    return (csv || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
      .indexOf((name || '').toLowerCase()) !== -1;
  }

  function roleVisualsOn() {
    return yes(F.roleHighlight) || yes(F.roleNameBg) || yes(F.roleMsgBg) || yes(F.roleMsgText);
  }
  function roleClass(u) {
    // The msg--role-* hook is needed by role-highlight AND the per-role visual
    // matrix (name/message backgrounds, message text color), so emit it whenever
    // any of those is enabled.
    if (!roleVisualsOn()) return '';
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
    const map = {
      follow: F.alertFollow, sub: F.alertSub, resub: F.alertSub,
      gift: F.alertGift, communitygift: F.alertGift,
      tip: F.alertTip, cheer: F.alertCheer, raid: F.alertRaid, host: F.alertHost,
      superchat: F.alertSuperchat, member: F.alertMember, reward: F.alertReward
    };
    const v = map[type];
    return yes(v != null ? v : 'yes');
  }

  // ================================================================
  //  Pronouns (api.pronouns.alejo.io) — Twitch logins, cached
  // ================================================================
  function loadPronounMap() {
    if (!yes(F.enablePronouns) || pronounMap) return;
    getJSON('https://api.pronouns.alejo.io/v1/pronouns')
      .then(m => {
        pronounMap = {};
        Object.keys(m || {}).forEach(id => {
          const v = m[id];
          if (typeof v === 'string') { pronounMap[id] = v; return; }
          // Build a display like "He/Him" (or just "They" when singular).
          const subj = v && v.subject ? v.subject : id;
          pronounMap[id] = (v && v.singular) ? subj : (subj + '/' + (v.object || subj));
        });
      })
      .catch(() => { pronounMap = {}; });
  }
  function fetchPronoun(login) {
    if (!login || pronounCache[login] !== undefined) return;
    pronounCache[login] = '';   // mark in-flight so we fetch once
    getJSON('https://api.pronouns.alejo.io/v1/users/' + encodeURIComponent(login))
      .then(d => {
        const rec = Array.isArray(d) ? d[0] : d;
        const id = rec && rec.pronoun_id;
        const label = (id && pronounMap) ? (pronounMap[id] || '') : '';
        pronounCache[login] = label;
        if (label) {
          document.querySelectorAll('.msg[data-userlogin="' + cssEsc(login) + '"] .msg__pronoun')
            .forEach(el => { if (!el.textContent) el.textContent = label; });
        }
      })
      .catch(() => {});
  }
  function pronounTag(u) {
    if (!yes(F.enablePronouns) || u.platform !== 'twitch' || !u.login) return '';
    if (pronounCache[u.login] === undefined) fetchPronoun(u.login);
    return '<span class="msg__pronoun">' + htmlEncode(pronounCache[u.login] || '') + '</span>';
  }

  // Per-platform show/hide → pick one platform or combine any subset.
  function platformEnabled(p) {
    const map = { twitch: F.showTwitch, youtube: F.showYouTube, kick: F.showKick };
    const v = map[p];
    return v == null ? true : yes(v);
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
      twitch: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='5' fill='%23a98be8'/><path d='M6 4l-1 4v9h3v3h2l3-3h3l4-4V4z' fill='%23fff'/><rect x='14' y='8' width='1.6' height='4' fill='%23a98be8'/><rect x='10' y='8' width='1.6' height='4' fill='%23a98be8'/></svg>",
      youtube: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='6' fill='%23ef7479'/><path d='M10 8l6 4-6 4z' fill='%23fff'/></svg>",
      kick: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='5' fill='%236fdd54'/><path d='M7 5h4v4h2V7h2V5h3v5h-2v2h2v5h-3v-2h-2v-2h-2v4H7z' fill='%23111'/></svg>"
    }[p] || "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='6' fill='%23888'/></svg>";
    return 'data:image/svg+xml;utf8,' + svg;
  }

  // Load a Google font by name. Uses the modern css2 API with an *optional*
  // weight axis (..400..900) so fonts that don't have every weight still load
  // (the legacy css?family= API 404s on missing weights). Idempotent per family.
  function injectFont(name) {
    const fam = String(name || '').trim();
    if (!fam) return;
    const id = 'se-font-' + fam.replace(/\s+/g, '-');
    if (document.getElementById(id)) return;
    const param = fam.replace(/\s+/g, '+');
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + param + ':wght@300;400;500;600;700;800;900&display=swap';
    // If the family lacks some weights, css2 returns 400; fall back to a
    // weightless request which always resolves for any valid family.
    l.onerror = function () {
      if (l.dataset.fallback) return;
      l.dataset.fallback = '1';
      l.href = 'https://fonts.googleapis.com/css2?family=' + param + '&display=swap';
    };
    document.head.appendChild(l);
  }

  // Liquid Glass refraction: a procedural (size-independent) noise displacement
  // of the backdrop. feTurbulence avoids per-element bezel maps, so it stays
  // cheap across many small bubbles. The specular sheen is done in CSS.
  function injectLiquidGlassFilter() {
    if (document.getElementById('se-liquid-glass-svg')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'se-liquid-glass-svg';
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML =
      "<filter id='liquid-glass' x='-15%' y='-15%' width='130%' height='130%' color-interpolation-filters='sRGB'>" +
        "<feTurbulence type='fractalNoise' baseFrequency='0.008 0.012' numOctaves='2' seed='7' result='noise'/>" +
        "<feGaussianBlur in='noise' stdDeviation='1.4' result='soft'/>" +
        "<feDisplacementMap in='SourceGraphic' in2='soft' scale='16' xChannelSelector='R' yChannelSelector='G'/>" +
      "</filter>";
    document.body.appendChild(svg);
  }

  // Hand-drawn "crayon" wobble (opt-in). Injected once, applied via .fx-crayon.
  function injectCrayonFilter() {
    if (document.getElementById('se-crayon-svg')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'se-crayon-svg';
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = "<filter id='crayon'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' result='n'/><feDisplacementMap in='SourceGraphic' in2='n' scale='1.4'/></filter>";
    document.body.appendChild(svg);
  }

  // Can this renderer composite an SVG filter inside backdrop-filter?
  // (Chromium/OBS yes; Firefox/Safari no → we fall back to glassmorphism.)
  function advancedGlassSupported() {
    try {
      const bf = (window.CSS && (CSS.supports('backdrop-filter', 'blur(2px)') ||
        CSS.supports('-webkit-backdrop-filter', 'blur(2px)')));
      const chromium = !!window.chrome || /\b(Chrome|Chromium|Edg)\//.test(navigator.userAgent || '');
      return !!bf && chromium;
    } catch (_) { return false; }
  }

  // Stable per-user fallback color (self-contained hash; no md5 dependency).
  function stableColor(name) {
    const palette = ['#ff8f8f', '#ffc27a', '#ffe28a', '#8ce8a6', '#7fd8e6', '#9db4ff', '#d7a0ff', '#ff9ed6'];
    let hash = 0;
    const s = name || 'x';
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  }
  function safeCssColor(value) {
    const s = String(value || '').trim();
    if (!s) return '';
    if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
    if (/^(rgba?|hsla?)\([\d\s.,%+-]+\)$/i.test(s)) return s;
    return '';
  }

  // utils
  function htmlEncode(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cssEsc(s) { return String(s == null ? '' : s).replace(/["\\\]]/g, '\\$&'); }
  function str(v, d) { return (v == null || v === '') ? d : String(v); }
  function num(v, d) { const n = parseFloat(v); return isNaN(n) ? d : n; }
  function yes(v) { return String(v) === 'yes' || v === true; }
  function toggle(cls, on) { if (rootEl) rootEl.classList.toggle(cls, !!on); }
  function debugMode() { return yes(F.debugMode); }
  function getJSON(url) {
    return fetch(url, { mode: 'cors' }).then(r => r.ok ? r.json() : Promise.reject(r.status));
  }
  function maybeRefreshEmotes() {
    var ttl = num(F.emoteCacheTTL, 0) * 60000;
    if (ttl <= 0 || (Date.now() - emoteLastLoad) < ttl) return;
    customEmotes.clear();
    channelEmotesLoaded.clear();
    loadCustomEmotes().catch(function() {});
    Array.from(channelEmoteIds).forEach(function (id) {
      loadChannelEmotes(id, true).catch(function() {});
    });
    emoteLastLoad = Date.now();
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

  // Expose a tiny hook so the preview harness can confirm load + drive the
  // relay code paths (Kick chat/alert) without opening a real WebSocket.
  // It ALSO exposes the pure normalize/helper functions so the Node test
  // suite can exercise them directly. None of this changes SE behaviour —
  // SE never reads window.__seChat.
  window.__seChat = {
    // Feed a relay frame exactly as connectRelay().onmessage would receive it.
    relayFrame: function (m) {
      if (!m) return;
      if (m.type === 'message') { const u = normalizeKick(m.payload || m); if (u) handleChat(u); }
      else if (m.type === 'alert') { const u = normalizeKickAlert(m.payload || m); if (u) { addMessage(u); playSound(u.alert.type); } }
    },
    // Let tests set the field config the same way onWidgetLoad would.
    setFields: function (fields) { F = applyQuickSetup(fields || {}); },
    getFields: function () { return F; },
    test: {
      setCustomEmote: function (name, entry) { customEmotes.set(name, entry); },
      clearCustomEmotes: function () { customEmotes.clear(); },
      setEmoteLastLoad: function (ts) { emoteLastLoad = num(ts, emoteLastLoad); }
    },
    // Pure functions (no DOM side-effects) — safe to unit test in isolation.
    fn: {
      normalizeTwitch: normalizeTwitch,
      normalizeYouTube: normalizeYouTube,
      normalizeKick: normalizeKick,
      normalizeAlert: normalizeAlert,
      normalizeKickAlert: normalizeKickAlert,
      rolesFromTwitch: rolesFromTwitch,
      applyCustomRoles: applyCustomRoles,
      roleClass: roleClass,
      roleColorVar: roleColorVar,
      renderText: renderText,
      keywordList: keywordList,
      alertEnabled: alertEnabled,
      soundSlotFor: soundSlotFor,
      isIgnored: isIgnored,
      platformEnabled: platformEnabled,
      nativeEmoteMap: nativeEmoteMap,
      stableColor: stableColor,
      safeCssColor: safeCssColor,
      htmlEncode: htmlEncode,
      applyQuickSetup: applyQuickSetup,
      buttonFieldFromEvent: buttonFieldFromEvent,
      pickFloatPosition: pickFloatPosition,
      rectsOverlap: rectsOverlap
    }
  };
})();
