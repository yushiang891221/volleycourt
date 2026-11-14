const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), cp = require('node:child_process');
const path = require('node:path'), root = path.resolve(__dirname, '..');
const gym = fs.readFileSync(path.join(root, 'gym.html'), 'utf8');
const baseline = cp.execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\','/')}`, 'show', '72bf138:gym.html'], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
const block = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));
const c = { clamp: (v,l,h) => Math.max(l,Math.min(h,v)), netLat: () => 0.1, VM: { hostId:'host' } };
vm.createContext(c); vm.runInContext(block(gym,'function vmAiSnapshot(', 'function vmRenderAi('), c);
let a = {}, x = 0, z = 0, next = 0, n = 0, maxStep = 0;
for (let now = 0; now < 20000; now += 1000/60) {
  if (now >= next) {
    if (n % 11 !== 7) c.vmAiSnapshot(a, ['ai', next/1000*3, 0, 0, n<10?4:9, .8, .2, null, next/1000], now);
    next += 150 + [60,-60,30,-30,0][n++%5];
  }
  const [nx,nz] = c.vmAiPlayback(a,1/60,now,x,z);
  maxStep = Math.max(maxStep, Math.hypot(nx-x,nz-z));
  assert(nx >= x-1e-8, `backwards ${now}: ${nx-x}`); assert(Math.hypot(nx-x,nz-z)<=8/60+1e-8);
  x=nx;z=nz;
}
assert(a.netBuf.length < 12); assert(a.netDelay>=120 && a.netDelay<=300);
const stopped = c.vmAiPlayback(a,1/60,30000,x,z);
let held=stopped;
for(let i=0;i<300;i++)held=c.vmAiPlayback(a,1/60,30000+i*1000/60,...held);
const held2=c.vmAiPlayback(a,1/60,36000,...held);assert(Math.hypot(held2[0]-held[0],held2[1]-held[1])<1e-8);
c.vmAiSnapshot(a,['ai',100,0,0,2,1,0,null,40],40000);
const tele=c.vmAiPlayback(a,1/60,41000,...held2);assert(tele[0]>=100);
for(const down of [1,.6]) {
  a={};const j={s:1,vy:4.7,g:8.4,down,t:0};
  c.vmAiSnapshot(a,['ai',0,0,0,5,1,0,j,0],0);
  let peak=0,prev=0,hostY=0,hostV=j.vy,hostPeak=0;
  for(let i=0;i<100;i++) {hostV-=j.g*(hostV<0?down:1)/60;hostY=Math.max(0,hostY+hostV/60);hostPeak=Math.max(hostPeak,hostY);}
  for(let i=0;i<100;i++) {
    c.vmAiPlayback(a,1/60,i*1000/60,0,0);peak=Math.max(peak,a.y);
    if(i)assert(Math.abs(a.y-prev)<.1);prev=a.y;
    if(i===30)c.vmAiSnapshot(a,['ai',0,0,0,5,1,0,j,.5],500);
    if(i===12){const age=a.netJump.age;c.vmAiSnapshot(a,['ai',0,0,99,5,1,0,j,.2],200);assert.equal(a.netJump.age,age);}
  }
  assert(Math.abs(peak-hostPeak)<.1,`peak error ${peak-hostPeak}`);
  console.log(`jump down=${down}: peak error ${(peak-hostPeak).toFixed(4)} m`);
}

