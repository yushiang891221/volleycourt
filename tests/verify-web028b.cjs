// WEB-028B：獨立前端結構與事件檢查，不替代 verify-web028 的伺服器測試。
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('js/lobby-party.js', 'utf8');
const ranked = fs.readFileSync('js/lobby-ranked.js', 'utf8'), lobby = fs.readFileSync('js/lobby.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8'), css = fs.readFileSync('css/lobby-ranked.css', 'utf8');
for (const id of ['party-incoming', 'party-accept', 'party-decline', 'party-countdown', 'party-copy-url']) assert(html.includes(`id="${id}"`), id);
for (const text of ['等隊長開始', '斷線中', '請出隊伍', '離開隊伍', "m.rating === null ? '定級中'", 'canLead() && (match.state']) assert(ranked.includes(text), text);
assert(css.includes('pointer-events:auto; min-height:44px'));
assert(lobby.includes("queueMicrotask(()=>{if(client?.send({k:'party-sync'}))"));
// 真實 connector 的 onstate 在 hello 前同步呼叫，組隊同步使用微任務延後。
const socket = fs.readFileSync('js/lobby-client.js', 'utf8');
assert(socket.includes("onstate('online');send({k:'hello',...hello()});"));
class Element {
  constructor(){ this.children=[]; this.events={}; this.open=false; this.value=''; }
  append(...nodes){ this.children.push(...nodes); }
  replaceChildren(){ this.children=[]; }
  addEventListener(k, fn){ this.events[k]=fn; }
  showModal(){ this.open=true; }
  close(){ this.open=false; }
  focus(){} select(){} setAttribute(){}
}
(async () => {
  const elements = new Map(), events = {}, sent = [], notices = [], saved = new Map();
  const get = id => { if(!elements.has(id))elements.set(id,new Element());return elements.get(id); };
  let now=1000, interval, storageFails=false, mode='2v2', partyInfo, rendered;
  const api={ getMode:()=>mode, canLead:()=>!partyInfo?.id || !!rendered?.[0]?.leader, setPartyInfo:m=>{partyInfo=m;mode=m.mode||mode;}, setParty:m=>{rendered=m;} };
  const bridge={ready:true,players:[{id:'self',name:'自己',status:'大廳中'},{id:'remote-42',name:'好友',status:'大廳中'},{id:'busy',name:'比賽者',status:'比賽中'}],send:m=>{sent.push(m);return true;},notify:t=>notices.push(t)};
  const location={href:'https://example.com/index.html?party=ABC&keep=1#lobby'};
  const context={window:{VBPartyBridge:bridge,VBLobby:{id:'self'},PlayOneLobby:api},document:{getElementById:get,createElement:()=>new Element()},location,URL,
    history:{state:null,replaceState:(s,t,url)=>{location.href=url;}},navigator:{clipboard:{writeText:async()=>{throw Error('denied');}}},
    localStorage:{getItem:k=>{if(storageFails)throw Error();return saved.get(k);},setItem:(k,v)=>{if(storageFails)throw Error();saved.set(k,v);}},
    Date:{now:()=>now},setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{interval=null;},
    addEventListener:(k,fn)=>{events[k]=fn;},MutationObserver:class{observe(){}},
    friendList:async()=>[{state:'friend',nickname:'好友'}],teamApi:async()=>({members:[{nickname:'好友'}]})};
  vm.createContext(context);
  vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replace('export function installParty','function installParty'),context);
  context.installParty(api,{myLookCode:()=> 'LOOK',setMode:value=>{mode=value;}});
  assert.equal(sent[0].k,'party-join-code'); assert.equal(sent[0].look,'LOOK');
  assert.equal(new URL(location.href).searchParams.get('party'),null); assert.equal(new URL(location.href).searchParams.get('keep'),'1');
  const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));}; await flush();
  api.openInvite('好友'); assert.equal(sent.at(-1).to,'remote-42'); assert.equal(sent.at(-1).look,'LOOK');
  const count=sent.length;api.openInvite('比賽者');assert.equal(sent.length,count);
  const emit=async m=>{events['vb-party-message']({detail:m});await flush();};
  const members=[{id:'leader',name:'隊長',leader:true,self:false,online:false,rating:null},{id:'self',name:'自己',leader:false,self:true,rating:null},{id:'third',name:'第三人'}];
  await emit({k:'party',id:'P',mode:'6v6',members});
  assert.equal(rendered[0].id,'self');assert.equal(rendered[1].id,'leader');assert.equal(rendered[2].id,'third');assert.equal(rendered[1].isLeader,true);assert.equal(rendered[1].online,false);
  assert(saved.get('po.party.recent').includes('隊長'));
  const before=sent.length;api.onMode('2v2');api.kickMember('third');assert.equal(sent.length,before);
  api.leaveParty();assert.equal(sent.at(-1).k,'party-leave');
  await emit({k:'party',id:null,members:[]});api.onMode('2v2');assert.equal(mode,'2v2');assert.equal(sent.at(-1).k,'party-leave');
  members[1].leader=true;members[0].leader=false;storageFails=true;
  await emit({k:'party',id:'P',mode:'6v6',members});api.onMode('2v2');assert.equal(sent.at(-1).k,'party-mode');assert.equal(mode,'6v6');
  api.kickMember('third');assert.equal(sent.at(-1).id,'third');
  events['vb-look-change']();assert.equal(sent.at(-1).k,'party-look');
  await emit({k:'party-invited',partyId:'X',from:'球友',mode:'2v2',expiresIn:30000});
  assert(get('party-incoming').open);assert(get('party-incoming-title').textContent.includes('球友 邀請你一起打 2 對 2'));
  get('party-accept').onclick();assert.equal(sent.at(-1).k,'party-accept');assert.equal(sent.at(-1).look,'LOOK');assert(!get('party-incoming').open);
  await emit({k:'party-invited',partyId:'Y',from:'球友',mode:'6v6',expiresIn:30000});get('party-decline').onclick();assert.equal(sent.at(-1).k,'party-decline');
  await emit({k:'party-invited',partyId:'Z',from:'球友',mode:'6v6',expiresIn:30000});now+=30001;interval();assert(!get('party-incoming').open);
  await emit({k:'party-error',reason:'邀請已過期'});assert.equal(notices.at(-1),'邀請已過期');
  await emit({k:'party-link',code:'A B'});assert.equal(new URL(get('party-copy-url').value).searchParams.get('party'),'A B');assert(get('party-copy').open);
  events['vb-party-ready']();assert.equal(sent.filter(m=>m.k==='party-join-code').length,1);
  console.log('WEB-028B 結構、在線 ID、隊伍順序、權限、外觀、邀請倒數、連結與儲存失敗檢查通過');
})().catch(e=>{console.error(e);process.exitCode=1;});
