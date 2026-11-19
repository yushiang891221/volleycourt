// ---------------------------------------------------------------- 元件素材庫（tools/blender/build_assets.py 建模、烘焙 AO → models/gym-kit.glb）
const KIT_V = '57';  // 素材庫重建時改這個數字，瀏覽器才會抓新檔
// 每個模組的材質名稱就是角色（navy、leather、wood…），這裡換成網站自己的材質（貼圖以公尺計），再把烘好的 AO 貼在第二組 UV。
// 素材庫還沒載入（或載入失敗）時，各元件照舊用程式組出來的版本。
const KIT = { ready: false, parts: new Map(), mats: new Map(), ao: null };
function kitBase(role) {
  const S = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, ...o });
  switch (role) {
    case 'navy': return S('#22304A', { roughness: 0.45, metalness: 0.15 });
    case 'navy_pad': return leatherMat('#24345A');
    case 'leather': return leatherMat(null);
    case 'cushion': return leatherMat('#3E4A5E');
    case 'wood': return woodMat;
    case 'chrome': return chrome;
    case 'darksteel': return darkSteel;
    case 'aluminium': return S('#B9BCC0', { roughness: 0.32, metalness: 0.85 });
    case 'white': return S('#E9ECEE', { roughness: 0.35 });
    case 'red': return S('#B8352E', { roughness: 0.38 });
    case 'ceramic': return S('#F6F6F3', { roughness: 0.1 });
    case 'quartz': return S('#ECEAE5', { roughness: 0.22 });
    case 'rubber': return S('#141414', { roughness: 0.85 });
    case 'leaf': return S('#4E7A46', { roughness: 0.65, side: THREE.DoubleSide });
    case 'pot': return S('#D9CDB8', { roughness: 0.8 });
    case 'ball_y': return S('#F2C230', { roughness: 0.45 });
    case 'ball_b': return S('#2F5D8C', { roughness: 0.45 });
    case 'ball_w': return S('#F4F4F0', { roughness: 0.45 });
    case 'screen': return S('#10161D', { roughness: 0.15, emissive: '#2E5470', emissiveIntensity: 0.45 });
    case 'glass': return S('#D7E6EA', { roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false });
    case 'emit': return ledMat;
    case 'can_r': return S('#C0392B', { roughness: 0.3, metalness: 0.5 });
    case 'can_g': return S('#2E8B57', { roughness: 0.3, metalness: 0.5 });
    case 'can_y': return S('#E8B019', { roughness: 0.3, metalness: 0.5 });
    case 'can_w': return S('#E8E8E6', { roughness: 0.3, metalness: 0.5 });
    case 'plastic': return S('#EEF0F1', { roughness: 0.42 });
    case 'fabric_w': return S('#ECEBE7', { roughness: 0.95, side: THREE.DoubleSide });
    case 'curtain': return S('#7A5A3E', { roughness: 0.9, side: THREE.DoubleSide });
    case 'stainless': return S('#C8CCD0', { roughness: 0.28, metalness: 0.9 });
    case 'canvas': return S('#1F2A40', { roughness: 0.85 });
    case 'laminate': return S('#CFC8BC', { roughness: 0.45 });
    case 'green': return S('#1E9E4A', { roughness: 0.4 });
    default: return S('#9AA5B1');
  }
}
function kitMat(role, tint) {
  const key = tint ? role + tint : role;
  if (!KIT.mats.has(key)) {
    const m = (tint ? (role === 'navy_pad' ? leatherMat(tint) : new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9, side: THREE.DoubleSide })) : kitBase(role)).clone();
    if (!m.transparent && role !== 'emit') { m.aoMap = KIT.ao; m.aoMapIntensity = 1; }
    m.envMapIntensity = m.userData.env ?? 0.3; m.userData.envSet = true;
    KIT.mats.set(key, m);
  }
  return KIT.mats.get(key);
}
// 放一個模組到 g；opts: rotY（弧度）、sx/sy/sz（微調比例，只用在格數換算後的 ±10% 以內）。素材庫還沒好就回傳 null
function kit(name, g, x = 0, y = 0, z = 0, o = {}) {
  const parts = KIT.ready && KIT.parts.get(name);
  if (!parts) return null;
  const grp = new THREE.Group();
  for (const pt of parts) {
    const m = new THREE.Mesh(pt.geometry, kitMat(pt.role, o.tint && o.tint[pt.role]));
    if (pt.role === 'glass' || pt.role === 'emit') m.userData.noInk = true;
    if (pt.role === 'leaf') m.userData.noInk = true;
    m.userData.softInk = true; m.userData.role = pt.role;
    grp.add(m);
  }
  grp.position.set(x, y, z);
  if (o.rotY) grp.rotation.y = o.rotY;
  grp.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  g.add(grp);
  return grp;
}
function loadKit() {
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  KIT.ao = new THREE.TextureLoader().load('assets/models/gym-kit-ao.jpg?v=' + KIT_V);
  KIT.ao.flipY = false;          // glTF 的 UV 方向
  KIT.ao.channel = 1;            // 第二組 UV（TEXCOORD_1）
  loader.load('assets/models/gym-kit.glb?v=' + KIT_V, (gltf) => {
    for (const node of gltf.scene.children) {
      const parts = [];
      node.traverse((o) => { if (o.isMesh) parts.push({ geometry: o.geometry, role: o.material.name }); });
      if (parts.length) KIT.parts.set(node.name, parts);
    }
    KIT.ready = true;
    if (state) { buildZones(); renderItems(); window.wakeRender && window.wakeRender(1200); }
  }, undefined, (err) => { console.warn('素材庫載入失敗，改用程式組出來的元件', err); });
}
function tag(g, text, y, cls = '', x = 0, z = 0) {
  const el = document.createElement('div');
  el.className = 'tag ' + cls;
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.set(x, y, z);
  o.userData.isTag = true;
  g.add(o);
  return o;
}

