// ---------------------------------------------------------------- panel UI
function setPressed(el, v) { el.setAttribute('aria-pressed', v ? 'true' : 'false'); }
let toastTimer = 0;
// 手機沒有鍵盤：提示裡的按鍵換成畫面上動作鍵的名字
const TOUCH_WORDS = [
  [/拿著球按左鍵（扣球）/g, '拿著球按「扣球」或「跳扣」'],
  [/C 輪盤舉球、V 接球、E 上手接球、V 發球、在網子前按 R 攻擊/g, '右下角的「舉球」「接球」「發球」鍵都能用，在網子前按「扣球」攻擊'],
  [/V 發球、F 拋給隊友、1／2／3 自己拋起來舉、C 自己墊/g, '「攻擊」鍵發球、「傳」拋給隊友、「舉前／舉中／舉後」自己拋起來舉'],
  [/跑到黃圈、起跳、按 V/g, '跑到黃圈、按「跳」、在空中按「攻擊」'],
  [/再按 V/g, '再按「攻擊」'], [/按 V/g, '按「攻擊」'], [/按左鍵/g, '按「攻擊」'], [/左鍵發球/g, '「攻擊」鍵發球'],
  [/用 E（上手接球）或 V（接球）接/g, '用「舉球」或「接球」接'],
  [/時用 C 輪盤舉球/g, '時按「舉球」'], [/時按 V/g, '時按「接球」'],
  [/（看著球車按 F）/g, '（走到球車旁點它）'], [/空手按左鍵拿球/g, '點球撿起來'],
  [/按 F 或開始走路/g, '點互動鈕或開始走路'], [/按 F 打開電腦/g, '點互動鈕打開電腦'],
  [/再按 Q/g, '再按「接球」'], [/按 F/g, '按「傳球」'],
];
function toast(msg, ms = 3200) {
  if (window.__walk && matchMedia('(pointer: coarse)').matches) for (const [re, to] of TOUCH_WORDS) msg = msg.replace(re, to);
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

function renderTemplates() {
  const box = $('tpl-list'); box.textContent = '';
  TEMPLATES.forEach((t, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tpl'; b.id = 'tpl-' + i;
    const bb = document.createElement('b'); bb.textContent = t.title;
    const sp = document.createElement('span'); sp.textContent = t.sub;
    b.append(bb, sp);
    b.addEventListener('click', () => {
      pushHistory();
      state = fromTemplate(t.make); selectedId = null; selZoneId = null;
      fullRefresh(); frameView('bird'); pv.fitted = false; renderPlan();
      toast('已套用範本；想回到剛才的配置，按「復原」。');
    });
    box.appendChild(b);
  });
}
function initBuildingInputs() {
  const fs = $('b-floor'), ns = $('b-net');
  for (const [k, v] of Object.entries(SCHEMES)) { const o = document.createElement('option'); o.value = k; o.textContent = v.name; fs.appendChild(o); }
  for (const [k, v] of Object.entries(NETS)) { const o = document.createElement('option'); o.value = k; o.textContent = v.label; ns.appendChild(o); }
  const dimChange = (key, min, max) => (e) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    const nv = clamp(Math.round(v * 2) / 2, min, max);
    if (nv === state.building[key]) return;
    pushHistory(); if (key !== 'H' && state.building.poly) { delete state.building.poly; delete state.building.geo; toast('改了長寬，外框改回長方形；要真實形狀請再描一次外框'); } state.building[key] = nv;
    buildBuilding(); buildZones(); renderItems(); commit(); pv.fitted = false; renderPlan();
  };
  $('b-L').addEventListener('change', dimChange('L', 10, 160));
  $('b-W').addEventListener('change', dimChange('W', 10, 160));
  $('b-H').addEventListener('change', dimChange('H', 4, 15));
  fs.addEventListener('change', () => { pushHistory(); state.floor = fs.value; buildBuilding(); buildZones(); renderItems(); commit(); });
  ns.addEventListener('change', () => { pushHistory(); state.net = ns.value; renderItems(); commit(); });
  $('b-wall').addEventListener('change', (e) => { pushHistory(); if (e.target.value === 'plaster') state.building.wall = 'plaster'; else delete state.building.wall; tintCache.clear(); planChanged(); renderColorInputs(); });
  $('b-entryW').addEventListener('change', (e) => { const v = Number(e.target.value); if (!Number.isFinite(v)) return; pushHistory(); state.building.entryW = clamp(Math.round(v * 10) / 10, 0.9, 12); planChanged(); toast(`主入口寬度改成 ${state.building.entryW} m`); });
  wireColorPickers($('b-colors'), (k, v) => setColor(k, v));
  $('design-name').addEventListener('input', (e) => { state.name = e.target.value.slice(0, 40) || '未命名方案'; saveDraftSoon(); renderSaved(); });
}
// 顏色：每一項一個色票＋「預設」；改了 3D 立刻更新
const COLOR_LABELS = { hall: '館內地板', court: '球場內場', free: '球場外圍（緩衝區）', wood: '木地板顏色（木紋還在）', wall: '牆面（鐵皮浪板紋路還在）', roof: '鐵皮屋頂', steel: '鋼構（柱子、屋樑）', pad: '防撞墊' };
const COLOR_SWATCH = {
  hall: ['#E6E3DD', '#B9BCC0', '#8E9399', '#C9A06A', '#3E7B5B', '#2D5DA1'],
  court: ['#E07B39', '#C4553A', '#3E7B5B', '#2D5DA1', '#E3C08C', '#F2C230'],
  free: ['#2D5DA1', '#2E8C8C', '#3E7B5B', '#8E9399', '#C4553A', '#E3C08C'],
  wall: ['#EFEBE4', '#DADDDF', '#F4F4F2', '#2F3B4C', '#B8322B', '#2F5FA8'],
  wood: ['#E3C08C', '#D9B07A', '#C9A06A', '#B07A44', '#8E5A33', '#F0D9AE'],
  roof: ['#DADDE0', '#B9C2CC', '#2F5FA8', '#3E7B5B', '#B8352E', '#4A4F57'],
  steel: ['#3B3F45', '#1F2124', '#E8E6E1', '#2F5FA8', '#B8352E', '#3E7B5B'],
  pad: ['#24345A', '#B8322B', '#2F5FA8', '#2E8B57', '#F2B705', '#1F2124'],
};
function colorDefault(k) {
  const sc = SCHEMES[state.floor] || SCHEMES.pu;
  return { hall: sc.wood ? '#C9A06A' : sc.base || '#E6E3DD', court: sc.court, free: sc.free, wood: sc.court, wall: isMetal() ? '#D4D8DC' : '#EFEBE4', roof: '#DADDE0', steel: '#3B3F45', pad: sc.pad }[k] || '#888888';
}
// 調色器：一排常用色＋「調色」打開 R、G、B 三個拉桿（0–255）自己調；拉的時候色塊即時變，放開才套用
let cpOpen = '';   // 哪一個調色器的 RGB 拉桿開著（重畫後保持打開）
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
function colorPickerHtml(key, label, value, custom, swatches) {
  const [r, g, b] = hex2rgb(value);
  return `<div class="cp" data-cp="${key}"><div class="cp-head"><i class="cp-cur" style="background:${value}"></i><span class="cp-l">${label}${custom ? '' : '<small>（配色預設）</small>'}</span><button type="button" class="cp-more" aria-expanded="false">調色</button>${custom ? '<button type="button" class="cp-reset">預設</button>' : ''}</div>
    <div class="cp-sw">${swatches.map((h) => `<button type="button" class="cp-s" data-cv="${h}" style="background:${h}" aria-label="${label} ${h}" aria-pressed="${value.toUpperCase() === h.toUpperCase()}"></button>`).join('')}</div>
    <div class="cp-rgb" hidden>${[['R', r, '#E5484D'], ['G', g, '#30A46C'], ['B', b, '#3E63DD']].map(([n, v, col]) => `<label><b style="color:${col}">${n}</b><input type="range" min="0" max="255" value="${v}" data-ch="${n}" style="accent-color:${col}"><input type="number" min="0" max="255" value="${v}" data-chn="${n}"></label>`).join('')}<code class="cp-hex">${value.toUpperCase()}</code></div></div>`;
}
// 一個容器裡的所有調色器共用一組事件：onPick(key, hex|null)
function wireColorPickers(root, onPick) {
  const rgbOf = (cp) => ['R', 'G', 'B'].map((n) => Number(cp.querySelector(`[data-ch="${n}"]`).value));
  const preview = (cp) => { const h = rgb2hex(...rgbOf(cp)); cp.querySelector('.cp-cur').style.background = h; cp.querySelector('.cp-hex').textContent = h; return h; };
  root.addEventListener('click', (e) => {
    const cp = e.target.closest('.cp'); if (!cp) return;
    if (e.target.closest('.cp-more')) { const box = cp.querySelector('.cp-rgb'); box.hidden = !box.hidden; e.target.closest('.cp-more').setAttribute('aria-expanded', String(!box.hidden)); cpOpen = box.hidden ? '' : `${root.id}:${cp.dataset.cp}`; return; }
    if (e.target.closest('.cp-reset')) { onPick(cp.dataset.cp, null); return; }
    const sw = e.target.closest('.cp-s'); if (sw) onPick(cp.dataset.cp, sw.dataset.cv);
  });
  root.addEventListener('input', (e) => {
    const cp = e.target.closest('.cp'); if (!cp) return;
    const n = e.target.dataset.ch || e.target.dataset.chn; if (!n) return;
    const v = clamp(Math.round(Number(e.target.value) || 0), 0, 255);
    cp.querySelector(`[data-ch="${n}"]`).value = v; if (e.target.dataset.ch) cp.querySelector(`[data-chn="${n}"]`).value = v;
    preview(cp);
  });
  root.addEventListener('change', (e) => { const cp = e.target.closest('.cp'); if (!cp || !(e.target.dataset.ch || e.target.dataset.chn)) return; onPick(cp.dataset.cp, preview(cp), true); });
}
function reopenPicker(root) { if (!root || !cpOpen.startsWith(root.id + ':')) return; const k = cpOpen.slice(root.id.length + 1); const cp = root.querySelector(`.cp[data-cp="${k}"]`); if (cp) { cp.querySelector('.cp-rgb').hidden = false; cp.querySelector('.cp-more').setAttribute('aria-expanded', 'true'); } }
function renderColorInputs() {
  const box = $('b-colors'); if (!box) return;
  const c = state.colors || {};
  box.innerHTML = `<p class="hint" style="margin:10px 0 6px">顏色：點色塊直接換，或按「調色」用 R、G、B 拉桿調。每一面球場也可以各自選色（選取那面球場）。</p>` + COLOR_KEYS.filter((k) => (k !== 'roof' && k !== 'steel') || isMetal()).filter((k) => k !== 'wood' || (SCHEMES[state.floor] || {}).grain || (SCHEMES[state.floor] || {}).wood).map((k) => colorPickerHtml(k, COLOR_LABELS[k], c[k] || colorDefault(k), !!c[k], COLOR_SWATCH[k])).join('');
  reopenPicker(box);
}
// 單一面球場的顏色（沒設就跟全館一樣）
function courtColorHtml(it) {
  const sc = scheme(), cc = it.cc || {};
  return `<p class="hint" style="margin:4px 0">這一面球場的顏色（沒改就跟全館一樣）</p>` + [['court', '球場內場'], ['free', '球場外圍（緩衝區）']].map(([k, l]) => colorPickerHtml(k, l, cc[k] || sc[k], !!cc[k], COLOR_SWATCH[k])).join('');
}
function compositeHtml(it, idp) {
  const def = CAT[it.type], ex = it.extra || [], use = it.use || def.court;
  const others = Object.keys(SPORT).filter((k) => k !== def.court);
  return `<div class="comp"><p class="hint" style="margin:6px 0 4px"><b>複合球場</b>：同一塊地板也畫這些線（顏色不同）</p>
    <div class="comp-row">${others.map((k) => `<label class="chk"><input type="checkbox" data-ex="${k}"${ex.includes(k) ? ' checked' : ''}><i style="background:${EXTRA_COL[k]}"></i>${SPORT[k]}</label>`).join('')}</div>
    <div class="grid2"><label class="field" for="${idp}-use"><span>現在架哪一種網</span><select id="${idp}-use">${[def.court, ...ex].map((k) => `<option value="${k}"${use === k ? ' selected' : ''}>${SPORT[k]}${k === def.court ? '（主要）' : ''}</option>`).join('')}<option value="none"${use === 'none' ? ' selected' : ''}>都收起來（空場地）</option></select></label>
    <label class="field" for="${idp}-surf"><span>這面的地板</span><select id="${idp}-surf">${Object.entries(COURT_SURF).map(([k, l]) => `<option value="${k}"${(it.surf || '') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
    ${def.court === 'vb' ? `<label class="field" for="${idp}-post"><span>排球網柱款式</span><select id="${idp}-post">${Object.entries(VB_POST).map(([k, l]) => `<option value="${k}"${(it.post || '') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}</div>`;
}
function wireComposite(root, it, idp, rerender) {
  root.addEventListener('change', (e) => {
    const t = e.target; if (!t) return;
    pushHistory();
    if (t.dataset.ex) { const ex = new Set(it.extra || []); if (t.checked) ex.add(t.dataset.ex); else { ex.delete(t.dataset.ex); if (it.use === t.dataset.ex) delete it.use; } if (ex.size) it.extra = [...ex]; else delete it.extra; }
    else if (t.id === idp + '-use') { if (t.value === CAT[it.type].court) delete it.use; else it.use = t.value; }
    else if (t.id === idp + '-surf') { if (t.value) it.surf = t.value; else delete it.surf; }
    else if (t.id === idp + '-post') { if (t.value) it.post = t.value; else delete it.post; }
    rerenderOne(it); commit(); rerender && rerender();
    if (t.dataset.ex && t.checked) toast(`加畫了${SPORT[t.dataset.ex]}線（${t.dataset.ex === 'bd' || t.dataset.ex === 'pb' ? extraLayout(t.dataset.ex, CAT[it.type].w, CAT[it.type].d).length + ' 面' : '1 面'}），要打${SPORT[t.dataset.ex]}時在「現在架哪一種網」切換`);
  });
}
function setCourtColor(it, k, v, rerender) {
  pushHistory(); it.cc = { ...(it.cc || {}) };
  if (v) it.cc[k] = v; else delete it.cc[k];
  if (!Object.keys(it.cc).length) delete it.cc;
  rerenderOne(it); commit(); rerender && rerender();
}
function setColor(k, v) {
  pushHistory(); state.colors = { ...(state.colors || {}) };
  if (v) state.colors[k] = v; else delete state.colors[k];
  texCache.clear(); buildBuilding(); buildZones(); renderItems(); commit(); renderColorInputs();
}
function syncBuildingInputs() {
  const { L, W, H } = state.building;
  $('b-L').value = L; $('b-W').value = W; $('b-H').value = H;
  $('b-floor').value = state.floor; $('b-net').value = state.net; if (document.activeElement !== $('b-entryW')) $('b-entryW').value = state.building.entryW || 3; $('b-wall').value = isMetal() ? 'metal' : 'plaster';
  if (!$('b-colors').contains(document.activeElement) && !cpOpen.startsWith('b-colors:')) renderColorInputs();
  if (document.activeElement !== $('design-name')) $('design-name').value = state.name;
  $('r-ping').textContent = fmt1((L * W) / PING);
  $('r-m2').textContent = `${fmt1(L * W)} ㎡`;
  const hc = $('r-height');
  hc.className = 'chip ' + (H < 7 ? 'bad' : H < 9 ? 'note' : 'ok');
  hc.textContent = H < 7 ? '淨高太低' : H < 9 ? '淨高可打' : '淨高理想';
}
function renderPalette() {
  const root = $('palette'); root.textContent = '';
  const q = document.createElement('input'); q.type = 'search'; q.id = 'pal-search'; q.placeholder = '搜尋元件，例如：冷氣、置物櫃'; q.className = 'pal-search';
  root.appendChild(q);
  const groups = [];
  for (const grp of GROUPS) {
    const wrap = document.createElement('details'); wrap.className = 'pal-group'; wrap.open = grp === '球場與比賽' || grp === '座椅與休息';
    const t = document.createElement('summary'); t.className = 'pal-title';
    const grid = document.createElement('div'); grid.className = 'pal';
    let n = 0;
    groups.push(wrap);
    for (const [type, def] of Object.entries(CAT)) {
      if (def.group !== grp) continue;
      n++;
      const b = document.createElement('button'); b.type = 'button'; b.id = 'add-' + type;
      const bb = document.createElement('b');
      const sw = document.createElement('i'); sw.className = 'sw'; sw.style.background = def.color;
      bb.append(sw, document.createTextNode(def.label));
      const sp = document.createElement('span');
      sp.textContent = def.diam ? `Ø${def.w} m` : def.wall ? '掛在牆上' : def.ceiling ? (type === 'camera' ? '掛在牆上' : '掛在天花板') : `${def.w}×${def.d} m`;
      b.append(bb, sp);
      b.addEventListener('click', () => addItem(type));
      b.dataset.q = def.label;
      grid.appendChild(b);
    }
    t.innerHTML = `${grp}<span>${n}</span>`;
    wrap.append(t, grid); root.appendChild(wrap);
  }
  q.addEventListener('input', () => {
    const v = q.value.trim();
    for (const g of groups) {
      let hit = 0;
      for (const b of g.querySelectorAll('button')) { const ok = !v || b.dataset.q.includes(v); b.hidden = !ok; if (ok) hit++; }
      g.hidden = !!v && !hit; if (v && hit) g.open = true;
    }
  });
}
function addItem(type) {
  const def = CAT[type];
  const { L, W } = state.building;
  pushHistory();
  // 放在畫面中央看著的地方；自由移動時鏡頭就在你眼前，改放到前面 4 m 的地上
  let sx = controls.target.x, sz = controls.target.z;
  if (fly.on) { const f = new THREE.Vector3().subVectors(controls.target, camera.position); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize(); sx = camera.position.x + f.x * 4; sz = camera.position.z + f.z * 4; }
  const it = { id: uid(), type, x: snap(clamp(sx, -L / 2 + 1, L / 2 - 1)), z: snap(clamp(sz, -W / 2 + 1, W / 2 - 1)), rot: type === 'light' ? 90 : 0 };
  if (def.resize || def.diam) { it.w = def.w; it.d = def.d; }
  let overlay = false;
  if (def.court) {
    // 找一塊空地：不壓到其他整片上色的球場、整面在廠房裡；離畫面中心最近的優先
    const others = state.items.filter((i) => CAT[i.type].court && i.mode !== 'lines'), B = hallBounds();
    let best = null;
    for (const rot of [0, 90]) for (let x = B.x0; x <= B.x1; x += 0.5) for (let z = B.z0; z <= B.z1; z += 0.5) {
      const fp = corners(x, z, def.w, def.d, rot);
      if (!inside(fp) || others.some((o2) => overlap(fp, footprint(o2), 0.05))) continue;
      const dd = Math.hypot(x - it.x, z - it.z); if (!best || dd < best.d) best = { x, z, rot, d: dd };
    }
    if (best) { it.x = best.x; it.z = best.z; it.rot = best.rot; }
    else if (others.length) { it.mode = 'lines'; overlay = true; }
  }
  state.items.push(it);
  rerenderOne(it);
  if (def.court === 'vb') { const cam = cameraFor(it, state.items.filter((i) => i.type === 'camera').length + 1); state.items.push(cam); rerenderOne(cam); }
  select(it.id);
  commit();
  toast(overlay ? `館內沒有空地放一整面${def.label}，先用「只畫線」疊在現有球場上（也可以選取排球場，在「複合球場」勾${def.label.replace(/（.*/, '')}線）` : def.court === 'vb' ? `已加入${def.label}，球場邊也自動架好攝影機` : `已加入${def.label}（有自己的地板），直接在畫面裡拖曳移動`);
}
function select(id) {
  selectedId = id; selSet.clear(); if (id) selSet.add(id);
  if (id) { selZoneId = null; selWallId = null; }
  updateOutline();
  renderSelection();
  if (typeof renderZoneSel === 'function' && typeof mode !== 'undefined') { renderZoneSel(); planToolState(); if (mode === 'plan') renderPlan(); }
}
// 多選：加選／取消（Shift 或 Ctrl 點），或一次設定一組
function toggleSel(id) {
  if (!selectedId) return select(id);
  const ids = new Set([...selSet, selectedId]);
  if (ids.has(id)) ids.delete(id); else ids.add(id);
  setSelection([...ids], ids.has(id) ? id : null);
}
function setSelection(ids, primary) {
  ids = ids.filter((id) => state.items.some((i) => i.id === id));
  if (ids.length <= 1) return select(ids[0] || null);
  selectedId = primary && ids.includes(primary) ? primary : ids[ids.length - 1]; selSet.clear(); for (const id of ids) selSet.add(id);
  selZoneId = null; selWallId = null;
  updateOutline(); renderSelection();
  if (typeof renderZoneSel === 'function') { renderZoneSel(); planToolState(); if (mode === 'plan') renderPlan(); }
}
function numField(id, label, value, step, onChange) {
  const l = document.createElement('label'); l.className = 'field'; l.htmlFor = id;
  const s = document.createElement('span'); s.textContent = label;
  const inp = document.createElement('input'); inp.type = 'number'; inp.id = id; inp.step = step; inp.value = value; inp.inputMode = 'decimal';
  inp.addEventListener('change', () => { const v = Number(inp.value); if (Number.isFinite(v)) onChange(v); });
  l.append(s, inp); return l;
}
function multiPanelHtml(n, idp) {
  const all = selItems(), locked = all.filter((i) => i.locked).length;
  return `<div class="multi-sel"><div class="sel-name">已選 ${n} 個物件</div>
    <p class="hint">Shift＋點物件可以加選或取消；平面圖按住 Shift 拖曳空白處可以框選（手機用「框選」）。拖其中一個會整組一起移動。</p>
    <div class="btn-row"><button type="button" class="primary" id="${idp}-mdup">複製這 ${n} 個（Ctrl+D）</button><button type="button" id="${idp}-mrot">整組轉 90°</button><button type="button" id="${idp}-mlock">${locked === all.length ? '全部解鎖' : '全部鎖定'}</button><button type="button" class="danger" id="${idp}-mdel">刪除（Delete）</button><button type="button" id="${idp}-mnone">取消選取（Esc）</button></div>
    <p class="hint">Ctrl+C 複製、Ctrl+V 貼上（每貼一次往右下錯開 1 m）、Ctrl+A 全選元件、方向鍵整組移動。</p></div>`;
}
function wireMultiPanel(idp, after) {
  $(idp + '-mdup').addEventListener('click', () => { duplicateSel(); after && after(); });
  $(idp + '-mrot').addEventListener('click', () => { rotateSel(90); after && after(); });
  $(idp + '-mlock').addEventListener('click', () => { toggleLockSel(); after && after(); });
  $(idp + '-mdel').addEventListener('click', () => { deleteSel(); after && after(); });
  $(idp + '-mnone').addEventListener('click', () => { select(null); after && after(); });
}
function renderSelection() {
  const body = $('sel-body'), empty = $('sel-empty');
  const it = state.items.find((x) => x.id === selectedId);
  if (!it) { body.hidden = true; empty.hidden = false; body.textContent = ''; return; }
  const many = selItems();
  if (many.length > 1) { empty.hidden = true; body.hidden = false; body.innerHTML = multiPanelHtml(many.length, 'sel'); wireMultiPanel('sel'); return; }
  empty.hidden = true; body.hidden = false; body.textContent = '';
  const def = CAT[it.type];
  const { w, d } = sizeOf(it);
  const wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.flexDirection = 'column'; wrap.style.gap = '10px';
  const name = document.createElement('div'); name.className = 'sel-name'; name.textContent = labelOf(it);
  const meta = document.createElement('div'); meta.className = 'sel-meta';
  meta.textContent = `${def.diam ? 'Ø' + fmt1(w) : fmt1(w) + '×' + fmt1(d)} m・旋轉 ${it.rot}°${def.court ? '・佔地 ' + fmt1((w * d) / PING) + ' 坪' : ''}`;
  wrap.append(name, meta);
  if (typeof window.openEval === 'function') {
    const ev = document.createElement('button'); ev.type = 'button'; ev.id = 'sel-eval'; ev.className = 'primary eval-link';
    ev.textContent = (window.evalLabel && window.evalLabel(it.type)) || '查看評估與報價 →';
    ev.addEventListener('click', () => window.openEval(it.type, labelOf(it)));
    const tip = document.createElement('p'); tip.className = 'hint'; tip.textContent = '在 3D 畫面裡雙擊物件也會直接打開。';
    wrap.append(ev, tip);
  }
  if (def.room || def.tag) {
    const l = document.createElement('label'); l.className = 'field'; l.htmlFor = 'sel-label';
    const s = document.createElement('span'); s.textContent = '名稱（例如男廁、女廁）';
    const inp = document.createElement('input'); inp.type = 'text'; inp.id = 'sel-label'; inp.maxLength = 20; inp.value = it.label || ''; inp.placeholder = def.label;
    inp.addEventListener('change', () => { pushHistory(); const v = inp.value.trim(); if (v) it.label = v.slice(0, 20); else delete it.label; rerenderOne(it); commit(); renderSelection(); });
    l.append(s, inp); wrap.appendChild(l);
  }
  const pos = document.createElement('div'); pos.className = 'grid2';
  pos.append(
    numField('sel-x', 'X（m，廠房中心為 0）', it.x, 0.5, (v) => { pushHistory(); it.x = v; moveObj(it); updateOutline(); commit(); }),
    numField('sel-z', 'Z（m）', it.z, 0.5, (v) => { pushHistory(); it.z = v; moveObj(it); updateOutline(); commit(); }),
  );
  wrap.appendChild(pos);
  if (def.resize) {
    const g2 = document.createElement('div'); g2.className = 'grid2';
    g2.appendChild(numField('sel-w', def.resize === 'w' ? '長度（m）' : '寬（m）', w, 0.5, (v) => { pushHistory(); it.w = clamp(v, 0.5, 60); rerenderOne(it); updateOutline(); commit(); renderSelection(); }));
    if (def.resize !== 'w') g2.appendChild(numField('sel-d', '深（m）', d, 0.5, (v) => { pushHistory(); it.d = clamp(v, 0.5, 60); rerenderOne(it); updateOutline(); commit(); renderSelection(); }));
    wrap.appendChild(g2);
  }
  if (def.diam) {
    const l = document.createElement('label'); l.className = 'field'; l.htmlFor = 'sel-diam';
    const s = document.createElement('span'); s.textContent = '吊扇直徑';
    const sel = document.createElement('select'); sel.id = 'sel-diam';
    for (const v of [3.7, 5.5, 7.3]) { const o = document.createElement('option'); o.value = v; o.textContent = `${v} m`; if (Math.abs(v - w) < 0.01) o.selected = true; sel.appendChild(o); }
    sel.addEventListener('change', () => { pushHistory(); it.w = it.d = Number(sel.value); rerenderOne(it); updateOutline(); commit(); renderSelection(); });
    l.append(s, sel); wrap.appendChild(l);
  }
  if (def.court) {
    const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', '畫法');
    for (const [mode, txt] of [['solid', '整片上色'], ['lines', '只畫線']]) {
      const b = document.createElement('button'); b.type = 'button'; b.id = 'sel-mode-' + mode; b.textContent = txt;
      setPressed(b, (it.mode || 'solid') === mode);
      b.addEventListener('click', () => { pushHistory(); if (mode === 'lines') it.mode = 'lines'; else delete it.mode; renderItems(); commit(); renderSelection(); });
      seg.appendChild(b);
    }
    const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = '同一塊地板畫多種球場時，第二種以後選「只畫線」。';
    wrap.append(seg, hint);
    if (it.mode !== 'lines') { const cx2 = document.createElement('div'); cx2.innerHTML = compositeHtml(it, 'sx'); wrap.appendChild(cx2); wireComposite(cx2, it, 'sx', renderSelection); }
    if (it.mode !== 'lines') { const cw = document.createElement('div'); cw.className = 'colors'; cw.id = 'sel-colors'; cw.innerHTML = courtColorHtml(it); wireColorPickers(cw, (k, v) => setCourtColor(it, k, v, renderSelection)); reopenPicker(cw); wrap.appendChild(cw); }
  }
  const row = document.createElement('div'); row.className = 'btn-row';
  const mkBtn = (id, txt, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = txt; if (cls) b.className = cls; b.addEventListener('click', fn); row.appendChild(b); return b; };
  const lockBtn = mkBtn('sel-lock', it.locked ? '解除鎖定' : '鎖定', toggleLockSel, it.locked ? 'primary' : '');
  lockBtn.setAttribute('aria-pressed', it.locked ? 'true' : 'false');
  mkBtn('sel-rot90', '旋轉 90°', () => rotateSel(90)).disabled = !!it.locked;
  mkBtn('sel-alignw', '對齊外牆', () => alignSelToWall()).disabled = !!it.locked;
  { const f = numField('sel-rotdeg', '角度（°）', it.rot, 0.1, (v) => { if (it.locked) return lockedMsg(); pushHistory(); it.rot = ((v % 360) + 360) % 360; moveObj(it); updateOutline(); commit(); renderSelection(); }); f.style.maxWidth = '140px'; wrap.appendChild(f); }
  mkBtn('sel-dup', '複製', duplicateSel);
  mkBtn('sel-del', '刪除', deleteSel, 'danger').disabled = !!it.locked;
  wrap.appendChild(row);
  if (it.locked) {
    for (const el of wrap.querySelectorAll('input, select, .seg button')) el.disabled = true;
    const n = document.createElement('p'); n.className = 'lock-note'; n.textContent = '已鎖定：不能拖曳、旋轉、改大小或刪除。在它上面拖曳會轉視角。';
    wrap.appendChild(n);
  }
  body.appendChild(wrap);
}
function lockedMsg() { toast('這個物件已鎖定，先按「解除鎖定」（或按 L）'); }
function toggleLockSel() {
  const many = selItems();
  if (many.length > 1) {
    const lock = many.some((i) => !i.locked); pushHistory();
    for (const i of many) { if (lock) i.locked = true; else delete i.locked; rerenderOne(i); }
    updateOutline(); commit(); renderSelection(); toast(lock ? `已鎖定 ${many.length} 個物件` : `已解除 ${many.length} 個物件的鎖定`); return;
  }
  const it = state.items.find((x) => x.id === selectedId); if (!it) return;
  pushHistory(); if (it.locked) delete it.locked; else it.locked = true;
  rerenderOne(it); updateOutline(); commit(); renderSelection();
  toast(it.locked ? `已鎖定${labelOf(it)}` : `已解除鎖定${labelOf(it)}`);
}
function setLockAll(lock) {
  const targets = state.items.filter((i) => (lock ? CAT[i.type].court && !i.locked : i.locked));
  if (!targets.length) { toast(lock ? '球場都已經鎖定了' : '目前沒有鎖定的物件'); return; }
  pushHistory();
  for (const i of targets) { if (lock) i.locked = true; else delete i.locked; }
  renderItems(); commit(); renderSelection();
  toast(lock ? `已鎖定 ${targets.length} 面球場` : `已解除 ${targets.length} 個物件的鎖定`);
}
function alignSelToWall() {
  const it = state.items.find((x) => x.id === selectedId); if (!it) return;
  if (it.locked) return lockedMsg();
  pushHistory(); it.rot = alignToWall(it); moveObj(it); updateOutline(); commit(); renderSelection(); renderPlan();
  toast(`已對齊最近的外牆（${f2(it.rot)}°）`);
}
function rotateSel(deg) {
  const many = selItems().filter((i) => !i.locked);
  if (selItems().length > 1) {
    // 整組繞中心轉（跟物件自己的角度同一個方向）
    if (!many.length) return lockedMsg();
    pushHistory();
    const cx = many.reduce((a, i) => a + i.x, 0) / many.length, cz = many.reduce((a, i) => a + i.z, 0) / many.length;
    const r = (deg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
    for (const i of many) { const lx = i.x - cx, lz = i.z - cz; i.x = f2(cx + lx * c + lz * sn); i.z = f2(cz - lx * sn + lz * c); i.rot = Math.round(norm360(i.rot + deg) * 100) / 100; rerenderOne(i); }
    updateOutline(); commit(); renderSelection(); return;
  }
  const it = state.items.find((x) => x.id === selectedId); if (!it) return;
  if (it.locked) return lockedMsg();
  pushHistory(); it.rot = Math.round(norm360(it.rot + deg) * 100) / 100; moveObj(it); updateOutline(); commit(); renderSelection();
}
// 整組複製：保持彼此的相對位置，往右錯開整組寬度
function cloneGroup(src, dx, dz) {
  const zmap = new Map();
  const copies = src.map((i) => { const c = { ...i, id: uid(), x: f2(i.x + dx), z: f2(i.z + dz) }; delete c.locked; delete c.zone; return c; });
  for (const c of copies) { state.items.push(c); }
  renderItems(); setSelection(copies.map((c) => c.id)); commit();
  return copies;
}
function groupBox(list) { const xs = [], zs = []; for (const i of list) for (const [x, z] of footprint(i)) { xs.push(x); zs.push(z); } return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }; }
function duplicateSel() {
  const many = selItems();
  if (many.length > 1) {
    pushHistory(); const b = groupBox(many);
    cloneGroup(many, Math.min(12, b.x1 - b.x0) + 0.5, 0);
    toast(`已複製 ${many.length} 個物件，整組選起來了，直接拖就能放到別的位置`); return;
  }
  const it = state.items.find((x) => x.id === selectedId); if (!it) return;
  pushHistory();
  const { w, d } = sizeOf(it);
  const copy = { ...it, id: uid(), x: it.x + Math.min(w, 3) + 0.5, z: it.z };
  delete copy.locked;
  if (CAT[it.type].ceiling) copy.x = it.x + Math.max(3, w + 0.5);
  if (CAT[it.type].court) { copy.x = it.x; copy.z = it.z + d; }
  state.items.push(copy); rerenderOne(copy); select(copy.id); commit();
}
function copySel() { const many = selItems(); if (!many.length) return; clip = many.map((i) => ({ ...i })); clipN = 0; toast(`已複製 ${many.length} 個物件，按 Ctrl+V 貼上`); }
function pasteClip() { if (!clip || !clip.length) return; pushHistory(); clipN++; cloneGroup(clip, clipN, clipN); toast(`已貼上 ${clip.length} 個物件`); }
function selectAllItems() { const ids = state.items.filter((i) => !CAT[i.type].court).map((i) => i.id); if (ids.length) { setSelection(ids); toast(`已選取全部 ${ids.length} 個元件（球場不含）`); } }
function deleteSel() {
  const many = selItems();
  if (many.length > 1) {
    const del = many.filter((i) => !i.locked); if (!del.length) return lockedMsg();
    pushHistory(); const ids = new Set(del.map((i) => i.id));
    state.items = state.items.filter((i) => !ids.has(i.id));
    renderItems(); select(null); commit();
    toast(`已刪除 ${del.length} 個物件${many.length > del.length ? `（${many.length - del.length} 個鎖定的沒刪）` : ''}，按「復原」可以拿回來`); return;
  }
  const i = state.items.findIndex((x) => x.id === selectedId); if (i < 0) return;
  if (state.items[i].locked) return lockedMsg();
  pushHistory();
  const [it] = state.items.splice(i, 1);
  const g = itemObjs.get(it.id); if (g) { g.traverse((o) => { const k = spinners.indexOf(o); if (k >= 0) spinners.splice(k, 1); }); disposeGroup(g); itemsGroup.remove(g); itemObjs.delete(it.id); }
  if (CAT[it.type].court) renderItems();
  select(null); commit();
}
function renderChecks() {
  const { warns, area, rest, courts } = computeChecks();
  const st = $('stats'); st.textContent = '';
  const count = (k) => courts.filter((c) => CAT[c.type].court === k).length;
  const courtTxt = [['vb', '排球'], ['bd', '羽球'], ['pb', '匹克'], ['bk', '籃球']].filter(([k]) => count(k)).map(([k, n]) => `${n} ${count(k)}`).join('・') || '還沒有球場';
  const stats = [
    [fmt1(area / PING) + ' 坪', '廠房總面積'],
    [fmt1(rest / PING) + ' 坪', '球場以外的空間'],
    [courtTxt, '球場（面）'],
    [`${state.items.filter((i) => i.type === 'light').length} 盞・${state.items.filter((i) => i.type === 'fan').length} 台`, '燈具・吊扇'],
  ];
  for (const [v, l] of stats) { const d = document.createElement('div'); d.className = 'stat'; const b = document.createElement('b'); b.textContent = v; const s = document.createElement('span'); s.textContent = l; d.append(b, s); st.appendChild(d); }
  const ul = $('warn-list'); ul.textContent = '';
  if (!warns.length) { const li = document.createElement('li'); li.className = 'okline'; li.textContent = '沒有發現擋路、超出範圍或高度的問題'; ul.appendChild(li); return; }
  for (const w of warns.slice(0, 30)) {
    const li = document.createElement('li'); li.className = w.level; li.textContent = w.text;
    if (w.id) { li.tabIndex = 0; li.title = '點一下選取這個物件'; const go = () => { select(w.id); const it = state.items.find((x) => x.id === w.id); if (it && mode === '3d') focusOn(it.x, it.z); }; li.addEventListener('click', go); li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); }
    else if (w.zid) { li.tabIndex = 0; li.title = '點一下在平面圖選取這個區域'; const go = () => { setMode('plan'); selectZone(w.zid); }; li.addEventListener('click', go); li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); }
    else li.classList.add('static');
    ul.appendChild(li);
  }
  if (warns.length > 30) { const li = document.createElement('li'); li.textContent = `還有 ${warns.length - 30} 項`; ul.appendChild(li); }
}
// ---------------------------------------------------------------- saved designs
let artifactNS = null;
let confirmDelete = null;
function savedMatch() { return state.id ? SAVED.find((s) => s.id === state.id) : null; }
function isDirty() { const m = savedMatch(); return !m || JSON.stringify(m.data) !== JSON.stringify(designData()); }
function fmtTime(iso) { try { return new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
function summary(data) {
  const b = data.building || {}; const items = data.items || [];
  const vb = items.filter((i) => CAT[i.type] && CAT[i.type].court === 'vb' && i.mode !== 'lines').length;
  const other = items.filter((i) => CAT[i.type] && CAT[i.type].court && CAT[i.type].court !== 'vb').length;
  return `${fmt1((b.L * b.W) / PING)} 坪・淨高 ${fmt1(b.H)} m・排球 ${vb} 面${other ? `・其他球場 ${other} 面` : ''}${(data.zones || []).length ? `・${data.zones.length} 個區域` : ''}`;
}
function renderSaved() {
  const m = savedMatch();
  $('save-status').textContent = m ? (isDirty() ? `目前：${m.name}（有還沒存的修改）` : `目前：${m.name}（已存）`) : '目前的配置還沒存成方案';
  $('btn-update').hidden = !m;
  $('btn-save').disabled = readOnly; $('btn-update').disabled = readOnly;
  $('save-note').textContent = !artifactNS
    ? '方案存在這台裝置的瀏覽器裡（換電腦或清除瀏覽資料就不見）；要給別人，用「複製方案代碼」。'
    : readOnly ? '這個連結只能看，不能存到共用方案。設計好之後按「複製方案代碼」，把代碼傳給可以編輯的人。'
    : '存成方案後，打開這一頁的合夥人都看得到；存檔後頁面會重新載入。';
  const ul = $('saved-list'); ul.textContent = '';
  if (!SAVED.length) { const li = document.createElement('li'); const p = document.createElement('span'); p.className = 'meta'; p.textContent = '還沒有存檔的方案。設計好後按「存成新方案」，合夥人打開這頁就看得到。'; li.appendChild(p); ul.appendChild(li); return; }
  for (const s of SAVED) {
    const li = document.createElement('li'); if (state.id === s.id) li.classList.add('current');
    const t = document.createElement('b'); t.textContent = s.name;
    const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = `${summary(s.data)}・${fmtTime(s.savedAt)}`;
    const row = document.createElement('div'); row.className = 'btn-row';
    const load = document.createElement('button'); load.type = 'button'; load.id = 'load-' + s.id; load.textContent = '打開';
    load.addEventListener('click', () => { pushHistory(); state = sanitize({ ...s.data, id: s.id }); selectedId = null; selZoneId = null; fullRefresh(); frameView('bird'); pv.fitted = false; renderPlan(); toast(`已打開「${s.name}」`); });
    row.appendChild(load);
    if ((artifactNS && !readOnly) || (!artifactNS && !EMBED_IDS.has(s.id))) {
      const del = document.createElement('button'); del.type = 'button'; del.id = 'del-' + s.id; del.className = 'danger';
      del.textContent = confirmDelete === s.id ? '確定刪除' : '刪除';
      del.addEventListener('click', () => {
        if (confirmDelete !== s.id) { confirmDelete = s.id; renderSaved(); return; }
        confirmDelete = null;
        const next = SAVED.filter((x) => x.id !== s.id);
        const keep = state.id === s.id ? { ...designData(), id: null } : { ...designData(), id: state.id };
        publishDesigns(next, keep, '已刪除方案');
      });
      row.appendChild(del);
      if (confirmDelete === s.id) { const c = document.createElement('button'); c.type = 'button'; c.id = 'del-cancel-' + s.id; c.textContent = '取消'; c.addEventListener('click', () => { confirmDelete = null; renderSaved(); }); row.appendChild(c); }
    }
    li.append(t, meta, row); ul.appendChild(li);
  }
}
function defaultReset() {
  for (const st of document.head.querySelectorAll('style')) { const t = st.textContent || ''; if (t.includes('safe-area-inset')) return t; }
  return ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}';
}
function buildPageHtml(designs) {
  const json = JSON.stringify(designs).replace(/</g, '\\u003c');
  const close = '</' + 'script>';
  return '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>' + defaultReset() + '</style></head><body>'
    + '<title>排球館 3D 配置</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + FONT_LINK + '\n'
    + '<style id="app-style">' + SRC.style + '</style>\n' + SRC.app + '\n'
    + '<script type="application/json" id="saved-designs">' + json + close + '\n'
    + '<script type="importmap" id="app-importmap">' + SRC.importmap + close + '\n'
    + '<script type="module" id="app-script">' + SRC.script + close + '\n</body></html>';
}
async function publishDesigns(next, keepState, okMsg) {
  if (!artifactNS) {
    try { localStorage.setItem(LOCAL_SAVED_KEY, JSON.stringify(next.filter((x) => !EMBED_IDS.has(x.id)))); }
    catch (e) { toast('存不進去：瀏覽器的儲存空間滿了或被關閉'); return; }
    SAVED = next; state.id = keepState.id || null; renderSaved(); toast(okMsg + '（存在這台裝置）'); return;
  }
  if (readOnly) return;
  try { sessionStorage.setItem(STASH_KEY, JSON.stringify(keepState)); } catch (e) { /* ignore */ }
  for (const b of [$('btn-save'), $('btn-update')]) b.disabled = true;
  toast('存檔中…', 8000);
  try {
    await artifactNS.publish(buildPageHtml(next));
    toast(okMsg + '，頁面會重新載入');
  } catch (e) {
    const code = e && e.code;
    if (code === 'conflict') toast('剛好有人存了新版本，頁面會重新載入；你的配置會保留。');
    else if (['not_writer', 'not_granted', 'capability_disabled', 'capability_removed', 'consent_required', 'not_declared'].includes(code)) {
      readOnly = true; try { sessionStorage.removeItem(STASH_KEY); } catch (er) { /* ignore */ }
      toast('這個連結只能看，不能存到共用方案。可以用「複製方案代碼」傳給可以編輯的人。', 6000);
    } else if (code === 'rate_limited') toast('存得太頻繁了，過一分鐘再試。');
    else if (code === 'too_large') toast('方案太多了，先刪掉幾個舊方案再存。');
    else toast('存檔沒有成功，請再試一次。');
    try { if (code !== 'conflict') sessionStorage.removeItem(STASH_KEY); } catch (er) { /* ignore */ }
    renderSaved();
  }
}
function saveNew() {
  if (GAME_ONLY) return;
  const id = 'd' + Date.now().toString(36);
  let name = state.name.trim() || '未命名方案';
  if (SAVED.some((s) => s.name === name)) name = name + '（' + (SAVED.filter((s) => s.name.startsWith(name)).length + 1) + '）';
  const data = { ...designData(), name };
  publishDesigns([...SAVED, { id, name, savedAt: new Date().toISOString(), data }], { ...data, id }, `已存成「${name}」`);
}
function saveUpdate() {
  if (GAME_ONLY) return;
  const m = savedMatch(); if (!m) return saveNew();
  const data = designData();
  const next = SAVED.map((s) => (s.id === m.id ? { id: s.id, name: data.name, savedAt: new Date().toISOString(), data } : s));
  publishDesigns(next, { ...data, id: m.id }, `已更新「${data.name}」`);
}

// share code
function b64encode(str) { const bytes = new TextEncoder().encode(str); let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin); }
function b64decode(b64) { const bin = atob(b64); const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0)); return new TextDecoder().decode(bytes); }
function shareCode() { return 'VBGYM1:' + b64encode(JSON.stringify(designData())); }
async function copyCode() {
  const code = shareCode();
  const out = $('code-out');
  try { await navigator.clipboard.writeText(code); out.hidden = true; toast('已複製方案代碼，貼到 LINE 傳給朋友就好'); }
  catch (e) { out.hidden = false; out.value = code; out.focus(); out.select(); toast('沒辦法直接複製，代碼已經選取好，按 Ctrl+C（手機長按）複製'); }
}
function loadCode() {
  const raw = $('paste-text').value.trim();
  const m = raw.match(/VBGYM1:([A-Za-z0-9+/=]+)/);
  if (!m) { toast('看不懂這段代碼，請確認是從「複製方案代碼」複製來的完整內容'); return; }
  try {
    const data = JSON.parse(b64decode(m[1]));
    pushHistory(); state = sanitize({ ...data, id: null }); selectedId = null; selZoneId = null; fullRefresh(); frameView('bird'); pv.fitted = false; renderPlan();
    $('paste-box').hidden = true; $('paste-text').value = '';
    toast(`已載入「${state.name}」`);
  } catch (e) { toast('代碼不完整，請重新複製一次'); }
}

// ---------------------------------------------------------------- history & persistence
function pushHistory() { history.push(JSON.stringify({ ...designData(), items: state.items, id: state.id })); if (history.length > 60) history.shift(); $('btn-undo').disabled = false; $('p-undo').disabled = false; }
function undo() {
  const prev = history.pop(); $('btn-undo').disabled = !history.length; $('p-undo').disabled = !history.length;
  if (!prev) return;
  state = sanitize(JSON.parse(prev)); if (!state.items.some((i) => i.id === selectedId)) selectedId = null;
  if (!state.zones.some((z) => z.id === selZoneId)) selZoneId = null;
  if (!(state.walls || []).some((w) => w.id === selWallId)) selWallId = null;
  fullRefresh(); renderZoneSel(); planToolState();
}
let draftTimer = 0;
// 自動存檔：候選場地存到該場地、現有球館存到該球館、自由規劃存成草稿；改完 0.4 秒存，離開頁面前再存一次
let draftDirty = false;
const VENUE_KEY = (id) => 'vb.venue.' + id;
// 每次存檔前把上一版留下來（同一個 2 分鐘內只留一版，最多 12 版），存錯了可以從「找回之前的版本」拿回來
const HIST_KEY = (k) => k + '.hist';
function keepHistory(key, force) {
  try {
    const prev = localStorage.getItem(key); if (!prev) return;
    const p = JSON.parse(prev), data = p.data || p, at = p.savedAt ? Date.parse(p.savedAt) : Date.now();
    let hist = []; try { hist = JSON.parse(localStorage.getItem(HIST_KEY(key)) || '[]'); } catch (e) { hist = []; }
    const last = hist[0];
    if (last && JSON.stringify(last.data) === JSON.stringify(data)) return;
    if (!force && last && Date.now() - last.kept < 120000) return;
    hist.unshift({ at, kept: Date.now(), data });
    for (let n = 12; n > 0; n--) { try { localStorage.setItem(HIST_KEY(key), JSON.stringify(hist.slice(0, n))); break; } catch (e) { /* 空間不夠就少留幾版 */ } }
    renderHist();
  } catch (e) { /* ignore */ }
}
function histKey() { return window.__venueId ? VENUE_KEY(window.__venueId) : window.__siteId ? null : DRAFT_KEY; }
function renderHist() {
  const row = $('hist-row'), sel = $('hist-sel'); if (!row || !sel) return;
  const k = histKey(); let hist = [];
  try { hist = k ? JSON.parse(localStorage.getItem(HIST_KEY(k)) || '[]') : []; } catch (e) { hist = []; }
  row.hidden = !hist.length;
  const t = (ms) => new Date(ms).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  sel.innerHTML = `<option value="">選一個時間點…</option>` + hist.map((h, i) => `<option value="${i}">${t(h.at)}・${(h.data.zones || []).length} 區・${(h.data.items || []).length} 件</option>`).join('');
}
function restoreHist(i) {
  const k = histKey(); if (!k) return;
  let hist = []; try { hist = JSON.parse(localStorage.getItem(HIST_KEY(k)) || '[]'); } catch (e) { return; }
  const h = hist[i]; if (!h) return;
  pushHistory();
  state = sanitize({ ...h.data, id: null }); selectedId = null; selZoneId = null; selWallId = null;
  fullRefresh(); renderPlan(); renderZoneSel(); planToolState();
  toast(`已換回 ${new Date(h.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 的版本；不對的話按「復原」`);
}
function saveNow() {
  if (GAME_ONLY) return;
  if (!state || !draftDirty) return;
  // 現有球館：資料還沒載完（畫面上暫時是預設範本）就先不存，免得把你改過的版本蓋掉
  if (window.__venueId && !window.__venueReady) return;
  draftDirty = false;
  let ok = true;
  try {
    if (window.__venueId) { const k = VENUE_KEY(window.__venueId); keepHistory(k); localStorage.setItem(k, JSON.stringify({ data: designData(), savedAt: new Date().toISOString() })); if (!window.__applyingShared) queueShared(cloudId()); const rb = $('venue-reset'); if (rb) rb.hidden = false; }
    else if (window.__siteId) { if (window.__generating || typeof saveHall !== 'function') return; saveHall(window.__siteId); if (share.mode === 'off') window.__hallMemo && window.__hallMemo(new Date().toISOString()); }
    else { keepHistory(DRAFT_KEY); localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...designData(), id: state.id, savedAt: new Date().toISOString() })); if (!window.__applyingShared) queueShared(cloudId()); }
  } catch (e) { ok = false; }
  const el = $('autosave');
  if (el) { el.textContent = ok ? `已自動存檔 ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}（存在這台裝置）` : '自動存檔失敗：瀏覽器不讓網站存資料（無痕模式？）'; el.dataset.kind = ok ? 'ok' : 'warn'; }
}
function saveDraftSoon() { draftDirty = true; clearTimeout(draftTimer); draftTimer = setTimeout(saveNow, 400); }
// 剛載入的配置不算改動：不要存、也不要傳到雲端
function markClean() { draftDirty = false; clearTimeout(draftTimer); }
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
function commit() { window.wakeRender && window.wakeRender(); window.updateCost && window.updateCost(); if (typeof applyStructure === 'function') applyStructure(); syncBuildingInputs(); renderChecks(); renderSaved(); renderZoneTable(); if (mode === 'plan') renderPlan(); saveDraftSoon(); if (typeof coQueue === 'function') coQueue(); syncPosFields(); }
// 物件面板上的座標欄位：拖曳、方向鍵移動後跟著更新（正在輸入的那格不動）
function syncPosFields() { const ix = $('is-x'), iz = $('is-z'); if (!ix || !selectedId) return; const it = state.items.find((i) => i.id === selectedId); if (!it) return; if (document.activeElement !== ix) ix.value = f2(it.x); if (document.activeElement !== iz) iz.value = f2(it.z); }
function fullRefresh() { buildBuilding(); buildZones(); renderItems(); renderSelection(); commit(); if (typeof applyOverhead === 'function' && typeof view !== 'undefined') applyOverhead(); }
// ---------------------------------------------------------------- camera
let view = 'bird';
function applyOverhead() {
  const hide = view === 'top';
  if (typeof applyStructure === 'function') applyStructure();
  for (const [id, g] of itemObjs) { const it = state && state.items.find((x) => x.id === id); if (it && CAT[it.type].ceiling && it.type !== 'camera') { g.visible = !hide; g.traverse((o) => { if (o.userData.isTag) o.visible = !hide && showLabels; }); } }
  window.wakeRender && window.wakeRender();
}
// 3D 編輯時自由移動：WASD 前後左右、Q／E 下降上升（Shift 加速）；「自由移動」模式下拖曳是原地轉頭、滾輪往前後走
const fly = { on: false, keys: new Set() };
function setFly(on) {
  fly.on = on; setPressed($('v-fly'), on);
  if (on) {
    // 走到原本看著的地方前面 4 m、人的視線高度（1.7 m），面向同一個方向
    const fwd = new THREE.Vector3().subVectors(controls.target, camera.position); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
    camera.position.set(controls.target.x - fwd.x * 4, 1.7, controls.target.z - fwd.z * 4);
    controls.minDistance = 0.05; controls.target.copy(camera.position).addScaledVector(fwd, 0.6);
    controls.enableZoom = false; controls.rotateSpeed = 0.35;
    for (const id of ['v-bird', 'v-top', 'v-player']) setPressed($(id), false);
    toast('自由移動：WASD 走、Q／E 下降上升、Shift 加速、拖曳轉頭、滾輪往前後走；點物件照常選取與拖曳');
  } else { controls.minDistance = 2; controls.enableZoom = true; controls.rotateSpeed = 1; }
  window.wakeRender && window.wakeRender(400);
}
function moveEditCam(dt) {
  if (!fly.keys.size || walk.on || mode !== '3d') return false;
  const k = fly.keys, fwd = new THREE.Vector3().subVectors(controls.target, camera.position); fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const dist = camera.position.distanceTo(controls.target), sp = (fly.on ? 3.2 : clamp(dist * 0.35, 4, 14)) * (k.has('shift') ? 2.8 : 1) * dt;
  const d = new THREE.Vector3();
  if (k.has('w')) d.add(fwd); if (k.has('s')) d.sub(fwd); if (k.has('d')) d.add(right); if (k.has('a')) d.sub(right);
  if (d.lengthSq()) d.normalize().multiplyScalar(sp);
  if (k.has('e')) d.y += sp * 0.8; if (k.has('q')) d.y -= sp * 0.8;
  if (camera.position.y + d.y < 0.3) d.y = 0.3 - camera.position.y;
  camera.position.add(d); controls.target.add(d);
  return true;
}
addEventListener('keydown', (e) => {
  if (mode !== '3d' || walk.on || e.ctrlKey || e.metaKey || e.altKey) return;
  const tgt = e.target; if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'q', 'e', 'shift'].includes(k)) { fly.keys.add(k); if (k !== 'shift') e.preventDefault(); window.wakeRender && window.wakeRender(300); }
});
addEventListener('keyup', (e) => { fly.keys.delete(e.key.toLowerCase()); });
addEventListener('blur', () => fly.keys.clear());
renderer.domElement.addEventListener('wheel', (e) => {
  if (walk.on && walk.hold && (VM.on || vbCourt())) { e.preventDefault(); VB.aimDepth = clamp((VB.aimDepth ?? 6) + (e.deltaY < 0 ? 0.25 : -0.25), 2.5, 9.6); return; }   // 發球深淺：滾輪往上＝打深
  if (!fly.on || walk.on || mode !== '3d') return;
  e.preventDefault();
  const fwd = new THREE.Vector3().subVectors(controls.target, camera.position).normalize().multiplyScalar(-Math.sign(e.deltaY) * 0.8);
  camera.position.add(fwd); controls.target.add(fwd); if (camera.position.y < 0.3) { const dy = 0.3 - camera.position.y; camera.position.y += dy; controls.target.y += dy; }
  window.wakeRender && window.wakeRender(300);
}, { passive: false });
function frameView(v) {
  view = v; if (fly.on) setFly(false);
  setTimeout(applyOverhead, 0);
  for (const [id, k] of [['v-bird', 'bird'], ['v-top', 'top'], ['v-player', 'player']]) setPressed($(id), k === v);
  const { L, W } = state.building; const m = Math.max(L, W);
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  if (v === 'top') { camera.position.set(0, m * 1.35, 0.01); controls.target.set(0, 0, 0); }
  else if (v === 'player') {
    const c = state.items.find((i) => CAT[i.type].court === 'vb') || state.items.find((i) => CAT[i.type].court);
    if (c) {
      const half = CAT[c.type].w / 2;
      const r = (c.rot * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
      const lx = -(half - 1.2);
      camera.position.set(c.x + lx * cs, 1.7, c.z - lx * sn);
      controls.target.set(c.x, 2.0, c.z);
    } else { camera.position.set(-L / 2 + 2, 1.7, 0); controls.target.set(0, 2, 0); }
  } else { camera.position.set(L * 0.62, m * 0.72, W * 0.95); controls.target.set(0, 0, 0); }
  controls.update();
}
function focusOn(x, z) { const d = camera.position.clone().sub(controls.target); controls.target.set(x, 0, z); camera.position.set(x + d.x, d.y, z + d.z); controls.update(); }
// ---------------------------------------------------------------- pointer interaction
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let drag = null;
function snap(v) { return snapOn ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100; }
function snapStep(it) { const def = CAT[it.type]; if (!def || def.court) return 0.5; const m = Math.max(it.w || def.w || 0, it.d || def.d || 0); return m <= 1.2 ? 0.05 : m <= 3 ? 0.1 : 0.5; }
function snapAt(v, it) { if (!snapOn) return Math.round(v * 100) / 100; const st = snapStep(it); return Math.round(Math.round(v / st) * st * 100) / 100; }
function setPointer(e) { const r = renderer.domElement.getBoundingClientRect(); pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); }
function floorHit() { const p = new THREE.Vector3(); return raycaster.ray.intersectPlane(floorPlane, p) ? p : null; }
function pickItem() {
  const hits = raycaster.intersectObjects(itemsGroup.children, true).filter((h) => h.object.userData.itemId && !h.object.userData.noPick && h.object.visible !== false);
  if (!hits.length) return null;
  // prefer things standing on courts over the court surface itself
  const nonCourt = hits.find((h) => { const it = state.items.find((x) => x.id === h.object.userData.itemId); return it && !CAT[it.type].court; });
  return (nonCourt || hits[0]).object.userData.itemId;
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || window.__insp || window.__walk || mode !== '3d') return;
  setPointer(e);
  const id = pickItem();
  if (!id) {
    // 點到區域的自動擺設：拆成元件並選起來
    const zh = raycaster.intersectObjects(zonesGroup.children, true).find((h) => h.object.userData.zoneFix);
    if (zh) { const f = zh.object.userData.zoneFix, ids = zoneToItems(f.zid); if (ids[f.i]) select(ids[f.i]); drag = null; return; }
  }
  if (id && (e.shiftKey || e.ctrlKey || e.metaKey)) { toggleSel(id); drag = null; return; }
  drag = { id, sx: e.clientX, sy: e.clientY, moved: false, pid: e.pointerId };
  const hitIt = id && state.items.find((x) => x.id === id);
  if (hitIt && hitIt.locked && !(isSel(id) && selItems().length > 1)) { drag.locked = true; return; }
  // 一般元件：按住就能直接拖；球場鋪滿地板，要先點一下選起來才拖得動（不然轉視角時很容易拖到）
  if (id && !isSel(id) && hitIt && CAT[hitIt.type].court) { drag.selectOnly = true; return; }
  if (id && !isSel(id) && !e.shiftKey) select(id);
  if (id) {
    const it = state.items.find((x) => x.id === id);
    const p = floorHit();
    if (it && p) {
      drag.off = [it.x - p.x, it.z - p.z]; drag.start = [it.x, it.z]; controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId);
      if (selItems().length > 1) drag.group = selItems().filter((i) => !i.locked).map((i) => ({ it: i, x: i.x, z: i.z }));
    }
    if (selItems().length < 2) select(id);
  }
}, true);
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
  if (!drag.id || !drag.off || !drag.moved) return;
  setPointer(e);
  const p = floorHit(); if (!p) return;
  const it = state.items.find((x) => x.id === drag.id); if (!it) return;
  if (drag.group) {
    const dx = snap(p.x + drag.off[0]) - drag.start[0], dz = snap(p.z + drag.off[1]) - drag.start[1];
    for (const g of drag.group) { g.it.x = f2(g.x + dx); g.it.z = f2(g.z + dz); moveObj(g.it); }
    updateOutline(); return;
  }
  it.x = snapAt(p.x + drag.off[0], it); it.z = snapAt(p.z + drag.off[1], it);
  moveObj(it); updateOutline();
});
function endDrag() {
  if (!drag) return;
  const d = drag; drag = null; controls.enabled = true;
  if (d.group && d.moved) {
    const now = d.group.map((g) => [g.it.x, g.it.z]);
    if (d.group.some((g, k) => now[k][0] !== g.x || now[k][1] !== g.z)) {
      d.group.forEach((g) => { g.it.x = g.x; g.it.z = g.z; }); pushHistory(); d.group.forEach((g, k) => { g.it.x = now[k][0]; g.it.z = now[k][1]; });
      commit(); renderSelection();
    }
    return;
  }
  if (d.id && d.moved && d.start) {
    const it = state.items.find((x) => x.id === d.id);
    if (it && (it.x !== d.start[0] || it.z !== d.start[1])) {
      const nowX = it.x, nowZ = it.z; it.x = d.start[0]; it.z = d.start[1];
      pushHistory(); it.x = nowX; it.z = nowZ;
      commit(); renderSelection();
    }
  } else if ((d.locked || d.selectOnly) && !d.moved) select(d.id);
  else if (!d.id && !d.moved) select(null);
}
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('dblclick', (e) => {
  if (typeof window.openEval !== 'function' || window.__insp) return;
  setPointer(e);
  if (window.__walk) {
    // 導覽中：雙擊物件看資訊報表（單擊才是互動）；鎖定滑鼠時看準星對著的東西
    clearTimeout(walk.clickT);
    if (locked()) centerRay.setFromCamera(new THREE.Vector2(0, 0), camera);
    const tg = pickTargets(locked() ? centerRay : raycaster, 10);
    unlockMouse();
    if (tg && tg.kind === 'item') { walk.keys.clear(); window.openEval(tg.it.type, labelOf(tg.it)); }
    return;
  }
  const id = pickItem();
  const it = id && state.items.find((x) => x.id === id);
  if (it) window.openEval(it.type, labelOf(it));
  else if (floorHit()) window.openEval('floor', '廠房地板');
});
renderer.domElement.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (e) => {
  const tgt = e.target; if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) return;
  if (walk.on) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClip(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && mode !== 'walk') { e.preventDefault(); selectAllItems(); return; }
  if (mode === 'plan' && selZoneId) return;
  if (!selectedId) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySel(); return; }
  const selIt = state.items.find((x) => x.id === selectedId);
  if (e.key === 'l' || e.key === 'L') { e.preventDefault(); toggleLockSel(); return; }
  if (selItems().length < 2 && selIt && selIt.locked && (e.key === 'r' || e.key === 'R' || e.key === 'Delete' || e.key === 'Backspace' || e.key.startsWith('Arrow'))) { e.preventDefault(); lockedMsg(); return; }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotateSel(e.shiftKey ? 15 : 90); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); }
  else if (e.key === 'Escape') select(null);
  else if (e.key.startsWith('Arrow')) {
    e.preventDefault(); const list = selItems().filter((i) => !i.locked); if (!list.length) return;
    pushHistory();
    for (const it of list) {
      const step = e.shiftKey ? (snapStep(it) < 0.5 ? 0.01 : 0.1) : snapStep(it) < 0.5 ? 0.05 : 0.5;
      if (e.key === 'ArrowLeft') it.x -= step; if (e.key === 'ArrowRight') it.x += step; if (e.key === 'ArrowUp') it.z -= step; if (e.key === 'ArrowDown') it.z += step;
      it.x = Math.round(it.x * 100) / 100; it.z = Math.round(it.z * 100) / 100; moveObj(it);
    }
    updateOutline(); commit(); renderSelection(); renderZoneSel(); if (mode === 'plan') renderPlan();
  }
});
// ---------------------------------------------------------------- generate a hall from a candidate site
function cameraFor(c, n) {
  // wall-mounted: on the hall wall nearest to this court, aimed at the court centre (snapCamera finishes the job)
  const { L, W } = state.building;
  const cands = [[c.x, -W / 2], [c.x, W / 2], [-L / 2, c.z], [L / 2, c.z]];
  let best = cands[0], bd = Infinity;
  for (const [x, z] of cands) { const d = Math.hypot(x - c.x, z - c.z); if (d < bd) { bd = d; best = [x, z]; } }
  const cam = { id: uid(), type: 'camera', x: best[0], z: best[1], rot: 0, label: `攝影機 ${n}`, locked: true };
  snapCamera(cam); return cam;
}
function snapCamera(it) {
  if (state.building.poly && typeof snapToPoly === 'function') {
    const e = snapToPoly(it, 0.4), inx = -e.nx, inz = -e.nz;
    let tx = null, tz = null, td = Infinity;
    for (const c of state.items) if (CAT[c.type] && CAT[c.type].court === 'vb') { const dd = Math.hypot(c.x - it.x, c.z - it.z); if (dd < td) { td = dd; tx = c.x; tz = c.z; } }
    let dx = tx == null ? inx : tx - it.x, dz = tx == null ? inz : tz - it.z;
    if (dx * inx + dz * inz <= 0.2) { dx = inx; dz = inz; }
    it.rot = Math.round((Math.atan2(-dz, dx) * 180) / Math.PI); it.wallYaw = Math.atan2(-inz, inx);
    return;
  }
  const { L, W } = state.building, m = 0.4;
  const d = [it.x + L / 2, L / 2 - it.x, it.z + W / 2, W / 2 - it.z], k = d.indexOf(Math.min(...d));
  if (k === 0) it.x = -L / 2 + m; else if (k === 1) it.x = L / 2 - m; else if (k === 2) it.z = -W / 2 + m; else it.z = W / 2 - m;
  it.x = Math.max(-L / 2 + m, Math.min(L / 2 - m, it.x)); it.z = Math.max(-W / 2 + m, Math.min(W / 2 - m, it.z));
  // aim at the nearest volleyball court; with no court, look straight into the hall
  let tx = null, tz = null, td = Infinity;
  for (const c of state.items) if (CAT[c.type] && CAT[c.type].court === 'vb') { const dd = Math.hypot(c.x - it.x, c.z - it.z); if (dd < td) { td = dd; tx = c.x; tz = c.z; } }
  const nx = [1, -1, 0, 0][k], nz = [0, 0, 1, -1][k];
  let dx = tx == null ? nx : tx - it.x, dz = tx == null ? nz : tz - it.z;
  if (dx * nx + dz * nz <= 0.2) { dx = nx; dz = nz; }    // never aim into the wall
  it.rot = Math.round((Math.atan2(-dz, dx) * 180) / Math.PI);
  it.wallYaw = Math.atan2(-nz, nx);                       // the bracket stays flat against the wall
}
function layoutCourts(ping) {
  // same rule as the map: a grid of rows × cols courts (rotated 90°) + a 5 m strip for toilets / lounge / counter
  const PINGM = 3.3058, A = ping * PINGM, MAXN = 16, MAXD = 160;
  for (const [type, cw, cd, label] of [['vb', 25, 18, '標準規格 25×18 m'], ['vbs', 24, 15, '精簡規格 24×15 m']]) {
    const cap = Math.min(MAXN, Math.floor((A - 40 * PINGM) / (cw * cd)));
    if (cap < 1) continue;
    let best = null;
    for (let r = 1; r <= 8; r++) {
      const W = r * cw + 5, L = A / W;
      if (W > MAXD) break; if (L > MAXD) continue;
      const cols = Math.floor(L / cd), n = Math.min(cap, r * cols);
      if (n < 1) continue;
      const sc = n * 10 - Math.abs(Math.log(L / W / 1.5));
      if (!best || sc > best.sc) best = { type, label, cw, cd, n, rows: r, cols, L, W, sc, rot: 90 };
    }
    if (best) return best;
  }
  return null;
}
// fire / safety / building services laid out along the walls (positions are indicative; snapWallItem puts them on the wall)
function safetyKit() {
  const { L, W, H } = state.building, out = [];
  const add = (type, x, z, extra = {}) => out.push({ id: uid(), type, x, z, rot: 0, ...extra });
  const along = (len, step) => { const n = Math.max(1, Math.round(len / step)); return Array.from({ length: n }, (_, i) => -len / 2 + len * (i + 0.5) / n); };
  // entrance side = +z wall (the service strip): AED, first aid, panel, exit signs
  add('aed', L / 2 - 3, W / 2); add('firstaid', L / 2 - 4, W / 2); add('panel', -L / 2 + 2, W / 2);
  add('exitsign', L / 2 - 1.5, W / 2); add('exitsign', -L / 2 + 1.5, W / 2); add('exitsign', L / 2 - 1.5, -W / 2); add('exitsign', -L / 2 + 1.5, -W / 2);
  for (const z of [-W / 2, W / 2]) for (const x of along(L, 20)) add('extinguisher', x, z);
  for (const x of [-L / 2, L / 2]) for (const z of along(W, 20)) add('extinguisher', x, z);
  for (const [x, z] of [[0, W / 2], [0, -W / 2], [-L / 2, 0], [L / 2, 0]]) add('emlight', x, z);
  for (const x of [-L / 2, L / 2]) for (const z of along(W, 12)) add('aircon', x, z);
  for (const x of along(L, 15)) for (const z of along(W, 15)) add('smoke', x, z);
  for (const x of along(L - 2, 20)) add('crashpad', x, -W / 2, { w: Math.min(20, (L - 2) / Math.max(1, Math.round((L - 2) / 20))) - 0.2 });
  for (const [x, z] of [[-L / 2, -W / 2 + 1], [L / 2, -W / 2 + 1], [-L / 2, W / 2 - 1], [L / 2, W / 2 - 1]]) add('cctv', x, z);
  return out;
}
function planHall(site) {
  const PINGM = 3.3058, H = site.height || 8;
  const eff = site.ping == null ? 300 : site.ping;
  let L, W, best = null;
  if (site.L && site.W) {
    L = Math.max(site.L, site.W); W = Math.min(site.L, site.W);
    for (const [type, cw, cd, label] of [['vb', 25, 18, '標準規格 25×18 m'], ['vbs', 24, 15, '精簡規格 24×15 m']]) {
      const c90 = Math.floor(L / cd), r90 = Math.floor((W - 4) / cw), c0 = Math.floor((L - 4) / cw), r0 = Math.floor(W / cd);
      const a = c90 * r90, b2 = c0 * r0, n = Math.min(16, Math.max(a, b2));
      if (n > 0) { best = a >= b2 ? { type, rot: 90, n, label, cw, cd, cols: c90, rows: r90 } : { type, rot: 0, n, label, cw, cd, cols: c0, rows: r0 }; break; }
    }
  } else {
    best = layoutCourts(eff);
    if (best) { W = best.W; L = best.L; } else { const A = eff * PINGM; W = Math.max(10, Math.sqrt(A / 1.4)); L = A / W; }
  }
  L = Math.min(160, Math.max(12, Math.round(L * 2) / 2)); W = Math.min(160, Math.max(10, Math.round(W * 2) / 2));
  const items = [];
  if (best) {
    const fx = best.rot === 90 ? best.cd : best.cw, fz = best.rot === 90 ? best.cw : best.cd;
    const perRow = Math.max(1, Math.min(best.cols || 99, Math.floor(L / fx)));
    for (let i = 0; i < best.n; i++) {
      const col = i % perRow, row = Math.floor(i / perRow), nInRow = Math.min(perRow, best.n - row * perRow);
      const x = -(nInRow * fx) / 2 + fx / 2 + col * fx, z = -W / 2 + fz / 2 + row * fz;
      items.push({ id: uid(), type: best.type, x: Math.round(x * 2) / 2, z: Math.round(z * 2) / 2, rot: best.rot, locked: true, label: `${i + 1} 號場` });
    }
  }
  return { L, W, H, best, items, eff };
}
// every candidate site keeps its own layout on this device (localStorage 'vb.hall.<id>')
const HALL_KEY = (id) => 'vb.hall.' + id;
function loadHall(id) { if (GAME_ONLY) return null; try { const v = JSON.parse(localStorage.getItem(HALL_KEY(id)) || 'null'); return v && v.data && Array.isArray(v.data.items) ? v : null; } catch (e) { return null; } }
function saveHall(id) { if (GAME_ONLY) return; try { localStorage.setItem(HALL_KEY(id), JSON.stringify({ data: designData(), savedAt: new Date().toISOString(), name: state.name, courts: state.items.filter((i) => CAT[i.type].court === 'vb').length, total: (typeof costReport === 'function' ? costReport().total : null) })); } catch (e) { /* storage full or blocked */ }
  if (!window.__applyingShared && typeof queueShared === 'function') queueShared(id); }
async function generateFromSite(id, opts = {}) {
  const gen = $('gen'), steps = $('gen-steps'), bar = $('gen-bar');
  let site = null;
  try { const d = await fetch('assets/data/sites.json', { cache: 'no-store' }).then((r) => r.json()); site = d.sites.find((s) => s.id === id); } catch (e) { /* ignore */ }
  if (!site) { toast('找不到這個場地，先用預設範本'); return; }
  try { sessionStorage.setItem('vb.lastSite', id); } catch (e) { /* ignore */ }
  const plan = planHall(site);
  if (GAME_ONLY) {
    window.__site = site;
    $('gym-title').textContent = "Play One";
    const rec = await pullShared('bs-shenjing');
    if (rec && rec.data) {
      state = sanitize({ ...rec.data, id: null });
    } else {
      // Same generator and dimensions as before; only editor presentation is skipped.
      state = sanitize({ name: "Play One", building: { L: plan.L, W: plan.W, H: plan.H }, floor: 'pu', net: 'men', items: plan.items.length ? plan.items : [{ id: uid(), type: 'vbs', x: 0, z: 0, rot: 0, locked: true, label: '1 號場' }] });
      let n = 1;
      for (const court of state.items.filter(i => CAT[i.type].court === 'vb')) state.items.push(cameraFor(court, n++));
      state.zones = autoZones();
      for (const kit of safetyKit()) state.items.push(sanitize({ items: [kit] }).items[0]);
    }
    selectedId = null; selZoneId = null; window.__generating = false;
    fullRefresh(); frameView('bird');
    return;
  }
  const fmtW = (n) => Math.round(n).toLocaleString('zh-TW');
  $('gym-title').textContent = site.name;
  window.__site = site;
  const info = $('siteinfo'); info.hidden = false; $('site-none').hidden = true;
  info.innerHTML = '';
  const b = document.createElement('b'); b.textContent = '候選場地資料';
  const e2 = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  const sp = document.createElement('dl');
  const perPing = site.rent != null && site.ping ? Math.round(site.rent / site.ping) : null;
  sp.innerHTML = [
    ['地址（路段）', `${e2(site.town || '')}・${e2(site.road || '—')}`, 'wide'],
    ['坪數', site.ping != null ? `${fmtW(site.ping)} <small>坪${site.split ? `・可分租約 ${fmtW(site.split)} 坪` : ''}</small>` : '待查'],
    ['月租', site.rent != null ? `${fmtW(site.rent / 10000)} <small>萬${perPing ? `・每坪 ${fmtW(perPing)} 元` : ''}</small>` : '待查', 'r'],
    ['挑高', site.height != null ? `${site.height} <small>m</small>` : '待量 <small>先用 8 m</small>'],
    ['分區', e2(site.zone || '—'), 'r'],
    ['現在用途', e2(site.usage || '—'), 'wide'],
  ].map(([k, v, c]) => `<div${c ? ` class="${c}"` : ''}><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const sp2 = document.createElement('span');
  sp2.textContent = site.L && site.W ? '長寬為實測。' : `長寬還沒量，先用 ${fmtW(plan.eff)} 坪推估成 ${plan.L}×${plan.W} m；量到之後在下面「廠房」改數字。`;
  const row = document.createElement('div'); row.className = 'row';
  const back = document.createElement('a'); back.href = 'index.html?site=' + encodeURIComponent(id) + '#lobby'; back.textContent = '← 回地圖看這個場地';
  const mem = opts.fresh ? null : loadHall(id);
  const regen = document.createElement('button'); regen.type = 'button'; regen.textContent = '重新生成';
  // regenerating throws away this site's edits, so it takes a second click to confirm
  regen.addEventListener('click', () => {
    if (loadHall(id) && regen.dataset.armed !== '1') { regen.dataset.armed = '1'; regen.textContent = '再按一次：清掉這個場館的配置重來'; setTimeout(() => { regen.dataset.armed = ''; regen.textContent = '重新生成'; }, 4000); return; }
    generateFromSite(id, { fresh: true });
  });
  const memo = document.createElement('span'); memo.className = 'memo';
  if (site.links && site.links.length) { const a0 = document.createElement('a'); a0.href = site.links[0][1]; a0.target = '_blank'; a0.rel = 'noopener'; a0.textContent = '物件連結 ↗'; a0.style.fontSize = '12px'; row.append(a0); }
  const olb = document.createElement('button'); olb.type = 'button'; olb.textContent = state.building.poly ? '🛰 調整建物外框' : '🛰 描真實建物外框'; olb.addEventListener('click', () => window.openOutline && window.openOutline());
  row.prepend(back); row.append(olb, regen); info.append(b, sp, sp2, memo, row); renderPlan();
  const showMemo = (t) => { memo.textContent = t ? `💾 這個場館有自己的記憶：改過的配置會自動存起來，下次進來接著用（上次存：${new Date(t).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}）` : '💾 這個場館有自己的記憶：改過的配置會自動存起來，下次進來接著用'; };
  window.__hallMemo = showMemo;
  if (!opts.fresh) {
    showMemo(null); shareStatus('☁️ 讀取共用配置中…', 'busy');
    const rec = await pullShared(id);
    if (rec && rec.data && (!mem || !mem.savedAt || rec.savedAt >= mem.savedAt)) {
      window.__generating = false; applyShared(id, rec); toast(`已載入「${site.name}」大家共用的配置`); renderCostCard(); return;
    }
    if (share.mode === 'off') shareStatus('💾 這個場館的配置存在這台裝置（共用功能還沒開啟）', '');
    if (mem && share.mode === 'on') { share.known = mem.savedAt; }
  }
  if (mem) {
    // restore this site's own layout instead of regenerating
    window.__generating = false;
    if (!window.__hallLoaded) { pushHistory(); state = sanitize({ ...mem.data, id: null }); selectedId = null; fullRefresh(); frameView('bird'); }
    pv.fitted = false; renderPlan();
    if (share.mode === 'on') { queueShared(id); toast(`已載入「${site.name}」上次的配置，並分享給大家`); }
    else { showMemo(mem.savedAt); toast(`已載入「${site.name}」上次的配置`); }
    return;
  }
  showMemo(null);
  window.__generating = true;
  const S = [
    `讀取場地：${site.name}`,
    `量出廠房 ${plan.L}×${plan.W} m、淨高 ${plan.H} m（約 ${fmtW(plan.L * plan.W / 3.3058)} 坪）`,
    plan.best ? `依 ${fmtW(plan.eff)} 坪放入 ${plan.best.n} 面排球場（${plan.best.label}，${plan.best.rows || 1} 排）` : '放不下標準排球場，先放 1 面精簡規格，記得確認尺寸',
    '在球場以外的空地排好休息區、接待、更衣淋浴、廁所、器材室；每面球場邊架攝影機，配冷氣、消防與安全設備（示意）',
    '完成！在平面圖調整區域，再到 3D 加設備，最後按「進入導覽」走一圈',
  ];
  steps.innerHTML = S.map((t) => `<li>${t.replace(/[<>&]/g, '')}</li>`).join('');
  $('gen-title').textContent = '正在生成球館'; $('gen-sub').textContent = '依照候選場地的坪數和挑高，自動配置球場';
  gen.classList.remove('hide');
  const li = steps.children;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
  const stepOn = async (k, ms = 650) => { for (let i = 0; i < li.length; i++) li[i].className = i < k ? 'ok' : i === k ? 'run' : ''; bar.style.width = `${(k / (S.length - 1)) * 100}%`; await wait(ms); };
  await stepOn(0, 700);
  pushHistory();
  state = sanitize({ name: site.name + '（自動生成）', building: { L: plan.L, W: plan.W, H: plan.H }, floor: 'pu', net: 'men', items: [] });
  selectedId = null; selZoneId = null; fullRefresh(); frameView('bird'); pv.fitted = false; renderPlan();
  await stepOn(1, 900);
  const courts = plan.items.length ? plan.items : [{ id: uid(), type: 'vbs', x: 0, z: 0, rot: 0, locked: true, label: '1 號場' }];
  const stepMs = Math.max(120, 450 - courts.length * 25);
  for (const c of courts) { const it = sanitize({ items: [c] }).items[0]; it.id = c.id; state.items.push(it); rerenderOne(it); commit(); await wait(stepMs); }
  await stepOn(2, 300);
  await stepOn(3, 200);
  let n = 1;
  for (const c of state.items.filter((i) => CAT[i.type].court === 'vb')) { const cam = cameraFor(c, n++); state.items.push(cam); rerenderOne(cam); commit(); await wait(stepMs * 0.8); }
  state.zones = autoZones(); buildBuilding(); buildZones();
  for (const kit of safetyKit()) { const it = sanitize({ items: [kit] }).items[0]; state.items.push(it); rerenderOne(it); }
  commit(); renderPlan();
  await stepOn(4, 900);
  for (let i = 0; i < li.length; i++) li[i].className = 'ok'; bar.style.width = '100%';
  $('gen-title').textContent = '球館生成好了';
  window.__generating = false; saveHall(id); showMemo(new Date().toISOString());
  await wait(1300);
  gen.classList.add('hide');
  toast('球館生成好了：先在平面圖調整區域，再按「加入 3D 元件」', 6000);
}
// Legacy editor hooks; game builds contain no product or price catalogue.
const CATALOG = {}, TYPE_CATS = {};
const getPicks = () => ({ sel: {}, custom: {} });
function setPicks() {}
function costReport() { return { lines: [], total: 0, missing: [] }; }
function renderCostCard() {}
function renderPicker() {}
function initPicker() {}
window.updateCost = renderCostCard;
// ---------------------------------------------------------------- shared venue memory (Vercel API + Upstash Redis)
// Local copy is always written first (works offline / before sharing is enabled); the shared copy is what everyone sees.
const share = { mode: 'unknown', known: null, timer: null, busy: false, pending: false };
// 雲端上的編號：候選場地用場地 id，現有球館用 venue-<id>，自由規劃大家共用一份 free-plan
function cloudId() { return window.__siteId || (window.__venueId ? 'venue-' + window.__venueId : 'free-plan'); }
const editKey = () => { try { return localStorage.getItem('vb.editKey') || ''; } catch (e) { return ''; } };
const hm = (t) => new Date(t).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function shareStatus(msg, kind) {
  const el = document.querySelector('.siteinfo .memo') || $('cloud-status'); if (!el) return;
  el.textContent = msg; el.dataset.kind = kind || '';
  const old = el.parentNode.querySelector('.keybtn'); if (old) old.remove();
  if (kind === 'key') {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'keybtn'; b.textContent = '輸入編輯密碼';
    b.addEventListener('click', () => { const k = window.prompt('這個網站的共用配置有設編輯密碼，請輸入：'); if (k) { try { localStorage.setItem('vb.editKey', k); } catch (e) {} pushShared(cloudId()); } });
    el.after(b);
  }
}
async function pullShared(id) {
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch('api/hall?site=' + encodeURIComponent(id), { cache: 'no-store', signal: ctl.signal }); clearTimeout(to);
    if (r.status === 501 || r.status === 404 && !(r.headers.get('content-type') || '').includes('json')) { share.mode = 'off'; return null; }
    share.mode = 'on';
    if (r.status === 404) return null;
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { share.mode = share.mode === 'on' ? 'on' : 'off'; return null; }
}
function applyShared(id, rec, quiet) {
  pushHistory();
  state = sanitize({ ...rec.data, id: null }); selectedId = null; selZoneId = null;
  if (rec.picks) setPicks(rec.picks);
  // 本機留一份雲端版；本機原本那份先放進「找回之前的版本」
  try {
    if (window.__siteId) localStorage.setItem(HALL_KEY(id), JSON.stringify({ data: rec.data, savedAt: rec.savedAt, name: rec.name, courts: rec.courts, total: rec.total }));
    else if (window.__venueId) { const k = VENUE_KEY(window.__venueId); keepHistory(k, true); localStorage.setItem(k, JSON.stringify({ data: rec.data, savedAt: rec.savedAt })); }
    else { keepHistory(DRAFT_KEY, true); localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...rec.data, savedAt: rec.savedAt })); }
  } catch (e) {}
  share.known = rec.savedAt;
  // loading someone's copy is not an edit: skip the autosave that the refresh triggers
  share.quietUntil = Date.now() + 1500;
  window.__applyingShared = true; fullRefresh(); window.__applyingShared = false;
  if (!quiet) frameView('bird');
  pv.fitted = false; renderPlan();
  shareStatus(`☁️ 共用中：大家看到的是同一份（最新：${hm(rec.savedAt)}）`, 'ok');
}
function queueShared() {}
async function pushShared() {}
// someone else may have edited while this tab was in the background
document.addEventListener('visibilitychange', async () => {
  if (GAME_ONLY) return; // Do not rebuild the court during a game.
  // 正在跟別人即時共同編輯時，畫面本來就是最新的，不用再去拉網路上的版本（拉到稍舊的會把剛收到的改動蓋掉）
  if (typeof CO !== 'undefined' && CO.on && CO.peers.size) return;
  const id = cloudId(); if (document.hidden || share.mode !== 'on' || share.pending || window.__generating || (window.__venueId && !window.__venueReady)) return;
  const rec = await pullShared(id);
  if (rec && rec.savedAt && (!share.known || rec.savedAt > share.known)) { applyShared(id, rec, true); toast('有人（或你在別台裝置）更新了這份配置，已載入最新版；要退回按「復原」'); }
});
// ---------------------------------------------------------------- wall-mounted / safety items (aircon, fire equipment, pads…)
function snapWallItem(it) {
  if (state.building.poly && typeof snapToPoly === 'function') { const e = snapToPoly(it, (CAT[it.type].d || 0.2) / 2 + 0.06); it.rot = Math.round((Math.atan2(-e.nx, -e.nz) * 180) / Math.PI); return; }
  const { L, W } = state.building, def = CAT[it.type];
  const d = [it.x + L / 2, L / 2 - it.x, it.z + W / 2, W / 2 - it.z], k = d.indexOf(Math.min(...d));
  const depth = (def.d || 0.2) / 2 + 0.06;
  if (k === 0) it.x = -L / 2 + depth; else if (k === 1) it.x = L / 2 - depth; else if (k === 2) it.z = -W / 2 + depth; else it.z = W / 2 - depth;
  const half = (it.w || def.w || 0.5) / 2 + 0.1;
  if (k < 2) it.z = Math.max(-W / 2 + half, Math.min(W / 2 - half, it.z)); else it.x = Math.max(-L / 2 + half, Math.min(L / 2 - half, it.x));
  // local +z faces into the hall
  it.rot = [90, -90, 0, 180][k];
}
function buildWallItem(g, it, w, d, def) {
  const y = def.mountY ?? 0;
  const t = it.type;
  if (t === 'aircon' && kit('aircon', g, 0, y, 0, { rotY: Math.PI, sx: w / 1.2 })) {
    /* 素材庫的壁掛冷氣 */
  } else if (t === 'aircon') {
    box(g, w, 0.42, d, '#F2F4F6', 0, y, 0);
    box(g, w - 0.1, 0.05, 0.02, '#9AA5B1', 0, y + 0.06, d / 2 + 0.005);
    box(g, w - 0.2, 0.02, 0.06, '#C9D1D9', 0, y + 0.02, d / 2 - 0.02);
    const led = cyl(g, 0.015, 0.015, 0.01, '#4FC3F7', w / 2 - 0.12, y + 0.3, d / 2 + 0.005, { emissive: '#4FC3F7', emissiveIntensity: 1.5 }, 8); led.rotation.x = Math.PI / 2;
  } else if (t === 'extinguisher' && kit('extinguisher', g, 0, 0, 0, { rotY: Math.PI })) {
    box(g, 0.3, 0.5, 0.02, '#D7262B', 0, 0.9, -d / 2 + 0.01);
  } else if (t === 'extinguisher') {
    cyl(g, 0.08, 0.08, 0.5, '#D7262B', 0, 0.02, 0, null, 16);
    cyl(g, 0.03, 0.03, 0.08, '#2B2B2B', 0, 0.52, 0, null, 10);
    box(g, 0.32, 0.03, 0.3, '#B8BEC6', 0, 0, 0);
    box(g, 0.3, 0.5, 0.02, '#D7262B', 0, 0.9, -d / 2 + 0.01);
  } else if (t === 'emlight') {
    box(g, 0.36, 0.14, 0.1, '#F4F4F2', 0, y, 0);
    for (const s of [-1, 1]) { const l = cyl(g, 0.045, 0.045, 0.06, '#FFF4C8', s * 0.11, y - 0.03, 0.06, { emissive: '#FFF4C8', emissiveIntensity: 1.2 }, 12); l.rotation.x = Math.PI / 2; }
  } else if (t === 'exitsign') {
    box(g, 0.42, 0.18, 0.05, '#1E9E4A', 0, y, 0, { emissive: '#1E9E4A', emissiveIntensity: 0.9 });
    box(g, 0.12, 0.1, 0.01, '#FFFFFF', -0.1, y + 0.04, 0.027, { emissive: '#FFFFFF', emissiveIntensity: 0.6 });
  } else if (t === 'smoke') {
    const y2 = state.building.H - 0.08;
    cyl(g, 0.07, 0.07, 0.05, '#F4F4F2', 0, y2, 0, null, 16);
  } else if (t === 'wallfan') {
    if (!kit('wall_fan', g, 0, y, 0, { rotY: Math.PI })) { cyl(g, 0.26, 0.26, 0.12, '#1F2124', 0, y - 0.06, 0.12, { transparent: true, opacity: 0.6 }).rotation.x = Math.PI / 2; }
  } else if (t === 'exhaust') {
    if (!kit('exhaust_fan', g, 0, y, 0, { rotY: Math.PI })) box(g, 0.64, 0.64, 0.12, '#B9BCC0', 0, y - 0.32, 0);
  } else if (t === 'tv') {
    if (!kit('wall_tv', g, 0, y, 0, { rotY: Math.PI, sx: w / 1.24 })) box(g, w, 0.72, 0.04, '#15181D', 0, y - 0.36, 0);
  } else if (t === 'clock') {
    if (!kit('wall_clock', g, 0, y, 0, { rotY: Math.PI })) cyl(g, 0.17, 0.17, 0.04, '#F4F4F2', 0, y, 0).rotation.x = Math.PI / 2;
  } else if (t === 'banner') {
    // 牆面布幕：white 白布、dark 深灰布、poster 一排海報（不放任何品牌圖案）
    const hb = def.h, tone = it.tone || 'white';
    const TONES = { dark: '#3B414B', red: '#B8322B', blue: '#2F5FA8' };
    const fab = mat(TONES[tone] || '#ECEBE7', { roughness: 0.95, side: THREE.DoubleSide });
    const n = Math.max(1, Math.round(w / 1.6));
    for (let k = 0; k < n; k++) if (!kit('banner_panel', g, -w / 2 + (w / n) * (k + 0.5), y, 0.03, { sx: (w / n - 0.04) / 1.58, sy: hb / 3.6, tint: TONES[tone] ? { fabric_w: TONES[tone] } : null })) { const p = box(g, w / n - 0.04, hb, 0.02, fab, -w / 2 + (w / n) * (k + 0.5), y, 0.02); p.userData.softInk = true; }
    if (tone === 'poster') { const cols = ['#2F5FA8', '#C0392B', '#3C8A63', '#E8B019', '#22304A']; for (let k = 0; k < Math.max(1, Math.floor(w / 1.4)); k++) box(g, 1.0, 1.6, 0.01, cols[k % cols.length], -w / 2 + 0.7 + k * 1.4, y + hb - 2.2, 0.04, { roughness: 0.6 }).userData.softInk = true; }
    box(g, w, 0.04, 0.04, darkSteel, 0, y + hb, 0.02);
  } else if (t === 'crashpad') {
    const n = Math.max(1, Math.round(w / 1.2)), pw = w / n;
    for (let i = 0; i < n; i++) if (!kit('crash_pad', g, -w / 2 + pw * (i + 0.5), 0, 0, { rotY: Math.PI, sx: pw / 1.2, tint: { navy_pad: scheme().pad } })) box(g, pw - 0.025, 1.95, d, leatherMat(scheme().pad), -w / 2 + pw * (i + 0.5), 0.08, 0);
  } else if (t === 'firstaid') {
    box(g, 0.4, 0.3, 0.14, '#F4F4F2', 0, y, 0);
    box(g, 0.14, 0.04, 0.01, '#D7262B', 0, y + 0.13, 0.075); box(g, 0.04, 0.14, 0.01, '#D7262B', 0, y + 0.08, 0.075);
  } else if (t === 'cctv') {
    box(g, 0.06, 0.08, 0.2, '#C9D1D9', 0, y, -0.02);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#1F2933'));
    dome.rotation.x = Math.PI; dome.position.set(0, y - 0.01, 0.1); g.add(dome);
  } else if (t === 'heater') {
    cyl(g, 0.22, 0.22, 0.9, '#E8ECEF', 0, y, 0, null, 18);
  } else if (t === 'panel') {
    box(g, w, 1.2, d, '#8A96A6', 0, y, 0);
    box(g, 0.02, 0.15, 0.03, '#3A4654', w / 2 - 0.1, y + 0.55, d / 2 + 0.01);
  }
  if (def.tag) tag(g, labelOf(it), (t === 'smoke' ? state.building.H - 0.2 : Math.max(y + 0.6, (def.h || 0.5) + 0.3)));
}
// ---------------------------------------------------------------- real building outline (traced on the NLSC satellite map or taken from OpenStreetMap)
// state.building.poly = [[x, z], …] in metres around the bbox centre (x = east, z = south); geo = [[lat, lng], …] to re-edit.
function polyArea(P) { let a = 0; for (let i = 0; i < P.length; i++) { const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % P.length]; a += x1 * z2 - x2 * z1; } return a / 2; }
function pip(x, z, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; }
function edgesOf(P) {
  const ccw = polyArea(P) > 0;   // with x east / z south, positive area means clockwise on the map
  return P.map((a, i) => {
    const b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
    let nx = dz / len, nz = -dx / len;            // one of the two normals
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (pip(mx + nx * 0.3, mz + nz * 0.3, P)) { nx = -nx; nz = -nz; }   // make it point outward
    return { a, b, dx: dx / len, dz: dz / len, len, nx, nz, mx, mz, ccw };
  });
}
function nearestEdge(x, z, P) {
  let best = null;
  for (const e of edgesOf(P)) {
    const t = Math.max(0, Math.min(e.len, (x - e.a[0]) * e.dx + (z - e.a[1]) * e.dz));
    const px = e.a[0] + e.dx * t, pz = e.a[1] + e.dz * t, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { e, t, px, pz, d };
  }
  return best;
}
// scan-line clip: segments of the line (const coordinate) that lie inside the polygon
function clipLine(P, axis, c) {
  const xs = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const [a0, a1] = axis === 'z' ? [a[1], a[0]] : [a[0], a[1]], [b0, b1] = axis === 'z' ? [b[1], b[0]] : [b[0], b[1]];
    if ((a0 > c) !== (b0 > c)) xs.push(a1 + ((c - a0) / (b0 - a0)) * (b1 - a1));
  }
  xs.sort((p, q) => p - q); const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}
