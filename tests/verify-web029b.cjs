// WEB-029B：不連線的訊息契約與房間狀態往返測試。
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
const lobby=read('js/lobby.js'),party=read('js/lobby-party.js'),ranked=read('js/lobby-ranked.js');
const sent=[],api={canLead:()=>true},send=m=>sent.push(m);
vm.runInNewContext(party.slice(party.indexOf('  api.onStartMatch ='),party.indexOf('  api.leaveParty =')),{api,send});
api.onStartMatch('6v6');api.onCancelMatch();api.onStartAI();
assert.deepEqual(sent.map(m=>JSON.parse(JSON.stringify(m))),[{k:'mm-start',mode:'6v6'},{k:'mm-cancel'},{k:'mm-ai-now'}]);
api.canLead=()=>false;api.onStartMatch('2v2');api.onCancelMatch();assert.equal(sent.length,4);
const stored=new Map(),notices=[],states=[],location={href:''};
const ctx={URLSearchParams,location,sessionStorage:{setItem:(k,v)=>stored.set(k,v)},localStorage:{setItem:(k,v)=>stored.set(k,v)},notify:m=>notices.push(m),window:{PlayOneLobby:{setMatchState:m=>states.push(m)}},VBLobby:{carry:q=>q.set('lobby','ws://test')}};
const handler=lobby.slice(lobby.indexOf(" if(m.k==='mm-status')"),lobby.indexOf(" if(m.k==='party')window"));
function message(m){vm.runInNewContext('(()=>{'+handler+'})()',{...ctx,m});}
message({k:'mm-status',state:'searching',seconds:12,canAI:true});assert.equal(states[0].seconds,12);
message({k:'mm-status',state:'idle',reason:'隊友取消'});message({k:'mm-error',reason:'人數超過'});assert.deepEqual(notices,['隊友取消','人數超過']);
for(const host of [true,false]){
 const m={k:'mm-found',room:'R123',mode:'2v2',me:'p_1-x',host,plan:{count:2,picks:['p_1-x',null,'p2',null]}};
 message(m);assert.deepEqual(JSON.parse(stored.get('vb.ranked')),{room:m.room,mode:m.mode,me:m.me,plan:m.plan});
 const q=new URL(location.href,'https://test/').searchParams;
 for(const [k,v] of Object.entries({site:'bs-shenjing',room:'R123',mode:'2v2',ranked:'1',me:'p_1-x',lobby:'ws://test'}))assert.equal(q.get(k),v);
 assert.equal(q.get('host'),host?'1':null);assert.equal(stored.get('po.lobby.page'),'home');
}
assert.match(ranked,/disabled = !leader && match.state !== 'searching'/);
assert.match(ranked,/!match.canAI/);
console.log('PASS 大廳訊息、隊員取消、sessionStorage、網址與 carry');
let timers=[];
const sandbox={window:{},Date,setTimeout:f=>(timers.push(f),timers.length),clearTimeout(){},setInterval:()=>1,clearInterval(){}};
vm.runInNewContext(read('js/room-settings.js'),sandbox);
function room(id,creator){const messages=[];const r=sandbox.window.createRoomSettings({id,creator,send:m=>messages.push(m),changed(){}});return {r,messages};}
const h=room('h',true);h.r.start();timers.shift()();h.r.join('g');
assert.equal(typeof h.r.startPlanned,'function','尚待套用報告中的 room-settings.js startPlanned（目前寫入被 EPERM 拒絕）');
const g=room('g',false);g.r.receive(h.messages.at(-1),'h');
const plan={count:2,lv:4,to:20,bestOf:3,court:'court1',picks:['h',null,'g',null]};
assert.equal(g.r.startPlanned(plan),false);
for(const invalid of [{picks:['h']},{picks:['h','h',null,null]},{picks:['h','absent',null,null]},{lv:9},{count:7},{to:99},{bestOf:2},{court:null}])assert.equal(h.r.startPlanned({...plan,...invalid}),false);
assert.equal(h.r.startPlanned(plan),true);g.r.receive(h.messages.at(-1),'h');
assert.deepEqual(JSON.parse(JSON.stringify(g.r.snapshot.flow)),{phase:'playing',ready:['h','g'],picks:plan.picks,court:'court1',deadline:0,round:1});
assert.equal(g.r.snapshot.lv,4);assert.equal(g.r.snapshot.to,20);assert.equal(g.r.snapshot.bestOf,3);
for(const picks of [['h'],['h',null,'outsider',null],['h','h',null,null]]){
 const bad=JSON.parse(JSON.stringify(h.messages.at(-1)));bad.revision++;bad.flow.picks=picks;bad.flow.round=99;g.r.receive(bad,'h');assert.equal(g.r.snapshot.flow.round,1);
}
assert.equal(h.r.startPlanned(plan),false);
console.log('PASS startPlanned 房主限制、規則與 receive 驗證');
