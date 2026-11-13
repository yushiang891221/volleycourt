const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const gym = fs.readFileSync(path.join(root, 'gym.html'), 'utf8');
const baseline = cp.execFileSync('git', ['show', '10d8768:gym.html'], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
function block(source, start, end) {
  const i = source.indexOf(start), j = source.indexOf(end, i);
  assert(i >= 0 && j > i, start);
  return source.slice(i, j);
}
class Vector {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  clone() { return new Vector(this.x, this.y, this.z); }
  copy(v) { Object.assign(this, { x: v.x, y: v.y, z: v.z }); return this; }
  add(v) { return this.addScaledVector(v, 1); }
  sub(v) { return this.addScaledVector(v, -1); }
  addScaledVector(v, k) { this.x += v.x * k; this.y += v.y * k; this.z += v.z * k; return this; }
  multiplyScalar(k) { this.x *= k; this.y *= k; this.z *= k; return this; }
  lengthSq() { return this.x ** 2 + this.y ** 2 + this.z ** 2; }
  length() { return Math.sqrt(this.lengthSq()); }
  distanceTo(v) { return this.clone().sub(v).length(); }
}
let now = 0;
const ctx = {
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  netLat: () => 0.12, JUMP_G: 8.4, walk: { x: 100, z: 100 }, VB: { ts: 1 },
  toLocalOf: (court, x, z) => [x, z], NETS: { standard: { h: 2.43 } }, state: { net: 'standard', items: [] }, BALL_R: 0.105,
  performance: { now: () => now }, THREE: { Vector3: Vector },
  NET: { peers: new Map(), me: 'self', hitN: 0, hitBy: 'other' }, VM: { on: false },
  normalizeLook: () => null, refreshPeerAppearance() {}, rkPeerAi() {}, recHit() {}, vmOnTouch() {}, vbMarkSet() {},
  balls: [], ballsGroup: { remove() {} }
};
vm.createContext(ctx);
vm.runInContext(block(gym, 'function netSmoothBall(', 'function netBallHit('), ctx);

function peer() { return { id: 'other', x: 0, z: 0, yaw: 0, buf: [] }; }
function play(p, time, dt = 1 / 60) {
  const result = ctx.netPeerPlayback(p, dt, time);
  [p.x, p.z, p.yaw, p.y] = result;
  return result;
}
function trajectory(t) {
  if (t < 2) return { x: t * 3, z: 0, vx: 3, vz: 0, yaw: 0 };
  if (t < 4) return { x: 6, z: (t - 2) * 3, vx: 0, vz: 3, yaw: Math.PI / 2 };
  return { x: 6, z: 6, vx: 0, vz: 0, yaw: Math.PI / 2 };
}
for (const legacy of [false, true]) {
  const p = peer(); let sent = 0, n = 0, maxStep = 0, maxBack = 0, peakX = 0, peakZ = 0;
  for (let time = 0; time < 8000; time += 1000 / 60) {
    if (time >= sent) {
      if (n % 11 !== 7) ctx.netPeerSnapshot(p, { ...trajectory(sent / 1000), tm: legacy ? undefined : +(sent / 1000 + 1234).toFixed(2) }, time);
      sent += 150 + [60, -60, 30, -30, 0][n++ % 5];
    }
    const ox = p.x, oz = p.z;
    play(p, time);
    maxStep = Math.max(maxStep, Math.hypot(p.x - ox, p.z - oz));
    peakX = Math.max(peakX, p.x); peakZ = Math.max(peakZ, p.z);
    maxBack = Math.max(maxBack, peakX - p.x, peakZ - p.z);
    assert(maxBack <= 0.05, `backtrack ${maxBack}`);
    assert(maxStep <= 8 / 60 + 1e-8);
  }
  assert(p.netDelay >= 120 && p.netDelay <= 300);
  assert(p.buf.length <= 30);
  assert(Math.hypot(p.x - 6, p.z - 6) < 0.01);
  console.log(JSON.stringify({ legacy, maxStep, maxBack }));
}
{
  const p = peer();
  ctx.netPeerSnapshot(p, { x: 0, z: 0, yaw: 3.1, tm: 0, vx: 3 }, 0);
  play(p, 0);
  ctx.netPeerSnapshot(p, { x: 0.45, z: 0, yaw: -3.1, tm: 0.15, vx: 3 }, 150);
  assert.equal(ctx.netPeerSnapshot(p, { x: 99, tm: 0.14 }, 160), false);
  assert.equal(ctx.netPeerSnapshot(p, { x: 99, tm: 0.15 }, 170), false);
  for (let t = 16; t < 2000; t += 16) { play(p, t, 0.016); assert(Math.abs(p.yaw) > 3); }
  assert(Math.abs(p.x - 0.49) < 1e-8);
  const held = p.x; play(p, 5000); assert(Math.abs(p.x - held) < 1e-10);
  ctx.netPeerSnapshot(p, { x: 0.45, z: 0, yaw: -3.1, tm: 5 }, 5000);
  play(p, 5016); assert(Math.abs(p.x - held) < 0.05);
  ctx.netPeerSnapshot(p, { x: 20, z: 10, yaw: 0, tm: 6 }, 6000);
  play(p, 6000); assert.equal(p.x, 20); assert.equal(p.z, 10);
}
{
  const p = peer();
  ctx.netPeerSnapshot(p, { x: 0, z: 0, yaw: 0, tm: 0 }, 0);
  ctx.netPeerSnapshot(p, { x: 1, z: 0, yaw: 0, tm: 0.15, jp: { s: 1, vy: 4.7, g: 8.4 } }, 150);
  assert(p.jump); assert.equal(p.x, 1);
  const late = peer();
  ctx.netPeerSnapshot(late, { x: 0, z: 0, yaw: 0, tm: 1, jp: { s: 1, vy: 4.7, g: 8.4 } }, 1000);
  assert(!late.jump);
}
for (const jump of [{ s: 1, vy: 4.7, g: 8.4 }, { s: 1, h: 1.2, T: 1 }]) {
  const p = peer(); ctx.NET.peers.set('other', p);
  now = 0; ctx.netOnMessage('st', { x: 0, z: 0, yaw: 0, tm: 0, jp: { s: 0 }, p: 0 }, 'other');
  now = 150; ctx.netOnMessage('st', { x: 1.2, z: 0.4, yaw: 0, tm: 0.15, jp: jump, p: 9, bs: 0.7 }, 'other');
  assert.equal(p.pose, 9); assert.equal(p.bs, 0.7); assert.equal(p.x, 1.2);
  const originalJump = p.jump;
  let previousY = jump.vy ? jump.vy * 0.12 - 0.5 * jump.g * 0.12 ** 2 : jump.h * Math.sin(Math.PI * 0.12 / jump.T);
  let peak = 0;
  for (let frame = 1; frame <= 90; frame++) {
    const time = 150 + frame * 1000 / 60;
    const active = !!p.jump;
    play(p, time);
    if (active) { assert.equal(p.x, 1.2); assert.equal(p.z, 0.4); }
    assert(Math.abs(p.y - previousY) < 0.09); previousY = p.y; peak = Math.max(peak, p.y);
    if (frame === 10) {
      ctx.netPeerSnapshot(p, { x: 1.2, z: 0.4, y: 0.5, yaw: 0, tm: 0.3, jp: jump }, time);
      assert.equal(p.jump, originalJump);
    }
  }
  const expectedPeak = jump.vy ? jump.vy ** 2 / (2 * jump.g) : jump.h;
  assert(Math.abs(peak - expectedPeak) < 0.01); assert.equal(p.y, 0);
}
function ball(position, velocity = new Vector()) { return { room: true, m: { position }, v: velocity, rest: 0 }; }
{
  const b = ball(new Vector(12.48, 4, 10), new Vector(4, 0, 0)); ctx.balls = [b];
  ctx.netOnMessage('ball', { h: 1, by: 'other', p: [12, 4, 10], v: [-4, 2, 0] }, 'other');
  assert(b.err); assert.equal(b.errTime, 0);
  const initialError = b.err.length(); let previousStep = new Vector(), maxChange = 0, maxCorrection = 0;
  const reference = b.m.position.clone().add(b.err);
  let previousDrawnStep = new Vector(4 / 60, 0, 0), maxDrawnChange = 0;
  for (let frame = 0; frame < 18; frame++) {
    const frameStart = b.m.position.clone();
    b.v.y -= 9.8 / 60;
    reference.addScaledVector(b.v, 1 / 60);
    b.m.position.addScaledVector(b.v, 1 / 60);
    const before = b.m.position.clone();
    if (b.err) ctx.netSmoothBall(b, 1 / 60, []);
    const step = b.m.position.clone().sub(before);
    maxChange = Math.max(maxChange, step.clone().sub(previousStep).length());
    maxCorrection = Math.max(maxCorrection, step.length()); previousStep = step;
    const drawnStep = b.m.position.clone().sub(frameStart);
    maxDrawnChange = Math.max(maxDrawnChange, drawnStep.clone().sub(previousDrawnStep).length());
    previousDrawnStep = drawnStep;
  }
  assert(!b.err || b.err.length() < 0.02);
  assert(maxChange < 0.03); assert(maxCorrection < 0.11);
  assert(b.m.position.distanceTo(reference) < 0.02);
  assert(maxDrawnChange < 0.16); /* Includes the intended reversal of hit velocity. */
  console.log(JSON.stringify({ initialError, maxCorrection, maxChange, maxDrawnChange, errorAfter300ms: b.m.position.distanceTo(reference) }));
  ctx.netOnMessage('ball', { h: 1, by: 'other', n: 1, p: [2, 2, 2], v: [0, 0, 0] }, 'other');
  assert.equal(b.err, null); assert.equal(b.m.position.x, 2);
}
for (const [x, vx] of [[2, 0], [6, -10]]) {
  ctx.walk = { x: 0, z: 0 }; const b = ball(new Vector(x, 2, 0), new Vector(vx, 0, 0)); b.err = new Vector(1, 0, 0);
  ctx.netSmoothBall(b, 1 / 60, []); assert(Math.abs(b.err.x - 5 / 6) < 1e-12);
}
ctx.walk = { x: 100, z: 100 };
ctx.NET.ownBall = true; /* 本機球保留原有穿網保護，遠端球由 WEB-020 驗證。 */
for (const [position, error, snaps] of [
  [new Vector(-0.001, 1, 0), new Vector(1, 0, 0), true],
  [new Vector(-1, 1, 0), new Vector(2, 0, 0), false],
  [new Vector(-0.001, 4, 0), new Vector(1, 0, 0), false],
  [new Vector(-0.001, 1, 6), new Vector(1, 0, 0), false],
  [new Vector(-0.001, 2, 0), new Vector(1, 1000, 0), false]
]) {
  const b = ball(position); b.err = error; ctx.netSmoothBall(b, 1 / 60, [{}]); assert.equal(b.err === null, snaps);
}
/* Use WEB-015's actual netTick/netCount harness, with identical event schedules for both WEB-018 versions. */
const priorTest = fs.readFileSync(path.join(root, 'tools/verify-web015.cjs'), 'utf8');
const trafficCode = block(priorTest, 'function traffic(', "for(const scenario of ['match'")
  .replaceAll('source===gym', 'true');
const trafficContext = { vm, block, gym }; vm.createContext(trafficContext); vm.runInContext(trafficCode, trafficContext);
for (const scenario of ['match', 'continuous']) for (const host of [true, false]) {
  const old = trafficContext.traffic(baseline, host, scenario), current = trafficContext.traffic(gym, host, scenario);
  assert(current.total <= old.total * 1.01); assert.deepEqual(Array.from(current.counts), Array.from(old.counts));
  console.log(JSON.stringify({ scenario, host, old, current, changePercent: (current.total / old.total - 1) * 100 }));
}
assert.equal(block(gym, 'function vmAiSnapshot(', 'function vmRenderAi('), block(baseline, 'function vmAiSnapshot(', 'function vmRenderAi('));
/* Physics integration and collision rules remain byte-identical outside the correction block. */
function withoutCorrection(source) {
  /* WEB-021 的互動入口鎖定由 verify-web021 驗證，保留其餘逐字比較。 */
  source = source.replace(/\n  if \(walk\.emote\?\.keyframes\) return;/g, '');
  /* WEB-023 的單行掛勾（等落地、腳步聲、近身判斷）由 verify-web023 驗證，其餘逐字比較。 */
  source = source.replace(/^.*WEB-023.*\n/gm, '').replaceAll(' b.waitFloor = null;', '');

  /* WEB-020 遠端碰網與落地事件由 verify-web020 驗證，其餘物理仍逐字比較。 */
  const beforeWeb020 = t => t
    .replace("  if (b.langzi && VM.on) return; /* WEB-022 裝飾球排除自由推球。 */\n", '')
    .replace(' b.floorEv = true;', '')
    .replace(/^      if \(b.floorEv\) \{ b.floorEv = false; netFloorHit\(b\); \}\n/gm, '')
    .replace(/^          if \(b.room && !NET.ownBall\) continue;[^\n]*\n/gm, '');
  return beforeWeb020(block(source, 'function updateBalls(', 'const NET =')).replace(/    if \(b.err\)[\s\S]*?(?=    const sp = Math.hypot\(b.v.x)/, '');
}
assert.equal(withoutCorrection(gym), withoutCorrection(baseline));
assert(gym.includes('if (toss) st.ts = 1;')); assert(gym.includes('tm: +(now / 1000).toFixed(2)'));
console.log('WEB-018 passed');