/* Exercise the actual host event and wire payload, including reduced descent gravity. */
const hostContext = { VM:{host:true,on:true,six:true,role:{ai:'MB'},t:4,ai:new Map(),phase:'rally',touch:{team:-1}}, NET:{on:true}, JUMP_G:8.4, aiPay:()=>.8, vmPro:()=>true, vmW:(x,z)=>[x,z], vmServer:()=> 'host' };
vm.createContext(hostContext);
hostContext.balls = [];
// Spectators hold the last authoritative position during packet gaps and
// never interpolate across a new service round.
class WatchVector {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  lerp(other, f) { this.x += (other.x - this.x) * f; this.y += (other.y - this.y) * f; this.z += (other.z - this.z) * f; return this; }
}
let watchNow = 1225;
const watchContext = {
  VM: { watchOffset: 0, watchFrames: [
    { t: 0.9, ball: [0, 2, 0], rally: 1 },
    { t: 1.1, ball: [2, 1, 0], rally: 1 }
  ] },
  performance: { now: () => watchNow },
  THREE: { Vector3: WatchVector }, clamp: c.clamp
};
vm.createContext(watchContext);
vm.runInContext(block(gym, 'function vmWatchBallFrame(', '// 比賽有事'), watchContext);
const watchedBall = { m: { position: new WatchVector(), visible: true } };
watchContext.vmWatchBallFrame(watchedBall);
assert(Math.abs(watchedBall.m.position.x - 1) < 1e-8);
assert(Math.abs(watchedBall.m.position.y - 1.5) < 1e-8);
watchNow = 10000;
watchContext.vmWatchBallFrame(watchedBall);
assert.equal(watchedBall.m.position.y, 1, '封包中斷時不自行落地或反彈');
watchContext.VM.watchFrames[1].rally = 2;
watchNow = 1225;
watchContext.vmWatchBallFrame(watchedBall);
assert.equal(watchedBall.m.position.x, 0, '不同發球回合不拉出跨場球路');
watchContext.VM.watchFrames[0].ball = null;
watchContext.vmWatchBallFrame(watchedBall);
assert.equal(watchedBall.m.visible, false);
vm.runInContext(block(gym,'function aiJump(', 'function vmAiTouch(')+block(gym,'function vmStatePayload(', '// 比賽有事'),hostContext);
const hostAi={id:'ai',x:1,z:2,y:0,vy:0,pose:5,swingT:.4,sta:.8};hostContext.VM.ai.set('ai',hostAi);
const speed=hostContext.aiJump(hostAi,4.7,'jump');assert.equal(speed,4.7*(.4+.6*.8));assert.equal(hostAi.jp.s,1);assert.equal(hostAi.jp.down,.6);assert(hostContext.NET.forceSt);
const row=hostContext.vmStatePayload().ai[0];assert.deepEqual(Array.from(row.slice(0,7)),['ai',1,2,0,5,.8,0]);assert.equal(row[7].s,1);assert.equal(row[8],4);
hostAi.vy=speed;hostContext.NET.forceSt=false;hostContext.aiJump(hostAi,4,'jump');assert.equal(hostAi.jp.s,1);assert.equal(hostContext.NET.forceSt,false);
hostAi.vy=0;hostContext.aiJump(hostAi,4,'jump');assert.equal(hostAi.jp.s,2);
const remote={};c.vmAiSnapshot(remote,row,1000);const age=remote.netJump.age;c.vmAiSnapshot(remote,row,1100);assert.equal(remote.netBuf.length,1);assert.equal(remote.netJump.age,age);
c.vmAiPlayback(remote,1/60,1000,1,2);assert.equal(remote.poseC,5);const poseT=remote.poseT;c.vmAiPlayback(remote,1/60,1017,1,2);assert(remote.poseT>poseT);
c.vmAiSnapshot(remote,['ai',1,2,0,9,.8,0,null,4.4],1400);c.vmAiPlayback(remote,1/60,1800,1,2);assert.equal(remote.poseC,9);assert.equal(remote.poseT,1/60);

function traffic(source, host, scenario) {
  let now=0;const counts=[0,0,0],types={}, q={ts:[],slow:1,warned:false,sent:0};
  const ctx={ performance:{now:()=>now},console:{info(){}}, NETQ:q, VM:{on:true,host,phase:'rally'}, NET:{on:true,peers:new Map([['other',{}]]),pingT:0,lastSt:0,lastBall:0,ownBall:true,name:'test'},
    walk:{x:0,z:0,yaw:0}, window:{}, document:{hidden:false}, staGame:()=>false, camera:{position:{y:1.7}}, EYE:1.7, myPoseCode:()=>0, myTitle:()=>'',myChar:()=>null,readTeamJersey:()=>null,
    vmStatePayload:()=>({ai:[['ai1',0,0,0],['ai2',0,0,0]]}),balls:[{room:true,rest:0}],netBallMsg:()=>({})};
  ctx.NET.tx={publish(t){ctx.netCount();counts[Math.min(2,Math.floor(now/60000))]++;types[t]=(types[t]||0)+1;}};
  vm.createContext(ctx);vm.runInContext(block(source,'function netCount()', 'async function ablyTransport'),ctx);
  const tick=block(source,'function netTick(', '  // 對方的人形');vm.runInContext(tick+'\n}',ctx);
  let maxSlow=1,lastPing=0;
  for(let frame=1;frame<=10800;frame++) {
    now=frame*1000/60;const sec=now/1000, phase=scenario==='continuous'||sec%18<12?'rally':'serve';ctx.VM.phase=phase;ctx.walk.x=Math.sin(sec)*3;
    ctx.NET.ownBall=scenario==='continuous'||sec%6<3;
    if(frame%1080===1 || frame%180===0) {ctx.NET.forceSt=true;ctx.NET.tx.publish('ball');}
    if(host && source===gym && phase==='rally' && (frame%180===30||frame%180===90))ctx.NET.forceSt=true;
    if(now-lastPing>(source===gym?5000:3000)){lastPing=now;ctx.NET.tx.publish('pong');}
    ctx.netTick(1/60,now);maxSlow=Math.max(maxSlow,q.slow);
  }
  return {counts,total:counts.reduce((a,b)=>a+b),maxSlow,types};
}
for(const scenario of ['match','continuous'])for(const host of [true,false]) {
  const old=traffic(baseline,host,scenario),current=traffic(gym,host,scenario);
  console.log(JSON.stringify({scenario,host,old,current,change:(current.total/old.total-1)*100}));
  assert(current.total<=old.total*1.1,'message budget');if(host)assert.equal(current.maxSlow,1);
}
console.log(`WEB-015 passed: max frame displacement ${maxStep.toFixed(4)} m`);
