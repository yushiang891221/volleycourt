// ---------------------------------------------------------------- three.js setup
const host = $('canvas-host');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.05;
THREE.Cache.enabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'label-layer';
host.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const PAPER = new THREE.Color('#F4EFE6');
scene.background = PAPER.clone();
// 室內環境反射：地板、金屬、玻璃有反光，不必下載天空圖
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !reduceMotion;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.minDistance = 2;
controls.maxDistance = 420;

// 暖白天光＋從天窗方向來的柔和主光（有陰影），室內讀成米白
const hemi = new THREE.HemisphereLight(0xfffaf0, 0xb9ad9a, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e2, 1.0);
sun.position.set(24, 60, 32);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xe8eefc, 0.15);
fill.position.set(-40, 30, -30);
scene.add(fill);
function fitShadow(span) {
  const c = sun.shadow.camera, h = span / 2 + 4;
  c.left = -h; c.right = h; c.top = h; c.bottom = -h; c.near = 1; c.far = 160; c.updateProjectionMatrix();
}

// 地面：一大張紙，建物站在圖紙上
const groundMat = new THREE.MeshStandardMaterial({ color: 0xece5d9, roughness: 1, envMapIntensity: 0.2 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.03;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------- post-processing：角落陰影（GTAO）→ 泛光 → AgX 色調 → SMAA
// 高畫質：電腦預設；低畫質：手機預設（不算 GTAO、像素比 1）。導覽時太卡會自動降成低畫質
let quality = VBSettings.values.quality;
const composer = new EffectComposer(renderer);
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.6, thickness: 1.4, scale: 1.15, samples: 12, distanceFallOff: 1 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
gtao.blendIntensity = 0.9;
{ // 墨線本來就不進 AO；玻璃這種不寫深度的透明面也拿掉，不然玻璃後面會多出一圈暗邊
  const ov = gtao.overrideVisibility.bind(gtao);
  gtao.overrideVisibility = function () { ov(); this.scene.traverse((o) => { if (o.isMesh && o.material && o.material.transparent && !o.material.depthWrite) o.visible = false; }); };
}
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.34, 0.5, 1.1);
const smaa = new SMAAPass(1, 1);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(gtao);
composer.addPass(bloom);
// 第一人稱廣角鏡頭（像運動攝影機）：先用更大的視角畫，再把畫面往中間收——中間的大小跟原本一樣、邊緣看得更多又不會被拉長
//   四個角維持在原位（不會出現黑邊）；LENS.k＝收的程度，0＝關（每一格在 14-loop 依視角算）
const LENS = { k: 0, base: 95 };   // base＝中間要看起來像幾度的一般鏡頭
const lensPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, k: { value: 0 }, aspect: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float k; uniform float aspect; varying vec2 vUv; ' +
    'void main(){ vec2 p = vUv * 2.0 - 1.0; float r2 = (p.x * p.x * aspect * aspect + p.y * p.y) / (aspect * aspect + 1.0); ' +
    '  vec2 s = p * (1.0 + k * r2) / (1.0 + k); gl_FragColor = texture2D(tDiffuse, s * 0.5 + 0.5); }',
});
lensPass.enabled = false;
composer.addPass(lensPass);
// 一般鏡頭算出來的螢幕座標（-1～1）→ 廣角鏡頭畫出來的位置（名牌、球的提示圈、蓄力條用）
function lensNdc(v) {
  const k = LENS.k; if (k <= 0) return v;
  const a = camera.aspect, R = Math.sqrt(a * a + 1), rs = Math.hypot(v.x * a, v.y) / R; if (rs < 1e-6) return v;
  let r = rs; for (let i = 0; i < 6; i++) r -= (r + k * r * r * r - rs * (1 + k)) / (1 + 3 * k * r * r);   // 解 r(1+k r²)=rs(1+k)
  v.x *= r / rs; v.y *= r / rs; return v;
}
function lensUpdate() {
  const fp = walk.on && !window.__rkOn && (RP.on ? RP.view === 'cam' : !(typeof tpActive === 'function' && tpActive())) && VBSettings.values.lens !== false;
  const half = (camera.fov * Math.PI) / 360, k = fp && camera.fov > LENS.base ? Math.tan(half) / Math.tan((LENS.base * Math.PI) / 360) - 1 : 0;
  LENS.k = k; lensPass.enabled = k > 0.005; lensPass.uniforms.k.value = k; lensPass.uniforms.aspect.value = camera.aspect;
}
composer.addPass(new OutputPass());
composer.addPass(smaa);
function renderScene() { composer.render(); }
// 泛光效果開關（系統設定 → 畫面）：關掉＝亮處不暈開，畫面比較清楚、不會濛濛的
const applyBloom = () => { bloom.enabled = VBSettings.values.bloom !== false; if (window.wakeRender) window.wakeRender(300); };
applyBloom(); addEventListener('vb-settings-change', applyBloom);
function applyQuality(save) {
  gtao.enabled = quality === 'high';
  renderer.setPixelRatio(quality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1);
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  for (const id of ['t-quality', 'w-quality']) { const b = document.getElementById(id); if (b) { b.textContent = quality === 'high' ? '畫質：高' : '畫質：省電'; b.setAttribute('aria-pressed', String(quality === 'high')); } }
  if (save) VBSettings.update({ quality });
  if (typeof resize === 'function' && host.clientWidth) resize();
}
const perf = { n: 0, sum: 0 };
let gameFast = false;
function syncGameFast() {
  const want = walk.on && typeof staGame === 'function' && staGame() && !RP.on;
  if (want === gameFast) return;
  gameFast = want;
  if (want) { gtao.enabled = false; renderer.setPixelRatio(1); resize(); }
  else applyQuality(false);
}
function watchPerf(dt) {
  syncGameFast();
  if (quality !== 'high' || gameFast || document.hidden || dt <= 0) return;
  perf.n++; perf.sum += dt;
  if (perf.n >= 90) { const avg = perf.sum / perf.n; perf.n = 0; perf.sum = 0; if (avg > 0.045) { quality = 'low'; applyQuality(false); VBSettings.update({ quality }); toast('畫面有點卡，已自動切到省電畫質（可在設定切回來）'); } }
}

