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
console.log('PASS WEB-006 六段狀態機、進度、改鍵與失敗提示');

/* 擷取真正的遊戲函式，場景外觀與音效用替身，球路與判定執行原始程式。 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const gym = fs.readFileSync(path.join(__dirname, '../gym.html'), 'utf8').replaceAll('\r\n', '\n');
function source(name) {
  const start = gym.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  const lines = gym.slice(start).split('\n');
  for (let count = 1; count < lines.length; count++) {
    const body = lines.slice(0, count).join('\n');
    try { new vm.Script(body); return body; } catch (_) { /* 函式尚未完整。 */ }
  }
  throw Error(name);
}
for (const name of ['recv', 'recvMiss', 'set', 'jump', 'atk', 'whiff', 'serve', 'block', 'dive']) assert(gym.includes(`tutEv('${name}',`));
for (const [name, event] of [['vbJump', 'jump'], ['vbDive', 'dive'], ['vbRecvStep', 'recvMiss'], ['vbDoReceive', 'recv'], ['vbDoSet', 'set'], ['vbHitAttack', 'atk'], ['vbSwingStep', 'whiff']]) {
  assert(source(name).includes(`tutEv('${event}',`), `${event} 必須在 ${name} 內`);
}
assert.equal((gym.match(/tutEv\('serve',/g) || []).length, 1);
assert(source('serveLaunch').includes("tutEv('serve'"));
assert(source('vbBlockTest').indexOf("tutEv('block'") > source('vbBlockTest').indexOf('vbBlockApply('));
assert(source('updateWalk').includes('if (window.VBTutorial?.active) window.VBTutorial.frame(tutSnapshot());'));
assert(source('staGame').includes('if (window.VBTutorial?.active) return false;'));
for (const name of ['stopWalk', 'vmStart', 'vm6Start', 'rkStart']) assert(source(name).includes('globalThis.VBTutorial?.stop();'));
const loader = gym.slice(gym.indexOf("if (new URLSearchParams(location.search).has('practice')) {\n  ROOM ="), gym.indexOf('function resize()'));
assert(loader.includes("tutorialScript.src = 'tutorial.js'"));
assert(loader.includes('window.VBTutorial.mount(document)'));
assert(loader.includes("get('tutorial') === '1'"));
assert.equal((gym.match(/tutorialScript.src/g) || []).length, 1);
assert(source('setMenuPick').includes('SET_OPT[m.n][i][0], true'));
assert(source('vbSet').includes('walk.setQ = { n, v, menu,'));
assert(source('vbSetStep').includes('s.v, s.menu'));
console.log('PASS 練習房限定載入、九種事件、快照、轉盤來源、體力與退出接線');

class Vector {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  copy(p) { return this.set(p.x, p.y, p.z); }
  clone() { return new Vector(this.x, this.y, this.z); }
  add(p) { return this.addScaledVector(p, 1); }
  sub(p) { return this.addScaledVector(p, -1); }
  addScaledVector(p, n) { this.x += p.x * n; this.y += p.y * n; this.z += p.z * n; return this; }
  multiplyScalar(n) { this.x *= n; this.y *= n; this.z *= n; return this; }
  divideScalar(n) { return this.multiplyScalar(1 / n); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthSq() { return this.length() ** 2; }
  distanceTo(p) { return Math.hypot(this.x - p.x, this.y - p.y, this.z - p.z); }
  setLength(n) { return this.multiplyScalar(n / (this.length() || 1)); }
  lerp(p, n) { return this.lerpVectors(this.clone(), p, n); }
  lerpVectors(a, b, n) { return this.copy(a).multiplyScalar(1 - n).addScaledVector(b, n); }
}
class Object3D {
  constructor(geometry, material) {
    this.geometry = geometry; this.material = material; this.isMesh = !!geometry;
    this.position = new Vector(); this.rotation = new Vector(); this.scale = new Vector(1, 1, 1);
    this.userData = {}; this.children = []; this.visible = true;
  }
  add(child) { child.removeFromParent(); this.children.push(child); child.parent = this; }
  remove(child) { this.children = this.children.filter(x => x !== child); child.parent = null; }
  removeFromParent() { this.parent?.remove(this); }
  rotateOnWorldAxis() {}
  getWorldPosition(p) { return p.copy(this.position).add(this.parent?.position || new Vector()); }
}
function engine() {
  let time = 1000;
  const noop = () => {}, court = { id: 'court', type: 'vb', x: 12, z: -8, rot: 37 };
  const walk = { on: true, x: 100, z: 100, yaw: 0, pitch: 0, keys: new Set(), vel: [0, 0], down: 0 };
  const c = { console, window: {}, performance: { now: () => time },
    THREE: { Vector3: Vector, Mesh: Object3D, RingGeometry: class { dispose() {} }, MeshBasicMaterial: class { dispose() {} } },
    walk, state: { items: [court], building: { H: 12 }, net: 'men' }, CAT: { vb: { court: 'vb' } },
    camera: new Object3D(), scene: new Object3D(), ballsGroup: new Object3D(), balls: [],
    VM: { on: false }, NET: { on: false }, VB: { ts: 0.7, assist: true, dt: 1 / 60 },
    EYE: 1.62, BALL_R: 0.105, JUMP_G: 8.4, NETS: { men: { h: 2.43 } },
    VB_REACH: { atk: 1, recv: 0.95, set: 0.9 }, SETM: {}, SET_DEF: { 1: 'high', 2: 'quick', 3: 'high' },
    CHG: { sw0: 0.72, sw1: 0.88, over: 1, max: 1.2 },
    RECV_CROUCH: { crouchDy: -0.5, crouchDT: 0.15 }, BLK_FX: {},
    TOUCH_OUT: { outKeep: .09, outKeepPow: .08, outPast: [.15,.7], outLatMax: [2.6,1.2], topKeep: .14, topKeepPow: .14, topVy: [2,1.4], powVy: 1.6 },
    skill: {}, hands: {}, pose: 'hold', AVP: { idle: {} }, SFX: { floorT: 0 }, SPIN_AX: new Vector(),
    STA: { v: 100 }, locked: () => true, tpActive: () => !!c.third,
    clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)), rkGauss: () => 0,
    newBallMesh: () => new Object3D(), makeAvatar: () => ({ g: new Object3D() }), myChar: () => null,
    avDrive: noop, avBlockPose: () => ({}), setMenuClose: noop, unlockMouse: noop,
    toast: noop, recHit: noop, vbImpact: noop, vbFx: noop, vbBlockFx: noop, vbSpinFor: () => null,
    vbPep: () => null, vmSecond: () => false, vmThird: () => false, vbHardDefl: () => null,
    vmMe: () => 'me', vmOnTouch: noop, vmBlockTest: noop, vbChargeStep: noop,
    staCost: () => 5, staEff: () => 1, staWarn: noop,
    updateTweens: noop, updateDoors: noop, updateWind: noop, netFxStep: noop, ballShadowSync: noop,
    blockers: () => [], solidSegs: () => [], vmCrossCheck: noop, sfx: noop, netFxHit: noop,
    vbNetRoll: () => 0.5, vbAntenna: noop, $: () => ({ hidden: false }),
    applyPose: noop, placeHeld: noop, vmServeOK: () => true, vbServeInside: () => false,
    vbServeZone: noop, collide: (x, z) => [x, z], ballMat: {}, ballHot: {},
    vbServeAim: () => null, serveVel: () => new Vector(-10, 8, 0)
  };
  c.vbFwd = () => [-Math.sin(walk.yaw), -Math.cos(walk.yaw)];
  vm.createContext(c);
  for (const name of ['toWorldOf', 'toLocalOf', 'courtAt', 'vbCourt', 'solveShot', 'vbPredict', 'vbMine', 'vbLaunch',
    'vbNetCourts', 'updateBalls', 'vbJumpVy', 'vbJump', 'vbAirStep', 'vbHand', 'vbAttack', 'vbSwingStep', 'vbShotVel',
    'vbChargeOf', 'vbHitAttack', 'vbReceive', 'vbDive', 'vbRecvStep', 'vbDoReceive', 'vbNext',
    'vbSet', 'vbSetStep', 'vbSpot', 'vbSendSet', 'vbDoSet', 'vbBlockTest', 'vbBlockOutcome', 'vbBlockApply',
    'staGame', 'staPay', 'staUse', 'grabBall', 'startServe', 'updateServe', 'startJumpServe', 'updateJumpServe', 'jumpServeHit', 'serveLaunch']) {
    vm.runInContext(source(name), c);
  }
  vm.runInContext(gym.slice(gym.indexOf('function tutEv('), gym.indexOf('// ---------------------------------------------------------------- loop', gym.indexOf('function tutEv('))) + '\nthis.coach = TUT_COACH;', c);
  c.window.VBTutorial = create({ now: () => time, storage: null, coach: c.coach });
  const api = c.window.VBTutorial;
  function tick(dt = 1 / 60, input = noop) {
    time += dt * 1000;
    if (walk.serve) c.updateServe(dt);
    if (walk.jserve) c.updateJumpServe(dt);
    if (walk.dive) {
      walk.dive.t += dt;
      const e = Math.min(1, walk.dive.t / .45), factor = e < .6 ? 1 : 1 - (e - .6) / .4 * .85;
      walk.x += walk.dive.vx * factor * dt; walk.z += walk.dive.vz * factor * dt;
      if (e >= 1) { walk.dive = null; walk.down = .75; }
    } else walk.down = Math.max(0, walk.down - dt);
    const y = c.vbAirStep(dt); c.camera.position.set(walk.x, c.EYE + y, walk.z);
    input(); c.vbSwingStep(dt); c.vbRecvStep(); c.vbSetStep();
    api.frame(c.tutSnapshot()); c.updateBalls(dt);
  }
  const until = (predicate, input = noop, limit = 600) => {
    for (let i = 0; i < limit && !predicate(); i++) tick(1 / 60, input);
    assert(predicate(), JSON.stringify(api.view()));
  };
  const advance = () => { assert.equal(api.view().phase, 'success'); until(() => api.view().phase !== 'success'); };
  return { c, api, walk, tick, until, advance, setTime: n => { time = n; } };
}

