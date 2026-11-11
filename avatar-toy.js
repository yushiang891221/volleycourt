// 公仔風角色（約 3 頭身、軟膠玩具質感）。回傳結構跟 gym.html 的 makeAvatar 一樣，avDrive／AVP 可以直接驅動。
// 面向 +z；arms[0]／legs[0] 是右手右腳（在 -x 那側）。五官是畫在頭上的貼圖；頭髮是一束一束沿頭皮彎曲、尾端變細的髮束。
// 表情不是外觀選項：遊戲中按 T 換表情／動作，用 setExpression(av, key)。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const OPTIONS = {
  sex: ['男', '女'],
  skin: ['#FFE3CF', '#F7D2B4', '#EBB894', '#CF9468', '#A06A47', '#6E4632'],
  hair: ['刺蝟頭', '蓬鬆捲髮', '紋理短髮', '頭帶短髮', '高馬尾', '雙辮子', '長直髮', '鮑伯頭'],
  hairColor: ['#2A2321', '#4A2C1A', '#7A4A2A', '#E2B04E', '#B5402F', '#9A9DA3'],
  eyes: ['圓眼', '長睫毛', '亮晶晶', '瞇瞇眼', '顏文字 • •', '顏文字 ^ ^', '顏文字 > <', '顏文字 - -'],
  top: ['無袖', '短袖', '長袖', '短版'],
  pants: ['排球短褲', '運動長褲'],
  knee: ['黑色護膝', '白色護膝', '不穿'],
  shoe: ['#E0483E', '#F4F4F0', '#2C2F38', '#3D74DA'],
};
export const EXPRESSIONS = { '': '平常', happy: '開心', focus: '專注', strain: '用力 > <', sad: '難過', wow: '驚訝' };
const KEYS = ['sex', 'skin', 'hair', 'hairColor', 'eyes', 'top', 'pants', 'knee', 'shoe'];
export const DEFAULT_LOOK = { v: 2, sex: 0, skin: 1, hair: 0, hairColor: 1, eyes: 0, top: 1, num: 10, pants: 0, knee: 0, shoe: 0 };

export function encodeLook(L) {
  const eq = L && L.eq; L = normLook(L);
  return 't2' + KEYS.map((k) => L[k].toString(36)).join('') + String(L.num).padStart(2, '0') + equipSuffix(eq);
}
export function decodeLook(code) {
  if (typeof code !== 'string' || !/^t2[0-9a-z]{9}\d{2}(~e[0-9a-z]{4})?$/.test(code)) return { ...DEFAULT_LOOK };
  const L = {}; KEYS.forEach((k, i) => (L[k] = parseInt(code[2 + i], 36))); L.num = +code.slice(11, 13);
  const o = normLook(L), eq = decodeEquip(code.slice(14)); if (eq) o.eq = eq;
  return o;
}
// ---------- 裝備（官方送的配件；之後商店賣的也放這裡）----------
// 護膝還是存在外觀代碼（knee），其他配件存在外觀代碼後面的「~e＋4 碼」：帽子、眼鏡、項鍊、護腕，0＝沒戴
export const EQUIP = {
  hat: { name: '帽子', items: ['不戴', '運動帽（黑）', '運動帽（白）'] },
  glasses: { name: '眼鏡', items: ['不戴', '粗框眼鏡（黑）', '細框眼鏡（金）', '運動墨鏡'] },
  neck: { name: '項鍊', items: ['不戴', '運動項鍊（銀）', '運動項鍊（金）'] },
  wrist: { name: '護腕', items: ['不戴', '護腕（白）', '護腕（黑）'] },
};
const EQ_KEYS = Object.keys(EQUIP);
function equipSuffix(eq) {
  if (!eq) return '';
  const d = EQ_KEYS.map((k) => { const n = eq[k] | 0; return n > 0 && n < EQUIP[k].items.length ? n : 0; });
  return d.some(Boolean) ? '~e' + d.map((n) => n.toString(36)).join('') : '';
}
export function decodeEquip(s) {
  if (typeof s !== 'string' || !/^e[0-9a-z]{4}$/.test(s)) return null;
  const eq = {}; EQ_KEYS.forEach((k, i) => { const n = parseInt(s[1 + i], 36); eq[k] = n < EQUIP[k].items.length ? n : 0; });
  return eq;
}
export const encodeEquip = (eq) => equipSuffix(eq).slice(1);
function normLook(L) {
  const o = { ...DEFAULT_LOOK };
  if (L && typeof L === 'object') for (const k of KEYS) { const n = L[k] | 0; if (n >= 0 && n < OPTIONS[k].length) o[k] = n; }
  const n = L ? L.num | 0 : 10; o.num = n >= 0 && n <= 99 ? n : 10;
  if (o.pants === 1) o.knee = 2;   // 長褲不戴護膝
  return o;
}
function rng(seed) { let s = (seed * 2654435761) >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function randomLook(seed = 1) {
  const r = rng(seed), L = {}; for (const k of KEYS) L[k] = Math.floor(r() * OPTIONS[k].length);
  L.hair = L.sex ? 4 + Math.floor(r() * 4) : Math.floor(r() * 4);
  L.pants = r() < 0.8 ? 0 : 1; L.num = 1 + Math.floor(r() * 99);
  return normLook(L);
}

// ---------- 材質（同參數共用） ----------
const MATS = new Map();
function mat(color, rough = 0.72, extra) {
  const key = color + rough + (extra ? JSON.stringify(extra) : '');
  if (!MATS.has(key)) MATS.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  return MATS.get(key);
}
const NAVY = '#1F2A48';
const HAIRM = new Map();
function hairMat(c) {   // 頭髮：平滑、柔和高光，加一點邊緣光澤（sheen）讓髮型輪廓乾淨
  if (!HAIRM.has(c)) HAIRM.set(c, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.52, metalness: 0, vertexColors: true, sheen: 0.7, sheenRoughness: 0.6, sheenColor: new THREE.Color(c).lerp(new THREE.Color('#FFFFFF'), 0.45), side: THREE.DoubleSide }));
  return HAIRM.get(c);
}
// 隊服：開賽時依隊伍分配，玩家不能選。teamColor 可以傳 'orange'／'blue'，或傳舊的隊伍色碼（暖色→橘黑、冷色→藍白）
export const KITS = {
  orange: { name: '橘黑隊', body: '#F07C24', trim: '#1C1C21', num: '#1C1C21', numEdge: '#FFFFFF', shorts: '#1C1C21', accent: '#F07C24' },
  blue: { name: '藍白隊', body: '#F3F5F8', trim: '#4F9FDB', num: '#3A86C8', numEdge: '#F3F5F8', shorts: '#3A78BE', accent: '#4F9FDB' },
};
export function kitOf(team) {
  if (KITS[team]) return KITS[team];
  if (team && typeof team === 'object') {   // WEB-010 球隊球衣：{ name, body, trim, num }（短褲跟著邊條色、背號外框白色）
    const hex = (c, d) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : d);
    const body = hex(team.body, '#2B6CB0'), trim = hex(team.trim, '#F2F2EE'), num = hex(team.num, '#FFFFFF');
    return { name: `team:${body}${trim}${num}`, label: String(team.name || '球隊球衣').slice(0, 12), body, trim, num, numEdge: num.toUpperCase() === '#FFFFFF' ? '#1C1C21' : '#FFFFFF', shorts: trim, accent: trim };
  }
  try { const h = new THREE.Color(team).getHSL({}).h; return h < 0.17 || h > 0.9 ? KITS.orange : KITS.blue; } catch { return KITS.orange; }
}

