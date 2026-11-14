// WEB-023：加入者的腳步聲、落點提示用真正位置、別人負責的球先落地停住等回報、近身快速修正只在球朝自己來時
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const gym = fs.readFileSync(path.join(__dirname, '..', 'gym.html'), 'utf8').replaceAll('\r\n', '\n');
function source(name) {
  const i = gym.indexOf(`function ${name}(`); assert(i >= 0, `找不到 ${name}`);
  let depth = 0, j = gym.indexOf('{', i);
  for (; j < gym.length; j++) { if (gym[j] === '{') depth++; else if (gym[j] === '}' && --depth === 0) break; }
  return gym.slice(i, j + 1);
}
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(o) { this.x += o.x; this.y += o.y; this.z += o.z; return this; }
  sub(o) { this.x -= o.x; this.y -= o.y; this.z -= o.z; return this; }
  copy(o) { return this.set(o.x, o.y, o.z); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  distanceTo(o) { return this.clone().sub(o).length(); }
  toArray() { return [this.x, this.y, this.z]; }
}
let now = 0; const sounds = [];
const ctx = vm.createContext({ Math, THREE: { Vector3: V3 }, performance: { now: () => now }, NET: { on: true, ownBall: false }, sfx: (k, q, p) => sounds.push([k, p]) });
for (const n of ['sqFromMotion', 'ballWaitFloor', 'vbTruePos']) vm.runInContext(source(n), ctx);

/* 1. 腳步聲：照畫面上的移動，急停會吱一聲；穩定跑、站著不動、瞬移都不吱 */
{
  const o = {}, dt = 1 / 60; let x = 0;
  for (let i = 0; i < 60; i++) { now += 1000 / 60; x += 4 * dt; ctx.sqFromMotion(o, x, 0, 0, dt); }
  assert.equal(sounds.length, 0, '穩定跑步不該吱');
  for (let i = 0; i < 20; i++) { now += 1000 / 60; ctx.sqFromMotion(o, x, 0, 0, dt); }
  assert.equal(sounds.length, 1, '急停要吱一聲');
  for (let i = 0; i < 60; i++) { now += 1000 / 60; ctx.sqFromMotion(o, x, 0, 0, dt); }
  assert.equal(sounds.length, 1, '站著不動不吱');
  now += 1000 / 60; ctx.sqFromMotion(o, x + 5, 0, 0, dt);
  assert.equal(sounds.length, 1, '瞬移不算');
  const air = {}; let ax = 0;
  for (let i = 0; i < 60; i++) { now += 1000 / 60; ax += 4 * dt; ctx.sqFromMotion(air, ax, 0, 1, dt); }
  for (let i = 0; i < 20; i++) { now += 1000 / 60; ctx.sqFromMotion(air, ax, 0, 1, dt); }
  assert.equal(sounds.length, 1, '在空中不吱');
  assert(/sqFromMotion\(p2, x, z, y, dt\)/.test(gym), '別的真人要接上腳步聲');
  assert(/if \(!VM\.host\) sqFromMotion\(a, x, z, a\.y, dt\)/.test(gym), '加入者看到的 AI 要接上腳步聲');
}

/* 2. 落點提示：用校正完成後的位置預測 */
{
  const b = { m: { position: new V3(1, 2, 3) }, err: new V3(0.5, 0, -1) };
  const p = ctx.vbTruePos(b); assert.deepEqual([p.x, p.y, p.z], [1.5, 2, 2]);
  assert.deepEqual([b.m.position.x, b.m.position.z], [1, 3], '不能改到原本的位置');
  b.err = null; assert.equal(ctx.vbTruePos(b), b.m.position);
  for (const s of ['vbPredict(bp, b.v, 0.8)', 'vbPredict(vbTruePos(t.b), t.b.v, BALL_R)', "vbPredict(vbTruePos(VB.target.b), VB.target.b.v, 0.8)", "vbPredict(vbTruePos(b), b.v, cy + 0.3)"]) assert(gym.includes(s), `落點／時機圈要用真正位置：${s}`);
  assert(gym.includes('(keep ? 4.3 : 3.5)') && gym.includes('(keep ? 4.2 : 3.5)'), '已經在提示的球要放寬門檻');
  assert(gym.includes('VM.remoteSetters?.[myT] === vmMe()'), '加入者的舉球時機圈要用同步來的舉球員');
}