// ---------------------------------------------------------------- court textures
// ---------------------------------------------------------------- court textures
const PX = 40; // pixels per metre
const texCache = new Map();
// 複合球場：同一塊地板上加畫其他球場的線（各用不同顏色），可以選現在架哪一種網；每面球場也可以選地板
const PLAY = { vb: [18, 9], bd: [13.4, 6.1], pb: [13.41, 6.1], bk: [15, 11] };
const SPORT = { vb: '排球', bd: '羽球', pb: '匹克球', bk: '籃球' };
const EXTRA_COL = { vb: '#FFFFFF', bd: '#F2C230', pb: '#5BC0EB', bk: '#FF7A2F' };
// 木地板（淺木色）上黃色、淺藍看不清楚：換成綠、深藍、紅
const EXTRA_COL_WOOD = { vb: '#FFFFFF', bd: '#1E8A4C', pb: '#1F5FBF', bk: '#C8361D' };
const VB_POST = { '': '標準網柱（配重底座）', sleeve: '地板插管式＋藍色防護套' };
const COURT_SURF = { '': '跟全館一樣', pvc: 'PVC 運動地墊', pu: 'PU 地坪', wood: '木質地板', tiles: '拼裝式地墊' };
// 在 fw×fd 的地板上排幾面 kind 球場（同方向或轉 90°，取放得多的那種）；回傳中心（本地座標）與是否轉向
function extraLayout(kind, fw, fd) {
  const [pw, pd] = PLAY[kind];
  if (kind === 'bk' || kind === 'vb') return [{ x: 0, z: 0, r: (fw >= fd) !== (pw >= pd) }];
  const gap = 0.9, m = 0.3, fit = (a, b) => Math.max(0, Math.floor((a - 2 * m + gap) / (b + gap)));
  const A = [fit(fw, pw), fit(fd, pd)], Bv = [fit(fw, pd), fit(fd, pw)];
  const useB = Bv[0] * Bv[1] > A[0] * A[1], [nx, nz] = useB ? Bv : A, [sx, sz] = useB ? [pd, pw] : [pw, pd];
  const out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) out.push({ x: (i - (nx - 1) / 2) * (sx + gap), z: (j - (nz - 1) / 2) * (sz + gap), r: useB });
  return out.slice(0, 6);
}
// 畫一面球場的線：中心 (cx, cy)（公尺，畫布座標），r＝轉 90°
function drawCourtLines(c, kind, cx, cy, r, color, PXm) {
  const [cw, cd] = PLAY[kind], P = (m) => m * PXm, lw = 0.05 * PXm;
  c.save(); c.translate(P(cx), P(cy)); if (r) c.rotate(Math.PI / 2);
  c.strokeStyle = color; c.lineWidth = lw;
  const x0 = -cw / 2, y0 = -cd / 2, line = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(P(x1), P(y1)); c.lineTo(P(x2), P(y2)); c.stroke(); };
  c.strokeRect(P(x0) + lw / 2, P(y0) + lw / 2, P(cw) - lw, P(cd) - lw);
  if (kind === 'vb') { line(0, y0, 0, -y0); line(-3, y0, -3, -y0); line(3, y0, 3, -y0); }
  else if (kind === 'bd') { line(x0, y0 + 0.46, -x0, y0 + 0.46); line(x0, -y0 - 0.46, -x0, -y0 - 0.46); line(-1.98, y0, -1.98, -y0); line(1.98, y0, 1.98, -y0); line(x0 + 0.76, y0, x0 + 0.76, -y0); line(-x0 - 0.76, y0, -x0 - 0.76, -y0); line(x0, 0, -1.98, 0); line(1.98, 0, -x0, 0); }
  else if (kind === 'pb') { line(-2.13, y0, -2.13, -y0); line(2.13, y0, 2.13, -y0); line(x0, 0, -2.13, 0); line(2.13, 0, -x0, 0); }
  else if (kind === 'bk') {
    // 半場：籃框在 y0 那一端
    const hy = y0 + 1.575; c.strokeRect(P(-2.45), P(y0), P(4.9), P(5.8));
    c.beginPath(); c.arc(0, P(y0 + 5.8), P(1.8), 0, Math.PI * 2); c.stroke();
    c.save(); c.beginPath(); c.rect(P(x0), P(y0), P(cw), P(cd)); c.clip(); c.beginPath(); c.arc(0, P(hy), P(6.75), 0, Math.PI); c.stroke(); line(-6.75, y0, -6.75, hy); line(6.75, y0, 6.75, hy); c.restore();
  }
  c.restore();
}
function courtTexture(kind, fw, fd, mode, schemeKey, cc, extra, surf) {
  const key = [kind, fw, fd, mode, schemeKey, JSON.stringify(state.colors || {}), JSON.stringify(cc || {}), (extra || []).join(','), surf || ''].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const sc = { ...(schemeKey === state.floor ? scheme() : SCHEMES[schemeKey]), ...(cc || {}) };
  if (surf) { sc.grain = surf === 'wood'; sc.tiles = surf === 'tiles'; if (surf === 'wood' && !(cc && cc.court)) { sc.court = '#E3C08C'; if (!(cc && cc.free)) sc.free = '#D9B27A'; } }
  const cv = document.createElement('canvas');
  cv.width = Math.round(fw * PX); cv.height = Math.round(fd * PX);
  const c = cv.getContext('2d');
  const solid = mode !== 'lines';
  const lineCol = solid ? '#FFFFFF' : ({ vb: '#FFFFFF', bd: '#F5F5F5', pb: '#F2C230', bk: '#FF9A55' })[kind];
  const lw = 0.05 * PX;
  const P = (m) => m * PX;
  c.lineWidth = lw; c.strokeStyle = lineCol; c.lineCap = 'butt';
  const rectLine = (x, y, w, h) => c.strokeRect(P(x) + lw / 2, P(y) + lw / 2, P(w) - lw, P(h) - lw);
  const line = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(P(x1), P(y1)); c.lineTo(P(x2), P(y2)); c.stroke(); };
  const [cw, cd] = ({ vb: [18, 9], bd: [13.4, 6.1], pb: [13.41, 6.1], bk: [15, 11] })[kind];
  const x0 = (fw - cw) / 2, y0 = kind === 'bk' ? 1 : (fd - cd) / 2;
  if (solid) {
    c.fillStyle = kind === 'vb' ? sc.free : sc.base; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = ({ vb: sc.court, bd: sc.bd, pb: sc.pb, bk: sc.bk })[kind];
    c.fillRect(P(x0), P(y0), P(cw), P(cd));
    if (sc.tiles) {   // 拼裝式地墊：30.5 cm 一塊，接縫＋表面的小透氣孔
      const t = 0.305 * PX;
      c.fillStyle = 'rgba(0,0,0,.18)'; for (let x = 0; x < cv.width; x += t) c.fillRect(x, 0, 1.2, cv.height); for (let y = 0; y < cv.height; y += t) c.fillRect(0, y, cv.width, 1.2);
      c.fillStyle = 'rgba(0,0,0,.08)'; for (let x = t / 6; x < cv.width; x += t / 3) for (let y = t / 6; y < cv.height; y += t / 3) c.fillRect(x, y, 2, 2);
    }
    if (sc.grain) {   // 木紋運動地板：7 cm 寬的長條木板、色差、接縫
      const r = rnd32(5), pl = 0.07 * PX;
      for (let y = 0; y < cv.height; y += pl) {
        let x = -r() * 120;
        while (x < cv.width) { const len = 60 + r() * 140; c.fillStyle = `rgba(${r() < 0.5 ? '90,55,20' : '255,235,200'},${0.05 + r() * 0.09})`; c.fillRect(x, y, len, pl); c.fillStyle = 'rgba(80,50,20,.18)'; c.fillRect(x, y, 1, pl); x += len; }
        c.fillStyle = 'rgba(80,50,20,.12)'; c.fillRect(0, y, cv.width, 1);
      }
    }
  }
  if (kind === 'vb') {
    rectLine(x0, y0, cw, cd);
    line(fw / 2, y0, fw / 2, y0 + cd);
    line(fw / 2 - 3, y0, fw / 2 - 3, y0 + cd); line(fw / 2 + 3, y0, fw / 2 + 3, y0 + cd);
  } else if (kind === 'bd') {
    rectLine(x0, y0, cw, cd);
    line(x0, y0 + 0.46, x0 + cw, y0 + 0.46); line(x0, y0 + cd - 0.46, x0 + cw, y0 + cd - 0.46);
    const mid = fw / 2;
    line(mid - 1.98, y0, mid - 1.98, y0 + cd); line(mid + 1.98, y0, mid + 1.98, y0 + cd);
    line(x0 + 0.76, y0, x0 + 0.76, y0 + cd); line(x0 + cw - 0.76, y0, x0 + cw - 0.76, y0 + cd);
    line(x0, fd / 2, mid - 1.98, fd / 2); line(mid + 1.98, fd / 2, x0 + cw, fd / 2);
  } else if (kind === 'pb') {
    const mid = fw / 2;
    if (solid) { c.fillStyle = sc.kitchen; c.fillRect(P(mid - 2.13), P(y0), P(4.26), P(cd)); }
    rectLine(x0, y0, cw, cd);
    line(mid - 2.13, y0, mid - 2.13, y0 + cd); line(mid + 2.13, y0, mid + 2.13, y0 + cd);
    line(x0, fd / 2, mid - 2.13, fd / 2); line(mid + 2.13, fd / 2, x0 + cw, fd / 2);
  } else if (kind === 'bk') {
    const cx = fw / 2, hy = y0 + 1.575;
    if (solid) { c.fillStyle = sc.key; c.fillRect(P(cx - 2.45), P(y0), P(4.9), P(5.8)); }
    rectLine(x0, y0, cw, cd);
    c.strokeRect(P(cx - 2.45), P(y0), P(4.9), P(5.8));
    c.beginPath(); c.arc(P(cx), P(y0 + 5.8), P(1.8), 0, Math.PI * 2); c.stroke();
    c.save(); c.beginPath(); c.rect(P(x0), P(y0), P(cw), P(cd)); c.clip();
    c.beginPath(); c.arc(P(cx), P(hy), P(6.75), 0, Math.PI); c.stroke();
    line(cx - 6.75, y0, cx - 6.75, hy); line(cx + 6.75, y0, cx + 6.75, hy);
    c.restore();
  }
  // 複合球場：其他球場的線（不同顏色）
  for (const k2 of extra || []) for (const L of extraLayout(k2, fw, fd)) drawCourtLines(c, k2, fw / 2 + L.x, fd / 2 + L.z, L.r, (sc.grain ? EXTRA_COL_WOOD : EXTRA_COL)[k2], PX);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texCache.set(key, tex);
  return tex;
}
let netTex = null;
const netTexW = (() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const c = cv.getContext('2d'); c.strokeStyle = 'rgba(245,245,240,0.9)'; c.lineWidth = 1.4;
  for (let x = 0; x <= 256; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 64); c.stroke(); } for (let y = 0; y <= 64; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
function netTexture(tone) {
  if (tone === 'white') return netTexW;
  if (netTex) return netTex;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.strokeStyle = 'rgba(20,20,20,0.85)'; c.lineWidth = 1.2;
  for (let x = 0; x <= 256; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 64); c.stroke(); }
  for (let y = 0; y <= 64; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); }
  netTex = new THREE.CanvasTexture(cv);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  return netTex;
}
// 網架：羽球＝滾筒式移動羽球柱（鋁管＋可推的滾筒底座）；匹克球＝綠色鋼架移動網架（底部橫桿＋斜撐＋腳座）；籃球＝籃架
function netSet(g, kind, x, z, r) {
  const o = new THREE.Group(); o.position.set(x, 0, z); if (r) o.rotation.y = Math.PI / 2; g.add(o);
  if (kind === 'bd') {
    for (const s2 of [1, -1]) {
      const zz = s2 * 3.05;
      cyl(o, 0.024, 0.024, 1.55, chrome, 0, 0.12, zz);
      cyl(o, 0.032, 0.032, 0.08, '#C0392B', 0, 1.62, zz);                       // 圓頭
      const rol = cyl(o, 0.12, 0.12, 0.6, '#B9BCC0', 0, 0.12, zz + s2 * 0.18, { metalness: 0.7, roughness: 0.35 }); rol.rotation.z = Math.PI / 2; rol.position.y = 0.12;
      for (const sx of [-1, 1]) { const wh = cyl(o, 0.12, 0.12, 0.035, '#1F2124', sx * 0.31, 0.12, zz + s2 * 0.18); wh.rotation.z = Math.PI / 2; wh.position.y = 0.12; }
      box(o, 0.05, 0.05, 0.3, chrome, 0, 0.18, zz + s2 * 0.08);
    }
    net(o, 6.1, 1.55, 0.76);
  } else if (kind === 'pb') {
    const green = '#1E6B3A', hw = 3.35;
    for (const s2 of [1, -1]) {
      box(o, 0.06, 0.914, 0.06, green, 0, 0, s2 * hw);
      box(o, 0.7, 0.05, 0.06, green, 0, 0, s2 * hw);                                // 腳座
      for (const sx of [-1, 1]) cyl(o, 0.025, 0.025, 0.03, '#1F2124', sx * 0.32, 0, s2 * hw);
      const br = box(o, 0.04, 0.55, 0.04, green, 0, 0.05, s2 * (hw - 0.22)); br.rotation.x = s2 * 0.75;   // 斜撐
      if (s2 > 0) { const cr = box(o, 0.02, 0.12, 0.02, '#B9BCC0', 0.05, 0.62, hw + 0.05); cr.rotation.z = 0.6; }  // 搖桿
    }
    box(o, 0.06, 0.06, hw * 2, green, 0, 0, 0);                                     // 底部橫桿
    net(o, 6.7, 0.914, 0.8);
  } else if (kind === 'bk') {
    const zb = -PLAY.bk[1] / 2;
    box(o, 1.8, 1.05, 0.05, '#F4F7FA', 0, 2.9, zb + 1.2, { transparent: true, opacity: 0.85 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.012, 8, 28), mat('#E2582B')); rim.rotation.x = Math.PI / 2; rim.position.set(0, 3.05, zb + 1.575); o.add(rim);
    cyl(o, 0.08, 0.08, 3.5, '#2B3A4F', 0, 0, zb - 0.5); box(o, 0.1, 0.1, 1.75, '#2B3A4F', 0, 3.25, zb + 0.35); box(o, 1.2, 0.3, 1.6, '#2B3A4F', 0, 0, zb - 0.7);
  } else if (kind === 'vb') {
    const nh = NETS[state.net].h;
    for (const zz of [5.5, -5.5]) { cyl(o, 0.045, 0.045, nh + 0.25, chrome, 0, 0, zz); cyl(o, 0.13, 0.13, 1.9, padMat, 0, 0.05, zz, null, 20); }
    net(o, 10.6, nh, 1.0, '#FFFFFF', 'PLAY ONE');
  }
  return o;
}
// 地板插管式網柱：鋼柱直接插進地板的預埋套管（地上只看到一片小蓋板），外面整支包著藍色帆布防護套，
// 中間一條橘色魔鬼氈固定帶；套子比柱子寬、斷面是圓角長方形，上方露出灰色鋁柱和網子的掛鉤
let SLEEVE_GEO = null;
function sleevePost(g, x, z, nh, side) {
  const o = new THREE.Group(); o.position.set(x, 0, z); if (side < 0) o.rotation.y = Math.PI; g.add(o);
  const alu = { metalness: 0.75, roughness: 0.38 };
  cyl(o, 0.05, 0.05, nh + 0.32, '#A9AEB4', 0, 0, 0, alu, 20);                       // 鋁柱
  cyl(o, 0.058, 0.058, 0.03, '#7C8187', 0, nh + 0.32, 0, alu, 20);                    // 頂蓋
  cyl(o, 0.11, 0.11, 0.006, '#8E9399', 0, 0, 0, alu, 24);                            // 地板蓋板
  for (const y of [nh - 0.04, nh - 0.96]) box(o, 0.05, 0.05, 0.09, '#5E646B', 0, y, -0.07); // 掛網的勾座
  if (!SLEEVE_GEO) {
    const w = 0.30, d = 0.2, r = 0.075, sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -d / 2); sh.lineTo(w / 2 - r, -d / 2); sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    sh.lineTo(w / 2, d / 2 - r); sh.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); sh.lineTo(-w / 2 + r, d / 2);
    sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); sh.lineTo(-w / 2, -d / 2 + r); sh.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const ex = (h) => { const q = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 10 }); q.rotateX(-Math.PI / 2); return q; };
    SLEEVE_GEO = { pad: ex(1.98), strap: ex(0.05) };
  }
  const padM = new THREE.MeshPhysicalMaterial({ color: '#1F6FC9', roughness: 0.62, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#7DB6FF') });
  const pad = new THREE.Mesh(SLEEVE_GEO.pad, padM); pad.position.set(0, 0.02, 0.02); pad.castShadow = true; pad.receiveShadow = true; o.add(pad);
  const strap = new THREE.Mesh(SLEEVE_GEO.strap, new THREE.MeshStandardMaterial({ color: '#E8892B', roughness: 0.75 }));
  strap.scale.set(1.04, 1, 1.06); strap.position.set(0, 1.55, 0.02); o.add(strap);
  box(o, 0.008, 1.9, 0.012, '#164F93', 0, 0.06, 0.137);                              // 背面拉鍊接縫
  box(o, 0.03, 0.34, 0.004, '#FFFFFF', 0.06, 1.12, -0.118, { roughness: 0.6 });       // 正面白色標籤
  return o;
}
// 排球網印字（2026-11-19 使用者：像 FOSSIL 那樣用白色網線排出 PLAY ONE，但要像 VOLLEY 那樣看得到字又不擋視線）
//   整張網一張貼圖（不重複）：網目 6.25 cm 跟一般網子一樣；字裡面的網線換成白色、稍粗，網目還是空的，看得穿
const NET_TEXT_TEX = new Map();
function netTextTexture(span, depth, text, band = 4.5) {
  const key = `${span}|${depth}|${text}|${band}`; if (NET_TEXT_TEX.has(key)) return NET_TEXT_TEX.get(key);
  const CELL = 0.0625, PX = 12, cols = Math.round(span / CELL), rows = Math.round(depth / CELL), W = cols * PX, H = rows * PX, PPM = W / span;   // PPM＝每公尺幾像素
  // 2026-11-19 使用者給的樣子：細的無襯線字、字距拉開、整排排滿兩條側邊白帶中間；字高撐滿上下白帶之間，只留一點點空隙
  const TOP = 0.07, BOT = 0.05, SIDE = 0.05, GAP = 0.035;   // 上白帶、下白帶、側邊白帶寬（公尺）、字跟白帶的空隙
  const mk = document.createElement('canvas'); mk.width = W; mk.height = H; const m = mk.getContext('2d');   // 字的遮罩
  const FONT = (px) => `900 ${px}px "Helvetica Neue", Helvetica, "Arial Black", Arial, "Noto Sans TC", sans-serif`;
  const capH = (depth - TOP - BOT - GAP * 2) * PPM, base = (depth - BOT - GAP) * PPM;
  m.font = FONT(100); const asc = m.measureText('E').actualBoundingBoxAscent || 72, size = 100 * capH / asc; m.font = FONT(size); m.textBaseline = 'alphabetic';
  const chars = [...text], ws = chars.map((ch) => (ch === ' ' ? 0 : m.measureText(ch).width)), sum = ws.reduce((n, w) => n + w, 0);
  const gaps = chars.length - 1 + chars.filter((ch) => ch === ' ').length * 0.7;   // 空白＝字距的 1.7 倍
  const total = Math.min(span * 0.86, band * 2 - 0.7) * PPM, gap = Math.max(size * 0.12, (total - sum) / Math.max(1, gaps));
  let x = (W - (sum + gap * gaps)) / 2;
  m.fillStyle = '#fff';
  chars.forEach((ch, i) => { if (ch !== ' ') m.fillText(ch, x, base); x += ws[i] + (i < chars.length - 1 ? gap : 0) + (ch === ' ' ? gap * 0.7 : 0); });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const grid = (ctx, color, lw) => { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); for (let i = 0; i <= cols; i++) { ctx.moveTo(i * PX, 0); ctx.lineTo(i * PX, H); } for (let j = 0; j <= rows; j++) { ctx.moveTo(0, j * PX); ctx.lineTo(W, j * PX); } ctx.stroke(); };
  grid(c, 'rgba(20,20,20,0.85)', 1.8);
  // 字＝印在網線上：只有字經過的那段網線變白（網目一樣是空的，看得到對面）；字裡面的網線畫粗一點，細字也看得出形狀
  const lit = document.createElement('canvas'); lit.width = W; lit.height = H; const l = lit.getContext('2d');
  grid(l, 'rgba(255,255,255,0.38)', 6.5);   /* 2026-11-20：再粗一點、淡一點 */ l.globalCompositeOperation = 'destination-in'; l.drawImage(mk, 0, 0);
  c.globalAlpha = 0.06; c.drawImage(mk, 0, 0); c.globalAlpha = 1;   // 字裡面的網目鋪一層極淡的白（2026-11-19 使用者：太細太深 → 加粗；又說太深 → 字的網線半透明、底更淡）
  c.drawImage(lit, 0, 0);
  // 下白帶＋兩條側邊白帶（在邊線正上方、天線下面）：畫在網面上，網子被打到晃的時候一起晃
  c.fillStyle = '#F7F7F2'; c.fillRect(0, H - BOT * PPM, W, BOT * PPM);
  for (const z of [-band, band]) c.fillRect(W / 2 + z * PPM - SIDE * PPM / 2, 0, SIDE * PPM, H);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.colorSpace = THREE.SRGBColorSpace;
  NET_TEXT_TEX.set(key, t); return t;
}
function net(g, span, top, depth, tape = '#FFFFFF', text = '') {
  const t = text ? netTextTexture(span, depth, text) : netTexture().clone(); if (!text) { t.needsUpdate = true; t.repeat.set(span / 2, depth / 0.5); }
  // 網面分格：被球打到時可以讓網子局部鼓起來、晃幾下
  const m = new THREE.Mesh(new THREE.PlaneGeometry(span, depth, 24, 4), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.y = Math.PI / 2;
  m.position.set(0, top - depth / 2, 0);
  m.userData.netMesh = { span, depth, base: m.geometry.attributes.position.array.slice() };
  g.add(m);
  const tp = box(g, 0.02, 0.07, span, tape, 0, top - 0.07, 0); if (tp) tp.userData.netTape = true;
}
// 網子晃動：打到的地方往球的方向鼓起、像彈簧一樣來回幾下慢慢停（白帶打到時上緣也會抖）
const NETFX = [];
function netFxHit(c, lz, dir, amp, tape) {
  const g = itemsGroup.children.find((q) => q.userData.itemId === c.id); if (!g) return;
  const m = g.children.find((q) => q.userData.netMesh), tp = g.children.find((q) => q.userData.netTape); if (!m) return;
  const old = NETFX.find((f) => f.m === m); if (old) { old.t = 0; old.amp = Math.max(old.amp * 0.5, amp); old.lz = lz; old.dir = dir; old.tape = tape; return; }
  NETFX.push({ m, tp, tpY: tp ? tp.position.x : 0, lz, dir, amp, tape, t: 0 });
}
function netFxStep(dt) {
  for (let i = NETFX.length - 1; i >= 0; i--) {
    const f = NETFX[i]; f.t += dt;
    const D = f.m.userData.netMesh, pos = f.m.geometry.attributes.position, base = D.base, k = Math.exp(-f.t * 4.5) * Math.cos(f.t * 26), done = f.t > 1.4;
    // PlaneGeometry 的 x＝沿網子（span）、y＝高；旋轉後局部 z＝鼓出去的方向
    for (let j = 0; j < pos.count; j++) {
      const x = base[j * 3], y = base[j * 3 + 1], u = Math.exp(-((x - -f.lz) ** 2) / 2.2), v = f.tape ? 0.5 + (y / D.depth) : 1 - Math.abs(y) / (D.depth / 2) * 0.6;
      pos.setZ(j, done ? 0 : f.dir * f.amp * 0.22 * k * u * v);
    }
    pos.needsUpdate = true;
    if (f.tp) f.tp.position.x = done ? f.tpY : f.tpY + f.dir * f.amp * 0.05 * k;
    if (done) NETFX.splice(i, 1);
  }
}

// ---------------------------------------------------------------- item builders
// 球車、球籃裡的球：把素材庫的單色球藏起來，換成寫實排球（位置跟建模時一樣）
function realBalls(g, sx, sz, each) {
  g.traverse((o) => { if (o.isMesh && /^ball_/.test(o.userData.role || '')) o.visible = false; });
  each((x, y, z) => { const b = newBallMesh(true); b.scale.setScalar(0.98 / BALL_VIS); b.position.set(x * sx, y, z * sz); g.add(b); });
}
function buildItem(it, courtIndex) {
  const def = CAT[it.type];
  const { w, d } = sizeOf(it);
  const H = state.building.H;
  const g = new THREE.Group();
  g.userData.itemId = it.id;
  if (def.court) {
    const tex = courtTexture(def.court, def.w, def.d, it.mode, state.floor, it.cc, it.extra, it.surf);
    const lines = it.mode === 'lines';
    const cm = new THREE.MeshStandardMaterial({ map: tex, transparent: lines, roughness: 0.5, normalMap: phTex('smooth_concrete_floor', 'nor', def.w / 2, def.d / 2), normalScale: new THREE.Vector2(0.25, 0.25), polygonOffset: true, polygonOffsetFactor: -1 - courtIndex, polygonOffsetUnits: -1 - courtIndex });
    cm.userData.env = cm.envMapIntensity = 0.12;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(def.w, def.d), cm);
    plane.receiveShadow = true; plane.userData.noShadow = true;
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = (lines ? 0.014 : 0.006) + courtIndex * 0.0015;
    plane.userData.courtFloor = true;
    g.add(plane);
    const pc = '#22304A', use = it.use || def.court;
    if (use !== def.court && use !== 'none') for (const L of extraLayout(use, def.w, def.d)) netSet(g, use, L.x, L.z, L.r);
    if (use !== def.court) { /* 主場地的網收起來了 */ }
    else if (def.court === 'vb') {
      const nh = NETS[state.net].h;
      // 網柱：鋼管外包深藍防護套，底座配重
      for (const z of [5.5, -5.5]) if (it.post === 'sleeve') sleevePost(g, 0, z, nh, z > 0 ? 1 : -1);
      else if (!kit('net_post', g, 0, 0, z, { rotY: z > 0 ? 0 : Math.PI, tint: { navy_pad: scheme().pad } })) { cyl(g, 0.045, 0.045, nh + 0.25, chrome, 0, 0, z); cyl(g, 0.13, 0.13, 1.9, padMat, 0, 0.05, z, null, 20); cyl(g, 0.3, 0.3, 0.05, darkSteel, 0, 0, z, null, 24); }
      net(g, 10.6, nh, 1.0, '#FFFFFF', 'PLAY ONE');
      for (const z of [4.5, -4.5]) {
        const a = cyl(g, 0.006, 0.006, 1.8, '#E23A3A', 0, nh - 1.0, z);
        a.material = mat('#E23A3A');
      }
    } else if (def.court === 'bd' || def.court === 'pb') {
      netSet(g, def.court, 0, 0, false);
    } else if (def.court === 'bk') {
      const zb = -def.d / 2 + 1;               // baseline (local z)
      box(g, 1.8, 1.05, 0.05, '#F4F7FA', 0, 2.9, zb + 1.2, { transparent: true, opacity: 0.85 });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.012, 8, 28), mat('#E2582B'));
      rim.rotation.x = Math.PI / 2; rim.position.set(0, 3.05, zb + 1.575); g.add(rim);
      cyl(g, 0.08, 0.08, 3.5, '#2B3A4F', 0, 0, zb - 0.5);
      box(g, 0.1, 0.1, 1.75, '#2B3A4F', 0, 3.25, zb + 0.35);
      box(g, 1.2, 0.3, 1.6, '#2B3A4F', 0, 0, zb - 0.7);
    }
    if (def.tag) tag(g, labelOf(it) + (lines ? '（只畫線）' : ''), 0.25, 'court', 0, -def.d / 2 + 0.7);
  } else if (def.room) {
    const wallT = 0.1, h = def.h, door = Math.min(0.9, w - 0.4);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(def.color, { roughness: 0.9 }));
    fl.rotation.x = -Math.PI / 2; fl.position.y = 0.02; g.add(fl);
    const wc = '#EEF1F4';
    box(g, w, h, wallT, wc, 0, 0, d / 2 - wallT / 2);           // back wall (+z)
    box(g, wallT, h, d, wc, -w / 2 + wallT / 2, 0, 0);
    box(g, wallT, h, d, wc, w / 2 - wallT / 2, 0, 0);
    const side = (w - door) / 2;
    box(g, side, h, wallT, wc, -w / 2 + side / 2, 0, -d / 2 + wallT / 2); // front wall with door gap (-z)
    box(g, side, h, wallT, wc, w / 2 - side / 2, 0, -d / 2 + wallT / 2);
    box(g, door, 0.5, wallT, wc, 0, h - 0.5, -d / 2 + wallT / 2);
    box(g, Math.min(1.4, w * 0.4), 0.28, 0.03, def.color, 0, 2.15, -d / 2 - 0.02);
    if (it.type === 'wc') { for (let i = 0; i < Math.max(1, Math.floor((w - 1) / 1.2)); i++) box(g, 0.4, 0.42, 0.65, '#FFFFFF', -w / 2 + 0.9 + i * 1.2, 0, d / 2 - 0.5); }
    if (it.type === 'shower') { for (let i = 0; i < Math.max(1, Math.floor(w / 1.0)); i++) box(g, 0.05, 2.0, 1.2, '#D9E7EC', -w / 2 + 1 + i * 1.0, 0, d / 2 - 0.7); }
    if (it.type === 'changing') { box(g, w - 0.6, 0.45, 0.4, '#C58B4E', 0, 0, d / 2 - 0.4); }
    if (it.type === 'office') { box(g, 1.4, 0.75, 0.7, '#D8C3A0', -w / 4, 0, 0); box(g, 0.6, 1.8, 0.4, '#6E7F92', w / 2 - 0.5, 0, d / 2 - 0.35); }
    tag(g, labelOf(it), h + 0.35);
  } else if (def.ceiling) {
    if (it.type === 'light') {
      // 條狀 LED：吊在屋架下，鋁殼＋朝下的發光面
      const y = H - 0.45;
      for (const s of [-1, 1]) cyl(g, 0.006, 0.006, 0.45, '#5A6676', s * (w / 2 - 0.25), y + 0.07, 0);
      const strip = kit('led_strip', g, 0, y - 0.012, 0, { sx: w / 2.4 });
      if (strip) strip.traverse((o) => { if (o.isMesh) { o.userData.pick = true; o.userData.noShadow = true; } });
      else {
        const housing = box(g, w, 0.07, 0.14, '#C9CCD0', 0, y, 0, { metalness: 0.5, roughness: 0.4 }); housing.userData.pick = true; housing.userData.noShadow = true;
        const lens = box(g, w - 0.04, 0.012, 0.11, ledMat, 0, y - 0.012, 0); lens.userData.noInk = true; lens.userData.noShadow = true;
      }
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.8, 1.0), new THREE.MeshBasicMaterial({ color: '#FFF4D8', transparent: true, opacity: 0.16, depthWrite: false }));
      pad.rotation.x = -Math.PI / 2; pad.position.y = 0.04; g.add(pad);
    } else if (it.type === 'smoke') {
      cyl(g, 0.08, 0.08, 0.05, '#F4F4F2', 0, H - 0.1, 0, null, 16);
      const led = cyl(g, 0.012, 0.012, 0.01, '#E23B3B', 0.04, H - 0.11, 0, { emissive: '#FF3B3B', emissiveIntensity: 1.2 }, 6);
    } else if (it.type === 'camera') {
      const y = Math.min(H - 1.2, 5.5);
      if (typeof snapCamera === 'function') snapCamera(it);
      // wall plate + arm, turned so the plate stays flat on the wall whatever way the camera looks
      const mount = new THREE.Group(); mount.rotation.y = (it.wallYaw ?? 0) - (it.rot * Math.PI) / 180; g.add(mount);
      box(mount, 0.04, 0.36, 0.28, '#9AA5B1', -0.38, y - 0.2, 0);
      box(mount, 0.32, 0.05, 0.06, '#5A6676', -0.22, y - 0.05, 0);
      const head = new THREE.Group(); head.position.set(0, y, 0); head.rotation.z = -0.3; g.add(head);
      const body = box(head, 0.34, 0.16, 0.18, '#22303F', 0, -0.08, 0); body.userData.focus = true;
      box(head, 0.4, 0.02, 0.22, '#2E3B4C', 0.03, 0.0, 0);
      const lens = cyl(head, 0.06, 0.06, 0.06, '#0E1520', 0.19, -0.06, 0, null, 16); lens.rotation.z = Math.PI / 2; lens.userData.focus = true;
      const led = cyl(head, 0.02, 0.02, 0.02, '#E23B3B', 0.1, 0.02, 0.05, { emissive: '#FF3B3B', emissiveIntensity: 1.5 }, 8);
      const reach = Math.max(6, Math.min(24, state.building.L * 0.6));
      const coneGeo = new THREE.ConeGeometry(Math.tan(0.5) * reach, reach, 4, 1, true);
      const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: '#4FC3F7', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
      cone.rotation.z = Math.PI / 2; cone.rotation.x = Math.PI / 4; cone.position.set(reach / 2, 0, 0);
      cone.userData.noPick = true; cone.userData.camCone = true; cone.visible = it.id === selectedId;
      const pivot = new THREE.Group(); pivot.position.set(0.22, y - 0.03, 0); pivot.rotation.z = -Math.atan2(y - 1, reach * 0.6); pivot.add(cone); g.add(pivot);
      tag(g, labelOf(it), y + 0.5);
    } else {
      const r = w / 2, yb = H - 1.2;
      cyl(g, 0.04, 0.04, 1.0, '#3A4654', 0, yb + 0.2, 0);
      cyl(g, 0.35, 0.35, 0.35, '#3A4654', 0, yb - 0.1, 0, null, 20);
      const rotor = new THREE.Group(); rotor.position.y = yb;
      for (let i = 0; i < 6; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(r - 0.3, 0.04, 0.32), mat('#C9D1D9'));
        blade.position.x = 0.3 + (r - 0.3) / 2;
        const arm = new THREE.Group(); arm.rotation.y = (i / 6) * Math.PI * 2; arm.add(blade); rotor.add(arm);
      }
      g.add(rotor); spinners.push(rotor); rotor.userData.spinOf = it.id;
      const pad = new THREE.Mesh(new THREE.RingGeometry(r - 0.05, r, 48), new THREE.MeshBasicMaterial({ color: '#3A4654', transparent: true, opacity: 0.45, depthWrite: false }));
      pad.rotation.x = -Math.PI / 2; pad.position.y = 0.03; g.add(pad);
      tag(g, `吊扇 Ø${fmt1(w)} m（葉片離地 ${fmt1(yb)} m）`, yb + 0.6);
    }
  } else if (def.wall) {
    if (typeof snapWallItem === 'function') snapWallItem(it);
    buildWallItem(g, it, w, d, def);
  } else {
    buildFurniture(g, it, w, d, def);
    if (def.tag) tag(g, labelOf(it), (def.h || 1) + 0.4);
  }
  g.position.set(it.x, 0, it.z);
  g.rotation.y = (it.rot * Math.PI) / 180;
  inkify(g, !!def.ceiling);
  g.traverse((o) => { if (o.isMesh) o.userData.itemId = it.id; if (o.userData.isTag && it.locked) o.element.classList.add('locked'); });
  return g;
}
// 共用模組：長度變了就改格數，不拉長單元（face = 正面朝 -z 或 +z）
function lockerBank(g, w, h, d, color = '#22304A', face = -1, z0 = 0) {
  const n = Math.max(1, Math.round(w / 0.4)), cw = w / n, fz = z0 + face * d / 2;
  if (KIT.ready && Math.abs(h - 1.9) < 0.15) { for (let i = 0; i < n; i++) kit('locker_col', g, -w / 2 + cw * (i + 0.5), 0, z0, { rotY: face > 0 ? Math.PI : 0, sx: cw / 0.4, sz: d / 0.5 }); return; }
  box(g, w, 0.08, d - 0.04, '#15161A', 0, 0, z0);
  box(g, w, 0.03, d, color, 0, h - 0.03, z0);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + cw * (i + 0.5);
    box(g, cw - 0.006, h - 0.11, d - 0.02, color, x, 0.08, z0);
    const door = box(g, cw - 0.03, h - 0.16, 0.014, color, x, 0.1, fz + face * 0.007); door.userData.softInk = true;
    box(g, 0.018, 0.12, 0.02, chrome, x + cw / 2 - 0.06, 0.08 + h * 0.48, fz + face * 0.02);
    for (let k = 0; k < 3; k++) box(g, cw - 0.14, 0.008, 0.004, '#0E141F', x, h - 0.32 + k * 0.045, fz + face * 0.016).userData.noInk = true;
  }
}
// 櫃台：中段 60 cm 一節（格數依長度），兩端收邊；face = -1 正面朝 -z、+1 朝 +z
function counterRun(g, w, face = -1, z0 = 0) {
  const n = Math.max(1, Math.round((w - 0.12) / 0.6)), sw = (w - 0.12) / n, ry = face > 0 ? Math.PI : 0;
  for (let i = 0; i < n; i++) kit('counter_mid', g, -w / 2 + 0.06 + sw * (i + 0.5), 0, z0, { rotY: ry, sx: sw / 0.6 });
  for (const sgn of [-1, 1]) kit('counter_end', g, sgn * (w / 2 - 0.03), 0, z0, { rotY: ry });
  box(g, w + 0.08, 0.04, 0.76, '#ECEAE5', 0, 1.05, z0 + face * 0.02, { roughness: 0.22 });
}
function benchModule(g, w, d = 0.42, z0 = 0) {
  for (let k = 0; k < 3; k++) box(g, w, 0.035, d / 3 - 0.02, woodMat, 0, 0.42, z0 - d / 2 + d / 6 + (k * d) / 3);
  const n = Math.max(2, Math.ceil(w / 1.2) + 1);
  for (let i = 0; i < n; i++) { const x = -w / 2 + 0.12 + ((w - 0.24) * i) / (n - 1); if (!kit('bench_frame', g, x, 0, z0, { sz: d / 0.42 })) box(g, 0.05, 0.42, d - 0.06, darkSteel, x, 0, z0); }
}
function plantPot(g, x = 0, z = 0, s = 1) {
  if (kit('plant', g, x, 0, z, { sx: s, sy: s, sz: s, rotY: (x * 7 + z * 13) % 6.28 })) return;
  cyl(g, 0.24 * s, 0.18 * s, 0.42 * s, '#D9CDB8', x, 0, z, { roughness: 0.8 }, 20);
  const leaf = mat('#4E7A46', { roughness: 0.8 }), leaf2 = mat('#5F8F52', { roughness: 0.8 });
  for (const [dx, dy, dz, r, m2] of [[0, 0.95, 0, 0.36, leaf], [0.16, 0.75, 0.08, 0.26, leaf2], [-0.15, 0.8, -0.06, 0.27, leaf2], [0.02, 1.2, 0.05, 0.22, leaf]]) {
    const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), m2); sp.position.set(x + dx * s, dy * s, z + dz * s); sp.userData.noInk = true; g.add(sp);
  }
}
function buildFurniture(g, it, w, d, def) {
  const c = def.color;
  switch (it.type) {
    case 'bench':
      benchModule(g, w, d);
      break;
    case 'sofa': {
      // 座墊一格約 70 cm：2.2 m 的沙發是三人座，加長就多一格
      const L = leatherMat(null), n = Math.max(1, Math.round((w - 0.3) / 0.7)), sw = (w - 0.3) / n;
      if (KIT.ready) {
        for (let i = 0; i < n; i++) kit('sofa_seat', g, -w / 2 + 0.15 + sw * (i + 0.5), 0, 0, { sx: sw / 0.7, sz: d / 0.9 });
        for (const sgn of [-1, 1]) kit('sofa_arm', g, sgn * (w / 2 - 0.075), 0, 0, { sx: 0.15 / 0.17, sz: d / 0.9 });
        break;
      }
      box(g, w, 0.2, d, L, 0, 0.08, 0);
      for (const [x, z] of [[-w / 2 + 0.08, -d / 2 + 0.08], [w / 2 - 0.08, -d / 2 + 0.08], [-w / 2 + 0.08, d / 2 - 0.08], [w / 2 - 0.08, d / 2 - 0.08]]) box(g, 0.04, 0.08, 0.04, darkSteel, x, 0, z);
      box(g, w, 0.5, 0.14, L, 0, 0.28, d / 2 - 0.07);
      for (const s of [-1, 1]) box(g, 0.15, 0.32, d - 0.02, L, s * (w / 2 - 0.075), 0.28, 0);
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.15 + sw * (i + 0.5);
        box(g, sw - 0.02, 0.13, d - 0.3, L, x, 0.28, -0.08);
        box(g, sw - 0.03, 0.36, 0.16, L, x, 0.41, d / 2 - 0.22);
      }
      break;
    }
    case 'table': {
      if (KIT.ready) { kit('cafe_table', g); for (const [x, z] of [[0.66, 0], [-0.66, 0], [0, 0.66], [0, -0.66]]) kit('stool', g, x, 0, z); break; }
      cyl(g, 0.45, 0.45, 0.035, woodMat, 0, 0.72, 0, null, 32); cyl(g, 0.035, 0.035, 0.72, darkSteel, 0, 0, 0); cyl(g, 0.25, 0.25, 0.02, darkSteel, 0, 0, 0, null, 24);
      for (const [x, z] of [[0.66, 0], [-0.66, 0], [0, 0.66], [0, -0.66]]) { cyl(g, 0.025, 0.025, 0.42, darkSteel, x, 0, z); cyl(g, 0.18, 0.18, 0.06, leatherMat('#3E4A5E'), x, 0.42, z, null, 20); }
      break;
    }
    case 'rug': {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(c, { roughness: 1, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.022; g.add(m);
      break;
    }
    case 'counter':
      // 本體＋木格柵正面＋石英檯面；長度只改中段，兩端收邊固定 6 cm
      if (KIT.ready) { counterRun(g, w, -1); break; }
      box(g, w, 1.0, d, c, 0, 0.05, 0);
      box(g, w, 0.05, d - 0.04, '#15161A', 0, 0, 0);
      box(g, w - 0.12, 0.9, 0.03, woodMat, 0, 0.1, -d / 2 - 0.015);
      for (const s of [-1, 1]) box(g, 0.06, 1.0, d + 0.06, c, s * (w / 2 - 0.03), 0.05, -0.03);
      box(g, w + 0.08, 0.04, d + 0.1, '#ECEAE5', 0, 1.05, -0.02, { roughness: 0.25 });
      break;
    case 'vending': {
      if (kit('vending', g, 0, 0, 0, { sx: w / 1.0, sz: d / 0.8 })) break;
      box(g, w, def.h, d, c, 0, 0, 0, { roughness: 0.4 });
      box(g, w * 0.66, 1.25, 0.02, '#16202B', -w * 0.1, 0.45, -d / 2 - 0.01, { emissive: '#4C7E9E', emissiveIntensity: 0.35, roughness: 0.1 });
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) box(g, 0.1, 0.18, 0.02, ['#F2B705', '#E2582B', '#3C8A63', '#F4F4F2'][(r + k) % 4], -w * 0.1 - w * 0.25 + k * (w * 0.5 / 3), 0.55 + r * 0.28, -d / 2 - 0.025).userData.noInk = true;
      box(g, w * 0.2, 0.5, 0.02, '#2B2F36', w * 0.36, 0.8, -d / 2 - 0.01);
      break;
    }
    case 'water':
      if (kit('water', g)) break;
      box(g, w, 1.0, d, '#E6EAEE', 0, 0, 0, { roughness: 0.35 });
      box(g, w - 0.1, 0.03, 0.12, darkSteel, 0, 0.55, -d / 2 + 0.05);
      cyl(g, 0.15, 0.15, 0.42, '#8CC4EA', 0, 1.0, 0, { transparent: true, opacity: 0.75, roughness: 0.05 }, 24);
      break;
    case 'locker':
      lockerBank(g, w, def.h, d, '#22304A', -1);
      break;
    case 'foldtable': {
      if (kit('fold_table', g, 0, 0, 0, { sx: w / 1.8, sz: d / 0.75 })) break;
      box(g, w, 0.04, d, '#EDEFF0', 0, 0.7, 0, { roughness: 0.4 });
      for (const sx of [-1, 1]) { box(g, 0.03, 0.7, 0.03, '#8E9399', sx * (w / 2 - 0.15), 0, -d / 2 + 0.08); box(g, 0.03, 0.7, 0.03, '#8E9399', sx * (w / 2 - 0.15), 0, d / 2 - 0.08); box(g, 0.03, 0.03, d - 0.16, '#8E9399', sx * (w / 2 - 0.15), 0.05, 0); }
      break;
    }
    case 'foldchair':
      if (kit('fold_chair', g)) break;
      box(g, 0.42, 0.03, 0.4, '#ECEEF0', 0, 0.45, 0.02, { roughness: 0.4 }); box(g, 0.42, 0.3, 0.03, '#ECEEF0', 0, 0.5, 0.22, { roughness: 0.4 });
      for (const sx of [-0.19, 0.19]) { const a = box(g, 0.02, 0.85, 0.02, '#B9BCC0', sx, 0, 0.2); a.rotation.x = -0.18; const b = box(g, 0.02, 0.5, 0.02, '#B9BCC0', sx, 0, -0.15); b.rotation.x = 0.35; }
      break;
    case 'campchair': {
      if (kit('camp_chair', g)) break;
      const W = mat('#9C7A55', { roughness: 0.7 });
      for (let k = 0; k < 5; k++) box(g, 0.48, 0.025, 0.07, woodMat, 0, 0.42, -0.2 + k * 0.09);
      for (let k = 0; k < 4; k++) { const sl = box(g, 0.48, 0.07, 0.025, woodMat, 0, 0.5 + k * 0.08, 0.26); sl.rotation.x = -0.25; }
      for (const sx of [-0.25, 0.25]) { const a = box(g, 0.035, 0.85, 0.035, W, sx, 0, 0.05); a.rotation.x = 0.45; const b = box(g, 0.035, 0.6, 0.035, W, sx, 0, -0.05); b.rotation.x = -0.45; }
      break;
    }
    case 'camptable':
      if (kit('camp_table', g, 0, 0, 0, { sx: w / 0.6, sz: d / 0.6 })) break;
      for (let k = 0; k < 6; k++) box(g, w, 0.025, d / 6 - 0.01, woodMat, 0, 0.58, -d / 2 + d / 12 + (k * d) / 6);
      for (const sx of [-1, 1]) { const a = box(g, 0.035, 0.66, 0.035, '#9C7A55', sx * (w / 2 - 0.08), 0, 0); a.rotation.z = sx * 0.4; const b = box(g, 0.035, 0.66, 0.035, '#9C7A55', sx * (w / 2 - 0.08), 0, 0); b.rotation.z = -sx * 0.4; }
      break;
    case 'desk':
      if (kit('desk', g, 0, 0, 0, { sx: w / 1.4, sz: d / 0.7 })) { kit('office_chair', g, -0.2, 0, -0.6, { rotY: Math.PI }); break; }
      box(g, w, 0.03, d, '#F2F2F0', 0, 0.72, 0, { roughness: 0.35 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.035, 0.72, 0.035, '#B9BCC0', sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05));
      box(g, 0.55, 0.34, 0.03, '#15181D', -0.2, 0.92, 0.18, { roughness: 0.2 }); box(g, 0.05, 0.18, 0.05, '#15181D', -0.2, 0.75, 0.2);
      box(g, 0.2, 0.42, 0.42, '#1C1E22', w / 2 - 0.25, 0, 0.05);
      { const ch = new THREE.Group(); ch.position.set(-0.2, 0, -0.55); box(ch, 0.48, 0.08, 0.46, '#2A2D33', 0, 0.45, 0); box(ch, 0.46, 0.55, 0.06, '#2A2D33', 0, 0.55, 0.22); cyl(ch, 0.025, 0.025, 0.42, chrome, 0, 0.03, 0); cyl(ch, 0.3, 0.3, 0.03, darkSteel, 0, 0, 0, null, 5); g.add(ch); }
      break;
    case 'coffee': {
      // 長茶几：木頭桌面（圓角）＋下層置物板＋黑色鐵腳
      box(g, w, 0.04, d, woodMat, 0, 0.38, 0); box(g, w - 0.1, 0.02, d - 0.1, woodMat, 0, 0.12, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.035, 0.38, 0.035, darkSteel, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06));
      break;
    }
    case 'lowcubby':
    case 'cubby': {
      // 木格櫃：每格 40 cm 寬、30 cm 高（矮櫃 90 cm 三格）
      const cols = Math.max(1, Math.round(w / 0.4)), rows = Math.max(1, Math.round(def.h / 0.3)), cw = w / cols, rh = def.h / rows;
      const km = it.type === 'lowcubby' ? 'cubby_low' : 'cubby_col';
      if (KIT.ready && KIT.parts.has(km)) { for (let i = 0; i < cols; i++) kit(km, g, -w / 2 + cw * (i + 0.5), 0, 0, { sx: cw / 0.4, sz: d / 0.35 }); break; }
      box(g, w, 0.02, d, woodMat, 0, 0, 0); box(g, w, 0.02, d, woodMat, 0, def.h - 0.02, 0); box(g, w, def.h, 0.012, woodMat, 0, 0, d / 2 - 0.006);
      for (let i = 0; i <= cols; i++) box(g, 0.02, def.h, d, woodMat, -w / 2 + cw * i, 0, 0);
      for (let r = 1; r < rows; r++) box(g, w, 0.018, d, woodMat, 0, rh * r, 0);
      break;
    }
    case 'shoerack':
      if (kit('shoe_rack', g, 0, 0, 0, { sx: w / 0.6 })) break;
      for (let k = 0; k < 5; k++) box(g, w, 0.02, d, '#1F2124', 0, 0.06 + k * 0.22, k % 2 ? 0.02 : -0.02, { metalness: 0.5, roughness: 0.5 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.02, def.h, 0.02, '#1F2124', sx * (w / 2 - 0.01), 0, sz * (d / 2 - 0.01), { metalness: 0.5 });
      break;
    case 'fridge': {
      // 機身（前面開口）、空的內膽與層板、內燈；門片可以打開
      const H2 = def.h, body = '#E9ECEE', inner = '#F7F8F9';
      box(g, w, 0.04, d, body, 0, 0, 0); box(g, w, 0.04, d, body, 0, H2 - 0.04, 0); box(g, w, H2, 0.03, body, 0, 0, d / 2 - 0.015);
      for (const sx of [-1, 1]) box(g, 0.03, H2, d, body, sx * (w / 2 - 0.015), 0, 0, { roughness: 0.35 });
      box(g, w - 0.08, H2 - 0.1, 0.01, inner, 0, 0.05, d / 2 - 0.035, { emissive: '#FFFFFF', emissiveIntensity: 0.15 });
      for (const y of [0.35, 0.7, 1.0]) if (y < H2 - 0.1) box(g, w - 0.07, 0.01, d - 0.08, new THREE.MeshStandardMaterial({ color: '#D7E6EA', transparent: true, opacity: 0.4, roughness: 0.1 }), 0, y, 0.01);
      const pv = new THREE.Group(); pv.position.set(-w / 2, 0, -d / 2); pv.userData.fridgeOf = it.id; g.add(pv);
      box(pv, w, H2 - 0.02, 0.05, body, w / 2, 0.01, -0.025, { roughness: 0.35 });
      box(pv, 0.025, 0.4, 0.03, '#B9BCC0', w - 0.06, H2 * 0.45, -0.065, { metalness: 0.8, roughness: 0.3 });
      if (walk.open.has(it.id)) pv.rotation.y = 1.95;
      break;
    }
    case 'fridge_old':
      box(g, w, def.h, d, '#E9ECEE', 0, 0, 0, { roughness: 0.35 });
      box(g, w - 0.06, def.h - 0.12, 0.02, '#1D2A33', 0, 0.06, -d / 2 - 0.01, { roughness: 0.08, emissive: '#3F6F8A', emissiveIntensity: 0.25 });
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) cyl(g, 0.03, 0.03, 0.2, ['#C0392B', '#2E8B57', '#E8B019', '#2F5D8C'][(r + k) % 4], -0.18 + k * 0.12, 0.15 + r * 0.28, -d / 2 + 0.08, null, 10);
      box(g, 0.02, 0.4, 0.03, chrome, w / 2 - 0.06, def.h * 0.5, -d / 2 - 0.03);
      break;
    case 'standac':
      if (kit('stand_ac', g)) break;
      box(g, w, def.h, d, '#F1F2F3', 0, 0, 0, { roughness: 0.35 });
      box(g, w - 0.08, 0.5, 0.02, '#C9CDD1', 0, def.h - 0.7, -d / 2 - 0.01);
      for (let k = 0; k < 6; k++) box(g, w - 0.1, 0.012, 0.02, '#9AA3AC', 0, def.h - 0.65 + k * 0.07, -d / 2 - 0.02);
      box(g, 0.12, 0.05, 0.01, '#15181D', 0, def.h - 0.12, -d / 2 - 0.01, { emissive: '#3BA3FF', emissiveIntensity: 0.6 });
      break;
    case 'floorfan':
      if (kit('floor_fan', g)) break;
      cyl(g, 0.2, 0.22, 0.04, '#1F2124', 0, 0, 0, null, 24); cyl(g, 0.02, 0.02, 0.9, '#B9BCC0', 0, 0.04, 0);
      { const h = cyl(g, 0.22, 0.22, 0.12, '#1F2124', 0, 1.0, 0, { transparent: true, opacity: 0.55 }, 24); h.rotation.x = Math.PI / 2; h.userData.noInk = true; cyl(g, 0.06, 0.06, 0.14, '#1F2124', 0, 1.02, 0.06).rotation.x = Math.PI / 2; }
      break;
    case 'curtain': {
      // 更衣簾：L 型鋼管＋布簾（皺褶用一排細長方塊做）
      if (kit('curtain_booth', g, 0, 0, 0, { sx: w / 1.2, sz: d / 1.0 })) break;
      cyl(g, 0.015, 0.015, def.h, chrome, -w / 2, 0, -d / 2); cyl(g, 0.015, 0.015, def.h, chrome, w / 2, 0, -d / 2);
      box(g, w, 0.03, 0.03, chrome, 0, def.h - 0.03, -d / 2);
      const n = Math.max(6, Math.round(w / 0.1));
      for (let k = 0; k < n; k++) box(g, w / n + 0.01, def.h - 0.15, 0.03, mat('#7A5A3E', { roughness: 0.9 }), -w / 2 + (w / n) * (k + 0.5), 0.05, -d / 2 + (k % 2 ? 0.03 : -0.03)).userData.softInk = true;
      break;
    }
    case 'plant':
      plantPot(g);
      break;
    case 'aed':
      if (kit('aed_cabinet', g, 0, 1.35, 0)) break;
      box(g, w, 0.5, d, c, 0, 1.1, 0); box(g, w * 0.7, 0.3, 0.01, '#F4F4F2', 0, 1.2, -d / 2 - 0.005);
      break;
    case 'referee':
      if (kit('referee_chair', g)) break;
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) cyl(g, 0.025, 0.025, 1.6, chrome, x, 0, z);
      box(g, 0.8, 0.06, 0.8, woodMat, 0, 1.6, 0); box(g, 0.8, 0.5, 0.05, padMat, 0, 1.66, 0.38);
      for (let i = 1; i < 5; i++) box(g, 0.6, 0.035, 0.06, darkSteel, 0, i * 0.32, -0.42);
      break;
    case 'scoreboard':
      if (kit('score_stand', g, 0, 0, 0, { sx: w / 1.4 })) {
        for (const side of [-1, 1]) {
          const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2 * w / 1.4, 0.6), new THREE.MeshBasicMaterial({ map: scoreTex, toneMapped: false }));
          screen.position.set(0, 1.25, side * 0.062);
          screen.rotation.y = side < 0 ? Math.PI : 0;
          screen.userData.noInk = true;
          g.add(screen);
        }
        break;
      }
      box(g, 0.08, 0.9, 0.08, '#2B3A4F', -0.5, 0, 0); box(g, 0.08, 0.9, 0.08, '#2B3A4F', 0.5, 0, 0);
      box(g, w, 0.7, 0.1, c, 0, 0.9, 0);
      box(g, 0.45, 0.4, 0.01, '#F2B705', -0.32, 1.05, -0.06, { emissive: '#F2B705', emissiveIntensity: 0.4 });
      box(g, 0.45, 0.4, 0.01, '#E2582B', 0.32, 1.05, -0.06, { emissive: '#E2582B', emissiveIntensity: 0.4 });
      break;
    case 'ballcart': {
      // 鋼管框＋網面＋排球（黃藍白）
      if (kit('ball_cart', g, 0, 0, 0, { sx: w / 1.0, sz: d / 0.6 })) {
        realBalls(g, w / 1.0, d / 0.6, (add) => { for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) add(-0.33 + i * 0.22 + (layer % 2) * 0.05, 0.28 + layer * 0.2, -0.11 + j * 0.22); });
        const t = netTexture().clone(); t.needsUpdate = true; t.repeat.set(w / 0.12, 0.8 / 0.12);
        for (const [px, pz, ry, len] of [[0, -d / 2, 0, w], [0, d / 2, 0, w], [-w / 2, 0, Math.PI / 2, d], [w / 2, 0, Math.PI / 2, d]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.8), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.6 })); m.position.set(px, 0.57, pz); m.rotation.y = ry; g.add(m); }
        break;
      }
      for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) { cyl(g, 0.012, 0.012, 0.95, chrome, x, 0.1, z); cyl(g, 0.04, 0.04, 0.06, '#15161A', x, 0, z, null, 10); }
      box(g, w, 0.02, d, chrome, 0, 0.18, 0);
      const t = netTexture().clone(); t.needsUpdate = true; t.repeat.set(w / 0.12, 0.8 / 0.12);
      for (const [px, pz, ry, len] of [[0, -d / 2, 0, w], [0, d / 2, 0, w], [-w / 2, 0, Math.PI / 2, d], [w / 2, 0, Math.PI / 2, d]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.8), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.7 })); m.position.set(px, 0.6, pz); m.rotation.y = ry; g.add(m); }
      const cols = ['#F2C230', '#2F5D8C', '#F4F4F2'];
      for (let i = 0; i < 14; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), mat(cols[i % 3], { roughness: 0.45 })); b.position.set(-w / 2 + 0.14 + (i % 4) * ((w - 0.28) / 3), 0.3 + Math.floor(i / 8) * 0.2, -d / 2 + 0.15 + (Math.floor(i / 4) % 2) * (d - 0.3)); g.add(b); }
      break;
    }
    case 'bleacher': {
      // 看台：鋁製一節 2 m（三階），依寬度排幾節；素材庫還沒好就用程式組
      if (KIT.ready && Math.abs(d - 2.4) < 0.6) { const n = Math.max(1, Math.round(w / 2)); for (let i = 0; i < n; i++) kit('bleacher_mod', g, -w / 2 + (w / n) * (i + 0.5), 0, 0, { sx: w / n / 2, sz: d / 2.4 }); break; }
      // 每階 80 cm 深，座墊每 50 cm 一格
      const tiers = Math.max(1, Math.round(d / 0.8)), td = d / tiers, seats = Math.max(1, Math.round(w / 0.5));
      for (let i = 0; i < tiers; i++) {
        const z = -d / 2 + td * (i + 0.5), hgt = 0.42 * (i + 1);
        box(g, w, hgt, td, '#7C8896', 0, 0, z, { roughness: 0.6 });
        for (let k = 0; k < seats; k++) box(g, w / seats - 0.06, 0.05, td * 0.55, i % 2 ? padMat : leatherMat('#3E4A5E'), -w / 2 + (w / seats) * (k + 0.5), hgt, z - td * 0.15);
      }
      break;
    }
    case 'steelsink':
      if (!kit('steel_sink', g)) { box(g, w, 0.04, d, '#C8CCD0', 0, 0.86, 0, { metalness: 0.9, roughness: 0.3 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.03, 0.86, 0.03, '#C8CCD0', sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), { metalness: 0.9 }); }
      break;
    case 'purifier':
      if (!kit('purifier', g)) box(g, w, 0.44, d, '#E9ECEE', 0, 0, 0, { roughness: 0.35 });
      break;
    case 'shelf': {
      // 置物鐵架：一格 1 m，放幾顆球
      const nb = Math.max(1, Math.round(w / 1.0));
      if (KIT.ready) for (let k = 0; k < nb; k++) kit('shelf_bay', g, -w / 2 + (w / nb) * (k + 0.5), 0, 0, { sx: w / nb / 1.0, sz: d / 0.5 });
      else { for (let k = 0; k < 4; k++) box(g, w, 0.03, d, darkSteel, 0, 0.3 + k * 0.55, 0); for (let k = 0; k <= nb; k++) box(g, 0.035, 2.0, d, darkSteel, -w / 2 + (w * k) / nb, 0, 0); }
      for (let k = 0; k < Math.min(10, Math.floor(w / 0.3)); k++) { const ball = newBallMesh(true); ball.scale.setScalar(1 / BALL_VIS); ball.position.set(-w / 2 + 0.2 + k * 0.3, KIT.ready ? 0.82 : 0.45, 0); g.add(ball); }
      break;
    }
    case 'stall': {
      // 廁所隔間：正面（-z）是門，馬桶靠背牆（+z）、面向門
      if (!kit('wc_stall', g, 0, 0, 0, { sx: w / 0.95, sz: d / 1.5 })) {
        const lam = '#CFC8BC';
        for (const x of [-w / 2 + 0.015, w / 2 - 0.015]) box(g, 0.025, 1.85, d, lam, x, 0.15, 0);
        box(g, w - 0.09, 1.85, 0.025, lam, 0, 0.15, -d / 2 + 0.01);
      }
      if (!kit('toilet', g, 0, 0, d / 2 - 0.36)) { box(g, 0.38, 0.42, 0.6, '#FBFBF8', 0, 0, d / 2 - 0.5); box(g, 0.4, 0.4, 0.18, '#FBFBF8', 0, 0.42, d / 2 - 0.12); }
      break;
    }
    case 'toilet':
      if (!kit('toilet', g, 0, 0, d / 2 - 0.36)) { box(g, 0.38, 0.42, 0.6, '#FBFBF8', 0, 0, d / 2 - 0.5); box(g, 0.4, 0.4, 0.18, '#FBFBF8', 0, 0.42, d / 2 - 0.12); }
      { const [pc] = [cyl(g, 0.06, 0.06, 0.1, chrome, w / 2 + 0.05, 0.7, 0)]; pc.rotation.z = Math.PI / 2; }
      break;
    case 'urinal':
      if (!kit('urinal', g, 0, 0, d / 2 - 0.2)) box(g, 0.36, 0.62, 0.3, '#F6F6F3', 0, 0.55, d / 2 - 0.15);
      break;
    case 'sinkrow': {
      // 洗手台：一格 60 cm 面盆，後面一整片鏡子
      const ns = Math.max(1, Math.round(w / 0.6));
      if (KIT.ready) for (let i = 0; i < ns; i++) kit('sink', g, -w / 2 + (w / ns) * (i + 0.5), 0, 0, { sx: w / ns / 0.6, sz: d / 0.5 });
      else box(g, w, 0.85, d, '#D9D4CB');
      box(g, Math.max(0.4, w - 0.1), 0.8, 0.02, '#BFD3DB', 0, 1.15, d / 2 - 0.01, { metalness: 0.6, roughness: 0.1 });
      break;
    }
    case 'showerstall': {
      // 淋浴間：兩側霧面隔板、淋浴頭在背牆、前面半拉的浴簾、地上止水墩
      for (const x of [-w / 2 + 0.015, w / 2 - 0.015]) { const pnl = box(g, 0.025, 1.95, d, frostMat, x, 0.1, 0); pnl.userData.noInk = true; }
      box(g, w - 0.04, 0.05, d - 0.04, '#E9ECEE', 0, 0, 0, { roughness: 0.4 });
      box(g, w, 0.03, 0.03, '#B9BCC0', 0, 2.0, -d / 2 + 0.03, { metalness: 0.8, roughness: 0.3 });
      box(g, w * 0.45, 1.85, 0.02, '#E8E6E0', -w * 0.27, 0.12, -d / 2 + 0.04, { roughness: 0.9, side: THREE.DoubleSide });
      if (!kit('shower', g, 0, 0, d / 2 - 0.22)) box(g, 0.08, 0.06, 0.08, '#B9C0C6', 0, 2.0, d / 2 - 0.1);
      break;
    }
    case 'warmmat': {
      // 暖身墊＋泡棉滾筒
      box(g, w, 0.012, d, it.tone === 'gold' ? '#C9962E' : '#22304A', 0, 0, 0, { roughness: 0.9 });
      const r = cyl(g, 0.075, 0.075, 0.45, '#1F2933', 0, 0.075, d / 2 - 0.2); r.rotation.z = Math.PI / 2;
      break;
    }
    case 'flipscore':
      if (!kit('flip_score', g)) { box(g, 0.6, 0.6, 0.05, '#F4F4F2', 0, 0, 0); }
      { const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.32), new THREE.MeshBasicMaterial({ map: scoreTex, toneMapped: false })); sp.position.set(0, 0.36, -0.115); sp.rotation.set(-0.25, Math.PI, 0); sp.userData.noInk = true; g.add(sp); }
      break;
    case 'whiteboard':
      if (!kit('whiteboard', g)) { box(g, 1.2, 0.9, 0.03, '#F4F4F2', 0, 0.9, 0); for (const x of [-0.62, 0.62]) box(g, 0.04, 1.9, 0.04, '#B9BCC0', x, 0, 0); }
      break;
    case 'packac':
      if (!kit('package_ac', g, 0, 0, 0, { sx: w / 1.2, sz: d / 0.6 })) { box(g, w, def.h, d, '#E9ECEE', 0, 0, 0, { roughness: 0.35 }); for (let k = 0; k < 10; k++) box(g, w - 0.1, 0.012, 0.02, '#9AA3AC', 0, 0.2 + k * 0.05, -d / 2 - 0.01); }
      break;
    case 'watertall':
      if (!kit('water_tall', g)) box(g, w, def.h, d, '#C8CCD0', 0, 0, 0, { metalness: 0.8, roughness: 0.3 });
      break;
    case 'speaker':
      if (!kit('speaker', g)) { box(g, 0.36, 0.56, 0.32, '#1F2124', 0, 1.4, 0); cyl(g, 0.018, 0.018, 1.4, '#1F2124'); }
      break;
    case 'bins':
      if (!kit('recycle_bins', g)) for (let k = 0; k < 3; k++) box(g, 0.3, 0.76, 0.36, ['#3A3D42', '#2F5FA8', '#2E8B57'][k], -0.32 + k * 0.32, 0, 0);
      break;
    case 'ballbasket':
      if (kit('ball_basket', g)) realBalls(g, 1, 1, (add) => { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) add(-0.18 + i * 0.18, 0.68, -0.18 + j * 0.18); });
      else { box(g, w, 0.34, d, '#1F2A40', 0, 0.28, 0); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), mat(i % 2 ? '#F2C230' : '#2F5D8C')); b.position.set(-0.12 + (i % 2) * 0.24, 0.68, -0.12 + Math.floor(i / 2) * 0.24); g.add(b); } }
      break;
    case 'netwall': {
      const hh = Math.min(def.h, state.building.H - 0.2);
      const t = netTexture(it.tone).clone(); t.needsUpdate = true; t.repeat.set(w / 1.5, hh / 1.5);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 }));
      m.position.y = hh / 2; g.add(m);
      const n = Math.max(1, Math.round(w / 6));
      for (let i = 0; i <= n; i++) if (!kit('net_pole', g, -w / 2 + (w * i) / n, 0, 0, { sy: hh / 5 })) cyl(g, 0.04, 0.04, hh, darkSteel, -w / 2 + (w * i) / n, 0, 0);
      box(g, w, 0.03, 0.03, darkSteel, 0, hh - 0.03, 0);
      const hit = box(g, w, hh, 0.12, '#000000', 0, 0, 0, { transparent: true, opacity: 0 });
      hit.material.depthWrite = false;
      break;
    }
    default:
      box(g, w, def.h || 1, d, c, 0, 0, 0);
  }
}

