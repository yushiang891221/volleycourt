const assert=require('node:assert/strict'),vm=require('node:vm');
const {engine,Vector,source}=require('./verify-web006.cjs');
// Execute the actual setter, including both court sides and rotated courts.
for(const side of [-1,1])for(const rot of [0,37,90]){
  const {c}=engine(); const court=c.state.items[0];court.rot=rot;
  const [x,z]=c.toWorldOf(court,side*1.5,.7);c.walk.x=x;c.walk.z=z;c.camera.position.set(x,1.62,z);
  let shot;c.vbSendSet=(b,tx,tz,ty,T)=>{shot={tx,tz,ty,T};};
  const ball=()=>({m:{position:new Vector(x,1.92,z)},v:new Vector()});
  for(const [n,expectedZ] of [[7,side*3],[4,0],[5,-side*3]]){
    c.vbDoSet(ball(),n,1,.3,'line3',true);
    const [lx,lz]=c.toLocalOf(court,shot.tx,shot.tz);
    assert(Math.abs(lx-side*3)<1e-8);assert(Math.abs(lz-expectedZ)<1e-8);
  }
  c.vbDoSet(ball(),2,1,.3,'wheelQuick',true);
  assert(Math.hypot(shot.tx-x,shot.tz-z)<.3);assert.equal(shot.T,.3);assert.equal(shot.ty,2.27);
  assert.equal(c.walk.turn,null,'wheel never rotates camera on contact');
}
console.log('PASS rear 5/6/1 target three-meter line on both sides and rotated courts; A quick above setter');
for(const count of [1,2,3,4,5,6])for(const targetZ of [-2.8,2.1]){
  const {c}=engine();c.walk.x=1.2;c.walk.z=.2;c.camera.position.set(1.2,1.62,.2);
  c.VM={on:true,host:false,six:count!==2,team:[['me',...Array.from({length:count-1},(_,i)=>'a'+i)],Array.from({length:count},(_,i)=>'b'+i)],role:{a0:'MB'},poss:[null,null],ai:new Map()};
  c.vmTeamOf=()=>0;c.vmL=(x,z)=>[x,z];c.vmW=(x,z)=>[x,z];c.vm6Front=()=>true;c.vmPos=()=>({x:1.1,z:targetZ});
  c.MREC={local:{sets:{}}};let shot;c.vbSendSet=(b,tx,tz,ty,T)=>{shot={tx,tz,ty,T};};
  c.vbDoSet({m:{position:new Vector(1.2,1.92,.2)}},2,1,.3,'wheelQuick',true);
  if(count===6){assert.equal(shot.tx,1.1);assert.equal(shot.tz,targetZ);}
  else assert(Math.hypot(shot.tx-1.2,shot.tz-.2)<.3);
}
console.log('PASS only true 6v6 tracks attacker on either side; 1–5 players use A quick');
// Regression: stale player jump data on the ball must never determine an AI's fault.
for(const side of [-1,1])for(const rotation of [0,.65,Math.PI/2]){
  const cs=Math.cos(rotation),sn=Math.sin(rotation);
  const world=(x,z)=>[12+x*cs-z*sn,-8+x*sn+z*cs];
  const local=(x,z)=>[(x-12)*cs+(z+8)*sn,-(x-12)*sn+(z+8)*cs];
  for(const test of [
    {take:3.4,now:2.2,stale:1,fault:false},
    {take:5,now:4,stale:1,fault:false},
    {take:2,now:3.4,stale:5,fault:true},
    {take:2,now:2,stale:5,height:2.48,fault:false},
    {take:2,now:4,stale:1,ground:true,fault:false}
  ]){
    const [jx,jz]=world(test.take*side,.7),ai={x:test.now*side,z:.7,y:test.ground?0:.5,vy:0,jp:{x:jx,z:jz}};
    const b={m:{position:{x:0,z:0,y:test.height||3}},jump0:world(test.stale*side,0)};let fault='';
    const c={VM:{on:true,host:true,six:true,phase:'rally',ai:new Map([['ai',ai]]),touch:{team:0,n:2,last:'setter'},poss:[null,null]},balls:[b],NET:{on:false},state:{net:'men'},NETS:{men:{h:2.43}},BALL_R:.105,walk:{},vmTeamOf:()=>0,vmPerfTouch(){},vm6Idx:()=>4,vmSmallCount:()=>false,vmMe:()=> 'me',vmName:()=> 'AI',vmW:world,vmL:local,vmPoint:(team,why)=>{fault=why;},vm6SetterFor:()=>null,vm6AttackerFor:()=>null};
    vm.runInNewContext(require('./engine-for-tests.cjs').rulesScript(require('fs').readFileSync(require('path').join(__dirname,'..','gym.html'),'utf8'))+source('vmOnTouch'),c);   /* B2 */c.vmOnTouch(b,'ai','spike');
    assert.equal(!!fault,test.fault,JSON.stringify({side,rotation,test,fault}));
  }
}
console.log('PASS AI uses own takeoff, ignores stale ball data, permits forward drift and below-net contact; both sides/rotations');
