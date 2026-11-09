// 捏臉畫面：建帳號時第一次進來、之後從「角色資訊 → 調整外觀」進來。
// openCreator({ look, mode: 'create' | 'edit', onDone(look), onCancel() }) → 回傳 close()。
// 左邊：排球場上的角色（可以拖曳轉身、滾輪拉近）；右邊：部位格子 → 樣式格子，直接點選。
import * as THREE from 'three';
import { makeToyAvatar, OPTIONS, DEFAULT_LOOK, KITS, EXPRESSIONS, PREVIEW_POSES, applyStaticPose, setExpression, randomLook } from './avatar-toy.js';

const CATS = [
  { k: 'sex', name: '性別', shot: 'bust' },
  { k: 'skin', name: '膚色', swatch: true, shot: 'head', names: ['很淺', '淺', '自然', '小麥', '深', '很深'] },
  { k: 'hair', name: '髮型', shot: 'head' },
  { k: 'hairColor', name: '髮色', swatch: true, shot: 'head', names: ['黑', '深棕', '棕', '金', '紅', '灰'] },
  { k: 'eyes', name: '眼睛', shot: 'face' },
  { k: 'top', name: '球衣', shot: 'torso' },
  { k: 'pants', name: '褲子', shot: 'legs' },
  { k: 'knee', name: '護膝', shot: 'legs' },
  { k: 'shoe', name: '球鞋', swatch: true, shot: 'shoe', names: ['紅', '白', '黑', '藍'] },
  { k: 'num', name: '背號', shot: 'back' },
  { k: 'preview', name: '預覽', shot: 'full' },
];
// 鏡頭：[相機位置, 看的點]（角色站在原點、面向 +z）
const SHOTS = {
  full: [[0.9, 1.15, 3.9], [0, 0.88, 0]], head: [[0.45, 1.45, 1.35], [0, 1.4, 0]], face: [[0.12, 1.36, 0.95], [0, 1.34, 0]],
  bust: [[0.5, 1.2, 2.2], [0, 1.12, 0]], torso: [[0.6, 0.95, 1.9], [0, 0.88, 0]], legs: [[0.55, 0.5, 1.75], [0, 0.42, 0]],
  shoe: [[0.55, 0.28, 0.95], [0, 0.07, 0.05]], back: [[-0.4, 1.0, -2.2], [0, 0.9, 0]],
};