// ---------------------------------------------------------------- building shell (rectangle or traced outline share one builder)
function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry && !o.userData.ink) o.geometry.dispose(); if (o.element && o.element.parentNode) o.element.parentNode.removeChild(o.element); });
  while (g.children.length) g.remove(g.children[0]);
}
function outlinePoly() {
  const { L, W, poly } = state.building;
  return poly || [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]];
}
function hallBounds() {
  const P = outlinePoly(), xs = P.map((p) => p[0]), zs = P.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}
// 主入口：在最南側（+z，服務帶那一邊）的外牆上，對著接待櫃台；沒有櫃台就在牆的中間
function entryInfo() {
  const P = outlinePoly(), E = edgesOf(P);
  if (state.building.entry) {
    // 指定了入口：門開在離那一點最近的外牆上
    const ne = nearestEdge(state.building.entry[0], state.building.entry[1], P), wD = Math.min(state.building.entryW || 3, ne.e.len - 1);
    const tt = clamp(ne.t, wD / 2 + 0.3, ne.e.len - wD / 2 - 0.3);
    return { e: ne.e, t: tt, w: wD, x: ne.e.a[0] + ne.e.dx * tt, z: ne.e.a[1] + ne.e.dz * tt, nx: ne.e.nx, nz: ne.e.nz };
  }
  let front = E.slice().sort((a, b) => (b.nz - a.nz) || (b.len - a.len))[0];
  const rec = state.zones.find((z) => z.type === 'reception') || state.zones.find((z) => z.type === 'rest');
  // 櫃台貼著哪面外牆，大門就開在那面
  const onW = rec && zoneLayout(rec).sides.find((sd) => sd.onWall);
  if (onW) front = nearestEdge((onW.a[0] + onW.b[0]) / 2, (onW.a[1] + onW.b[1]) / 2, P).e;
  let t = front.len / 2;
  // 門開在櫃台區的一側，櫃台本身擺在另一側
  if (rec) t = (rec.x - front.a[0]) * front.dx + (rec.z - front.a[1]) * front.dz - (rec.type === 'reception' ? Math.min(rec.w, rec.d) / 4 : 0);
  const wDoor = Math.min(state.building.entryW || 3, front.len - 1);
  t = clamp(t, wDoor / 2 + 0.4, front.len - wDoor / 2 - 0.4);
  return { e: front, t, w: wDoor, x: front.a[0] + front.dx * t, z: front.a[1] + front.dz * t, nx: front.nx, nz: front.nz };
}
const sameEdge = (p, q) => p.a[0] === q.a[0] && p.a[1] === q.a[1] && p.b[0] === q.b[0] && p.b[1] === q.b[1];
// 鋼構柱：沿外牆約每 6 m 一支（平面圖與 3D 共用）
function columnPoints() {
  const out = [];
  for (const e of edgesOf(outlinePoly())) {
    const n = Math.max(1, Math.round(e.len / 6));
    for (let i = 0; i < n; i++) out.push([e.a[0] + e.dx * (e.len * i / n) - e.nx * 0.2, e.a[1] + e.dz * (e.len * i / n) - e.nz * 0.2]);
  }
  return out;
}
function wallBox(g, material, x1, z1, x2, z2, h, t, y = 0) {
  const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.01) return null;
  const m = new THREE.Mesh(worldUV(new THREE.BoxGeometry(len, h, t)), material);
  m.position.set((x1 + x2) / 2, y + h / 2, (z1 + z2) / 2);
  m.rotation.y = Math.atan2(-(z2 - z1), x2 - x1);
  g.add(m); return m;
}
// 第三人稱（球拍對戰、排球比賽）：擋在鏡頭和自己之間、在畫面裡的鋼構柱先藏起來（只藏柱子的零件，柱子本身的顯示開關不動）
const _occV = new THREE.Vector3();
function hideOccluders(tgt) {
  if (!tgt) { if (cols.hidden) { for (const c of cols) for (const m of c.children) m.visible = true; cols.hidden = false; } return; }
  camera.updateMatrixWorld(); const inv = camera.matrixWorldInverse, dT = -_occV.set(tgt.x, 1, tgt.z).applyMatrix4(inv).z;
  for (const c of cols) {
    let occ = false;
    for (const y of [0.3, 1.5, camera.position.y]) {
      _occV.set(c.position.x, y, c.position.z).applyMatrix4(inv); const d = -_occV.z;
      if (d > 0 && d < dT - 0.5) { _occV.set(c.position.x, y, c.position.z).project(camera); if (Math.abs(_occV.x) < 1.4 && Math.abs(_occV.y) < 1.4) { occ = true; break; } }
    }
    for (const m of c.children) m.visible = !occ;
  }
  cols.hidden = true;
}
function buildBuilding() {
  disposeGroup(buildingGroup); mainDoors.length = 0;
  walls = []; cols = []; colliders = [];
  const { H } = state.building, P = outlinePoly(), sc = scheme(), col = state.colors || {};
  const metal = isMetal(), wallMat = metal ? tintedKeep(sheetWallMat, col.wall, '#DFE2E5') : tinted(plasterMat, col.wall);
  const roofMat = tintedKeep(roofSheetMat, col.roof, '#D8DBDE'), stMat = col.steel ? tintedKeep(steelMat, col.steel, '#3B3F45') : steelMat;
  const B = hallBounds();
  fitShadow(Math.max(B.x1 - B.x0, B.z1 - B.z0));
  // 地坪：木地板（UV＝公尺）
  const shape = new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(x, -z)));
  const floorBase = sc.wood ? FLOOR_MATS.wood : sc.hall ? (FLOOR_MATS[sc.hall] || FLOOR_MATS.hall) : state.floor === 'pu' ? FLOOR_MATS.hall : new THREE.MeshStandardMaterial({ color: sc.base, roughness: 0.85 });
  const hallHex = col.hall || (sc.wood && col.wood) || null, floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), sc.wood && hallHex ? tintedKeep(floorBase, hallHex, '#A8825A') : tinted(floorBase, col.hall));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.noInk = true;
  buildingGroup.add(floor);
  // 外牆：白色粉刷牆，底下一圈深色踢腳；入口那一面留 3 m 的玻璃自動門
  const eave = H + 1.0, t = 0.25, ent = entryInfo();
  for (const e of edgesOf(P)) {
    const ox = e.nx * t / 2, oz = e.nz * t / 2;
    const segs = sameEdge(e, ent.e) ? [[0, ent.t - ent.w / 2], [ent.t + ent.w / 2, e.len]] : [[0, e.len]];
    const grp = new THREE.Group(); buildingGroup.add(grp);
    for (const [s0, s1] of segs) {
      const ax = e.a[0] + e.dx * s0 + ox, az = e.a[1] + e.dz * s0 + oz, bx = e.a[0] + e.dx * s1 + ox, bz = e.a[1] + e.dz * s1 + oz;
      const ex = s0 === 0 ? t / 2 : 0, ey = s1 === e.len ? t / 2 : 0;   // 轉角接起來
      wallBox(grp, wallMat, ax - e.dx * ex, az - e.dz * ex, bx + e.dx * ey, bz + e.dz * ey, eave, t);
      wallBox(grp, stMat, ax - e.nx * 0.13, az - e.nz * 0.13, bx - e.nx * 0.13, bz - e.nz * 0.13, 0.12, 0.02).userData.noInk = true;
      colliders.push([e.a[0] + e.dx * s0, e.a[1] + e.dz * s0, e.a[0] + e.dx * s1, e.a[1] + e.dz * s1]);
    }
    if (sameEdge(e, ent.e)) {
      // 門楣＋兩扇玻璃滑門（半開）
      const cx = ent.x + ox, cz = ent.z + oz, hd = 2.6;
      wallBox(grp, tinted(plasterMat, col.wall), cx - e.dx * ent.w / 2, cz - e.dz * ent.w / 2, cx + e.dx * ent.w / 2, cz + e.dz * ent.w / 2, eave - hd, t, hd);
      wallBox(grp, frameMat, cx - e.dx * ent.w / 2, cz - e.dz * ent.w / 2, cx + e.dx * ent.w / 2, cz + e.dz * ent.w / 2, 0.08, t + 0.02, hd - 0.08);
      // 兩扇玻璃滑門：關著，導覽時按 E 往兩邊滑開
      const md = { main: true, t: 0, open: false, ux: e.dx, uz: e.dz, slide: ent.w / 2 - 0.08, panes: [], seg: [ent.x - e.dx * ent.w / 2, ent.z - e.dz * ent.w / 2, ent.x + e.dx * ent.w / 2, ent.z + e.dz * ent.w / 2] };
      for (const s of [-1, 1]) {
        const p0 = (ent.w / 2) * s, p1 = 0;
        const pg = new THREE.Group(); grp.add(pg);
        const g1 = wallBox(pg, glassMat, cx + e.dx * p0, cz + e.dz * p0, cx + e.dx * p1, cz + e.dz * p1, hd - 0.1, 0.03); g1.userData.noInk = true; g1.renderOrder = 2;
        wallBox(pg, frameMat, cx + e.dx * (p1 - s * 0.03), cz + e.dz * (p1 - s * 0.03), cx + e.dx * (p1 + s * 0.02), cz + e.dz * (p1 + s * 0.02), hd - 0.1, 0.05);
        md.panes.push({ m: pg, s, x: 0, y: 0, z: 0 });
        pg.traverse((o) => { if (o.isMesh) o.userData.door = md; });
      }
      mainDoors.push(md);
    }
    // the low skirt stays when the wall hides, so the outline stays readable
    const sk = wallBox(buildingGroup, stMat, e.a[0] + ox, e.a[1] + oz, e.b[0] + ox, e.b[1] + oz, 0.12, t + 0.02);
    sk.userData.noInk = true;
    // 高窗：每一跨一扇，在牆的上段（入口那段跳過），天光從這裡進來
    const nw = Math.max(1, Math.round(e.len / 6));
    for (let i = 0; i < nw; i++) {
      const tc = (e.len * (i + 0.5)) / nw; if (sameEdge(e, ent.e) && Math.abs(tc - ent.t) < ent.w / 2 + 2) continue;
      const ww = Math.min(3.6, e.len / nw - 1.2); if (ww < 1) continue;
      const wx = e.a[0] + e.dx * tc + e.nx * t / 2, wz = e.a[1] + e.dz * tc + e.nz * t / 2, wy = Math.max(3, H - 2.6);
      const win = wallBox(grp, winMat, wx - e.dx * ww / 2, wz - e.dz * ww / 2, wx + e.dx * ww / 2, wz + e.dz * ww / 2, 1.6, t + 0.03, wy); win.userData.noInk = true;
      for (const k of [-0.5, 0, 0.5]) wallBox(grp, frameMat, wx + e.dx * ww * k - e.dx * 0.03, wz + e.dz * ww * k - e.dz * 0.03, wx + e.dx * ww * k + e.dx * 0.03, wz + e.dz * ww * k + e.dz * 0.03, 1.6, t + 0.05, wy);
      wallBox(grp, frameMat, wx - e.dx * ww / 2, wz - e.dz * ww / 2, wx + e.dx * ww / 2, wz + e.dz * ww / 2, 0.06, t + 0.05, wy);
      wallBox(grp, frameMat, wx - e.dx * ww / 2, wz - e.dz * ww / 2, wx + e.dx * ww / 2, wz + e.dz * ww / 2, 0.06, t + 0.05, wy + 1.54);
    }
    grp.userData.normal = [e.nx, e.nz]; grp.userData.center = [e.mx + ox, e.mz + oz]; grp.userData.len = e.len;
    walls.push(grp);
  }
  // 鋼構柱（預設隱藏，導覽時出現）
  for (const [px, pz] of columnPoints()) {
    const c = new THREE.Group(); c.position.set(px, 0, pz);
    box(c, 0.3, eave, 0.08, stMat, 0, 0, -0.11); box(c, 0.3, eave, 0.08, stMat, 0, 0, 0.11); box(c, 0.06, eave, 0.22, stMat, 0, 0, 0);
    if (!metal) c.userData.structure = true;   // 鐵皮屋的柱子本來就外露
    buildingGroup.add(c); cols.push(c);
  }
  // 屋頂：倒 V（雙斜）屋頂，屋脊沿著長邊；每 6 m 一榀鋼構（柱＋沿斜面上去的 H 型鋼樑），樑上有檁條，最上面是浪板
  ceilingGroup = new THREE.Group(); ceilingGroup.userData.overhead = true; buildingGroup.add(ceilingGroup);
  roof = new THREE.Group();
  const alongX = (B.x1 - B.x0) >= (B.z1 - B.z0);
  const u0 = alongX ? B.x0 : B.z0, u1 = alongX ? B.x1 : B.z1, v0 = alongX ? B.z0 : B.x0, v1 = alongX ? B.z1 : B.x1;
  const vc = (v0 + v1) / 2, halfV = (v1 - v0) / 2, rise = Math.max(1.2, halfV * 0.18), slopeA = Math.atan2(rise, halfV);
  const W3 = (u, y, v) => (alongX ? new THREE.Vector3(u, y, v) : new THREE.Vector3(v, y, u));
  const roofY = (v) => eave + rise * (1 - Math.abs(v - vc) / halfV);
  // 一根沿著兩點的鋼樑（H 型：腹板＋上下翼板）
  const beam = (a, b, depth, width, grp = ceilingGroup) => {
    const g = new THREE.Group(), len = a.distanceTo(b); g.position.copy(a).lerp(b, 0.5); g.lookAt(b); grp.add(g);
    box(g, 0.012 + width * 0.08, depth, len, stMat, 0, -depth / 2, 0).userData.noShadow = true;
    for (const yy of [0, -depth]) box(g, width, 0.02, len, stMat, 0, yy - 0.01, 0).userData.noShadow = true;
    return g;
  };
  const nF = Math.max(2, Math.round((u1 - u0) / 6));
  for (let i = 0; i <= nF; i++) {
    const u = clamp(u0 + ((u1 - u0) * i) / nF, u0 + 0.25, u1 - 0.25);
    // 這一榀落在外框裡的那一段（描外框的建物不一定是長方形）
    const segs = clipLine(P, alongX ? 'x' : 'z', u);
    for (const [a1, a2] of segs) {
      const lo = Math.max(a1, v0), hi = Math.min(a2, v1), mid = clamp(vc, lo, hi);
      if (hi - lo < 1) continue;
      if (lo < mid) beam(W3(u, roofY(lo) - 0.02, lo), W3(u, roofY(mid) - 0.02, mid), 0.55, 0.2);
      if (mid < hi) beam(W3(u, roofY(mid) - 0.02, mid), W3(u, roofY(hi) - 0.02, hi), 0.55, 0.2);
    }
  }
  // 檁條：沿著屋脊方向，每 1.2 m 一支，靠在鋼樑上面
  for (const side of [-1, 1]) for (let k = 0; k * 1.2 < halfV - 0.3; k++) {
    const v = vc + side * (halfV - 0.4 - k * 1.2), y = roofY(v) - 0.1;
    for (const [a1, a2] of clipLine(P, alongX ? 'z' : 'x', v)) { const pz = beam(W3(a1 + 0.1, y, v), W3(a2 - 0.1, y, v), 0.15, 0.06); pz.traverse((o) => { if (o.isMesh) o.userData.softInk = true; }); }
  }
  // 屋脊一根
  beam(W3(u0 + 0.1, eave + rise - 0.05, vc), W3(u1 - 0.1, eave + rise - 0.05, vc), 0.3, 0.15);
  // 兩片斜屋面（浪板，往下順著斜面）：直接用四個角組出四邊形，屋簷往外伸 0.4 m
  const ov = 0.4, spanU0 = u0 - ov, spanU1 = u1 + ov;
  for (const sd of [-1, 1]) {
    const vE = vc + sd * (halfV + ov), yE = eave - ov * (rise / halfV), yR = eave + rise;
    const pts = [W3(spanU0, yR, vc), W3(spanU1, yR, vc), W3(spanU1, yE, vE), W3(spanU0, yE, vE)];
    const slope = Math.hypot(halfV + ov, yR - yE), spanU = spanU1 - spanU0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((q) => [q.x, q.y, q.z]), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, slope, spanU, slope, spanU, 0, 0, 0], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
    const pl = new THREE.Mesh(geo, roofMat); pl.userData.noShadow = true; roof.add(pl);
  }
  // 山牆（兩端的三角形）：也是浪板
  for (const sd of [-1, 1]) {
    const tri = new THREE.Shape([new THREE.Vector2(-halfV, 0), new THREE.Vector2(halfV, 0), new THREE.Vector2(0, rise)]);
    const tg = new THREE.ShapeGeometry(tri);
    const gm = new THREE.Mesh(tg, wallMat.clone()); gm.material.side = THREE.DoubleSide;
    const uw = sd < 0 ? u0 : u1;
    if (alongX) { gm.rotation.y = Math.PI / 2; gm.position.set(uw + sd * 0.12, eave, vc); } else { gm.position.set(vc, eave, uw + sd * 0.12); }
    gm.userData.noShadow = true; roof.add(gm);
  }
  // 鐵皮屋的牆內側：兩道橫向鋼樑（牆檁）
  if (metal) for (const e of edgesOf(P)) for (const hy of [H * 0.38, H * 0.76]) { const ix = -e.nx * 0.12, iz = -e.nz * 0.12; const gb = wallBox(ceilingGroup.parent, stMat, e.a[0] + ix, e.a[1] + iz, e.b[0] + ix, e.b[1] + iz, 0.18, 0.06, hy); if (gb) { gb.userData.noShadow = true; gb.userData.softInk = true; } }
  buildingGroup.add(roof);
  inkify(buildingGroup);
  roof.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  ceilingGroup.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  // dimension labels
  const { L, W } = state.building;
  const mk = (text, x, y, z, cls = '') => { const el = document.createElement('div'); el.className = 'dim ' + cls; el.textContent = text; const o = new CSS2DObject(el); o.position.set(x, y, z); o.userData.isDim = true; buildingGroup.add(o); };
  if (state.building.poly) mk(`外框 ${fmt1(L)}×${fmt1(W)} m・${Math.round(Math.abs(polyArea(P)) / PING).toLocaleString('zh-TW')} 坪`, 0, 0.2, B.z1 + 1.4);
  else { mk(`${fmt1(L)} m`, 0, 0.2, W / 2 + 1.4); mk(`${fmt1(W)} m`, L / 2 + 1.4, 0.2, 0); }
  mk(`淨高 ${fmt1(H)} m`, P[0][0] + 0.6, H, P[0][1] + 0.6, 'h');
  const hl = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(P[0][0] + 0.6, 0, P[0][1] + 0.6), new THREE.Vector3(P[0][0] + 0.6, H, P[0][1] + 0.6)]);
  const hline = new THREE.Line(hl, new THREE.LineDashedMaterial({ color: 0xc4552a, dashSize: 0.4, gapSize: 0.25 })); hline.computeLineDistances(); hline.userData.isDim = true;
  buildingGroup.add(hline);
}

