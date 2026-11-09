const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replaceAll('\r\n', '\n');
const storage = new Map();
const context = vm.createContext({ localStorage: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value)
} });
const codec = read('avatar-toy.js').split('// ---------- 材質')[0].replace(/^import .*;$/gm, '').replace(/export /g, '');
vm.runInContext(codec + read('appearance.js').replace(/^import .*;$/gm, '').replace(/export /g, ''), context);
const run = source => vm.runInContext(source, context);
assert.equal(run('needsCreator()'), true);
const code = run('saveLook({...DEFAULT_LOOK, hair: 3, num: 87})');
assert.match(code, /^t2[0-9a-z]{9}\d{2}$/);
assert.equal(storage.get('vb.settings.look'), code);
assert.equal(run('needsCreator()'), false);
assert.equal(run('decodeLook(readLook()).num'), 87);
assert.equal(run('decodeLook(readLook()).hair'), 3);
assert.equal(run("normalizeLook('old-character')"), run('encodeLook(DEFAULT_LOOK)'));
assert.equal(run("normalizeLook('t2zzzzzzzzz99')"), run('encodeLook({...DEFAULT_LOOK,num:99})'));
assert.equal(run("aiLook('ai12')"), run("aiLook('ai12')"));
assert.notEqual(run("aiLook('ai12')"), run("aiLook('ai11')"));
for (const team of [-1, 0, 1, undefined]) {
  context.team = team;
  assert.equal(run('teamKit(team)'), team === 1 ? 'blue' : 'orange');
}
console.log('PASS storage, first-entry decision, legacy fallback, deterministic AI and team kits');

async function introFlow(saved, hash = '') {
  const elements = new Map(), events = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, inert: true, open: false,
      classList: { add() {}, remove() {} }, listeners: {},
      addEventListener(event, fn) { this.listeners[event] = fn; },
      focus() {}, close() { this.open = false; }, showModal() { this.open = true; },
      getContext() { return null; } });
    return elements.get(id);
  };
  let finishCreator, opened = 0;
  const c = vm.createContext({
    window: {}, document: { getElementById: element, body: element('body') },
    matchMedia: () => ({ matches: true, addEventListener() {} }), location: { hash, search: '', pathname: '/' }, history: { replaceState() {} },
    addEventListener() {}, dispatchEvent: event => events.push(event.type), Event,
    Image: class {}, setTimeout, clearTimeout, cancelAnimationFrame() {},
    requestAnimationFrame() { return 1; },
    load: async file => file === './account-flow.js' ? { accountGate: async () => 'guest' } : file === './appearance.js' ? { needsCreator: () => !saved } : {
      editAppearance: () => { opened++; return new Promise(resolve => { finishCreator = resolve; }); }
    }
  });
  vm.runInContext(read('intro.js').replace(/import\(/g, 'load('), c);
  if (!hash) element('start').listeners.click();
  for (let i = 0; i < 5; i++) await new Promise(setImmediate);
  assert.equal(opened, saved ? 0 : 1);
  if (!saved) {
    assert.equal(c.window.VBIntro.entered, false);
    element('start').listeners.click();
    assert.equal(opened, 1);
    finishCreator(true); await new Promise(setImmediate);
  }
  assert.equal(c.window.VBIntro.entered, true);
  assert.equal(element('lobby-shell').inert, false);
  assert.deepEqual(events, ['vb-lobby-enter']);
}

(async () => {
  await introFlow(false); await introFlow(true);
  await introFlow(false, '#lobby'); await introFlow(true, '#lobby');
  console.log('PASS actual intro flow, repeated clicks and hash entry');
  for (const file of ['appearance.js', 'character-panel.js', 'intro.js', 'lobby.js', 'avatar-toy.js', 'creator.js']) {
    const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: read(file), encoding: 'utf8' });
    assert.equal(result.status, 0, file + result.stderr);
  }
  const gym = read('gym.html');
  assert(gym.includes('makeToyAvatar(decodeLook(ch), teamKit(team))'));
  assert(gym.includes('const dch = normalizeLook(d.ch);'));
  assert(gym.includes("ch: myChar() || 'none'"));
  assert(gym.includes('refreshPeerAppearance(p2);'));
  assert(!gym.includes('openCreator('));
  assert(read('index.html').includes('id="character-info"'));
  assert(read('index.html').includes('"three/addons/":'));
  console.log('PASS module syntax and normal game/lobby integration entry points');
})().catch(error => { console.error(error); process.exitCode = 1; });