const game = engine(), { c, api, walk, tick, until, advance } = game;
api.start('move'); tick(); advance();
for (const step of [1, 2, 3, 4, 5]) {
  if (step === 1 || step === 3) { const target = api.view().target; walk.x = target.x; walk.z = target.z; }
  if (step === 2) { tick(); walk.yaw += 1.6; }
  if (step === 3) { walk.keys.add('shift'); walk.vel = [3.74, 0]; }
  if (step === 4) walk.crouch = true;
  if (step === 5) { tick(); c.third = !c.third; }
  until(() => api.view().phase === 'success'); advance();
}
assert(api.progress().done.move);
walk.crouch = false; walk.keys.clear();
api.start('recv'); until(() => api.view().phase === 'success'); advance();
for (const index of [1, 2]) {
  walk.crouch = index === 2;
  until(() => api.view().phase === 'success', () => {
    const ball = c.coach.ball;
    if (ball && ball.m.position.y < 1.7 && ball.v.y < 0 && !walk.recv) c.vbReceive();
  });
  advance();
}
walk.crouch = false;
until(() => api.view().phase === 'success', () => {
  const ball = c.coach.ball;
  if (ball && ball.m.position.y < 2.8 && ball.v.y < 0 && !walk.dive && !walk.down) { walk.keys.add('shift'); c.vbReceive(); }
}, 1200);
advance(); assert(api.progress().done.recv);
assert.equal(api.view().failures, 0, '撲救應實際接到，不靠三次失敗放寬');

