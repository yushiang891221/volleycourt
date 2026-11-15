// ---------------------------------------------------------------- 球拍對戰：羽球／匹克球單打（跟 AI 打，或跟多人連線房間裡的人打）
// 玩法：WASD／搖桿跑位，J 軟、K 抽（高球自動變殺球）、L 挑；按下去就揮拍（拍子約 0.12 秒後掃到擊球點），球那時不在拍子範圍就揮空。
// 球旁邊的圓圈縮到球上＝該按的時候，PERFECT／GOOD／BAD 看按的時機。AI 照舊用「提早排好、球到再揮」。
// 回球好不好看你跟球的距離（太擠、太遠都會變差）、擊球高度和準備時間；地上的站位圈告訴你該跑到哪裡。
// 球場座標：x＝沿長邊（網在 x=0，side=+1／-1 是兩邊）、y＝高、z＝沿網
const RK_SPEC = {
  bd: { k: 'bd', name: '羽球', HL: 6.7, HW: 2.59, HWF: 3.05, net: 1.524, netEdge: 0.026, short: 1.98, kitchen: 0, drag: 0.19, r: 0.03, cor: 0, reach: 1.2, top: 2.9, speed: 4.4, hand: 1.0, minY: 0.45, low: 0.35 },
  pb: { k: 'pb', name: '匹克球', HL: 6.705, HW: 3.05, HWF: 3.05, net: 0.86, netEdge: 0.054, short: 2.13, kitchen: 2.13, drag: 0.03, r: 0.037, cor: 0.64, reach: 0.95, top: 2.3, speed: 3.9, hand: 0.65, minY: 0.2, low: 0.15 },
};
const RK_LV = {
  1: { name: '新手', react: 0.42, speed: 0.74, err: 0.55, q: 0.62, smash: 0.25, miss: 0.14 },
  2: { name: '球友', react: 0.27, speed: 0.87, err: 0.3, q: 0.8, smash: 0.55, miss: 0.06 },
  3: { name: '高手', react: 0.15, speed: 1.0, err: 0.12, q: 0.93, smash: 0.85, miss: 0.02 },
};
const RK = { on: false, opt: { lv: 2, to: 11, assist: null, hint: true }, ask: null, peerAsk: null, P: {}, acc: 0 };
const rkGauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
// 哪些地方可以打：獨立的羽球場／匹克球場，或複合球場現在架的是羽球網／匹克球網（一塊地切成好幾面）
function rkCourts() {
  const out = [];
  for (const it of state.items) {
    const def = CAT[it.type]; if (!def || !def.court) continue;
    const use = it.mode === 'lines' ? def.court : it.use || def.court; if (use !== 'bd' && use !== 'pb') continue;
    const L = use === def.court ? [{ x: 0, z: 0, r: false }] : extraLayout(use, def.w, def.d);
    L.forEach((l, i) => { const [cx, cz] = toWorldOf(it, l.x, l.z); out.push({ key: it.id + ':' + i, k: use, it, cx, cz, yaw: (it.rot * Math.PI) / 180 + (l.r ? Math.PI / 2 : 0), n: L.length > 1 ? i + 1 : 0 }); });
  }
  return out;
}
const rkL = (c, x, z) => { const dx = x - c.cx, dz = z - c.cz, co = Math.cos(c.yaw), si = Math.sin(c.yaw); return [dx * co - dz * si, dx * si + dz * co]; };
const rkW = (c, u, w) => [c.cx + u * Math.cos(c.yaw) + w * Math.sin(c.yaw), c.cz - u * Math.sin(c.yaw) + w * Math.cos(c.yaw)];
function rkCourtNear(x, z, it) {
  let best = null, bd = 1e9;
  for (const c of rkCourts()) { if (it && c.it !== it) continue; const [u, w] = rkL(c, x, z), S = RK_SPEC[c.k], d = Math.max(0, Math.abs(u) - S.HL) + Math.max(0, Math.abs(w) - S.HWF); if (d < bd) { bd = d; best = c; } }
  return best && bd < (it ? 99 : 1.5) ? best : null;
}
const rkLabel = (c) => `${labelOf(c.it)}${c.n ? `第 ${c.n} 面` : ''}${SPORT[c.k]}`;
// ---- 物理：每 1/240 秒走一步（連線兩邊算出來一樣）；空氣阻力跟速度平方成正比，羽毛球阻力很大、飛不遠
const RK_H = 1 / 240;
function rkStepBall(S, b, h) { const v = b.v, k = S.drag * Math.hypot(v[0], v[1], v[2]); v[0] -= k * v[0] * h; v[1] -= (9.8 + k * v[1]) * h; v[2] -= k * v[2] * h; b.p[0] += v[0] * h; b.p[1] += v[1] * h; b.p[2] += v[2] * h; }
const rkNetTop = (S, z) => S.net + (Math.min(Math.abs(z), S.HWF) / S.HWF) * S.netEdge;
function rkFly(S, p0, v0) {
  const b = { p: [...p0], v: [...v0] }; let t = 0, netY = null;
  while (t < 5) { const x0 = b.p[0], y0 = b.p[1]; rkStepBall(S, b, RK_H); t += RK_H; if (netY == null && x0 !== 0 && Math.sign(x0) !== Math.sign(b.p[0])) netY = y0 + (b.p[1] - y0) * (x0 / (x0 - b.p[0])); if (b.p[1] <= S.r) break; }
  return { x: b.p[0], z: b.p[2], t, netY };
}
// 給仰角：二分法找出手速度，讓第一次落地剛好在目標
function rkSolve(S, p0, tx, tz, deg, smax = 70) {
  const dx = tx - p0[0], dz = tz - p0[2], D = Math.hypot(dx, dz) || 0.01, ux = dx / D, uz = dz / D, th = (deg * Math.PI) / 180;
  const V = (s) => [ux * Math.cos(th) * s, Math.sin(th) * s, uz * Math.cos(th) * s], R = (s) => { const L = rkFly(S, p0, V(s)); return Math.hypot(L.x - p0[0], L.z - p0[2]); };
  if (R(smax) < D) return null;
  let lo = 0.5, hi = smax; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (R(m) < D) lo = m; else hi = m; }
  return V(hi);
}
// 最低（最快）能過網的角度：平抽、放小球用
function rkLowest(S, p0, tx, tz, from, to, clear, smax) {
  for (let d = from; d <= to; d += 2) { const v = rkSolve(S, p0, tx, tz, d, smax); if (!v) continue; const L = rkFly(S, p0, v); if (L.netY != null && L.netY >= rkNetTop(S, L.z) + clear) return v; }
  return null;
}
// 殺球：速度固定，找往下的角度讓球落在目標，還要過得了網
function rkSmash(S, p0, tx, tz, spd) {
  const dx = tx - p0[0], dz = tz - p0[2], D = Math.hypot(dx, dz), ux = dx / D, uz = dz / D;
  const V = (deg) => { const th = (deg * Math.PI) / 180; return [ux * Math.cos(th) * spd, Math.sin(th) * spd, uz * Math.cos(th) * spd]; };
  let lo = -40, hi = 8; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2, L = rkFly(S, p0, V(m)); if (Math.hypot(L.x - p0[0], L.z - p0[2]) < D) lo = m; else hi = m; }
  const v = V(hi), L = rkFly(S, p0, v); return L.netY != null && L.netY >= rkNetTop(S, L.z) + 0.02 ? v : null;
}
// 預測整條球路（匹克球含第一次落地彈起）：給站位圈、AI、落點提示用
function rkPath(S, p0, v0) {
  const b = { p: [...p0], v: [...v0] }, pts = []; let t = 0, nb = 0, land = null, n = 0;
  while (t < 5) {
    const x0 = b.p[0], y0 = b.p[1]; rkStepBall(S, b, RK_H); t += RK_H;
    if (x0 !== 0 && Math.sign(x0) !== Math.sign(b.p[0]) && Math.abs(b.p[2]) < S.HWF + 0.15 && y0 + (b.p[1] - y0) * (x0 / (x0 - b.p[0])) < rkNetTop(S, b.p[2])) return { pts, land, net: true };
    if (b.p[1] <= S.r) {
      if (!land) land = [b.p[0], b.p[2], t];
      if (!S.cor || nb >= 1) break;
      nb++; b.p[1] = S.r; b.v[1] = -b.v[1] * S.cor; b.v[0] *= 0.86; b.v[2] *= 0.86;
    }
    if (++n % 4 === 0) pts.push({ t, x: b.p[0], y: b.p[1], z: b.p[2], nb });
  }
  return { pts, land };
}
// ---- 模型：球拍、羽毛球、匹克球
function makeRacket(k) {
  const g = new THREE.Group();
  if (k === 'bd') {
    cyl(g, 0.014, 0.017, 0.2, '#25282D', 0, -0.2, 0);
    cyl(g, 0.0045, 0.0045, 0.3, '#C8CCD2', 0, -0.5, 0, { metalness: 0.6, roughness: 0.3 });
    const head = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 6, 28), mat('#1F2A44', { metalness: 0.4, roughness: 0.4 })); head.scale.set(1, 1.25, 1); head.position.y = -0.62; g.add(head);
    const str = new THREE.Mesh(new THREE.CircleGeometry(0.098, 24), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })); str.scale.set(1, 1.25, 1); str.position.y = -0.62; g.add(str);
  } else {
    cyl(g, 0.016, 0.017, 0.13, '#1F2124', 0, -0.13, 0);
    const sh = new THREE.Shape(), w = 0.1, h = 0.13, r = 0.035;
    sh.moveTo(-w + r, -h); sh.lineTo(w - r, -h); sh.quadraticCurveTo(w, -h, w, -h + r); sh.lineTo(w, h - r); sh.quadraticCurveTo(w, h, w - r, h); sh.lineTo(-w + r, h); sh.quadraticCurveTo(-w, h, -w, h - r); sh.lineTo(-w, -h + r); sh.quadraticCurveTo(-w, -h, -w + r, -h);
    const face = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: false, curveSegments: 6 }), mat('#0E9F9A', { roughness: 0.5 })); face.position.set(0, -0.27, -0.007); g.add(face);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function rkBallMesh(k) {
  const g = new THREE.Group();
  if (k === 'bd') {
    const cork = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 14, 10), mat('#F4EFE6', { roughness: 0.6 })); cork.position.z = 0.004; g.add(cork);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.013, 0.07, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.z = -0.035; g.add(skirt);
    g.scale.setScalar(1.8);
  } else {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#D8EE3A'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#9DB01F';
    for (let i = 0; i < 26; i++) { x.beginPath(); x.arc((i * 37) % 128, ((i * 23) % 56) + 4, 4, 0, Math.PI * 2); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.037, 20, 14), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 })));
    g.scale.setScalar(1.35);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// ---- 開始／結束
