// ---------------------------------------------------------------- 錄影＋球路回放：攝影機小視窗按「● 錄影」，每秒記錄 30 次球與人的位置、每一次擊球；
// 「▶ 球路回放」從那支攝影機（或俯視、跟球）重播：軌跡線、落點圈、擊球球速、最高點，統計擊球次數、最快球速、過網次數，可以下載影片
const REC = { on: false, t0: 0, last: 0, frames: [], events: [], cam: null, ids: new Map(), nid: 0 };
function recId(o) { if (!REC.ids.has(o.uuid)) REC.ids.set(o.uuid, ++REC.nid); return REC.ids.get(o.uuid); }
// 錄影可以從兩個地方開：攝影機畫面（cv-），或電腦的監視器 App（pc-）；兩邊按鈕狀態一起更新
function recUI() {
  for (const [r, pl] of [['cv-rec', 'cv-play'], ['pc-rec', 'pc-play'], ['rk-rec', 'rk-play']]) {
    const b = $(r); if (b) { b.textContent = REC.on ? '■ 停止' : '● 錄影'; b.classList.toggle('on', REC.on); }
    const q = $(pl); if (q) q.disabled = REC.on || REC.frames.length < 10;
  }
}
function pcRecCam() { const c = pc.cams.find((x) => x.it.type === 'camera') || pc.cams[0]; return c && c.cam; }
function recToggle(src) {
  if (REC.on) { REC.on = false; recUI(); toast(`錄好了（${(REC.frames.length / 30).toFixed(1)} 秒）：按「▶ 球路回放」看球路`); return; }
  const cam = src === 'pc' ? pcRecCam() : src === 'rk' ? camView.cam || pcRecCam() : camView.cam;
  if (!cam && src === 'rk') { REC.on = true; REC.t0 = performance.now(); REC.last = 0; REC.frames = []; REC.events = []; REC.ids.clear(); REC.nid = 0; REC.cam = null; recUI(); toast('開始錄球路（最多 3 分鐘）：打完按「■ 停止」，再按「▶ 回放」'); return; }
  if (!cam) { toast(src === 'pc' ? '館內還沒有攝影機，先到素材庫放一支' : '先打開一支智慧球場攝影機'); return; }
  REC.on = true; REC.t0 = performance.now(); REC.last = 0; REC.frames = []; REC.events = []; REC.ids.clear(); REC.nid = 0;
  REC.cam = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
  recUI();
  toast(src === 'pc' ? '開始錄影（最多 3 分鐘）：監視器畫面左上角會顯示 REC，打完按「■ 停止」' : '開始錄影（最多 3 分鐘）：去打球吧，打完按「■ 停止」');
}
function recEvent(type, e) { if (REC.on) REC.events.push({ type, t: (performance.now() - REC.t0) / 1000, ...e }); }
function recTick(now) {
  if (!REC.on || now - REC.last < 33) return;
  REC.last = now;
  const t = (now - REC.t0) / 1000;
  if (t > 180) { recToggle(); return; }
  REC.frames.push(recFrame(t, recId));
}
// 記一格畫面（球＋所有人）：手動錄影和得分精華共用；idOf 把球物件換成編號（兩邊各用各的編號表）
function recFrame(t, idOf) {
  const recId = idOf;
  const bl = [];
  // 第 5 欄：1＝在手上（拿著、拋球中），這段不算擊球
  for (const b of balls) bl.push([recId(b.m), +b.m.position.x.toFixed(3), +b.m.position.y.toFixed(3), +b.m.position.z.toFixed(3), 0]);
  if (walk.hold) { const v = new THREE.Vector3(); walk.hold.getWorldPosition(v); bl.push([recId(walk.hold), +v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3), 1]); }
  for (const s0 of [walk.spike, walk.serve]) if (s0 && s0.ball && !s0.hit) bl.push([recId(s0.ball), +s0.ball.position.x.toFixed(3), +s0.ball.position.y.toFixed(3), +s0.ball.position.z.toFixed(3), 1]);
  for (const p2 of NET.peers.values()) if (p2.ball && p2.ball.visible) bl.push([recId(p2.ball), +p2.ball.position.x.toFixed(3), +p2.ball.position.y.toFixed(3), +p2.ball.position.z.toFixed(3), 1]);
  const ppl = [['me', walk.x, walk.z, window.__rkOn ? RK.P[RK.my].jy || 0 : Math.max(0, camera.position.y - EYE), walk.yaw, myPoseCode(), NET.color || '#F2B705', NET.on ? NET.name : '你', myChar()]];
  for (const p2 of NET.peers.values()) ppl.push([p2.id, p2.x, p2.z, p2.y, p2.yaw, p2.pose, p2.c, p2.n, p2.ch || null]);
  const npcRow = (id, g, y, poseC, col, name, ch) => ppl.push([id, +g.position.x.toFixed(3), +g.position.z.toFixed(3), +(y || 0).toFixed(3), +(g.rotation.y - Math.PI).toFixed(3), poseC, col, name, ch || null]);
  if (VM.on) for (const a of VM.ai.values()) npcRow(a.id, a.av.g, a.y, a.swingT > 0 || a.y > 0 ? a.pose : 0, a.color, a.name, a.ch);
  if (VB.npc) npcRow('npc', VB.npc.av.g, 0, VB.npc.up > 0 ? 2 : 0, '#30A46C', '陪練', VB.npc.ch);
  if (RK.on) { for (const P of Object.values(RK.P)) if (P.ai && P.av) npcRow('rkai', P.av.g, P.jy, P.swing ? (P.swing.over ? 7 : 8) : 6, '#E5484D', P.name, P.ch); const q = RK.ballM.position; bl.push([recId(RK.ballM), +q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), RK.b.held != null ? 1 : 0, RK.k]); }
  return { t, b: bl, p: ppl };
}
// ---- 分析：每顆球的時間序列 → 落地點、擊球點與球速、最高點、過網次數
function recAnalyze(frames, events) {
  const tracks = new Map();
  for (const f of frames) for (const [id, x, y, z, held] of f.b) { if (!tracks.has(id)) tracks.set(id, []); tracks.get(id).push({ t: f.t, x, y, z, held: !!held }); }
  const bounces = [], hits = [], apex = [];
  let top = 0, fast = 0, crossings = 0;
  const courts = state.items.filter((c) => CAT[c.type].court === 'vb' && c.mode !== 'lines' && !c.use), rkcs = rkCourts();
  for (const [id, T] of tracks) {
    let upFrom = null;
    for (let i = 1; i < T.length - 1; i++) {
      const a = T[i - 1], b = T[i], c = T[i + 1], dt1 = b.t - a.t || 1 / 30, dt2 = c.t - b.t || 1 / 30;
      const v1 = [(b.x - a.x) / dt1, (b.y - a.y) / dt1, (b.z - a.z) / dt1], v2 = [(c.x - b.x) / dt2, (c.y - b.y) / dt2, (c.z - b.z) / dt2];
      const sp2 = Math.hypot(...v2);
      // 手上的球、瞬間跳很遠（換位置）的資料不拿來判斷
      if (a.held || b.held || c.held || sp2 > 45 || Math.hypot(...v1) > 45) continue;
      if (b.y < 0.16 && v1[1] < -0.3 && v2[1] >= -0.05) bounces.push({ t: b.t, x: b.x, z: b.z, id });
      // 速度方向突然改變、而且不是在地上 → 擊球（如果事件表裡沒有）
      const dot = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / ((Math.hypot(...v1) || 1) * (sp2 || 1));
      if (b.y > 0.5 && sp2 > 3 && (dot < 0.6 || sp2 > Math.hypot(...v1) * 1.6) && !events.some((e) => e.type === 'hit' && Math.abs(e.t - b.t) < 0.15)) hits.push({ t: b.t, x: b.x, y: b.y, z: b.z, v: sp2, auto: true });
      if (v1[1] > 0 && v2[1] <= 0 && b.y > 1.2) apex.push({ t: b.t, x: b.x, y: b.y, z: b.z });
      top = Math.max(top, b.y); fast = Math.max(fast, sp2 < 45 ? sp2 : 0);
      // 同一下只算一次（重疊的球場不會重複算）
      if (courts.some((ct) => { const [l0] = toLocalOf(ct, a.x, a.z), [l1, lz] = toLocalOf(ct, b.x, b.z); return Math.sign(l0) !== Math.sign(l1) && Math.abs(lz) < 4.75 && b.y > 2; })
        || rkcs.some((ct) => { const [u0] = rkL(ct, a.x, a.z), [u1, w1] = rkL(ct, b.x, b.z); return Math.sign(u0) !== Math.sign(u1) && Math.abs(w1) < RK_SPEC[ct.k].HWF + 0.2 && b.y > 0.5; })) crossings++;
      void upFrom;
    }
  }
  for (const e of events) if (e.type === 'hit' && (e.v || 0) < 45) { hits.push({ t: e.t, x: e.x, y: e.y, z: e.z, v: e.v, kind: e.kind }); fast = Math.max(fast, e.v || 0); }
  hits.sort((a, b) => a.t - b.t);
  return { tracks, bounces, hits, apex, top, fast, crossings, dur: frames.length ? frames[frames.length - 1].t : 0 };
}
// ---- 回放
const RP = { on: false, t: 0, playing: true, speed: 1, view: 'cam', A: null, g: null, actors: new Map(), ballsM: new Map(), trails: new Map(), marks: [], hud: null, hudT: 0, recorder: null, chunks: [] };
const KMH = (v) => Math.round(v * 3.6);
function labelSprite(text, color = '#F2B705', scale = 1) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const c = cv.getContext('2d');
  c.fillStyle = 'rgba(27,38,56,.88)'; c.beginPath(); c.roundRect ? c.roundRect(2, 2, 252, 60, 14) : c.rect(2, 2, 252, 60); c.fill();
  c.strokeStyle = color; c.lineWidth = 3; c.stroke(); c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 33);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
  sp.scale.set(1.1 * scale, 0.275 * scale, 1); sp.renderOrder = 20; return sp;
}
function openReplay() {
  if (REC.on) recToggle();
  if (REC.frames.length < 10) { toast('還沒有錄影：先按「● 錄影」，打完球再按停止'); return; }
  const A = recAnalyze(REC.frames, REC.events);
  RP.on = true; RP.A = A; RP.F = REC.frames; RP.hl = null; RP.t = 0; RP.playing = true; RP.speed = 1; RP.view = REC.cam ? 'cam' : 'top';
  { let sx = 0, sz = 0, n = 0; for (const T of A.tracks.values()) for (const q of T) { sx += q.x; sz += q.z; n++; } const mx = n ? sx / n : 0, mz = n ? sz / n : 0; RP.topC = state.items.filter((i) => CAT[i.type].court).sort((a, b) => Math.hypot(a.x - mx, a.z - mz) - Math.hypot(b.x - mx, b.z - mz))[0] || null; }
  RP.g = new THREE.Group(); scene.add(RP.g); RP.actors.clear(); RP.ballsM.clear(); RP.trails.clear(); RP.marks = [];
  // 現場的東西先藏起來，換成回放的人形與球
  ballsGroup.visible = false; hands.visible = false; for (const p2 of NET.peers.values()) { p2.av.g.visible = false; if (p2.ball) p2.ball.visible = false; }
  rpLive(false);
  walk.paused = true; walk.keys.clear(); unlockMouse(); closeCamView(true);
  // 落地點、擊球點、最高點標記（時間到了才出現）
  for (const b of A.bounces) { const ring = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.24, 32), new THREE.MeshBasicMaterial({ color: '#FF4D4F', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(b.x, 0.03, b.z); ring.visible = false; RP.g.add(ring); RP.marks.push({ t: b.t, o: ring, life: 4 }); }
  for (const h of A.hits) { const sp = labelSprite(`${KMH(h.v || 0)} km/h`, '#F2B705'); sp.position.set(h.x, h.y + 0.55, h.z); sp.visible = false; RP.g.add(sp); RP.marks.push({ t: h.t, o: sp, life: 2.2 }); }
  for (const a of A.apex) { const sp = labelSprite(`最高 ${a.y.toFixed(1)} m`, '#5BC0EB', 0.8); sp.position.set(a.x, a.y + 0.35, a.z); sp.visible = false; RP.g.add(sp); RP.marks.push({ t: a.t, o: sp, life: 1.6 }); }
  // 畫面角落的資訊（錄進影片裡）
  const hcv = document.createElement('canvas'); hcv.width = 512; hcv.height = 160; RP.hudCv = hcv;
  RP.hud = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hcv), depthTest: false, transparent: true })); RP.hud.renderOrder = 30; camera.add(RP.hud);
  $('rp').hidden = false; $('rp-time').max = A.dur.toFixed(2);
  $('rp-stats').innerHTML = `擊球 <b>${A.hits.length}</b> 次・最快 <b>${KMH(A.fast)}</b> km/h・最高 <b>${A.top.toFixed(1)}</b> m・過網 <b>${A.crossings}</b> 次・落地 <b>${A.bounces.length}</b> 次`;
  rpView(RP.view); rpSetPlay(true);
}
// 回放時把現場的人（陪練、AI 球員、球拍對戰的人和球、別人的 AI 對手）藏起來，只看回放裡的；關掉回放再放回來
function rpLive(show) {
  const objs = [];
  if (VB.npc) objs.push(VB.npc.av.g);
  for (const a of VM.ai.values()) objs.push(a.av.g);
  if (RK.on) { for (const P of Object.values(RK.P)) if (P.av) objs.push(P.av.g); objs.push(RK.ballM, RK.shadow, RK.trail, RK.landM, RK.stanceM); }
  for (const e of RKV.values()) objs.push(e.m, e.sh);
  for (const p2 of NET.peers.values()) if (p2.aiAv) objs.push(p2.aiAv.g);
  for (const o of objs) if (o) o.visible = show && (o !== RK.landM && o !== RK.stanceM);
  if (TP.av && !show) { TP.av.g.visible = false; TP.ball.visible = false; }
}
function closeReplay() {
  if (!RP.on) return;
  if (RP.recorder && RP.recorder.state !== 'inactive') RP.recorder.stop();
  RP.on = false; scene.remove(RP.g); RP.g = null; if (RP.hud) { camera.remove(RP.hud); RP.hud = null; }
  ballsGroup.visible = true; for (const p2 of NET.peers.values()) p2.av.g.visible = true; hands.visible = !!walk.hold;
  rpLive(true);
  walk.paused = false; $('rp').hidden = true; camera.fov = walkFov(); camera.updateProjectionMatrix();
  if (ceilingGroup) ceilingGroup.visible = true; if (typeof applyOverhead === 'function') applyOverhead();
}
function rpSetPlay(on) { RP.playing = on; $('rp-play').textContent = on ? '⏸' : '▶'; }
function rpView(v) { RP.view = v; RP.followJump = true; for (const b of document.querySelectorAll('[data-rpv]')) setPressed(b, b.dataset.rpv === v); }
function rpFrameAt(t) { const F = RP.F || REC.frames; let lo = 0, hi = F.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (F[m].t <= t) lo = m; else hi = m - 1; } return [F[lo], F[Math.min(F.length - 1, lo + 1)]]; }
function updateReplay(dt) {
  const A = RP.A;
  if (RP.hl) hlPace();
  if (!RP.on) return;
  if (RP.playing) { RP.t += dt * RP.speed; if (RP.t >= A.dur) { RP.t = A.dur; rpSetPlay(false); if (RP.hl) { hlLeave(); return; } if (RP.recorder && RP.recorder.state === 'recording') RP.recorder.stop(); } }
  $('rp-time').value = RP.t; $('rp-clock').textContent = `${RP.t.toFixed(1)} / ${A.dur.toFixed(1)} 秒`;
  const [f0, f1] = rpFrameAt(RP.t), k = f1.t > f0.t ? clamp((RP.t - f0.t) / (f1.t - f0.t), 0, 1) : 0;
  // 人
  const seen = new Set();
  for (const p0 of f0.p) {
    const [id, x, z, y, yaw, poseC, col, , ch] = p0, q = f1.p.find((r2) => r2[0] === id) || p0;
    let av = RP.actors.get(id); if (!av) { av = makeAvatar(col || '#F2B705', ch); RP.g.add(av.g); RP.actors.set(id, av); }
    seen.add(id); av.g.visible = true;
    const X = x + (q[1] - x) * k, Z = z + (q[2] - z) * k; let dy = q[4] - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const sp = Math.hypot(q[1] - x, q[2] - z) * 30;
    av.g.position.set(X, 0, Z); av.g.rotation.y = yaw + dy * k + Math.PI; av.body.position.y = y + (q[3] - y) * k;
    av.phase += dt * Math.min(12, sp * 5.5) * RP.speed;
    if (av.poseC !== poseC) { av.poseC = poseC; av.poseT = 0; } av.poseT = (av.poseT || 0) + dt * RP.speed;
    av.fall = poseC >= 10 && poseC <= 12 ? { a: 1, d: DIVE_D[poseC - 10] } : null;
    avDrive(av, avPoseOf(poseC, av.poseT / 0.45), 0.4, sp, av.body.position.y > 0.08);
  }
  for (const [id, av] of RP.actors) if (!seen.has(id)) av.g.visible = false;
  // 球＋軌跡（最近 2.5 秒，越舊越淡）
  const live = new Set();
  for (const [id, x, y, z, , sk] of f0.b) {
    const q = f1.b.find((r2) => r2[0] === id) || [id, x, y, z];
    let m = RP.ballsM.get(id); if (!m) { m = sk ? rkBallMesh(sk) : newBallMesh(); RP.g.add(m); RP.ballsM.set(id, m); }
    m.visible = true; m.position.set(x + (q[1] - x) * k, y + (q[2] - y) * k, z + (q[3] - z) * k); live.add(id);
    if (sk === 'bd') { if (Math.hypot(q[1] - x, q[2] - y, q[3] - z) > 1e-3) m.lookAt(m.position.x + (q[1] - x), m.position.y + (q[2] - y), m.position.z + (q[3] - z)); } else m.rotation.x += dt * 6 * RP.speed;
    const T = A.tracks.get(id) || [], pts = T.filter((p0) => p0.t <= RP.t && p0.t >= RP.t - 2.5);
    let tr = RP.trails.get(id);
    if (!tr) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(80 * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(80 * 3), 3)); tr = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: false })); tr.renderOrder = 15; tr.frustumCulled = false; RP.g.add(tr); RP.trails.set(id, tr); }
    const step = Math.max(1, Math.ceil(pts.length / 79)), use = pts.filter((_, i) => i % step === 0).concat([{ x: m.position.x, y: m.position.y, z: m.position.z, t: RP.t }]);
    const pa = tr.geometry.attributes.position, ca = tr.geometry.attributes.color;
    use.forEach((p0, i) => { pa.setXYZ(i, p0.x, p0.y, p0.z); const a = i / Math.max(1, use.length - 1); ca.setXYZ(i, 0.95 * a + 0.1, 0.72 * a + 0.1, 0.05 + 0.1 * (1 - a)); });
    pa.needsUpdate = ca.needsUpdate = true; tr.geometry.setDrawRange(0, use.length); tr.visible = true;
  }
  for (const [id, m] of RP.ballsM) if (!live.has(id)) { m.visible = false; const tr = RP.trails.get(id); if (tr) tr.visible = false; }
  for (const mk of RP.marks) { const age = RP.t - mk.t; mk.o.visible = age >= 0 && age < mk.life; if (mk.o.visible && mk.o.material) mk.o.material.opacity = Math.min(1, 1.4 - age / mk.life); }
  // 鏡頭
  if (RP.view === 'hl') { try { hlCamera(); } catch (e) { console.error('[得分精華] 鏡頭出錯', e); hlAbort(); return; } }
  else if (RP.view === 'cam' && REC.cam) { camera.position.copy(REC.cam.p); camera.quaternion.copy(REC.cam.q); camera.fov = REC.cam.fov; }
  else if (RP.view === 'top') { const c = RP.topC || state.items.find((i) => CAT[i.type].court === 'vb') || { x: 0, z: 0 }; camera.position.set(c.x + 0.01, 24, c.z + 9); camera.lookAt(c.x, 0, c.z); camera.fov = 55; }
  else {
    // 跟著球：鏡頭擺在球往館內（最近的球場中心）那一側，並限制在建物裡面，不會穿到牆外
    const m = [...RP.ballsM.values()].find((q) => q.visible);
    if (m) {
      const tgt = m.position, cs = state.items.filter((i) => CAT[i.type].court);
      const c = cs.sort((a, b) => Math.hypot(a.x - tgt.x, a.z - tgt.z) - Math.hypot(b.x - tgt.x, b.z - tgt.z))[0] || { x: 0, z: 0 };
      const back = new THREE.Vector3(c.x - tgt.x, 0, c.z - tgt.z); if (back.lengthSq() < 1) back.set(0, 0, 1); back.normalize().multiplyScalar(6);
      const P = outlinePoly(), xs = P.map((q) => q[0]), zs = P.map((q) => q[1]);
      const want = new THREE.Vector3(THREE.MathUtils.clamp(tgt.x + back.x, Math.min(...xs) + 0.8, Math.max(...xs) - 0.8), Math.min(Math.max(2.2, tgt.y + 1.5), Math.max(2.5, state.building.H - 0.8)), THREE.MathUtils.clamp(tgt.z + back.z, Math.min(...zs) + 0.8, Math.max(...zs) - 0.8));
      if (RP.followJump) { camera.position.copy(want); RP.followJump = false; } else camera.position.lerp(want, 0.12);
      camera.lookAt(tgt);
    }
    camera.fov = 60;
  }
  camera.updateProjectionMatrix();
  // 角落資訊
  if (RP.hud && RP.hl && performance.now() - RP.hudT > 100) {   // 得分精華（下載的影片）：Play One 配色的簡單標籤
    RP.hudT = performance.now();
    const c = RP.hudCv.getContext('2d'); c.clearRect(0, 0, 512, 120); c.fillStyle = 'rgba(12,51,36,.9)'; c.fillRect(0, 0, 512, 120); c.fillStyle = '#D9B76A'; c.fillRect(0, 0, 8, 120);
    c.font = 'italic 900 24px sans-serif'; c.fillText('REPLAY', 26, 44); c.fillStyle = '#fff'; c.font = 'bold 32px sans-serif'; c.fillText(hlSeg()?.title || '', 26, 92);
    RP.hud.material.map.needsUpdate = true;
  } else if (RP.hud && performance.now() - RP.hudT > 100) {
    RP.hudT = performance.now();
    const c = RP.hudCv.getContext('2d'); c.clearRect(0, 0, 512, 160); c.fillStyle = 'rgba(27,38,56,.82)'; c.fillRect(0, 0, 512, 160); c.fillStyle = '#F2B705'; c.fillRect(0, 0, 6, 160);
    c.fillStyle = '#F2B705'; c.font = 'bold 30px sans-serif'; c.fillText('球路偵測回放', 22, 42);
    const hitsSoFar = A.hits.filter((h) => h.t <= RP.t), lastHit = hitsSoFar[hitsSoFar.length - 1];
    c.fillStyle = '#fff'; c.font = '24px sans-serif';
    c.fillText(`擊球 ${hitsSoFar.length}　最快 ${KMH(Math.max(0, ...hitsSoFar.map((h) => h.v || 0)))} km/h`, 22, 84);
    c.fillText(`${lastHit ? '上一球 ' + KMH(lastHit.v || 0) + ' km/h　' : ''}${RP.t.toFixed(1)} 秒`, 22, 120);
    RP.hud.material.map.needsUpdate = true;
  }
  const aspect = renderer.domElement.width / renderer.domElement.height, dist = 1, hh = Math.tan(((camera.fov / 2) * Math.PI) / 180) * dist;
  if (RP.hud) { RP.hud.position.set(-hh * aspect + 0.36, hh - 0.13, -dist); RP.hud.scale.set(0.64, RP.hl ? 0.15 : 0.2, 1); }
}
// 下載影片：從頭用 1 倍速播一次，同時錄下畫面（WebM）
function rpDownload() {
  const cv = renderer.domElement;
  if (!cv.captureStream || typeof MediaRecorder === 'undefined') { toast('這個瀏覽器不支援錄影片，請用電腦版 Chrome 或 Edge'); return; }
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t2) => MediaRecorder.isTypeSupported(t2)) || 'video/webm';
  RP.chunks = []; RP.recorder = new MediaRecorder(cv.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 });
  RP.recorder.ondataavailable = (e) => { if (e.data.size) RP.chunks.push(e.data); };
  RP.recorder.onstop = () => {
    const blob = new Blob(RP.chunks, { type: 'video/webm' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `球路回放-${new Date().toLocaleDateString('zh-TW').replace(/\//g, '')}.webm`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 20000); toast('影片存好了（WebM，可以用瀏覽器或 VLC 播）'); $('rp-dl').disabled = false;
  };
  RP.t = 0; RP.speed = 1; rpSetPlay(true); RP.recorder.start(200); $('rp-dl').disabled = true;
  toast('錄製中：從頭播一次，播完就會下載');
}
// ---- 得分精華（WEB-025）：比賽中每台電腦自己記最近 10 秒（不多傳任何訊息）；有人打出得分（不含對手失誤送分）
//      就用 Play One 球斜拉轉場、從第三人稱重播那一球；自己得的分另外收起來，比賽結束可以下載成一支影片（在自己電腦上產生，伺服器不存）
const HL = { buf: [], ids: new Map(), nid: 0, last: 0, mine: [], wasOn: false, pendT: 0, btn: null, tag: null, tr: null, css: false };
const HL_KIND = { spike: '扣球', tip: '吊球', hit: '攻擊', serve: '發球', block: '攔網' };
// 擊球前、落地後各錄幾秒、片段最長幾秒、轉場幾秒（改了要一起改 12-match-2v2.js 的 HL_GAP：落地後 + 轉場×2 + 片段最長 + 慢動作多出來的）
const HL_PRE = 2.5, HL_POST = 1.2, HL_MAX = 5.2, HL_TR = 1.2;
function hlId(o) { if (!HL.ids.has(o.uuid)) HL.ids.set(o.uuid, ++HL.nid); return HL.ids.get(o.uuid); }
function hlReset() { HL.buf = []; HL.mine = []; HL.ids.clear(); HL.nid = 0; clearTimeout(HL.pendT); hlButton(false); }
function hlTick(now) {
  if (VM.on && !HL.wasOn) { HL.wasOn = true; hlReset(); }
  else if (!VM.on && HL.wasOn) { HL.wasOn = false; HL.buf = []; if (HL.mine.length) { hlButton(true); toast(`比賽結束：你有 ${HL.mine.length} 球得分精華，按 Esc 放開滑鼠，點右下角就能下載`, 4500); } }
  if (!VM.on || RP.on || now - HL.last < 33) return;
  HL.last = now; HL.buf.push(recFrame(now / 1000, hlId));
  while (HL.buf.length && HL.buf[0].t < now / 1000 - 10) HL.buf.shift();
}
// 得分了：by＝打出這一分的人（null＝對手失誤送分，不重播；undefined＝舊版伺服器沒帶，只重播落地得分）
function hlOnPoint(win, why, by, kind) {
  if (!walk.on) return;
  if (by === undefined) { if (!/落地得分/.test(why || '')) return; by = null; }
  else if (!by) return;
  clearTimeout(HL.pendT);
  HL.pendT = setTimeout(() => { try { hlCut(by, kind); } catch (e) { console.error('[得分精華] 剪片段失敗', e); hlAbort(); } }, HL_POST * 1000);   // 先在現場看球落地，順便把落地後的畫面錄進來
}
function hlCut(by, kind) {
  if (!HL.buf.length || RP.on || HL.tr || !VM.on) return;
  const end = HL.buf[HL.buf.length - 1].t, fr = HL.buf.filter((f) => f.t >= end - 9.5);
  if (fr.length < 30) return;
  const t0 = fr[0].t, frames = fr.map((f) => ({ t: f.t - t0, b: f.b, p: f.p })), d = frames[frames.length - 1].t, land = d - HL_POST;
  const hit = recAnalyze(frames, []).hits.filter((h) => h.t < land - 0.05).pop();   // 最後一下擊球（扣、吊、發、攔）
  const start = Math.max(0, (hit ? hit.t : land - 0.8) - HL_PRE, d - HL_MAX);
  const clip = frames.filter((f) => f.t >= start).map((f) => ({ t: f.t - start, b: f.b, p: f.p }));
  const me = !!by && by === vmMe(), name = by ? (me ? '你' : vmName(by)) : '';
  const c = { frames: clip, by: me ? 'me' : by, hit: hit ? hit.t - start : null, title: by ? `${name} ${HL_KIND[kind] || ''}得分` : '得分', kind, court: VM.c ? { x: VM.c.x, z: VM.c.z, rot: VM.c.rot || 0 } : null };
  if (me) HL.mine.push(c);
  hlWipe(() => hlOpen([c], false));
}
// 播一段或好幾段（下載時把自己的得分接成一支）；rec＝同時錄成影片
function hlOpen(clips, rec) {
  if (RP.on || !clips.length) return false;
  try { return hlOpen0(clips, rec); } catch (e) { console.error('[得分精華] 開重播失敗', e); hlAbort(); return false; }
}
// 重播出錯：直接收掉回到現場，不能讓比賽卡在重播畫面
function hlAbort() { try { if (RP.on) closeReplay(); } catch (e) { /* 收不乾淨也要放開 */ } if (RP.hl) walk.paused = RP.hl.paused; RP.on = false; RP.hl = null; RP.F = null; if (HL.tag) HL.tag.hidden = true; if (HL.tr) { HL.tr.el.remove(); HL.tr = null; } }
function hlOpen0(clips, rec) {
  const F = [], segs = []; let t = 0;
  for (const c of clips) {
    for (const f of c.frames) F.push({ t: t + f.t, b: f.b, p: f.p });
    const d = c.frames[c.frames.length - 1].t;
    segs.push({ t0: t, t1: t + d, by: c.by, hit: c.hit != null ? t + c.hit : null, title: c.title, kind: c.kind, court: c.court });
    t += d + 1 / 30;
  }
  const A = recAnalyze(F, []);
  RP.on = true; RP.A = A; RP.F = F; RP.t = 0; RP.playing = true; RP.speed = 1; RP.view = 'hl'; RP.followJump = true; RP.hlPh = '';
  RP.hl = { segs, rec, paused: walk.paused, ph0: VM.phase, at: performance.now(), cancel: false, seg: null };
  RP.g = new THREE.Group(); scene.add(RP.g); RP.actors.clear(); RP.ballsM.clear(); RP.trails.clear(); RP.marks = [];
  ballsGroup.visible = false; hands.visible = false; for (const p2 of NET.peers.values()) { p2.av.g.visible = false; if (p2.ball) p2.ball.visible = false; }
  rpLive(false); walk.paused = true;
  if (rec) {   // 影片裡沒有網頁上的字：用畫面角落的資訊框寫這球是誰得分
    const hcv = document.createElement('canvas'); hcv.width = 512; hcv.height = 120; RP.hudCv = hcv; RP.hudT = 0;
    RP.hud = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hcv), depthTest: false, transparent: true })); RP.hud.renderOrder = 30; camera.add(RP.hud);
    const cv = renderer.domElement, type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t2) => MediaRecorder.isTypeSupported(t2)) || 'video/webm';
    RP.chunks = []; RP.recorder = new MediaRecorder(cv.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 });
    RP.recorder.ondataavailable = (e) => { if (e.data.size) RP.chunks.push(e.data); };
    const hl = RP.hl;
    RP.recorder.onstop = () => {
      if (hl.cancel) { toast('已取消，精華還在，可以再按一次下載'); hlButton(true); return; }
      const blob = new Blob(RP.chunks, { type: 'video/webm' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `我的得分精華-${new Date().toLocaleDateString('zh-TW').replace(/\//g, '')}.webm`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 20000); toast('得分精華存好了（WebM，可以用瀏覽器或 VLC 播）', 4000); hlButton(true);
    };
    RP.recorder.start(200);
  }
  hlTagShow();
  return true;
}
function hlSeg() { const s = RP.hl && RP.hl.segs; return s ? s.find((q) => RP.t <= q.t1) || s[s.length - 1] : null; }
// 每格：播放速度（得分那一下前後放慢）、下一球要發了就收掉、做影片時更新第幾球
function hlPace() {
  const H = RP.hl;
  if (!H.rec && (!VM.on || (VM.phase === 'serve' && H.ph0 !== 'serve') || performance.now() - H.at > (HL_MAX + 1.2 + HL_TR) * 1000)) { hlLeave(); return; }
  const s = hlSeg();
  RP.speed = s && s.hit != null && RP.t > s.hit - 0.12 && RP.t < s.hit + 0.33 ? 0.5 : 1;
  if (s && H.seg !== s) { H.seg = s; RP.hudT = 0; RP.followJump = true; RP.hlPh = ''; hlTagShow(); }
}
// 結束重播：做影片時直接收；平常用轉場換回現場
function hlLeave() { if (!RP.hl || HL.tr) return; if (RP.hl.rec) hlEnd(); else hlWipe(hlEnd); }
function hlEnd() {
  if (!RP.hl) return;
  const H = RP.hl;
  closeReplay();
  walk.paused = H.paused; RP.hl = null; RP.F = null;
  if (HL.tag) HL.tag.hidden = true;
}
function hlSkip(cancelRec) { if (!RP.hl) return false; if (RP.hl.rec) { if (cancelRec) { RP.hl.cancel = true; hlEnd(); } return true; } if (performance.now() - RP.hl.at < 300) return true; hlLeave(); return true; }
// ---- 轉場（使用者畫的樣子）：一條接近垂直、上端偏右的粗分界線從右往左掃，分界線左邊是原本的畫面（先凍結成一張圖）、右邊是新的畫面；
//      Play One 球在分界線前面一點、從右往左下橫著飛，後面拖著一條飄動的 PLAY ONE 旗帶（往右上飄、會跨過分界線）
function hlCss() {
  if (HL.css) return; HL.css = true;
  const st = document.createElement('style');
  st.textContent = `.hl-wipe{position:fixed;z-index:70;pointer-events:none;overflow:hidden}.hl-wipe canvas{position:absolute;inset:0;width:100%;height:100%}
.hl-line{position:absolute;left:0;top:0;width:26px;transform-origin:50% 50%;background:linear-gradient(90deg,#0c3324 0 4px,#D9B76A 4px calc(100% - 4px),#0c3324 calc(100% - 4px));box-shadow:0 0 22px rgba(0,0,0,.5)}
.hl-rib{position:absolute;left:0;top:0;overflow:visible;transform-origin:0 50%;filter:drop-shadow(0 8px 14px rgba(0,0,0,.45))}
.hl-ball{position:absolute;left:0;top:0;width:150px;height:150px;filter:drop-shadow(0 8px 16px rgba(0,0,0,.55))}
.hl-tag{position:fixed;left:50%;bottom:128px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:12px;padding:8px 18px 8px 8px;border-radius:10px;background:rgba(12,51,36,.9);border:1px solid #D9B76A;color:#fff;font:600 19px/1.3 'Segoe UI',sans-serif;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.35)}
.hl-tag b{background:#D9B76A;color:#0c3324;font:italic 900 15px/1 'Arial Black',sans-serif;letter-spacing:.12em;padding:6px 10px;border-radius:6px}
.hl-tag small{font-weight:400;font-size:13px;opacity:.7;margin-left:6px}`;
  document.head.appendChild(st);
}
const HL_RIB = { L: 500, H: 160 };   // 旗帶的畫布大小（px）
function hlWipe(swap) {
  hlCss();
  const src = renderer.domElement, r = src.getBoundingClientRect(), fz = document.createElement('canvas');
  fz.width = src.width; fz.height = src.height;
  try { renderScene(); fz.getContext('2d').drawImage(src, 0, 0); } catch (e) { /* 拍不到就只有球和旗帶 */ }
  const el = document.createElement('div'); el.className = 'hl-wipe'; el.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  const line = document.createElement('div'); line.className = 'hl-line'; line.style.height = `${r.height * 1.3}px`;
  const NS = 'http://www.w3.org/2000/svg', rib = document.createElementNS(NS, 'svg'), uid = 'hlrib' + Date.now();
  rib.setAttribute('class', 'hl-rib'); rib.setAttribute('width', HL_RIB.L); rib.setAttribute('height', HL_RIB.H); rib.setAttribute('viewBox', `0 0 ${HL_RIB.L} ${HL_RIB.H}`);
  rib.innerHTML = `<path class="hl-rib-body" fill="#0c3324" stroke="#D9B76A" stroke-width="5" stroke-linejoin="round"/><path id="${uid}" fill="none"/><text font-family="'Arial Black','Segoe UI',sans-serif" font-style="italic" font-weight="900" font-size="44" letter-spacing="5" fill="#F1DDA4" dominant-baseline="central"><textPath href="#${uid}" startOffset="16%">PLAY ONE</textPath></text>`;
  const ball = document.createElement('img'); ball.className = 'hl-ball'; ball.src = 'assets/img/brand/ball-512.webp'; ball.alt = '';
  el.append(fz, line, rib, ball); document.body.appendChild(el);
  HL.tr = { el, fz, line, rib, body: rib.querySelector('.hl-rib-body'), mid: rib.querySelector('#' + uid), ball, W: r.width, H: r.height, t0: performance.now() };
  try { swap(); } catch (e) { console.error(e); }
  hlWipeStep();
}
function hlWipeStep() {
  const T = HL.tr; if (!T) return;
  try { hlWipeStep0(T); } catch (e) { console.error('[得分精華] 轉場出錯', e); T.el.remove(); HL.tr = null; }
}
function hlWipeStep0(T) {
  // 三段速度：快速飛進來（前 25% 時間走到 42%）→ 中間放慢讓 PLAY ONE 看得清楚（到 75% 時間才走到 58%）→ 加速飛出左邊
  const now = performance.now(), p = Math.min(1, (now - T.t0) / (HL_TR * 1000));
  const e = p < 0.25 ? 0.42 * (1 - (1 - p / 0.25) ** 2) : p < 0.75 ? 0.42 + 0.16 * ((p - 0.25) / 0.5) : 0.58 + 0.42 * ((p - 0.75) / 0.25) ** 2;
  const { W, H } = T, s = 0.13, lead = 150;   // s：分界線的斜度（往下每 1 px 往左 0.13 px）；lead：球在分界線前面多少
  const c = W + 240 - e * (W + 640);   // 分界線在畫面中間高度的 x：從右邊外面掃到左邊外面（連旗帶尾巴都要掃出去）
  const lineX = (y) => c + s * (H / 2 - y);
  T.fz.style.clipPath = `polygon(0 0, ${lineX(0)}px 0, ${lineX(H)}px ${H}px, 0 ${H}px)`;
  T.line.style.transform = `translate(${c - 13}px, ${H / 2 - parseFloat(T.line.style.height) / 2}px) rotate(${Math.atan(s)}rad)`;
  const by = H * (0.36 + 0.26 * e), bx = lineX(by) - lead;   // 球：從右邊偏上橫著飛到左邊偏下
  T.ball.style.transform = `translate(${bx - 75}px, ${by - 75}px) rotate(${-e * 720}deg)`;
  // 旗帶：頭接在球的右邊、往右上飄（-15°），上下兩邊跟中線一起波浪擺動，越往尾巴擺越大
  const { L, H: RH } = HL_RIB, ph = (now - T.t0) / 1000 * 9, top = [], bot = [], mid = [];
  for (let i = 0; i <= 25; i++) {
    const x = (L * i) / 25, f = x / L, yc = RH / 2 + (6 + 16 * f) * Math.sin(x / 60 - ph), hh = 40 - 7 * f;
    top.push(`${x.toFixed(1)},${(yc - hh).toFixed(1)}`); bot.unshift(`${x.toFixed(1)},${(yc + hh).toFixed(1)}`); mid.push(`${x.toFixed(1)},${yc.toFixed(1)}`);
  }
  T.body.setAttribute('d', `M${top.join(' L')} L${bot.join(' L')} Z`);
  T.mid.setAttribute('d', `M${mid.join(' L')}`);
  T.rib.style.transform = `translate(${bx + 45}px, ${by - RH / 2 - 6}px) rotate(-15deg)`;
  if (p < 1) { requestAnimationFrame(hlWipeStep); return; }
  T.el.remove(); HL.tr = null;
}
function hlTagShow() {
  hlCss();
  if (!HL.tag) { HL.tag = document.createElement('div'); HL.tag.className = 'hl-tag'; document.body.appendChild(HL.tag); }
  const H = RP.hl, s = hlSeg(); if (!H || !s) return;
  HL.tag.innerHTML = H.rec ? `<b>REPLAY</b>🎬 正在做你的得分精華（第 ${H.segs.indexOf(s) + 1}／${H.segs.length} 球）<small>Esc 取消</small>` : `<b>REPLAY</b>${esc(s.title)}<small>任意鍵跳過</small>`;
  HL.tag.hidden = false;
}
// ---- 鏡頭（第三人稱、照球場方向擺）：擊球前在得分者身後斜上方；擊球前後（慢動作）切到網子側邊、跟他同高近看；擊球後拉回後方跟球到落地
function hlCamera() {
  const s = hlSeg(), av = s && s.by ? RP.actors.get(s.by) : null;
  const P0 = av && av.g.visible ? av.g.position : null;
  const C = (s && s.court) || VM.c || state.items.find((i) => CAT[i.type].court === 'vb') || { x: 0, z: 0, rot: 0 };
  let m = null, md = Infinity;
  for (const q of RP.ballsM.values()) if (q.visible) { const dd = P0 ? q.position.distanceTo(P0) : 0; if (dd < md) { md = dd; m = q; } }
  if (!P0 && !m) return;
  const L = (v) => toLocalOf(C, v.x, v.z), W = (lx, lz, y) => { const [x, z] = toWorldOf(C, lx, lz); return new THREE.Vector3(x, y, z); };
  const [sx, sz] = L(P0 || m.position), side = Math.sign(sx) || 1;   // side：得分者在網子哪一邊（球場座標 x 的正負）
  const bodyY = av ? av.body.position.y : 0, ph = !s || s.hit == null ? 'ball' : RP.t < s.hit - 0.35 ? 'back' : RP.t < s.hit + 0.55 ? 'side' : 'follow';
  // 每個階段有好幾個機位（球場座標的偏移：[往後, 往旁, 高度]，往後＝離網子更遠）；剪接的那一刻挑「沒被別人擋住、沒被牆擠進來」的那個，整段都用它
  let focus, cands;
  if (ph === 'back' && P0) {   // 身後：左肩、右肩、高一點
    focus = W(sx - side * 2.2, sz, 1.3 + bodyY * 0.7); if (m) focus.lerp(m.position, 0.25);
    cands = [[3.4, -1.3, 2.2], [3.4, 1.3, 2.2], [4.6, 0, 3.6]];
  } else if (ph === 'side' && P0) {   // 擊球：兩側同高、隔著網從正面看
    focus = W(sx - side * 0.4, sz, 1.5 + bodyY); if (m) focus.lerp(m.position, 0.4);
    const hy = THREE.MathUtils.clamp(1.4 + bodyY, 1.5, 3.2);
    // 依得分方式排機位的優先順序（排前面＝比較想用；被擋住才往後換）：
    //   扣球／吊球：先用攻擊手那一側的邊線機位（大砲在左邊就從左邊拍、副攻手在右邊就從右邊拍），再來另一側、隔網正面
    //   攔網：先從對面拍（球被攔回來、朝鏡頭飛），再來網子邊線方向沿著網子拍
    //   發球：先在發球者斜後方，再來兩側
    const out = Math.sign(sz) || 1, net = -Math.abs(sx), across = (d) => -(Math.abs(sx) + d);
    const sideA = [0.8, out * 4.3, hy], sideB = [0.8, -out * 4.3, hy], front = [across(2.6), out * 1.8, hy + 0.6], front2 = [across(2.6), -out * 1.8, hy + 0.6];
    const k = s && s.kind;
    if (k === 'block') cands = [[across(3.6), out * 1.4, 2.6], [across(3.6), -out * 1.4, 2.6], [net, out * 4.6, 2.9], [net, -out * 4.6, 2.9], sideA];
    else if (k === 'serve') cands = [[2.4, out * 2.6, 2.0], [2.4, -out * 2.6, 2.0], sideA, sideB];
    else cands = [sideA, sideB, front, front2];
  } else {   // 擊球後（或不知道誰打的）：後方高處、側面高處跟著球
    focus = m ? m.position.clone() : (P0 || m.position).clone().setY(1.2);
    cands = [[5, 0, 3.3], [2, 5, 3.4], [2, -5, 3.4]];
  }
  const [bx, bz] = L(P0 || m.position);
  const toWorld = (q) => W(bx + side * q[0], bz + q[1] - (ph === 'follow' || ph === 'ball' ? bz * 0.4 : 0), q[2]);
  const P = outlinePoly(), xs = P.map((q) => q[0]), zs = P.map((q) => q[1]), topY = Math.max(2, state.building.H - 0.8);
  const fit = (v) => { const o = v.clone(); v.x = THREE.MathUtils.clamp(v.x, Math.min(...xs) + 0.8, Math.max(...xs) - 0.8); v.z = THREE.MathUtils.clamp(v.z, Math.min(...zs) + 0.8, Math.max(...zs) - 0.8); v.y = Math.min(v.y, topY); return o.distanceTo(v); };
  const cut = RP.followJump || ph !== RP.hlPh;   // 換階段＝剪接：直接換機位
  if (cut) {
    const targets = [P0 ? P0.clone().setY(1.2 + bodyY) : null, m ? m.position.clone() : null].filter(Boolean);
    const others = [...RP.actors.entries()].filter(([id, a]) => a.g.visible && id !== (s && s.by)).map(([, a]) => a.g.position);
    let best = 0, bestS = Infinity;
    cands.forEach((q, i) => {
      const v = toWorld(q), moved = fit(v);
      let block = 0;   // 機位到目標的線段經過別人（當成半徑 0.45 m、高 2 m 的柱子）＝被擋住
      for (const tg of targets) for (const o of others) {
        const d = tg.clone().sub(v), h2 = d.x * d.x + d.z * d.z || 1;
        const k = ((o.x - v.x) * d.x + (o.z - v.z) * d.z) / h2;   // 那個人在線段上的位置（0＝機位、1＝目標）
        if (k < 0.05 || k > 0.95) continue;
        if (Math.hypot(v.x + d.x * k - o.x, v.z + d.z * k - o.z) < 0.45 && v.y + d.y * k < 2) block++;
      }
      const score = block * 10 + moved * 3 + i * 1.5;   // 沒被擋、沒被牆擠時，照上面排的優先順序
      if (score < bestS) { bestS = score; best = i; }
    });
    RP.hlPick = best;
  }
  const want = toWorld(cands[Math.min(RP.hlPick || 0, cands.length - 1)]); fit(want);
  RP.hlPh = ph;
  if (cut || !RP.hlLook) { camera.position.copy(want); RP.hlLook = focus.clone(); RP.followJump = false; }
  else { camera.position.lerp(want, ph === 'follow' ? 0.06 : 0.1); RP.hlLook.lerp(focus, 0.18); }
  camera.lookAt(RP.hlLook); camera.fov = ph === 'side' ? 48 : 58;
}
function hlButton(show) {
  if (!show) { if (HL.btn) HL.btn.hidden = true; return; }
  if (!HL.mine.length) return;
  if (!HL.btn) {
    HL.btn = document.createElement('div'); HL.btn.style.cssText = 'position:fixed;right:18px;bottom:96px;z-index:60;display:flex;gap:6px';
    HL.btn.innerHTML = '<button type="button" data-hl="dl" style="padding:10px 16px;border-radius:10px;border:2px solid #D9B76A;background:#0c3324;color:#fff;font:600 16px sans-serif;cursor:pointer"></button><button type="button" data-hl="x" title="收起來" style="padding:10px 12px;border-radius:10px;border:0;background:rgba(0,0,0,.55);color:#fff;cursor:pointer">✕</button>';
    HL.btn.addEventListener('click', (e) => { const k = e.target.closest('[data-hl]')?.dataset.hl; if (k === 'x') hlButton(false); else if (k === 'dl') hlDownload(); });
    document.body.appendChild(HL.btn);
  }
  HL.btn.querySelector('[data-hl="dl"]').textContent = `🎬 下載我的得分精華（${HL.mine.length} 球）`;
  HL.btn.hidden = false;
}
function hlDownload() {
  if (!renderer.domElement.captureStream || typeof MediaRecorder === 'undefined') { toast('這個瀏覽器不支援錄影片，請用電腦版 Chrome 或 Edge'); return; }
  if (RP.on || VM.on) { toast('比賽中不能做精華，打完再按'); return; }
  if (hlOpen(HL.mine, true)) hlButton(false);
}
// ---- 門的清單：buildZones／buildBuilding 重建時清空
const zoneDoors = [], mainDoors = [], zoneRoofs = [];
const doorMat = new THREE.MeshStandardMaterial({ color: '#E9E6DF', roughness: 0.6 });
// 鉸鍊門：a→b 是門洞，n 是往外的法線（門往外開）
function addHingedDoor(g, a, b, n, kind) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
  const pivot = new THREE.Group(), base = Math.atan2(-uz, ux); pivot.position.set(a[0], 0, a[1]); pivot.rotation.y = base; g.add(pivot);
  const leafMat = kind === 'glass' ? glassMat : kind === 'frost' ? frostMat : doorMat;
  const leaf = box(pivot, len - 0.04, 2.02, 0.04, leafMat, len / 2, 0.02, 0); if (kind !== 'solid') { leaf.userData.noInk = true; leaf.renderOrder = 2; }
  if (kind !== 'solid') { box(pivot, len - 0.04, 0.05, 0.05, frameMat, len / 2, 0.02, 0); box(pivot, len - 0.04, 0.05, 0.05, frameMat, len / 2, 1.99, 0); box(pivot, 0.05, 2.02, 0.05, frameMat, len - 0.05, 0.02, 0); }
  for (const zs of [-1, 1]) box(pivot, 0.025, 0.16, 0.03, chrome, len - 0.12, 0.95, zs * 0.04);
  const sgn = uz * n[0] - ux * n[1] > 0 ? 1 : -1;
  const d = { pivot, base, s: sgn, t: 0, open: false, seg: [a[0], a[1], b[0], b[1]] };
  pivot.traverse((o) => { if (o.isMesh) o.userData.door = d; });
  zoneDoors.push(d); return d;
}
// 走到哪一區：先看畫的區域，再看球場
function zoneAt(x, z) {
  const hits = state.zones.map((q, i) => ({ q, i })).filter(({ q }) => inZone(q, x, z)).sort((a, b) => ((a.q.type === 'floor') - (b.q.type === 'floor')) || (a.q.w * a.q.d - b.q.w * b.q.d));
  if (hits.length) return { kind: 'zone', z: hits[0].q, i: hits[0].i };
  const courts = state.items.filter((c) => CAT[c.type].court && c.mode !== 'lines');
  for (const c of courts) if (pip(x, z, footprint(c))) return { kind: 'court', c };
  return null;
}
// 站在哪一面球場上（不管上面有沒有畫區域）：球場的按鈕列（陪練、2 對 2、6 對 6）看這個
function courtHere(x, z) { return state.items.find((c) => CAT[c.type].court && c.mode !== 'lines' && pip(x, z, footprint(c))) || null; }
function itemsIn(test) { return state.items.filter((it) => !CAT[it.type].court && !CAT[it.type].wall && test(it.x, it.z)); }
function updateZoneCard(force) {
  const hit = zoneAt(walk.x, walk.z), here = courtHere(walk.x, walk.z), key = (hit ? (hit.kind === 'zone' ? hit.z.id : hit.c.id) : '') + '|' + (here ? here.id : ''), rk = rkCourtNear(walk.x, walk.z), rkKey = rk ? rk.key : '';
  if (!force && key === walk.zoneKey && rkKey === walk.rkKey) return;
  walk.zoneKey = key; walk.rkKey = rkKey;
  const card = $('zcard');
  if (!hit) { card.classList.add('out'); renderUseBar(here); return; }
  const dl = [];
  if (hit.kind === 'zone') {
    const q = hit.z, Z = ZONES[q.type], inside = itemsIn((x, z) => inZone(q, x, z));
    $('zc-k').textContent = `ZONE ${String(hit.i + 1).padStart(2, '0')} · ${Z.en}`;
    $('zc-n').textContent = ({ open: '開放空間', glass: '玻璃隔間', frost: '霧面玻璃隔間', solid: '組合屋', net: '圍網' })[zoneWalls(q)];
    $('zc-t').textContent = zoneName(q);
    $('zc-d').textContent = q.desc || Z.desc;
    dl.push(['面積', `${fmt1(q.w * q.d)} m²`], ['坪數', `${fmt1(q.w * q.d / PING)} 坪`], ['設備', inside.length ? `${inside.length} 件` : '—']);
  } else {
    const c = hit.c, def = CAT[c.type], fp = footprint(c);
    const over = state.items.filter((i) => (i.type === 'light' || i.type === 'fan') && pip(i.x, i.z, fp));
    $('zc-k').textContent = `COURT · ${def.court.toUpperCase()}`;
    $('zc-n').textContent = c.locked ? '位置已鎖定' : '';
    $('zc-t').textContent = labelOf(c);
    $('zc-d').textContent = COURT_DESC[def.court] || '';
    dl.push(['含緩衝區', `${def.w}×${def.d} m`], def.court === 'vb' ? ['網高', `${NETS[state.net].h} m`] : ['比賽區', `${def.play[0]}×${def.play[1]} m`], ['上方燈具', `${over.length} 組`]);
  }
  $('zc-dl').innerHTML = dl.map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join('');
  card.classList.remove('out');
  renderUseBar(here);
}
// 走進複合球場：上方出現「這面場地要打」的按鈕，按了就換網子（排球網、羽球柱、匹克球網架、收起來）
function renderUseBar(c) {
  const bar = $('wk-use'), def = c && CAT[c.type], use = c && (c.use || def.court), rc = rkCourtNear(walk.x, walk.z);
  const comp = c && c.mode !== 'lines' && c.extra && c.extra.length, racket = !!rc, vbc = c && c.mode !== 'lines' && use === 'vb';
  if (!comp && !racket && !vbc) { bar.hidden = true; bar.dataset.id = ''; return; }
  bar.dataset.id = c ? c.id : '';
  // 第一次站上羽球場／匹克球場：提示入口在哪
  if (rc && !walk.rkHint) walk.rkHint = new Set();
  if (rc && !walk.rkHint.has(rc.k)) { walk.rkHint.add(rc.k); toast(`這裡可以打${SPORT[rc.k]}：按上方的「${rc.k === 'bd' ? '🏸' : '🥒'} 開打${SPORT[rc.k]}」，跟 AI 或朋友對打`, 3500); }
  bar.innerHTML = (comp ? `<span>${esc(labelOf(c))}要打</span>${[def.court, ...c.extra].map((k) => `<button type="button" data-use="${k}" aria-pressed="${use === k}"><i style="background:${k === def.court ? '#fff' : EXTRA_COL[k]}"></i>${SPORT[k]}</button>`).join('')}<button type="button" data-use="none" aria-pressed="${use === 'none'}">收起來</button>` : `<span>${esc(c ? labelOf(c) : rkLabel(rc))}</span>`)
    + (racket ? `<button type="button" class="rk-go" data-rkopen="1">${rc.k === 'bd' ? '🏸' : '🥒'} 開打${SPORT[rc.k]}</button>` : '')
    + (vbc ? (VB.npc ? `<button type="button" data-npc="off" aria-pressed="true">${VB.npc.mode === 'pepper' ? '對碰' : '陪練舉球'}收工</button>` : `<button type="button" data-npc="set" title="他站在網前，你把球拋給他（F）或接到網前（V），他舉給你攻擊">🙋 陪練舉球</button><button type="button" data-npc="pepper" title="兩個人對碰：你拋給他、他墊給你；你舉給他他就打你、你扣他他就接起來給你">🤝 陪練對碰</button>`) + `<button type="button" class="rk-go" data-vmopen="2" title="2 對 2 沙排：你＋隊友（真人或 AI）對兩個人">🏖️ 2 對 2</button><button type="button" class="rk-go" data-vmopen="6" title="6 對 6 室內：選位置、照輪轉表輪轉、正式規則">🏐 6 對 6</button>` : '');
  bar.hidden = false;
}
function setCourtUse(c, k) {
  const def = CAT[c.type], now = c.use || def.court; if (now === k) return;
  pushHistory();
  if (k === def.court) delete c.use; else c.use = k;
  rerenderOne(c); commit(); renderUseBar(c);
  const n = k !== 'none' && k !== def.court ? extraLayout(k, def.w, def.d).length : 1;
  toast(k === 'none' ? `${labelOf(c)}的網子都收起來了` : `${labelOf(c)}改成${SPORT[k]}${n > 1 ? `（${n} 面）` : ''}，網子架好了`);
}
addEventListener('keydown', (e) => {
  if (!walk.on || VBSettings.isOpen) return;
  const tgt = e.target; if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) return;
  const k = VBSettings.key(e);
  if (RP.hl && !e.repeat) { e.preventDefault(); hlSkip(e.key === 'Escape'); return; }   // 得分精華：任意鍵跳過（做影片時只有 Esc 能取消）
  if (e.code === 'KeyG' && !e.repeat && !walk.paused && !$('wk-cart').hidden) { e.preventDefault(); togglePracticeCart(); return; }
  if (k === 'crouch') { e.preventDefault(); if (!walk.paused) walk.crouch = true; return; }   // 蹲下（按住）：接重扣比較穩
  if ((k === 'ready' || k === 'start') && !e.repeat && !walk.paused) { e.preventDefault(); if (k === 'ready') roomReady(); else roomStart(); return; }
  if (typeof ROOM_UI !== 'undefined' && ROOM_UI?.picking) return;
  if (VM.on && roomSpectator() && ['v','q','e','1','2','3','4','5','6','b','f'].includes(k)) { e.preventDefault(); return; }
  if (k === 'escape' && RP.on) { e.preventDefault(); closeReplay(); return; }
  if (k === 'escape' && !$('rk-menu').hidden && !window.__rkOn && VM.phase !== 'over') { e.preventDefault(); $('rk-menu').hidden = true; return; }
  if (k === 'escape') { e.preventDefault(); setMenuClose(false); vbManualSetCancel(); if (!$('pcwin').hidden) { if (pc.app) pcClose(); else closePC(); return; } if (walk.paused) { closeModals(); return; } if (document.pointerLockElement) { document.exitPointerLock(); return; } if (performance.now() - pointerLockOffT < 400) return; if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; } return; }   // Esc 不再打開設定（用右上角 ⚙ 設定）   // Esc：先放開滑鼠，再按一次離開全螢幕
  if (walk.paused) return;
  if (window.__rkOn && rkKey(k)) { e.preventDefault(); return; }
  if (k === 'interact' && !e.repeat) { e.preventDefault(); if (!VM.on || walk.sit || (walk.focus && walk.focus.kind !== 'ball')) doInteract(); return; }
  if (k === 'q' && !e.repeat) { e.preventDefault(); setWheelOpen(); return; }
  if (k === 'v' && !e.repeat && !e.metaKey) { e.preventDefault(); if (walk.setAim) vbManualSetCancel(); vbReceive(); return; }   // 接球：V（按住 Shift＝撲救）
  if (['1', '2', '3', '4', '5', '6'].includes(k) && !e.repeat) { e.preventDefault(); const n = k === '6' ? 7 : Number(k); if (SETM.m && SETM.m.n === n) { setMenuClose(true); return; } if (n <= 3 && !walk.hold && !skill.mode && !coarse() && locked()) setMenuOpen(n); else vbSet(n); return; }   // 滑鼠沒鎖成準心時拖不動轉盤：直接照預設舉，不會卡住等 2.5 秒   // 1～3：按住出現左右選項
  if (k === ' ') { e.preventDefault(); walk.keys.add(' '); if (!e.repeat) { if (walk.hold && vbAtServeLine()) startJumpServe(); else vbJump('attack'); } return; }
  if (k === 'b' && !e.repeat) { e.preventDefault(); if (walk.setAim) vbManualSetCancel(); vbJump('block'); return; }
  if (k === 't') { e.preventDefault(); if (!e.repeat) emoMenuOpen(); return; }   // 互動選單：按住 T，游標往左擊掌、往右嘲諷，放開確定
  if (k === 'p' && !e.repeat) { e.preventDefault(); TP.manual = !tpActive(); toast(TP.manual ? '第三人稱：看得到自己和球（P 換回第一人稱）' : '第一人稱（P 換成第三人稱）', 1800); return; }
  if (k === 'f' && !e.repeat) { e.preventDefault(); passToFacing(); return; }

  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { e.preventDefault(); walk.keys.add(k); }
}, true);
addEventListener('blur', () => { walk.crouch = false; vbManualSetCancel(); });
addEventListener('keyup', (e) => { const k = VBSettings.key(e); if (walk.setAim && !walk.setAim.shot && k === (walk.setAim.back ? 'e' : 'q')) vbManualSetCancel(); if (k === 'crouch' || e.key === 'Control') walk.crouch = false; if (k === 't') emoMenuClose(true); if (SETM.m && k === (SETM.m.all ? 'q' : String(SETM.m.n))) setMenuClose(true); /* 放開數字鍵就舉：點一下＝預設、按住拖滑鼠再放開＝選的那個 */ walk.keys.delete(k); });
addEventListener('blur', () => walk.keys.clear());
// 看的方向：電腦上點一下畫面就鎖定滑鼠，之後滑鼠直接移動＝轉頭（像第一人稱遊戲），Esc 放開滑鼠；
// 手機用手指拖。往右移就往右看、往上移就往上看。
const LOOK_SENS = 0.0022;
// 第一人稱的視野（垂直角度）：預設 80 度比較廣、看得到旁邊的隊友和來球；[ 變窄、] 變廣，記在這台電腦
function walkFov() { return walk.crouch ? 100 : 85; }
const coarse = () => matchMedia('(pointer: coarse)').matches;
const locked = () => document.pointerLockElement === renderer.domElement;
// Ctrl＋W 在瀏覽器是「關分頁」：全螢幕時把整個鍵盤交給遊戲（蹲下＝Ctrl、前進＝W 才不會關掉網頁）
// 所以點畫面開始玩時順便進全螢幕；按住 Esc 才會離開全螢幕
function gameFullscreen() {   // 回傳 Promise：全螢幕切好之後才鎖滑鼠（同時要求的話，切全螢幕會把滑鼠鎖定取消）
  const de = document.documentElement;
  if (coarse() || document.fullscreenElement || !de.requestFullscreen) return Promise.resolve();
  return de.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}
