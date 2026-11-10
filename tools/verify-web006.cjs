/* 離線測試教學框架。場景接線完成後需另驗收實際球路與操作。 */
const assert = require('node:assert/strict');
const { create, sections } = require('../tutorial.js');

function fixture(raw = null, blocked = false) {
  let time = 1000;
  const memory = new Map([['vb.tutorial', raw]]);
  const keys = Object.fromEntries(['w', 'a', 's', 'd', 'p', 'shift', 'crouch', 'v', '1', '2', '3', '4', '5', '6', ' ', 'b'].map(k => [k, 'custom-' + k]));
  const settings = { values: { keys }, keyName: code => code };
  const calls = [];
  const api = create({
    now: () => time, settings: () => settings,
    storage: {
      getItem() { if (blocked) throw Error('blocked'); return memory.get('vb.tutorial'); },
      setItem(k, value) { if (blocked) throw Error('blocked'); memory.set(k, value); }
    },
    coach: {
      start: id => calls.push(['start', id]),
      step: (id, step) => { calls.push(['step', id, step]); return { x: 4, z: 0 }; },
      stop: () => calls.push(['stop']), pause: () => calls.push(['pause'])
    }
  });
  const state = { x: 0, z: 0, yaw: 0, tp: false, locked: false, crouch: false, sprint: false, incoming: null };
  const tick = (patch = {}, ms = 100) => { Object.assign(state, patch); time += ms; api.frame({ ...state }); };
  const advance = () => { assert.equal(api.view().phase, 'success'); tick({}, 800); };
  return { api, tick, advance, memory, settings, calls };
}

const t = fixture();
const delay = fixture(); delay.api.start('move'); delay.api.skip();
delay.tick({}, 799); assert.equal(delay.api.view().phase, 'success');
delay.tick({}, 1); assert.equal(delay.api.view().step, 1);
assert.equal(sections.length, 6);
assert.equal(t.api.start('unknown'), false);
assert.ok(sections.every(s => s.enabled));
t.api.open(); assert.equal(t.api.view().phase, 'menu');
assert.equal(t.api.start('move'), true);
t.tick({ locked: true }); t.advance();
assert.match(t.api.view().instruction, /<kbd>custom-w<\/kbd>/);
t.tick({ x: 4 }); t.advance();
t.tick({ yaw: 3.1 }); t.tick({ yaw: -3.1 });
assert.equal(t.api.view().phase, 'running');
t.tick({ yaw: -1.5 }); t.advance();
t.tick({ sprint: false }); assert.equal(t.api.view().phase, 'running');
t.tick({ sprint: true }); t.advance();
t.tick({ crouch: true });
for (let i = 0; i < 5; i++) t.tick();
t.tick({ crouch: false }); t.tick({ crouch: true });
assert.equal(t.api.view().phase, 'running');
for (let i = 0; i < 11; i++) t.tick();
t.advance(); t.tick(); t.tick({ tp: true }); t.advance();
assert.equal(t.api.view().phase, 'complete');
assert.equal(t.api.active, false);
assert.equal(t.api.progress().done.move, true);
assert.equal(t.api.progress().at.move, 6);

t.api.start('recv');
t.tick({ incoming: { x: 5, z: 0 } }); assert.equal(t.api.view().phase, 'running');
t.tick({ incoming: { x: 4.7, z: 0 } }); t.advance();
t.api.emit('recv'); t.advance();
t.api.emit('recv', { crouch: false }); assert.equal(t.api.view().phase, 'running');
t.api.emit('recv', { crouch: true }); t.advance();
t.api.emit('recv', { dive: true }); assert.equal(t.api.view().phase, 'running');
t.api.emit('dive'); t.api.emit('recv', { dive: true }); t.advance();
assert.equal(t.api.progress().done.recv, true);

t.api.start('set');
t.api.emit('set', { n: 2 }); assert.equal(t.api.view().phase, 'running');
t.api.emit('set', { n: 1 }); t.advance();
t.api.emit('set', { n: 3 }); assert.match(t.api.view().instruction, /✓/);
t.api.emit('set', { n: 3 }); assert.equal(t.api.view().phase, 'running');
t.api.emit('set', { n: 2 }); t.advance();
t.api.emit('set', { n: 7 }); t.advance();
t.api.emit('set', { n: 1, menu: true, def: true }); assert.equal(t.api.view().phase, 'running');
t.api.emit('set', { n: 1, menu: true, def: false }); t.advance();
assert.equal(t.api.progress().done.set, true);
const detached = t.api.progress(); detached.done.move = false;
assert.equal(t.api.progress().done.move, true);
const reload = fixture(t.memory.get('vb.tutorial'));
assert.equal(reload.api.progress().done.set, true);
reload.api.start('set'); assert.equal(reload.api.view().step, 0);

for (const section of sections.filter(s => s.enabled)) {
  const f = fixture(); f.api.start(section.id);
  for (let i = 0; i < section.count; i++) { f.api.skip(); f.advance(); }
  assert.equal(f.api.progress().done[section.id], true);
  f.api.start(section.id); f.api.stop();
  f.api.emit('recv'); f.tick({ locked: true });
  assert.equal(f.api.view().phase, 'closed'); assert.equal(f.api.active, false);
}
const fallback = fixture(JSON.stringify({ v: 1, done: {}, at: { recv: 3 }, updated: 0 }));
fallback.api.start('recv');
for (let i = 0; i < 3; i++) fallback.api.emit('recvMiss');
assert.match(fallback.api.view().hint, /三次/);
fallback.api.emit('dive'); fallback.advance();
assert.equal(fallback.api.progress().done.recv, true);

