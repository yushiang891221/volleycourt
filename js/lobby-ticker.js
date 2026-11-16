// 大廳跑馬燈（LIVE TICKER）：公告＋新加入＋球隊消息＋賽事結果＋解成就。
// 公告：直接拿大廳公告（#lobby-news）「最近更新」那幾條；其他：資料庫 lobby_feed()（supabase/024_lobby_feed.sql），每分鐘更新一次。
// 還沒執行 024 或沒登入時，就只跑公告。
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LEVEL = { 3: '高手', 4: '校隊', 5: '企聯' };

// 一則動態 → 跑馬燈上的一段字（class 決定顏色）
export function feedLine(f, achievements = {}) {
  const d = f.data || {}, n = `<b>${esc(d.nick)}</b>`;
  switch (f.kind) {
    case 'join': return { cls: 'tk-join', html: `🎉 歡迎新球員 ${n} 加入 Play One` };
    case 'team_new': return { cls: 'tk-team', html: `🛡️ 球隊「<b>${esc(d.team)}</b>」成立了！隊長 ${n}` };
    case 'team_level': return { cls: 'tk-team', html: `🛡️ 球隊「<b>${esc(d.team)}</b>」升到 Lv${esc(d.level)}` };
    case 'war': return { cls: 'tk-war', html: `⚔️ 球隊戰：「<b>${esc(d.win)}</b>」擊敗「${esc(d.lose)}」` };
    case 'win': return { cls: 'tk-win', html: `🏐 ${n} ${d.human ? '在真人對戰' : `在${LEVEL[d.lv] || ''}難度`}拿下勝利` };
    case 'ach': { const a = achievements[d.key]; return { cls: 'tk-ach', html: `🏆 ${n} 解鎖成就「<b>${esc(a ? a.name : d.key)}</b>」` }; }
    default: return null;
  }
}
// 大廳公告「最近更新」那幾條
function announcements() {
  const box = document.getElementById('lobby-news'); if (!box) return [];
  const out = []; let on = false;
  for (const el of box.children) {
    if (el.tagName === 'H3') { on = /最近更新/.test(el.textContent); continue; }
    if (on && el.tagName === 'P') { const t = el.textContent.replace(/\s+/g, ' ').trim(); if (t) out.push(t.length > 70 ? t.slice(0, 68) + '…' : t); }
  }
  return out;
}

export function mountTicker(el, { fetchFeed, achievements } = {}) {
  if (!el) return;
  const track = el.querySelector('.tk-track');
  let last = '';
  const render = (feed) => {
    const parts = [
      ...announcements().map((t) => ({ cls: 'tk-news', html: `📣 ${esc(t)}` })),
      { cls: 'tk-brand', html: 'PLAY ONE VOLLEYBALL LEAGUE' },
      ...feed.map((f) => feedLine(f, achievements || {})).filter(Boolean),
    ];
    const html = parts.map((p) => `<span class="${p.cls}">${p.html}</span>`).join('');
    if (html === last) return; last = html;
    track.innerHTML = html + html;   // 兩份接起來，捲到一半剛好無縫重來
    requestAnimationFrame(() => { const w = track.scrollWidth / 2; track.style.animationDuration = `${Math.max(20, w / 70)}s`; });   // 每秒約 70 像素，內容多就跑久一點
  };
  const load = async () => {
    let feed = [];
    try { feed = (await fetchFeed()) || []; } catch { feed = []; }
    render(feed);
  };
  render([]); load(); setInterval(() => { if (!document.hidden) load(); }, 60000);
}

// 大廳用：從帳號服務讀動態、從 progress.js 拿成就名稱
export async function mountLobbyTicker() {
  const el = document.getElementById('po-ticker'); if (!el) return;
  let achievements = {};
  try { achievements = (await import('./progress.js')).ACHIEVEMENTS || {}; } catch {}
  mountTicker(el, {
    achievements,
    fetchFeed: async () => { const { getAccountService } = await import('./auth.js'); const s = await getAccountService(); return s ? await s.rpc('lobby_feed', { p_limit: 30 }) : []; },
  });
}
