// 球隊主頁（像公會）：企劃見 docs/企劃-球隊系統.md；資料庫見 supabase/019_team_guild.sql
// 有球隊：上方隊名／等級／經驗條／人數／資金，分頁 主頁（公佈欄、動態、捐金幣、邀請碼）、成員（管理、申請審核）、球衣、商店、聊天、球隊戰（之後的段落）
// 沒球隊：建立球隊（Lv10＋1000 金幣）、輸入邀請碼、搜尋球隊並申請加入
// openTeamHub({ api, progress }) 的 api／progress 可以換成假的（檢查用）
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const TEAM_CREATE_COST = 1000, TEAM_LEVEL_REQ = 10;
export const TEAM_LEVELS = [   // 跟 019 SQL 的 team_level／team_cap 一樣
  { lv: 1, exp: 0, cap: 10, jerseys: 1, open: '公佈欄、聊天室、球衣 1 件' },
  { lv: 2, exp: 3000, cap: 15, jerseys: 2, open: '球隊商店' },
  { lv: 3, exp: 8000, cap: 20, jerseys: 3, open: '球隊戰' },
  { lv: 4, exp: 15000, cap: 25, jerseys: 4, open: '更多花紋（商店）' },
  { lv: 5, exp: 25000, cap: 30, jerseys: 5, open: '球隊徽章外框' },
];
export const ROLE_NAME = { owner: '隊長', vice: '副隊長', member: '隊員' };
const BADGES = ['🏐', '🔥', '⚡', '🦅', '🐯', '🌊', '⭐', '👑'];   // 跟 022 SQL 的 team_badge_ok 一樣
const TABS = [['home', '🏠 主頁'], ['members', '👥 成員'], ['jersey', '👕 球衣'], ['shop', '🛒 商店'], ['chat', '💬 聊天'], ['war', '⚔️ 球隊戰']];
// 動態的說法
export function logText(l) {
  const a = esc(l.actor || '有人'), t = esc(l.target || '某人');
  return { create: `${a} 建立了球隊`, join: `${a} 加入了球隊`, leave: `${a} 離開了球隊`, kick: `${a} 把 ${t} 移出球隊`, vice: `${a} 把 ${t} 升為副隊長`,
    warmatch: `⚔️ 球隊戰配到對手「${esc(l.data?.vs)}」`, warwin: `🏆 球隊戰贏了「${esc(l.data?.vs)}」（+25 積分、+500 經驗）`, warloss: `球隊戰輸給「${esc(l.data?.vs)}」（+100 經驗）`,
    member: `${a} 把 ${t} 改為隊員`, jersey: `${a} 更新了球隊球衣`, buy: `${a} 用 ${Number(l.data?.price || 0).toLocaleString()} 球隊資金買了${{ jersey_slot: '額外球衣格', cap5: '擴充人數', gold: '金色隊名', badge: '徽章 ' + esc(l.data?.arg || '') }[l.data?.item] || '東西'}`, owner: `${t} 成為新的隊長`, rename: `${a} 把隊名改成「${esc(l.data?.name)}」`, levelup: `🎉 球隊升到 Lv${l.data?.level}！`,
    donate: `${a} 捐了 ${Number(l.data?.amount || 0).toLocaleString()} 金幣` }[l.kind] || esc(l.kind);
}
const when = (t) => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const day = (t) => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleDateString('zh-TW'); };
const online = (seen) => seen && Date.now() - new Date(seen).getTime() < 3 * 60 * 1000;   // 3 分鐘內在大廳出現過