const CSS = `
.cc{position:fixed;inset:0;z-index:50;display:flex;font:15px "Microsoft JhengHei","PingFang TC",sans-serif;color:#3B2A1E;background:#E8DCCB;user-select:none}
.cc-stage{position:relative;flex:1 1 auto;min-width:0}
.cc-stage canvas{display:block;width:100%;height:100%;cursor:grab}
.cc-stage canvas:active{cursor:grabbing}
.cc-title{position:absolute;left:28px;top:22px;font-size:30px;font-weight:800;letter-spacing:2px;color:#4A3424;text-shadow:0 2px 0 #fff8}
.cc-tip{position:absolute;left:28px;bottom:22px;font-size:13px;color:#6B5545;background:#FFF8EEcc;padding:6px 12px;border-radius:999px}
.cc-panel{width:min(520px,42vw);display:flex;flex-direction:column;background:#FBF4EA;box-shadow:-8px 0 30px #0002;padding:18px 18px 14px}
.cc-cats{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
.cc-cat{background:#fff;border:2px solid #EADBC6;border-radius:12px;padding:6px 2px 5px;text-align:center;cursor:pointer;font-size:13px;transition:.12s}
.cc-cat img,.cc-cat .ic{width:44px;height:44px;display:block;margin:0 auto 2px;border-radius:8px;object-fit:cover}
.cc-cat .ic{display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#C2671F}
.cc-cat:hover{border-color:#F3B27A}
.cc-cat.on{border-color:#F07C24;background:#FFF0E2;box-shadow:0 2px 0 #F07C2455}
.cc-h{margin:16px 2px 8px;font-size:17px;font-weight:800;display:flex;justify-content:space-between;align-items:baseline}
.cc-h small{font-size:12px;font-weight:400;color:#8A7362}
.cc-grid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px;align-content:start;padding:2px 4px 8px 2px}
.cc-opt{position:relative;background:#fff;border:2px solid #EADBC6;border-radius:14px;padding:6px;text-align:center;cursor:pointer;transition:.12s}
.cc-opt:hover{border-color:#F3B27A;transform:translateY(-1px)}
.cc-opt.on{border-color:#F07C24;background:#FFF3E6}
.cc-opt.on::after{content:"✓";position:absolute;right:6px;top:4px;width:20px;height:20px;border-radius:50%;background:#F07C24;color:#fff;font-size:13px;line-height:20px}
.cc-opt img{width:100%;aspect-ratio:1;display:block;border-radius:10px;background:#F4ECE1}
.cc-opt .sw{width:100%;aspect-ratio:1;border-radius:50%;box-shadow:inset 0 -6px 12px #0002,0 2px 4px #0001}
.cc-opt .tx{width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#4A3424;background:#F4ECE1;border-radius:10px}
.cc-opt span{display:block;margin-top:5px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-opt.off{opacity:.35;pointer-events:none}
.cc-num{grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:12px}
.cc-num .big{font:900 64px Bahnschrift,"Arial Narrow",Arial,sans-serif;color:#F07C24;background:#fff;border:2px solid #EADBC6;border-radius:16px;width:150px;text-align:center}
.cc-pad{display:grid;grid-template-columns:repeat(3,72px);gap:8px}
.cc-pad b{background:#fff;border:2px solid #EADBC6;border-radius:12px;height:52px;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer}
.cc-pad b:hover{border-color:#F07C24}
.cc-sub{grid-column:1/-1;font-size:13px;color:#8A7362;margin-top:6px}
.cc-foot{display:flex;gap:10px;margin-top:10px}
.cc-foot button{flex:1;height:48px;border:0;border-radius:12px;font-family:inherit;font-size:17px;font-weight:700;cursor:pointer}
.cc-rand{background:#fff;border:2px solid #EADBC6 !important;color:#4A3424}
.cc-cancel{background:#E9DFD2;color:#4A3424}
.cc-done{background:#F07C24;color:#fff;box-shadow:0 3px 0 #C2671F}
.cc-done:hover{filter:brightness(1.06)}
`;

// ---------- 背景：排球場 ----------
function woodTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const x = c.getContext('2d');
  const base = ['#D9A86C', '#D3A064', '#DDAE74', '#CF9B60'];
  for (let i = 0; i < 16; i++) { x.fillStyle = base[i % 4]; x.fillRect(0, i * 64, 1024, 64); for (let k = 0; k < 4; k++) { x.fillStyle = '#0000000d'; x.fillRect(((i * 397 + k * 263) % 1024), i * 64, 2, 64); } x.fillStyle = '#00000018'; x.fillRect(0, i * 64, 1024, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function buildCourt(scene) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.45 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // 場地：角色站在自己半場中間偏網子，網子在後面
  const court = new THREE.Mesh(new THREE.PlaneGeometry(9, 18), new THREE.MeshStandardMaterial({ color: '#E58A4A', roughness: 0.5 }));
  court.rotation.x = -Math.PI / 2; court.position.set(0, 0.002, -3); court.receiveShadow = true; scene.add(court);
  const lineM = new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), line = (w, d, px, pz) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineM); m.rotation.x = -Math.PI / 2; m.position.set(px, 0.004, pz); scene.add(m); };
  line(9, 0.05, 0, 6); line(9, 0.05, 0, -12); line(0.05, 18, -4.5, -3); line(0.05, 18, 4.5, -3); line(9, 0.05, 0, -3); line(9, 0.05, 0, 0); line(9, 0.05, 0, -6);
  // 網子
  const netZ = -3, top = 2.43;
  const pm = new THREE.MeshStandardMaterial({ color: '#E6E6E6', roughness: 0.4, metalness: 0.3 });
  for (const sx of [-5.2, 5.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 12), pm); p.position.set(sx, 1.3, netZ); p.castShadow = true; scene.add(p); }
  const nc = document.createElement('canvas'); nc.width = 512; nc.height = 64; const nx = nc.getContext('2d'); nx.strokeStyle = '#1D1D22'; nx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 8) { nx.beginPath(); nx.moveTo(i, 0); nx.lineTo(i, 64); nx.stroke(); } for (let j = 0; j <= 64; j += 8) { nx.beginPath(); nx.moveTo(0, j); nx.lineTo(512, j); nx.stroke(); }
  const nt = new THREE.CanvasTexture(nc); nt.wrapS = THREE.RepeatWrapping; nt.repeat.set(5, 1);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 1), new THREE.MeshBasicMaterial({ map: nt, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 }));
  net.position.set(0, top - 0.5, netZ); scene.add(net);
  for (const [y, h] of [[top - 0.035, 0.07], [top - 1, 0.05]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(10.2, h, 0.01), new THREE.MeshStandardMaterial({ color: '#F4F4F4' })); b.position.set(0, y, netZ); scene.add(b); }
  // 牆、看板
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshStandardMaterial({ color: '#EFE6D8', roughness: 0.9 })); wall.position.set(0, 5, -16); scene.add(wall);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(40, 1.2), new THREE.MeshStandardMaterial({ color: '#2E5E9E', roughness: 0.8 })); band.position.set(0, 0.6, -15.99); scene.add(band);
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), wall.material); w.position.set(sx * 14, 5, 0); w.rotation.y = -sx * Math.PI / 2; scene.add(w); }
}
function lights(scene, shadow) {
  scene.add(new THREE.HemisphereLight('#FFF6EA', '#A98458', 1.5));
  const sun = new THREE.DirectionalLight('#FFFFFF', 2.3); sun.position.set(2.5, 6, 4);
  if (shadow) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 5; Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 15 }); sun.shadow.bias = -0.0004; }
  scene.add(sun); const fill = new THREE.DirectionalLight('#FFE6CC', 0.8); fill.position.set(-3, 2, 3); scene.add(fill);
}

