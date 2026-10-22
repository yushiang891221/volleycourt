// 「全部功能」選單：把目前網站上所有做好的功能集中列出來（之後整理時再從這裡拿掉）
(() => {
  const G = [
    ['企劃流程', [
      ['index.html#intro', '首頁・開場攻擊動畫', '排球＋開始企劃'],
      ['index.html#map', '1 選場地', '新竹候選廠房地圖、篩選、每天自動更新'],
      ['gym.html', '2 3D 球館', '依坪數自動生成、點物件看評估、選產品算總額'],
      ['demo.html', '3 智慧球場', '比賽辨識 Demo：落點、發球、得分判讀'],
      ['checklist.html', '開館清單', '法規、保險、財務、設施、營運…逐項追蹤（共用）'],
    ]],
    ['設備評估（每項一頁）', [
      ['eval.html#eval/floor', '地板與多功能畫線', '木地板／PVC／PU、切換球場線'],
      ['eval.html#eval/camera', '智慧球場攝影機', '算分、錄影、精華'],
      ['eval.html#eval/sofa', '沙發比價', '搜尋、篩材質、排序'],
      ['eval.html#eval/light', 'LED 照明', ''],
      ['eval.html#eval/fan', '吊扇與通風', ''],
      ['eval.html#eval/air', '冷氣與用電量', '契約容量、電費、屋頂隔熱'],
      ['eval.html#eval/fire', '消防設備', '滅火器、緊急照明、避難指示、偵煙'],
      ['eval.html#eval/net', '網柱、球網、裁判台', ''],
      ['eval.html#eval/aed', 'AED 與安全', ''],
      ['eval.html#eval/room', '廁所、淋浴、更衣', ''],
      ['eval.html#eval/service', '櫃台與休息區設備', ''],
    ]],
    ['企劃平台（先前做的）', [
      ['plan/index.html#overview', '總覽', '企劃重點一頁看完'],
      ['plan/index.html#slides', '企劃簡報', ''],
      ['plan/index.html#sheets', '試算表', '預算、報價比價、候選場地'],
      ['plan/index.html#design', '3D 配置（舊版）', ''],
      ['plan/index.html#docs', '問卷與資料', ''],
      ['plan/map.html', '衛星地圖', '新竹球館分布、範圍圈'],
    ]],
    ['檔案下載', [
      ['plan/files/排球館報價比價清單.xlsx', '報價比價清單.xlsx', ''],
      ['plan/files/廠房搜尋清單.xlsx', '廠房搜尋清單.xlsx', ''],
      ['plan/files/新竹排球館分布_GoogleEarth.kml', 'Google Earth 球館分布.kml', ''],
      ['plan/files/建立排球館問卷.gs', '建立問卷的 Apps Script', ''],
      ['files/回合判讀表.csv', '比賽辨識・回合判讀表.csv', ''],
      ['video/rally-demo.mp4', '比賽辨識標註影片.mp4', ''],
    ]],
  ];
  const css = `
  .allnav-btn { font: 600 13px 'Noto Sans TC', system-ui, sans-serif; color: #F3EFE6; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 7px 12px; cursor: pointer; white-space: nowrap; }
  .allnav-btn[aria-expanded="true"] { background: #F2B705; color: #13233A; border-color: #F2B705; }
  .allnav { position: fixed; z-index: 90; top: 56px; right: 12px; width: min(760px, calc(100vw - 24px)); max-height: calc(100vh - 72px); overflow: auto; background: #0E1724; color: #ECE7DC; border: 1px solid rgba(255,255,255,.12); border-radius: 16px; box-shadow: 0 24px 60px rgba(0,0,0,.5); padding: 16px 18px 18px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 22px; font-family: 'Noto Sans TC', system-ui, sans-serif; }
  .allnav[hidden] { display: none; }
  .allnav h4 { margin: 0 0 6px; font-size: 12px; letter-spacing: .08em; color: #F2B705; }
  .allnav a { display: flex; flex-direction: column; gap: 1px; padding: 6px 8px; border-radius: 8px; color: #ECE7DC; text-decoration: none; font-size: 14px; font-weight: 700; }
  .allnav a small { font-size: 11.5px; font-weight: 400; color: #8E9AAA; }
  .allnav a:hover, .allnav a:focus-visible { background: rgba(255,255,255,.07); outline: none; }
  .allnav a.here { background: rgba(242,183,5,.14); }
  @media (max-width: 640px) { .allnav { grid-template-columns: 1fr; } }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const bar = document.querySelector('.sitebar') || document.getElementById('topbar'); if (!bar) return;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'allnav-btn'; btn.textContent = '☰ 全部功能'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'allnav');
  const anchor = bar.querySelector('.grow'); anchor ? anchor.after(btn) : bar.appendChild(btn);
  const pane = document.createElement('nav'); pane.id = 'allnav'; pane.className = 'allnav'; pane.hidden = true; pane.setAttribute('aria-label', '全部功能');
  const here = location.pathname.split('/').pop() + location.hash;
  pane.innerHTML = G.map(([t, L]) => `<section><h4>${t}</h4>${L.map(([h, n, d]) => `<a href="${h}"${/\.(xlsx|kml|gs|csv|mp4)$/.test(h) ? ' download' : ''}${here && h.startsWith(here) ? ' class="here"' : ''}>${n}${d ? `<small>${d}</small>` : ''}</a>`).join('')}</section>`).join('');
  document.body.appendChild(pane);
  const set = (open) => { pane.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); set(pane.hidden); });
  document.addEventListener('click', (e) => { if (!pane.hidden && !pane.contains(e.target)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  // same-page links on the map page (#intro / #map) need a reload to switch views
  pane.addEventListener('click', (e) => { const a = e.target.closest('a'); if (!a) return; const h = a.getAttribute('href');
    if (/^index\.html#/.test(h) && /index\.html$|\/$/.test(location.pathname)) { e.preventDefault(); if (h.endsWith('#intro') && typeof window.goHome === 'function') { set(false); window.goHome(); } else { location.href = h; location.reload(); } } });
})();
