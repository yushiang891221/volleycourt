// WEB-027 畫面與 WEB-028B 組隊；配對保留後續工作單的回呼。
import { livePreview } from './character-panel.js';
import { preloadAvatars } from './avatar-toy.js';
import { myLookCode } from './appearance.js';
import * as P from './progress.js';
import { installParty } from './lobby-party.js';
import { mountLobbyGym } from './lobby-gym.js';
const $ = id => document.getElementById(id);
const read = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const mobile = matchMedia('(pointer: coarse), (max-width: 819px)');
const demo = new URLSearchParams(location.search).get('lobbydemo');
// 2026-11-24：電腦版的大廳背景是可以走動的球館（js/lobby-gym.js）；手機、或網址 ?lobbygym=0 照舊用照片＋站位角色
const gymMode = window.top === window && !mobile.matches && new URLSearchParams(location.search).get('lobbygym') !== '0';   /* 被放在框框裡時不要再放球館（不會一層套一層） */
let mode = demo === '6' ? '6v6' : demo === '2' ? '2v2' : read('po.lobby.mode', '2v2');
if (!['2v2', '6v6'].includes(mode)) mode = '2v2';
let partyId = null;
const canLead = () => !partyId || !!members[0]?.isLeader;
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
  setPartyInfo(value) { partyId = value.id; if (value.id) setMode(value.mode); },
  getMode: () => mode,
  canLead,
  onMode: value => setMode(value),
  setMyRating(value) { rating = { ...rating, ...value }; renderParty(); },
  setRatings(map) { ratings = map && typeof map === 'object' ? map : null; if (ratings?.[mode]) api.setMyRating(ratings[mode]); },   // WEB-030：伺服器給的兩個模式分數，切模式時換顯示
  setMatchState(value) {
    match = { ...value, state: value?.state === 'searching' ? 'searching' : 'idle' };
    const sec = Math.max(0, Math.floor(Number(match.seconds) || 0));
    $('start-match').textContent = match.state === 'searching' ? `配對中 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} · 取消` : '開始配對';
    notice(match.note || match.reason || ''); $('match-ai').hidden = match.state !== 'searching' || !match.canAI;
    updateControls();
  }
};
function selectPage(page) {
  if (!['home', 'custom'].includes(page)) page = 'home';
  for (const name of ['home', 'custom']) $(name + '-page').hidden = name !== page;
  document.querySelectorAll('[data-page]').forEach(b => b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'));
  document.body.dataset.lobbyPage = page; save('po.lobby.page', page); preview?.redraw();
}
document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => selectPage(b.dataset.page));
$('tab-team').onclick = () => $('team-open').click();
$('rank-open').onclick = () => import('./leaderboard.js').then(m => m.openLeaderboard(mode)).catch(() => notice('排行榜載入失敗，請重新整理'));   // WEB-031   // 球隊放上方分頁；底下的球隊鈕藏起來，沿用它的開啟程式
$('start-match').onclick = () => match.state === 'searching' ? api.onCancelMatch(mode) : canLead() && api.onStartMatch(mode);
$('match-ai').onclick = () => canLead() && api.onStartAI(mode);
let ratings = null;
function setMode(value) {
  mode = value; save('po.lobby.mode', mode);
  if (ratings?.[mode]) rating = { ...rating, ...ratings[mode] };
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  renderParty();
}
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { if (canLead() && match.state !== 'searching') api.onMode(b.dataset.mode); });
function rankText(m) { return Number(m.placed) >= 10 || (m.placed === true) ? `${m.rating ?? 1000} 分 · ${m.tier || '未定段位'}` : `定級中 ${Math.max(0, Math.min(9, Number(m.placed) || 0))}/10`; }
function updateControls() {
  const leader = canLead();
  document.querySelectorAll('[data-mode]').forEach(b => { b.disabled = !leader || match.state === 'searching'; });
  $('start-match').disabled = !leader && match.state !== 'searching';
  if (!leader && match.state !== 'searching') $('start-match').textContent = '等隊長開始';
  else if (match.state !== 'searching') $('start-match').textContent = '開始配對';
  $('match-ai').disabled = !leader;
  $('party-link').disabled = !leader;
}
function renderParty() {
  updateControls();
  const count = mode === '6v6' ? 6 : 2;
  const me = { id: 'self', name: nick(), look: myLookCode(), isLeader: !members.length, ...rating, ...members[0] };
  const party = [me, ...members.slice(1, count)];
  const slots = $('party-slots'); slots.replaceChildren(); slots.dataset.mode = mode; slots.classList.toggle('mobile-party', mobile.matches);
  for (let i = 0; i < count; i++) {
    const m = party[i], el = document.createElement('div'); el.className = `party-slot slot-${i}${i === 0 ? ' is-self' : ''}`;
    if (m) {
      const label = document.createElement('div'); label.className = 'party-label';
      const name = document.createElement('b'); name.textContent = `${m.isLeader ? '♛ 隊長 · ' : ''}${m.name || '球友'}${i === 0 ? '（你）' : ''}`;
      const rank = document.createElement('small'); rank.textContent = m.rating === null ? '定級中' : i === 0 ? rankText(m) : m.rating != null ? `${m.rating} 分 · ${m.tier || '定級中'}` : '定級中 0/10';
      label.append(name, rank);
      if (m.online === false) { const status = document.createElement('small'); status.textContent = '斷線中'; label.append(status); }
      if (partyId && (i === 0 || canLead())) {
        const action = document.createElement('button'); action.className = 'party-action';
        action.textContent = i === 0 ? '離開隊伍' : '請出隊伍';
        action.onclick = () => i === 0 ? api.leaveParty() : api.kickMember(m.id); label.append(action);
      }
      el.append(label);
      if (mobile.matches && i > 0) { el.classList.add('avatar-card'); const icon = document.createElement('span'); icon.className = 'party-avatar'; icon.textContent = (m.name || '球')[0]; el.prepend(icon); }
      else { const view = document.createElement('div'); view.className = 'party-view'; el.append(view); }
    } else {
      el.classList.add('empty-slot'); const button = document.createElement('button'); button.textContent = '＋'; button.setAttribute('aria-label', `邀請隊友到位置 ${i + 1}`); button.disabled = !canLead(); button.onclick = () => api.openInvite(); el.append(button);
    }
    slots.append(el);
  }
  preview?.setParty(mobile.matches ? party.slice(0, 1) : party);
  shown = party;
}
// 大廳炫技：跟遊戲一樣按住 T 開輪盤、滑鼠往左／右／上／下選、放開就做（動作也是遊戲那一份，js/emote-keys.js）；隊友看得到
let shown = [];
function bubble(i, e) {
  const label = document.querySelector(`.party-slot.slot-${i} .party-label`); const em = P.EMOTES[e]; if (!label || !em) return;
  const b = document.createElement('span'); b.className = 'party-emo'; b.textContent = `${em.icon} ${em.name}`; label.append(b); setTimeout(() => b.remove(), 1600);
}
function playEmote(i, e) { if (!P.EMOTES[e]) return; preview?.playEmote(i, e, 1); bubble(i, e); }
api.setRemoteYaw = (id, yaw) => { const i = shown.findIndex((m, n) => n > 0 && m.id === id); if (i > 0) preview?.setYaw(i, yaw); };
api.playRemoteEmote = (id, e) => { const i = shown.findIndex((m, n) => n > 0 && m.id === id); if (i > 0) playEmote(i, e); };
const wheel = { el: null, open: null };
function wheelOpen() {
  if (gymMode || wheel.open || mobile.matches || $('home-page')?.hidden || document.querySelector('dialog[open]') || !shown.length) return;
  const keys = P.myWheel(); if (!keys.length) return;
  if (!wheel.el) { wheel.el = document.createElement('div'); wheel.el.id = 'lobby-wheel'; wheel.el.setAttribute('aria-label', '炫技輪盤'); $('party-stage').append(wheel.el); }
  wheel.el.replaceChildren(...keys.map((k, i) => { const b = document.createElement('button'); b.type = 'button'; b.tabIndex = -1; b.dataset.emo = k; b.dataset.slot = i; b.textContent = `${P.EMOTES[k].icon} ${P.EMOTES[k].name}`; return b; }), Object.assign(document.createElement('i'), { className: 'lw-cur' }));
  wheel.open = { dx: 0, dy: 0, pick: null, keys }; wheel.el.hidden = false; wheelDraw();
}
function wheelMove(dx, dy) {   // 跟遊戲 emoMenuMove 一樣：離中心 25 以內不選，看左右／上下哪個移比較多
  const m = wheel.open; if (!m) return; m.dx = Math.max(-90, Math.min(90, m.dx + dx)); m.dy = Math.max(-70, Math.min(70, m.dy + dy));
  const ax = Math.abs(m.dx), ay = Math.abs(m.dy), slot = Math.max(ax, ay) < 25 ? -1 : ax >= ay ? (m.dx < 0 ? 0 : 1) : (m.dy < 0 ? 2 : 3);
  m.pick = slot >= 0 ? m.keys[slot] || null : null; wheelDraw();
}
function wheelDraw() { const m = wheel.open; if (!m) return; wheel.el.querySelector('.lw-cur').style.transform = `translate(${m.dx}px, ${m.dy}px)`; for (const b of wheel.el.querySelectorAll('[data-emo]')) b.classList.toggle('on', b.dataset.emo === m.pick); }
function wheelClose(ok) { const m = wheel.open; if (!m) return; wheel.open = null; wheel.el.hidden = true; if (ok && m.pick) { playEmote(0, m.pick); api.onSelfEmote?.(m.pick); } }
const typing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
addEventListener('keydown', e => { if (e.code !== 'KeyT' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return; e.preventDefault(); if (!e.repeat) wheelOpen(); });
addEventListener('keyup', e => { if (e.code === 'KeyT') wheelClose(true); });
addEventListener('mousemove', e => { if (wheel.open) wheelMove(e.movementX, e.movementY); });
addEventListener('blur', () => wheelClose(false));
function summary(prog = P.cachedProgress() || {}) {
  const title = P.ACHIEVEMENTS[prog.title]?.title || '未套用稱號';
  $('my-summary').textContent = `${nick()}　Lv${P.levelOf(prog.exp || 0)}　經驗 ${P.expInLevel(prog.exp || 0)} / ${P.EXP_PER_LEVEL}　🪙 ${prog.coins || 0}　${title}`;
}
if (demo === '2' || demo === '6') members = Array.from({ length: Number(demo) }, (_, i) => ({ id: `demo-${i}`, name: i ? ['小晴', '阿哲', '小宇', '可可', '阿凱'][i - 1] : nick(), rating: 1000 + i * 650, tier: ['新手', '新手', '野場小白', '野場小白', '野場NPC', '野場NPC'][i], isLeader: i === 0, look: myLookCode() }));
setMode(mode); selectPage(location.hash === '#lobby' ? 'home' : read('po.lobby.page', 'home')); summary();
if (gymMode) { document.body.classList.add('lobby-gym'); const mountGym = () => mountLobbyGym($('home-page')); if (globalThis.VBIntro?.entered) mountGym(); else addEventListener('vb-lobby-enter', mountGym, { once: true });   /* 登入進大廳後才載球館 */ const h = $('party-stage').querySelector('.stage-hint'); if (h) h.textContent = '點一下球館就能走動：WASD 移動 · 滑鼠拖曳轉視角 · 走到沙發、飲水機按 F 互動 · 按住 T 炫技 · 隊友會一起出現'; renderParty(); }
else try { preview = livePreview($('party-stage').querySelector('canvas'), null, () => [...document.querySelectorAll('.party-view')]); preview.onSelfYaw = (yaw, final) => api.onSelfPose?.(yaw, final); renderParty(); } catch { notice('角色預覽載入失敗，請重新整理'); }
preloadAvatars().then(renderParty, () => {});
new ResizeObserver(() => preview?.redraw()).observe($('party-stage'));
mobile.addEventListener('change', renderParty);
addEventListener('vb-look-change', renderParty);
addEventListener('vb-settings-change', () => { summary(); renderParty(); });
addEventListener('vb-progress-change', () => summary());
addEventListener('visibilitychange', () => preview?.redraw());
addEventListener('pagehide', () => preview?.dispose(), { once: true });
document.addEventListener('close', e => { if (e.target.id === 'equip-panel') { summary(); renderParty(); } }, true);
function entered() { P.loadProgress().then(p => summary(p || undefined), () => {}); }
if (globalThis.VBIntro?.entered) entered(); else addEventListener('vb-lobby-enter', entered, { once: true });
installParty(api, { myLookCode, setMode });