// wall-mounted things slide along the real walls
function snapToPoly(it, depth) {
  const P = state.building.poly, ne = nearestEdge(it.x, it.z, P), e = ne.e;
  const t = Math.max(0.3, Math.min(e.len - 0.3, ne.t));
  it.x = e.a[0] + e.dx * t - e.nx * depth; it.z = e.a[1] + e.dz * t - e.nz * depth;
  return e;   // e.nx/e.nz point out of the building
}
function planPoly(P) {
  const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const insideRect = (cx, cz, fx, fz) => [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].every(([a, b]) => pip(cx + a * (fx / 2 - 0.2), cz + b * (fz / 2 - 0.2), P));
  let best = null;
  for (const [type, cw, cd, label] of [['vb', 25, 18, '標準規格 25×18 m'], ['vbs', 24, 15, '精簡規格 24×15 m']]) {
    for (const rot of [90, 0]) {
      const fx = rot === 90 ? cd : cw, fz = rot === 90 ? cw : cd;
      for (let ox = 0; ox < fx; ox += 1) for (let oz = 0; oz < fz; oz += 1) {
        const items = [];
        for (let cx = x0 + ox + fx / 2; cx + fx / 2 <= x1 + 1e-6; cx += fx) for (let cz = z0 + oz + fz / 2; cz + fz / 2 <= z1 + 1e-6; cz += fz) if (insideRect(cx, cz, fx, fz)) items.push([cx, cz]);
        if (items.length && (!best || items.length > best.items.length)) best = { type, rot, label, cw, cd, items: items.slice(0, 16), n: Math.min(16, items.length) };
      }
    }
    if (best) break;   // prefer the full-size court whenever at least one fits
  }
  return best;
}
function polySafetyKit() {
  const P = state.building.poly, out = [], E = edgesOf(P);
  const add = (type, x, z, extra = {}) => out.push({ id: uid(), type, x, z, rot: 0, ...extra });
  const longest = E.slice().sort((a, b) => b.len - a.len);
  const front = longest[0];
  const at = (e, f) => [e.a[0] + e.dx * e.len * f, e.a[1] + e.dz * e.len * f];
  add('aed', ...at(front, 0.85)); add('firstaid', ...at(front, 0.8)); add('panel', ...at(front, 0.1));
  for (const e of E) {
    const n = Math.max(1, Math.round(e.len / 20)); for (let i = 0; i < n; i++) add('extinguisher', ...at(e, (i + 0.5) / n));
    add('emlight', ...at(e, 0.5));
    if (e.len >= 8) { add('exitsign', ...at(e, 0.08)); }
    if (e.len >= 12) { const m = Math.max(1, Math.round(e.len / 12)); for (let i = 0; i < m; i++) add('aircon', ...at(e, (i + 0.5) / m)); }
    add('cctv', ...at(e, 0.03));
  }
  const crash = longest[1] || longest[0], segs = Math.max(1, Math.round(crash.len / 20));
  for (let i = 0; i < segs; i++) add('crashpad', ...at(crash, (i + 0.5) / segs), { w: Math.min(20, crash.len / segs - 0.4) });
  const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]);
  for (let x = Math.min(...xs) + 7.5; x < Math.max(...xs); x += 15) for (let z = Math.min(...zs) + 7.5; z < Math.max(...zs); z += 15) if (pip(x, z, P)) add('smoke', x, z);
  return out;
}

