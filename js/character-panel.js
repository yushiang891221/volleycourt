import * as THREE from 'three';
import { makeToyAvatar, decodeLook, preloadAvatars, EQUIP, OPTIONS } from './avatar-toy.js';
import { openCreator } from './creator.js';
import { makePlayer, syncReal, realReadyOf, preloadReal } from './avatar-real.js';   // 2026-11-24 起畫面上都是新角色（看不見的公仔骨架＋新角色跟著它）
import { readLook, saveLook, myLookCode, readEquip, saveEquip, readTeamJersey, saveTeamJersey, readWornJersey, BASIC_JERSEYS, wearBasicJersey, readTeamWear, wearTeamJersey } from './appearance.js';
import { decodeJersey, PALETTE, CUTS } from './jersey.js';
import { AVP, EMO_KEYS, avMix, emoKeyDuration, emoKeySample, emoPose } from './emote-keys.js';   // T 輪盤動作：跟遊戲同一份（tools/build-emote-keys.cjs 產生）

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

let previewQ = Promise.resolve(), previewR = null;
export function preview(img, code = myLookCode(), opt = {}) {   // opt：ang＝轉幾度（弧度）、w／h＝圖片大小
  previewQ = previewQ.then(() => previewNow(img, code, opt)).catch((e) => console.warn('[角色預覽]', e));
  return previewQ;
}
// 預覽畫面的燈：跟建角色畫面一樣（AgX＋柔和燈）。新角色材質本身有補亮（REAL_LIGHT，給較暗的球館用），用原本的強燈會過曝成一片白
const toneOf = (r) => { r.toneMapping = THREE.AgXToneMapping; r.toneMappingExposure = 1.05; };
function previewLights(scene) {
  scene.add(new THREE.HemisphereLight('#FFF6EA', '#A98458', 1.5));
  const sun = new THREE.DirectionalLight('#FFFFFF', 2.3); sun.position.set(2.5, 6, 4); scene.add(sun);
  const fill = new THREE.DirectionalLight('#FFE6CC', 0.8); fill.position.set(-3, 2, 3); scene.add(fill);
}
async function previewNow(img, code, opt) {
  if (!img.isConnected && !opt.offscreen) return;
  await Promise.all([preloadAvatars(), preloadReal()]).catch(() => {});
  const W = opt.w || 240, H = opt.h || 300;
  if (!previewR) { previewR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); previewR.outputColorSpace = THREE.SRGBColorSpace; toneOf(previewR); }
  previewR.setSize(W, H);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(opt.bg || '#0B362B');   /* Play One 風格：深綠底 */
  previewLights(scene);
  const av = makePlayer(decodeLook(code), opt.jersey === undefined ? readWornJersey() || 'orange' : opt.jersey || 'orange'); av.g.rotation.y = opt.ang || 0; scene.add(av.g);   // 含裝備、穿著的球隊球衣
  syncReal(av); await realReadyOf(av); syncReal(av);
  const camera = new THREE.PerspectiveCamera(32, W / H, .05, 20);
  if (opt.tight) { camera.position.set(.25, 1.0, 2.65); camera.lookAt(0, .8, 0); } else { camera.position.set(.35, 1.0, 2.95); camera.lookAt(0, .78, 0); }   // 角色整個人（含頭頂、帽子）都在預覽圖裡；tight＝裝備面板的大預覽
  previewR.render(scene, camera); img.src = previewR.domElement.toDataURL();
}

