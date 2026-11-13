const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const gym = fs.readFileSync(path.join(root, 'gym.html'), 'utf8');
const progress = fs.readFileSync(path.join(root, 'progress.js'), 'utf8');
function block(start, end) {
  const a = gym.indexOf(start), b = gym.indexOf(end, a);
  assert(a >= 0 && b > a, start);
  return gym.slice(a, b);
}
let now = 0, team = 0, wall = Infinity;
const sent = [], notices = [];
const context = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  performance: { now: () => now },
  walk: { x: 0, z: 0, yaw: 0, keys: new Set(), off: new Set() },
  VM: { on: false, phase: 'serve', host: true, srvSeq: 1 },
  NET: { on: true, peers: new Map(), tx: { publish: (type, data) => sent.push({ type, data }) } },
  vmMe: () => 'self', vmTeamOf: () => team, vmServer: () => 'self', netLat: () => 0.12,
  window: {}, SETM: {}, skill: {}, targetMark: {}, toast: text => notices.push(text), balls: [],
  blockers: () => Number.isFinite(wall) ? [[wall, -10, wall, 10]] : [],
  solidSegs: () => [], solidBoxes: () => [], RADIUS: 0.25,
  hallBounds: () => ({ x0: -100, x1: 100, z0: -100, z1: 100 }),
};
vm.createContext(context);
vm.runInContext(block('const AVP =', 'function avMix(') + block('function avMix(', '// 左右對調的姿勢') + block('function collide(', 'function updateWalk(') + block('const EMO =', 'const emoTeam =') + block('function netPeerSnapshot(', 'function netOnMessage(') + block('function emoDo(', 'function emoHi5Join(') + block('function emoOnNet(', 'function emoPose('), context);
const run = code => vm.runInContext(code, context);
const sample = (t, dir = 1) => context.emoKeySample('shanshen', t, dir);
const close = (a, b, epsilon = 1e-8) => assert(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const reset = () => {
  now = 0; wall = Infinity; team = 0; sent.length = notices.length = 0;
  Object.assign(context.walk, { x: 0, z: 0, yaw: 0, emote: null, serve: null, jserve: null, dive: null, down: 0, air: null });
  context.walk.keys.clear(); context.VM.on = false; context.VM.phase = 'serve'; context.balls.length = 0;
  context.NET.peers.clear(); run('EMO.nextDir = null; EMO.tossLock = null');
};

close(context.emoKeyDuration('shanshen'), 0.97);
const frames = run('EMO_KEYS.shanshen');
assert(frames[3].dt + frames[4].dt < Math.min(frames[1].dt, frames[2].dt, frames[5].dt, frames[6].dt));
for (const t of [0, .15, .4, .45, .52, .67, .97]) {
  const a = sample(Math.max(0, t - 1e-7)), b = sample(t + 1e-7);
  close(a.move[0], b.move[0], 1e-5);
  a.pose.sh.flat().forEach((v, i) => close(v, b.pose.sh.flat()[i], 1e-5));
}
for (let t = 0; t <= 1.1; t += .007) {
  const right = sample(t), left = sample(t, -1);
  close(right.move[0], -left.move[0]); close(right.pose.tw, -left.pose.tw);
  for (const field of ['sh', 'el', 'hip', 'kn', 'hab', 'shy']) assert.equal(JSON.stringify(left.pose[field]), JSON.stringify([right.pose[field][1], right.pose[field][0]]));
}
close(sample(.4).move[0], 0); close(sample(.52).move[0], .7);
assert(sample(.45).pose.hab.every(v => v < 0));
sample(1).pose.sh.flat().forEach((value, i) => close(value, run('AVP.idle.sh').flat()[i]));
assert(sample(1).done);
console.log('PASS 關鍵格時間、緩動連續、鏡像、交叉腿、收回站姿');

reset();
assert.equal(context.emoKeyDirection(), 1); assert.equal(context.emoKeyDirection(), -1);
context.walk.keys.add('arrowright'); assert.equal(context.emoKeyDirection(), 1);
context.walk.keys.clear(); context.walk.keys.add('a'); assert.equal(context.emoKeyDirection(), -1);
context.walk.keys.clear(); assert.equal(context.emoKeyDirection(), 1);
for (const yaw of [0, Math.PI / 2, -.7]) for (const dir of [-1, 1]) {
  const p = context.emoKeyPosition({ k: 'shanshen', x: 3, z: 4, yaw, dir }, 1);
  close(p[0], 3 + .7 * dir * Math.cos(yaw)); close(p[1], 4 - .7 * dir * Math.sin(yaw));
}
wall = .6;
for (const time of [.45, .52, .97, 4]) {
  const p = context.emoKeyPosition({ k: 'shanshen', x: 0, z: 0, yaw: 0, dir: 1 }, time);
  assert(p[0] <= wall - context.RADIUS + 1e-8); assert(p[0] >= 0);
}
context.solidBoxes = () => [{ w: .1, d: 2 }];
context.sizeOf = box => box;
context.toLocalOf = (box, x, z) => [x - .5, z];
context.toWorldOf = (box, x, z) => [x + .5, z]; wall = Infinity;
assert(context.emoKeyPosition({ k: 'shanshen', x: 0, z: 0, yaw: 0, dir: 1 }, 1)[0] <= .25 + 1e-8);
context.solidBoxes = () => [];
console.log('PASS 方向鍵、左右交替、角色面向、真實碰撞函式阻擋牆／網與物件');

reset(); context.VM.on = true;
assert.equal(context.emoKeyBlocked('self'), false);
for (const key of ['serve', 'jserve']) {
  context.walk[key] = {}; assert(context.emoKeyBlocked('self'));
  context.emoKeyStart('shanshen'); assert.equal(context.walk.emote, null);
  assert.equal(notices.at(-1), '發球後到死球前不能用');
  context.walk[key] = null; context.VM.phase = 'point'; assert.equal(context.emoKeyBlocked('self'), false);
  context.VM.phase = 'serve';
}
context.VM.phase = 'rally'; assert(context.emoKeyBlocked('self'));
team = -1; assert.equal(context.emoKeyBlocked('spectator'), false);
context.emoKeyStart('shanshen'); assert(context.walk.emote); context.walk.emote = null;
team = 0; context.VM.on = false; assert.equal(context.emoKeyBlocked('self'), false);
context.emoKeyStart('shanshen'); now = 460; context.emoKeyWalk(); const stopped = context.walk.x;
context.VM.on = true; context.emoKeyWalk(); assert.equal(context.walk.emote, null); close(context.walk.x, stopped);
reset(); context.VM.on = true; context.emoKeyStart('shanshen'); context.VM.host = false; context.VM.srvId = 'other';
context.NET.peers.set('other', { tossing: true }); context.emoKeyWalk(); assert.equal(context.walk.emote, null);
context.NET.peers.get('other').tossing = false; assert(context.emoKeyBlocked('self'));
context.VM.phase = 'point'; assert.equal(context.emoKeyBlocked('self'), false); context.VM.host = true;
reset(); context.emoKeyStart('shanshen'); context.balls.push({ rest: 0, m: { position: { x: 0, y: 1, z: 0 } } });
context.emoKeyWalk(); assert.equal(context.walk.emote, null);
console.log('PASS 發球／拋球鎖定、死球／等待／觀眾／練習可用、開賽與來球中斷');

reset(); context.emoDo('shanshen');
assert.equal(sent.length, 1); assert.equal(sent[0].type, 'emo');
const event = sent[0].data;
const peer = { id: 'other', x: 99, z: 99, yaw: 1, buf: [], last: { t: 0, x: 99, z: 99, yaw: 1, y: 0 } };
context.NET.peers.set('other', peer); now = 120;
context.emoOnNet({ ...event, id: 'spoof' }, 'other');
let maxError = 0;
for (now = 120; now <= 1000; now += 10) {
  context.emoKeyWalk();
  const p = context.netPeerPlayback(peer, .01, now);
  [peer.x, peer.z, peer.yaw, peer.y] = p;
  maxError = Math.max(maxError, Math.hypot(peer.x - context.walk.x, peer.z - context.walk.z));
}
assert(maxError < .05); close(context.walk.x, .7); close(peer.x, .7);
assert.equal(sent.length, 1); assert.equal(peer.keyEmote, null); assert.equal(context.walk.emote, null);
assert(peer.buf.every(row => row.x < 1));
assert.equal(context.netPeerSnapshot(peer, { tm: .98, x: .3, z: 0, yaw: 0 }, 1000), false);
assert(context.netPeerSnapshot(peer, { tm: 1.2, x: .7, z: 0, yaw: 0 }, 1220));
console.log(`PASS 單一 emo、120 ms 延遲、跳過 WEB-018 緩衝、收尾同步，最大誤差 ${maxError} m`);

for (const name of ['passToFacing', 'hitWorldBall', 'doInteract', 'vmFreeBall', 'throwBall', 'skillPress', 'startSpike', 'startServe', 'startJumpServe', 'vbJump', 'vbAttack', 'vbChargeStart', 'vbReceive', 'vbDive', 'vbSet']) {
  const start = gym.indexOf(`function ${name}(`), end = gym.indexOf('\n}', start) + 2;
  const ctx = { walk: { emote: { keyframes: true } } }; vm.createContext(ctx);
  vm.runInContext(gym.slice(start, end), ctx); ctx[name]();
}
assert.match(block('function updateWalk(', '// ---------------------------------------------------------------- 導覽互動'), /if \(keyMoving\) \{ vx = vz = 0/);
assert.match(block('function myAvPose(', 'function tpBegin('), /emoKeySample/);
const progressContext = {};
vm.runInNewContext(progress.slice(progress.indexOf('export const EMOTES'), progress.indexOf('// 戰績分類')).replaceAll('export ', '') + '\nthis.entries = EMOTES; this.unlocked = emoteUnlocked; this.wheel = DEFAULT_WHEEL;', progressContext);
assert(progressContext.unlocked('shanshen', null)); assert(/^[a-z0-9]{1,12}$/.test('shanshen'));
assert.equal(progressContext.entries.shanshen.name, '閃身步'); assert.equal(JSON.stringify(progressContext.wheel), '["hi5","taunt"]');
console.log('PASS 操作入口阻擋、鏡頭移動、免費解鎖與預設輪盤');
/* 所有表情動作 × 往右／往左 × 從頭到尾每 0.02 秒抽樣：不能出錯、數值都要是正常數字（2026-11-14 狗熊哆嗦毛往左跳時讀到空欄位當掉過） */
{
  const keys = run('Object.keys(EMO_KEYS)'); assert(keys.length >= 3);
  const bad = (v) => (typeof v === 'number' ? !Number.isFinite(v) : Array.isArray(v) ? v.some(bad) : false);
  for (const k of keys) {
    const total = context.emoKeyDuration(k);
    for (const dir of [1, -1]) for (let t = 0; t <= total + 0.05; t += 0.02) {
      const s = context.emoKeySample(k, t, dir);
      for (const f of ['sh', 'el', 'hip', 'kn', 'hab', 'shy', 'ankle', 'head', 'tw', 'lean', 'sp']) assert(s.pose[f] !== undefined && !bad(s.pose[f]), `${k} dir=${dir} t=${t.toFixed(2)} 的 ${f} 不正常`);
      assert(!bad(s.move), `${k} 的位移不正常`);
    }
  }
  console.log('PASS 所有表情動作往右、往左整段抽樣都正常：' + keys.join('、'));
}
console.log('WEB-021 passed');
