'use strict';
const $ = id => document.getElementById(id);
let nickname = '';
try { nickname = (localStorage.getItem('vb.mp.name') || '').trim().slice(0,12); } catch (_) {}
const demo = new URLSearchParams(location.search).get('demo') === '1';
const samples = Array.from({length:6},(_,i)=>({code:`COURT${i+1}`,mode:i%2?'6v6':'2v2',name:['午後輕鬆打','一起練配合','週末友誼局','新手歡迎上場','球感練習室','六人默契團'][i],locked:i===2||i===4,busy:i===2||i===4,count:[3,8,4,2,12,6][i],latency:12+i*5}));
function notify(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(notify.timer); notify.timer=setTimeout(()=>$('toast').hidden=true,3000); }
function showName(){ $('player-name').textContent=`${nickname}（你）`; }
if(nickname) showName(); else $('nickname').showModal();
$('nickname').addEventListener('cancel',e=>e.preventDefault());
$('name-form').addEventListener('submit',e=>{e.preventDefault();nickname=$('name').value.trim();if(!nickname){$('name').setCustomValidity('請輸入暱稱');$('name').reportValidity();return;} try {localStorage.setItem('vb.mp.name',nickname);}catch(_){notify('瀏覽器無法儲存暱稱，下次進入需重新輸入');} showName();$('nickname').close();});
$('name').addEventListener('input',()=>$('name').setCustomValidity(''));
function enter(code,mode){ const query=new URLSearchParams({site:'bs-shenjing',room:code,mode});location.href=`gym.html?${query}`; }
function renderRooms(){ const rooms=$('rooms');rooms.replaceChildren();const list=demo?samples.filter(r=>$('filter').value==='all'||r.mode===$('filter').value):[];$('room-count').textContent=`（${list.length}${demo?' · 示範':''}）`;$('list-note').textContent=demo?'開發預覽 · 示範卡片不會建立真實房間':'用房間代碼與朋友一起上場';if(!list.length){rooms.innerHTML='<div class="empty"><span class="ball">◉</span><strong>球場準備好了，等你開局</strong><span>大廳房間清單即將開放。先開啟房間，再把代碼分享給朋友。</span></div>';return;} for(const r of list){ const card=document.createElement('button');card.className='room-card';card.innerHTML=`<span class="card-top"><b>NO.${r.code}</b><span class="badge">${r.mode}</span><span class="muted">[木地板] ${r.locked?'🔒':''}</span><span class="state ${r.busy?'busy':''}">${r.busy?'比賽中':'等待中'}</span></span><span class="room-name">${r.name}</span><span class="card-bottom"><span>♟ ${r.count} / 20</span><span>▴ ${r.latency}ms</span></span>`;card.addEventListener('click',()=>notify('這是示範房間，請開啟房間或用代碼加入'));rooms.append(card);} }
renderRooms();$('filter').addEventListener('change',renderRooms);$('refresh').addEventListener('click',()=>{renderRooms();notify('已重新整理本機大廳');});
$('create').addEventListener('click',()=>$('room-dialog').showModal());$('cancel').addEventListener('click',()=>$('room-dialog').close());
$('room-form').addEventListener('submit',e=>{e.preventDefault();if(!$('room-name').value.trim()){$('room-name').setCustomValidity('請輸入房間名稱');$('room-name').reportValidity();return;}const bytes=crypto.getRandomValues(new Uint8Array(6));const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const code=Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');enter(code,$('mode').value);});
$('room-name').addEventListener('input',()=>$('room-name').setCustomValidity(''));
$('join').addEventListener('submit',e=>{e.preventDefault();enter($('code').value.toUpperCase(),$('join-mode').value);});
$('practice').addEventListener('click',()=>location.href='gym.html?site=bs-shenjing&practice=1');
$('quick').addEventListener('click',()=>notify('快速加入將於大廳服務開放後提供，現在可用代碼加入'));document.querySelectorAll('[data-soon]').forEach(b=>b.addEventListener('click',()=>notify(`${b.textContent.trim()}：即將開放`)));
let sound=false;let audioContext;
$('sound').addEventListener('click',()=>{sound=!sound;$('sound').setAttribute('aria-pressed',String(sound));$('sound').textContent=sound?'♪ 開':'♪ 關';});
$('chat').addEventListener('submit',e=>{e.preventDefault();const message=$('message').value.trim();if(!message)return;const p=document.createElement('p');p.textContent=`[大廳] ${nickname}：${message}`;$('messages').append(p);while($('messages').children.length>102)$('messages').children[2].remove();$('messages').scrollTop=$('messages').scrollHeight;$('message').value='';if(sound){try{audioContext ||= new AudioContext();audioContext.resume();const osc=audioContext.createOscillator(),gain=audioContext.createGain();gain.gain.setValueAtTime(.035,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.12);osc.frequency.value=640;osc.connect(gain).connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+.12);}catch(_){}}});