// ---------- 格子縮圖：離屏畫一次，存成圖片 ----------
class Thumbs {   // 用主畫面的畫布畫縮圖（只開一個 3D 畫布），畫完複製到小圖
  constructor(renderer) {
    this.r = renderer; this.S = 192; this.c = document.createElement('canvas'); this.c.width = this.c.height = this.S; this.x = this.c.getContext('2d');
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#F4ECE1'); lights(this.scene, false); this.cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20); this.cache = new Map();
  }
  shot(look, kit, shotKey, pose) {
    const key = JSON.stringify([look, kit, shotKey, pose || '']); if (this.cache.has(key)) return this.cache.get(key);
    const av = makeToyAvatar(look, kit); applyStaticPose(av, PREVIEW_POSES[pose || 'idle']); this.scene.add(av.g);
    const [p, t] = SHOTS[shotKey]; this.cam.position.set(...p); this.cam.lookAt(...t);
    const r = this.r, dpr = r.getPixelRatio(), S = this.S, sz = r.getSize(new THREE.Vector2());
    const small = r.domElement.width < S || r.domElement.height < S;   // 視窗太小（最小化、隱藏）時先把畫布撐開，不然複製會出錯
    if (small) r.setSize(Math.max(sz.x, S / dpr), Math.max(sz.y, S / dpr), false);
    r.setScissorTest(true); r.setViewport(0, 0, S / dpr, S / dpr); r.setScissor(0, 0, S / dpr, S / dpr);
    r.render(this.scene, this.cam);
    this.x.clearRect(0, 0, S, S); this.x.drawImage(r.domElement, 0, r.domElement.height - S, S, S, 0, 0, S, S);
    r.setScissorTest(false); if (small) r.setSize(sz.x, sz.y, false); r.setViewport(0, 0, sz.x, sz.y);
    const url = this.c.toDataURL('image/png'); this.scene.remove(av.g); this.cache.set(key, url); return url;
  }
  dispose() {}
}

