/* ================================================================
   Lightweight DOM/window shim to load widget.js in plain Node — no
   jsdom, no dependencies. Just enough of the browser surface for the
   widget's pure code paths (normalize/render/theme) to run.

   loadWidget(fields) returns { api, root, list, fire } where:
     api  = window.__seChat (setFields/getFields/fn/relayFrame)
     root = the .se-chat element (with classList/dataset)
     list = the #chatList element (children = rendered .msg nodes)
     fire = (listener, event) => dispatch an onEventReceived
   ================================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WIDGET_JS = path.join(__dirname, '..', 'widget', 'widget.js');

// --- minimal element ------------------------------------------------
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    parentNode: null,
    style: { _p: {}, setProperty(k, v) { this._p[k] = v; }, getPropertyValue(k) { return this._p[k] || ''; } },
    dataset: {},
    _attrs: {},
    _cls: new Set(),
    _html: '',
    id: '',
    // classList
    classList: {
      add(...c) { c.forEach(x => el._cls.add(x)); },
      remove(...c) { c.forEach(x => el._cls.delete(x)); },
      toggle(c, on) { if (on === undefined) on = !el._cls.has(c); on ? el._cls.add(c) : el._cls.delete(c); return on; },
      contains(c) { return el._cls.has(c); }
    },
    get className() { return [...el._cls].join(' '); },
    set className(v) { el._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
    setAttribute(k, v) { el._attrs[k] = String(v); if (k === 'id') el.id = String(v); },
    getAttribute(k) { return el._attrs[k] != null ? el._attrs[k] : null; },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentNode = null; return c; },
    remove() { if (el.parentNode) el.parentNode.removeChild(el); },
    get firstElementChild() { return el.children[0] || null; },
    get lastElementChild() { return el.children[el.children.length - 1] || null; },
    // innerHTML: we only need to detect substrings in tests, so store raw.
    set innerHTML(v) { el._html = String(v); },
    get innerHTML() { return el._html; },
    // very small querySelector: supports '.cls' within innerHTML-free node trees
    querySelector() { return null; },
    querySelectorAll() { return []; },
    insertBefore(c, ref) { const i = el.children.indexOf(ref); if (i < 0) el.children.push(c); else el.children.splice(i, 0, c); c.parentNode = el; return c; }
  };
  return el;
}

function loadWidget(fields) {
  const root = makeEl('div'); root.id = 'seChat';
  const list = makeEl('div'); list.id = 'chatList';
  root.appendChild(list);
  const head = makeEl('head');
  const bodyEl = makeEl('body');

  const byId = { seChat: root, chatList: list };
  const document = {
    getElementById: (id) => byId[id] || null,
    createElement: (t) => makeEl(t),
    createElementNS: (_ns, t) => makeEl(t),
    head, body: bodyEl,
    documentElement: makeEl('html'),
    querySelectorAll: () => [],
    addEventListener() {}
  };

  const listeners = {};
  // Record scheduled timers (delay in ms + whether it fired) so tests can assert
  // auto-hide timing without real waiting. fn is NOT auto-run.
  const timers = [];
  const window = {
    document,
    addEventListener: (type, cb) => { (listeners[type] = listeners[type] || []).push(cb); },
    dispatchEvent: (ev) => { (listeners[ev.type] || []).forEach(cb => cb(ev)); return true; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { if (typeof fn === 'function') fn(); return 1; },
    fetch: () => Promise.reject(new Error('no network in tests')),
    CSS: { supports: () => false },
    navigator: { userAgent: 'node-test' },
    location: { href: 'http://test/' },
    Audio: function () { return { play: () => Promise.resolve(), volume: 1 }; },
    WebSocket: function () { return { send() {}, close() {} }; },
    chrome: undefined,
    md5: undefined,
    console
  };
  window.window = window;

  const sandbox = {
    window, document, console,
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
    requestAnimationFrame: window.requestAnimationFrame,
    fetch: window.fetch, CSS: window.CSS, navigator: window.navigator,
    Audio: window.Audio, WebSocket: window.WebSocket,
    Promise, Date, Math, JSON, parseFloat, parseInt, isNaN, encodeURI, encodeURIComponent, String, Object, Array
  };
  vm.createContext(sandbox);
  const code = fs.readFileSync(WIDGET_JS, 'utf8');
  vm.runInContext(code, sandbox, { filename: 'widget.js' });

  // Boot the widget through its real onWidgetLoad path.
  window.dispatchEvent({ type: 'onWidgetLoad', detail: { fieldData: fields || {}, channel: {}, session: { data: {} } } });

  const api = window.__seChat;
  const fire = (listener, event) => window.dispatchEvent({ type: 'onEventReceived', detail: { listener, event } });
  return { api, root, list, fire, window, timers };
}

module.exports = { loadWidget, makeEl };
