/* Unit tests for the Kick relay's pure parsers, using real-shaped Kick
   Pusher frames. Run: node relay/test.cjs  (exit 0 = pass) */
'use strict';
const assert = require('assert');
const { parseKickContent, toUnifiedKick, toUnifiedKickAlert } = require('./src/index.js');

let n = 0;
const ok = (label) => { n++; console.log('  ✓ ' + label); };

// ---- emote parsing -------------------------------------------------
{
  const { text, emotes } = parseKickContent('hey [emote:37226:EZ] gg [emote:1730752:KEKW]');
  assert.strictEqual(text, 'hey EZ gg KEKW', 'emote names stay inline');
  assert.strictEqual(emotes.EZ, 'https://files.kick.com/emotes/37226/fullsize');
  assert.strictEqual(emotes.KEKW, 'https://files.kick.com/emotes/1730752/fullsize');
  ok('parseKickContent: [emote:id:name] → inline name + url map');
}
{
  const { text, emotes } = parseKickContent('plain text only');
  assert.strictEqual(text, 'plain text only');
  assert.deepStrictEqual(emotes, {});
  ok('parseKickContent: plain text → no emotes');
}

// ---- chat message --------------------------------------------------
{
  // Shape of App\Events\ChatMessageEvent data
  const data = {
    id: 'abc-123',
    content: 'hello world [emote:39000:catJAM]',
    sender: {
      id: 998877, username: 'KickPro', slug: 'kickpro',
      identity: { color: '#53fc18', badges: [{ type: 'moderator', text: 'Moderator' }, { type: 'subscriber', text: 'Subscriber', count: 6 }] }
    }
  };
  const u = toUnifiedKick(data);
  assert.strictEqual(u.msgId, 'abc-123');
  assert.strictEqual(u.userId, 998877);
  assert.strictEqual(u.displayName, 'KickPro');
  assert.strictEqual(u.color, '#53fc18');
  assert.strictEqual(u.text, 'hello world catJAM');
  assert.strictEqual(u.emotes.catJAM, 'https://files.kick.com/emotes/39000/fullsize');
  assert.strictEqual(u.badges.length, 2);
  assert.strictEqual(u.badges[0].type, 'moderator');
  assert.strictEqual(u.badges[0].text, 'Moderator');
  ok('toUnifiedKick: full chat message (color, emotes, badges with text)');
}
{
  // Minimal/anon message must not throw
  const u = toUnifiedKick({ id: 'x', content: 'hi', sender: {} });
  assert.strictEqual(u.displayName, 'anon');
  assert.deepStrictEqual(u.emotes, {});
  ok('toUnifiedKick: minimal message → safe defaults');
}

// ---- alerts (channel events) --------------------------------------
{
  const a = toUnifiedKickAlert('SubscriptionEvent', { username: 'Ayla', months: 3 });
  assert.strictEqual(a.type, 'sub'); assert.strictEqual(a.name, 'Ayla'); assert.strictEqual(a.amount, 3);
  ok('toUnifiedKickAlert: SubscriptionEvent → sub');
}
{
  const a = toUnifiedKickAlert('GiftedSubscriptionsEvent', { gifter_username: 'Boss', gifted_usernames: ['x', 'y', 'z'], gifted_amount: 3 });
  assert.strictEqual(a.type, 'communitygift'); assert.strictEqual(a.sender, 'Boss'); assert.strictEqual(a.count, 3);
  ok('toUnifiedKickAlert: GiftedSubscriptionsEvent (multi) → communitygift');
}
{
  const a = toUnifiedKickAlert('GiftedSubscriptionsEvent', { gifter_username: 'Boss', gifted_usernames: ['solo'], gifted_amount: 1 });
  assert.strictEqual(a.type, 'gift'); assert.strictEqual(a.name, 'solo');
  ok('toUnifiedKickAlert: GiftedSubscriptionsEvent (single) → gift');
}
{
  const a = toUnifiedKickAlert('StreamHostEvent', { host_username: 'Raider', number_viewers: 120 });
  assert.strictEqual(a.type, 'host'); assert.strictEqual(a.amount, 120);
  ok('toUnifiedKickAlert: StreamHostEvent → host');
}
{
  assert.strictEqual(toUnifiedKickAlert('SomeUnknownEvent', {}), null);
  assert.strictEqual(toUnifiedKickAlert('ChatMessageEvent', {}), null);
  ok('toUnifiedKickAlert: unknown event → null (ignored)');
}

console.log(`\n${n} assertions passed.`);
