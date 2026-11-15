const assert=require('node:assert/strict'),fs=require('node:fs');
const {create,sections}=require('../js/tutorial.js');
const {engine,Vector,source}=require('./tutorial-engine.cjs');
function fixture(id,step=0){
 let time=1000;const memory=new Map();let rounds=0;const progress=[];
 const api=create({now:()=>time,storage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},coach:{step:()=>({x:4,z:0}),repeat:()=>({x:4,z:0}),progress:v=>progress.push(v),roundComplete:()=>rounds++}});
 const state={x:0,z:0,yaw:0,locked:true,focused:true,crouch:false,sprint:false,stamina:1,air:false};
 function tick(patch={},ms=100){Object.assign(state,patch);time+=ms;api.frame({...state});}
 function wait(ms=900){for(let i=0;i<Math.ceil(ms/100);i++)tick();}
 api.start(id);for(let i=0;i<step;i++){api.skip();tick({},800);}
 return {api,tick,wait,progress,memory,state};
}
{
 const f=fixture('move',1);f.tick({x:4});assert.equal(f.api.view().reps,0);
 f.wait(1500);assert(f.api.view().fraction>.4);f.tick({x:0});assert.equal(f.api.view().fraction,0);
 for(let r=0;r<3;r++){f.tick({x:4});f.wait(3000);assert.equal(f.api.view().reps,r+1);if(r<2)f.wait();}
 assert.equal(f.api.view().phase,'success');assert(f.progress.includes(1));
}
{
 const f=fixture('move',5);f.tick({x:4,crouch:true});f.wait(1500);f.tick({crouch:false});assert.equal(f.api.view().fraction,0);
 f.tick({x:0,crouch:true});f.wait(3500);assert.equal(f.api.view().reps,0);
 f.tick({x:4});f.wait(1500);f.tick({focused:false});assert.equal(f.api.view().fraction,0);
 f.tick({focused:true});f.wait(3000);assert.equal(f.api.view().reps,1);
}
{
 const f=fixture('move',2);for(let i=0;i<100;i++)f.tick({yaw:i%2?.4:0});assert.equal(f.api.view().reps,0,'wiggling does not substitute for 360 degrees');
 for(let r=0;r<3;r++){for(let i=0;i<70;i++)f.tick({yaw:f.state.yaw+.1});assert.equal(f.api.view().reps,r+1);if(r<2)f.wait();}
 assert.equal(f.api.view().phase,'success');
}
{
 const f=fixture('move',3);f.tick({x:4});f.wait(4000);assert.equal(f.api.view().reps,0,'must look before walking');
 f.tick({x:0,yaw:-Math.PI/2});f.tick({x:4});f.wait(3000);assert.equal(f.api.view().reps,1);
 const sprint=fixture('move',4);sprint.tick({x:4,sprint:true,stamina:1});assert.equal(sprint.api.view().reps,0);
 sprint.tick({stamina:.5});assert.equal(sprint.api.view().fraction,.5);sprint.tick({stamina:0});assert.equal(sprint.api.view().reps,1);
}
for(const [id,step,event,data] of [['recv',1,'recv',{}],['recv',2,'recv',{crouch:true}],['recv',3,'recv',{dive:true}],['atk',0,'jump',{block:false,speed:3}],['atk',1,'atk',{air:true,chg:.5}],['atk',2,'atk',{zone:'sweet'}],['atk',3,'atk',{tip:true}],['serve',0,'serve',{type:'std'}],['serve',1,'serve',{type:'float'}],['serve',2,'serve',{type:'jump'}],['block',2,'block',{kind:'stuff'}],['block',3,'block',{kind:'soft',mate:true}]]){
 const f=fixture(id,step);
 for(let r=0;r<3;r++){
  if(id==='recv'&&step===3){for(let n=0;n<3;n++)f.api.emit('recvMiss');f.api.emit('dive');assert.equal(f.api.view().reps,r,'dive alone never counts');}
  f.api.emit(event,data);assert.equal(f.api.view().reps,r+1);
  f.api.emit(event,data);assert.equal(f.api.view().reps,r+1,'one attempt cannot count twice');
  if(r<2){assert.equal(f.api.view().phase,'running');f.wait();}
 }
 assert.equal(f.api.view().phase,'success');
}
for(const [step,actions] of [[0,[{n:1,v:'high'}]],[1,[{n:2,v:'wheelQuick'},{n:3,v:'high'}]],[2,[{n:7,v:'line3'}]],[3,[{n:1,v:'flat',menu:true,def:false}]]]){
 const f=fixture('set',step);for(let i=0;i<3;i++){for(const a of actions)f.api.emit('set',a);assert.equal(f.api.view().reps,i+1);if(i<2)f.wait();}assert.equal(f.api.view().phase,'success');
}
for(const section of sections){const f=fixture(section.id);for(let i=0;i<section.count;i++){f.api.skip();f.tick({},800);}assert.equal(f.api.progress().done[section.id],true);f.api.stop();f.api.emit('recv');assert.equal(f.api.view().phase,'closed');}
console.log('PASS 3-second continuous holds, leave/release/focus resets, three distinct 360-degree turns, look-before-walk, exhaustion, three valid repetitions and no failure bypass');
// Real game coordinates, geometry, ball physics and contact paths.
for(const side of [-1,1])for(const rotation of [0,37,90]){
 const f=engine(),c=f.c;c.state.items[0].rot=rotation;[c.walk.x,c.walk.z]=c.toWorldOf(c.state.items[0],side*5,0);f.api.start('move');
 for(const [rep,d] of [[0,9],[1,6],[2,3]]){const p=c.coach.moveTarget(1,rep),[x,z]=c.toLocalOf(c.state.items[0],p.x,p.z);assert(Math.abs(x-side*d)<1e-8);assert(Math.abs(z)<1e-8);}
 c.coach.progress(.5);assert.equal(c.coach.ring.userData.progress.geometry.drawRange.count,360);c.coach.progress(0);assert.equal(c.coach.ring.userData.progress.visible,false);f.api.stop();assert.equal(c.coach.objects.length,0);
}
for(const index of [1,2,3]){
 const f=engine(),c=f.c;f.api.start('recv');for(let i=0;i<index;i++){f.api.skip();f.advance();}
 let contacts=0;c.tutEv=(name,data,ball)=>{if(name==='recv')contacts++;if(c.coach.event(name,data,ball))f.api.emit(name,data);};
 f.until(()=>f.api.view().phase==='success',()=>{
  const b=c.coach.ball;if(!b || c.coach.settled)return;
  const incoming=c.coach.incoming();
  if(index!==3 && incoming){c.walk.x=incoming.x;c.walk.z=incoming.z;c.camera.position.x=incoming.x;c.camera.position.z=incoming.z;}
  c.walk.crouch=index===2;
  if(index===3){if(c.coach.toss)return;const pr=c.vbPredict(b.m.position,b.v,c.BALL_R);if(pr && pr.t<.5 && !c.walk.dive && !c.walk.down){c.walk.keys.add('shift');c.vbReceive();}}
  else if(b.v.y<0 && b.m.position.y<1.8 && !c.walk.recv && !c.coach.toss)c.vbReceive();
 },2400);
 assert.equal(f.api.view().reps,3);assert.equal(contacts,3);assert(c.coach.path,'trajectory hint exists');
 if(index>=2){assert.equal(c.coach.coach.g.position.y,.85,'hitter stands on platform');assert.equal(c.coach.ball.lk,'bump','spike was actually received');}
 f.api.stop();assert.equal(c.balls.length,0);assert.equal(c.coach.objects.length,0);
}
console.log('PASS actual physics: three chance balls, three crouched spike receptions and three successful spike dives, platform and trajectory hints, cleanup');
module.exports={engine,Vector,source};