// ---------------------------------------------------------------- outline editor (satellite + OpenStreetMap)
const OUT = { map: null, layer: null, pts: [], osm: null, site: null };
const toLocal = (geo) => {
  const lat0 = geo.reduce((a, p) => a + p[0], 0) / geo.length, lng0 = geo.reduce((a, p) => a + p[1], 0) / geo.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), kz = 110540;
  let P = geo.map(([la, ln]) => [(ln - lng0) * kx, -(la - lat0) * kz]);
  const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  P = P.map(([x, z]) => [Math.round((x - cx) * 10) / 10, Math.round((z - cz) * 10) / 10]);
  return { P, L: Math.max(...xs) - Math.min(...xs), W: Math.max(...zs) - Math.min(...zs) };
};
function outlineInfo() {
  const el = $('ol-info'), ok = $('ol-ok');
  if (OUT.pts.length < 3) { el.textContent = `已點 ${OUT.pts.length} 個角，至少要 3 個`; ok.disabled = true; return; }
  const { P, L, W } = toLocal(OUT.pts.map((m) => [m.getLatLng().lat, m.getLatLng().lng]));
  const a = Math.abs(polyArea(P));
  el.textContent = `${OUT.pts.length} 個角・外框 ${fmt1(L)}×${fmt1(W)} m・約 ${Math.round(a / 3.3058).toLocaleString('zh-TW')} 坪（${Math.round(a).toLocaleString('zh-TW')} ㎡）`;
  ok.disabled = L > 160 || W > 160;
  if (ok.disabled) el.textContent += '：太大了，長寬要在 160 m 內';
}
function redrawOutline() {
  if (OUT.layer) OUT.layer.remove();
  if (OUT.pts.length >= 2) OUT.layer = window.L.polygon(OUT.pts.map((m) => m.getLatLng()), { color: '#F2B705', weight: 3, fillOpacity: 0.15 }).addTo(OUT.map);
  outlineInfo();
}
function addCorner(latlng) {
  const m = window.L.marker(latlng, { draggable: true, icon: window.L.divIcon({ className: 'ol-pt', iconSize: [16, 16] }) }).addTo(OUT.map);
  m.on('drag', redrawOutline);
  m.on('contextmenu', () => { m.remove(); OUT.pts = OUT.pts.filter((x) => x !== m); redrawOutline(); });
  OUT.pts.push(m); redrawOutline();
}
function setCorners(geo) { OUT.pts.forEach((m) => m.remove()); OUT.pts = []; geo.forEach((g) => addCorner(window.L.latLng(g[0], g[1]))); }
async function findOsm() {
  const s = OUT.site, st = $('ol-osm');
  st.textContent = '正在找 OpenStreetMap 上附近的建物…';
  const c = OUT.map.getCenter();
  const q = `[out:json][timeout:20];way(around:250,${c.lat},${c.lng})[building];out geom;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const j = await r.json();
    if (OUT.osm) OUT.osm.remove();
    OUT.osm = window.L.layerGroup().addTo(OUT.map);
    const ways = (j.elements || []).filter((w) => w.geometry && w.geometry.length >= 4);
    for (const w of ways) {
      const geo = w.geometry.map((g) => [g.lat, g.lon]); if (geo.length > 3 && geo[0][0] === geo[geo.length - 1][0] && geo[0][1] === geo[geo.length - 1][1]) geo.pop();
      const h = Number(w.tags && (w.tags.height || '').replace(/[^\d.]/g, '')) || null, lv = Number(w.tags && w.tags['building:levels']) || null;
      window.L.polygon(geo, { color: '#4FC3F7', weight: 2, dashArray: '4 4', fillOpacity: 0.08 }).addTo(OUT.osm)
        .bindTooltip(`點一下套用這棟${h ? `・高 ${h} m` : lv ? `・${lv} 層` : ''}`, { sticky: true })
        .on('click', () => { setCorners(geo); if (h) $('ol-roof').value = h; st.textContent = '已套用 OpenStreetMap 的外框，可以拖角落微調，右鍵刪掉多的角。'; });
    }
    st.textContent = ways.length ? `找到 ${ways.length} 棟（藍色虛線），點你要的那棟就會套用外框。` : 'OpenStreetMap 在這附近沒有建物資料，請在衛星圖上點屋頂角落描外框。';
  } catch (e) { st.textContent = '連不到 OpenStreetMap，請直接在衛星圖上點屋頂角落描外框。'; }
}
async function openOutline() {
  if (GAME_ONLY) return;
  const id = window.__siteId; if (!id) { toast('先從地圖選一個候選場地，再描外框'); return; }
  let site = null; try { const d = await fetch('assets/data/sites.json', { cache: 'no-store' }).then((r) => r.json()); site = d.sites.find((s) => s.id === id); } catch (e) {}
  if (!site) return;
  OUT.site = site;
  const box = $('outline'); box.hidden = false;
  $('ol-title').textContent = `描外框：${site.name}`;
  $('ol-h').value = state.building.H || site.height || 8;
  $('ol-roof').value = state.building.roofH || '';
  $('ol-ge').href = `https://earth.google.com/web/@${site.lat},${site.lng},80a,350d,35y,0h,60t,0r`;
  if (!OUT.map) {
    OUT.map = window.L.map('ol-map', { zoomControl: true, maxZoom: 21 }).setView([site.lat, site.lng], 18);
    window.L.tileLayer('https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19, attribution: '&copy; 內政部國土測繪中心' }).addTo(OUT.map);
    OUT.map.on('click', (e) => addCorner(e.latlng));
  } else OUT.map.setView([site.lat, site.lng], 18);
  setTimeout(() => OUT.map.invalidateSize(), 50);
  setCorners(state.building.geo || []);
  $('ol-addr').value = state.building.addr || OUT.addr || '';
  if (state.building.geo && state.building.geo.length >= 3) { $('ol-osm').textContent = '這是之前存的外框。要換的話輸入地址按「用地址抓建物」。'; OUT.map.fitBounds(window.L.latLngBounds(state.building.geo).pad(0.6)); }
  else if ($('ol-addr').value) locateAddress();
  else autoOutline(site.lat, site.lng, '候選場地座標附近');
}
function closeOutline() { $('outline').hidden = true; }
// 外框轉正：找最長的那道牆，把整個外框轉到那道牆是水平的（平面圖、球場、區域才不會歪一邊）；回傳轉了幾度
// 外框校正：自己在地圖上點的角會有誤差，牆就歪歪的。找出建物的主方向，每一邊拉成跟主方向平行或垂直
// （保留那一邊的中點位置），再用相鄰兩邊的交點當新的牆角。四邊形 → 標準矩形；L 形等多邊形 → 牆角都是直角
function polyOrthoInfo(P) {
  const n = P.length; let sx = 0, sy = 0, worst = 0;
  const E = P.map((a, i) => { const b = P[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), th = Math.atan2(dz, dx); sx += L * Math.cos(4 * th); sy += L * Math.sin(4 * th); return { a, b, L, th }; });
  const main = Math.atan2(sy, sx) / 4;
  for (const e of E) { let d = (e.th - main) % (Math.PI / 2); if (d > Math.PI / 4) d -= Math.PI / 2; if (d < -Math.PI / 4) d += Math.PI / 2; e.dev = d; worst = Math.max(worst, Math.abs(d)); }
  return { E, main, worst };
}
function orthoPoly(P, maxDev = (25 * Math.PI) / 180) {
  if (!P || P.length < 4) return null;
  const { E, main, worst } = polyOrthoInfo(P);
  if (worst > maxDev) return null;
  // 每一邊：方向轉成主方向的 0／90／180／270°，通過原本的中點
  const L = E.map((e) => { const th = e.th - e.dev, mx = (e.a[0] + e.b[0]) / 2, mz = (e.a[1] + e.b[1]) / 2; return { mx, mz, dx: Math.cos(th), dz: Math.sin(th) }; });
  // 同方向的相鄰兩邊（幾乎共線）先合併
  const M = [];
  for (const l of L) { const q = M[M.length - 1]; if (q && Math.abs(q.dx * l.dz - q.dz * l.dx) < 1e-6) { q.mx = (q.mx + l.mx) / 2; q.mz = (q.mz + l.mz) / 2; } else M.push({ ...l }); }
  if (M.length > 2 && Math.abs(M[0].dx * M[M.length - 1].dz - M[0].dz * M[M.length - 1].dx) < 1e-6) { const q = M.pop(); M[0].mx = (M[0].mx + q.mx) / 2; M[0].mz = (M[0].mz + q.mz) / 2; }
  if (M.length < 4) return null;
  const out = [];
  for (let i = 0; i < M.length; i++) {
    const a = M[(i + M.length - 1) % M.length], b = M[i], den = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(den) < 1e-6) return null;
    const t = ((b.mx - a.mx) * b.dz - (b.mz - a.mz) * b.dx) / den;
    out.push([Math.round((a.mx + a.dx * t) * 100) / 100, Math.round((a.mz + a.dz * t) * 100) / 100]);
  }
  return out;
}
// 小角度的歪斜（3° 以內）：把外框繞自己的中心轉回跟圖紙格線平行
function smallTilt(P) { let a = polyOrthoInfo(P).main; while (a > Math.PI / 4) a -= Math.PI / 2; while (a < -Math.PI / 4) a += Math.PI / 2; return Math.abs(a) <= (3 * Math.PI) / 180 ? a : 0; }
const needsOrtho = (P) => { if (!P || P.length < 4) return false; const T = 0.05 * Math.PI / 180; return polyOrthoInfo(P).worst > T || Math.abs(smallTilt(P)) > T; };
function alignPoly(P) {
  let best = null;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!best || L > best.L) best = { L, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; }
  let ang = best.ang; while (ang > Math.PI / 4) ang -= Math.PI / 2; while (ang < -Math.PI / 4) ang += Math.PI / 2;
  const c = Math.cos(-ang), sn = Math.sin(-ang);
  let Q = P.map(([x, z]) => [x * c - z * sn, x * sn + z * c]);
  const xs = Q.map((q) => q[0]), zs = Q.map((q) => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  Q = Q.map(([x, z]) => [Math.round((x - cx) * 10) / 10, Math.round((z - cz) * 10) / 10]);
  return { P: Q, deg: (ang * 180) / Math.PI, L: Math.max(...Q.map((q) => q[0])) - Math.min(...Q.map((q) => q[0])), W: Math.max(...Q.map((q) => q[1])) - Math.min(...Q.map((q) => q[1])) };
}
async function applyOutline() {
  const geo = OUT.pts.map((m) => [m.getLatLng().lat, m.getLatLng().lng]);
  const raw = toLocal(geo).P, sq = orthoPoly(raw, (15 * Math.PI) / 180);
  const al = alignPoly(sq || raw), P = al.P, L = al.L, W = al.W;
  const H = Math.max(4, Math.min(15, Number($('ol-h').value) || 8)), roofH = Number($('ol-roof').value) || null, addr = $('ol-addr').value.trim().slice(0, 80) || null;
  closeOutline();
  pushHistory();
  window.__generating = true;
  state = sanitize({ name: (OUT.site ? OUT.site.name : '球館') + '（真實外框）', building: { L: Math.round(L * 2) / 2, W: Math.round(W * 2) / 2, H, poly: P, geo, roofH, addr, north: Math.round(al.deg * 10) / 10 }, floor: state.floor, net: state.net, items: [] });
  selectedId = null; selZoneId = null; fullRefresh(); frameView('bird');
  const plan = planPoly(P);
  if (plan) plan.items.forEach(([x, z], i) => state.items.push(sanitize({ items: [{ type: plan.type, x: Math.round(x * 2) / 2, z: Math.round(z * 2) / 2, rot: plan.rot, locked: true, label: `${i + 1} 號場` }] }).items[0]));
  let n = 1; for (const c of state.items.filter((i) => CAT[i.type].court === 'vb').slice()) state.items.push(cameraFor(c, n++));
  for (const kit of polySafetyKit()) state.items.push(sanitize({ items: [kit] }).items[0]);
  state.zones = autoZones();
  window.__generating = false;
  fullRefresh(); frameView('bird'); pv.fitted = false; renderPlan();
  toast((sq ? '外框的牆角已自動拉成直角。' : '') + (plan ? `照真實外框放進 ${plan.n} 面排球場（${plan.label}）` : '外框裡放不下標準排球場，可以手動擺精簡場'));
  if (window.__siteId) saveHall(window.__siteId);
}
function initOutline() {
  $('ol-close').addEventListener('click', closeOutline);
  $('ol-clear').addEventListener('click', () => setCorners([]));
  $('ol-find').addEventListener('click', locateAddress);
  $('ol-addr').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); locateAddress(); } });
  $('ol-ok').addEventListener('click', applyOutline);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('outline').hidden) closeOutline(); });
}
window.openOutline = openOutline;
function polyOf(b) {
  const P = b && b.poly;
  if (!Array.isArray(P) || P.length < 3 || P.length > 80 || !P.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return {};
  const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]);
  const L = Math.max(...xs) - Math.min(...xs), W = Math.max(...zs) - Math.min(...zs);
  if (Math.abs(L - num(b.L, 0)) > 1 || Math.abs(W - num(b.W, 0)) > 1) return {};   // size was edited by hand → back to a rectangle
  const geo = Array.isArray(b.geo) && b.geo.length === P.length ? b.geo.map((g) => [Number(g[0]), Number(g[1])]) : null;
  return { poly: P.map((p) => [Number(p[0]), Number(p[1])]), ...(Number.isFinite(b.north) ? { north: b.north } : {}), ...(geo ? { geo } : {}), ...(Number.isFinite(b.roofH) && b.roofH > 0 ? { roofH: b.roofH } : {}), ...(typeof b.addr === 'string' && b.addr ? { addr: b.addr.slice(0, 80) } : {}) };
}
initOutline();

