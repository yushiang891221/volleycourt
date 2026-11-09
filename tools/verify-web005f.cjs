// 離線行為測試；實際 Three.js/WebGL 畫面仍需人工驗收。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const settings = fs.readFileSync(path.join(root, 'settings.js'), 'utf8');
const gym = fs.readFileSync(path.join(root, 'gym.html'), 'utf8');
function load(seed = {}, blocked = false) {
  const storage = new Map(Object.entries(seed)), events = [], classes = new Set();
  const c = vm.createContext({ window: {}, innerWidth: 1280, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem(k, v) { if (blocked) throw Error('blocked'); storage.set(k, v); } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent(e) { events.push(e); if (c.applyNameTags) c.applyNameTags(); },
    document: { body: { classList: { toggle(k, on) { if (on) classes.add(k); else classes.delete(k); } } } }
  });
  vm.runInContext(settings, c);
  c.VBSettings = c.window.VBSettings;
  vm.runInContext(gym.match(/function applyNameTags\(\) \{[\s\S]*?\n\}\napplyNameTags\(\);/)[0], c);
  return { api: c.VBSettings, storage, events, classes };
}
let t = load();
assert.equal(t.api.defaults().nameTags, true);
assert.equal(t.api.values.nameTags, true);
assert.equal(t.classes.has('hide-nametags'), false);
for (const value of [false, true, false]) {
  assert.equal(t.api.update({ nameTags: value }), true);
  assert.equal(t.api.values.nameTags, value);
  assert.equal(t.classes.has('hide-nametags'), !value);
  assert.equal(JSON.parse(t.storage.get('vb.settings')).nameTags, value);
  assert.equal(t.events.at(-1).type, 'vb-settings-change');
  assert.equal(t.events.at(-1).detail.nameTags, value);
}
const reloaded = load(Object.fromEntries(t.storage));
assert.equal(reloaded.api.values.nameTags, false);
assert.equal(reloaded.classes.has('hide-nametags'), true);
for (const seed of [
  { 'vb.settings': JSON.stringify({ showFps: true, fov: 90 }) },
  { 'vb.quality': 'low', 'vb.fov': '90', 'vb.sfx': '0' },
  { 'vb.settings': '{broken' }
]) assert.equal(load(seed).api.values.nameTags, true);
t = load({ 'vb.settings': JSON.stringify({ showFps: true, fov: 90 }) });
assert.equal(t.api.values.showFps, true); assert.equal(t.api.values.fov, 90);
t.api.update({ nameTags: false });
assert.equal(t.api.values.showFps, true); assert.equal(t.api.values.fov, 90);
for (const value of [null, 0, 'false']) assert.equal(load({ 'vb.settings': JSON.stringify({ nameTags: value }) }).api.values.nameTags, true);
t = load({}, true); assert.equal(t.api.update({ nameTags: false }), false);
assert.equal(t.classes.has('hide-nametags'), true);
assert(settings.includes("check('nameTags','顯示球員名牌')"));
assert(gym.includes("addEventListener('vb-settings-change', () => { applyPersonalSettings(); });"));
assert(/function applyPersonalSettings\(\) \{\s*applyNameTags\(\);/.test(gym));
assert(/\.hide-nametags \.mp-tag:not\(\.mp-shout\)\s*\{\s*visibility: hidden;\s*\}/.test(gym));
assert.equal((gym.match(/el.className = 'mp-tag';/g) || []).length, 5);
assert(/function vmShout\(t\) \{\s*const el = document.createElement\('div'\); el.className = 'mp-tag mp-shout';/.test(gym));
console.log('PASS nameTags defaults, persistence/reload, migration, validation, storage failure, immediate class toggle and shout exclusion');
