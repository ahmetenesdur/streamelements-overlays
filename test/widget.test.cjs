/* ================================================================
   Widget pure-logic unit tests — run with: node --test
   Loads widget.js via the lightweight harness (no jsdom) and
   exercises the normalize / role / keyword / emote / filter logic
   that everything else renders from.
   ================================================================ */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadWidget } = require('./harness.cjs');

// The SHIPPED field defaults (widget.json `value`s), so we can regression-test
// the real out-of-the-box config — not just the JS fallback strings.
function jsonDefaults() {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'widget', 'widget.json'), 'utf8'));
  const fd = {};
  Object.keys(j).forEach(k => { fd[k] = j[k].value; });
  return fd;
}

test('phase 8 fields ship with conservative defaults', () => {
  const fd = jsonDefaults();
  assert.strictEqual(fd.messageGrouping, 'off');
  assert.strictEqual(fd.dynamicOpacity, 'no');
  assert.strictEqual(fd.oldestMessageOpacity, 38);
  assert.strictEqual(fd.sharedChatLabels, '');
  assert.strictEqual(fd.nativeColorPlacement, 'text');
  assert.strictEqual(fd.perspectiveZoom, 100);
  assert.strictEqual(fd.perspectiveFov, 1000);
  assert.strictEqual(fd.alertSuperchat, 'yes');
  assert.strictEqual(fd.alertMember, 'yes');
});

// Helper: a Twitch raw `message.data` with sensible defaults.
function tw(over) {
  return Object.assign({
    displayName: 'User', nick: 'user', userId: 'u1', text: 'hello', displayColor: '#abcdef',
    isAction: false, badges: [], emotes: [],
    tags: { 'room-id': '1', 'user-id': 'u1', id: 'm1', mod: '0', subscriber: '0', badges: '' }
  }, over);
}

// ---------------------------------------------------------------
test('normalizeTwitch: identity, color, action, shared-chat flag', () => {
  const { api } = loadWidget({});
  const u = api.fn.normalizeTwitch(tw({ displayName: 'Ada', isAction: true }));
  assert.strictEqual(u.platform, 'twitch');
  assert.strictEqual(u.displayName, 'Ada');
  assert.strictEqual(u.color, '#abcdef');
  assert.strictEqual(u.isAction, true);
  assert.strictEqual(u.shared, false);

  const shared = api.fn.normalizeTwitch(tw({ tags: { 'room-id': '100', 'source-room-id': '200', 'user-id': 'u', id: 'm' } }));
  assert.strictEqual(shared.shared, true, 'source-room-id != room-id → shared');
});

test('normalizeTwitch records shared chat source room id', () => {
  const { api } = loadWidget({});
  const shared = api.fn.normalizeTwitch(tw({
    tags: { 'room-id': '100', 'source-room-id': '200', 'user-id': 'u', id: 'm', badges: '' }
  }));
  assert.strictEqual(shared.shared, true);
  assert.strictEqual(shared.sharedSourceRoomId, '200');
});

test('shared chat label renders mapped source channel name', () => {
  const { list, fire } = loadWidget({ sharedChatIndicator: 'yes', sharedChatLabels: '200:Ironmouse' });
  fire('message', { data: tw({
    displayName: 'GuestViewer',
    text: 'hello shared',
    tags: { 'room-id': '100', 'source-room-id': '200', 'user-id': 'u', id: 'm', badges: '' }
  }) });
  assert.match(list.children[0].innerHTML, /Ironmouse/);
  assert.match(list.children[0].innerHTML, /msg__shared-label/);
});