function rkMkPlayer(side, color, name, ai) {
  const ch = ai ? vmPickChar(new Set([myChar()])) : myChar(), av = makeAvatar(color, ch); scene.add(av.g);
  const rk = makeRacket(RK.k); av.hands[0].add(rk);
  let tag = null;
  if (ai) { const el = document.createElement('div'); el.className = 'mp-tag'; el.textContent = name; tag = new CSS2DObject(el); tag.position.set(0, 2.05, 0); av.g.add(tag); }
  return { side, ai, name, ch, x: side * 4, z: 0, vx: 0, vz: 0, av, tag, queued: null, swing: null, prevCost: null, jy: 0, reactAt: 0, plan: null };
}
function rkStart(c, o = {}) {
  globalThis.VBTutorial?.stop();
  if (RK.on) rkStop(true);
  RK.on = true; window.__rkOn = true; RK.c = c; RK.k = c.k; RK.S = RK_SPEC[c.k]; RK.my = o.side || 1; RK.netOp = o.net || null; RK.ask = null;
  RK.st = { sc: [0, 0], srv: o.net ? 1 : RK.my, to: c.k === 'pb' ? 11 : (o.to || RK.opt.to), over: false };
  RK.P = {}; RK.P[RK.my] = rkMkPlayer(RK.my, NET.color || '#F2B705', '你', false);
  if (!RK.netOp) RK.P[-RK.my] = rkMkPlayer(-RK.my, '#E5484D', 'AI・' + RK_LV[RK.opt.lv].name, true);
  else { const p2 = NET.peers.get(RK.netOp); RK.P[-RK.my] = { side: -RK.my, remote: true, name: p2 ? p2.n : '對手', x: -RK.my * 4, z: 0, vx: 0, vz: 0 }; }
  RK.ballM = rkBallMesh(RK.k); scene.add(RK.ballM);
  RK.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false })); RK.shadow.rotation.x = -Math.PI / 2; scene.add(RK.shadow);
  RK.trailN = 18; RK.trailPts = []; RK.trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: RK.trailN }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.45 })); RK.trail.frustumCulled = false; scene.add(RK.trail);
  const ring = (a, b, col) => { const m = new THREE.Mesh(new THREE.RingGeometry(a, b, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return m; };
  RK.landM = ring(0.1, 0.16, '#FFFFFF'); RK.stanceM = ring(0.34, 0.42, '#FFFFFF');
  STA.v = 1; STA.lock = false; RK.cam = null; RK.look = null; RK.hitN = 0; RK.rally = 0; RK.bounceReq = 0; RK.waitPt = null; RK.acc = 0; RK.clock = 0; RK.next = null;
  if (walk.hold) { camera.remove(walk.hold); walk.hold = null; }
  skill.mode = null; hands.visible = false; $('wk-combo').hidden = true; walk.keys.clear();
  unlockMouse(); $('walk-ui').classList.add('rk'); updateLockHint();
  $('rk-hud').hidden = false; $('rk-pad').hidden = !coarse(); $('rk-menu').hidden = true;
  camera.fov = 60; camera.updateProjectionMatrix();
  rkSetupServe();
  toast(RK.netOp ? `跟 ${RK.P[-RK.my].name} 的${RK.S.name}單打開始！` : `${RK.S.name}單打：對手 AI（${RK_LV[RK.opt.lv].name}），先到 ${RK.st.to} 分`);
}
function rkStop(silent) {
  if (!RK.on) return;
  if (RK.netOp && NET.on && !silent) NET.tx.publish('rk', { e: 'bye' });
  const me = RK.P[RK.my];
  for (const P of Object.values(RK.P)) if (P.av) { scene.remove(P.av.g); if (P.tag) P.tag.element.remove(); }
  for (const m of [RK.ballM, RK.shadow, RK.trail, RK.landM, RK.stanceM]) if (m) scene.remove(m);
  RK.on = false; window.__rkOn = false; RK.netOp = null;
  $('walk-ui').classList.remove('rk'); $('rk-hud').hidden = true; $('rk-pad').hidden = true; $('rk-menu').hidden = true;
  if (me) { const [x, z] = rkW(RK.c, me.x, me.z); walk.x = x; walk.z = z; walk.yaw = rkYawToNet(RK.my); walk.pitch = -0.05; }
  camera.fov = walkFov(); camera.updateProjectionMatrix(); updateLockHint(); walk.zoneKey = ''; updateZoneCard(true);
}
// 面向網子（看向對面）時的 walk.yaw
function rkYawToNet(side) { const [ax, az] = rkW(RK.c, 0, 0), [bx, bz] = rkW(RK.c, side, 0), fx = ax - bx, fz = az - bz; return Math.atan2(-fx, -fz); }
// ---- 發球
function rkSetupServe() {
  const S = RK.S, st = RK.st, srv = st.srv, sc = st.sc[srv > 0 ? 0 : 1];
  const right = sc % 2 === 0;            // 發球方分數偶數從右邊發；對 side s 的人來說「右邊」是 z 的 -s 方向
  const sz = (right ? -srv : srv) * (RK.k === 'bd' ? 1.1 : 1.5), sx = srv * (RK.k === 'bd' ? S.short + 0.9 : S.HL + 0.25);
  const rx = -srv * (RK.k === 'bd' ? S.short + 1.7 : S.HL + 0.25), rz = -sz;
  for (const P of Object.values(RK.P)) { if (P.remote) continue; const isS = P.side === srv; P.x = isS ? sx : rx; P.z = isS ? sz : rz; P.vx = P.vz = 0; P.queued = null; P.swing = null; P.plan = null; P.sw = null; P.air = null; P.dive = null; P.down = 0; }
  st.srvZ = sz; RK.phase = 'serve'; RK.b = { held: srv, p: [sx - srv * 0.4, S.hand, sz], v: [0, 0, 0], live: false, by: srv }; RK.path = null; RK.rally = 0; RK.bounceReq = 0; RK.popup = false;
  RK.aiServeAt = RK.clock + 1300 + Math.random() * 700;
  rkHud();
}
function rkServe(P, shot) {
  const S = RK.S, side = P.side, o = -side, st = RK.st;
  const p0 = [P.x - side * 0.4, S.hand, P.z], tz = -Math.sign(st.srvZ) * (RK.k === 'bd' ? 1.2 : 1.5) + rkGauss() * 0.25;
  let v = null;
  if (RK.k === 'bd') {
    if (shot === 'soft') v = rkLowest(S, p0, o * (S.short + 0.45), tz, 8, 60, 0.07, 20);
    else if (shot === 'drive') v = rkLowest(S, p0, o * (S.HL - 0.8), tz, 10, 40, 0.3, 45);
    if (!v) v = rkSolve(S, p0, o * (S.HL - 0.45), tz, 52);
  } else v = rkLowest(S, p0, o * (S.HL - 1.5 + rkGauss() * 0.4), tz, 8, 50, 0.22, 25);
  if (!v) return;
  rkLaunch(side, p0, v, { serve: true, shot });
  P.swing = { t: 0, over: false, kind: 'serve' };
}
function rkLaunch(side, p0, v, o = {}) {
  RK.b = { p: [...p0], v: [...v], live: true, by: side, serve: !!o.serve, t: 0, bounces: 0, bounceSide: 0, netHit: false, srvZ: RK.st.srvZ };
  RK.path = rkPath(RK.S, p0, v); RK.phase = 'rally'; RK.hitN++; RK.rally++; RK.trailPts = [];
  if (RK.S.cor) { if (o.serve) RK.bounceReq = 2; else if (RK.bounceReq > 0) RK.bounceReq--; }
  RK.popup = o.kind === 'save';
  const op = RK.P[-side]; if (op && op.ai) { op.reactAt = RK.clock + RK_LV[RK.opt.lv].react * 1000; op.plan = null; op.queued = null; op.missed = false; }
  const me = RK.P[RK.my]; if (side !== RK.my) { me.prevCost = null; me.missed = false; }
  if (o.serve) rkHud();
  { const [wx, wz] = rkW(RK.c, p0[0], p0[2]); recHit({ x: wx, y: p0[1], z: wz, v: Math.hypot(...v), kind: o.serve ? 'serve' : o.kind || RK.k }); }
  if (NET.on && (side === RK.my || !RK.netOp)) NET.tx.publish('rk', { e: 'hit', key: RK.c.key, cw: [+RK.c.cx.toFixed(3), +RK.c.cz.toFixed(3), +RK.c.yaw.toFixed(4), RK.k], n: RK.hitN, p: p0.map((q) => +q.toFixed(3)), v: v.map((q) => +q.toFixed(3)), side, serve: !!o.serve, br: RK.bounceReq, pop: RK.popup });
}
// ---- 擊球判定
// 跳起來的高度（0＝在地上）
function rkAirY(P) { return P.air ? P.air.h * Math.sin(Math.PI * clamp(P.air.t / P.air.T, 0, 1)) : 0; }
function rkJump() {
  if (!RK.on || RK.phase !== 'rally') return;
  const me = RK.P[RK.my]; if (me.air || me.dive || me.down > 0) return;
  const bd = RK.k === 'bd', tired = staUse(0.06) ? 1 : 0.6;
  me.air = { t: 0, T: (bd ? 0.62 : 0.5) * (0.8 + 0.2 * tired), h: (bd ? 0.55 : 0.38) * tired };
  if (NET.on) { NET.jp = { s: (NET.jp ? NET.jp.s : 0) + 1, h: +me.air.h.toFixed(2), T: +me.air.T.toFixed(2) }; NET.forceSt = true; }
  const pad = document.querySelector('#rk-pad [data-rk="jump"]'); if (pad) { pad.classList.add('on'); setTimeout(() => pad.classList.remove('on'), 160); }
}
// 撲救：往球路上第一個低球點（地上 0.1～1.6 m）衝過去；拍子範圍多 1.3 m，回球品質打七折
function rkDive(me, shot) {
  const b = RK.b, S = RK.S, path = RK.path; if (!b || !b.live || !path || b.by === me.side || me.air || me.dive || me.down > 0) return false;
  let tg = null;
  for (const q of path.pts) { if (q.t < b.t + 0.05 || q.x * me.side < 0.1) continue; if (S.cor && q.nb === 0 && RK.bounceReq > 0) continue; if (q.y < 0.1 || q.y > 1.6) continue; tg = q; break; }
  if (!tg || tg.t - b.t > 0.75) return false;   // 球還很久才到：不用撲
  const dx = tg.x + me.side * 0.3 - me.x, dz = tg.z - me.z, d = Math.hypot(dx, dz); if (d < S.reach * 0.8 || d > S.reach + 3) return false;
  if (!staUse(0.35)) return false;
  const sp = clamp((d - S.reach * 0.5) / 0.35, 3.5, 7.5);
  me.dive = { t: 0, vx: (dx / d) * sp, vz: (dz / d) * sp };
  me.sw = { t: 0, shot, ideal: null, pc: null, dive: true }; me.swing = { t: 0, over: false, kind: 'pre' };
  return true;
}
function rkReach(P) {
  const b = RK.b, S = RK.S;
  if (!b || !b.live || b.by === P.side || b.netHit || P.missed) return null;
  if (b.p[0] * P.side < 0.03) return null;                                    // 還沒過網
  if (S.cor && b.bounces === 0 && (RK.bounceReq > 0 || Math.abs(P.x) < S.kitchen)) return null;   // 雙彈跳／站在廚房裡：等球落地再打
  const dh = Math.hypot(b.p[0] - P.x, b.p[2] - P.z), y = b.p[1], R = S.reach * (P === RK.P[RK.my] && RK.opt.assist ? 1.3 : 1) + (P.dive ? 1.3 : 0);
  return { dh, y, R, ok: dh <= R && y >= (P.dive ? 0.04 : 0.1) && y <= (P.dive ? 1.6 : S.top + rkAirY(P)) };
}
const RK_SW = 0.12;   // 按下去到拍面碰球的時間（秒）
// 照現在站的位置，球再過多久最好打（球的時間，秒）；沒有能打的點就回 null
function rkIdeal(P) {
  const b = RK.b, S = RK.S, path = RK.path; if (!b || !b.live || !path || b.by === P.side || b.netHit) return null;
  const R = S.reach * (P === RK.P[RK.my] && RK.opt.assist ? 1.3 : 1); let best = null;
  for (const q of path.pts) {
    if (q.t < b.t - 0.02 || q.x * P.side < 0.03) continue;
    if (S.cor && q.nb === 0 && (RK.bounceReq > 0 || Math.abs(P.x) < S.kitchen)) continue;
    const dh = Math.hypot(q.x - P.x, q.z - P.z); if (dh > R || q.y < 0.1 || q.y > S.top + (P.air ? P.air.h : 0)) continue;
    const cost = Math.abs(dh - 0.6) + Math.max(0, S.minY + 0.25 - q.y) - (P.air ? 0.45 * q.y : 0);   // 跳起來時：越高越好打
    if (!best || cost < best.cost - 1e-4) best = { cost, t: q.t - b.t, y: q.y, x: q.x, z: q.z };
  }
  return best;
}
function rkSwingStep(P, now) {
  const w = P.sw; if (!w) return;
  w.t += RK_H;
  if (w.t >= 0.04) {
    const r = rkReach(P);
    if (r && r.ok) {
      const cost = Math.abs(r.dh - 0.6) + Math.max(0, RK.S.minY + 0.25 - r.y) - (P.air ? 0.45 * r.y : 0);
      if ((w.pc != null && cost > w.pc + 1e-4) || (!w.dive && w.t >= RK_SW + 0.05) || r.y < RK.S.low) { P.sw = null; rkDoHit(P, r, now, w); return; }
      w.pc = cost;
    }
  }
  if (w.t > (w.dive ? 0.45 : 0.2)) {
    P.sw = null; P.cool = now + 220;
    if (P.side === RK.my) { const far = RK.b.live && RK.b.by !== P.side; rkSay(far ? (w.ideal != null && w.ideal.t > RK_SW ? '揮空！太早了' : w.ideal ? '揮空！太晚了' : '揮空！球不在拍子範圍') : '揮空', 'warn', 900); if (far) vbFx({ m: { position: RK.ballM.position.clone() } }, 0, 'MISS'); }
  }
}
function rkCheckHit(P, now) {
  if (P.sw) { rkSwingStep(P, now); return; }
  if (!P.queued) return;
  const r = rkReach(P); if (!r || !r.ok) { P.prevCost = null; return; }
  const S = RK.S, cost = Math.abs(r.dh - 0.6) + Math.max(0, S.minY + 0.25 - r.y);
  if ((P.prevCost != null && cost > P.prevCost + 1e-4) || r.y < S.low || r.dh > r.R * 0.93) rkDoHit(P, r, now);
  else P.prevCost = cost;
}
function rkDoHit(P, r, now, sw) {
  const S = RK.S, lv = RK_LV[RK.opt.lv];
  let q = 1, note = '';
  if (r.dh < 0.28) { q *= 0.6; note = '太擠了'; }
  else if (r.dh > 0.95) { q *= 1 - 0.55 * Math.min(1, (r.dh - 0.95) / Math.max(0.05, r.R - 0.95)); note = '太遠，勉強救起'; }
  if (r.y < S.low) { q *= 0.65; note = note || '撈太低'; }
  // 來球越快越難接好（殺球、重抽）
  const vin = Math.hypot(...RK.b.v); if (vin > 13) { q *= Math.max(0.45, 1 - (vin - 13) / 28); if (vin > 20) note = note || '球太快，擋回去'; }
  // 時機：拍面碰球的時間跟「最好打的那一刻」差多少（AI 照舊看準備時間）
  let grade = null;
  if (sw && sw.dive) { grade = 0.4; q *= 0.7; note = '撲救'; }
  else if (sw) { const e = sw.ideal ? RK_SW - sw.ideal.t : 9, ae = Math.abs(e); grade = ae < 0.05 ? 1 : ae < 0.11 ? 0.75 : 0.4; q *= grade === 1 ? 1 : grade > 0.5 ? 0.86 : 0.66; if (grade < 0.5) note = note || (e < 0 ? '太早' : '太晚'); }
  else { const charge = clamp((now - P.queued.t0) / 450, 0.3, 1); q *= 0.8 + 0.2 * charge; }
  // 跳殺：要在跳到最高點附近、時機也對才殺得漂亮；不然殺不下去
  if (P.air && sw && !sw.dive) { const jq = rkAirY(P) / P.air.h; if (grade < 0.5) { q *= 0.75; note = '跳殺時機沒抓好'; } else if (jq < 0.6) { q *= 0.85; note = note || '不是在最高點'; } }
  let shot = sw ? sw.shot : P.queued.shot;
  if (sw && sw.dive) shot = shot === 'soft' ? 'soft' : 'lob';   // 撲救只能救起來（放小球或挑高）
  if (P.ai) {
    q *= lv.q + Math.random() * (1 - lv.q);
    if (Math.random() < lv.miss * (r.dh > 0.95 || r.dh < 0.28 ? 2.5 : 1)) { P.missed = true; P.queued = null; P.swing = { t: 0, over: r.y > 1.7, kind: 'miss' }; return; }
    shot = rkAiShot(P, r);
  }
  P.queued = null; P.prevCost = null;
  // 左右：按著 A／D（或搖桿往左右推）就打那一邊；沒按就往對手的空檔打
  let aimZ = null;
  if (!P.ai) { const k = walk.keys, lr = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + (Math.abs(walk.joy.x) > 0.55 ? Math.sign(walk.joy.x) : 0); if (lr) aimZ = -P.side * Math.sign(lr) * (S.HW - 0.45); }
  const hp = RK.ballM.position.clone(), [hx, hz] = rkW(RK.c, RK.b.p[0], RK.b.p[2]); hp.set(hx, RK.b.p[1], hz);
  const res = rkShoot(P, shot, q, aimZ, r);
  if (sw && P.swing) { P.swing.kind = res.kind; P.swing.over = r.y > 1.7; } else P.swing = { t: 0, over: r.y > 1.7, kind: res.kind };
  // 打到的那一刻：粒子、聲音；我打的再跳 PERFECT／GOOD／BAD
  vbBurst(hp, q >= 0.9 ? '#F2B705' : '#FFFFFF', res.kind === 'smash' ? 20 : 11, res.kind === 'smash' ? 3 : 1.6); sfx(RK.k === 'pb' ? 'paddle' : 'shuttle', res.kind === 'smash' ? 1.3 : q, hp);
  if (grade != null) vbFx({ m: { position: hp } }, grade === 1 ? 1 : grade > 0.5 ? 0.7 : 0.3);
  if (P.side === RK.my) {
    const word = { smash: P.air ? '跳殺！' : '殺球！', drive: '抽球', soft: RK.k === 'pb' ? 'Dink' : '小球', lob: RK.k === 'pb' ? '挑高' : '高遠球', save: '救起來' }[res.kind];
    rkSay(grade === 1 && q >= 0.85 ? `完美！${word}` : note ? `${note}（${word}）` : word, grade === 1 && q >= 0.85 ? 'gold' : note ? 'warn' : '');
  }
}
function rkShoot(P, shot, q, aimZ, r) {
  const S = RK.S, side = P.side, o = -side, p0 = [...RK.b.p], opp = RK.P[o], bd = RK.k === 'bd';
  let kind = shot;
  const high = p0[1] >= (bd ? 2.15 : S.net + 0.4);
  const jq = P.air ? rkAirY(P) / P.air.h : 0;
  if ((kind === 'drive' || kind === 'smash') && P.air && jq > 0.2 && p0[1] >= (bd ? 1.9 : S.net + 0.25)) kind = 'smash';
  else if (kind === 'drive' && high && Math.abs(p0[0]) < (bd ? S.HL - 0.4 : 4.8)) kind = 'smash';
  if (q < 0.4) kind = 'save';
  // 沒指定左右就打對手的空檔；AI 程度越高越敢壓邊線（加上誤差偶爾會出界）
  const edge = P.ai ? 0.5 + 0.42 * RK_LV[RK.opt.lv].q * Math.random() : 0.4 + 0.25 * q;
  let tz = aimZ != null ? aimZ : -Math.sign((opp && opp.z) || Math.random() - 0.5) * S.HW * edge;
  let tx = 0, v = null;
  const err = (1 - q) * 1.5;
  const J = () => rkGauss() * err;
  if (kind === 'smash') { const jb = P.air ? 1 + 0.2 * jq * (q > 0.75 ? 1 : 0.3) : 1; tx = o * (P.air && q > 0.75 ? 2.6 + Math.random() * 1.6 : 3.4 + Math.random() * 1.8); v = rkSmash(S, p0, tx + J() * 0.5, clamp(tz + J(), -S.HW, S.HW), (bd ? 34 : 19) * (0.85 + 0.15 * q) * jb); if (!v) kind = 'drive'; }
  if (kind === 'drive') { tx = o * (S.HL - (bd ? 1.8 : 1.2)); v = rkLowest(S, p0, tx + J(), tz + J(), bd ? -6 : -4, 30, 0.1, bd ? 34 : 22); }
  if (kind === 'soft') {
    if (bd) { const net = Math.abs(p0[0]) < 2.6; tx = o * (net ? 0.95 : 1.9); v = rkLowest(S, p0, tx + J() * 0.4, tz * 0.7 + J() * 0.6, net ? 16 : 0, 80, 0.06, net ? 14 : 26); }
    else { tx = o * (1.05 + Math.random() * 0.75); v = rkLowest(S, p0, tx + J() * 0.5, tz * 0.6 + J() * 0.6, 8, 76, 0.05, 13); }
  }
  if (kind === 'lob' || !v) { if (kind !== 'save') kind = 'lob'; tx = o * (S.HL - 0.7); v = rkSolve(S, p0, tx + J(), clamp(tz + J(), -S.HW, S.HW), bd ? 40 : 56); }
  if (kind === 'save' || !v) { kind = 'save'; tx = o * (S.HL * 0.55); v = rkSolve(S, p0, tx + J() * 0.5, tz * 0.4 + J() * 0.5, bd ? 62 : 55) || [o * 4, 9, 0]; }
  rkLaunch(side, p0, v, { kind });
  return { kind };
}
// ---- AI：反應時間、跑速、站位誤差、選球照程度不同；跟你一樣要跑到位才打得好
function rkAiShot(P, r) {
  const S = RK.S, lv = RK_LV[RK.opt.lv], opp = RK.P[-P.side], y = RK.b.p[1], bd = RK.k === 'bd', oppNear = Math.abs(opp.x) < 3, rnd = Math.random();
  if (bd) {
    if (y >= 2.15 && Math.abs(P.x) < S.HL - 0.6 && rnd < lv.smash + (RK.popup ? 0.3 : 0)) return 'drive';
    if (oppNear) return rnd < 0.75 ? 'lob' : 'drive';
    if (Math.abs(P.x) < 2.4 && y < S.net) return rnd < 0.6 ? 'soft' : 'lob';
    return rnd < 0.35 ? 'soft' : rnd < 0.7 ? 'lob' : 'drive';
  }
  if (RK.rally === 1) return rnd < 0.7 ? 'drive' : 'lob';                     // 接發球：深一點
  if (y > S.net + 0.4 && Math.abs(P.x) < 4.8 && rnd < lv.smash + 0.2) return 'drive';
  if (RK.rally === 2) return rnd < 0.4 + lv.q * 0.3 ? 'soft' : 'drive';      // 第三拍：放小球上網
  if (oppNear) return rnd < 0.68 ? 'soft' : rnd < 0.82 ? 'lob' : 'drive';
  return rnd < 0.5 ? 'soft' : 'drive';
}
// 站位：沿著預測的球路，找第一個「跑得到、高度又好打」的點，站在它旁邊 0.45 m（球在身體前面偏右手邊）
function rkStance(P, spd) {
  const b = RK.b, S = RK.S, path = RK.path; if (!b || !b.live || !path || b.by === P.side) return null;
  let best = null, bestLate = 1e9;
  for (const s of path.pts) {
    if (s.t < b.t + 0.05 || s.x * P.side < 0.15) continue;
    if (S.cor && s.nb === 0 && (RK.bounceReq > 0 || Math.abs(s.x) < S.kitchen + 0.3)) continue;
    if (s.y < S.minY || s.y > S.top - 0.1) continue;
    const sx = s.x + P.side * 0.45, sz = s.z + P.side * 0.3, late = Math.hypot(sx - P.x, sz - P.z) / spd - (s.t - b.t);
    const st = { x: sx, z: sz, t: s.t, y: s.y };
    if (late <= 0) return st;
    if (late < bestLate) { bestLate = late; best = st; }
  }
  return best;
}
function rkBase(P) {
  const S = RK.S, lv = RK.opt.lv;
  if (RK.k === 'bd') return { x: P.side * 3.9, z: 0 };
  const net = RK.rally >= 3 || (RK.rally >= 2 && P.side !== RK.st.srv);       // 接發球那方回完球就上網；發球方第三拍後上網
  return net && lv > 1 ? { x: P.side * (S.kitchen + 0.35), z: 0 } : { x: P.side * (S.HL - 0.3), z: 0 };
}
function rkAiUpdate(P, dt, now) {
  const S = RK.S, lv = RK_LV[RK.opt.lv], b = RK.b, spd = S.speed * lv.speed;
  if (RK.phase === 'serve') { if (RK.st.srv === P.side && now > RK.aiServeAt) rkServe(P, RK.k === 'bd' ? (Math.random() < 0.7 ? 'soft' : 'lob') : 'drive'); return { x: P.x, z: P.z, spd: 0 }; }
  if (RK.phase === 'rally' && b.live && b.by !== P.side && now >= P.reactAt && !P.missed) {
    if (!P.plan) { P.plan = rkStance(P, spd); P.err = [rkGauss() * lv.err * 0.5, rkGauss() * lv.err]; }
    else if (Math.random() < dt * 3) { const np = rkStance(P, spd); if (np) P.plan = np; }
    if (P.plan) {
      if (!P.queued && P.plan.t - b.t < 0.5) P.queued = { shot: null, t0: now - 250 - 250 * lv.q };
      return { x: P.plan.x + P.err[0], z: P.plan.z + P.err[1], spd };
    }
  }
  const bs = rkBase(P); return { x: bs.x, z: bs.z, spd: spd * 0.8 };
}
// ---- 落地、掛網、得分
function rkInServeBox(side) {
  const b = RK.b, S = RK.S, ax = Math.abs(b.p[0]), dz = -Math.sign(b.srvZ);
  return ax >= S.short - 0.02 && ax <= S.HL + 0.02 && b.p[2] * dz >= -0.03 && Math.abs(b.p[2]) <= S.HW + 0.02 && Math.sign(b.p[0]) === side;
}
function rkBallStep(h) {
  const b = RK.b, S = RK.S, x0 = b.p[0], y0 = b.p[1];
  rkStepBall(S, b, h); b.t += h;
  if (!b.netHit && x0 !== 0 && Math.sign(x0) !== Math.sign(b.p[0])) {
    const y = y0 + (b.p[1] - y0) * (x0 / (x0 - b.p[0]));
    if (Math.abs(b.p[2]) < S.HWF + 0.15 && y < rkNetTop(S, b.p[2])) { b.netHit = true; b.p[0] = x0 * 0.5; b.v[0] *= -0.1; b.v[1] = Math.min(b.v[1], 0) * 0.3; b.v[2] *= 0.3; rkSay('掛網！', 'warn'); }
  }
  if (b.p[1] <= S.r) rkFloor();
}
function rkFloor() {
  const b = RK.b, S = RK.S, side = Math.sign(b.p[0]) || 1, hitter = b.by;
  const inB = Math.abs(b.p[0]) <= S.HL + 0.02 && Math.abs(b.p[2]) <= S.HW + 0.02;   // 壓線算界內
  b.p[1] = S.r;
  if (!S.cor || b.bounces > 0) {
    b.live = false;
    if (S.cor) return rkPoint(-b.bounceSide, '球落地兩次，沒接到');
    if (b.netHit || side === hitter) return rkPoint(-hitter, b.netHit ? '掛網' : '沒過網');
    if (!inB) return rkPoint(-hitter, '出界');
    if (b.serve && !rkInServeBox(side)) return rkPoint(-hitter, '發球沒落在對角發球區');
    return rkPoint(hitter, '落地得分');
  }
  if (b.netHit || side === hitter) { b.live = false; return rkPoint(-hitter, b.netHit ? '掛網' : '沒過網'); }
  if (!inB) { b.live = false; return rkPoint(-hitter, '出界'); }
  if (b.serve && !rkInServeBox(side)) { b.live = false; return rkPoint(-hitter, '發球要落在對角、廚房線後面'); }
  b.bounces = 1; b.bounceSide = side; b.v[1] = -b.v[1] * S.cor; b.v[0] *= 0.86; b.v[2] *= 0.86;
}
function rkPoint(win, why, force) {
  if (RK.phase !== 'rally') return;
  // 連線：球落在誰那邊就由誰判（被打的那一方）；自己剛打出去的球先停住，等對方判決（2.5 秒沒收到就自己判）
  if (RK.netOp && !force && RK.b.by === RK.my) { RK.waitPt = { win, why, t: RK.clock }; RK.phase = 'wait'; return; }
  const st = RK.st, idx = (s) => (s > 0 ? 0 : 1);
  if (RK.k === 'bd') { st.sc[idx(win)]++; st.srv = win; }
  else if (win === st.srv) st.sc[idx(win)]++;
  else { st.srv = win; why += '・換發球'; }
  if (RK.netOp && NET.on) NET.tx.publish('rk', { e: 'pt', win, why, sc: st.sc, srv: st.srv });
  rkAfterPoint(win, why);
}
function rkApplyPt(d) { const st = RK.st; st.sc = d.sc; st.srv = d.srv; RK.waitPt = null; RK.b.live = false; rkAfterPoint(d.win, d.why); }
function rkAfterPoint(win, why) {
  RK.phase = 'dead'; RK.waitPt = null;
  const st = RK.st, a = st.sc[RK.my > 0 ? 0 : 1], b = st.sc[RK.my > 0 ? 1 : 0], mine = win === RK.my;
  rkSay(`${why}・${mine ? '你得分' : RK.P[-RK.my].name + ' 得分'}`, mine ? 'gold' : 'warn', 1600);
  rkHud();
  const to = st.to, cap = RK.k === 'bd' ? (to === 21 ? 30 : 15) : 99, hiS = Math.max(a, b);
  if ((hiS >= to && Math.abs(a - b) >= 2) || hiS >= cap) { st.over = true; RK.next = { at: RK.clock + 1700, fn: () => rkOver(a > b) }; return; }
  RK.next = { at: RK.clock + 1700, fn: rkSetupServe };
}
function rkOver(won) {
  if (!RK.on) return;
  RK.phase = 'over';
  const st = RK.st, a = st.sc[RK.my > 0 ? 0 : 1], b = st.sc[RK.my > 0 ? 1 : 0], m = $('rk-menu');
  m.innerHTML = `<div class="rk-box"><h3>${won ? '🏆 你贏了！' : '這局輸了'}</h3><p class="rk-final">${a}：${b}</p><p>${won ? '' : '再來一場？'}對手：${esc(RK.P[-RK.my].name)}</p><div class="rk-btns">${RK.netOp ? '' : '<button type="button" class="primary" data-rkm="again">再一場</button>'}<button type="button" data-rkm="quit">離開對戰</button></div></div>`;
  m.hidden = false;
}
// ---- 每一格
function rkUpdate(dt) {
  // 對戰用自己的時鐘（毫秒）：反應時間、準備時間都照遊戲時間算
  RK.clock += dt * 1000;
  const now = RK.clock, S = RK.S, me = RK.P[RK.my], op = RK.P[-RK.my], c = RK.c;
  if (!state.items.some((i) => i.id === c.it.id) || (RK.netOp && !NET.peers.has(RK.netOp))) { rkStop(true); toast(RK.netOp ? '對手離線了，對戰結束' : '這面球場被改掉了，對戰結束'); return; }
  // 我：WASD／搖桿（W＝往網子），擊球輔助開著時沒按方向就自己跑去站位圈
  const k = walk.keys; let f = 0, r = 0;
  if (k.has('w') || k.has('arrowup')) f += 1; if (k.has('s') || k.has('arrowdown')) f -= 1; if (k.has('d') || k.has('arrowright')) r += 1; if (k.has('a') || k.has('arrowleft')) r -= 1;
  f += -walk.joy.y; r += walk.joy.x;
  const mv = Math.hypot(f, r) > 0.1, sprint = staSprint((k.has('shift') || walk.joyRun) && mv && !me.air && !me.dive && !me.down && !(RK.phase === 'serve' && RK.st.srv === RK.my), dt), spd = S.speed * (sprint ? 1.1 : 0.74);
  let tvx = -RK.my * f * spd, tvz = -RK.my * r * spd;
  const myPlan = RK.phase === 'rally' ? rkStance(me, S.speed) : null;
  if (RK.opt.assist && Math.hypot(f, r) < 0.1 && myPlan) { const dx = myPlan.x - me.x, dz = myPlan.z - me.z, d = Math.hypot(dx, dz); if (d > 0.08) { const s2 = Math.min(S.speed * 0.8, d * 6); tvx = (dx / d) * s2; tvz = (dz / d) * s2; } }
  // 撲救中：往球衝；落地趴著不能動；空中：保持起跳時的速度
  if (me.dive) { me.dive.t += dt; const e = clamp(me.dive.t / 0.4, 0, 1); tvx = me.dive.vx * (1 - e * 0.6); tvz = me.dive.vz * (1 - e * 0.6); if (e >= 1) { me.dive = null; me.down = 0.7; sfx('slide', 0.7); } }
  else if (me.down > 0) { me.down -= dt; tvx = tvz = 0; }
  else if (me.air) { tvx = me.vx; tvz = me.vz; }
  if (me.air) { me.air.t += dt; if (me.air.t >= me.air.T) me.air = null; }
  const lockServe = RK.phase === 'serve' && RK.st.srv === RK.my;
  rkMove(me, lockServe ? 0 : tvx, lockServe ? 0 : tvz, dt);
  // 對手
  if (op.ai) { const tg = rkAiUpdate(op, dt, now), dx = tg.x - op.x, dz = tg.z - op.z, d = Math.hypot(dx, dz); const s2 = d > 0.06 ? Math.min(tg.spd, d * 5) : 0; rkMove(op, d > 0.06 ? (dx / d) * s2 : 0, d > 0.06 ? (dz / d) * s2 : 0, dt); }
  else if (op.remote) { const p2 = NET.peers.get(RK.netOp); if (p2) { const [u, w] = rkL(c, p2.x, p2.z); op.x = u; op.z = w; } }
  // 球
  const b = RK.b;
  if (b.held != null) { const P = RK.P[b.held]; if (P && !P.remote) { b.p = [P.x - P.side * 0.4, S.hand + Math.sin(now / 300) * 0.02, P.z]; } else if (op.remote) b.p = [op.x + RK.my * 0.4, S.hand, op.z]; }
  else if (b.live) { RK.acc += dt; while (RK.acc >= RK_H && RK.b.live) { RK.acc -= RK_H; rkBallStep(RK_H); for (const P of Object.values(RK.P)) if (!P.remote && b.live) rkCheckHit(P, now); } }
  if (me.sw && (!RK.b.live || b.held != null)) { me.sw.t += dt; if (me.sw.t > 0.2) me.sw = null; }
  if (RK.next && now >= RK.next.at) { const f = RK.next.fn; RK.next = null; f(); }
  if (RK.waitPt && now - RK.waitPt.t > 2500) { const w = RK.waitPt; RK.waitPt = null; RK.phase = 'rally'; rkPoint(w.win, w.why, true); }
  if (me.queued && now - me.queued.t0 > 2200) me.queued = null;
  // 畫面
  for (const P of Object.values(RK.P)) if (P.av) rkAnim(P, dt);
  vbParts(dt);
  rkVisuals(myPlan, now);
  rkCamera(dt);
  const [wx, wz] = rkW(c, me.x, me.z); walk.x = wx; walk.z = wz; walk.yaw = rkYawToNet(RK.my);
}
function rkMove(P, tvx, tvz, dt) {
  const S = RK.S, kk = 1 - Math.exp(-dt * 11);
  P.vx += (tvx - P.vx) * kk; P.vz += (tvz - P.vz) * kk;
  P.x += P.vx * dt; P.z += P.vz * dt;
  const ax = clamp(P.x * P.side, 0.25, S.HL + 2.2); P.x = ax * P.side; P.z = clamp(P.z, -S.HWF - 1.4, S.HWF + 1.4);
}
// 人形動作：跑步擺腿；準備（拍子拉到後面）、上手揮拍（殺球、高遠）、下手／側身揮拍
function rkAnim(P, dt) {
  const c = RK.c, av = P.av, [x, z] = rkW(c, P.x, P.z), k = 1 - Math.exp(-dt * 14);
  av.g.position.set(x, 0, z);
  const [ax, az] = rkW(c, 0, 0), [bx, bz] = rkW(c, P.side, 0); av.g.rotation.y = Math.atan2(ax - bx, az - bz);
  const sp = Math.hypot(P.vx, P.vz); av.phase += dt * Math.min(13, sp * 5.5);
  // 準備姿勢（低重心、拍頭在前）→ 上手：拉拍、擊球、收拍；平抽：拉到側後方、往前掃
  let pz = RK.phase === 'rally' ? AVP.rkReady : AVP.idle, jy = 0, kk = k;
  if (P.dive || P.down > 0) pz = P.dive ? AVP.dive : AVP.down;
  else if (P.swing) {
    P.swing.t += dt; const s = P.swing.t / 0.3;
    if (s >= 1) P.swing = null;
    else { pz = avPoseOf(P.swing.over ? 7 : 8, s); kk = 0.5; if (P.swing.over && P.swing.kind === 'smash') jy = Math.sin(s * Math.PI) * 0.35; }
  } else if (P.queued) pz = RK.b && RK.b.p[1] > 1.8 ? AVP.rkOverCock : AVP.rkSideBack;
  else if (P.air) pz = AVP.rkOverCock;
  jy = Math.max(jy, rkAirY(P));
  av.fall = (P.dive && P.dive.t > 0.06) || P.down > 0.15 ? { a: 1, d: 0 } : null;
  avDrive(av, pz, kk, sp, jy > 0.05);
  P.jy = jy; av.body.position.y += (jy - av.body.position.y) * 0.5;
}
function rkVisuals(myPlan, now) {
  const c = RK.c, S = RK.S, b = RK.b, [x, z] = rkW(c, b.p[0], b.p[2]);
  RK.ballM.position.set(x, b.p[1], z);
  if (RK.k === 'bd' && Math.hypot(b.v[0], b.v[1], b.v[2]) > 0.3) { const [vx, vz] = [b.v[0] * Math.cos(c.yaw) + b.v[2] * Math.sin(c.yaw), -b.v[0] * Math.sin(c.yaw) + b.v[2] * Math.cos(c.yaw)]; RK.ballM.lookAt(x + vx, b.p[1] + b.v[1], z + vz); }
  else if (RK.k === 'pb' && b.live) { RK.ballM.rotation.x += 0.2; RK.ballM.rotation.y += 0.13; }
  RK.shadow.position.set(x, 0.012, z); RK.shadow.material.opacity = clamp(0.4 - b.p[1] * 0.06, 0.08, 0.4);
  // 尾巴
  if (b.live) { RK.trailPts.push(new THREE.Vector3(x, b.p[1], z)); if (RK.trailPts.length > RK.trailN) RK.trailPts.shift(); }
  const pos = RK.trail.geometry.attributes.position; for (let i = 0; i < RK.trailN; i++) { const p = RK.trailPts[Math.max(0, RK.trailPts.length - RK.trailN + i)] || RK.ballM.position; pos.setXYZ(i, p.x, p.y, p.z); } pos.needsUpdate = true; RK.trail.visible = b.live;
  // 落點提示、站位圈（金色＝可以殺、紅色＝可以進攻）
  const hint = RK.opt.hint && b.live;
  RK.landM.visible = !!(hint && RK.path && RK.path.land && !b.bounces && !b.netHit);
  if (RK.landM.visible) { const [lx, lz] = rkW(c, RK.path.land[0], RK.path.land[1]); RK.landM.position.set(lx, 0.015, lz); const out = Math.abs(RK.path.land[0]) > S.HL || Math.abs(RK.path.land[1]) > S.HW; RK.landM.material.color.set(out ? '#9AA4B2' : '#FFFFFF'); }
  RK.stanceM.visible = !!(hint && myPlan && b.by !== RK.my);
  if (RK.stanceM.visible) {
    const [sx, sz] = rkW(c, myPlan.x, myPlan.z); RK.stanceM.position.set(sx, 0.016, sz);
    const gold = myPlan.y >= (RK.k === 'bd' ? 2.15 : S.net + 0.4) && Math.abs(myPlan.x) < (RK.k === 'bd' ? S.HL - 0.4 : 4.8), red = !gold && myPlan.y > S.net + 0.2 && Math.abs(myPlan.x) < 4;
    RK.stanceM.material.color.set(gold ? '#F2B705' : red ? '#E5484D' : '#FFFFFF'); RK.stanceM.scale.setScalar(1 + Math.sin(now / 160) * 0.06);
  }
}
function rkCamera(dt) {
  const c = RK.c, me = RK.P[RK.my], s = RK.my, bd = RK.k === 'bd', port = camera.aspect < 0.8;
  const back = (bd ? 4.6 : 3.9) + (port ? 1.6 : 0), hy = (bd ? 3.3 : 2.6) + (port ? 0.6 : 0);
  // 鏡頭固定在自己正後方；球場靠牆時鏡頭會在牆外，擋住視線的那面外牆在對戰時自動隱藏（drawFrame 裡）
  const [cx, cz] = rkW(c, me.x + s * back, me.z * 0.7), [lx, lz] = rkW(c, me.x - s * 4.5, me.z * 0.35);
  const want = new THREE.Vector3(cx, Math.min(hy, state.building.H - 0.6), cz);
  if (!RK.cam) RK.cam = want.clone(); else RK.cam.lerp(want, 1 - Math.exp(-dt * 6));
  const bp = RK.ballM.position, live = RK.b && RK.b.live, w = live ? 0.55 : 0.25, look = new THREE.Vector3(lx + (bp.x - lx) * w, 0.9 + (Math.min(bp.y, 6) - 0.9) * (live ? 0.4 : 0.2), lz + (bp.z - lz) * w);
  if (!RK.look) RK.look = look.clone(); else RK.look.lerp(look, 1 - Math.exp(-dt * 5));
  camera.position.copy(RK.cam); camera.lookAt(RK.look);
  const fov = port ? 72 : 60; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
}
// ---- 介面
function rkSay(t, kind = '', ms = 1100) { const m = $('rk-msg'); m.textContent = t; m.dataset.k = kind; m.hidden = false; clearTimeout(RK.sayT); RK.sayT = setTimeout(() => { m.hidden = true; }, ms); }
function rkHud() {
  const st = RK.st, a = st.sc[RK.my > 0 ? 0 : 1], b = st.sc[RK.my > 0 ? 1 : 0], meSrv = st.srv === RK.my, op = RK.P[-RK.my];
  $('rk-a').innerHTML = `${meSrv ? '<i></i>' : ''}你`; $('rk-b').innerHTML = `${esc(op.name)}${meSrv ? '' : '<i></i>'}`;
  $('rk-sc').textContent = `${a}：${b}`;
  const touch = coarse(), bd = RK.k === 'bd';
  $('rk-tip').textContent = RK.phase === 'serve' && meSrv
    ? (bd ? (touch ? '你發球：軟＝短球、抽＝平快、挑＝長球' : '你發球：J 短球・K 平快・L 長球') : (touch ? '你發球：按任一顆（低手發到對角，要過廚房線）' : '你發球：J／K／L 任一鍵（低手發到對角，要過廚房線）'))
    : touch ? '搖桿推到底衝刺（耗體力）・圓圈縮到球上時按・跳起來按「抽」＝跳殺・衝刺中按擊球鍵＝撲救' : `WASD 跑位・Shift 衝刺（耗體力）・J 軟・K 抽・L 挑・圓圈縮到球上時按（太早太晚會揮空）・空白鍵跳、跳到最高點按 K＝跳殺・Shift＋擊球鍵＝撲救・按著 A／D 控制左右${bd ? '' : '・匹克球要先讓發球、接發球各落地一次'}`;
}
function rkPress(shot) {
  if (!RK.on || RK.phase === 'over') return;
  if (shot === 'jump') { rkJump(); return; }
  const me = RK.P[RK.my];
  if (RK.phase === 'serve' && RK.st.srv === RK.my) { rkServe(me, shot); return; }
  if (RK.phase !== 'rally') return;
  if (me.sw || me.dive || me.down > 0 || (me.swing && me.swing.t < 0.22) || RK.clock < (me.cool || 0)) return;   // 還在揮、撲倒在地上，或剛揮空在收拍
  if ((walk.keys.has('shift') || walk.joyRun) && !me.air) { const id0 = rkIdeal(me); if (!(id0 && id0.t < 0.3) && rkDive(me, shot)) return; }   // 衝刺中、球在拍子碰不到的地方＝撲過去
  const id = rkIdeal(me);
  me.sw = { t: 0, shot, ideal: id, pc: null }; me.swing = { t: 0, over: id ? id.y > 1.7 : RK.b.p[1] > 1.7, kind: 'pre' };
  const pad = document.querySelector(`#rk-pad [data-rk="${shot}"]`); if (pad) { pad.classList.add('on'); setTimeout(() => pad.classList.remove('on'), 160); }
}
function rkOpenMenu(it) {
  const c = (it && rkCourtNear(walk.x, walk.z, it)) || rkCourtNear(walk.x, walk.z); if (!c) { toast('站到羽球場或匹克球場上再開打'); return; }
  RK.menuC = c; const bd = c.k === 'bd', m = $('rk-menu');
  if (RK.opt.assist == null) RK.opt.assist = coarse();   // 手機上跑位比較難，預設開擊球輔助
  m.innerHTML = `<div class="rk-box"><h3>${bd ? '🏸' : '🥒'} ${esc(rkLabel(c))}・單打</h3>
    <p class="rk-sub">對手程度</p><div class="rk-seg">${[1, 2, 3].map((l) => `<button type="button" data-lv="${l}" aria-pressed="${RK.opt.lv === l}">${RK_LV[l].name}</button>`).join('')}</div>
    ${bd ? `<p class="rk-sub">打到幾分</p><div class="rk-seg">${[11, 21].map((n) => `<button type="button" data-to="${n}" aria-pressed="${RK.opt.to === n}">${n} 分</button>`).join('')}</div>` : '<p class="rk-sub">規則：11 分、換發球制（只有發球方得分）、雙彈跳、廚房內不能截擊</p>'}
    <label class="rk-chk"><input type="checkbox" id="rk-assist"${RK.opt.assist ? ' checked' : ''}> 擊球輔助（沒按方向時自動跑到站位圈、擊球範圍變大）</label>
    <label class="rk-chk"><input type="checkbox" id="rk-hint"${RK.opt.hint ? ' checked' : ''}> 顯示落點和站位圈</label>
    <div class="rk-btns"><button type="button" class="primary" data-rkm="ai">跟 AI 打</button><button type="button" data-rkm="net">${NET.on ? '連線對打（等房間裡的人）' : '連線對打（先開「多人連線」）'}</button><button type="button" data-rkm="close">取消</button></div>
    <p class="rk-sub" style="margin-top:10px">${coarse() ? '左邊搖桿跑位；右邊「軟／抽／挑」三顆鍵' : 'WASD 跑位・J 軟・K 抽・L 挑'}：按下去就揮拍，球旁邊的圓圈縮到球上時按最準（PERFECT），太早太晚會揮空。站太近、太遠或撈太低，回球都會變差。</p></div>`;
  m.hidden = false; unlockMouse();
}
function rkMenuClick(e) {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.lv) { RK.opt.lv = Number(t.dataset.lv); for (const q of $('rk-menu').querySelectorAll('[data-lv]')) q.setAttribute('aria-pressed', String(q === t)); return; }
  if (t.dataset.to) { RK.opt.to = Number(t.dataset.to); for (const q of $('rk-menu').querySelectorAll('[data-to]')) q.setAttribute('aria-pressed', String(q === t)); return; }
  const a = t.dataset.rkm; if (!a) return;
  if ($('rk-assist')) { RK.opt.assist = $('rk-assist').checked; RK.opt.hint = $('rk-hint').checked; }
  if (a === 'close') { $('rk-menu').hidden = true; RK.ask = null; return; }
  if (a === 'quit') { rkStop(); return; }
  if (a === 'again') { const c = RK.c; rkStop(true); rkStart(c); return; }
  if (a === 'ai') { rkStart(RK.menuC); return; }
  if (a === 'net') {
    if (!NET.on) { toast('請先回大廳開房，再請朋友用代碼加入'); return; }
    const c = RK.menuC; RK.ask = { key: c.key, t: performance.now() };
    NET.tx.publish('rk', { e: 'ask', key: c.key, to: RK.opt.to });
    if (RK.peerAsk && RK.peerAsk.key === c.key && performance.now() - RK.peerAsk.t < 120000) { rkGo(RK.peerAsk.from, c.key, RK.peerAsk.to); return; }
    $('rk-menu').hidden = true; toast(`等對手：請朋友走到「${rkLabel(c)}」也按「連線對打」`);
  }
}
function rkGo(other, key, peerTo) {
  const c = rkCourts().find((q) => q.key === key); if (!c) return;
  const [a, b] = [NET.me, other].sort(), to = Math.min(RK.opt.to, peerTo || RK.opt.to);
  NET.tx.publish('rk', { e: 'go', key, a, b, to });
  rkStart(c, { net: other, side: a === NET.me ? 1 : -1, to });
}
function rkOnNet(d, from) {
  if (d.e === 'hit' && d.key && (!RK.on || from !== RK.netOp)) { rkSpectate(d); return; }
  if (d.e === 'ask') {
    if (!RK.on && RK.ask && RK.ask.key === d.key && performance.now() - RK.ask.t < 120000) rkGo(from, d.key, d.to);
    else { RK.peerAsk = { from, key: d.key, to: d.to, t: performance.now() }; const p2 = NET.peers.get(from); if (!RK.on && p2) toast(`${p2.n} 在等人一起打${SPORT[(rkCourts().find((q) => q.key === d.key) || {}).k] || '球'}：走到同一面場地按「開打」→「連線對打」`); }
    return;
  }
  if (d.e === 'go') {
    if (RK.on || (d.a !== NET.me && d.b !== NET.me)) return;
    const c = rkCourts().find((q) => q.key === d.key); if (!c) return;
    rkStart(c, { net: d.a === NET.me ? d.b : d.a, side: d.a === NET.me ? 1 : -1, to: d.to }); return;
  }
  if (!RK.on || from !== RK.netOp) return;
  if (d.e === 'hit') {
    RK.b = { p: [...d.p], v: [...d.v], live: true, by: d.side, serve: d.serve, t: 0, bounces: 0, bounceSide: 0, netHit: false, srvZ: RK.st.srvZ };
    RK.path = rkPath(RK.S, d.p, d.v); RK.phase = 'rally'; RK.hitN = d.n; RK.rally++; RK.bounceReq = d.br; RK.popup = d.pop; RK.trailPts = []; RK.acc = 0;
    const me = RK.P[RK.my]; me.prevCost = null; me.missed = false;
    for (let i = 0; i < 12; i++) rkBallStep(RK_H);   // 補上大約 50 ms 的網路延遲
  } else if (d.e === 'pt') rkApplyPt(d);
  else if (d.e === 'bye') { rkStop(true); toast('對手離開了，對戰結束'); }
}
function rkKey(k) {
  if (k === 'j') { rkPress('soft'); return true; }
  if (k === 'k') { rkPress('drive'); return true; }
  if (k === 'l') { rkPress('lob'); return true; }
  if (k === ' ') { rkJump(); return true; }
  if (['e', 'q', 'f'].includes(k)) { if (performance.now() - (RK.keyT || 0) > 4000) { RK.keyT = performance.now(); toast('對戰中用 J 軟、K 抽、L 挑擊球；空白鍵跳、Shift 衝刺'); } return true; }
  return false;
}
$('rk-menu').addEventListener('click', rkMenuClick);
$('rk-x').addEventListener('click', () => rkStop());
$('rk-rec').addEventListener('click', () => recToggle('rk'));
$('rk-play').addEventListener('click', () => openReplay());
for (const b of $('rk-pad').querySelectorAll('[data-rk]')) {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) { /* ignore */ } rkPress(b.dataset.rk); });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}