// ---------------------------------------------------------------- zones in 3D: floor finish, glass partitions, a few fittings
// 每個區域的四邊：貼著外牆的邊不做隔間；門開在朝向館內中心的那一邊
// 區域本地座標 (lx, lz) → 世界座標；旋轉方向和物件相同（corners() 的公式）
function zoneW(z, lx, lz) { const r = ((z.rot || 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [z.x + lx * c + lz * s, z.z - lx * s + lz * c]; }
function zoneN(z, nx, nz) { const r = ((z.rot || 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [nx * c + nz * s, -nx * s + nz * c]; }
function zoneLocal(z, x, zz) { const r = ((z.rot || 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), dx = x - z.x, dz = zz - z.z; return [dx * c - dz * s, dx * s + dz * c]; }
function inZone(z, x, zz) { const [lx, lz] = zoneLocal(z, x, zz); return Math.abs(lx) <= z.w / 2 && Math.abs(lz) <= z.d / 2; }
// 疊在一起時：整片地板在最下面，其次大的在下、小的在上（點選時優先選到上面那個）
function zonesInOrder() { return state.zones.slice().sort((a, b) => ((a.type === 'floor' ? 0 : 1) - (b.type === 'floor' ? 0 : 1)) || (b.w * b.d - a.w * a.d)); }
function zoneLayout(z) {
  const hw = z.w / 2, hd = z.d / 2, C = (x, y) => zoneW(z, x, y), N = (x, y) => zoneN(z, x, y);
  const P = outlinePoly();
  const mk = (k, a, b, n) => ({ k, a, b, nx: n[0], nz: n[1] });
  const sides = [
    mk('n', C(-hw, -hd), C(hw, -hd), N(0, -1)), mk('e', C(hw, -hd), C(hw, hd), N(1, 0)),
    mk('s', C(hw, hd), C(-hw, hd), N(0, 1)), mk('w', C(-hw, hd), C(-hw, -hd), N(-1, 0)),
  ];
  const cs = sides.map((sd) => sd.a), x0 = Math.min(...cs.map((q) => q[0])), x1 = Math.max(...cs.map((q) => q[0])), z0 = Math.min(...cs.map((q) => q[1])), z1 = Math.max(...cs.map((q) => q[1]));
  const B = hallBounds(), cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
  for (const s of sides) {
    s.len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const mx = (s.a[0] + s.b[0]) / 2, mz = (s.a[1] + s.b[1]) / 2, ne = nearestEdge(mx, mz, P);
    s.onWall = ne.d < 0.7 && Math.abs(ne.e.nx * s.nx + ne.e.nz * s.nz) > 0.9;
    s.score = (s.nx * (cx - z.x) + s.nz * (cz - z.z)) / (Math.hypot(cx - z.x, cz - z.z) || 1);
  }
  const open = sides.filter((s) => !s.onWall);
  // 門不要開到隔壁區域裡（男廁的門開進女廁）：那一面外面 30 cm 落在別的區域就往後排
  const others = state.zones.filter((o) => o !== z && o.type !== 'floor');
  for (const s of open) { const mx = (s.a[0] + s.b[0]) / 2 + s.nx * 0.3, mz = (s.a[1] + s.b[1]) / 2 + s.nz * 0.3; s.blocked = others.some((o) => inZone(o, mx, mz)); }
  const want = z.door && open.find((sd) => sd.k === z.door);
  const door = zoneWalls(z) !== 'open' && open.length ? (want || open.slice().sort((a, b) => (a.blocked - b.blocked) || (b.score - a.score))[0]) : null;
  const dw = z.type === 'storage' ? 1.6 : 1.0;
  if (door) { const c = door.len / 2; door.door = [Math.max(0.2, c - dw / 2), Math.min(door.len - 0.2, c + dw / 2)]; }
  // 背面：有門就是門的對面；開放區域靠外牆那面，不然是離館內中心最遠的那面
  const back = door ? sides[(sides.indexOf(door) + 2) % 4] : (sides.find((s) => s.onWall) || sides.slice().sort((a, b) => a.score - b.score)[0]);
  return { sides, door, back, x0, x1, z0, z1, corners: cs };
}
function zoneGlassLen() {
  let clear = 0, frost = 0;
  for (const z of state.zones) {
    const zw = zoneWalls(z); if (zw !== 'glass' && zw !== 'frost') continue;
    for (const s of zoneLayout(z).sides) if (!s.onWall) { const l = s.len - (s.door ? s.door[1] - s.door[0] : 0); if (zw === 'frost') frost += l; else clear += l; }
  }
  return { clear, frost };
}
// 自由畫的牆：實心（粉刷）、玻璃（框料＋玻璃）、半牆、圍網
function buildPartitions() {
  for (const w of state.walls || []) {
    const g = new THREE.Group(); g.userData.wallId = w.id; zonesGroup.add(g);
    const [ax, az] = w.a, [bx, bz] = w.b, len = Math.hypot(bx - ax, bz - az), H = Math.min(w.h, state.building.H + 0.9);
    if (w.kind === 'solid' || w.kind === 'half') {
      wallBox(g, tinted(plasterMat, w.color), ax, az, bx, bz, H, 0.15);
      wallBox(g, steelMat, ax, az, bx, bz, 0.1, 0.17).userData.noInk = true;
    } else if (w.kind === 'glass') {
      const pane = wallBox(g, glassMat, ax, az, bx, bz, H - 0.1, 0.025, 0.05); pane.userData.noInk = true; pane.renderOrder = 2;
      wallBox(g, frameMat, ax, az, bx, bz, 0.06, 0.06, 0); wallBox(g, frameMat, ax, az, bx, bz, 0.06, 0.06, H - 0.06);
      const n = Math.max(1, Math.round(len / 1.2));
      for (let k = 0; k <= n; k++) box(g, 0.05, H, 0.06, frameMat, ax + ((bx - ax) * k) / n, 0, az + ((bz - az) * k) / n);
    } else {
      const t = netTexture('white').clone(); t.needsUpdate = true; t.repeat.set(len / 1.5, H / 1.5);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      m.position.set((ax + bx) / 2, H / 2, (az + bz) / 2); m.rotation.y = Math.atan2(-(bz - az), bx - ax); g.add(m);
      for (const [px, pz] of [[ax, az], [bx, bz]]) cyl(g, 0.03, 0.03, H, darkSteel, px, 0, pz);
    }
    colliders.push([ax, az, bx, bz]);
  }
}
function buildZones() {
  disposeGroup(zonesGroup); zoneDoors.length = 0; zoneRoofs.length = 0;
  const H = 2.7;
  zonesInOrder().forEach((z, zi) => {
    const Z = ZONES[z.type], g = new THREE.Group(); g.userData.zoneId = z.id; zonesGroup.add(g);
    const lay = zoneLayout(z);
    // 地坪
    const fm = FLOOR_MATS[zoneFloor(z)] || FLOOR_MATS.concrete;
    const geo = new THREE.PlaneGeometry(z.w, z.d);
    // UV 用世界公尺：區域轉了角度，地板紋路還是對齊同一個方向
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const [wx, wz] = zoneW(z, pos.getX(i), -pos.getY(i)); uv.setXY(i, wx, -wz); }
    const fl = new THREE.Mesh(geo, fm.clone());
    // 整片地板墊在球場底下（球場線畫在它上面），其他區域蓋在球場之上
    const under = z.type === 'floor';
    fl.material.polygonOffset = true; fl.material.polygonOffsetFactor = under ? -0.5 : -2 - zi * 0.3; fl.material.polygonOffsetUnits = under ? -0.5 : -2 - zi;
    fl.rotation.set(-Math.PI / 2, 0, ((z.rot || 0) * Math.PI) / 180); fl.position.set(z.x, (under ? 0.003 : 0.006) + zi * 0.0007, z.z); fl.receiveShadow = true; fl.userData.noInk = true; g.add(fl);
    // 邊框：開放區域在地上畫一圈細黑線（地坪分界條）
    const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(lay.corners.map(([x, zz]) => new THREE.Vector3(x, 0.02, zz))), inkSoft);
    rim.userData.ink = true; g.add(rim);
    const zw = zoneWalls(z);
    if (zw === 'solid' || zw === 'net') {
      // 組合屋（白色板牆＋屋頂）或圍網
      for (const s of lay.sides) {
        if (s.onWall) continue;
        const ux = (s.b[0] - s.a[0]) / s.len, uz = (s.b[1] - s.a[1]) / s.len, P = (t) => [s.a[0] + ux * t, s.a[1] + uz * t];
        const parts = s.door ? [[0, s.door[0]], [s.door[1], s.len]] : [[0, s.len]];
        for (const [t0, t1] of parts) {
          if (t1 - t0 < 0.05) continue;
          const [ax, az] = P(t0), [bx, bz] = P(t1);
          if (zw === 'solid') { wallBox(g, prefabMat, ax, az, bx, bz, 2.4, 0.06, 0); wallBox(g, prefabTrim, ax, az, bx, bz, 0.06, 0.08, 0); }
          else { const len = Math.hypot(bx - ax, bz - az), t = netTexture('white').clone(); t.needsUpdate = true; t.repeat.set(len / 1.5, 2.6 / 1.5); const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.6), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false })); m.position.set((ax + bx) / 2, 1.3, (az + bz) / 2); m.rotation.y = Math.atan2(-(bz - az), bx - ax); g.add(m); }
          colliders.push([ax, az, bx, bz]);
        }
        if (s.door && zw === 'solid') { const [ax, az] = P(s.door[0]), [bx, bz] = P(s.door[1]); wallBox(g, prefabMat, ax, az, bx, bz, 0.35, 0.06, 2.05); wallBox(g, prefabTrim, ax, az, ax + ux * 0.04, az + uz * 0.04, 2.05, 0.08, 0); addHingedDoor(g, [ax, az], [bx, bz], [s.nx, s.nz], 'solid'); }
      }
      if (zw === 'solid') { const roofM = new THREE.Mesh(new THREE.BoxGeometry(z.w, 0.06, z.d), prefabMat); roofM.position.set(z.x, 2.43, z.z); roofM.rotation.y = ((z.rot || 0) * Math.PI) / 180; roofM.visible = false; g.add(roofM); zoneRoofs.push(roofM); }
    }
    if (zw === 'glass' || zw === 'frost') {
      const gm = zw === 'frost' ? frostMat : glassMat;
      for (const s of lay.sides) {
        if (s.onWall) continue;
        const ux = (s.b[0] - s.a[0]) / s.len, uz = (s.b[1] - s.a[1]) / s.len;
        const parts = s.door ? [[0, s.door[0]], [s.door[1], s.len]] : [[0, s.len]];
        const P = (t) => [s.a[0] + ux * t, s.a[1] + uz * t];
        for (const [t0, t1] of parts) {
          if (t1 - t0 < 0.05) continue;
          const [ax, az] = P(t0), [bx, bz] = P(t1);
          const pane = wallBox(g, gm, ax, az, bx, bz, H - 0.1, 0.025, 0.05); pane.userData.noInk = true; pane.renderOrder = 2;
          wallBox(g, frameMat, ax, az, bx, bz, 0.06, 0.06, 0);
          wallBox(g, frameMat, ax, az, bx, bz, 0.06, 0.06, H - 0.06);
          const n = Math.max(1, Math.round((t1 - t0) / 1.2));
          for (let k = 0; k <= n; k++) { const [mx, mz] = P(t0 + ((t1 - t0) * k) / n); box(g, 0.05, H, 0.06, frameMat, mx, 0, mz); }
          colliders.push([ax, az, bx, bz]);
        }
        if (s.door) {   // 門框上方的楣
          const [ax, az] = P(s.door[0]), [bx, bz] = P(s.door[1]);
          wallBox(g, frameMat, ax, az, bx, bz, 0.08, 0.07, 2.2);
          const pane = wallBox(g, gm, ax, az, bx, bz, H - 2.3, 0.025, 2.28); pane.userData.noInk = true;
          addHingedDoor(g, [ax, az], [bx, bz], [s.nx, s.nz], zw);
        }
      }
    }
    // 自動擺設：照 zoneFixtures 畫一般元件（點到就拆成可調整的元件）
    if (!z.bare) zoneFixtures(z).forEach((f, i) => {
      const fg = buildItem({ id: '', ...f }, 0), tags = [];
      fg.traverse((o) => { if (o.userData.isTag) tags.push(o); delete o.userData.itemId; o.userData.zoneFix = { zid: z.id, i }; });
      for (const t of tags) t.removeFromParent();
      g.add(fg);
    });
    if (z.type !== 'floor') tag(g, zoneName(z), zw !== 'open' ? H + 0.35 : 0.6, 'zone', z.x, z.z).userData.zoneTag = true;
  });
  buildPartitions();
  inkify(zonesGroup);
}
// 區域裡的固定設施（不計價，只是讓 3D 看得出用途）；back = 離門最遠的那面
// 區域裡的擺設：靠哪一面牆、離角落多遠、離牆多遠，排成一般元件（type、位置、角度、尺寸）。
// 自動模式照這份清單畫（跟著區域大小變）；按「拆成可調整的元件」就變成真的元件，各自拖、轉、改大小、刪除。
function zoneFixtures(z) {
  if (z.type === 'floor') return [];
  const lay = zoneLayout(z), S = lay.sides, bi = S.indexOf(lay.back);
  const back = S[bi], right = S[(bi + 1) % 4], front = S[(bi + 2) % 4], left = S[(bi + 3) % 4];
  const along = back.len, across = right.len, out = [];
  // 貼著某一面：t = 沿著那一面的距離，dep = 元件中心離牆多遠；背面貼牆、正面朝區域內
  const at = (sd, t, dep, type, o = {}) => {
    const ux = (sd.b[0] - sd.a[0]) / sd.len, uz = (sd.b[1] - sd.a[1]) / sd.len, yaw = (Math.atan2(-uz, ux) * 180) / Math.PI;
    const f = { type, x: f2(sd.a[0] + ux * t - sd.nx * dep), z: f2(sd.a[1] + uz * t - sd.nz * dep), rot: Math.round(norm360(yaw + 180) * 100) / 100 };
    if (o.w) f.w = f2(o.w); if (o.d) f.d = f2(o.d); if (o.tone) f.tone = o.tone;
    out.push(f);
  };
  // 左右兩面：用「離背牆多遠」來放（右面從背牆那端開始，左面從門那端開始）
  const R = (dist) => dist, L = (dist) => left.len - dist;
  if (z.type === 'wc') {
    // 廁所：背牆一排隔間（男廁一半換小便斗），洗手台靠側牆、在隔間前走道和門口之間
    // 沒有隔間（一間式）：進門就是馬桶（男廁旁邊再一個小便斗）＋洗手台。小間的廁所自動用這種；也可以在區域設定指定
    const small = along * across < 10 || along < 1.9 || across < 2.2;
    if (z.wcl === 'open' || (small && z.wcl !== 'stalls')) {
      at(back, Math.min(along / 2, Math.max(0.45, along - 0.6)), 0.36, 'toilet');
      if (/男/.test(z.name || '') && along >= 2.2) at(back, Math.min(along / 2, Math.max(0.45, along - 0.6)) + (along / 2 > 1.2 ? -0.85 : 0.85), 0.2, 'urinal');
      if (across >= 1.9) at(left, L(Math.max(1.1, across - 0.75)), 0.28, 'sinkrow', { w: 0.6 });
      else at(right, R(0.4), 0.28, 'sinkrow', { w: 0.6 });
      for (const f of out) { const def = CAT[f.type]; if (!def.resize) { delete f.w; delete f.d; } else if (def.resize === 'w') delete f.d; }
      return out;
    }
    const male = /男/.test(z.name || ''), sw = 0.95;
    const sd = across >= 3.4 ? 1.5 : Math.max(1.2, across - 1.6);
    const slots = Math.max(1, Math.floor((along - 0.05) / sw));
    let stalls = male && slots >= 2 ? Math.ceil(slots / 2) : slots;
    const s0 = sd + 0.9, s1 = across - 1.1, sinkW = Math.min(2.4, Math.floor((s1 - s0) / 0.6) * 0.6);
    let sinkOnBack = false;
    if (sinkW >= 0.6) at(left, L(s0 + sinkW / 2), 0.28, 'sinkrow', { w: sinkW });
    else if (front.door && front.door[0] - 0.1 >= 0.6) { const w2 = Math.min(1.8, Math.floor((front.door[0] - 0.1) / 0.6) * 0.6); at(front, 0.05 + w2 / 2, 0.28, 'sinkrow', { w: w2 }); }
    else if (stalls > 1) { stalls--; sinkOnBack = true; }
    for (let i = 0; i < stalls; i++) at(back, 0.05 + sw * (i + 0.5), sd / 2, 'stall', { d: sd });
    let t = 0.05 + stalls * sw + 0.15;
    if (male) for (let i = 0; i < 4 && t + 0.6 <= along - (sinkOnBack ? 0.7 : 0.05); i++, t += 0.7) at(back, t + 0.3, 0.2, 'urinal');
    if (sinkOnBack) at(back, along - 0.35, 0.28, 'sinkrow', { w: 0.6 });
  } else if (z.type === 'locker') {
    // 更衣淋浴：右側一排淋浴間，背牆置物櫃，中間長椅
    const showers = along >= 3.2 && across >= 2.2 ? Math.min(3, Math.floor((across - 1.0) / 1.05)) : 0;
    for (let i = 0; i < showers; i++) at(right, R(0.05 + 0.5 + i * 1.05), 0.55, 'showerstall');
    const lw = Math.floor((along - (showers ? 1.25 : 0.3) - 0.3) / 0.45) * 0.45;
    if (lw >= 0.45) at(back, 0.3 + lw / 2, 0.25, 'locker', { w: lw, d: 0.5 });
    if (across > 2.6 && lw >= 1.8) at(back, 0.3 + lw / 2, Math.min(across - 1.2, 1.6), 'bench');
  } else if (z.type === 'reception') {
    // 櫃台：避開主入口那一段，後面一排層架
    const ent = entryInfo(), ux = (back.b[0] - back.a[0]) / along, uz = (back.b[1] - back.a[1]) / along, td = (ent.x - back.a[0]) * ux + (ent.z - back.a[1]) * uz;
    const onBack = Math.abs((ent.x - back.a[0]) * back.nx + (ent.z - back.a[1]) * back.nz) < 0.5 && td > -1 && td < along + 1;
    const tc = onBack ? (td < along / 2 ? along * 0.72 : along * 0.28) : along / 2, cw = onBack ? Math.min(3, along * 0.42) : Math.min(3, along - 0.8);
    at(back, tc, 0.25, 'shelf', { w: Math.max(0.6, cw + 0.2) });
    at(back, tc, Math.max(1.3, Math.min(across * 0.6, 3)), 'counter', { w: Math.max(1, cw), d: 0.8 });
  } else if (z.type === 'storage') {
    at(back, along / 2, 0.27, 'shelf', { w: Math.max(1, along - 0.6) });
    if (across > 2.2) at(back, along / 2, Math.min(across - 0.6, 1.5), 'ballcart');
  } else if (z.type === 'warmup') {
    for (let i = 0; i < Math.min(4, Math.floor(along / 1.4)); i++) at(back, 0.8 + i * 1.4, Math.min(across / 2, 1.6), 'warmmat', { tone: i % 2 ? 'gold' : '' });
  } else if (z.type === 'office') {
    at(back, along / 2, Math.min(across / 2, 1.6), 'desk');
    if (along > 2.4) at(back, 0.6, 0.25, 'shelf', { w: 0.9 });
  } else if (z.type === 'spectator') {
    const rows = Math.min(3, Math.floor(across / 0.8));
    if (rows) at(back, along / 2, rows * 0.4 + 0.05, 'bleacher', { w: Math.max(1, along - 0.6), d: rows * 0.8 });
  } else if (z.type === 'rest') {
    if (along > 2) { at(back, 0.5, 0.45, 'plant'); at(back, along - 0.5, 0.45, 'plant'); }
  }
  // 只留這個元件允許的尺寸欄位
  for (const f of out) { const def = CAT[f.type]; if (!def.resize) { delete f.w; delete f.d; } else if (def.resize === 'w') delete f.d; }
  return out;
}
// 把自動擺設拆成真的元件（各自可調）；回傳新元件的 id
function zoneToItems(zid, quiet) {
  const z = state.zones.find((x) => x.id === zid); if (!z || z.bare) return [];
  pushHistory();
  const ids = zoneFixtures(z).map((f) => { const it = { id: uid(), zone: z.id, ...f }; state.items.push(it); return it.id; });
  z.bare = true; planChanged(); renderZoneSel();
  if (!quiet) toast(`「${zoneName(z)}」裡的 ${ids.length} 個擺設拆成元件了：可以各自拖、轉、改大小、刪除，素材庫也能再加；移動區域時會一起跟著走`, 5200);
  return ids;
}
function zoneAutoAgain(z) {
  pushHistory();
  const n = state.items.filter((i) => i.zone === z.id).length;
  state.items = state.items.filter((i) => i.zone !== z.id); delete z.bare;
  if (selectedId && !state.items.some((i) => i.id === selectedId)) selectedId = null;
  planChanged(); renderZoneSel(); renderPlan();
  toast(n ? `已拿掉 ${n} 個區域元件，改回自動擺設（跟著區域大小）` : '改回自動擺設（跟著區域大小）');
}
// 移動／旋轉區域時，屬於它的元件跟著走
function zoneCarry(z) { return state.items.filter((i) => i.zone === z.id).map((it) => ({ it, x: it.x, z: it.z, rot: it.rot })); }
function applyCarry(carry, from, z) {
  if (!carry || !carry.length) return;
  const r0 = ((from.rot || 0) * Math.PI) / 180, c0 = Math.cos(r0), s0 = Math.sin(r0);
  for (const c of carry) {
    const dx = c.x - from.x, dz = c.z - from.z, lx = dx * c0 - dz * s0, lz = dx * s0 + dz * c0;
    const [wx, wz] = zoneW(z, lx, lz);
    c.it.x = f2(wx); c.it.z = f2(wz); c.it.rot = Math.round(norm360(c.rot + (z.rot || 0) - (from.rot || 0)) * 100) / 100;
    if (typeof moveObj === 'function') moveObj(c.it);
  }
}
function zoneEdit(z, fn) { const from = { ...z }, carry = zoneCarry(z); fn(); applyCarry(carry, from, z); }

