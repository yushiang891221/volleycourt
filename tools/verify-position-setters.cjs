const assert=require('node:assert/strict'),vm=require('node:vm');
const {network,block}=require('./verify-web003a.cjs');
const {setup}=require('./verify-3v3-back-sets.cjs');
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
test('host-only 6v6 tactics synchronize, survive host transfer, reject invalid changes and lock during picks/play',()=>{
 const n=network(),host=n.add('host',true,6);n.tick(1300);const guest=n.add('guest');n.tick(300);
 assert.equal(host.snapshot.tactics,'roles');assert(!guest.setTactics('rotation'));assert(!host.setTactics('bad'));
 assert(host.setTactics('rotation'));n.flush();assert.equal(guest.snapshot.tactics,'rotation');
 const late=n.add('late');n.tick(300);assert.equal(late.snapshot.tactics,'rotation');
 guest.receive({e:'state',order:['host','guest','late'],speed:.7,count:6,tactics:'invalid',revision:999},'host');assert.equal(guest.snapshot.tactics,'rotation');
 host.toggleReady();guest.toggleReady();n.flush();assert(host.begin());assert(!host.setTactics('roles'));
 host.pick(0);guest.pick(8);n.flush();assert.equal(host.snapshot.flow.phase,'playing');assert(!host.setTactics('roles'));
 host.end();n.flush();n.leave('host');assert(guest.isHost);assert.equal(guest.snapshot.tactics,'rotation');
 assert(guest.setTactics('roles'));n.flush();assert.equal(late.snapshot.tactics,'roles');
 guest.setCount(4);assert(!guest.setTactics('rotation'));
});
test('3/4/5 select the current front center/right player across every rotation, regardless of human/AI or distance',()=>{
 for(const count of [3,4,5])for(const team of [0,1]){
  const {c,VM}=setup(team,0,'normal',0,count),slot={3:2,4:3,5:4}[count];
  for(let turn=0;turn<count;turn++){
   const primary=VM.rot[team][slot],passer=VM.rot[team][0];
   VM.ai.get(primary).x=100; // A distant designated setter must not lose the normal job.
   assert.equal(c.vm6SetterFor(team,passer),primary);
   const ai=VM.ai.get(primary);VM.ai.delete(primary);assert.equal(c.vm6SetterFor(team,passer),primary);VM.ai.set(primary,ai);
   const backup=c.vm6SetterFor(team,primary);assert(backup&&backup!==primary&&VM.team[team].includes(backup));
   c.vm6Rotate(team);
  }
 }
});
test('rotation starts with 3 setting, updates roles/spacing for both halves, resets on a new set, and sends tactics to peers',()=>{
 const {c,VM}=setup(0,0,'normal',0,6);c.ROOM={snapshot:{tactics:'rotation'}};
 c.vm6Start({id:'court',x:0,z:0,rot:0},-1,{},[Array(6).fill(null),Array(6).fill(null)]);
 for(const a of VM.ai.values())Object.assign(a,{y:0,vx:0});
 assert.equal(VM.tactics,'rotation');assert.equal(VM.startData.six.tactics,'rotation');
 for(let turn=0;turn<6;turn++)for(const team of [0,1]){
  const rot=VM.rot[team];assert.equal(c.vm6SetterFor(team,rot[0]),rot[2]);assert.equal(VM.role[rot[2]],'S');
  assert.equal(c.vm6SetterFor(team,rot[2]),rot[1]);
  for(let k=0;k<6;k++)assert.equal(VM.role[rot[k]],['MB','OPP','S','OH','MB','OH'][k]);
  const sd=c.vmSide(team),mid=c.vm6Spot(team,rot[2],'defense');assert.equal(mid.z,0*sd);
  VM.poss[team]={stage:1,setter:rot[2]};assert.equal(c.vm6Spot(team,rot[2],'attack').z,0*sd);
  assert.equal(c.vm6Overlap(),null);
  const blocker=VM.ai.get(rot[2]);blocker.z=sd*3;assert(c.vm6BlockPick(blocker,{z:sd*3}));
  assert(c.vmBlockLane(blocker,{z:sd*3})/sd<0,'3 must block inside even if the players crossed positions');
  c.vm6Rotate(team);
 }
 c.vmSay=()=>{};c.vm6Rotate(0);c.vm6NextSet();assert.deepEqual(VM.rot,VM.rot0);assert.equal(VM.role[VM.rot[0][2]],'S');
 vm.runInContext(block('function vmStatePayload()','// 比賽有事'),c);c.vmServer=()=>VM.rot[0][0];
 const payload=c.vmStatePayload();assert.equal(payload.six.tactics,'rotation');
 const peer=setup(0,0,'normal',0,6);peer.c.vm6Apply(structuredClone(payload.six));
 assert.equal(peer.VM.tactics,'rotation');assert.equal(peer.VM.role[peer.VM.rot[0][2]],'S');
});
test('fixed-role mode retains S through rotations and enforces real overlap',()=>{
 const {c,VM}=setup(0,0,'normal',0,6),setter=VM.team[0].find(id=>VM.role[id]==='S');
 assert.equal(VM.tactics,'roles');
 for(let turn=0;turn<6;turn++){const passer=VM.team[0].find(id=>id!==setter);assert.equal(c.vm6SetterFor(0,passer),setter);c.vm6Rotate(0);}
 VM.srvTeam=1;const id=VM.rot[0][0],q=VM.ai.get(id);VM.ai.delete(id);c.positions={[id]:{x:0,z:0}};
 const old=c.vmPos;c.vmPos=who=>c.positions[who]||old(who);assert(c.vm6Overlap());VM.ai.set(id,q);
});
test('remote second-ball marker follows the actual synchronized setter rather than a fixed S role',()=>{
 const {c,VM}=setup(0,0,'normal',0,4);vm.runInContext(block('function vmPassRing()','function vmThird()'),c);
 VM.host=false;VM.phase='rally';VM.tc=[0,1];VM.remoteSetters=[VM.rot[0][3],null];c.balls=[VM.ball];
 c.vmMe=()=>VM.rot[0][3];assert(c.vmPassRing());c.vmMe=()=>VM.rot[0][0];assert.equal(c.vmPassRing(),null);
});
console.log(`${checks} position-setter / tactics checks passed (not browser verification)`);