export function openCreator({ look = DEFAULT_LOOK, mode = 'create', onDone, onCancel } = {}) {
  let L = { ...DEFAULT_LOOK, ...look }, kit = 'orange', pose = 'idle', expr = '', cat = 'hair', av = null, yaw = 0.35, zoom = 0;
  if (!document.getElementById('cc-css')) { const st = document.createElement('style'); st.id = 'cc-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.className = 'cc';
  root.innerHTML = `<div class="cc-stage"><div class="cc-title">${mode === 'create' ? '建立你的角色' : '調整外觀'}</div><div class="cc-tip">拖曳可以轉動角色・滾輪拉近</div></div>
    <div class="cc-panel"><div class="cc-cats"></div><div class="cc-h"></div><div class="cc-grid"></div>
    <div class="cc-foot"><button class="cc-rand">隨機</button>${mode === 'edit' ? '<button class="cc-cancel">取消</button>' : ''}<button class="cc-done">${mode === 'create' ? '完成，開始遊戲' : '儲存'}</button></div></div>`;
  document.body.appendChild(root);
  const stage = root.querySelector('.cc-stage'), catsEl = root.querySelector('.cc-cats'), gridEl = root.querySelector('.cc-grid'), hEl = root.querySelector('.cc-h');

  // 主畫面
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; stage.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#E8DCCB'); scene.fog = new THREE.Fog('#E8DCCB', 12, 30);
  buildCourt(scene); lights(scene, true);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60), camPos = new THREE.Vector3(), camAt = new THREE.Vector3();
  const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(stage); resize();
  const thumbs = new Thumbs(renderer);

  const rebuild = () => {
    if (av) scene.remove(av.g);
    av = makeToyAvatar(L, kit); applyStaticPose(av, PREVIEW_POSES[pose]); if (expr) setExpression(av, expr);
    av.g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(av.g);
  };
  const shotOf = () => (zoom > 0.5 ? 'head' : CATS.find((c) => c.k === cat).shot);
  // 拖曳轉身、滾輪拉近
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { drag = e.clientX; renderer.domElement.setPointerCapture(e.pointerId); });
  renderer.domElement.addEventListener('pointermove', (e) => { if (drag != null) { yaw += (e.clientX - drag) * 0.012; drag = e.clientX; } });
  renderer.domElement.addEventListener('pointerup', () => (drag = null));
  renderer.domElement.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0, Math.min(1, zoom + (e.deltaY < 0 ? 0.5 : -0.5))); }, { passive: false });

  const set = (k, v) => { L[k] = v; if (k === 'pants' && v === 1) L.knee = 2; rebuild(); drawCats(); drawGrid(); };
  function cellsFor(c) {
    const out = [], base = { ...L };
    if (c.k === 'preview') return null;
    const n = OPTIONS[c.k].length;
    for (let i = 0; i < n; i++) {
      const lk = { ...base, [c.k]: i }; if (c.k === 'pants' && i === 1) lk.knee = 2;
      out.push({ i, label: c.names ? c.names[i] : OPTIONS[c.k][i], color: c.swatch ? OPTIONS[c.k][i] : null, img: c.swatch ? null : () => thumbs.shot(lk, kit, c.shot === 'bust' ? 'bust' : c.k === 'eyes' ? 'face' : c.shot), off: c.k === 'knee' && L.pants === 1 && i !== 2 });
    }
    return out;
  }
  function drawCats() {
    catsEl.innerHTML = '';
    for (const c of CATS) {
      const el = document.createElement('div'); el.className = 'cc-cat' + (c.k === cat ? ' on' : '');
      let ic;
      if (c.k === 'num') ic = `<div class="ic">${L.num}</div>`;
      else if (c.k === 'preview') ic = `<div class="ic">▶</div>`;
      else if (c.swatch) ic = `<div class="ic"><div style="width:30px;height:30px;border-radius:50%;background:${OPTIONS[c.k][L[c.k]]};box-shadow:inset 0 -4px 8px #0002"></div></div>`;
      else ic = `<img src="${thumbs.shot(L, kit, c.k === 'eyes' ? 'face' : c.shot)}">`;
      el.innerHTML = ic + c.name; el.onclick = () => { cat = c.k; zoom = 0; drawCats(); drawGrid(); };
      catsEl.appendChild(el);
    }
  }
  function cell(html, on, onclick, off) { const el = document.createElement('div'); el.className = 'cc-opt' + (on ? ' on' : '') + (off ? ' off' : ''); el.innerHTML = html; el.onclick = onclick; gridEl.appendChild(el); return el; }
  function drawGrid() {
    const c = CATS.find((x) => x.k === cat); gridEl.innerHTML = '';
    hEl.innerHTML = `${c.name}<small>${c.k === 'preview' ? '遊戲中按 T 換表情、動作' : c.k === 'knee' && L.pants === 1 ? '穿長褲時不戴護膝' : c.k === 'top' ? '球衣顏色依開賽時的隊伍自動分配' : ''}</small>`;
    if (c.k === 'num') {
      const box = document.createElement('div'); box.className = 'cc-num';
      box.innerHTML = `<div class="big">${L.num}</div><div class="cc-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '清除', 0, '⌫'].map((d) => `<b data-d="${d}">${d}</b>`).join('')}</div><div class="cc-sub">背號 0～99，印在球衣前後</div>`;
      box.onclick = (e) => { const d = e.target.dataset && e.target.dataset.d; if (d == null) return; let s = String(L.num);
        if (d === '清除') s = '0'; else if (d === '⌫') s = s.length > 1 ? s.slice(0, -1) : '0'; else s = s === '0' ? d : (s + d).slice(-2);
        set('num', +s); };
      gridEl.appendChild(box); return;
    }
    if (c.k === 'preview') {
      const sub = (t) => { const d = document.createElement('div'); d.className = 'cc-sub'; d.textContent = t; gridEl.appendChild(d); };
      sub('隊服（開賽時自動分配，這裡只是看看）');
      for (const k in KITS) cell(`<img src="${thumbs.shot(L, k, 'torso')}"><span>${KITS[k].name}</span>`, kit === k, () => { kit = k; rebuild(); drawCats(); drawGrid(); });
      sub('表情');
      for (const k in EXPRESSIONS) cell(`<div class="tx">${{ '': '•‿•', happy: '^ ^', focus: '•_•', strain: '&gt; &lt;', sad: 'T T', wow: 'o o' }[k]}</div><span>${EXPRESSIONS[k].replace(/[<>]/g, '').trim()}</span>`, expr === k, () => { expr = k; rebuild(); drawGrid(); });
      sub('動作');
      for (const k in PREVIEW_POSES) cell(`<img src="${thumbs.shot(L, kit, 'full', k)}"><span>${PREVIEW_POSES[k].name}</span>`, pose === k, () => { pose = k; rebuild(); drawGrid(); });
      return;
    }
    for (const o of cellsFor(c)) cell(o.color ? `<div class="sw" style="background:${o.color}"></div><span>${o.label}</span>` : `<img src="${o.img()}"><span>${o.label}</span>`, L[c.k] === o.i, () => set(c.k, o.i), o.off);
  }
  root.querySelector('.cc-rand').onclick = () => { L = randomLook(Math.floor(Math.random() * 1e9)); rebuild(); drawCats(); drawGrid(); };
  root.querySelector('.cc-done').onclick = () => { close(); onDone && onDone({ ...L }); };
  const cancel = root.querySelector('.cc-cancel'); if (cancel) cancel.onclick = () => { close(); onCancel && onCancel(); };

  rebuild(); drawCats(); drawGrid();
  // 鏡頭跟著選的部位移動（角色放在畫面中間偏左一點）
  camPos.set(...SHOTS.full[0]); camAt.set(...SHOTS.full[1]);
  let alive = true, last = performance.now();
  (function loop(now) {
    if (!alive) return; requestAnimationFrame(loop);
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0)); last = now;
    const [p, t] = SHOTS[shotOf()], k = 1 - Math.exp(-dt * 6);
    camPos.lerp(new THREE.Vector3(...p), k); camAt.lerp(new THREE.Vector3(...t), k);
    camera.position.copy(camPos); camera.lookAt(camAt);
    if (av) { av.g.rotation.y += (yaw - av.g.rotation.y) * k; av.spine.rotation.z = Math.sin(now / 900) * 0.012; }
    renderer.render(scene, camera);
  })(last);

  window.__cc = { renderer, scene, camera, get av() { return av; } };
  function close() { alive = false; ro.disconnect(); renderer.dispose(); thumbs.dispose(); root.remove(); }
  return close;
}
