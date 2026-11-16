const assert=require('node:assert/strict'),vm=require('node:vm');
const {engine,source}=require('./tutorial-engine.cjs');
function lesson(id,index){const f=engine();f.api.start(id);for(let i=0;i<index;i++){f.api.skip();f.advance();}return f;}
for(const side of [-1,1])for(const rotation of [0,37,90]){
 const f=engine(),c=f.c;c.state.items[0].rot=rotation;
 [c.walk.x,c.walk.z]=c.toWorldOf(c.state.items[0],side*5,0);f.api.startFull();
 assert(Math.abs(c.toLocalOf(c.coach.court,c.walk.x,c.walk.z)[0]-side*12)<1e-8);
 f.api.stop();
}
{
 const f=lesson('move',4);assert.equal(f.c.coach.ring,null);assert.equal(f.api.view().required,1);
 f.api.stop();
}
// A real serve must finish its trajectory; a first floor hit outside the goal never counts.
for(const miss of [false,true]){
 const f=lesson('serve',0),c=f.c;
 c.vbServeAim=()=>({tx:c.coach.zone.p.x+(miss?20:0),tz:c.coach.zone.p.z,court:c.coach.court,sg:c.coach.sg});
 c.startServe('std');f.until(()=>!!c.coach.pending);
 assert.equal(f.api.view().reps,0);const ball=c.coach.ball;
 f.until(()=>c.coach.settled);
 assert(ball.floorHit);assert.equal(f.api.view().reps,miss?0:1);
 assert.equal(c.coach.ball,ball,'landing remains visible before the next feed');f.api.stop();
}
for(const id of ['atk','serve','block']){
 const f=lesson(id,0),c=f.c;
 c.vbServeAim=()=>({tx:c.coach.zone.p.x,tz:c.coach.zone.p.z,court:c.coach.court,sg:c.coach.sg});
 while(f.api.view().phase!=='complete'){
  const index=f.api.view().step;let lastHit=0;
  f.until(()=>f.api.view().phase==='success',()=>{
   const b=c.coach.ball;
   if(id==='atk'){
    if(index===0){if(!c.walk.air){c.walk.vel=[3,0];c.vbJump('attack');}return;}
    if(!b||c.coach.settled||c.coach.pending)return;
    const p=c.coach.zone.p;c.walk.yaw=Math.atan2(-(p.x-c.walk.x),-(p.z-c.walk.z));
    if(b.v.y<0&&b.m.position.y<4&&!c.walk.air){c.walk.vel=[0,0];c.vbJump('attack');}
    if(c.walk.air&&!c.walk.swing&&b.m.position.distanceTo(c.vbHand())<1)c.vbAttack(index===3,index===2?.8:.5);
   }else if(id==='serve'){
    if(c.walk.hold&&!c.walk.serve&&!c.walk.jserve){if(index===2)c.startJumpServe();else c.startServe(index===0?'std':'float');}
    if(index===2&&c.walk.air&&c.walk.jserve?.ball.position.distanceTo(c.vbHand())<.7)c.jumpServeHit('jump',.8);
   }else{
    assert.equal(c.coach.hitters.length,index===3?3:1);
    for(const av of c.coach.hitters)assert.equal(av.g.position.y,.85);
    if(index===3){assert.equal(c.coach.blockers.length,2);if(c.coach.toss){c.walk.x=c.coach.ring.position.x;c.walk.z=c.coach.ring.position.z;}}
    if(index===1)c.walk.blkAim=.3;
    if(c.coach.hitUntil&&c.coach.hitUntil!==lastHit){lastHit=c.coach.hitUntil;c.vbJump('block');}
   }
  },3000);
  assert.equal(f.api.view().reps,id==='block'&&index===3?5:3);
  if(id!=='block'||index>=2)if(id!=='atk'||index>0)assert(c.coach.ball.floorHit);
  f.advance();
 }
 assert(f.api.progress().done[id]);assert.equal(c.balls.length,0);assert.equal(c.coach.objects.length,0);
}
{
 const f=lesson('set',4),c=f.c;let contacts=0;
 c.tutEv=(name,data,b)=>{if(name==='atk'){assert(data.dump&&data.air);contacts++;}if(c.coach.event(name,data,b))f.api.emit(name,data);};
 f.until(()=>f.api.view().phase==='success',()=>{
  const b=c.coach.ball;if(!b||c.coach.pending||c.coach.settled)return;
  if(b.v.y<0&&b.m.position.y<4&&!c.walk.air)c.vbJump('attack');
  if(c.walk.air&&!c.walk.swing&&b.m.position.distanceTo(c.vbHand())<1)c.vbAttack(true,.5);
 },2200);assert.equal(contacts,3);assert(c.coach.ball.floorHit);f.api.stop();
}
// Shared action and sprint costs retain 70%, including role discounts.
{
 const c={VM:{on:false},staCfg:()=>({sprint:21,dive:39,spec:30}),STA_SPEC:{S:['dive']},clamp:(v,a,b)=>Math.max(a,Math.min(b,v))};vm.createContext(c);vm.runInContext(source('staCost'),c);
 assert.equal(c.staCost('sprint','me'),.21);c.VM.on=true;assert(Math.abs(c.staCost('sprint','me')-.147)<1e-9);
 assert(Math.abs(c.staCost('dive','me')-.273)<1e-9);c.VM.six=true;c.VM.role={me:'S'};assert(Math.abs(c.staCost('dive','me')-.1911)<1e-9);
}
console.log('PASS tutorial v3: start position, stamina stage, landing-gated targets and misses, all attack/serve/block stages, five combined blocks, setter dump, 30% lower match costs');
{
 const f=lesson('recv',2),c=f.c;c.coach.feed();const b=c.coach.ball;
 const goal=c.coach.zone.p;c.walk.yaw=Math.atan2(-(goal.x-c.walk.x),-(goal.z-c.walk.z));
 const [fx,fz]=c.vbFwd();b.m.position.set(c.walk.x+fx*.4,.8,c.walk.z+fz*.4);b.v.set(-fx*22,-5,-fz*22);
 c.vbDoReceive({b,dx:fx*.4,dz:fz*.4},false);
 assert(b.v.length()>10,'standing heavy reception actually sprays');
 f.until(()=>c.coach.settled);assert.equal(f.api.view().reps,0);f.api.stop();
}
{
 const f=lesson('recv',3),c=f.c;c.coach.feed();assert.equal(c.coach.zone,null);
 const b=c.coach.ball,[fx,fz]=c.vbFwd();b.m.position.set(c.walk.x+fx*.4,.25,c.walk.z+fz*.4);b.v.set(-fx*14,-6,-fz*14);
 c.vbDoReceive({b,dx:fx*.4,dz:fz*.4},true);
 assert(b.v.y>8);assert(b.m.position.y+b.v.y*b.v.y/19.6>3.5,'rescue has height for the next player');f.api.stop();
}
console.log('PASS heavy standing reception misses the target; dive has no target and rises above 3.5m');
