// 選伺服器：清單來自 /api/rt-config 的 servers（Vercel 環境變數 RT_SERVERS；沒設就只有台北）。
// 選好的存在這台電腦（vb.server）；大廳（js/lobby-client.js）和遊戲房間（src/gym/game/07-net.js）都連這一台。
// 每台伺服器的 /status 回傳目前人數、房間數；ping＝從這台電腦問 /status 來回要幾毫秒（取幾次裡最快的）。
export const SERVER_KEY = 'vb.server';
let listPromise = null;
export function serverList() {
  if (!listPromise) listPromise = fetch('/api/rt-config', { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    .then((c) => { const s = Array.isArray(c.servers) && c.servers.length ? c.servers : c.cf ? [{ id: 'tw1', name: '台北', region: '台灣', url: c.cf }] : []; return s; });
  return listPromise;
}
export function savedServerId() { try { return localStorage.getItem(SERVER_KEY) || ''; } catch { return ''; } }
export function saveServer(id) { try { localStorage.setItem(SERVER_KEY, id); } catch {} }
// 網址參數 server＝指定（球隊戰兩隊要在同一台）＞這台電腦選過的＞清單第一台
export function pickServer(list, search = (typeof location !== 'undefined' ? location.search : '')) {
  const want = new URLSearchParams(search).get('server') || savedServerId();
  return list.find((s) => s.id === want) || list[0] || null;
}
const httpOf = (url) => url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/+$/, '');
// 量一台：先暖身一次（建立連線），再量 3 次取最快的
export async function probeServer(s, tries = 3) {
  const url = httpOf(s.url) + '/status';
  const once = async () => { const t = performance.now(); const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(4000) }); const j = await r.json(); return { ms: performance.now() - t, j }; };
  try {
    let best = await once();
    for (let i = 0; i < tries; i++) { const x = await once(); if (x.ms < best.ms) best = x; }
    return { online: true, ping: Math.round(best.ms), players: best.j.players | 0, rooms: best.j.rooms | 0 };
  } catch { return { online: false, ping: null, players: null, rooms: null }; }
}
export const pingLevel = (ms) => (ms == null ? 'off' : ms < 20 ? 'good' : ms < 60 ? 'ok' : 'bad');   // 綠：20 毫秒內（台北實測約 5 ms）、橘：20～60、紅：超過 60（使用者 2026-11-16 定的）