// ---------- 貼圖：臉 ----------
const FACE_W = 1024, FACE_H = 512, PX = FACE_W / (Math.PI * 2);
const TEX = new Map();
function faceTexture(skin, eyes, sex, expr) {
  const key = ['f', skin, eyes, sex, expr || ''].join('|');
  if (TEX.has(key)) return TEX.get(key);
  const c = document.createElement('canvas'); c.width = FACE_W; c.height = FACE_H; const x = c.getContext('2d');
  x.fillStyle = skin; x.fillRect(0, 0, FACE_W, FACE_H);
  const fem = sex === 1, cx = FACE_W * 0.25, cy = FACE_H * 0.5;   // 正前方（+z）在 u＝0.25
  const ex = (fem ? 0.37 : 0.35) * PX, ey = cy + 0.06 * PX, ink = '#3A2620';
  x.fillStyle = fem ? 'rgba(246,118,120,0.42)' : 'rgba(236,128,110,0.28)';
  for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * 0.62 * PX, cy + 0.36 * PX, 0.15 * PX, 0.08 * PX, 0, 0, 7); x.fill(); }
  let E = expr ? { happy: 5, sad: 'T', strain: 6, focus: null, wow: 'o' }[expr] : null; if (E == null) E = eyes;
  const mouth = expr ? { happy: 'open', sad: 'frown', strain: 'grit', focus: 'flat', wow: 'o' }[expr] : 'smile';
  const brow = expr ? { happy: 'up', sad: 'sad', strain: 'angry', focus: 'angry', wow: 'up' }[expr] : fem ? 'soft' : 'bold';
  x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = ink; x.fillStyle = ink;
  // 眉毛：男生粗而直、女生細而彎
  for (const s of [-1, 1]) {
    const bx = cx + s * ex, by = ey - (fem ? 0.33 : 0.29) * PX, w = (fem ? 0.12 : 0.14) * PX;
    const tilt = brow === 'angry' || brow === 'bold' ? (brow === 'bold' ? 0.025 : 0.06) : brow === 'sad' ? -0.06 : 0, lift = brow === 'up' ? -0.04 * PX : 0;
    x.lineWidth = (fem ? 0.026 : 0.05) * PX;
    x.beginPath(); x.moveTo(bx - w * s, by + lift - tilt * PX); x.quadraticCurveTo(bx, by + lift - (fem ? 0.04 : 0.015) * PX, bx + w * s, by + lift + tilt * PX); x.stroke();
  }
  // 眼睛
  const big = fem ? 1.12 : 0.95;
  for (const s of [-1, 1]) {
    const px = cx + s * ex, py = ey, rx = 0.13 * PX * big, ry = 0.175 * PX * big;
    x.save(); x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = 0.045 * PX;
    if (E === 0 || E === 1 || E === 2) {
      x.beginPath(); x.ellipse(px, py, rx, ry, 0, 0, 7); x.fillStyle = E === 2 ? '#4A2E22' : ink; x.fill();
      if (E === 2 || fem) { x.fillStyle = E === 2 ? '#9A6440' : '#6A4430'; x.beginPath(); x.ellipse(px, py + ry * 0.38, rx * 0.72, ry * 0.45, 0, 0, 7); x.fill(); }
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(px + rx * 0.28, py - ry * 0.38, rx * 0.34, ry * 0.26, 0, 0, 7); x.fill();
      x.beginPath(); x.arc(px - rx * 0.35, py + ry * 0.45, rx * 0.14, 0, 7); x.fill();
      if (E === 1 || fem) {   // 睫毛
        x.strokeStyle = ink; x.lineWidth = 0.03 * PX;
        x.beginPath(); x.arc(px, py + ry * 0.15, rx * 1.12, Math.PI * 1.12, Math.PI * 1.88); x.stroke();
        x.beginPath(); x.moveTo(px + s * rx * 1.05, py - ry * 0.45); x.lineTo(px + s * rx * 1.45, py - ry * 0.75); x.stroke();
        x.beginPath(); x.moveTo(px + s * rx * 0.8, py - ry * 0.75); x.lineTo(px + s * rx * 1.1, py - ry * 1.1); x.stroke();
      }
    } else if (E === 3) { x.beginPath(); x.arc(px, py - ry * 0.1, rx, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke(); }
    else if (E === 4) { x.beginPath(); x.arc(px, py, rx * 0.55, 0, 7); x.fill(); }
    else if (E === 5) { x.beginPath(); x.moveTo(px - rx, py + ry * 0.3); x.lineTo(px, py - ry * 0.5); x.lineTo(px + rx, py + ry * 0.3); x.stroke(); }
    else if (E === 6) { x.beginPath(); x.moveTo(px + s * rx, py - ry * 0.6); x.lineTo(px - s * rx * 0.9, py); x.lineTo(px + s * rx, py + ry * 0.6); x.stroke(); }
    else if (E === 7) { x.beginPath(); x.moveTo(px - rx, py); x.lineTo(px + rx, py); x.stroke(); }
    else if (E === 'T') { x.beginPath(); x.moveTo(px - rx, py - ry * 0.5); x.lineTo(px + rx, py - ry * 0.5); x.moveTo(px, py - ry * 0.5); x.lineTo(px, py + ry * 0.7); x.stroke(); x.strokeStyle = '#7CC4F0'; x.beginPath(); x.moveTo(px + s * rx * 0.6, py + ry * 0.5); x.lineTo(px + s * rx * 0.6, py + ry * 1.6); x.stroke(); }
    else if (E === 'o') { x.lineWidth = 0.035 * PX; x.beginPath(); x.arc(px, py, rx * 0.8, 0, 7); x.stroke(); x.beginPath(); x.arc(px, py, rx * 0.3, 0, 7); x.fill(); }
    x.restore();
  }
  // 嘴巴（女生嘴唇帶粉色）
  const my = cy + 0.46 * PX, mw = (fem ? 0.1 : 0.12) * PX; x.lineWidth = 0.03 * PX; x.strokeStyle = fem ? '#C4505A' : '#8A3B32';
  x.beginPath();
  if (mouth === 'smile') {
    if (fem) { x.fillStyle = '#E2707A'; x.moveTo(cx - mw, my - 0.015 * PX); x.quadraticCurveTo(cx, my + 0.1 * PX, cx + mw, my - 0.015 * PX); x.quadraticCurveTo(cx, my + 0.03 * PX, cx - mw, my - 0.015 * PX); x.fill(); }
    else { x.moveTo(cx - mw, my - 0.02 * PX); x.quadraticCurveTo(cx, my + 0.08 * PX, cx + mw, my - 0.02 * PX); x.stroke(); }
  }
  else if (mouth === 'flat') { x.moveTo(cx - mw * 0.7, my); x.lineTo(cx + mw * 0.7, my); x.stroke(); }
  else if (mouth === 'o') { x.fillStyle = '#8A3B32'; x.ellipse(cx, my, 0.035 * PX, 0.045 * PX, 0, 0, 7); x.fill(); }
  else if (mouth === 'open') { x.fillStyle = '#8A3B32'; x.moveTo(cx - mw, my - 0.03 * PX); x.quadraticCurveTo(cx, my + 0.16 * PX, cx + mw, my - 0.03 * PX); x.closePath(); x.fill(); x.fillStyle = '#F07A7A'; x.beginPath(); x.ellipse(cx, my + 0.05 * PX, mw * 0.45, 0.03 * PX, 0, 0, 7); x.fill(); }
  else if (mouth === 'frown') { x.moveTo(cx - mw * 0.8, my + 0.04 * PX); x.quadraticCurveTo(cx, my - 0.05 * PX, cx + mw * 0.8, my + 0.04 * PX); x.stroke(); }
  else if (mouth === 'grit') { x.fillStyle = '#fff'; x.rect(cx - mw, my - 0.035 * PX, mw * 2, 0.07 * PX); x.fill(); x.stroke(); x.beginPath(); x.moveTo(cx - mw, my); x.lineTo(cx + mw, my); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  TEX.set(key, t); return t;
}

// ---------- 球衣：身體外型（沿弧長取點，貼圖才不會變形） ----------
const TORSO = {
  0: [[0.222, 0], [0.214, 0.08], [0.214, 0.18], [0.224, 0.27], [0.226, 0.32], [0.205, 0.36], [0.15, 0.39], [0.085, 0.405], [0.062, 0.41]],
  1: [[0.212, 0], [0.19, 0.09], [0.192, 0.18], [0.206, 0.27], [0.208, 0.32], [0.188, 0.358], [0.135, 0.388], [0.078, 0.402], [0.056, 0.406]],
};
const TORSO_CROP = {   // 短版：下擺在肚臍上方，比較合身
  0: [[0.212, 0.15], [0.218, 0.21], [0.224, 0.27], [0.226, 0.32], [0.205, 0.36], [0.15, 0.39], [0.085, 0.405], [0.062, 0.41]],
  1: [[0.188, 0.15], [0.196, 0.21], [0.206, 0.27], [0.208, 0.32], [0.188, 0.358], [0.135, 0.388], [0.078, 0.402], [0.056, 0.406]],
};
const TORSO_Z = 0.72;
function torsoProfile(sex, crop) {
  const curve = new THREE.SplineCurve((crop ? TORSO_CROP : TORSO)[sex].map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getSpacedPoints(36); return { pts, len: curve.getLength() };
}
// 球衣貼圖：u＝0 在正前方，v 依弧長（下擺 0 → 領口 1）。畫布比例對應實際尺寸，字不會被拉寬。
// 背號字型：網路字型 Anton（粗的窄體運動字），每台電腦看起來都一樣；畫球衣前先載好（preloadAvatars 會等）
const NUM_FONT = { family: '"Anton", "Arial Narrow", Impact, sans-serif', k: 0.92 };
// 背號一個字一個字畫：兩位數中間留一點空隙（字寬的 8%），整組置中；先畫所有外框再畫所有字，外框不會蓋到隔壁的字
function drawNumber(x, txt, cx, cy, size, edge, fill) {
  x.font = `${size * NUM_FONT.k}px ${NUM_FONT.family}`; x.textAlign = 'left'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  const ch = [...String(txt)], w = ch.map((c) => x.measureText(c).width), gap = size * 0.08, total = w.reduce((a, b) => a + b, 0) + gap * (ch.length - 1);
  const xs = []; let cur = cx - total / 2; for (const wi of w) { xs.push(cur); cur += wi + gap; }
  x.lineWidth = size * 0.08; x.strokeStyle = edge; ch.forEach((c, i) => x.strokeText(c, xs[i], cy));
  x.fillStyle = fill; ch.forEach((c, i) => x.fillText(c, xs[i], cy));
}
function jerseyTexture(kit, num, sex, crop) {
  const color = kit.body, key = ['j', kit.name, num, sex, crop ? 1 : 0].join('|');
  if (TEX.has(key)) return TEX.get(key);
  const { len } = torsoProfile(sex, crop), circ = Math.PI * 2 * 0.215 * (1 + TORSO_Z) / 2;
  const W = 1024, H = Math.round((W * len) / circ), ppm = W / circ;   // ppm：每公尺幾像素
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, W, H);
  // 兩側直條、V 領滾邊（前面 u＝0／1）、下擺一條細邊
  x.fillStyle = kit.trim;
  for (const u of [0.25, 0.75]) x.fillRect(u * W - 0.03 * ppm, 0, 0.06 * ppm, H);
  for (const ox of [0, W]) { x.beginPath(); x.moveTo(ox - 0.075 * ppm, 0); x.lineTo(ox, 0.085 * ppm); x.lineTo(ox + 0.075 * ppm, 0); x.lineTo(ox + 0.05 * ppm, 0); x.lineTo(ox, 0.055 * ppm); x.lineTo(ox - 0.05 * ppm, 0); x.closePath(); x.fill(); }
  x.fillRect(0, H - 0.012 * ppm, W, 0.012 * ppm);
  // 背號：前面胸口中等大小、背後大號；運動字體、白字細深色邊
  const txt = String(num), yFromTop = (v) => H * (1 - v);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  const draw = (cxp, v, hM) => {
    drawNumber(x, txt, cxp, yFromTop(v), hM * ppm * 1.32, kit.numEdge, kit.num);
  };
  if (crop) { draw(0, 0.42, 0.1); draw(W, 0.42, 0.1); draw(W * 0.5, 0.42, 0.15); } else { draw(0, 0.56, 0.11); draw(W, 0.56, 0.11); draw(W * 0.5, 0.52, 0.17); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  TEX.set(key, t); return t;
}

// ---------- 幾何（共用） ----------
const GEO = new Map();
const geo = (key, make) => { if (!GEO.has(key)) GEO.set(key, make()); return GEO.get(key); };
const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const tubeOpen = (pts, seg = 24) => lathe(pts, seg);   // 開口管子（不封底），材質用 DoubleSide

// 尺寸（公尺）：總高約 1.78，約 3 頭身
const CAP_HY = 0.27 * 0.88 + 0.03, HIP_H = 0.62, L1 = 0.29, KN_ANK = 0.27, ANK_SOLE = 0.06, HEAD_R = 0.27, HEAD_S = [1.04, 0.95, 0.98];
const SPINE_Y = 0.66, SH_Y = 0.34, UA = 0.22, FA = 0.19;

export function makeToyAvatar(look, team = 'orange') {
  const L = normLook(look); if (look && look.eq) L.eq = look.eq;   // 裝備跟著帶進去
  if (AVATAR_ASSETS[L.sex]) return makeGLBAvatar(L, team, AVATAR_ASSETS[L.sex]);
  return makeProceduralAvatar(L, team);
}

function makeProceduralAvatar(look, team = 'orange') {
  const L = normLook(look), fem = L.sex === 1, SH_X = fem ? 0.238 : 0.255;
  const skinC = OPTIONS.skin[L.skin], hairC = OPTIONS.hairColor[L.hairColor], shoeC = OPTIONS.shoe[L.shoe];
  const skin = mat(skinC, 0.62), hairM = hairMat(hairC), white = mat('#F6F6F2', 0.7);
  const cloth = (c) => mat(c, 0.78, { side: THREE.DoubleSide });
  const kit = kitOf(team), navy = cloth(kit.shorts), trim = cloth(kit.trim), jersey = cloth(kit.body), padM = cloth(L.knee === 1 ? '#F2F2EE' : '#24262C');
  const g = new THREE.Group(), body = new THREE.Group(), root = new THREE.Group(); g.add(body); body.add(root);
  const add = (gm, m, x, y, z, parent, sc) => { const o = new THREE.Mesh(gm, m); o.position.set(x, y, z); if (sc) o.scale.set(...sc); o.castShadow = true; parent.add(o); return o; };
  const sphere = (r, w = 20, h = 14) => geo('s' + r + w + h, () => new THREE.SphereGeometry(r, w, h));
  const capsule = (r, l, s = 16) => geo('c' + r + l + s, () => new THREE.CapsuleGeometry(r, l, 6, s));
  const ring = (r, t) => geo('r' + r + t, () => new THREE.TorusGeometry(r, t, 8, 28));

  // ---- 腿 ----
  const legs = [], knees = [], feet = [], longP = L.pants === 1;
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.095, HIP_H, 0); root.add(hip);
    add(capsule(0.07, L1 - 0.06), skin, 0, -L1 / 2, 0, hip);
    const knee = new THREE.Group(); knee.position.set(0, -L1, 0); hip.add(knee);
    add(capsule(0.062, KN_ANK - 0.05), skin, 0, -KN_ANK / 2, 0, knee);
    if (!longP) add(geo('sock', () => tubeOpen([[0.068, 0.0], [0.07, 0.06], [0.068, 0.12]], 20)), white, 0, -KN_ANK - 0.01, 0, knee);
    if (L.knee !== 2) add(geo('pad', () => tubeOpen([[0.066, -0.065], [0.077, -0.05], [0.082, -0.01], [0.081, 0.03], [0.074, 0.055], [0.064, 0.065]], 28)), padM, 0, -0.01, 0.004, knee);
    const foot = new THREE.Group(); foot.position.set(0, -KN_ANK, 0); knee.add(foot);
    add(sphere(0.095, 24, 16), mat(shoeC, 0.55), 0, -0.012, 0.05, foot, [0.85, 0.66, 1.45]);
    add(geo('sole', () => new THREE.CylinderGeometry(0.085, 0.085, 0.03, 24)), white, 0, -0.047, 0.05, foot, [0.95, 1, 1.68]);
    for (let k = 0; k < 2; k++) add(geo('lace', () => new THREE.BoxGeometry(0.06, 0.01, 0.014)), white, 0, 0.034 - k * 0.012, 0.05 + k * 0.03, foot).rotation.x = -0.6;
    legs.push(hip); knees.push(knee); feet.push(foot);
  }
  // ---- 褲子：整件一塊的蒙皮網格，綁在骨盆＋大腿（長褲再加膝蓋），抬腿時布料跟著平滑彎，不會裂開或穿模 ----
  const pants = pantsMesh(longP, kit, root, legs, knees); pants.castShadow = true;
  // ---- 上身（球衣） ----
  const spine = new THREE.Group(); spine.position.set(0, SPINE_Y, 0); root.add(spine);
  const crop = L.top === 3, prof = torsoProfile(L.sex, crop);
  if (crop) add(geo('waist' + L.sex, () => lathe([[0.17, 0.02], [0.168, 0.08], [0.18, 0.16], [0.17, 0.2], [0, 0.21]], 28)), skin, 0, 0, 0, spine, [fem ? 0.95 : 1, 1, TORSO_Z]);   // 短版露出的腰
  const torsoM = new THREE.MeshStandardMaterial({ map: jerseyTexture(kit, L.num, L.sex, crop), roughness: 0.78, side: THREE.DoubleSide });
  const torso = add(geo('torso' + L.sex + (crop ? 'c' : ''), () => new THREE.LatheGeometry(prof.pts, 40)), torsoM, 0, 0.005, 0, spine); torso.scale.set(1, 1, TORSO_Z);
  // ---- 手（袖子比手臂寬一點，跟著肩膀一起動） ----
  const arms = [], elbows = [], hands = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * SH_X, SH_Y, 0); spine.add(sh);
    add(sphere(0.06, 18, 14), L.top === 0 ? skin : jersey, 0, -0.005, 0, sh);
    add(capsule(0.054, UA - 0.04), skin, 0, -UA / 2, 0, sh);
    if (L.top >= 1) {
      const end = L.top === 2 ? -UA + 0.01 : L.top === 3 ? -0.09 : -0.115;
      add(geo('sleeve' + L.top, () => tubeOpen([[0, 0.088], [0.035, 0.084], [0.062, 0.068], [0.078, 0.042], [0.084, 0.0], [0.084, -0.03], [0.082, end]], 28)), jersey, 0, 0, 0, sh);
      if (L.top !== 2) add(geo('cuffS' + L.top, () => tubeOpen([[0.083, end + 0.016], [0.086, end + 0.006], [0.084, end - 0.004], [0.07, end - 0.008]], 24)), trim, 0, 0, 0, sh);
    }
    const el = new THREE.Group(); el.position.set(0, -UA, 0); sh.add(el);
    add(capsule(0.049, FA - 0.03), skin, 0, -FA / 2, 0, el);
    if (L.top === 2) { add(geo('fore', () => tubeOpen([[0.075, 0.03], [0.07, -0.08], [0.062, -FA + 0.035]], 20)), jersey, 0, 0, 0, el); add(geo('cuffL', () => tubeOpen([[0.064, -FA + 0.05], [0.066, -FA + 0.04], [0.064, -FA + 0.03], [0.054, -FA + 0.026]], 20)), trim, 0, 0, 0, el); }
    const hd = new THREE.Group(); hd.position.set(0, -FA, 0); el.add(hd);
    add(sphere(0.062, 18, 14), skin, 0, -0.045, 0, hd, [0.9, 1.12, 0.72]);
    add(capsule(0.022, 0.035, 10), skin, -sx * 0.045, -0.03, 0.018, hd).rotation.z = -sx * 0.6;
    arms.push(sh); elbows.push(el); hands.push(hd);
  }
  // ---- 頭 ----
  const head = new THREE.Group(); head.position.set(0, 0.41, -0.025); spine.add(head);
  add(capsule(fem ? 0.05 : 0.056, 0.04), skin, 0, 0.02, 0, head);
  const hy = HEAD_R * 0.88 + 0.03;
  const faceM = new THREE.MeshStandardMaterial({ map: faceTexture(skinC, L.eyes, L.sex), roughness: 0.6 });
  const skull = add(sphere(HEAD_R, 48, 32), faceM, 0, hy, 0, head, fem ? [1.01, 0.96, 0.98] : HEAD_S);
  add(sphere(0.022, 10, 8), skin, 0, hy - 0.035, HEAD_R * 0.97, head);
  for (const s of [-1, 1]) add(sphere(0.05, 12, 10), skin, s * HEAD_R * 1.02, hy - 0.015, -0.01, head, [0.5, 1, 0.8]);
  add(hairGeometry(L.hair, hy), hairM, 0, 0, 0, head);
  if (L.hair === 3) add(ring(0.262, 0.024), mat(kit.accent, 0.7), 0, hy + 0.1, -0.03, head, [1.04, 1, 0.98]).rotation.x = Math.PI / 2 - 0.3;
  if (L.hair === 4 || L.hair === 5) for (const p of hairTies(L.hair, hy)) add(ring(0.032, 0.014), mat(kit.accent, 0.7), p.x, p.y, p.z, head).lookAt(head.localToWorld(p.clone().add(p.n)));

  return { kit, g, body, root, spine, head, arms, elbows, hands, legs, knees, feet, phase: 0, rig: true, chibi: true, L1, L2: KN_ANK + ANK_SOLE, hipH: HIP_H, look: L, _skull: skull, _faceM: faceM };
}

