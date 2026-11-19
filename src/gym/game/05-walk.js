// ---------------------------------------------------------------- free walk: WASD / arrows + drag to look, joystick on phones, click the floor to walk there
const walk = { on: false, x: 0, z: 0, yaw: 0, pitch: -0.04, keys: new Set(), target: null, joy: { x: 0, y: 0 }, zoneKey: '', lastZ: 0, saved: null, look: null, off: new Set(), sit: null, hold: null, focus: null, lastF: 0, score: [0, 0], sets: [0, 0], drinks: 0, dark: false, open: new Set(), bags: new Map(), spike: null, paused: false, clickT: 0 };
const EYE = 1.62, RADIUS = 0.32;
const targetMark = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0xc4552a, transparent: true, opacity: 0.9, depthWrite: false }));
targetMark.rotation.x = -Math.PI / 2; targetMark.visible = false; scene.add(targetMark);
// 手機進導覽：整個畫面給 3D（瀏覽器支援的話也進系統全螢幕），右上角只留「⋯」和「✕」
const isPhone = () => matchMedia('(pointer: coarse) and (max-width: 900px), (pointer: coarse) and (max-height: 520px)').matches;
function phoneFull(on, force) {
  const de = document.documentElement;
  if (on && !isPhone() && !force) return;
  de.classList.toggle('phone-walk', on); if ($('w-full')) { $('w-full').textContent = on ? '離開全螢幕' : '全螢幕'; setPressed($('w-full'), on); } $('stage').scrollLeft = 0; $('stage').scrollTop = 0;

  try {
    if (on && de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen({ navigationUI: 'hide' }).then(() => { if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock().catch(() => {}); }).catch(() => {});
    if (!on) { if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  } catch (e) { /* 不支援（例如 iPhone Safari）就只用版面全螢幕 */ }
  window.wakeRender && window.wakeRender(600);
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); });
function openPersonalSettings() { VBSettings.open(); }
$('w-settings').addEventListener('click', openPersonalSettings);
$('w-host').addEventListener('click', () => { if (isRoomHost()) { unlockMouse(); $('room-panel').hidden = !$('room-panel').hidden; walk.keys.clear(); } });
$('room-close').addEventListener('click', () => { $('room-panel').hidden = true; });
$('room-speed').addEventListener('change', () => { const speed = Number($('room-speed').value); if (isRoomHost()) { if (ROOM) ROOM.setSpeed(speed); else { VB.ts = speed; renderRoomRules(); } } });
let settingsPause = false;
addEventListener('vb-settings-open', () => { settingsPause = walk.paused; walk.paused = true; walk.keys.clear(); walk.target = null; vbManualSetCancel(); setMenuClose(false); emoMenuClose(false); unlockMouse(); });
addEventListener('vb-settings-close', () => { walk.paused = settingsPause; updateLockHint(); });
addEventListener('vb-settings-change', () => { applyPersonalSettings(); });
function applyNameTags() {
  document.body.classList.toggle('hide-nametags', !VBSettings.values.nameTags);
}
applyNameTags();
function applyPersonalSettings() {
  applyNameTags();
  const p = VBSettings.values;
  if (quality !== p.quality) { quality = p.quality; perf.n = 0; perf.sum = 0; applyQuality(false); }
  VB.assist = p.assist; SFX.on = !p.mute;
  if (SFX.bus) SFX.bus.out.gain.value = p.mute ? 0 : .9 * p.volume / 100;
  if (walk.on) { camera.fov = walkFov(); camera.updateProjectionMatrix(); }
  if (applyPersonalSettings.third !== p.third) { TP.manual = null; applyPersonalSettings.third = p.third; }
  if (NET.on && p.nickname && NET.name !== p.nickname) { NET.name = p.nickname; NET.forceSt = true; renderMpList(); }
  $('walk-ui').classList.toggle('settings-no-cues', !p.cues);
  const keys = JSON.stringify(p.keys); if (applyPersonalSettings.keys !== keys) { walk.keys.clear(); applyPersonalSettings.keys = keys; }
  for (const el of document.querySelectorAll('kbd[data-key]')) el.textContent = VBSettings.keyName(p.keys[el.dataset.key]);
  window.wakeRender && window.wakeRender(800);
}
function startWalk() {
  walk.on = true; window.__walk = true;
  select(null); selZoneId = null;
  walk.saved = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov, near: camera.near, structure: VIS.structure, labels: showLabels };
  controls.enabled = false;
  camera.fov = walkFov(); camera.near = 0.05; camera.updateProjectionMatrix();
  VIS.structure = true; applyStructure();
  showLabels = false; applyLabelVisibility(); for (const o of buildingGroup.children) if (o.isCSS2DObject) o.visible = false;
  zonesGroup.traverse((o) => { if (o.userData.isTag) o.visible = false; });
  const ent = entryInfo();
  walk.x = ent.x - ent.nx * 1.6; walk.z = ent.z - ent.nz * 1.6;
  walk.yaw = Math.atan2(ent.nx, ent.nz); walk.pitch = -0.04; walk.target = null; walk.zoneKey = '';
  walk.keys.clear(); walk.joy = { x: 0, y: 0 }; walk.joyRun = false; walk.autoRun = false; $('joy').classList.remove('run', 'lock'); $('joy-run').textContent = '左半邊按住＝移動';
  $('walk-ui').hidden = false;
  phoneFull(true);
  updateLockHint();
  if (!walk.actWired) {
    walk.actWired = true; $('wk-act').addEventListener('click', () => doInteract());
    $('vclose').addEventListener('click', closeModals); $('pclose').addEventListener('click', closeModals);
    $('cv-x').addEventListener('click', closeCamView); $('cv-snap').addEventListener('click', snapCamView);
    $('cv-rec').addEventListener('click', recToggle); $('cv-play').addEventListener('click', openReplay);
    $('rp-play').addEventListener('click', () => { if (RP.t >= RP.A.dur) RP.t = 0; rpSetPlay(!RP.playing); });
    $('rp-time').addEventListener('input', (e) => { RP.t = Number(e.target.value); RP.followJump = true; rpSetPlay(false); });
    for (const b of document.querySelectorAll('[data-rps]')) b.addEventListener('click', () => { RP.speed = Number(b.dataset.rps); for (const q of document.querySelectorAll('[data-rps]')) setPressed(q, q === b); });
    for (const b of document.querySelectorAll('[data-rpv]')) b.addEventListener('click', () => rpView(b.dataset.rpv));
    $('rp-dl').addEventListener('click', rpDownload); $('rp-x').addEventListener('click', closeReplay);
    $('pc-desk').addEventListener('click', (e) => { const b = e.target.closest('[data-app]'); if (b) pcOpen(b.dataset.app); });
    $('pc-tasks').addEventListener('click', () => $('pc-app').classList.toggle('min'));
    $('pc-min').addEventListener('click', () => $('pc-app').classList.add('min'));
    $('pc-close').addEventListener('click', pcClose); $('pc-off').addEventListener('click', closePC);
    $('wk-use').addEventListener('click', (e) => { const b = e.target.closest('[data-use],[data-rkopen],[data-npc],[data-vmopen]'), c = state.items.find((i) => i.id === $('wk-use').dataset.id); if (!b) return; if (b.dataset.rkopen) { rkOpenMenu(null); return; } if (!c) return; if (b.dataset.vmopen) { VM_OPT.mode = b.dataset.vmopen === '6' ? '6' : '2'; vmOpenMenu(c); } else if (b.dataset.npc) { vbNpcToggle(b.dataset.npc === 'off' ? null : b.dataset.npc); renderUseBar(c); } else if (b.dataset.rkopen) rkOpenMenu(c); else setCourtUse(c, b.dataset.use); });
    $('wk-use').addEventListener('pointerdown', (e) => e.stopPropagation());
    $('cv-big').addEventListener('click', () => { const b = $('camview').classList.toggle('big'); $('cv-big').textContent = b ? '縮小' : '放大'; });
  }
  $('joy').hidden = $('vpad').hidden = !matchMedia('(pointer: coarse)').matches;
  const help = $('walk-help'); help.classList.remove('fade'); clearTimeout(walk.helpT); walk.helpT = setTimeout(() => help.classList.add('fade'), 7000);
  $('zcard').classList.add('out');
  updateWalk(0); updateZoneCard(true); drawScore();
  for (const it of state.items) if (['aircon', 'standac', 'packac'].includes(it.type)) addWind(it);
  // 邀請連結帶著房間代碼：進導覽就自動加入
  { const rq = new URLSearchParams(location.search).get('room'); if (rq && !NET.on) netJoin(rq); else renderRoomRules(); }
  applyPersonalSettings();
  tutAutoOpen();
  toast('從主入口進場。走進任何一區，角落會出現那一區的說明');
}
function stopWalk() {
  globalThis.VBTutorial?.stop();
  if (window.__rkOn) rkStop(true);
  vmStop();
  vbStop();
  walk.on = false; window.__walk = false; targetMark.visible = false; unlockMouse(); updateLockHint();
  walk.sit = null; walk.focus = null; walk.off.clear(); setDark(false); closeModals(); closeCamView(); closePC(); netLeave(true); $('mp').hidden = true;
  if (walk.hold) { camera.remove(walk.hold); walk.hold = null; }
  walk.spike = null; walk.serve = null; reachState = null; closeReplay(); if (REC.on) recToggle(); skill.mode = null; hands.visible = false; $('wk-combo').hidden = true;
  for (const id of [...winds.keys()]) removeWind(id);
  ballsGroup.clear(); balls.length = 0; cans.length = 0; walk.bags.clear(); tweens.length = 0; walk.filling = false;
  for (const d of [...zoneDoors, ...mainDoors]) { d.open = false; } updateDoors(5);
  if (walk.open.size) { walk.open.clear(); renderItems(); }
  $('wk-act').hidden = true;
  $('walk-ui').hidden = true;
  phoneFull(false);
  const s = walk.saved;
  if (s) { camera.position.copy(s.pos); controls.target.copy(s.target); camera.fov = s.fov; camera.near = s.near; camera.updateProjectionMatrix(); VIS.structure = s.structure; showLabels = s.labels; }
  camera.rotation.set(0, 0, 0); camera.up.set(0, 1, 0);
  controls.enabled = true; controls.update();
  applyStructure(); applyLabelVisibility(); for (const o of buildingGroup.children) if (o.isCSS2DObject) o.visible = showLabels;
  zonesGroup.traverse((o) => { if (o.userData.isTag) o.visible = showLabels; });
}
// 不能穿過的東西：排球網、羽球／匹克球網、隔網（線段）；ballOnly＝只給球用（球網不算，球要能從網子上面過）
// 打球時（排球比賽／陪練、羽球／匹克球對戰），跟那面球場重疊、架著別種網子的球場：網子和器材先收起來（線留著），結束就放回去
const STOW = new Set();
function stowActive() {
  if (window.__rkOn && RK.c) return { it: RK.c.it, k: RK.k };
  if (VM.on && VM.c) return { it: VM.c, k: 'vb' };
  if (VB.npc && VB.npc.c) return { it: VB.npc.c, k: 'vb' };
  return null;
}
function rectsOverlap(a, b) {
  const pts = (it) => { const { w, d } = sizeOf(it); return [[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => toWorldOf(it, u, v)); };
  const inside = (it, [x, z]) => { const { w, d } = sizeOf(it), [lx, lz] = toLocalOf(it, x, z); return Math.abs(lx) < w / 2 - 0.05 && Math.abs(lz) < d / 2 - 0.05; };
  return pts(b).some((q) => inside(a, q)) || pts(a).some((q) => inside(b, q));
}
function stowSync() {
  if ((STOW.tick = (STOW.tick || 0) + 1) % 10 !== 0) return;
  const act = stowActive(), want = new Set();
  if (act && act.it) for (const it of state.items) {
    const def = CAT[it.type]; if (!def || !def.court || it.id === act.it.id) continue;
    const use = it.mode === 'lines' ? def.court : it.use || def.court; if (use === act.k || use === 'none') continue;
    if (rectsOverlap(act.it, it)) want.add(it.id);
  }
  const fresh = [...want].filter((id) => !STOW.has(id));
  for (const g of itemsGroup.children) {
    const id = g.userData.itemId; if (!id || (!want.has(id) && !STOW.has(id))) continue;
    for (const ch of g.children) { if (ch.userData.courtFloor || ch.userData.isTag) continue; if (want.has(id)) { if (ch.visible) { ch.visible = false; ch.userData.stowed = true; } } else if (ch.userData.stowed) { ch.visible = true; delete ch.userData.stowed; } }
  }
  STOW.clear(); for (const id of want) STOW.add(id);
  if (fresh.length) toast(`打${SPORT[act.k]}時，重疊的${[...new Set(fresh.map((id) => { const it = state.items.find((i) => i.id === id); const d2 = CAT[it.type]; return SPORT[it.mode === 'lines' ? d2.court : it.use || d2.court]; }))].join('、')}網子先收起來，結束會放回去`, 2600);
}
function solidSegs(ballOnly) {
  const out = [];
  for (const it of state.items) {
    const def = CAT[it.type]; if (!def || STOW.has(it.id)) continue;
    if (it.type === 'netwall') { const { w } = sizeOf(it); out.push([...toWorldOf(it, -w / 2, 0), ...toWorldOf(it, w / 2, 0)]); continue; }
    if (ballOnly || !def.court) continue;
    const use = it.mode === 'lines' ? def.court : it.use || def.court;
    if (use === 'vb') out.push([...toWorldOf(it, 0, -5.5), ...toWorldOf(it, 0, 5.5)]);
    else if (use === 'bd' || use === 'pb') {
      const hw = use === 'bd' ? 3.05 : 3.35;
      for (const L of use === def.court ? [{ x: 0, z: 0, r: false }] : extraLayout(use, def.w, def.d)) out.push(L.r ? [...toWorldOf(it, L.x - hw, L.z), ...toWorldOf(it, L.x + hw, L.z)] : [...toWorldOf(it, L.x, L.z - hw), ...toWorldOf(it, L.x, L.z + hw)]);
    }
  }
  return out;
}
// 家具、設備（有高度、放在地上的）：走進外框就推出去
function solidBoxes() { return state.items.filter((it) => { const def = CAT[it.type]; return def && !def.court && !def.wall && !def.ceiling && it.type !== 'netwall' && (it.h || def.h || 0) >= 0.35 && !walk.off.has(it.id); }); }
function collide(x, z, ignoreCart = null) {
  const segs = blockers().concat(solidSegs(false));
  for (let it = 0; it < 3; it++) {
    for (const [x1, z1, x2, z2] of segs) {
      const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - x1) * dx + (z - z1) * dz) / l2, 0, 1), px = x1 + dx * t, pz = z1 + dz * t;
      const ex = x - px, ez = z - pz, d = Math.hypot(ex, ez);
      if (d < RADIUS) { const k = (RADIUS - d) / (d || 1e-6); x += (d ? ex : -dz) * k; z += (d ? ez : dx) * k; }
    }
  }
  for (const original of solidBoxes()) {
    if (original.id === ignoreCart) continue;
    const it = practiceCarts.get(original.id)?.item || original;
    const { w, d } = sizeOf(it), [lx, lz] = toLocalOf(it, x, z), hx = w / 2 + RADIUS * 0.8, hz = d / 2 + RADIUS * 0.8;
    if (Math.abs(lx) < hx && Math.abs(lz) < hz) { if (hx - Math.abs(lx) < hz - Math.abs(lz)) [x, z] = toWorldOf(it, Math.sign(lx || 1) * hx, lz); else [x, z] = toWorldOf(it, lx, Math.sign(lz || 1) * hz); }
  }
  const B = hallBounds();
  return [clamp(x, B.x0 - 8, B.x1 + 8), clamp(z, B.z0 - 8, B.z1 + 8)];
}
function updateWalk(dt) {
  const targetFov=walkFov();if(!RP.on && Math.abs(camera.fov-targetFov)>.01){camera.fov+=(targetFov-camera.fov)*(1-Math.exp(-6*dt));camera.updateProjectionMatrix();}
  if (draggedCart) movePracticeCart(dt);
  xhairTick();   // 準心圈的擊球時機
  const keyMoving = emoKeyWalk();
  if (window.VBTutorial?.active && (walk.spike || walk.sit || VM.on || window.__rkOn || NET.on)) window.VBTutorial.stop();
  const k = walk.keys;
  if (walk.spike) { updateSpike(dt); applyPose(dt); if (performance.now() - walk.lastF > 90) { walk.lastF = performance.now(); updateFocus(); } return; }
  if (walk.serve) updateServe(dt);
  if (walk.jserve) updateJumpServe(dt);
  if (reachState) updateReach(dt);
  if (walk.sit) {
    // 坐著：一開始走路（或點地板）就站起來
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].some((q) => k.has(q)) || Math.hypot(walk.joy.x, walk.joy.y) > 0.2 || walk.target) standUp();
    else {
      camera.position.set(walk.sit.x, walk.sit.eye, walk.sit.z);
      camera.rotation.order = 'YXZ'; camera.rotation.set(walk.pitch, walk.yaw, 0);
      if (performance.now() - walk.lastF > 90) { walk.lastF = performance.now(); updateFocus(); }
      updateSkill(dt); applyPose(dt); placeHeld(); return;
    }
  }
  let f = 0, s = 0;
  if (k.has('w') || k.has('arrowup')) f += 1;
  if (k.has('s') || k.has('arrowdown')) f -= 1;
  if (k.has('d') || k.has('arrowright')) s += 1;
  if (k.has('a') || k.has('arrowleft')) s -= 1;
  f += -walk.joy.y; s += walk.joy.x;
  const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw), rx = Math.cos(walk.yaw), rz = -Math.sin(walk.yaw);
  let vx = (fx * f + rx * s), vz = (fz * f + rz * s);
  const mag = Math.hypot(vx, vz), game = staGame();
  // 比賽／陪練：平常跑 2.6 m/s、Shift 衝刺 4.9 m/s（耗體力）；導覽：走 1.7 m/s、Shift 跑 3.7 m/s
  const wantRun = k.has('shift') || walk.joyRun, sp0 = game ? (staSprint(wantRun && mag > 0.01 && !walk.air, dt) ? 4.9 : 2.6) : wantRun ? 3.74 : 1.7;
  if (mag > 0.01) { walk.target = null; targetMark.visible = false; vx /= Math.max(1, mag); vz /= Math.max(1, mag); vx *= sp0; vz *= sp0; }
  else if (walk.target) {
    const dx = walk.target[0] - walk.x, dz = walk.target[1] - walk.z, d = Math.hypot(dx, dz);
    if (d < 0.15) { walk.target = null; targetMark.visible = false; }
    else {
      const sp = Math.min(1.7, d * 2.2); vx = (dx / d) * sp; vz = (dz / d) * sp;
      // 轉頭朝走的方向，每秒最多 100°
      const want = Math.atan2(-dx, -dz); let dy = want - walk.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      walk.yaw += clamp(dy, -1.75 * dt, 1.75 * dt);
    }
  }
  // 撲救：往球掉下來的地方撲出去（約 0.45 秒），落地後趴著 0.75 秒才能動
  const dv = walk.dive;
  if (dv) { dv.t += dt; const e = clamp(dv.t / 0.45, 0, 1), f2v = e < 0.6 ? 1 : 1 - (e - 0.6) / 0.4 * 0.85; vx = dv.vx * f2v; vz = dv.vz * f2v; walk.target = null; if (e >= 1) { walk.dive = null; walk.down = 0.75; sfx('slide', 0.8); } }
  else if (walk.down > 0) { walk.down -= dt; vx = vz = 0; }
  else if (walk.air) { vx = walk.air.vx + vx * 0.12; vz = walk.air.vz + vz * 0.12; walk.target = null; }
  else if (SETM.m && !SETM.m.all) { vx = vz = 0; walk.vel = [0, 0]; }   // 舉球轉盤開著：腳站住，專心選球路
  else { walk.vel = [vx, vz]; const as = vbAssist(mag); if (as) { vx += as[0]; vz += as[1]; } }
  if (RoomChat.isOpen) { vx = vz = 0; walk.vel = [0, 0]; }
  if (keyMoving) { vx = vz = 0; walk.vel = [0, 0]; walk.target = null; }
  if (game && !walk.air && !walk.dive) {   // 急停、急轉（速度掉一半、或方向轉超過 60°）：球鞋「唧」
    const pv = walk.pv || [0, 0], ps = Math.hypot(pv[0], pv[1]), cs = Math.hypot(vx, vz), cosA = ps > 0.1 && cs > 0.1 ? (pv[0] * vx + pv[1] * vz) / (ps * cs) : 1;
    // 急停、急轉、突然起跑都會「吱」（球場上最常聽到的聲音）
    if (((ps > 1.8 && (cs < ps * 0.6 || cosA < 0.7)) || (ps < 1 && cs > 3)) && performance.now() - (walk.sqT || 0) > 300) { walk.sqT = performance.now(); sfx('squeak', 0.7 + fxRandom() * 0.3, new THREE.Vector3(walk.x, 0.05, walk.z)); }
    walk.pv = [vx, vz];
  }
  walk.low = (walk.low || 0) + (((walk.dive && walk.dive.t > 0.08) || walk.down > 0.2 ? 1.1 : walk.crouch && !walk.air ? 0.45 : 0) - (walk.low || 0)) * Math.min(1, dt * (walk.dive ? 12 : 4));
  if (dt > 0 && (vx || vz)) {
    const [nx, nz] = collide(walk.x + vx * dt, walk.z + vz * dt);
    if (walk.target && Math.hypot(nx - walk.x, nz - walk.z) < Math.hypot(vx, vz) * dt * 0.2) { walk.target = null; targetMark.visible = false; }
    walk.x = nx; walk.z = nz;
    vbBodyPush();
  }
  if (!keyMoving) vbServeZone();
  const bob = !keyMoving && (mag > 0.01 || walk.target) ? Math.sin(performance.now() / 160) * 0.015 : 0;
  camera.position.set(walk.x, EYE + bob - (skill.dip || 0) - (walk.low || 0) + jumpY(dt), walk.z);
  if (VB.shake > 0) { VB.shake = Math.max(0, VB.shake - dt); const a = VB.shakeA ? VB.shakeA * 2 * Math.pow(VB.shake / (VB.shakeT || 1), 1.5) : VB.shake * 0.3; camera.position.x += (fxRandom() - 0.5) * a; camera.position.y += (fxRandom() - 0.5) * a; camera.position.z += (fxRandom() - 0.5) * a; }
  camera.rotation.order = 'YXZ'; camera.rotation.set(walk.pitch, walk.yaw, 0);
  if (performance.now() - walk.lastZ > 180) { walk.lastZ = performance.now(); updateZoneCard(); }
  if (performance.now() - walk.lastF > 90) { walk.lastF = performance.now(); updateFocus(); }
  updateSkill(dt); if (!roomSpectator()) vbUpdate(dt); else vbParts(dt); /* 觀戰時也要清掉擊球粒子：以前只有自己上場才清，觀戰越久留在場上的粒子越多、越來越卡 */ applyPose(dt); placeHeld();
  if (window.VBTutorial?.active) window.VBTutorial.frame(tutSnapshot());
}