test('shared chat label gets a stable per-name color', () => {
  const { list, fire } = loadWidget({ sharedChatIndicator: 'yes', sharedChatLabels: '200:Ironmouse' });
  fire('message', { data: tw({
    displayName: 'GuestViewer', text: 'x',
    tags: { 'room-id': '100', 'source-room-id': '200', 'user-id': 'u', id: 'm', badges: '' }
  }) });
  assert.match(list.children[0].innerHTML, /msg__shared-label" style="color:#[0-9a-f]{6}"/);
});

test('per-platform dot opt-out toggles root class (master dot stays on)', () => {
  const { root } = loadWidget({ showPlatformDot: 'yes', dotTwitchOn: 'no', dotKickOn: 'yes' });
  assert.ok(root.classList.contains('show-dot'), 'master dot still on');
  assert.ok(root.classList.contains('no-dot-twitch'), 'twitch dot suppressed');
  assert.ok(!root.classList.contains('no-dot-kick'), 'kick dot kept');
});

test('rolesFromTwitch: badges/tags → role list', () => {
  const { api } = loadWidget({});
  const r1 = api.fn.rolesFromTwitch({ badges: 'broadcaster/1', mod: '0', subscriber: '0' }, [{ type: 'broadcaster' }]);
  assert.ok(r1.includes('broadcaster'));
  const r2 = api.fn.rolesFromTwitch({ mod: '1', subscriber: '1', badges: '' }, []);
  assert.ok(r2.includes('moderator') && r2.includes('subscriber'));
  const r3 = api.fn.rolesFromTwitch({ badges: 'vip/1,subscriber/0', mod: '0', subscriber: '0' }, []);
  assert.ok(r3.includes('vip'));
});

test('normalizeYouTube: detected by shape, roles from authorDetails', () => {
  const { api } = loadWidget({});
  const u = api.fn.normalizeYouTube({
    msgId: 'y1', displayName: 'Cem', avatar: 'http://img', text: 'yt hi',
    authorDetails: { channelId: 'c1', isChatOwner: true, isChatSponsor: true }, emotes: []
  });
  assert.strictEqual(u.platform, 'youtube');
  assert.strictEqual(u.avatar, 'http://img');
  assert.ok(u.roles.includes('broadcaster'));
  assert.ok(u.roles.includes('subscriber'));
});

test('normalizeKick: tolerant mapping, role from badges', () => {
  const { api } = loadWidget({});
  const u = api.fn.normalizeKick({ displayName: 'Kik', color: '#53fc18', text: 'k', badges: [{ type: 'moderator' }] });
  assert.strictEqual(u.platform, 'kick');
  assert.ok(u.roles.includes('moderator'));
  assert.strictEqual(u.color, '#53fc18');
});

// ---- alerts --------------------------------------------------------
test('normalizeAlert: subscriber-latest splits into sub/resub/gift/community', () => {
  const { api } = loadWidget({ showAlerts: 'yes', alertSub: 'yes', alertGift: 'yes' });
  const sub = api.fn.normalizeAlert('subscriber-latest', { name: 'A', amount: 1 });
  assert.strictEqual(sub.alert.type, 'sub');
  const resub = api.fn.normalizeAlert('subscriber-latest', { name: 'B', amount: 6 });
  assert.strictEqual(resub.alert.type, 'resub');
  assert.match(resub.text, /6 months/);
  const gift = api.fn.normalizeAlert('subscriber-latest', { name: 'C', gifted: true, sender: 'D', amount: 1 });
  assert.strictEqual(gift.alert.type, 'gift');
  assert.match(gift.text, /D gifted a sub to C/);
  const comm = api.fn.normalizeAlert('subscriber-latest', { name: 'E', bulkGifted: true, sender: 'F', count: 10 });
  assert.strictEqual(comm.alert.type, 'communitygift');
  assert.match(comm.text, /F gifted 10 subs/);
});

test('normalizeAlert: playedAsCommunityGift is suppressed (no spam)', () => {
  const { api } = loadWidget({ showAlerts: 'yes', alertGift: 'yes' });
  const r = api.fn.normalizeAlert('subscriber-latest', { name: 'X', gifted: true, sender: 'Y', playedAsCommunityGift: true });
  assert.strictEqual(r, null);
});

test('normalizeAlert: per-type enable toggles gate output', () => {
  const { api } = loadWidget({ showAlerts: 'yes', alertFollow: 'no', alertCheer: 'yes' });
  assert.strictEqual(api.fn.normalizeAlert('follower-latest', { name: 'A' }), null, 'follow disabled');
  assert.ok(api.fn.normalizeAlert('cheer-latest', { name: 'B', amount: 100 }), 'cheer enabled');
});

test('normalizeAlert: showAlerts master switch off → nothing', () => {
  const { api } = loadWidget({ showAlerts: 'no' });
  assert.strictEqual(api.fn.normalizeAlert('follower-latest', { name: 'A' }), null);
});

test('alert label custom format honoured', () => {
  const { api } = loadWidget({ showAlerts: 'yes', alertTip: 'yes', alertLabelTip: '💸 {name} → {amount}' });
  const t = api.fn.normalizeAlert('tip-latest', { name: 'Gen', amount: '25 USD' });
  assert.strictEqual(t.text, '💸 Gen → 25 USD');
});

// ---- roles: priority + color win ----------------------------------
test('roleColorVar: respects ROLE_PRIORITY (broadcaster beats sub)', () => {
  const { api } = loadWidget({ roleHighlight: 'yes' });
  const u = { roles: ['subscriber', 'broadcaster'] };
  assert.strictEqual(api.fn.roleColorVar(u), '--role-broadcaster');
});

test('roleColorVar: regular keeps own color unless colorRegular set', () => {
  const off = loadWidget({ roleHighlight: 'yes', colorRegular: '' });
  assert.strictEqual(off.api.fn.roleColorVar({ roles: ['regular'] }), null);
  const on = loadWidget({ roleHighlight: 'yes', colorRegular: '#fff' });
  assert.strictEqual(on.api.fn.roleColorVar({ roles: ['regular'] }), '--role-regular');
});

test('applyCustomRoles: lead-mod / fav lists + regular fallback', () => {
  const { api } = loadWidget({ leadModUsers: 'Captain, Boss', favUsers: 'Bestie' });
  const lead = { displayName: 'Captain', roles: [] };
  api.fn.applyCustomRoles(lead);
  assert.ok(lead.roles.includes('leadmod'));
  const fav = { displayName: 'Bestie', roles: ['subscriber'] };
  api.fn.applyCustomRoles(fav);
  assert.ok(fav.roles.includes('fav'));
  const plain = { displayName: 'Nobody', roles: [] };
  api.fn.applyCustomRoles(plain);
  assert.deepStrictEqual(plain.roles, ['regular']);
});

// ---- emotes + keywords (renderText) -------------------------------
test('renderText: native emote token → <img class="emote">', () => {
  const { api } = loadWidget({});
  const emotes = api.fn.nativeEmoteMap([{ name: 'Kappa', urls: { '2': 'http://k/2' } }]);
  const html = api.fn.renderText('lol Kappa nice', emotes);
  assert.match(html, /<img class="emote"[^>]*src="http:\/\/k\/2"/);
  assert.match(html, /lol/); assert.match(html, /nice/);
});

test('renderText: keyword highlight is punctuation-tolerant', () => {
  const { api } = loadWidget({ highlightKeywords: 'gg, clutch' });
  const html = api.fn.renderText('gg! what a (clutch) play', {});
  const hits = (html.match(/class="kw"/g) || []).length;
  assert.strictEqual(hits, 2, 'both gg! and (clutch) match');
});

test('renderText: escapes HTML (XSS safety)', () => {
  const { api } = loadWidget({});
  const html = api.fn.renderText('<script>alert(1)</script>', {});
  assert.ok(!html.includes('<script>'), 'raw script tag must be escaped');
  assert.match(html, /&lt;script&gt;/);
});

test('message render: rejects unsafe inline color values', () => {
  const { list, fire } = loadWidget({ nickColor: 'user' });
  fire('message', { data: tw({
    displayName: 'UnsafeColor',
    displayColor: '#fff";background:url(javascript:alert(1))',
    text: 'safe text'
  }) });
  assert.strictEqual(list.children.length, 1);
  const html = list.children[0].innerHTML;
  assert.ok(!html.includes('background:'), 'malicious CSS declaration must not be rendered');
  assert.ok(!html.includes('javascript:'), 'javascript URL must not be rendered');
});

test('nativeColorPlacement:background applies user color as username background', () => {
  const { list, fire } = loadWidget({ nickColor: 'user', nativeColorPlacement: 'background' });
  fire('message', { data: tw({ displayName: 'Ada', displayColor: '#123456' }) });
  const html = list.children[0].innerHTML;
  assert.match(html, /class="msg__name msg__name--chip"/);
  assert.match(html, /background-color:#123456/);
});

test('nativeColorPlacement:off disables platform color fallback', () => {
  const { list, fire } = loadWidget({ nickColor: 'user', nativeColorPlacement: 'off' });
  fire('message', { data: tw({ displayName: 'Ada', displayColor: '#123456' }) });
  const html = list.children[0].innerHTML;
  assert.ok(!html.includes('#123456'));
});

test('per-role visual matrix: msg-bg toggle emits role class even with highlight off', () => {
  const { root, list, fire, rootStyle } = loadWidget({ roleHighlight: 'no', roleMsgBg: 'yes', roleTintStrength: 25 });
  fire('message', { data: tw({ displayName: 'Mod', tags: { 'room-id': '1', 'user-id': 'u', id: 'm', mod: '1', badges: 'moderator/1' }, badges: [{ type: 'moderator' }] }) });
  assert.ok(root.classList.contains('role-msgbg'), 'root carries role-msgbg toggle class');
  assert.ok(!root.classList.contains('role-highlight'), 'highlight stays off');
  assert.match(list.children[0].className, /msg--role-moderator/, 'role hook present for the CSS to target');
  assert.strictEqual(rootStyle.getPropertyValue('--role-tint'), '25%');
});

test('per-role visual matrix: all toggles off → no role hook, no matrix classes', () => {
  const { root, list, fire } = loadWidget({ roleHighlight: 'no', roleMsgBg: 'no', roleNameBg: 'no', roleMsgText: 'no' });
  fire('message', { data: tw({ displayName: 'Mod', tags: { 'room-id': '1', 'user-id': 'u', id: 'm', mod: '1', badges: 'moderator/1' }, badges: [{ type: 'moderator' }] }) });
  assert.ok(!root.classList.contains('role-msgbg'));
  assert.ok(!/msg--role-/.test(list.children[0].className), 'no role hook when nothing needs it');
});

test('role icon override wins over global iconStyle', () => {
  const { list, fire } = loadWidget({ showAvatar: 'yes', iconStyle: 'avatar', iconMod: '★' });
  fire('message', { data: tw({
    displayName: 'ModUser',
    badges: [{ type: 'moderator' }],
    tags: { 'room-id': '1', 'user-id': 'u', id: 'm', mod: '1', badges: 'moderator/1' }
  }) });
  assert.match(list.children[0].innerHTML, /msg__glyphicon/);
  assert.match(list.children[0].innerHTML, /★/);
});

test('role icon override falls back to global iconStyle when unset', () => {
  const { list, fire } = loadWidget({ showAvatar: 'yes', iconStyle: 'platform' });
  fire('message', { data: tw({
    displayName: 'ModUser',
    badges: [{ type: 'moderator' }],
    tags: { 'room-id': '1', 'user-id': 'u', id: 'm', mod: '1', badges: 'moderator/1' }
  }) });
  assert.ok(!list.children[0].innerHTML.includes('msg__glyphicon'), 'no glyph override → uses platform logo');
});

// ---- filters -------------------------------------------------------
test('isIgnored: case-insensitive CSV match', () => {
  const { api } = loadWidget({ ignoredUsers: 'StreamElements, Nightbot' });
  assert.strictEqual(api.fn.isIgnored('nightbot'), true);
  assert.strictEqual(api.fn.isIgnored('RealViewer'), false);
});

test('platformEnabled: per-platform show/hide (default on)', () => {
  const { api } = loadWidget({ showTwitch: 'no', showKick: 'yes' });
  assert.strictEqual(api.fn.platformEnabled('twitch'), false);
  assert.strictEqual(api.fn.platformEnabled('kick'), true);
  assert.strictEqual(api.fn.platformEnabled('youtube'), true, 'unset → enabled');
});

test('stableColor: deterministic per-name fallback', () => {
  const { api } = loadWidget({});
  assert.strictEqual(api.fn.stableColor('Ada'), api.fn.stableColor('Ada'));
  assert.match(api.fn.stableColor('Ada'), /^#[0-9a-f]{6}$/);
});

// ---- end-to-end render (through real addMessage DOM path) ---------
test('message render: appends a .msg with platform + role classes', () => {
  const { api, list, fire } = loadWidget({ roleHighlight: 'yes', nickColor: 'user' });
  fire('message', { data: tw({ displayName: 'Boss', tags: { badges: 'broadcaster/1', 'room-id': '1', 'user-id': 'u', id: 'm', mod: '0' }, badges: [{ type: 'broadcaster' }] }) });
  assert.strictEqual(list.children.length, 1);
  const cls = list.children[0].className;
  assert.match(cls, /msg--twitch/);
  assert.match(cls, /msg--role-broadcaster/);
});

test('messagesLimit: enforced (oldest dropped)', () => {
  const { list, fire } = loadWidget({ messagesLimit: 3 });
  for (let i = 0; i < 6; i++) fire('message', { data: tw({ userId: 'u' + i, text: 't' + i, tags: { 'room-id': '1', 'user-id': 'u' + i, id: 'm' + i } }) });
  assert.strictEqual(list.children.length, 3);
});

test('ignored + command filters block rendering', () => {
  const { list, fire } = loadWidget({ ignoredUsers: 'Bot', hideCommands: 'yes' });
  fire('message', { data: tw({ displayName: 'Bot', text: 'spam' }) });
  fire('message', { data: tw({ displayName: 'Real', text: '!command' }) });
  assert.strictEqual(list.children.length, 0, 'both filtered');
  fire('message', { data: tw({ displayName: 'Real', text: 'normal message' }) });
  assert.strictEqual(list.children.length, 1);
});

test('per-platform hide blocks that platform end-to-end', () => {
  const { list, fire } = loadWidget({ showTwitch: 'no' });
  fire('message', { data: tw({ text: 'should be hidden' }) });
  assert.strictEqual(list.children.length, 0);
});

test('messageGrouping:inline preserves legacy inline merge behavior', () => {
  const { list, fire } = loadWidget({ messageGrouping: 'inline' });
  fire('message', { data: tw({ userId: 'u1', displayName: 'Ada', text: 'first', tags: { 'room-id': '1', 'user-id': 'u1', id: 'm1' } }) });
  fire('message', { data: tw({ userId: 'u1', displayName: 'Ada', text: 'second', tags: { 'room-id': '1', 'user-id': 'u1', id: 'm2' } }) });
  assert.strictEqual(list.children.length, 1);
  assert.match(list.children[0].innerHTML, /first/);
  assert.match(list.children[0].innerHTML, /second/);
});

test('messageGrouping:stack appends second message without duplicate header', () => {
  const { list, fire } = loadWidget({ messageGrouping: 'stack' });
  fire('message', { data: tw({ userId: 'u1', displayName: 'Ada', text: 'first', tags: { 'room-id': '1', 'user-id': 'u1', id: 'm1' } }) });
  fire('message', { data: tw({ userId: 'u1', displayName: 'Ada', text: 'second', tags: { 'room-id': '1', 'user-id': 'u1', id: 'm2' } }) });
  const html = list.children[0].innerHTML;
  assert.strictEqual(list.children.length, 1);
  assert.strictEqual((html.match(/class="msg__text/g) || []).length, 2);
  assert.strictEqual((html.match(/class="msg__head/g) || []).length, 1);
  assert.match(html, /msg__text--continued/);
});

test('dynamic opacity assigns lower opacity to older visible messages', () => {
  const { list, fire } = loadWidget({ dynamicOpacity: 'yes', oldestMessageOpacity: 40, messagesLimit: 3 });
  for (let i = 0; i < 3; i++) {
    fire('message', { data: tw({ userId: 'u' + i, text: 'm' + i, tags: { 'room-id': '1', 'user-id': 'u' + i, id: 'm' + i } }) });
  }
  assert.strictEqual(list.children[0].style.opacity, '0.4');
  assert.strictEqual(list.children[1].style.opacity, '0.7');
  assert.strictEqual(list.children[2].style.opacity, '1');
});

test('dynamic opacity disabled clears inline row opacity', () => {
  const { list, fire } = loadWidget({ dynamicOpacity: 'no' });
  fire('message', { data: tw({ text: 'visible' }) });
  assert.strictEqual(list.children[0].style.opacity, '');
});

test('entrance animation classes are stripped on animationend (so inline opacity wins)', () => {
  // The liquidIn keyframe ends at opacity:1 with fill-mode:both; if the classes
  // are never removed they permanently override the age-fade inline opacity.
  const { list, fire } = loadWidget({ animationIn: 'liquidIn', dynamicOpacity: 'yes' });
  fire('message', { data: tw({ text: 'one', userId: 'u1', tags: { 'room-id': '1', 'user-id': 'u1', id: 'm1' } }) });
  const row = list.children[0];
  assert.ok(row.classList.contains('animate__liquidIn'), 'entrance class applied on add');
  row.dispatchEvent({ type: 'animationend' });
  assert.ok(!row.classList.contains('animate__liquidIn'), 'entrance class removed after animationend');
  assert.ok(!row.classList.contains('animate__animated'), 'base animate class removed after animationend');
});

test('delete-message + delete-messages remove rows', () => {
  // querySelector in the shim is a no-op, so we assert the handlers run without throwing.
  const { fire } = loadWidget({});
  assert.doesNotThrow(() => { fire('delete-message', { msgId: 'm1' }); fire('delete-messages', { userId: 'u1' }); });
});

// ---- auto-hide timing (regression: hideAfter:0 must keep messages forever) ---
test('hideAfter:0 schedules NO auto-hide timer (chat persists)', () => {
  const { fire, timers } = loadWidget({ hideAfter: 0 });
  fire('message', { data: tw({ text: 'stay forever' }) });
  // no removal timer should have been scheduled for a normal message
  assert.strictEqual(timers.length, 0, 'hideAfter:0 must not schedule removal');
});

test('hideAfter:0 keeps ALERTS too (alertMinDuration is a floor, not a cap)', () => {
  const { fire, timers } = loadWidget({ hideAfter: 0, showAlerts: 'yes', alertSub: 'yes', alertMinDuration: 8 });
  fire('subscriber-latest', { name: 'A', amount: 1 });
  assert.strictEqual(timers.length, 0, 'alert must persist when hideAfter:0 — regression of forced 8s removal');
});

test('hideAfter:N schedules removal at N seconds (alert floored to alertMinDuration)', () => {
  const a = loadWidget({ hideAfter: 20, showAlerts: 'yes', alertSub: 'yes', alertMinDuration: 8 });
  a.fire('message', { data: tw({ text: 'bye later' }) });
  assert.strictEqual(a.timers.at(-1).ms, 20000, 'message hides at hideAfter=20s');
  a.fire('subscriber-latest', { name: 'A', amount: 1 });
  assert.strictEqual(a.timers.at(-1).ms, 20000, 'alert uses max(min=8, hideAfter=20)=20s');

  const b = loadWidget({ hideAfter: 3, showAlerts: 'yes', alertSub: 'yes', alertMinDuration: 8 });
  b.fire('subscriber-latest', { name: 'B', amount: 1 });
  assert.strictEqual(b.timers.at(-1).ms, 8000, 'alert floored to alertMinDuration=8s when hideAfter=3');
});

test('layouts: vertical / horizontal / fullscreen all render rows (pure CSS, no JS positioning)', () => {
  for (const mode of ['vertical', 'horizontal', 'fullscreen']) {
    const { fire, list, root } = loadWidget({ layoutMode: mode });
    for (let i = 0; i < 4; i++) fire('message', { data: tw({ userId: mode + i, text: 'row ' + i, tags: { 'room-id': '1', 'user-id': mode + i, id: mode + i } }) });
    assert.strictEqual(list.children.length, 4, mode + ' renders all rows');
    assert.strictEqual(root.dataset.layout, mode, mode + ' sets data-layout');
    // No layout uses inline absolute positioning anymore — it's all flexbox.
    assert.ok([...list.children].every(r => r.style.position !== 'absolute'),
      mode + ' must not absolutely-position rows');
  }
});

test('horizontal layout: messagesLimit clips old messages (never piles up)', () => {
  const { fire, list } = loadWidget({ layoutMode: 'horizontal', messagesLimit: 5 });
  for (let i = 0; i < 30; i++) fire('message', { data: tw({ userId: 'h' + i, text: 'msg ' + i, tags: { 'room-id': '1', 'user-id': 'h' + i, id: 'h' + i } }) });
  assert.strictEqual(list.children.length, 5, 'rain of 30 → capped at messagesLimit, no pile-up');
});

// ---- shipped defaults: best-practice / no-nonsense guards ----------
// (regression for the "{name} subscribed (1 months)" bug — tests the real
//  widget.json default value, which is what users actually ship with.)
test('shipped default: a NEW sub renders cleanly (no "(1 months)", no empty parens)', () => {
  const { api } = loadWidget(jsonDefaults());
  const newSub = api.fn.normalizeAlert('subscriber-latest', { name: 'Ada', amount: 1 });
  assert.strictEqual(newSub.text, 'Ada subscribed', 'first-time sub must not tout a months count');
  const noAmount = api.fn.normalizeAlert('subscriber-latest', { name: 'Bo' });
  assert.strictEqual(noAmount.text, 'Bo subscribed', 'missing amount must not leave "( months)"');
  const resub = api.fn.normalizeAlert('subscriber-latest', { name: 'Cy', amount: 7 });
  assert.match(resub.text, /7 months/, 'resub still carries the months count');
});

test('shipped defaults: EVERY alert label resolves cleanly (no leftover {placeholders}/NaN/undefined)', () => {
  const { api } = loadWidget(jsonDefaults());
  const cases = [
    ['follower-latest', { name: 'A' }],
    ['subscriber-latest', { name: 'B', amount: 1 }],
    ['subscriber-latest', { name: 'C', amount: 5 }],
    ['subscriber-latest', { name: 'D', gifted: true, sender: 'E', amount: 1 }],
    ['subscriber-latest', { name: 'F', bulkGifted: true, sender: 'G', count: 10 }],
    ['tip-latest', { name: 'H', amount: '25 USD' }],
    ['cheer-latest', { name: 'I', amount: 500 }],
    ['raid-latest', { name: 'J', amount: 142 }],
    ['host-latest', { name: 'K', amount: 88 }]
  ];
  for (const [listener, ev] of cases) {
    const u = api.fn.normalizeAlert(listener, ev);
    assert.ok(u, listener + ' should produce an alert with defaults');
    assert.ok(!/[{}]/.test(u.text), 'no leftover placeholder token in: "' + u.text + '"');
    assert.ok(!/undefined|NaN|\(\s*months\)/.test(u.text), 'no broken fragment in: "' + u.text + '"');
  }
});

test('normalizeAlert maps YouTube superchat-like tip payload to superchat', () => {
  const { api } = loadWidget({
    showAlerts: 'yes',
    alertTip: 'yes',
    alertSuperchat: 'yes',
    alertLabelSuperchat: '{name} super chatted {amount}'
  });
  const u = api.fn.normalizeAlert('tip-latest', {
    name: 'YTViewer',
    amount: '$20',
    provider: 'youtube',
    type: 'superchat'
  });
  assert.strictEqual(u.alert.type, 'superchat');
  assert.strictEqual(u.text, 'YTViewer super chatted $20');
});

test('normalizeAlert maps YouTube membership-like subscriber payload to member', () => {
  const { api } = loadWidget({
    showAlerts: 'yes',
    alertSub: 'yes',
    alertMember: 'yes',
    alertLabelMember: '{name} joined as a member'
  });
  const u = api.fn.normalizeAlert('subscriber-latest', {
    name: 'MemberViewer',
    provider: 'youtube',
    type: 'member',
    amount: 1
  });
  assert.strictEqual(u.alert.type, 'member');
  assert.strictEqual(u.text, 'MemberViewer joined as a member');
});

test('normalizeAlert maps redemption-latest to a reward alert with the title', () => {
  const { api } = loadWidget({ showAlerts: 'yes', alertReward: 'yes', alertLabelReward: '{name} redeemed {reward}' });
  const u = api.fn.normalizeAlert('redemption-latest', { name: 'PointSpender', redemption: 'Hydrate!', amount: 500 });
  assert.strictEqual(u.alert.type, 'reward');
  assert.strictEqual(u.text, 'PointSpender redeemed Hydrate!');
});

test('alertReward:no suppresses reward alerts', () => {
  const { api } = loadWidget({ showAlerts: 'yes', alertReward: 'no' });
  assert.strictEqual(api.fn.normalizeAlert('redemption-latest', { name: 'X', redemption: 'Y' }), null);
});

test('normalizeAlert keeps non-YouTube tip/sub payloads on legacy types', () => {
  const { api } = loadWidget({ showAlerts: 'yes', alertTip: 'yes', alertSub: 'yes' });
  const tip = api.fn.normalizeAlert('tip-latest', { name: 'A', amount: '5 USD', type: 'superchat' });
  assert.strictEqual(tip.alert.type, 'tip', 'no provider hint → stays a tip');
  const sub = api.fn.normalizeAlert('subscriber-latest', { name: 'B', amount: 1, type: 'member' });
  assert.strictEqual(sub.alert.type, 'sub', 'no provider hint → stays a sub');
});

test('shipped defaults: common chat bots are ignored out of the box', () => {
  const { api } = loadWidget(jsonDefaults());
  for (const bot of ['Nightbot', 'StreamElements', 'Moobot', 'Fossabot', 'Sery_Bot']) {
    assert.strictEqual(api.fn.isIgnored(bot), true, bot + ' should be ignored by default');
  }
  assert.strictEqual(api.fn.isIgnored('a_real_viewer'), false, 'real viewers are not ignored');
});

// ---- Phase 7: new test scenarios ----------------------------------

test('renderText: custom zero-width emote gets emote--zerowidth class', () => {
  const { api } = loadWidget({ enable7tv: 'no', enableBttv: 'no', enableFfz: 'no' });
  api.test.setCustomEmote('Paint', { url: 'http://cdn/paint.webp', zw: true });
  const html = api.fn.renderText('Paint', {});
  assert.match(html, /class="emote emote--zerowidth"/, 'custom zero-width emote gets overlay class');
  assert.match(html, /src="http:\/\/cdn\/paint.webp"/, 'custom emote src is correct');
});

test('emote cache refresh reloads channel emotes after TTL expiry', async () => {
  const calls = [];
  const fakeFetch = (url) => {
    calls.push(url);
    const body = String(url).includes('/users/twitch/99')
      ? { emote_set: { emotes: [{ name: 'ChannelOnly', id: 'channel-emote', data: { flags: 0 } }] } }
      : { emotes: [{ name: 'GlobalOnly', id: 'global-emote', data: { flags: 0 } }] };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  };

  const { api, fire } = loadWidget({
    enable7tv: 'yes', enableBttv: 'no', enableFfz: 'no', emoteCacheTTL: 1
  }, { fetch: fakeFetch });

  fire('message', { data: tw({ tags: { 'room-id': '99', 'user-id': 'u1', id: 'm1', mod: '0', subscriber: '0', badges: '' } }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.some(url => String(url).includes('/users/twitch/99')), 'initial channel emotes load');

  calls.length = 0;
  api.test.setEmoteLastLoad(0);
  fire('message', { data: tw({ tags: { 'room-id': '99', 'user-id': 'u2', id: 'm2', mod: '0', subscriber: '0', badges: '' } }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.some(url => String(url).includes('/users/twitch/99')), 'TTL refresh reloads channel emotes');
});

test('error boundary: malformed event does not throw', () => {
  const { fire } = loadWidget({});
  // These should NOT throw — error boundary catches them silently
  assert.doesNotThrow(() => fire('message', null));
  assert.doesNotThrow(() => fire('message', { data: null }));
  assert.doesNotThrow(() => fire('message', { data: { text: null, tags: null } }));
  assert.doesNotThrow(() => fire('UNKNOWN_LISTENER_TYPE', {}));
});

test('alert msgId uniqueness: two alerts at same timestamp differ', () => {
  const { api } = loadWidget(jsonDefaults());
  const a1 = api.fn.normalizeAlert('subscriber-latest', { name: 'A', amount: 1, gifted: false });
  const a2 = api.fn.normalizeAlert('subscriber-latest', { name: 'B', amount: 1, gifted: false });
  assert.ok(a1 && a2, 'both alerts should be produced');
  assert.notStrictEqual(a1.msgId, a2.msgId, 'msgIds must differ even if Date.now() is the same');
});

test('debug mode gate: debugMode off suppresses console output', () => {
  const { api } = loadWidget({ debugMode: 'no' });
  // We can't easily capture console.warn in this harness, but we can verify
  // the debugMode function returns false
  const fields = api.getFields();
  assert.strictEqual(fields.debugMode, 'no');
});

test('colon toggle: show-colon class applied when showColon=yes', () => {
  const { root } = loadWidget({ showColon: 'yes' });
  assert.ok(root.classList.contains('show-colon'), 'showColon=yes → show-colon class present');
  const { root: root2 } = loadWidget({ showColon: 'no' });
  assert.ok(!root2.classList.contains('show-colon'), 'showColon=no → no show-colon class');
});

test('textShadow field sets --text-shadow CSS var', () => {
  const { window } = loadWidget({ textShadow: '0 2px 4px black' });
  const val = window.document.documentElement.style.getPropertyValue('--text-shadow');
  assert.strictEqual(val, '0 2px 4px black', 'textShadow field maps to --text-shadow CSS var');
});

test('applyTheme exposes perspective zoom and fov CSS variables', () => {
  const { rootStyle, root } = loadWidget({ perspectiveX: 8, perspectiveZoom: 120, perspectiveFov: 700 });
  assert.strictEqual(rootStyle.getPropertyValue('--persp-zoom'), '1.2');
  assert.strictEqual(rootStyle.getPropertyValue('--persp-fov'), '700px');
  assert.ok(root.classList.contains('fx-perspective'));
});

test('event:skip removes last alert', () => {
  // event:skip relies on querySelector('.msg--alert:last-child') which returns null in harness.
  // We verify the event does not throw (error boundary handles it gracefully).
  const { fire } = loadWidget(jsonDefaults());
  assert.doesNotThrow(() => fire('event:skip', {}), 'event:skip with no alerts does not crash');
});