/* 3. 別人負責的球先落地：停住等回報，0.5 秒沒回報照本機彈起來；收到回報就解除 */
{
  ctx.NET.ownBall = false; now = 10000;
  const b = { room: true, floorReport: null, waitFloor: { t: now, v: new V3(2, -6, 1) }, v: new V3(0, 0, 0) };
  now += 300; assert.equal(ctx.ballWaitFloor(b), true, '0.3 秒內還在等'); assert.deepEqual([b.v.x, b.v.y], [0, 0]);
  now += 250; assert.equal(ctx.ballWaitFloor(b), false, '超過 0.5 秒放開');
  assert.equal(b.waitFloor, null); assert(Math.abs(b.v.y - 3.72) < 1e-9 && Math.abs(b.v.x - 1.76) < 1e-9, '照本機結果彈起來');
  const r = { room: true, floorReport: true, waitFloor: { t: now, v: new V3(0, -5, 0) }, v: new V3(1, -5, 0) };
  assert.equal(ctx.ballWaitFloor(r), false, '收到回報就不等'); assert.deepEqual([r.v.x, r.v.y], [1, -5], '回報的速度不能被蓋掉');
  ctx.NET.ownBall = true; const mine = { room: true, waitFloor: { t: now, v: new V3() }, v: new V3() };
  assert.equal(ctx.ballWaitFloor(mine), false, '自己負責的球不等');
  assert(gym.includes('if (b.waitFloor && ballWaitFloor(b)) continue;'), '球的更新要接上等落地');
  assert(/NET\.on && b\.room && !NET\.ownBall && !b\.floorReport && !b\.waitFloor && b\.v\.y < 0\) \{ p\.y = BALL_R; b\.waitFloor = /.test(gym), '落地那一刻開始等');
  assert(gym.includes('b.floorReport = true; b.floorT = performance.now(); b.waitFloor = null;'), '收到落地回報要解除等待');
  assert(gym.includes('b.floorEv = false; b.waitFloor = null; }'), '新擊球要解除等待');
}

/* 4. 近身快速修正：只有球朝自己來（或幾乎不動）才算 */
{
  assert(gym.includes('const coming = dx * b.v.x + dz * b.v.z < 0 || speed2 < 1;'));
  assert(gym.includes('const near = (Math.hypot(dx, dz) <= 3 && coming) ||'));
}

/* 5. 不增加任何網路訊息：新加的程式裡沒有 publish */
for (const n of ['sqFromMotion', 'ballWaitFloor', 'vbTruePos']) assert(!/publish|NET\.tx/.test(source(n)), `${n} 不能送訊息`);
console.log('WEB-023 passed — 腳步聲／落點與時機圈用真正位置／先落地停住等回報／近身判斷／不加訊息');

// Exercise real incoming packets, including duplicate delivery and the
// client-side setter target that depends on the active match ball.
{
  const hits = [], audio = [], sent = [];
  const ball = { room: true, m: { position: new V3(0, 3, 0) }, v: new V3() };
  const env = {
    THREE: { Vector3: V3 }, Math, Number, Array, console,
    performance: { now: () => 1000 }, BALL_R: .105,
    NET: { me: 'client', hitN: 0, hitBy: 'host', ownBall: false, on: true,
      peers: new Map([['host', {}]]), tx: { publish: (...args) => sent.push(args) } },
    VM: { on: true, host: false, hostId: 'host', phase: 'rally', tc: [0, 1], remoteSetters: ['client'] },
    VB: { ts: 1 }, balls: [ball], state: { items: [] },
    roomSpectator: () => false, vmTeamOf: () => 0, netLat: () => 0,
    recHit: () => {}, vmOnTouch: () => {}, vbMarkSet: () => {},
    vbImpact: (b, kind) => hits.push(kind), sfx: kind => audio.push(kind),
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    vmMe: () => 'client', vmBallL: b => { assert.equal(b, ball); return {}; },
    vmPredL: () => ({ x: 2, z: 1 }), vmSide: () => 1, vmW: (x, z) => [x, z]
  };
  vm.createContext(env);
  for (const name of ['netOnMessage', 'vmPassRing', 'netBallSound']) vm.runInContext(source(name), env);
  const packet = { h: 1, by: 'host', w: 'bump', p: [0, 3, 0], v: [1, 2, 0] };
  env.netOnMessage('ball', packet, 'host');
  assert.equal(env.VM.ball, ball);
  assert.deepEqual(hits, ['bump']);
  assert.equal(env.vmPassRing().x, 2, '客戶端舉球員看到一傳目標圈');
  env.netOnMessage('ball', packet, 'host');
  assert.equal(hits.length, 1, '重送擊球不重播');
  env.netBallSound(ball, 'floor', 1, ball.m.position);
  assert.equal(audio.length, 0, '接收端預測碰撞不自行播音');
  const sound = { seq: 1, kind: 'floor', q: 1, p: [0, .105, 0] };
  env.netOnMessage('ball-sound', sound, 'host');
  env.netOnMessage('ball-sound', sound, 'host');
  assert.deepEqual(audio, ['floor']);
  env.NET.ownBall = true;
  env.netBallSound(ball, 'net', .8, ball.m.position);
  assert.equal(sent[0][0], 'ball-sound');
  assert.deepEqual(audio, ['floor', 'net']);
}
console.log('PASS 客戶端比賽球參照／一傳提示圈／擊球音效去重／碰撞音效同步');