export function setExpression(av, key) {
  if (!av || !av._faceM) return;
  const L = av.look;
  if (av.glb) {
    av._faceM = glbFaceMaterial(L, key || ''); av._skull.material = av._faceM;
  } else { av._faceM.map = faceTexture(OPTIONS.skin[L.skin], L.eyes, L.sex, key || ''); av._faceM.needsUpdate = true; }
}

// ---------- Blender 模型（幾何、材質與貼圖共用；骨架逐人獨立） ----------
const AVATAR_ASSETS = [], GLB_MATS = new Map();
// 背號字型（Anton）要先載好才畫球衣
function loadNumFont() {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  if ([...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Anton' && f.status === 'loaded')) return Promise.resolve();   // fonts.check 在字型還沒宣告時也回 true，不能用
  let l = document.getElementById('vb-num-font');
  const sheet = new Promise((ok) => {   // 樣式表（@font-face）要先載好，fonts.load 才知道去哪裡下載字型
    if (!l) { l = document.createElement('link'); l.id = 'vb-num-font'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Anton&display=swap'; document.head.append(l); }
    else if (l.sheet) return ok();
    l.addEventListener('load', ok, { once: true }); l.addEventListener('error', ok, { once: true });
  });
  return Promise.race([sheet.then(() => document.fonts.load('64px "Anton"', '0123456789')), new Promise((r) => setTimeout(r, 4000))]).catch(() => {});
}
let avatarPromise, jerseyLayout;
const webPoint = ([x, y, z]) => new THREE.Vector3(x, z, -y);
const boneKey = name => name.replace(/[.]/g, '');
function partVisible(name, L) {
  const m = /^(top|collar|pants|knee|hair)_(\d+)$/.exec(name);
  if (m) return (m[1] !== 'knee' || (L.pants !== 1 && L.knee !== 2)) && +m[2] === L[m[1] === 'collar' ? 'top' : m[1]];
  return name !== 'headband_3' || L.hair === 3;
}
function sphericalUV(x, y, z) {
  const r = Math.hypot(x, y, z) || 1;
  return [((Math.atan2(z, -x) / (2 * Math.PI)) % 1 + 1) % 1, 1 - Math.acos(Math.max(-1, Math.min(1, y / r))) / Math.PI];
}
function unwrapFaceTriangle(uv) {
  if (Math.max(...uv.map(p => p[0])) - Math.min(...uv.map(p => p[0])) > 0.5)
    uv.forEach(p => { if (p[0] < 0.5) p[0] += 1; });
  return uv;
}
function projectHeadUV(geometry, center) {
  // 非索引幾何讓接縫兩側可各自使用 u 與 u+1，並保留 skinIndex/skinWeight。
  const gm = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const p = gm.attributes.position, uv = [];
  for (let i = 0; i < p.count; i += 3) {
    const tri = [0, 1, 2].map(j => sphericalUV(p.getX(i + j) - center.x, p.getY(i + j) - center.y, p.getZ(i + j) - center.z));
    unwrapFaceTriangle(tri).forEach(pair => uv.push(...pair));
  }
  gm.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return gm;
}
async function readAvatarJSON(file) {
  const response = await fetch(new URL(file, import.meta.url), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return response.json();
}
async function loadAvatar(sex) {
  const loader = new GLTFLoader();
  const [gltf, meta] = await Promise.all([
    // 先 fetch 以限定等待時間，失敗仍可使用舊角色。
    fetch(new URL(`models/avatar_${sex}.glb`, import.meta.url), { signal: AbortSignal.timeout(15000) })
      .then(r => { if (!r.ok) throw new Error(`avatar_${sex}.glb: HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(data => loader.parseAsync(data, new URL('models/', import.meta.url).href)),
    readAvatarJSON(`models/avatar_${sex}.json`),
  ]);
  const scene = gltf.scene, found = new Set(); scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!o.isSkinnedMesh) return;
    // GLTFLoader 會改寫重名 head，鞋子兩個 primitive 也會變成群組。
    let part, node = o;
    while (node && !part) {
      const index = gltf.parser.associations.get(node)?.nodes;
      const original = index == null ? null : gltf.parser.json.nodes[index].name;
      if (meta.parts.includes(original)) part = original;
      node = node.parent;
    }
    if (!part) throw new Error(`找不到零件名稱對照：${o.name}`);
    found.add(part); o.userData.avatarPart = part;
    const assoc = gltf.parser.associations.get(o);
    o.userData.avatarPrimitive = assoc?.primitives ?? 0;
    // 一次轉成模型世界座標，之後重綁與 UV 都使用同一座標系。
    o.geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (part === 'head') o.geometry = projectHeadUV(o.geometry, webPoint(meta.headC));
    o.userData.avatarBones = o.skeleton.bones.map(b => {
      const index = gltf.parser.associations.get(b)?.nodes;
      return index == null ? b.name : gltf.parser.json.nodes[index].name;
    });
    for (const name of o.userData.avatarBones) {
      if (name !== 'neutral_bone' && !meta.bones.some(b => boneKey(b) === boneKey(name))) throw new Error(`未知骨頭：${name}`);
    }
  });
  for (const part of meta.parts) if (!found.has(part) && !part.startsWith('collar_')) console.warn(`[avatar] 缺少零件 ${sex}/${part}`);
  for (const required of ['body', 'head']) if (!found.has(required)) throw new Error(`缺少必要零件 ${required}`);
  return { scene, meta };
}
export function preloadAvatars() {
  if (!avatarPromise) avatarPromise = (async () => {
    await loadNumFont();   // 背號字型先載好再畫球衣
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('avatar') === 'legacy') return false;   // 開發用：?avatar=legacy 用舊的程式角色（比較效能）
    try { jerseyLayout = await readAvatarJSON('models/jersey_layout.json'); }
    catch (error) { console.warn('[avatar] 球衣排版載入失敗，使用備用角色', error); return false; }
    await Promise.all([0, 1].map(async sex => {
      try { AVATAR_ASSETS[sex] = await loadAvatar(sex); }
      catch (error) { console.warn(`[avatar] 模型 ${sex} 載入失敗，使用備用角色`, error); }
    }));
    return [0, 1].every(sex => Boolean(AVATAR_ASSETS[sex]));
  })();
  return avatarPromise;
}
function glbMaterial(key, params) {
  if (!GLB_MATS.has(key)) GLB_MATS.set(key, new THREE.MeshPhysicalMaterial(params));
  return GLB_MATS.get(key);
}
function glbFaceMaterial(L, expr = '') {
  const map = faceTexture(OPTIONS.skin[L.skin], L.eyes, L.sex, expr); map.wrapS = THREE.RepeatWrapping;
  // 臉貼圖已有膚色，材質保持白色避免二次乘色。
  return glbMaterial(`face|${L.skin}|${L.eyes}|${L.sex}|${expr}`, { map, roughness: 0.35, clearcoat: 0.25 });
}
function glbJerseyTexture(kit, num) {
  const key = `glbJersey|${kit.name}|${num}`; if (TEX.has(key)) return TEX.get(key);
  const d = jerseyLayout, c = document.createElement('canvas'); c.width = c.height = d.size;
  const x = c.getContext('2d'), W = d.size, Y = v => (1 - v) * W;
  const [lo, hi] = d.torso_v, tv = t => lo + (hi - lo) * t;
  x.fillStyle = kit.body; x.fillRect(0, 0, W, W);
  for (const [width, color] of [[d.side_piping_half, '#FFFFFF'], [d.side_stripe_half, kit.trim]]) {
    x.fillStyle = color;
    for (const u of d.side_u) x.fillRect((u - width) * W, Y(tv(d.raglan.bottom_tv)), width * 2 * W, (tv(d.raglan.bottom_tv) - lo) * W);   // 側條只到腋下，不畫到肩膀頂端
  }
  x.strokeStyle = '#FFFFFF'; x.lineWidth = d.raglan.half_width * 2 * W;
  for (const u of [d.front_u, d.back_u]) for (const side of [-1, 1]) {
    x.beginPath(); x.moveTo((u + side * d.raglan.top_du) * W, Y(d.raglan.top_v));
    x.lineTo((u + side * d.raglan.bottom_du) * W, Y(tv(d.raglan.bottom_tv))); x.stroke();
  }
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  for (const [u, height, size] of [[d.front_u, 0.7, 0.13], [d.back_u, 0.6, 0.21]]) {
    drawNumber(x, num, u * W, Y(tv(height)), W * size, kit.numEdge, kit.num);
  }
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;   // glb 的 UV 已經是 glTF 的上下方向（Blender 輸出時翻過一次），畫布不能再翻
  texture.wrapS = THREE.RepeatWrapping; texture.anisotropy = 4; TEX.set(key, texture); return texture;
}
function glbPartMaterial(part, L, kit, primitive) {
  if (part === 'head') return glbFaceMaterial(L);
  if (part === 'body') return glbMaterial(`skin|${L.skin}`, { color: OPTIONS.skin[L.skin], roughness: 0.35, clearcoat: 0.25 });
  if (part.startsWith('hair_')) return glbMaterial(`hair|${L.hairColor}`, { color: OPTIONS.hairColor[L.hairColor], vertexColors: true, roughness: 0.24, clearcoat: 0.7 });
  if (part.startsWith('top_')) return glbMaterial(`top|${kit.name}|${L.num}`, { map: glbJerseyTexture(kit, L.num), roughness: 0.78, side: THREE.DoubleSide });
  const color = part.startsWith('collar_') ? kit.trim : part.startsWith('pants_') ? kit.shorts
    : part === 'knee_0' ? '#24262C' : part === 'knee_1' ? '#F2F2EE'
    : part === 'headband_3' ? kit.accent : part.startsWith('shoe') && primitive === 0 ? OPTIONS.shoe[L.shoe] : '#F6F6F2';
  return glbMaterial(`solid|${color}`, { color, roughness: 0.65 });
}
function makeGLBRig(meta) {
  const g = new THREE.Group(), body = new THREE.Group(), root = new THREE.Group(); g.add(body); body.add(root);
  // root 保留遊戲的零位移，否則 avDrive 的貼地公式會額外抬高 0.56 公尺。
  const groups = { root }, positions = { root: new THREE.Vector3() };
  const add = (name, parent, armAngle = 0) => {
    const group = new THREE.Group(), position = webPoint(meta.joints[name][0]);
    group.position.copy(position).sub(positions[parent]);
    if (armAngle) group.position.applyAxisAngle(new THREE.Vector3(0, 0, 1), -armAngle);
    groups[parent].add(group); groups[name] = group; positions[name] = position; return group;
  };
  const spine = add('spine', 'root'), head = add('head', 'spine');
  const arms = [], elbows = [], hands = [], legs = [], knees = [], feet = [];
  for (const [i, side] of ['R', 'L'].entries()) {
    const angle = (i ? 1 : -1) * meta.armA;
    legs.push(add(`thigh.${side}`, 'root')); knees.push(add(`shin.${side}`, `thigh.${side}`)); feet.push(add(`foot.${side}`, `shin.${side}`));
    arms.push(add(`upperarm.${side}`, 'spine')); elbows.push(add(`forearm.${side}`, `upperarm.${side}`, angle)); hands.push(add(`hand.${side}`, `forearm.${side}`, angle));
    arms[i].rotation.z = angle;
  }
  const bones = {};
  for (const [name, group] of Object.entries(groups)) { const b = new THREE.Bone(); b.name = name; group.add(b); bones[boneKey(name)] = b; }
  // Blender 匯出器為未加權頂點增加的固定骨頭，也必須跟著角色 root。
  const neutral = new THREE.Bone(); root.add(neutral); bones.neutral_bone = neutral;
  return { g, body, root, spine, head, arms, elbows, hands, legs, knees, feet, bones };
}
function makeGLBAvatar(L, team, asset) {
  const rig = makeGLBRig(asset.meta), kit = kitOf(team), copy = cloneSkeleton(asset.scene), meshes = [];
  copy.traverse(o => { if (o.isSkinnedMesh && partVisible(o.userData.avatarPart, L)) meshes.push(o); });
  const skeletons = new Map(); let skull;
  for (const mesh of meshes) {
    const part = mesh.userData.avatarPart;
    rig.root.add(mesh); mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
    mesh.material = glbPartMaterial(part, L, kit, mesh.userData.avatarPrimitive);
    mesh.frustumCulled = false; mesh.castShadow = true;
    const names = mesh.userData.avatarBones, key = names.join('|');
    rig.g.updateMatrixWorld(true);
    if (!skeletons.has(key)) skeletons.set(key, new THREE.Skeleton(names.map(n => rig.bones[boneKey(n)])));
    // 必須保留 glTF skinIndex 的原始順序，不能用 metadata 的 bones 排序。
    mesh.bind(skeletons.get(key), mesh.matrixWorld);
    if (part === 'head') skull = mesh;
  }
  rig.arms.forEach(a => { a.rotation.z = 0; }); rig.g.updateMatrixWorld(true);
  rig.head.scale.setScalar(0.64);   // 頭縮小一點（太大會擋視野）；頭和頭髮都綁在 head 骨頭，一起縮
  if (L.eq) addAccessories(rig, L.eq, asset.meta, meshes);
  return { ...rig, kit, look: L, phase: 0, rig: true, chibi: true, glb: true,
    L1: 0.29, L2: 0.33, hipH: 0.62, _skull: skull, _faceM: skull?.material };
}
// ---------- 配件的 3D 模型：直接綁在頭、脊椎、前臂骨頭上，跟著角色動 ----------
const ACC_MAT = new Map();
function accMat(color, o = {}) {
  const key = color + JSON.stringify(o); if (!ACC_MAT.has(key)) ACC_MAT.set(key, new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.45, metalness: o.m ?? 0, transparent: !!o.op, opacity: o.op ?? 1 }));
  return ACC_MAT.get(key);
}
function addAccessories(rig, eq, meta, meshes = []) {
  const hc = webPoint(meta.headC).sub(webPoint(meta.joints.head[0])), R = meta.headR;   // 頭中心（head 骨頭座標）
  const mesh = (geo, mat, parent, pos, rot) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; if (pos) m.position.copy(pos); if (rot) m.rotation.set(...rot); parent.add(m); return m; };
  if (eq.hat) {   // 運動帽：頭髮壓進帽子；後面開洞讓馬尾穿出來（洞開在馬尾實際的位置）；帽緣在眉毛上面不遮眼睛；內面也畫
    const col = eq.hat === 1 ? '#22252B' : '#F2F2EE', inner = eq.hat === 1 ? '#15171B' : '#D9D9D4';
    const cc = new THREE.Vector3(0, R * 0.3, -R * 0.04), cap = { r: R * 1.1, sx: 1.05, sy: 0.88, sz: 1.06 }, phi = Math.PI * 0.56;
    const g = new THREE.Group(); g.position.copy(hc).add(cc); rig.head.add(g);
    const rimY = Math.cos(phi) * cap.r * cap.sy, head0 = webPoint(meta.joints.head[0]), cw = head0.clone().add(hc).add(cc);
    const ax = cap.r * cap.sx * 0.94, ay = cap.r * cap.sy * 0.94, az = cap.r * cap.sz * 0.94;
    const hairs = meshes.filter((m) => /^(hair|headband)/.test(m.userData.avatarPart || ''));
    const sm = (v, e0, e1) => { const q = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return q * q * (3 - 2 * q); };
    const ell = (x, y, z) => Math.sqrt((x / ax) ** 2 + (y / ay) ** 2 + (z / az) ** 2), azOf = (x, z) => Math.abs(Math.atan2(x, -z));
    // 找馬尾：後面、離頭比較遠的頭髮在穿過帽子那一帶的範圍 → 洞開在那裡；沒有馬尾就用帽子後面的小洞
    let hole = null, ys = [], azs = [], tail = 0;   // 沒有馬尾的髮型：帽子後面不開洞
    for (const m of hairs) { const a = m.geometry.attributes.position; for (let k = 0; k < a.count; k++) { const x = a.getX(k) - cw.x, y = a.getY(k) - cw.y, z = a.getZ(k) - cw.z, d = ell(x, y, z); if (y > rimY && azOf(x, z) < 1.0) { if (d > 1.4) tail++; if (d > 1.0 && d < 1.3) { ys.push(y); azs.push(azOf(x, z)); } } } }
    if (tail > 30 && ys.length > 30) {   /* 真的有馬尾（往後伸很遠）才照馬尾位置開洞 */ ys.sort((p, q) => p - q); azs.sort((p, q) => p - q); const q = (arr, f) => arr[Math.floor(f * (arr.length - 1))];
      hole = { az: Math.min(0.75, q(azs, 0.9) + 0.12), lo: Math.max(rimY + R * 0.04, q(ys, 0.05) - R * 0.06), hi: q(ys, 0.95) + R * 0.06 }; }
    const holeW = (x, y, z) => !hole ? 0 : (1 - sm(azOf(x, z), hole.az - 0.1, hole.az + 0.15)) * sm(y, hole.lo - R * 0.06, hole.lo + R * 0.04) * (1 - sm(y, hole.hi - R * 0.04, hole.hi + R * 0.08));
    // 帽身（挖掉洞）
    const shell = new THREE.SphereGeometry(cap.r, 48, 22, 0, Math.PI * 2, 0, phi);
    { const ia = shell.index.array, pa = shell.attributes.position, keep = [];
      for (let k = 0; k < ia.length; k += 3) { let cx = 0, cy = 0, cz = 0; for (let t = 0; t < 3; t++) { cx += pa.getX(ia[k + t]); cy += pa.getY(ia[k + t]); cz += pa.getZ(ia[k + t]); }
        if (holeW((cx / 3) * cap.sx, (cy / 3) * cap.sy, (cz / 3) * cap.sz) < 0.5) keep.push(ia[k], ia[k + 1], ia[k + 2]); }
      shell.setIndex(keep); }
    const dome = mesh(shell, accMat(col, { r: 0.6 }), g); dome.scale.set(cap.sx, cap.sy, cap.sz);
    const lining = mesh(shell, new THREE.MeshStandardMaterial({ color: inner, roughness: 0.9, side: THREE.BackSide }), g); lining.scale.copy(dome.scale);   // 帽子內面
    mesh(new THREE.SphereGeometry(R * 0.1, 12, 8), accMat(col, { r: 0.6 }), g, new THREE.Vector3(0, cap.r * cap.sy, 0));   // 頂端扣子
    // 頭髮壓進帽子：每個角色自己一份頭髮形狀。洞那裡只有離頭遠的（馬尾）不壓；帽緣下面 0.3R 也往內收（不會從帽子邊緣戳出尖尖的髮絲）
    for (const m of hairs) {
      m.geometry = m.geometry.clone(); const a = m.geometry.attributes.position;
      for (let k = 0; k < a.count; k++) {
        const x = a.getX(k) - cw.x, y = a.getY(k) - cw.y, z = a.getZ(k) - cw.z, d0 = ell(x, y, z);
        const keepOut = holeW(x, y, z) * sm(d0, 0.98, 1.12);
        if (keepOut > 0.99) continue;
        if (y >= rimY + R * 0.02) { if (d0 > 1) { const f = 1 - (1 - 1 / d0) * (1 - keepOut); a.setXYZ(k, cw.x + x * f, cw.y + y * f, cw.z + z * f); } continue; }
        const t = Math.max(0, 1 - (rimY + R * 0.02 - y) / (R * 0.3)) * (1 - keepOut); if (t <= 0) continue;
        const rr = Math.hypot(x / ax, z / az); if (rr <= 1) continue;
        const k2 = 1 - (1 - 1 / rr) * t; a.setXYZ(k, cw.x + x * k2, cw.y + y, cw.z + z * k2);
      }
      a.needsUpdate = true; m.geometry.computeBoundingSphere();
    }
    // 帽簷：半月形，內緣貼著帽身前緣（帽緣那一圈），往前伸 0.6R、稍微往下壓
    const rIn = cap.r * cap.sz * Math.sin(phi) * 0.99, rOut = rIn + R * 0.6, seg = 28, a0 = -1.15, a1 = 1.15, th = R * 0.045, drop = R * 0.025, pos = [], idx = [];
    for (let k = 0; k <= seg; k++) {
      const an = a0 + ((a1 - a0) * k) / seg, w = Math.cos((k / seg - 0.5) * Math.PI), ro = rIn + (rOut - rIn) * w;
      const xi = Math.sin(an) * rIn * (cap.sx / cap.sz), zi = Math.cos(an) * rIn, xo = Math.sin(an) * ro * (cap.sx / cap.sz), zo = Math.cos(an) * ro;
      pos.push(xi, rimY, zi, xo, rimY - drop * w, zo, xi, rimY - th, zi, xo, rimY - drop * w - th, zo);
    }
    for (let k = 0; k < seg; k++) { const a = k * 4, b = a + 4; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setIndex(idx); bg.computeVertexNormals();
    mesh(bg, new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, side: THREE.DoubleSide }), g);
  }
  if (eq.glasses) {   // 眼鏡：兩個鏡框＋鼻樑架＋鏡腳勾到耳朵，鏡片透明（運動墨鏡是深色）；照臉的弧度往兩邊轉
    const kind = eq.glasses, thick = kind === 1 ? 0.034 : kind === 2 ? 0.014 : 0.026, frameC = kind === 2 ? '#D4AF5A' : '#1C1E24';
    const frame = accMat(frameC, { r: kind === 2 ? 0.25 : 0.45, m: kind === 2 ? 0.9 : 0.1 });
    const glass = new THREE.MeshStandardMaterial({ color: kind === 3 ? '#14171C' : '#CFE6FF', roughness: 0.05, metalness: 0.3, transparent: true, opacity: kind === 3 ? 0.88 : 0.16, depthWrite: false });
    const g = new THREE.Group(); g.position.copy(hc).add(new THREE.Vector3(0, -R * 0.06, 0)); rig.head.add(g);
    const lensR = R * (kind === 3 ? 0.21 : 0.19), ex = R * 0.34, turn = 0.36, fz = R * 0.985;
    for (const sd of [-1, 1]) {
      const lens = new THREE.Group(); lens.position.set(sd * ex, 0, fz * Math.cos(turn * 0.9)); lens.rotation.y = sd * turn; g.add(lens);
      const ring = mesh(new THREE.TorusGeometry(lensR, R * thick, 8, 40), frame, lens); if (kind === 3) ring.scale.set(1.12, 0.86, 1);   // 墨鏡：橫的橢圓
      const disc = mesh(new THREE.CircleGeometry(lensR, 32), glass, lens); disc.scale.copy(ring.scale); disc.castShadow = false;
      // 鏡腳：從鏡框外側往後到耳朵
      const ox = sd * (ex + lensR * Math.cos(turn) * (kind === 3 ? 1.12 : 1)), oz = fz * Math.cos(turn * 0.9) - lensR * Math.sin(turn) * 0.9;
      const ax = sd * R * 1.0, az = -R * 0.12, len = Math.hypot(ax - ox, az - oz);
      const arm = mesh(new THREE.BoxGeometry(R * thick * 1.4, R * thick * 1.6, len), frame, g, new THREE.Vector3((ox + ax) / 2, R * 0.05, (oz + az) / 2));
      arm.rotation.y = Math.atan2(ax - ox, az - oz);
    }
    // 鼻樑架：兩個鏡框中間往上拱一點
    const bridge = mesh(new THREE.TorusGeometry(R * 0.075, R * thick * 0.8, 6, 16, Math.PI), frame, g, new THREE.Vector3(0, R * 0.03, fz * 1.01)); bridge.rotation.z = 0;
  }
  if (eq.neck) {   // 運動項鍊：沿著脖子後面、肩膀、胸口的衣服表面繞一圈（不穿過脖子和衣服）；跳起來往下掉時往上飄、落地彈回胸口
    const col = eq.neck === 1 ? '#D9DDE3' : '#E8B94A', metal = accMat(col, { r: 0.25, m: 0.9 }), neck = webPoint(meta.joints.head[0]), sp = webPoint(meta.joints.spine[0]);
    const cloth = meshes.filter((m) => /^(body|top)/.test(m.userData.avatarPart || ''));   // 身體＋穿著的上衣（綁定姿勢的頂點）
    const surf = (x, z) => {   // 這一點往下看，最上面那層表面的高度（只看脖子底下、肩膀一帶）
      let best = -1; for (const m of cloth) { const a = m.geometry.attributes.position; for (let k = 0; k < a.count; k++) { const vy = a.getY(k); if (vy > neck.y + 0.02 || vy < neck.y - 0.3) continue; if (Math.abs(a.getX(k) - x) < 0.012 && Math.abs(a.getZ(k) - z) < 0.012 && vy > best) best = vy; } } return best;
    };
    const N = 36, rest = [];
    for (let k = 0; k < N; k++) {   // 角度 0＝正前方；前面離脖子遠一點（垂到胸口），後面貼著後頸
      const a = (k / N) * Math.PI * 2, f = (1 + Math.cos(a)) / 2, r = 0.074 + 0.042 * f * f, x = neck.x + Math.sin(a) * r, z = neck.z + Math.cos(a) * r;
      let y = surf(x, z); if (y < 0) y = neck.y - 0.02 - 0.06 * f; rest.push(new THREE.Vector3(x, y + 0.006, z));
    }
    // 鍊子像真的一樣垂掛：每一點往兩邊平均、再受一點重力往下，但不能低於底下的衣服／身體表面（反覆算到穩定）
    const floor = rest.map((v) => v.y);
    for (let it = 0; it < 60; it++) { const ys = rest.map((v) => v.y); for (let k = 0; k < N; k++) rest[k].y = Math.max(floor[k], (ys[(k + N - 1) % N] + ys[(k + 1) % N]) / 2 - 0.0012); }
    const back = rest[N / 2].clone(), g = new THREE.Group(); g.position.copy(back).sub(sp); rig.spine.add(g);   // 以後頸那點為軸：前面往上飄＝整圈繞著後頸轉
    const local = rest.map((v) => v.clone().sub(back));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(local, true), 96, 0.0035, 6, true), metal, g);
    const front = local[0], tag = mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.004, 16), metal, g, front.clone().add(new THREE.Vector3(0, -0.016, 0.004)), [Math.PI / 2 - 0.25, 0, 0]);
    // 物理：彈簧＋阻尼。身體往上加速（起跳、落地）＝壓回胸口；自由落下（a≈−g）＝往上飄
    const st = { a: 0, v: 0, y0: null, vy: 0, t: 0 }, W = new THREE.Vector3();
    tag.onBeforeRender = () => {
      const now = performance.now() / 1000, dt = st.t ? Math.min(0.05, now - st.t) : 0; st.t = now; if (!dt) return;
      g.parent.getWorldPosition(W); const vy = st.y0 == null ? 0 : (W.y - st.y0) / dt, acc = (vy - st.vy) / dt; st.y0 = W.y; st.vy = vy;
      const drive = -Math.max(-30, Math.min(30, acc + 0.0)) * 0.6;   // 自由落下 acc≈−9.8 → 往上 5.9
      st.v += (-12 * st.a - 3 * st.v + drive * (Math.abs(acc) > 2 ? 1 : 0)) * dt; st.a += st.v * dt;
      if (st.a < 0) { st.a = 0; st.v = st.v < 0 ? -st.v * 0.3 : st.v; }   /* 撞回胸口：小小彈一下 */ if (st.a > 0.9) { st.a = 0.9; st.v = 0; }
      g.rotation.x = -st.a;   // 繞後頸往上翹
    };
  }
  if (eq.wrist) {   // 護腕：兩手手腕各一圈
    const col = eq.wrist === 1 ? '#F4F4F0' : '#22252B';
    rig.hands.forEach((h, i) => {
      const p = h.position.clone(), d = p.clone().normalize(), m = mesh(new THREE.CylinderGeometry(0.043, 0.045, 0.05, 20, 1, true), accMat(col, { r: 0.85 }), rig.elbows[i], p.clone().multiplyScalar(0.86));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); m.material.side = THREE.DoubleSide;
    });
  }
}
// 模組載入即開始；失敗會被 preloadAvatars 捕捉，不產生未處理 rejection。
void preloadAvatars();

// ---------- 頭髮：髮束 ----------
// 頭的位置用球座標：pol＝離頭頂的角度（0 頭頂、π/2 耳朵高度），az＝0 正前方、π 正後方、正值往左（+x）
function sph(pol, az, k, hy) {
  return new THREE.Vector3(Math.sin(pol) * Math.sin(az) * HEAD_R * HEAD_S[0] * k, hy + Math.cos(pol) * HEAD_R * HEAD_S[1] * k, Math.sin(pol) * Math.cos(az) * HEAD_R * HEAD_S[2] * k);
}
// 一束頭髮：沿曲線的扁平管子，寬 w、厚 th，尾端收尖；剖面的「厚度方向」朝頭外
function strand(pts, w, th, hy, opt = {}) {
  const segs = opt.segs || 12, rs = 10, C = new THREE.Vector3(0, hy - (opt.down || 0), 0);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const pos = [], idx = [], T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3();
  const tipK = opt.tip ?? 0.12;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; curve.getPointAt(t, P); curve.getTangentAt(t, T);
    N.copy(P).sub(C); N.addScaledVector(T, -N.dot(T)).normalize(); B.crossVectors(T, N).normalize();
    const f = opt.blunt ? 1 - 0.35 * t * t : Math.pow(Math.cos(t * Math.PI * 0.5), 0.75) * (1 - tipK) + tipK * (1 - t);
    const ww = w * f * (t < 0.12 ? 0.75 + 2 * t : 1), tt = th * f;
    for (let j = 0; j < rs; j++) { const a = (j / rs) * Math.PI * 2; pos.push(P.x + B.x * Math.cos(a) * ww + N.x * Math.sin(a) * tt, P.y + B.y * Math.cos(a) * ww + N.y * Math.sin(a) * tt, P.z + B.z * Math.cos(a) * ww + N.z * Math.sin(a) * tt); }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rs; j++) { const a = i * rs + j, b = i * rs + ((j + 1) % rs), c = a + rs, d = b + rs; idx.push(a, c, b, b, c, d); }
  const tipI = pos.length / 3; curve.getPointAt(1, P); pos.push(P.x, P.y, P.z);
  for (let j = 0; j < rs; j++) idx.push(segs * rs + j, tipI, segs * rs + ((j + 1) % rs));
  const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gm.setIndex(idx); gm.computeVertexNormals();
  return gm;
}
// 綁頭髮的位置（馬尾、雙辮子）
function hairTies(type, hy) {
  if (type === 4) { const p = sph(0.95, Math.PI, 1.08, hy); return [Object.assign(p, { n: new THREE.Vector3(0, 0.25, -1) })]; }
  return [-1, 1].map((s) => Object.assign(sph(1.72, s * 1.85, 1.06, hy), { n: new THREE.Vector3(s, -0.4, -0.3) }));
}
// ---------- 褲子（蒙皮） ----------
// 骨架用現有的關節群組：在骨盆、左右大腿、左右膝蓋各掛一根骨頭（Bone），褲子的每個頂點依高度和左右分配權重。
function pantsMesh(longP, kit, root, legs, knees) {
  const parts = [], navyC = new THREE.Color(kit.shorts), trimC = new THREE.Color(kit.trim);
  const waist = lathe([[0.188, 0.115], [0.2, 0.06], [0.206, 0.0], [0.204, -0.04], [0.19, -0.075]], 40); waist.scale(1, 1, 0.74); waist.translate(0, HIP_H, 0); parts.push(['w', waist]);
  for (const sx of [-1, 1]) {
    const prof = longP ? [[0.104, 0.05], [0.11, 0.0], [0.104, -0.12], [0.094, -L1], [0.09, -L1 - 0.08], [0.082, -L1 - KN_ANK + 0.05], [0.083, -L1 - KN_ANK + 0.035], [0.072, -L1 - KN_ANK + 0.03]]
      : [[0.104, 0.05], [0.114, 0.0], [0.12, -0.08], [0.121, -0.118], [0.123, -0.124], [0.121, -0.134], [0.108, -0.138]];
    const leg = lathe(prof, 28); leg.translate(sx * 0.095, HIP_H, 0); parts.push([sx, leg]);
  }
  const geos = [];
  for (const [kind, gm] of parts) {
    const n = gm.attributes.position.count, P = gm.attributes.position, si = [], sw = [], col = [];
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), side = x < 0 ? 0 : 1, dy = y - HIP_H;
      let b0 = 0, b1 = 1 + side, w1 = 0;
      if (kind === 'w') w1 = sstep(-0.01, -0.07, dy) * sstep(0.03, 0.11, Math.abs(x)) * 0.85;
      else if (longP && dy < -L1 + 0.06) { b0 = 1 + side; b1 = 3 + side; w1 = sstep(-L1 + 0.06, -L1 - 0.06, dy); }
      else w1 = sstep(0.06, -0.04, dy);
      si.push(b0, b1, 0, 0); sw.push(1 - w1, w1, 0, 0);
      const hem = kind !== 'w' && (longP ? dy < -L1 - KN_ANK + 0.045 : dy < -0.112);
      const c = hem ? (longP ? new THREE.Color('#F2F2EE') : trimC) : navyC; col.push(c.r, c.g, c.b);
    }
    gm.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); gm.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); gm.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    gm.deleteAttribute('uv'); geos.push(gm);
  }
  const g = mergeGeometries(geos, false); g.computeVertexNormals();
  const bones = [root, legs[0], legs[1], knees[0], knees[1]].map((o) => { const b = new THREE.Bone(); o.add(b); return b; });
  const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide }));
  m.frustumCulled = false; root.add(m); root.updateMatrixWorld(true); m.bind(new THREE.Skeleton(bones));
  return m;
}

// ---------- 一體成型髮帽（Hair Helmet） ----------
// 用 (az, t) 網格長出整頂頭髮：t＝0 頭頂、t＝1 髮線。髮線、瀏海尖、刺、捲度、髮流溝紋都是同一個平滑表面推出來的，
// 邊緣往內收進頭皮，不會有紙片邊、也不會碎。
const tint = (t) => 0.74 + 0.34 * Math.pow(t, 0.8);   // 頭頂暗 → 髮尾亮
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function helmet(o, hy) {
  const NA = 144, NT = 44, pos = [], col = [], idx = [], D = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(0, hy, 0);
  const bumps = (o.bumps || []).map(([pol, az, amp, w, sharp, upK]) => ({ d: new THREE.Vector3(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az)), amp, w, sharp, upK: upK || 0 }));
  const H = (az) => {
    const c = Math.cos(az); let h = c > 0 ? o.side + (o.front - o.side) * c : o.side + (o.back - o.side) * -c; const b = o.bangs;
    if (b && Math.abs(az) < b.zone) { const w = Math.pow(Math.cos((az / b.zone) * Math.PI / 2), 0.6), sv = 0.5 + 0.5 * Math.cos((az * b.n * Math.PI) / b.zone); h += b.amp * w * Math.pow(sv, b.sharp); }
    return h;
  };
  for (let i = 0; i < NA; i++) {
    const az = -Math.PI + (i / NA) * Math.PI * 2, h = H(az);
    for (let j = 0; j <= NT; j++) {
      const t = j / NT, pol = Math.max(1e-4, t * h);
      D.set(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az));
      let k = 1 + o.thick * (1 - 0.95 * sstep(0.8, 1, t)) + (o.lift || 0) * Math.pow(1 - t, 2) + (o.flare || 0) * sstep(0.45, 0.85, t) * (1 - sstep(0.88, 1, t)) * sstep(1.3, 1.8, h);
      if (o.groove) k -= o.groove.amp * 0.7 * Math.pow(1 - Math.abs(Math.sin(o.groove.n * (az + (o.groove.flow || 0) * t) * 0.5)), 3) * sstep(0.05, 0.3, t) * (1 - sstep(0.85, 1, t));
      if (o.part) k -= 0.02 * Math.exp(-Math.pow(az / 0.05, 2)) * (1 - sstep(0.4, 0.75, t));
      const P = sph(pol, az, k, hy); let lift = 0, upY = 0;
      for (const b of bumps) {
        const a = Math.acos(Math.min(1, D.dot(b.d))); if (a > b.w * 1.6) continue;
        const f = (b.sharp ? Math.pow(Math.max(0, 1 - a / b.w), b.sharp) : Math.exp(-Math.pow(a / b.w, 2) * 2.2)) * (1 - sstep(0.75, 1, t));
        lift += b.amp * f; upY += b.amp * f * b.upK;
      }
      if (lift) { B.copy(P).sub(C).normalize(); P.addScaledVector(B, lift); P.y += upY; }
      pos.push(P.x, P.y, P.z); const g = tint(t); col.push(g, g, g);
    }
  }
  const R = NT + 1;
  for (let i = 0; i < NA; i++) { const a0 = i * R, a1 = ((i + 1) % NA) * R; for (let j = 0; j < NT; j++) idx.push(a0 + j, a0 + j + 1, a1 + j, a1 + j, a0 + j + 1, a1 + j + 1); }
  const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gm.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gm.setIndex(idx); gm.computeVertexNormals();
  return gm;
}
// 披在背後的髮片（長髮、鮑伯頭）：有厚度的一整片，上緣藏在髮帽底下，下緣有層次
function curtain(o, hy) {
  const NU = 72, NV = 26;
  const pt = (u, v, off) => {
    const az = o.az0 + (o.az1 - o.az0) * u, top = sph(o.topPol, az, 1.04, hy), mid = sph(1.75, az, 1.1 + (o.puff || 0), hy);
    const layer = 1 - (o.layers || 0) * Math.pow(Math.abs(Math.sin(u * Math.PI * (o.tips || 7))), 0.7);
    const end = new THREE.Vector3(mid.x * (o.spread || 0.95), hy - o.len * layer, mid.z * (o.spread || 0.95) - (o.back || 0));
    if (o.curl) { end.x *= 1 - o.curl; end.z = end.z * (1 - o.curl) - 0.02; end.y += o.curl * 0.05; }
    const q = 1 - v, P = top.clone().multiplyScalar(q * q).addScaledVector(mid, 2 * q * v).addScaledVector(end, v * v);
    const N = new THREE.Vector3(P.x, 0, P.z).normalize(), th = (o.th || 0.03) * (1 - 0.7 * sstep(0.85, 1, v));
    return P.addScaledVector(N, off * th);
  };
  const pos = [];
  for (const side of [1, -1]) for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) { const P = pt(i / NU, j / NV, side); pos.push(P.x, P.y, P.z); }
  const R = NV + 1, half = (NU + 1) * R, idx = [];
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * R + j, b = a + R; idx.push(a, a + 1, b, b, a + 1, b + 1, half + a, half + b, half + a + 1, half + b, half + b + 1, half + a + 1); }
  for (let i = 0; i < NU; i++) { const a = i * R + NV, b = a + R; idx.push(a, half + a, b, b, half + a, half + b); }
  for (const i of [0, NU]) for (let j = 0; j < NV; j++) { const a = i * R + j; if (i === 0) idx.push(a, half + a, a + 1, a + 1, half + a, half + a + 1); else idx.push(a, a + 1, half + a, a + 1, half + a + 1, half + a); }
  const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gm.setIndex(idx); gm.computeVertexNormals();
  return gm;
}
const HAIR = new Map();
function hairGeometry(type, hy) {
  if (HAIR.has(type)) return HAIR.get(type);
  const r = rng(type + 7), parts = [];
  const spikes = (n, pol, amp, w, off = 0, upK = 0.5, sharp = 1.6) => { const a = []; for (let i = 0; i < n; i++) a.push([pol + (r() - 0.5) * 0.08, off + (i / n) * Math.PI * 2, amp * (0.85 + r() * 0.3), w, sharp, upK]); return a; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  if (type === 0) {   // 刺蝟頭
    parts.push(helmet({ front: 0.98, side: 1.5, back: 1.95, thick: 0.07, lift: 0.05, bangs: { n: 5, amp: 0.26, zone: 0.95, sharp: 3 }, groove: { n: 16, amp: 0.012 },
      bumps: [...spikes(10, 0.72, 0.1, 0.34, 0.2, 0.35), ...spikes(6, 0.34, 0.1, 0.34, 0.5, 0.5), [0.02, 0, 0.09, 0.32, 1.6, 0.6]] }, hy));
  } else if (type === 1) {   // 蓬鬆捲髮
    const b = []; for (let i = 0; i < 60; i++) b.push([0.05 + Math.sqrt(r()) * 1.45, r() * Math.PI * 2, 0.04 + r() * 0.02, 0.17, 0, 0.2]);
    parts.push(helmet({ front: 1.02, side: 1.5, back: 1.95, thick: 0.08, lift: 0.04, bangs: { n: 6, amp: 0.14, zone: 0.95, sharp: 1.2 }, bumps: b }, hy));
  } else if (type === 2) {   // 紋理短髮
    parts.push(helmet({ front: 1.0, side: 1.5, back: 1.92, thick: 0.06, lift: 0.05, bangs: { n: 7, amp: 0.2, zone: 1.0, sharp: 2.5 }, groove: { n: 22, amp: 0.016, flow: 0.9 }, bumps: spikes(7, 0.45, 0.05, 0.32, 0, 0.6) }, hy));
  } else if (type === 3) {   // 頭帶短髮
    parts.push(helmet({ front: 1.14, side: 1.5, back: 1.92, thick: 0.05, lift: 0.03, bangs: { n: 5, amp: 0.08, zone: 0.9, sharp: 2 }, groove: { n: 16, amp: 0.01 }, bumps: [...spikes(8, 0.48, 0.11, 0.32, 0.3, 0.7), [0.05, 0, 0.1, 0.3, 1.6, 1]] }, hy));
  } else if (type === 4) {   // 高馬尾
    parts.push(helmet({ front: 0.98, side: 1.55, back: 2.0, thick: 0.045, lift: 0.03, bangs: { n: 4, amp: 0.24, zone: 0.8, sharp: 2.5 }, groove: { n: 26, amp: 0.012 } }, hy));
    const tie = hairTies(4, hy)[0], T = (x, y, z) => tie.clone().add(V(x, y, z));
    parts.push(strand([T(0, 0.01, 0.03), T(0, 0.06, -0.08), T(0, -0.08, -0.17), T(0, -0.28, -0.13), T(0.015, -0.42, -0.06)], 0.075, 0.065, hy, { segs: 28, tip: 0.1, down: 0.2 }));
    for (const s of [-1, 1]) parts.push(strand([sph(0.95, s * 0.95, 1.05, hy), sph(1.35, s * 1.02, 1.1, hy), sph(1.75, s * 0.98, 1.07, hy), sph(1.98, s * 0.88, 1.0, hy)], 0.045, 0.022, hy, { segs: 16 }));
  } else if (type === 5) {   // 雙辮子（中分）
    parts.push(helmet({ front: 0.98, side: 1.62, back: 2.05, thick: 0.045, lift: 0.03, part: true, bangs: { n: 6, amp: 0.2, zone: 0.85, sharp: 2.2 }, groove: { n: 24, amp: 0.012 } }, hy));
    hairTies(5, hy).forEach((t0, si) => {
      const s = si ? 1 : -1, T = (x, y, z) => t0.clone().add(V(x, y, z));
      for (let k = 0; k < 7; k++) { const sc = 1 - k * 0.06, sway = (k % 2 ? 1 : -1) * 0.012; const lobe = new THREE.SphereGeometry(0.048 * sc, 18, 14); lobe.scale(1, 1.3, 0.9); lobe.rotateZ(sway * 12); lobe.translate(t0.x + s * 0.012 + sway, t0.y - 0.045 - k * 0.056, t0.z + 0.01 - k * 0.004); parts.push(lobe); }
      parts.push(strand([T(0, -0.42, 0.005), T(s * 0.01, -0.47, 0.01), T(s * 0.015, -0.53, 0.02)], 0.035, 0.028, hy, { segs: 8 }));
    });
  } else if (type === 6) {   // 長直髮：披在背後（舉手不會穿過）
    parts.push(helmet({ front: 0.98, side: 1.6, back: 1.95, thick: 0.05, lift: 0.03, bangs: { n: 7, amp: 0.22, zone: 0.9, sharp: 2 }, groove: { n: 30, amp: 0.012 } }, hy));
    parts.push(curtain({ az0: 1.55, az1: Math.PI * 2 - 1.55, topPol: 1.25, len: 0.44, spread: 0.85, back: 0.05, th: 0.03, layers: 0.12, tips: 6 }, hy));
  } else {   // 鮑伯頭
    parts.push(helmet({ front: 1.0, side: 2.05, back: 2.2, thick: 0.07, lift: 0.04, flare: 0.05, bangs: { n: 9, amp: 0.15, zone: 1.0, sharp: 0.6 }, groove: { n: 34, amp: 0.012 } }, hy));
  }
  for (const p of parts) if (!p.attributes.color) { const P = p.attributes.position, c = []; for (let i = 0; i < P.count; i++) { const g = tint(Math.min(1, Math.max(0, (hy + 0.3 - P.getY(i)) / 0.75))); c.push(g, g, g); } p.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); }
  const merged = mergeGeometries(parts.map((p) => { if (p.attributes.uv) p.deleteAttribute('uv'); if (p.attributes.normal == null) p.computeVertexNormals(); return p; }), false);
  HAIR.set(type, merged); return merged;
}

// ---------- 預覽動作（從 gym.html 的 AVP 複製幾個；遊戲裡還是用 gym.html 那份） ----------
export const PREVIEW_POSES = {
  idle: { name: '站立', sh: [[-0.08, 0.1], [-0.08, 0.1]], el: [0.3, 0.3], hip: [0.02, 0.02], kn: [0.06, 0.06], sp: 0.04, tw: 0 },
  ready: { name: '接球準備', sh: [[-0.62, 0.22], [-0.62, 0.22]], el: [0.95, 0.95], hip: [0.85, 0.85], kn: [1.3, 1.3], hab: [0.2, 0.2], sp: 0.58, tw: 0 },
  bump: { name: '低手接球', sh: [[-0.98, -0.14], [-0.98, -0.14]], el: [0.02, 0.02], hip: [0.92, 0.92], kn: [1.42, 1.42], hab: [0.2, 0.2], sp: 0.55, tw: 0 },
  setReady: { name: '舉球', sh: [[-2.55, 0.45], [-2.55, 0.45]], el: [1.75, 1.75], hip: [0.38, 0.3], kn: [0.68, 0.55], hab: [0.08, 0.08], sp: -0.04, tw: 0 },
  airUp: { name: '扣球拉弓', sh: [[-2.6, 0.75], [-2.75, 0.12]], el: [2.15, 0.22], hip: [-0.18, 0.12], kn: [1.3, 0.95], sp: -0.42, tw: 0.45 },
  spikeHit: { name: '扣球', sh: [[-3.0, 0.1], [-0.85, 0.3]], el: [0.05, 1.3], hip: [0.5, 0.32], kn: [0.8, 0.6], sp: 0.34, tw: -0.28, shy: [0.1, 0] },
  block: { name: '攔網', sh: [[-2.78, 0.08], [-2.78, 0.08]], el: [0.05, 0.05], hip: [0.12, 0.12], kn: [0.3, 0.3], sp: 0.08, tw: 0, shy: [0.08, 0.08] },
  serveToss: { name: '發球', sh: [[-2.4, 0.6], [-2.9, 0.1]], el: [1.9, 0.1], hip: [0.05, 0.25], kn: [0.12, 0.3], sp: -0.12, tw: 0.35 },
};
// 跟 avDrive 靜止時一樣的套法（只給預覽用）
export function applyStaticPose(av, P) {
  const ext = [0, 0];
  for (let i = 0; i < 2; i++) {
    const sx = i === 0 ? -1 : 1, a = av.arms[i], h = av.legs[i], kn = av.knees[i], hab = (P.hab || [0, 0])[i];
    if (a.userData.y0 == null) a.userData.y0 = a.position.y; a.position.y = a.userData.y0 + (P.shy || [0, 0])[i];
    a.rotation.set(P.sh[i][0], 0, sx * P.sh[i][1]); av.elbows[i].rotation.x = -P.el[i];
    h.rotation.set(-P.hip[i], 0, sx * hab); kn.rotation.x = P.kn[i];
    ext[i] = (av.L1 * Math.cos(P.hip[i]) + av.L2 * Math.cos(P.hip[i] - P.kn[i])) * Math.cos(hab);
    av.feet[i].rotation.set(-(h.rotation.x + kn.rotation.x) * 0.9, 0, -h.rotation.z);
  }
  av.spine.rotation.set(P.sp, P.tw || 0, 0); av.head.rotation.x = -P.sp * 0.6;
  av.root.position.y = -Math.max(0, av.hipH - Math.max(ext[0], ext[1]));
}