api.start('set');
for (const actions of [[[1, null, false]], [[2, null, false], [3, null, false]], [[7, null, false]], [[1, 'flat', true]]]) {
  for (const [n, variation, menu] of actions) {
    const before = api.view().completed.length;
    until(() => api.view().phase === 'success' || api.view().completed.length > before, () => {
      const ball = c.coach.ball;
      if (ball && !c.coach.settled && ball.v.y < 0 && ball.m.position.y < 2.6 && !walk.setQ) c.vbSet(n, variation, menu);
    });
  }
  advance();
}
assert(api.progress().done.set);

api.start('atk'); walk.vel = [2.5, 0]; c.vbJump('attack'); advance();
for (const index of [1, 2, 3]) {
  until(() => api.view().phase === 'success', () => {
    const ball = c.coach.ball;
    if (!ball || c.coach.settled) return;
    if (ball.v.y < 0 && ball.m.position.y < 4 && !walk.air) { walk.vel = [0, 0]; c.vbJump('attack'); }
    if (walk.air && !walk.swing && ball.m.position.distanceTo(c.vbHand()) < 1) c.vbAttack(index === 3, index === 2 ? 0.8 : 0.5);
  });
  advance();
}
assert(api.progress().done.atk);

api.start('serve');
for (const type of ['std', 'float', 'jump']) {
  until(() => !!walk.hold);
  if (type === 'jump') c.startJumpServe(); else c.startServe(type);
  until(() => api.view().phase === 'success', () => {
    if (type === 'jump' && walk.air && walk.jserve?.ball.position.distanceTo(c.vbHand()) < 0.7) c.jumpServeHit('jump', .8);
  });
  advance();
  if (type !== 'jump') { assert.equal(walk.hold, null, '跨步仍須等發球後 1.5 秒'); }
}
assert(api.progress().done.serve);

