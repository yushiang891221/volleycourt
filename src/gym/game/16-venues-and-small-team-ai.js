// ---------------------------------------------------------------- existing Hsinchu venues (assets/data/venues.json): a reference model you can walk through
// 自由規劃：大家共用一份放在網路上；網路上比較新就換上，這台比較新就傳上去
async function syncFreePlan() {
  let local = null; try { local = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { local = null; }
  shareStatus('☁️ 讀取網路上的版本中…', 'busy');
  const rec = await pullShared('free-plan');
  if (rec && rec.data && (!local || !local.savedAt || rec.savedAt > local.savedAt)) { applyShared('free-plan', rec, true); toast(`已載入網路上最新的自由規劃（${hm(rec.savedAt)}）`); }
  else if (share.mode === 'off') shareStatus('💾 存在這台裝置（雲端共用還沒開啟）', '');
  else if (local) { share.known = rec ? rec.savedAt : null; queueShared('free-plan'); }
  else { share.known = null; shareStatus('☁️ 共用中：改動會自動存到網路上，大家看到同一份', 'ok'); }
}
async function loadVenue(id, fresh) {
  let all = null; try { all = await fetch('assets/data/venues.json', { cache: 'no-store' }).then((r) => r.json()); } catch (e) { /* ignore */ }
  const v = all && all.venues.find((x) => x.id === id);
  if (!v) { toast('找不到這間球館的資料'); return; }
  window.__site = { name: v.name, town: v.addr, road: '' };
  let mine = null; try { mine = JSON.parse(localStorage.getItem(VENUE_KEY(id)) || 'null'); } catch (e) { /* ignore */ }
  state = sanitize(mine && mine.data ? { ...mine.data, id: null } : { ...v.design, name: `${v.name}（現況示意）`, id: null }); selectedId = null; selZoneId = null; history = [];
  window.__venueReady = true; renderHist();
  fullRefresh(); frameView('bird'); pv.fitted = false; renderPlan(); planToolState(); markClean();
  $('gym-title').textContent = v.name;
  document.querySelector('.rail-head .eyebrow').textContent = 'Existing Venue · 現有球館參考';
  $('site-none').hidden = true;
  const info = $('siteinfo'); info.hidden = false;
  const e = (t) => String(t).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  const cell = (k, val, cls) => `<div${cls ? ` class="${cls === true ? 'wide' : cls}"` : ''}><dt>${k}</dt><dd>${val == null || val === '' ? '<small>查不到</small>' : val}</dd></div>`;
  info.innerHTML = `<b>現有球館（依公開資料示意）</b><dl>
    ${cell('地址', e(v.addr), true)}${cell('球場', v.courts != null ? `${v.courts} <small>面</small>` : null)}${cell('挑高', v.height != null ? `${v.height} <small>m</small>` : null, 'r')}
    ${cell('尺寸', v.size && e(v.size), true)}${cell('設施', v.facilities.length ? e(v.facilities.join('、')) : null, true)}
    ${cell('營業時間', v.hours && e(v.hours))}${cell('收費', v.price && e(v.price), 'r')}</dl>
    <span>${e(v.layoutNote)}查不到的：${e(v.unknown.join('、'))}。</span>
    <span>${mine ? `目前顯示改過的版本（${new Date(mine.savedAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 存）。` : '你在這裡的改動會自動存到網路上，大家看到同一份。'}</span>
    <span class="memo"></span>
    <div class="row">${v.sources.map(([t, u]) => `<a href="${e(u)}" target="_blank" rel="noopener">${e(t)} ↗</a>`).join('')}</div>
    <div class="row"><a href="index.html#lobby">← 回地圖</a><button type="button" class="primary" id="venue-walk">▶ 走進去看</button><button type="button" id="venue-reset"${mine ? '' : ' hidden'}>回到相片版本</button></div>`;
  $('venue-walk').addEventListener('click', () => setMode('walk'));
  $('venue-reset').addEventListener('click', async () => { keepHistory(VENUE_KEY(id), true); try { localStorage.removeItem(VENUE_KEY(id)); } catch (er) { /* ignore */ } await loadVenue(id, true); saveDraftSoon(); toast('已回到相片版本（也同步到網路上）；剛才的版本留在「找回之前的版本」裡'); });
  if (fresh) return;
  toast(`已載入「${v.name}」的示意模型，按「進入導覽」可以走進去`);
  // 雲端：網路上的版本比這台新就換上；這台改過、網路上沒有或比較舊，就把這台的傳上去
  shareStatus('☁️ 讀取網路上的版本中…', 'busy');
  const cid = 'venue-' + id, rec = await pullShared(cid);
  if (window.__venueId !== id) return;
  if (rec && rec.data && (!mine || !mine.savedAt || rec.savedAt > mine.savedAt)) { applyShared(cid, rec, true); $('venue-reset').hidden = false; toast(`已載入「${v.name}」網路上最新的版本（${hm(rec.savedAt)}）`); }
  else if (share.mode === 'off') shareStatus('💾 存在這台裝置（雲端共用還沒開啟）', '');
  else if (mine) { share.known = rec ? rec.savedAt : null; queueShared(cid); }
  else { share.known = null; shareStatus('☁️ 共用中：改動會自動存到網路上，大家看到同一份', 'ok'); }
}

// WEB-003B: small teams share the existing indoor scoring and ball/AI actions.
// The six-player and beach paths never enter these adapters.
function vmSmallCount() { const n = VM.six && VM.team?.[0]?.length; return n === 1 || n === 3 || n === 4 || n === 5 ? n : 0; }
// 按當輪位置決定舉球，不按距離或真人／AI 身分搶走第二球。
function vmPositionSetters(team) {
  const rot = VM.rot[team], n = vmSmallCount();
  if (!n) return [rot[2],rot[1],rot[3],rot[5],rot[0],rot[4]].filter(Boolean);
  const zones = CourtFormations.get(n);
  return rot.map((id,k)=>({id,k,z:zones[k]})).sort((a,b)=>Number(b.z.front)-Number(a.z.front) || a.z.L-b.z.L || a.k-b.k).map(q=>q.id);
}
function vm6SyncRotationRoles() {
  if (!VM.six || VM.tactics !== 'rotation' || VM.team?.[0]?.length !== 6) return;
  const roles=['MB','OPP','S','OH','MB','OH'];
  for (const rot of VM.rot) rot.forEach((id,k)=>{
    VM.role[id]=roles[k];const a=VM.ai.get(id);
    if(a){a.name=VM.names[id]=`AI・${k+1}號位`;if(a.tag?.element)a.tag.element.textContent=a.name;}
  });
  mrecRoles();
}
function vmSmallLabel(id) { const k = vm6Idx(id); return k < 0 ? '觀眾' : `${k+1} 號位 · ${CourtFormations.get(vmSmallCount())[k].name}`; }
function vmSmallOverlap() {
  const t = 1-VM.srvTeam, sd = vmSide(t);
  const positions = VM.rot[t].map(id=>{const q=vmPos(id);return q?{d:q.x*sd,L:q.z/sd}:null;});
  const fault = CourtFormations.overlap(vmSmallCount(),positions);
  return fault ? {team:t,why:`位置錯誤（${fault.axis==='d'?'前後':'左右'}越位：${fault.low+1} 與 ${fault.high+1} 號位）`} : null;
}
function vmSmallPossession(...a) { return aiEngine().vmSmallPossession(...a); }   /* B3：AI 在 engine/ai.js */
// 保留舉球員跑位線和攻擊手整段助跑線；掩護者的目標與實際移動都要避開。
function vmBlockLane(...a) { return aiEngine().vmBlockLane(...a); }   /* B3：AI 在 engine/ai.js */
function vmSmallBlockers(...a) { return aiEngine().vmSmallBlockers(...a); }   /* B3：AI 在 engine/ai.js */
function vmAttackLane(...a) { return aiEngine().vmAttackLane(...a); }   /* B3：AI 在 engine/ai.js */
function vmLaneProject(...a) { return aiEngine().vmLaneProject(...a); }   /* B3：AI 在 engine/ai.js */
function vmLaneClearPoint(...a) { return aiEngine().vmLaneClearPoint(...a); }   /* B3：AI 在 engine/ai.js */
function vmLanePathHits(...a) { return aiEngine().vmLanePathHits(...a); }   /* B3：AI 在 engine/ai.js */
function vmAiYieldRoute(...a) { return aiEngine().vmAiYieldRoute(...a); }   /* B3：AI 在 engine/ai.js */
function vmAiSetAttack(...a) { return aiEngine().vmAiSetAttack(...a); }   /* B3：AI 在 engine/ai.js */
function vmSmallChooseSet(...a) { return aiEngine().vmSmallChooseSet(...a); }   /* B3：AI 在 engine/ai.js */
function vmSoloBrain(...a) { return aiEngine().vmSoloBrain(...a); }   /* B3：AI 在 engine/ai.js */
function vmSmallChart() {
  const el=$('vm-rot'),n=vmSmallCount(),zones=CourtFormations.get(n),my=Math.max(0,vmTeamOf(vmMe()));
  const srv=VM.host?vmServer():VM.srvId;
  const key=JSON.stringify([VM.rot,srv,my,VM.rotN]);if(el.dataset.k===key)return;el.dataset.k=key;el.hidden=false;
  el.innerHTML=[my,1-my].map(t=>`<div class="rt" style="grid-template-columns:repeat(${Math.min(n,3)},1fr)"><b>${t===my?'我方':'對方'} · ${n} 人</b><span class="net"></span>${zones.map((z,k)=>({z,k})).sort((a,b)=>Number(b.z.front)-Number(a.z.front)||b.z.L-a.z.L).map(({z,k})=>{const id=VM.rot[t][k];return `<i class="${z.front?'fr':''}${id===vmMe()?' me':''}${id===srv?' sv':''}" title="${esc(vmName(id))}"><u>${k+1}</u><em>${z.name} · ${esc(id===vmMe()?'你':VM.ai.has(id)?'AI':vmName(id))}</em></i>`;}).join('')}</div>`).join('');
}

const SITE_ID = 'bs-shenjing';
const VENUE_ID = SITE_ID ? null : new URLSearchParams(location.search).get('venue');
window.__siteId = SITE_ID;
window.__venueId = VENUE_ID;
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
if (SITE_ID && location.search) {
  const requestedMode = new URLSearchParams(location.search).get('mode');
  VM_OPT.mode = requestedMode === '6v6' ? '6' : '2';
  entryProgress(20, '讀取球館配置');
  generateFromSite(SITE_ID).then(async () => {
    if (CREATOR_SHOT) { await prepareCreatorShot(); return; }
    entryProgress(75, '準備 3D 球館'); setMode('walk');
    await new Promise(requestAnimationFrame); drawFrame(true);
    entryProgress(100, '準備完成');
    await new Promise(requestAnimationFrame);
    const cover = $('game-loading'); cover.classList.add('done'); setTimeout(() => { cover.hidden = true; }, 320);
  }).catch((e) => { console.error(e); entryFail(); });
}
if (VENUE_ID) loadVenue(VENUE_ID);

// 開發用空館照片。沿用遊戲的場館來源、材質與最高畫質後製。
async function prepareCreatorShot() {
  const court = state.items.find(it => CAT[it.type].court === 'vb');
  if (!court) throw new Error('球館沒有排球場，無法拍攝角色背景');
  controls.enabled = false;
  showLabels = false; applyLabelVisibility();
  scene.traverse(o => { if (o.isCSS2DObject || o.userData.isTag) o.visible = false; });
  VIS.structure = true; applyStructure();
  walls.forEach(wall => { wall.visible = true; });
  if (roof) roof.visible = true;
  for (const roof of zoneRoofs) roof.visible = true;
  const [x, z] = toWorldOf(court, -6, 6.7);
  const [tx, tz] = toWorldOf(court, -1, 0);
  camera.position.set(x, 1.1, z);
  // 與 creator 全身鏡頭相同的俯角，站位在鏡頭前方 4.2 公尺。
  camera.lookAt(tx, 1.1 - Math.hypot(tx - x, tz - z) * 0.25 / 4.2, tz);
  camera.fov = 32; camera.near = 0.05;
  quality = 'high'; applyQuality(false);
  renderer.setPixelRatio(1); resize();
  const style = document.createElement('style');
  style.textContent = 'body{visibility:hidden!important}#canvas-host{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}#canvas-host canvas{visibility:visible!important}';
  document.head.appendChild(style);
  await new Promise(requestAnimationFrame);
  resize();
  await renderer.compileAsync(scene, camera);
  renderScene();
  window.__creatorShot = { ready: true, court: court.id, position: camera.position.toArray(), target: [tx, tz] };
}

