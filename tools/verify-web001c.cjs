// Node-only checks; no production services. --staged reads prepared integration files.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const {spawnSync,execFileSync} = require('node:child_process');
const root=path.resolve(__dirname,'..'), staged=process.argv.includes('--staged');
const stagedFiles={'gym.html':'gym-next.html','index.html':'index-next.html','lobby.js':'lobby-next.js'};
const read=f=>fs.readFileSync(staged&&stagedFiles[f]?path.join(root,'../tools',stagedFiles[f]):path.join(root,f),'utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
let checks=0;async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
const segment=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,a);return s.slice(i,j);};
const gym=read('gym.html'), prefs=read('settings.js'), room=read('room-settings.js');
function settings(storage=new Map()){
 const events=[];const c={window:{},innerWidth:1366,matchMedia:()=>({matches:false}),localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},dispatchEvent:e=>events.push(e),CustomEvent:class{constructor(type,opt){this.type=type;this.detail=opt.detail;}}};
 vm.runInNewContext(prefs,c);return {p:c.window.VBSettings,storage,events};
}
function network(){
 let now=1000,seq=0;const tasks=new Map(),nodes=new Map(),messages=[];
 const timeout=(fn,ms,repeat=0)=>{const id=++seq;tasks.set(id,{fn,at:now+ms,repeat});return id;};
 const flush=()=>{while(messages.length){const [from,d]=messages.shift();for(const [id,n] of nodes)if(id!==from)n.receive(structuredClone(d),from);}};
 const tick=ms=>{const end=now+ms;while(true){flush();const sorted=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at);if(!sorted.length)break;const [id,t]=sorted[0];tasks.delete(id);now=t.at;t.fn();if(t.repeat)tasks.set(id,{...t,at:now+t.repeat});}now=end;flush();};
 const add=(id,creator=false)=>{const c={window:{},Date:{now:()=>now},setTimeout:(f,m)=>timeout(f,m),clearTimeout:i=>tasks.delete(i),setInterval:(f,m)=>timeout(f,m,m),clearInterval:i=>tasks.delete(i)};vm.runInNewContext(room,c);const n=c.window.createRoomSettings({id,creator,send:d=>messages.push([id,d]),changed:()=>{}});for(const old of nodes.values())old.join(id);nodes.set(id,n);n.start();flush();return n;};
 const leave=id=>{nodes.get(id).close();nodes.delete(id);for(const n of nodes.values())n.leave(id);flush();};
 return {add,tick,leave,flush,nodes};
}
(async()=>{
await check('inline scripts and shared scripts compile',()=>{
 for(const f of ['gym.html','index.html','vbtv.html'])for(const m of read(f).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(/importmap|application\/json|\bsrc=/.test(m[1]))continue;
  const r=spawnSync(process.execPath,['--check',...(/type="module"/.test(m[1])?['--input-type=module']:[])],{input:m[2],encoding:'utf8'});assert.equal(r.status,0,f+': '+r.stderr);
 }
 for(const f of ['settings.js','room-settings.js','lobby.js']){const r=spawnSync(process.execPath,['--check'],{input:read(f),encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
});
await check('migration, defaults, validation, persistence and nickname alias',()=>{
 const storage=new Map([['vb.quality','low'],['vb.fov','90'],['vb.sfx','0'],['vb.mp.name','測試球友']]);const {p,events}=settings(storage);
 assert.equal(p.values.quality,'low');assert.equal(p.values.fov,90);assert(p.values.mute);assert.equal(p.values.sensitivity,1);
 p.update({assist:false,volume:37,sensitivity:2,nickname:' 新名字 '});assert.equal(events.length,1);assert.equal(storage.get('vb.mp.name'),'新名字');
 const again=settings(storage).p;assert.equal(again.values.volume,37);assert.equal(again.values.assist,false);assert.equal(again.values.sensitivity,2);
 again.update({fov:900,volume:-5});assert.equal(again.values.fov,100);assert.equal(again.values.volume,0);
 assert(p.nicknameError('一'));assert(p.nicknameError('ab\n'));assert.equal(p.nicknameError('😀😀'),'');
 for(const raw of ['true','3','[]','null','oops'])assert.equal(settings(new Map([['vb.settings',raw]])).p.values.fov,80);
});
await check('rebind swaps duplicates; old key stops; reset restores every alias',()=>{
 const {p}=settings();const event=(key,code)=>({key,code});
 for(const [a,,code] of p.bindings)assert.equal(p.key(event(a,code)),a);
 assert(p.bind('w','KeyS'));assert.equal(p.key(event('s','KeyS')),'w');assert.equal(p.key(event('w','KeyW')),'s');
 assert(p.bind('e','KeyZ'));assert.equal(p.key(event('e','KeyE')),'');assert.equal(p.key(event('z','KeyZ')),'e');
 assert(!p.bind('e','Escape'));assert(!p.bind('e','F5'));assert.equal(p.key(event('Shift','ShiftRight')),'shift');
 p.update(p.defaults());assert.equal(p.key(event('e','KeyE')),'e');assert.equal(p.key(event('z','KeyZ')),'');assert.equal(p.key(event('q','KeyQ')),'q');
});
await check('real gym key handler respects remapping, keyup and settings guard',()=>{
 const {p}=settings(),listeners={},walk={on:true,keys:new Set(),paused:false},calls={interact:0,receive:0};
 const c={VBSettings:p,walk,RP:{on:false},VM:{on:false},SETM:{m:null},TP:{},performance:{now:()=>0},window:{__rkOn:false},addEventListener:(t,fn)=>listeners[t]=fn,$:()=>({hidden:true}),doInteract:()=>calls.interact++,vbReceive:()=>calls.receive++};
 const block=segment(gym,"addEventListener('keydown', (e) => {\n  if (!walk.on", "addEventListener('blur', () => walk.keys.clear());");vm.runInNewContext(block,c);
 const event=(key,code)=>({key,code,preventDefault(){},target:{tagName:'CANVAS'}});
 p.bind('e','KeyZ');listeners.keydown(event('e','KeyE'));assert.equal(calls.interact,0);listeners.keydown(event('z','KeyZ'));assert.equal(calls.interact,1);
 p.bind('w','KeyI');listeners.keydown(event('i','KeyI'));assert(walk.keys.has('w'));listeners.keyup(event('i','KeyI'));assert(!walk.keys.has('w'));listeners.keydown(event('w','KeyW'));assert(!walk.keys.has('w'));
 listeners.keydown(event('q','KeyQ'));assert.equal(calls.receive,1);
 c.VBSettings={key:p.key,isOpen:true};listeners.keydown(event('z','KeyZ'));assert.equal(calls.interact,1);
 c.VBSettings=p;p.update(p.defaults());listeners.keydown(event('e','KeyE'));assert.equal(calls.interact,2);
});
await check('host-only speed, late join, host departure and ordered succession',()=>{
 const net=network(),a=net.add('a',true);net.tick(1300);assert(a.isHost);a.setSpeed(.55);
 const b=net.add('b');net.tick(1300);assert.equal(b.speed,.55);assert.equal(b.host,'a');assert(!b.setSpeed(1));
 const c=net.add('c',true);net.tick(1300);assert.equal(c.host,'a');assert.equal(c.speed,.55);
 a.setSpeed(1);net.flush();assert.equal(b.speed,1);assert.equal(c.speed,1);
 b.receive({e:'state',order:['c','b','a'],speed:.7,revision:900},'c');assert.equal(b.host,'a');assert.equal(b.speed,1);
 net.leave('a');assert(b.isHost);assert.equal(c.host,'b');assert.equal(c.speed,1);
 b.setSpeed(.7);net.flush();assert.equal(c.speed,.7);net.leave('b');assert(c.isHost);
});
await check('simultaneous discovery chooses creator, then earliest joiner',()=>{
 const net=network(),a=net.add('a',true);net.tick(20);const b=net.add('b');net.tick(20);const c=net.add('c');net.tick(1300);
 assert(a.isHost);assert.equal(b.host,'a');assert.equal(c.host,'a');net.leave('a');assert(b.isHost);assert.equal(c.host,'b');
});
await check('actual localTransport BroadcastChannel carries room rules and departure',async()=>{
 const c={BroadcastChannel,Map,NET:{me:''},netCount(){},setTimeout};vm.runInNewContext(segment(gym,'function localTransport(', '// Cloudflare 房間伺服器'),c);
 const r={window:{},setTimeout,clearTimeout,setInterval,clearInterval,Date};vm.runInNewContext(room,r);const roomId='web001c-'+Date.now();const clients=[];
 async function add(id,creator){const tx=c.localTransport(roomId,id),ctl=r.window.createRoomSettings({id,creator,send:d=>tx.publish('room-settings',d),changed(){}});clients.push({tx,ctl});tx.subscribe((t,d,from)=>{if(t==='room-settings')ctl.receive(d,from);});tx.onPresence((act,from)=>{if(act==='leave')ctl.leave(from);else ctl.join(from);});await tx.enter({n:id});ctl.start();return ctl;}
 try{const a=await add('a',true);await new Promise(r=>setTimeout(r,1300));assert(a.isHost);a.setSpeed(.55);const b=await add('b',false);await new Promise(r=>setTimeout(r,300));assert.equal(b.host,'a');assert.equal(b.speed,.55);a.setSpeed(1);await new Promise(r=>setTimeout(r,50));assert.equal(b.speed,1);clients[0].ctl.close();clients[0].tx.close();await new Promise(r=>setTimeout(r,50));assert(b.isHost);assert.equal(b.speed,1);}finally{for(const {tx,ctl} of clients){ctl.close();try{tx.close();}catch{}}}
});
await check('loading cover is real body DOM, removal follows first 3D render',()=>{
 assert(gym.indexOf('id="game-loading"')<gym.indexOf('id="app"'));assert.equal((gym.match(/id="game-loading"/g)||[]).length,1);
 assert(gym.includes('#plan-host{display:none!important}'));assert(gym.includes("await new Promise(requestAnimationFrame); drawFrame(true);"));
 assert(gym.indexOf("drawFrame(true);\n    entryProgress(100")<gym.indexOf("cover.classList.add('done')"));
 for(const id of ['w-mp','w-quality','w-sfx','w-bspeed','w-assist','w-full','w-plan','mp','mp-name','mp-new','mp-code'])assert(!gym.includes(`id="${id}"`),id);
 assert.equal((segment(gym,'<div class="walk-top">','<div class="room-info">').match(/<button/g)||[]).length,3);
 assert(/if\s*\(m\.host\)q\.set\('host','1'\)/.test(read('lobby.js')));assert(read('index.html').includes('id="system-settings"'));
 for(const f of ['gym.html','index.html'])assert(read(f).includes('src="settings.js"')&&read(f).includes('href="settings.css"'));
});
await check('physics, movement, hit calculations and AI remain unchanged',()=>{
 const old=execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'show','9351dab:gym.html'],{cwd:root,encoding:'utf8',maxBuffer:8e6}).replaceAll('\r\n','\n');
 for(const [a,b] of [['function standUp()','const NET ='],['function vbJump(','const SETM ='],['function vbSet(','function vbAssist('],['function vmStart(','function vmStaRings()']]){
  let current=segment(gym,a,b),previous=segment(old,a,b);
  if(a==='function standUp()')current=current.slice(0,current.indexOf('let ROOM = null;'));
  assert.equal(current,previous,a);
 }
 assert.equal(segment(gym,'function ablyTransport(', 'function netStatus('),segment(old,'function ablyTransport(', 'function netStatus('));
});
console.log(`${checks} checks passed${staged?' (PREPARED FILES; NOT YET APPLIED)':''}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
