const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const gym = fs.readFileSync(path.join(root, 'gym.html'), 'utf8').replaceAll('\r\n', '\n');
const baseline = cp.execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'show', 'ede6ab9:gym.html'], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 }).replaceAll('\r\n', '\n');
function block(text, start, end) {
  const i = text.indexOf(start), j = text.indexOf(end, i);
  assert(i >= 0 && j > i, start);
  return text.slice(i, j);
}
function source(name, text = gym) {
  const start = text.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  const lines = text.slice(start).split('\n');
  for (let count = 1; count < lines.length; count++) {
    const body = lines.slice(0, count).join('\n');
    try { new vm.Script(body); return body; } catch (_) { /* 等待完整函式。 */ }
  }
  throw Error(name);
}
/* 沿用 WEB-006 的正式物理／操作測試環境，新增函式仍擷取自 gym.html。 */
const tutorialTest = fs.readFileSync(path.join(root, 'tools/verify-web006.cjs'), 'utf8');
const harness = { vm, assert, gym, source, console, create: require('../tutorial.js').create };
vm.createContext(harness);
vm.runInContext(block(tutorialTest, 'class Vector {', 'const game = engine()') + '\nthis.Vector = Vector; this.Object3D = Object3D;', harness);
const { Vector, Object3D } = harness;
Vector.prototype.toArray = function () { return [this.x, this.y, this.z]; };
function fixture() {
  const game = harness.engine(), c = game.c;
  for (const name of ['netSmoothBall', 'netOnMessage', 'netBallHit', 'netBallMsg', 'vmJudge', 'vmThird', 'vbThirdOverVel', 'vbOverVel', 'vbFacingOverVel', 'vmFreeBall']) vm.runInContext(source(name), c);
  Object.assign(c.NET, { on: true, ownBall: false, me: 'me', hitN: 1, hitBy: 'other', peers: new Map(), tx: { publish: (t, d) => messages.push({ t, d }) } });
  const messages = [], points = [], notes = [];
  Object.assign(c.VM, { on: true, host: true, phase: 'rally', touch: { team: 0, n: 2 }, sg: 1, team: [['me'], ['other']], ai: new Map(), c: c.state.items[0], poss: {} });
  c.vmTeamOf = () => 0; c.vmSide = t => t === 0 ? 1 : -1;
  c.vmL = (x, z) => c.toLocalOf(c.VM.c, x, z);
  c.vmMark = () => {}; c.vmOut = () => {}; c.vmPoint = (team, reason) => points.push({ team, reason });
  c.vmTrailPush = () => {}; c.netLat = () => 0.12; c.MREC = { local: { p: 0 } };
  c.vbOwnSide = () => true; c.vbMarkSet = () => {}; c.toast = note => notes.push(note); c.vmServer = () => 'other';
  const ball = (x = 4, y = 1, z = 0, velocity = new Vector()) => {
    const [wx, wz] = c.toWorldOf(c.VM.c, x, z), m = new Object3D(); m.position.set(wx, y, wz);
    const b = { m, v: velocity, rest: 0, room: true }; c.balls = [b]; c.VM.ball = b; return b;
  };
  return { ...game, messages, points, notes, ball };
}
{
  const f = fixture(), { c } = f;
  const b = f.ball(0.04, 2), [tx, tz] = c.toWorldOf(c.VM.c, -1, 0);
  b.v.set(tx - b.m.position.x, 0, tz - b.m.position.z).setLength(10);
  const original = b.v.clone(); c.updateBalls(1 / 60);
  assert(c.vmL(b.m.position.x, b.m.position.z)[0] < 0);
  assert(Math.abs(b.v.x - original.x) < 1e-10); assert(Math.abs(b.v.z - original.z) < 1e-10);
  assert.equal(f.messages.length, 0);
  c.netOnMessage('ball', { h: 1, by: 'other', n: 1, p: [12, 2, -8], v: [2, 0, 0] }, 'other');
  assert.equal(b.err, null); assert.equal(b.m.position.x, 12.07); /* VB.ts = 0.7 */
  const p = c.toWorldOf(c.VM.c, -0.001, 0); b.m.position.set(p[0], 1, p[1]);
  const target = c.toWorldOf(c.VM.c, 1, 0); b.err = new Vector(target[0] - p[0], 0, target[1] - p[1]); b.errTime = 0;
  c.netSmoothBall(b, 1 / 60, [c.VM.c]); assert(b.err, '遠端修正線段穿網不直接定位');
  c.NET.ownBall = true; b.m.position.set(p[0], 1, p[1]); b.err = new Vector(target[0] - p[0], 0, target[1] - p[1]); b.errTime = 0;
  c.netSmoothBall(b, 1 / 60, [c.VM.c]); assert.equal(b.err, null);
}
{
  const f = fixture(), { c, walk } = f;
  const b = f.ball(-0.02, 2.5), [tx, tz] = c.toWorldOf(c.VM.c, 1, 0);
  b.v.set(tx - b.m.position.x, 0, tz - b.m.position.z).setLength(20);
  [walk.x, walk.z] = c.toWorldOf(c.VM.c, 0.5, 0);
  walk.air = { block: true }; c.camera.position.y = 1.8;
  c.updateBalls(1 / 60);
  assert(c.NET.ownBall, '遠端球穿過網面後，自己的攔網仍取得球權');
  assert(f.messages.some(m => m.d.w === 'block'));
}
{
  const f = fixture(), { c } = f, b = f.ball(4, 0.106, 0, new Vector(0, -3, 0));
  c.NET.ownBall = true; c.NET.hitBy = 'me'; c.updateBalls(1 / 60);
  assert.equal(f.messages.filter(m => m.d.g).length, 1);
  for (let i = 0; i < 600; i++) c.updateBalls(1 / 60);
  assert.equal(f.messages.filter(m => m.d.g).length, 1, '彈地不重送');
  c.netBallHit(b, 'bump'); assert.equal(b.floorReport, null); assert.equal(b.floorHit, null);
  b.rest = 0; b.m.position.y = 0.106; b.v.set(0, -3, 0); c.updateBalls(1 / 60);
  assert.equal(f.messages.filter(m => m.d.g).length, 2, '新擊球可回報新的落地');
}
{
  const f = fixture(), { c } = f, b = f.ball(-4, 0.105);
  b.floorHit = c.toWorldOf(c.VM.c, -4, 0); b.floorT = 1000;
  c.vmJudge(); assert.equal(f.points.length, 0);
  f.setTime(1499); c.vmJudge(); assert.equal(f.points.length, 0);
  const landing = c.toWorldOf(c.VM.c, 4, 0);
  const report = { h: 1, by: 'other', g: landing, p: [landing[0], 0.105, landing[1]], v: [0, 1, 0] };
  c.netOnMessage('ball', { ...report, h: 0 }, 'other'); assert(!b.floorReport);
  c.netOnMessage('ball', report, 'imposter'); assert(!b.floorReport);
  c.netOnMessage('ball', report, 'other'); assert(b.floorReport);
  assert.equal(b.m.position.y, 0.105); assert.deepEqual(Array.from(b.floorHit), Array.from(landing));
  c.vmJudge(); assert.equal(f.points[0].team, 1, '使用回報落點，而非本機另一側落點');
  c.netOnMessage('ball', { h: 1, by: 'other', p: [99, 2, 99], v: [0, 1, 0] }, 'other');
  assert.deepEqual(Array.from(b.floorHit), Array.from(landing)); assert.equal(b.err, null);
  c.netOnMessage('ball', { h: 2, by: 'other', w: 'bump', p: [12, 2, -8], v: [1, 2, 0] }, 'other');
  assert.equal(b.floorReport, null); assert.equal(b.floorHit, null);
}
for (const outside of [false, true]) {
  const f = fixture(), b = f.ball(outside ? 10 : -4, 0.105);
  b.floorHit = f.c.toWorldOf(f.c.VM.c, outside ? 10 : -4, 0); b.floorT = 1000;
  f.setTime(1499); f.c.vmJudge(); assert.equal(f.points.length, 0);
  f.setTime(1500); f.c.vmJudge(); assert.equal(f.points[0].team, outside ? 1 : 0);
}
/* 正式接球入口涵蓋站接、蹲接與撲救，兩側與旋轉場地，飛行使用正式積分與球網。 */
let cases = 0;
for (const side of [1, -1]) for (const yaw of [0, Math.PI / 2, Math.PI / 4, Math.PI]) for (const mode of ['receive', 'crouch', 'dive', 'set', 'push']) {
  const f = fixture(), { c, walk } = f; c.NET.on = false; c.NET.ownBall = true;
  c.VM.sg = side; c.vmSide = () => side;
  const b = f.ball(side * 5, mode === 'dive' ? 0.3 : 0.8, 0, new Vector(0, -3, 0));
  walk.x = b.m.position.x; walk.z = b.m.position.z; walk.yaw = yaw; walk.crouch = mode === 'crouch';
  c.camera.position.set(walk.x, 1.62, walk.z);
  if (mode === 'set') c.vbSendSet(b, walk.x, walk.z, 3, 1.4, 1, '', b.m.position.clone(), 0.9);
  else if (mode === 'push') { c.vbNext = () => b; c.vmFreeBall(); }
  else c.vbDoReceive({ b, dx: 0, dz: 0 }, mode === 'dive');
  assert(b.thirdReturn, mode); assert(f.notes.includes('第三下：自動送回對面'));
  let netEvents = 0; c.NET.on = true; c.NET.tx.publish = (t, d) => { if (d.n) netEvents++; };
  for (let i = 0; i < 600 && !b.floorHit; i++) c.updateBalls(1 / 60);
  assert(b.floorHit); const [x, z] = c.vmL(...b.floorHit);
  assert(x * side < 0 && Math.abs(x) <= 9.105 && Math.abs(z) <= 4.605, `${mode} ${x},${z}`);
  assert.equal(netEvents, 0); cases++;
}
{
  const f = fixture(), { c } = f; c.NET.on = false;
  for (const q of [0, 0.1, 0.31, 0.9]) for (const x of [0.5, 2, 5, 11]) {
    const b = f.ball(x, 0.3, 6); c.rkGauss = () => 2;
    c.vbCourt = () => ({ c: c.VM.c, lx: x });
    c.vbLaunch(b, b.m.position.clone(), new Vector(), 'bump', q, true);
    const t = (b.v.y + Math.sqrt(b.v.y ** 2 + 19.6 * (b.m.position.y - c.BALL_R))) / 9.8;
    const target = b.m.position.clone().addScaledVector(b.v, t); target.y -= 4.9 * t * t;
    const [tx] = c.vmL(target.x, target.z); assert(tx < 0);
    const crossT = t * x / (x - tx); assert(b.m.position.y + b.v.y * crossT - 4.9 * crossT ** 2 > 2.535);
  }
  const original = new Vector(1, 2, 3);
  for (const kind of ['spike', 'tip', 'hit']) {
    const b = f.ball(); c.vbLaunch(b, b.m.position.clone(), original, kind, 0.9, true); assert.equal(b.thirdReturn, false); assert.deepEqual(b.v.toArray(), original.toArray());
  }
  for (const n of [0, 1]) { c.VM.touch.n = n; const b = f.ball(); c.vbLaunch(b, b.m.position.clone(), original, 'bump', 1, true); assert.deepEqual(b.v.toArray(), original.toArray()); }
  c.VM.touch.n = 2;
  for (const mode of ['ai', 'practice', 'serve']) {
    c.VM.on = mode !== 'practice'; c.VM.phase = mode === 'serve' ? 'serve' : 'rally';
    const b = f.ball(); c.vbLaunch(b, b.m.position.clone(), original, 'set', 1, mode !== 'ai'); assert.deepEqual(b.v.toArray(), original.toArray());
  }
}
for (const n of [0, 1]) for (const yaw of [0, Math.PI / 2, Math.PI]) {
  const velocities = [];
  for (const old of [true, false]) {
    const f = fixture(), { c, walk } = f; c.NET.on = false; c.VM.touch.n = n;
    if (old) for (const name of ['vbLaunch', 'vbDoReceive']) vm.runInContext(source(name, baseline), c);
    const b = f.ball(5, 0.8, 0, new Vector(0, -3, 0));
    walk.x = b.m.position.x; walk.z = b.m.position.z; walk.yaw = yaw;
    c.vbDoReceive({ b, dx: 0, dz: 0 }, false);
    velocities.push(b.v.toArray());
  }
  assert.deepEqual(velocities[0], velocities[1], '第一、二下接球沿用原面向結果');
}
{
  const f = fixture(), { c, walk } = f; c.NET.on = false; c.NET.ownBall = true;
  const b = f.ball(5, 0.3, 0, new Vector(0, -30, 0));
  walk.x = b.m.position.x; walk.z = b.m.position.z; walk.yaw = 0;
  c.window.__gym = {};
  c.vbDoReceive({ b, dx: 2, dz: 2 }, true);
  assert(c.window.__gym.lastRecv.q < 0.32); assert(b.thirdReturn);
  for (let i = 0; i < 600 && !b.floorHit; i++) c.updateBalls(1 / 60);
  assert(b.floorHit && c.vmL(...b.floorHit)[0] < 0, '極差品質撲救仍過網');
}
/* 攔網實際碰手測試沿用 WEB-006，全段與 WEB-019 逐字相等，並檢查取得球權入口。 */
for (const name of ['vbBlockTest', 'vbBlockApply', 'vmBlockTest', 'vmAiTouch', 'vmAiFree', 'vmAiRole']) assert.equal(source(name), source(name, baseline), name);
assert(source('vbBlockTest').includes('netBallHit(b,'));
assert(source('updateBalls').includes('vbBlockTest(b, h); vmBlockTest(b, h);'));
assert(!source('computeChecks').includes('NET.ownBall'));
console.log(`WEB-020 物理、事件、判分、第三下 ${cases} 組正式操作通過`);
/* WEB-015 相同三分鐘排程，另在一般回合每 18 秒、壓力情境每 3 秒送一次實際落地事件。 */
const priorTest = fs.readFileSync(path.join(root, 'tools/verify-web015.cjs'), 'utf8');
let trafficCode = block(priorTest, 'function traffic(', "for(const scenario of ['match'").replaceAll('source===gym', 'true');
trafficCode = trafficCode.replace('let maxSlow=1,lastPing=0;', "vm.runInContext(source === gym ? floorSource : 'function netFloorHit() {}', ctx); let maxSlow=1,lastPing=0;");
trafficCode = trafficCode.replace('ctx.netTick(1/60,now);', "if (frame % (scenario === 'match' ? 1080 : 180) === 0) { const owned = ctx.NET.ownBall; ctx.NET.ownBall = true; const b = { room: true, floorHit: [4, 0] }; ctx.netFloorHit(b); ctx.netFloorHit(b); ctx.NET.ownBall = owned; } ctx.netTick(1/60,now);");
const trafficContext = { vm, block, gym, floorSource: source('netFloorHit') }; vm.createContext(trafficContext); vm.runInContext(trafficCode, trafficContext);
for (const scenario of ['match', 'continuous']) for (const host of [true, false]) {
  const old = trafficContext.traffic(baseline, host, scenario), current = trafficContext.traffic(gym, host, scenario);
  assert.equal(current.total - old.total, scenario === 'match' ? 10 : 60); assert.equal(current.maxSlow, 1);
  console.log(JSON.stringify({ scenario, host, old, current, changePercent: (current.total / old.total - 1) * 100 }));
}
console.log('WEB-020 passed');