const buildingGroup = new THREE.Group();
const zonesGroup = new THREE.Group();
const itemsGroup = new THREE.Group();
scene.add(buildingGroup, zonesGroup, itemsGroup);
let walls = [], cols = [];
let roof = null;
let ceilingGroup = null;     // 屋架與天花，只在室內看得到
let colliders = [];          // 導覽用的牆線段 [x1,z1,x2,z2]
const itemObjs = new Map(); // id -> Group
const spinners = [];

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#cccccc'; }
function applyTheme() { /* 圖紙風格只有亮色一種 */ }

// ---------------------------------------------------------------- materials: 寫實材質＋墨線輪廓
const matCache = new Map();
function mat(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.3, ...(extra || {}) }));
  return matCache.get(key);
}
// 墨線：在裁切空間把線往鏡頭拉一點點，避免和所在的面搶深度（不用 polygonOffset 推面，斜面會露出虛線）
const inkMat = new THREE.LineBasicMaterial({ color: 0x23211e, transparent: true, opacity: 0.62 });
inkMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  gl_Position.z -= 0.0006 * gl_Position.w;'); };
const inkSoft = inkMat.clone(); inkSoft.opacity = 0.3; inkSoft.onBeforeCompile = inkMat.onBeforeCompile;
const edgeCache = new WeakMap();
function inkify(root, soft) {
  const add = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.noInk || o.userData.inked) return;
    const m = o.material; if (!m || (m.transparent && m.opacity < 0.5) || m.isMeshBasicMaterial) return;
    o.castShadow = !o.userData.noShadow; o.receiveShadow = true;
    if (!m.userData.envSet) { m.envMapIntensity = m.userData.env ?? 0.3; m.userData.envSet = true; }
    let eg = edgeCache.get(o.geometry);
    if (!eg) { eg = new THREE.EdgesGeometry(o.geometry, 32); edgeCache.set(o.geometry, eg); }
    const ls = new THREE.LineSegments(eg, soft || o.userData.softInk ? inkSoft : inkMat);
    ls.userData.ink = true; ls.raycast = () => {};
    add.push([o, ls]); o.userData.inked = true;
  });
  for (const [o, ls] of add) o.add(ls);
}
function canvasTex(w, h, draw, rep) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); if (rep) t.repeat.set(rep, rep);
  return t;
}
function rnd32(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Poly Haven（CC0）真實貼圖，放在 img/tex/。UV 一律是公尺，所以 repeat = 1 / 貼圖代表的邊長，區域多大紋理密度都一樣
const texLoader = new THREE.TextureLoader();
const phCache = new Map();
function phTex(id, kind, rx, ry = rx) {
  const key = `${id}|${kind}|${rx}|${ry}`;
  if (phCache.has(key)) return phCache.get(key);
  const t = texLoader.load(`assets/img/tex/${id}_${kind}.jpg`, () => window.wakeRender && window.wakeRender(600));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (kind === 'diff') t.colorSpace = THREE.SRGBColorSpace;
  phCache.set(key, t); return t;
}
function phMat(id, sizeM, o = {}) {
  const r = 1 / sizeM, ns = o.ns ?? 0.8;
  const m = new THREE.MeshStandardMaterial({ map: o.noDiff ? null : phTex(id, 'diff', r), normalMap: phTex(id, 'nor', r), normalScale: new THREE.Vector2(ns, ns), roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, color: o.color ?? '#ffffff' });
  m.envMapIntensity = o.env ?? 0.3; m.userData.env = m.envMapIntensity;
  return m;
}
const FLOOR_MATS = {
  terrazzo: phMat('terrazzo_tiles', 2.0, { rough: 0.35, env: 0.25 }),
  wood: phMat('laminate_floor_02', 1.7, { rough: 0.5, env: 0.18 }),
  tile: phMat('long_white_tiles', 1.27, { rough: 0.3, env: 0.3 }),
  epoxy: phMat('smooth_concrete_floor', 2, { rough: 0.4, color: '#CFCBC3' }),
  mat: phMat('rubber_tiles', 2, { rough: 0.9, env: 0.2 }),
  concrete: phMat('smooth_concrete_floor', 2, { rough: 0.6 }),
  hall: phMat('smooth_concrete_floor', 2, { rough: 0.55, color: '#E6E3DD', env: 0.2 }),
  deck: phMat('oak_wood_planks', 0.6, { rough: 0.7, color: '#B07A4A', env: 0.15 }),
  vinyl: phMat('laminate_floor_02', 1.7, { rough: 0.5, color: '#C9CDD0', env: 0.15 }),
  pvc: phMat('smooth_concrete_floor', 2, { rough: 0.45, color: '#D3D7DC', env: 0.2, ns: 0.3 }),
  tiles: phMat('rubber_tiles', 0.61, { rough: 0.6, color: '#3F6FB4', env: 0.15, noDiff: true }),  // 拼裝地墊是彩色塑膠，只借貼圖的凹凸
  hardwood: phMat('laminate_floor_02', 1.7, { rough: 0.35, color: '#F3D9B0', env: 0.25 }),
};
const woodMat = phMat('oak_wood_planks', 1.2, { rough: 0.5, ns: 0.5 });
const leatherCache = new Map();
// 皮革：不指定顏色就是原本的焦糖色皮革；指定顏色（深藍防護套、座墊）只用皮革的法線，顏色用指定的，避免棕色×深藍變成黑色
function leatherMat(color) {
  const k = color || 'natural';
  if (!leatherCache.has(k)) {
    const m = color ? new THREE.MeshStandardMaterial({ color, roughness: 0.6, normalMap: phTex('fabric_leather_02', 'nor', 2), normalScale: new THREE.Vector2(0.5, 0.5) }) : phMat('fabric_leather_02', 0.5, { rough: 0.5, ns: 0.6, env: 0.25 });
    m.envMapIntensity = m.userData.env = color ? 0.25 : 0.25; leatherCache.set(k, m);
  }
  return leatherCache.get(k);
}
const glassMat = new THREE.MeshStandardMaterial({ color: '#D7E6EA', roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
const frostMat = new THREE.MeshStandardMaterial({ color: '#E4E9EA', roughness: 0.55, metalness: 0, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
const frameMat = new THREE.MeshStandardMaterial({ color: '#22304A', roughness: 0.5, metalness: 0.35 });
const prefabMat = new THREE.MeshStandardMaterial({ color: '#E8E4DA', roughness: 0.6 });
const prefabTrim = new THREE.MeshStandardMaterial({ color: '#8E9399', roughness: 0.5, metalness: 0.3 });
// 牆：Poly Haven 的灰泥顏色圖偏灰、有污漬，只拿它的法線做粉刷面的細微起伏，顏色用乾淨的米白漆
// 波浪鋼板：每 25 cm 一道起伏的法線貼圖（程式畫的），顏色淺灰白
const ribNormal = (() => {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 4; const c = cv.getContext('2d');
  for (let x = 0; x < 64; x++) { const sl = Math.cos((x / 64) * Math.PI * 2) * 0.85; const r = Math.round((sl * 0.5 + 0.5) * 255); c.fillStyle = `rgb(${r},128,${Math.round(Math.sqrt(Math.max(0, 1 - sl * sl)) * 127 + 128)})`; c.fillRect(x, 0, 1, 4); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 0.25, 1); return t;
})();
// 鐵皮浪板：梯形浪（每 20 cm 一道）＋淡淡的板片接縫與髒污，貼圖以公尺計
function sheetTextures(horizontal) {
  const S = 256, cv = document.createElement('canvas'), nv = document.createElement('canvas'); cv.width = nv.width = S; cv.height = nv.height = S;
  const c = cv.getContext('2d'), n = nv.getContext('2d'), img = c.createImageData(S, S), nim = n.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = ((horizontal ? y : x) / S) * 5 % 1;          // 一公尺五道浪
    // 梯形：平頂 35%、斜邊 15%、平底 35%、斜邊 15%
    let slope = 0, h = 0;
    if (t < 0.35) h = 1; else if (t < 0.5) { slope = -1; h = 1 - (t - 0.35) / 0.15; } else if (t < 0.85) h = 0; else { slope = 1; h = (t - 0.85) / 0.15; }
    const i = (y * S + x) * 4, streak = 6 * Math.sin(((horizontal ? x : y) / S) * 6.283 * 3 + y * 0.01);
    const v = 196 + h * 26 + streak + (slope ? -18 : 0);
    img.data[i] = v; img.data[i + 1] = v + 3; img.data[i + 2] = v + 7; img.data[i + 3] = 255;
    const sx = horizontal ? 0 : slope * 0.75, sy = horizontal ? slope * 0.75 : 0, sz = Math.sqrt(Math.max(0, 1 - sx * sx - sy * sy));
    nim.data[i] = (sx * 0.5 + 0.5) * 255; nim.data[i + 1] = (-sy * 0.5 + 0.5) * 255; nim.data[i + 2] = sz * 127 + 128; nim.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0); n.putImageData(nim, 0, 0);
  const map = new THREE.CanvasTexture(cv), nor = new THREE.CanvasTexture(nv);
  for (const t of [map, nor]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, nor };
}
const SHEET_H = sheetTextures(true), SHEET_V = sheetTextures(false);
const sheetWallMat = new THREE.MeshStandardMaterial({ color: '#E3E6E9', map: SHEET_H.map, normalMap: SHEET_H.nor, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.42, metalness: 0.45 });
sheetWallMat.envMapIntensity = sheetWallMat.userData.env = 0.4;
const roofSheetMat = new THREE.MeshStandardMaterial({ color: '#DADDE0', map: SHEET_V.map, normalMap: SHEET_V.nor, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide });
roofSheetMat.envMapIntensity = roofSheetMat.userData.env = 0.3;
const isMetal = () => state.building.wall !== 'plaster';
const metalWallMat = new THREE.MeshStandardMaterial({ color: '#DADDDF', roughness: 0.45, metalness: 0.35, normalMap: ribNormal, normalScale: new THREE.Vector2(0.9, 0.9) });
metalWallMat.envMapIntensity = metalWallMat.userData.env = 0.35;
const plasterMat = new THREE.MeshStandardMaterial({ color: '#EFEBE4', roughness: 0.92, normalMap: phTex('white_plaster_02', 'nor', 1), normalScale: new THREE.Vector2(0.35, 0.35) });
plasterMat.userData.env = plasterMat.envMapIntensity = 0.2;
const padMat = leatherMat('#24345A');
const darkSteel = new THREE.MeshStandardMaterial({ color: '#24272C', roughness: 0.45, metalness: 0.6 });
const chrome = new THREE.MeshStandardMaterial({ color: '#C9CCD0', roughness: 0.25, metalness: 0.9 });
const steelMat = new THREE.MeshStandardMaterial({ color: '#3B3F45', roughness: 0.55, metalness: 0.4 });
const deckMat = new THREE.MeshStandardMaterial({ color: '#D9DADB', roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide });
const ledMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FFF8EA', emissiveIntensity: 2.2, roughness: 0.3 });
const winMat = new THREE.MeshStandardMaterial({ color: '#E9F0F2', emissive: '#EEF3F4', emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1 });

// BoxGeometry 每一面的 UV 換成公尺（面的順序 +x、-x、+y、-y、+z、-z），貼圖不會因為改大小被拉長
function worldUV(geo) {
  const p = geo.parameters, uv = geo.attributes.uv;
  const dims = [[p.depth, p.height], [p.depth, p.height], [p.width, p.depth], [p.width, p.depth], [p.width, p.height], [p.width, p.height]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return geo;
}
function box(g, w, h, d, color, x = 0, y = 0, z = 0, extra) {
  const m = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, h, d)), color && color.isMaterial ? color : mat(color, extra));
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}
function cyl(g, rTop, rBot, h, color, x = 0, y = 0, z = 0, extra, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), color && color.isMaterial ? color : mat(color, extra));
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}