// 置物櫃格子的縮圖：用自己的角色實際穿戴那件東西拍一張（不是圖示）。共用一個畫布，一張一張畫，畫過的記起來。
// shot：{ at: 'torso'|'hat'|'glasses'|'neck'|'wrist'|'knee', top?, design?, item?, value? }
const SHOT_CAM = {   // [相機位置, 看的點]（角色站在原點、面向 +z）
  torso: [[0.25, 1.05, 1.7], [0, 0.98, 0]], hat: [[0.3, 1.62, 1.15], [0, 1.5, 0]], glasses: [[0.15, 1.46, 0.75], [0, 1.44, 0]],
  neck: [[0.2, 1.35, 0.9], [0, 1.27, 0]], wrist: [[0.85, 0.72, 0.95], [0.3, 0.6, 0]], knee: [[0.3, 0.45, 1.2], [0, 0.38, 0]],
};
const SHOT_CACHE = new Map(); let shotR = null;
async function renderShot(shot) {
  const look = decodeLook(myLookCode()); let kit = readWornJersey() || 'orange';
  if (shot.at === 'torso') { if (shot.design) kit = { design: shot.design }; else { kit = 'orange'; look.top = shot.top; } }
  else if (shot.item === 'knee') look.knee = shot.value;
  else look.eq = { ...(look.eq || {}), [shot.item]: shot.value };
  const key = JSON.stringify([shot, look, kit]); if (SHOT_CACHE.has(key)) return SHOT_CACHE.get(key);
  if (!shotR) { shotR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); shotR.setSize(200, 200); shotR.outputColorSpace = THREE.SRGBColorSpace; toneOf(shotR); }
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0B2E25');
  previewLights(scene);
  const av = makePlayer(look, kit); scene.add(av.g); syncReal(av); await realReadyOf(av); syncReal(av);
  const [p, t] = SHOT_CAM[shot.at] || SHOT_CAM.torso, cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20); cam.position.set(...p); cam.lookAt(...t);
  shotR.render(scene, cam); const url = shotR.domElement.toDataURL('image/png');
  SHOT_CACHE.set(key, url); return url;
}
async function fillShots(d, items) {
  try { await preloadAvatars(); await preloadReal(); } catch {}
  for (const it of items) {
    if (!it.shot || !d.open) continue;
    const img = d.querySelector(`.eqx-item[data-i="${it.i}"] .eqx-shot`); if (!img) continue;
    try { img.src = await renderShot(it.shot); img.hidden = false; img.closest('.eqx-item').classList.add('has-shot'); } catch (e) { console.warn('[置物櫃] 縮圖畫不出來', e); }
    await new Promise((r) => setTimeout(r, 0));   // 一張一張畫，畫面不卡
  }
}

// 跟遊戲 avDrive 站著不動時一樣的套法（src/gym/game/07-net.js）：肩、手肘、髖、膝、外展、腳踝、上身前彎／側倒／扭轉、頭，最後不陷進地板
const GROUND_V = new THREE.Vector3();
function emoteDrive(av, P) {
  if (!av?.rig) return;
  const ext = [0, 0], hab = P.hab || [0, 0], shy = P.shy || [0, 0], ankle = P.ankle || [0, 0], head = P.head || [0, 0];
  for (let i = 0; i < 2; i++) {
    const sx = i === 0 ? -1 : 1, a = av.arms[i], h = av.legs[i], kn = av.knees[i];
    if (a.userData.y0 == null) a.userData.y0 = a.position.y; a.position.y = a.userData.y0 + shy[i];
    a.rotation.set(P.sh[i][0], 0, sx * P.sh[i][1]); av.elbows[i].rotation.x = -P.el[i];
    h.rotation.set(-P.hip[i], 0, sx * hab[i]); kn.rotation.x = P.kn[i];
    ext[i] = ((av.L1 || 0.44) * Math.cos(P.hip[i]) + (av.L2 || 0.46) * Math.cos(P.hip[i] - P.kn[i])) * Math.cos(hab[i]);
    if (av.feet) av.feet[i].rotation.set(-(h.rotation.x + kn.rotation.x) * 0.9 + ankle[i], 0, -h.rotation.z);
  }
  av.root.rotation.set(0, 0, 0);
  av.spine.rotation.set(P.sp, P.tw || 0, P.lean || 0);
  av.head.rotation.set(-P.sp * 0.6 + head[0], head[1], 0);
  av.root.position.set(0, -Math.max(0, (av.hipH || 0.9) - Math.max(ext[0], ext[1])), 0);
  // 不陷進地板：鞋底四角、膝蓋、手最低的點低於地板就整個人抬上來（遊戲的 avGroundPts 精簡版）
  av.g.updateMatrixWorld(true);
  const gy = av.g.getWorldPosition(GROUND_V).y; let minY = Infinity;
  const pts = av._lobbyGp || (av._lobbyGp = [...(av.feet || []).flatMap(f => [-0.052, 0.052].flatMap(x => [-0.08, 0.17].map(z => [f, x, -0.062, z]))), ...av.knees.flatMap(k => [[k, 0, 0, 0.075], [k, 0, 0, -0.05]]), ...av.hands.map(h => [h, 0, -0.08, 0])]);
  for (const [o, x, y, z] of pts) { GROUND_V.set(x, y, z); o.localToWorld(GROUND_V); if (GROUND_V.y < minY) minY = GROUND_V.y; }
  if (minY < gy) { av.root.position.y += (gy - minY) / (av.g.scale.y || 1); av.root.updateMatrixWorld(true); }
}

