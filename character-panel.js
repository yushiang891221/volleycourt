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

function preview(img, code = myLookCode(), opt = {}) {   // opt：ang＝轉幾度（弧度）、w／h＝圖片大小
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  try {
    const W = opt.w || 240, H = opt.h || 300;
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(opt.bg || '#152236');
    scene.add(new THREE.HemisphereLight('#ffffff', '#67738a', 2));
    const light = new THREE.DirectionalLight('#ffffff', 3); light.position.set(2, 4, 4); scene.add(light);
    const av = makeToyAvatar(decodeLook(code), readTeamJersey() || 'orange'); av.g.rotation.y = opt.ang || 0; scene.add(av.g);   // 含裝備、穿著的球隊球衣
    const camera = new THREE.PerspectiveCamera(32, W / H, .05, 20);
    if (opt.tight) { camera.position.set(.25, 1.0, 2.65); camera.lookAt(0, .8, 0); } else { camera.position.set(.35, 1.0, 2.95); camera.lookAt(0, .78, 0); }   // 角色整個人（含頭頂、帽子）都在預覽圖裡；tight＝裝備面板的大預覽
    renderer.render(scene, camera); img.src = renderer.domElement.toDataURL();
  } finally { renderer.dispose(); renderer.forceContextLoss(); }
}