// ---------------------------------------------------------------- automatic outline: address → building → footprint (Overture Maps / OpenStreetMap)
const OVT = 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-10-21.0/buildings.pmtiles';
let ovtLib = null;
async function ovtLoad() {
  if (!ovtLib) ovtLib = Promise.all([
    import('https://cdn.jsdelivr.net/npm/pmtiles@3.2.1/+esm'), import('https://cdn.jsdelivr.net/npm/@mapbox/vector-tile@2.0.3/+esm'), import('https://cdn.jsdelivr.net/npm/pbf@4.0.1/+esm'),
  ]).then(([pm, vt, pbf]) => ({ src: new pm.PMTiles(OVT), VectorTile: vt.VectorTile, Pbf: pbf.default }));
  return ovtLib;
}
// all building footprints within ~radius metres of a point, as [[lat, lng], …] rings
async function buildingsNear(lat, lng, radius = 250) {
  const { src, VectorTile, Pbf } = await ovtLoad();
  const z = 14, n = 2 ** z;
  const tx = (lng + 180) / 360 * n, ty = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  const span = radius / (40075016 * Math.cos(lat * Math.PI / 180) / n);   // radius in tile units
  const tiles = new Set();
  for (const dx of [-span, 0, span]) for (const dy of [-span, 0, span]) tiles.add(`${Math.floor(tx + dx)},${Math.floor(ty + dy)}`);
  const out = [];
  await Promise.all([...tiles].map(async (k) => {
    const [x, y] = k.split(',').map(Number);
    const t = await src.getZxy(z, x, y); if (!t) return;
    const layer = new VectorTile(new Pbf(new Uint8Array(t.data))).layers.building; if (!layer) return;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i), ext = layer.extent || 4096;
      const rings = f.loadGeometry(); if (!rings.length || rings[0].length < 4) continue;
      const ring = rings[0].map((p) => { const gx = (x + p.x / ext) / n, gy = (y + p.y / ext) / n; return [Math.atan(Math.sinh(Math.PI * (1 - 2 * gy))) * 180 / Math.PI, gx * 360 - 180]; });
      if (ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
      const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
      const d = Math.hypot((c[0] - lat) * 110540, (c[1] - lng) * 111320 * Math.cos(lat * Math.PI / 180));
      if (d <= radius) out.push({ ring, d, h: Number(f.properties.height) || null, src: f.properties['@geometry_source'] === 'OpenStreetMap' ? 'OpenStreetMap' : 'Overture' });
    }
  }));
  return out;
}
const geoArea = (ring) => Math.abs(polyArea(toLocal(ring).P));
// the building that contains the point; otherwise the closest sizeable one (factories are big, so prefer ≥ 300 ㎡)
function pickBuilding(list, lat, lng) {
  const inside = list.filter((b) => { const lp = toLocalAt(b.ring, lat, lng); return pip(0, 0, lp); });
  if (inside.length) return inside.sort((a, b) => geoArea(a.ring) - geoArea(b.ring))[0];
  const big = list.filter((b) => geoArea(b.ring) >= 300).sort((a, b) => a.d - b.d);
  return big[0] || list.sort((a, b) => a.d - b.d)[0] || null;
}
function toLocalAt(ring, lat0, lng0) { const kx = 111320 * Math.cos(lat0 * Math.PI / 180); return ring.map(([la, ln]) => [(ln - lng0) * kx, -(la - lat0) * 110540]); }
async function autoOutline(lat, lng, how, opts = {}) {
  const st = $('ol-osm');
  st.textContent = `正在找${how}的建物輪廓…`;
  try {
    const list = await buildingsNear(lat, lng, opts.radius || 250);
    if (OUT.osm) OUT.osm.remove();
    OUT.osm = window.L.layerGroup().addTo(OUT.map);
    window.L.circleMarker([lat, lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#E8814A', fillOpacity: 1 }).addTo(OUT.osm).bindTooltip(how, { permanent: false });
    for (const b of list) window.L.polygon(b.ring, { color: '#4FC3F7', weight: 1.5, dashArray: '4 4', fillOpacity: 0.06 }).addTo(OUT.osm)
      .bindTooltip(`點一下改用這棟・約 ${Math.round(geoArea(b.ring) / 3.3058).toLocaleString('zh-TW')} 坪`, { sticky: true })
      .on('click', (e) => { window.L.DomEvent.stopPropagation(e); setCorners(b.ring); if (b.h) $('ol-roof').value = b.h; st.textContent = '已換成這棟。'; });
    if (opts.choose) { setCorners([]); OUT.map.setView([lat, lng], 17); st.textContent = opts.choose; return list.length > 0; }
    const b = pickBuilding(list, lat, lng);
    if (!b) { st.textContent = '這附近沒有建物輪廓資料，請在衛星圖上點屋頂角落描外框。'; return false; }
    setCorners(b.ring); if (b.h) $('ol-roof').value = b.h;
    OUT.map.fitBounds(window.L.latLngBounds(b.ring).pad(0.6));
    st.textContent = `已自動抓到${how}的建物輪廓（來源：${b.src}）。不是這棟的話，點旁邊藍色虛線的建物換一棟；角落也可以拖曳微調。`;
    return true;
  } catch (e) { st.textContent = '建物輪廓資料讀取失敗，請稍後再試，或在衛星圖上點屋頂角落描外框。'; return false; }
}
async function locateAddress() {
  return;
}
// ---------------------------------------------------------------- wall / steel-structure visibility (view helpers, not saved)
const VIS = { structure: false, auto: true, wall: {} };   // wall[i] = 'show' | 'hide' (overrides auto)
function wallName(wl, i) {
  const [nx, nz] = wl.userData.normal;
  const dir = Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? '東' : '西') : (nz > 0 ? '南' : '北');
  const len = wl.userData.len || 0;
  return `${dir}側牆${len ? `・${Math.round(len)} m` : ''}`;
}
function wallVisible(wl, i, cp) {
  const o = VIS.wall[i];
  if (o === 'show') return true; if (o === 'hide') return false;
  if (!VIS.auto) return true;
  const [nx, nz] = wl.userData.normal, [cx, cz] = wl.userData.center;
  return (cp.x - cx) * nx + (cp.z - cz) * nz < 0;
}
function applyStructure() {
  buildingGroup.traverse((o) => { if (o.userData && o.userData.structure) o.visible = VIS.structure; if (o.userData && o.userData.overhead) o.visible = VIS.structure && view !== 'top'; });
  window.wakeRender && window.wakeRender();
}
function renderWallMenu() {
  const m = $('wallmenu'); if (!m) return;
  m.innerHTML = `<label><input type="checkbox" data-k="structure" ${VIS.structure ? 'checked' : ''}> 顯示鋼構樑柱</label>
    <label><input type="checkbox" data-k="auto" ${VIS.auto ? 'checked' : ''}> 擋住視線的牆自動隱藏</label>
    <div class="wm-t">各面牆</div>
    ${walls.map((wl, i) => `<div class="wm-row"><span>${wallName(wl, i)}</span><span class="seg-s">${[['auto', '自動'], ['show', '顯示'], ['hide', '拿掉']].map(([k, l]) => `<button type="button" data-w="${i}" data-v="${k}" aria-pressed="${(VIS.wall[i] || 'auto') === k}">${l}</button>`).join('')}</span></div>`).join('')}
    <button type="button" class="wm-reset" data-reset="1">全部恢復</button>`;
}
function initWallMenu() {
  const btn = $('t-walls'), m = $('wallmenu');
  btn.addEventListener('click', (e) => { e.stopPropagation(); m.hidden = !m.hidden; btn.setAttribute('aria-expanded', String(!m.hidden)); if (!m.hidden) renderWallMenu(); });
  document.addEventListener('click', (e) => { if (!m.hidden && !m.contains(e.target) && e.target !== btn) { m.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  m.addEventListener('change', (e) => { const k = e.target.dataset.k; if (!k) return; VIS[k] = e.target.checked; if (k === 'structure') applyStructure(); window.wakeRender && window.wakeRender(); });
  m.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
    if (b.dataset.reset) { VIS.wall = {}; VIS.auto = true; }
    else { const i = +b.dataset.w, v = b.dataset.v; if (v === 'auto') delete VIS.wall[i]; else VIS.wall[i] = v; }
    renderWallMenu(); window.wakeRender && window.wakeRender();
  });
}

initWallMenu();
// ---------------------------------------------------------------- in-page inspector: fly the camera so the picked object sits left of centre, panel on the right
const inspEl = $('insp'); let inspSaved = null, inspTween = null;
function tweenCam(toPos, toTarget, ms) {
  if (inspTween) cancelAnimationFrame(inspTween);
  const fromPos = camera.position.clone(), fromT = controls.target.clone(), t0 = performance.now();
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  return new Promise((res) => {
    const step = (now) => {
      const k = reduceMotion ? 1 : Math.min(1, (now - t0) / ms), e = ease(k);
      camera.position.lerpVectors(fromPos, toPos, e); controls.target.lerpVectors(fromT, toTarget, e); controls.update();
      if (k < 1) inspTween = requestAnimationFrame(step); else { inspTween = null; res(); }
    };
    inspTween = requestAnimationFrame(step);
  });
}
// the object becomes the orbit centre (so it can be spun 360°); a camera view offset slides it left of the panel
let inspOff = { x: 0, y: 0 }, inspGoal = null;
function setOffset(x, y) {
  inspOff = { x, y };
  const r = renderer.domElement.getBoundingClientRect(), w = r.width || 1, h = r.height || 1;
  if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) camera.clearViewOffset(); else camera.setViewOffset(w, h, x, y, w, h);
  camera.updateProjectionMatrix();
}
function focusPlan(it) {
  // real bounding box of the 3D object (ignores the camera view cone and labels)
  const grp = itemObjs.get(it.id), box = new THREE.Box3();
  if (grp) { grp.updateMatrixWorld(true); let hasFocus = false; grp.traverse((o) => { if (o.isMesh && o.userData.focus) hasFocus = true; });
    grp.traverse((o) => { if (o.isMesh && !o.userData.noPick && !o.userData.camCone && o.visible && (!hasFocus || o.userData.focus)) box.expandByObject(o); }); }
  if (box.isEmpty()) { const def = CAT[it.type]; box.setFromCenterAndSize(new THREE.Vector3(it.x, 1, it.z), new THREE.Vector3(def.w || 1, 2, def.d || 1)); }
  const obj = box.getCenter(new THREE.Vector3()), dims = box.getSize(new THREE.Vector3());
  const size = Math.max(0.6, dims.x, dims.z, Math.min(dims.y, 3));
  const rect = renderer.domElement.getBoundingClientRect();
  const narrow = innerWidth <= 760, panelW = narrow ? 0 : matchMedia('(orientation: landscape) and (max-height: 520px)').matches ? innerWidth * 0.66 + 8 : Math.min(1700, innerWidth * 0.8) + 16;
  const sx = narrow ? rect.left + rect.width / 2 : (rect.left + (innerWidth - panelW)) / 2;
  const sy = narrow ? rect.top + rect.height * 0.19 : rect.top + rect.height * 0.5;
  const dir = camera.position.clone().sub(controls.target); dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(1, 0, 1); dir.normalize();
  const el = 0.5, area = narrow ? 0.62 : Math.max(0.3, (innerWidth - panelW - rect.left) / rect.width);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const dist = Math.max(narrow ? 7 : 6.5, Math.min(180, (size * (narrow ? 1.8 : 1.6)) / (tanV * camera.aspect * area)));
  const pos = obj.clone().add(new THREE.Vector3(dir.x * Math.cos(el), Math.sin(el), dir.z * Math.cos(el)).multiplyScalar(dist));
  const r = Math.max(70, Math.min(rect.height * (narrow ? 0.17 : 0.34), (size * 0.6) / (dist * tanV) * rect.height * 0.5));
  return { pos, target: obj, sx, sy, r, ox: rect.width / 2 - (sx - rect.left), oy: rect.height / 2 - (sy - rect.top), dist, left: rect.left };
}
function tweenOffset(x, y, ms) {
  const f = { ...inspOff }, t0 = performance.now();
  return new Promise((res) => { const st = (now) => { const k = reduceMotion ? 1 : Math.min(1, (now - t0) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    setOffset(f.x + (x - f.x) * e, f.y + (y - f.y) * e); if (k < 1) requestAnimationFrame(st); else res(); }; requestAnimationFrame(st); });
}
window.openInspector = async (type, label) => {
  if (GAME_ONLY) return;
  const it = state.items.find((i) => i.id === selectedId);
  const url = window.evalUrl(type, label);
  const frame = $('insp-frame');
  $('insp-kind').textContent = type === 'camera' || type === 'scoreboard' ? '智慧球場・比賽辨識' : '設備評估';
  $('insp-title').textContent = label || (CAT[type] && CAT[type].label) || '物件';
  $('insp-tag').textContent = label || '';
  $('insp-new').href = url;
  $('insp-pick').dataset.type = type; renderPicker(type); renderCostCard();
  frame.classList.remove('ready');
  frame.onload = () => { if (frame.src !== 'about:blank') frame.classList.add('ready'); };
  frame.src = url.replace('.html?', '.html?embed=1&');
  if (!inspSaved) inspSaved = { pos: camera.position.clone(), target: controls.target.clone(), min: controls.minDistance, max: controls.maxDistance };
  window.__insp = true;
  inspEl.hidden = false; inspEl.setAttribute('aria-hidden', 'false');
  // fold the left settings rail away so the 3D view gets the whole space left of the panel
  $('app').classList.add('inspecting'); resize();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const plan = it ? focusPlan(it) : null; inspGoal = plan;
  if (plan) {
    inspEl.style.setProperty('--hx', plan.sx + 'px'); inspEl.style.setProperty('--hy', plan.sy + 'px'); inspEl.style.setProperty('--hr', plan.r + 'px');
    inspEl.style.setProperty('--railw', plan.left + 'px');
  } else { inspEl.style.setProperty('--hx', '30%'); inspEl.style.setProperty('--hr', '0px'); }
  controls.enabled = false; controls.autoRotate = false;
  requestAnimationFrame(() => requestAnimationFrame(() => inspEl.classList.add('on')));
  if (plan) {
    await Promise.all([tweenCam(plan.pos, plan.target, 950), tweenOffset(plan.ox, plan.oy, 950)]);
    // free 360° look-around: drag to orbit, wheel to zoom, slow auto-spin until the first touch
    controls.minDistance = Math.max(2, plan.dist * 0.35); controls.maxDistance = plan.dist * 2.2;
    controls.enabled = true; controls.enablePan = false;
    if (!reduceMotion) { controls.autoRotate = true; controls.autoRotateSpeed = 1.6; }
  }
  $('insp-x').focus({ preventScroll: true });
};
window.closeInspector = async () => {
  if (inspEl.hidden) return;
  inspEl.classList.remove('on'); inspEl.setAttribute('aria-hidden', 'true');
  controls.autoRotate = false; controls.enabled = false; controls.enablePan = true;
  const sv = inspSaved; inspSaved = null; inspGoal = null;
  setOffset(inspOff.x, inspOff.y);
  $('app').classList.remove('inspecting'); resize();
  if (sv) { controls.minDistance = sv.min; controls.maxDistance = sv.max; await Promise.all([tweenCam(sv.pos, sv.target, 800), tweenOffset(0, 0, 800)]); }
  setOffset(0, 0);
  controls.enabled = true; window.__insp = false;
  setTimeout(() => { if (!inspEl.classList.contains('on')) { inspEl.hidden = true; $('insp-frame').src = 'about:blank'; } }, 250);
};
renderer.domElement.addEventListener('pointerdown', () => { if (window.__insp) controls.autoRotate = false; });
renderer.domElement.addEventListener('wheel', () => { if (window.__insp) controls.autoRotate = false; }, { passive: true });
addEventListener('resize', () => { if (window.__insp && inspGoal) { const it = state.items.find((i) => i.id === selectedId); if (it) { const p = focusPlan(it); inspGoal = p; setOffset(p.ox, p.oy);
  inspEl.style.setProperty('--hx', p.sx + 'px'); inspEl.style.setProperty('--hy', p.sy + 'px'); inspEl.style.setProperty('--railw', p.left + 'px'); } } });
$('insp-x').addEventListener('click', () => window.closeInspector());
$('insp-block').addEventListener('click', () => window.closeInspector());
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !inspEl.hidden) { e.stopPropagation(); window.closeInspector(); } }, true);
addEventListener('message', (e) => { if (e.data && e.data.vb === 'close') window.closeInspector(); });

