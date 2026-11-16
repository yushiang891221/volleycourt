require('./engine-for-tests.cjs').installAi(require('node:vm'));   /* B3：AI 引擎 */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const sync = require('../js/match-sync.js');
const gym = fs.readFileSync(require('node:path').join(__dirname, '../gym.html'), 'utf8');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
class V3 {
  constructor(x=0,y=0,z=0) { this.set(x,y,z); }
  set(x,y,z) { Object.assign(this,{x,y,z}); return this; }
  copy(o) { return this.set(o.x,o.y,o.z); }
  clone() { return new V3(this.x,this.y,this.z); }
  add(o) { this.x+=o.x;this.y+=o.y;this.z+=o.z;return this; }
  sub(o) { this.x-=o.x;this.y-=o.y;this.z-=o.z;return this; }
  multiplyScalar(k) { this.x*=k;this.y*=k;this.z*=k;return this; }
  length() { return Math.hypot(this.x,this.y,this.z); }
  toArray() { return [this.x,this.y,this.z]; }
}
function mesh() { return { position:new V3(), quaternion:{ a:[0,0,0,1], set(...a){this.a=a;return this;},toArray(){return this.a.slice();}},userData:{} }; }
function harness(delay=80) {
  let now=1000, packetN=0, dropClaim=false; const queue=[],nodes=new Map(),trace=[];
  function node(id, host, skew) {
    const c={VBMatchSync:sync,Math,Date,clamp,performance:{now:()=>now+skew},THREE:{Vector3:V3},BALL_R:.105,VB:{ts:.7},walk:{x:1,z:0},balls:[],ballsGroup:{add(){},remove(){}},newBallMesh:mesh,NET:{on:true,me:id,lat:new Map(),peers:new Map()},VM:{on:true,host,hostId:'host',ai:new Map(),startData:{},phase:'rally',sc:[0,0],team:[['host','a'],['b','c']],touch:{team:0,n:1,last:'host'},poss:[null,null],t:0,sg:1},sfx(){},vbImpact(){},vbMarkSet(){},vbBlockTest(){},vmTrailPush(){},vmAiSnapshot(){},vmStatePayload:()=>({ai:[]}),vmPerfTouch(){},vmGrade(){},vmName:id=>id};
    c.NET.tx={publish(t,d){trace.push([id,t,structuredClone(d)]);if(dropClaim&&t==='match-claim'){dropClaim=false;return;} for(const to of ['host','a','b','c','spectator']) if(to!==id) queue.push({from:id,to,t,d:structuredClone(d),at:now+delay+([0,40,-20,15][packetN++%4])});}};
    c.vmMe=()=>id;c.vmTeamOf=who=>c.VM.team[0].includes(who)?0:c.VM.team[1].includes(who)?1:-1;c.vmServer=()=>c.server||'host';c.netLat=()=>delay/1000;
    c.vmClearBalls=()=>{c.balls.length=0;};c.vmDropHeld=()=>{};c.vmL=(x,z)=>[x,z];c.vmSide=t=>t? -1:1;
    c.vmPoint=(team,why)=>{c.VM.sc[team]++;c.VM.phase='dead';c.fault=why;};
    vm.createContext(c);
    vm.runInContext(gym.slice(gym.indexOf('function vmWireInit('),gym.indexOf('function netOnMessage(')),c);
    vm.runInContext(require('./engine-for-tests.cjs').rulesScript(gym)+gym.slice(gym.indexOf('function vmOnTouch('),gym.indexOf('function vmGrade(')),c);   /* B2：規則引擎 */
    c.vmWireInit(host,host?c.VM.startData:nodes.get('host').VM.startData);
    if(host)c.VM.wire.order.reset(1);
    nodes.set(id,c);return c;
  }
  const host=node('host',true,0);node('a',false,7000);node('b',false,-400);node('c',false,25000);node('spectator',false,1100);
  for(const c of nodes.values())for(const id of nodes.keys())c.NET.peers.set(id,{last:{x:0,z:0,y:0}});
  const ball=host.vmWireGetBall();host.vmWireApply(ball,{p:[0,6,0],v:[1,0,0],s:[0,0,8],q:[0,0,0,1]});
  function deliver(p) {
    const c=nodes.get(p.to);if(p.t==='match-frame')c.vmWireReceive(p.d,p.from);
    if(p.t==='match-claim')c.vmWireClaim(p.d,p.from);
    if(p.t==='match-ack'&&p.from==='host'&&p.d.to===c.NET.me&&p.d.id===c.VM.wire.pending?.request.id&&!p.d.accepted)c.VM.wire.pending=null;
  }
  function tick(ms) {
    for(let end=now+ms;now<end;now+=10){
      queue.sort((a,b)=>a.at-b.at);while(queue[0]?.at<=now)deliver(queue.shift());
      for(const c of nodes.values()) {
        c.VM.t+=.01;
        if(c.VM.host&&c.VM.ball&&!c.VM.ball.floorHit) {
          const b=c.VM.ball,dt=.01+(b.wireCatchup||0);b.wireCatchup=0;
          const f=sync.sample(c.vmWireBall(b),dt*c.VB.ts,.105,dt);b.m.position.set(...f.p);b.v.set(...f.v);b.m.quaternion.set(...f.q);
          if(f.p[1]===.105){b.floorHit=[f.p[0],f.p[2]];c.VM.wire.dirty=true;}
        } else if(!c.VM.host)for(const b of c.balls)c.vmWireRemoteStep(b,.01);
        c.vmWireTick();
      }
    }
  }
  function hit(id,kind='bump') {
    const c=nodes.get(id),b=c.VM.ball;assert(b,'client received ball');b.v.set(1,5,0);
    host.NET.peers.get(id).last.x=b.m.position.x;
    c.vmWireHit(b,kind,1);
  }
  return {host,nodes,tick,hit,trace,deliver,now:()=>now,dropNextClaim:()=>dropClaim=true};
}