// 即時預覽（裝備面板）：按住拖曳轉角色、放開停住；換外觀時 rebuild()；面板關掉 dispose() 釋放 WebGL
export function livePreview(old, bg = '#0B362B', slots = null) {   // slots：大廳共用畫布的角色位置
  // 每次都換一個新的畫布：關面板時釋放過的畫布不能再拿來畫（第二次打開會載入失敗）
  const canvas = document.createElement('canvas'); canvas.className = old.className; canvas.setAttribute('aria-label', old.getAttribute('aria-label') || ''); old.replaceWith(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: bg === null });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); toneOf(renderer);
  const scene = new THREE.Scene(); scene.background = bg === null ? null : new THREE.Color(bg);
  previewLights(scene);
  const camera = new THREE.PerspectiveCamera(32, 0.75, 0.05, 20); camera.position.set(0.25, 1.0, 2.65); camera.lookAt(0, 0.8, 0);
  // 鏡頭繞著角色轉：左右拖＝繞一圈、上下拖＝從上面／下面看（不會翻過頭頂）
  let lastCode = null, av = null, yaw = 0.1, pitch = 0.08, drag = null, raf = 0;
  const target = new THREE.Vector3(0, 0.77, 0), DIST0 = 2.8; let dist = DIST0;   /* 新角色比例比較修長（頭小）：鏡頭拉近，人在畫面裡大一點 */   // 滾輪縮放遠近（1.2～5 公尺）
  const size = () => { const w = canvas.clientWidth || 300, h = canvas.clientHeight || 400; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  // 自己腳下的香檳金底座，與角色共用鏡頭。
  const partyHalo = slots ? new THREE.Mesh(new THREE.RingGeometry(.28, .38, 64), new THREE.MeshBasicMaterial({ color: '#E5B869', side: THREE.DoubleSide, transparent: true, opacity: .8 })) : null;
  if (partyHalo) { partyHalo.rotation.x = -Math.PI / 2; partyHalo.position.y = .01; scene.add(partyHalo); }
  let party = [], lastMembers = null;
  preloadReal().then(() => { if (lastMembers) api.setParty(lastMembers); else if (av) api.rebuild(lastCode); }, () => {});   /* 新角色模型載好之前先出現的是公仔：載好就換掉 */
  // 大廳（slots）：拖曳轉「自己的角色」，鏡頭固定（不再繞著轉、也不縮放，角色不會跑出名牌位置）；方向和炫技同步給隊友（onSelfYaw）
  const yaws = [], acts = [];   // 每個站位角色的方向、正在做的炫技 { key, t0, dir }
  let actRaf = 0;
  const actPose = (i, now) => {   // 跟遊戲一樣：有關鍵影格的（浪子、狗熊、搖頭晃腦、閃身）照影格播；擊掌、嘲諷、其他表情用遊戲的同一個姿勢
    const a = party[i], act = acts[i]; if (!a) return false;
    const ry = yaws[i] || 0; a.g.rotation.set(0, ry, 0); a.g.position.set(0, 0, 0);
    if (!act) { emoteDrive(a, AVP.idle); return false; }
    const t = (now - act.t0) / 1000;
    if (t >= act.dur) { acts[i] = null; emoteDrive(a, AVP.idle); return false; }
    if (EMO_KEYS[act.key]) {
      emoteDrive(a, emoKeySample(act.key, t, act.dir).pose);   // 只播姿勢、不位移（遊戲裡鏡頭跟著自己；大廳站位固定，走出去會被切掉）
    } else {
      const w = Math.max(0, Math.min(1, t / 0.15, (act.dur - t) / 0.25));   // 遊戲裡姿勢是平滑靠過去的：頭尾各淡入淡出一下
      emoteDrive(a, avMix(AVP.idle, act.key === 'taunt' ? emoPose('taunt', t) : AVP.hi5Up, w));
    }
    return true;
  };
  const animate = () => { actRaf = 0; const now = performance.now(); let busy = false; party.forEach((_, i) => { busy = actPose(i, now) || busy; }); draw(); if (busy) actRaf = requestAnimationFrame(animate); };
  const draw = () => { raf = 0; if (!canvas.getClientRects().length || document.hidden) return; size(); for (const a of party) syncReal(a); if (av) syncReal(av); target.y = 0.77 + 0.45 * Math.max(0, Math.min(1, (DIST0 - dist) / (DIST0 - 1.2))); camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist); camera.lookAt(target);
    if (!slots) { renderer.render(scene, camera); return; }
    // 同一個 renderer／scene，以 scissor 畫各站位；手機 slots 只回傳自己。
    // 後面的人先畫、前面的人後畫（只清深度不清顏色），前面的人才會擋住後面的人（6 對 6 的 V 字隊形會重疊）
    renderer.autoClear = false; renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
    const bounds = canvas.getBoundingClientRect();
    const order = [...slots().entries()].filter(([i, el]) => party[i] && el).map(([i, el]) => [i, el, el.getBoundingClientRect()]).sort((a, b) => a[2].bottom - b[2].bottom || b[0] - a[0]);
    for (const [i, el, r0] of order) {
      // 站位很高很窄時（視窗比較高）角色不要跟著放大：畫的高度最多是寬度的 2 倍、貼齊底部；名牌往下移到頭上（--head）
      const vh = Math.min(r0.height, r0.width / 0.5), r = { left: r0.left, bottom: r0.bottom, width: r0.width, height: vh };
      const head = Math.round(r0.height - vh) + 'px'; if (el.parentElement && el.parentElement.style.getPropertyValue('--head') !== head) el.parentElement.style.setProperty('--head', head);
      const x = r.left - bounds.left, y = bounds.bottom - r.bottom;
      renderer.clearDepth();
      party.forEach((a, n) => { a.g.visible = i === n; });
      partyHalo.visible = i === 0;
      renderer.setViewport(x, y, r.width, r.height); renderer.setScissor(x, y, r.width, r.height);
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); renderer.render(scene, camera);
    }
    renderer.setScissorTest(false);
  };
  const ask = () => { if (!raf) raf = requestAnimationFrame(draw); };
  canvas.style.cursor = 'grab'; canvas.style.touchAction = 'none';
  const api = { onSelfYaw: null };
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch, self: yaws[0] || 0 }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return;
    if (slots) { yaws[0] = drag.self + (e.clientX - drag.x) * 0.012; actPose(0, performance.now()); api.onSelfYaw?.(yaws[0], false); ask(); return; }
    yaw = drag.yaw - (e.clientX - drag.x) * 0.012; pitch = Math.max(-1.2, Math.min(1.35, drag.pitch + (e.clientY - drag.y) * 0.01)); ask(); });
  canvas.addEventListener('dblclick', () => { if (slots) { yaws[0] = 0; actPose(0, performance.now()); api.onSelfYaw?.(0, true); ask(); return; } yaw = 0.1; pitch = 0.08; dist = DIST0; ask(); });   // 點兩下轉回正面
  canvas.addEventListener('wheel', (e) => { if (slots) return; e.preventDefault(); dist = Math.max(1.2, Math.min(5, dist * Math.exp(e.deltaY * 0.0012))); ask(); }, { passive: false });   // 滾輪拉近拉遠（大廳不縮放）
  const up = () => { if (drag && slots) api.onSelfYaw?.(yaws[0] || 0, true); drag = null; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  return Object.assign(api, {
    setYaw(i, v) { if (!Number.isFinite(v)) return; yaws[i] = v; actPose(i, performance.now()); ask(); },
    playEmote(i, key, dir = 1) { if (!party[i]) return; acts[i] = { key, dir, t0: performance.now(), dur: EMO_KEYS[key] ? emoKeyDuration(key) : key === 'taunt' ? 1.6 : key === 'hi5' ? 2.5 : 1.1 }; if (!actRaf) actRaf = requestAnimationFrame(animate); },
    setParty(members) {
      // 模型資源可能由 avatar-toy 共用；移除舊節點，避免誤 dispose 共用材質。
      party.forEach(a => scene.remove(a.g));
      lastMembers = members;
      party = members.map((m, i) => makePlayer(decodeLook(m.look || myLookCode()), i === 0 ? readWornJersey() || 'orange' : 'orange'));
      party.forEach((a) => realReadyOf(a).then(ask));   /* 頭比較晚載好：好了再畫一次 */
      party.forEach(a => scene.add(a.g)); party.forEach((_, i) => actPose(i, performance.now())); ask();
    },
    rebuild(code) { lastCode = code; if (av) scene.remove(av.g); av = makePlayer(decodeLook(code), readWornJersey() || 'orange'); scene.add(av.g); realReadyOf(av).then(ask); ask(); },
    redraw: ask,
    dispose() { cancelAnimationFrame(raf); cancelAnimationFrame(actRaf); partyHalo?.geometry.dispose(); partyHalo?.material.dispose(); renderer.dispose(); renderer.forceContextLoss(); },
  });
}
// 球衣與裝備（三欄）：左＝角色預覽（可轉）、目前穿戴、玩家資料（可改暱稱）、調整外觀；中＝分類＋物品格；右＝稱號、T 輪盤動作
//   護膝存在外觀裡（會同步到帳號）；帽子、眼鏡、項鍊、護腕存在這台電腦；球隊球衣要加入球隊才有
const EQ_TABS = [['jersey', '球衣', '👕'], ['knee', '護膝', '🦵'], ['hat', '帽子', '🧢'], ['glasses', '眼鏡', '🕶️'], ['neck', '項鍊', '📿'], ['wrist', '護腕', '🎽']];
const ITEM_ICON = { knee: ['⬛', '⬜', '🚫'], hat: ['🚫', '🧢', '🧢'], glasses: ['🚫', '👓', '👓', '🕶️'], neck: ['🚫', '⚪', '🟡'], wrist: ['🚫', '⬜', '⬛'] };
const ITEM_TINT = { knee: ['#1c1c21', '#f2f2ee', ''], hat: ['', '#22252b', '#f2f2ee'], glasses: ['', '#1c1e24', '#d4af5a', '#14171c'], neck: ['', '#d9dde3', '#e8b94a'], wrist: ['', '#f4f4f0', '#22252b'] };
const dayText = (t) => { const x = new Date(t); return isNaN(x) ? '?' : x.toLocaleDateString('zh-TW'); };
const SLEEVE_ICON = ['👕', '🥋', '🩱', '🎽'];   // 短袖、長袖、短版、無袖
const syncLook = async () => { try { const { syncAppearance } = await import('./account-flow.js'); await syncAppearance(); } catch {} };
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
          <div class="eqx-stage">
            <canvas class="eqx-img" aria-label="目前穿戴的角色（按住拖曳可以轉）"></canvas><span class="eqx-drag">🖱️ 拖曳轉動・滾輪拉近拉遠・點兩下還原</span><div class="eqx-worn"><h4>目前穿戴 ✓</h4><ul></ul></div></div>
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
  let tab = 'jersey', ang = 0, prog = P.cachedProgress() || {}, team = undefined, ttIdx = 0, history = [];
  const setErr = (t) => { $q('.eqx-err').textContent = t || ''; };
  if (!d._live) { d._live = livePreview($q('.eqx-img')); d.addEventListener('close', () => { d._live?.dispose(); d._live = null; }, { once: true }); }   // 關面板就釋放 WebGL，下次開再建（換新畫布）
  const drawStage = () => { try { d._live.rebuild(myLookCode()); } catch { setErr('角色預覽載入失敗'); } };
  const itemsOf = (k) => {
    if (k === 'jersey') {
      // 0～3 基本球衣（短袖、長袖、短版、無袖）、10＋n 目前球隊的第 n 件（可以穿）、100＋k 紀念球衣（待過的球隊，不能穿）
      const worn = readTeamWear(), top = decodeLook(readLook()).top;
      const basic = BASIC_JERSEYS.map((b, n) => ({ i: n, name: b.name, icon: SLEEVE_ICON[n], tint: '#F07C24', on: !worn && top === b.top, shot: { at: 'torso', top: b.top } }));
      const mine = ((team && team.jerseys) || []).map((c, n) => { const dd = decodeJersey(c); return dd && { i: 10 + n, shot: { at: 'torso', design: c }, name: `${team.name}・球衣 ${n + 1}（${CUTS[dd.cut]}）`, icon: SLEEVE_ICON[dd.cut], tint: PALETTE[dd.body], on: !!worn && worn.idx === n && worn.code === c }; }).filter(Boolean);
      const keep = [];
      history.forEach((h, k) => (h.jerseys || []).forEach((c, n) => { const dd = decodeJersey(c); if (dd) keep.push({ i: 100 + keep.length, shot: { at: 'torso', design: c }, name: `紀念｜${h.team}・球衣 ${n + 1}`, icon: SLEEVE_ICON[dd.cut], tint: PALETTE[dd.body], on: false, lock: `${dayText(h.joined)}～${dayText(h.left)} 待在這隊` }); }));
      return [...basic, ...mine, ...keep];
    }
    const L = decodeLook(readLook()), eq = readEquip(), list = k === 'knee' ? OPTIONS.knee : EQUIP[k].items, cur = k === 'knee' ? L.knee : eq[k] | 0;
    return list.map((name, i) => ({ i, name, icon: ITEM_ICON[k][i], tint: ITEM_TINT[k][i], on: cur === i, lock: k === 'knee' && L.pants === 1 ? '穿長褲時不戴護膝' : '', shot: { at: k, item: k, value: i } }));
  };
  const drawWorn = () => {
    $q('.eqx-worn ul').innerHTML = EQ_TABS.map(([k, name, icon]) => { const it = itemsOf(k).find((x) => x.on); const none = !it || /不戴|不穿/.test(it.name); return `<li${none ? ' class="off"' : ''}><span class="eqx-wi" style="--t:${it?.tint || '#2a3a52'}">${it && !none ? it.icon : icon}</span><span><small>${name}</small><b>${none ? '未裝備' : esc(it.name)}</b></span></li>`; }).join('');
  };
  const drawMid = () => {
    $q('.eqx-tabs').innerHTML = EQ_TABS.map(([k, name, icon]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${icon} ${name}</button>`).join('');
    const items = itemsOf(tab);
    setTimeout(() => fillShots(d, items), 0);
    $q('.eqx-grid').innerHTML = items.map((it) => `<button type="button" class="eqx-item${it.on ? ' on' : ''}${it.lock ? ' lock' : ''}" data-k="${tab}" data-i="${it.i}"${it.lock ? ' disabled' : ''}><img class="eqx-shot" alt="" hidden><span class="eqx-ii" style="--t:${it.tint || '#1d2a3d'}">${it.lock ? '🔒' : it.icon}</span><b>${esc(it.name)}</b>${it.on ? '<i class="eqx-check">✓</i>' : ''}${it.lock ? `<small>${esc(it.lock)}</small>` : ''}</button>`).join('');
    $q('.eqx-hint').innerHTML = tab === 'jersey' ? `比賽中照兩隊隊服；球隊球衣在大廳、練習、走動時穿。球衣由球隊的隊長、副隊長在「球隊 → 球衣」設計。${team ? '' : '加入球隊後，球隊的球衣會出現在這裡。'}退出球隊後，球衣會留下當紀念（不能穿）。` : tab === 'knee' ? '護膝會存在帳號裡。' : '之後商店買到的配件也會出現在這裡。';
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
    if (b.dataset.tab) { tab = b.dataset.tab; drawMid(); return; }
    if (b.dataset.k) {
      const k = b.dataset.k, i = +b.dataset.i; setErr('');
      if (k === 'jersey') {
        if (i < BASIC_JERSEYS.length) { wearBasicJersey(i); if (team) P.teamApi('wear', -1).catch(() => {}); }
        else if (i >= 10 && i < 100 && team) { const n = i - 10; try { await P.teamApi('wear', n); wearTeamJersey(n, team.jerseys[n]); } catch (x) { setErr((x && x.message) || '換球衣失敗'); } }
        syncLook();   // 袖型存在外觀裡，同步到帳號
      }
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
  try { history = (await P.teamApi('history')) || []; } catch { history = []; }
  { const w = readTeamWear(), now = w && team && team.jerseys && team.jerseys[w.idx]; if (w && now !== w.code) { wearTeamJersey(now ? w.idx : -1, now); if (d.open) drawStage(); } }   // 球隊改了那件：換成新的；不在球隊或那件被刪了：換回基本球衣
  if (d.open) { drawWorn(); drawMid(); drawRight(); drawInfo(); }
}

// WEB-010 成就系統：左＝選中系列的詳情與每一階進度；右＝名字框（等級、成就點數、稱號）、分類分頁、系列清單（開房比賽才會累積）
export async function openAchievementPanel() {
  if (!document.getElementById('lobby-shell') || editing) return;
  let d = document.getElementById('ach-panel');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'ach-panel'; d.setAttribute('aria-labelledby', 'ach-title');
    d.innerHTML = '<form method="dialog"><header class="ach-top"><button class="ach-back" aria-label="關閉">←</button><h2 id="ach-title">成就系統</h2></header><div class="ach-cols"><section class="ach-detail"></section><section class="ach-right"><div class="ach-me"></div><nav class="ach-cats" role="tablist"></nav><div class="ach-series"></div></section></div><p class="ach-tip">💡 新手教學成就依本機教學進度解鎖；比賽成就在開房比賽中累積。解鎖的稱號到「球衣與裝備 → 稱號」套用。</p></form>';
    document.body.append(d);
  }
  const P = await import('./progress.js');
  let cat = 'all', sel = P.ACH_SERIES[0].id, prog = P.cachedProgress() || {};
  const tutorialDone = P.achProgress('tutorial')[0] === 6;
  const got = () => [...new Set([...(prog.achievements || []), ...(tutorialDone ? ['tutorial'] : [])])];
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
      const pr = seriesPr(S); S = P.achVisible(S, pr.done > 0);
      return `<button type="button" class="ach-s${S.id === sel ? ' on' : ''}${pr.done === pr.total ? ' done' : ''}" data-s="${S.id}"><span class="ach-s-ic">${S.icon}</span><span class="ach-s-tx"><b>${esc(S.name)}</b><small>${esc(S.desc)}</small></span><span class="ach-s-b">${pr.badge}</span><span class="ach-s-ar">${S.id === sel ? '◀' : '›'}</span></button>`;
    }).join('');
  };
  const drawDetail = () => {
    const original = P.ACH_SERIES.find((x) => x.id === sel), pr = seriesPr(original), S = P.achVisible(original, pr.done > 0);
    const tiers = S.tiers.map((k, i) => {
      const t = tierPr(k), a = P.achVisible(P.ACHIEVEMENTS[k], t.ok), pct = t.ok ? 100 : Math.round((t.cur / t.need) * 100);
      const foot = P.ACHIEVEMENTS[k].hidden && !t.ok ? '' : t.ok ? '<div class="ach-t-done">✓ 已達成</div>' : t.one ? '<div class="ach-t-one">一場比賽內達成就解鎖</div>' : `<div class="ach-t-pr"><span>進度：${t.cur} / ${t.need}</span><span>${pct}%</span></div><div class="ach-bar"><i style="width:${pct}%"></i></div>`;
      return `<div class="ach-t${t.ok ? ' ok' : ''}"><div class="ach-t-h"><span class="ach-t-n">${i + 1}</span><b>${esc(a.name)}</b>${a.title ? `<span class="ach-badge sm">稱號「${esc(a.title)}」</span>` : ''}</div><p>${esc(a.desc)}${k === 'tutorial' ? '' : `・${P.ACH_POINTS[k] || 0} PT`}</p>${foot}</div>`;
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
export async function openTeamPanel() {   // 球隊系統（T2）：新的球隊主頁在 js/team-panel.js
  if (!document.getElementById('lobby-shell') || editing) return;
  const { openTeamHub } = await import('./team-panel.js');
  return openTeamHub();
}
// 大廳右欄下半部的角色資訊卡（登出、刪除帳號在「系統設定 → 其他」）
// 大廳角色看板（2026-11-18 使用者要求）：角色跟「球衣與裝備」一樣可以拖曳 360 度轉、滾輪縮放；
//   左側疊著稱號＋目前穿戴的裝備，右側疊著 T 輪盤裡的炫技動作（4 個）；名字、等級、戰績照舊在下面
const SLOT_ICON = { jersey: '👕', knee: '🦵', hat: '🧢', glasses: '🕶️', neck: '📿', wrist: '🎽' };
function wornNow() {
  const L = decodeLook(readLook()), eq = readEquip(), out = [];
  const tw = readTeamWear(), basic = BASIC_JERSEYS.find((b) => b.top === L.top);
  out.push(['jersey', tw ? '球隊球衣' : basic ? basic.name.replace('基本球衣・', '') + '球衣' : '球衣']);
  if (L.pants !== 1 && OPTIONS.knee[L.knee] && !/不戴|不穿/.test(OPTIONS.knee[L.knee])) out.push(['knee', OPTIONS.knee[L.knee]]);
  for (const k of ['hat', 'glasses', 'neck', 'wrist']) { const n = EQUIP[k] && EQUIP[k].items[eq[k] | 0]; if (n && !/不戴|不穿/.test(n)) out.push([k, n]); }
  return out;
}
export function mountCharacterCard(card) {
  if (!card) return;
  const img = card.querySelector('img'), name = card.querySelector('.me-name'), err = card.querySelector('.me-err');
  // 舞台：左（稱號、穿戴）＋可轉的角色＋右（炫技動作）；WebGL 開不起來就退回原本的靜態圖
  const stage = document.createElement('div'); stage.className = 'me-stage';
  const left = document.createElement('div'), right = document.createElement('div'); left.className = 'me-l'; right.className = 'me-r';
  img.replaceWith(stage); stage.append(left, img, right);
  let live = null;
  try { img.setAttribute('aria-label', '你的角色（拖曳轉動、滾輪縮放、點兩下還原）'); live = livePreview(img, '#0a2a22'); } catch { live = null; stage.insertBefore(img, right); }
  const hint = document.createElement('span'); hint.className = 'me-drag'; hint.textContent = '拖曳轉動・滾輪縮放'; stage.append(hint);
  const sides = async () => {
    const P = await import('./progress.js'), prog = P.cachedProgress() || {}, t = prog.title && P.ACHIEVEMENTS[prog.title];
    left.innerHTML = `<div class="me-tt"><small>稱號</small><b>${t ? esc(t.title) : '未套用'}</b></div><div class="me-eq"><small>穿戴中</small>${wornNow().map(([k, n]) => `<span title="${esc(n)}"><i>${SLOT_ICON[k]}</i>${esc(n)}</span>`).join('')}</div>`;
    const w = P.myWheel();
    right.innerHTML = `<small>炫技動作</small>${[0, 1, 2, 3].map((i) => { const e = w[i] && P.EMOTES[w[i]]; return `<span class="${e ? '' : 'off'}"><i>${e ? e.icon : '＋'}</i>${e ? esc(e.name) : '空'}</span>`; }).join('')}`;
  };
  const draw = () => {
    try { if (live) live.rebuild(myLookCode()); else preview(img); err.textContent = ''; } catch { err.textContent = '角色預覽載入失敗，請重新整理。'; }
    sides().catch(() => {});
  };
  // 在「球衣與裝備」換了東西、改了輪盤或稱號：關掉那個面板就更新看板
  document.addEventListener('close', (e) => { if (e.target && e.target.id === 'equip-panel') draw(); }, true);
  const setName = () => { name.textContent = (window.VBSettings && window.VBSettings.values.nickname) || '球友'; };
  name.onclick = async () => (await import('./public-profile.js')).openPublicProfile(name.textContent);
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
  addEventListener('vb-progress-change', () => { showProgress(); sides().catch(() => {}); });
  setName(); draw();
  preloadAvatars().then(draw, () => {});   // 模型載好再畫一次（一開始可能還是備用角色）
  addEventListener('vb-settings-change', setName);
  addEventListener('vb-look-change', draw);   // 從帳號同步回來的外觀
}
