// 大廳功能介紹（2026-11-20 使用者：剛創好角色的那一次，讓玩家看到每個功能的介紹；改成一次只介紹一個，點一下換下一個）
//   第一次進大廳（已取好暱稱、沒有其他視窗開著）自動出現一次，看過（或按略過）就記在 localStorage；公告視窗裡的按鈕可以再看一次（PlayOneGuide.open()）
//   每一步：畫面變暗、只有這個按鈕是亮的＋金框，旁邊一張說明卡（第幾個／共幾個、上一步／下一步／略過）；點畫面任何地方＝下一步
//   位置每一步照按鈕實際在畫面上的位置算；看不到的按鈕（手機收起來、沒加入球隊）就跳過
(() => {
  'use strict';
  const SEEN = 'po.guide.lobby.v1';
  // [要標的元素, 名稱, 說明, 說明卡放哪一邊（up 上、down 下、left 左、right 右）]
  const ITEMS = [
    ['.match-card', '積分賽', '選 2 對 2 或 6 對 6，按「開始配對」。系統會找實力差不多的玩家，不夠人就用電腦補位。打贏加分、輸了扣分，從菜雞一路打到職業隊！', 'left'],
    ['.party-slot.empty-slot button', '邀請隊友', '點「＋」邀請好友組隊，一起排積分賽。隊長按開始配對，整隊會一起進同一場。', 'up'],
    ['#my-summary', '我的資料', '你的等級、經驗、金幣和稱號。打比賽會得到經驗和金幣，每 500 經驗升一級。', 'down'],
    ['.lobby-tabs [data-page="custom"]', '自訂房間', '自己開房間，或加入朋友的房間。可以設定人數、電腦強度、每局分數和局數。', 'down'],
    ['#practice', '練習', '一個人也能練：新手教學一步一步教你接、舉、扣、攔；專項練習可以專心練一種動作。', 'down'],
    ['#tab-team', '球隊', '建立或加入球隊，跟隊友一起升級、穿球隊球衣、打球隊戰。', 'down'],
    ['.players.panel .panel-head', '在線玩家', '現在在大廳的玩家。點名字可以看他的資料、加好友。', 'right'],
    ['#system-settings', '系統設定', '調整按鍵、畫面品質、視角和音效。', 'up'],
    ['#news-open', '公告', '看最新版本的更新內容。這個介紹之後也可以從公告裡再看一次。', 'up'],
    ['#ach-open', '成就', '完成各種挑戰，領取獎勵和稱號。', 'up'],
    ['#equip-open', '球衣與裝備', '換球衣、護膝、帽子和配件，還可以自己設計球衣，大家都看得到。', 'up'],
    ['#friends-open', '好友', '好友名單，看誰在線上、邀請好友一起打。', 'up'],
    ['#team-open', '球隊主頁', '球隊的公佈欄、聊天室和商店。', 'up'],
    ['#rank-open', '天梯排行榜', '看積分賽的排名，跟大家比一比。', 'up'],
    ['#feedback-open', '匿名建議', '有任何建議或發現問題，都可以匿名留言給作者，每週還能領 500 金幣。', 'up'],
  ];
  const css = `
#po-guide{position:fixed;inset:0;z-index:2147483000;font-family:'Noto Sans TC',system-ui,sans-serif;color:#F8FAFC;cursor:pointer}
#po-guide svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#po-guide .pog-hl{fill:none;stroke:#E5B869;stroke-width:2.5;filter:drop-shadow(0 0 8px rgba(229,184,105,.85))}
#po-guide .pog-line{stroke:#F5D596;stroke-width:1.8}
#po-guide .pog-dot{fill:#F5D596}
#po-guide .pog-card{position:absolute;width:min(300px,calc(100vw - 24px));padding:14px 16px 12px;border-radius:12px;background:rgba(11,54,43,.97);border:1px solid #E5B869;box-shadow:0 10px 36px rgba(0,0,0,.6);cursor:default}
#po-guide .pog-card.center{left:50%;top:50%;transform:translate(-50%,-50%);width:min(340px,calc(100vw - 32px));padding:20px;text-align:center}
#po-guide .pog-card h2{margin:0 0 6px;font-size:18px;color:#F5D596}
#po-guide .pog-card.center h2{font-size:21px}
#po-guide .pog-card p{margin:0 0 12px;font-size:14px;color:#E2E8F0;line-height:1.55}
#po-guide .pog-foot{display:flex;align-items:center;gap:8px}
#po-guide .pog-card.center .pog-foot{justify-content:center}
#po-guide .pog-n{margin-right:auto;font-size:12px;color:#94A3B8}
#po-guide button{font:inherit;font-size:13px;padding:6px 14px;border-radius:999px;cursor:pointer;border:1px solid rgba(229,184,105,.5);background:transparent;color:#F5D596}
#po-guide button.main{font-weight:700;border:0;background:linear-gradient(#F5D596,#D49B42);color:#06211A}
#po-guide .pog-card.center button.main{font-size:15px;padding:9px 22px}`;
  let root = null, steps = [], at = -1;
  const visible = (el) => { if (!el || el.closest('[hidden]') || el.closest('[inert]')) return null; const r = el.getBoundingClientRect(), s = getComputedStyle(el); if (r.width < 4 || r.height < 4 || s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return null; if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return null; return r; };
  const svgNS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => { const n = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  function close() {
    if (!root) return; root.remove(); root = null;
    removeEventListener('resize', relayout); removeEventListener('scroll', relayout, true); removeEventListener('keydown', onKey, true);
    try { localStorage.setItem(SEEN, '1'); } catch (_) {}
  }
  function go(i) { if (!root) return; if (i >= steps.length) { close(); return; } at = Math.max(-1, i); draw(); }
  function onKey(e) {
    const k = e.key; if (!['Escape', 'Enter', ' ', 'ArrowRight', 'ArrowLeft'].includes(k)) return;
    e.preventDefault(); e.stopPropagation();
    if (k === 'Escape') close(); else if (k === 'ArrowLeft') go(at - 1); else go(at + 1);
  }
  function relayout() { if (root) draw(); }
  function card(cls, html) { const c = document.createElement('div'); c.className = 'pog-card' + (cls ? ' ' + cls : ''); c.innerHTML = html; c.addEventListener('click', (e) => e.stopPropagation()); root.append(c); return c; }
  function draw() {
    const W = innerWidth, H = innerHeight;
    root.replaceChildren();
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}` }), mask = svgEl('mask', { id: 'pog-mask' });
    mask.append(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }));
    const defs = svgEl('defs', {}); defs.append(mask); svg.append(defs);
    svg.append(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: 'rgba(3,16,12,.8)', mask: 'url(#pog-mask)' }));
    root.append(svg);
    if (at < 0) {   // 開頭：歡迎卡
      const c = card('center', `<h2>👋 歡迎來到 Play One</h2><p>花一點時間認識大廳的 ${steps.length} 個功能吧！點畫面任何地方就會換下一個。</p><div class="pog-foot"><button type="button" data-skip>略過</button><button type="button" class="main" data-next>開始介紹</button></div>`);
      c.querySelector('[data-skip]').addEventListener('click', close); c.querySelector('[data-next]').addEventListener('click', () => go(0));
      c.querySelector('[data-next]').focus({ preventScroll: true });
      return;
    }
    const s = steps[at], el = [...document.querySelectorAll(s.sel)].find((e) => visible(e));
    if (!el) { go(at + 1); return; }   // 這一步的按鈕剛好看不到：跳過
    const r = el.getBoundingClientRect(), last = at === steps.length - 1;
    const c = card('', `<h2></h2><p></p><div class="pog-foot"><span class="pog-n">${at + 1} / ${steps.length}</span>${at > 0 ? '<button type="button" data-prev>上一步</button>' : ''}<button type="button" data-skip>略過</button><button type="button" class="main" data-next>${last ? '開始玩吧' : '下一步'}</button></div>`);
    c.querySelector('h2').textContent = s.name; c.querySelector('p').textContent = s.text;
    c.querySelector('[data-skip]').addEventListener('click', close); c.querySelector('[data-next]').addEventListener('click', () => go(at + 1));
    c.querySelector('[data-prev]')?.addEventListener('click', () => go(at - 1));
    // 說明卡位置：照指定的方向放在按鈕旁邊，超出畫面就夾回來；放不下就換到對面
    const w = c.offsetWidth, h = c.offsetHeight, gap = 34, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let side = s.side;
    if (side === 'up' && r.top - gap - h < 8) side = 'down'; else if (side === 'down' && r.bottom + gap + h > H - 8) side = 'up';
    if (side === 'left' && r.left - gap - w < 8) side = 'right'; else if (side === 'right' && r.right + gap + w > W - 8) side = 'left';
    let x, y, ax, ay;
    if (side === 'up' || side === 'down') { x = cx - w / 2; y = side === 'up' ? r.top - gap - h : r.bottom + gap; ax = cx; ay = side === 'up' ? r.top : r.bottom; }
    else { const yy = Math.min(cy, r.top + 60); x = side === 'right' ? r.right + gap : r.left - gap - w; y = yy - h / 2; ax = side === 'right' ? r.right : r.left; ay = yy; }
    x = Math.min(W - w - 8, Math.max(8, x)); y = Math.min(H - h - 8, Math.max(8, y));
    c.style.left = x + 'px'; c.style.top = y + 'px';
    const tx = side === 'up' || side === 'down' ? Math.min(x + w - 16, Math.max(x + 16, ax)) : side === 'right' ? x : x + w, ty = side === 'up' ? y + h : side === 'down' ? y : Math.min(y + h - 12, Math.max(y + 12, ay));
    // 這個按鈕挖亮＋金框＋線
    const pad = 5, box = { x: r.left - pad, y: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2, rx: 9 };
    mask.append(svgEl('rect', { ...box, fill: '#000' }));
    svg.append(svgEl('rect', { ...box, class: 'pog-hl' }));
    svg.append(svgEl('line', { x1: ax, y1: ay, x2: tx, y2: ty, class: 'pog-line' }));
    svg.append(svgEl('circle', { cx: ax, cy: ay, r: 3.5, class: 'pog-dot' }));
    c.querySelector('[data-next]').focus({ preventScroll: true });
  }
  function open() {
    if (root) return;
    if (!document.getElementById('po-guide-css')) { const s = document.createElement('style'); s.id = 'po-guide-css'; s.textContent = css; document.head.append(s); }
    // 只介紹現在看得到的按鈕（沒加入球隊就沒有球隊主頁）
    steps = ITEMS.map(([sel, name, text, side]) => ({ sel, name, text, side })).filter((s) => [...document.querySelectorAll(s.sel)].some((e) => visible(e)));
    root = document.createElement('div'); root.id = 'po-guide'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '大廳功能介紹');
    root.addEventListener('click', () => go(at + 1));   // 點畫面任何地方＝下一步
    document.documentElement.append(root);   // 放在 body 外面：大廳會依視窗大小把 body 縮放（zoom），放在裡面位置會被多放大一次
    at = -1; draw();
    addEventListener('resize', relayout); addEventListener('scroll', relayout, true); addEventListener('keydown', onKey, true);
  }
  // 第一次進大廳：已取好暱稱、沒有其他視窗開著時自動出現一次（手機直拿版大廳按鈕大多收起來，不自動出現）
  function seen() { try { return localStorage.getItem(SEEN) === '1'; } catch (_) { return true; } }
  const auto = setInterval(() => {
    if (seen() || root) { clearInterval(auto); return; }
    const shell = document.getElementById('lobby-shell');
    if (!shell || shell.inert || !globalThis.VBIntro?.entered) return;
    if (document.querySelector('dialog[open]') || innerWidth < 820 || matchMedia('(pointer: coarse)').matches) return;
    if (!globalThis.VBSettings?.values?.nickname) return;
    if (!document.querySelector('#my-summary') || !visible(document.querySelector('.match-card'))) return;
    clearInterval(auto); setTimeout(() => { if (!document.querySelector('dialog[open]')) open(); }, 600);
  }, 1000);
  document.getElementById('guide-open')?.addEventListener('click', () => { document.getElementById('lobby-news')?.close(); setTimeout(open, 50); });   // 公告視窗裡的「看大廳功能介紹」
  globalThis.PlayOneGuide = { open, close };
})();
