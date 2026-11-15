require('./engine-for-tests.cjs').installAi(require('node:vm'));   /* B3：AI 引擎 */
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const path = require('node:path'), root = path.join(__dirname, '..');
const gym = fs.readFileSync(path.join(root, 'gym.html'), 'utf8');
const { engine, Vector, source } = require('./tutorial-engine.cjs');
function preferences(raw) {
  const store = new Map(raw ? [['vb.settings',JSON.stringify(raw)]] : []);
  const c = { window:{},innerWidth:1280,matchMedia:()=>({matches:false}),localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},dispatchEvent(){},CustomEvent:class{} };
  vm.runInNewContext(fs.readFileSync(path.join(root,'js/settings.js'),'utf8'),c);
  return { api:c.window.VBSettings, store };
}
{
  const p=preferences().api;
  for(const [a,code] of Object.entries({w:'KeyW',s:'KeyS',a:'KeyA',d:'KeyD',shift:'Shift',crouch:'Control',v:'KeyV',b:'KeyB',q:'KeyC',e:'KeyE',interact:'KeyF',ready:'KeyH'}))assert.equal(p.values.keys[a],code);
  assert.equal(new Set(Object.values(p.values.keys)).size,p.bindings.length,'every default has a unique key');
  const old={...p.values,controlVersion:1,volume:37,keys:{...p.values.keys,w:'KeyI',b:'KeyB',e:'KeyE',q:'KeyQ',f:'KeyF',ready:'KeyR'}};delete old.keys.interact;
  const migrated=preferences(old).api;assert.equal(migrated.values.keys.b,'KeyB');assert.equal(migrated.values.keys.ready,'KeyH');assert.equal(migrated.values.keys.w,'KeyI');assert.equal(migrated.values.volume,37);
  const saved=preferences();saved.api.bind('q','KeyZ');saved.api.update({setFast:13,setSlow:6,setCharge:1.2});
  const reloaded=preferences(JSON.parse(saved.store.get('vb.settings'))).api;
  assert.equal(reloaded.values.keys.q,'KeyZ');assert.equal(reloaded.values.setFast,13);
  assert(!p.bindings.some(([,label])=>label.includes('打短')));
  console.log('PASS keyboard preset, migration, no R/ready conflict, remapping and set-speed persistence');
}
function fixture() {
  const f=engine(),c=f.c,elements=new Map(),events=[];
  c.$=id=>{if(!elements.has(id))elements.set(id,{hidden:true,style:{},dataset:{},textContent:'',classList:{add(){},remove(){}},querySelector:()=>({hidden:true,style:{}})});return elements.get(id);};
  c.VBSettings=preferences().api;c.roomSpectator=()=>false;c.vbChgHud=()=>{};c.vbMyRole=()=>null;
  c.SETM={};c.setWheelOpen=()=>{c.SETM.m={all:true};events.push('wheel');};c.setMenuClose=()=>{c.SETM.m=null;};c.TP={};c.RP={on:false};c.roomReady=()=>events.push('ready');c.roomStart=()=>{};
  c.doInteract=()=>events.push('interact');c.vbReceive=()=>events.push('receive');c.vbJump=kind=>events.push(kind);
  c.tutEv=(type,data)=>events.push({type,data});c.NET.on=false;
  c.walk.x=0;c.walk.z=0;c.walk.yaw=0;c.walk.pitch=.5;c.camera.position.set(0,1.62,0);
  for(const name of ['vbManualSetCancel','vbManualSetPrepare','vbManualSetDown','vbManualSetShot','vbManualSetRelease','vbManualSetHud','vbDoManualSet','vbMarkSet','vbPrimaryDown','vbHeldAttack','vbAttack'])vm.runInContext(source(name),c);
  const listeners={};c.addEventListener=(name,fn)=>(listeners[name]??=[]).push(fn);
  const begin=gym.indexOf("addEventListener('keydown', (e) => {\n  if (!walk.on"),end=gym.indexOf("addEventListener('blur', () => walk.keys.clear());",begin);
  vm.runInContext(gym.slice(begin,end),c);
  const key=(type,key,code)=>{for(const listener of listeners[type]||[])listener({key,code,target:{tagName:'CANVAS'},preventDefault(){}});};
  return {...f,c,events,elements,key};
}
{
  const {c,key,events}=fixture();
  key('keydown','c','KeyC');assert(c.SETM.m.all);assert(!events.includes('receive'));
  key('keyup','c','KeyC');assert.equal(c.SETM.m,null);
  key('keydown','e','KeyE');assert(!c.walk.setAim);assert(!events.includes('interact'));
  key('keydown','v','KeyV');assert(events.includes('receive'));
  key('keydown','b','KeyB');assert(events.includes('block'));assert(!events.includes('ready'));
  key('keydown','h','KeyH');assert(events.includes('ready'));
  key('keydown','f','KeyF');assert(events.includes('interact'));
  c.VBSettings.bind('q','KeyZ');key('keydown','c','KeyC');assert.equal(c.SETM.m,null);
  key('keydown','z','KeyZ');assert(c.SETM.m.all);key('keyup','z','KeyZ');assert.equal(c.SETM.m,null);
  console.log('PASS wheel Q press/release, E reserved, V/R/F/H and remapped Q');
}
for(const back of [false,true])for(const hold of [0,.45,.9]) {
  const f=fixture(),{c}=f;c.vbManualSetPrepare(back);assert(!c.$('set-charge').hidden);
  c.vbManualSetDown();f.setTime(1000+hold*1000);assert(c.vbManualSetRelease());
  const shot=c.walk.setQ.manual;assert(Math.abs(shot.speed-(11-5.5*hold/.9))<1e-9);
  assert.equal(c.balls.length,0,'charging cannot spawn a ball');
  const b={m:c.newBallMesh(),v:new Vector(0,-1,0),rest:0};b.m.position.set(0,1.92,-.3);c.balls.push(b);
  c.vbSetStep();assert.equal(c.walk.setAim,null);assert.equal(c.walk.setQ,null);
  assert.equal(c.$('set-charge').hidden,true);
  assert.equal(Math.sign(b.v.z),back?1:-1,'Q front / E back');
  assert(Math.abs(b.v.length()-shot.speed)<1e-8);assert(Math.abs(Math.atan2(b.v.y,Math.hypot(b.v.x,b.v.z))-.5)<1e-8);
  assert.equal(f.events.filter(e=>e.type==='set').length,1);
  c.vbSetStep();assert.equal(f.events.filter(e=>e.type==='set').length,1,'one release produces one contact');
}
console.log('PASS actual contact: front/back, short/medium/long hold, pitch angle and single touch');
{
  const f=fixture(),{c}=f;c.vbManualSetPrepare(false);c.vbManualSetDown();f.setTime(1600);c.vbManualSetCancel();assert.equal(c.vbManualSetRelease(),false);assert(!c.walk.setQ);
  c.vbManualSetPrepare(false);c.vbManualSetDown();c.vbManualSetRelease();f.setTime(2200);c.vbSetStep();assert.equal(c.walk.setAim,null);assert(!c.walk.setQ);
  c.vbManualSetPrepare(false);c.vbManualSetDown();c.walk.paused=true;c.vbManualSetRelease();assert.equal(c.walk.setAim,null);
  c.walk.paused=false;c.VM.on=true;c.VM.phase='serve';c.vbManualSetPrepare(false);assert.equal(c.walk.setAim,null);
  console.log('PASS cancel, missing-ball timeout, pause and non-rally guards');
}
{
  const {c,events}=fixture();let grabs=0,serves=0,attacks=0;c.grabBall=()=>{grabs++;};c.startServe=()=>serves++;c.vbHeldAttack=()=>attacks++;c.vbChargeStart=()=>false;c.vbAtServeLine=()=>false;
  c.vbPrimaryDown();assert.equal(grabs,0,'沒有球時按扣球不會自己生球（2026-11-15 使用者要求）');
  c.walk.hold={};c.vbPrimaryDown();assert.equal(attacks,1);assert.equal(serves,0,'inside court is not serving');
  c.vbAtServeLine=()=>true;c.vbPrimaryDown();assert.equal(serves,1);
  c.walk.hold=null;c.VM.on=true;c.VM.phase='rally';c.vbPrimaryDown();assert.equal(grabs,0,'match cannot spawn another ball');
  c.vbManualSetPrepare(false);c.vbPrimaryDown();assert(c.walk.setAim.chargingAt!=null);assert.equal(grabs,0);assert.equal(attacks,1);
  console.log('PASS primary click: practice pickup, held attack, baseline serve, no match ball duplication, set priority');
}
{
  const {c}=fixture();c.state.items=[{id:'court',type:'vb',x:0,z:0,rot:0}];
  for(const [x,z,expected] of [[8.9,0,false],[9.2,0,true],[-10,0,true],[10,4.6,false],[20,0,false]]) { c.walk.x=x;c.walk.z=z;assert.equal(c.vbAtServeLine(),expected); }
  assert(!source('vbHitAttack').includes("walk.keys.has('s')"));
  const tutorial=fs.readFileSync(path.join(root,'js/tutorial.js'),'utf8');assert(tutorial.includes('width: min(340px'));assert(tutorial.includes('font-size: 15px'));
  console.log('PASS serve-area boundaries, S no shot modifier, larger upper-left tutorial panel');
}