api.start('block'); tick(); c.vbJump('block'); advance();
c.vbJump('block'); walk.blkAim = .3; tick(); advance();
for (const index of [2, 3]) {
  let jumped = false;
  until(() => api.view().phase === 'success', () => {
    if (c.coach.ball && !jumped) { jumped = true; c.vbJump('block'); }
  });
  if (index === 3) assert(c.coach.together());
  advance();
}
assert(api.progress().done.block);
assert(api.view().allDone);
assert.equal(c.balls.length, 0);
assert.equal(c.coach.objects.length, 0);
assert.equal(c.coach.owned.size, 0);
console.log('PASS Node 原始球路與接球／舉球／攻擊／發球／碰手判定，六段逐步完成');

for (const speed of [.55, .7, 1]) for (const side of [-1, 1]) for (const rotation of [0, 37, 90]) {
  const test = engine(), g = test.c, w = test.walk;
  g.VB.ts = speed; g.state.items[0].rot = rotation;
  [w.x, w.z] = g.toWorldOf(g.state.items[0], side * 2, 0);
  test.api.start('block');
  for (let step = 0; step < 2; step++) { test.api.skip(); test.advance(); }
  let jumped = false;
  test.until(() => test.api.view().phase === 'success', () => {
    if (g.coach.ball && !jumped) { jumped = true; g.vbJump('block'); }
  }, 200);
  assert(!g.coach.ball.floorHit, '碰手發生於落地前');
  test.api.stop(); assert.equal(g.balls.length, 0);
}
console.log('PASS 攔網固定球路在三種球速、兩側、三種場地旋轉皆經原判定碰手');

const retry = engine(); retry.api.start('recv'); retry.api.skip(); retry.advance();
retry.until(() => !!retry.c.coach.ball);
const firstBall = retry.c.coach.ball;
retry.c.tutEv('recvMiss', {}); retry.c.tutEv('recvMiss', {});
firstBall.floorHit = [0, 0]; retry.tick();
assert.equal(retry.api.view().failures, 1, '窗口結束和落地只算一次失敗');
for (let i = 0; i < 100; i++) retry.tick();
assert.equal(retry.c.coach.ball, firstBall, '失敗後兩秒內不可重餵');
retry.until(() => retry.c.coach.ball !== firstBall);
assert(!retry.c.balls.includes(firstBall));
const unrelated = { m: new Object3D(), v: new Vector(), rest: 3 };
retry.c.balls.push(unrelated); retry.c.ballsGroup.add(unrelated.m);
retry.api.open(); assert.deepEqual(retry.c.balls, [unrelated]);
for (let i = 0; i < 180; i++) retry.tick();
assert.equal(retry.c.balls.length, 1, '回選單後不能繼續餵球');
assert.equal(retry.c.coach.objects.length, 0);