const CSS = `
#team-hub{width:min(1180px,96vw);height:min(780px,92vh);max-width:none;max-height:none;padding:0;border:1px solid #2c3b52;border-radius:14px;background:#0f1826;color:#e5edf7;overflow:hidden}
#team-hub *{box-sizing:border-box}#team-hub::backdrop{background:#000a}
#team-hub form{display:flex;flex-direction:column;height:100%;margin:0}
.th-top{display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid #22314a}
.th-top h2{margin:0;font-size:20px;color:#fff}.th-back{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;padding:0 6px}
.th-badge{padding:2px 10px;border-radius:999px;background:#f2b705;color:#16202e;font-weight:800;font-size:13px}
.th-bar{flex:1;max-width:260px;height:10px;border-radius:6px;background:#22314a;overflow:hidden}.th-bar i{display:block;height:100%;background:linear-gradient(90deg,#f07c24,#f2b705)}
.th-stat{color:#b9c8d6;font-size:14px;white-space:nowrap}.th-stat b{color:#fff}
.th-tabs{display:flex;gap:4px;padding:8px 16px 0;border-bottom:1px solid #22314a}
.th-tabs button{padding:10px 16px;border:0;border-bottom:3px solid transparent;background:none;color:#b9c8d6;font:inherit;font-size:15px;cursor:pointer}
.th-tabs button[aria-selected=true]{color:#fff;font-weight:700;border-bottom-color:#f07c24}
.th-body{flex:1;overflow:auto;padding:16px 20px}
.th-cols{display:grid;grid-template-columns:1.3fr 1fr;gap:16px}
.th-box{background:#152236;border:1px solid #26384c;border-radius:12px;padding:14px 16px;margin-bottom:14px}
.th-box h3{margin:0 0 10px;font-size:16px;color:#fff}
.th-note{color:#8fa6ba;font-size:13px;margin:6px 0}.th-err{min-height:20px;color:#ff9c8a;font-size:14px;margin:0 20px 8px}
.th-ok{color:#7ee2a8}
.th-notice{padding:10px 12px;border-radius:10px;background:#1b2b40;margin-bottom:8px;white-space:pre-wrap;line-height:1.5}
.th-notice.pin{border:1px solid #f2b705;background:#2a2f24}.th-notice small{display:block;color:#8fa6ba;margin-top:4px}
.th-notice .th-mini{float:right;margin-left:6px}
.th-log{list-style:none;margin:0;padding:0}.th-log li{padding:6px 0;border-bottom:1px solid #1f2e42;font-size:14px}.th-log small{color:#8fa6ba;margin-left:8px}
#team-hub textarea,#team-hub input[type=text],#team-hub input[type=number]{width:100%;padding:8px 10px;border-radius:8px;border:1px solid #3b5368;background:#0c1522;color:#fff;font:inherit;font-size:15px}
#team-hub textarea{min-height:70px;resize:vertical}
#team-hub button.th-btn{padding:7px 14px;border-radius:9px;border:1px solid #4b647c;background:#1d2c3e;color:#fff;font:inherit;font-size:14px;cursor:pointer}
#team-hub button.th-btn.orange{background:#f07c24;border-color:#f07c24;font-weight:700}#team-hub button.th-btn.red{background:#5c1f22;border-color:#a33}
#team-hub button.th-btn:disabled{opacity:.5;cursor:default}
.th-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}
#team-hub label{display:inline-flex!important;flex-direction:row!important;align-items:center;gap:6px;margin:0;font-size:14px;color:#dfe8f1;text-align:left}
#team-hub label input[type=checkbox]{width:auto;margin:0}
.th-table{width:100%;border-collapse:collapse;font-size:14px}.th-table th{text-align:left;color:#8fa6ba;font-weight:500;padding:6px 8px;border-bottom:1px solid #26384c}
.th-table td{padding:8px;border-bottom:1px solid #1f2e42;vertical-align:middle}
.th-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#3a4a5e;margin-right:6px}.th-dot.on{background:#3ddc84}
.th-role{padding:1px 8px;border-radius:999px;font-size:12px;background:#26384c}.th-role.owner{background:#f2b705;color:#16202e}.th-role.vice{background:#3a86c8}
.th-code{font-family:Consolas,monospace;font-size:20px;letter-spacing:3px;color:#f2b705}
.th-soon{text-align:center;padding:60px 20px;color:#b9c8d6}.th-soon b{display:block;font-size:22px;color:#fff;margin-bottom:8px}
.th-levels{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}.th-levels td{padding:4px 6px;border-bottom:1px solid #1f2e42}.th-levels tr.now td{color:#f2b705;font-weight:700}
.th-jerseys{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}.th-jersey{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px;border-radius:12px;background:#1b2b40;border:1px solid #26384c;min-height:200px;justify-content:center;text-align:center}
.th-jersey canvas{width:150px;height:auto;aspect-ratio:7/6}.th-jersey small{color:#7ee2a8}.th-jersey.th-slot{border-style:dashed;color:#8fa6ba}
.th-chatbox{display:flex;flex-direction:column;height:calc(100% - 4px);min-height:420px;margin:0}.th-chat{flex:1;overflow:auto;padding:6px 4px;display:flex;flex-direction:column;gap:6px;min-height:240px}
.th-msg{max-width:72%;padding:7px 11px;border-radius:12px;background:#1b2b40;line-height:1.45;word-break:break-word;align-self:flex-start}.th-msg small{display:block;color:#8fa6ba;font-size:12px;margin-bottom:2px}
.th-msg.mine{align-self:flex-end;background:#3a2a17;border:1px solid #f07c2466}
.th-gold{color:#f7c948!important;text-shadow:0 0 10px #f7c94866}
.th-shop{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}.th-item{display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 10px;border-radius:12px;background:#1b2b40;border:1px solid #26384c;text-align:center}
.th-item.on{border-color:#f2b705}.th-item-ic{font-size:34px;line-height:1.2}.th-item small{color:#8fa6ba;min-height:32px}.th-price{color:#f2b705;font-weight:700}
.th-war{padding:10px 0}.th-vs{display:flex;align-items:center;justify-content:center;gap:22px;font-size:22px;margin:6px 0 12px}.th-vs span{color:#f07c24;font-weight:900}
#team-hub button.th-btn.th-big{font-size:18px;padding:12px 28px}
.th-teams{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.th-team{padding:12px;border-radius:10px;background:#1b2b40;border:1px solid #26384c}.th-team b{font-size:16px}.th-team small{display:block;color:#8fa6ba;margin:4px 0 8px}
`;