initPicker(); setTimeout(renderCostCard, 0);

// ---------------------------------------------------------------- 2D plan editor: an architect's sheet you can draw on
// 座標：世界 x 往東、z 往南（與 3D 相同），SVG 一律換算成像素單位（S px/m）再輸出，文字才不會在縮放群組裡變糊
const S = 40;
const svgEl = $('plan-svg'), planHost = $('plan-host');
const pv = { s: 20, ox: -30, oz: -30, fitted: false };   // s = 螢幕 px/m，(ox, oz) = 左上角的世界座標
let planTool = 'select', drawType = 'rest', planDrag = null, sheetBox = null;
const pointers = new Map();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f2 = (v) => (Math.round(v * 100) / 100);
const X = (x) => f2(x * S), Y = (z) => f2(z * S), M = (m) => f2(m * S);
const PT = ([x, z]) => `${X(x)},${Y(z)}`;
function annoK() { const B = hallBounds(); return clamp(Math.max(B.x1 - B.x0, B.z1 - B.z0) / 36, 0.75, 4); }
function planSize() { const r = svgEl.getBoundingClientRect(); return { w: r.width || 800, h: r.height || 600, left: r.left, top: r.top }; }
function applyView() { const { w, h } = planSize(); svgEl.setAttribute('viewBox', `${X(pv.ox)} ${Y(pv.oz)} ${M(w / pv.s)} ${M(h / pv.s)}`); }
function toWorld(e) { const r = planSize(); return [pv.ox + (e.clientX - r.left) / pv.s, pv.oz + (e.clientY - r.top) / pv.s]; }
function fitPlan() {
  if (!sheetBox) renderPlan();
  const { w, h } = planSize(); if (w < 10 || h < 10) return;
  const top = w < 900 ? 96 : 60, pad = 14;
  const b = sheetBox, bw = b.x1 - b.x0, bh = b.z1 - b.z0;
  pv.s = Math.min((w - pad * 2) / bw, (h - top - pad) / bh);
  pv.ox = b.x0 - ((w / pv.s) - bw) / 2;
  pv.oz = b.z0 - top / pv.s - (((h - top - pad) / pv.s) - bh) / 2;
  pv.fitted = true; applyView();
}
function zoomAt(f, cx, cy) {
  const { w, h, left, top } = planSize(); cx = cx ?? left + w / 2; cy = cy ?? top + h / 2;
  const wx = pv.ox + (cx - left) / pv.s, wz = pv.oz + (cy - top) / pv.s;
  pv.s = clamp(pv.s * f, 1.5, 400);
  pv.ox = wx - (cx - left) / pv.s; pv.oz = wz - (cy - top) / pv.s; applyView(); renderPlan();
}
const snapP = (v) => (snapOn ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100);
// 圖層：在平面圖上暫時藏起來的球場（只影響平面圖，方便點到壓在下面的東西；不存檔）
var planHide = new Set();   // var：初始化時 renderPlan 可能比這行早跑

// 平面圖上要畫的物件：球場與落地的家具（牆上、天花板上的只畫燈具的虛線）
const planItem = (it) => !CAT[it.type].wall && !CAT[it.type].ceiling;