const missServe = engine(); missServe.api.start('serve');
missServe.c.startJumpServe(); missServe.until(() => !missServe.walk.jserve);
assert.equal(missServe.walk.hold, null);
const failedToss = missServe.c.balls[0]; assert(failedToss);
missServe.until(() => !!missServe.walk.hold);
assert(!missServe.c.balls.includes(failedToss), '補球時清掉失誤的拋球');
missServe.c.startJumpServe(); const pendingToss = missServe.walk.jserve.ball;
missServe.api.stop(); assert.equal(pendingToss.parent, null); assert.equal(missServe.walk.jserve, null);
assert.equal(missServe.c.balls.length, 0);

const stamina = engine(); stamina.api.start('atk'); stamina.c.VB.npc = {};
const energy = stamina.c.STA.v;
stamina.c.staPay('jump'); stamina.c.staUse(0.5);
assert.equal(stamina.c.STA.v, energy);
stamina.api.stop(); assert(stamina.c.staGame()); stamina.c.staPay('jump');
assert(stamina.c.STA.v < energy, '非教學陪練仍扣體力');

const pair = engine(); pair.api.start('block');
for (let i = 0; i < 3; i++) { pair.api.skip(); pair.advance(); }
assert(pair.c.coach.mate); assert.equal(pair.c.coach.together(), false);
pair.c.vbJump('block'); pair.tick(); assert(pair.c.coach.together());
pair.walk.x += 3; assert.equal(pair.c.coach.together(), false);
pair.api.start('move'); assert.equal(pair.c.coach.mate, null); assert.equal(pair.c.balls.length, 0);
const snapshot = pair.c.tutSnapshot();
for (const field of ['x','z','yaw','pitch','speed','sprint','crouch','air','airBlock','blkAim','locked','tp','hold','nearNet','onCourt','incoming']) assert(field in snapshot);
console.log('PASS 重餵去重與間隔、失誤補球、換段／回選單／拋球中退出、體力隔離及隊友距離');

function element() {
  return { dataset: {}, style: {}, events: new Map(), children: [], hidden: false,
    setAttribute() {}, append(...children) { this.children.push(...children); },
    addEventListener(type, handler) { this.events.set(type, handler); }
  };
}
const doc = { head: element(), body: element(), toolbar: element(), createElement: element,
  querySelector: () => doc.toolbar };
const dom = fixture(); dom.api.mount(doc); dom.api.open();
const [menu, panel] = doc.body.children, entry = doc.toolbar.children[0];
assert.equal(menu.hidden, false); assert.equal(panel.hidden, true);
assert.equal(entry.textContent, '📘 新手教學');
for (const node of [menu, panel, entry]) for (const type of ['pointerdown','pointerup','mousedown','mouseup','dblclick','contextmenu','wheel']) {
  let stopped = false; node.events.get(type)({ stopPropagation() { stopped = true; } }); assert(stopped);
}
let stopped = false;
menu.events.get('click')({ stopPropagation() { stopped = true; }, target: { closest: () => ({ dataset: { start: 'recv' } }) } });
assert(stopped); assert.equal(dom.api.view().section, 'recv'); assert.equal(panel.hidden, false);
panel.events.get('click')({ stopPropagation() {}, target: { closest: () => ({ dataset: { action: 'stop' } }) } });
assert.equal(dom.api.view().phase, 'closed');
console.log('PASS 選單／面板正常入口與滑鼠事件隔離（畫面仍待瀏覽器驗收）');