// ---------------------------------------------------------------- items render
// ---------------------------------------------------------------- items render
const selOutline = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf2b705 }));
const multiOutlines = new THREE.Group(); scene.add(multiOutlines);
selOutline.renderOrder = 10; selOutline.material.depthTest = false;
scene.add(selOutline);
function renderItems() {
  spinners.length = 0;
  for (const g of itemObjs.values()) { disposeGroup(g); itemsGroup.remove(g); }
  itemObjs.clear();
  let ci = 0;
  for (const it of state.items) {
    const g = buildItem(it, CAT[it.type].court ? ci++ : 0);
    itemsGroup.add(g); itemObjs.set(it.id, g);
  }
  applyLabelVisibility();
  updateOutline();
}
function rerenderOne(it) {
  const old = itemObjs.get(it.id);
  if (old) {
    old.traverse((o) => { const k = spinners.indexOf(o); if (k >= 0) spinners.splice(k, 1); });
    disposeGroup(old); itemsGroup.remove(old);
  }
  const ci = state.items.filter((x) => CAT[x.type].court).indexOf(it);
  const g = buildItem(it, Math.max(0, ci));
  itemsGroup.add(g); itemObjs.set(it.id, g);
  applyLabelVisibility();
  if (typeof view !== 'undefined' && view === 'top' && CAT[it.type].ceiling && it.type !== 'camera') { g.visible = false; g.traverse((o) => { if (o.userData.isTag) o.visible = false; }); }
}
function applyLabelVisibility() {
  for (const g of itemObjs.values()) g.traverse((o) => { if (o.userData.isTag) o.visible = showLabels; });
}
function moveObj(it) { if (CAT[it.type].wall && typeof snapWallItem === 'function') { const r0 = it.rot; snapWallItem(it); if (r0 !== it.rot) { rerenderOne(it); return; } } if (it.type === 'camera' && typeof snapCamera === 'function') { snapCamera(it); const g0 = itemObjs.get(it.id); if (g0 && Math.abs(g0.rotation.y - (it.rot * Math.PI) / 180) > 1e-3) { rerenderOne(it); return; } } const g = itemObjs.get(it.id); if (g) { g.position.set(it.x, 0, it.z); g.rotation.y = (it.rot * Math.PI) / 180; } }
function outlineY(it) {
  const def = CAT[it.type];
  return def.wall ? (def.mountY || 0) + 0.05 : it.type === 'smoke' ? state.building.H - 0.1 : it.type === 'camera' ? Math.min(state.building.H - 1.2, 5.5) - 0.2 : def.ceiling ? (it.type === 'fan' ? state.building.H - 1.2 : state.building.H - 0.5) : 0.05;
}
function updateOutline() {
  for (const [id, g] of itemObjs) g.traverse((o) => { if (o.userData.camCone) o.visible = id === selectedId; });
  for (const o of multiOutlines.children) o.geometry.dispose();
  multiOutlines.clear();
  for (const m of selItems()) {
    if (m.id === selectedId) continue;
    const sz = sizeOf(m), y2 = outlineY(m);
    const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners(m.x, m.z, sz.w + 0.1, sz.d + 0.1, m.rot).map(([x, z]) => new THREE.Vector3(x, y2, z))), selOutline.material);
    l.renderOrder = 10; multiOutlines.add(l);
  }
  const it = state.items.find((x) => x.id === selectedId);
  if (!it) { selOutline.visible = false; return; }
  const { w, d } = sizeOf(it);
  const def = CAT[it.type];
  const y = def.wall ? (def.mountY || 0) + 0.05 : it.type === 'smoke' ? state.building.H - 0.1 : it.type === 'camera' ? Math.min(state.building.H - 1.2, 5.5) - 0.2 : def.ceiling ? (it.type === 'fan' ? state.building.H - 1.2 : state.building.H - 0.5) : 0.05;
  const pts = corners(it.x, it.z, w + 0.1, d + 0.1, it.rot).map(([x, z]) => new THREE.Vector3(x, y, z));
  selOutline.geometry.dispose();
  selOutline.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  selOutline.material.color.set(it.locked ? 0x9aa5b1 : 0xf2b705);
  selOutline.visible = true;
}

