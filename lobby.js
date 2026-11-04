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
let nickname = VBSettings.values.nickname;
$('system-settings').addEventListener('click', () => VBSettings.open());
addEventListener('vb-settings-change', () => { nickname = VBSettings.values.nickname; renderPlayers(); });
const demo = new URLSearchParams(location.search).get('demo') === '1';
// Preview-only fixtures. Normal visits show no fabricated rooms, players, levels or latency.
const samples = [
  { no: 101, mode: '2v2', name: '午後輕鬆打・一起暖身', count: 3, latency: 16 },
  { no: 102, mode: '6v6', name: '六人默契團，缺你一位', count: 8, latency: 23 },
  { no: 103, mode: '2v2', name: '週末友誼局', count: 4, latency: 32, locked: true, busy: true },
  { no: 104, mode: '6v6', name: '新手歡迎！慢慢練配合', count: 2, latency: 18 },
  { no: 105, mode: '6v6', name: '夜間練球・攻防練習室', count: 12, latency: 45, locked: true, busy: true },
  { no: 106, mode: '2v2', name: '下一球，我們接起來', count: 3, latency: 26 },
];
function notify(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(notify.timer); notify.timer = setTimeout(() => { $('toast').hidden = true; }, 3000);
}
function renderPlayers() {
  const list = $('players'); list.replaceChildren();
  const players = [{ name: nickname || '球友', self: true, state: '大廳中', level: '等級尚未開放' }];
  if (demo) players.push(...[
    ['海風接球員', 28, '比賽中'], ['週三練球', 16, '大廳中'], ['橘色護膝', 32, '練習中'],
    ['一傳到位', 21, '大廳中'], ['星夜舉球手', 45, '比賽中'], ['球不落地', 12, '大廳中'], ['跳躍的節拍', 37, '練習中'],
  ].map(([name, level, state]) => ({ name, level: `Lv.${level} · 示範`, state })));
  for (const player of players) {
    const row = document.createElement('div'); row.className = `player${player.self ? ' self' : ''}`;
    row.innerHTML = `<span class="avatar">${icon('user')}</span><div class="player-identity"><strong></strong><div class="player-level"></div></div><span class="state"></span>`;
    const label = player.name + (player.self ? '（你）' : '');
    row.querySelector('strong').textContent = label; row.querySelector('strong').title = label;
    row.querySelector('.player-level').textContent = player.level;
    const state = row.querySelector('.state'); state.textContent = player.state;
    if (player.state === '比賽中') state.classList.add('busy');
    if (player.state === '練習中') state.classList.add('practice');
    list.append(row);
  }
  $('player-count').textContent = demo ? '8 人 · 示範' : '1 人 · 本機';
  $('player-note').textContent = demo ? '開發預覽 · 其餘玩家與等級均為示範資料' : '目前只顯示你自己 · 在線名單即將開放';
}
renderPlayers();
if (!nickname) $('nickname').showModal();
$('nickname').addEventListener('cancel', e => e.preventDefault());
$('name-form').addEventListener('submit', e => {
  e.preventDefault(); nickname = $('name').value.trim();
  const error = VBSettings.nicknameError(nickname);
  if (error) { $('name').setCustomValidity(error); $('name').reportValidity(); return; }
  if (!VBSettings.update({ nickname })) notify('瀏覽器無法儲存暱稱，下次進入需重新輸入');
  renderPlayers(); $('nickname').close();
});
$('name').addEventListener('input', () => $('name').setCustomValidity(''));
function enter(code, mode, host = false) {
  const query = new URLSearchParams({ site: 'bs-shenjing', room: code, mode });
  if (host) query.set('host', '1');
  location.href = `gym.html?${query}`;
}
function renderRooms() {
  const rooms = $('rooms'); rooms.replaceChildren();
  const list = demo ? samples.filter(r => $('filter').value === 'all' || r.mode === $('filter').value) : [];
  $('room-count').textContent = `（${list.length} / ${demo ? '24 · 示範' : '—'}）`;
  $('list-note').textContent = demo ? '開發預覽 · 卡片僅供樣式展示' : '用房間代碼與朋友一起上場';
  if (!list.length) {
    rooms.innerHTML = `<div class="empty">${icon('ball')}<strong>球場準備好了，等你開局</strong><span>先開啟房間，再把代碼分享給朋友。</span><span class="muted">公開房間列表即將開放</span></div>`;
    return;
  }
  for (const r of list) {
    const card = document.createElement('button'); card.className = `room-card${r.busy ? ' busy' : ''}`;
    card.innerHTML = `<span class="card-top"><b class="card-number">NO.${r.no}</b><span class="badge">${r.mode}</span><span class="muted">[室內球場]</span>${r.locked ? `<span class="lock" aria-label="密碼房">${icon('lock')}</span>` : ''}<span class="state${r.busy ? ' busy' : ''}">${r.busy ? '比賽中' : '等待中'}</span></span><span class="room-name"></span><span class="card-bottom"><span>${icon('users')}${r.count} / 20</span><span class="latency">${icon('signal')}${r.latency}ms</span></span>`;
    card.querySelector('.room-name').textContent = r.name;
    card.addEventListener('click', () => notify('這是示範房間，請開啟房間或用代碼加入'));
    rooms.append(card);
  }
}
renderRooms();
$('filter').addEventListener('change', renderRooms);
$('refresh').addEventListener('click', () => { renderRooms(); notify('已重新整理本機大廳'); });
$('create').addEventListener('click', () => $('room-dialog').showModal());
$('cancel').addEventListener('click', () => $('room-dialog').close());
$('room-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('room-name').value.trim();
  if (!name) { $('room-name').setCustomValidity('請輸入房間名稱'); $('room-name').reportValidity(); return; }
  const bytes = crypto.getRandomValues(new Uint8Array(6)), alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  // Keep the local room label for WEB-002; passwords are deliberately not persisted.
  try { sessionStorage.setItem('vb.room.draft', JSON.stringify({ code, name, mode: $('mode').value })); } catch (_) {}
  enter(code, $('mode').value, true);
});
$('room-name').addEventListener('input', () => $('room-name').setCustomValidity(''));
$('join').addEventListener('submit', e => { e.preventDefault(); enter($('code').value.toUpperCase(), $('join-mode').value); });
$('practice').addEventListener('click', () => { location.href = 'gym.html?site=bs-shenjing&practice=1'; });
$('quick').addEventListener('click', () => notify('快速加入即將開放，現在可用代碼加入'));
document.querySelectorAll('[data-soon]').forEach(b => b.addEventListener('click', () => notify(`${b.textContent.trim()}：即將開放`)));
let sound = false, audioContext;
$('sound').addEventListener('click', () => {
  sound = !sound; const button = $('sound');
  button.setAttribute('aria-pressed', String(sound)); button.innerHTML = icon(sound ? 'sound' : 'mute');
  button.title = sound ? '關閉留言音效' : '開啟留言音效'; button.setAttribute('aria-label', button.title);
});
$('chat').addEventListener('submit', e => {
  e.preventDefault(); const message = $('message').value.trim(); if (!message) return;
  const p = document.createElement('p'); p.textContent = `[大廳] ${nickname}：${message}`;
  $('messages').append(p);
  while ($('messages').children.length > 102) $('messages').children[2].remove();
  $('messages').scrollTop = $('messages').scrollHeight; $('message').value = '';
  if (sound && !VBSettings.values.mute && VBSettings.values.volume > 0) try {
    audioContext ||= new AudioContext(); audioContext.resume();
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    gain.gain.setValueAtTime(.035 * VBSettings.values.volume / 100, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .12);
    osc.frequency.value = 640; osc.connect(gain).connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + .12);
  } catch (_) {}
});