function courtSvg(it, sel) {
  const def = CAT[it.type], k = def.court, lines = it.mode === 'lines';
  const [cw, cd] = def.play, fw = def.w, fd = def.d;
  const ox = -cw / 2, oz = k === 'bk' ? -fd / 2 + 1 : -cd / 2;
  const L = (x1, z1, x2, z2, cls = 'cl') => `<line class="${cls}" x1="${M(x1)}" y1="${M(z1)}" x2="${M(x2)}" y2="${M(z2)}"/>`;
  let s = `<g class="court" data-i="${it.id}" transform="translate(${X(it.x)} ${Y(it.z)}) rotate(${-it.rot})">`;
  s += `<rect class="${lines ? 'cf-l' : 'cf'}" x="${M(-fw / 2)}" y="${M(-fd / 2)}" width="${M(fw)}" height="${M(fd)}"/>`;
  s += `<rect class="${lines ? 'cp-l' : 'cp'}" x="${M(ox)}" y="${M(oz)}" width="${M(cw)}" height="${M(cd)}"/>`;
  if (k === 'vb') {
    s += L(0, oz, 0, oz + cd) + L(-3, oz, -3, oz + cd) + L(3, oz, 3, oz + cd);
    s += L(0, -5.5, 0, 5.5, 'cnet') + `<circle class="cpost" cx="0" cy="${M(-5.5)}" r="${M(0.12)}"/><circle class="cpost" cx="0" cy="${M(5.5)}" r="${M(0.12)}"/>`;
  } else if (k === 'bd') {
    s += L(0, oz, 0, oz + cd, 'cnet') + L(-1.98, oz, -1.98, oz + cd) + L(1.98, oz, 1.98, oz + cd) + L(ox, 0, -1.98, 0) + L(1.98, 0, ox + cw, 0);
  } else if (k === 'pb') {
    s += L(0, oz, 0, oz + cd, 'cnet') + L(-2.13, oz, -2.13, oz + cd) + L(2.13, oz, 2.13, oz + cd) + L(ox, 0, -2.13, 0) + L(2.13, 0, ox + cw, 0);
  } else if (k === 'bk') {
    s += `<rect class="cl" fill="none" x="${M(-2.45)}" y="${M(oz)}" width="${M(4.9)}" height="${M(5.8)}"/><circle class="cl" fill="none" cx="0" cy="${M(oz + 5.8)}" r="${M(1.8)}"/>`;
  }
  const K = annoK(), fsz = clamp(Math.min(fw, fd) * 0.07, 0.4, 0.9 * K);
  const nr = norm360(it.rot), rotTxt = nr === 90 || nr === 270 ? ` transform="rotate(${nr === 90 ? 90 : -90})"` : nr > 90 && nr < 270 ? ' transform="rotate(180)"' : '';
  s += `<g${rotTxt}><text class="ctx" x="0" y="${M(-fd / 2 + 1.0 * fsz + 0.2)}" text-anchor="middle" style="font-size:${M(fsz)}px">${esc(labelOf(it))}${lines ? '（畫線）' : ''}</text>`;
  s += `<text class="csub mono" x="0" y="${M(-fd / 2 + 1.7 * fsz + 0.25)}" text-anchor="middle" style="font-size:${M(fsz * 0.55)}px">${k === 'vb' ? '18 × 9 m' : `${cw} × ${cd} m`}${it.locked ? ' · 已鎖定' : ''}</text></g>`;
  if (sel) s += `<rect class="selbox" x="${M(-fw / 2)}" y="${M(-fd / 2)}" width="${M(fw)}" height="${M(fd)}"/>`;
  const r = (it.rot * Math.PI) / 180, toW = (lx, lz) => [it.x + lx * Math.cos(r) + lz * Math.sin(r), it.z - lx * Math.sin(r) + lz * Math.cos(r)];
  return s + '</g>' + (sel && !it.locked && it.id === selectedId && selItems().length < 2 ? rotKnob(it.id, 'hi', toW, fd / 2) : '');
}
// 區域的自動擺設：虛線框，點一下就拆成可調整的元件
function ghostSvg(f, zid, i) {
  const def = CAT[f.type], w = f.w ?? def.w, d = f.d ?? def.d;
  return `<g class="zfix" data-zf="${zid}:${i}" transform="translate(${X(f.x)} ${Y(f.z)}) rotate(${-f.rot})"><title>${esc(def.label)}：點一下就能單獨調整</title><rect class="ff" x="${M(-w / 2)}" y="${M(-d / 2)}" width="${M(w)}" height="${M(d)}"/></g>`;
}
function itemSvg(it, sel) {
  const { w, d } = sizeOf(it), def = CAT[it.type];
  let body = `<rect class="${def.room ? 'fr' : 'ff'}" x="${M(-w / 2)}" y="${M(-d / 2)}" width="${M(w)}" height="${M(d)}"${it.type === 'table' ? ` rx="${M(w / 2)}"` : ''}/>`;
  if (it.type === 'sofa') body += `<rect class="fd" x="${M(-w / 2)}" y="${M(d / 2 - 0.22)}" width="${M(w)}" height="${M(0.22)}"/>`;
  if (it.type === 'locker') for (let x = -w / 2 + 0.45; x < w / 2 - 0.1; x += 0.45) body += `<line class="fl" x1="${M(x)}" y1="${M(-d / 2)}" x2="${M(x)}" y2="${M(d / 2)}"/>`;
  if (it.type === 'netwall') body = `<line class="fnet" x1="${M(-w / 2)}" y1="0" x2="${M(w / 2)}" y2="0"/>`;
  if (sel) body += `<rect class="selbox" x="${M(-w / 2 - 0.1)}" y="${M(-d / 2 - 0.1)}" width="${M(w + 0.2)}" height="${M(d + 0.2)}"/>`;
  const r = (it.rot * Math.PI) / 180, toW = (lx, lz) => [it.x + lx * Math.cos(r) + lz * Math.sin(r), it.z - lx * Math.sin(r) + lz * Math.cos(r)];
  const knob = sel && !it.locked && it.id === selectedId && selItems().length < 2 ? rotKnob(it.id, 'hi', toW, d / 2 + 0.1) : '';
  return `<g class="court" data-i="${it.id}" transform="translate(${X(it.x)} ${Y(it.z)}) rotate(${-it.rot})">${body}</g>${knob}`;
}
function zoneSvg(z, sel) {
  const Z = ZONES[z.type], lay = zoneLayout(z), K = annoK();
  let s = `<g class="zone" data-z="${z.id}">`;
  const poly = lay.corners.map(PT).join(' ');
  s += `<polygon class="zf" points="${poly}" fill="${Z.color}"/>`;
  s += `<polygon points="${poly}" fill="url(#pz-${['deck', 'vinyl'].includes(zoneFloor(z)) ? 'wood' : zoneFloor(z) === 'pvc' ? 'concrete' : zoneFloor(z)})"/>`;
  const zwPlan = zoneWalls(z);
  for (const sd of lay.sides) {
    if (sd.onWall) continue;
    const ux = (sd.b[0] - sd.a[0]) / sd.len, uz = (sd.b[1] - sd.a[1]) / sd.len, P = (t) => [sd.a[0] + ux * t, sd.a[1] + uz * t];
    const parts = sd.door ? [[0, sd.door[0]], [sd.door[1], sd.len]] : [[0, sd.len]];
    for (const [t0, t1] of parts) {
      if (t1 - t0 < 0.02) continue;
      const a = P(t0), b = P(t1);
      if (zwPlan === 'solid') s += `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="#1F2430" stroke-width="${M(0.08)}"/>`;
      else if (zwPlan === 'net') s += `<line class="fnet" x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}"/>`;
      else if (zwPlan !== 'open') {
        const o = 0.06;   // 玻璃：雙細線
        s += `<line class="g2" x1="${X(a[0] + sd.nx * o)}" y1="${Y(a[1] + sd.nz * o)}" x2="${X(b[0] + sd.nx * o)}" y2="${Y(b[1] + sd.nz * o)}"/><line class="g2" x1="${X(a[0] - sd.nx * o)}" y1="${Y(a[1] - sd.nz * o)}" x2="${X(b[0] - sd.nx * o)}" y2="${Y(b[1] - sd.nz * o)}"/>`;
        const n = Math.max(1, Math.round((t1 - t0) / 1.2));
        for (let k = 0; k <= n; k++) { const m = P(t0 + ((t1 - t0) * k) / n); s += `<line class="g2" x1="${X(m[0] + sd.nx * o)}" y1="${Y(m[1] + sd.nz * o)}" x2="${X(m[0] - sd.nx * o)}" y2="${Y(m[1] - sd.nz * o)}"/>`; }
      } else s += `<line class="zb" x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}"/>`;
    }
    if (sd.door) {   // 門：門扇＋門弧（往外開）
      const h = P(sd.door[0]), fr = P(sd.door[1]), wd = sd.door[1] - sd.door[0];
      const op = [h[0] + sd.nx * wd, h[1] + sd.nz * wd];
      s += `<line class="dleaf" x1="${X(h[0])}" y1="${Y(h[1])}" x2="${X(op[0])}" y2="${Y(op[1])}"/>`;
      const cross = (fr[0] - h[0]) * (op[1] - h[1]) - (fr[1] - h[1]) * (op[0] - h[0]);
      s += `<path class="darc" d="M${PT(fr)} A${M(wd)} ${M(wd)} 0 0 ${cross > 0 ? 1 : 0} ${PT(op)}"/>`;
    }
  }
  return s + '</g>';
}
// 區域名稱與選取框畫在家具之上
function zoneLabelSvg(z, sel) {
  const Z = ZONES[z.type], lay = zoneLayout(z), K = annoK();
  let s = '<g class="zone-l" style="pointer-events:none">';
  const area = z.w * z.d, fs = clamp(Math.min(z.w, z.d * 1.6) * 0.13, 0.28, 0.62 * K);
  const showArea = Math.min(z.w, z.d) >= 2.2;
  const cy = z.z - (showArea ? fs * 0.45 : -fs * 0.35);
  s += `<text class="zn" x="${X(z.x)}" y="${Y(cy)}" text-anchor="middle" style="font-size:${M(fs)}px">${esc(zoneName(z))}</text>`;
  if (showArea) {
    s += `<text class="ze" x="${X(z.x)}" y="${Y(cy + fs * 0.85)}" text-anchor="middle" style="font-size:${M(fs * 0.42)}px">${Z.en}</text>`;
    s += `<text class="za mono" x="${X(z.x)}" y="${Y(cy + fs * 1.55)}" text-anchor="middle" style="font-size:${M(fs * 0.5)}px">${fmt1(area)} m² · ${fmt1(area / PING)} 坪</text>`;
  }
  if (sel) {
    s += `<polygon class="selbox" points="${lay.corners.map(PT).join(' ')}"/>`;
    const hs = 9 / pv.s, hw = z.w / 2, hd = z.d / 2;
    for (const [k, lx, lz] of [['nw', -hw, -hd], ['n', 0, -hd], ['ne', hw, -hd], ['e', hw, 0], ['se', hw, hd], ['s', 0, hd], ['sw', -hw, hd], ['w', -hw, 0]]) {
      const [hx, hz] = zoneW(z, lx, lz);
      s += `<rect class="handle" data-h="${k}" data-hz="${z.id}" x="${X(hx - hs / 2)}" y="${Y(hz - hs / 2)}" width="${M(hs)}" height="${M(hs)}" style="pointer-events:all;stroke-width:${M(1.5 / pv.s)}px"/>`;
    }
    s += rotKnob(z.id, 'hz', (lx, lz) => zoneW(z, lx, lz), hd);
    s += `<text class="seldim mono" x="${X(z.x)}" y="${Y(z.z)}" dy="${M(-hd - 1.4 * 28 / pv.s)}" text-anchor="middle" style="font-size:${M(12 / pv.s)}px">${fmt1(z.w)} × ${fmt1(z.d)} m${z.rot ? `・${f2(z.rot)}°` : ''}</text>`;
  }
  return s + '</g>';
}
// 旋轉吸附：外牆每一邊、畫的牆、其他區域與球場的角度都是「對齊參考」。
// 物件的 x 軸在平面上的方向是 -rot，所以要跟一條角度 θ 的線平行，rot = -θ + k·90。
const norm360 = (d) => ((d % 360) + 360) % 360;
const angDiff = (a, b) => { const d = norm360(a - b); return d > 180 ? 360 - d : d; };
function rotRefs(self) {
  const refs = [];
  const P = outlinePoly();
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1) continue;
    refs.push({ th: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI, a, b, src: '外牆', L });
  }
  for (const w of state.walls || []) { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (L > 0.5) refs.push({ th: (Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]) * 180) / Math.PI, a: w.a, b: w.b, src: '牆', L }); }
  for (const o of [...state.zones, ...state.items.filter((i) => CAT[i.type].court)]) if (o !== self && (o.rot || 0)) refs.push({ th: -(o.rot || 0), src: o.type in ZONES ? '區域' : '球場', o });
  refs.push({ th: 0, src: '圖紙' });
  return refs;
}
// 回傳吸附後的角度與參考線（沒有在 tol 度以內就照原角度）
function snapRot(deg, self, tol = 2.5) {
  let best = null;
  for (const r of rotRefs(self)) for (let k = 0; k < 4; k++) {
    const cand = norm360(-r.th + k * 90), d = angDiff(deg, cand);
    if (d <= tol && (!best || d < best.d - 1e-6 || (Math.abs(d - best.d) < 1e-6 && (r.L || 0) > (best.r.L || 0)))) best = { d, deg: cand, r };
  }
  return best ? { deg: Math.round(best.deg * 100) / 100, ref: best.r } : { deg: Math.round(norm360(deg) * 10) / 10, ref: null };
}
// 「對齊外牆」：轉到最接近的外牆角度（不限距離）
function alignToWall(o) {
  const P = outlinePoly(); let best = null;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue;
    const th = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    for (let k = 0; k < 4; k++) { const cand = norm360(-th + k * 90), d = angDiff(o.rot || 0, cand); if (!best || d < best.d - 0.01 || (Math.abs(d - best.d) < 0.01 && L > best.L)) best = { d, deg: cand, L }; }
  }
  return best ? Math.round(best.deg * 100) / 100 : (o.rot || 0);
}
// 旋轉把手：選取框上緣中間往外一根短線＋圓點，拖它就能 360° 連續轉；靠近外牆、牆或其他區域的角度會自動吸住（按住 Shift 不吸附）
function rotGuideSvg() {
  if (!planDrag || (planDrag.kind !== 'zrot' && planDrag.kind !== 'irot') || !planDrag.snap) return '';
  const { ref, o } = planDrag.snap, K = 1 / pv.s;
  let s = '';
  const deg = o.rot || 0, ux = Math.cos((-deg * Math.PI) / 180), uz = Math.sin((-deg * Math.PI) / 180), R = 40;
  if (ref) {
    // 對齊線：穿過物件中心、跟參考邊平行，參考邊本身加粗
    const t = (ref.th * Math.PI) / 180, dx = Math.cos(t), dz = Math.sin(t);
    s += `<line x1="${X(o.x - dx * R)}" y1="${Y(o.z - dz * R)}" x2="${X(o.x + dx * R)}" y2="${Y(o.z + dz * R)}" stroke="#E0A100" stroke-width="${M(1.2 * K)}" stroke-dasharray="${M(8 * K)} ${M(5 * K)}" pointer-events="none"/>`;
    s += `<line x1="${X(o.x + dz * R)}" y1="${Y(o.z - dx * R)}" x2="${X(o.x - dz * R)}" y2="${Y(o.z + dx * R)}" stroke="#E0A100" stroke-width="${M(0.8 * K)}" stroke-dasharray="${M(3 * K)} ${M(5 * K)}" opacity=".6" pointer-events="none"/>`;
    if (ref.a) s += `<line x1="${X(ref.a[0])}" y1="${Y(ref.a[1])}" x2="${X(ref.b[0])}" y2="${Y(ref.b[1])}" stroke="#E0A100" stroke-width="${M(5 * K)}" stroke-linecap="round" opacity=".75" pointer-events="none"/>`;
  } else {
    s += `<line x1="${X(o.x - ux * 3)}" y1="${Y(o.z - uz * 3)}" x2="${X(o.x + ux * 3)}" y2="${Y(o.z + uz * 3)}" stroke="#C4552A" stroke-width="${M(1 * K)}" stroke-dasharray="${M(4 * K)} ${M(4 * K)}" pointer-events="none"/>`;
  }
  const txt = `${f2(deg)}°${ref ? `　已對齊${ref.src}` : ''}`;
  const fs = 13 * K, tw = ([...txt].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 1 : 0.6), 0) + 1.2) * fs;
  s += `<g pointer-events="none"><rect x="${X(o.x) - M(tw / 2)}" y="${Y(o.z) - M(fs * 2.6)}" width="${M(tw)}" height="${M(fs * 1.6)}" rx="${M(4 * K)}" fill="${ref ? '#F2B705' : '#1B2638'}"/><text x="${X(o.x)}" y="${Y(o.z) - M(fs * 1.4)}" text-anchor="middle" style="font-size:${M(fs)}px;font-weight:700" fill="${ref ? '#1B2638' : '#fff'}">${txt}</text></g>`;
  return s;
}
function rotKnob(id, attr, toW, hd) {
  const off = hd + 28 / pv.s, [tx, tz] = toW(0, -hd), [kx, kz] = toW(0, -off), r = 6 / pv.s;
  return `<line x1="${X(tx)}" y1="${Y(tz)}" x2="${X(kx)}" y2="${Y(kz)}" stroke="#C4552A" stroke-width="${M(1.5 / pv.s)}"/><circle class="handle" data-h="rot" data-${attr}="${id}" cx="${X(kx)}" cy="${Y(kz)}" r="${M(r)}" style="pointer-events:all;cursor:grab;stroke-width:${M(1.5 / pv.s)}px"/>`;
}
function wallSvg(w, sel) {
  const W2 = { solid: `stroke="#1F2430" stroke-width="${M(0.15)}"`, half: `stroke="#6F685F" stroke-width="${M(0.15)}" stroke-dasharray="${M(0.3)} ${M(0.1)}"`, glass: `stroke="#3B5C6E" stroke-width="${M(0.06)}"`, net: `class="fnet"` }[w.kind];
  let s = `<g data-w="${w.id}" style="cursor:move"><line x1="${X(w.a[0])}" y1="${Y(w.a[1])}" x2="${X(w.b[0])}" y2="${Y(w.b[1])}" stroke="transparent" stroke-width="${M(Math.max(0.4, 14 / pv.s))}"/><line x1="${X(w.a[0])}" y1="${Y(w.a[1])}" x2="${X(w.b[0])}" y2="${Y(w.b[1])}" ${W2} stroke-linecap="square"/>`;
  if (w.kind === 'glass') { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), nx = -(w.b[1] - w.a[1]) / L * 0.06, nz = (w.b[0] - w.a[0]) / L * 0.06; s += `<line class="g2" x1="${X(w.a[0] + nx)}" y1="${Y(w.a[1] + nz)}" x2="${X(w.b[0] + nx)}" y2="${Y(w.b[1] + nz)}"/><line class="g2" x1="${X(w.a[0] - nx)}" y1="${Y(w.a[1] - nz)}" x2="${X(w.b[0] - nx)}" y2="${Y(w.b[1] - nz)}"/>`; }
  if (sel) {
    const hs = 10 / pv.s;
    s += `<line x1="${X(w.a[0])}" y1="${Y(w.a[1])}" x2="${X(w.b[0])}" y2="${Y(w.b[1])}" stroke="#C4552A" stroke-width="${M(2 / pv.s)}" stroke-dasharray="${M(6 / pv.s)} ${M(4 / pv.s)}"/>`;
    for (const [k, q] of [['wa', w.a], ['wb', w.b]]) s += `<rect class="handle" data-h="${k}" data-hw="${w.id}" x="${X(q[0] - hs / 2)}" y="${Y(q[1] - hs / 2)}" width="${M(hs)}" height="${M(hs)}" style="pointer-events:all;cursor:crosshair;stroke-width:${M(1.5 / pv.s)}px"/>`;
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    s += `<text class="seldim mono" x="${X((w.a[0] + w.b[0]) / 2)}" y="${Y((w.a[1] + w.b[1]) / 2)}" dy="${M(-14 / pv.s)}" text-anchor="middle" style="font-size:${M(12 / pv.s)}px">${WALL_KINDS[w.kind]} ${fmt1(L)} m</text>`;
  }
  return s + '</g>';
}
function planAxes(B) {
  const nx = Math.max(2, Math.round((B.x1 - B.x0) / 6)), nz = Math.max(1, Math.round((B.z1 - B.z0) / 8));
  const xs = Array.from({ length: nx + 1 }, (_, i) => B.x0 + ((B.x1 - B.x0) * i) / nx);
  const zs = Array.from({ length: nz + 1 }, (_, i) => B.z0 + ((B.z1 - B.z0) * i) / nz);
  return { xs, zs };
}
function renderPlan() {
  if (!state) return;
  const B = hallBounds(), K = annoK(), P = outlinePoly(), ent = entryInfo();
  const L = B.x1 - B.x0, Wd = B.z1 - B.z0;
  const mL = 6.2 * K, mT = 6.2 * K, mR = 3 * K, mB = 4 * K, TB = 11.5 * K;
  const sx0 = B.x0 - mL, sz0 = B.z0 - mT, sx1 = B.x1 + mR + TB, sz1 = B.z1 + mB;
  sheetBox = { x0: sx0, z0: sz0, x1: sx1, z1: sz1 };
  const o = [];
  const a = (s) => o.push(s);
  const sw = (m) => M(m * Math.min(K, 1.6));
  const line = (x1, z1, x2, z2, cls) => `<line class="${cls}" x1="${X(x1)}" y1="${Y(z1)}" x2="${X(x2)}" y2="${Y(z2)}"/>`;
  const text = (x, z, s, cls, size, extra = '') => `<text class="${cls}" x="${X(x)}" y="${Y(z)}" style="font-size:${M(size)}px"${extra}>${esc(s)}</text>`;
  a(`<defs>
<pattern id="pz-wood" width="${M(2.4)}" height="${M(0.36)}" patternUnits="userSpaceOnUse"><path d="M0 0H${M(2.4)}M0 ${M(0.18)}H${M(2.4)}M0 0V${M(0.18)}M${M(1.5)} ${M(0.18)}V${M(0.36)}" fill="none" stroke="#B89B74" stroke-width="${M(0.012)}"/></pattern>
<pattern id="pz-tile" width="${M(0.6)}" height="${M(0.6)}" patternUnits="userSpaceOnUse"><path d="M0 0H${M(0.6)}M0 0V${M(0.6)}" fill="none" stroke="#9FB0B8" stroke-width="${M(0.01)}"/></pattern>
<pattern id="pz-mat" width="${M(1)}" height="${M(1)}" patternUnits="userSpaceOnUse"><path d="M0 0H${M(1)}M0 0V${M(1)}" fill="none" stroke="#5C6977" stroke-width="${M(0.016)}"/><circle cx="${M(0.5)}" cy="${M(0.5)}" r="${M(0.03)}" fill="#5C6977"/></pattern>
<pattern id="pz-epoxy" width="${M(0.3)}" height="${M(0.3)}" patternUnits="userSpaceOnUse"><path d="M0 ${M(0.3)}L${M(0.3)} 0" stroke="#968E80" stroke-width="${M(0.01)}"/></pattern>
<pattern id="pz-concrete" width="${M(0.5)}" height="${M(0.5)}" patternUnits="userSpaceOnUse"><circle cx="${M(0.12)}" cy="${M(0.2)}" r="${M(0.015)}" fill="#A79F93"/><circle cx="${M(0.37)}" cy="${M(0.41)}" r="${M(0.012)}" fill="#A79F93"/></pattern>
<pattern id="pz-hall" width="${M(2.4)}" height="${M(0.24)}" patternUnits="userSpaceOnUse"><path d="M0 0H${M(2.4)}M0 0V${M(0.12)}M${M(1.4)} ${M(0.12)}V${M(0.24)}M0 ${M(0.12)}H${M(2.4)}" fill="none" stroke="#DCCFB9" stroke-width="${M(0.01)}"/></pattern>
<filter id="sheet-shadow" x="-5%" y="-5%" width="110%" height="110%"><feDropShadow dx="0" dy="${M(0.12 * K)}" stdDeviation="${M(0.25 * K)}" flood-color="#2a2118" flood-opacity="0.16"/></filter>
</defs>
<style>
.cl{stroke:#2C3E33;stroke-width:${M(0.05)};fill:none}.cnet{stroke:#1F2430;stroke-width:${M(0.07)}}.cpost{fill:#1F2430}
.cf{fill:#6FA57F;fill-opacity:.16;stroke:#2C3E33;stroke-width:${M(0.025)};stroke-dasharray:${M(0.3)} ${M(0.15)}}.cp{fill:#4E9468;fill-opacity:.22;stroke:#1F2430;stroke-width:${M(0.06)}}
.cf-l{fill:none;stroke:#7E8B84;stroke-width:${M(0.02)};stroke-dasharray:${M(0.2)} ${M(0.2)}}.cp-l{fill:none;stroke:#556A5E;stroke-width:${M(0.04)}}
.ctx{font-weight:700;letter-spacing:.08em}.csub{fill:#4A5149!important}
.ff{fill:#FBF8F2;stroke:#3A3631;stroke-width:${M(0.02)}}.fr{fill:#EDE7DC;stroke:#3A3631;stroke-width:${M(0.04)}}.fd{fill:#3A3631}.fl{stroke:#6F685F;stroke-width:${M(0.01)}}.fnet{stroke:#3A3631;stroke-width:${M(0.04)};stroke-dasharray:${M(0.15)} ${M(0.1)}}
.lamp{fill:none;stroke:#8C8478;stroke-width:${M(0.02)};stroke-dasharray:${M(0.12)} ${M(0.08)}}
.zf{fill-opacity:.55}.zb{stroke:#3A3631;stroke-width:${M(0.025)};stroke-dasharray:${M(0.35)} ${M(0.12)} ${M(0.06)} ${M(0.12)}}.g2{stroke:#3B5C6E;stroke-width:${M(0.022)}}
.dleaf{stroke:#3A3631;stroke-width:${M(0.04)}}.darc{fill:none;stroke:#8C8478;stroke-width:${M(0.015)}}
.zn{font-weight:700;letter-spacing:.08em}.ze{fill:#6F685F!important;letter-spacing:.2em}.za{fill:#4A453E!important}
.wall{fill:none;stroke:#1F2430;stroke-width:${M(0.28)};stroke-linejoin:miter}.col{fill:#1F2430}
.axis{stroke:#B4AB9D;stroke-width:${sw(0.015)};stroke-dasharray:${M(0.8)} ${M(0.16)} ${M(0.08)} ${M(0.16)}}
.bub{fill:#F8F4EC;stroke:#1F2430;stroke-width:${sw(0.025)}}.bt{font-weight:600}
.dl{stroke:#3A3631;stroke-width:${sw(0.012)}}.dx{stroke:#B4AB9D;stroke-width:${sw(0.01)}}.dt{stroke:#1F2430;stroke-width:${sw(0.03)}}.dim{fill:#3A3631!important}
.tb{fill:none;stroke:#1F2430;stroke-width:${sw(0.03)}}.tbl{stroke:#B4AB9D;stroke-width:${sw(0.012)}}.tk{fill:#6F685F!important;letter-spacing:.14em}.tn{fill:#3A3631!important}
.selbox{fill:none;stroke:#C4552A;stroke-width:${M(2 / pv.s)};stroke-dasharray:${M(6 / pv.s)} ${M(4 / pv.s)}}.seldim{fill:#C4552A!important;font-weight:600}
.rubber{fill:#C4552A;fill-opacity:.08;stroke:#C4552A;stroke-width:${M(1.5 / pv.s)};stroke-dasharray:${M(5 / pv.s)} ${M(3 / pv.s)}}
.door2{fill:#F8F4EC;stroke:#1F2430;stroke-width:${M(0.02)}}.arrow{fill:#1F2430}
</style>`);
  // 紙
  a(`<rect x="${X(sx0)}" y="${Y(sz0)}" width="${M(sx1 - sx0)}" height="${M(sz1 - sz0)}" fill="#F8F4EC" filter="url(#sheet-shadow)"/>`);
  a(`<rect class="tb" x="${X(sx0 + 0.6 * K)}" y="${Y(sz0 + 0.6 * K)}" width="${M(sx1 - sx0 - 1.2 * K)}" height="${M(sz1 - sz0 - 1.2 * K)}" style="stroke-width:${sw(0.015)}"/>`);
  // 地坪（館內木地板紋）
  a(`<polygon points="${P.map(PT).join(' ')}" fill="#F3EADB"/><polygon points="${P.map(PT).join(' ')}" fill="url(#pz-hall)"/>`);
  // 軸線
  const { xs, zs } = planAxes(B);
  for (const gx of xs) a(line(gx, B.z0 - 4.2 * K, gx, B.z1 + 1.2 * K, 'axis'));
  for (const gz of zs) a(line(B.x0 - 4.2 * K, gz, B.x1 + 1.2 * K, gz, 'axis'));
  // 區域、球場、家具
  // 整片地板在最底層，球場畫在它上面，其他區域再蓋上來
  for (const z of zonesInOrder()) if (z.type === 'floor') a(zoneSvg(z, z.id === selZoneId));
  for (const it of state.items) if (CAT[it.type].court) a(planHide && planHide.has(it.id) ? courtSvg(it, false).replace('<g class="court"', '<g class="court ghost"') : courtSvg(it, isSel(it.id)));
  for (const z of zonesInOrder()) if (z.type !== 'floor') a(zoneSvg(z, z.id === selZoneId));
  for (const z of zonesInOrder()) if (!z.bare) zoneFixtures(z).forEach((f, i) => a(ghostSvg(f, z.id, i)));
  for (const it of state.items) if (planItem(it) && !CAT[it.type].court) a(itemSvg(it, isSel(it.id)));
  for (const z of zonesInOrder()) if (z.type !== 'floor' || z.id === selZoneId) a(zoneLabelSvg(z, z.id === selZoneId));
  a(rotGuideSvg());
  for (const w of state.walls || []) a(wallSvg(w, w.id === selWallId));
  if (planDrag && planDrag.kind === 'wdraw' && planDrag.b) a(wallSvg({ id: 'tmp', a: planDrag.a, b: planDrag.b, kind: wallKind }, true));
  if (planDrag && planDrag.kind === 'box' && planDrag.r) { const r = planDrag.r; a(`<rect class="boxsel" x="${X(r.x0)}" y="${Y(r.z0)}" width="${M(r.x1 - r.x0)}" height="${M(r.z1 - r.z0)}"/>`); }
  for (const it of state.items) if (it.type === 'light') { const { w, d } = sizeOf(it); a(`<rect class="lamp" transform="translate(${X(it.x)} ${Y(it.z)}) rotate(${-it.rot})" x="${M(-w / 2)}" y="${M(-d / 2)}" width="${M(w)}" height="${M(d)}"/>`); }
  // 外牆（入口留門洞，畫兩片滑門）
  const ex = ent.e;
  a(`<path class="wall" d="${(() => {
    const E = edgesOf(P); let d = '';
    for (const e of E) {
      const off = 0.14, ox = e.nx * off, oz = e.nz * off;
      if (sameEdge(e, ex)) {
        d += `M${PT([e.a[0] + ox, e.a[1] + oz])}L${PT([e.a[0] + e.dx * (ent.t - ent.w / 2) + ox, e.a[1] + e.dz * (ent.t - ent.w / 2) + oz])}`;
        d += `M${PT([e.a[0] + e.dx * (ent.t + ent.w / 2) + ox, e.a[1] + e.dz * (ent.t + ent.w / 2) + oz])}L${PT([e.b[0] + ox, e.b[1] + oz])}`;
      } else d += `M${PT([e.a[0] + ox, e.a[1] + oz])}L${PT([e.b[0] + ox, e.b[1] + oz])}`;
    }
    return d;
  })()}" style="stroke-linecap:square"/>`);
  for (const s of [-1, 1]) {
    const c0 = ent.t + s * ent.w / 2, c1 = ent.t + s * ent.w * 0.05;
    const off = 0.14 + s * 0.05;
    const p0 = [ex.a[0] + ex.dx * c0 + ex.nx * off, ex.a[1] + ex.dz * c0 + ex.nz * off], p1 = [ex.a[0] + ex.dx * c1 + ex.nx * off, ex.a[1] + ex.dz * c1 + ex.nz * off];
    a(`<line x1="${X(p0[0])}" y1="${Y(p0[1])}" x2="${X(p1[0])}" y2="${Y(p1[1])}" stroke="#1F2430" stroke-width="${M(0.05)}"/>`);
  }
  for (const [cx, cz] of columnPoints()) a(`<rect class="col" x="${X(cx - 0.22)}" y="${Y(cz - 0.22)}" width="${M(0.44)}" height="${M(0.44)}"/>`);
  // 主入口箭頭
  {
    const tipx = ent.x + ent.nx * 0.6, tipz = ent.z + ent.nz * 0.6, bx = ent.x + ent.nx * 1.5 * K, bz = ent.z + ent.nz * 1.5 * K, px = -ent.nz, pz = ent.nx, hw = 0.35 * K;
    a(`<polygon class="arrow" points="${PT([tipx, tipz])} ${PT([bx + px * hw, bz + pz * hw])} ${PT([bx - px * hw, bz - pz * hw])}"/>`);
    a(text(bx + ent.nx * 0.2 * K + px * (hw + 0.3 * K), bz + ent.nz * 0.2 * K + pz * (hw + 0.3 * K) + 0.15 * K, '主入口', 'tn', 0.42 * K));
  }
  // 軸線圓圈、尺寸線
  const R = 0.55 * K;
  xs.forEach((gx, i) => { a(`<circle class="bub" cx="${X(gx)}" cy="${Y(B.z0 - 4.9 * K)}" r="${M(R)}"/>`); a(text(gx, B.z0 - 4.9 * K, String(i + 1), 'bt mono', 0.5 * K, ' text-anchor="middle" dominant-baseline="central"')); });
  zs.forEach((gz, i) => { a(`<circle class="bub" cx="${X(B.x0 - 4.9 * K)}" cy="${Y(gz)}" r="${M(R)}"/>`); a(text(B.x0 - 4.9 * K, gz, String.fromCharCode(65 + i), 'bt mono', 0.5 * K, ' text-anchor="middle" dominant-baseline="central"')); });
  const tick = (x, z) => line(x - 0.14 * K, z + 0.14 * K, x + 0.14 * K, z - 0.14 * K, 'dt');
  const dimH = (arr, z) => { a(line(arr[0] - 0.4 * K, z, arr[arr.length - 1] + 0.4 * K, z, 'dl')); for (const x of arr) a(tick(x, z)); for (let i = 0; i < arr.length - 1; i++) a(text((arr[i] + arr[i + 1]) / 2, z - 0.18 * K, (arr[i + 1] - arr[i]).toFixed(2), 'dim mono', 0.34 * K, ' text-anchor="middle"')); };
  const dimV = (arr, x) => { a(line(x, arr[0] - 0.4 * K, x, arr[arr.length - 1] + 0.4 * K, 'dl')); for (const z of arr) a(tick(x, z)); for (let i = 0; i < arr.length - 1; i++) { const zc = (arr[i] + arr[i + 1]) / 2; a(`<text class="dim mono" x="${X(x - 0.18 * K)}" y="${Y(zc)}" text-anchor="middle" transform="rotate(-90 ${X(x - 0.18 * K)} ${Y(zc)})" style="font-size:${M(0.34 * K)}px">${(arr[i + 1] - arr[i]).toFixed(2)}</text>`); } };
  for (const gx of xs) a(line(gx, B.z0 - 0.4 * K, gx, B.z0 - 3.6 * K, 'dx'));
  for (const gz of zs) a(line(B.x0 - 0.4 * K, gz, B.x0 - 3.6 * K, gz, 'dx'));
  dimH(xs, B.z0 - 2.0 * K); dimH([B.x0, B.x1], B.z0 - 3.2 * K);
  dimV(zs, B.x0 - 2.0 * K); dimV([B.z0, B.z1], B.x0 - 3.2 * K);
  // 圖框欄
  a(titleBlock(B.x1 + mR, sz0 + 0.6 * K, sx1 - 0.6 * K, sz1 - 0.6 * K, K, text, line, sw));
  // 拖拉中的新區域
  if (planDrag && planDrag.kind === 'draw' && planDrag.r) { const r = planDrag.r; a(`<rect class="rubber" x="${X(r.x0)}" y="${Y(r.z0)}" width="${M(r.x1 - r.x0)}" height="${M(r.z1 - r.z0)}"/>`); a(`<text class="seldim mono" x="${X((r.x0 + r.x1) / 2)}" y="${Y(r.z0 - 10 / pv.s)}" text-anchor="middle" style="font-size:${M(12 / pv.s)}px">${ZONES[drawType].label} ${fmt1(r.x1 - r.x0)} × ${fmt1(r.z1 - r.z0)} m</text>`); }
  svgEl.innerHTML = o.join('');
  renderLayers();
  if (!pv.fitted) fitPlan(); else applyView();
}
function titleBlock(x0, z0, x1, z1, K, text, line, sw) {
  const o = [], a = (s) => o.push(s), cx = x0 + 0.5 * K, w = x1 - x0;
  const site = window.__site, today = new Date();
  const d8 = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  a(`<rect class="tb" x="${X(x0)}" y="${Y(z0)}" width="${M(w)}" height="${M(z1 - z0)}"/>`);
  let z = z0 + 1.1 * K;
  a(text(cx, z, 'HSINCHU VOLLEYBALL', 'bt mono', 0.42 * K, ' style="letter-spacing:.3em"'));
  z += 0.6 * K; a(text(cx, z, "Play One", 'tk', 0.3 * K));
  z += 0.45 * K; a(line(x0, z, x1, z, 'tbl'));
  z += 0.75 * K; a(text(cx, z, (site ? site.name : state.name).slice(0, 18), 'bt', 0.42 * K));
  z += 0.55 * K; a(text(cx, z, site ? `${site.town || ''}${site.road ? '・' + site.road : ''}` : '自由規劃', 'tk', 0.26 * K));
  z += 0.75 * K; a(text(cx, z, '一層平面配置圖', 'bt', 0.5 * K));
  z += 0.45 * K; a(text(cx, z, 'GROUND FLOOR PLAN', 'tk mono', 0.24 * K));
  z += 0.4 * K; a(line(x0, z, x1, z, 'tbl'));
  // 指北＋比例尺
  z += 1.25 * K;
  const nx = x1 - 1.3 * K;
  a(`<g transform="rotate(${-(state.building.north || 0)} ${X(nx)} ${Y(z)})"><circle class="bub" cx="${X(nx)}" cy="${Y(z)}" r="${M(0.62 * K)}"/><polygon points="${X(nx)},${Y(z - 0.52 * K)} ${X(nx - 0.2 * K)},${Y(z + 0.3 * K)} ${X(nx)},${Y(z + 0.15 * K)}" fill="#1F2430"/><polygon points="${X(nx)},${Y(z - 0.52 * K)} ${X(nx + 0.2 * K)},${Y(z + 0.3 * K)} ${X(nx)},${Y(z + 0.15 * K)}" fill="#F8F4EC" stroke="#1F2430" stroke-width="${sw(0.012)}"/>`);
  a(text(nx, z - 0.8 * K, 'N', 'bt mono', 0.3 * K, ' text-anchor="middle"') + '</g>');
  const unit = K > 2 ? 5 : 1, seg = unit * 1;
  for (let i = 0; i < 5; i++) a(`<rect x="${X(cx + i * seg)}" y="${Y(z)}" width="${M(seg)}" height="${M(0.13 * K)}" fill="${i % 2 ? '#F8F4EC' : '#1F2430'}" stroke="#1F2430" stroke-width="${sw(0.01)}"/>`);
  for (const v of [0, 1, 2, 5]) a(text(cx + v * seg, z - 0.16 * K, v === 5 ? `${5 * unit} m` : String(v * unit), 'tk mono', 0.22 * K, ' text-anchor="middle"'));
  a(text(cx, z + 0.6 * K, `比例 1:${Math.round(200 * K / 50) * 50}（示意）`, 'tn', 0.24 * K));
  z += 1.05 * K; a(line(x0, z, x1, z, 'tbl'));
  // 圖例
  z += 0.55 * K; a(text(cx, z, '圖例 LEGEND', 'tk', 0.22 * K));
  const leg = [['wall', '外牆（剖面）'], ['glass', '玻璃隔間'], ['zone', '開放區域邊界'], ['court', '球場線'], ['lamp', 'LED 條燈（上方）'], ['col', '鋼構柱']];
  leg.forEach(([k, lab], i) => {
    const lx = cx + (i % 2) * (w - 1) / 2, lz = z + 0.55 * K + Math.floor(i / 2) * 0.5 * K, bw = 0.8 * K;
    if (k === 'wall') a(`<rect x="${X(lx)}" y="${Y(lz - 0.18 * K)}" width="${M(bw)}" height="${M(0.18 * K)}" fill="#1F2430"/>`);
    if (k === 'glass') a(line(lx, lz - 0.14 * K, lx + bw, lz - 0.14 * K, 'g2') + line(lx, lz - 0.04 * K, lx + bw, lz - 0.04 * K, 'g2'));
    if (k === 'zone') a(line(lx, lz - 0.09 * K, lx + bw, lz - 0.09 * K, 'zb'));
    if (k === 'court') a(`<rect x="${X(lx)}" y="${Y(lz - 0.2 * K)}" width="${M(bw)}" height="${M(0.22 * K)}" fill="#4E9468" fill-opacity=".25" stroke="#1F2430" stroke-width="${M(0.04)}"/>`);
    if (k === 'lamp') a(`<rect class="lamp" x="${X(lx)}" y="${Y(lz - 0.15 * K)}" width="${M(bw)}" height="${M(0.12 * K)}"/>`);
    if (k === 'col') a(`<rect class="col" x="${X(lx + 0.25 * K)}" y="${Y(lz - 0.22 * K)}" width="${M(0.25 * K)}" height="${M(0.25 * K)}"/>`);
    a(text(lx + bw + 0.25 * K, lz, lab, 'tn', 0.24 * K));
  });
  z += 0.55 * K + Math.ceil(leg.length / 2) * 0.5 * K + 0.1 * K; a(line(x0, z, x1, z, 'tbl'));
  // 面積表
  z += 0.55 * K; a(text(cx, z, '面積表 AREA SCHEDULE', 'tk', 0.22 * K));
  z += 0.45 * K;
  const cA = x1 - 2.2 * K, cP = x1 - 0.5 * K;
  a(text(cx, z, '#', 'tk mono', 0.2 * K)); a(text(cx + 0.7 * K, z, '空間', 'tk', 0.2 * K)); a(text(cA, z, 'm²', 'tk mono', 0.2 * K, ' text-anchor="end"')); a(text(cP, z, '坪', 'tk mono', 0.2 * K, ' text-anchor="end"'));
  z += 0.15 * K; a(line(cx, z, x1 - 0.4 * K, z, 'tbl'));
  const rows = [];
  state.items.filter((i) => CAT[i.type].court && i.mode !== 'lines').forEach((c) => rows.push([labelOf(c), CAT[c.type].w * CAT[c.type].d]));
  state.zones.forEach((zz) => rows.push([zoneName(zz), zz.w * zz.d]));
  const maxRows = Math.max(3, Math.floor((z1 - 2.6 * K - z - 1.2 * K) / (0.38 * K)));
  let tot = 0;
  rows.forEach(([n, ar], i) => { tot += ar; if (i >= maxRows) return; z += 0.38 * K; a(text(cx, z, String(i + 1).padStart(2, '0'), 'tn mono', 0.22 * K)); a(text(cx + 0.7 * K, z, n.slice(0, 10), 'tn', 0.24 * K)); a(text(cA, z, fmt1(ar), 'tn mono', 0.22 * K, ' text-anchor="end"')); a(text(cP, z, fmt1(ar / PING), 'tn mono', 0.22 * K, ' text-anchor="end"')); });
  if (rows.length > maxRows) { z += 0.38 * K; a(text(cx + 0.7 * K, z, `…另 ${rows.length - maxRows} 項`, 'tk', 0.22 * K)); }
  z += 0.2 * K; a(line(cx, z, x1 - 0.4 * K, z, 'tbl'));
  const hall = Math.abs(polyArea(outlinePoly()));
  z += 0.42 * K; a(text(cx + 0.7 * K, z, '已規劃合計', 'tn', 0.24 * K)); a(text(cA, z, fmt1(tot), 'tn mono', 0.22 * K, ' text-anchor="end"')); a(text(cP, z, fmt1(tot / PING), 'tn mono', 0.22 * K, ' text-anchor="end"'));
  z += 0.4 * K; a(text(cx + 0.7 * K, z, '建物面積', 'tn', 0.24 * K)); a(text(cA, z, fmt1(hall), 'tn mono', 0.22 * K, ' text-anchor="end"')); a(text(cP, z, fmt1(hall / PING), 'tn mono', 0.22 * K, ' text-anchor="end"'));
  // 底部資訊格
  const fz = z1 - 2.2 * K, mid = (x0 + x1) / 2;
  a(line(x0, fz, x1, fz, 'tbl')); a(line(mid, fz, mid, z1 - 0.9 * K, 'tbl')); a(line(x0, z1 - 0.9 * K, x1, z1 - 0.9 * K, 'tbl'));
  a(text(cx, fz + 0.45 * K, '圖號 SHEET', 'tk', 0.2 * K)); a(text(cx, fz + 1.05 * K, 'A-101', 'bt mono', 0.42 * K));
  a(text(mid + 0.4 * K, fz + 0.45 * K, '日期 DATE', 'tk', 0.2 * K)); a(text(mid + 0.4 * K, fz + 1.05 * K, d8, 'tn mono', 0.26 * K));
  a(text(cx, z1 - 0.38 * K, `淨高 ${fmt1(state.building.H)} m · 規劃示意，施工以實測為準`, 'tk', 0.2 * K));
  return o.join('');
}

