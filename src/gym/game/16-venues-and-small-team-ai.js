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
function vmSmallPossession(team,B) {
  if(VM.poss[team])return VM.poss[team];
  const p=vmPredL(B,BALL_R)||vmPredL(B,0.9);if(!p)return null;
  const sd=vmSide(team),k=CourtFormations.owner(vmSmallCount(),p.x*sd,p.z/sd),passer=VM.rot[team][k];
  return VM.poss[team]={stage:0,passer,setter:vm6SetterFor(team,passer),attacker:null};
}
// 保留舉球員跑位線和攻擊手整段助跑線；掩護者的目標與實際移動都要避開。
function vmBlockLane(a, th) {
  const sd = vmSide(a.team), L = th.z / sd, edge = Math.sign(L) || 1;
  const small = vmSmallCount(), pair = small ? vmSmallBlockers(a.team, th) : null;
  if (pair?.length === 1) return 0;
  const inner = small ? pair[1] === a.id : VM.tactics === 'rotation' ? vm6Idx(a.id) === 2 : VM.role[a.id] === 'MB';
  if (!inner) return sd * edge * .4;
  let target = L - edge * .4;
  // 真人邊翼已經在網前時，攔中也不能跨過他的外側；保留約 0.7 m 接縫距離。
  for (const id of VM.team[a.team]) {
    if (id === a.id || VM.ai.has(id) || !vm6Front(id)) continue;
    const q = vmPos(id); if (!q || Math.abs(q.x) > 1.8 || q.z / sd * edge < .5 || Math.abs(q.z / sd - L) > 1.3) continue;
    target = edge * Math.min(target * edge, q.z / sd * edge - .7);
  }
  return sd * target - th.z;
}
function vmSmallBlockers(team, th) {
  const ids = VM.team[team].filter(id => vm6Front(id) && vmPos(id) && Math.abs(vmPos(id).z - th.z) < 3.4);
  ids.sort((a, b) => Math.abs(vmPos(a).z - th.z) - Math.abs(vmPos(b).z - th.z));
  return ids.slice(0, 2);   // 小人數沒有專職攔中：靠攻擊邊的在外側，另一位在內側
}
function vmAttackLane(team, id) {
  const at = vmPos(id); if (!at) return null;
  const sd = vmSide(team), P = VM.poss[team], ball = VM.ball && vmBallL(VM.ball);
  const pred = P?.stage === 2 && P.attacker === id && ball ? vmPredL(ball, 2.8) : null;
  const back = VM.six && !vm6Front(id);
  const L = VM.six && !vmSmallCount() ? (VM.tactics === 'rotation' ? V6_BASE[vm6Idx(id)]?.[1] || 0 : VM.role[id] === 'OH' ? (back ? 0 : 3.3) : VM.role[id] === 'OPP' ? -3.3 : 0) : at.z / sd;
  const b = { x: sd * (pred ? Math.max(back ? 3.5 : 0.7, pred.x * sd + .55) : back ? 4.4 : 1.2), z: pred ? clamp(pred.z, -4, 4) : sd * L };
  let dx = at.x - b.x, dz = at.z - b.z, len = Math.hypot(dx, dz);
  if (len < .5) { dx = sd; dz = 0; len = 1; }
  const run = Math.max(3.4, len);
  return { a: { x: b.x + dx / len * run, z: b.z + dz / len * run }, b, r: 1.1, id };
}
function vmLaneProject(q, lane) {
  const dx = lane.b.x - lane.a.x, dz = lane.b.z - lane.a.z, len = Math.hypot(dx, dz) || 1;
  const t = clamp(((q.x - lane.a.x) * dx + (q.z - lane.a.z) * dz) / (len * len), 0, 1);
  const x = lane.a.x + dx * t, z = lane.a.z + dz * t;
  return { x, z, d: Math.hypot(q.x - x, q.z - z), side: ((q.x - x) * -dz + (q.z - z) * dx) / len, ux: dx / len, uz: dz / len };
}
function vmLaneClearPoint(q, lane) {
  const p = vmLaneProject(q, lane); if (p.d >= lane.r + .15) return q;
  const sign = Math.sign(p.side) || (q.z > 0 ? -1 : 1), step = lane.r + .3;
  return { x: p.x - p.uz * sign * step, z: p.z + p.ux * sign * step };
}
function vmLanePathHits(a, b, lane) {
  const path = { a, b }, side = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const crosses = side(a, b, lane.a) * side(a, b, lane.b) < 0 && side(lane.a, lane.b, a) * side(lane.a, lane.b, b) < 0;
  return crosses || Math.min(vmLaneProject(a, lane).d, vmLaneProject(b, lane).d, vmLaneProject(lane.a, path).d, vmLaneProject(lane.b, path).d) < lane.r;
}
function vmAiYieldRoute(a) {
  const goal = { x: a.tx, z: a.tz }, P = VM.poss[a.team];
  if (VM.phase !== 'rally' || !P || VM.touch.team !== a.team || a.y > .05) return goal;
  if ((P.stage === 1 && P.setter === a.id) || (P.stage === 2 && P.attacker === a.id) || P.stage < 1 || P.stage > 2) return goal;
  const lanes = [];
  if (P.stage === 1 && P.setter) {
    const q = vmPos(P.setter), b = VM.ball && vmBallL(VM.ball), p = b && (vmPredL(b, 2.2) || vmPredL(b, 1));
    if (q && p) lanes.push({ a: q, b: p, r: .85, id: P.setter });
    // 球還沒舉出去時，真人 OH 也需要先助跑，掩護者不能卡住他的起步。
    for (const id of VM.team[a.team]) if (id !== a.id && id !== P.setter && !VM.ai.has(id)) { const lane = vmAttackLane(a.team, id); if (lane) lanes.push(lane); }
  } else if (P.attacker && P.attacker !== a.id) { const lane = vmAttackLane(a.team, P.attacker); if (lane) lanes.push(lane); }
  let nav = goal;
  for (const lane of lanes) {
    const here = vmLaneProject(a, lane);
    if (here.d < lane.r) { nav = vmLaneClearPoint(a, lane); continue; }
    nav = vmLaneClearPoint(nav, lane);
    // 跑位兩端在助跑線不同側：從起跳點前方繞過，不直穿攻擊手的路。
    if (vmLanePathHits(a, nav, lane)) {
      const sign = Math.sign(here.side) || 1, pad = lane.r + .45;
      nav = { x: lane.b.x + here.ux * pad - here.uz * sign * pad, z: lane.b.z + here.uz * pad + here.ux * sign * pad };
    }
  }
  return nav;
}
function vmAiSetAttack(a, P, B, pick, low) {
  if (!pick.id || pick.id === a.id) { vmAiFree(a, vmSide(a.team)); return; }
  const sd = vmSide(a.team), back = !vm6Front(pick.id), far = Math.max(0, Math.abs(a.x) - 2.6);
  const fix = low || !!P.fix || far > 0.8;
  const zone = vmSmallCount() ? CourtFormations.get(vmSmallCount())[vm6Idx(pick.id)] : null;
  const L = zone ? clamp(zone.L, -3.0, 3.0) : pick.n === 7 || pick.n === 1 ? 3 : pick.n === 5 || pick.n === 3 ? -3 : 0;
  // 所有人數共用：依選中的攻擊手是否在後排決定球深度，修正球與低手舉球也不能強制送到網前。
  const T = (low ? 1.65 : fix ? 1.5 : 1.3) + Math.min(far, 4) * 0.06;
  vmAiTouch(a, sd * (back ? 4.4 : 1.2), sd * L, 3.1, T, Math.min(vmLv(a).setErr * (fix ? 1.5 : 1), 0.5), 'set', low ? 3 : 2, false, back);
  if (VM.poss[a.team]?.stage === 2) { VM.poss[a.team].attacker = pick.id; VM.poss[a.team].fix = fix; VM.poss[a.team].td = false; }
}
function vmSmallChooseSet(a,B) {
  // 沒有固定分工：舉球的人以外每個人都可以打，照他現在的區域選球路（前排左＝1、前排右＝3、後排左＝7、後排中＝4、後排右＝5）
  const n=vmSmallCount(),zones=CourtFormations.get(n),P=VM.poss[a.team]||{},opt=[];
  for(const id of VM.team[a.team]){
    if(id===a.id)continue;const k=vm6Idx(id),z=k>=0?zones[k]:null;if(!z)continue;
    if(n===3&&z.front)continue;   // 3 對 3：球都舉給後排的兩個人打（前排那位負責舉）
    const kind=z.front?(z.L<-1?3:1):(z.L>1.5?7:z.L<-1.5?5:4),w=(VM.ai.has(id)?2:3)*(id===P.passer?0.6:1);
    opt.push([kind,id,w]);
  }
  if(!opt.length)return {id:a.id,n:4};
  const call=a.team===vmTeamOf(vmMe())&&VM.call&&VM.t-VM.call.t<8?VM.call:null;
  if(call){VM.call=null;const o=opt.find(q=>q[0]===call.n);if(o)return {n:o[0],id:o[1]};}
  const human=opt.filter(q=>!VM.ai.has(q[1]));if(human.length&&Math.random()<0.55)return {n:human[0][0],id:human[0][1]};
  let r=Math.random()*opt.reduce((s,q)=>s+q[2],0);for(const q of opt){r-=q[2];if(r<=0)return {n:q[0],id:q[1]};}
  return {n:opt[0][0],id:opt[0][1]};
}
function vmSoloBrain(a,sd,b,live) {
  if(!live)return;
  const B=vmBallL(b),land=vmPredL(B,BALL_R);
  const coming=VM.touch.team!==a.team&&(Math.sign(B.x)===sd||(Math.sign(B.vx)===sd&&land&&Math.sign(land.x)===sd))&&!vmLetGo(a.team,b);
  if(!coming){const f=vm6Spot(a.team,a.id,'defense');a.tx=f.x;a.tz=f.z;a.reactAt=VM.t+vmLv(a).react;return;}
  // With no teammate, reuse the existing rescue/free-ball action for a one-touch return.
  if(VM.t>=a.reactAt)vmAiRole(a,{stage:2,passer:a.id,setter:null,attacker:null},B,sd);
}
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

