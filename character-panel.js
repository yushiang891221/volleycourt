import * as THREE from 'three';
import { makeToyAvatar, decodeLook, preloadAvatars, EQUIP, OPTIONS } from './avatar-toy.js';
import { openCreator } from './creator.js';
import { readLook, saveLook, myLookCode, readEquip, saveEquip, readTeamJersey, saveTeamJersey } from './appearance.js';

let editing = false;
export function editAppearance(mode = 'edit') {
  if (editing || !document.getElementById('lobby-shell')) return Promise.resolve(false);
  editing = true;
  return new Promise((resolve, reject) => {
    const shell = document.getElementById('lobby-shell'), wasInert = shell.inert;
    let close;
    shell.inert = true;
    const cleanup = () => { removeEventListener('pagehide', close); editing = false; shell.inert = wasInert; };
    const finish = result => { cleanup(); resolve(result); };
    try {
      close = openCreator({ mode, look: decodeLook(readLook()),
        async onDone(look) {
          try {
            saveLook(look);
            const { syncAppearance } = await import('./account-flow.js'); await syncAppearance();   // 登入模式：存進帳號
            finish(true);
          } catch (error) { cleanup(); reject(error); }
        },
        onCancel() { finish(false); }
      });
      addEventListener('pagehide', close, { once: true });
    } catch (error) { cleanup(); reject(error); }
  });
}

function preview(img, code = myLookCode()) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(240, 300);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#152236');
    scene.add(new THREE.HemisphereLight('#ffffff', '#67738a', 2));
    const light = new THREE.DirectionalLight('#ffffff', 3); light.position.set(2, 4, 4); scene.add(light);
    const av = makeToyAvatar(decodeLook(code), readTeamJersey() || 'orange'); scene.add(av.g);   // 含裝備、穿著的球隊球衣
    const camera = new THREE.PerspectiveCamera(32, .8, .05, 20);
    camera.position.set(.35, 1.0, 2.95); camera.lookAt(0, .78, 0);   // 角色整個人（含頭頂、帽子）都在預覽圖裡
    renderer.render(scene, camera); img.src = renderer.domElement.toDataURL();
  } finally { renderer.dispose(); renderer.forceContextLoss(); }
}

