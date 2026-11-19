// WEB-031 天梯排行榜：大廳底下「天梯排行榜」按鈕打開。2 對 2、6 對 6 兩個榜，各分全服／好友／球隊。
// 每列只顯示：名次、頭像、名稱、段位、分數（使用者 2026-11-18 定）；右鍵（手機長按）打開個人檔案。
import { tierOf, tierIcon } from './ranks.js';
import { getAccountService, authMode } from './auth.js';

const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SCOPES = [['all', '全服'], ['friends', '好友'], ['team', '球隊']];
let avatarQueue = Promise.resolve();

function row(r, me) {
  const tier = tierOf(r.rating), top = r.rank <= 3 ? ` top${r.rank}` : '';
  return `<li class="rb-row${me ? ' me' : ''}" data-name="${esc(r.name)}" tabindex="0">
    <b class="rb-rank${top}">${r.rank ?? '—'}</b>
    <img class="rb-avatar" alt="" data-look="${esc(r.look || '')}">
    <span class="rb-who"><strong>${esc(r.name || '球友')}</strong><small>${tierIcon(tier)} ${esc(tier)}</small></span>
    <em class="rb-score">${r.rating}</em></li>`;
}

function avatars(box) {
  const imgs = [...box.querySelectorAll('img.rb-avatar[data-look]')].filter(i => i.dataset.look).slice(0, 30);   // 只畫前 30 個（每個頭像要開一次 3D）
  avatarQueue = avatarQueue.then(async () => {
    const { preview } = await import('./character-panel.js');
    for (const img of imgs) { if (!img.isConnected) continue; try { preview(img, img.dataset.look, { w: 64, h: 80, tight: true, jersey: 'orange' }); } catch (_) { /* 畫不出來就留預設頭像 */ } await new Promise(r => setTimeout(r, 0)); }
  }).catch(() => {});
}

function profileOn(list) {
  const open = el => { const name = el?.closest('.rb-row')?.dataset.name; if (name) import('./public-profile.js').then(m => m.openPublicProfile(name)); };
  list.addEventListener('contextmenu', e => { if (e.target.closest('.rb-row')) { e.preventDefault(); open(e.target); } });
  let timer = 0;   // 手機長按 0.5 秒
  list.addEventListener('touchstart', e => { const t = e.target; clearTimeout(timer); timer = setTimeout(() => open(t), 500); }, { passive: true });
  for (const ev of ['touchend', 'touchmove', 'touchcancel']) list.addEventListener(ev, () => clearTimeout(timer), { passive: true });
}

export async function openLeaderboard(mode = '2v2') {
  let d = document.getElementById('rank-board');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'rank-board'; d.setAttribute('aria-label', '天梯排行榜');
    d.innerHTML = `<header><h2>天梯排行榜</h2><form method="dialog"><button aria-label="關閉">✕</button></form></header>
      <nav class="rb-modes"><button type="button" data-mode="2v2">2 對 2</button><button type="button" data-mode="6v6">6 對 6</button></nav>
      <nav class="rb-scopes">${SCOPES.map(([k, t]) => `<button type="button" data-scope="${k}">${t}</button>`).join('')}</nav>
      <p class="rb-hint">右鍵（手機長按）看個人檔案</p>
      <ol class="rb-list" aria-live="polite"></ol><div class="rb-me"></div>`;
    document.body.append(d);
    profileOn(d.querySelector('.rb-list')); profileOn(d.querySelector('.rb-me'));
    d.addEventListener('click', e => {
      const m = e.target.closest('[data-mode]'), s = e.target.closest('[data-scope]');
      if (m) { d.dataset.mode = m.dataset.mode; load(d); } else if (s) { d.dataset.scope = s.dataset.scope; load(d); }
    });
  }
  d.dataset.mode = ['2v2', '6v6'].includes(mode) ? mode : '2v2'; d.dataset.scope = d.dataset.scope || 'all';
  if (!d.open) d.showModal();
  load(d);
}

async function load(d) {
  const mode = d.dataset.mode, scope = d.dataset.scope, list = d.querySelector('.rb-list'), me = d.querySelector('.rb-me');
  d.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  d.querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scope === scope)));
  list.innerHTML = '<li class="rb-empty">載入中…</li>'; me.innerHTML = '';
  const key = mode + scope; d.dataset.loading = key;
  try {
    let data;
    if (globalThis.__vbLeaderboardData) data = await globalThis.__vbLeaderboardData(mode, scope);   /* 開發預覽用的假資料（跟 __vbTeamApi 一樣） */
    else {
      if (authMode() !== 'account') throw new Error('要登入才能看排行榜');
      const service = await getAccountService();
      if (!service || !(await service.signedIn())) throw new Error('要登入才能看排行榜');
      data = await service.rpc('ranked_leaderboard', { p_mode: mode, p_scope: scope });
    }
    if (d.dataset.loading !== key) return;
    const rows = data?.rows || [], mine = data?.me || {};
    list.innerHTML = rows.length ? rows.map(r => row(r, false)).join('') : `<li class="rb-empty">${scope === 'team' ? '加入球隊後，這裡會列出隊友的排名' : '還沒有人上榜：打滿 10 場積分賽就會出現在這裡'}</li>`;
    rows.forEach((r, i) => { if (mine.rank === r.rank) list.children[i]?.classList.add('me'); });
    me.innerHTML = mine.rank ? `<ul>${row({ rank: mine.rank, name: '你', rating: mine.rating, look: '' }, true)}</ul>`
      : `<p>你還沒上榜：${mine.need > 0 ? `再打 ${mine.need} 場積分賽就能上榜` : '14 天內打一場積分賽就會回到榜上'}（目前 ${mine.rating ?? 1000} 分）</p>`;
    avatars(list);
  } catch (e) {
    if (d.dataset.loading !== key) return;
    list.innerHTML = `<li class="rb-empty">${esc(String(e.message || '').includes('PGRST202') || String(e.message || '').includes('ranked_leaderboard') ? '排行榜還沒開通' : e.message || '讀取排行榜失敗')}</li>`;
  }
}
