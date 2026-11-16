// ---------------------------------------------------------------- 排球自由操控：W 助跑、空白鍵起跳（跑越快跳越高、會往前衝）、空中按 V 攻擊、R 攔網、V 接球、1／2／3 舉球
// 不再是固定動畫：手真的碰得到球才打得到；攻擊方向＝你面向的方向（直線、斜線自己瞄），按著 S 是往下壓的短斜線、Shift＋V 吊球
// 接球微輔助：對方打過來、球會落在你附近時，地上出現落點圈，身體會被輕輕帶過去（自己按反方向就不帶）
// 舉球 1 前舉（4 號位）、2 中間快攻、3 後舉（2 號位）：舉出去一定會到那個攻擊點，難的是先跑到球下面
// ---- 體力（比賽、陪練、球拍對戰時才算）：每個動作都會耗一點，越用力耗越多，要想清楚什麼時候衝、什麼時候跳
//   每個動作耗幾 %、回多快都在 STA_DEF（可以在比賽選單改）；6 對 6 做自己專長的動作少耗
//   累了效果變差（30% 以下跳得比較矮、扣得比較慢，最低八成），但接、舉、吊、站著打永遠做得到；衝刺用光要回到 25% 才能再衝。導覽時不用體力
const STA = { v: 1, lock: false, useT: 0, warnT: 0 };
// 跳躍：空中往下掉得比真實慢一點（滯空久，攔中可以先跳起來等舉球）；玩家、連線的人、AI 都一樣
const JUMP_G = 8.4;
const AV_SCALE = 1.2, AV_JUMP_K = 1.18;   /* 角色放大 1.2 倍後舉手高約 1.91 m（判定手高 2.37 m）；離地高度在放大的座標裡再乘 1.18，畫面上總共約 1.4 倍，到頂時手跟判定位置差不多 */
// 體力設定（百分比，比賽選單「⚙️ 體力設定」可以改，存在這台電腦；連線時大家照開局的人的設定）
const STA_DEF = { sprint: 21, jump: 15.5, jserve: 15.5, block: 11.5, spike: 8, hit: 4, serve: 4, tip: 2.6, set: 2.6, bump: 2, dive: 39, spec: 30, regMove: 5, regStill: 8, regDead: 10 };   // 每個動作比上一版多耗三成
const STA_LBL = { sprint: '衝刺（每秒）', jump: '起跳攻擊', jserve: '跳發', block: '攔網起跳', spike: '扣球', hit: '站著打', serve: '發球', tip: '吊球', set: '舉球', bump: '接球', dive: '撲救', spec: '專職少耗', regMove: '比賽中跑動（每秒回）', regStill: '比賽中站著（每秒回）', regDead: '死球、等發球（每秒回）' };
let STA_CFG = { ...STA_DEF }; try { Object.assign(STA_CFG, JSON.parse(localStorage.getItem('vb.stacfg2') || '{}')); } catch (e) { /* ignore */ }
// 6 對 6 專職：做自己位置專長的動作少耗（spec %）——舉球：舉球、二次球吊；大砲：扣、起跳、接球、撲救；舉對：扣、起跳、攔網；攔中：攔網、起跳（快攻）、扣
const STA_SPEC = { S: ['set', 'tip'], OH: ['spike', 'jump', 'bump', 'dive'], OPP: ['spike', 'jump', 'block'], MB: ['block', 'jump', 'spike'] };
function staCfg() { return VM.on && !VM.host && VM.stacfg ? VM.stacfg : STA_CFG; }
function staCost(kind, id) { const c = staCfg(), r = VM.on && VM.six && VM.role ? VM.role[id] : null, base = (+c[kind] || 0) / 100 * (VM.on ? 0.7 : 1); return r && (STA_SPEC[r] || []).includes(kind) ? base * (1 - clamp(+c.spec || 0, 0, 90) / 100) : base; }
function staEff() { return staGame() ? 0.8 + 0.2 * clamp(STA.v / 0.3, 0, 1) : 1; }   // 這一下的力道比例
function staPay(kind, mul = 1) { if (!staGame()) return 1; const f = staEff(); STA.v = Math.max(0, STA.v - staCost(kind, vmMe()) * mul); STA.useT = performance.now(); return f; }   // 一定做得到，只是累了比較弱
function staGame() { return !!(vmIsPractice() || window.__rkOn || VM.on || VB.npc); }
function staWarn(t) { if (performance.now() - STA.warnT > 2200) { STA.warnT = performance.now(); toast(t || '沒體力了：放開 Shift 喘一下', 1400); } }
function staUse(n) { if (!staGame()) return true; if (STA.v < n) { staWarn('體力不夠，沒辦法撲／跳那麼用力'); return false; } STA.v -= n; STA.useT = performance.now(); if (STA.v < 0.02) { STA.v = 0; STA.lock = true; } return true; }
function staSprint(want, dt) {
  if (!staGame()) return want;
  if (!want) return false;
  if (STA.lock) { staWarn(); return false; }
  STA.v = Math.max(0, STA.v - staCost('sprint', vmMe()) * dt); STA.useT = performance.now();
  if (STA.v <= 0) { STA.lock = true; staWarn(); return false; }
  return true;
}
function staTick(dt) {
  const on = staGame() && !RP.on, el = $('sta');
  if (!on) { STA.v = 1; STA.lock = false; if (el && !el.hidden) el.hidden = true; return; }
  if (performance.now() - STA.useT > 800) {
    const live = window.__rkOn ? RK.phase === 'rally' : VM.on ? VM.phase === 'rally' : true, still = Math.hypot(...(walk.vel || [0, 0])) < 0.5;
    const c = staCfg(), recovery = live ? (still ? c.regStill : c.regMove) : c.regDead;
    STA.v = Math.min(1, STA.v + recovery / 100 * dt * (vmIsPractice() ? 5 : 1));
  }
  if (STA.lock && STA.v >= 0.25) STA.lock = false;
  if (!el) return;
  const staminaLabel=el.querySelector('b');if(staminaLabel)staminaLabel.textContent='體力 '+Math.round(STA.v*100)+'%';
  el.hidden = false; el.style.setProperty('--v', STA.v.toFixed(3)); const k = STA.lock ? 'lock' : STA.v < 0.3 ? 'low' : ''; if (el.dataset.k !== k) el.dataset.k = k;
}
const VB = { assist: true, target: null, setSpot: null, npc: null, ringLand: null, ringSet: null, ts: 0.7 };
// 球速（球的時間倍率）：很慢 0.55、慢 0.7（預設）、正常 1；預測出來的時間都換算成真實時間，提示、輔助、AI 才會對得上
const VB_SPEEDS = [[0.55, '很慢'], [0.7, '慢'], [1, '正常']];
// Room ball speed starts at the original default, never from personal storage.
const VB_REACH = { atk: 1.0, recv: 0.95, set: 0.9 };
const vbFwd = () => [-Math.sin(walk.yaw), -Math.cos(walk.yaw)];
// 背舉：雙手在頭上往後上方推
POSE.setBack = pair({ e: [-0.17, 0.06, -0.16], w: [-0.07, 0.3, -0.24], f: [-0.05, 0.97, 0.2], n: [0.3, 0.55, 0.25], c: 0.1 }, [0, 0.38, -0.3], 0.5);
// 我站的排球場（網子收起來的複合球場不算）
function vbCourt() { const ct = courtAt(walk.x, walk.z, true); return ct && !ct.c.use ? ct : null; }
// 只算重力：球往下掉到高度 y 的時間與位置
function vbPredict(p, v, y) {
  const a = -4.9, b = v.y, c = p.y - y, d = b * b - 4 * a * c; if (d < 0) return null;
  const t = (-b - Math.sqrt(d)) / (2 * a); return t > 0 ? { t: t / VB.ts, x: p.x + v.x * t, z: p.z + v.z * t } : null;
}
function vbMine(b) { b.mine = true; b.mineT = performance.now(); walk.contactUntil = b.mineT + 900; walk.turn = null; }
// 接觸位置修正後立即延續球路，避免觸球校正期間暫停物理。
const SPIN_AX = new THREE.Vector3();
function vbLaunch(b, cp, v, kind, q = 1, localReturn = false) {
  const from = b.m.position.clone(); b.acc = null; b.float = null;   // 被碰到：上旋、飄的效果就沒了
  if (from.distanceTo(cp) > 0.2) cp = from.clone().add(cp.clone().sub(from).setLength(0.2));
  for (const c of vbNetCourts()) { const [a0, z0] = toLocalOf(c, from.x, from.z), [a1] = toLocalOf(c, cp.x, cp.z); if (Math.sign(a0) !== Math.sign(a1) && Math.abs(z0) < 5.3) cp = from.clone(); }
  b.thirdReturn = !!(localReturn && vmThird() && (kind === 'bump' || kind === 'set') && vbCourt());
  if (b.thirdReturn) v = vbThirdOverVel(cp, vbCourt(), q);
  b.m.position.copy(cp); b.v.copy(v); b.rest = 0; b.serve = false; b.err = null; b.lk = kind; b.lkNpc = false;
  if (kind !== 'set') b.setFault = null;
  b.spinW = vbSpinFor(b, v, kind, q);
  if (NET.on) netBallHit(b, kind, q);   // 別人收到的是「碰到的位置＋出去的速度」
  b.snap = null;
  vbImpact(b, kind, q);
}
// 球在空中怎麼轉（看得到）：扣球強烈上旋；好的舉球幾乎不轉（兩手同時、平均出力），沒舉好、連擊就會轉；其他照品質轉一點
function vbSpinFor(b, v, kind, q) {
  const h = Math.hypot(v.x, v.z) || 1, top = new THREE.Vector3(v.z / h, 0, -v.x / h);   // 水平、跟飛行方向垂直的轉軸：正轉＝上旋
  const rnd = () => new THREE.Vector3(rkGauss(), rkGauss() * 0.5, rkGauss()).normalize();
  if (kind === 'spike') return top.multiplyScalar(40 + 30 * q);   /* 扣球：強上旋，每秒約 6～11 圈（比賽同步後不再自動滾動，轉速要夠才看得出來） */
  if (kind === 'set') { const r = b.setFault === 'double' ? 16 + gameRandom() * 6 : q >= 0.85 ? 0 : (0.85 - q) * 22; return r ? top.multiplyScalar(0.5).add(rnd()).normalize().multiplyScalar(r) : null; }
  if (kind === 'tip') return top.multiplyScalar(-3);
  return top.multiplyScalar(12 + 6 * (1 - q)).add(rnd().multiplyScalar(4 + 6 * (1 - q)));   /* 接球、墊球：每秒約 2～3 圈，接得越差越亂 */
}
// 碰網的隨機結果：連線時用擊球序號算（每台電腦一樣），自己玩就真的亂數
function vbNetRoll(k) { if (!NET.on) return gameRandom(); const x = Math.sin(NET.hitN * 12.9898 + k * 78.233 + (NET.hitBy || '').length * 3.7) * 43758.5453; return x - Math.floor(x); }
// 碰到的那一刻：粒子、球壓扁一下、擊球聲；扣球、攔網鏡頭震一下
function vbImpact(b, kind, q = 1) {
  vbBurst(b.m.position, q >= 0.88 ? '#F2B705' : '#FFFFFF', kind === 'spike' ? 22 : 13, kind === 'spike' ? 3.4 : 2);
  b.squash = 0.12; sfx(kind, q, b.m.position);
  if ((kind === 'spike' || kind === 'block') && b.m.position.distanceTo(camera.position) < 7) VB.shake = kind === 'spike' ? 0.16 : 0.22;
  if (navigator.vibrate && coarse() && b.m.position.distanceTo(camera.position) < 4) try { navigator.vibrate(kind === 'spike' ? 25 : 12); } catch (e) { /* ignore */ }
}
function vbBurst(pos, color, n, speed) {
  const P = new Float32Array(n * 3), V = [];
  for (let i = 0; i < n; i++) { P.set([pos.x, pos.y, pos.z], i * 3); const a = fxRandom() * Math.PI * 2, e = fxRandom() * 2 - 1, r = Math.sqrt(1 - e * e), s2 = speed * (0.5 + fxRandom() * 0.7); V.push([Math.cos(a) * r * s2, e * s2, Math.sin(a) * r * s2]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.05, transparent: true, opacity: 1, depthWrite: false })); m.frustumCulled = false; scene.add(m);
  (VB.parts = VB.parts || []).push({ m, V, t: 0 });
}
function vbParts(dt) {
  VB.parts = (VB.parts || []).filter((q) => {
    q.t += dt; const a = q.m.geometry.attributes.position;
    for (let i = 0; i < q.V.length; i++) { q.V[i][1] -= 5 * dt; a.setXYZ(i, a.getX(i) + q.V[i][0] * dt, a.getY(i) + q.V[i][1] * dt, a.getZ(i) + q.V[i][2] * dt); }
    a.needsUpdate = true; q.m.material.opacity = Math.max(0, 1 - q.t / 0.38);
    if (q.t > 0.38) { scene.remove(q.m); q.m.geometry.dispose(); q.m.material.dispose(); return false; }
    return true;
  });
}
// 擊球聲（照真實球館錄音的特徵調）：排球被打到的聲音由三層組成——
//   1. 球皮的拍擊：幾毫秒的寬頻「啪」，打越用力越亮
//   2. 球本身的共鳴：球殼約 250 Hz、球裡的空氣約 1.05 kHz（被打到那一聲「砰」的音高），幾十毫秒就衰減
//   3. 碰到的東西：前臂墊球的悶擊、手掌扣球的響亮拍擊、手指舉球幾乎沒聲音、木地板的低頻「咚」、網繩的「嗡」
// 全部再過一個鐵皮球館的殘響（約 2 秒，越遠殘響比例越高）。真實比賽錄音裡擊球的主要能量在 150～300 Hz、後面拖著長殘響
const SFX = { on: true, ctx: null, floorT: 0, bus: null, noise: null };
SFX.on = !VBSettings.values.mute;
function sfxNoise(ac, dur, shape = 3) { const len = Math.max(1, Math.floor(ac.sampleRate * dur)), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (fxRandom() * 2 - 1) * Math.pow(1 - i / len, shape); return buf; }
// 球館殘響：前 50 ms 幾個早期反射，之後指數衰減的雜訊，高頻比低頻衰減快（越後面越悶）
function sfxIR(ac, rt) {
  const sr = ac.sampleRate, len = Math.floor(sr * rt), b = ac.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let y = 0;
    for (let i = 0; i < len; i++) { const t = i / sr, a = 0.85 - 0.72 * Math.min(1, t / rt); y += a * ((fxRandom() * 2 - 1) - y); d[i] = y * Math.pow(10, (-3 * t) / rt) * (t < 0.012 ? t / 0.012 : 1); }
    for (const [ms, g] of [[11, 0.5], [19, 0.35], [27, 0.3], [38, 0.22], [52, 0.18]]) { const k = Math.floor((ms + ch * 3) * sr / 1000); if (k < len) d[k] += g * (ch ? -1 : 1); }
  }
  return b;
}
function sfxBus(ac) {
  if (SFX.bus && SFX.bus.ac === ac) return SFX.bus;
  const master = ac.createDynamicsCompressor(); master.threshold.value = -14; master.ratio.value = 4; master.attack.value = 0.002; master.release.value = 0.15;
  const out = ac.createGain(); out.gain.value = VBSettings.values.mute ? 0 : .9 * VBSettings.values.volume / 100; master.connect(out).connect(ac.destination);
  const conv = ac.createConvolver(); conv.buffer = sfxIR(ac, 2.1); const wet = ac.createGain(); wet.gain.value = 0.42; conv.connect(wet).connect(master);
  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = fxRandom() * 2 - 1;
  return (SFX.bus = { ac, master, conv, noise, out });
}
function netBallSound(ball, kind, quality, position) {
  if (NET.on && ball.room) {
    if (!NET.ownBall) return;
    NET.soundSeq = (NET.soundSeq || 0) + 1;
    NET.tx.publish('ball-sound', { seq: NET.soundSeq, kind, q: quality, p: position.toArray() });
  }
  sfx(kind, quality, position);
}
function sfx(kind, q = 1, pos) {
  if (!SFX.on) return;
  try {
    if (!SFX.ctx) SFX.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ac = SFX.ctx; if (ac.state === 'suspended') ac.resume();
    // 位置：越遠越小聲、殘響比例越高；在左邊就偏左聲道
    let vol = 1, pan = 0;
    if (pos) { const d = pos.distanceTo(camera.position); vol = clamp(1.2 - d / 20, 0.1, 1); const rt = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), rel = pos.clone().sub(camera.position); pan = clamp(rel.dot(rt) / Math.max(1.5, d), -0.8, 0.8); }
    sfxPlay(ac, kind, q, vol, pan);
  } catch (e) { /* 不支援就安靜 */ }
}
// 排球音效（自己設計合成，每種 4 段變化）：照真實排球聲音的特徵——
//   舉球：幾根手指同時碰到的輕、短「啵」（三個很靠近的小拍擊，不拖尾）
//   墊球：前臂的悶、扎實「咚」（低頻為主，比舉球低）
//   扣球／發球：全掌包住球的響亮爆破「啪！」（尖銳的瞬間＋清脆的拍擊＋球裡空氣的共鳴＋一點超低頻的力量感）
//   攔網：悶、雙重的碰撞（兩隻手一前一後，球改方向時音高往下掉）
//   落地：球打在木地板的「咚」（球的共鳴＋木地板的低頻）；標誌桿：塑膠桿被打到的脆響；揮臂：空氣被撕開的「咻」
async function sfxSynth(kind, seed) {
  const sr = 48000, dur = { spike: 0.3, bump: 0.25, set: 0.12, block: 0.3, floor: 0.4, antenna: 0.45, whoosh: 0.22 }[kind] || 0.3, oc = new OfflineAudioContext(1, Math.round(sr * dur), sr);
  const rnd = (() => { let x = seed * 9301 + 49297; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); })(), J = () => 0.96 + rnd() * 0.08;
  const noise = oc.createBuffer(1, oc.length, sr), nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;
  const out = oc.createGain(); out.connect(oc.destination);
  // 一段濾過的雜訊：tau＝衰減時間常數（秒）
  const nz = (type, fc, Q, amp, tau, at = 0.002) => { const s2 = oc.createBufferSource(), f = oc.createBiquadFilter(), g = oc.createGain(); s2.buffer = noise; f.type = type; f.frequency.value = fc * J(); f.Q.value = Q; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp, at + 0.0004); g.gain.setTargetAtTime(0, at + 0.0004, tau); s2.connect(f).connect(g).connect(out); s2.start(0, rnd() * 0.05); };
  // 一個會衰減的共鳴；glide＝音高往下滑到幾倍
  const ring = (f0, amp, tau, at = 0.002, glide = 1, type = 'sine') => { const o = oc.createOscillator(), g = oc.createGain(); o.type = type; const f = f0 * J(); o.frequency.setValueAtTime(f, at); if (glide !== 1) o.frequency.exponentialRampToValueAtTime(f * glide, at + tau * 2.5); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp, at + 0.0008); g.gain.setTargetAtTime(0, at + 0.0008, tau); o.connect(g).connect(out); o.start(at); o.stop(dur); };
  switch (kind) {
    case 'spike':
      nz('highpass', 3200, 0.7, 1.0, 0.0009); nz('bandpass', 1900, 0.7, 0.85, 0.006); nz('bandpass', 3600, 0.8, 0.5, 0.004);
      ring(1050, 0.36, 0.024); ring(2120, 0.14, 0.012); ring(285, 0.3, 0.02); ring(88, 0.5, 0.045, 0.002, 0.75);   // 超低頻的力量感
      break;
    case 'bump':
      nz('lowpass', 900, 0.8, 0.75, 0.008); nz('bandpass', 2000, 1, 0.1, 0.002);
      ring(160, 0.7, 0.035); ring(110, 0.4, 0.03); ring(1050, 0.15, 0.015);
      break;
    case 'set':
      for (const at of [0.002, 0.0055, 0.009]) nz('bandpass', 2200, 1.0, 0.42 * (0.8 + rnd() * 0.4), 0.0015, at);
      ring(1050, 0.12, 0.012); ring(300, 0.15, 0.01);
      break;
    case 'block':
      for (const [at, k] of [[0.002, 1], [0.016, 0.65]]) { nz('lowpass', 2500, 0.7, 0.8 * k, 0.005, at); ring(130, 0.5 * k, 0.025, at); }
      ring(1250, 0.3, 0.02, 0.002, 0.72);   // 球被擋回去：音高往下掉
      break;
    case 'floor':
      nz('bandpass', 2500, 0.9, 0.5, 0.0015); ring(1050, 0.45, 0.03); ring(2100, 0.15, 0.015); ring(210, 0.5, 0.04); ring(95, 0.35, 0.05);
      break;
    case 'antenna':
      nz('highpass', 4000, 0.7, 0.5, 0.001); ring(2850, 0.3, 0.06); ring(4170, 0.2, 0.045); ring(6200, 0.1, 0.03); ring(950, 0.12, 0.03);
      break;
    case 'whoosh': {   // 揮臂：一段雜訊，濾波器從低掃到高，先慢慢變大再消失
      const s2 = oc.createBufferSource(), f = oc.createBiquadFilter(), g = oc.createGain(); s2.buffer = noise; f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(600, 0); f.frequency.exponentialRampToValueAtTime(2600, 0.16);
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.35, 0.12); g.gain.linearRampToValueAtTime(0, 0.2); s2.connect(f).connect(g).connect(out); s2.start(0);
      break;
    }
  }
  const buf = await oc.startRendering(), d = buf.getChannelData(0); let pk = 0; for (const x of d) pk = Math.max(pk, Math.abs(x)); const k = 0.9 / (pk || 1); for (let i = 0; i < d.length; i++) d[i] *= k;
  return buf;
}
// 真實音效（sfx/ 裡，室內球場錄的）：扣球、發球、球彈地、球打進網子、球鞋吱吱聲；舉球（短的「啵」）和墊球（悶的）是從發球那一聲切短、調音色做的
const SFX_FILES = { spike: ['vb-spike'], serve: ['vb-serve'], floor: ['vb-floor-1', 'vb-floor-2'], net: ['vb-net'], set: ['vb-set'], bump: ['vb-bump'], squeak: [1, 2, 3, 4, 5, 6].map((i) => 'vb-squeak-' + i) };
// 第一次要出聲時載入；標誌桿的脆響沒有錄音，照舊合成
function sfxLoad() {
  if (SFX.recLoading) return; SFX.recLoading = true; SFX.rec = {};
  const ac = SFX.ctx || new OfflineAudioContext(1, 1, 32000);
  for (const [k, list] of Object.entries(SFX_FILES)) for (const f of list) fetch(`assets/sfx/${f}.wav`).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((buf) => { (SFX.rec[k] = SFX.rec[k] || []).push(buf); }).catch(() => {});
  for (let i = 1; i <= 3; i++) sfxSynth('antenna', i).then((buf) => { (SFX.rec.antenna = SFX.rec.antenna || []).push(buf); }).catch(() => {});
}
// 播一段：每次隨機挑一段、音高差一點點，不會每一下都一模一樣
function sfxRec(ac, dry, kind, gain, rate = 1, at = ac.currentTime + 0.004) {
  const list = SFX.rec && SFX.rec[kind]; if (!list || !list.length) return false;
  const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = list[Math.floor(fxRandom() * list.length)]; s.playbackRate.value = rate * (0.96 + fxRandom() * 0.08); g.gain.value = gain;
  s.connect(g).connect(dry); s.start(at); return true;
}
function sfxPlay(ac, kind, q = 1, vol = 1, pan = 0) {
  if (!SFX.recLoading) sfxLoad();
  const bus = sfxBus(ac), t = ac.currentTime + 0.004, J = () => 1 + (fxRandom() - 0.5) * 0.08, A = () => 0.85 + fxRandom() * 0.3;
  const dry = ac.createGain(); dry.gain.value = vol;
  let node = dry; if (ac.createStereoPanner) { const pn = ac.createStereoPanner(); pn.pan.value = pan; dry.connect(pn); node = pn; }
  node.connect(bus.master);
  const send = ac.createGain(); send.gain.value = 0.16 + 0.55 * (1 - vol); dry.connect(send).connect(bus.conv);
  // 一個會衰減的共鳴（dec＝衰減時間常數，秒）
  const ring = (f, dec, g, type = 'sine', at = t, glide = 1) => { const o = ac.createOscillator(), e = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f * glide, at); if (glide !== 1) o.frequency.exponentialRampToValueAtTime(f, at + dec); e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(g, at + 0.0012); e.gain.setTargetAtTime(0.00001, at + 0.0012, dec); o.connect(e).connect(dry); o.start(at); o.stop(at + 0.002 + dec * 7); };
  // 一段濾過的雜音（拍擊、摩擦、網子）
  const burst = (dur, fc, Q, g, type = 'bandpass', at = t, shape = 'exp') => { const s = ac.createBufferSource(), f = ac.createBiquadFilter(), e = ac.createGain(); s.buffer = bus.noise; f.type = type; f.frequency.value = fc; f.Q.value = Q; e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(g, at + Math.min(0.001, dur * 0.2)); if (shape === 'exp') e.gain.setTargetAtTime(0.00001, at + 0.001, dur / 3); else e.gain.linearRampToValueAtTime(0, at + dur); s.connect(f).connect(e).connect(dry); s.start(at, fxRandom() * 0.8, dur * 4 + 0.05); };
  const ball = (g, cav = 1) => { ring(1050 * J(), 0.018, 0.15 * g * cav); ring(262 * J(), 0.016, 0.3 * g); ring(640 * J(), 0.012, 0.16 * g); ring(1720 * J(), 0.008, 0.07 * g * cav); };   // 球殼（262、640 Hz）＋球內空氣（1.05 kHz）的共鳴
  // 拍擊：頻譜往高頻慢慢變小（像真實錄音），bright＝越用力越亮
  const slap = (g, bright, dur = 0.005, at = t) => { burst(dur * 1.4, 700, 0.45, 0.9 * g, 'bandpass', at); burst(dur, 1700 + 900 * bright, 0.45, 0.62 * g, 'bandpass', at); burst(dur * 1.2, 2700 + 900 * bright, 0.6, 1.1 * g * (0.3 + 0.7 * bright), 'bandpass', at); burst(dur * 0.6, 7000, 0.7, 0.07 * g * bright, 'highpass', at); };
  const net = (g) => { burst(0.18, 700, 0.7, 0.35 * g, 'bandpass', t, 'lin'); for (let i = 0; i < 7; i++) burst(0.025 + fxRandom() * 0.04, 900 + fxRandom() * 1100, 0.9, g * (0.4 - i * 0.045) * A(), 'bandpass', t + 0.01 + i * 0.03 + fxRandom() * 0.012); ring(96 * J(), 0.12, 0.3 * g, 'triangle'); ring(193 * J(), 0.07, 0.1 * g, 'triangle'); ring(291 * J(), 0.04, 0.05 * g, 'triangle'); };   // 網布被拉扯的沙沙＋網繩繃緊的「嗡」
  const p = clamp(q, 0, 1.3);
  // 照錄音校正好的合成聲；還沒做好（第一下）才用簡易版
  const R = (k, g, rate, at) => sfxRec(ac, dry, k, g, rate, at);
  switch (kind) {
    case 'spike': if (R('spike', 0.75 + 0.25 * Math.min(1, p), 1)) return; break;   // 沉重、渾厚的擊球
    case 'serve': if (R('serve', 0.9, 1)) return; break;
    case 'hit': if (R('spike', 0.7, 1.05)) return; break;
    case 'tip': if (R('set', 0.8, 0.95)) return; break;
    case 'block': if (R('spike', 0.85, 0.9)) { R('bump', 0.45, 1, t + 0.012); return; } break;   // 兩隻手一前一後
    case 'bump': if (R('bump', 0.85, 1)) return; break;
    case 'set': if (R('set', 0.75, 1)) { R('set', 0.45, 1.06, t + 0.022); return; } break;   // 「啵啵」：手指碰兩下的短音
    case 'floor': if (R('floor', 0.3 + 0.7 * Math.min(1, p), 1)) return; break;
    case 'net': if (R('net', 0.45 + 0.55 * Math.min(1, p), 1)) return; break;
    case 'tape': if (R('net', 0.55, 1.05)) return; break;
    case 'squeak': if (R('squeak', 0.09 + 0.08 * Math.min(1, q), 1)) return; break;   // 球鞋吱吱聲
    case 'antenna': if (R('antenna', 0.8 * Math.min(1, p), 1)) return; break;
    case 'whoosh': return;   // 揮臂不出聲
    case 'wall': if (R('floor', 0.45 * Math.min(1, p), 0.85)) return; break;
    case 'cheer': return;   // 不要人聲
  }
  switch (kind) {
    case 'spike': case 'serve': case 'hit': {   // 手掌扣到球：響亮的「啪」＋球的共鳴＋一點手臂的悶
      const k = kind === 'spike' ? 1 : kind === 'serve' ? 0.85 : 0.75;
      slap(1.0 * k * A(), Math.min(1, p) * k); ball(0.9 * k); ring(128 * J(), 0.014, 0.45 * k);
      break;
    }
    case 'block': { slap(0.8 * A(), 0.6, 0.006); slap(0.45, 0.4, 0.006, t + 0.007); ball(0.8); ring(118 * J(), 0.018, 0.45); break; }   // 兩隻手掌一前一後
    case 'bump': { slap(0.55 * A(), 0.3, 0.008); ring(158 * J(), 0.026, 0.55); ring(96 * J(), 0.02, 0.28); ball(0.62, 0.7); break; }   // 前臂：比較悶的「噗」
    case 'set': { slap(0.2 * A(), 0.5, 0.004); slap(0.14, 0.4, 0.004, t + 0.006); ball(0.2, 0.5); break; }   // 手指：輕、兩下很靠近的「嗒」
    case 'tip': { slap(0.26 * A(), 0.5, 0.004); ball(0.28, 0.6); break; }
    case 'floor': case 'wall': {   // 落地：球被壓扁再彈起（共鳴很亮）＋木地板的低頻「咚」
      const k = kind === 'wall' ? 0.6 : 1, g = (0.35 + 0.65 * Math.min(1, p)) * k;
      slap(0.7 * g * A(), 0.8 * g, 0.007); ball(0.95 * g, 1.3); ring(108 * J(), 0.045, 0.55 * g); ring(410 * J(), 0.024, 0.14 * g);
      break;
    }
    case 'net': { net(0.55 * Math.max(0.4, p)); ball(0.2 * p, 0.5); break; }
    case 'tape': { ring(232 * J(), 0.02, 0.38); ring(1050 * J(), 0.02, 0.2); burst(0.008, 700, 0.8, 0.35); net(0.32); ring(96 * J(), 0.16, 0.3, 'triangle'); break; }   // 擦到白帶：悶的「噗」＋鋼索嗡得比較久
    case 'land': { burst(0.016, 300, 0.8, 0.32 * A(), 'lowpass'); ring(78 * J(), 0.03, 0.3); if (fxRandom() < 0.35) sfxPlay(ac, 'squeak', 0.6, vol * 0.7, pan); break; }
    case 'slide': { burst(0.32, 900, 0.6, 0.3, 'lowpass', t, 'lin'); burst(0.02, 320, 0.8, 0.4, 'lowpass'); ring(70, 0.04, 0.3); if (fxRandom() < 0.6) sfxPlay(ac, 'squeak', 0.9, vol, pan); break; }
    case 'squeak': {   // 球鞋在木地板上的「唧」：橡膠一卡一滑，音高快速抖動
      const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), f = ac.createBiquadFilter(), e = ac.createGain(), f0 = 1700 + fxRandom() * 1000, L = 0.07 + fxRandom() * 0.09;
      o.type = 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (1.1 + fxRandom() * 0.25), t + L); lfo.frequency.value = 55 + fxRandom() * 40; lg.gain.value = f0 * 0.06; lfo.connect(lg).connect(o.frequency);
      f.type = 'bandpass'; f.frequency.value = f0 * 1.2; f.Q.value = 6; e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.17 * q, t + 0.012); e.gain.setValueAtTime(0.17 * q, t + L * 0.6); e.gain.linearRampToValueAtTime(0, t + L);
      o.connect(f).connect(e).connect(dry); o.start(t); lfo.start(t); o.stop(t + L + 0.02); lfo.stop(t + L + 0.02); break;
    }
    case 'shuttle': { burst(0.003, 4200, 0.9, 0.5 * A()); ring(2400 * J(), 0.006, 0.12); ring(620 * J(), 0.01, 0.12 * p); break; }   // 羽球拍線：清脆的「叮」
    case 'paddle': { ring(1150 * J(), 0.018, 0.4 * Math.min(1, p)); burst(0.004, 2600, 0.8, 0.45 * A()); ring(330 * J(), 0.012, 0.2); break; }   // 匹克球拍：空心的「啵」
    case 'racket': { burst(0.003, 3800, 0.9, 0.4); break; }
    case 'whistle': case 'whistle1': {   // 裁判哨（有珠的哨子）：3 kHz 左右、帶「嗶嚕」的快速顫動、加一點吹氣聲
      const L = kind === 'whistle' ? 0.62 : 0.22, o = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), am = ac.createGain(), amg = ac.createGain(), f = ac.createBiquadFilter(), e = ac.createGain();
      o.type = 'square'; o.frequency.value = 3150; o2.type = 'sine'; o2.frequency.value = 3150 * 2.01; lfo.frequency.value = 32; lg.gain.value = 70; lfo.connect(lg).connect(o.frequency); lfo.connect(amg); amg.gain.value = 0.35; amg.connect(am.gain); am.gain.value = 0.65;
      f.type = 'bandpass'; f.frequency.value = 3150; f.Q.value = 2.5; e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.13, t + 0.025); e.gain.setValueAtTime(0.13, t + L - 0.07); e.gain.linearRampToValueAtTime(0, t + L);
      o.connect(f); o2.connect(f); f.connect(am).connect(e).connect(dry); burst(L, 3000, 1.2, 0.05, 'bandpass', t, 'lin');
      for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + L + 0.02); }
      break;
    }
    case 'cheer': {   // 得分：幾個人的歡呼＋拍手（業餘球館，不是滿場觀眾）
      for (const [fc, g] of [[520, 0.06], [1100, 0.07], [2300, 0.035]]) { const s = ac.createBufferSource(), f = ac.createBiquadFilter(), e = ac.createGain(); s.buffer = bus.noise; f.type = 'bandpass'; f.frequency.value = fc; f.Q.value = 0.8; e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g * q, t + 0.18); e.gain.setTargetAtTime(0.00001, t + 0.4, 0.35); s.connect(f).connect(e).connect(dry); s.start(t, 0, 2); }
      for (let i = 0; i < 14; i++) burst(0.012, 1400 + fxRandom() * 900, 0.8, 0.12 * A(), 'bandpass', t + 0.1 + i * 0.07 + fxRandom() * 0.04);
      break;
    }
    default: ball(0.5);
  }
}
// ---- 跳：起跳速度看助跑速度（原地約 0.52 m、全速助跑約 1 m；攔網約 0.78 m），空中保持衝勁，只能微調方向
// 起跳速度：原地約 0.62 m，助跑越快跳越高（一般跑 2.6 m/s 約 1 m、衝刺約 1.25 m）
function vbJumpVy(hs) { return 3.5 + 0.35 * Math.min(4.2, hs); }
// ---- 位置特殊能力（比賽：六人制的位置；練習：開賽設定裡選的位置）
//   舉球 S：舉球時右鍵＝貼網吊到對面三米線中間｜大砲 OH：蓄力條多一格紫色（超強重扣，發球沒有）
//   中間手 MB：跳起來滯空比較久（一樣高、慢慢落）｜舉對 OPP：幫忙舉球不太會連擊，蓄力條也有紫色（力道比大砲小）
function vbMyRole() { return VM.on ? (VM.six && VM.role ? VM.role[vmMe()] || null : null) : VM_OPT.role; }
const ROLE_SUPER = { OH: { lo: 0.78, hi: 0.86, pw: 1.3, sta: 1.9 }, OPP: { lo: 0.78, hi: 0.86, pw: 1.15, sta: 1.7 } };   // 紫色：在金色甜蜜點裡面、更窄
const vbHangK = () => (vbMyRole() === 'MB' ? 0.75 : 1);   // 中間手：重力×0.75、起跳速度×√0.75＝一樣高、滯空多約 15%
const CAM_SPIKE_MAX = 0.21;
function vbSpikeCamOffset(a, off) {
  const base = walk.pitch - (a.camOff || 0);
  walk.pitch = clamp(base + off, -1.2, 1.1);
  a.camOff = walk.pitch - base;   /* 記錄實際套用量，碰到視角上限也不殘留偏移 */
}
function vbClearAir() {
  if (walk.air) vbSpikeCamOffset(walk.air, 0);
  walk.air = null;
}
function vbJump(kind) {
  if (walk.emote?.keyframes) return;
  if (walk.air || walk.sit || walk.serve || walk.paused || walk.spike) return;
  if (walk.dive || walk.down > 0) return;
  const hv = walk.vel || [0, 0], hs = Math.min(4.2, Math.hypot(hv[0], hv[1])), block = kind === 'block', ck = block ? 'block' : 'jump';
  let camK = staGame() ? clamp(STA.v, 0, 1) : 1;   /* 起跳前體力，上限為 1 */
  let tired = 1;   /* 體力：夠就照體力跳，不夠就只能小跳一下 */
  if (staGame()) { if (STA.v >= staCost(ck, vmMe())) tired = 0.4 + 0.6 * staPay(ck); else { camK = 0; staWarn('體力不夠：只能小跳'); STA.v = 0; STA.useT = performance.now(); tired = 0.75; } }
  walk.blkShift = 0; walk.blkAim = 0;
  const hk = vbHangK();
  walk.air = { g: JUMP_G * hk, y: 0, vy: (block ? 4.1 : vbJumpVy(hs)) * tired * Math.sqrt(hk), vx: hv[0] * (block ? 0.2 : 0.35), vz: hv[1] * (block ? 0.2 : 0.35), block, t: 0, x0: walk.x, z0: walk.z };
  const a = walk.air;
  a.camK = !block && VBSettings.values.cameraAssist && balls.some(b => b.rest <= 0.2 && b.v.lengthSq() > 0 && Math.hypot(b.m.position.x - walk.x, b.m.position.z - walk.z) <= 4) ? camK : 0;
  a.camT = 2 * a.vy / a.g; a.camOff = 0;
  tutEv('jump', { block, speed: hs });
  if (NET.on) { NET.jp = { s: (NET.jp ? NET.jp.s : 0) + 1, vy: +walk.air.vy.toFixed(2), g: +walk.air.g.toFixed(2) }; NET.forceSt = true; }   // 起跳：只送一次，別人自己算弧線   // 助跑的速度大多變成高度，空中只往前飄約 1 m
  if (block) { pose = 'block'; hands.visible = true; }
  if (SETM.m && !SETM.m.all) setMenuClose(false);   // 起跳了：舉球轉盤收掉（不會搶走攻擊的點擊）
  if (!block && walk.chargeArm && walk.chargeArmGround) { walk.chargeArm = null; walk.chargeArmGround = false; vbChargeStart('jump'); }   // 起跳前就按住左鍵：起跳那一刻開始蓄力
}
function vbAirStep(dt) {
  const a = walk.air; if (!a) return 0;
  a.t += dt; a.vy -= (a.g || JUMP_G) * dt; a.y += a.vy * dt;
  if (a.y <= 0) { vbClearAir(); walk.landT = performance.now(); if (staGame()) sfx('land', 0.6); if (a.block && !walk.hold && !walk.swing) { hands.visible = false; pose = 'hold'; } return 0; }
  const off = walk.swing || walk.charge || performance.now() < (walk.contactUntil || 0) ? (a.camOff || 0) : !a.block && !a.serve && a.camK && VBSettings.values.cameraAssist ? -CAM_SPIKE_MAX * a.camK * Math.sin(Math.PI * Math.min(1, a.t / a.camT)) : 0;
  vbSpikeCamOffset(a, off);
  return a.y;
}
// ---- 攻擊：按 V 揮臂，0.22 秒內手（頭上前方）碰到球才算；碰到的位置決定好不好
function vbHand() { const [fx, fz] = vbFwd(); return new THREE.Vector3(walk.x + fx * 0.35 - fz * 0.12, camera.position.y + 0.75, walk.z + fz * 0.35 + fx * 0.12); }
function vbAtServeLine() {
  const ct = vbCourt(); if (!ct) return false;
  return Math.abs(ct.lx) >= 9.05 && Math.abs(ct.lx) <= 14 && Math.abs(ct.lz) <= 4.5;
}
function vbPrimaryDown(tip = false) {
  if (walk.setAim) { if (!tip) vbManualSetDown(); return; }
  if (walk.hold) { vbAttack(tip); return; }
  const kind = tip ? 'float' : 'jump'; if (vbChargeStart(kind)) return;
  if (walk.jserve && !walk.jserve.jumped && !walk.jserve.hit) { walk.chargeArm = kind; return; }
  if (!tip && !walk.air && !walk.serve && !walk.jserve) { walk.chargeArm = 'jump'; walk.chargeArmGround = true; return; }
  vbAttack(tip);
}
function vbHeldAttack() {
  if (!walk.hold || VM.on) return;
  skill.mode = null; $('wk-combo').hidden = true;
  const h = new THREE.Vector3(); walk.hold.getWorldPosition(h);
  const speed = 14, angle = clamp(walk.pitch, -.9, 1.1), horizontal = Math.cos(angle) * speed;
  releaseBall(new THREE.Vector3(-Math.sin(walk.yaw) * horizontal, Math.sin(angle) * speed, -Math.cos(walk.yaw) * horizontal));
  const b = balls[balls.length - 1]; vbMine(b); vbLaunch(b, h, b.v.clone(), 'spike', .9);
  pose = 'swing'; hands.visible = true; walk.flash = .4;
}
function vbAttack(tip, chg = null) {
  if (walk.emote?.keyframes) return;
  if (walk.jserve && !walk.jserve.hit) { jumpServeHit(tip ? 'float' : 'jump'); return; }
  if (walk.hold) {
    if (!walk.air && vbAtServeLine()) startServe(tip ? 'float' : 'std');
    else if (!VM.on) vbHeldAttack();
    else toast('發球請站到底線後的發球區', 1400);
    return;
  }
  if ((walk.swing && !walk.swing.done) || walk.sit || walk.serve) return;   // 上一下揮完了（收手中）可以馬上再揮
  const ct0 = tip ? vbCourt() : null;
  walk.swing = { t: 0, tip: !!tip, done: false, prev: null, chg, dump: !!(tip && ct0 && Math.abs(ct0.lx) < 4.5 && vbIsSetter() && (!VM.on || vmSecond())) };   // dump＝舉球員吊球（姿勢是雙手往上推，不是拉弓）
  pose = 'cock'; hands.visible = true;
}
// ---- 扣球蓄力：空中按住左鍵蓄力、放開才揮臂（放開後 0.6 秒內球到手邊就打）
//   不是越滿越好：按住約 0.3 秒到金色的甜蜜點＝力道最大又最準；過了甜蜜點落點開始飄，紅色＝用力過猛（亂飄、容易出界或掛網）
//   點一下就放＝輕扣：力道約六成五、最準、最省體力（配合往下看找空檔）；重扣耗的體力是輕扣的兩倍多
//   起跳到落地大約只有 0.9 秒：太晚按蓄不滿，按太久球就掉過手邊了；跳發也一樣（空中按住左鍵蓄力、放開揮臂）
const CHG = { full: 0.42, sw0: 0.72, sw1: 0.88, over: 1.0, max: 1.2 };   // 蓄力值＝按住秒數／0.42（0.30～0.37 秒＝甜蜜點，0.5 秒蓄滿）
function vbChargeOf(c, sup = null) {   // 蓄力值 → 力道倍數 pw、失準 err（0＝最準）、體力倍數 sta；sup＝大砲／舉對的紫色區（只有扣球）
  if (sup && c >= sup.lo && c <= sup.hi) return { pw: sup.pw, err: 0, sta: sup.sta, zone: 'super' };
  if (c >= CHG.sw0 && c <= CHG.sw1) return { pw: 1, err: 0, sta: 1.5, zone: 'sweet' };
  if (c < CHG.sw0) { const k = c / CHG.sw0; return { pw: 0.62 + 0.33 * k, err: 0.12 * k, sta: 0.6 + 0.75 * k, zone: k < 0.35 ? 'light' : 'mid' }; }
  const k = clamp((c - CHG.sw1) / (CHG.max - CHG.sw1), 0, 1);
  return { pw: 1 + 0.06 * k, err: c <= CHG.over ? (0.3 * (c - CHG.sw1)) / (CHG.over - CHG.sw1) : 0.55 + 1.0 * k, sta: 1.5 + 0.25 * k, zone: c <= CHG.over ? 'late' : 'over' };
}
function vbChargeStart(kind = 'jump') {   // kind：jump＝左鍵（扣球、跳發），float＝右鍵（只有跳飄能蓄力，平常右鍵是吊球）
  if (walk.emote?.keyframes) return false;
  const js = walk.jserve && !walk.jserve.hit; if (js && walk.jserve.swung) return false;
  if (kind === 'float' && !js) return false;
  if (!walk.air || walk.air.block || (walk.swing && !walk.swing.done) || walk.hold || walk.spike || walk.charge) return false;
  walk.charge = { t: 0, kind }; pose = 'cock'; hands.visible = true; vbChgHud(); return true;
}
function vbChargeRelease() {
  const c = walk.charge; if (!c) return; walk.charge = null; vbChgHud();
  const v = Math.min(CHG.max, c.t / CHG.full);
  if (walk.jserve && !walk.jserve.hit) { if (walk.air) jumpServeHit(c.kind === 'float' ? 'float' : 'jump', v); return; }   // 跳發／跳飄：放開就揮臂
  if (walk.air && walk.on) vbAttack(false, v);
}
function vbChargeStep(dt) {
  const c = walk.charge; if (!c) return;
  if (!walk.air || !walk.on || walk.paused) { walk.charge = null; if (!walk.swing) { pose = 'hold'; hands.visible = !!walk.hold; } if (walk.on && !walk.paused) toast('蓄太久了：已經落地，沒打到', 1300); }
  else c.t += dt;
  vbChgHud();
}
const CHG_V = new THREE.Vector3();
function vbChgHud() {
  const el = $('wk-chg'), c = walk.charge; if (!el) return;
  el.hidden = !c; if (!c) return;
  const sup = !walk.jserve && c.kind === 'jump' ? ROLE_SUPER[vbMyRole()] : null, sp = el.querySelector('.sp');   // 紫色區：扣球才有，發球沒有
  sp.hidden = !sup; if (sup) { sp.style.bottom = ((sup.lo / CHG.max) * 100).toFixed(1) + '%'; sp.style.height = (((sup.hi - sup.lo) / CHG.max) * 100).toFixed(1) + '%'; }
  const v = Math.min(CHG.max, c.t / CHG.full); el.dataset.z = vbChargeOf(v, sup).zone; $('wk-chg-f').style.height = ((v / CHG.max) * 100).toFixed(1) + '%';
}
// 蓄力條放在拉弓那隻手旁邊：第三人稱＝自己人物的拉弓手肘；第一人稱＝畫面上的右手（拉到畫面外時放右下）
//   要在畫面用的鏡頭擺好之後算（第三人稱的鏡頭只在畫這一格時移過去）
function vbChgPlace() {
  const el = $('wk-chg'); if (!el || !walk.charge) return;
  const o = TP.saved && TP.av ? TP.av.elbows[0] : armR.hand, R = el.offsetParent ? el.offsetParent.getBoundingClientRect() : { width: innerWidth, height: innerHeight };
  camera.updateMatrixWorld(true); o.getWorldPosition(CHG_V); CHG_V.project(camera);
  const ok = CHG_V.z < 1 && Math.abs(CHG_V.x) < 1.2 && Math.abs(CHG_V.y) < 1.2, x = ok ? (CHG_V.x * 0.5 + 0.5) * R.width + 30 : R.width * 0.7, y = ok ? (-CHG_V.y * 0.5 + 0.5) * R.height - 62 : R.height * 0.56;   // 第一人稱拉弓時右手在畫面外：放在右下（右手那一側）
  el.style.transform = `translate(${clamp(x, 8, R.width - 24).toFixed(0)}px, ${clamp(y, 8, R.height - 104).toFixed(0)}px)`;
}
function vbSwingStep(dt) {
  vbChargeStep(dt);
  const s = walk.swing; if (!s) return;
  s.t += dt;
  if (!s.done) {
    const H = vbHand(), R = VB_REACH.atk * (VB.assist ? 1.12 : 1); let best = null;
    for (const b of balls) { if (b.rest > 0.3 || (b.mine && performance.now() - b.mineT < 250) || (VM.on && (b.floorHit || !vbOwnSide(b)))) continue; const d = b.m.position.distanceTo(H); if (d < R && (!best || d < best.d)) best = { b, d, dn: vbNext(b).distanceTo(H) }; }
    // 提早按也可以：0.6 秒內球進到手邊，在離手最近的那一下揮（下一格就會變遠＝現在打，不會讓球跑過手再拉回來）
    if (best && ((s.prev != null && best.d > s.prev + 1e-3) || best.dn >= best.d - 1e-4 || s.t > 0.6)) { vbHitAttack(best.b, best.d, s.tip, s.chg); s.done = true; s.doneT = s.t; pose = 'swing'; }
    else if (best) s.prev = best.d;
    else if (s.t > 0.62) { tutEv('whiff', {}); s.done = true; s.doneT = s.t; pose = 'swing'; if (balls.some((b) => b.m.position.distanceTo(H) < 2.4)) toast('揮空了：等「攻擊！」出現（球會發亮）再按左鍵', 1500); }
  }
  if (s.done && s.t > s.doneT + 0.3) { walk.swing = null; pose = walk.air && walk.air.block ? 'block' : 'hold'; hands.visible = !!walk.hold || !!(walk.air && walk.air.block); }
}
// 給落點和球速：球速快＝壓下去的直線，慢＝拋物線（找飛行時間讓出手速度剛好是 spd）
function vbShotVel(p, tx, tz, spd) {
  const V = (T) => new THREE.Vector3((tx - p.x) / T, (BALL_R - p.y) / T + 4.9 * T, (tz - p.z) / T);
  let a = 0.12, b = 4; for (let i = 0; i < 40; i++) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (V(m1).length() < V(m2).length()) b = m2; else a = m1; }
  const Tmin = (a + b) / 2; if (V(Tmin).length() >= spd) return V(Tmin);
  let lo = 0.08, hi = Tmin; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (V(m).length() > spd) lo = m; else hi = m; }
  return V(hi);
}
function vbHitAttack(b, d, tip, chg = null) {
  const pb = b.m.position.clone(), H = vbHand(), dy = pb.y - H.y, air = !!walk.air, ct = vbCourt(), p = H.clone().add(pb.clone().sub(H).setLength(Math.min(pb.distanceTo(H), 0.12)));   // 球貼在手掌前面出去
  let q = 1 - (Math.max(0, d - 0.35) / (VB_REACH.atk - 0.35)) * 0.5, note = '';   // 手離球 0.35 m 以內都算打正
  if (dy < -0.6) { q *= 0.72; note = '打晚了'; } else if (dy > 0.45) { q *= 0.85; note = '打早了'; }
  const C = air && !tip ? vbChargeOf(chg == null ? 0.55 : chg, chg == null ? null : ROLE_SUPER[vbMyRole()]) : null;   // 蓄力（沒有蓄力的手機按鈕＝中等力道）
  if (window.__gym) window.__gym.lastAtk = { d: +d.toFixed(2), dy: +dy.toFixed(2), q: +q.toFixed(2), air: !!walk.air, chg, zone: C && C.zone, pw: C && C.pw };
  const yaw = walk.yaw + (q < 0.65 ? rkGauss() * (1 - q) * 0.4 : 0) + (C ? rkGauss() * C.err * 0.14 : 0), fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const dump = tip && ct && Math.abs(ct.lx) < 4.5 && vbIsSetter() && (!VM.on || vmSecond());   // 舉球員吊球（舉球員才有）：跳起來推＝貼網；沒跳＝只能送高球（下面另外算）
  // 深淺：平視打到網後 6.6 m，越往下看落點越近、越釘（往下看約 35 度＝網後 2 m）；按著 S 是 3.4 m 短斜線；吊球落在網後 1.5～2.5 m
  const down = clamp((-walk.pitch - 0.05) / 0.55, 0, 1), steep = !tip && down > 0.25;   // steep＝你想往下壓：不自動幫你把球抬過網，打太低就掛網
  const depth = dump ? 1 + Math.random() : tip ? 1.5 + Math.random() : Math.min(6.6, 6.6 - 4.6 * down);
  let dist = depth;
  if (ct) {
    const [lx] = toLocalOf(ct.c, walk.x, walk.z), [ax] = toLocalOf(ct.c, walk.x + fx, walk.z + fz), dlx = ax - lx;
    if (dlx * -Math.sign(lx) > 0.12) dist = Math.min(20, (Math.abs(lx) + depth) / Math.abs(dlx));
  }
  if (C && C.err) dist = Math.max(1, dist + rkGauss() * C.err * 1.3);   // 越用力落點越飄（深淺）
  const staF = staPay(tip ? 'tip' : air ? 'spike' : 'hit', C ? C.sta : 1);
  let spd = (tip ? 6 : air ? 16 + 12 * q : 11 + 6 * q) * (tip ? 1 : 0.6 + 0.4 * staF) * (C ? C.pw : 1);   // 累了扣得比較慢（最低約九成）；輕扣約六成五的力道
  const pep = vbPep(), pd = pep ? Math.hypot(pep.x - p.x, pep.z - p.z) : 0;
  if (pep && !dump && ((pep.x - p.x) * fx + (pep.z - p.z) * fz) / (pd || 1) > 0.85) { dist = pd + 0.5; spd = Math.min(spd, 15); }   // 對碰：大致對著陪練打，球就打向他（他接得到的力道）
  // 吊球：往上一點的軟弧線，從攔網手上面過去
  let v = tip ? (() => { const tx = p.x + fx * dist, tz = p.z + fz * dist, T = 0.8 + 0.08 * dist; return new THREE.Vector3((tx - p.x) / T, (BALL_R - p.y) / T + 4.9 * T, (tz - p.z) / T); })() : vbShotVel(p, p.x + fx * dist, p.z + fz * dist, spd);
  // 過網：有打好（品質 0.6 以上）又不是刻意往下壓，就先打深一點（球速不變，跟 AI 一樣），還不夠才放慢；
  //   刻意往下壓（往下看）只幫你往後推一點點——擊球點太低、離網太遠還硬壓就會掛網；沒打好的球照樣會掛網
  if (ct && q >= 0.6 && !pep && !(C && C.err > 0.5)) {   // 用力過猛：不幫你抬過網
    const netY = (vv) => { for (let t = 0.01; t < 2; t += 0.01) { const x = p.x + vv.x * t, z = p.z + vv.z * t, [l] = toLocalOf(ct.c, x, z); if (Math.sign(l) !== (Math.sign(ct.lx) || 1)) return p.y + vv.y * t - 4.9 * t * t; } return 99; };
    let sp2 = spd; const lim = steep ? 2 : 12;
    for (let i = 0; i < lim && !tip && netY(v) < NETS[state.net].h + BALL_R + 0.06; i++) { if (i < 6 || steep) dist += 0.5; else sp2 *= 0.88; v = vbShotVel(p, p.x + fx * dist, p.z + fz * dist, sp2); }
  }
  let dumpNote = '';
  if (dump) {
    const sg = Math.sign(ct.lx) || 1, [plx] = toLocalOf(ct.c, p.x, p.z), netH = NETS[state.net].h, lz0 = clamp(toLocalOf(ct.c,p.x,p.z)[1]-sg*2,-3.6,3.6);
    const arc = (dep, lz, clear, Tmin) => { const [tx, tz] = toWorldOf(ct.c, -sg * dep, lz), f = clamp(Math.abs(plx) / (Math.abs(plx) + dep), 0.05, 0.95), base = p.y + (BALL_R - p.y) * f, T = Math.max(Tmin, Math.sqrt(Math.max(0.02, clear - base) / (4.9 * f * (1 - f)))); return new THREE.Vector3((tx - p.x) / T, (BALL_R - p.y) / T + 4.9 * T, (tz - p.z) / T); };
    if (air) { v = arc(3, lz0, netH + BALL_R + 0.12, 0.55); dumpNote = '舉球員吊球！'; }   // 跳起來雙手往右推：剛好擦過網子上緣、落在對面三米線正中間
    else if (p.y < netH - 0.15 && Math.random() < 0.45) {   // 沒跳、球又比網子低：推不上去，掛網
      const [tx, tz] = toWorldOf(ct.c, sg * 0.02, lz0), T = 0.55; v = new THREE.Vector3((tx - p.x) / T, (netH - 0.45 - p.y) / T + 4.9 * T, (tz - p.z) / T); dumpNote = '沒跳起來推，球掛網了';
    } else { v = arc(4 + Math.random() * 2, (Math.random() - 0.5) * 3, netH + 1.0, 1.5); dumpNote = '沒跳起來：只能送高高的過網球'; }
  }
  if (C && C.err > 0.3) v.y += rkGauss() * (C.err - 0.3) * 1.2;   // 用力過猛：出手角度也亂掉（打太高出界、太低掛網）
  vbMine(b);
  b.spike = ct ? { c: ct.c, sg: Math.sign(ct.lx) || 1 } : null;
  vbLaunch(b, p, v, tip ? 'tip' : air ? 'spike' : 'hit', q);
  tutEv('atk', { tip, air, dump, chg, zone: C && C.zone, q }, b);
  if (VM.on) {
    b.spike = null; vmOnTouch(b, vmMe(), tip ? 'tip' : air ? 'spike' : 'hit');
    // 正式規則：球還在對面的空間就打（手伸過網）＝過網擊球；起跳攻擊時身體離網太近＝觸網
    if (VM.host && VM.phase === 'rally' && ct && ct.c.id === VM.c.id) {
      const sgM = Math.sign(ct.lx) || 1, [blx] = toLocalOf(ct.c, pb.x, pb.z), lose = vmTeamOf(vmMe());
      if (blx * sgM < -0.06) vmPoint(1 - lose, '過網擊球（球還在對面就打）');
      else if (air && Math.abs(ct.lx) < 0.3) vmPoint(1 - lose, '觸網（起跳離網太近）');
    }
  }
  vbFx(b, q);
  recHit({ x: p.x, y: p.y, z: p.z, v: v.length(), by: NET.me || 'me', kind: tip ? 'tip' : air ? 'spike' : 'hit' });
  const zt = C ? { super: vbMyRole() === 'OH' ? '大砲重砲！超強重扣' : '舉對重扣！', sweet: '完美蓄力！', over: '用力過猛，球失控了', late: '蓄過頭一點', light: '輕扣', mid: '' }[C.zone] : '';
  toast(dump ? dumpNote : tip ? '吊球！' : C && C.zone === 'over' ? zt : note ? `${note}，球偏了一點` : q >= 0.9 ? (air ? (C && C.zone === 'sweet' ? '完美蓄力！重扣' : zt ? `${zt}・漂亮` : '完美扣殺！') : '漂亮的下手攻擊') : zt || (air ? '扣！' : '攻擊'), 1200);
}
// ---- 接球（V）：提早按，球進到手臂前面時自動接；看球在不在身體正前方、高度、來球速度、有沒有面向舉球區
function vbReceive() {
  if (walk.emote?.keyframes) return;
  if (VM.on && walk.hold) { toast('拿著球：到發球區按左鍵發球', 1400); return; }
  if (walk.hold || skill.mode) { skillPress('bump'); return; }
  if ((walk.keys.has('shift') || walk.joyRun) && vbDive()) return;   // 衝刺中按接球＝撲救
  if (walk.dive || walk.down > 0) return;
  walk.recv = { t0: performance.now(), prev: null }; pose = 'bump'; hands.visible = true;
}
// 撲救：往最近一顆來球會掉到地上的地方撲（5 m 內），接的範圍變大、可以撈到很低的球，但回球品質打八折
function vbDive() {
  if (walk.emote?.keyframes) return false;
  if (walk.air || walk.sit || walk.dive || walk.down > 0 || walk.serve || walk.spike) return false;
  let tx = null, tz = null, bd = 9;
  for (const b of balls) { if (b.rest > 0.3 || (b.mine && performance.now() - b.mineT < 400)) continue; const pr = vbPredict(b.m.position, b.v, 0.3); if (!pr) continue; const d = Math.hypot(pr.x - walk.x, pr.z - walk.z); if (d < 5 && d < bd) { bd = d; tx = pr.x; tz = pr.z; } }
  if (!staUse(staCost('dive', vmMe()))) return false;
  const [fx, fz] = vbFwd(), dx = tx != null ? tx - walk.x : fx, dz = tx != null ? tz - walk.z : fz, d = Math.hypot(dx, dz) || 1, sp = clamp((tx != null ? d : 2) / 0.4, 3.5, 7.5);
  walk.dive = { t: 0, vx: (dx / d) * sp, vz: (dz / d) * sp };
  walk.diveDir = Math.atan2(dx * -Math.cos(walk.yaw) + dz * Math.sin(walk.yaw), dx * -Math.sin(walk.yaw) + dz * -Math.cos(walk.yaw));   // 撲的方向（身體座標）：決定往前魚躍還是側倒
  walk.recv = { t0: performance.now(), prev: null, dive: true }; pose = 'bump'; hands.visible = true;
  tutEv('dive', {});
  return true;
}
function vbRecvStep() {
  const r = walk.recv; if (!r) return;
  if (performance.now() - r.t0 > (r.dive ? 700 : 1300)) { tutEv('recvMiss', {}); walk.recv = null; if (!walk.hold && !(walk.flash > 0)) { hands.visible = false; pose = 'hold'; } return; }
  // 撲救：手伸出去的位置（身體前方 0.55 m）0.85 m 內、撲出去 0.12 秒後（身體已經伸直）才碰得到；一般接球照身體
  const [fx0, fz0] = vbFwd(), dv = walk.dive, cx = r.dive ? walk.x + fx0 * 0.55 : walk.x, cz = r.dive ? walk.z + fz0 * 0.55 : walk.z;
  if (r.dive && (!dv || dv.t < 0.12)) { if (!dv) { tutEv('recvMiss', {}); walk.recv = null; } return; }
  const R = r.dive ? 0.85 : VB_REACH.recv * (VB.assist ? 1.25 : 1), top = r.dive ? 1.0 : 1.6 + (walk.air ? walk.air.y : 0), low = r.dive ? 0.06 : 0.15, hy = r.dive ? 0.35 : 0.8, ideal = r.dive ? 0 : 0.45; let best = null;
  const costOf = (q) => { const dh = Math.hypot(q.x - cx, q.z - cz); return dh > R || q.y < low || q.y > top ? null : Math.abs(dh - ideal) + Math.abs(q.y - hy) * 0.6; };
  for (const b of balls) {
    if (b.rest > 0.3 || (b.mine && performance.now() - b.mineT < 400) || (VM.on && (b.floorHit || !vbOwnSide(b)))) continue;   // 比賽中落地過的球、還在對面的球都碰不到
    const p = b.m.position, cost = costOf(p); if (cost == null) continue;
    if (!best || cost < best.cost) { const cn = costOf(vbNext(b)); best = { b, dx: p.x - walk.x, dz: p.z - walk.z, cost, cn }; }
  }
  if (!best) { r.prev = null; return; }
  if ((r.prev != null && best.cost > r.prev + 1e-3) || best.cn == null || best.cn >= best.cost - 1e-4 || best.b.m.position.y < (r.dive ? 0.12 : 0.3)) { walk.recv = null; vbDoReceive(best, r.dive); }
  else r.prev = best.cost;
}
// ---- 接重扣：站在球路上（球在身體正前方）才接得好；來球越重，容許的偏差越小
//   就算站到位，重球也有機率「被推走」——方向不是亂飄：衝（往網子飛、甚至直接回對面）、側（順著來球的斜線往邊線噴）、高（往上彈又高又後面）
//   站穩卸力（擊球那一刻腳沒在跑、球在正前方）被推走的機率低一些；skill＝AI 程度（越小越會卸力）
//   回傳球場座標的修正：dx（＋＝離網更遠、−＝往網子）、dz（左右）、dy（目標高度）、dT（飛行時間）
// 蹲下接重扣（按住 C）：力道卸掉，噴掉的機率低、不會直接墊回對面；站著接重扣比較容易接噴（使用者 2026-11-04 要求，數值集中在這裡調手感）
const RECV_CROUCH = { stand: 1.45, crouch: 0.3, crouchMag: 0.5, crouchDy: -0.5, crouchDT: 0.15 };
function vbHardDefl(vin, q, absorb, vzIn, skill = 1, crouch = null) {
  const ex = clamp((vin - 13) / 14, 0, 1), cm = crouch === true ? RECV_CROUCH.crouch : crouch === false ? RECV_CROUCH.stand : 1;
  if (!ex || gameRandom() > ex * (0.35 + 0.65 * (1 - q)) * (absorb ? 0.65 : 1) * skill * cm) return null;
  const m = (0.6 + 1.4 * ex) * (0.6 + gameRandom() * 0.8) * (crouch === true ? RECV_CROUCH.crouchMag : 1), r = gameRandom();
  if (crouch === true) return r < 0.6 ? { kind: 'side', dx: rkGauss() * 0.3, dz: (Math.sign(vzIn) || (gameRandom() < 0.5 ? -1 : 1)) * m, dy: 0, dT: 0 } : { kind: 'high', dx: m * 0.5, dz: rkGauss() * 0.4, dy: 0.6, dT: 0.2 };   // 蹲著接：偏一點也留在自己場上
  if (r < 0.5) return { kind: 'long', dx: -m * 1.1, dz: rkGauss() * 0.5, dy: -0.3, dT: -0.15 };
  if (r < 0.8) return { kind: 'side', dx: rkGauss() * 0.5, dz: (Math.sign(vzIn) || (gameRandom() < 0.5 ? -1 : 1)) * m * 1.3, dy: 0, dT: 0 };
  return { kind: 'high', dx: m * 0.7, dz: rkGauss() * 0.6, dy: 1.2 + gameRandom() * 0.8, dT: 0.35 };
}
const DEFL_NOTE = { long: '球太重，墊得太衝', side: '球太重，從手臂旁邊噴出去', high: '球太重，彈得又高又後面' };
function vbDoReceive(o, dive) {
  const b = o.b, p = b.m.position.clone(), [fx, fz] = vbFwd(), lat = Math.abs(o.dx * -fz + o.dz * fx), front = o.dx * fx + o.dz * fz, vin = b.v.length();
  // 球路：慢球偏 30 cm 內都算正對，25 m/s 的重扣只剩 15 cm；擊球那一刻腳還在跑＝沒站穩、卸不了力
  const tol = 0.3 - 0.15 * clamp((vin - 10) / 15, 0, 1), onLine = lat <= tol && front >= 0, run = Math.hypot(...(walk.vel || [0, 0]));
  let q = 1, note = '';
  if (lat > tol) { q *= 1 - Math.min(0.55, (lat - tol) * (0.8 + 0.06 * Math.max(0, vin - 12))); note = vin > 15 ? '沒站在球路上' : '球在身體側邊'; }
  if (front < 0) { q *= 0.6; note = '球跑到身後了'; }
  if (dive) { q *= 0.8; note = note || '撲救'; }
  else if (p.y < 0.4) { q *= 0.75; note = note || '太低了'; } else if (p.y > 1.25) { q *= 0.8; note = note || '太高（胸口接的）'; }
  if (vin > 12) { q *= Math.max(onLine ? 0.75 : 0.45, 1 - (vin - 12) / (onLine ? 55 : 30)); if (vin > 18) note = note || '球太重'; }
  if (!dive && vin > 10 && run > 1.5) { q *= 1 - Math.min(0.3, (run - 1.5) * 0.12); note = note || '腳還在跑，沒站穩'; }
  // 目標：自己這邊網前 1.1 m、偏右 1.2 m 的舉球區。要面向舉球區接：手臂平台斜一點（30 度內）沒關係，越斜越差（見下面）
  const ct = vbCourt(), pep = vbPep(), second = !pep && vmSecond(); let tx, tz, ty = 2.4, T = 1.25, tilt = 0;   // second＝隊上第二球：下手舉高球（修正球）到 4 號位
  if (pep) { tx = pep.x; tz = pep.z; ty = 2.5; T = clamp(0.8 + Math.hypot(tx - walk.x, tz - walk.z) * 0.1, 1.1, 1.7); }   // 對碰：墊回給陪練（他會舉給你）
  if (pep || ct) {
    if (second) { const [lx, lz] = toLocalOf(ct.c, walk.x, walk.z), sp = vbSpot(ct, 1, lx, lz); [tx, tz] = toWorldOf(ct.c, sp.lx, sp.lz); ty = sp.y; T = clamp(1.2 + Math.hypot(sp.lx - lx, sp.lz - lz) * 0.06, 1.35, 1.8); }
    else if (!pep) { const sg = Math.sign(ct.lx) || 1; [tx, tz] = toWorldOf(ct.c, sg * 1.8, -sg * 1.2); ty = 2.3; }   // 傳到網前 1.8 m、2.3 m 高（舉球員在那裡等），球再往前一點就落地，不會飄到網下
    const ddx = tx - walk.x, ddz = tz - walk.z, dd = Math.hypot(ddx, ddz) || 1, cos = (ddx * fx + ddz * fz) / dd;
    // 面向和舉球區差幾度：30 度內最準；30～90 度越斜越差、球也順著你面向的方向偏出去（不會剛好到舉球區）；超過 90 度（背對）扣更多、偏更多
    const ang = Math.acos(clamp(cos, -1, 1)), k1 = clamp((ang - 0.52) / 1.05, 0, 1), k2 = clamp((ang - 1.57) / 1.05, 0, 1);
    if (pep) {   // 對碰陪練：照舊，偏一點會被帶回陪練那邊
      tilt = k1;
      if (k1 > 0) {
        q *= (1 - 0.35 * k1) * (1 - 0.45 * k2);
        if (k1 > 0.3) note = note || (k2 > 0 ? '背對陪練' : '沒有面向陪練');
        const mix = 0.35 * k1 + 0.35 * k2; tx = tx * (1 - mix) + (walk.x + fx * dd) * mix; tz = tz * (1 - mix) + (walk.z + fz * dd) * mix;
      }
    } else {   // 比賽：球一律往你面向的方向走（距離、高度照目標）——不會自動修到舉球區，要自己面向對的方向
      tx = walk.x + fx * dd; tz = walk.z + fz * dd;
      if (k1 > 0.3) note = note || (k2 > 0 ? (second ? '背對 4 號位' : '背對舉球區') : second ? '沒有面向 4 號位' : '沒有面向舉球區');
    }
  } else { tx = walk.x + fx * 6; tz = walk.z + fz * 6; ty = 1.4; }
  // 撲救：球撈得高高的、落在撲的人附近（往場中間一點），不會剛好到舉球區——讓隊友來修正；站著接的重球可能被推走（有方向）
  let defl = null, back = false;
  if (ct && !pep && !second && q >= 0.32) {
    const sg = Math.sign(ct.lx) || 1;
    if (dive) { const [lx, lz] = toLocalOf(ct.c, walk.x, walk.z), [ax, az] = toWorldOf(ct.c, sg * clamp(Math.abs(lx) - 0.5, 2.2, 7), lz * 0.6), L = Math.hypot(ax - walk.x, az - walk.z); tx = walk.x + fx * L; tz = walk.z + fz * L; ty = 1.0; T = 1.45 + Math.random() * 0.25; note = '撲救：撈高了，隊友來修正'; }   // 撲救也照面向的方向撈
    else {
      const [, z0] = toLocalOf(ct.c, p.x, p.z), [, z1] = toLocalOf(ct.c, p.x + b.v.x, p.z + b.v.z);
      defl = vbHardDefl(vin, q, onLine && run < 0.8, z1 - z0, 1, vin > 13 ? !!walk.crouch : null);
      if (walk.crouch && vin > 13 && !defl) { ty += RECV_CROUCH.crouchDy; T += RECV_CROUCH.crouchDT; note = note || '蹲低卸力，接得很穩'; }
      if (defl) { const [lx, lz] = toLocalOf(ct.c, tx, tz), nx = lx * sg + defl.dx; if (nx < 0.3) back = true; else { [tx, tz] = toWorldOf(ct.c, sg * nx, lz + defl.dz); ty += defl.dy; T += defl.dT; } note = back ? '球太重，直接墊回對面' : DEFL_NOTE[defl.kind]; }
    }
  }
  let intoNet = false;   // 接過頭撞網：很低的機率（接得越差越容易）
  if (ct && !pep && !second && !dive && !back && q >= 0.32 && Math.random() < 0.015 + 0.06 * (1 - q)) { const sg = Math.sign(ct.lx) || 1, [, lz] = toLocalOf(ct.c, tx, tz); [tx, tz] = toWorldOf(ct.c, sg * 0.05, lz); ty = 1.8; T = 0.8; intoNet = true; note = '接過頭了，撞到網子'; }
  if (window.__gym) window.__gym.lastRecv = { q: +q.toFixed(2), note, tilt: +tilt.toFixed(2), onLine, defl: defl && defl.kind, back, second, intoNet };
  if (intoNet) { /* 撞網：不加亂數 */ }
  else if (q < 0.32) { const a = walk.yaw + (Math.random() - 0.5) * 2.2, L = 3 + Math.random() * 5; tx = walk.x - Math.sin(a) * L; tz = walk.z - Math.cos(a) * L; ty = 0.3; T = 0.9; }
  else { const e = (1 - q) * 2.4 + 0.6 * tilt; tx += rkGauss() * e; tz += rkGauss() * e; T = 1.25 + (1 - q) * 0.35 * (Math.random() - 0.3); }
  // 接球的落點留在自己這邊（離網至少 0.9 m）：偏掉也是偏在自己場上，不會平平的從網子下面飄過去
  if (ct && !pep && !back && !intoNet) { const sg = Math.sign(ct.lx) || 1, [lx, lz] = toLocalOf(ct.c, tx, tz); if (lx * sg < 0.9 && lx * sg > 0) {   /* 落點太靠網才往後推；面向對面接過網的就讓它過去 */ [tx, tz] = toWorldOf(ct.c, sg * (0.9 + Math.random() * 0.8), lz); if (ty < 1.5) { ty = 1.8; T = 1.1; } } }
  // Keep the rescue arc after quality/noise adjustments.
  if(dive){T=Math.max(T,1.8);ty=Math.max(ty,1.5);}
  if(b.tutorialHeavy && !dive && !walk.crouch){tx=walk.x+fx*10;tz=walk.z+fz*10;ty=.4;T=.8;note='重扣需要蹲低卸力';}
  const plat = new THREE.Vector3(walk.x + fx * (dive ? 0.95 : 0.42), dive ? Math.max(0.15, p.y) : 0.72 + (walk.air ? walk.air.y : 0), walk.z + fz * (dive ? 0.95 : 0.42)), cp = p.clone().lerp(plat, 0.6);   // 前臂平台
  b.spike = null; vbMine(b);
  pose = 'bumpHit'; hands.visible = true; walk.flash = 0.45; skill.dip = 0.05; staPay('bump');
  const over = ct && ((vmThird() && q >= 0.32) || back);   // 第三球：下手把球送高高的過網（落在對面深處）；太衝＝平平的直接回對面
  vbLaunch(b, cp, over ? (back ? vbOverVel(cp, ct, false, 0.6) : vbFacingOverVel(cp, ct, true, 1 - q)) : new THREE.Vector3((tx - cp.x) / T, (ty - cp.y) / T + 4.9 * T, (tz - cp.z) / T), 'bump', q, true);
  tutEv('recv', { q, dive: !!dive, crouch: !!walk.crouch }, b);
  if (over && !back) note = '第三球：下手送過網';
  vmOnTouch(b, vmMe(), 'bump'); vbFx(b, q);
  if (second && q >= 0.32 && !over) { vbMarkSet(b); const P2 = VM.host ? VM.poss[vmTeamOf(vmMe())] : null; if (P2) P2.fix = true; note = '下手舉高球（修正）'; }
  recHit({ x: p.x, y: p.y, z: p.z, v: b.v.length(), kind: 'bump' });
  if (VM.on && q >= 0.88 && !defl && !dive && !second) MREC.local.p++;   // WEB-010 戰績：完美接球
  toast(b.thirdReturn ? '第三下：自動送回對面' : q >= 0.88 && !defl && !dive && !second ? '到位！完美接球' : q < 0.32 ? `接噴了（${note || '沒接正'}）` : note ? `接起來了（${note}）` : '接起來了', 1300);
}
// ---- 舉球（1／2／3）：提早按，球掉到額頭前上方時自動舉；舉出去一定會經過那個攻擊點
// 這一下是不是我們隊的第三次觸球（只能送過網了）
function vmSecond() { if (!VM.on || VM.phase !== 'rally') return false; const tc = VM.host ? (VM.touch && !VM.touch.serve ? [VM.touch.team, VM.touch.n] : null) : VM.tc; return !!tc && tc[0] === vmTeamOf(vmMe()) && tc[1] === 1; }
// 你是舉球員：隊友接起來的球會掉到舉球高度（2.3 m）的地方畫藍圈——不到位的球要自己跑過去修正
function vmPassRing() {
  if (!VM.on || VM.phase !== 'rally' || !VM.ball || !balls.includes(VM.ball) || VM.ball.mine) return null;
  const me = vmMe(), t = vmTeamOf(me), tc = VM.host ? (VM.touch && !VM.touch.serve ? [VM.touch.team, VM.touch.n] : null) : VM.tc;
  if (!tc || tc[0] !== t || tc[1] !== 1) return null;
  const P = VM.host ? VM.poss[t] : null, setter = P ? P.setter : VM.remoteSetters?.[t];
  if (setter ? setter !== me : VM.six && VM.role[me] !== 'S') return null;
  const B = vmBallL(VM.ball), p = vmPredL(B, 2.3) || vmPredL(B, 1.0); if (!p || Math.sign(p.x) !== vmSide(t)) return null;
  const [x, z] = vmW(p.x, p.z); return { x, z };
}
function vmThird() { if (!VM.on || VM.phase !== 'rally') return false; const tc = VM.host ? (VM.touch && !VM.touch.serve ? [VM.touch.team, VM.touch.n] : null) : VM.tc; return !!tc && tc[0] === vmTeamOf(vmMe()) && tc[1] >= 2; }
// 送過網的速度：high＝下手高弧線（過網 0.9 m 以上、落在對面 5～8 m），否則＝推平（剛好高過網 0.35 m、落在 5.5～8 m）
// 過網那一刻的高度＝起點和終點連線的高度＋4.9·T²·f(1−f)（f＝走到網子的比例），照這個反推夠高的飛行時間
function vbThirdOverVel(cp, ct, q) {
  const sg = vmSide(vmTeamOf(vmMe())), [lx] = toLocalOf(ct.c, cp.x, cp.z), poor = q < 0.32;
  const dep = clamp(6.5 + rkGauss() * (1 - q), 4, 8.6);
  const z = clamp((gameRandom() - 0.5) * 5 + rkGauss() * (1 - q) * (poor ? 3 : 1), poor ? -6 : -4.1, poor ? 6 : 4.1);
  const [tx, tz] = toWorldOf(ct.c, -sg * dep, z);
  const f = Math.abs(lx) / Math.max(0.001, Math.abs(lx) + dep), clear = NETS[state.net].h + BALL_R + 0.6;
  const T = Math.max(1.55, Math.sqrt(Math.max(0, (clear - cp.y - (BALL_R - cp.y) * f) / Math.max(0.0001, 4.9 * f * (1 - f)))));
  return new THREE.Vector3((tx - cp.x) / T, (BALL_R - cp.y) / T + 4.9 * T, (tz - cp.z) / T);
}
function vbOverVel(cp, ct, high, err = 0) {
  const sg = Math.sign(ct.lx) || 1, [plx] = toLocalOf(ct.c, cp.x, cp.z), dep = (high ? 5 + Math.random() * 3 : 5.5 + Math.random() * 2.5) + rkGauss() * err * 2;
  const [tx, tz] = toWorldOf(ct.c, -sg * clamp(dep, 3, 8.6), (Math.random() - 0.5) * 5 + rkGauss() * err * 2);
  const f = clamp(Math.abs(plx) / (Math.abs(plx) + Math.abs(dep)), 0.05, 0.95), clear = NETS[state.net].h + (high ? 0.9 : 0.35);
  const T = Math.max(high ? 1.55 : 0.8, Math.sqrt(Math.max(0, (clear - cp.y - (BALL_R - cp.y) * f) / (4.9 * f * (1 - f)))));
  return new THREE.Vector3((tx - cp.x) / T, (BALL_R - cp.y) / T + 4.9 * T, (tz - cp.z) / T);
}
// 照你面向的方向送球（V 第三球下手送、E 推過網）：過網高度固定（high＝高 0.9 m、推平＝0.35 m），方向不幫你修——
//   面向對面才會過網；面向斜角就斜斜出去（可能出界）；面向旁邊、背對就送不過去
function vbFacingOverVel(cp, ct, high, err = 0) {
  const [f0x, f0z] = vbFwd(), a = rkGauss() * err * 0.2, fx = f0x * Math.cos(a) - f0z * Math.sin(a), fz = f0x * Math.sin(a) + f0z * Math.cos(a);
  const sg = Math.sign(ct.lx) || 1, [plx] = toLocalOf(ct.c, cp.x, cp.z), toward = -sg * (toLocalOf(ct.c, cp.x + fx, cp.z + fz)[0] - plx);   // 每走 1 m 往對面靠近多少
  const dep = (high ? 5 + Math.random() * 3 : 5.5 + Math.random() * 2.5) + rkGauss() * err * 2, clear = NETS[state.net].h + (high ? 0.9 : 0.35);
  if (toward > 0.12) {
    const L = Math.min(16, (Math.abs(plx) + dep) / toward), f = clamp(Math.abs(plx) / (Math.abs(plx) + dep), 0.05, 0.95);
    const T = Math.max(high ? 1.55 : 0.8, Math.sqrt(Math.max(0, (clear - cp.y - (BALL_R - cp.y) * f) / (4.9 * f * (1 - f)))));
    return new THREE.Vector3((fx * L) / T, (BALL_R - cp.y) / T + 4.9 * T, (fz * L) / T);
  }
  const L = high ? 6 : 5, T = high ? 1.55 : 0.9;   // 沒面向對面：照面向的方向送出去（不會過網）
  return new THREE.Vector3((fx * L) / T, (BALL_R - cp.y) / T + 4.9 * T, (fz * L) / T);
}
// 比賽中按 E：身邊的球用雙手推平送過網（算一次觸球）
function vmFreeBall() {
  if (walk.emote?.keyframes) return;
  if (walk.hold) { toast('拿著球：到發球區按左鍵發球', 1400); return; }
  const b = VM.ball && balls.includes(VM.ball) ? VM.ball : null, ct = vbCourt();
  if (!b || b.floorHit || !ct) { toast('E：球在身邊時，把球推過網', 1400); return; }
  if (!vbOwnSide(b)) { toast('球還在對面：等它過網再碰', 1200); return; }
  const p = b.m.position, dh = Math.hypot(p.x - walk.x, p.z - walk.z);
  if (dh > 1.2 || p.y < 0.25 || p.y > camera.position.y + 1.1) { toast('球太遠了：靠近一點再按 E', 1200); return; }
  // 雙手在額頭前把球推平過去：剛好過網、比下手送的低又快
  const cp = p.clone().lerp(new THREE.Vector3(walk.x, Math.max(p.y, camera.position.y + 0.2), walk.z), 0.3);
  vbMine(b); b.spike = null; pose = 'setPush'; hands.visible = true; walk.flash = 0.4; staPay('set');
  vbLaunch(b, cp, vbFacingOverVel(cp, ct, false, 0.15), 'set', 0.8, true);   // 往面向的方向推
  vmOnTouch(b, vmMe(), 'set'); toast(b.thirdReturn ? '第三下：自動送回對面' : '推過網', 900);
}
// 舉球的選項：1＝平的長攻／高的長攻、2＝高的 3 號位／快攻、3＝平的背／高的背（轉盤上第一個在左邊，其他照順序平分一圈）；只按一下不拖＝最後一個（原本的舉法）
const SET_OPT = { 1: [['high', '高的長攻'], ['flat', '平的長攻']], 2: [['high3', '高的 3 號位'], ['quick', '快攻']], 3: [['high', '高的背'], ['flat', '平的背']] };   // 左＝慢（高球）、右＝快（平球、快攻）
const SET_DEF = { 1: 'high', 2: 'quick', 3: 'high' };   // 圓盤沒選就用這個（跟以前一樣）
const SETM = { m: null, page: 0, last: [0, 0] };
const SET_WHEEL = [
  [[1,'high','4 號位','高球'],[1,'flat','4 號位','快球'],[2,'wheelQuick','快攻','6v6 跟人／A 快'],[3,'flat','2 號位','快球'],[3,'high','2 號位','高球'],[2,'high3','3 號位','高球']],
  [[7,'line3','後排 5 號位','三米線'],null,null,null,[5,'line3','後排 1 號位','三米線'],[4,'line3','後排 6 號位','三米線']]
];
const setWheelAngle = i => (120-i*60)*Math.PI/180;
function setWheelOpen(page = SETM.page) {
  if (!walk.on || walk.paused || walk.sit || (VM.on && (roomSpectator() || VM.phase !== 'rally'))) return;
  vbManualSetCancel(); clearTimeout(SETM.to); SETM.page = page;
  SETM.m = { all:true, page, n:0, dx:0, dy:0, hov:-1 };
  const el = $('set-menu'); el.classList.add('all-wheel'); el.classList.remove('two-wheel');
  el.onpointermove = e => {
    if(!SETM.m?.all || document.pointerLockElement)return;
    const rect=el.getBoundingClientRect(), m=SETM.m;
    setMenuMove(e.clientX-rect.left-rect.width/2-m.dx,e.clientY-rect.top-rect.height/2-m.dy);
  };
  for (const o of el.querySelectorAll('.sw-opt,.sw-center')) o.remove();
  SET_WHEEL[page].forEach((route,i) => {
    if (!route) return;
    const o = document.createElement('div'), a = setWheelAngle(i);
    o.className='sw-opt'; o.dataset.sv=i;
    o.innerHTML='<strong>'+route[2]+'</strong><small>'+route[3]+'</small>';
    o.style.left=(50+Math.cos(a)*34)+'%'; o.style.top=(50-Math.sin(a)*34)+'%';
    o.addEventListener('pointerenter',()=>setMenuHover(i)); el.appendChild(o);
  });
  const center=document.createElement('div'); center.className='sw-center';
  center.innerHTML='<strong>'+(page?'後排':'前排')+'</strong><small>滾輪換頁<br>放開 '+VBSettings.keyName(VBSettings.values.keys.q)+' 舉球</small>';
  el.appendChild(center); el.style.background=''; el.style.setProperty('--sector','linear-gradient(transparent,transparent)');
  $('set-cur').style.transform='translate(0px,0px)'; el.hidden=false;
}
function setWheelScroll(e) {
  if (!SETM.m?.all || !e.deltaY) return;
  e.preventDefault(); e.stopPropagation();
  const now=performance.now(); if(SETM.scrollAt && now-SETM.scrollAt<180)return;
  SETM.scrollAt=now; setWheelOpen(1-SETM.page);
}
addEventListener('wheel',setWheelScroll,{passive:false,capture:true});
addEventListener('blur',()=>setMenuClose(false));
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement)setMenuClose(false);});
const practicePressed=new Map();
function practiceKeysRender() {
  const el=$('wk-keys'); if(!el)return;
  el.hidden=!new URLSearchParams(location.search).has('practice') || VBSettings.values.keyPanel===false;
  for(const cap of el.querySelectorAll('kbd[data-key]'))cap.parentElement.classList.toggle('pressed',[...practicePressed.values()].includes(cap.dataset.key));
}
addEventListener('keydown',e=>{if(!walk.on || VBSettings.isOpen || /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName))return;practicePressed.set(e.code,VBSettings.key(e));practiceKeysRender();});
addEventListener('keyup',e=>{practicePressed.delete(e.code);practiceKeysRender();});
function practiceKeysClear(){practicePressed.clear();practiceKeysRender();}
addEventListener('blur',practiceKeysClear); addEventListener('vb-settings-open',practiceKeysClear); addEventListener('vb-settings-change',practiceKeysRender);
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement)practiceKeysClear();});
practiceKeysRender();
// 轉盤：第 i 個選項放在 180°−i×(360°／選項數)（兩個選項＝左、右）；扇形之間畫分隔線
const setAng = (i, n) => Math.PI - (i * Math.PI * 2) / n + (SETM.m && VBSettings.values.swap[SETM.m.n - 1] ? Math.PI : 0);
function setMenuOpen(n) {
  if (SETM.m) setMenuClose(true);
  $('set-menu').classList.add('all-wheel','two-wheel');   // Q／E／R：跟 C 輪盤一樣的樣式，只是兩個選項各占 180°
  for(const o of $('set-menu').querySelectorAll('.sw-center'))o.remove();
  const opts = SET_OPT[n], N = opts.length, el = $('set-menu'), m = SETM.m = { n, dx: 0, dy: 0, hov: -1, t0: performance.now() };
  clearTimeout(SETM.to); SETM.to = setTimeout(() => { if (SETM.m === m) setMenuClose(true); }, 2500);   // 點一下就放開：轉盤留著等你拖，2.5 秒沒動作＝預設
  for (const o of el.querySelectorAll('.sw-opt')) o.remove();
  opts.forEach(([, label], i) => {
    const o = document.createElement('div'), a = setAng(i, N); o.className = 'sw-opt'; o.dataset.sv = i; o.innerHTML = '<strong>' + label + '</strong><small>' + (i ? '快' : '慢') + '</small>';
    o.style.left = `${50 + Math.cos(a) * 34}%`; o.style.top = `${50 - Math.sin(a) * 34}%`;
    o.addEventListener('pointerenter', () => setMenuHover(i)); o.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); setMenuPick(i); });   // 沒鎖定滑鼠時：直接點
    el.appendChild(o);
  });
  const name = { 1: '4 號位', 2: '快攻', 3: '2 號位' }[n] || '', center = document.createElement('div'); center.className = 'sw-center';
  center.innerHTML = '<strong>' + name + '</strong><small>往左右拖選<br>拖出去就舉</small>'; el.appendChild(center);
  el.style.background = ''; el.style.setProperty('--sector', 'linear-gradient(transparent,transparent)');
  $('set-cur').style.transform = 'translate(0px, 0px)'; el.hidden = false;
}
function setMenuHover(i) { const m = SETM.m; if (!m || m.hov === i) return; m.hov = i; m.invalid=false; if(m.all){const d=i*60;$('set-menu').style.setProperty('--sector',`conic-gradient(from -60deg,transparent 0deg ${d}deg,rgba(255,205,55,.65) ${d}deg ${d+60}deg,transparent ${d+60}deg 360deg)`);} else { const c=90-setAng(i,SET_OPT[m.n].length)*180/Math.PI; $('set-menu').style.setProperty('--sector',`conic-gradient(from ${c-90}deg,rgba(255,205,55,.65) 0deg 180deg,transparent 180deg 360deg)`); } for (const o of $('set-menu').querySelectorAll('.sw-opt')) o.classList.toggle('on', +o.dataset.sv === i); }
// 滑鼠移動：游標在轉盤裡跟著動（不轉頭）；方向最接近哪個選項就亮哪個，拖出去夠遠（45 px）就舉
function setMenuMove(dx, dy) {
  const m = SETM.m; if (!m) return; m.dx += dx; m.dy += dy;
  const r = Math.hypot(m.dx, m.dy), N = m.all ? 6 : SET_OPT[m.n].length;
  const radius=$('set-menu').clientWidth*.43;
  const deadZone=$('set-menu').querySelector('.sw-center') ? $('set-menu').querySelector('.sw-center').offsetWidth/2+6 : 12;
  if (r > radius) { m.dx *= radius / r; m.dy *= radius / r; }
  $('set-cur').style.transform = `translate(${m.dx.toFixed(0)}px, ${m.dy.toFixed(0)}px)`;
  if (r <= deadZone) { m.hov=-1;m.invalid=false;$('set-menu').style.setProperty('--sector','linear-gradient(transparent,transparent)');for(const o of $('set-menu').querySelectorAll('.sw-opt'))o.classList.remove('on'); return; }
  const phi = Math.atan2(-m.dy, m.dx); let best = 0, bd = 9;
  for (let i = 0; i < N; i++) { const a=m.all ? setWheelAngle(i) : setAng(i,N); const d = Math.abs(Math.atan2(Math.sin(phi-a),Math.cos(phi-a))); if (d < bd) { bd = d; best = i; } }
  if(m.all && !SET_WHEEL[m.page][best]){m.hov=-1;m.invalid=true;$('set-menu').style.setProperty('--sector','linear-gradient(transparent,transparent)');for(const o of $('set-menu').querySelectorAll('.sw-opt'))o.classList.remove('on');return;}
  m.invalid=false; setMenuHover(best); if (!m.all && r >= deadZone + 30) setMenuPick(best);
}
function setMenuPick(i) { const m = SETM.m; if (!m) return; if(m.all){const route=SET_WHEEL[m.page][i];if(!route)return;SETM.last[m.page]=i;SETM.m=null;SETM.until=0;$('set-menu').hidden=true;vbSet(route[0],route[1],true);return;} SETM.m = null; SETM.until = performance.now() + 350; clearTimeout(SETM.to); $('set-menu').hidden = true; vbSet(m.n, SET_OPT[m.n][i][0], true); }   // 選完 0.35 秒內滑鼠還在滑也不轉視角
const setMenuHolds = () => !!SETM.m || performance.now() < (SETM.until || 0);
// 放開數字鍵：有亮著的選項就用它，沒有＝最後一個（原本的舉法）
function setMenuClose(pickDefault) { const m = SETM.m; if (!m) return; if (pickDefault && !m.invalid) setMenuPick(m.hov >= 0 ? m.hov : (m.all ? SETM.last[m.page] : Math.max(0, SET_OPT[m.n].findIndex(([v]) => v === SET_DEF[m.n])))); else { SETM.m = null; clearTimeout(SETM.to); $('set-menu').hidden = true; } }
// Q/E choose the side at contact; pitch and mouse hold control independent angle/speed.
function vbManualSetCancel() {
  walk.setAim = null;
  if (walk.setQ?.manual) walk.setQ = null;
  const el = $('set-charge'); if (el) el.hidden = true;
  if (!walk.hold && !walk.swing && !(walk.flash > 0)) { hands.visible = false; pose = 'hold'; }
}
function vbManualSetPrepare(back = false) {
  if (!walk.on || walk.paused || walk.sit || walk.emote?.keyframes || (VM.on && (roomSpectator() || VM.phase !== 'rally'))) return;
  const chargingAt = walk.setAim?.chargingAt ?? null;
  setMenuClose(false); SETM.until = 0;
  walk.recv = null; walk.swing = null; walk.setQ = null; walk.charge = null; walk.chargeArm = null; walk.turn = null;
  if (walk.hold) { const [fx,fz] = vbFwd(); releaseBall(new THREE.Vector3(fx * .25, 3.4, fz * .25)); }
  walk.setAim = { back, chargingAt, shot: false }; pose = 'set'; hands.visible = true;
  vbChgHud(); vbManualSetHud();
}
function vbManualSetDown() {
  const a = walk.setAim; if (!a || a.shot || walk.paused) return false;
  if (a.chargingAt == null) a.chargingAt = performance.now();
  vbManualSetHud(); return true;
}
function vbManualSetShot(back, seconds, yaw = walk.yaw, pitch = walk.pitch) {
  const p = VBSettings.values, full = p.setCharge ?? .9, fraction = clamp(seconds / full, 0, 1);
  const speed = (p.setFast ?? 11) + ((p.setSlow ?? 5.5) - (p.setFast ?? 11)) * fraction;
  return { back, seconds, fraction, speed, yaw: yaw + (back ? Math.PI : 0), angle: clamp(pitch, .14, 1.4) };
}
function vbManualSetRelease() {
  const a = walk.setAim; if (!a || a.chargingAt == null || a.shot) return false;
  if (walk.paused || !walk.on) { vbManualSetCancel(); return true; }
  const manual = vbManualSetShot(a.back, (performance.now() - a.chargingAt) / 1000);
  a.shot = true;
  walk.setQ = { n: a.back ? 3 : 1, v: 'manual', manual, t0: performance.now(), prev: null, win: 500 };
  vbManualSetHud(); return true;
}
function vbManualSetHud() {
  const el = $('set-charge'), a = walk.setAim; if (!el) return;
  el.hidden = !a; if (!a) return;
  const shot = walk.setQ?.manual || vbManualSetShot(a.back, a.chargingAt == null ? 0 : (performance.now() - a.chargingAt) / 1000);
  $('set-charge-fill').style.width = `${(shot.fraction * 100).toFixed(0)}%`;
  $('set-charge-title').textContent = `${a.back ? '背面' : '正面'}舉球 · ${(shot.angle * 180 / Math.PI).toFixed(0)}° · ${shot.speed.toFixed(1)} m/s`;
  $('set-charge-note').textContent = a.shot ? '等待球進入額頭前上方' : '抬頭決定角度 · 左鍵短按快、長按慢';
}
function vbDoManualSet(b, shot, q, hy) {
  const horizontal = Math.cos(shot.angle) * shot.speed;
  const velocity = new THREE.Vector3(-Math.sin(shot.yaw) * horizontal, Math.sin(shot.angle) * shot.speed, -Math.cos(shot.yaw) * horizontal);
  const cp = b.m.position.clone();
  vbMine(b); walk.turn = null; pose = shot.back ? 'setBack' : 'setPush'; hands.visible = true; walk.flash = .5; skill.dip = .05; staPay('set');
  const pf = clamp((.5 - q) * 1.6, 0, .6) * (vbMyRole() === 'OPP' ? .3 : 1);
  b.setFault = Math.random() < pf ? (hy < -.3 ? 'held' : 'double') : null;
  b.spike = null; vbLaunch(b, cp, velocity, 'set', q); vbMarkSet(b);
  recHit({ x: cp.x, y: cp.y, z: cp.z, v: velocity.length(), kind: 'set' });
  // Keep contact quality, match counting and network authority on the existing path.
  if (VM.on) { const sn = VM.setNo || 1, stat = MREC.local.sets[sn] || (MREC.local.sets[sn] = { n: 0, f: 0 }); stat.n++; if (b.setFault) stat.f++; }
  tutEv('set', { manual: true, back: shot.back, angle: shot.angle, fraction: shot.fraction, n: shot.back ? 3 : 1 }, b);
  VB.setN = shot.back ? 3 : 1; vmOnTouch(b, vmMe(), 'set');
  if (b.setFault) toast(b.setFault === 'held' ? '持球：觸球位置太低' : '連擊：觸球時機不準', 1400);
}
function vbSet(n, v = null, menu = false) {
  if (walk.setAim) vbManualSetCancel();
  if (walk.emote?.keyframes) return;
  if (VM.on && walk.hold) { toast('拿著球：到發球區按左鍵發球', 1400); return; }
  // 2 對 2：這一球是 AI 隊友舉（你接的、或球還在對面），按 1／2／3＝喊球
  if (VM.on && VM.host && !walk.hold && !skill.mode) {
    const P = VM.poss[0], mateSets = P ? P.setter !== vmMe() && P.stage < 2 : VM.touch.team !== 0 || VM.phase !== 'rally';
    const near = balls.some((b) => b.rest < 0.3 && b.m.position.distanceTo(camera.position) < 2.2);
    if (mateSets && !near && VM.team[0].some((id) => VM.ai.has(id))) {
      VM.call = { n, t: VM.t, v }; toast(`你喊：${v === 'flat' ? ['', '4 號位（平球）', '', '背（平球）'][n] : v === 'high3' ? '3 號位（高球）' : ['', '4 號位（高球）', '快攻！', '2 號位', '後排中間', '老3（右邊後排）', '', '後排 5 號位'][n]}`, 1300); vmShout(['', '4 號！', '快！', '2 號！', '後排！', '老3！', '', '後排五！'][n]); return;
    }
  }
  const self = !!(walk.hold || skill.mode);   // 自己拋起來舉（練習）：球要飛一下才回來，窗口長一點
  if (walk.hold || skill.mode) {   // 手上的球：先往上拋一點再舉（自己練習）
    if (skill.mode) { skill.mode = null; $('wk-combo').hidden = true; }
    const [fx, fz] = vbFwd(); releaseBall(new THREE.Vector3(fx * 0.25, 3.4, fz * 0.25)); vbMine(balls[balls.length - 1]); balls[balls.length - 1].mineT = 0;
  }
  // 舉球要抓時機：按下（轉盤選定）後 0.5 秒內球要到額頭前上方才舉得出去；太早按＝落空，要再按一次
  walk.setQ = { n, v, menu, t0: performance.now(), prev: null, win: self ? 1600 : 500 }; pose = 'set'; hands.visible = true;
}
function vbSetStep() {
  if (walk.setAim) vbManualSetHud();
  const s = walk.setQ; if (!s) return;
  if (performance.now() - s.t0 > (s.win || 1600)) { walk.setQ = null; if (s.manual) vbManualSetCancel(); if (!walk.hold && !(walk.flash > 0)) { hands.visible = false; pose = 'hold'; } if (s.win < 1000) toast(s.manual ? '球還沒到：靠近球，再按住 Q／E 準備' : '舉早了：球還沒到（球快到額頭前上方才按）', 1300); return; }
  const cy = camera.position.y, R = VB_REACH.set * (VB.assist ? 1.2 : 1); let best = null;
  const costOf = (q) => { const dh = Math.hypot(q.x - walk.x, q.z - walk.z); return dh > R || q.y < cy - 0.6 || q.y > cy + 1.1 ? null : Math.abs(dh - 0.3) + Math.abs(q.y - (cy + 0.3)) * 0.5; };
  for (const b of balls) {
    if (b.rest > 0.3 || (b.mine && b.mineT && performance.now() - b.mineT < 400) || b.v.y > 2 || (VM.on && (b.floorHit || !vbOwnSide(b)))) continue;
    const cost = costOf(b.m.position); if (cost == null) continue;
    if (!best || cost < best.cost) best = { b, cost, cn: costOf(vbNext(b)) };
  }
  if (!best) { s.prev = null; return; }
  if ((s.prev != null && best.cost > s.prev + 1e-3) || best.cn == null || best.cn >= best.cost - 1e-4 || best.b.m.position.y < cy - 0.4) { walk.setQ = null; const sq = clamp(1 - best.cost / 1.1, 0, 1); if (s.manual) { vbManualSetCancel(); vbDoManualSet(best.b, s.manual, sq, best.b.m.position.y - cy); } else vbDoSet(best.b, s.n, sq, best.b.m.position.y - cy, s.v, s.menu); vbFx(best.b, sq); }
  else s.prev = best.cost;
}
// 三個攻擊點（球場座標）：前＝你面向的那一側（沿著網子）；面向網子正中間時，前＝左邊的 4 號位
// 攻擊點固定在球場上（面向網子時，左邊＝z 的 +sg 方向）：1＝4 號位（左前）、2＝快攻（中間）、3＝2 號位（右前）、4＝後排中間（離網 3.6 m）
// 飛行時間照舉球的人到攻擊點的距離算：快攻低而快、兩邊是高球
function vbSpot(ct, n, fromLx, fromLz, v = null) {
  const sg = Math.sign(ct.lx) || 1, sp = n === 2 && v === 'high3' ? { lx: sg * 1.0, lz: 0, y: 2.95 } : n === 2 ? { lx: sg * 0.7, lz: 0, y: 2.85 } : n === 1 ? { lx: sg * 1.0, lz: sg * 3.3, y: 2.95 } : n === 4 ? { lx: sg * 3.6, lz: 0, y: 3.0 } : n === 5 ? { lx: sg * 3.6, lz: -sg * 3.0, y: 3.0 } : n === 7 ? { lx: sg * 3.6, lz: sg * 3.0, y: 3.0 } : { lx: sg * 1.0, lz: -sg * 3.3, y: 2.95 };   // 7＝後排 5 號位（左邊後排，按 6）   // 5＝老3：右邊後排攻擊
  if(v === 'line3')sp.lx=sg*3;
  const d = Math.hypot(sp.lx - fromLx, sp.lz - fromLz);
  sp.T = n === 2 && v !== 'high3' ? clamp(0.22 + d * 0.05, 0.24, 0.4) : v === 'flat' ? clamp(0.58 + d * 0.05, 0.7, 0.95) : clamp(0.75 + d * 0.09, 0.95, 1.3);   // 快攻又低又快；平球（長攻、背）又平又快；高球最高點約 4～4.5 m
  return sp;
}
function vbSendSet(b, tx, tz, ty, T, n, who, cp, q = 0.9) {
  const p = cp || b.m.position.clone();
  b.spike = null;
  VB.setSpot = { x: tx, z: tz, until: performance.now() + (T / VB.ts) * 1000 + 1500, b }; b.setT = performance.now();
  vbLaunch(b, p, new THREE.Vector3((tx - p.x) / T, (ty - p.y) / T + 4.9 * T, (tz - p.z) / T), 'set', q, true);
  recHit({ x: p.x, y: p.y, z: p.z, v: b.v.length(), kind: 'set' });
  toast(b.thirdReturn ? '第三下：自動送回對面' : `${who}${['', '舉到 4 號位', '快攻（中間）', '舉到 2 號位', '舉到後排中間', '老3（右邊後排）', '3 號位高球', '後排 5 號位（左邊後排）'][n] || ''}：跑到黃圈、起跳、按左鍵`, 1800);
}
function vbDoSet(b, n, q = 0.9, hy = 0.3, v = null, menu = false) {
  const tutorialSet = { n, v: v || SET_DEF[n] || 'high', menu: !!menu, def: !v || v === SET_DEF[n] };
  const pep = vbPep(); b.setFault = null;
  if (pep && !menu) {   // 對碰：不管按 1～4，都舉給陪練（他會打你）
    const [hx, hz] = vbFwd(), hp = new THREE.Vector3(walk.x + hx * 0.28, camera.position.y + 0.3, walk.z + hz * 0.28), cp = b.m.position.clone().lerp(hp, 0.7), D = Math.hypot(pep.x - cp.x, pep.z - cp.z), T = clamp(0.9 + D * 0.1, 1.1, 1.6), e = (1 - q) * 1.6;
    const tx = pep.x + rkGauss() * e, tz = pep.z + rkGauss() * e;
    vbMine(b); pose = 'setPush'; hands.visible = true; walk.flash = 0.5; skill.dip = 0.05; b.spike = null; staPay('set');
    vbLaunch(b, cp, new THREE.Vector3((tx - cp.x) / T, (2.6 - cp.y) / T + 4.9 * T, (tz - cp.z) / T), 'set', q, true);
    tutEv('set', tutorialSet, b);
    recHit({ x: cp.x, y: cp.y, z: cp.z, v: b.v.length(), kind: 'set' }); toast('舉給陪練：他會打過來，準備接（V）', 1300); return;
  }
  const ct = vbCourt(); let tx, tz, ty = 2.95, T = 1.45;
  const [mlx, mlz] = VM.on ? vmL(walk.x, walk.z) : [0, 0];
  let mbq = null;   // 快攻：看快攻手在哪裡攻擊起跳（不是攔網）就舉到哪，4 m 內（含平拉）；連線的真人快攻手也算
  if (v !== 'wheelQuick' && VM.six && n === 2 && v !== 'high3') for (const id of VM.team[vmTeamOf(vmMe())]) {
    if (id === vmMe() || VM.role[id] !== 'MB' || !vm6Front(id)) continue;
    const a = VM.ai.get(id), p2 = a ? null : NET.peers.get(id), q = a ? { x: a.x, z: a.z } : vmPos(id);
    const air = a ? !a.blk && (a.y > 0.02 || a.vy > 0) : !!p2 && (p2.y || 0) > 0.3;
    if (q && air && Math.abs(q.x) < 2.4 && Math.hypot(q.x - mlx, q.z - mlz) < 4) { mbq = { x: q.x, z: q.z, team: vmTeamOf(vmMe()) }; break; }
  }
  if (mbq) { const sd = vmSide(mbq.team); [tx, tz] = vmW(sd * clamp(Math.abs(mbq.x) - 0.1, 0.7, 1.4), mbq.z); ty = 3.05; T = clamp(0.1 + Math.hypot(mbq.x - mlx, mbq.z - mlz) * 0.05, 0.15, 0.3); }   // 6 對 6 快攻：攔中已經跳起來了，又低又快直接送到他手上
  let who = '';
  if(v==='wheelQuick') {
    const team=VM.on ? vmTeamOf(vmMe()) : -1, full=VM.on && VM.team.every(ids=>ids.length===6);
    const ids=full ? VM.team[team].filter(id=>id!==vmMe() && vm6Front(id) && VM.role[id]!=='L') : [];
    const attackScore=id=>{const ai=VM.ai.get(id),peer=NET.peers?.get(id);if(ai?.blk || peer?.pose===9)return -100;return ((ai ? ai.y>0.02 || ai.vy>0 : (peer?.y||0)>.3)?10:0)+(VM.role[id]==='MB'?3:0);};
    ids.sort((a,b)=>attackScore(b)-attackScore(a));
    const id=ids.find(id=>attackScore(id)>-100 && vmPos(id)),target=id ? vmPos(id) : null;
    if(target){[tx,tz]=vmW(target.x,target.z);ty=3.05;T=clamp(.2+Math.hypot(target.x-mlx,target.z-mlz)*.045,.22,.55);mbq={id};}
    else{const [fx,fz]=vbFwd();tx=walk.x+fx*.28;tz=walk.z+fz*.28;ty=camera.position.y+.65;T=.3;}
    who=target?'跟隨攻擊手・':'額頭上方 A 快・';
  }
  else if (mbq) { /* 快攻已經處理 */ }
  else if (ct) {
    // 修正球：離網越遠越難舉準（品質打折、落點散），太遠就舉不了快攻
    const [lx, lz] = toLocalOf(ct.c, walk.x, walk.z), far = Math.max(0, Math.abs(lx) - 2.5);
    if (far > 0.5 && n === 2 && v !== 'high3') { n = 1; who = '離網太遠舉不了快攻，改'; } else if (far > 0.5) who = '修正球・';
    q *= 1 - clamp(far * 0.07, 0, 0.35);
    const sp = vbSpot(ct, n, lx, lz, v);
    if (v === 'flat') who += '平球・'; else if (v === 'high3') { who += ''; n = 6; const P3 = VM.host ? VM.poss[vmTeamOf(vmMe())] : null; if (P3) P3.td = true; }   // 6＝3 號位高球（提示文字）；AI 中間手打時間差
    [tx, tz] = toWorldOf(ct.c, sp.lx + (v==='line3'?0:rkGauss() * (1 - q) * 0.8), sp.lz + rkGauss() * (1 - q) * 1.4); T = sp.T + far * 0.05; ty = sp.y;
  } else { const [fx, fz] = vbFwd(), k = n === 1 ? 4 : n === 2 ? 1.2 : n === 4 ? -1.5 : -3; tx = walk.x + fx * k; tz = walk.z + fz * k; T = n === 2 ? 0.7 : 1.4; }
  const [hx, hz] = vbFwd(), hp = new THREE.Vector3(walk.x + hx * 0.28, camera.position.y + 0.3, walk.z + hz * 0.28), cp = b.m.position.clone().lerp(hp, 0.7);
  vbMine(b); pose = n === 3 ? 'setBack' : 'setPush'; hands.visible = true; walk.flash = 0.5; skill.dip = 0.05; staPay('set');
  if (ct && !menu) { const sg = Math.sign(ct.lx) || 1, [ax, az] = toWorldOf(ct.c, 0, 0), [bx, bz] = toWorldOf(ct.c, 0, sg); walk.turn = { yaw: Math.atan2(-(bx - ax), -(bz - az)), t: 0.4 }; }   // 面向 4 號位
  // 時機沒抓好（球離額頭前上方那個點太遠）：兩手沒同時碰到＝連擊（球會轉）；球太低、在手上停太久＝持球——比賽中會被吹
  const pf = clamp((0.5 - q) * 1.6, 0, 0.6) * (vbMyRole() === 'OPP' ? 0.3 : 1); b.setFault =   /* 舉對幫忙舉球：連擊、持球機率只剩三成 */ Math.random() < pf ? (hy < -0.3 ? 'held' : 'double') : null;
  vbSendSet(b, tx, tz, ty, T, n, who, cp, q);
  if (VM.on) { const sn = VM.setNo || 1, x = MREC.local.sets[sn] || (MREC.local.sets[sn] = { n: 0, f: 0 }); x.n++; if (b.setFault) x.f++; }   // WEB-010 戰績：這一局舉了幾球、有沒有連擊持球
  tutEv('set', { ...tutorialSet, n: n === 6 ? tutorialSet.n : n }, b);
  VB.setN = mbq ? 2 : n;   // 舉到哪個號位（決定誰打）
  if (b.setFault) toast(b.setFault === 'held' ? '持球！球太低、在手上停太久（比賽會被吹）' : '連擊！兩手沒同時碰到，球在轉（比賽會被吹）', 1800);
  vmOnTouch(b, vmMe(), 'set');
  if (VM.on && VM.host && VM.six) { const t = vmTeamOf(vmMe()), P2 = VM.poss[t], id = P2 && P2.stage === 2 ? (mbq?.id || vm6AttackerByCall(t, VB.setN, vmMe())) : null; if (id) P2.attacker = id; }   // 舉給誰就是誰打
}
// 別人舉過來的球：算出它經過 2.95 m 的地方，標成攻擊點
function vbMarkSet(b) { b.setT = performance.now(); const pr = vbPredict(b.m.position, b.v, 2.9); if (pr) VB.setSpot = { x: pr.x, z: pr.z, until: performance.now() + pr.t * 1000 + 1500, b }; }
// ---- 攔網（B 起跳）：手在網子上方往前伸，球穿過手的位置就攔下來；只擦到邊＝撐球，球留在自己這邊
// 攔網的雙手跟著滑鼠往左右移，但有速度上限（每秒 1.6 m）：一次跳起來大概只來得及往一邊移一次，不能左右來回掃
function vbBlockHands(dt) {
  if (!(walk.air && walk.air.block)) return;
  const d = (walk.blkAim || 0) - (walk.blkShift || 0), m = 1.6 * dt;
  walk.blkShift = (walk.blkShift || 0) + clamp(d, -m, m);
}
function vbBlockTest(b, h) {
  if (b.langzi && VM.on) return; /* WEB-022 裝飾球不觸發攔網。 */
  if (!walk.air || !walk.air.block || (b.mine && performance.now() - b.mineT < 300)) return;
  const ct = vbCourt(); if (!ct || Math.abs(ct.lx) > 1.3) return;
  const sg = Math.sign(ct.lx) || 1, p = b.m.position, [lx, lz] = toLocalOf(ct.c, p.x, p.z), [l0] = toLocalOf(ct.c, p.x - b.v.x * h, p.z - b.v.z * h), plane = sg * 0.12;
  if (!((l0 - plane) * (lx - plane) <= 0 && (lx - l0) * sg > 0)) return;
  const sh = walk.blkShift || 0, [, hz] = toLocalOf(ct.c, walk.x + Math.cos(walk.yaw) * sh, walk.z - Math.sin(walk.yaw) * sh), off = Math.abs(lz - hz), cy = camera.position.y;   // 雙手的中心：跟著滑鼠往左右移
  const top = cy + 0.95, netH = NETS[state.net].h;
  if (off > 0.62 + BALL_R || p.y > top + BALL_R || p.y < cy + 0.2) return;   // 從手上面過去＝被打過手（攻擊手跳得比你高、或你跳早跳晚了）
  const r = (ct.c.rot * Math.PI) / 180, pow = clamp((b.v.length() - 8) / 18, 0, 1), low = clamp((top - p.y) / Math.max(0.3, top - netH), 0, 1);
  const kind = vbBlockOutcome(off * 1.2, low, pow, 0.8);   // 你的手寬 0.62 m：換算成 0.75 m 的比例
  const word = vbBlockApply(b, kind, lx, lz, hz, plane, sg, Math.sin(r), Math.cos(r), Math.cos(r), -Math.sin(r), pow);
  tutEv('block', { kind, aim: walk.blkAim || 0, mate: TUT_COACH.together() }, b);
  vbFx(b, kind === 'stuff' ? 1 : 0.7); vbImpact(b, 'block', kind === 'stuff' ? 1 : 0.7); vbBlockFx(p.clone(), word === '碰手了！' ? 'touch' : BLK_FX[kind]);
  toast({ stuff: '攔網成功！🧱', soft: '撐到球了（球留在你這邊，快接起來）', through: '被打穿了', top: '球擦過指尖彈大了' }[kind] || (word === '打手出界！' ? '被打手出界了' : '碰到手了（球留在你這邊）'), 1500);
  b.spike = null; vbMine(b);
  if (NET.on) netBallHit(b, 'block');
  vmOnTouch(b, vmMe(), 'block');
  recHit({ x: p.x, y: p.y, z: p.z, v: b.v.length(), kind: 'block' });
}
// ---- 接球微輔助：球會落在你這邊、3.5 m 以內時，身體輕輕被帶到落點後面（球在身體前方）
// WEB-023：別人（真人、加入者看到的 AI）的球鞋聲——照畫面上的移動判斷急停、急轉、起跑，規則跟本機 AI 一樣，不送任何訊息
function sqFromMotion(o, x, z, y, dt) {
  const S = o._sq || (o._sq = { x, z, vx: 0, vz: 0, pvx: 0, pvz: 0, t: 0 }), d = Math.max(dt, 1e-3);
  const jump = Math.hypot(x - S.x, z - S.z) > 1.5;   /* 瞬移（剛進來、校正跳很遠）不算 */
  const kv = Math.min(1, dt * 12), vx = jump ? 0 : (x - S.x) / d, vz = jump ? 0 : (z - S.z) / d;
  S.vx += (vx - S.vx) * kv; S.vz += (vz - S.vz) * kv; S.x = x; S.z = z;
  const ps = Math.hypot(S.pvx, S.pvz), cs = Math.hypot(S.vx, S.vz), cosA = ps > 0.1 && cs > 0.1 ? (S.pvx * S.vx + S.pvz * S.vz) / (ps * cs) : 1, now = performance.now();
  if (!jump && (y || 0) <= 0.02 && ((ps > 2 && (cs < ps * 0.55 || cosA < 0.6)) || (ps < 1 && cs > 3.2)) && now - S.t > 500) { S.t = now; sfx('squeak', 0.6 + fxRandom() * 0.3, new THREE.Vector3(x, 0.05, z)); }
  const kf = Math.min(1, dt * 4); S.pvx += (S.vx - S.pvx) * kf; S.pvz += (S.vz - S.pvz) * kf;
}
// WEB-023：別人負責的球在我這邊先落地 → 停在落點等他回報（收到就照回報走；0.5 秒沒回報就照我這邊的結果彈起來）。回傳 true＝這一格還在等
function ballWaitFloor(b) {
  if (b.floorReport || !b.room || NET.ownBall || performance.now() - b.waitFloor.t > 500) {
    if (!b.floorReport && b.room && !NET.ownBall) { const v0 = b.waitFloor.v; b.v.set(v0.x * 0.88, Math.max(0, -v0.y * 0.62), v0.z * 0.88); if (b.v.y < 0.5) b.v.y = 0; }
    b.waitFloor = null; return false;
  }
  return true;
}
// WEB-023：球正在被網路校正時（b.err 還沒拉完），預測要用「拉完之後」的位置，不然落點會跳、提示一下有一下沒有
function vbTruePos(b) { return b.err ? b.m.position.clone().add(b.err) : b.m.position; }
function vbAssist(inputMag) {
  VB.target = null;
  if (TUT_COACH.drill || TUT_COACH.id === 'block' || (TUT_COACH.id === 'recv' && TUT_COACH.index === 0)) return null;   // 專項要自行判讀球路與移位
  if (walk.air || walk.hold || walk.sit) return null;
  const ct = vbCourt(); if (!ct) return null;
  const sg = Math.sign(ct.lx) || 1; let best = null;
  for (const b of balls) {
    if (b.rest > 0.3 || b.mine || (b.setT && performance.now() - b.setT < 4000)) continue;
    const bp = vbTruePos(b), keep = VB.target && VB.target.b === b, [cl] = toLocalOf(ct.c, bp.x, bp.z); if (Math.sign(cl) !== sg) b.oppT = performance.now();   /* keep：已經在提示的球，門檻放寬一點才消失（不會在邊界閃） */
    if (performance.now() - (b.oppT || 0) > (keep ? 3500 : 2500)) continue;
    const pr = vbPredict(bp, b.v, 0.8); if (!pr || pr.t > (keep ? 4.2 : 3.5)) continue;
    const [lx] = toLocalOf(ct.c, pr.x, pr.z); if (Math.sign(lx) !== sg) continue;
    const d = Math.hypot(pr.x - walk.x, pr.z - walk.z); if (d > (keep ? 4.3 : 3.5)) continue;
    if (!best || pr.t < best.t) best = { ...pr, b, fast: b.v.length() > 14 };
  }
  VB.target = best;
  if (!best || !VB.assist) return null;
  const [fx, fz] = vbFwd(), sx = best.x - fx * 0.45, sz = best.z - fz * 0.45, dx = sx - walk.x, dz = sz - walk.z, d = Math.hypot(dx, dz);
  if (d < 0.08) return null;
  const sp = Math.min(1.3, d * 3) * (inputMag > 0.01 ? 0.5 : 1);
  return [(dx / d) * sp, (dz / d) * sp];
}
// ---- 視角輔助：球朝你來時鏡頭輕輕轉向球；等舉球時只幫你抬頭看球，左右留給你瞄準；剛動過滑鼠就不幫
function vbCamAssist(dt) {
  if (SETM.m || walk.setAim || walk.setQ?.manual) return;
  if (!VBSettings.values.cameraAssist) return;
  if (performance.now() - (walk.lookT || 0) < 700 || walk.air || SETM.m || walk.recv || walk.swing || walk.charge || performance.now() < (walk.contactUntil || 0)) return;
  if (balls.some(b => b.rest < 0.3 && Math.hypot(b.m.position.x - walk.x, b.m.position.z - walk.z) < 1.5)) return;
  let p = null, yawOk = true;
  const P0 = VM.on && VM.host ? VM.poss[0] : null, setting = walk.setQ || (P0 && P0.setter === vmMe() && P0.stage === 1);
  if (setting) { let best = null; for (const b of balls) { if (b.rest > 0.3 || b.mine) continue; const d = Math.hypot(b.m.position.x - walk.x, b.m.position.z - walk.z); if (d < 8 && (!best || d < best.d)) best = { b, d }; } if (best) p = best.b.m.position; }
  if (!p && VB.target && !walk.recv) p = VB.target.b.m.position;
  if (!p && !walk.hold && !skill.mode && !walk.sit) {
    let best = null; const cand = VM.on && VM.ball && balls.includes(VM.ball) ? [VM.ball] : balls;
    for (const b of cand) { if (b.rest > 0.2 || b.v.lengthSq() < 0.25) continue; const d = Math.hypot(b.m.position.x - walk.x, b.m.position.z - walk.z); if (d < 18 && (!best || d < best.d)) best = { b, d }; }
    if (best) {
      const q = best.b.m.position, ddx = q.x - walk.x, ddz = q.z - walk.z, kk = Math.min(1, dt * 2.5);
      let dy = Math.atan2(-ddx, -ddz) - walk.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      walk.yaw += Math.sign(dy) * Math.max(0, Math.abs(dy) - 0.35) * kk;
      const dp = clamp(Math.atan2(q.y - camera.position.y, Math.max(0.6, Math.hypot(ddx, ddz))), -0.8, 0.9) - walk.pitch;
      walk.pitch += Math.sign(dp) * Math.max(0, Math.abs(dp) - 0.28) * kk;
    }
  }
  else if (VB.setSpot && performance.now() < VB.setSpot.until && balls.includes(VB.setSpot.b) && Math.hypot(VB.setSpot.x - walk.x, VB.setSpot.z - walk.z) < 6) { p = VB.setSpot.b.m.position; yawOk = false; }
  if (!p) return;
  const dx = p.x - walk.x, dz = p.z - walk.z, dh = Math.hypot(dx, dz), k = 1 - Math.exp(-dt * (setting ? 4.5 : 2.2));
  if (yawOk && dh > 0.6) { let d = Math.atan2(-dx, -dz) - walk.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); walk.yaw += d * k * 0.7; }
  walk.pitch += (clamp(Math.atan2(p.y - camera.position.y, Math.max(0.6, dh)), -0.8, 0.9) - walk.pitch) * k * 0.6;
}
// ---- 陪練舉球員：站在網前舉球區；球飛到他附近就跑過去舉，攻擊點挑離你最近的（前舉、快攻、後舉）
// 陪練有兩種：set＝站網前舉球給你攻擊；pepper＝跟你對碰（你拋→他墊給你→你舉他就打你、你扣他就接起來給你、你墊給他就舉給你）
function vbNpcToggle(mode) {
  if (VB.npc) { const was = VB.npc.mode; scene.remove(VB.npc.av.g); VB.npc.tag.element.remove(); VB.npc = null; if (!mode || mode === was) { toast('陪練收工了'); renderUseBar(state.items.find((i) => i.id === $('wk-use').dataset.id)); return; } }
  mode = mode || 'set';
  const ct = vbCourt(); if (!ct) { toast('站到排球場上再叫陪練'); return; }
  const sg = Math.sign(ct.lx) || 1, npcCh = vmPickChar(new Set([myChar()])), av = makeAvatar('#30A46C', npcCh);
  let home = toWorldOf(ct.c, sg * 1.1, -sg * 2.3);
  if (mode === 'pepper') {   // 站在你面前 5 m；前面是網子就改站在你旁邊（沿著網子的方向），都在你這半場
    const [fx, fz] = vbFwd(), [hlx, hlz] = toLocalOf(ct.c, walk.x + fx * 5, walk.z + fz * 5);
    if (Math.sign(hlx) === sg && Math.abs(hlx) > 1.5 && Math.abs(hlx) < 8.5 && Math.abs(hlz) < 4.2) home = [walk.x + fx * 5, walk.z + fz * 5];
    else { const lz = ct.lz < 0 ? Math.min(4, ct.lz + 5) : Math.max(-4, ct.lz - 5); home = toWorldOf(ct.c, sg * clamp(Math.abs(ct.lx), 2.5, 7.5), lz); }
  }
  const el = document.createElement('div'); el.className = 'mp-tag'; el.textContent = mode === 'pepper' ? '陪練對碰' : '陪練舉球'; const tag = new CSS2DObject(el); tag.position.set(0, 2.05, 0); av.g.add(tag); scene.add(av.g);
  VB.npc = { mode, av, tag, ch: npcCh, c: ct.c, sg, x: home[0], z: home[1], home, vx: 0, vz: 0, up: 0, n: 0 };
  if (mode === 'pepper') { const ax = home[0] - walk.x, az = home[1] - walk.z; walk.turn = { yaw: Math.atan2(-ax, -az), t: 0.4 }; }
  toast(mode === 'pepper' ? '對碰：拿球面向他按 F 拋給他 → 他墊給你；你舉給他（1）他就打你、你扣他（左鍵）他就接起來給你、你墊給他（V）他就舉給你' : '陪練來了：把球拋給他（F）或接到網前（V），他會舉給你。你站左邊就前舉、靠近他就快攻、站右邊就後舉', 6000);
}
function vbPep() { return VB.npc && VB.npc.mode === 'pepper' && !VM.on ? VB.npc : null; }
function vbNpcStep(dt) {
  const n = VB.npc; if (!n) return;
  if (!state.items.some((i) => i.id === n.c.id)) { vbNpcToggle(); return; }
  if (n.mode === 'pepper') { vbPepStep(n, dt); return; }
  let tgt = null;
  for (const b of balls) {
    if (b.rest > 0.3 || (b.npcT && performance.now() - b.npcT < 700)) continue;
    const pr = vbPredict(b.m.position, b.v, 2.1); if (!pr) continue;
    const [lx] = toLocalOf(n.c, pr.x, pr.z); if (Math.sign(lx) !== n.sg || Math.abs(lx) > 4.5 || Math.hypot(pr.x - n.home[0], pr.z - n.home[1]) > 5.5) continue;
    tgt = { b, ...pr }; break;
  }
  const gx = tgt ? tgt.x : n.home[0], gz = tgt ? tgt.z : n.home[1], dx = gx - n.x, dz = gz - n.z, d = Math.hypot(dx, dz), sp = d > 0.05 ? Math.min(4.2, d * 5) : 0;
  const kk = 1 - Math.exp(-dt * 10); n.vx += ((d > 0.05 ? dx / d : 0) * sp - n.vx) * kk; n.vz += ((d > 0.05 ? dz / d : 0) * sp - n.vz) * kk;
  n.x += n.vx * dt; n.z += n.vz * dt;
  if (tgt) { const p = tgt.b.m.position; if (Math.hypot(p.x - n.x, p.z - n.z) < 0.9 && p.y < 2.5 && p.y > 1.5 && tgt.b.v.y < 0) vbNpcSet(tgt.b); }
  // 動作：跑步擺腿、面向網子；球來了兩手舉高
  const av = n.av, k = 1 - Math.exp(-dt * 12), spd = Math.hypot(n.vx, n.vz);
  av.g.position.set(n.x, 0, n.z); let ry = Math.atan2(walk.x - n.x, walk.z - n.z);
  if (tgt) ry = Math.atan2(tgt.b.m.position.x - n.x, tgt.b.m.position.z - n.z);
  let dr = ry - av.g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); av.g.rotation.y += dr * Math.min(1, dt * 8);
  av.phase += dt * Math.min(12, spd * 5.5);
  n.up = Math.max(0, n.up - dt);
  avDrive(av, n.up > 0 ? AVP.setPush : tgt ? AVP.setReady : AVP.idle, k, spd);
}
// 對碰的陪練：看你上一下怎麼碰的決定他怎麼回——你扣／打他→他防守接起來給你；你舉給他→他站著下手打你；你墊／拋給他→拋的墊給你、墊的舉給你
const PEP = {
  dig: { h: 0.75, R: 1.15, pose: 'bumpHit', kind: 'bump' }, bump: { h: 0.85, R: 0.95, pose: 'bumpHit', kind: 'bump' },
  set: { h: 2.25, R: 0.85, pose: 'setPush', kind: 'set' }, hit: { h: 2.5, R: 0.95, pose: 'spikeHit', kind: 'hit' },
};
function vbPepAct(b) { const k = b.lk; return k === 'spike' || k === 'hit' || k === 'tip' ? 'dig' : k === 'set' ? 'hit' : k === 'bump' ? 'set' : 'bump'; }
function vbPepStep(n, dt) {
  const av = n.av, now = performance.now(); let tgt = null;
  for (const b of balls) {
    if (b.rest > 0.3 || b.lkNpc || (b.npcT && now - b.npcT < 600)) continue;
    const act = vbPepAct(b), A = PEP[act], pr = vbPredict(b.m.position, b.v, A.h) || vbPredict(b.m.position, b.v, 0.3); if (!pr) continue;
    if (Math.hypot(pr.x - n.home[0], pr.z - n.home[1]) > 4.5 || Math.hypot(pr.x - walk.x, pr.z - walk.z) < 1.2) continue;   // 落在你自己旁邊的（自己拋起來舉）不搶
    tgt = { b, act, A, ...pr }; break;
  }
  // 撲救：防守的球太遠、快來了（0.4 秒內）就往落點撲出去
  if (tgt && tgt.act === 'dig' && !n.dive && tgt.t < 0.42 && Math.hypot(tgt.x - n.x, tgt.z - n.z) > 1.3) { const dx = tgt.x - n.x, dz = tgt.z - n.z, d = Math.hypot(dx, dz); n.dive = { t: 0, vx: (dx / d) * Math.min(7, d / 0.32), vz: (dz / d) * Math.min(7, d / 0.32) }; }
  if (n.dive) {
    n.dive.t += dt; const f = Math.max(0, 1 - n.dive.t / 0.45); n.x += n.dive.vx * f * dt; n.z += n.dive.vz * f * dt; n.vx = n.vz = 0;
    if (n.dive.t > 1.1) n.dive = null;
  } else {
    const gx = tgt ? tgt.x : n.home[0], gz = tgt ? tgt.z : n.home[1], dx = gx - n.x, dz = gz - n.z, d = Math.hypot(dx, dz), sp = d > 0.05 ? Math.min(5, d * 5) : 0;
    const kk = 1 - Math.exp(-dt * 7); n.vx += ((d > 0.05 ? dx / d : 0) * sp - n.vx) * kk; n.vz += ((d > 0.05 ? dz / d : 0) * sp - n.vz) * kk;
    n.x += n.vx * dt; n.z += n.vz * dt;
  }
  if (tgt) {
    const A = n.dive ? { ...tgt.A, h: 0.35, R: 1.7 } : tgt.A, C = new THREE.Vector3(n.x, A.h, n.z), d = tgt.b.m.position.distanceTo(C), dn = vbNext(tgt.b).distanceTo(C);
    if (d < A.R && dn >= d - 1e-4 && (!n.dive || n.dive.t > 0.12)) vbPepHit(n, tgt.b, tgt.act, C);
  }
  // 動作：面向球（沒有球就面向你）；撲出去整個人往前倒；碰球那一下照動作做
  const k = 1 - Math.exp(-dt * 12), spd = Math.hypot(n.vx, n.vz), fb = tgt ? tgt.b.m.position : null;
  av.g.position.set(n.x, 0, n.z); av.g.rotation.order = 'YXZ';
  let ry = fb ? Math.atan2(fb.x - n.x, fb.z - n.z) : Math.atan2(walk.x - n.x, walk.z - n.z); if (n.dive) ry = av.g.rotation.y;
  let dr = ry - av.g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); av.g.rotation.y += dr * Math.min(1, dt * 9);
  const ddir = n.dive ? Math.atan2(n.dive.vx, n.dive.vz) - av.g.rotation.y : 0; av.fall = n.dive && n.dive.t > 0.05 && n.dive.t < 0.8 ? { a: 1, d: ddir, t: n.dive.t } : null;
  av.phase += dt * Math.min(12, spd * 5.5); n.up = Math.max(0, n.up - dt);
  const P = n.dive ? (n.dive.t > 0.8 ? avMix(avDivePose(ddir, true), AVP.ready, (n.dive.t - 0.8) / 0.3) : avDivePose(ddir, n.dive.t > 0.45)) : n.up > 0 && n.upPose !== 'dive' ? AVP[n.upPose] : tgt ? (tgt.act === 'set' ? AVP.setReady : tgt.act === 'hit' ? AVP.airUp : AVP.ready) : AVP.idle;
  avDrive(av, P, n.up > 0 || n.dive ? 0.5 : k, spd);
}
function vbPepHit(n, b, act, C) {
  const p = b.m.position.clone(), cp = p.clone().lerp(C, 0.4), D = Math.hypot(walk.x - cp.x, walk.z - cp.z), g = () => rkGauss() * 0.25;
  let v;
  if (act === 'hit') {   // 站著下手打你：平平的往你腰的高度打（防守得到的速度）
    const T = D / 10.5, tx = walk.x + g(), tz = walk.z + g(); v = new THREE.Vector3((tx - cp.x) / T, (0.85 - cp.y) / T + 4.9 * T, (tz - cp.z) / T);
  } else if (act === 'set') {   // 舉給你：高球掉在你前面一點、2.9 m 高（跳起來剛好扣）
    const hx = (cp.x - walk.x) / (D || 1), hz = (cp.z - walk.z) / (D || 1), tx = walk.x + hx * 0.6 + g(), tz = walk.z + hz * 0.6 + g(), T = clamp(0.9 + D * 0.1, 1.15, 1.6);
    v = new THREE.Vector3((tx - cp.x) / T, (2.9 - cp.y) / T + 4.9 * T, (tz - cp.z) / T);
  } else {   // 墊／防守：高高的回到你頭上（舉或墊都可以）
    const e = act === 'dig' ? 0.45 : 0.25, tx = walk.x + rkGauss() * e, tz = walk.z + rkGauss() * e, T = clamp(1.0 + D * 0.11, 1.3, 1.8);
    v = new THREE.Vector3((tx - cp.x) / T, (2.1 - cp.y) / T + 4.9 * T, (tz - cp.z) / T);
  }
  b.npcT = performance.now(); b.mine = false; b.spike = null;
  vbLaunch(b, cp, v, PEP[act].kind, 0.92); b.lkNpc = true;
  if (act === 'set') vbMarkSet(b);
  n.up = act === 'hit' ? 0.45 : 0.4; n.upPose = n.dive ? 'dive' : PEP[act].pose; n.n++;
  recHit({ x: cp.x, y: cp.y, z: cp.z, v: v.length(), kind: PEP[act].kind });
  const say = { dig: '陪練：防起來了！', bump: '陪練墊給你', set: '陪練舉給你：起跳扣他（左鍵）', hit: '陪練打過來了：接起來（V）' }[act];
  toast(`${say}（第 ${n.n} 下）`, 1300);
}
function vbNpcSet(b) {
  const n = VB.npc, [nlx, nlz] = toLocalOf(n.c, n.x, n.z), [plx, plz] = toLocalOf(n.c, walk.x, walk.z);
  const opts = [1, 2, 3].map((k) => ({ k, ...vbSpot({ lx: n.sg }, k, nlx, nlz) })).map((o) => ({ ...o, d: Math.abs(o.lz - plz) + (Math.sign(plx) !== n.sg ? 9 : 0) }));
  const o = opts.sort((a, c) => a.d - c.d)[0], [tx, tz] = toWorldOf(n.c, o.lx, o.lz);
  b.npcT = performance.now(); b.mine = false; n.up = 0.5;
  vbSendSet(b, tx, tz, o.y, o.T, o.k, '陪練', b.m.position.clone().lerp(new THREE.Vector3(n.x, 2.35, n.z), 0.7));
}
// 先把「平常藏著、比賽中才出現」的東西編譯好（圈圈、球發亮）：不然第一次舉球時黃圈、發亮的球才編譯光影程式，畫面會卡一下
function vbWarmShaders() {
  const rings = [VB.ringLand, VB.ringSet, VB.ringPass], tmp = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 12, 8), ballHot);
  tmp.position.copy(camera.position).add(new THREE.Vector3(0, -0.5, -2)); scene.add(tmp); rings.forEach((m) => { m.visible = true; });
  try { renderer.compile(scene, camera); } catch { /* 編譯失敗就照舊：第一次出現時再編譯 */ }
  rings.forEach((m) => { m.visible = false; }); scene.remove(tmp); tmp.geometry.dispose();
}
// ---- 地上的圈：紅／白＝球會掉在你附近（紅＝重扣），黃＝攻擊點（舉過來的球會經過那裡），藍＝你是舉球員：隊友接起來的球到舉球高度的地方
function vbRings() {
  const mk = (a, b2, col) => { const m = new THREE.Mesh(new THREE.RingGeometry(a, b2, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return m; };
  if (!VB.ringLand) { VB.ringLand = mk(0.28, 0.36, '#FFFFFF'); VB.ringSet = mk(0.42, 0.52, '#F2B705'); VB.ringPass = mk(0.36, 0.46, '#3E9BFF'); vbWarmShaders(); }
  const pr0 = vmPassRing(); VB.ringPass.visible = !!pr0; if (pr0) VB.ringPass.position.set(pr0.x, 0.02, pr0.z);
  const t = VB.target; VB.ringLand.visible = !!t && VBSettings.values.landing;
  if (t) { const pr = vbPredict(vbTruePos(t.b), t.b.v, BALL_R) || t; VB.ringLand.position.set(pr.x, 0.02, pr.z); VB.ringLand.material.color.set(t.fast ? '#E5484D' : '#FFFFFF'); }
  const s = VB.setSpot, on = !!(s && performance.now() < s.until && balls.includes(s.b));
  VB.ringSet.visible = on; if (on) { VB.ringSet.position.set(s.x, 0.02, s.z); VB.ringSet.scale.setScalar(1 + Math.sin(performance.now() / 150) * 0.07); }
}
function vbCue() {
  let cue = null; const touch = coarse();
  // 起跳：舉過來的球，算它掉到 2.9 m 還要多久；跟你起跳到最高點的時間差不多時提示「跳！」
  const sp = VB.setSpot, sb = sp && performance.now() < sp.until && balls.includes(sp.b) ? sp.b : null;
  if (!walk.air && sb && Math.hypot(sp.x - walk.x, sp.z - walk.z) < 4.5) {
    const hk = vbHangK(), hv = walk.vel || [0, 0], vy = vbJumpVy(Math.hypot(hv[0], hv[1])) * Math.sqrt(hk), tApex = vy / (JUMP_G * hk), hand = EYE + 0.75 + (vy * vy) / (2 * JUMP_G * hk) - 0.15;
    const pr = vbPredict(sb.m.position, sb.v, hand) || vbPredict(sb.m.position, sb.v, 2.9);
    if (pr) { const d = pr.t - tApex; if (d < 0.14 && d > -0.12) cue = ['jump', touch ? '跳！' : '跳！（空白鍵）']; else if (d >= 0.14 && d < 0.9) cue = ['ready', '準備起跳…']; }
  }
  // 揮臂：在空中、球進到手邊（還沒揮）就提示，球也會發亮
  let glow = null;
  if (walk.air && !walk.air.block && !(walk.swing && walk.swing.done)) {
    const H = vbHand(); for (const b of balls) if (b.rest < 0.3 && b.m.position.distanceTo(H) < VB_REACH.atk * 1.05) { glow = b; cue = ['hit', touch ? '攻擊！' : '攻擊！（左鍵）']; break; }
  }
  if (VB.glow && VB.glow !== glow) VB.glow.m.material = ballMat;
  if (glow) glow.m.material = ballHot; VB.glow = glow;
  // 舉球：球快（0.45 秒內）掉到你額頭前上方、在你 1 m 內：現在按舉球鍵（或在轉盤選球路）剛好
  if (!cue && !walk.air && !walk.hold && !walk.setQ && (VM.on || VB.npc)) {
    const cy = camera.position.y;
    for (const b of balls) { if (b.rest > 0.3 || b.mine || b.v.y > 2) continue; const pr = vbPredict(b.m.position, b.v, cy + 0.3); if (pr && pr.t < 0.45 && Math.hypot(pr.x - walk.x, pr.z - walk.z) < 1.0) { cue = ['set', touch ? '舉球！' : '舉球！（Q／E＋左鍵）']; break; } }
  }
  // 攔網：你在網前、對面有人起跳攻擊、在你左右 2.2 m 內
  if (!cue && !walk.air && VM.on) {
    const ct = vbCourt();
    if (ct && Math.abs(ct.lx) < 1.6) for (const a of VM.ai.values()) {
      if (a.team === vmTeamOf(vmMe()) || a.y < 0.05) continue;
      const [, alz] = VM.host ? [a.x, a.z] : vmL(a.wx ?? 0, a.wz ?? 0); if (Math.abs(alz - ct.lz) < 2.2) { cue = ['block', touch ? '攔網！' : '攔網！（B）']; break; }
    }
  }
  const kc = vbKeyCue(cue, touch), el = $('vb-cue');
  if (cue && kc && cue[0] !== 'ready') cue[1] = cue[1].replace(/（.*?）/, '');   // 右邊已經有大按鍵提示，中間只留「跳！」這種時機字
  if (cue && !touch) cue[1] = cue[1].replaceAll('空白鍵', VBSettings.keyName(VBSettings.values.keys[' '])).replaceAll('（B）', '（' + VBSettings.keyName(VBSettings.values.keys.b) + '）');
  if (!cue) { el.hidden = true; } else { el.hidden = false; el.dataset.k = cue[0]; if (el.textContent !== cue[1]) el.textContent = cue[1]; }
  if (VB.ringSet) VB.ringSet.material.color.set(cue && cue[0] === 'jump' ? '#30A46C' : '#F2B705');
}
// ---- WEB-010 比賽紀錄：開房比賽（練習不算）結束時，每個真人把自己的結果記進帳號
//   房主統計每個人的扣球／攔網／發球得分、失誤、一球內攔網次數；自己的完美接球、舉球次數和連擊持球在自己的遊戲裡算
const MREC = { id: '', t0: 0, pf: {}, blkR: {}, last: null, cbF: [false, false], cb: [0, 0], local: { p: 0, sets: {} } };   // cbF／cb＝絕處逢生：這局有沒有落後到對方局末點、我方 to−5 以下；逆轉拿下幾局
function mrecReset(id) { Object.assign(MREC, { id: id || '', t0: Date.now(), pf: {}, roleTime: {}, roleSnapshot: {}, roleAt: null, tp: [0, 0], blkR: {}, last: null, save: null, cbF: [false, false], cb: [0, 0], local: { p: 0, sets: {} } }); }
// WEB-014：房主累計各位置時間，平手保留先擔任的位置。
function mrecRoles() {
  if (!MREC.id || !VM.host || !VM.six || VM.team?.[0]?.length !== 6) return;
  const now = performance.now();
  if (MREC.roleAt !== null) for (const [id, role] of Object.entries(MREC.roleSnapshot)) {
    if (!['OH', 'S', 'MB', 'OPP'].includes(role)) continue;
    const times = MREC.roleTime[id] || (MREC.roleTime[id] = {});
    times[role] = (times[role] || 0) + Math.max(0, now - MREC.roleAt);
  }
  MREC.roleSnapshot = { ...VM.role }; MREC.roleAt = now;
}
function mrecLongestRoles() {
  mrecRoles();
  const roles = {};
  for (const [id, times] of Object.entries(MREC.roleTime)) {
    roles[id] = Object.keys(times).reduce((best, role) => times[role] > times[best] ? role : best);
  }
  return roles;
}
const mrecPf = (id) => MREC.pf[id] || (MREC.pf[id] = { k: 0, kc: 0, b: 0, a: 0, e: 0, kl: 0, ks: 0, fs: 0, md: 0, qk: 0, ss: 0, as: 0, t: 0, sp: 0, sv: 0, rc: 0, st: 0, bt: 0, eb: 0, es: 0, wall: false });   // es 發球失誤、t 觸球、sp 攻擊、sv 發球、rc 接球、st 舉球、bt 攔網碰球、eb 接球失誤   // as＝舉球助攻（舉出去、攻擊手得分）   // ss＝第二下自己扣球得分   // fs＝救回場外球、md＝二次進攻吊球得分   // kl＝直線得分、ks＝扣進三米線內得分
function vmPerfTouch(id, kind, b) {   // 房主：每次有效觸球
  if (!MREC.id) return;
  const prev = MREC.last, team = vmTeamOf(id), P = mrecPf(id);
  P.t++; if (['spike', 'tip', 'hit'].includes(kind)) P.sp++; else if (kind === 'serve') P.sv++; else if (kind === 'bump') P.rc++; else if (kind === 'set') P.st++; else if (kind === 'block') P.bt++;
  if (MREC.save && MREC.save.id !== id) mrecPf(MREC.save.id).fs++;   // 救起來的球有人再碰到＝救球成功
  MREC.save = null;
  MREC.last = { id, kind, team, role: VM.six ? VM.role?.[id] : null, t: performance.now() };
  if (kind === 'spike' && prev && prev.kind === 'set' && prev.team === team && MREC.last.t - prev.t < 700) MREC.last.quick = true;
  if ((kind === 'spike' || kind === 'tip') && prev && prev.kind === 'set' && prev.team === team && prev.id !== id) MREC.last.setBy = prev.id;   // 這球是誰舉的（請享用吧！）   // 快攻：舉球到扣球不到 0.7 秒
  if (kind === 'tip' && VM.touch && VM.touch.team === team && VM.touch.n === 1) MREC.last.dump = true;   // 第二下就吊過去＝二次進攻
  if (kind === 'spike' && VM.touch && VM.touch.team === team && VM.touch.n === 1) MREC.last.self = true;   // 第二下就自己扣＝我自己來好了
  // 救回場外球：球在場外 2 m 以外，而且是被打飛出去的（前一下是自己隊碰的，或攔網碰出來的 touch out）
  if (b && VM.c && ['bump', 'set', 'hit'].includes(kind) && prev && (prev.team === team || prev.kind === 'block')) { const B = vmBallL(b); if (Math.abs(B.x) > 11 || Math.abs(B.z) > 6.5) MREC.save = { id, team }; }
  if (kind === 'spike') { const q = vmPos(id); MREC.last.az = q ? q.z : null; }   // 扣球時攻擊手站的左右位置（判斷直線）
  if (kind === 'block') { MREC.blkR[id] = (MREC.blkR[id] || 0) + 1; if (MREC.blkR[id] >= 10) mrecPf(id).wall = true;   /* 禁止通行：同一球內攔網碰到 10 次 */ }
}
function vmPerfPoint(win) {   // 房主：得分歸給誰（最後碰球的人）；順便記絕處逢生
  const L = MREC.last; MREC.blkR = {}; MREC.last = null;
  if (MREC.save) { if (win === MREC.save.team) mrecPf(MREC.save.id).fs++; MREC.save = null; }   // 救起來後直接得分也算；救起來直接失分不算
  if (MREC.id) {   // 絕處逢生：對方到局末點（例：24）、我方還在 to−5 以下（例：20），最後這局是我方拿下
    const sc = [VM.sc[0] + (win === 0 ? 1 : 0), VM.sc[1] + (win === 1 ? 1 : 0)], deciding = VM.six && VM.bestOf > 1 && (VM.sets?.[0] || 0) + (VM.sets?.[1] || 0) === VM.bestOf - 1, to = deciding ? 15 : VM.to;
    for (const t of [0, 1]) for (const now of [VM.sc, sc]) if (now[1 - t] >= to - 1 && now[t] <= to - 5) MREC.cbF[t] = true;   /* 得分前、後的比分都看（例：20:24 這一刻） */
    if (Math.max(...sc) >= to && Math.abs(sc[0] - sc[1]) >= 2) { const w = sc[0] > sc[1] ? 0 : 1; if (MREC.cbF[w]) MREC.cb[w]++; MREC.cbF = [false, false]; }
  }
  if (MREC.id) MREC.tp[win] = (MREC.tp[win] || 0) + 1;
  if (!MREC.id || !L || L.team < 0) return;
  if (L.team === win) {
    if (L.kind === 'serve') mrecPf(L.id).a++; else if (L.kind === 'block') mrecPf(L.id).b++; else if (['spike', 'tip', 'hit'].includes(L.kind)) mrecPf(L.id).k++;
    if (L.kind === 'spike' && !L.quick && !L.self && L.role === 'OH') mrecPf(L.id).kc++;
    if (L.dump) mrecPf(L.id).md++;   // 二次進攻吊球得分
    if (L.quick) mrecPf(L.id).qk++;
    if (L.self) mrecPf(L.id).ss++;
    if (L.setBy) mrecPf(L.setBy).as++;   // 舉球助攻：攻擊手得分，舉球員記一顆   // 快攻直接落地得分（最後一下就是扣球，中間沒被攔網碰到）
    if (L.kind === 'spike' && VM.ball && VM.c) {   // 落點（球場座標）：直線＝攻擊手靠邊線、球沿同一條邊線下去；三米內＝落在對方三米線以內
      const B = vmBallL(VM.ball); if (L.az != null && Math.abs(L.az) > 2.2 && Math.abs(B.z - L.az) < 1.0 && Math.sign(B.z) === Math.sign(L.az)) mrecPf(L.id).kl++;
      if (Math.abs(B.x) < 3) mrecPf(L.id).ks++;
    }
  }
  else { mrecPf(L.id).e++; if (L.kind === 'bump') mrecPf(L.id).eb++; else if (L.kind === 'serve') mrecPf(L.id).es++; }
}
// 整場評分（0～100）：得分貢獻 35%＋效率 25%＋參與度 20%＋位置表現 20%；等級 S≥90、A≥75、B≥60、C≥40、D；全場最高＝MVP
function vmRateMatch() {
  const cl = (v) => Math.max(0, Math.min(100, v)), out = {};
  const score = VM.six ? VM.sets : VM.sc, total = (MREC.tp?.[0] || 0) + (MREC.tp?.[1] || 0);
  if (!Array.isArray(score) || score.length !== 2 || !score.every(Number.isFinite) || score.some((v) => v < 0) || score[0] + score[1] <= 0 || total <= 0) return { rate: out, mvp: null, bestLoser: null };
  const winner = score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1;
  const average = total / Math.max(1, VM.team.reduce((sum, ids) => sum + ids.filter(Boolean).length, 0));
  for (const t of [0, 1]) {
    const ids = (VM.team[t] || []).filter(Boolean), n = Math.max(1, ids.length), share = (MREC.tp[t] || 0) / total;
    const result = winner < 0 ? 50 : t === winner ? Math.max(65, Math.min(100, 65 + (share - 0.5) * 140)) : Math.max(0, Math.min(45, 45 - (0.5 - share) * 150));
    const touches = ids.reduce((sum, id) => sum + (mrecPf(id).t || 0), 0) || 1;
    for (const id of ids) {
      const P = mrecPf(id), pts = P.k + P.b + P.a;
      const contrib = cl(((pts + P.as * 0.5 + P.fs + Math.max(0, P.rc - P.eb) * 0.2) / average) * 50);   /* 跟全場每人平均一樣＝50，兩倍＝100 */
      const eff = P.t ? cl(100 * (1 - (2.5 * P.e) / P.t)) : 0;   /* 失誤直接送對手一分 */
      const part = cl((P.t / (touches / n)) * 50);   // 碰球次數跟隊上平均一樣＝50
      const main = [['st', P.st], ['rc', P.rc], ['sp', P.sp], ['bt', P.bt]].sort((x, y) => y[1] - x[1])[0];   // 這場主要在做什麼
      const role = !main[1] ? 50 : main[0] === 'st' ? cl((P.as / P.st) * 200) : main[0] === 'rc' ? cl((1 - P.eb / P.rc) * 100) : main[0] === 'sp' ? cl((P.k / P.sp) * 160) : cl((P.b / P.bt) * 200);
      const rt = Math.round(0.30 * contrib + 0.20 * eff + 0.15 * part + 0.20 * role + 0.15 * result);
      // 戰力六角圖：攻擊、攔網、發球、接球、舉球、穩定（各 0～100）
      const hx = [P.sp ? cl((P.k / P.sp) * 110 + Math.min(P.k, 12) * 3.5) : 0, cl(P.b * 22 + P.bt * 4), P.sv ? cl((1 - P.es / P.sv) * 65 + P.a * 15) : 0,
        P.rc ? cl((1 - P.eb / P.rc) * 65 + Math.min(P.rc, 20) * 1.75 + P.fs * 8) : 0, P.st ? cl((P.as / P.st) * 130 + Math.min(P.st, 25) * 1.4) : 0, P.t ? Math.round(cl(100 * (1 - (1.5 * P.e) / P.t))) : 0].map((v) => Math.round(v));
      out[id] = { rt, gr: rt >= 90 ? 'S' : rt >= 75 ? 'A' : rt >= 60 ? 'B' : rt >= 40 ? 'C' : 'D', c: Math.round(contrib), f: Math.round(eff), p: Math.round(part), r: Math.round(role), w: Math.round(result), m: main[1] ? main[0] : '', hx };
    }
  }
  const best = (t) => (VM.team[t] || []).filter((id) => out[id]).reduce((id, next) => !id || out[next].rt > out[id].rt ? next : id, null);
  return { rate: out, mvp: winner < 0 ? null : best(winner), bestLoser: winner < 0 ? null : best(1 - winner) };
}
function vmSendResult() {   // 房主：比賽結束，把結果送給大家（也給自己）
  if ((NET.me !== 'srv' && (!ROOM || !ROOM.isHost)) || vmIsPractice() || !MREC.id) return;   /* B5：伺服器當房主時由伺服器送 */
  const RT = vmRateMatch();
  if (!Object.keys(RT.rate).length) return;
  const d = { e: 'result', roles: mrecLongestRoles(), rate: RT.rate, mvp: RT.mvp, bestLoser: RT.bestLoser, id: MREC.id, six: !!VM.six, sets: VM.sets ? [...VM.sets] : null, sc: [...VM.sc], team: VM.team, perf: MREC.pf, cb: [...MREC.cb], lv: VM_OPT.lv, human: VM.ai.size === 0, pts: VM.to, sec: Math.round((Date.now() - MREC.t0) / 1000) };
  if (NET.on) NET.tx.publish('vm', d);
  vmGotResult(d); MREC.id = '';
}
async function vmGotResult(d) {
  if (!d || typeof d.id !== 'string' || vmIsPractice()) return;
  const me = vmMe(), team = Array.isArray(d.team) ? d.team.findIndex((t) => Array.isArray(t) && t.includes(me)) : -1; if (team < 0) return;   // 觀眾不記
  const A = d.six ? d.sets : d.sc;
  if (!Array.isArray(A) || A.length !== 2 || !A.every(Number.isFinite) || A.some((v) => v < 0) || A[0] + A[1] <= 0) return;
  const won = A[team] > A[1 - team], sets = d.six && d.sets ? Math.max(1, d.sets[0] + d.sets[1]) : 1;
  const hp = (d.perf && d.perf[me]) || {}, clean = Object.values(MREC.local.sets).some((x) => x.n >= 10 && !x.f);
  const my = (d.rate && d.rate[me]) || null, mvp = d.mvp === me;
  const perf = { rt: my ? Math.max(0, Math.min(100, my.rt | 0)) : undefined, mvp, k: hp.k | 0, kc: hp.kc | 0, b: hp.b | 0, a: hp.a | 0, e: hp.e | 0, kl: hp.kl | 0, ks: hp.ks | 0, fs: hp.fs | 0, md: hp.md | 0, qk: hp.qk | 0, ss: hp.ss | 0, as: hp.as | 0, wall: !!hp.wall, p: MREC.local.p, clean, cb: Array.isArray(d.cb) ? d.cb[team] | 0 : 0 };
  if (MREC.local.lk > 0) perf.lk = MREC.local.lk;
  if (d.six && d.team.every(ids => ids.length === 6) && ['OH', 'S', 'MB', 'OPP'].includes(d.roles?.[me])) perf.role = d.roles[me];
  MREC.local = { p: 0, sets: {} };
  const MR = my ? await import('./js/match-result.js').catch(() => null) : null;   // 結算面板（等級、六角圖、長條圖、解說、排名）
  if (MR) { try { MR.showMatchResult({ won, final: d.six && d.sets ? `局數 ${d.sets[0]}：${d.sets[1]}` : `${d.sc[0]}：${d.sc[1]}`, my, isMvp: mvp, rate: d.rate, mvp: d.mvp, bestLoser: d.bestLoser, teams: d.team, myTeam: team, me, nameOf: vmName, teamLabel: vmTeamLabel, st: { k: hp.k | 0, b: hp.b | 0, a: hp.a | 0, as: hp.as | 0, rc: hp.rc | 0, fs: hp.fs | 0, t: hp.t | 0, e: hp.e | 0, sp: hp.sp | 0, bt: hp.bt | 0, sv: hp.sv | 0, es: hp.es | 0, eb: hp.eb | 0, st: hp.st | 0 } }); unlockMouse(); } catch (x) { console.warn('結算面板', x); } }
  try {
    const { recordMatch, ACHIEVEMENTS, cachedProgress, EXP_PER_LEVEL } = await import('./js/progress.js');
    const r = await recordMatch({ id: d.id, level: [3, 4, 5].includes(d.lv) ? d.lv : 3, human: !!d.human, won, sets, points: [15, 20, 25].includes(d.pts) ? d.pts : 25, seconds: clamp(d.sec | 0, 60, 4 * 3600), perf });
    if (MR) { if (!r) MR.setMatchReward(null); else if (r.dup) MR.setMatchRewardError('這場已經記過了'); else MR.setMatchReward(r, cachedProgress(), EXP_PER_LEVEL); }
    if (!r || r.dup) return;
    if (!MR) toast(`${won ? '🏆 贏了！' : '比賽結束'}${my ? `　評分 ${my.gr}・${my.rt}` : ''}${mvp ? '　⭐MVP' : ''}　+${r.exp} 經驗　+${r.coins} 金幣${r.levelUp ? `　⬆ 升到 Lv${r.level}！` : ''}`, 5200);
    (r.new || []).forEach((k, i) => setTimeout(() => toast(`🎖 解鎖成就「${ACHIEVEMENTS[k]?.name || k}」・可以套用稱號「${ACHIEVEMENTS[k]?.title || ''}」`, 3600), 4400 + i * 3800));
  } catch (e) { if (MR) MR.setMatchRewardError((e && e.message) || '戰績記錄失敗'); toast((e && e.message) || '戰績記錄失敗', 2600); }
}
// 我是不是這一波的舉球員（比賽：這一波指定的舉球員，或六人制專職舉球；練習：都算）
function vbIsSetter() {
  if (!VM.on) return !window.VBTutorial?.active || window.VBTutorial.view().section==='set';
  const me = vmMe(), t = vmTeamOf(me), P = VM.host ? VM.poss[t] : null, setter = P ? P.setter : VM.remoteSetters?.[t];
  return setter ? setter === me : !!(VM.six && VM.role && VM.role[me] === 'S');
}
// 大按鍵提示：這一球能做的動作全部列出來（中間的時機提示有對應按鍵就照它；球正往你這邊來＝接球）
function vbKeyCue(cue, touch) {
  const el = $('vb-keycue'), K = VBSettings.values.keys, kn = (a) => (K[a] === 'Space' ? 'Space' : VBSettings.keyName(K[a]));
  const rows = [], k = cue && cue[0];
  if (!touch && (VM.on || VB.npc) && !walk.paused) {
    const ct = vbCourt(), net = ct && Math.abs(ct.lx) < 4.5 && vbIsSetter();   // 舉球員：右鍵＝貼網吊到對面三米線中間
    if (k === 'jump') rows.push([kn(' '), '跳']);
    else if (k === 'hit') rows.push(['Left', '攻擊'], ['Right', '吊球']);
    else if (k === 'set') { rows.push([kn('q'), '正面舉球'], [kn('e'), '背面舉球']); if (net) rows.push(['Right', '吊球']); }
    else if (k === 'block') rows.push([kn('b'), '攔網']);
    else if (k !== 'ready' && VB.target && !walk.recv && !walk.hold && !walk.air) rows.push([kn('v'), '接球']);
  }
  if (!rows.length) { el.hidden = true; el.dataset.k = ''; return null; }
  const id = rows.map((r) => r.join('|')).join(',');
  if (el.dataset.k !== id) {   // 換成別的提示才重畫（順便重播彈出動畫）
    el.dataset.k = id;
    el.innerHTML = rows.map(([key, act]) => `<div><kbd${[...key].length > 2 ? ' class="long"' : ''}>${key}</kbd><b>${act}</b></div>`).join('');
  }
  el.hidden = false; return rows;
}
// 接觸時機：球快到你要碰的地方時，球外面出現一個縮小的圓圈（縮到貼住球＝現在）
function vbUpcoming() {
  let best = null; const now = performance.now(), cy = camera.position.y;
  const consider = (b, t, kind) => { if (t != null && t > -0.05 && t < 1.0 && (!best || t < best.t)) best = { b, t, kind }; };
  if (walk.air && !walk.air.block && !(walk.swing && walk.swing.done)) { const H = vbHand(); for (const b of balls) { if (b.rest > 0.3) continue; const d = b.m.position.distanceTo(H); if (d < 3) consider(b, (d - 0.3) / Math.max(3, b.v.length() * VB.ts), 'atk'); } }
  const sp = VB.setSpot; if (!walk.air && sp && now < sp.until && balls.includes(sp.b) && Math.hypot(sp.x - walk.x, sp.z - walk.z) < 4.5) { const hk = vbHangK(), hv = walk.vel || [0, 0], vy = vbJumpVy(Math.hypot(hv[0], hv[1])) * Math.sqrt(hk), pr = vbPredict(sp.b.m.position, sp.b.v, EYE + 0.75 + (vy * vy) / (2 * JUMP_G * hk) - 0.15) || vbPredict(sp.b.m.position, sp.b.v, 2.9); if (pr) consider(sp.b, pr.t - vy / (JUMP_G * hk), 'atk'); }
  const myT = VM.on ? vmTeamOf(vmMe()) : -1, P0 = VM.on && VM.host && myT >= 0 ? VM.poss[myT] : null;
  const remoteSet = VM.on && !VM.host && myT >= 0 && VM.remoteSetters?.[myT] === vmMe() && VM.tc && VM.tc[0] === myT && VM.tc[1] === 1;   /* WEB-023：加入者沒有 VM.poss，用同步來的舉球員與觸球數 */
  if (walk.setAim || walk.setQ || remoteSet || (P0 && P0.setter === vmMe() && P0.stage === 1)) for (const b of balls) { if (b.rest > 0.3 || b.mine || Math.hypot(b.m.position.x - walk.x, b.m.position.z - walk.z) > 6) continue; const pr = vbPredict(vbTruePos(b), b.v, cy + 0.3); if (pr) consider(b, pr.t, 'set'); }
  if (VB.target) { const pr = vbPredict(vbTruePos(VB.target.b), VB.target.b.v, 0.8); if (pr) consider(VB.target.b, pr.t, 'recv'); }
  return best;
}
function vbScreen(p) {
  const v = p.clone().project(camera); if (v.z > 1 || v.z < -1) return null;
  const cv = renderer.domElement.getBoundingClientRect(), ui = $('walk-ui').getBoundingClientRect();
  const d = Math.max(0.3, camera.position.distanceTo(p)), r = (BALL_R / d) * (cv.height / 2) / Math.tan((camera.fov * Math.PI) / 360);
  return { x: ((v.x + 1) / 2) * cv.width + cv.left - ui.left, y: ((1 - v.y) / 2) * cv.height + cv.top - ui.top, r };
}
// 畫面輸出時（鏡頭已經是最後要用的那個）再算圓圈的位置
function rkUpcoming() {
  if (!RK.on || RK.phase !== 'rally') return null;
  const me = RK.P[RK.my]; if (!me || me.sw || (me.swing && me.swing.t < 0.25)) return null;
  const id = rkIdeal(me); if (!id) return null;
  const t = id.t - RK_SW; return t > -0.06 && t < 1.0 ? { b: { m: RK.ballM }, t, nowT: 0.05 } : null;
}
function vbDomFx() {
  const ring = $('vb-ring'), up = RP.on ? null : window.__rkOn ? rkUpcoming() : vbUpcoming(), sp = up && vbScreen(up.b.m.position);
  if (!sp) ring.hidden = true;
  else { const k = clamp(up.t / 0.9, 0, 1), r = Math.max(9, sp.r) * (1.2 + k * 2.8); ring.hidden = false; ring.style.left = sp.x + 'px'; ring.style.top = sp.y + 'px'; ring.style.width = ring.style.height = 2 * r + 'px'; ring.dataset.k = up.t < (up.nowT ?? 0.12) ? 'now' : 'soon'; }
  VB.fx = (VB.fx || []).filter((f) => { const age = performance.now() - f.t0; if (age > 900) { f.el.remove(); return false; } const q = vbScreen(f.b.m.position); if (q) { f.el.style.left = q.x + 'px'; f.el.style.top = q.y + 'px'; } return true; });
}
// 碰到球的那一刻：PERFECT（金）／GOOD（綠）／BAD（紅）
function vbFx(b, q, word) {
  const g = word ? [word, '#9AA4B2'] : q >= 0.88 ? ['PERFECT', '#F2B705'] : q >= 0.6 ? ['GOOD', '#3DD68C'] : ['BAD', '#FF5A5F'];
  const el = document.createElement('div'); el.className = 'vb-fx'; el.style.color = g[1]; el.innerHTML = `<i></i><b>${g[0]}</b>`;
  $('walk-ui').appendChild(el); VB.fx = VB.fx || []; VB.fx.push({ el, b, t0: performance.now() });
}
function vbTurn(dt) { const t = walk.turn; if (!t) return; t.t -= dt; let d = t.yaw - walk.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); walk.yaw += d * Math.min(1, dt * 9); walk.pitch += (0.32 - walk.pitch) * Math.min(1, dt * 6); if (t.t <= 0) walk.turn = null; }
// 比賽中：球在對面那一邊（越過網子那個平面）就碰不到，手不能伸過網接、舉、打、推；攔網另外算
function vbOwnSide(b) {
  if (b.langzi && VM.on) return false; /* WEB-022 裝飾球排除接球、舉球與攻擊選球。 */
  if (!VM.on || !VM.c) return true;
  const team = vmTeamOf(vmMe()); if (team < 0) return true;
  const [lx] = toLocalOf(VM.c, b.m.position.x, b.m.position.z); return lx * vmSide(team) > -0.02;
}
// 球下一格會在哪裡（比賽中觸球判斷用：最近的那一刻就碰，不等球跑過頭）
function vbNext(b) { const h = (VB.dt || 1 / 60) * VB.ts; return new THREE.Vector3(b.m.position.x + b.v.x * h, b.m.position.y + b.v.y * h - 4.9 * h * h, b.m.position.z + b.v.z * h); }
function vbUpdate(dt) { VB.dt = dt; emoStep(); vbBlockHands(dt); hands.position.x += ((walk.air && walk.air.block ? (walk.blkShift || 0) * 0.7 : 0) - hands.position.x) * 0.4;   /* 第一人稱攔網的雙手跟著左右移 */ vbAimRing(); vbTurn(dt); vbParts(dt); vbSwingStep(dt); vbRecvStep(); vbSetStep(); vbNpcStep(dt); vbCamAssist(dt); vbRings(); vbCue(); }
const TP = { manual: null, av: null, ball: null, saved: null };
function tpActive() { if (!walk.on || window.__rkOn || RP.on || walk.sit || walk.paused) return false; return TP.manual != null ? TP.manual : VBSettings.values.third && (VM.on || !!VB.npc); }
// 我現在的全身姿勢：[姿勢, 這一格靠近的比例]
// 助跑：有舉過來的球、你正往攻擊點跑（4 m 內、有速度）→ 手往後擺的程度（越接近攻擊點擺越後面）
function vbApproachK() {
  const sp = VB.setSpot; if (walk.air || walk.swing || walk.hold || !sp || performance.now() > sp.until || !balls.includes(sp.b)) return 0;
  const d = Math.hypot(sp.x - walk.x, sp.z - walk.z), v = walk.vel ? Math.hypot(walk.vel[0], walk.vel[1]) : 0;
  return d < 4 ? clamp((4.2 - d) / 2.4, 0, 1) * clamp((v - 1.0) / 1.2, 0, 1) : 0;
}
// 空中：起跳前 0.12 秒雙手往上甩，接著 0.18 秒內變成拉弓躬身
function vbAirPose() { const t = walk.air ? walk.air.t : 1; return t < 0.12 ? AVP.takeoff : t < 0.3 ? avMix(AVP.takeoff, AVP.airUp, (t - 0.12) / 0.18) : AVP.airUp; }
function myAvPose() {
  if (walk.emote?.keyframes) return [emoKeySample(walk.emote.k, (performance.now() - walk.emote.t0) / 1000, walk.emote.dir).pose, 1];
  const fast = 0.55, k = 0.3, game = VM.on || VB.npc;
  if (walk.dive || walk.down > 0) { const dp = avDivePose(walk.diveDir || 0, !walk.dive); return [!walk.dive && walk.down < 0.3 ? avMix(dp, AVP.ready, 1 - walk.down / 0.3) : dp, fast]; }   // 撲出去→倒地→撐起來
  if (walk.emote && performance.now() < walk.emote.until) return [emoPose(walk.emote.k, (performance.now() - walk.emote.t0) / 1000), k];   // 擊掌、嘲諷
  if (walk.air && walk.air.block) return [avBlockPose(walk.blkShift || 0), fast];   // 攔網：雙手跟著滑鼠往左右移
  if (walk.swing) {   // 揮臂：還沒碰到球＝拉弓；碰到之後 0.07 秒是擊球那一下、接著收到身體另一側
    const s2 = walk.swing; if (s2.dump) return [s2.done ? AVP.setPush : AVP.setReady, fast];   // 舉球員吊球：雙手在額頭上方準備、碰到就往外推
    if (!s2.done) return [walk.air ? vbAirPose() : avMix(AVP.idle, AVP.airUp, 0.85), fast];
    const e2 = s2.t - s2.doneT; return [e2 < 0.07 ? AVP.spikeHit : avMix(AVP.spikeHit, AVP.spikeFollow, (e2 - 0.07) / 0.2), 0.6];
  }
  if (walk.jserve && !walk.jserve.hit && !walk.air) return [AVP.serveToss, 0.5];
  if (walk.serve) { const t2 = walk.serve.t; return [t2 < 0.5 ? AVP.serveToss : t2 < 0.62 ? avMix(AVP.serveToss, AVP.spikeHit, (t2 - 0.5) / 0.12) : avMix(AVP.spikeHit, avMix(AVP.spikeFollow, AVP.idle, 0.3), (t2 - 0.62) / 0.25), 0.5]; }
  if (walk.air) return [vbAirPose(), 0.6];
  if (walk.landT && performance.now() - walk.landT < 220) return [AVP.land, 0.4];
  if (walk.flash > 0 && (pose === 'setPush' || pose === 'setBack')) return [pose === 'setBack' ? AVP.setBack : AVP.setPush, fast];
  if (walk.setQ || walk.setAim) return [AVP.setReady, k];
  if (walk.flash > 0 && pose === 'bumpHit') return [AVP.bumpHit, fast];
  if (walk.recv) return [walk.crouch ? AVP.bump : AVP.bumpStand, 0.4];   // 站著接（V）／蹲低接（Ctrl＋V）
  if (walk.hold) return [AVP.hold, k];
  if (walk.crouch) return [AVP.crouch, 0.35];   // 按住 Ctrl：蹲低
  const ak = vbApproachK(); if (ak > 0) return [avMix(AVP.idle, AVP.approach, ak), 0.35];
  // 比賽中：在網前、對面有人要攻擊＝攔網準備；球在場上＝低重心準備姿勢
  // 比賽中：球正往你這邊來（會落在你 3.5 m 內）才壓低準備接；在網前、對面要攻擊才舉手準備攔網；其他時候自然站
  if (game && VM.phase === 'rally') {
    const ct = vbCourt(), B = VM.ball && balls.includes(VM.ball) ? VM.ball : null;
    if (ct && Math.abs(ct.lx) < 1.3 && B && !vbOwnSide(B)) return [AVP.blockReady, k];
    if (VB.target && VB.target.t < 1.6) return [AVP.ready, k];
  }
  if (VB.npc && VB.target) return [AVP.ready, k];
  return [AVP.idle, k];
}
function tpBegin(dt) {
  const on = tpActive(); $('walk-ui').classList.toggle('tp', on);
  if (!on) { if (TP.av) { TP.av.g.visible = false; TP.ball.visible = false; } return false; }
  const kit = teamKit(VM.on ? vmTeamOf(vmMe()) : -1);
  if (TP.av && (TP.avCh !== myChar() || TP.av.gameKit !== kit)) { scene.remove(TP.av.g); TP.av = null; }   // 換了角色就重做
  if (!TP.av) { TP.avCh = myChar(); TP.av = makeAvatar(NET.color || '#F2B705', TP.avCh, VM.on ? vmTeamOf(vmMe()) : -1, VM.on ? null : readWornJersey()); scene.add(TP.av.g); if (!TP.ball) { TP.ball = newBallMesh(); scene.add(TP.ball); } }
  const av = TP.av, k = 1 - Math.exp(-dt * 14), E = camera.position.clone(), air = walk.air ? walk.air.y : 0;
  // 我的人形：位置、朝向、跑步擺腿、手臂姿勢（跟別人看到的一樣）
  av.g.visible = true; av.g.position.set(walk.x, 0, walk.z); av.g.rotation.order = 'YXZ'; av.g.rotation.y = walk.yaw + Math.PI; av.g.rotation.x = 0; av.fall = (walk.dive && walk.dive.t > 0.06) || walk.down > 0.25 ? { a: 1, d: walk.diveDir || 0, t: walk.dive ? walk.dive.t : 0.45 + (0.75 - walk.down) } : null; av.body.position.y += (air - av.body.position.y) * 0.6;
  const v = walk.vel || [0, 0], sp = walk.air ? 0 : Math.hypot(v[0], v[1]); av.phase += dt * Math.min(12, sp * 5.5);
  avDrive(av, ...myAvPose(), sp, air > 0.05);
  // 手上的球：第一人稱掛在鏡頭上，第三人稱改畫在人的手上
  TP.ball.visible = !!walk.hold; if (walk.hold) walk.hold.getWorldPosition(TP.ball.position);
  TP.saved = { p: E, q: camera.quaternion.clone(), hv: hands.visible };
  hands.visible = false; if (walk.hold) walk.hold.visible = false;
  // 鏡頭：在你右肩後上方（人不會擋住畫面中間），看你前方；不跑出建物
  const cp = Math.cos(walk.pitch), f = new THREE.Vector3(-Math.sin(walk.yaw) * cp, Math.sin(walk.pitch), -Math.cos(walk.yaw) * cp);
  const pos = E.clone().addScaledVector(f, -3.0); pos.y += 0.85; pos.x += Math.cos(walk.yaw) * 0.6; pos.z -= Math.sin(walk.yaw) * 0.6;
  const P = outlinePoly(), xs = P.map((q) => q[0]), zs = P.map((q) => q[1]);
  pos.x = clamp(pos.x, Math.min(...xs) + 0.3, Math.max(...xs) - 0.3); pos.z = clamp(pos.z, Math.min(...zs) + 0.3, Math.max(...zs) - 0.3); pos.y = clamp(pos.y, 0.5, state.building.H - 0.3);
  camera.position.copy(pos); camera.lookAt(E.clone().addScaledVector(f, 2.5)); camera.updateMatrixWorld(true);
  return true;
}
function tpEnd() {
  const S0 = TP.saved; if (!S0) return;
  camera.position.copy(S0.p); camera.quaternion.copy(S0.q); hands.visible = S0.hv; if (walk.hold) walk.hold.visible = true; camera.updateMatrixWorld(true); TP.saved = null;
}
function vbStop() { vbManualSetCancel(); if (TP.av) { TP.av.g.visible = false; TP.ball.visible = false; } TP.manual = null; vbClearAir(); walk.swing = null; walk.recv = null; walk.setQ = null; VB.setSpot = null; VB.target = null; if (VB.ringLand) { VB.ringLand.visible = false; VB.ringSet.visible = false; } if (VB.npc) vbNpcToggle(); }
// ---- 旁觀：別人的羽球／匹克球對戰，球照同一套物理飛給大家看
const RKV = new Map();
function rkSpectate(d) {
  // 球場：先用代號找；找不到（例如規劃還沒同步）就用訊息帶來的位置和方向
  const c = rkCourts().find((q) => q.key === d.key) || (d.cw ? { key: d.key, cx: d.cw[0], cz: d.cw[1], yaw: d.cw[2], k: d.cw[3] } : null); if (!c) return;
  let e = RKV.get(d.key);
  if (!e) { const m = rkBallMesh(c.k), sh = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false })); sh.rotation.x = -Math.PI / 2; scene.add(m); scene.add(sh); e = { m, sh }; RKV.set(d.key, e); }
  e.c = c; e.path = rkPath(RK_SPEC[c.k], d.p, d.v); e.t = 0.05; e.p0 = d.p;
}
// 別人跟 AI 打：AI 的位置跟著他的狀態一起送過來，旁觀的人也看得到 AI 球員
function rkAiState() { if (!RK.on || RK.netOp) return undefined; const P = RK.P[-RK.my]; if (!P || !P.av) return undefined; const [x, z] = rkW(RK.c, P.x, P.z); return [+x.toFixed(2), +z.toFixed(2), +P.av.g.rotation.y.toFixed(2), P.swing ? (P.swing.over ? 7 : 8) : 6, RK.k]; }
function rkPeerAi(p2, a) {
  if (!a) { if (p2.aiAv) { scene.remove(p2.aiAv.g); p2.aiTag.element.remove(); p2.aiAv = null; } return; }
  if (!p2.aiAv) {
    const av = makeAvatar('#E5484D'), rk = makeRacket(a[4]); av.hands[0].add(rk);
    const el = document.createElement('div'); el.className = 'mp-tag'; el.textContent = `AI（${p2.n} 的對手）`; const tag = new CSS2DObject(el); tag.position.set(0, 2.05, 0); av.g.add(tag);
    av.g.position.set(a[0], 0, a[1]); scene.add(av.g); p2.aiAv = av; p2.aiTag = tag;
  }
  p2.aiT = a;
}
function rkSpecStep(dt) {
  for (const [key, e] of RKV) {
    e.t += dt; const pts = e.path.pts, last = pts[pts.length - 1];
    if (!last || e.t > last.t + 2.5) { scene.remove(e.m); scene.remove(e.sh); RKV.delete(key); continue; }
    let a = pts[0], b = last; for (let i = 0; i < pts.length - 1; i++) if (pts[i + 1].t >= e.t) { a = pts[i]; b = pts[i + 1]; break; }
    const f = e.t >= last.t ? 1 : clamp((e.t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1), x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f;
    const [wx, wz] = rkW(e.c, x, z); e.m.position.set(wx, y, wz); e.sh.position.set(wx, 0.012, wz);
    if (e.c.k === 'bd' && b !== a) { const [bx, bz] = rkW(e.c, b.x, b.z); e.m.lookAt(bx, b.y, bz); }
  }
}