let openNow = false;
export async function openTeamHub({ api, progress } = {}) {
  if (openNow) return; openNow = true;
  if (!document.getElementById('th-css')) { const s = document.createElement('style'); s.id = 'th-css'; s.textContent = CSS; document.head.append(s); }
  const P = progress || await import('./progress.js');
  const call = api || ((op, arg) => P.teamApi(op, arg));
  const dlg = document.createElement('dialog'); dlg.id = 'team-hub'; dlg.setAttribute('aria-labelledby', 'th-title');
  dlg.innerHTML = '<form method="dialog"><header class="th-top"></header><nav class="th-tabs" role="tablist"></nav><p class="th-err" role="status"></p><div class="th-body"></div></form>';
  document.body.append(dlg);
  const $q = (s) => dlg.querySelector(s);
  let team = null, prog = {}, tab = 'home', apps = [], list = [], query = '', chat = [], chatTimer = 0, chatBusy = false, war = null, warTimer = 0;
  const say = (t, good = false) => { const e = $q('.th-err'); e.textContent = t || ''; e.classList.toggle('th-ok', good); };
  const run = async (fn, okText) => { say(''); try { await fn(); if (okText) say(okText, true); } catch (x) { say((x && x.message) || '操作失敗'); } };
  const reload = async () => {
    try { prog = (await P.loadProgress()) || P.cachedProgress?.() || prog; } catch {}
    team = await call('mine');
    if (team) team.myWear = await call('myWear').catch(() => -1);
    apps = team && ['owner', 'vice'].includes(team.myRole) ? await call('applications').catch(() => []) : [];
    if (!team) list = await call('list', query).catch(() => []);
    draw();
  };
  const isMgr = () => team && ['owner', 'vice'].includes(team.myRole), isOwner = () => team && team.myRole === 'owner';

  // ---------- 上方 ----------
  const drawTop = () => {
    if (!team) { $q('.th-top').innerHTML = '<button class="th-back" aria-label="關閉">←</button><h2 id="th-title">球隊</h2>'; return; }
    const cur = TEAM_LEVELS[team.level - 1], pct = team.next ? Math.round(((team.exp - cur.exp) / (team.next - cur.exp)) * 100) : 100;
    $q('.th-top').innerHTML = `<button class="th-back" aria-label="關閉">←</button><h2 id="th-title" class="${team.gold_name ? 'th-gold' : ''}">${team.badge ? esc(team.badge) + ' ' : ''}${esc(team.name)}</h2><span class="th-badge">Lv${team.level}</span>
      <span class="th-bar" title="球隊經驗 ${team.exp.toLocaleString()}${team.next ? ' / ' + team.next.toLocaleString() : '（最高等級）'}"><i style="width:${pct}%"></i></span>
      <span class="th-stat">經驗 <b>${Number(team.exp).toLocaleString()}</b>${team.next ? ` / ${team.next.toLocaleString()}` : ''}</span>
      <span class="th-stat">👥 <b>${team.members.length}</b> / ${team.cap}</span><span class="th-stat">🪙 資金 <b>${Number(team.funds).toLocaleString()}</b></span>`;
  };
  // ---------- 沒有球隊 ----------
  const drawNoTeam = () => {
    $q('.th-tabs').innerHTML = '';
    const lv = P.levelOf ? P.levelOf(prog.exp | 0) : 1, coins = prog.coins | 0, canCreate = lv >= TEAM_LEVEL_REQ && coins >= TEAM_CREATE_COST;
    $q('.th-body').innerHTML = `<div class="th-cols"><div>
      <div class="th-box"><h3>🛡️ 建立球隊</h3><p class="th-note">需要 Lv${TEAM_LEVEL_REQ}、花 ${TEAM_CREATE_COST.toLocaleString()} 金幣（你現在 Lv${lv}、🪙 ${coins.toLocaleString()}）。建立後你就是隊長。</p>
        <div class="th-row"><input type="text" id="th-name" maxlength="12" placeholder="隊名（2～12 字）"><button type="button" class="th-btn orange" data-op="create" ${canCreate ? '' : 'disabled'}>建立（${TEAM_CREATE_COST.toLocaleString()} 金幣）</button></div>
        ${lv < TEAM_LEVEL_REQ ? `<p class="th-note">🔒 Lv${TEAM_LEVEL_REQ} 才能建立或加入球隊；開房打比賽就會累積經驗（練習不算）。</p>` : coins < TEAM_CREATE_COST ? '<p class="th-note">金幣不夠：開房打比賽會拿到金幣。</p>' : ''}</div>
      <div class="th-box"><h3>🔑 用邀請碼加入</h3><div class="th-row"><input type="text" id="th-code" maxlength="6" placeholder="6 碼邀請碼" style="text-transform:uppercase;max-width:200px"><button type="button" class="th-btn orange" data-op="join">加入</button></div></div>
      <div class="th-box"><h3>📈 球隊等級</h3>${levelTable(0)}</div>
    </div><div>
      <div class="th-box"><h3>🔍 找球隊</h3><div class="th-row"><input type="text" id="th-q" placeholder="搜尋隊名" value="${esc(query)}"><button type="button" class="th-btn" data-op="search">搜尋</button></div>
        <p class="th-note">按「申請加入」後，等隊長或副隊長同意。同時最多申請 5 個。</p>
        <div class="th-teams">${list.length ? list.map((t) => `<div class="th-team"><b class="${t.gold ? 'th-gold' : ''}">${t.badge ? esc(t.badge) + ' ' : ''}${esc(t.name)}</b> <span class="th-badge">Lv${t.level}</span><small>隊長 ${esc(t.owner)}・👥 ${t.members} / ${t.cap}${t.open ? '' : '・不開放申請'}</small>
          ${t.applied ? `<button type="button" class="th-btn" data-op="cancelApply" data-id="${esc(t.id)}">取消申請</button>` : `<button type="button" class="th-btn orange" data-op="apply" data-id="${esc(t.id)}" ${t.open && t.members < t.cap && lv >= TEAM_LEVEL_REQ ? '' : 'disabled'}>申請加入</button>`}</div>`).join('') : '<p class="th-note">找不到球隊。</p>'}</div></div>
    </div></div>`;
  };
  const levelTable = (now) => `<table class="th-levels">${TEAM_LEVELS.map((l) => `<tr class="${l.lv === now ? 'now' : ''}"><td>Lv${l.lv}</td><td>${l.exp.toLocaleString()} 經驗</td><td>${l.cap} 人</td><td>球衣 ${l.jerseys} 件</td><td>開放：${l.open}</td></tr>`).join('')}</table>
    <p class="th-note">隊員開房比賽的經驗會算進球隊（每人每天最多 300）；捐 1 金幣＝1 球隊經驗＋1 球隊資金。</p>`;
  // ---------- 有球隊：分頁 ----------
  const drawTabs = () => { $q('.th-tabs').innerHTML = TABS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${n}${k === 'members' && apps.length ? ` (${apps.length})` : ''}</button>`).join(''); };
  const panes = {
    home: () => `<div class="th-cols"><div>
      <div class="th-box"><h3>📌 公佈欄</h3>${isMgr() ? `<textarea id="th-post" maxlength="200" placeholder="寫給全隊的公告（最多 200 字）"></textarea>
          <div class="th-row"><label><input type="checkbox" id="th-pin"> 置頂</label><button type="button" class="th-btn orange" data-op="post">發佈</button></div>` : ''}
        <div style="margin-top:10px">${team.board.length ? team.board.map((b) => `<div class="th-notice${b.pinned ? ' pin' : ''}">${isMgr() ? `<button type="button" class="th-btn th-mini" data-op="unpost" data-id="${b.id}">刪除</button><button type="button" class="th-btn th-mini" data-op="pin" data-id="${b.id}" data-pinned="${!b.pinned}">${b.pinned ? '取消置頂' : '置頂'}</button>` : ''}${b.pinned ? '📌 ' : ''}${esc(b.body)}<small>${esc(b.author)}・${when(b.at)}</small></div>`).join('') : '<p class="th-note">還沒有公告。</p>'}</div></div>
      <div class="th-box"><h3>📰 球隊動態</h3><ul class="th-log">${team.log.length ? team.log.map((l) => `<li>${logText(l)}<small>${when(l.at)}</small></li>`).join('') : '<li class="th-note">還沒有動態。</li>'}</ul></div>
      <div class="th-box"><h3>📈 球隊等級</h3>${levelTable(team.level)}</div>
    </div><div>
      <div class="th-box"><h3>🪙 捐金幣給球隊</h3><p class="th-note">你有 🪙 ${(prog.coins | 0).toLocaleString()}。捐 1 金幣＝1 球隊經驗＋1 球隊資金（資金用來在球隊商店買全隊共用的東西）。</p>
        <div class="th-row"><input type="number" id="th-amount" min="1" max="100000" step="1" placeholder="金額" style="max-width:140px"><button type="button" class="th-btn orange" data-op="donate">捐款</button></div></div>
      <div class="th-box"><h3>🔑 邀請碼</h3><span class="th-code">${esc(team.code)}</span> <button type="button" class="th-btn" data-op="copy">複製</button>
        <p class="th-note">給朋友輸入就能直接加入。</p>
        ${isMgr() ? `<div class="th-row"><label><input type="checkbox" id="th-open" ${team.open ? 'checked' : ''}> 開放別人在「找球隊」申請加入</label></div>` : ''}</div>
    </div></div>`,
    members: () => `${isMgr() && apps.length ? `<div class="th-box"><h3>📨 申請加入（${apps.length}）</h3><table class="th-table"><tr><th>暱稱</th><th>等級</th><th>申請時間</th><th></th></tr>${apps.map((a) => `<tr><td>${esc(a.nickname)}</td><td>Lv${a.level}</td><td>${when(a.at)}</td>
        <td><button type="button" class="th-btn orange" data-op="accept" data-id="${esc(a.id)}">同意</button> <button type="button" class="th-btn" data-op="reject" data-id="${esc(a.id)}">拒絕</button></td></tr>`).join('')}</table></div>` : ''}
      <div class="th-box"><h3>👥 成員（${team.members.length} / ${team.cap}）</h3><table class="th-table"><tr><th>暱稱</th><th>職位</th><th>等級</th><th>貢獻</th><th>加入</th><th></th></tr>
        ${team.members.map((m) => `<tr><td><span class="th-dot${online(m.seen) ? ' on' : ''}"></span>${esc(m.nickname)}</td><td><span class="th-role ${m.role}">${ROLE_NAME[m.role]}</span></td><td>Lv${m.level}</td><td>${Number(m.contrib).toLocaleString()}</td><td>${day(m.joined)}</td><td>${memberActions(m)}</td></tr>`).join('')}</table>
        <p class="th-note">綠點＝最近 3 分鐘在線。貢獻＝算進球隊的比賽經驗＋捐的金幣。</p></div>
      <div class="th-box"><h3>⚙️ ${isOwner() ? '隊長設定' : '我的球隊'}</h3>
        ${isOwner() ? `<div class="th-row"><input type="text" id="th-rename" maxlength="12" value="${esc(team.name)}" style="max-width:220px"><button type="button" class="th-btn" data-op="rename">改隊名</button></div>` : ''}
        <div class="th-row"><button type="button" class="th-btn red" data-op="leave">離開球隊</button>${isOwner() ? '<button type="button" class="th-btn red" data-op="disband">解散球隊</button>' : ''}</div>
        <p class="th-note">離開後 24 小時內不能加入或建立別的球隊。${isOwner() ? '隊長離開會自動交給副隊長（沒有就交給最早加入的隊員）。' : ''}</p></div>`,
    jersey: () => {
      const n = team.jerseyCap || TEAM_LEVELS[team.level - 1].jerseys, list = team.jerseys || [];   // 等級＋商店買的球衣格
      return `<div class="th-box"><h3>👕 球隊球衣（${list.length} / ${n} 件）</h3>
        <p class="th-note">${isMgr() ? '隊長、副隊長可以設計。' : '隊長、副隊長負責設計。'}球隊 Lv${team.level} 可以有 ${n} 件，升級可以設計更多。隊員在「球衣與裝備」選要穿哪一件；退出球隊後球衣會留下當紀念（不能穿）。</p>
        <div class="th-jerseys">${Array.from({ length: n }, (_, i) => list[i]
          ? `<div class="th-jersey"><canvas data-jt="${i}"></canvas><b>球隊球衣 ${i + 1}</b>${team.myWear === i ? '<small>✓ 你正在穿</small>' : ''}<div class="th-row">
              <button type="button" class="th-btn${team.myWear === i ? '' : ' orange'}" data-op="wearJ" data-id="${i}">${team.myWear === i ? '脫下' : '穿這件'}</button>
              ${isMgr() ? `<button type="button" class="th-btn" data-op="designJ" data-id="${i}">修改</button><button type="button" class="th-btn red" data-op="dropJ" data-id="${i}">刪除</button>` : ''}</div></div>`
          : `<div class="th-jersey th-slot">${isMgr() && i === list.length ? `<button type="button" class="th-btn orange" data-op="designJ" data-id="${i}">＋ 設計第 ${i + 1} 件</button>` : `<span>${i < list.length + 1 ? '還沒設計' : '空格'}</span>`}</div>`).join('')}
        ${TEAM_LEVELS[team.level] ? `<div class="th-jersey th-slot"><span>🔒 球隊 Lv${team.level + 1} 多 1 件</span></div>` : ''}</div></div>`;
    },
    shop: () => {
      if (team.level < 2) return soon('🛒 球隊商店', '球隊 Lv2 解鎖。用球隊資金（隊員捐的金幣）買全隊共用的東西。');
      const owner = isOwner(), funds = Number(team.funds), owned = team.badges || [];
      const item = (key, arg, icon, name, desc, price, have, max) => { const full = have >= max, poor = funds < price;
        return `<div class="th-item"><span class="th-item-ic">${icon}</span><b>${name}</b><small>${desc}</small><span class="th-price">🪙 ${price.toLocaleString()}</span>
          <button type="button" class="th-btn orange" data-op="buy" data-id="${key}" data-arg="${esc(arg || '')}" data-name="${esc(name)}" data-price="${price}" ${!owner || full || poor ? 'disabled' : ''}>${full ? (max > 1 ? `已買滿（${have}/${max}）` : '已擁有') : max > 1 ? `購買（${have}/${max}）` : '購買'}</button></div>`; };
      return `<div class="th-box"><h3>🛒 球隊商店</h3><p class="th-note">用球隊資金購買，全隊共用。${owner ? '只有隊長可以購買。' : '只有隊長可以購買；隊員可以在「主頁」捐金幣增加球隊資金。'}球隊資金：🪙 ${funds.toLocaleString()}</p>
        <div class="th-shop">
          ${item('jersey_slot', '', '👕', '額外球衣格', '球隊多 1 件球衣可以設計', 2000, team.extra_jerseys | 0, 3)}
          ${item('cap5', '', '👥', '擴充人數', '人數上限 +5', 3000, (team.extra_cap | 0) / 5, 2)}
          ${item('gold', '', '✨', '金色隊名', '隊名在球隊主頁和找球隊列表變成金色', 5000, team.gold_name ? 1 : 0, 1)}
        </div></div>
        <div class="th-box"><h3>🏅 球隊徽章</h3><p class="th-note">每個 1,000，買了就顯示在隊名旁邊；${isMgr() ? '隊長、副隊長可以換成買過的其他徽章。' : '隊長、副隊長可以換。'}</p>
        <div class="th-shop">${BADGES.map((b) => owned.includes(b)
          ? `<div class="th-item${team.badge === b ? ' on' : ''}"><span class="th-item-ic">${b}</span><b>${team.badge === b ? '使用中' : '已擁有'}</b>${isMgr() ? `<button type="button" class="th-btn" data-op="badge" data-arg="${team.badge === b ? '' : b}">${team.badge === b ? '不顯示' : '換成這個'}</button>` : ''}</div>`
          : item('badge', b, b, '徽章', '顯示在隊名旁邊', 1000, 0, 1)).join('')}</div></div>`;
    },
    chat: () => `<div class="th-box th-chatbox"><h3>💬 球隊聊天室</h3><div class="th-chat" aria-live="polite"></div>
      <div class="th-row"><input type="text" id="th-say" maxlength="200" placeholder="說點什麼（Enter 送出，最多 200 字）"><button type="button" class="th-btn orange" data-op="say">送出</button></div>
      <p class="th-note">只有隊員看得到；留最近 100 則。</p></div>`,
    war: () => {
      const st = war;
      if (!st) return '<div class="th-soon"><b>⚔️ 球隊戰</b>載入中…</div>';
      if (st.level < 3) return soon('⚔️ 球隊戰', `球隊 Lv3 解鎖（現在 Lv${st.level}）：排隊配對等級差不多的球隊，6 對 6 比賽。`);
      const rec = st.record, w = st.war, claimText = (c) => (c == null ? '還沒回報' : c === w.me ? '我們贏' : '對方贏');
      const head = `<div class="th-box"><h3>⚔️ 球隊戰</h3><p class="th-note">戰績 <b>${rec.wins}</b> 勝 <b>${rec.losses}</b> 敗・積分 <b>${rec.points}</b>（贏 +25、輸 -10；贏的球隊 +500 經驗、輸的 +100）</p>`;
      let body;
      if (w) body = `<div class="th-war"><div class="th-vs"><b>${esc(team.name)}</b><span>VS</span><b>${esc(w.opponent)}</b></div>
          <p class="th-note">對手 Lv${w.opponentLevel}・積分 ${w.opponentPoints}。房間代碼 <span class="th-code">${esc(w.room)}</span>${w.host ? '（你們是房主隊：隊長先進房）' : ''}</p>
          <div class="th-row"><button type="button" class="th-btn orange" data-op="warEnter">🏐 進入球隊戰房間</button></div>
          <p class="th-note">進房後兩隊各站一邊、按準備，由房主開始 6 對 6（人不夠由 AI 補）。打完由隊長或副隊長回報結果：</p>
          <p class="th-note">我們回報：${claimText(w.myClaim)}・對方回報：${claimText(w.theirClaim)}${w.status === 'reported' ? '（只有一隊回報的話，30 分鐘後照那一隊的結果）' : ''}</p>
          ${isMgr() ? `<div class="th-row"><button type="button" class="th-btn orange" data-op="warReport" data-id="1">我們贏了</button><button type="button" class="th-btn" data-op="warReport" data-id="0">我們輸了</button></div>` : ''}</div>`;
      else if (st.queued) body = `<div class="th-war"><p>🔍 正在找對手…（已經等 ${Math.max(0, Math.round((Date.now() - new Date(st.since)) / 1000))} 秒）</p><p class="th-note">先找等級差 1 以內的球隊，等越久放越寬。配到後這裡會出現房間。</p>
          ${isMgr() ? '<button type="button" class="th-btn" data-op="warLeave">取消排隊</button>' : ''}</div>`;
      else body = `<div class="th-war">${st.canQueue ? '<button type="button" class="th-btn orange th-big" data-op="warQueue">⚔️ 找對手</button><p class="th-note">按下去開始排隊，配對成功後兩隊隊員都可以從這裡進房。</p>' : '<p class="th-note">隊長或副隊長可以按「找對手」開始排隊。</p>'}</div>`;
      const recent = st.recent.length ? `<h3 style="margin-top:14px">最近的球隊戰</h3><ul class="th-log">${st.recent.map((r) => `<li>${r.status === 'disputed' ? '⚠️ 有爭議' : r.won ? '🏆 贏' : '輸'}｜vs ${esc(r.vs)}<small>${when(r.at)}</small></li>`).join('')}</ul>` : '';
      return head + body + recent + '</div>';
    },
  };
  const soon = (title, text) => `<div class="th-soon"><b>${title}</b>${text}</div>`;
  const memberActions = (m) => {
    if (!team || m.role === 'owner' || m.id === team.owner) return '';
    const btn = (op, label, cls = '') => `<button type="button" class="th-btn ${cls}" data-op="${op}" data-id="${esc(m.id)}" data-name="${esc(m.nickname)}">${label}</button>`;
    const out = [];
    if (isOwner()) { out.push(m.role === 'vice' ? btn('demote', '降為隊員') : btn('promote', '升副隊長')); out.push(btn('transfer', '轉讓隊長')); }
    if (isOwner() || (team.myRole === 'vice' && m.role === 'member')) out.push(btn('kick', '移出', 'red'));
    return out.join(' ');
  };
  // 聊天：分頁打開時每 3 秒抓一次新訊息（只抓比最後一則新的）
  const drawChat = () => {
    const box = $q('.th-chat'); if (!box) return;
    const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = chat.length ? chat.map((c) => `<div class="th-msg${c.mine ? ' mine' : ''}"><small>${esc(c.name)}・${when(c.at)}</small>${esc(c.body)}</div>`).join('') : '<p class="th-note">還沒有人說話，打個招呼吧！</p>';
    if (atEnd || box.dataset.first !== '1') { box.scrollTop = box.scrollHeight; box.dataset.first = '1'; }
  };
  const pullChat = async () => {
    if (chatBusy || !team) return; chatBusy = true;
    try { const more = await call('chat', chat.length ? chat[chat.length - 1].id : 0); if (more && more.length) { chat = [...chat, ...more].slice(-100); drawChat(); } }
    catch (x) { say((x && x.message) || '聊天室連不上'); } finally { chatBusy = false; }
  };
  const chatLoop = () => { clearInterval(chatTimer); if (tab === 'chat' && team && openNow) { pullChat(); chatTimer = setInterval(() => { if (document.hidden) return; pullChat(); }, 3000); } };
  // 球隊戰：分頁打開時每 5 秒問一次狀態（伺服器順便配對）
  const pullWar = async () => { try { const st = await call('warStatus'); const changed = JSON.stringify(st) !== JSON.stringify(war); war = st; if (changed && tab === 'war') $q('.th-body').innerHTML = panes.war(); } catch (x) { say((x && x.message) || '球隊戰狀態讀不到'); } };
  const warLoop = () => { clearInterval(warTimer); if (tab === 'war' && team && openNow) { pullWar(); warTimer = setInterval(() => { if (!document.hidden) pullWar(); }, 5000); } };
  const draw = () => {
    drawTop(); if (!team) { drawNoTeam(); clearInterval(chatTimer); return; } drawTabs(); $q('.th-body').innerHTML = panes[tab]();
    if (tab === 'chat') { drawChat(); chatLoop(); } else clearInterval(chatTimer);
    if (tab === 'war') warLoop(); else clearInterval(warTimer);
    if (tab === 'jersey') import('./jersey-designer.js').then(({ shirtThumb }) => import('./jersey.js').then((J) => {
      for (const cv of dlg.querySelectorAll('canvas[data-jt]')) { const d = J.decodeJersey(team.jerseys[+cv.dataset.jt]); if (!d) continue; const img = shirtThumb(d, 150, 128); cv.width = img.width; cv.height = img.height; cv.getContext('2d').drawImage(img, 0, 0); }
    }));
  };

  // ---------- 按鈕 ----------
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('th-back')) { e.preventDefault(); close(); return; }
    if (b.dataset.tab) { e.preventDefault(); tab = b.dataset.tab; say(''); draw(); if (tab === 'chat') $q('#th-say')?.focus(); return; }
    const op = b.dataset.op; if (!op) return; e.preventDefault();
    const id = b.dataset.id, name = b.dataset.name, v = (sel) => ($q(sel) || {}).value || '';
    const act = {
      create: () => run(async () => { const n = v('#th-name').trim(); if ([...n].length < 2) throw new Error('隊名要 2～12 字'); if (!confirm(`花 ${TEAM_CREATE_COST} 金幣建立「${n}」？`)) return; await call('create', n); tab = 'home'; await reload(); }, '✓ 球隊建立好了！'),
      join: () => run(async () => { await call('join', v('#th-code').trim().toUpperCase()); tab = 'home'; await reload(); }, '✓ 已加入球隊'),
      search: () => run(async () => { query = v('#th-q').trim(); list = await call('list', query); draw(); }),
      apply: () => run(async () => { await call('apply', id); await reload(); }, '✓ 已送出申請，等隊長或副隊長同意'),
      cancelApply: () => run(async () => { await call('cancelApply', id); await reload(); }, '已取消申請'),
      post: () => run(async () => { const body = v('#th-post').trim(); if (!body) throw new Error('公告不能是空的'); await call('post', { body, pinned: $q('#th-pin').checked }); await reload(); }, '✓ 已發佈'),
      unpost: () => run(async () => { if (!confirm('刪除這則公告？')) return; await call('unpost', +id); await reload(); }),
      pin: () => run(async () => { await call('pin', { id: +id, pinned: b.dataset.pinned === 'true' }); await reload(); }),
      donate: () => run(async () => { const n = Math.floor(+v('#th-amount')); if (!(n >= 1)) throw new Error('請輸入金額'); if (!confirm(`捐 ${n.toLocaleString()} 金幣給球隊？`)) return; await call('donate', n); await reload(); }, '✓ 謝謝你的捐款！'),
      say: () => run(async () => { const inp = $q('#th-say'), t = inp.value.trim(); if (!t) return; await call('say', t); inp.value = ''; await pullChat(); inp.focus(); }),
      buy: () => run(async () => { if (!confirm(`用 ${(+b.dataset.price).toLocaleString()} 球隊資金購買「${name}${b.dataset.arg ? ' ' + b.dataset.arg : ''}」？`)) return; await call('buy', { item: id, arg: b.dataset.arg || null }); await reload(); }, '✓ 購買完成'),
      badge: () => run(async () => { await call('badge', b.dataset.arg || null); await reload(); }, '✓ 徽章已更換'),
      warQueue: () => run(async () => { await call('warQueue'); await pullWar(); }, '開始找對手…'),
      warLeave: () => run(async () => { await call('warLeave'); await pullWar(); }, '已取消排隊'),
      warReport: () => run(async () => { const won = id === '1'; if (!confirm(won ? '回報「我們贏了」？' : '回報「我們輸了」？')) return; const r = await call('warReport', won); await pullWar(); await reload();
        say(r.status === 'done' ? '✓ 結果已結算' : r.status === 'disputed' ? '兩隊回報的結果不一樣，這場記為「有爭議」，不給獎勵' : '✓ 已回報，等對方回報', r.status !== 'disputed'); }),
      warEnter: () => { const w = war && war.war; if (!w) return; const q = new URLSearchParams({ site: 'bs-shenjing', room: w.room, mode: '6v6' }); if (w.host && isOwner()) { q.set('host', '1'); q.set('srv', '1'); } try { window.VBLobby && VBLobby.carry && VBLobby.carry(q); } catch {} location.href = `gym.html?${q}`; },
      copy: () => { try { navigator.clipboard.writeText(team.code); say('✓ 邀請碼已複製', true); } catch { say('複製失敗，請自己記下邀請碼'); } },
      accept: () => run(async () => { await call('decide', { user: id, accept: true }); await reload(); }, '✓ 已加入球隊'),
      reject: () => run(async () => { await call('decide', { user: id, accept: false }); await reload(); }, '已拒絕'),
      promote: () => run(async () => { await call('role', { user: id, role: 'vice' }); await reload(); }, `✓ ${name} 升為副隊長`),
      demote: () => run(async () => { await call('role', { user: id, role: 'member' }); await reload(); }, `✓ ${name} 改為隊員`),
      transfer: () => run(async () => { if (!confirm(`把隊長轉讓給 ${name}？你會變成副隊長。`)) return; await call('transfer', id); await reload(); }, `✓ ${name} 是新的隊長`),
      kick: () => run(async () => { if (!confirm(`把 ${name} 移出球隊？`)) return; await call('kick', id); await reload(); }, `已把 ${name} 移出球隊`),
      rename: () => run(async () => { await call('rename', v('#th-rename').trim()); await reload(); }, '✓ 隊名已更改'),
      designJ: () => run(async () => {
        const i = +id, { openJerseyDesigner } = await import('./jersey-designer.js'), list = [...(team.jerseys || [])];
        const code = await openJerseyDesigner({ code: list[i], slot: i, title: `設計球隊球衣 ${i + 1}`, note: `「${team.name}」的球衣・隊員在球衣與裝備選穿；退隊後留下當紀念`, saveLabel: '存成球隊球衣' });
        if (!code) return; list[i] = code; await call('jerseys', list); await reload(); say('✓ 球隊球衣已存檔', true);
      }),
      dropJ: () => run(async () => { if (!confirm(`刪除球隊球衣 ${+id + 1}？正在穿的隊員會換回基本球衣。`)) return; const list = [...team.jerseys]; list.splice(+id, 1); await call('jerseys', list); await reload(); }, '已刪除'),
      wearJ: () => run(async () => {
        const i = +id, off = team.myWear === i, A = await import('./appearance.js');
        await call('wear', off ? -1 : i); A.wearTeamJersey(off ? -1 : i, team.jerseys[i]); await reload();
      }, team && team.myWear === +id ? '已脫下，換回基本球衣' : '✓ 已穿上球隊球衣'),
      leave: () => run(async () => { if (!confirm('確定要離開球隊嗎？24 小時內不能加入別的球隊。')) return; await call('leave'); await reload(); }, '已離開球隊'),
      disband: () => run(async () => { if (prompt(`解散後無法復原。請輸入隊名「${team.name}」確認：`) !== team.name) return; await call('disband'); await reload(); }, '球隊已解散'),
    }[op];
    if (act) act();
  });
  dlg.addEventListener('change', (e) => { if (e.target.id === 'th-open') run(async () => { await call('open', e.target.checked); await reload(); }); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'th-q') { e.preventDefault(); $q('[data-op=search]').click(); }
    if (e.key === 'Enter' && e.target.id === 'th-say' && !e.isComposing) { e.preventDefault(); $q('[data-op=say]').click(); }   // 注音選字中按 Enter 不送出
  });
  const close = () => { if (!openNow) return; openNow = false; clearInterval(chatTimer); clearInterval(warTimer); dlg.close(); dlg.remove(); dispatchEvent(new Event('vb-team-change')); };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  $q('.th-top').innerHTML = '<button class="th-back" aria-label="關閉">←</button><h2 id="th-title">球隊</h2>'; $q('.th-body').innerHTML = '<p class="th-note">載入中…</p>';
  dlg.showModal();
  try { await reload(); } catch (x) { say((x && x.message) || '球隊載入失敗'); }
  return dlg;
}
