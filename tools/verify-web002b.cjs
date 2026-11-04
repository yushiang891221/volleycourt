// Node state tests, not a substitute for browser layout/WebGL/focus verification.
// Run: node --experimental-vm-modules tools/verify-web002b.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
let passed = 0;
async function check(name, test) { await test(); console.log('PASS ' + name); passed++; }

function setup({ hash = '', reduced = false, nickname = '', failure = '', delayed = false } = {}) {
  const timers = new Map(), frames = new Map(), events = new Map();
  let serial = 0, imports = 0, plays = 0, stops = 0, connections = 0, complete, fail, release;
  const pending = delayed ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  class Element {
    constructor() { this.parts = {}; this.children = []; this.listeners = {}; this.value = ''; this.dataset = {}; this.classList = {add(){},remove(){},toggle(){}}; }
    set innerHTML(value) { this.html = value; this.children = []; }
    get innerHTML() { return this.html || ''; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    fire(type) { return this.listeners[type]?.({preventDefault(){}}); }
    querySelector(s) { return this.parts[s] ||= new Element(); }
    querySelectorAll() { return []; }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    setAttribute() {}
    getContext() { return null; }
    focus() { context.document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const els = Object.fromEntries([...read('index.html').matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], new Element()]));
  els['lobby-shell'].inert = true; els.filter.value = 'all';
  const motion = {matches: reduced, addEventListener(type, fn) { this.change = fn; }};
  const context = vm.createContext({
    document: {getElementById: id => els[id], querySelectorAll: () => [], createElement: () => new Element(), body: new Element()},
    location: {hash, search: ''}, matchMedia: () => motion, Event, URLSearchParams,
    addEventListener(type, fn) { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); },
    dispatchEvent(e) { for (const fn of events.get(e.type) || []) fn(e); },
    setTimeout(fn, ms) { timers.set(++serial, {fn, ms}); return serial; }, clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { frames.set(++serial, fn); return serial; }, cancelAnimationFrame(id) { frames.delete(id); },
    VBSettings: {values: {nickname}, open(){}, nicknameError: () => '', update: () => true},
    VBLobby: {id: 'self', carry(){}, connect() { connections++; return {send: () => true, close(){}}; }}
  });
  context.window = context;
  const script = new vm.Script(read('intro.js'), {filename: 'intro.js', importModuleDynamically: async specifier => {
    assert.equal(specifier, './spike3d.js'); imports++;
    await pending;
    if (failure === 'import') throw new Error('Failed to load module');
    const module = new vm.SyntheticModule(['playSpike3D'], function() {
      this.setExport('playSpike3D', (canvas, phase, done, opts) => {
        if (failure === 'renderer') throw new Error('No WebGL');
        plays++; complete = done; fail = opts.onError; phase('扣球', 2, 4);
        return () => { stops++; };
      });
    }, {context});
    await module.link(() => {}); await module.evaluate(); return module;
  }});
  script.runInContext(context);
  vm.runInContext(read('lobby.js'), context);
  return {els, context, motion, frames, release: () => release?.(), complete: () => complete(), fail: () => fail(new Error('lost')),
    counts: () => ({imports, plays, stops, connections}),
    tick(ms) { for (const [id, t] of [...timers]) if (t.ms === ms) { timers.delete(id); t.fn(); } },
    entered() { assert(context.VBIntro.entered); assert(!els.intro.open); assert(!els['lobby-shell'].inert); }
  };
}

(async () => {
  await check('fresh entry connects in background; nickname waits until skip and fade complete', async () => {
    const h = setup(); assert(h.els.intro.open); assert(h.els['lobby-shell'].inert); assert(!h.els.nickname.open);
    assert.equal(h.counts().connections, 1); h.els.skip.fire('click'); assert(!h.context.VBIntro.entered);
    h.tick(420); h.entered(); assert(h.els.nickname.open); assert.equal(h.counts().imports, 0);
  });
  await check('start and ball both play; completion enters lobby once and restores focus', async () => {
    for (const id of ['start', 'ball-start']) {
      const h = setup({nickname: '球友'}); const first = h.els[id].fire('click'); h.els[id].fire('click'); await first;
      assert.equal(h.counts().plays, 1); assert.equal(h.els.phase.querySelector('span').textContent, '扣球');
      assert(h.els['lobby-shell'].inert); h.complete(); h.complete(); h.tick(420); h.entered();
      assert.equal(h.counts().stops, 1); assert(!h.els.nickname.open); assert.equal(h.context.document.activeElement, h.els.create);
    }
  });
  await check('Escape and playback skip stop animation and enter lobby', async () => {
    for (const action of ['cancel', 'skip-playing']) {
      const h = setup(); await h.els.start.fire('click');
      if (action === 'cancel') h.els.intro.fire('cancel'); else h.els[action].fire('click');
      h.tick(420); h.entered(); assert.equal(h.counts().stops, 1);
    }
  });
  await check('reduced motion avoids module load; preference change stops a running scene', async () => {
    const h = setup({reduced: true}); await h.els.start.fire('click'); h.entered(); assert.equal(h.counts().imports, 0);
    const p = setup(); await p.els.start.fire('click'); p.motion.matches = true; p.motion.change(); p.entered(); assert.equal(p.counts().stops, 1);
  });
  await check('module, renderer and runtime failures all unlock lobby', async () => {
    for (const failure of ['import', 'renderer', 'runtime']) {
      const h = setup({failure}); await h.els.start.fire('click'); if (failure === 'runtime') h.fail();
      h.tick(420); h.entered(); assert(h.els.nickname.open);
    }
  });
  await check('late imports after skip or load timeout never start playback', async () => {
    for (const action of ['skip', 'timeout']) {
      const h = setup({delayed: true}); const loading = h.els.start.fire('click'); await flush();
      if (action === 'skip') h.els.skip.fire('click'); else h.tick(10000);
      h.tick(420); h.entered(); h.release(); await loading; assert.equal(h.counts().plays, 0);
    }
    const h = setup(); await h.els.start.fire('click'); h.tick(20000); h.tick(420); h.entered(); assert.equal(h.counts().stops, 1);
  });
  await check('#lobby bypasses intro, preserves first-visit nickname; plain URL always shows intro', () => {
    for (const nickname of ['', '球友']) {
      const h = setup({hash: '#lobby', nickname}); h.entered(); assert.equal(!!h.els.nickname.open, !nickname);
      assert.equal(h.counts().imports, 0);
      const fresh = setup({nickname}); assert(fresh.els.intro.open); assert(!fresh.els.nickname.open);
    }
  });
  await check('navigation markup, visible intro copy and modal guard are present', () => {
    const html = read('index.html'), gym = read('gym.html');
    assert(html.includes('<dialog id="intro"')); assert(html.includes('id="lobby-shell" inert'));
    assert(!/企劃|新竹排球館|廠房|地圖|HSINCHU/.test(html + read('intro.js') + read('spike3d.js')));
    assert(!/index\.html(?:#map)?['"]/.test(gym));
    assert(read('lobby-client.js').includes("(q.size?'?'+q:'')+'#lobby'"));
    const head = gym.match(/<script>(.*?)<\/script>/s)[1]; let redirected;
    vm.runInNewContext(head, {location: {search: '', replace: u => { redirected = u; }}});
    assert.equal(redirected, 'index.html#lobby'); redirected = undefined;
    vm.runInNewContext(head, {location: {search: '?site=bs-shenjing&room=invite', replace: u => { redirected = u; }}});
    assert.equal(redirected, undefined);
  });
  console.log(`${passed} opening state checks passed (browser verification still required)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