for(const delay of [40,100,200]) {
  const h=harness(delay);h.tick(350);const before=h.host.VM.wire.order.seq;
  h.hit('a');h.hit('b');h.tick(700);
  assert.equal(h.host.VM.wire.order.seq,before+1,'simultaneous claims accepted once');
  const accepted=h.trace.filter(([,t,d])=>t==='match-ack'&&d.accepted);assert(accepted.length>=1);
  const winner=accepted[0][2].to;
  assert.equal(h.host.VM.touch.last,winner,'touch counter uses the accepted actor');
  for(const c of h.nodes.values())if(!c.VM.host) {
    assert.equal(c.VM.wire.order.seq,h.host.VM.wire.order.seq,'five nodes converge');
    assert.equal(c.VM.wire.pending,null,'prediction resolved');
    assert(Math.hypot(...c.VM.ball.m.position.toArray().map((n,i)=>n-h.host.VM.ball.m.position.toArray()[i]))<.35,'clock-aligned positions');
    assert(Math.abs(c.VM.ball.m.quaternion.toArray().reduce((s,n,i)=>s+n*h.host.VM.ball.m.quaternion.toArray()[i],0))>.97,'spin phase synchronized');
  }
  const client=h.nodes.get('c'),latest=structuredClone(client.VM.wire.latest),saved=client.VM.wire.order.frame;
  h.deliver({to:'c',from:'host',t:'match-frame',d:{...latest,frame:saved-1,ball:{...latest.ball,p:[900,900,900]}}});
  h.deliver({to:'c',from:'a',t:'match-frame',d:{...latest,frame:saved+100}});
  assert.equal(client.VM.wire.order.frame,saved,'stale and non-host frames ignored');
  h.tick(2400);
  for(const c of h.nodes.values())if(!c.VM.host) assert.equal(c.VM.ball.m.position.y,.105,'floor stays down');
  console.log(`PASS five-node clock skew, ${delay}ms one-way delay + jitter/reordering, simultaneous touch, spin, floor`);
}
{
  const h=harness(80);h.tick(350);h.dropNextClaim();h.hit('b');h.tick(650);
  assert.equal(h.host.VM.wire.order.seq,1,'lost claim retried exactly once');
  const req=h.trace.find(([,t])=>t==='match-claim')[2];
  h.host.vmWireClaim(req,'b');assert.equal(h.host.VM.wire.order.seq,1,'duplicate request idempotent');
  h.host.VM.wire.order.reset(2);h.host.vmWireClaim({...req,id:999},'b');assert.equal(h.host.VM.wire.order.seq,0,'old round rejected');
  h.host.vmWireClaim({...req,id:1000,round:2,base:0,ball:{...req.ball,p:[900,900,900]}},'b');assert.equal(h.host.VM.wire.order.seq,0,'impossible remote contact rejected');
  console.log('PASS dropped claim retry, duplicate, stale round, invalid contact');
}
{
  const h=harness(100);h.host.server='b';h.host.VM.phase='serve';h.host.VM.ball=null;h.host.balls.length=0;
  h.tick(350);
  const c=h.nodes.get('b'),b=c.vmWireGetBall();c.vmWireApply(b,{p:[-10,2,0],v:[12,7,0],q:[0,0,0,1]});
  c.vmWireHit(b,'serve',1);h.tick(500);
  assert.equal(h.host.VM.phase,'rally','remote designated server starts rally');
  assert.equal(h.host.VM.touch.last,'b');assert.equal(h.host.VM.touch.serve,true);
  for(const node of h.nodes.values())assert(node.VM.ball,'serve appears on every node');
  const seq=h.host.VM.wire.order.seq;
  h.host.vmWireClaim({...c.VM.wire.latest, id:900, base:seq, kind:'serve', ball:c.vmWireBall(c.VM.ball)},'a');
  assert.equal(h.host.VM.wire.order.seq,seq,'second serve during rally rejected');
  console.log('PASS remote serve from empty court, single ball on all five nodes');
}
{
  const h=harness(),c=h.host;
  c.walk.x=-.19;c.vmJudgePenetration();assert.equal(c.VM.phase,'rally','foot touching line allowed');
  c.walk.x=-.3;c.walk.air={y:.4};c.vmJudgePenetration();assert.equal(c.VM.phase,'rally','airborne crossing is not grounded foot fault');
  c.walk.air=null;c.vmJudgePenetration();assert.equal(c.VM.sc[1],1);assert.match(c.fault,/中線/);
  c.vmJudgePenetration();assert.equal(c.VM.sc[1],1,'dead ball cannot score twice');
  console.log('PASS centre-line foot threshold, airborne, dead-ball guard');
}
{
  const b={p:[0,8,0],v:[12,4,-3],a:[0,-4.5,0],s:[7,2,0],q:[0,0,0,1]};
  const direct=sync.sample(b,.28,.105,.4);
  for(const fps of [30,60,144]) {
    let state=structuredClone(b);const steps=Math.round(fps*.4),dt=.4/steps;
    for(let i=0;i<steps;i++)state={...state,...sync.sample(state,dt*.7,.105,dt)};
    for(let k=0;k<3;k++)assert(Math.abs(state.p[k]-direct.p[k])<1e-8);
    for(let k=0;k<4;k++)assert(Math.abs(state.q[k]-direct.q[k])<1e-8);
  }
  console.log('PASS 30/60/144 FPS: identical accelerated trajectory and rotation phase');
}
{
  // 加入者推算球路：碰到地板那一刻就停，左右前後不能繼續往前跑（不然快的扣球落點會多跑一公尺以上，看起來在界外）
  const ball={p:[0,1,0],v:[20,-8,0]}, A=-4.9, tHit=(-(-8)-Math.sqrt(64-4*A*(1-.105)))/(2*A), xHit=20*tHit;
  for(const t of [.2,.35,.5]){const f=sync.sample(ball,t,.105,t);assert(Math.abs(f.p[0]-xHit)<1e-6,`停在落點 ${f.p[0]} vs ${xHit}`);assert.equal(f.p[1],.105);}
  const fl=sync.sample({p:[0,1,0],v:[12,-6,0],f:[0,3,0,4]},.5,.105,.5);assert(fl.p[0]<12*.2,'飄球也停在落點');
  console.log('PASS 推算球路停在碰地那一點');
}
