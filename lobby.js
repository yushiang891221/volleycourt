'use strict';
const $ = id => document.getElementById(id);
const paths = {
  ball: '<circle cx="12" cy="12" r="10"/><path d="M3 8q10 1 16 11M11 2q-4 9 0 20M4 18q6-9 18-8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  court: '<path d="M3 5h18v14H3zM12 5v14M3 9h18M3 15h18"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8z"/>',
  refresh: '<path d="M20 8a9 9 0 1 0 0 8M20 3v5h-5"/>',
  game: '<path d="M7 7h10q4 0 5 10-1 5-6-1H8q-5 6-6 1Q3 7 7 7ZM7 10v5M4.5 12.5h5M16 11h.1M19 14h.1"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6M19 14q3 1 3 7"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  signal: '<path d="M4 20v-3M9 20v-7M14 20V9M19 20V4"/>',
  link: '<path d="m9 15 6-6M9 7l3-3a5 5 0 0 1 7 7l-3 3M15 17l-3 3a5 5 0 0 1-7-7l3-3"/>',
  chat: '<path d="M3 3h18v14H9l-6 5z"/><path d="M7 8h10M7 12h7"/>',
  megaphone: '<path d="m3 9 17-5v16L3 15zM6 16l2 6h4l-2-5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/>',
  send: '<path d="m2 3 20 9-20 9 4-9zM6 12h16"/>',
  mute: '<path d="M3 9h4l5-5v16l-5-5H3zM17 9l5 6M22 9l-5 6"/>',
  sound: '<path d="M3 9h4l5-5v16l-5-5H3zM16 8q4 4 0 8M19 4q8 8 0 16"/>',
  trophy: '<path d="M7 3h10v7a5 5 0 0 1-10 0zM7 5H3v3q0 4 4 4M17 5h4v3q0 4-4 4M12 15v6M7 21h10"/>',
  rank: '<path d="M2 21V12h6v9M9 21V3h6v18M16 21v-6h6v6"/>',
  shirt: '<path d="m8 3-6 4 3 5 3-2v12h8V10l3 2 3-5-6-4q-4 5-8 0z"/>',
  settings: '<circle cx="12" cy="12" r="4"/><path d="m10 2-1 3-3 1-3-1-2 4 3 2v3l-2 2 2 4 3-1 3 1 1 3h4l1-3 3-1 3 1 2-4-3-2v-3l2-2-2-4-3 1-3-1-1-3z"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.user}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
﻿let nickname=VBSettings.values.nickname, rooms=[], players=[], roomPage=0, playerPage=0, connected=false, selectedRoom=null;
let accounts=null, accountTimer=null;
let sound=false, audioContext;
const demo=new URLSearchParams(location.search).get('demo')==='1';
const samples=Array.from({length:8},(_,i)=>({no:101+i,name:`開發示範練球室 ${i+1}`,mode:i%2?'6v6':'2v2',count:i+1,max:20,status:i%3?'waiting':'playing',locked:i===2,latency:20+i}));
function notify(message){
 $('toast').textContent=message;$('toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').hidden=true,4000);
 // Native dialogs occupy the top layer; display errors inside them too.
 for(const dialog of document.querySelectorAll('dialog[open]')){
  let error=dialog.querySelector('.form-error');
  if(!error){error=document.createElement('p');error.className='form-error';error.setAttribute('role','alert');dialog.querySelector('form').append(error);}
  error.textContent=message;
 }
}
function page(prefix,index,total,size){
 const pages=Math.max(1,Math.ceil(total/size)), current=Math.min(index,pages-1);
 $(prefix+'-page').textContent=`${current+1} / ${pages}`;
 $(prefix+'-prev').disabled=current===0;$(prefix+'-next').disabled=current===pages-1;return current;
}
function offlineStatus(lastSeen, now=Date.now()){
 if(!lastSeen || !Number.isFinite(Date.parse(lastSeen)))return '離線';
 const minutes=Math.max(0,Math.floor((now-Date.parse(lastSeen))/60000));
 return '離線・'+(minutes<5?'剛剛':minutes<60?`${minutes} 分鐘前`:minutes<1440?`${Math.floor(minutes/60)} 小時前`:`${Math.floor(minutes/1440)} 天前`);
}
function mergePlayers(online, accounts, selfId, selfName, now=Date.now()){
 const byName=new Map();
 for(const p of online)byName.set(p.name,{...p,offline:false,self:p.id===selfId});
 for(const a of accounts||[])if(!byName.has(a.nickname))byName.set(a.nickname,{name:a.nickname,last_seen_at:a.last_seen_at,status:offlineStatus(a.last_seen_at,now),offline:true,self:a.nickname===selfName});
 const seen=p=>Date.parse(p.last_seen_at)||0;
 return [...byName.values()].sort((a,b)=>Number(b.self)-Number(a.self)||Number(a.offline)-Number(b.offline)||(a.offline?seen(b)-seen(a):0)||a.name.localeCompare(b.name));
}
async function refreshAccounts(){
 try{
  const {getAccountService}=await import('./auth.js');
  const service=await getAccountService();
  accounts=service?await service.rpc('lobby_accounts'):null;
 }catch{accounts=null;}
 renderPlayers();
}
function startAccountList(){
 if(accountTimer!==null)return;
 import('./last-seen.js').then(({startLastSeen})=>startLastSeen()).catch(()=>{});
 refreshAccounts();
 accountTimer=setInterval(refreshAccounts,2*60*1000);
 setInterval(renderPlayers,60*1000);
}
function renderPlayers(){
 const list=$('players');list.replaceChildren();
 const all=mergePlayers(players,accounts,VBLobby.id,nickname);
 playerPage=page('players',playerPage,all.length,8);
 for(const p of all.slice(playerPage*8,playerPage*8+8)){
  const row=document.createElement('div');row.className='player'+(p.self?' self':'')+(p.offline?' offline':'');
  row.innerHTML=`<span class="avatar">${icon('user')}</span><div class="player-identity"><strong></strong><div class="player-level"></div></div><span class="state"></span>`;
  const label=p.name+(p.self?'（你）':'');row.querySelector('strong').textContent=label;row.querySelector('strong').title='按右鍵查看更多';if(!p.self)row.querySelector('strong').dataset.player=p.name;
  row.querySelector('.player-level').textContent=p.no?`NO.${p.no}`:'';
  const state=row.querySelector('.state');state.textContent=p.status;
  state.classList.toggle('busy',p.status==='比賽中');state.classList.toggle('practice',p.status==='練習中');state.classList.toggle('in-room',p.status==='房間中');list.append(row);
 }
 $('player-count').textContent=accounts===null?`${all.length} 人`:`在線 ${all.filter(p=>!p.offline).length} 人・共 ${all.length} 人`;$('player-note').textContent=connected?'在線狀態由大廳同步':'正在重新連線，名單可能尚未更新';
}
function renderRooms(){
 const target=$('rooms');target.replaceChildren();
 const all=(demo&&!connected?samples:rooms).filter(r=>$('filter').value==='all'||r.mode===$('filter').value);
 roomPage=page('rooms',roomPage,all.length,6);$('room-count').textContent=`（${all.length} / —）`;
 $('list-note').textContent=demo&&!connected?'開發示範 · 非真實房間':connected?'公開房間 · 每房最多 20 人':'尚未連線，房間清單可能已過期';
 if(!all.length){target.innerHTML=`<div class="empty">${icon('ball')}<strong>球場準備好了，等你開局</strong><span>開啟房間，邀請球友一起打球。</span></div>`;return;}
 for(const r of all.slice(roomPage*6,roomPage*6+6)){
  const busy=r.status==='playing',full=r.count>=r.max;
  const card=document.createElement('button');card.className=`room-card${busy?' busy':''}${full?' full':''}`;card.disabled=full;
  // Only fixed template markup; every field received from the server uses textContent.
  card.innerHTML=`<span class="card-top"><b class="card-number"></b><span class="badge"></span><span class="muted">[室內球場]</span>${r.locked?`<span class="lock" aria-label="密碼房">${icon('lock')}</span>`:''}<span class="state${busy?' busy':''}"></span></span><span class="room-name"></span><span class="card-bottom"><span class="occupancy"></span><span class="latency"></span></span>`;
  card.querySelector('.card-number').textContent=`NO.${r.no}`;card.querySelector('.badge').textContent=r.mode;
  card.querySelector('.state').textContent=full?'已滿':busy?'比賽中 · 可觀戰':'等待中';card.querySelector('.room-name').textContent=r.name;
  card.querySelector('.occupancy').textContent=`${r.count} / ${r.max}`;card.querySelector('.latency').textContent=r.latency===null?'延遲待測':`${r.latency}ms`;
  card.title=`房主：${r.hostName||'示範'}${busy?' · 可加入觀戰':''}`;
  card.addEventListener('click',()=>{if(demo&&!connected)return notify('這是示範房間');if(r.locked){selectedRoom=r.no;$('join-password').value='';$('password-dialog').showModal();}else send({k:'join',no:r.no});});target.append(card);
 }
}
function appendChat(c,play=false){
 const p=document.createElement('p');p.className='chat-line';p.textContent=`[大廳] ${c.name}：${c.text}`;$('messages').append(p);
 const lines=$('messages').querySelectorAll('.chat-line');if(lines.length>50)lines[0].remove();$('messages').scrollTop=$('messages').scrollHeight;
 if(play&&sound&&!VBSettings.values.mute&&VBSettings.values.volume>0)try{
  audioContext||=new AudioContext();audioContext.resume();const osc=audioContext.createOscillator(),gain=audioContext.createGain();
  gain.gain.setValueAtTime(.035*VBSettings.values.volume/100,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.12);osc.frequency.value=640;osc.connect(gain).connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+.12);
 }catch(_){}
}
function enter(m){const q=new URLSearchParams({site:'bs-shenjing',room:m.code,mode:m.mode});if(m.host)q.set('host','1');VBLobby.carry(q);location.href=`gym.html?${q}`;}
// 真的進到大廳（登入、取好暱稱之後）才連上大廳名單：被別處登入踢回首頁的分頁、還沒登入的人不會掛在在線名單上
let client=null;
function connectLobby(){if(client)return;startAccountList();client=VBLobby.connect({hello:()=>({name:nickname||'球友',status:'大廳中'}),onstate:state=>{
 connected=state==='online';$('connection-status').textContent=({online:'已連線',connecting:'連線中…',offline:'連不上 · 自動重試中'})[state];$('connection-dot').dataset.state=state;renderRooms();renderPlayers();
},onmessage:m=>{
 if(m.k==='state'){rooms=m.rooms;players=m.players;$('messages').querySelectorAll('.chat-line').forEach(p=>p.remove());m.chats.forEach(c=>appendChat(c));renderRooms();renderPlayers();}
 if(m.k==='rooms'){rooms=m.rooms;renderRooms();}if(m.k==='players'){players=m.players;renderPlayers();}
 if(m.k==='chat')appendChat(m.chat,true);if(m.k==='error')notify(m.reason);if(m.k==='joined')enter(m);
}});}
if(globalThis.VBIntro?.entered)connectLobby();else addEventListener('vb-lobby-enter',connectLobby,{once:true});
function send(m){if(!client||!client.send(m))notify('大廳尚未連線，請稍後再試');}
// WEB-011 好友：底下按鈕開好友面板（在大廳的好友會亮綠點）、在線玩家清單上可以直接加好友
$('friends-open').addEventListener('click', () => import('./friends.js').then(({ openFriendsPanel }) => openFriendsPanel(() => players.map(p => p.name))).catch(() => notify('好友載入失敗，請稍後重試')));
addEventListener('vb-lobby-enter', () => import('./friends.js').then(({ startBadge }) => startBadge()).catch(() => {}), { once: true });
$('ach-open').addEventListener('click', () => import('./character-panel.js').then(({ openAchievementPanel }) => openAchievementPanel()).catch(() => notify('成就載入失敗，請稍後重試')));
$('team-open').addEventListener('click', () => import('./character-panel.js').then(({ openTeamPanel }) => openTeamPanel()).catch(() => notify('球隊載入失敗，請稍後重試')));
$('equip-open').addEventListener('click', () => import('./character-panel.js').then(({ openEquipPanel }) => openEquipPanel()).catch(() => notify('裝備載入失敗，請稍後重試')));
import('./character-panel.js').then(({ mountCharacterCard }) => mountCharacterCard($('character-info'))).catch(() => { const e = $('character-info').querySelector('.me-err'); if (e) e.textContent = '角色資訊載入失敗，請重新整理'; });
$('news-open').addEventListener('click', () => $('lobby-news').showModal());
$('system-settings').addEventListener('click',()=>VBSettings.open());
addEventListener('vb-settings-change',()=>{nickname=VBSettings.values.nickname;send({k:'hello',name:nickname,status:'大廳中'});});
function welcome(){
 const news=$('lobby-news');
 const askForNickname=()=>{if(!nickname)$('nickname').showModal();};
 let seen;
 try { seen=sessionStorage.getItem('vb-lobby-news-seen')==='1'; }
 catch { seen=location.hash==='#lobby'; }
 if(seen){askForNickname();return;}
 news.addEventListener('close',askForNickname,{once:true});
 news.showModal();
 try { sessionStorage.setItem('vb-lobby-news-seen','1'); } catch {}
}
if(globalThis.VBIntro?.entered)welcome();else addEventListener('vb-lobby-enter',welcome,{once:true});
$('nickname').addEventListener('cancel',e=>e.preventDefault());
$('name-form').addEventListener('submit',e=>{e.preventDefault();nickname=$('name').value.trim();const error=VBSettings.nicknameError(nickname);if(error){$('name').setCustomValidity(error);$('name').reportValidity();return;}if(!VBSettings.update({nickname}))notify('瀏覽器無法儲存暱稱');send({k:'hello',name:nickname,status:'大廳中'});$('nickname').close();});
$('name').addEventListener('input',()=>$('name').setCustomValidity(''));
$('filter').addEventListener('change',()=>{roomPage=0;renderRooms();});$('refresh').addEventListener('click',()=>send({k:'refresh'}));
for(const [prefix,render] of [['rooms',renderRooms],['players',renderPlayers]])for(const [direction,step] of [['prev',-1],['next',1]])$(prefix+'-'+direction).addEventListener('click',()=>{if(prefix==='rooms')roomPage+=step;else playerPage+=step;render();});
$('create').addEventListener('click',()=>$('room-dialog').showModal());$('cancel').addEventListener('click',()=>$('room-dialog').close());
$('room-form').addEventListener('submit',e=>{e.preventDefault();send({k:'create',name:$('room-name').value.trim(),mode:$('mode').value,password:$('password').value});$('password').value='';});
$('password-form').addEventListener('submit',e=>{e.preventDefault();send({k:'join',no:selectedRoom,password:$('join-password').value});$('join-password').value='';});$('password-cancel').addEventListener('click',()=>$('password-dialog').close());
$('practice').addEventListener('click',()=>{const q=new URLSearchParams({site:'bs-shenjing',practice:'1'});VBLobby.carry(q);location.href=`gym.html?${q}`;});
$('quick').addEventListener('click',()=>send({k:'quick',mode:$('filter').value}));
document.querySelectorAll('[data-soon]').forEach(b=>b.addEventListener('click',()=>notify(`${b.textContent.trim()}：即將開放`)));
$('sound').addEventListener('click',()=>{sound=!sound;const b=$('sound');b.setAttribute('aria-pressed',String(sound));b.innerHTML=icon(sound?'sound':'mute');b.title=sound?'關閉留言音效':'開啟留言音效';b.setAttribute('aria-label',b.title);});
$('chat').addEventListener('submit',e=>{e.preventDefault();const text=$('message').value.trim();if(text&&client&&client.send({k:'chat',text}))$('message').value='';else if(text)notify('大廳尚未連線，請稍後再試');});
addEventListener('pagehide',()=>client?.close());renderRooms();renderPlayers();
