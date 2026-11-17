// ---- WEB-026 手機操作（2026-11-17）：只在觸控裝置啟動，電腦（滑鼠）完全不跑這裡的任何東西
//   畫面只留：左下搖桿、右下五顆鈕（扣（發）、跳、舉、接、攔）、右上 ☰ 選單
//   搖桿：輕推＝走、推到邊緣＝跑；跑動中按「接」＝撲救（跟電腦 Shift＋V 一樣）
//   扣：地上按住＝起跳＋蓄力；（沒有陀螺儀時）按住拖曳＝左右定方向、往上打長、往下扣釘；放開＝揮臂；在空中輕點一下＝吊球
//       拿著球：按住拖曳＝調發球落點（紅圈），放開＝發球；跳發＝拿球按「跳」，空中再按住「扣」
//   舉：按住＝舉球輪盤，往要的位置拖、放開＝舉；另一隻手指點一下畫面＝換前排／後排
//   攔：按住＝起跳攔網，左右拖＝雙手往左右移
//   轉動手機瞄準（陀螺儀，使用者 2026-11-17 要求）：按住「扣」的時候，轉動手機＝轉視角——左右轉＝方向、往下傾＝往下扣（落點近、釘）、往上＝打長；
//     地板上的落點圈跟著動。手機沒有感應器（或沒允許）時，退回「按住扣拖曳」瞄準。手機預設第三人稱（tpActive）
//   平常（沒按扣）也能轉手機看四周：左右轉＝轉頭、上下傾＝抬頭低頭，跟右半邊手指拖曳一起用；設定「遊戲」頁可關（gyroLook）
const TOUCH = { on: false, aim: null, mark: null, press: null };
const GYRO = { ok: 0, on: false, t: 0, asked: false, sy: 0, sp: 0 };   // sy／sp＝平滑過的轉動速度（平常轉視角用）   // ok＝最後一次收到感應器資料的時間
function touchAimOf(dx, dy) {   // 拖曳量 → 方向偏移（左右各約 35 度）＋視角（決定深淺：沒拖＝中等、往上＝長、往下＝釘）
  const down = clamp(0.3 + dy / 120, 0, 1);
  return { dyaw: clamp(-dx * 0.006, -0.61, 0.61), pitch: -(0.05 + 0.55 * down), down };
}
(() => {
  if (!matchMedia('(pointer: coarse)').matches) return;   // 電腦：到這裡就結束
  TOUCH.on = true;
  document.body.classList.add('touch-ui');
  const pad = $('vpad'), joy = $('joy'), knob = joy.querySelector('i'), tag = $('joy-run'), menu = $('tmenu'), rot = $('trotate');
  const ok = () => walk.on && !walk.paused && !window.__rkOn && !RP.on && !(VM.on && roomSpectator());
  const buzz = () => { if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) { /* ignore */ } };

  // 陀螺儀：只在按住「扣」時把手機的轉動加到視角上（平常不動，避免拿著手機晃來晃去畫面亂轉）
  //   rotationRate（每秒幾度）依螢幕方向換成「左右轉」和「上下傾」：橫拿（90／270 度）時手機的長邊是左右
  const gyroLive = () => performance.now() - GYRO.ok < 1000;
  const gyroAsk = () => {   // iPhone 要先問一次（要在手指放開那一下問才算使用者操作）
    if (GYRO.asked) return; GYRO.asked = true;
    const D = window.DeviceMotionEvent; if (D && typeof D.requestPermission === 'function') D.requestPermission().catch(() => {});
  };
  // 平常也用陀螺儀轉視角的時機：設定有開、在遊戲裡、沒暫停、沒開選單／舉球轉盤／表情選單／重播／排行榜、扣球最後那一下不轉（跟手指拖曳一樣）
  const gyroFree = () => VBSettings.values.gyroLook !== false && walk.on && !walk.paused && !window.__rkOn && !RP.on && !SETM.m && !(typeof EMO !== 'undefined' && EMO.menu)
    && !(walk.spike && walk.spike.t > 0.98) && !document.body.classList.contains('touch-more') && !document.querySelector('dialog[open]');
  document.addEventListener('touchend', gyroAsk, true);   // iPhone：「允許動作感應」只能在手指放開（touchend）時問，第一次碰螢幕放開就問
  addEventListener('devicemotion', (e) => {
    const r = e.rotationRate; if (!r || r.beta == null || r.gamma == null) return;
    const now = performance.now(), dt = clamp((now - (GYRO.t || now)) / 1000, 0, 0.05); GYRO.t = now;
    if (Math.abs(r.beta) + Math.abs(r.gamma) + Math.abs(r.alpha || 0) > 0) GYRO.ok = now;
    const free = !GYRO.on && gyroFree();
    if (!GYRO.on && !free) { GYRO.sy = GYRO.sp = 0; return; }
    const ang = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) % 360, a = (ang + 360) % 360;
    const yawR = a === 90 ? r.beta : a === 270 ? -r.beta : a === 180 ? -r.gamma : r.gamma;   // 繞螢幕直立軸：往左轉為正
    const pitR = a === 90 ? -r.gamma : a === 270 ? r.gamma : a === 180 ? -r.beta : r.beta;   // 繞螢幕橫軸：上緣往自己傾（往上看）為正
    if (GYRO.on) {   // 按住「扣」瞄準：照原本的
      const k = (Math.PI / 180) * 1.3 * dt;   // 1.3 倍：手腕轉小一點就夠
      walk.yaw += yawR * k; walk.pitch = clamp(walk.pitch + pitR * k, -1.2, 1.1); walk.lookT = performance.now(); return;
    }
    // 平常轉視角（使用者 2026-11-17 要求）：不用校正正前方——畫面現在看哪裡就從哪裡開始，轉多少加多少，跟手指拖曳直接相加
    //   防抖：先平滑（一半新一半舊），每秒 3 度以下的小晃動不算，超過的部分才轉
    GYRO.sy = GYRO.sy * 0.5 + yawR * 0.5; GYRO.sp = GYRO.sp * 0.5 + pitR * 0.5;
    const dz = (v) => Math.sign(v) * Math.max(0, Math.abs(v) - 3);
    const y = dz(GYRO.sy), pt = dz(GYRO.sp); if (!y && !pt) return;
    const k = (Math.PI / 180) * dt * (VBSettings.values.sensitivity || 1);
    walk.yaw += y * k; walk.pitch = clamp(walk.pitch + pt * k, -1.2, 1.1);
    if (Math.abs(y) + Math.abs(pt) > 6) walk.lookT = now;   // 真的在轉才暫停視角輔助
  });

  // 搖桿（浮動，使用者 2026-11-17 要求）：螢幕左半邊任何地方按下去，搖桿就出現在手指底下；輕推＝走、推到邊緣（八成五以上）＝跑；
  //   放開就停、搖桿回到左下角（變淡，當作提示）。右半邊空白處照舊是拖曳轉視角
  const zone = document.createElement('div'); zone.className = 'joy-zone'; zone.id = 'joy-zone'; joy.parentElement.prepend(zone);   // 放最前面：其他按鈕、面板都疊在它上面
  let jid = null, jc = null;
  const joySet = (e) => {
    const R = joy.getBoundingClientRect().width / 2;
    let x = (e.clientX - jc[0]) / R, y = (e.clientY - jc[1]) / R; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    const run = m >= 0.85; walk.joy = { x, y }; walk.joyRun = run; walk.autoRun = false;
    joy.classList.toggle('run', run); tag.textContent = run ? '跑' : '走';
    knob.style.transform = `translate(${x * R * 0.55}px, ${y * R * 0.55}px)`;
  };
  const joyStart = (e) => {
    if (jid != null || !walk.on || walk.paused) return;
    e.preventDefault(); e.stopPropagation(); jid = e.pointerId; try { e.currentTarget.setPointerCapture(jid); } catch (er) { /* ignore */ }
    const box = joy.offsetParent ? joy.offsetParent.getBoundingClientRect() : { left: 0, top: 0 }, R = joy.offsetWidth / 2;
    joy.style.left = (e.clientX - box.left - R) + 'px'; joy.style.top = (e.clientY - box.top - R) + 'px'; joy.style.bottom = 'auto';
    jc = [e.clientX, e.clientY]; joy.classList.add('live'); joySet(e);
  };
  const joyMove = (e) => { if (e.pointerId === jid) joySet(e); };
  const joyEnd = (e) => {
    if (e.pointerId !== jid) return; jid = null; jc = null; walk.joy = { x: 0, y: 0 }; walk.joyRun = false;
    joy.classList.remove('run', 'lock', 'live'); knob.style.transform = ''; tag.textContent = '左半邊按住＝移動'; joy.style.left = joy.style.top = joy.style.bottom = '';
  };
  for (const el of [zone, joy]) { el.addEventListener('pointerdown', joyStart); el.addEventListener('pointermove', joyMove); el.addEventListener('pointerup', joyEnd); el.addEventListener('pointercancel', joyEnd); }
  tag.textContent = '左半邊按住＝移動';

  // 五顆鈕：每顆有 down／move／up
  const ACT = {
    spike: {
      down(p) {
        p.hold = !!walk.hold; p.yaw = walk.yaw; p.pitch = walk.pitch; walk.touchAim = null;
        p.gyro = gyroLive(); GYRO.on = p.gyro;   // 有陀螺儀：轉手機瞄準；沒有：拖曳瞄準
        if (p.hold) return;   // 拿著球：先瞄準（轉手機或拖曳），放開才發
        TOUCH.aim = p.gyro ? { view: true } : touchAimOf(0, 0);
        const ground = !walk.air && !walk.jserve;
        vbPrimaryDown(false);   // 空中＝開始蓄力；地上＝準備（起跳那一刻開始蓄力）
        if (ground && walk.chargeArmGround) vbJump('attack');
      },
      move(p, dx, dy) {
        if (p.gyro) return;   // 轉手機瞄準時，手指不小心滑動不算
        if (p.hold) { walk.yaw = p.yaw - dx * 0.005; walk.pitch = clamp(p.pitch - dy * 0.004, -1.2, 1.1); return; }   // 發球：落點圈跟著動
        TOUCH.aim = touchAimOf(dx, dy);
      },
      up(p, dx, dy, dur) {
        const aim = TOUCH.aim; TOUCH.aim = null; GYRO.on = false;
        if (p.hold) { if (walk.hold) vbPrimaryDown(false); return; }
        if (walk.charge && walk.air && !walk.jserve && dur < 160 && Math.hypot(dx, dy) < 14) {   // 空中輕點＝吊球
          walk.charge = null; vbChgHud(); walk.chargeArm = null; walk.chargeArmGround = false; vbAttack(true); return;
        }
        if (aim && !aim.view && !walk.jserve) {   /* 轉手機瞄準＝直接用現在的視角（跟電腦一樣），不用另外給偏移 */ const ta = { dyaw: aim.dyaw, pitch: aim.pitch }; walk.touchAim = ta; setTimeout(() => { if (walk.touchAim === ta) walk.touchAim = null; }, 1200); }   // 揮臂後 0.6 秒內碰到球才用得到
        const g = walk.chargeArmGround && walk.chargeArm && !walk.air; walk.chargeArm = null; walk.chargeArmGround = false;   // 跟電腦放開左鍵一樣
        if (walk.charge) vbChargeRelease(); else if (g) vbAttack(false);
      },
    },
    jump: {
      down() { walk.keys.add(' '); if (walk.hold && vbAtServeLine()) startJumpServe(); else vbJump('attack'); },
      up() { walk.keys.delete(' '); },
    },
    bump: { down() { if (walk.setAim) vbManualSetCancel(); vbReceive(); } },
    block: {
      down(p) { if (walk.setAim) vbManualSetCancel(); vbJump('block'); p.blk = walk.blkAim || 0; },
      move(p, dx) { if (walk.air && walk.air.block) walk.blkAim = clamp(p.blk + dx * 0.004, -0.5, 0.5); },
    },
    set: {
      down(p) {
        setWheelOpen(); if (!SETM.m) return;
        p.lx = p.x; p.ly = p.y; TOUCH.setId = p.id;
        const c = $('set-menu').querySelector('.sw-center small'); if (c) c.innerHTML = '拖到位置放開<br>另一指點畫面換' + (SETM.page ? '前排' : '後排');
      },
      move(p, dx, dy, e) { if (!SETM.m) return; setMenuMove((e.clientX - p.lx) * 1.5, (e.clientY - p.ly) * 1.5); p.lx = e.clientX; p.ly = e.clientY; },
      up() { TOUCH.setId = null; if (SETM.m) setMenuClose(true); },
    },
    pass: { down() { passToFacing(); } },
  };
  for (const b of pad.querySelectorAll('button[data-act]')) {
    const A = ACT[b.dataset.act]; let p = null;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); if (p || !ok()) return;
      p = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }; TOUCH.press = b.dataset.act;
      try { b.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      b.classList.add('on'); buzz(); A.down && A.down(p);
    });
    b.addEventListener('pointermove', (e) => { if (!p || e.pointerId !== p.id) return; e.stopPropagation(); A.move && A.move(p, e.clientX - p.x, e.clientY - p.y, e); });
    const end = (e) => {
      if (!p || e.pointerId !== p.id) return; e.preventDefault(); e.stopPropagation();
      const q = p; p = null; TOUCH.press = null; b.classList.remove('on');
      if (e.type === 'pointercancel') { if (A === ACT.set) { TOUCH.setId = null; setMenuClose(false); } else if (A === ACT.spike) { TOUCH.aim = null; GYRO.on = false; walk.chargeArm = null; walk.chargeArmGround = false; walk.charge = null; vbChgHud(); } else A.up && A.up(q, 0, 0, 999); return; }
      A.up && A.up(q, e.clientX - q.x, e.clientY - q.y, performance.now() - q.t);
      gyroAsk();   // iPhone：第一次放開按鈕時問「允許動作感應」
    };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // 舉球輪盤開著時，另一隻手指點畫面＝換前排／後排
  addEventListener('pointerdown', (e) => {
    if (TOUCH.setId == null || e.pointerId === TOUCH.setId || !SETM.m || !SETM.m.all) return;
    e.preventDefault(); e.stopPropagation(); setWheelOpen(1 - SETM.page);
    const c = $('set-menu').querySelector('.sw-center small'); if (c) c.innerHTML = '拖到位置放開<br>另一指點畫面換' + (SETM.page ? '前排' : '後排');
  }, true);

  // ☰ 選單：遊戲中把設定、回大廳、房間資訊、聊天收起來，按一下打開
  menu.addEventListener('pointerdown', (e) => e.stopPropagation());
  menu.addEventListener('click', () => document.body.classList.toggle('touch-more'));

  // 扣球落點圈：按住「扣」時在對面場上畫出來（跟扣球公式一樣的方向和深淺；過網修正不算在內，所以是大概的位置）
  const ring = () => {
    if (TOUCH.mark) return TOUCH.mark;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 36), new THREE.MeshBasicMaterial({ color: '#F2B705', transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 4; m.visible = false; scene.add(m); TOUCH.mark = m; return m;
  };
  const markStep = () => {
    const a = TOUCH.aim, ct = a && walk.on ? vbCourt() : null; if (!ct) { if (TOUCH.mark) TOUCH.mark.visible = false; return; }
    const dyaw = a.view ? 0 : a.dyaw, down = a.view ? clamp((-walk.pitch - 0.05) / 0.55, 0, 1) : a.down;   // 轉手機瞄準：照現在的視角（跟扣球公式一樣）
    const yaw = walk.yaw + dyaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), depth = 6.6 - 4.6 * down;
    const [lx] = toLocalOf(ct.c, walk.x, walk.z), [ax] = toLocalOf(ct.c, walk.x + fx, walk.z + fz), dlx = ax - lx;
    if (dlx * -Math.sign(lx) <= 0.12) { if (TOUCH.mark) TOUCH.mark.visible = false; return; }   // 沒面向對面
    const dist = Math.min(20, (Math.abs(lx) + depth) / Math.abs(dlx)), m = ring();
    m.position.set(walk.x + fx * dist, 0.03, walk.z + fz * dist); m.visible = true;
  };

  // 每格：當下該按的鈕亮起來、「傳」只在閒逛拿球時出現、☰ 和橫放提示
  const HOT = { jump: 'jump', hit: 'spike', set: 'set', block: 'block' };
  const btn = Object.fromEntries([...pad.querySelectorAll('button[data-act]')].map((b) => [b.dataset.act, b]));
  const portrait = matchMedia('(orientation: portrait)');
  let last = '';
  const tick = () => {
    requestAnimationFrame(tick);
    const on = walk.on && !window.__rkOn;
    menu.hidden = !on; rot.hidden = true;   /* 直拿改由 js/mobile-gate.js 的「請將手機轉過來」黑畫面處理（全站共用） */
    if (!on) { if (TOUCH.mark) TOUCH.mark.visible = false; return; }
    markStep();
    const cue = $('vb-cue'), k = cue.hidden ? '' : cue.dataset.k;
    let hot = HOT[k] || '';
    if (!hot && walk.hold) hot = 'spike';
    else if (!hot && VB.target && !walk.recv && !walk.hold && !walk.air) hot = 'bump';
    const id = hot + (walk.hold && !VM.on ? '|p' : '');
    if (id !== last) { last = id; for (const [a, b] of Object.entries(btn)) b.classList.toggle('hot', a === hot); btn.pass.hidden = !(walk.hold && !VM.on); }
  };
  requestAnimationFrame(tick);
})();
