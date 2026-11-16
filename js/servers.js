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
// 量一台：先暖身一次（建立連線），再量 3 次取最快的；某一次卡住就跳過（有的網路會擋 HTTP/3，之後幾次可能超時），有一次成功就算在線
export async function probeServer(s, tries = 3) {
  const url = httpOf(s.url) + '/status';
  const once = async (ms) => { const t = performance.now(); const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(ms) }); const j = await r.json(); return { ms: performance.now() - t, j }; };
  const ok = []; let fail = 0;
  for (let i = 0; i < tries + 2 && ok.length < tries; i++) {   // 最多試 5 次、成功 3 次就停；前兩次都失敗＝離線
    try { ok.push(await once(3000)); } catch { fail++; if (!ok.length && fail >= 2) break; }
  }
  if (!ok.length) return { online: false, ping: null, players: null, rooms: null };
  const best = ok.slice(ok.length > 1 ? 1 : 0).reduce((a, b) => (b.ms < a.ms ? b : a));   // 第一次含建立連線的時間，有其他次就不算它
  return { online: true, ping: Math.round(best.ms), players: best.j.players | 0, rooms: best.j.rooms | 0 };
}
export const pingLevel = (ms) => (ms == null ? 'off' : ms < 20 ? 'good' : ms < 60 ? 'ok' : 'bad');   // 綠：20 毫秒內（台北實測約 5 ms）、橘：20～60、紅：超過 60（使用者 2026-11-16 定的）

// ---------- 選伺服器頁面（開始遊戲後、進大廳前；大廳也可以按「換伺服器」再打開） ----------
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CSS = `
#server-select{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;font-family:'Noto Sans TC',sans-serif;color:#F8FAFC;background-color:#06211A;
  background-image:repeating-linear-gradient(-55deg,rgba(255,255,255,.025) 0 2px,transparent 2px 18px),radial-gradient(circle at 18% 0%,rgba(2,132,199,.22) 0%,transparent 48%),radial-gradient(circle at 82% 8%,rgba(229,184,105,.16) 0%,transparent 45%),linear-gradient(160deg,#051A14 0%,#092C23 48%,#071F2E 100%)}
.ss-box{width:min(860px,96vw);max-height:92vh;overflow:auto;background:rgba(10,38,31,.9);border:1px solid rgba(229,184,105,.4);border-radius:22px;box-shadow:0 24px 60px rgba(0,0,0,.6);backdrop-filter:blur(14px);padding:24px 28px}
.ss-kicker{display:inline-block;margin:0;padding:2px 10px;border-radius:3px;background:#E5B869;color:#06211A;font:700 12px 'Oswald','Noto Sans TC',sans-serif;letter-spacing:.18em}
.ss-box h2{margin:8px 0 4px;font-size:28px;font-weight:900;color:#fff}.ss-note{margin:0 0 16px;color:#CBD5E1;font-size:14px}
.ss-list{display:grid;gap:10px}
.ss-row{display:grid;grid-template-columns:1fr auto auto auto;align-items:center;gap:18px;padding:14px 18px;background:#07261E;border:1px solid rgba(255,255,255,.1);border-radius:14px;cursor:pointer;text-align:left;font:inherit;color:#F8FAFC;transition:border-color .15s,transform .15s}
.ss-row:hover{border-color:rgba(229,184,105,.45);transform:translateY(-1px)}.ss-row[aria-pressed=true]{background:linear-gradient(90deg,rgba(229,184,105,.25),rgba(229,184,105,.06));border-color:rgba(229,184,105,.8)}.ss-row:disabled{opacity:.45;cursor:default;transform:none}
.ss-name b{display:block;font-size:22px;font-weight:900;color:#fff}.ss-name small{color:#94A3B8;font-size:13px}.ss-tag{display:inline-block;margin-left:8px;padding:0 9px;border-radius:999px;background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.45);color:#34D399;font-size:12px;font-weight:800;vertical-align:middle}
.ss-num{text-align:center;min-width:86px}.ss-num b{display:block;font:700 28px/1.1 'Oswald','Noto Sans TC',sans-serif;color:#F5D596}.ss-num small{color:#94A3B8;font-size:12px}
.ss-ping.good b{color:#34D399}.ss-ping.ok b{color:#FB923C}.ss-ping.bad b{color:#F87171}.ss-ping.off b{color:#64748B;font-size:22px}
.ss-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:18px}
.ss-foot button{padding:11px 24px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#061D17;color:#CBD5E1;font:inherit;font-size:15px;font-weight:800;cursor:pointer}
.ss-foot .ss-go{border:0;background:linear-gradient(90deg,#E5B869,#D49B42);color:#051A14;font-size:17px;font-weight:900;clip-path:polygon(12px 0,100% 0,calc(100% - 12px) 100%,0 100%);padding:12px 32px;box-shadow:0 6px 16px rgba(0,0,0,.3)}.ss-foot button:disabled{opacity:.45;cursor:default}
.ss-refresh{color:#64748B;font-size:13px}
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
        return `<button type="button" class="ss-row" data-id="${esc(s.id)}" aria-pressed="${chosen && chosen.id === s.id}" ${i && !i.online ? 'disabled' : ''}>
          <span class="ss-name"><b>${esc(s.name)}${rec && rec.id === s.id && list.length > 1 ? '<span class="ss-tag">推薦</span>' : ''}</b><small>${esc(s.region || '')}</small></span>
          <span class="ss-num"><b>${i ? (i.online ? i.players : '—') : '…'}</b><small>目前人數</small></span>
          <span class="ss-num"><b>${i ? (i.online ? i.rooms : '—') : '…'}</b><small>房間</small></span>
          <span class="ss-num ss-ping ${lv}"><b>${i ? (i.online ? i.ping : '離線') : '…'}</b><small>${i && i.online ? 'ping（毫秒）' : i ? '連不上' : '量測中'}</small></span></button>`; }).join('') : '<p class="ss-note">找不到伺服器清單，請稍後再試。</p>'}</div>
      <div class="ss-foot"><span class="ss-refresh">${!anyOn && info.size ? '⚠️ 伺服器都連不上，每 5 秒自動重試' : '每 5 秒更新一次'}</span><span>${allowCancel ? '<button type="button" data-act="cancel">取消</button> ' : ''}<button type="button" class="ss-go" data-act="go" ${chosen && info.get(chosen.id)?.online ? '' : 'disabled'}>進入${chosen ? `「${esc(chosen.name)}」` : ''}</button></span></div></div>`;
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