// 球衣與裝備：官方送的配件（之後商店買的也放這裡），穿上／脫下馬上生效；護膝存在外觀裡（會同步到帳號）
export function openEquipPanel() {
  if (!document.getElementById('lobby-shell') || editing) return;
  let d = document.getElementById('equip-panel');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'equip-panel'; d.setAttribute('aria-labelledby', 'equip-title');
    d.innerHTML = '<form method="dialog"><h2 id="equip-title">球衣與裝備</h2><nav class="eq-tabs" role="tablist"><button type="button" role="tab" data-tab="acc" aria-selected="true">配件</button><button type="button" role="tab" data-tab="title" aria-selected="false">稱號</button><button type="button" role="tab" data-tab="emo" aria-selected="false">動作與表情</button></nav><div class="eq-body"><img alt="穿上裝備的角色" width="240" height="300"><div class="eq-slots"></div></div><p class="form-error" role="status"></p><div class="buttons"><button type="button" data-edit-look>調整外觀（捏臉）</button><button class="orange">完成</button></div></form>';
    document.body.append(d);
  }
  d.querySelector('[data-edit-look]').onclick = async () => {   // 調整外觀從角色卡移到這裡：關掉面板 → 捏臉 → 回來
    d.close();
    try { await editAppearance('edit'); } catch (e) { alert((e && e.message) || '外觀儲存失敗，請重試。'); }
    openEquipPanel();
  };
  const slots = d.querySelector('.eq-slots'), img = d.querySelector('img'), err = d.querySelector('.form-error');
  const rows = [['knee', '護膝', OPTIONS.knee]].concat(Object.entries(EQUIP).map(([k, v]) => [k, v.name, v.items]));
  let tab = 'acc';
  d.querySelector('.eq-tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; d.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b))); draw(); };
  const draw = async () => {
    if (tab !== 'acc') return drawProg();
    const L = decodeLook(readLook()), eq = readEquip(), long = L.pants === 1;
    slots.innerHTML = rows.map(([k, name, items]) => {
      const cur = k === 'knee' ? L.knee : eq[k] | 0;
      return `<div class="eq-row"><span>${name}${k === 'knee' && long ? '<small>穿長褲時不戴護膝</small>' : ''}</span><div class="eq-items">${items.map((t, i) => `<button type="button" data-k="${k}" data-i="${i}" aria-pressed="${cur === i}"${k === 'knee' && long ? ' disabled' : ''}>${t}</button>`).join('')}</div></div>`;
    }).join('');
    try { preview(img); err.textContent = ''; } catch { err.textContent = '角色預覽載入失敗。'; }
  };
  // WEB-010：稱號（解鎖的成就才能套用）、動作與表情（選 4 個放進 T 輪盤：左、右、上、下）
  const drawProg = async () => {
    const P = await import('./progress.js'), prog = (await P.loadProgress()) || {}, got = prog.achievements || [];
    if (tab === 'title') {
      slots.innerHTML = `<div class="eq-row"><span>套用稱號<small>比賽中名牌前面會顯示，大家都看得到</small></span><div class="eq-items"><button type="button" data-title="" aria-pressed="${!prog.title}">不顯示</button>${Object.entries(P.ACHIEVEMENTS).map(([k, a]) => `<button type="button" data-title="${k}" aria-pressed="${prog.title === k}"${got.includes(k) ? '' : ' disabled'} title="${a.name}：${a.desc}">${got.includes(k) ? '' : '🔒 '}${a.title}</button>`).join('')}</div></div><p class="eq-note">還沒解鎖的稱號：完成成就就能用（只有開房間的比賽會算）。</p>`;
    } else {
      const w = P.myWheel(), lv = P.levelOf(prog.exp);
      slots.innerHTML = `<div class="eq-row"><span>T 輪盤（Lv${lv}）<small>按住 T、滑鼠往左／右／上／下選</small></span><div class="eq-wheel">${['左', '右', '上', '下'].map((t, i) => `<div><small>${t}</small><b>${w[i] ? P.EMOTES[w[i]].icon + ' ' + P.EMOTES[w[i]].name : '（空）'}</b></div>`).join('')}</div></div>
        <div class="eq-row"><span>已有的動作與表情<small>點一下放進／拿出輪盤（最多 4 個）</small></span><div class="eq-items">${Object.entries(P.EMOTES).map(([k, e]) => { const ok = P.emoteUnlocked(k, prog); return `<button type="button" data-emo="${k}" aria-pressed="${w.includes(k)}"${ok ? '' : ' disabled'} title="${e.lv ? `Lv${e.lv} 解鎖` : e.ach ? `成就「${P.ACHIEVEMENTS[e.ach].name}」解鎖` : '一開始就有'}">${ok ? '' : '🔒 '}${e.icon} ${e.name}</button>`; }).join('')}</div></div>`;
    }
  };
  slots.onclick = async (e) => {
    const tb = e.target.closest('button[data-title]');
    if (tb && !tb.disabled) { try { const P = await import('./progress.js'); await P.setTitle(tb.dataset.title || null); err.textContent = ''; } catch (x) { err.textContent = (x && x.message) || '套用稱號失敗'; } draw(); return; }
    const eb = e.target.closest('button[data-emo]');
    if (eb && !eb.disabled) { const P = await import('./progress.js'); let w = P.myWheel(); const k = eb.dataset.emo; w = w.includes(k) ? w.filter((x) => x !== k) : w.length >= 4 ? (err.textContent = '輪盤最多 4 個，先拿掉一個', w) : [...w, k]; if (w.length <= 4) { await P.setWheel(w.length ? w : P.DEFAULT_WHEEL.slice(0, 1)); } draw(); return; }
    const b = e.target.closest('button[data-k]'); if (!b || b.disabled) return;
    const k = b.dataset.k, i = +b.dataset.i;
    if (k === 'knee') {
      const L = decodeLook(readLook()); L.knee = i; saveLook(L);
      try { const { syncAppearance } = await import('./account-flow.js'); await syncAppearance(); } catch (x) { err.textContent = (x && x.message) || '護膝存到帳號失敗，稍後會再同步。'; }
    } else { const eq = readEquip(); eq[k] = i; saveEquip(eq); }
    draw();
  };
  draw(); d.showModal();
  preloadAvatars().then(() => { if (d.open) draw(); }, () => {});   // 模型載好再畫一次（配件只有正式模型才有）
}
// WEB-010 成就系統：左＝選中系列的詳情與每一階進度；右＝名字框（等級、成就點數、稱號）、分類分頁、系列清單（開房比賽才會累積）
export async function openAchievementPanel() {
  if (!document.getElementById('lobby-shell') || editing) return;
  let d = document.getElementById('ach-panel');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'ach-panel'; d.setAttribute('aria-labelledby', 'ach-title');
    d.innerHTML = '<form method="dialog"><header class="ach-top"><button class="ach-back" aria-label="關閉">←</button><h2 id="ach-title">成就系統</h2></header><div class="ach-cols"><section class="ach-detail"></section><section class="ach-right"><div class="ach-me"></div><nav class="ach-cats" role="tablist"></nav><div class="ach-series"></div></section></div><p class="ach-tip">💡 只有開房間的比賽會累積（練習模式不算）。解鎖的稱號到「球衣與裝備 → 稱號」套用。</p></form>';
    document.body.append(d);
  }
  const P = await import('./progress.js');
  let cat = 'all', sel = P.ACH_SERIES[0].id, prog = P.cachedProgress() || {};
  const got = () => prog.achievements || [];
  const tierPr = (k) => { const pr = P.achProgress(k, prog), ok = got().includes(k); return { ok, cur: pr ? Math.min(pr[0], pr[1]) : ok ? 1 : 0, need: pr ? pr[1] : 1, one: !pr }; };
  const seriesPr = (S) => {
    const t = S.tiers.map(tierPr), done = t.filter((x) => x.ok).length, next = t[done];
    const pct = Math.round(((done + (next && !next.one ? next.cur / next.need : 0)) / t.length) * 100);
    return { done, total: t.length, pct, badge: done === t.length ? `${done} / ${t.length} 已完成` : next.one ? `${done} / ${t.length}` : `${next.cur} / ${next.need}` };
  };
  const drawMe = () => {
    const nick = (window.VBSettings && window.VBSettings.values.nickname) || '球友', lv = P.levelOf(prog.exp), t = prog.title && P.ACHIEVEMENTS[prog.title];
    d.querySelector('.ach-me').innerHTML = `<div class="ach-me-ic">🏐</div><div class="ach-me-tx"><b>${esc(nick)}</b><span>Lv${lv}・總成就點數 ${P.achPoints(got())} PT・已解鎖 ${got().length} / ${Object.keys(P.ACHIEVEMENTS).length}</span></div>${t ? `<span class="ach-badge">${esc(t.title)}</span>` : '<span class="ach-badge off">未套用稱號</span>'}`;
  };
  const drawCats = () => { d.querySelector('.ach-cats').innerHTML = P.ACH_CATS.map(([k, name]) => `<button type="button" role="tab" data-cat="${k}" aria-selected="${cat === k}">${name}${k === 'all' ? `（${P.ACH_SERIES.length}）` : ''}</button>`).join(''); };
  const drawList = () => {
    d.querySelector('.ach-series').innerHTML = P.ACH_SERIES.filter((S) => cat === 'all' || S.cat === cat).map((S) => {
      const pr = seriesPr(S);
      return `<button type="button" class="ach-s${S.id === sel ? ' on' : ''}${pr.done === pr.total ? ' done' : ''}" data-s="${S.id}"><span class="ach-s-ic">${S.icon}</span><span class="ach-s-tx"><b>${esc(S.name)}</b><small>${esc(S.desc)}</small></span><span class="ach-s-b">${pr.badge}</span><span class="ach-s-ar">${S.id === sel ? '◀' : '›'}</span></button>`;
    }).join('');
  };
  const drawDetail = () => {
    const S = P.ACH_SERIES.find((x) => x.id === sel), pr = seriesPr(S);
    const tiers = S.tiers.map((k, i) => {
      const a = P.ACHIEVEMENTS[k], t = tierPr(k), pct = t.ok ? 100 : Math.round((t.cur / t.need) * 100);
      const foot = t.ok ? '<div class="ach-t-done">✓ 已達成</div>' : t.one ? '<div class="ach-t-one">一場比賽內達成就解鎖</div>' : `<div class="ach-t-pr"><span>進度：${t.cur} / ${t.need}</span><span>${pct}%</span></div><div class="ach-bar"><i style="width:${pct}%"></i></div>`;
      return `<div class="ach-t${t.ok ? ' ok' : ''}"><div class="ach-t-h"><span class="ach-t-n">${i + 1}</span><b>${esc(a.name)}</b><span class="ach-badge sm">稱號「${esc(a.title)}」</span></div><p>${esc(a.desc)}・${P.ACH_POINTS[k] || 0} PT</p>${foot}</div>`;
    }).join('');
    d.querySelector('.ach-detail').innerHTML = `<div class="ach-hero"><div class="ach-hero-ic">${S.icon}</div><h3>${esc(S.name)}</h3><p>${esc(S.desc)}</p><div class="ach-hero-pr"><span>項目總進度</span><b>${pr.pct}%</b></div><div class="ach-bar big"><i style="width:${pr.pct}%"></i></div></div><div class="ach-tiers-h"><span>階梯式成就進度（點右邊切換項目）</span><b>已達成 ${pr.done} / ${pr.total}</b></div><div class="ach-tiers">${tiers}</div>`;
  };
  const drawAll = () => { drawMe(); drawCats(); drawList(); drawDetail(); };
  d.querySelector('.ach-cats').onclick = (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat;
    if (!P.ACH_SERIES.some((S) => S.id === sel && (cat === 'all' || S.cat === cat))) sel = (P.ACH_SERIES.find((S) => cat === 'all' || S.cat === cat) || P.ACH_SERIES[0]).id;
    drawCats(); drawList(); drawDetail();
  };
  d.querySelector('.ach-series').onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; sel = b.dataset.s; drawList(); drawDetail(); };
  drawAll(); d.showModal();
  prog = (await P.loadProgress()) || prog; drawAll();
}
// WEB-010 球隊（Lv10 解鎖）：建立／用邀請碼加入、成員名單、隊長設計球衣並取名、穿上球隊球衣、離開
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export async function openTeamPanel() {
  if (!document.getElementById('lobby-shell') || editing) return;
  let d = document.getElementById('team-panel');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'team-panel'; d.setAttribute('aria-labelledby', 'team-title');
    d.innerHTML = '<form method="dialog"><h2 id="team-title">球隊</h2><div class="tm-body"></div><p class="form-error" role="status"></p><div class="buttons"><button class="orange">關閉</button></div></form>';
    document.body.append(d);
  }
  const body = d.querySelector('.tm-body'), err = d.querySelector('.form-error'), P = await import('./progress.js');
  const run = async (fn) => { err.textContent = ''; try { await fn(); } catch (x) { err.textContent = (x && x.message) || '球隊操作失敗'; } };
  const draw = async () => {
    const prog = (await P.loadProgress()) || {}, lv = P.levelOf(prog.exp);
    if (lv < P.TEAM_LEVEL) { body.innerHTML = `<p class="tm-lock">🔒 Lv${P.TEAM_LEVEL} 解鎖球隊系統（你現在 Lv${lv}）。<br>開房間打比賽就會累積經驗（練習模式不算）。</p>`; return; }
    let team = null; try { team = await P.teamApi('mine'); } catch (x) { body.innerHTML = `<p class="tm-lock">${esc(x.message)}</p>`; return; }
    if (!team) {
      body.innerHTML = '<div class="tm-row"><b>建立球隊</b><input id="tm-name" maxlength="12" placeholder="隊名（2～12 字）"><button type="button" data-op="create" class="orange">建立</button></div><div class="tm-row"><b>加入球隊</b><input id="tm-code" maxlength="6" placeholder="6 碼邀請碼" style="text-transform:uppercase"><button type="button" data-op="join">加入</button></div>';
      return;
    }
    const j = team.jersey || {}, wearing = !!readTeamJersey();
    if (wearing) saveTeamJersey(j);   // 隊長改了球衣：穿著的人跟著更新
    body.innerHTML = `<div class="tm-head"><h3>${esc(team.name)}</h3><span>邀請碼 <b>${esc(team.code)}</b>（給隊友輸入就能加入）</span></div>
      <div class="tm-cols"><div><b>成員（${team.members.length}）</b><ul class="tm-members">${team.members.map((m) => `<li>${m.owner ? '👑 ' : ''}${esc(m.nickname)}</li>`).join('')}</ul></div>
      <div><b>球隊球衣「${esc(j.name)}」</b><div class="tm-shirt" style="background:${esc(j.body)};border-color:${esc(j.trim)};color:${esc(j.num)}">10</div>
      ${team.isOwner ? `<div class="tm-design"><input id="tj-name" maxlength="12" value="${esc(j.name)}" placeholder="球衣名稱"><label>衣身 <input type="color" id="tj-body" value="${esc(j.body)}"></label><label>邊條 <input type="color" id="tj-trim" value="${esc(j.trim)}"></label><label>背號 <input type="color" id="tj-num" value="${esc(j.num)}"></label><button type="button" data-op="jersey">儲存球衣</button></div>` : '<p class="eq-note">隊長可以設計球衣、取名字。</p>'}
      <button type="button" data-op="wear" class="${wearing ? '' : 'orange'}">${wearing ? '脫下球隊球衣' : '穿上球隊球衣'}</button><p class="eq-note">比賽以外（大廳、練習、走動）穿；比賽中照兩隊隊服。</p></div></div>
      <button type="button" data-op="leave" class="tm-leave">離開球隊</button>`;
  };
  body.onclick = (e) => {
    const b = e.target.closest('button[data-op]'); if (!b) return; const op = b.dataset.op;
    if (op === 'create') run(async () => { const n = d.querySelector('#tm-name').value.trim(); if ([...n].length < 2) throw new Error('隊名要 2～12 字'); await P.teamApi('create', n); await draw(); });
    if (op === 'join') run(async () => { await P.teamApi('join', d.querySelector('#tm-code').value.trim().toUpperCase()); await draw(); });
    if (op === 'jersey') run(async () => { await P.teamApi('jersey', { name: d.querySelector('#tj-name').value.trim() || '球隊球衣', body: d.querySelector('#tj-body').value, trim: d.querySelector('#tj-trim').value, num: d.querySelector('#tj-num').value }); await draw(); });
    if (op === 'wear') run(async () => { if (readTeamJersey()) saveTeamJersey(null); else { const t = await P.teamApi('mine'); if (t) saveTeamJersey(t.jersey); } await draw(); });
    if (op === 'leave') run(async () => { if (!confirm('確定要離開球隊嗎？')) return; await P.teamApi('leave'); saveTeamJersey(null); await draw(); });
  };
  body.innerHTML = '<p class="tm-lock">載入中…</p>'; d.showModal(); await draw();
}
// 大廳右欄下半部的角色資訊卡（登出、刪除帳號在「系統設定 → 其他」）
export function mountCharacterCard(card) {
  if (!card) return;
  const img = card.querySelector('img'), name = card.querySelector('.me-name'), err = card.querySelector('.me-err');
  const draw = () => { try { preview(img); err.textContent = ''; } catch { err.textContent = '角色預覽載入失敗，請重新整理。'; } };
  const setName = () => { name.textContent = (window.VBSettings && window.VBSettings.values.nickname) || '球友'; };
  const statsEl = card.querySelector('.me-stats tbody');
  const showProgress = async (prog) => {   // WEB-010：等級、經驗條、金幣、稱號、各難度戰績、遊玩時數（開房比賽才算，練習不算）
    const P = await import('./progress.js'); prog = prog || P.cachedProgress() || {};
    const exp = prog.exp | 0, lv = P.levelOf(exp), into = P.expInLevel(exp), st = prog.stats || {}, w = st.w || {}, l = st.l || {};
    card.querySelector('.me-lvn').textContent = `Lv${lv}`; card.querySelector('.me-bar i').style.width = `${(into / P.EXP_PER_LEVEL) * 100}%`;
    card.querySelector('.me-exp').textContent = `${into} / ${P.EXP_PER_LEVEL}`; card.querySelector('.me-coins').textContent = `🪙 ${prog.coins | 0}　⏱ 遊玩 ${((prog.play_seconds | 0) / 3600).toFixed(1)} 小時`;
    card.querySelector('.me-title').textContent = prog.title && P.ACHIEVEMENTS[prog.title] ? `「${P.ACHIEVEMENTS[prog.title].title}」` : '';
    statsEl.innerHTML = P.STAT_KEYS.map(([k, name]) => { const a = w[k] | 0, b = l[k] | 0; return `<tr><td>${name}</td><td>${a}</td><td>${b}</td><td>${a + b ? Math.round((a / (a + b)) * 100) + '%' : '—'}</td></tr>`; }).join('');
  };
  showProgress(); import('./progress.js').then((P) => P.loadProgress()).then(showProgress, () => {});
  addEventListener('vb-progress-change', () => showProgress());
  setName(); draw();
  preloadAvatars().then(draw, () => {});   // 模型載好再畫一次（一開始可能還是備用角色）
  addEventListener('vb-settings-change', setName);
  addEventListener('vb-look-change', draw);   // 從帳號同步回來的外觀
}
