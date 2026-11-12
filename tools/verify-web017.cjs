const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
class Element {
  constructor() {
    this.children = []; this.value = ''; this.hidden = false; this.style = {};
    this.classes = new Set();
    this.classList = { add: k => this.classes.add(k), remove: k => this.classes.delete(k), contains: k => this.classes.has(k) };
  }
  set innerHTML(_) { throw Error('Chat must use textContent'); }
  setAttribute() {}
  addEventListener() {}
  append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  get firstElementChild() { return this.children[0]; }
  focus() { this.focused = true; }
  blur() { this.focused = false; }
  getBoundingClientRect() { return this.rect || { top: 0, bottom: 0, height: 0 }; }
}
let now = 0, online = true, held = 0, released = 0, gameKeys = 0;
const events = {}, timers = [], sent = [], bubbles = [], mount = new Element();
mount.rect = { top: 0, bottom: 900, height: 900 };
const hud = new Element(), keys = new Element();
hud.rect = { top: 104, bottom: 350, height: 246 };
keys.rect = { top: 850, bottom: 894, height: 44 };
const context = {
  window: {}, document: { createElement: () => new Element(), getElementById: id => ({ 'vm-hud': hud, 'wk-keys': keys })[id] }, performance: { now: () => now },
  setTimeout: (fn, ms) => timers.push({ fn, ms }),
  addEventListener: (name, fn, capture) => { assert.equal(capture, true); events[name] = fn; }
};
vm.runInNewContext(read('room-chat.js'), context);
const chat = context.window.RoomChat;
chat.configure({ online: () => online, available: () => true, mount: () => mount,
  identity: () => ({ id: 'me', n: '自己' }), publish: d => sent.push(d),
  hold: () => held++, release: () => released++, bubble: (...args) => bubbles.push(args), notice: () => {} });
function key(key, options = {}, type = 'keydown') {
  let stopped = false;
  events[type]({ key, code: key, preventDefault() {}, stopImmediatePropagation() { stopped = true; }, ...options });
  if (!stopped) gameKeys++;
}
key('Enter'); assert.equal(chat.isOpen, true); assert.equal(held, 1);
const panel = mount.children[0], log = panel.children[0], input = panel.children[1];
assert.equal(input.focused, true);
for (const height of [900, 720, 600]) {
  mount.rect.bottom = mount.rect.height = height;
  keys.rect.top = height - 50;
  chat.receive({ t: 'layout' }, 'peer');
  const bottom = parseFloat(panel.style.bottom), logHeight = parseFloat(log.style.maxHeight);
  assert.ok(height - bottom - logHeight - 44 >= hud.rect.bottom + 8);
  assert.ok(height - bottom <= keys.rect.top - 8);
}
while (log.children.length) log.firstElementChild.remove();
for (const k of ['w',' ','t','p','g','ArrowUp','Control','1','[']) key(k);
assert.equal(gameKeys, 0);
input.value = '中文'; key('Enter', { isComposing: true }); assert.equal(chat.isOpen, true); assert.equal(sent.length, 0);
key('Escape'); assert.equal(chat.isOpen, false); assert.equal(sent.length, 0);
key('Enter'); key('Enter'); assert.equal(chat.isOpen, false); assert.equal(sent.length, 0);
key('Enter'); input.value = ' \u0000' + '🏐'.repeat(65) + ' '; key('Enter');
assert.equal([...sent[0].t].length, 60); assert.equal(sent[0].t, '🏐'.repeat(60));
assert.equal(log.children[0].classes.has('self'), true);
key('Enter', { repeat: true }); assert.equal(chat.isOpen, false);
key('Enter'); input.value = 'too soon'; now = 999; key('Enter'); assert.equal(sent.length, 1);
key('Enter'); input.value = 'ok'; now = 1000; key('Enter'); assert.equal(sent.length, 2);
chat.receive({ id: 'me', n: '<img>', t: '<script>alert(1)</script>' }, 'peer');
assert.equal(log.children.at(-1).textContent, '<img>：<script>alert(1)</script>');
assert.equal(bubbles.at(-1)[0], 'peer');
chat.receive({ n: 'peer', t: '字'.repeat(80) }, 'peer');
assert.equal([...bubbles.at(-1)[1]].length, 60);
for (let i = 0; i < 8; i++) chat.receive({ t: String(i) }, 'peer');
assert.equal(log.children.length, 6);
assert.ok(timers.every(t => t.ms === 8000)); timers.forEach(t => t.fn());
assert.ok(log.children.every(el => el.classes.has('expired')));
key('Enter'); assert.ok(panel.classes.has('typing')); key('Escape');
assert.ok(released > 0);
online = false; key('Enter'); assert.equal(chat.isOpen, false);
chat.reset(); assert.equal(mount.children.length, 0);
function settings(raw) {
  const c = { window: {}, matchMedia: () => ({ matches: false }), innerWidth: 1600,
    localStorage: { getItem: k => k === 'vb.settings' ? JSON.stringify(raw) : null, setItem() {} },
    dispatchEvent() {}, CustomEvent: class {} };
  vm.runInNewContext(read('settings.js'), c); return c.window.VBSettings;
}
const defaults = settings(null).defaults().keys;
assert.equal(defaults.start, 'KeyG');
assert.equal(new Set(Object.values(defaults)).size, Object.keys(defaults).length);
for (const keys of [{ ...defaults, start: 'Enter' }, { ...defaults, start: 'Enter', w: 'KeyG' }, { start: 'Enter' }]) {
  const migrated = settings({ keys }).values.keys;
  assert.equal(migrated.start, 'KeyG'); assert.ok(!Object.values(migrated).includes('Enter'));
  assert.equal(new Set(Object.values(migrated)).size, Object.keys(migrated).length);
}
assert.equal(settings(null).bind('start', 'Enter'), false);
assert.equal(settings({ keys: { ...defaults, start: 'KeyZ' } }).values.keys.start, 'KeyZ');
assert.equal(settings({ keys: { ...defaults, start: 'KeyZ', w: 'Enter' } }).values.keys.start, 'KeyZ');
const gym = read('gym.html');
assert.ok(gym.indexOf('room-chat.js') < gym.indexOf('settings.js'));
assert.match(gym, /if \(t === 'chat'\) \{ RoomChat.receive\(d, from\)/);
assert.match(gym, /NET.tx.publish\('chat', data\)/);
assert.match(gym, /walk.keys.clear\(\); fly.keys.clear\(\); walk.target = null/);
assert.match(gym, /bubble.label.element.textContent = text/);
assert.match(gym, /chatBubbles.delete\(id\); \}, 4000\)/);
assert.doesNotMatch(read('room-chat.js'), /innerHTML|setInterval/);
assert.match(read('settings.js'), /聊天（房間中，固定按鍵）/);
console.log('WEB-017 PASS — keyboard, IME, sanitization, limits, rendering, migration and integration');
