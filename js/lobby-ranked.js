// WEB-027 只負責畫面；組隊與配對由後續工作單接回呼。
import { livePreview } from './character-panel.js';
import { preloadAvatars } from './avatar-toy.js';
import { myLookCode } from './appearance.js';
import * as P from './progress.js';
const $ = id => document.getElementById(id);
const read = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const mobile = matchMedia('(pointer: coarse), (max-width: 819px)');
const demo = new URLSearchParams(location.search).get('lobbydemo');
let mode = demo === '6' ? '6v6' : demo === '2' ? '2v2' : read('po.lobby.mode', '2v2');
if (!['2v2', '6v6'].includes(mode)) mode = '2v2';
let members = [], rating = { placed: 0 }, match = { state: 'idle' }, preview;
const nick = () => window.VBSettings?.values.nickname || '球友';
const notice = text => { $('match-note').textContent = text; };
// setParty 的第一筆是自己，其餘依序放入隊友位置；空陣列回復單人。
const api = window.PlayOneLobby = {
  onStartMatch: () => notice('配對功能即將開放'),
  onCancelMatch: () => notice('配對功能即將開放'),
  onStartAI: () => notice('配對功能即將開放'),
  openInvite: () => $('party-invite').showModal(),
  setParty(value) { members = Array.isArray(value) ? value.filter(Boolean).map(m => ({ ...m })) : []; renderParty(); },
  setMyRating(value) { rating = { ...rating, ...value }; renderParty(); },
  setMatchState(value) {
    match = { ...value, state: value?.state === 'searching' ? 'searching' : 'idle' };
    const sec = Math.max(0, Math.floor(Number(match.seconds) || 0));
    $('start-match').textContent = match.state === 'searching' ? `配對中 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} · 取消` : '開始配對';
    notice(match.note || ''); $('match-ai').hidden = match.state !== 'searching' || sec < 10;
    document.querySelectorAll('[data-mode]').forEach(b => { b.disabled = match.state === 'searching'; });
  }
};
function selectPage(page) {
  if (!['home', 'rank', 'custom'].includes(page)) page = 'home';
  for (const name of ['home', 'rank', 'custom']) $(name + '-page').hidden = name !== page;
  document.querySelectorAll('[data-page]').forEach(b => b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'));
  document.body.dataset.lobbyPage = page; save('po.lobby.page', page); preview?.redraw();
}
document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => selectPage(b.dataset.page));
$('tab-locker').onclick = () => $('equip-open').click();
$('party-link').onclick = () => notice('組隊邀請連結即將開放');
$('start-match').onclick = () => match.state === 'searching' ? api.onCancelMatch(mode) : api.onStartMatch(mode);
$('match-ai').onclick = () => api.onStartAI(mode);
function setMode(value) {
  mode = value; save('po.lobby.mode', mode);
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  renderParty();
}
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
function rankText(m) { return Number(m.placed) >= 10 || (m.placed === true) ? `${m.rating ?? 1000} 分 · ${m.tier || '未定段位'}` : `定級中 ${Math.max(0, Math.min(9, Number(m.placed) || 0))}/10`; }
function renderParty() {
  const count = mode === '6v6' ? 6 : 2;
  const me = { id: 'self', name: nick(), look: myLookCode(), isLeader: !members.length, ...members[0], ...rating };
  const party = [me, ...members.slice(1, count)];
  const slots = $('party-slots'); slots.replaceChildren(); slots.dataset.mode = mode; slots.classList.toggle('mobile-party', mobile.matches);
  for (let i = 0; i < count; i++) {
    const m = party[i], el = document.createElement('div'); el.className = `party-slot slot-${i}${i === 0 ? ' is-self' : ''}`;
    if (m) {
      const label = document.createElement('div'); label.className = 'party-label';
      const name = document.createElement('b'); name.textContent = `${m.isLeader ? '♛ 隊長 · ' : ''}${m.name || '球友'}${i === 0 ? '（你）' : ''}`;
      const rank = document.createElement('small'); rank.textContent = i === 0 ? rankText(m) : m.rating != null ? `${m.rating} 分 · ${m.tier || '定級中'}` : '定級中 0/10';
      label.append(name, rank); el.append(label);
      if (mobile.matches && i > 0) { el.classList.add('avatar-card'); const icon = document.createElement('span'); icon.className = 'party-avatar'; icon.textContent = (m.name || '球')[0]; el.prepend(icon); }
      else { const view = document.createElement('div'); view.className = 'party-view'; el.append(view); }
    } else {
      el.classList.add('empty-slot'); const button = document.createElement('button'); button.textContent = '＋'; button.setAttribute('aria-label', `邀請隊友到位置 ${i + 1}`); button.onclick = () => api.openInvite(); el.append(button);
    }
    slots.append(el);
  }
  preview?.setParty(mobile.matches ? party.slice(0, 1) : party);
}
function summary(prog = P.cachedProgress() || {}) {
  const title = P.ACHIEVEMENTS[prog.title]?.title || '未套用稱號';
  $('my-summary').textContent = `${nick()}　Lv${P.levelOf(prog.exp || 0)}　經驗 ${P.expInLevel(prog.exp || 0)} / ${P.EXP_PER_LEVEL}　🪙 ${prog.coins || 0}　${title}`;
}
async function friends() {
  try {
    const list = await (await import('./friends.js')).friendList();
    const online = new Set([...document.querySelectorAll('#players .player:not(.offline) [data-player]')].map(n => n.dataset.player));
    const box = $('lobby-friends'); box.replaceChildren();
    for (const f of list.filter(f => f.state === 'friend' && online.has(f.nickname || f.name))) {
      const row = document.createElement('div'), name = document.createElement('span'), button = document.createElement('button');
      name.textContent = f.nickname || f.name; button.textContent = '邀請'; button.onclick = () => api.openInvite(name.textContent); row.append(name, button); box.append(row);
    }
    if (!box.children.length) box.textContent = '目前沒有在線好友';
  } catch { $('lobby-friends').textContent = '登入後顯示好友'; }
}
if (demo === '2' || demo === '6') members = Array.from({ length: Number(demo) }, (_, i) => ({ id: `demo-${i}`, name: i ? ['小晴', '阿哲', '小宇', '可可', '阿凱'][i - 1] : nick(), rating: 1000 + i * 650, tier: ['新手', '新手', '野場小白', '野場小白', '野場NPC', '野場NPC'][i], isLeader: i === 0, look: myLookCode() }));
setMode(mode); selectPage(read('po.lobby.page', 'home')); summary();
try { preview = livePreview($('party-stage').querySelector('canvas'), null, () => [...document.querySelectorAll('.party-view')]); renderParty(); } catch { notice('角色預覽載入失敗，請重新整理'); }
preloadAvatars().then(renderParty, () => {});
new ResizeObserver(() => preview?.redraw()).observe($('party-stage'));
mobile.addEventListener('change', renderParty);
addEventListener('vb-look-change', renderParty);
addEventListener('vb-settings-change', () => { summary(); renderParty(); });
addEventListener('vb-progress-change', () => summary());
addEventListener('visibilitychange', () => preview?.redraw());
addEventListener('pagehide', () => preview?.dispose(), { once: true });
document.addEventListener('close', e => { if (e.target.id === 'equip-panel') { summary(); renderParty(); } }, true);
function entered() { P.loadProgress().then(p => summary(p || undefined), () => {}); friends(); }
if (globalThis.VBIntro?.entered) entered(); else addEventListener('vb-lobby-enter', entered, { once: true });
new MutationObserver(friends).observe($('players'), { childList: true });

