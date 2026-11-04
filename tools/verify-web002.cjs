// Run with a LOCAL wrangler dev on port 8787. Never points at production.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const WebSocket=require('../rt-worker/node_modules/ws');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8').replaceAll('\r\n','\n');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clients=[];let passed=0;
async function check(label,fn){await fn();console.log('PASS '+label);passed++;}
async function connect(name,identity={id:crypto.randomUUID(),token:crypto.randomUUID()}){
 const ws=new WebSocket(`ws://localhost:8787/lobby?id=${identity.id}&token=${identity.token}`,{origin:'http://localhost:5180'});
 const c={ws,identity,events:[],send:m=>ws.send(JSON.stringify(m)),async wait(test,after=0,timeout=4000){
  const until=Date.now()+timeout;while(Date.now()<until){const found=c.events.slice(after).find(test);if(found)return found;await sleep(15);}throw new Error('Timed out: '+test+'; recent='+JSON.stringify(c.events.slice(-4)));
 },async request(m,k){const mark=c.events.length;c.send(m);return c.wait(x=>x.k===k,mark);}};
 clients.push(c);ws.on('message',raw=>{if(raw.toString()==='pong')return;try{c.events.push(JSON.parse(raw.toString()));}catch(_){}});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});await c.wait(x=>x.k==='state');
 await c.request({k:'hello',name,status:'大廳中'},'players');return c;
}
const update=(r,count=1,status='waiting')=>({k:'room-update',no:r.no,count,status,latency:25});
(async()=>{
 await check('syntax and unchanged Room/v1/gameplay transports',()=>{
  for(const f of ['lobby.js','lobby-client.js','game-lobby.js','rt-worker/src/index.js','rt-worker/src/lobby.js'])execFileSync(process.execPath,['--check','--input-type=module'],{input:read(f)});
  const old=f=>execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'show',`32b65b3:${f}`],{cwd:root,encoding:'utf8',maxBuffer:8e6}).replaceAll('\r\n','\n');
  assert.equal(read('rt-worker/src/index.js').split('export class Room')[1],old('rt-worker/src/index.js').split('export class Room')[1]);
  assert(read('rt-worker/wrangler.toml').includes('tag = "v1"\nnew_sqlite_classes = ["Room"]'));
  const segment=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
  assert.equal(segment(read('gym.html'),'function ablyTransport(', 'function netStatus('),segment(old('gym.html'),'function ablyTransport(', 'function netStatus('));
  assert(!read('index.html').includes('id="join"'));assert(read('lobby.js').includes('p.textContent=`[大廳]'));
 });
 let a,b,observer,room,locked;
 await check('two clients see presence and room creation; public frames contain no secrets',async()=>{
  a=await connect('甲球友');b=await connect('乙球友');observer=await connect('旁觀球友');
  await a.wait(x=>x.k==='players'&&x.players.some(p=>p.id===b.identity.id));
  room=await a.request({k:'create',name:'同步測試房',mode:'2v2'},'joined');assert.match(room.code,/^[A-F0-9]{32}$/);
  const list=await b.wait(x=>x.k==='rooms'&&x.rooms.some(r=>r.no===room.no));
  assert(!JSON.stringify(list).includes(room.code));assert(!JSON.stringify(list).includes(a.identity.token));
  assert(!('code' in list.rooms.find(r=>r.no===room.no)));
  await b.request({k:'join',no:room.no},'joined');await a.wait(x=>x.k==='rooms'&&x.rooms.some(r=>r.no===room.no&&r.count===2));
  const denied=await b.request(update(room,2),'error');assert.match(denied.reason,/只有房主/);
 });
 await check('host disconnect, authorized succession, reconnect and outsider rejection',async()=>{
  a.ws.close();await observer.wait(x=>x.k==='rooms'&&!x.rooms.some(r=>r.no===room.no));
  await b.request(update(room,1),'rooms');const listing=await observer.wait(x=>x.k==='rooms'&&x.rooms.some(r=>r.no===room.no&&r.hostName==='乙球友'));assert(listing);
  assert.match((await observer.request(update(room),'error')).reason,/不是/);
  b.ws.close();b=await connect('乙球友',b.identity);await b.request({k:'status',status:'房間中',code:room.code},'players');await b.request(update(room),'rooms');
 });
 await check('password gate, private joined reply and shared bearer invite',async()=>{
  const host=await connect('密碼房主');locked=await host.request({k:'create',name:'密碼測試',mode:'6v6',password:'不公開密碼'},'joined');
  assert.match((await observer.request({k:'join',no:locked.no,password:'錯誤'},'error')).reason,/密碼錯誤/);
  const outsider=await connect('驗密碼');const before=outsider.events.length;
  const joined=await outsider.request({k:'join',no:locked.no,password:'不公開密碼'},'joined');assert.equal(joined.code,locked.code);
  for(const event of observer.events)assert(!JSON.stringify(event).includes(locked.code));
  for(const event of outsider.events.slice(before).filter(e=>e.k!=='joined'))assert(!JSON.stringify(event).includes(locked.code));
  const invited=await connect('邀請球友');await invited.request({k:'status',status:'房間中',code:locked.code},'players');
  host.keep=setInterval(()=>host.send(update(locked,3)),10000);
 });
 await check('quick chooses fullest waiting unlocked room, respects mode/full/playing',async()=>{
  const h=await connect('快速房主'),quick=await connect('快速球友');
  const r=await h.request({k:'create',name:'人多優先',mode:'2v2'},'joined');await h.request(update(r,5),'rooms');
  assert.equal((await quick.request({k:'quick',mode:'2v2'},'joined')).no,r.no);
  await h.request(update(r,20),'rooms');assert.match((await observer.request({k:'join',no:r.no},'error')).reason,/已滿/);
  await b.request(update(room,1,'playing'),'rooms');assert.match((await observer.request({k:'quick',mode:'2v2'},'error')).reason,/目前沒有/);
  assert.match((await observer.request({k:'quick',mode:'6v6'},'error')).reason,/目前沒有/);
  assert.equal((await observer.request({k:'join',no:room.no},'joined')).no,room.no);
 });
 await check('chat fanout, length/rate rejection, literal markup and history',async()=>{
  // Let previous command burst window expire before checking the chat limiter.
  await sleep(1100);const mark=b.events.length;
  await observer.request({k:'chat',text:'<script>alert(1)</script>\u0000'},'chat');
  assert.equal((await b.wait(x=>x.k==='chat',mark)).chat.text,'<script>alert(1)</script>');
  assert.match((await observer.request({k:'chat',text:'太快'},'error')).reason,/每秒/);
  observer.ws.close();observer=await connect('旁觀球友',observer.identity);
  assert.match((await observer.request({k:'chat',text:'重連仍不能洗頻'},'error')).reason,/每秒/);
  assert.match((await observer.request({k:'chat',text:'長'.repeat(201)},'error')).reason,/200/);
  const late=await connect('晚到球友');assert(late.events.find(e=>e.k==='state').chats.some(c=>c.text==='<script>alert(1)</script>'));
 });
 await check('30 second heartbeat expiry removes even an open host socket',async()=>{
  const h=await connect('逾時房主');const r=await h.request({k:'create',name:'逾時清除',mode:'2v2'},'joined');
  const mark=observer.events.length;const began=Date.now();
  await observer.wait(x=>x.k==='rooms'&&!x.rooms.some(y=>y.no===r.no),mark,33000);
  assert(Date.now()-began>=29000);assert.match((await observer.request({k:'join',no:r.no},'error')).reason,/不存在/);
 });
 console.log(`${passed} integration checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const c of clients){clearInterval(c.keep);c.ws.close();}setTimeout(()=>{for(const c of clients)c.ws.terminate();},100).unref();});
