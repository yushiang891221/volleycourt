// Deterministic room authority + real engine startup adapters. --ws also requires local Wrangler :8787.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8').replaceAll('\r\n','\n');
const source=read('room-settings.js'),gym=read('gym.html');
let passed=0;async function check(name,fn){await fn();console.log('PASS '+name);passed++;}
function network(){
 let now=1000,seq=0;const timers=new Map(),nodes=new Map(),queue=[],courts=new Map();
 const later=(fn,ms,repeat=0)=>{const id=++seq;timers.set(id,{fn,at:now+ms,repeat});return id;};
 const flush=()=>{let limit=10000;while(queue.length){assert(--limit>0,'message loop');const [from,d]=queue.shift();for(const [id,n] of nodes)if(id!==from)n.receive(structuredClone(d),from);}};
 const tick=ms=>{const end=now+ms;while(true){flush();const next=[...timers].filter(([,x])=>x.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [id,t]=next;now=t.at;timers.delete(id);t.fn();if(t.repeat)timers.set(id,{...t,at:now+t.repeat});}now=end;flush();};
 const add=(id,creator=false,count=2)=>{const c={window:{},Date:{now:()=>now},setTimeout:(f,m)=>later(f,m),setInterval:(f,m)=>later(f,m,m),clearTimeout:i=>timers.delete(i),clearInterval:i=>timers.delete(i)};vm.runInNewContext(source,c);courts.set(id,'court');const n=c.window.createRoomSettings({id,creator,count,send:d=>queue.push([id,d]),changed(){},courtOf:id=>courts.get(id)});for(const old of nodes.values())old.join(id);nodes.set(id,n);n.start();flush();return n;};
 const leave=id=>{nodes.get(id).close();nodes.delete(id);for(const n of nodes.values())n.leave(id);flush();};
 return {add,tick,flush,leave,courts,nodes};
}
const block=(a,b)=>{const i=gym.indexOf(a),j=gym.indexOf(b,i);assert(i>=0&&j>i);return gym.slice(i,j);};
function engine(){
 const VM={ai:new Map()},messages=[];let serves=0;
 const c={VM,vmProSetter:()=>null,vmProLv:()=>false,VB:{ts:.7},STA:{},STA_CFG:{},ROOM:null,VM_OPT:{to:7,to6:25,sets:1,role:'S',lv:1,mate:1},VM_LEVELS:{1:{name:'standard'}},NET:{on:true,name:'房主',peers:new Map([['guest',{n:'球友'}]]),tx:{publish:(t,d)=>messages.push(structuredClone(d))}},scene:{remove(){}},myChar:()=>null,vmMe:()=> 'host',vmStop(){VM.ai.clear();VM.on=false;},vmPickChar:()=>null,
 vmMkAi(id,team,name,color){const a={id,team,name,color,av:{g:{}},tag:{element:{remove(){}}}};VM.ai.set(id,a);VM.names[id]=name;return a;},$:()=>({classList:{add(){}},hidden:false}),vmSetupServe(){serves++;},toast(){},vmName:id=>id,peerTagsAll(){},vm6Spot:()=>({x:1,z:2}),vm6Idx:()=>0,vm6Front:()=>false,roomSpectator:()=>!VM.team.flat().includes('host')};
 vm.createContext(c);vm.runInContext(read('court-formations.js')+block('function vmSmallCount()',"const SITE_ID ="),c);vm.runInContext(block('const V6_ROLES =','// 開局選單'),c);
 vm.runInContext(block('function vmStart(','function vmPickChar(')+block('function vm6Start(','// 輪轉：2 號位'),c);
 return {c,VM,messages,get serves(){return serves;}};
}
module.exports={engine,network,block,read};
if(require.main===module)(async()=>{
 await check('only host changes count; all 1-6 values sync to existing and late members; all modes open',()=>{
  const n=network(),a=n.add('host',true);n.tick(1300);const b=n.add('guest');n.tick(300);
  assert(!b.setCount(6));assert(!a.begin());for(let k=1;k<=6;k++){assert(a.setCount(k));n.flush();assert.equal(b.count,k);a.toggleReady();n.flush();assert.equal(a.begin(),true);assert(!a.setCount(2));a.end();n.flush();}
  a.setCount(6);n.flush();const late=n.add('late');n.tick(300);assert.equal(late.count,6);
  b.receive({e:'state',order:['late','guest','host'],speed:1,count:1,revision:999},'late');assert.equal(b.count,6);
 });
 await check('court readiness, cancellation, capacity, host-only start and unready spectator',()=>{
  const n=network(),a=n.add('a',true);n.tick(1300);const b=n.add('b'),c=n.add('spectator');n.tick(300);
  n.courts.set('b',null);b.toggleReady();n.flush();assert.equal(a.snapshot.flow.ready.length,0);
  a.toggleReady();a.toggleReady();assert.equal(a.snapshot.flow.ready.length,0);a.toggleReady();
  n.courts.set('b','court');b.toggleReady();n.flush();assert(!b.begin());assert(a.begin());n.flush();assert(!c.snapshot.flow.ready.includes('spectator'));assert(!c.pick(0)||!a.snapshot.flow.picks.includes('spectator'));
  n.flush();assert(!a.snapshot.flow.picks.includes('spectator'));assert(!a.setCount(6));
 });
 await check('host serializes conflicting picks, allows change, rejects forged/out-of-range picks; timeout assigns once',()=>{
  const n=network(),a=n.add('a',true);n.tick(1300);const b=n.add('b');n.tick(300);a.toggleReady();b.toggleReady();n.flush();a.begin();n.flush();
  a.pick(0);b.pick(0);n.flush();assert.equal(a.snapshot.flow.picks[0],'a');assert.equal(a.snapshot.flow.picks.filter(Boolean).length,1);
  a.pick(3);n.flush();assert.equal(b.snapshot.flow.picks[0],null);assert.equal(b.snapshot.flow.picks[3],'a');
  assert(!a.pick(99));assert(!a.pick(-1));n.tick(15250);const f=a.snapshot.flow;assert.equal(f.phase,'playing');assert.equal(new Set(f.picks.filter(Boolean)).size,2);assert.equal(f.picks[3],'a');assert.equal(b.snapshot.flow.phase,'playing');assert(!a.setCount(6));
  a.end();n.flush();assert.equal(b.snapshot.flow.phase,'waiting');assert.equal(b.snapshot.flow.ready.length,0);assert(a.setCount(6));
 });
 await check('one ready player can choose any of 12 slots and start early; spectator host is not added',()=>{
  const n=network(),a=n.add('host',true,6);n.tick(1300);const b=n.add('guest');n.tick(300);b.toggleReady();n.flush();a.begin();n.flush();b.pick(10);n.flush();assert.equal(a.snapshot.flow.phase,'playing');assert.equal(a.snapshot.flow.picks[10],'guest');assert.equal(a.snapshot.flow.picks.filter(Boolean).length,1);
  const e=engine();e.c.vm6Start({id:'court',x:0,z:0,rot:0},-1,{},[a.snapshot.flow.picks.slice(0,6),a.snapshot.flow.picks.slice(6)]);
  assert.equal(e.VM.ai.size,11);assert.equal(e.VM.rot[1][4],'guest');assert(!e.VM.team.flat().includes('host'));assert.equal(e.serves,1);
 });
 await check('pick-stage host departure preserves selections/deadline and new host completes; empty pick resets',()=>{
  const n=network(),a=n.add('a',true);n.tick(1300);const b=n.add('b'),c=n.add('c');n.tick(300);a.toggleReady();b.toggleReady();c.toggleReady();n.flush();a.begin();n.flush();b.pick(2);n.flush();const deadline=b.snapshot.flow.deadline;n.leave('a');assert(b.isHost);assert.equal(b.snapshot.flow.deadline,deadline);assert.equal(b.snapshot.flow.picks[2],'b');n.tick(15250);assert.equal(c.snapshot.flow.phase,'playing');
  b.end();b.toggleReady();b.begin();n.flush();n.leave('b');assert.equal(c.snapshot.flow.phase,'waiting');
 });
 await check('actual 2v2 startup respects both teams and exact slots, fills AI, including spectator host',()=>{
  const e=engine();e.c.vmStart({id:'court',x:0,z:0,rot:0},-1,null,[],[[null,'guest'],['host',null]]);
  assert.equal(e.VM.team[0][1],'guest');assert.equal(e.VM.team[1][0],'host');assert.equal(e.VM.ai.size,2);assert.equal(e.messages.at(-1).team[1][0],'host');
  e.c.vmStart({id:'court'},-1,null,[],[[null,'guest'],[null,null]]);assert.equal(e.VM.ai.size,3);assert(!e.VM.team.flat().includes('host'));
 });
 await check('room adapter keeps right-side host on engine team 0 without moving selected physical side',()=>{
  const calls=[],walk={keys:new Set()},c={VB:{},ROOM_UI:null,roomLaunched:-1,roomPlaced:-1,walk,state:{items:[{id:'court'}]},VM:{on:false},NET:{tx:{publish(){}}},renderRoomRules(){},peerTagsAll(){},vmMe:()=> 'host',vmApplyRoomRules(){},toWorldOf:(c,x,z)=>[x,z],vmStart:(...args)=>calls.push(args),vm6Start:(...args)=>calls.push(args)};
  vm.runInNewContext(block('function roomRulesChanged(','function roomSpectator('),c);
  const rules={isHost:true,speed:.7,count:2,flow:{phase:'playing',round:1,court:'court',picks:['guest',null,null,'host']}};
  c.roomRulesChanged(rules);assert.equal(calls[0][1],1);assert.equal(calls[0][4][0][1],'host');assert.equal(calls[0][4][1][0],'guest');assert(walk.x>0);c.roomRulesChanged(rules);assert.equal(calls.length,1);
 });
 await check('spectator boundary and real E handler preserve seating/monitor interaction, block ball actions',()=>{
  const walk={on:true,x:0,z:0,keys:new Set()},calls=[];
  const c={VM:{on:true,team:[['a'],['b']],c:{}},walk,vmMe:()=> 'spectator',vmTeamOf:()=>-1,vmL:(x,z)=>[x,z],vmW:(x,z)=>[x,z]};
  vm.runInNewContext(block('function roomSpectator()','function isRoomHost()'),c);c.roomKeepSpectatorOut();assert.equal(walk.z,5.7);walk.x=30;walk.z=0;c.roomKeepSpectatorOut();assert.equal(walk.x,30);
  Object.assign(c,{VBSettings:{isOpen:false,key:e=>e.key},ROOM_UI:null,RP:{on:false},window:{},addEventListener:(k,fn)=>c[k]=fn,performance:{now:()=>0},$:()=>({hidden:true}),doInteract:()=>calls.push('interact'),vmFreeBall:()=>calls.push('ball'),vbReceive:()=>calls.push('receive')});
  vm.runInNewContext(block("addEventListener('keydown', (e) => {\n  if (!walk.on","addEventListener('blur', () => walk.keys.clear());"),c);
  const press=key=>c.keydown({key,preventDefault(){},target:{tagName:'CANVAS'}});
  walk.focus={kind:'item'};press('e');assert.deepEqual(calls,['interact']);walk.focus=null;press('e');press('v');assert.deepEqual(calls,['interact']);
 });
 await check('late match snapshot requests are host-only; UI and six modes compile',()=>{
  new vm.Script(read('room-flow-ui.js'));for(let k=1;k<=6;k++)assert(read('index.html').includes(`<option${k===2?' selected':''}>${k}v${k}</option>`));
  assert(gym.includes("t === 'room-match-sync'"));assert(gym.includes('from !== ROOM.host'));assert(read('room-flow-ui.js').includes('panel.showModal()'));
 });
 if(process.argv.includes('--ws'))await live();
 console.log(`${passed} WEB-003A checks passed (not browser visual verification)`);
})().catch(e=>{console.error(e);process.exitCode=1;});

async function live(){
 const WebSocket=require('../rt-worker/node_modules/ws'),clients=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async test=>{for(let n=0;n<200;n++){if(test())return;await pause(20);}throw Error('WebSocket timeout');};
 async function connect(route,id){
  const ws=new WebSocket(`ws://localhost:8787/${route}${route==='lobby'?'?id='+id+'&token='+crypto.randomUUID():'?id='+id}`,{origin:'http://localhost:5180'}),events=[];
  clients.push(ws);ws.on('message',d=>{if(String(d)!=='pong')events.push(JSON.parse(d));});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
  return {ws,events,send:d=>ws.send(JSON.stringify(d)),async request(d,kind){const start=events.length;this.send(d);await until(()=>events.slice(start).some(e=>e.k===kind));return events.slice(start).find(e=>e.k===kind);}};
 }
 try{
  await check('real local Lobby accepts 1-6 and broadcasts mode changes, rejects mismatched modes',async()=>{
   for(let k=1;k<=6;k++){
    const c=await connect('lobby',crypto.randomUUID());await c.request({k:'hello',name:'本機測試',status:'大廳中'},'players');
    const r=await c.request({k:'create',name:'WEB003A',mode:`${k}v${k}`},'joined');assert.equal(r.mode,`${k}v${k}`);
    const next=k%6+1,update={k:'room-update',no:r.no,count:1,status:'waiting',latency:10,mode:`${next}v${next}`};
    const state=await c.request(update,'rooms');assert.equal(state.rooms.find(x=>x.no===r.no).mode,update.mode);
    assert.equal((await c.request({...update,mode:'2v6'},'error')).k,'error');
   }
  });
  await check('three real Room WebSockets carry ready/pick authority, spectator and host handover',async()=>{
   const room='room/WEB003A'+Date.now(),nodes=[];
   async function node(id,creator=false){const conn=await connect(room,id),c={window:{},Date,setTimeout,clearTimeout,setInterval,clearInterval};vm.runInNewContext(source,c);
    const ctl=c.window.createRoomSettings({id,creator,count:6,courtOf:()=> 'court',changed(){},send:d=>conn.send({k:'m',t:'room-settings',d})});
    conn.ws.on('message',raw=>{if(String(raw)==='pong')return;const m=JSON.parse(raw);if(m.k==='m'&&m.t==='room-settings')ctl.receive(m.d,m.f);if(m.k==='p'&&m.id!==id){if(m.a==='leave')ctl.leave(m.id);else ctl.join(m.id);}});
    conn.send({k:'enter',d:{n:id,c:'#fff'}});ctl.start();nodes.push({ctl,...conn});return nodes.at(-1);
   }
   try{
    const a=await node('host',true);await until(()=>a.ctl.isHost);const b=await node('guest'),s=await node('spectator');await until(()=>b.ctl.host==='host'&&s.ctl.host==='host');
    a.ctl.toggleReady();b.ctl.toggleReady();await until(()=>a.ctl.snapshot.flow.ready.length===2);a.ctl.begin();await until(()=>b.ctl.snapshot.flow.phase==='pick');
    b.ctl.pick(10);await until(()=>a.ctl.snapshot.flow.picks[10]==='guest');assert(!s.ctl.snapshot.flow.ready.includes('spectator'));
    a.ctl.close();a.ws.close();await until(()=>b.ctl.isHost);await until(()=>b.ctl.snapshot.flow.phase==='playing');assert.equal(b.ctl.snapshot.flow.picks[10],'guest');assert.equal(b.ctl.snapshot.flow.picks.filter(Boolean).length,1);
   }finally{for(const n of nodes)n.ctl.close();}
  });
 }finally{for(const ws of clients)ws.close();}
}