for(const id of ['atk','serve','block']){
 const f=engine(),c=f.c;f.api.start(id);
 while(f.api.view().phase!=='complete'){
  const index=f.api.view().step;
  let lastJump=0;
  f.until(()=>f.api.view().phase==='success',()=>{
   const b=c.coach.ball;
   if(id==='atk'){
    if(index===0){if(!c.walk.air){c.walk.vel=[3,0];c.vbJump('attack');}return;}
    if(!b || c.coach.settled)return;
    if(b.v.y<0 && b.m.position.y<4 && !c.walk.air){c.walk.vel=[0,0];c.vbJump('attack');}
    if(c.walk.air && !c.walk.swing && b.m.position.distanceTo(c.vbHand())<1)c.vbAttack(index===3,index===2?.8:.5);
   }else if(id==='serve'){
    if(c.walk.hold && !c.walk.serve && !c.walk.jserve){if(index===2)c.startJumpServe();else c.startServe(index===0?'std':'float');}
    if(index===2 && c.walk.air && c.walk.jserve?.ball.position.distanceTo(c.vbHand())<.7)c.jumpServeHit('jump',.8);
   }else{
    if(index<=1){if(!c.walk.air)c.vbJump('block');if(index===1)c.walk.blkAim=.3;}
    else if(c.coach.cj && c.coach.cj!==lastJump && c.performance.now()-c.coach.cj>=250){lastJump=c.coach.cj;c.vbJump('block');}
   }
  },3000);
  assert.equal(f.api.view().reps,3,id+' stage '+index);f.advance();
 }
 assert.equal(f.api.progress().done[id],true);assert.equal(c.balls.length,0);assert.equal(c.coach.objects.length,0);
}
console.log('PASS real-contact three-repetition attack, serve and block curricula; full stage transitions and cleanup');

{
 const f=engine(),c=f.c;f.api.start('set');
 for(let step=0;step<4;step++){
  f.until(()=>f.api.view().phase==='success',()=>{
   const b=c.coach.ball;if(!b || c.coach.settled || b.v.y>=0 || b.m.position.y>=2.6 || c.walk.setQ)return;
   const done=f.api.view().completed;
   const [n,v]=step===0?[1,'high']:step===1?(done.includes(2)?[3,'high']:[2,'wheelQuick']):step===2?[7,'line3']:[1,'flat'];
   c.vbSet(n,v,true);
  },3000);assert.equal(f.api.view().reps,3);f.advance();
 }
 assert(f.api.progress().done.set);
}
{
 const f=engine(),c=f.c;f.api.start('move');for(let i=0;i<4;i++){f.api.skip();f.advance();}
 assert.equal(c.STA.v,1);
 f.until(()=>f.api.view().phase==='success',()=>{c.walk.keys.add('shift');c.walk.vel=[3,0];c.staSprint(true,1/60);},1800);
 assert.equal(f.api.view().reps,3);assert.equal(c.STA.v,0);f.api.stop();
}
console.log('PASS actual wheel setting contacts complete all four stages three times; real stamina drains from full to empty for three sprint rounds');
