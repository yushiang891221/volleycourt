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
assert(loader.includes('tutAutoOpen()'));
assert(source('tutAutoOpen').includes("has('practice')") && source('tutAutoOpen').includes("$('game-loading')") && source('tutAutoOpen').includes('!cover.hidden'), '進練習模式：等載入畫面收掉才跳出大面板');
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
  vm.runInContext('Math.random = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();', c);   /* 固定亂數：教練落點每次一樣，測試結果穩定 */
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
api.start('recv');
{ /* 第 1 步：落點在玩家旁 2～2.5 m，站著不動不會過關，走進落點圈才過 */
  until(() => c.coach.incoming());
  const p = c.coach.incoming(), d0 = Math.hypot(p.x - walk.x, p.z - walk.z);
  assert(d0 >= 1.8 && d0 <= 2.7, '接球第 1 步落點離玩家 ' + d0);
  for (let i = 0; i < 30; i++) tick();
  assert.equal(api.view().phase, 'running', '站著不動不能過關');
  until(() => api.view().phase === 'success', () => { const q = c.coach.incoming(); if (q) { walk.x = q.x; walk.z = q.z; } });
  advance();
}
for (const index of [1, 2]) {
  walk.crouch = index === 2;
  until(() => api.view().phase === 'success', () => {
    const ball = c.coach.ball;
    if (ball && ball.m.position.y < 1.7 && ball.v.y < 0 && !walk.recv) c.vbReceive();
  });
  advance();
}
walk.crouch = false;
let diveFeeds = 0;
until(() => api.view().phase === 'success', () => {
  const ball = c.coach.ball; if (!ball || ball.v.y >= 0) return;
  if (ball !== c.lastDiveBall) { /* 撲救球：落在玩家側邊 3～3.5 m */
    c.lastDiveBall = ball; diveFeeds++;
    const pr = c.vbPredict(ball.m.position, ball.v, c.BALL_R), d = Math.hypot(pr.x - walk.x, pr.z - walk.z);
    assert(d >= 2.8 && d <= 3.7, '撲救落點離玩家 ' + d);
  }
  const pr = c.vbPredict(ball.m.position, ball.v, c.BALL_R);   /* 球快落地才撲：這裡的人物移動是簡化版，0.4～0.6 秒能接到；真遊戲在瀏覽器實測是落地前 0.2～0.42 秒 */
  if (pr && pr.t < 0.5 && !walk.dive && !walk.down) { walk.keys.add('shift'); c.vbReceive(); }
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
  let jumped = false;   /* 真人：看到教練起跳後約 0.25 秒才按 B */
  until(() => api.view().phase === 'success', () => {
    if (c.coach.cj && !jumped && c.performance.now() - c.coach.cj >= 250) { jumped = true; c.vbJump('block'); }
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
    if (g.coach.cj && !jumped && g.performance.now() - g.coach.cj >= 250) { jumped = true; g.vbJump('block'); }
  }, 400);
  assert(!g.coach.ball.floorHit, '碰手發生於落地前');
  test.api.stop(); assert.equal(g.balls.length, 0);
}
console.log('PASS 攔網：教練先拋球再起跳扣，看教練起跳 0.25 秒後按 B，三種球速、兩側、三種場地旋轉皆攔得到');

{ /* 攔網預兆：拋球→教練起跳→扣球 依序發生；看到教練起跳後 0～0.4 秒按 B 都攔得到，太早（剛拋球就跳）攔不到 */
  for (const [delay, ok] of [[0, true], [200, true], [400, true], [null, false]]) {   /* null＝剛拋球 0.1 秒就跳 */
    const test = engine(), g = test.c;
    test.api.start('block');
    for (let step = 0; step < 2; step++) { test.api.skip(); test.advance(); }
    test.until(() => !!g.coach.toss);
    const tossT = g.performance.now(); let apexT = 0, spikeT = 0, jumped = false, hit = false;
    const emit = test.api.emit; test.api.emit = (n, d) => { if (n === 'block') hit = true; return emit(n, d); };
    test.until(() => hit || (g.coach.ball && g.coach.ball.floorHit), () => {
      const now = g.performance.now();
      if (!apexT && g.coach.cj) apexT = now;
      if (apexT && !spikeT && !g.coach.toss) spikeT = now;
      const at = delay === null ? tossT + 100 : apexT && apexT + delay;
      if (!jumped && at && now >= at) { jumped = true; g.vbJump('block'); }
    }, 400);
    assert(apexT - tossT > 400, '教練拋球後要隔一段時間才起跳（看得到預兆）');
    assert(spikeT > apexT, '教練起跳後才扣球');
    assert.equal(hit, ok, `看到教練起跳後 ${delay} ms 按 B：應${ok ? '' : '不'}攔得到`);
  }
  console.log('PASS 攔網預兆：拋球→起跳→扣球，起跳後 0～0.4 秒按 B 攔得到、剛拋球就跳攔不到');
}

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
    insertBefore(child, ref) { const i = this.children.indexOf(ref); this.children.splice(i < 0 ? 0 : i, 0, child); },
    querySelector(sel) { return this.children.find(c => '#' + c.id === sel) || null; },
    addEventListener(type, handler) { this.events.set(type, handler); }
  };
}
const doc = { head: element(), body: element(), toolbar: element(), createElement: element,
  querySelector: () => doc.toolbar };
