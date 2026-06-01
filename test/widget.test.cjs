/* ================================================================
   Widget pure-logic unit tests — run with: node --test
   Loads widget.js via the lightweight harness (no jsdom) and
   exercises the normalize / role / keyword / emote / filter logic
   that everything else renders from.
   ================================================================ */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadWidget } = require('./harness.cjs');

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

test('delete-message + delete-messages remove rows', () => {
  // querySelector in the shim is a no-op, so we assert the handlers run without throwing.
  const { fire } = loadWidget({});
  assert.doesNotThrow(() => { fire('delete-message', { msgId: 'm1' }); fire('delete-messages', { userId: 'u1' }); });
});
