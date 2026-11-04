const assert=require('node:assert/strict'),vm=require('node:vm');
const {engine,network,block,read}=require('./verify-web003a.cjs');
const ctx={};vm.runInNewContext(read('court-formations.js'),ctx);const F=ctx.CourtFormations;
let passed=0;function check(name,f){f();console.log('PASS '+name);passed++;}
function integrated(n){
 const e=engine(),c=e.c;Object.assign(c,{BALL_R:.12,vmBallL:b=>b,vmSide:t=>t===0?-1:1,vmPos:id=>{const a=e.VM.ai.get(id);return a?{x:a.x,z:a.z}:c.positions?.[id];},vmTeamOf:id=>e.VM.team.findIndex(t=>t.includes(id)),vmPredL:B=>B,vmLetGo:()=>false,vmLv:()=>({react:.2}),vmSay(){},sfx(){},vmBroadcast(){},vmPointMsg:()=>'',vmTeamLabel:t=>String(t),vmOver(){e.finished=true;}});
 vm.runInContext(block('function vm6Rotate(','// ---- 每一格'),c);
 vm.runInContext(block('function vmServer()','function vmSetupServe()')+block('function vmPoint(','function vmTeamLabel('),c);
 c.vm6Start({id:'court',x:0,z:0,rot:0},-1,{},[Array(n).fill(null),Array(n).fill(null)]);
 return e;
}
check('equal areas, full coverage, centers and clockwise perimeter for 1/3/4/5',()=>{
 for(const n of [1,3,4,5]){
  const zones=F.get(n);assert.equal(zones.length,n);
  assert(Math.abs(zones.reduce((sum,z)=>sum+(z.d1-z.d0)*(z.l1-z.l0),0)-81)<1e-9);
  for(const z of zones)assert(Math.abs((z.d1-z.d0)*(z.l1-z.l0)-81/n)<1e-9);
  for(let d=.05;d<9;d+=.2)for(let L=-4.45;L<4.5;L+=.2){assert.equal(zones.filter(z=>d>=z.d0&&d<z.d1&&L>=z.l0&&L<z.l1).length,1);assert(F.owner(n,d,L)>=0);}
  zones.forEach((z,k)=>{assert.equal(F.owner(n,...F.home(n,k)),k);});
  let ids=Array.from({length:n},(_,i)=>i);for(let turn=0;turn<n;turn++)ids=F.rotate(ids);assert.deepEqual(Array.from(ids),Array.from({length:n},(_,i)=>i));
 }
 assert.deepEqual(Array.from(F.get(5),z=>z.name),['後排右','後排中','後排左','前排左','前排右']);
});
check('each actual position relation detects a crossing; centers remain legal',()=>{
 for(const n of [1,3,4,5]){
  const centers=F.get(n).map(z=>({d:z.d,L:z.L}));assert.equal(F.overlap(n,centers),null);
  for(const {axis,low,high} of F.relations(n)){const p=centers.map(z=>({...z}));p[low][axis]=p[high][axis]+.2;assert(F.overlap(n,p));}
 }
 assert.equal(F.relations(1).length,0);assert.equal(F.relations(3).filter(r=>r.axis==='d').length,2);assert.equal(F.relations(4).filter(r=>r.axis==='d').length,2);assert.equal(F.relations(5).filter(r=>r.axis==='d').length,4);
});
check('real startup fills exactly 2N slots, no fixed roles, centers and server',()=>{
 for(const n of [1,3,4,5]){
  const e=integrated(n),{c,VM}=e;assert.equal(VM.ai.size,2*n);assert.equal(Object.keys(VM.role).length,0);assert.equal(e.messages[0].team[0].length,n);
  for(const t of [0,1])for(let k=0;k<n;k++){
   const id=VM.rot[t][k],a=VM.ai.get(id),sd=c.vmSide(t),home=F.home(n,k);assert.equal(a.x,sd*home[0]);assert.equal(a.z,sd*home[1]);
   const f=c.vm6Spot(t,id,'serve');assert.equal(f.x,sd*(t===VM.srvTeam&&k===0?9.8:home[0]));
  }
  for(let i=0;i<n;i++){const before=Array.from(VM.rot[0]);c.vm6Rotate(0);assert.deepEqual(Array.from(VM.rot[0]),Array.from(F.rotate(before)));VM.srvTeam=0;assert.equal(c.vmServer(),before.at(-1));}
 }
});
check('defense ownership uses predicted landing region after rotation on both sides',()=>{
 for(const n of [3,4,5]){const {c,VM}=integrated(n);for(const t of [0,1]){c.vm6Rotate(t);for(let k=0;k<n;k++){const z=F.get(n)[k],sd=c.vmSide(t);VM.poss[t]=null;const p=c.vm6Possession(t,{x:z.d*sd,z:z.L*sd});assert.equal(p.passer,VM.rot[t][k]);assert.notEqual(p.setter,p.passer);}}}
});
check('runtime overlap checks actual positions, including AI, and mirrors both halves',()=>{
 for(const n of [3,4,5]){const {c,VM}=integrated(n);for(const t of [0,1]){VM.srvTeam=1-t;assert.equal(c.vm6Overlap(),null);const r=F.relations(n)[0],a=VM.ai.get(VM.rot[t][r.low]),b=VM.ai.get(VM.rot[t][r.high]),axis=r.axis==='d'?'x':'z',old=a[axis];a[axis]=b[axis]+c.vmSide(t)*.3;assert.equal(c.vm6Overlap().team,t);a[axis]=old;}}
});
check('solo AI reuses rescue action, returns home, and real scoring completes a set',()=>{
 const e=integrated(1),{c,VM}=e,a=VM.ai.get(VM.rot[0][0]);let calls=0;
 c.vmAiRole=(a,P)=>{calls++;assert.equal(P.stage,2);assert.equal(P.attacker,null);};VM.t=2;a.reactAt=0;VM.touch={team:1,n:3};c.vm6Brain(a,-1,{x:-4,z:0,vx:-1},true);assert.equal(calls,1);
 VM.touch.team=0;c.vm6Brain(a,-1,{x:2,z:0,vx:1},true);assert.equal(a.tx,-6);assert.equal(Math.abs(a.tz),0);
 VM.to=3;VM.bestOf=1;VM.srvTeam=1;const id=VM.rot[0][0];
 for(let i=0;i<3;i++){VM.phase='rally';c.vmPoint(0,'test rally');VM.next.fn();}assert(e.finished);assert.equal(VM.sets[0],1);assert.equal(VM.rot[0][0],id);assert.equal(c.vmServer(),id);
});
check('new counts complete room selection with AI vacancies and lock settings',()=>{
 for(const count of [1,3,4,5]){const n=network(),a=n.add('host',true,count);n.tick(1300);a.toggleReady();assert(a.begin());a.pick(2*count-1);assert.equal(a.snapshot.flow.phase,'playing');assert.equal(a.snapshot.flow.picks.length,2*count);assert(!a.setCount(2));a.end();assert(a.setCount(2));}
});
check('solo rescue executes the original chase and free-ball code',()=>{
 const {c,VM}=integrated(1),a=VM.ai.get(VM.rot[0][0]);let returned=0;
 c.vmAiFree=()=>returned++;VM.touch={team:1,n:3,last:VM.rot[1][0]};VM.t=3;a.reactAt=0;
 vm.runInContext(block('function vmAiRole(','// AI 碰球：'),c);
 c.vm6Brain(a,-1,{x:a.x,z:a.z,y:1,vy:-2,vx:-1},true);
 assert.equal(returned,1);assert.equal(a.tx,a.x-.4);assert.equal(a.tz,a.z);
});
check('3/4/5 rotate only on side-out and send the new back-right player to serve',()=>{
 for(const n of [3,4,5]){const {c,VM}=integrated(n);VM.srvTeam=0;const before=Array.from(VM.rot[1]);
  VM.phase='rally';c.vmPoint(1,'side-out');assert.deepEqual(Array.from(VM.rot[1]),Array.from(F.rotate(before)));assert.equal(c.vmServer(),before.at(-1));
  const after=Array.from(VM.rot[1]);VM.phase='rally';c.vmPoint(1,'hold');assert.deepEqual(Array.from(VM.rot[1]),after);
 }
});
console.log(`${passed} WEB-003B checks passed (not browser verification)`);