// ---------------------------------------------------------------- geometry checks
function corners(cx, cz, w, d, rotDeg) {
  const r = (rotDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
}
function overlap(a, b, eps = 0.02) {
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % 4];
      const ax = -(z2 - z1), az = x2 - x1, len = Math.hypot(ax, az) || 1;
      const proj = (p) => p.map(([x, z]) => (x * ax + z * az) / len);
      const pa = proj(a), pb = proj(b);
      if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
    }
  }
  return true;
}
function footprint(it) { const { w, d } = sizeOf(it); return corners(it.x, it.z, w, d, it.rot); }
function playRect(it) { const p = CAT[it.type].play; return corners(it.x, it.z, p[0], p[1], it.rot); }
function inside(poly) { if (state.building.poly) return poly.every(([x, z]) => pip(x, z, state.building.poly) || nearestEdge(x, z, state.building.poly).d < 0.05); const { L, W } = state.building; return poly.every(([x, z]) => Math.abs(x) <= L / 2 + 0.03 && Math.abs(z) <= W / 2 + 0.03); }

function computeChecks() {
  const { L, W, H } = state.building;
  const warns = [];
  const courts = state.items.filter((i) => CAT[i.type].court);
  const solidCourts = courts.filter((i) => i.mode !== 'lines');
  for (const it of state.items) {
    const def = CAT[it.type];
    if (!inside(footprint(it))) warns.push({ id: it.id, level: 'bad', text: `${labelOf(it)}超出廠房範圍` });
    if (!def.court && !def.ceiling && !def.zoneOK) {
      for (const c of courts) {
        if (overlap(footprint(it), footprint(c))) { warns.push({ id: it.id, level: 'bad', text: `${labelOf(it)}擋到${labelOf(c)}的緩衝區` }); break; }
      }
    }
    if (it.type === 'fan') {
      const blade = H - 1.2;
      for (const c of courts) {
        if (CAT[c.type].court === 'vb' && overlap(footprint(it), playRect(c), 0)) { warns.push({ id: it.id, level: blade < 9 ? 'bad' : 'note', text: `吊扇在${labelOf(c)}正上方，葉片離地只有 ${fmt1(blade)} m，高球可能打到` }); break; }
        if (CAT[c.type].court === 'bd' && overlap(footprint(it), playRect(c), 0)) { warns.push({ id: it.id, level: 'note', text: '吊扇在羽球場上方：打羽球時要關掉，不然球會飄' }); break; }
      }
    }
    if (it.type === 'light') {
      for (const c of courts) {
        if (CAT[c.type].court === 'vb' && overlap(footprint(it), playRect(c), 0)) { warns.push({ id: it.id, level: 'note', text: `燈在${labelOf(c)}正上方，發球、接高球會刺眼；建議移到邊線外` }); break; }
      }
    }
  }
  for (let i = 0; i < solidCourts.length; i++) for (let j = i + 1; j < solidCourts.length; j++) {
    const a = solidCourts[i], b = solidCourts[j];
    if (overlap(footprint(a), footprint(b), 0.05)) warns.push({ id: b.id, level: 'bad', text: `${labelOf(a)}和${labelOf(b)}的緩衝區重疊（另一面改成「只畫線」就能疊在一起）` });
  }
  // 區域：超出建物、壓到球場緩衝區、彼此重疊
  const zRect = (z) => corners(z.x, z.z, z.w, z.d, z.rot || 0);
  state.zones.forEach((z, i) => {
    if (!inside(zRect(z))) warns.push({ zid: z.id, level: 'bad', text: `${zoneName(z)}超出廠房範圍` });
    for (const c of solidCourts) if (overlap(zRect(z), footprint(c), 0.05)) { warns.push({ zid: z.id, level: 'bad', text: `${zoneName(z)}壓到${labelOf(c)}的緩衝區` }); break; }
    for (let j = i + 1; j < state.zones.length; j++) if (overlap(zRect(z), zRect(state.zones[j]), 0.05)) warns.push({ zid: state.zones[j].id, level: 'note', text: `${zoneName(z)}和${zoneName(state.zones[j])}重疊` });
  });
  if (H < 7) warns.unshift({ id: null, level: 'bad', text: `淨高 ${fmt1(H)} m，低於 7 m，高球會碰頂` });
  if (H - 1.2 < 7 && state.items.some((i) => i.type === 'fan')) warns.push({ id: null, level: 'note', text: `淨高 ${fmt1(H)} m 時，大型吊扇葉片只到 ${fmt1(H - 1.2)} m，建議裝在球場外圍或改用壁扇` });
  const area = L * W;
  const courtArea = solidCourts.reduce((s, c) => s + CAT[c.type].w * CAT[c.type].d, 0);
  const rest = Math.max(0, area - courtArea);
  if (solidCourts.length && rest / PING < 40) warns.push({ id: null, level: 'note', text: `球場以外只剩約 ${fmt1(rest / PING)} 坪，休息區、廁所、櫃台會很擠（建議 40 坪以上）` });
  return { warns, area, courtArea, rest, courts };
}