document.addEventListener('fullscreenchange', () => { const kb = navigator.keyboard; if (!kb || !kb.lock) return; if (document.fullscreenElement) kb.lock().catch(() => {}); else kb.unlock(); });
// 沒有全螢幕時：在房間或比賽中按到 Ctrl＋W，先問一次要不要離開
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a[href^=index]')) window.__leavingOk = true; }, true);   // 自己按「回大廳」不用再確認
addEventListener('beforeunload', (e) => { if (location.search && (typeof NET === 'undefined' || NET.on || VM.on) && !window.__leavingOk) { e.preventDefault(); e.returnValue = ''; } });
function lockMouse() { if (!document.fullscreenElement && !coarse() && document.documentElement.requestFullscreen) { gameFullscreen(); return; } lockMouseNow(); }   // 第一下全螢幕，第二下鎖成準心
let pointerLockOffT = 0; document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) pointerLockOffT = performance.now(); });
// 鎖滑鼠：先用「原始滑鼠輸入」（unadjustedMovement）——Chrome 在 Windows 鎖滑鼠時偶爾會回報一次超大的假移動量，視角瞬間被甩走甚至轉到背後（2026-11-17 玩家錄影）；不支援就退回一般鎖定
function lockMouseNow() {
  if (coarse() || !renderer.domElement.requestPointerLock) return;
  const plain = () => { try { const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (er) { /* 不支援就用拖的 */ } };
  try { const r = renderer.domElement.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => { if (!locked()) plain(); }); else if (!r) setTimeout(() => { if (!locked()) plain(); }, 0); }
  catch (er) { plain(); }
}
// 滑鼠移動量過濾：這一下比最近幾下大很多（又超過 220 像素）就當成假訊號丟掉；真的甩很快的話，最近幾下本來就大，不會被擋
const MOUSE_HIST = [];
function mouseDelta(e) {
  const mx = e.movementX || 0, my = e.movementY || 0, m = Math.max(Math.abs(mx), Math.abs(my));
  const avg = MOUSE_HIST.length ? MOUSE_HIST.reduce((a, b) => a + b, 0) / MOUSE_HIST.length : 0;
  if (m > 220 && m > avg * 6 + 60) return null;
  MOUSE_HIST.push(m); if (MOUSE_HIST.length > 6) MOUSE_HIST.shift();
  return [mx, my];
}
function unlockMouse() { if (locked()) { walk.programmaticUnlock = true; document.exitPointerLock(); } }
document.addEventListener('mousemove', (e) => {
  if (!walk.on || !locked() || walk.paused || (walk.spike && walk.spike.t > 0.98)) return;
  const md = mouseDelta(e); if (!md) return;   /* 假的超大移動量：丟掉 */
  e = { movementX: md[0], movementY: md[1] };
  if (EMO.menu) { emoMenuMove(e.movementX, e.movementY); return; }   // 互動選單開著：滑鼠移動的是選單游標，不轉頭
  if (setMenuHolds()) { if (SETM.m) setMenuMove(e.movementX, e.movementY); return; }   // 舉球轉盤開著：滑鼠移動的是轉盤游標，視角不轉；往選項方向拖一下就舉
  if (walk.air && walk.air.block) { walk.blkAim = clamp((walk.blkAim || 0) + e.movementX * 0.003 * VBSettings.values.sensitivity, -0.5, 0.5); walk.pitch = clamp(walk.pitch - e.movementY * LOOK_SENS * VBSettings.values.sensitivity, -1.2, 1.1); return; }   // 攔網：左右移動雙手（封直線或斜線），頭不轉
  walk.lookT = performance.now(); walk.yaw -= e.movementX * LOOK_SENS * VBSettings.values.sensitivity; walk.pitch = clamp(walk.pitch - e.movementY * LOOK_SENS * VBSettings.values.sensitivity, -1.2, 1.1);
});
document.addEventListener('pointerlockchange', () => {
  if (!locked()) {
    walk.unlockT = performance.now(); vbManualSetCancel();
    // Esc 放開滑鼠時不再自動打開設定（使用者 2026-11-04 要求；設定用右上角 ⚙）
    walk.programmaticUnlock = false;
  }
  updateLockHint();
});
// 瀏覽器不讓鎖定滑鼠（有些內嵌視窗、舊瀏覽器）：改用按住拖曳轉頭，點一下照樣互動
document.addEventListener('pointerlockerror', () => { walk.noLock = true; updateLockHint(); toast('這個瀏覽器不能鎖定滑鼠：改成按住滑鼠拖曳轉頭'); });
function updateLockHint() { const h = $('wk-lock'); if (!h) return; h.hidden = !walk.on || coarse() || locked() || walk.paused || walk.noLock || !!window.__rkOn; const t = document.fullscreenElement || !document.documentElement.requestFullscreen ? '再點一下畫面：滑鼠變準心　Esc：放開滑鼠，再按一次離開全螢幕' : '點一下畫面：進入全螢幕（再點一下滑鼠變準心）'; if (h.textContent !== t) h.textContent = t; }
document.addEventListener('fullscreenchange', () => updateLockHint());
// 右側操作說明欄排在準備框下面（準備框高度會變）
{ const f = document.getElementById('room-flow'), put = () => { const r = f.getBoundingClientRect(), top = r.height ? Math.round(r.bottom + 8) : 74; document.documentElement.style.setProperty('--help-top', top + 'px'); }; if (f && window.ResizeObserver) { new ResizeObserver(put).observe(f); put(); } }   // 只在準備框大小變的時候量（原本每 0.5 秒量一次會讓整頁重排、遊戲一頓一頓）
// 排球（比賽、陪練、站在排球場上）而且滑鼠已鎖定（轉頭模式）：左鍵＝攻擊（拿著球＝發球）、右鍵＝吊球
const vbClickOK = () => !roomSpectator() && (VM.on || !!VB.npc || !!vbCourt());
renderer.domElement.addEventListener('contextmenu', (e) => { if (walk.on) e.preventDefault(); });
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (RP.hl && e.button === 0) { e.preventDefault(); hlSkip(false); return; }   // 得分精華：點一下跳過
  if (EMO.menu) { e.preventDefault(); emoMenuClose(true); return; }   // 互動選單：點一下確定
  if (SETM.m) { e.preventDefault(); setMenuClose(true); return; }   // 舉球轉盤：點一下＝選亮著的（沒亮＝預設）
  if (walk.on && walk.setAim && walk.noLock && !locked() && e.button === 0 && !walk.paused) {
    e.preventDefault(); vbManualSetDown();
    walk.look = { id:e.pointerId, x:e.clientX, y:e.clientY, sx:e.clientX, sy:e.clientY, t:performance.now(), moved:false, setGesture:true };
    renderer.domElement.setPointerCapture(e.pointerId); return;
  }
  if (walk.on && !window.__rkOn && (e.button === 0 || e.button === 2) && locked() && vbClickOK() && !walk.paused && !walk.sit) { e.preventDefault(); vbPrimaryDown(e.button === 2); return; }
  if (!walk.on || e.button !== 0 || window.__rkOn) return;
  if (locked()) { walk.look = { id: e.pointerId, locked: true, t: performance.now() }; return; }
  walk.look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  const l = walk.look; if (!walk.on || !l || l.locked || l.id !== e.pointerId || (walk.spike && walk.spike.t > 0.98) || setMenuHolds() || EMO.menu) return;   // 轉盤開著：只選球路，視角不轉
  const dx = e.clientX - l.x, dy = e.clientY - l.y; l.x = e.clientX; l.y = e.clientY;
  if (Math.hypot(e.clientX - l.sx, e.clientY - l.sy) > 5) l.moved = true;
  const sens = (e.pointerType === 'touch' ? 0.006 : 0.0042) * VBSettings.values.sensitivity;
  walk.lookT = performance.now(); walk.yaw -= dx * sens; walk.pitch = clamp(walk.pitch - dy * sens * 0.85, -1.2, 1.1);
});
function endLook(e) {
  const l = walk.look; if (!walk.on || !l || l.id !== e.pointerId) return;
  walk.look = null;
  if (l.setGesture) return;
  if (walk.spike || walk.paused) return;
  let ray = raycaster, maxD = 4;
  if (l.locked) { ray = centerRay; centerRay.setFromCamera(new THREE.Vector2(0, 0), camera); maxD = 3.4; }
  else {
    if (l.moved || performance.now() - l.t > 500) return;
    // 電腦上第一次點：鎖定滑鼠（這一下不算互動）
    if (!coarse() && !walk.noLock) { lockMouse(); return; }
    setPointer(e);
  }
  if (walk.noLock && vbClickOK() && !walk.sit) { vbPrimaryDown(false); return; }
  // 拿著球：點一下就丟；點到伸手可及的物件：直接互動
  if (walk.hold) { if (!skill.mode) throwBall(); updateFocus(); return; }
  const tg = pickTargets(ray, maxD);
  // 單擊互動（稍等一下，雙擊就改成看資訊報表）
  if (tg) { clearTimeout(walk.clickT); walk.clickT = setTimeout(() => doInteract(tg), 260); return; }
  if (walk.sit) { standUp(); return; }
  const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(floorPlane, p)) return;
  if (Math.hypot(p.x - walk.x, p.z - walk.z) > 40) return;
  walk.target = [p.x, p.z]; targetMark.position.set(p.x, 0.04, p.z); targetMark.visible = true;
}
renderer.domElement.addEventListener('pointerup', endLook);
addEventListener('pointerup', (e) => { if (e.button === 0 && vbManualSetRelease()) return; if (e.button === 0 || e.button === 2) { const g = walk.chargeArmGround && walk.chargeArm && !walk.air; walk.chargeArm = null; walk.chargeArmGround = false; if (walk.charge) vbChargeRelease(); else if (g) vbAttack(false); } });   // 地上按、地上放＝站著打
for (const el of document.querySelectorAll('#emo-menu [data-emo]')) {   // 沒鎖定滑鼠時：直接指、點選單
  el.addEventListener('pointerenter', () => { if (EMO.menu) { EMO.menu.pick = el.dataset.emo; emoMenuDraw(); } });
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (EMO.menu) { EMO.menu.pick = el.dataset.emo; emoMenuClose(true); } });
}
addEventListener('pointercancel', () => { vbManualSetCancel(); walk.chargeArm = null; walk.chargeArmGround = false; walk.charge = null; vbChgHud(); });
addEventListener('blur', () => { walk.charge = null; walk.chargeArm = null; walk.chargeArmGround = false; vbChgHud(); });
renderer.domElement.addEventListener('pointercancel', (e) => { if (walk.look && walk.look.id === e.pointerId) walk.look = null; });

