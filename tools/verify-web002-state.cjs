// Deterministic tests for hibernation persistence and browser-side adapters.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
let passed=0;async function check(name,fn){await fn();console.log('PASS '+name);passed++;}
(async()=>{
await check('SQLite-backed storage and attachments restore rooms, salted hashes, chat cap and limits',async()=>{
 let now=100000,stored,ready,alarm;const sockets=[];
 const ctx={blockConcurrencyWhile:fn=>{ready=fn();},setWebSocketAutoResponse(){},getWebSockets:()=>sockets,
 storage:{async get(){return structuredClone(stored);},async put(k,v){stored=structuredClone(v);},async setAlarm(t){alarm=t;},async deleteAlarm(){alarm=null;}}};
 const context={DurableObject:class{constructor(ctx){this.ctx=ctx;}},WebSocketRequestResponsePair:class{},crypto,TextEncoder,Date:{now:()=>now},Response,console};
 vm.runInNewContext(read('rt-worker/src/lobby.js').replace(/import[^\n]+\n/,'').replace('export class Lobby','globalThis.Lobby = class Lobby'),context);
 let lobby=new context.Lobby(ctx,{});await ready;
 const socket=(id,token)=>{let data={id,token,name:'',status:'大廳中',no:null,rateAt:0,rateN:0,chatAt:0,createAt:0};const ws={readyState:1,events:[],serializeAttachment(v){data=structuredClone(v);},deserializeAttachment(){return structuredClone(data);},send(v){this.events.push(JSON.parse(v));}};sockets.push(ws);return ws;};
 const a=socket('test-player','secret-session-token');const send=async(ws,m)=>{await lobby.webSocketMessage(ws,JSON.stringify(m));return ws.events.at(-1);};
 await send(a,{k:'hello',name:'房主',status:'大廳中'});await send(a,{k:'create',name:'持久房',mode:'2v2',password:'密碼原文'});
 const r=stored.rooms[0];assert(r.passwordHash);assert(r.salt);assert(!JSON.stringify(stored).includes('密碼原文'));assert.equal(r.code.length,32);
 for(let i=0;i<55;i++){now+=1001;await send(a,{k:'chat',text:'留言'+i});await send(a,{k:'room-update',no:r.no,count:1,status:'waiting',latency:10});}
 assert.equal(stored.chats.length,50);assert.equal(stored.chats[0].text,'留言5');
 lobby=new context.Lobby(ctx,{});await ready;
 assert.equal(lobby.publicRooms()[0].no,r.no);assert.equal(lobby.players()[0].name,'房主');assert.equal(lobby.data.chats.length,50);
 assert.match((await send(a,{k:'chat',text:'立刻再送'})).reason,/每秒/);
 const b=socket('other-player','another-secret-token');await send(b,{k:'hello',name:'球友',status:'大廳中'});
 const errors=[];for(let i=0;i<14;i++)errors.push(await send(b,{k:'refresh'}));assert(errors.some(x=>x.reason?.includes('太頻繁')));
 const lastNo=stored.next;now+=31000;await lobby.alarm();assert.equal(stored.rooms.length,0);assert.equal(stored.next,lastNo);assert.equal(stored.chats.length,50);assert.equal(alarm,null);
});
await check('lobby URL derivation, localhost-only override, retry and navigation identity',async()=>{
 async function harness(hostname,search,cf){
  const timers=[],sockets=[],states=[],storage=new Map();let requests=0;
  class WS{static OPEN=1;constructor(url){this.url=String(url);this.readyState=0;this.sent=[];sockets.push(this);}send(raw){this.sent.push(raw);}close(){this.readyState=3;this.onclose?.({code:1000});}}
  const window={};const c={window,location:{hostname,search},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},crypto,URL,URLSearchParams,AbortSignal,WebSocket:WS,
   fetch:async()=>{requests++;return {ok:true,json:async()=>({cf})};},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},setInterval:()=>1,clearInterval(){},console};
  vm.runInNewContext(read('lobby-client.js'),c);const api=window.VBLobby,client=api.connect({hello:()=>({name:'測試',status:'大廳中'}),onstate:s=>states.push(s)});
  await new Promise(setImmediate);return {api,client,timers,sockets,states,requests,storage};
 }
 const local=await harness('localhost','?lobby=ws://localhost:8787',null);assert.equal(local.requests,0);assert.equal(new URL(local.sockets[0].url).pathname,'/lobby');
 const remote=await harness('example.com','?lobby=ws://evil.invalid','wss://valid.example/room');assert.equal(remote.requests,1);assert.equal(new URL(remote.sockets[0].url).host,'valid.example');assert.equal(new URL(remote.sockets[0].url).pathname,'/lobby');
 const s=local.sockets[0];s.readyState=1;s.onopen();assert.equal(JSON.parse(s.sent[0]).k,'hello');s.close();assert.equal(local.states.at(-1),'offline');
 const retry=local.timers.at(-1);assert(retry.ms>=1000&&retry.ms<1400);retry.fn();await new Promise(setImmediate);assert.equal(local.sockets.length,2);assert.equal(local.sockets[0].url,local.sockets[1].url);
 const q=new URLSearchParams();local.api.carry(q);assert.equal(q.get('lobby'),'ws://localhost:8787');const q2=new URLSearchParams();remote.api.carry(q2);assert.equal(q2.get('lobby'),null);
 const noConfig=await harness('example.com','',null);assert.equal(noConfig.sockets.length,0);assert.equal(noConfig.states.at(-1),'offline');
});
await check('game heartbeat, member/host transitions, practice and socket failure isolation',()=>{
 let now=100000,tick,options,closed=false;const sent=[],events={};let current={name:'遊戲球友',active:true,practice:false,code:'A'.repeat(32),isHost:false,playing:false,count:2,latency:16};
 const context={window:{},VBLobby:{id:'self',connect(o){options=o;return {send(m){sent.push(m);return true;},close(){closed=true;}};}},Date:{now:()=>now},setInterval:fn=>{tick=fn;return 1;},clearInterval(){},addEventListener:(t,f)=>events[t]=f,console};
 vm.runInNewContext(read('game-lobby.js'),context);context.window.VBGameLobby.start(()=>current);tick();
 options.onmessage({k:'players',players:[{id:'self',no:101}]});assert(!sent.some(m=>m.k==='room-update'));
 current.isHost=true;tick();assert.equal(sent.at(-1).k,'room-update');assert.equal(sent.at(-1).count,2);
 const length=sent.length;now+=9000;tick();assert.equal(sent.length,length);now+=1000;tick();assert.equal(sent.at(-1).k,'room-update');
 current.playing=true;tick();assert.equal(sent.at(-1).status,'playing');current.count=1;tick();assert.equal(sent.at(-1).count,1);
 const before=current;options.onstate('offline');assert.equal(current,before);options.onstate('online');tick();assert.equal(sent.at(-1).k,'room-update');
 current.practice=true;const mark=sent.length;tick();assert.equal(sent.at(-1).status,'練習中');assert(!sent.slice(mark).some(m=>m.k==='room-update'));
 events.pagehide();assert(closed);
});
await check('real lobby handlers: pagination, filtering, safe text, dialogs and joined navigation',()=>{
 class Element {
  constructor(){this.children=[];this.parts={};this.listeners={};this.value='';this.textContent='';this.dataset={};this.classList={toggle(){}};}
  set innerHTML(v){this.html=v;this.children=[];}get innerHTML(){return this.html||'';}
  querySelector(s){return this.parts[s]||=new Element();}
  querySelectorAll(s){return this.children.filter(c=>s==='.'+c.className);}
  addEventListener(e,f){this.listeners[e]=f;}fire(e){this.listeners[e]({preventDefault(){}});}
  append(c){c.parent=this;this.children.push(c);}replaceChildren(){this.children=[];}remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);}
  setAttribute(){}showModal(){this.open=true;}close(){this.open=false;}setCustomValidity(){}reportValidity(){}
 }
 const elements=Object.fromEntries([...read('index.html').matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 elements.filter.value='all';elements.mode.value='2v2';let options;const sent=[];
 const context={document:{getElementById:id=>{assert(elements[id],id);return elements[id];},querySelectorAll:()=>[],createElement:()=>new Element()},
  VBSettings:{values:{nickname:'測試球友'},open(){},nicknameError:()=>'',update:()=>true},VBLobby:{id:'self',carry(){},connect(o){options=o;return {send(m){sent.push(m);return true;},close(){}};}},
  VBIntro:{entered:true},   /* 大廳要進到大廳後才連線（WEB-010 修正：被踢掉、沒登入的分頁不掛在在線名單） */
  location:{search:'?demo=1',href:''},URLSearchParams,addEventListener(){},setTimeout(){},clearTimeout(){},setInterval(){return 1;}};
 vm.runInNewContext(read('lobby.js'),context);
 assert.equal(elements.rooms.children.length,6);options.onstate('online');assert.equal(elements.rooms.children.length,0);
 const rooms=Array.from({length:8},(_,i)=>({no:101+i,name:i===0?'<script>房名</script>':'房'+i,mode:i%2?'6v6':'2v2',count:1,max:20,status:'waiting',locked:i===0,latency:null}));
 const players=Array.from({length:10},(_,i)=>({id:i===9?'self':'p'+i,name:'球友'+i,status:'大廳中'}));
 options.onmessage({k:'state',players,rooms,chats:[{name:'<b>人名</b>',text:'<script>alert(1)</script>'}]});
 assert.equal(elements.rooms.children.length,6);assert.equal(elements.rooms.children[0].querySelector('.room-name').textContent,'<script>房名</script>');
 assert.equal(elements.players.children.length,8);assert(elements.players.children[0].querySelector('strong').textContent.endsWith('（你）'));
 assert.equal(elements.messages.children[0].innerHTML,'');assert(elements.messages.children[0].textContent.includes('<script>'));
 elements['rooms-next'].fire('click');assert.equal(elements.rooms.children.length,2);elements['rooms-prev'].fire('click');
 elements.rooms.children[0].fire('click');assert(elements['password-dialog'].open);elements['join-password'].value='密碼';elements['password-form'].fire('submit');assert.equal(sent.at(-1).k,'join');assert.equal(sent.at(-1).no,101);
 elements.filter.value='6v6';elements.filter.fire('change');assert.equal(elements.rooms.children.length,4);elements.quick.fire('click');assert.equal(sent.at(-1).mode,'6v6');
 elements['room-name'].value='新房';elements.password.value='密碼';elements['room-form'].fire('submit');assert.equal(sent.at(-1).k,'create');assert.equal(elements.password.value,'');
 options.onmessage({k:'joined',no:123,code:'A'.repeat(32),mode:'2v2',host:true});const query=new URL(context.location.href,'https://local.test').searchParams;assert.equal(query.get('room'),'A'.repeat(32));assert.equal(query.get('host'),'1');
 elements.message.value='測試';elements.chat.fire('submit');assert.equal(sent.at(-1).k,'chat');
 elements.practice.fire('click');assert.equal(context.location.href,'gym.html?site=bs-shenjing&practice=1');
});
console.log(`${passed} state/adapter checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