for (const id of ['w-host', 'w-settings', 'w-exit']) doc.toolbar.append(Object.assign(element(), { id }));   /* 房主設定、設定、回大廳 */
const dom = fixture(); dom.api.mount(doc); dom.api.open();
const [menu, panel] = doc.body.children, entry = doc.toolbar.children[0];
assert.deepEqual(doc.toolbar.children.map(c => c.id || c.textContent), ['📘 新手教學', 'w-host', 'w-settings', 'w-exit'], '新手教學按鈕在房主設定左邊');
assert(menu.innerHTML.includes('🏐 自由練習') && menu.innerHTML.includes('📘 新手教學') && menu.innerHTML.includes('data-action="free"') && menu.innerHTML.includes('data-action="full"'), '大面板有自由練習、新手教學兩個選項');
for (const id of ['move', 'recv', 'set', 'atk', 'serve', 'block']) assert(menu.innerHTML.includes(`data-start="${id}"`), '自由練習裡可以單獨選 ' + id);
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
dom.api.open(); menu.events.get('click')({ stopPropagation() {}, target: { closest: () => ({ dataset: { action: 'free' } }) } });
assert.equal(dom.api.view().phase, 'closed', '自由練習：關掉大面板');
console.log('PASS 練習模式大面板（自由練習／新手教學）、按鈕在房主設定左邊、滑鼠事件隔離');

{ /* 新手教學（從頭走完）：從第一段開始，一段做完 2.5 秒後自動接下一段；單獨練一段不會自動接；已完成的段落從下一段繼續 */
  const g = engine(), api = g.api;
  api.startFull(); assert.equal(api.view().section, 'move'); assert.equal(api.view().full, true);
  const skipSection = () => { const n = api.view().count; for (let i = 0; i < n; i++) { api.skip(); g.advance(); } };
  skipSection(); assert.equal(api.view().phase, 'complete'); assert.equal(api.view().section, 'move');
  g.api.open(); api.startFull(); assert.equal(api.view().section, 'recv', '繼續：從還沒做完的段落開始');
  api.stop(); api.start('set'); skipSection(); assert.equal(api.view().full, false);
  const single = api.view();
  const full = engine(); full.api.startFull(); for (let i = 0; i < 6; i++) { full.api.skip(); full.advance(); }
  setTimeout(() => {
    assert.equal(single.phase, 'complete');
    assert.equal(api.view().phase, 'complete', '單獨練一段：做完停在完成畫面');
    assert.equal(full.api.view().section, 'recv', '新手教學：2.5 秒後自動進入下一段');
    assert.equal(full.api.view().phase, 'running');
    full.api.stop(); api.stop();
    console.log('PASS 新手教學從頭走完：自動接下一段、從未完成的段落繼續；單獨練一段不自動接');
  }, 2700);
}

{ /* WEB-006D：各段失敗提示、做到就清提示、教學攔網段與接球第 1 步不被接球輔助拉走、面板位置 */
  const hints = {};
  for (const id of ['recv', 'set', 'atk', 'block', 'serve']) {
    const t = engine(); t.api.start(id); t.api.emit('feedMiss');
    hints[id] = t.api.view().hint; assert(hints[id], id + ' 要有失敗提示');
    t.api.skip(); assert.equal(t.api.view().hint, '', id + ' 做到時要清掉舊的失敗提示');
  }
  assert.equal(new Set(Object.values(hints)).size, 5, '五段的失敗提示要不一樣');
  assert(/教練/.test(hints.block) && /額頭/.test(hints.set) && /起跳/.test(hints.atk));
  const vbAssist = source('vbAssist');
  assert(vbAssist.includes("TUT_COACH.id === 'block'") && vbAssist.includes("TUT_COACH.id === 'recv' && TUT_COACH.index === 0"));
  const tut = fs.readFileSync(path.join(__dirname, '../tutorial.js'), 'utf8');
  assert(tut.includes('.vb-tut-panel{top:160px;left:50%;transform:translateX(-50%)'), '面板在上方中間、陪練按鈕列下面');
  console.log('PASS 各段失敗提示、成功清提示、教學中不被接球輔助拉走、面板位置');
}