// ---------------------------------------------------------------- plan pointer interaction
function hitAt(e) {
  const t = e.target;
  const h = t.closest && t.closest('[data-h]');
  if (h && h.dataset.hw) return { kind: 'whandle', h: h.dataset.h, id: h.dataset.hw };
  if (h && h.dataset.hi) return { kind: 'irot', id: h.dataset.hi };
  if (h && h.dataset.h === 'rot') return { kind: 'zrot', id: h.dataset.hz };
  if (h) return { kind: 'handle', h: h.dataset.h, id: h.dataset.hz };
  const wl = t.closest && t.closest('[data-w]'); if (wl && wl.dataset.w !== 'tmp') return { kind: 'wall', id: wl.dataset.w };
  const zf = t.closest && t.closest('[data-zf]'); if (zf) return { kind: 'zfix', id: zf.dataset.zf };
  const zi = t.closest && t.closest('[data-i]'); if (zi) return { kind: 'item', id: zi.dataset.i };
  const zz = t.closest && t.closest('[data-z]'); if (zz) return { kind: 'zone', id: zz.dataset.z };
  return null;
}
let selWallId = null, wallKind = 'solid';
function wallMagnets(selfId) {
  const xs = [], zs = []; for (const q of outlinePoly()) { xs.push(q[0]); zs.push(q[1]); }
  for (const z of state.zones) { const r = norm360(z.rot || 0); if (Math.abs(r % 90) > 0.01 && Math.abs(r % 90) < 89.99) continue; const sw = Math.round(r / 90) % 2 === 1, hw = (sw ? z.d : z.w) / 2, hd = (sw ? z.w : z.d) / 2; xs.push(z.x - hw, z.x + hw); zs.push(z.z - hd, z.z + hd); }
  for (const w of state.walls || []) if (w.id !== selfId) for (const q of [w.a, w.b]) { xs.push(q[0]); zs.push(q[1]); }
  return { xs, zs };
}
// v 附近 tol 內有吸附線就貼上去（回傳那條線的值），沒有回 null
function magSnap(v, arr, tol) { let best = null; for (const c of arr) { const d = Math.abs(c - v); if (d <= tol && (best == null || d < Math.abs(best - v))) best = c; } return best; }
// 拖牆時的位置：先貼齊附近的線，沒有就照格點；按住 Shift＝1 cm 微調、不吸
function wallPt(v, arr, e) { if (e.shiftKey) return Math.round(v * 100) / 100; const m = magSnap(v, arr, 8 / pv.s); return m != null ? Math.round(m * 1000) / 1000 : snapP(v); }
// ---- 圖層（平面圖右側）：列出所有球場，上面的疊在上層；點一下選取、眼睛暫時藏起來、▲▼ 換上下層、鎖頭鎖定
function courtsTopFirst() { return state.items.filter((i) => CAT[i.type].court).reverse(); }
function planCycle(w) {
  const under = courtsTopFirst().filter((c) => { if (planHide.has(c.id)) return false; const [lx, lz] = toLocalOf(c, w[0], w[1]); return Math.abs(lx) <= CAT[c.type].w / 2 && Math.abs(lz) <= CAT[c.type].d / 2; });
  if (under.length < 2) return;
  const i = under.findIndex((c) => c.id === selectedId), next = under[(i + 1) % under.length];
  selectPlanItem(next.id); toast(`選到下一層：${labelOf(next)}${next.mode === 'lines' ? '（畫線）' : ''}　再點一下換下一層`);
}
function renderLayers() {
  const box = $('layers'); if (!box || !planHide) return;
  const list = courtsTopFirst();
  box.hidden = list.length < 2;
  if (box.hidden) return;
  const sw = (c) => { const k = CAT[c.type].court, col = { vb: '#4E9468', bd: '#3C8A63', pb: '#2F6F86', bk: '#B5763E' }[k]; return c.mode === 'lines' ? `border:2px solid ${EXTRA_COL[k] === '#FFFFFF' ? '#9AA4B2' : EXTRA_COL[k]};background:transparent` : `background:${col}`; };
  $('ly-list').innerHTML = list.map((c, i) => {
    const k = CAT[c.type].court, ex = (c.extra || []).map((q) => SPORT[q]).join('、'), hid = planHide.has(c.id);
    return `<div class="ly-row${isSel(c.id) ? ' on' : ''}${hid ? ' off' : ''}" data-ly="${c.id}">
      <button type="button" class="ly-eye" data-lyact="eye" aria-pressed="${!hid}" title="${hid ? '在平面圖上顯示' : '在平面圖上暫時藏起來（方便點到下面的東西）'}">${hid ? '◌' : '●'}</button>
      <i class="ly-sw" style="${sw(c)}"></i>
      <span class="ly-n">${esc(labelOf(c))}<small>${SPORT[k]}${c.mode === 'lines' ? '・只畫線' : ''}${ex ? `＋${esc(ex)}線` : ''}${c.use ? `・架${c.use === 'none' ? '：收起來' : SPORT[c.use] + '網'}` : ''}</small></span>
      <button type="button" data-lyact="up" title="往上一層"${i === 0 ? ' disabled' : ''}>▲</button><button type="button" data-lyact="down" title="往下一層"${i === list.length - 1 ? ' disabled' : ''}>▼</button>
      <button type="button" data-lyact="lock" aria-pressed="${!!c.locked}" title="${c.locked ? '解除鎖定' : '鎖定（不會被拖到）'}">${c.locked ? '🔒' : '🔓'}</button></div>`;
  }).join('');
}
$('layers').addEventListener('click', (e) => {
  if (e.target.closest('#ly-fold')) { $('layers').classList.toggle('fold'); return; }
  const row = e.target.closest('[data-ly]'); if (!row) return;
  const it = state.items.find((i) => i.id === row.dataset.ly); if (!it) return;
  const act = e.target.closest('[data-lyact]') && e.target.closest('[data-lyact]').dataset.lyact;
  if (act === 'eye') { if (planHide.has(it.id)) planHide.delete(it.id); else { planHide.add(it.id); if (isSel(it.id)) select(null); } renderPlan(); renderZoneSel(); return; }
  if (act === 'lock') { pushHistory(); if (it.locked) delete it.locked; else it.locked = true; commit(); renderZoneSel(); return; }
  if (act === 'up' || act === 'down') {
    // 換上下層：跟上一個／下一個球場交換在清單裡的順序（畫的順序＝疊的順序，3D 也一樣）
    const idx = state.items.indexOf(it), courts = state.items.map((q, i) => [q, i]).filter(([q]) => CAT[q.type].court), ci = courts.findIndex(([q]) => q === it), other = courts[ci + (act === 'up' ? 1 : -1)];
    if (!other) return;
    pushHistory(); state.items[idx] = other[0]; state.items[other[1]] = it; planChanged(); return;
  }
  planHide.delete(it.id); selZoneId = null; selWallId = null; selectPlanItem(it.id);
});
function selectZone(id) { selZoneId = id; if (id) { selWallId = null; selectedId = null; updateOutline(); renderSelection(); } renderPlan(); renderZoneSel(); renderZoneTable(); planToolState(); }
function selectWall(id) { selWallId = id; if (id) { selZoneId = null; selectedId = null; updateOutline(); renderSelection(); } renderPlan(); renderZoneSel(); planToolState(); }
function selectPlanItem(id) { selZoneId = null; selWallId = null; select(id); renderPlan(); renderZoneSel(); renderZoneTable(); planToolState(); }
function planToolState() {
  { const P = state.building.poly; $('p-align').hidden = !(P && Math.abs(alignPoly(P).deg) >= 0.5); $('p-ortho').hidden = !needsOrtho(P); }
  const it = state.items.find((x) => x.id === selectedId);
  $('p-rot').disabled = !it || (!!it.locked && selItems().length < 2);
  $('p-del').disabled = !(selZoneId || selWallId || (it && (!it.locked || selItems().length > 1)));
  setPressed($('p-select'), planTool === 'select'); setPressed($('p-draw'), planTool === 'draw'); setPressed($('p-entry'), planTool === 'entry'); setPressed($('p-box'), planTool === 'box'); setPressed($('p-wall'), planTool === 'wall');
  svgEl.classList.toggle('drawing', planTool === 'draw' || planTool === 'entry' || planTool === 'wall' || planTool === 'box');
  const badge = $('draw-badge');
  badge.hidden = !['draw', 'entry', 'wall'].includes(planTool);
  if (planTool === 'wall') badge.innerHTML = `從起點拖到終點畫一道${WALL_KINDS[wallKind]}（自動對齊水平／垂直，按住 Alt 可斜畫）${Object.entries(WALL_KINDS).map(([k, l]) => `<button type="button" data-wk="${k}"${k === wallKind ? ' style="background:var(--accent);color:var(--accent-ink)"' : ''}>${l.replace(/（.*）/, '')}</button>`).join('')}<button type="button" id="draw-cancel">完成</button>`;
  if (planTool === 'draw') badge.innerHTML = `在圖上拖出「${esc(ZONES[drawType].label)}」的範圍<button type="button" id="draw-cancel">取消</button>`;
  if (planTool === 'entry') badge.innerHTML = `點外牆上要開主入口的位置${state.building.entry ? '<button type="button" id="entry-auto">自動</button>' : ''}<button type="button" id="draw-cancel">取消</button>`;
  for (const b of document.querySelectorAll('#zone-palette button')) setPressed(b, planTool === 'draw' && b.dataset.zt === drawType);
}
function setPlanTool(t, type) { planTool = t; if (type) drawType = type; planToolState(); }
svgEl.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  svgEl.setPointerCapture(e.pointerId);
  if (pointers.size === 2) { const [p1, p2] = [...pointers.values()]; planDrag = { kind: 'pinch', d0: Math.hypot(p1.x - p2.x, p1.y - p2.y), s0: pv.s, mid: [(p1.x + p2.x) / 2, (p1.y + p2.y) / 2] }; return; }
  if (pointers.size > 2) return;
  const w = toWorld(e), hit = hitAt(e);
  const base = { sx: e.clientX, sy: e.clientY, w0: w, moved: false };
  if (e.button === 1 || e.button === 2) { planDrag = { ...base, kind: 'pan', ox: pv.ox, oz: pv.oz }; return; }
  if (planTool === 'entry') {
    pushHistory(); state.building.entry = [f2(w[0]), f2(w[1])]; setPlanTool('select'); planChanged();
    toast('主入口改到這面牆上了；要改回自動判斷，再按一次「設定入口」然後點「自動」'); return;
  }
  if (planTool === 'draw' && (!hit || hit.kind !== 'handle')) { planDrag = { ...base, kind: 'draw', r: null }; return; }
  if (planTool === 'wall' && (!hit || hit.kind !== 'whandle')) { const mg = wallMagnets(null); planDrag = { ...base, kind: 'wdraw', a: [wallPt(w[0], mg.xs, e), wallPt(w[1], mg.zs, e)], b: null, mg }; return; }
  if (hit && hit.kind === 'whandle') {
    const wl = state.walls.find((x) => x.id === hit.id); if (!wl) return;
    planDrag = { ...base, kind: 'wend', end: hit.h === 'wa' ? 'a' : 'b', id: wl.id, mg: wallMagnets(wl.id) }; return;
  }
  if (hit && hit.kind === 'wall') {
    const wl = state.walls.find((x) => x.id === hit.id); if (!wl) return;
    if (selWallId !== hit.id) selectWall(hit.id);
    planDrag = { ...base, kind: 'wmove', id: wl.id, orig: { a: wl.a.slice(), b: wl.b.slice() }, mg: wallMagnets(wl.id) }; return;
  }
  // 框選：「框選」工具在哪裡拖都是框；按住 Shift 從空白、區域或球場上拖也是框（Shift 點一般物件＝加選）
  const onCourt = hit && hit.kind === 'item' && state.items.some((i) => i.id === hit.id && CAT[i.type].court);
  if ((planTool === 'box' && (!hit || ['zone', 'zfix', 'item'].includes(hit.kind))) || (e.shiftKey && (!hit || hit.kind === 'zone' || hit.kind === 'zfix' || onCourt))) { planDrag = { ...base, kind: 'box', add: e.shiftKey, r: null }; return; }
  if (hit && hit.kind === 'zfix') {
    const [zid, i] = hit.id.split(':'), ids = zoneToItems(zid), it = state.items.find((x) => x.id === ids[Number(i)]);
    if (it) { selectPlanItem(it.id); planDrag = { ...base, kind: 'imove', id: it.id, orig: { x: it.x, z: it.z } }; }
    return;
  }
  if (hit && hit.kind === 'zrot') { const z = state.zones.find((x) => x.id === hit.id); planDrag = { ...base, kind: 'zrot', id: hit.id, orig: z ? { ...z } : null, carry: z ? zoneCarry(z) : null }; return; }
  if (hit && hit.kind === 'irot') { planDrag = { ...base, kind: hit.kind, id: hit.id }; return; }
  if (hit && hit.kind === 'handle') {
    const z = state.zones.find((x) => x.id === hit.id); if (!z) return;
    planDrag = { ...base, kind: 'resize', h: hit.h, id: z.id, orig: { ...z }, snap: JSON.stringify(designData()) };
  } else if (hit && hit.kind === 'zone') {
    const z = state.zones.find((x) => x.id === hit.id);
    if (selZoneId !== hit.id) selectZone(hit.id);
    planDrag = { ...base, kind: 'zmove', id: z.id, orig: { ...z }, carry: zoneCarry(z) };
  } else if (hit && hit.kind === 'item') {
    const it = state.items.find((x) => x.id === hit.id);
    if (e.shiftKey || e.ctrlKey || e.metaKey) { selZoneId = null; selWallId = null; toggleSel(hit.id); planDrag = { ...base, kind: 'none' }; return; }
    if (isSel(hit.id) && selItems().length > 1) { planDrag = { ...base, kind: 'gmove', id: hit.id, orig: { x: it.x, z: it.z }, group: selItems().filter((i) => !i.locked).map((i) => ({ it: i, x: i.x, z: i.z })) }; return; }
    // 已經選了一面被壓在下面的球場、又點在它範圍裡：保持選它（拖曳也是拖它），放開時換到再下一層
    const cur = selectedId && state.items.find((x) => x.id === selectedId), inCur = (q) => { const [lx, lz] = toLocalOf(q, w[0], w[1]); return Math.abs(lx) <= CAT[q.type].w / 2 && Math.abs(lz) <= CAT[q.type].d / 2; };
    const keep = !!(cur && cur.id !== hit.id && it && CAT[it.type].court && CAT[cur.type].court && inCur(cur));
    const wasSel = selectedId === hit.id || keep, tgt = keep ? cur : it;
    if (!wasSel) selectPlanItem(hit.id);
    planDrag = { ...base, kind: tgt && tgt.locked ? 'locked' : 'imove', id: tgt ? tgt.id : hit.id, orig: tgt ? { x: tgt.x, z: tgt.z } : null, wasSel };
  } else if (e.shiftKey || planTool === 'box') planDrag = { ...base, kind: 'box', add: e.shiftKey, r: null };
  else planDrag = { ...base, kind: 'pan', ox: pv.ox, oz: pv.oz, empty: true };
  if (planDrag && planDrag.kind === 'pan' && selWallId) { selWallId = null; renderPlan(); renderZoneSel(); planToolState(); }
});
svgEl.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!planDrag) return;
  if (planDrag.kind === 'pinch') {
    if (pointers.size < 2) return;
    const [p1, p2] = [...pointers.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    zoomAt((planDrag.s0 * d / planDrag.d0) / pv.s, planDrag.mid[0], planDrag.mid[1]); return;
  }
  if (Math.hypot(e.clientX - planDrag.sx, e.clientY - planDrag.sy) > 3) planDrag.moved = true;
  if (!planDrag.moved) return;
  const w = toWorld(e), dx = w[0] - planDrag.w0[0], dz = w[1] - planDrag.w0[1];
  if (planDrag.kind === 'pan') { pv.ox = planDrag.ox - (e.clientX - planDrag.sx) / pv.s; pv.oz = planDrag.oz - (e.clientY - planDrag.sy) / pv.s; svgEl.classList.add('panning'); applyView(); return; }
  if (planDrag.kind === 'draw') {
    const x0 = snapP(Math.min(planDrag.w0[0], w[0])), x1 = snapP(Math.max(planDrag.w0[0], w[0])), z0 = snapP(Math.min(planDrag.w0[1], w[1])), z1 = snapP(Math.max(planDrag.w0[1], w[1]));
    planDrag.r = { x0, x1, z0, z1 }; renderPlan(); return;
  }
  if (planDrag.kind === 'locked') return;
  if (planDrag.kind === 'wdraw' || planDrag.kind === 'wend') {
    const fixed = planDrag.kind === 'wdraw' ? planDrag.a : (() => { const wl = state.walls.find((x) => x.id === planDrag.id); return wl[planDrag.end === 'a' ? 'b' : 'a']; })();
    let px = wallPt(w[0], planDrag.mg.xs, e), pz = wallPt(w[1], planDrag.mg.zs, e);
    if (!e.altKey) { if (Math.abs(px - fixed[0]) >= Math.abs(pz - fixed[1])) pz = fixed[1]; else px = fixed[0]; }
    if (planDrag.kind === 'wdraw') planDrag.b = [px, pz];
    else { const wl = state.walls.find((x) => x.id === planDrag.id); if (!planDrag.pushed) { pushHistory(); planDrag.pushed = true; } wl[planDrag.end] = [px, pz]; }
    renderPlan(); return;
  }
  if (planDrag.kind === 'wmove') {
    const wl = state.walls.find((x) => x.id === planDrag.id); if (!wl) return;
    if (!planDrag.pushed) { pushHistory(); planDrag.pushed = true; }
    // 整道牆移動：兩端任一端靠近吸附線就整道貼過去；Shift＝1 cm 微調
    const o = planDrag.orig, tol = 8 / pv.s, fit = (d, i, arr) => { if (e.shiftKey) return Math.round(d * 100) / 100; let best = null; for (const q of [o.a, o.b]) { const m = magSnap(q[i] + d, arr, tol); if (m != null && (best == null || Math.abs(m - q[i] - d) < Math.abs(best - d))) best = m - q[i]; } return best != null ? Math.round(best * 1000) / 1000 : snapP(d); };
    const ddx = fit(dx, 0, planDrag.mg.xs), ddz = fit(dz, 1, planDrag.mg.zs);
    wl.a = [planDrag.orig.a[0] + ddx, planDrag.orig.a[1] + ddz]; wl.b = [planDrag.orig.b[0] + ddx, planDrag.orig.b[1] + ddz];
    renderPlan(); return;
  }
  if (planDrag.kind === 'zrot' || planDrag.kind === 'irot') {
    const o = planDrag.kind === 'zrot' ? state.zones.find((x) => x.id === planDrag.id) : state.items.find((x) => x.id === planDrag.id); if (!o) return;
    if (!planDrag.pushed) { pushHistory(); planDrag.pushed = true; }
    const raw = (Math.atan2(-(w[0] - o.x), -(w[1] - o.z)) * 180) / Math.PI;
    const sn = e.shiftKey ? { deg: Math.round(norm360(raw) * 10) / 10, ref: null } : snapRot(raw, o, 3);
    o.rot = sn.deg;
    planDrag.snap = { ref: sn.ref, o };
    if (planDrag.kind === 'irot') moveObj(o); else applyCarry(planDrag.carry, planDrag.orig, o);
    renderPlan(); return;
  }
  if (planDrag.kind === 'zmove') {
    const z = state.zones.find((x) => x.id === planDrag.id); if (!z) return;
    if (!planDrag.pushed) { pushHistory(); planDrag.pushed = true; }
    z.x = snapEdge(planDrag.orig.x + dx, z.w); z.z = snapEdge(planDrag.orig.z + dz, z.d);
    applyCarry(planDrag.carry, planDrag.orig, z);
    renderPlan(); return;
  }
  if (planDrag.kind === 'none') return;
  if (planDrag.kind === 'gmove') {
    if (!planDrag.pushed) { pushHistory(); planDrag.pushed = true; }
    const ddx = snapP(planDrag.orig.x + dx) - planDrag.orig.x, ddz = snapP(planDrag.orig.z + dz) - planDrag.orig.z;
    for (const g of planDrag.group) { g.it.x = f2(g.x + ddx); g.it.z = f2(g.z + ddz); }
    renderPlan(); return;
  }
  if (planDrag.kind === 'box') {
    const a = planDrag.w0; planDrag.r = { x0: Math.min(a[0], w[0]), x1: Math.max(a[0], w[0]), z0: Math.min(a[1], w[1]), z1: Math.max(a[1], w[1]) };
    renderPlan(); return;
  }
  if (planDrag.kind === 'imove') {
    const it = state.items.find((x) => x.id === planDrag.id); if (!it) return;
    if (!planDrag.pushed) { pushHistory(); planDrag.pushed = true; }
    it.x = snapAt(planDrag.orig.x + dx, it); it.z = snapAt(planDrag.orig.z + dz, it);
    renderPlan(); return;
  }
  if (planDrag.kind === 'resize') {
    const z = state.zones.find((x) => x.id === planDrag.id), o = planDrag.orig; if (!z) return;
    if (!planDrag.pushed) { pushHistory(); planDrag.pushed = true; }
    if (o.rot) {
      // 轉過角度的區域：在區域自己的座標裡改大小，尺寸對齊 0.5 m
      const r = (o.rot * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r), ldx = dx * c - dz * sn, ldz = dx * sn + dz * c, h = planDrag.h;
      let l0 = -o.w / 2, l1 = o.w / 2, f0 = -o.d / 2, f1 = o.d / 2;
      if (h.includes('w')) l0 = l1 - Math.max(0.5, snapP(o.w - ldx)); if (h.includes('e')) l1 = l0 + Math.max(0.5, snapP(o.w + ldx));
      if (h.includes('n')) f0 = f1 - Math.max(0.5, snapP(o.d - ldz)); if (h.includes('s')) f1 = f0 + Math.max(0.5, snapP(o.d + ldz));
      const cx = (l0 + l1) / 2, cz = (f0 + f1) / 2;
      z.w = l1 - l0; z.d = f1 - f0; z.x = o.x + cx * c + cz * sn; z.z = o.z - cx * sn + cz * c;
      renderPlan(); return;
    }
    let x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, z0 = o.z - o.d / 2, z1 = o.z + o.d / 2;
    const h = planDrag.h;
    if (h.includes('w')) x0 = Math.min(snapP(x0 + dx), x1 - 0.5);
    if (h.includes('e')) x1 = Math.max(snapP(x1 + dx), x0 + 0.5);
    if (h.includes('n')) z0 = Math.min(snapP(z0 + dz), z1 - 0.5);
    if (h.includes('s')) z1 = Math.max(snapP(z1 + dz), z0 + 0.5);
    z.x = (x0 + x1) / 2; z.z = (z0 + z1) / 2; z.w = x1 - x0; z.d = z1 - z0;
    renderPlan(); return;
  }
});
// 拖曳區域時讓邊緣對齊 0.5 m（而不是中心），寬 3 m 的區域才能貼齊牆邊
function snapEdge(c, size) { const e = snapP(c - size / 2); return e + size / 2; }
function endPlanDrag(e) {
  pointers.delete(e.pointerId);
  svgEl.classList.remove('panning');
  const d = planDrag; if (!d) return;
  if (d.kind === 'pinch') { if (pointers.size < 2) planDrag = null; return; }
  planDrag = null;
  if (d.kind === 'draw') {
    const r = d.r;
    if (r && r.x1 - r.x0 >= 0.9 && r.z1 - r.z0 >= 0.9) {
      pushHistory();
      const z = sanitizeZone({ type: drawType, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, w: r.x1 - r.x0, d: r.z1 - r.z0 });
      state.zones.push(z); setPlanTool('select'); selectZone(z.id); planChanged();
      toast(`已畫好「${ZONES[z.type].label}」${fmt1(z.w * z.d / PING)} 坪；拖角落可以改大小`);
    } else { renderPlan(); if (d.moved) toast('範圍太小了，至少要 1 × 1 m'); }
    return;
  }
  if (d.kind === 'wdraw') {
    if (d.b && Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) >= 0.5) {
      pushHistory(); const wl = sanitizeWall({ a: d.a, b: d.b, kind: wallKind }); state.walls.push(wl); selWallId = wl.id; planChanged(); renderZoneSel(); planToolState();
      toast(`已畫好一道${WALL_KINDS[wl.kind]}，長 ${fmt1(Math.hypot(wl.b[0] - wl.a[0], wl.b[1] - wl.a[1]))} m；可以接著畫下一道，畫完按「完成」`);
    } else renderPlan();
    return;
  }
  if (['wend', 'wmove', 'zrot', 'irot'].includes(d.kind) && d.pushed) { if (d.kind === 'irot') { const it = state.items.find((x) => x.id === d.id); if (it) rerenderOne(it); } planChanged(); renderZoneSel(); return; }
  if (d.kind === 'pan' && d.empty && !d.moved) { if (selZoneId || selectedId) { selZoneId = null; select(null); renderPlan(); renderZoneSel(); renderZoneTable(); planToolState(); } return; }
  if ((d.kind === 'imove' || d.kind === 'locked') && !d.moved && d.wasSel) { planCycle(d.w0); return; }
  if (d.kind === 'locked' && d.moved) { lockedMsg(); return; }
  if ((d.kind === 'zmove' || d.kind === 'imove' || d.kind === 'resize' || d.kind === 'gmove') && d.pushed) planChanged();
  if (d.kind === 'box') {
    const r = d.r;
    if (r && (r.x1 - r.x0 > 0.2 || r.z1 - r.z0 > 0.2)) {
      // 框到的：中心在框裡（球場要整個在框裡）
      const inR = ([x, z]) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
      const got = state.items.filter((i) => planItem(i) && (CAT[i.type].court ? footprint(i).every(inR) : inR([i.x, i.z]))).map((i) => i.id);
      const ids = d.add ? [...new Set([...selItems().map((i) => i.id), ...got])] : got;
      selZoneId = null; selWallId = null;
      setSelection(ids); renderZoneSel(); renderZoneTable(); planToolState();
      toast(ids.length ? `框選了 ${ids.length} 個物件：拖其中一個整組移動，Ctrl+D 複製` : '框裡沒有物件');
    }
    renderPlan();
  }
}
svgEl.addEventListener('pointerup', endPlanDrag);
svgEl.addEventListener('pointercancel', endPlanDrag);
svgEl.addEventListener('contextmenu', (e) => e.preventDefault());
svgEl.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), e.clientX, e.clientY); }, { passive: false });
svgEl.addEventListener('dblclick', (e) => { const hit = hitAt(e); if (hit && hit.kind === 'zone') { const inp = $('zs-name'); if (inp) { inp.focus(); inp.select(); } } });
new ResizeObserver(() => { if (mode === 'plan') { if (!pv.fitted) fitPlan(); else applyView(); } }).observe(planHost);
// 改了平面圖：3D 跟著重建（區域、入口、外牆），左欄的表與估價也更新
function planChanged() { buildBuilding(); buildZones(); renderItems(); commit(); }

