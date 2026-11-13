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


function source(name) {
  let start = gym.indexOf('function ' + name + '(');
  if (gym.slice(start - 6, start) === 'async ') start -= 6;
  assert(start >= 0, name);
  const lines = gym.slice(start).split('\n');
  for (let count = 1; count < lines.length; count++) {
    const body = lines.slice(0, count).join('\n');
    try { new vm.Script(body); return body; } catch (_) { /* 等待完整函式。 */ }
  }
  throw Error(name);
}
class Vector {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  toArray() { return [this.x, this.y, this.z]; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  distanceTo(p) { return Math.hypot(this.x-p.x, this.y-p.y, this.z-p.z); }
}
let practice = false;
Object.assign(context, { THREE: { Vector3: Vector }, BALL_R: .105, MREC: { id: 'test-match', local: {} }, vmIsPractice: () => practice, newBallMesh: () => ({ position: new Vector(), userData: {} }), ballsGroup: { add() {}, remove() {} }, VB: {} });
Object.assign(context.NET, { me: 'self', hitN: 7, hitBy: 'self' });
for (const name of ['netBallHit', 'netBallMsg', 'netOnMessage', 'vmOnTouch', 'vmClearBalls', 'vmPrepServe', 'vbBlockTest', 'vmJudge', 'vmStatePayload', 'vbOwnSide', 'hitWorldBall']) vm.runInContext(source(name), context);
const frames = run('EMO_KEYS.langzi'), kicks = frames.filter(f => f.kick != null);
close(context.emoKeyDuration('langzi'), 1.8);
assert.deepEqual(Array.from(kicks, f => f.kick), [0, 1]);
assert(kicks.every(f => f.dt < frames[2].dt / 3));
assert(frames.every(f => f.move.every(v => v === 0)));
assert(kicks.every(f => f.pose.ankle[f.kick] < -.6));
assert(kicks[0].pose.head[1] < 0 && kicks[1].pose.head[1] > 0);
assert(frames[3].pose.sh[0][0] < 0 && frames[3].pose.sh[1][0] > 0);
const end = context.emoKeySample('langzi', 2).pose;
close(end.head[0], 0); close(end.head[1], 0); close(end.lean, 0);
end.hip.forEach((v,i)=>close(v,run('AVP.idle.hip')[i]));
function setup(match = false) {
  reset(); practice = false; context.VM.on = match; context.VM.host = true; context.VM.phase = 'point'; context.VM.srvSeq = 2;
  context.MREC.id = 'test-match'; context.MREC.local = {}; context.NET.kickSeen = new Set(); context.NET.hitN = 7; context.NET.hitBy = 'self';
  context.emoDo('langzi'); return context.walk.emote;
}
function ballAt(event, index = 0) {
  const foot = context.langziFoot(event, kicks[index]);
  const b = { m: { position: new Vector(foot.x, .105, foot.z), userData: {} }, v: new Vector(), rest: 3, room: true };
  context.balls.push(b); return b;
}
for (const [index, time] of [[0, .79], [1, 1.25]]) {
  const event = setup(true); event.yaw = .7; const b = ballAt(event, index);
  if (index) context.langziStep(event, .8);
  context.langziStep(event, time + 1e-6);
  assert(event.kicked); assert(b.v.length() >= 7 && b.v.length() <= 10);
  const angle = Math.asin(b.v.y/b.v.length()) * 180/Math.PI; assert(angle >= 25 && angle <= 40);
  const foot = context.langziFoot(event, kicks[index]);
  assert((foot.dx*b.v.x+foot.dz*b.v.z)/Math.hypot(foot.dx,foot.dz)/Math.hypot(b.v.x,b.v.z) > .99);
  close(context.walk.x, 0); close(context.walk.z, 0);
  assert.equal(context.MREC.local.lk, 1);
  ballAt(event, 1); context.langziStep(event, 2); assert.equal(context.MREC.local.lk, 1);
  assert.deepEqual(sent.map(x=>x.type), ['emo', 'ball']); assert.equal(sent[1].data.w, 'kick');
}
for (const change of [b=>b.m.position.x+=3, b=>b.v.x=1.5, b=>b.m.position.y=.5]) {
  const e=setup(); const b=ballAt(e); change(b); context.langziStep(e, 2); assert(!e.kicked); assert.equal(sent.length, 1);
}
{
  const e=setup(); context.langziStep(e, .8); ballAt(e); context.langziStep(e, .9); assert(!e.kicked);
  context.langziStep(e, 1.26); assert(!e.kicked); /* 第二腳在另一個接觸點。 */
}
for (const phase of ['serve','point']) { setup(true); context.VM.phase=phase; assert(context.langziCanKick()); }
for (const action of ['serve','jserve']) { setup(true); context.VM.phase='serve'; context.walk[action]={}; assert(!context.langziCanKick()); context.emoKeyWalk(); assert.equal(context.walk.emote,null); }
setup(true); context.VM.phase='rally'; assert(!context.langziCanKick()); context.emoKeyWalk(); assert.equal(context.walk.emote,null);
{
  const e=setup(true); practice=true; const b=ballAt(e); context.langziStep(e, .8); assert(e.kicked); assert.equal(context.MREC.local.lk,undefined);
}
{
  const e=setup(true), b=ballAt(e); context.VM.ball=b; context.langziStep(e,.8);
  const message=JSON.parse(JSON.stringify(sent.at(-1).data));
  assert.equal(context.VM.ball,null); assert.equal(b.room,false);
  assert.equal(context.vbOwnSide(b),false); context.hitWorldBall(b,'set'); context.vmOnTouch(b,'self','kick'); context.vbBlockTest(b,.016); context.vmJudge();
  const seq=context.NET.hitN, owner=context.NET.hitBy;
  context.balls.length=0; context.NET.me='receiver'; const original=ballAt(e); context.VM.ball=original;
  context.netOnMessage('ball',message,'self');
  assert.equal(context.balls.length,1); assert.equal(context.balls[0],original); assert.equal(context.VM.ball,null);
  assert.equal(context.NET.hitN,seq); assert.equal(context.NET.hitBy,owner);
  message.v.forEach((v,i)=>close(original.v.toArray()[i],v));
  context.netOnMessage('ball',message,'self'); assert.equal(context.balls.length,1);
  context.netOnMessage('ball',{h:seq,by:owner,p:[0,.105,0],v:[0,0,0]},'self'); assert.equal(context.balls.length,1); assert(original.v.length()>7);
  context.vmClearBalls(); assert.equal(context.balls.length,0);
  context.VM.srvSeq++; context.netOnMessage('ball',{...message,kid:message.kid+'late'},'self'); assert.equal(context.balls.length,0);
  context.VM.phase='rally'; context.netOnMessage('ball',{...message,kid:message.kid+'rally'},'self'); assert.equal(context.balls.length,0);
  context.NET.me='self';
}
{
  setup(true); context.VM.host=false; context.VM.langziMatch='test-match'; context.VM.langziSeq=22; context.VM.srvId='server'; context.MREC.id='';
  const e=context.walk.emote; ballAt(e); context.langziStep(e,.8); assert.equal(context.MREC.local.lk,1);
  assert.equal(sent.at(-1).data.match,'test-match'); assert.equal(sent.at(-1).data.seq,22);
}
{
  setup(true); context.vmW=(x,z)=>[x,z]; context.vbClearAir=()=>{}; context.grabBall=()=>{context.walk.hold={};};
  context.camera={remove(){}}; context.vmPrepServe(1); assert(context.walk.hold); assert.equal(context.walk.emote,null);
}
vm.runInContext(progress.slice(0, progress.indexOf('export function myTitle')).replaceAll('export ', ''), context);
assert(run("emoteUnlocked('langzi', {})")); assert(/^[a-z0-9]{1,12}$/.test('langzi'));
assert.equal(run("achVisible(ACHIEVEMENTS.langzi, false).name"),'???');
assert.equal(run("achVisible(ACHIEVEMENTS.langzi, false).desc"),'隱藏成就');
assert.equal(run("achVisible(ACHIEVEMENTS.langzi, true).name"),'花鼓燈浪子');
assert.equal(run("ACH_SERIES.find(s=>s.id==='langzi').cat"),'special');
const panel=fs.readFileSync(path.join(root,'character-panel.js'),'utf8'); assert(panel.includes('P.achVisible(P.ACHIEVEMENTS[k], t.ok)'));
const profile=fs.readFileSync(path.join(root,'public-profile.js'),'utf8'); assert(profile.includes('P.ACHIEVEMENTS[id].name')); assert(profile.includes('data.achievements || []'));
const baseSql=fs.readFileSync(path.join(root,'server/supabase/012_role_wins.sql'),'utf8');
const sql=fs.readFileSync(path.join(root,'server/supabase/014_langzi.sql'),'utf8');
const line="  if (p_perf->>'lk')::int >= 1 and not 'langzi' = any(ach) then got := array_append(got, 'langzi'); end if;\n";
assert(sql.includes(line)); assert.equal(sql.replace(line,''),baseSql);
/* 將唯一新增的 SQL 條件轉譯，驗證有值、缺省與已解鎖情況，資料庫不連線。 */
const condition=line.match(/if (.*?) then/)[1].replace("(p_perf->>'lk')::int",'lk').replace("not 'langzi' = any(ach)","!ach.includes('langzi')").replace(' and ',' && ');
const unlock=new Function('lk','ach','return '+condition);
assert(unlock(1,[])); assert(!unlock(0,[])); assert(!unlock(undefined,[])); assert(!unlock(1,['langzi']));
assert(source('vmGotResult').includes('if (MREC.local.lk > 0) perf.lk = MREC.local.lk;'));
assert(source('vmGotResult').indexOf('vmIsPractice()') < source('vmGotResult').indexOf('perf.lk'));
console.log('WEB-022 passed — 動作／時機／兩腳判定／球速方向／單次訊息／遠端同球／過期訊息／發球給球／隱藏成就／SQL 單行差異');

/* 執行正式結算組裝段落，截在 UI 與 RPC 前檢查 perf。 */
const resultSource=source('vmGotResult'), stop=resultSource.indexOf('  const MR =');
vm.runInContext(resultSource.slice(0,stop)+'  return perf;\n}',context);
(async()=>{
  practice=false; const d={id:'test-match',sc:[25,20],team:[['self'],['other']],perf:{}};
  for(const count of [0,1,3]) {
    context.MREC.local={p:0,sets:{},lk:count};
    const perf=await context.vmGotResult(d);
    if(count) assert.equal(perf.lk,count); else assert(!Object.hasOwn(perf,'lk'));
    assert.equal(context.MREC.local.lk,undefined);
  }
  practice=true; context.MREC.local={p:0,sets:{},lk:1}; assert.equal(await context.vmGotResult(d),undefined);
  console.log('PASS 正式結算 perf.lk，0 不送、正數送、練習不送');
})().catch(error=>{console.error(error);process.exitCode=1;});