// ---------- 選伺服器頁面（開始遊戲後、進大廳前；大廳也可以按「換伺服器」再打開） ----------
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CSS = `
#server-select{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;background-color:#1f46c9;
  background-image:linear-gradient(115deg,transparent 0 62%,#ffffff14 62% 62.4%,transparent 62.4%),repeating-linear-gradient(90deg,#ffffff0a 0 2px,transparent 2px 14px);background-size:100% 100%,100% 6px;background-repeat:no-repeat,repeat-x;font-family:'Noto Sans TC',sans-serif;color:#141414}
.ss-box{width:min(860px,96vw);max-height:92vh;overflow:auto;background:#f4f2ea;border:3px solid #141414;box-shadow:10px 10px 0 #141414;padding:22px 26px}
.ss-kicker{margin:0;color:#1f46c9;font:italic 900 18px 'Barlow Condensed','Noto Sans TC',sans-serif;letter-spacing:2px}
.ss-box h2{margin:2px 0 4px;font-size:30px;font-weight:900}.ss-note{margin:0 0 16px;color:#555;font-size:14px}
.ss-list{display:grid;gap:12px}
.ss-row{display:grid;grid-template-columns:1fr auto auto auto;align-items:center;gap:18px;padding:14px 18px;background:#fff;border:3px solid #141414;cursor:pointer;text-align:left;font:inherit;color:#141414;box-shadow:4px 4px 0 #141414}
.ss-row:hover{background:#fffbe6}.ss-row[aria-pressed=true]{background:#ffd21f}.ss-row:disabled{opacity:.55;cursor:default}
.ss-name b{display:block;font-size:22px;font-weight:900}.ss-name small{color:#555;font-size:13px}.ss-tag{display:inline-block;margin-left:8px;padding:0 8px;background:#141414;color:#ffd21f;font-size:12px;font-weight:800;vertical-align:middle}
.ss-num{text-align:center;min-width:86px}.ss-num b{display:block;font:italic 900 30px/1 'Barlow Condensed','Noto Sans TC',sans-serif}.ss-num small{color:#555;font-size:12px}
.ss-ping b{padding:0 8px;border:2px solid #141414}.ss-ping.good b{background:#7be0a5}.ss-ping.ok b{background:#ff9f1c}.ss-ping.bad b{background:#ff9c8a}.ss-ping.off b{background:#ddd;color:#777}
.ss-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:18px}
.ss-foot button{padding:12px 26px;border:2px solid #141414;background:#fff;color:#141414;font:inherit;font-size:16px;font-weight:900;cursor:pointer}
.ss-foot .ss-go{background:#ffd21f;box-shadow:4px 4px 0 #141414;font-size:18px}.ss-foot button:disabled{opacity:.5;cursor:default}
.ss-refresh{color:#555;font-size:13px}
`;
// 回傳選好的伺服器（使用者按「進入」才結束）；allowCancel＝大廳裡打開的可以取消（回傳 null）
export async function openServerSelect({ allowCancel = false } = {}) {
  if (!document.getElementById('ss-css')) { const st = document.createElement('style'); st.id = 'ss-css'; st.textContent = CSS; document.head.append(st); }
  const list = await serverList();
  const el = document.createElement('div'); el.id = 'server-select'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'ss-title');
  document.body.append(el);
  let chosen = pickServer(list, ''), info = new Map(), timer = 0, alive = true;
  const best = () => { const on = list.filter((s) => info.get(s.id)?.online); return on.sort((a, b) => info.get(a.id).ping - info.get(b.id).ping)[0] || null; };
  const draw = () => {
    const rec = best(), anyOn = list.some((s) => info.get(s.id)?.online);   // 全部量不到（例如伺服器還沒更新）時不鎖，照樣可以進入
    el.innerHTML = `<div class="ss-box"><p class="ss-kicker">SELECT SERVER</p><h2 id="ss-title">選擇伺服器</h2><p class="ss-note">選一台延遲（ping）低的伺服器，打起來比較順。之後可以在大廳上方換。</p>
      <div class="ss-list">${list.length ? list.map((s) => { const i = info.get(s.id), lv = pingLevel(i?.ping);
        return `<button type="button" class="ss-row" data-id="${esc(s.id)}" aria-pressed="${chosen && chosen.id === s.id}" ${i && !i.online && anyOn ? 'disabled' : ''}>
          <span class="ss-name"><b>${esc(s.name)}${rec && rec.id === s.id && list.length > 1 ? '<span class="ss-tag">推薦</span>' : ''}</b><small>${esc(s.region || '')}</small></span>
          <span class="ss-num"><b>${i ? (i.online ? i.players : '—') : '…'}</b><small>目前人數</small></span>
          <span class="ss-num"><b>${i ? (i.online ? i.rooms : '—') : '…'}</b><small>房間</small></span>
          <span class="ss-num ss-ping ${lv}"><b>${i ? (i.online ? i.ping : '離線') : '…'}</b><small>${i && i.online ? 'ping（毫秒）' : i ? '連不上' : '量測中'}</small></span></button>`; }).join('') : '<p class="ss-note">找不到伺服器清單，請稍後再試。</p>'}</div>
      <div class="ss-foot"><span class="ss-refresh">每 5 秒更新一次</span><span>${allowCancel ? '<button type="button" data-act="cancel">取消</button> ' : ''}<button type="button" class="ss-go" data-act="go" ${chosen && (info.get(chosen.id)?.online !== false || !anyOn) ? '' : 'disabled'}>進入${chosen ? `「${esc(chosen.name)}」` : ''}</button></span></div></div>`;
  };
  const refresh = async () => {
    await Promise.all(list.map(async (s) => { const r = await probeServer(s); if (alive) info.set(s.id, r); }));
    if (!alive) return;
    if (!savedServerId() && best()) chosen = chosen && info.get(chosen.id)?.online ? chosen : best();   // 第一次選：預設選 ping 最低的
    const keepFocus = document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset.id || document.activeElement.dataset.act : null;
    draw();
    if (keepFocus) el.querySelector(`[data-id="${keepFocus}"],[data-act="${keepFocus}"]`)?.focus();
  };
  draw(); refresh(); timer = setInterval(() => { if (!document.hidden) refresh(); }, 5000);
  return new Promise((resolve) => {
    const done = (v) => { alive = false; clearInterval(timer); el.remove(); resolve(v); };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.id) { chosen = list.find((s) => s.id === b.dataset.id) || chosen; draw(); el.querySelector('[data-act=go]')?.focus(); return; }
      if (b.dataset.act === 'cancel') return done(null);
      if (b.dataset.act === 'go' && chosen) { saveServer(chosen.id); done(chosen); }
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && allowCancel) done(null); });
    setTimeout(() => el.querySelector('[data-act=go]')?.focus(), 50);
  });
}

// 大廳上方的伺服器標籤：「台北 · 18 ms」，點了可以換（換了就重新進大廳）
export async function mountServerBadge(btn) {
  if (!btn) return;
  const list = await serverList(); const cur = pickServer(list, '');
  if (!cur) { btn.hidden = true; return; }
  const show = async () => { const r = await probeServer(cur, 1); btn.innerHTML = `🖥️ ${esc(cur.name)} · <b class="lv-${pingLevel(r.ping)}">${r.online ? r.ping + ' ms' : '離線'}</b> ▾`; };
  btn.textContent = `🖥️ ${cur.name} ▾`; show(); setInterval(() => { if (!document.hidden) show(); }, 15000);
  btn.addEventListener('click', async () => {
    const s = await openServerSelect({ allowCancel: true });
    if (s && s.id !== cur.id) { location.hash = '#lobby'; location.reload(); }
  });
}