// ---------------------------------------------------------------- left rail: zone tools, schedule, selection editor
function renderZonePalette() {
  const box = $('zone-palette'); box.textContent = '';
  for (const [k, Z] of Object.entries(ZONES)) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.zt = k; b.id = 'zt-' + k;
    b.innerHTML = `<b><i class="sw" style="background:${Z.color}"></i>${Z.label}</b><span>${Z.enclosed ? (Z.frosted ? '霧面玻璃隔間' : '玻璃隔間') : '開放空間'}</span>`;
    b.addEventListener('click', () => { if (mode !== 'plan') setMode('plan'); setPlanTool(planTool === 'draw' && drawType === k ? 'select' : 'draw', k); });
    box.appendChild(b);
  }
}
function renderZoneTable() {
  const tb = $('zone-table'); if (!tb || !state) return;
  const hall = Math.abs(polyArea(outlinePoly()));
  const courts = state.items.filter((i) => CAT[i.type].court);
  const solid = courts.filter((c) => c.mode !== 'lines');
  const courtArea = solid.reduce((s, c) => s + CAT[c.type].w * CAT[c.type].d, 0);
  const zoneArea = state.zones.reduce((s, z) => s + z.w * z.d, 0);
  const rows = [];
  for (const c of courts) rows.push(`<tr data-i="${c.id}" class="${c.id === selectedId ? 'on' : ''}"><td><i class="zsw" style="background:${c.mode === 'lines' ? 'transparent' : '#4E9468'}"></i>${esc(labelOf(c))}${c.mode === 'lines' ? '<span class="unit">（畫線）</span>' : ''}</td><td class="n">${c.mode === 'lines' ? '—' : fmt1(CAT[c.type].w * CAT[c.type].d)}</td><td class="n">${c.mode === 'lines' ? '—' : fmt1(CAT[c.type].w * CAT[c.type].d / PING)}</td></tr>`);
  for (const z of state.zones) rows.push(`<tr data-z="${z.id}" class="${z.id === selZoneId ? 'on' : ''}"><td><i class="zsw" style="background:${ZONES[z.type].color}"></i>${esc(zoneName(z))}</td><td class="n">${fmt1(z.w * z.d)}</td><td class="n">${fmt1(z.w * z.d / PING)}</td></tr>`);
  const free = Math.max(0, hall - courtArea - zoneArea);
  tb.innerHTML = `<thead><tr><th>空間</th><th class="n">m²</th><th class="n">坪</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="3" class="unit">還沒有規劃。先在右邊平面圖畫區域，或從範本開始。</td></tr>'}
    <tr><td><i class="zsw" style="background:#F3EADB"></i>走道與其他空地</td><td class="n">${fmt1(free)}</td><td class="n">${fmt1(free / PING)}</td></tr></tbody>
    <tfoot><tr><td>建物面積</td><td class="n">${fmt1(hall)}</td><td class="n">${fmt1(hall / PING)}</td></tr></tfoot>`;
  const st = $('plan-stats');
  const vb = solid.filter((c) => CAT[c.type].court === 'vb').length;
  const used = hall ? Math.min(100, ((courtArea + zoneArea) / hall) * 100) : 0;
  st.innerHTML = [[`${fmt1(hall / PING)} 坪`, '建物面積'], [`${vb} 面`, '排球場'], [`${state.zones.length} 區`, '規劃區域'], [`${Math.round(used)}%`, '已規劃比例']].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
}
$('zone-table').addEventListener('click', (e) => {
  const tr = e.target.closest('tr'); if (!tr) return;
  if (tr.dataset.z) { if (mode !== 'plan') setMode('plan'); selectZone(tr.dataset.z); }
  else if (tr.dataset.i) { if (mode === 'plan') selectPlanItem(tr.dataset.i); else { select(tr.dataset.i); const it = state.items.find((x) => x.id === tr.dataset.i); if (it && mode === '3d') focusOn(it.x, it.z); } }
});
function renderZoneSel() {
  const box = $('zone-sel'); if (!box) return;
  const z = state.zones.find((x) => x.id === selZoneId);
  const it = !z && state.items.find((x) => x.id === selectedId);
  const wl = !z && !it && (state.walls || []).find((x) => x.id === selWallId);
  if (!z && !it && !wl) { box.hidden = true; box.textContent = ''; return; }
  box.hidden = false;
  if (it && selItems().length > 1) {
    box.innerHTML = `<div style="margin-top:6px;padding:12px;border:1px solid var(--hl);border-radius:12px;background:var(--sheet)">${multiPanelHtml(selItems().length, 'ps')}</div>`;
    wireMultiPanel('ps', () => { renderPlan(); renderZoneSel(); planToolState(); });
    return;
  }
  if (wl) {
    const L = Math.hypot(wl.b[0] - wl.a[0], wl.b[1] - wl.a[1]);
    box.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;padding:12px;border:1px solid var(--hl);border-radius:12px;background:var(--sheet)">
      <div class="sel-name">${WALL_KINDS[wl.kind]}<span class="unit">　長 ${fmt1(L)} m</span></div>
      <div class="grid2"><label class="field" for="ws-kind"><span>種類</span><select id="ws-kind">${Object.entries(WALL_KINDS).map(([k, l]) => `<option value="${k}"${k === wl.kind ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field" for="ws-h"><span>高度（m）</span><input id="ws-h" type="number" step="0.1" min="0.5" max="15" value="${f2(wl.h)}"></label></div>
      ${wl.kind === 'solid' || wl.kind === 'half' ? `<label class="field" for="ws-color"><span>牆面顏色</span><input id="ws-color" type="color" value="${wl.color || '#EFEBE4'}"></label>` : ''}
      <div class="grid4">${[['ax', '起點 X'], ['az', '起點 Z'], ['bx', '終點 X'], ['bz', '終點 Z']].map(([k, l]) => `<label class="field" for="ws-${k}"><span>${l}</span><input id="ws-${k}" data-wk="${k}" type="number" step="0.01" value="${f2(wl[k[0]][k[1] === 'x' ? 0 : 1])}" inputmode="decimal"></label>`).join('')}</div>
      <label class="field" for="ws-len"><span>長度（m，從起點往終點方向）</span><input id="ws-len" type="number" step="0.01" min="0.1" value="${f2(L)}" inputmode="decimal"></label>
      <p class="hint">拖中間移動整道牆，拖兩端的方塊改長度與方向（按住 Alt 可以斜拉）。拖的時候會自動貼齊附近的區域邊、外牆和其他牆的端點；按住 Shift 拖＝1 cm 微調不吸。選取後方向鍵移 10 cm、Shift＋方向鍵移 1 cm。</p>
      <div class="btn-row"><button type="button" class="danger" id="ws-del">刪除這道牆</button></div></div>`;
    $('ws-kind').addEventListener('change', (e) => { pushHistory(); wl.kind = e.target.value; if (wl.kind === 'half') wl.h = 1.1; planChanged(); renderZoneSel(); });
    $('ws-h').addEventListener('change', (e) => { const v = Number(e.target.value); if (!Number.isFinite(v)) return; pushHistory(); wl.h = clamp(v, 0.5, 15); planChanged(); renderZoneSel(); });
    $('ws-del').addEventListener('click', deleteWall);
    for (const inp of box.querySelectorAll('input[data-wk]')) inp.addEventListener('change', () => { const v = Number(inp.value); if (!Number.isFinite(v)) return; pushHistory(); const k = inp.dataset.wk; wl[k[0]] = k[1] === 'x' ? [f2(v), wl[k[0]][1]] : [wl[k[0]][0], f2(v)]; planChanged(); renderZoneSel(); });
    $('ws-len').addEventListener('change', (e) => { const v = Number(e.target.value); if (!Number.isFinite(v) || v < 0.1 || L < 1e-6) return; pushHistory(); const ux = (wl.b[0] - wl.a[0]) / L, uz = (wl.b[1] - wl.a[1]) / L; wl.b = [f2(wl.a[0] + ux * v), f2(wl.a[1] + uz * v)]; planChanged(); renderZoneSel(); });
    if ($('ws-color')) $('ws-color').addEventListener('change', (e) => { pushHistory(); wl.color = e.target.value; planChanged(); renderZoneSel(); });
    return;
  }
  if (z) {
    const opts = Object.entries(ZONES).map(([k, Z]) => `<option value="${k}"${k === z.type ? ' selected' : ''}>${Z.label}</option>`).join('');
    box.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;padding:12px;border:1px solid var(--hl);border-radius:12px;background:var(--sheet)">
      <div class="sel-name">${esc(zoneName(z))}<span class="unit">　${fmt1(z.w * z.d)} m²・${fmt1(z.w * z.d / PING)} 坪</span></div>
      <div class="grid2"><label class="field" for="zs-name"><span>名稱</span><input id="zs-name" type="text" maxlength="20" value="${esc(z.name || '')}" placeholder="${esc(ZONES[z.type].label)}"></label>
      <label class="field" for="zs-type"><span>用途</span><select id="zs-type">${opts}</select></label></div>
      <div class="grid4">${[['x', 'X'], ['z', 'Z'], ['w', '寬'], ['d', '深']].map(([k, l]) => `<label class="field" for="zs-${k}"><span>${l}（m）</span><input id="zs-${k}" data-k="${k}" type="number" step="0.5" value="${f2(z[k])}" inputmode="decimal"></label>`).join('')}</div>
      <div class="grid2"><label class="field" for="zs-floor"><span>地坪</span><select id="zs-floor">${ZONE_FLOORS.map((k) => `<option value="${k}"${k === zoneFloor(z) ? ' selected' : ''}>${FLOOR_LABELS[k]}</option>`).join('')}</select></label>
      <label class="field" for="zs-walls"><span>隔間</span><select id="zs-walls">${Object.entries({ open: '開放（不隔間）', glass: '透明玻璃', frost: '霧面玻璃', solid: '實心牆（組合屋）', net: '圍網' }).map(([k, l]) => `<option value="${k}"${k === zoneWalls(z) ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
      ${z.type === 'wc' ? `<label class="field" for="zs-wcl"><span>廁所裡面</span><select id="zs-wcl"><option value=""${!z.wcl ? ' selected' : ''}>自動（小間的沒有隔間、大間的有隔間）</option><option value="open"${z.wcl === 'open' ? ' selected' : ''}>沒有隔間（一間式：馬桶＋洗手台）</option><option value="stalls"${z.wcl === 'stalls' ? ' selected' : ''}>有隔間（一排廁所隔間）</option></select></label>${z.bare ? '<p class="hint">這間的擺設已拆成元件，要套用請先按下面的「恢復自動擺設」。</p>' : ''}` : ''}
      <div class="grid2"><label class="field" for="zs-rot"><span>角度（°）</span><input id="zs-rot" type="number" step="0.1" value="${f2(z.rot || 0)}" inputmode="decimal"></label>
      <div class="field"><span>入口在哪一邊</span><div class="seg" role="group" aria-label="入口">${[['', '自動'], ['n', '上'], ['e', '右'], ['s', '下'], ['w', '左']].map(([k, l]) => `<button type="button" data-door="${k}" aria-pressed="${(z.door || '') === k}">${l}</button>`).join('')}</div></div></div>
      <p class="hint">${esc(z.desc || ZONES[z.type].desc)}　快捷鍵：F 換入口邊、R 轉 90°、Shift+R 對齊外牆；拖選取框上方的圓點可以 360° 轉，靠近外牆角度會自動吸住（按住 Shift 不吸）。</p>
      ${z.type === 'floor' ? '' : z.bare ? `<div class="zs-fix"><b>內部擺設：已拆成 ${state.items.filter((i) => i.zone === z.id).length} 個元件</b><span>在圖上各自拖、轉、改大小、按 Delete 刪；要加東西從素材庫「衛浴與更衣」等分類拿。移動區域時會一起跟著走。</span><button type="button" id="zs-auto">恢復自動擺設</button></div>` : `<div class="zs-fix"><b>內部擺設：自動（跟著區域大小）</b><span>虛線框就是自動擺的東西；直接點其中一個，或按下面的按鈕，就能一個一個調整。</span><button type="button" class="primary" id="zs-split">拆成可調整的元件</button></div>`}
      <div class="btn-row"><button type="button" id="zs-alignw">對齊外牆</button><button type="button" id="zs-dup">複製</button><button type="button" class="danger" id="zs-del">刪除區域</button></div></div>`;
    $('zs-name').addEventListener('change', (e) => { pushHistory(); const v = e.target.value.trim(); if (v) z.name = v.slice(0, 20); else delete z.name; planChanged(); renderZoneSel(); });
    $('zs-type').addEventListener('change', (e) => { pushHistory(); z.type = e.target.value; planChanged(); renderZoneSel(); });
    for (const inp of box.querySelectorAll('input[data-k]')) inp.addEventListener('change', () => { const v = Number(inp.value); if (!Number.isFinite(v)) return; pushHistory(); zoneEdit(z, () => { z[inp.dataset.k] = inp.dataset.k === 'w' || inp.dataset.k === 'd' ? clamp(v, 0.5, 160) : v; }); planChanged(); renderZoneSel(); });
    $('zs-split')?.addEventListener('click', () => zoneToItems(z.id));
    $('zs-auto')?.addEventListener('click', () => zoneAutoAgain(z));
    $('zs-dup').addEventListener('click', duplicateZone);
    $('zs-del').addEventListener('click', deleteZone);
    $('zs-floor').addEventListener('change', (e) => { pushHistory(); z.floor = e.target.value; planChanged(); renderZoneSel(); });
    $('zs-walls').addEventListener('change', (e) => { pushHistory(); z.walls = e.target.value; planChanged(); renderZoneSel(); });
    if ($('zs-wcl')) $('zs-wcl').addEventListener('change', (e) => { pushHistory(); if (e.target.value) z.wcl = e.target.value; else delete z.wcl; planChanged(); renderZoneSel(); });
    $('zs-alignw').addEventListener('click', () => { pushHistory(); zoneEdit(z, () => { z.rot = alignToWall(z); }); planChanged(); renderZoneSel(); toast(`已對齊最近的外牆（${f2(z.rot)}°）`); });
    $('zs-rot').addEventListener('change', (e) => { const v = Number(e.target.value); if (!Number.isFinite(v)) return; pushHistory(); zoneEdit(z, () => { z.rot = ((v % 360) + 360) % 360; }); planChanged(); renderZoneSel(); });
    for (const b of box.querySelectorAll('[data-door]')) b.addEventListener('click', () => { pushHistory(); if (b.dataset.door) z.door = b.dataset.door; else delete z.door; planChanged(); renderZoneSel(); });
  } else {
    const def = CAT[it.type];
    box.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;padding:12px;border:1px solid var(--hl);border-radius:12px;background:var(--sheet)">
      <div class="sel-name">${esc(labelOf(it))}<span class="unit">　${def.court ? `${def.w}×${def.d} m（含緩衝區）` : ''}旋轉 ${it.rot}°</span></div>
      <label class="field" for="is-name"><span>名稱</span><input id="is-name" type="text" maxlength="20" value="${esc(it.label || '')}" placeholder="${esc(def.label)}"></label>
      ${def.court ? `<div class="seg" role="group" aria-label="畫法"><button type="button" data-mode="solid" aria-pressed="${it.mode !== 'lines'}">整片上色</button><button type="button" data-mode="lines" aria-pressed="${it.mode === 'lines'}">只畫線</button></div>${it.mode !== 'lines' ? `<div id="is-comp">${compositeHtml(it, 'ix')}</div><div class="colors" id="is-colors">${courtColorHtml(it)}</div>` : ''}` : ''}
      <div class="grid2"><label class="field" for="is-x"><span>位置 X（m）</span><input id="is-x" type="number" step="0.05" value="${f2(it.x)}"${it.locked ? ' disabled' : ''}></label><label class="field" for="is-z"><span>位置 Y（m）</span><input id="is-z" type="number" step="0.05" value="${f2(it.z)}"${it.locked ? ' disabled' : ''}></label></div>
      <div class="nudge" role="group" aria-label="微調位置"><span>微調</span><button type="button" data-nd="-1,0" aria-label="往左"${it.locked ? ' disabled' : ''}>◀</button><button type="button" data-nd="0,-1" aria-label="往上"${it.locked ? ' disabled' : ''}>▲</button><button type="button" data-nd="0,1" aria-label="往下"${it.locked ? ' disabled' : ''}>▼</button><button type="button" data-nd="1,0" aria-label="往右"${it.locked ? ' disabled' : ''}>▶</button><select id="is-nstep" aria-label="每次移動多少"><option value="0.01">1 cm</option><option value="0.05" selected>5 cm</option><option value="0.1">10 cm</option><option value="0.5">50 cm</option></select></div>
      <label class="field" for="is-rotdeg"><span>角度（°）・拖平面圖上的圓點也能轉</span><input id="is-rotdeg" type="number" step="0.1" value="${f2(it.rot)}"${it.locked ? ' disabled' : ''}></label>
      <div class="btn-row"><button type="button" id="is-lock" class="${it.locked ? 'primary' : ''}">${it.locked ? '解除鎖定' : '鎖定'}</button><button type="button" id="is-rot"${it.locked ? ' disabled' : ''}>旋轉 90°</button><button type="button" id="is-alignw"${it.locked ? ' disabled' : ''}>對齊外牆</button><button type="button" id="is-dup">複製</button><button type="button" class="danger" id="is-del"${it.locked ? ' disabled' : ''}>刪除</button></div>
      ${it.locked ? '<p class="lock-note">已鎖定：不能拖曳、旋轉或刪除。按「解除鎖定」後才能在平面圖上拖。</p>' : ''}</div>`;
    $('is-name').addEventListener('change', (e) => { pushHistory(); const v = e.target.value.trim(); if (v) it.label = v.slice(0, 20); else delete it.label; rerenderOne(it); commit(); renderZoneSel(); });
    if ($('is-colors')) { wireColorPickers($('is-colors'), (k, v) => setCourtColor(it, k, v, renderZoneSel)); reopenPicker($('is-colors')); }
    if ($('is-comp')) wireComposite($('is-comp'), it, 'ix', () => { renderZoneSel(); renderPlan(); });
    for (const b of box.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { pushHistory(); if (b.dataset.mode === 'lines') it.mode = 'lines'; else delete it.mode; renderItems(); commit(); renderZoneSel(); });
    $('is-lock').addEventListener('click', () => { toggleLockSel(); renderZoneSel(); planToolState(); renderPlan(); });
    $('is-rot').addEventListener('click', () => { rotateSel(90); renderPlan(); renderZoneSel(); });
    $('is-alignw').addEventListener('click', () => { alignSelToWall(); renderZoneSel(); });
    $('is-rotdeg').addEventListener('change', (e) => { const v = Number(e.target.value); if (!Number.isFinite(v)) return; pushHistory(); it.rot = ((v % 360) + 360) % 360; rerenderOne(it); updateOutline(); commit(); renderZoneSel(); });
    $('is-dup').addEventListener('click', () => { duplicateSel(); renderPlan(); renderZoneSel(); });
    const place = (x, z) => { it.x = Math.round(x * 100) / 100; it.z = Math.round(z * 100) / 100; moveObj(it); updateOutline(); commit(); $('is-x').value = f2(it.x); $('is-z').value = f2(it.z); };
    for (const k of ['is-x', 'is-z']) $(k).addEventListener('change', () => { const x = Number($('is-x').value), z = Number($('is-z').value); if (!Number.isFinite(x) || !Number.isFinite(z)) return; pushHistory(); place(x, z); });
    try { const ns = localStorage.getItem('vb.nudge'); if (ns) $('is-nstep').value = ns; } catch (er) { /* ignore */ }
    $('is-nstep').addEventListener('change', (e) => { try { localStorage.setItem('vb.nudge', e.target.value); } catch (er) { /* ignore */ } });
    for (const b of box.querySelectorAll('[data-nd]')) b.addEventListener('click', () => { const [ax, az] = b.dataset.nd.split(',').map(Number), st = Number($('is-nstep').value) || 0.05; pushHistory(); place(it.x + ax * st, it.z + az * st); });
    $('is-del').addEventListener('click', () => { deleteSel(); renderPlan(); renderZoneSel(); planToolState(); });
  }
}
// 入口換邊：依序換到下一個不貼外牆的邊
function flipDoor(z) {
  const lay = zoneLayout(z), order = ['n', 'e', 's', 'w'], open = lay.sides.filter((sd) => !sd.onWall).map((sd) => sd.k);
  if (!open.length) { toast('這個區域每一邊都貼著外牆，沒有地方開門'); return; }
  const cur = lay.door ? lay.door.k : null, start = cur ? order.indexOf(cur) : -1;
  let next = null; for (let k = 1; k <= 4; k++) { const c = order[(start + k + 4) % 4]; if (open.includes(c)) { next = c; break; } }
  pushHistory(); z.door = next; planChanged(); renderZoneSel();
  toast(`入口改到${({ n: '上', e: '右', s: '下', w: '左' })[next]}邊`);
}
function deleteWall() {
  const i = (state.walls || []).findIndex((x) => x.id === selWallId); if (i < 0) return;
  pushHistory(); state.walls.splice(i, 1); selWallId = null; planChanged(); renderZoneSel(); renderPlan(); planToolState(); toast('已刪除這道牆，按「復原」可以拿回來');
}
function duplicateZone() {
  const z = state.zones.find((x) => x.id === selZoneId); if (!z) return;
  pushHistory(); const dx = Math.min(z.w, 4) + 0.5, c = { ...z, id: uid(), x: z.x + dx }; delete c.name;
  for (const it of state.items.filter((i) => i.zone === z.id)) state.items.push({ ...it, id: uid(), zone: c.id, x: f2(it.x + dx) });
  state.zones.push(c); selectZone(c.id); planChanged();
}
function deleteZone() {
  const i = state.zones.findIndex((x) => x.id === selZoneId); if (i < 0) return;
  pushHistory(); const [z] = state.zones.splice(i, 1); selZoneId = null; state.items = state.items.filter((it) => it.zone !== z.id); planChanged(); renderZoneSel(); renderPlan(); planToolState();
  toast(`已刪除「${zoneName(z)}」，按「復原」可以拿回來`);
}
// 依空地自動分區：找球場以外最寬的那一條空地（南邊或東邊），由左到右排廁所、更衣淋浴、休息區、接待、器材室、暖身區
function autoZones() {
  const B = hallBounds(), P = outlinePoly();
  const courts = state.items.filter((i) => CAT[i.type].court && i.mode !== 'lines');
  let cz1 = B.z0, cx1 = B.x0;
  for (const c of courts) for (const [x, z] of footprint(c)) { cz1 = Math.max(cz1, z); cx1 = Math.max(cx1, x); }
  if (!courts.length) { cz1 = B.z1 - Math.min(6, (B.z1 - B.z0) * 0.25); }
  const south = { d: B.z1 - cz1, len: B.x1 - B.x0 }, east = { d: B.x1 - cx1, len: B.z1 - B.z0 };
  const useS = south.d * south.len >= east.d * east.len;
  const depth = Math.min(8, useS ? south.d : east.d) - 0.2;
  if (depth < 2.5) return [];
  const len = useS ? south.len : east.len;
  const plan = [['wc', 0.13], ['locker', 0.19], ['rest', 0.27], ['reception', 0.15], ['storage', 0.12], ['warmup', 0.14]];
  const out = []; let t = 0;
  plan.forEach(([type, f], i) => {
    const w = i === plan.length - 1 ? len - t : Math.max(2.5, Math.round(len * f * 2) / 2);
    if (t + w > len + 0.01) return;
    const z = useS ? { type, x: B.x0 + t + w / 2, z: B.z1 - depth / 2 - 0.1, w, d: depth } : { type, x: B.x1 - depth / 2 - 0.1, z: B.z0 + t + w / 2, w: depth, d: w };
    const corners4 = [[z.x - z.w / 2 + 0.2, z.z - z.d / 2 + 0.2], [z.x + z.w / 2 - 0.2, z.z - z.d / 2 + 0.2], [z.x + z.w / 2 - 0.2, z.z + z.d / 2 - 0.2], [z.x - z.w / 2 + 0.2, z.z + z.d / 2 - 0.2]];
    if (corners4.every(([x, zz]) => pip(x, zz, P))) out.push(sanitizeZone(z));
    t += w;
  });
  return out;
}
$('btn-auto-zones').addEventListener('click', () => {
  const zs = autoZones();
  if (!zs.length) { toast('球場以外的空地不到 2.5 m 深，沒辦法自動分區；可以自己在圖上畫'); return; }
  pushHistory(); state.zones = state.zones.concat(zs); selZoneId = null; planChanged(); renderPlan();
  toast(`已在空地排好 ${zs.length} 個區域，可以再拖曳調整`);
});
$('btn-add-court').addEventListener('click', () => {
  const B = hallBounds();
  pushHistory();
  const n = state.items.filter((i) => CAT[i.type].court === 'vb').length + 1;
  const it = { id: uid(), type: 'vb', x: snapP((B.x0 + B.x1) / 2), z: snapP((B.z0 + B.z1) / 2), rot: 90, label: `${n} 號場` };
  state.items.push(it); rerenderOne(it);
  const cam = cameraFor(it, state.items.filter((i) => i.type === 'camera').length + 1); state.items.push(cam); rerenderOne(cam);
  if (mode !== 'plan') setMode('plan');
  selectPlanItem(it.id); commit();
  toast('已加入一面排球場（含緩衝區 18×25 m），拖到想要的位置；旁邊的牆也自動架好攝影機');
});
$('p-select').addEventListener('click', () => setPlanTool('select'));
$('p-draw').addEventListener('click', () => setPlanTool('draw'));
$('draw-badge').addEventListener('click', (e) => { if (e.target.dataset && e.target.dataset.wk) { wallKind = e.target.dataset.wk; planToolState(); return; } if (e.target.id === 'draw-cancel') setPlanTool('select'); if (e.target.id === 'entry-auto') { pushHistory(); delete state.building.entry; setPlanTool('select'); planChanged(); toast('主入口改回自動：開在櫃台貼著的那面牆'); } });
$('p-entry').addEventListener('click', () => setPlanTool(planTool === 'entry' ? 'select' : 'entry'));
$('p-box').addEventListener('click', () => { setPlanTool(planTool === 'box' ? 'select' : 'box'); if (planTool === 'box') toast('在圖上拖一個框，框到的物件會一起選起來'); });
$('p-wall').addEventListener('click', () => setPlanTool(planTool === 'wall' ? 'select' : 'wall'));
$('p-ortho').addEventListener('click', () => {
  const P = state.building.poly; if (!P) return;
  const Q = orthoPoly(P);
  if (!Q) { toast('外框的邊歪太多（超過 25°），沒辦法自動判斷，請在「描真實建物外框」裡重新點'); return; }
  pushHistory();
  // 只歪一點點時，順便把外框轉回跟圖紙格線平行（球場、區域、物件原本就是正的，所以不動；掛牆的東西重新貼到牆上）
  const a = smallTilt(Q);
  if (a) {
    const xs0 = Q.map((q) => q[0]), zs0 = Q.map((q) => q[1]), cx = (Math.min(...xs0) + Math.max(...xs0)) / 2, cz = (Math.min(...zs0) + Math.max(...zs0)) / 2, c = Math.cos(-a), sn = Math.sin(-a);
    for (const q of Q) { const dx = q[0] - cx, dz = q[1] - cz; q[0] = cx + dx * c - dz * sn; q[1] = cz + dx * sn + dz * c; }
    // 轉完每一邊不是水平就是垂直：同一邊的兩個角取平均，消掉四捨五入的誤差
    for (let i = 0; i < Q.length; i++) { const p1 = Q[i], p2 = Q[(i + 1) % Q.length], k = Math.abs(p2[0] - p1[0]) > Math.abs(p2[1] - p1[1]) ? 1 : 0, m = (p1[k] + p2[k]) / 2; p1[k] = m; p2[k] = m; }
    for (const q of Q) { q[0] = Math.round(q[0] * 100) / 100; q[1] = Math.round(q[1] * 100) / 100; }
  }
  state.building.poly = Q;
  const xs = Q.map((q) => q[0]), zs = Q.map((q) => q[1]);
  state.building.L = Math.round((Math.max(...xs) - Math.min(...xs)) * 2) / 2; state.building.W = Math.round((Math.max(...zs) - Math.min(...zs)) * 2) / 2;
  if (a) for (const it of state.items) if (CAT[it.type] && CAT[it.type].wall) snapWallItem(it);
  planChanged(); pv.fitted = false; renderPlan(); planToolState();
  toast(`外框校正好了：${Q.length} 個牆角都是直角${a ? `，也轉了 ${fmt1((-a * 180) / Math.PI)}° 跟圖紙格線對齊` : ''}${Math.abs(alignPoly(Q).deg) >= 0.5 ? '；要讓建物跟圖紙對齊，再按「建物轉正」' : ''}`);
});
$('p-align').addEventListener('click', () => {
  const P = state.building.poly; if (!P) return;
  const al = alignPoly(P); if (Math.abs(al.deg) < 0.5) { toast('建物已經是正的了'); return; }
  pushHistory();
  // 用同一個旋轉＋位移把區域、物件、牆都搬過去
  const xs0 = P.map((q) => q[0]), zs0 = P.map((q) => q[1]), r = (-al.deg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
  const R = ([x, z]) => [x * c - z * sn, x * sn + z * c];
  const rp = P.map(R), rx = rp.map((q) => q[0]), rz = rp.map((q) => q[1]), cx = (Math.min(...rx) + Math.max(...rx)) / 2, cz = (Math.min(...rz) + Math.max(...rz)) / 2;
  const T = (pt) => { const q = R(pt); return [Math.round((q[0] - cx) * 100) / 100, Math.round((q[1] - cz) * 100) / 100]; };
  for (const o of state.items) { const q = T([o.x, o.z]); o.x = q[0]; o.z = q[1]; o.rot = (((o.rot + al.deg) % 360) + 360) % 360; }
  for (const z of state.zones) { const q = T([z.x, z.z]); z.x = q[0]; z.z = q[1]; z.rot = ((((z.rot || 0) + al.deg) % 360) + 360) % 360; }
  for (const w of state.walls || []) { w.a = T(w.a); w.b = T(w.b); }
  if (state.building.entry) state.building.entry = T(state.building.entry);
  state.building.poly = al.P; state.building.L = Math.round(al.L * 2) / 2; state.building.W = Math.round(al.W * 2) / 2;
  state.building.north = Math.round((((state.building.north || 0) + al.deg) % 360) * 10) / 10;
  fullRefresh(); pv.fitted = false; renderPlan(); toast(`整個建物轉了 ${fmt1(-al.deg)}°，最長的牆現在是水平的`);
});
$('p-rot').addEventListener('click', () => { rotateSel(90); renderPlan(); renderZoneSel(); });
$('p-del').addEventListener('click', () => { if (selWallId) deleteWall(); else if (selZoneId) deleteZone(); else { deleteSel(); renderPlan(); renderZoneSel(); planToolState(); } });
$('p-snap').addEventListener('click', () => { snapOn = !snapOn; setPressed($('p-snap'), snapOn); setPressed($('t-snap'), snapOn); });
$('p-undo').addEventListener('click', () => undo());
$('z-in').addEventListener('click', () => zoomAt(1.25));
$('z-out').addEventListener('click', () => zoomAt(0.8));
$('z-fit').addEventListener('click', () => { fitPlan(); renderPlan(); });
addEventListener('keydown', (e) => {
  if (mode !== 'plan') return;
  const tgt = e.target; if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) return;
  if (e.key === 'Escape') { if (planTool === 'draw') setPlanTool('select'); else if (selZoneId) selectZone(null); return; }
  if (selWallId && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteWall(); return; }
  if (selWallId && e.key.startsWith('Arrow')) {
    const wl = (state.walls || []).find((x) => x.id === selWallId); if (!wl) return;
    e.preventDefault(); const st = e.shiftKey ? 0.01 : 0.1, dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dz = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
    if (!e.repeat) pushHistory();
    wl.a = [f2(wl.a[0] + dx), f2(wl.a[1] + dz)]; wl.b = [f2(wl.b[0] + dx), f2(wl.b[1] + dz)]; planChanged(); renderZoneSel(); return;
  }
  const z = state.zones.find((x) => x.id === selZoneId); if (!z) return;
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); flipDoor(z); return; }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); pushHistory(); zoneEdit(z, () => { z.rot = e.shiftKey ? alignToWall(z) : Math.round(norm360((z.rot || 0) + 90) * 100) / 100; }); planChanged(); renderZoneSel(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteZone(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateZone(); }
  else if (e.key.startsWith('Arrow')) {
    e.preventDefault(); const st = e.shiftKey ? 0.1 : 0.5; pushHistory();
    if (e.key === 'ArrowLeft') z.x -= st; if (e.key === 'ArrowRight') z.x += st; if (e.key === 'ArrowUp') z.z -= st; if (e.key === 'ArrowDown') z.z += st;
    z.x = f2(z.x); z.z = f2(z.z); planChanged(); renderZoneSel();
  }
});


// ---------------------------------------------------------------- modes: 01 平面圖 → 02 3D 元件 → 導覽
let mode = 'plan', walkReturn = 'plan', firstOrbit = true;
function setMode(m) {
  if (GAME_ONLY && m !== 'walk') { window.__leavingOk = true; location.href = 'index.html#lobby'; return; }
  if (m === mode) return;
  if (mode === 'walk' && m !== 'walk') { window.__leavingOk = true; location.href = 'index.html#lobby'; return; }
  const prev = mode; mode = m;
  $('app').dataset.mode = m;
  for (const [id, k] of [['m-plan', 'plan'], ['m-3d', '3d'], ['m-walk', 'walk']]) $(id).setAttribute('aria-selected', String(k === m));
  planHost.hidden = m !== 'plan';
  host.hidden = m === 'plan';
  if (m === 'plan') { if (planTool === 'draw') setPlanTool('select'); renderPlan(); renderZoneSel(); planToolState(); }
  else {
    resize();
    if (m === '3d') { selZoneId = null; renderZoneSel(); if (firstOrbit) { frameView('bird'); firstOrbit = false; } }
    if (m === 'walk') { walkReturn = prev; startWalk(); }
    window.wakeRender && window.wakeRender(1200);
  }
}
$('m-plan').addEventListener('click', () => setMode('plan'));
$('m-3d').addEventListener('click', () => setMode('3d'));
$('m-walk').addEventListener('click', () => setMode('walk'));
$('w-exit').textContent = '回大廳';
$('w-exit').addEventListener('click', () => { netLeave(true); window.__leavingOk = true; location.href = window.VBLobby?.home() || 'index.html#lobby'; });