for (const raw of ['{broken', 'null', '[]', '{"v":2}', '{"v":1,"done":[],"at":{}}']) {
  const f = fixture(raw); assert.deepEqual(f.api.progress().done, {});
  f.api.start('move'); f.api.skip(); f.advance(); f.api.stop();
  const resumed = fixture(f.memory.get('vb.tutorial')); resumed.api.start('move');
  assert.equal(resumed.api.view().step, 1);
}
const blocked = fixture(null, true);
blocked.api.start('move'); blocked.api.skip(); blocked.advance(); blocked.api.reset();
assert.deepEqual(blocked.api.progress().done, {});
assert.deepEqual(blocked.api.progress().at, {});
const changed = fixture(); changed.api.start('recv'); changed.api.skip(); changed.advance();
changed.settings.values.keys.v = '<NEW>';
assert.match(changed.api.view().instruction, /<kbd>&lt;NEW&gt;<\/kbd>/);
changed.tick({}, 13000); assert.ok(changed.api.view().hint);
changed.api.stop(); changed.tick({}, 2000); assert.equal(changed.api.view().phase, 'closed');
const b = fixture();
b.api.start('atk');
assert.match(b.api.view().instruction, /<kbd>custom- <\/kbd>/);
for (const data of [{ block: true, speed: 4 }, { block: false, speed: 1.99 }, { speed: 4 }]) {
  b.api.emit('jump', data); assert.equal(b.api.view().phase, 'running');
}
b.api.emit('jump', { block: false, speed: 2 }); b.advance();
for (const data of [{ air: false, chg: 0.5 }, { air: true, chg: null }, { air: true }]) {
  b.api.emit('atk', data); assert.equal(b.api.view().phase, 'running');
}
b.api.emit('whiff'); assert.match(b.api.view().hint, /太早揮/);
b.api.emit('atk', { air: true, chg: 0 }); b.advance();
b.api.emit('atk', { zone: 'over' }); assert.equal(b.api.view().phase, 'running');
b.api.emit('atk', { zone: 'sweet' }); b.advance();
b.api.emit('atk', { tip: false }); assert.equal(b.api.view().phase, 'running');
b.api.emit('atk', { tip: true }); b.advance();
assert.equal(b.api.progress().done.atk, true);
b.api.start('serve');
for (const type of ['std', 'float', 'jump']) {
  b.api.emit('serve', { type: 'jfloat' }); assert.equal(b.api.view().phase, 'running');
  b.api.emit('serve', { type }); b.advance();
}
assert.equal(b.api.progress().done.serve, true);
b.api.start('block');
b.api.emit('jump', { block: true }); assert.equal(b.api.view().phase, 'running');
b.tick({ nearNet: 1.01 }); b.api.emit('jump', { block: true }); assert.equal(b.api.view().phase, 'running');
b.tick({ nearNet: 1 }); b.api.emit('jump', { block: false }); assert.equal(b.api.view().phase, 'running');
b.api.emit('jump', { block: true }); b.advance();
for (const patch of [{ air: false, airBlock: true, blkAim: 0.3 }, { air: true, airBlock: false }, { airBlock: true, blkAim: 0.199 }]) {
  b.tick(patch); assert.equal(b.api.view().phase, 'running');
}
b.tick({ blkAim: -0.2 }); b.advance();
b.api.emit('block', { kind: 'stuff' }); assert.match(b.api.view().hint, /攔網成功/); b.advance();
b.api.emit('block', { kind: 'stuff', mate: false }); assert.equal(b.api.view().phase, 'running');
b.api.emit('block', { kind: 'soft', mate: true }); b.advance();
assert.equal(b.api.progress().done.block, true);
assert.equal(b.calls.at(-1)[0], 'stop');
for (const id of ['atk', 'serve', 'block']) {
  const f = fixture(); f.api.start(id); f.api.skip(); f.advance(); f.api.stop();
  const resumed = fixture(f.memory.get('vb.tutorial')); resumed.api.start(id);
  assert.equal(resumed.api.view().step, 1);
  assert.equal(resumed.api.progress().done[id], undefined);
}
const remap = fixture();
remap.settings.values.keys[' '] = '<跳>'; remap.settings.values.keys.b = '<攔>';
for (const id of ['atk', 'serve', 'block']) {
  remap.api.start(id);
  if (id === 'serve') { remap.api.skip(); remap.advance(); remap.api.skip(); remap.advance(); }
  assert.match(remap.api.view().instruction, id === 'block' ? /&lt;攔&gt;/ : /&lt;跳&gt;/);
}
for (const section of sections) {
  t.api.start(section.id);
  for (let i = 0; i < section.count; i++) { t.api.skip(); t.advance(); }
}
assert.equal(t.api.view().allDone, true);
const allReload = fixture(t.memory.get('vb.tutorial')); allReload.api.open();
assert.equal(allReload.api.view().allDone, true);
allReload.api.reset(); assert.equal(allReload.api.view().allDone, false);
console.log('WEB-006 framework and sections 1–6 passed (gym integration pending).');