// 球衣與裝備（三欄）：左＝角色預覽（可轉）、目前穿戴、玩家資料（可改暱稱）、調整外觀；中＝分類＋物品格；右＝稱號、T 輪盤動作
//   護膝存在外觀裡（會同步到帳號）；帽子、眼鏡、項鍊、護腕存在這台電腦；球隊球衣要加入球隊才有
const EQ_TABS = [['jersey', '球衣', '👕'], ['knee', '護膝', '🦵'], ['hat', '帽子', '🧢'], ['glasses', '眼鏡', '🕶️'], ['neck', '項鍊', '📿'], ['wrist', '護腕', '🎽']];
const ITEM_ICON = { knee: ['⬛', '⬜', '🚫'], hat: ['🚫', '🧢', '🧢'], glasses: ['🚫', '👓', '👓', '🕶️'], neck: ['🚫', '⚪', '🟡'], wrist: ['🚫', '⬜', '⬛'] };
const ITEM_TINT = { knee: ['#1c1c21', '#f2f2ee', ''], hat: ['', '#22252b', '#f2f2ee'], glasses: ['', '#1c1e24', '#d4af5a', '#14171c'], neck: ['', '#d9dde3', '#e8b94a'], wrist: ['', '#f4f4f0', '#22252b'] };
const ROLE_NAME = { S: '舉球', OPP: '舉對', OH: '大砲（主攻）', MB: '中間手' };
export async function openEquipPanel() {
  if (!document.getElementById('lobby-shell') || editing) return;
  let d = document.getElementById('equip-panel');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'equip-panel'; d.setAttribute('aria-labelledby', 'equip-title');
    d.innerHTML = `<form method="dialog">
      <header class="eqx-top"><button class="eqx-back" aria-label="關閉">←</button><h2 id="equip-title">球衣與裝備</h2><div class="eqx-money"><span title="成就點數">🎖️ <b data-pt>0</b> PT</span><span title="金幣">🪙 <b data-coin>0</b></span></div></header>
      <div class="eqx-cols">
        <section class="eqx-left">
          <div class="eqx-stage"><div class="eqx-tools"><button type="button" data-rot="-1" title="往左轉">⟲</button><button type="button" data-rot="1" title="往右轉">⟳</button><button type="button" data-rot="0" title="轉回正面">◎</button></div>
            <img class="eqx-img" alt="目前穿戴的角色" width="300" height="420"><div class="eqx-worn"><h4>目前穿戴 ✓</h4><ul></ul></div></div>
          <div class="eqx-card"><div class="eqx-name"><input data-nick maxlength="12" aria-label="暱稱"><button type="button" data-rename>改名</button></div><p class="eqx-err" role="status"></p>
            <dl><dt>👤 稱號</dt><dd data-title-now>—</dd><dt>🛡️ 球隊</dt><dd data-team>—</dd><dt>🏐 位置</dt><dd data-role>—</dd><dt>⭐ 等級</dt><dd><span data-lv>Lv1</span><span class="eqx-bar"><i></i></span><small data-exp>0 / 500</small></dd></dl></div>
          <button type="button" class="orange eqx-look" data-edit-look>👕 調整外觀（捏臉）</button>
        </section>
        <section class="eqx-mid"><nav class="eqx-tabs" role="tablist"></nav><div class="eqx-grid"></div><p class="eq-note eqx-hint"></p></section>
        <section class="eqx-right">
          <div class="eqx-box"><h3>🏅 玩家稱號</h3><div class="eqx-badge"><button type="button" data-tt="-1" aria-label="上一個">‹</button><div><div class="eqx-medal">🏆</div><b data-tt-name>不顯示稱號</b><small data-tt-desc></small></div><button type="button" data-tt="1" aria-label="下一個">›</button></div><button type="button" class="eqx-apply" data-tt-apply>套用這個稱號</button></div>
          <div class="eqx-box"><h3>🏃 玩家動作（T 輪盤）</h3><div class="eqx-wheel"></div><div class="eqx-emos"></div><p class="eq-note">點動作放進／拿出輪盤（最多 4 個）。遊戲中按住 T、滑鼠往左／右／上／下選。</p></div>
        </section>
      </div></form>`;
    document.body.append(d);
  }
  const $q = (sel) => d.querySelector(sel), P = await import('./progress.js');
  let tab = 'jersey', ang = 0, prog = P.cachedProgress() || {}, team = undefined, ttIdx = 0;
  const setErr = (t) => { $q('.eqx-err').textContent = t || ''; };
  const drawStage = () => { try { preview($q('.eqx-img'), myLookCode(), { ang, w: 360, h: 480, bg: '#101a2a', tight: true }); } catch { setErr('角色預覽載入失敗'); } };
  const itemsOf = (k) => {
    if (k === 'jersey') { const tj = readTeamJersey(); return [{ i: 0, name: '比賽隊服（橘黑）', icon: '👕', tint: '#F07C24', on: !tj }, { i: 1, name: team ? `球隊球衣「${team.jersey?.name || ''}」` : '球隊球衣', icon: '🎽', tint: team?.jersey?.body || '#2B6CB0', on: !!tj, lock: !team ? '加入球隊後解鎖' : '' }]; }
    const L = decodeLook(readLook()), eq = readEquip(), list = k === 'knee' ? OPTIONS.knee : EQUIP[k].items, cur = k === 'knee' ? L.knee : eq[k] | 0;
    return list.map((name, i) => ({ i, name, icon: ITEM_ICON[k][i], tint: ITEM_TINT[k][i], on: cur === i, lock: k === 'knee' && L.pants === 1 ? '穿長褲時不戴護膝' : '' }));
  };
  const drawWorn = () => {
    $q('.eqx-worn ul').innerHTML = EQ_TABS.map(([k, name, icon]) => { const it = itemsOf(k).find((x) => x.on); const none = !it || /不戴|不穿/.test(it.name); return `<li${none ? ' class="off"' : ''}><span class="eqx-wi" style="--t:${it?.tint || '#2a3a52'}">${it && !none ? it.icon : icon}</span><span><small>${name}</small><b>${none ? '未裝備' : esc(it.name)}</b></span></li>`; }).join('');
  };
  const drawMid = () => {
    $q('.eqx-tabs').innerHTML = EQ_TABS.map(([k, name, icon]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${icon} ${name}</button>`).join('');
    $q('.eqx-grid').innerHTML = itemsOf(tab).map((it) => `<button type="button" class="eqx-item${it.on ? ' on' : ''}${it.lock ? ' lock' : ''}" data-k="${tab}" data-i="${it.i}"${it.lock ? ' disabled' : ''}><span class="eqx-ii" style="--t:${it.tint || '#1d2a3d'}">${it.lock ? '🔒' : it.icon}</span><b>${esc(it.name)}</b>${it.on ? '<i class="eqx-check">✓</i>' : ''}${it.lock ? `<small>${esc(it.lock)}</small>` : ''}</button>`).join('');
    $q('.eqx-hint').textContent = tab === 'jersey' ? '比賽中照兩隊隊服；球隊球衣在大廳、練習、走動時穿。' : tab === 'knee' ? '護膝會存在帳號裡。' : '之後商店買到的配件也會出現在這裡。';
  };
  const unlockedTitles = () => [null, ...Object.keys(P.ACHIEVEMENTS).filter((k) => (prog.achievements || []).includes(k))];
  const drawRight = () => {
    const list = unlockedTitles(); ttIdx = Math.max(0, list.indexOf(prog.title || null)); if (ttIdx < 0) ttIdx = 0;
    const showTitle = () => { const k = list[ttIdx], a = k && P.ACHIEVEMENTS[k]; $q('[data-tt-name]').textContent = a ? a.title : '不顯示稱號'; $q('[data-tt-desc]').textContent = a ? `${a.name}：${a.desc}` : `已解鎖 ${list.length - 1} 個稱號`; $q('.eqx-medal').textContent = a ? '🏆' : '🔘'; const cur = (prog.title || null) === k; $q('[data-tt-apply]').textContent = cur ? '✓ 使用中' : '套用這個稱號'; $q('[data-tt-apply]').disabled = cur; };
    d._showTitle = showTitle; d._titles = list; showTitle();
    const w = P.myWheel(), slots = ['左', '右', '上', '下'];
    $q('.eqx-wheel').innerHTML = `<div class="eqx-hub">T</div>${slots.map((t, i) => `<div class="eqx-slot s${i}"><small>${t}</small><b>${w[i] ? P.EMOTES[w[i]].icon : '＋'}</b><span>${w[i] ? P.EMOTES[w[i]].name : '空'}</span></div>`).join('')}`;
    $q('.eqx-emos').innerHTML = Object.entries(P.EMOTES).map(([k, e]) => { const ok = P.emoteUnlocked(k, prog); return `<button type="button" data-emo="${k}" aria-pressed="${w.includes(k)}"${ok ? '' : ' disabled'} title="${e.lv ? `Lv${e.lv} 解鎖` : e.ach ? `成就「${P.ACHIEVEMENTS[e.ach].name}」解鎖` : '一開始就有'}">${ok ? e.icon : '🔒'} ${e.name}</button>`; }).join('');
  };
  const drawInfo = () => {
    const nickEl = $q('[data-nick]'); if (document.activeElement !== nickEl) nickEl.value = (window.VBSettings && window.VBSettings.values.nickname) || '';
    const exp = prog.exp | 0, lv = P.levelOf(exp), into = P.expInLevel(exp), t = prog.title && P.ACHIEVEMENTS[prog.title];
    $q('[data-pt]').textContent = P.achPoints(prog.achievements || []).toLocaleString(); $q('[data-coin]').textContent = (prog.coins | 0).toLocaleString();
    $q('[data-title-now]').textContent = t ? `「${t.title}」` : '未套用'; $q('[data-team]').textContent = team ? team.name : team === null ? '未加入' : '—';
    $q('[data-role]').textContent = ROLE_NAME[(() => { try { return JSON.parse(localStorage.getItem('vb.vmopt') || '{}').role; } catch { return ''; } })()] || '大砲（主攻）';
    $q('[data-lv]').textContent = `Lv${lv}`; $q('.eqx-bar i').style.width = `${(into / P.EXP_PER_LEVEL) * 100}%`; $q('[data-exp]').textContent = `${into} / ${P.EXP_PER_LEVEL}`;
  };
  const drawAll = () => { drawStage(); drawWorn(); drawMid(); drawRight(); drawInfo(); };
  d.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.rot !== undefined) { ang = b.dataset.rot === '0' ? 0 : ang + (+b.dataset.rot) * (Math.PI / 4); drawStage(); return; }
    if (b.dataset.tab) { tab = b.dataset.tab; drawMid(); return; }
    if (b.dataset.k) {
      const k = b.dataset.k, i = +b.dataset.i; setErr('');
      if (k === 'jersey') { if (i === 0) saveTeamJersey(null); else if (team) saveTeamJersey(team.jersey); }
      else if (k === 'knee') { const L = decodeLook(readLook()); L.knee = i; saveLook(L); try { const { syncAppearance } = await import('./account-flow.js'); await syncAppearance(); } catch (x) { setErr((x && x.message) || '護膝存到帳號失敗，稍後會再同步。'); } }
      else { const eq = readEquip(); eq[k] = i; saveEquip(eq); }
      drawStage(); drawWorn(); drawMid(); return;
    }
    if (b.dataset.tt) { const n = d._titles.length; ttIdx = (ttIdx + (+b.dataset.tt) + n) % n; d._showTitle(); return; }
    if (b.hasAttribute('data-tt-apply')) { try { await P.setTitle(d._titles[ttIdx]); prog = P.cachedProgress() || prog; setErr(''); } catch (x) { setErr((x && x.message) || '套用稱號失敗'); } drawRight(); drawInfo(); return; }
    if (b.dataset.emo) { let w = P.myWheel(); const k = b.dataset.emo; if (w.includes(k)) w = w.filter((x) => x !== k); else if (w.length >= 4) { setErr('輪盤最多 4 個，先拿掉一個'); return; } else w = [...w, k]; await P.setWheel(w.length ? w : P.DEFAULT_WHEEL.slice(0, 1)); setErr(''); drawRight(); return; }
    if (b.hasAttribute('data-rename')) {
      const v = $q('[data-nick]').value.trim(), bad = window.VBSettings && window.VBSettings.nicknameError(v);
      if (bad) { setErr(bad); return; }
      window.VBSettings.update({ nickname: v }); setErr('✓ 暱稱已更新'); return;   // 登入模式會自動存進帳號（暱稱撞名會提示）
    }
    if (b.hasAttribute('data-edit-look')) { d.close(); try { await editAppearance('edit'); } catch (x) { alert((x && x.message) || '外觀儲存失敗，請重試。'); } openEquipPanel(); }
  };
  drawAll(); d.showModal();
  preloadAvatars().then(() => { if (d.open) drawStage(); }, () => {});   // 模型載好再畫一次（配件只有正式模型才有）
  prog = (await P.loadProgress()) || prog;
  try { team = await P.teamApi('mine'); } catch { team = null; }
  if (d.open) { drawWorn(); drawMid(); drawRight(); drawInfo(); }
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
