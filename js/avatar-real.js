// 新角色（寫實身體＋VRoid 日系 Q 版頭）：給遊戲用的版本。測試頁 avatar-real.html 是開發用（捏臉、動作預覽），這裡只放遊戲需要的部分。
// 做法：遊戲原本的公仔骨架（avDrive／avTouch／撲救貼地…）照舊在算，只是看不見；新角色每一格「跟著」那副骨架擺姿勢（driveReal）：
//   每根骨頭轉到跟公仔對應關節一樣的方向（校正過兩邊的站姿差），髖的位置照比例放大，貼地另外算；碰球時手用 IK 對準公仔手的位置（手碰到球）。
// 面向 +z；公仔 arms[0]／legs[0] 是右手右腳。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { REAL_HEADS, REAL_FACES, REAL_HAIRS, REAL_EYES, REAL_BROWS, headRef, realRenderLook } from './real-look.js';
import { VROID_MORPHS } from './vroid-morphs.js';
import { makeToyAvatar, kitOf, OPTIONS as TOY_OPTIONS } from './avatar-toy.js';

const asset = (p) => new URL('../' + p, import.meta.url).href;
const TARGET_H = { m: 1.88, f: 1.74 };
const Q_HEAD = 1.1;   // 頭稍大（跟測試頁預設一樣）
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export { REAL_HEADS };

// ---------- 上色 ----------
const TOON_RAMP = (() => { const d = new Uint8Array([178, 168, 172, 255, 255, 255, 255, 255]); const t = new THREE.DataTexture(d, 2, 1); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const toon = (o = {}) => new THREE.MeshToonMaterial({ gradientMap: TOON_RAMP, ...o });
const OUTLINE = new Map();
function outlineMat(w, skinned) {
  const key = w + '|' + skinned; if (OUTLINE.has(key)) return OUTLINE.get(key);
  const m = new THREE.MeshBasicMaterial({ color: 0x2A1E1C, side: THREE.BackSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = skinned
      ? sh.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>\n transformed += normalize(objectNormal) * ${w.toFixed(5)};`)
      : sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${w.toFixed(5)};`);
  };
  m.customProgramCacheKey = () => 'ol' + key;
  OUTLINE.set(key, m); return m;
}
function makeOutline(o, w, mat) {
  const m = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, mat || outlineMat(w, true)) : new THREE.Mesh(o.geometry, mat || outlineMat(w, false));
  if (o.isSkinnedMesh) m.bind(o.skeleton, o.bindMatrix);
  m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale);
  m.frustumCulled = false; o.parent.add(m); m.userData.of = o;
  return m;
}
// 貼圖變灰階細節（顏色交給材質），同一張貼圖只做一次
const GRAY = new Map();
function grayDetail(tex) {
  if (!tex || !tex.image) return null; if (GRAY.has(tex)) return GRAY.get(tex);
  const img = tex.image, w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h), p = d.data; let sum = 0, n = 0;
  for (let i = 0; i < p.length; i += 4) { if (p[i + 3] < 128) continue; sum += 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]; n++; }
  const mean = sum / Math.max(n, 1);
  for (let i = 0; i < p.length; i += 4) { const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]; p[i] = p[i + 1] = p[i + 2] = Math.max(0, Math.min(255, 235 * l / mean)); }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  GRAY.set(tex, t); return t;
}
function canvasTex(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = THREE.RepeatWrapping;
  return { c, g: c.getContext('2d'), t };
}
function drawJersey(J, L) {
  const { g, c } = J, W = c.width, H = c.height;
  g.fillStyle = L.jersey; g.fillRect(0, 0, W, H);
  g.fillStyle = L.trim; g.fillRect(0, 0, W, H * 0.035);   // 領口（側邊線由材質畫）
  g.fillStyle = L.num; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${H * 0.36}px "Arial Black",Impact,sans-serif`; g.fillText(String(L.no), W * 0.75, H * 0.38);
  g.font = `900 ${H * 0.52}px "Arial Black",Impact,sans-serif`; g.fillText(String(L.no), W * 0.25, H * 0.42);
  J.t.needsUpdate = true;
}
function drawShorts(S, L) {
  const { g, c } = S, W = c.width, H = c.height;
  g.fillStyle = L.shorts; g.fillRect(0, 0, W, H);
  g.fillStyle = L.trim; g.fillRect(0, 0, W, H * 0.06);
  for (const u of [0.5, 1.0, 0.0]) g.fillRect(u * W - W * 0.015, 0, W * 0.03, H);
  S.t.needsUpdate = true;
}
// 鞋子貼圖右下角是鞋子附的短襪 → 換成襪子顏色（sRGB 值寫進貼圖）；不穿襪子＝膚色（隱形襪）。同一種顏色共用一張
const SHOE_TEX = new Map();
function shoeTex(src, base, col, flat) {
  const key = col + flat; if (SHOE_TEX.has(key)) return SHOE_TEX.get(key);
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  const X0 = Math.floor(c.width * 0.76), Y0 = Math.floor(c.height * 0.845), d = x.getImageData(X0, Y0, c.width - X0, c.height - Y0), A = d.data;
  let mean = 0; for (let i = 0; i < A.length; i += 4) mean += A[i] + A[i + 1] + A[i + 2]; mean /= A.length / 4 * 3;
  const cc = new THREE.Color(col).getRGB({}, THREE.SRGBColorSpace);
  for (let i = 0; i < A.length; i += 4) { const k = flat ? 1 : (A[i] + A[i + 1] + A[i + 2]) / 3 / mean; A[i] = Math.min(255, cc.r * 255 * k); A[i + 1] = Math.min(255, cc.g * 255 * k); A[i + 2] = Math.min(255, cc.b * 255 * k); }
  x.putImageData(d, X0, Y0);
  const t = new THREE.CanvasTexture(c); t.flipY = base.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = base.wrapS; t.wrapT = base.wrapT;
  SHOE_TEX.set(key, t); return t;
}

// ---------- 模板（每個性別載入一次，量好、改好幾何，之後每個人物複製） ----------
const TPL = {};
const wpos = (b, out = new THREE.Vector3()) => b.getWorldPosition(out);
function boneMap(skel) { const m = {}; for (const b of skel.bones) m[b.name] = b; return m; }
function aimBone(B, name, child, dir) {
  const b = B[name], c = B[child]; b.updateMatrixWorld(true);
  const cur = wpos(c).sub(wpos(b)).normalize(), rot = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
  const bw = b.getWorldQuaternion(new THREE.Quaternion()), pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.copy(pw.invert().multiply(rot.multiply(bw))); b.updateMatrixWorld(true);
}
function rotWorld(b, axis, ang) {
  const bw = b.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis.clone().applyQuaternion(bw.invert()).normalize(), ang)); b.updateMatrixWorld(true);
}
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const HANDS = {
  natural: { curl: [0.28, 0.32, 0.22], spread: 0.02, thumb: [0.15, 0.2], tspread: 0.1 },
  bump: { curl: [0.38, 0.35, 0.22], spread: -0.12, thumb: [0.0, 0.0], tspread: -0.45 },
  set: { curl: [0.32, 0.3, 0.2], spread: 0.16, thumb: [0.1, 0.25], tspread: 0.45 },
  spike: { curl: [0.06, 0.06, 0.04], spread: 0.08, thumb: [0.0, 0.05], tspread: 0.25 },
  block: { curl: [0.02, 0.02, 0.0], spread: 0.26, thumb: [0.0, 0.0], tspread: 0.55 },
};
const FINGER_BONES = s => [...FINGERS.flatMap(f => [1, 2, 3].map(i => `${f}_0${i}_${s}`)), ...[1, 2, 3].map(i => `thumb_0${i}_${s}`)];
function poseHand(B, s, P) {
  const h = wpos(B['hand_' + s]), fd = wpos(B['middle_01_' + s]).sub(h).normalize(), across = wpos(B['index_01_' + s]).sub(wpos(B['pinky_01_' + s])).normalize();
  const n = new THREE.Vector3().crossVectors(fd, across).normalize(); if (n.dot(wpos(B['thumb_02_' + s]).sub(h)) < 0) n.negate();
  const k = Math.sign(new THREE.Vector3().crossVectors(n, fd).dot(across)) || 1, spreadOf = { index: 1, middle: 0, ring: -0.6, pinky: -1.2 };
  for (const f of FINGERS) {
    const b1 = B[`${f}_01_${s}`]; rotWorld(b1, n, k * P.spread * spreadOf[f]);
    const axis = new THREE.Vector3().crossVectors(wpos(B[`${f}_02_${s}`]).sub(wpos(b1)).normalize(), n).normalize();
    for (let i = 1; i <= 3; i++) rotWorld(B[`${f}_0${i}_${s}`], axis, P.curl[i - 1] * (f === 'pinky' ? 1.15 : 1));
  }
  rotWorld(B[`thumb_01_${s}`], n, k * P.tspread);
  for (let i = 2; i <= 3; i++) { const b = B[`thumb_0${i}_${s}`], p = wpos(b), dir = i < 3 ? wpos(B['thumb_03_' + s]).sub(p).normalize() : fd.clone(); rotWorld(b, new THREE.Vector3().crossVectors(dir, n).normalize(), P.thumb[i - 2]); }
}
// 公仔關節 → 新角色骨頭（世界方向照公仔轉，再乘站姿校正）
const MAP = [['legs', 0, 'thigh_r'], ['knees', 0, 'calf_r'], ['feet', 0, 'foot_r'], ['legs', 1, 'thigh_l'], ['knees', 1, 'calf_l'], ['feet', 1, 'foot_l'],
  ['arms', 0, 'upperarm_r'], ['elbows', 0, 'lowerarm_r'], ['hands', 0, 'hand_r'], ['arms', 1, 'upperarm_l'], ['elbows', 1, 'lowerarm_l'], ['hands', 1, 'hand_l']];
const FLOOR = [['clavicle_l', 0.08], ['clavicle_r', 0.08], ['thigh_l', 0.09], ['thigh_r', 0.09], ['spine_01', 0.12], ['pelvis', 0.12], ['spine_02', 0.12], ['spine_03', 0.13], ['head', 0.12], ['neck_01', 0.08], ['hand_l', 0.03], ['hand_r', 0.03], ['lowerarm_l', 0.04], ['lowerarm_r', 0.04], ['upperarm_l', 0.06], ['upperarm_r', 0.06], ['calf_l', 0.06], ['calf_r', 0.06]];

async function loadTpl(s) {
  const gl = await new GLTFLoader().loadAsync(asset(`assets/models/real_${s}.glb?v=14`));
  const root = gl.scene, parts = {}; let skel = null;
  root.traverse(o => { if (o.isMesh) { parts[o.name] = o; if (o.skeleton) skel = o.skeleton; } });
  for (const [n, o] of Object.entries(parts)) if (!['Human', 'jersey', 'shorts', 'shoes'].includes(n)) { o.parent.remove(o); o.geometry.dispose(); delete parts[n]; }   // 寫實頭髮、眼睛、眉毛、臉片：遊戲用 VRoid 頭，不需要
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(parts.Human), k = TARGET_H[s] / (box.max.y - box.min.y);
  root.scale.setScalar(k); root.position.y = -box.min.y * k; root.updateMatrixWorld(true);
  root.position.y -= new THREE.Box3().setFromObject(parts.shoes).min.y; root.updateMatrixWorld(true);
  const B = boneMap(skel); for (const b of skel.bones) b.userData.rest = b.quaternion.clone();
  // 頭稍大（頭、脖子、手跟測試頁一樣）
  const nk = 1 + (Q_HEAD - 1) * 0.3; B.neck_01.scale.setScalar(nk); B.head.scale.setScalar(Q_HEAD / nk); B.hand_l.scale.setScalar(nk); B.hand_r.scale.setScalar(nk); root.updateMatrixWorld(true);
  const T = { s, root, parts, skel, B, k, heads: {} };
  const H = parts.Human, Hg = H.geometry, pos = Hg.attributes.position, si = Hg.attributes.skinIndex, sw = Hg.attributes.skinWeight, hb = skel.bones.indexOf(B.head);
  skel.update();
  // 原本的頭：先量大小（VRoid 頭照這個放），再把頂點縮到脖子裡藏起來
  { const idx = [], v = new THREE.Vector3(), hbox = new THREE.Box3(); let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9, cx = 0;
    for (let i = 0; i < si.count; i++) { let w = 0; for (let j = 0; j < 4; j++) if (si.getComponent(i, j) === hb) w += sw.getComponent(i, j); if (w > 0.5) idx.push(i); }
    for (const i of idx) { H.getVertexPosition(i, v); hbox.expandByPoint(v.applyMatrix4(H.matrixWorld)); const y = pos.getY(i), z = pos.getZ(i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); cx += pos.getX(i); }
    T.headBox = hbox; cx /= idx.length;
    const c = V(cx, y0 + (y1 - y0) * 0.12, z0 + (z1 - z0) * 0.4); for (const i of idx) pos.setXYZ(i, c.x, c.y, c.z); pos.needsUpdate = true; }
  jerseyPrep(T);
  gearPrep(T);
  // 手勢：每種手型的手指骨頭局部旋轉（跟手臂姿勢無關，每格直接套）
  T.hands = {};
  for (const [kname, P] of Object.entries(HANDS)) { T.hands[kname] = {}; for (const sd of ['l', 'r']) { for (const b of skel.bones) b.quaternion.copy(b.userData.rest); root.updateMatrixWorld(true); poseHand(B, sd, P); T.hands[kname][sd] = FINGER_BONES(sd).map(n => B[n].quaternion.clone()); } }
  // 站姿校正：新角色擺成「公仔零姿勢」（手腳直直往下、身體正），記下每根骨頭相對 root 的方向
  for (const b of skel.bones) b.quaternion.copy(b.userData.rest); root.updateMatrixWorld(true);
  const rq = root.getWorldQuaternion(new THREE.Quaternion()), rqi = rq.clone().invert(), down = V(0, -1, 0).applyQuaternion(rq);
  const footW = {}; for (const sd of ['l', 'r']) footW[sd] = B['foot_' + sd].getWorldQuaternion(new THREE.Quaternion());
  for (const sd of ['l', 'r']) {
    aimBone(B, 'thigh_' + sd, 'calf_' + sd, down); aimBone(B, 'calf_' + sd, 'foot_' + sd, down);
    const f = B['foot_' + sd]; f.quaternion.copy(f.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(footW[sd])); f.updateMatrixWorld(true);
    aimBone(B, 'upperarm_' + sd, 'lowerarm_' + sd, down); aimBone(B, 'lowerarm_' + sd, 'hand_' + sd, down); aimBone(B, 'hand_' + sd, 'middle_01_' + sd, down);
  }
  root.updateMatrixWorld(true);
  T.handRest = {};
  for (const sd of ['l', 'r']) {   // 站姿時手指方向、掌心方向（換算到手骨頭自己的座標），orientHand 用
    const h = wpos(B['hand_' + sd]), fd = wpos(B['middle_01_' + sd]).sub(h).normalize(), across = wpos(B['index_01_' + sd]).sub(wpos(B['pinky_01_' + sd])).normalize();
    const n = new THREE.Vector3().crossVectors(fd, across).normalize(); if (n.dot(wpos(B['thumb_02_' + sd]).sub(h)) < 0) n.negate();
    const qi = B['hand_' + sd].getWorldQuaternion(new THREE.Quaternion()).invert(), fl = fd.clone().applyQuaternion(qi).normalize(), nl = n.clone().applyQuaternion(qi); nl.addScaledVector(fl, -nl.dot(fl)).normalize();
    T.handRest[sd] = { fl, nl };
  }
  T.C = {}; for (const n of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', ...MAP.map(m => m[2])]) T.C[n] = rqi.clone().multiply(B[n].getWorldQuaternion(new THREE.Quaternion()));
  const hipC = wpos(B.thigh_l).add(wpos(B.thigh_r)).multiplyScalar(0.5);
  T.hip0 = hipC.y;   // 站直時髖（兩個大腿根中間）離地高度
  T.footR = {}; for (const n of ['foot_l', 'foot_r', 'ball_l', 'ball_r']) T.footR[n] = wpos(B[n]).y;   // 腳的骨頭離鞋底多高（貼地用）
  for (const b of skel.bones) b.quaternion.copy(b.userData.rest); root.updateMatrixWorld(true);
  return T;
}
// 球衣：放鬆（沿法線外推，下擺多）、側邊線用的座標、晃動權重
function jerseyPrep(T) {
  const o = T.parts.jersey, g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = pos.count;
  const bn = o.skeleton.bones.map(b => b.name), perM = 1 / o.matrixWorld.getMaxScaleOnAxis();
  let y0 = 1e9, y1 = -1e9; for (let i = 0; i < n; i++) { const y = pos.getY(i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const Hh = y1 - y0, sway = new Float32Array(n), tt = new Float32Array(n), arm = new Float32Array(n); let cz = 0, cn = 0;
  for (let i = 0; i < n; i++) {
    let a = 0; for (let k = 0; k < 4; k++) if (/upperarm|lowerarm|hand/.test(bn[si.getComponent(i, k)] || '')) a += sw.getComponent(i, k);
    arm[i] = a; tt[i] = 1 - a; if (a < 0.2) { cz += pos.getZ(i); cn++; }
    const low = 1 - Math.max(0, Math.min(1, (pos.getY(i) - y0) / (Hh * 0.6))), push = (0.006 + 0.012 * low) * (1 - a) * perM;
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * push, pos.getY(i), pos.getZ(i) + nor.getZ(i) * push);
    sway[i] = low * low * (1 - a);
  }
  cz /= Math.max(1, cn); const tp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { tp[i * 3] = pos.getX(i); tp[i * 3 + 1] = pos.getY(i); tp[i * 3 + 2] = pos.getZ(i) - cz; }
  pos.needsUpdate = true; g.computeBoundingSphere();
  g.setAttribute('sway', new THREE.BufferAttribute(sway, 1)); g.setAttribute('tp', new THREE.BufferAttribute(tp, 3)); g.setAttribute('tt', new THREE.BufferAttribute(tt, 1));
}
// 球衣材質：側邊線（照繞身體的角度畫）＋下擺位移（uSway）
function jerseyMats(R) {
  const U = R.jU = { uTrim: { value: new THREE.Color() }, uSide: { value: 0.07 }, uSway: { value: new THREE.Vector3() } };
  const patch = (sh, frag) => {
    sh.uniforms.uSway = U.uSway;
    sh.vertexShader = 'attribute float sway;\nuniform vec3 uSway;\n' + sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += uSway * sway;');
    if (!frag) return;
    Object.assign(sh.uniforms, { uTrim: U.uTrim, uSide: U.uSide });
    sh.vertexShader = 'attribute vec3 tp;\nattribute float tt;\nvarying vec3 vTp;\nvarying float vTt;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vTp = tp; vTt = tt;');
    sh.fragmentShader = 'uniform vec3 uTrim;\nuniform float uSide;\nvarying vec3 vTp;\nvarying float vTt;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float sideD = abs(abs(atan(vTp.x, vTp.z)) - 1.5708);
      float side = (1.0 - smoothstep(uSide - 0.012, uSide + 0.012, sideD)) * smoothstep(0.6, 0.85, vTt);
      diffuseColor.rgb = mix(diffuseColor.rgb, uTrim, side);`);
  };
  const m = toon({ map: R.jer.t, side: THREE.DoubleSide }); m.onBeforeCompile = sh => patch(sh, true); m.customProgramCacheKey = () => 'realJersey';
  const ol = new THREE.MeshBasicMaterial({ color: 0x2A1E1C, side: THREE.BackSide });
  ol.onBeforeCompile = sh => { patch(sh, false); sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += normalize(objectNormal) * 0.0022;'); };
  ol.customProgramCacheKey = () => 'realJerseyOl';
  return { m, ol };
}
// 護膝、襪子：從腿的網格取那一圈往外推（幾何每個性別做一次）
function gearPrep(T) {
  const H = T.parts.Human, g = H.geometry, pos = g.attributes.position.array, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const bn = H.skeleton.bones.map(b => b.name), n = si.count;
  const wOf = (i, name) => { let w = 0; for (let k = 0; k < 4; k++) if (bn[si.getComponent(i, k)] === name) w += sw.getComponent(i, k); return w; };
  const leg = {};
  for (const sd of ['l', 'r']) { let ky = 0, kc = 0, ay = 1e9; for (let i = 0; i < n; i++) { const th = wOf(i, 'thigh_' + sd), ca = wOf(i, 'calf_' + sd), fo = wOf(i, 'foot_' + sd); if (th > 0.3 && ca > 0.3) { ky += pos[i * 3 + 1]; kc++; } if (ca + fo > 0.6) ay = Math.min(ay, pos[i * 3 + 1]); } leg[sd] = { knee: ky / kc, ankle: ay }; }
  const side = i => (pos[i * 3] > 0 ? 'l' : 'r'), legW = i => { const sd = side(i); return wOf(i, 'thigh_' + sd) + wOf(i, 'calf_' + sd) + wOf(i, 'foot_' + sd); };
  const shell = (lo, hi, off) => {
    const ng = new THREE.BufferGeometry(), P = new Float32Array(n * 3), GY = new Float32Array(n);
    for (let i = 0; i < n; i++) { GY[i] = pos[i * 3 + 1]; for (let k = 0; k < 3; k++) P[i * 3 + k] = pos[i * 3 + k] + nor.array[i * 3 + k] * off; }
    ng.setAttribute('position', new THREE.BufferAttribute(P, 3)); ng.setAttribute('gy', new THREE.BufferAttribute(GY, 1)); ng.setAttribute('normal', nor); ng.setAttribute('skinIndex', si); ng.setAttribute('skinWeight', sw);
    const mg = (hi - lo) * 0.25, ok = i => legW(i) > 0.5 && pos[i * 3 + 1] > lo - mg && pos[i * 3 + 1] < hi + mg, idx = g.index.array, out = [];
    for (let t = 0; t < idx.length; t += 3) if (ok(idx[t]) && ok(idx[t + 1]) && ok(idx[t + 2])) out.push(idx[t], idx[t + 1], idx[t + 2]);
    ng.setIndex(out); return { geo: ng, lo, hi };
  };
  const span = leg.l.knee - leg.l.ankle, K = (leg.l.knee + leg.r.knee) / 2, A = (leg.l.ankle + leg.r.ankle) / 2;
  T.knee = shell(K - span * 0.17, K + span * 0.13, span * 0.03);
  T.socks = [0.2, 0.45, 0.78].map(h => shell(A - span * 0.3, A + span * h, span * 0.022));
}
function clipToon(lo, hi, color) {
  const m = toon({ color }); m.onBeforeCompile = sh => {
    sh.uniforms.uLo = { value: lo }; sh.uniforms.uHi = { value: hi };
    sh.vertexShader = 'attribute float gy;\nvarying float vGy;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGy = gy;');
    sh.fragmentShader = 'varying float vGy;\nuniform float uLo, uHi;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (vGy < uLo || vGy > uHi) discard;');
  }; m.customProgramCacheKey = () => 'gear' + lo.toFixed(4) + hi.toFixed(4); return m;
}

// ---------- VRoid 頭 ----------
const VROID = {};
function loadVroid(url) {
  if (VROID[url]) return VROID[url];
  return (VROID[url] = (async () => {
    const g = await new GLTFLoader().loadAsync(asset(url)); const s = g.scene; s.updateMatrixWorld(true);
    const face = [], groups = new Map(), caps = [], skinBox = new THREE.Box3();
    s.traverse(o => {
      if (!o.isMesh) return; const mn = o.material.name || '';
      if (/^Facebaked/.test(o.name)) {
        face.push({ geo: o.geometry, mat: o.material, mn, kind: /SKIN/.test(mn) ? 'skin' : /FaceBrow/.test(mn) ? 'brow' : /EyeWhite/.test(mn) ? 'white' : /EyeIris/.test(mn) ? 'iris' : /Highlight/.test(mn) ? 'hl' : 'line' });
        if (/Face_00_SKIN/.test(mn) && o.geometry.index) { const p = o.geometry.attributes.position, ix = o.geometry.index.array, v = new THREE.Vector3(); for (let k = 0; k < ix.length; k++) skinBox.expandByPoint(v.fromBufferAttribute(p, ix[k])); }
      } else if (/HAIR/i.test(mn) && o.geometry.index) {
        if (/HairBack/.test(mn)) { caps.push(o); return; }   // 頭皮那層（髮型的底）：混搭時算「後面」
        const key = o.geometry.attributes.position; let gp = groups.get(key); if (!gp) groups.set(key, gp = { src: o, parts: [] }); gp.parts.push({ mn, idx: [...o.geometry.index.array] });
      }
    });
    const mkGeo = (src, idx) => { const hg = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) if (src.geometry.attributes[k]) hg.setAttribute(k, src.geometry.attributes[k]); hg.setIndex(idx); return hg; };
    const hair = [];
    for (const { src, parts } of groups.values()) for (const p of parts) hair.push({ geo: mkGeo(src, p.idx), mat: src.material, mname: p.mn, idx: p.idx });
    for (const o of caps) hair.push({ geo: o.geometry, mat: o.material, mname: o.material.name || '', cap: true });
    return { face, hair, skinBox };
  })());
}
// 頭髮拆成「前面瀏海」和「後面」：一撮一撮（相連的三角形，位置相同的點當同一點）照重心分；VRoid 頭朝 -Z
function splitHair(D) {
  if (D.split) return D.split;
  const sb = D.skinBox, cz = (sb.min.z + sb.max.z) / 2, dz = sb.max.z - sb.min.z, eyeY = sb.min.y + (sb.max.y - sb.min.y) * 0.42;
  const front = [], back = [];
  for (const h of D.hair) {
    if (h.cap) { back.push(h); continue; }
    const pos = h.geo.attributes.position, idx = h.idx, n = pos.count, par = new Int32Array(n); for (let k = 0; k < n; k++) par[k] = k;
    const find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; }, uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
    const weld = new Map(); for (let k = 0; k < n; k++) { const key = Math.round(pos.getX(k) * 2e4) + ',' + Math.round(pos.getY(k) * 2e4) + ',' + Math.round(pos.getZ(k) * 2e4); const w = weld.get(key); if (w == null) weld.set(key, k); else uni(k, w); }
    for (let t = 0; t < idx.length; t += 3) { uni(idx[t], idx[t + 1]); uni(idx[t], idx[t + 2]); }
    const acc = new Map(); for (let t = 0; t < idx.length; t++) { const k = idx[t], r = find(k); let A = acc.get(r); if (!A) acc.set(r, A = { z: 0, y: 0, c: 0 }); A.z += pos.getZ(k); A.y += pos.getY(k); A.c++; }
    const isFront = (r) => { const A = acc.get(r), z = A.z / A.c, y = A.y / A.c; return z < cz - dz * HAIR_SPLIT.z && y > eyeY - dz * HAIR_SPLIT.y; };
    const fi = [], bi = []; for (let t = 0; t < idx.length; t += 3) (isFront(find(idx[t])) ? fi : bi).push(idx[t], idx[t + 1], idx[t + 2]);
    const mk = (ix) => { const g = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) if (h.geo.attributes[k]) g.setAttribute(k, h.geo.attributes[k]); g.setIndex(ix); return { ...h, geo: g, idx: ix }; };
    if (fi.length) front.push(mk(fi)); if (bi.length) back.push(mk(bi));
  }
  return (D.split = { front, back });
}
export const HAIR_SPLIT = { z: 0.18, y: 0.1 };   // 瀏海判斷：重心比臉中心前面多少（臉深度的比例）、比眼睛高
// 頭放在哪裡（相對頭骨頭）：跟原本的頭一樣大、一樣中心；VRM 0.x 朝 -Z，轉過來。混搭時前、後髮各用自己那顆頭的位置
function headMatrix(T, key, Vd) {
  if (T.heads[key]) return T.heads[key];
  const mb = T.headBox, sb = Vd.skinBox, s = (mb.max.y - mb.min.y) / (sb.max.y - sb.min.y);
  const cm = mb.getCenter(new THREE.Vector3()), cv = sb.getCenter(new THREE.Vector3());
  const rq = T.root.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI));
  const D = new THREE.Matrix4().compose(cm, rq, V(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-cv.x, -cv.y, -cv.z));
  T.B.head.updateMatrixWorld(true);
  return (T.heads[key] = T.B.head.matrixWorld.clone().invert().multiply(D));
}
// ---------- 臉：臉型（臉那顆頭的皮膚＋嘴，改下巴/臉頰/眼距）＋眼型（任一顆頭的眼睛）＋眉型（任一顆頭的眉毛） ----------
// 別顆頭的眼睛、眉毛：先照兩顆頭的大小換算到臉那顆頭的座標，再把左右各自的中心對準臉那顆頭原本眼睛／眉毛的位置
const FACE_GEO = new Map();
export let FACE_OUTLINE = 0.0012; export const setFaceOutline = (w) => (FACE_OUTLINE = w);
const isEyePart = (f) => f.kind === 'white' || f.kind === 'iris' || f.kind === 'hl' || /Eyeline|Eyelash/.test(f.mn);
const isHiddenPart = (f) => /EyeExtra/.test(f.mn);   // 特效（愛心眼、眼淚…）平常是收起來的，不畫
function sideCenters(parts, pick) {
  const c = { 1: V(0, 0, 0), '-1': V(0, 0, 0) }, n = { 1: 0, '-1': 0 }, v = new THREE.Vector3();
  for (const f of parts) if (pick(f)) { const a = f.geo.attributes.position; for (let k = 0; k < a.count; k++) { v.fromBufferAttribute(a, k); const sd = v.x >= 0 ? 1 : -1; c[sd].add(v); n[sd]++; } }
  for (const sd of [1, -1]) c[sd].multiplyScalar(1 / Math.max(1, n[sd])); return c;
}
const PART_KEYS = { face: ['jaw', 'chin', 'cheek', 'eg', 'ey'], eye: ['es', 'ew', 'eh', 'et'], brow: ['bh', 'bl', 'bt', 'by'] };
// 回傳 [{ f, geo, src }]：要畫的臉部零件（幾何已變形好），同一組合只算一次
function buildFace(Df, De, Db, key, P) {
  if (FACE_GEO.has(key)) return FACE_GEO.get(key);
  const fp = P.face || {}, ep = P.eye || {}, bp = P.brow || {}, out = [];
  const eyeF = sideCenters(Df.face, f => f.kind === 'white'), browF = sideCenters(Df.face, f => f.kind === 'brow');
  const eyeY = (eyeF[1].y + eyeF[-1].y) / 2, sb = Df.skinBox, chinY = sb.min.y, mouthY = eyeY - (eyeY - chinY) * 0.62;
  const scaleOf = (D) => (sb.max.y - sb.min.y) / (D.skinBox.max.y - D.skinBox.min.y);
  const toF = (D) => { const s = scaleOf(D), cs = D.skinBox.getCenter(new THREE.Vector3()), cf = sb.getCenter(new THREE.Vector3()); return (v) => v.sub(cs).multiplyScalar(s).add(cf); };
  const jaw = fp.jaw || 0, chin = fp.chin || 0, cheek = fp.cheek || 0, eg = fp.eg || 0, ey = fp.ey || 0;
  // 臉的皮膚：眼睛以下越往下越照 jaw 變寬窄、嘴巴以下照 chin 拉長縮短、眼睛到嘴巴之間照 cheek 變寬
  const skinMove = (v) => {
    const t = Math.max(0, Math.min(1, (eyeY - 0.01 - v.y) / (eyeY - 0.01 - chinY)));
    const cm = Math.max(0, Math.min(1, (eyeY + 0.01 - v.y) / 0.03)) * Math.max(0, Math.min(1, (v.y - mouthY + 0.02) / 0.03));
    v.x *= 1 + jaw * t * t + cheek * cm;
    if (v.y < mouthY) v.y = mouthY - (mouthY - v.y) * (1 + chin);
  };
  for (const f of Df.face) {
    if (isEyePart(f) || f.kind === 'brow' || isHiddenPart(f)) continue;
    if (!jaw && !chin && !cheek) { out.push({ f, geo: f.geo, D: Df }); continue; }
    const g = f.geo.clone(), a = f.geo.attributes.position, v = new THREE.Vector3(), pos = new Float32Array(a.count * 3);
    for (let k = 0; k < a.count; k++) { v.fromBufferAttribute(a, k); skinMove(v); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.morphAttributes = {}; g.computeBoundingSphere(); out.push({ f, geo: g, D: Df });
  }
  // 眼睛、眉毛：換算座標 → 對準 → 形狀
  const parts = (D, pick, target, lin, after, morphs) => {
    const map = toF(D), list = D.face.filter(pick), src = sideCenters(list, () => true), off = {};
    for (const sd of [1, -1]) off[sd] = target[sd].clone().sub(map(src[sd].clone()));
    const cen = { 1: target[1], '-1': target[-1] }, s = scaleOf(D);
    for (const f of list) {
      const g = f.geo.clone(), a = f.geo.attributes.position, v = new THREE.Vector3(), d = new THREE.Vector3(), pos = new Float32Array(a.count * 3);
      for (let k = 0; k < a.count; k++) { v.fromBufferAttribute(a, k); const sd = v.x >= 0 ? 1 : -1; map(v).add(off[sd]); d.copy(v).sub(cen[sd]); lin(d, sd); v.copy(cen[sd]).add(d); after(v, sd); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z; }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const ms = f.geo.morphAttributes.position;
      if (morphs && ms) g.morphAttributes.position = ms.map(m => { const o = new Float32Array(m.count * 3); for (let k = 0; k < m.count; k++) { d.fromBufferAttribute(m, k).multiplyScalar(s); lin(d, a.getX(k) >= 0 ? 1 : -1); o[k * 3] = d.x; o[k * 3 + 1] = d.y; o[k * 3 + 2] = d.z; } return new THREE.BufferAttribute(o, 3); });
      else g.morphAttributes = {};
      g.computeBoundingSphere(); out.push({ f, geo: g, D });
    }
  };
  const es = ep.es || 1, ew = (ep.ew || 1) * es, eh = (ep.eh || 1) * es, et = ep.et || 0;
  parts(De, isEyePart, eyeF, (d, sd) => { d.y += et * sd * d.x; d.x *= ew; d.y *= eh; }, (v, sd) => { v.x += sd * eg; v.y += ey; v.z -= Math.max(0, es - 1) * 0.012 + 0.0008; }, false);
  const bh = bp.bh || 1, bl = bp.bl || 1, bt = bp.bt || 0, by = bp.by || 0;
  parts(Db, f => f.kind === 'brow', browF, (d, sd) => { d.x *= bl; d.y *= bh; d.y += bt * sd * d.x; }, (v, sd) => { v.x += sd * eg * 0.6; v.y += by + ey * 0.6; v.z -= 0.0008; }, true);
  FACE_GEO.set(key, out); return out;
}
const VMAT = (m) => { const t = toon({ map: m.map || null, color: 0xffffff, transparent: !!m.transparent, alphaTest: m.alphaTest || 0, depthWrite: !m.transparent, side: m.side }); if (t.map) t.map.colorSpace = THREE.SRGBColorSpace; return t; };
// L.vhead 臉型（REAL_FACES）、L.vhair 髮型（REAL_HAIRS）、L.veye 眼型（REAL_EYES）、L.vbrow 眉型（REAL_BROWS）
const faceOf = (s, i) => REAL_FACES[s][i] || REAL_FACES[s].find(Boolean);
const hairOf = (s, i) => REAL_HAIRS[s][i] || REAL_HAIRS[s][0];
function headSet(s, L) {
  const F = faceOf(s, L.vhead), Hf = REAL_HEADS[s][F.head], E = REAL_EYES[L.veye | 0] || REAL_EYES[0], Bw = REAL_BROWS[L.vbrow | 0] || REAL_BROWS[0], H = hairOf(s, L.vhair);
  return { F, Hf, E, Bw, H, He: E.src ? headRef(E.src) : Hf, Hb: Bw.src ? headRef(Bw.src) : Hf, hairHeads: (H.a ? [H.a] : [H.f, H.b]).map(headRef) };
}
const headUrls = (s, L) => { const S = headSet(s, L); return [S.Hf, S.He, S.Hb, ...S.hairHeads].map(h => h.url); };
async function attachHead(R, L) {
  const T = R.T, S = headSet(T.s, L), { F, Hf, E, Bw, H } = S, heads = S.hairHeads;
  const [Df, De, Db, ...Dhs] = await Promise.all([Hf, S.He, S.Hb, ...heads].map(h => loadVroid(h.url)));
  if (R.dead) return;
  const groups = new Map(), grp = (url, D) => { if (!groups.has(url)) { const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(headMatrix(T, url, D)); R.B.head.add(g); groups.set(url, g); } return groups.get(url); };
  const gf = grp(Hf.url, Df);
  const skinW = new THREE.Color(L.skin), base = new THREE.Color('#F7E2CE');
  const pieces = buildFace(Df, De, Db, [Hf.url, S.He.url, S.Hb.url, JSON.stringify([F.p, E.p, Bw.p])].join('|'), { face: F.p, eye: E.p, brow: Bw.p });
  const mo = Bw.mo || {}, MI = VROID_MORPHS[S.Hb.url.replace(/^.*\/|\.glb$/g, '')] || {};
  for (const { f, geo } of pieces) {
    const m = new THREE.Mesh(geo, VMAT(f.mat));
    if (f.kind === 'brow' && geo.morphAttributes.position) { m.morphTargetInfluences = new Array(geo.morphAttributes.position.length).fill(0); for (const k in mo) if (MI[k] != null && MI[k] < m.morphTargetInfluences.length) m.morphTargetInfluences[MI[k]] = mo[k]; }
    m.renderOrder = 10 + ({ skin: 0, white: 1, iris: 2, brow: 3, line: 3, hl: 4 })[f.kind]; m.frustumCulled = false; m.userData.kind = f.kind;
    if (f.kind === 'skin') { m.material.color.setRGB(skinW.r / base.r, skinW.g / base.g, skinW.b / base.b); if (FACE_OUTLINE) { gf.add(m); makeOutline(m, FACE_OUTLINE); continue; } }   /* 臉的外框線：下巴形狀看得出來 */
    if (f.kind === 'brow') { m.material.map = grayDetail(f.mat.map); m.material.color.set(L.browC || L.hairC).multiplyScalar(0.9); }
    if (f.kind === 'iris') { m.material.map = grayDetail(f.mat.map); m.material.color.set(L.eyeC).multiplyScalar(1.6); }
    gf.add(m);
  }
  const hairMat = (mat) => { const t = VMAT(mat); t.map = grayDetail(mat.map); t.color.set(L.hairC); return t; };
  const addList = (list, g, skipEars) => { for (const h of list) { if (skipEars && h.mname.includes(skipEars)) continue; const m = new THREE.Mesh(h.geo, hairMat(h.mat)); m.frustumCulled = false; m.castShadow = true; g.add(m); makeOutline(m, 0.0016); } };
  let gh;
  if (H.a) { gh = grp(heads[0].url, Dhs[0]); addList(Dhs[0].hair, gh, heads[0].ears); }   // 整頂（貓耳那片不算頭髮）
  else { addList(splitHair(Dhs[0]).front, grp(heads[0].url, Dhs[0]), heads[0].ears); gh = grp(heads[1].url, Dhs[1]); addList(splitHair(Dhs[1]).back, gh, heads[1].ears); }
  if (Hf.ears) addList(Df.hair.filter(h => h.mname.includes(Hf.ears)), gf, null);   // 貓耳跟著臉
  R.headF = gf; R.headH = gh;
  headAcc(R, L, Df, Dhs[Dhs.length - 1], gf, gh, heads[heads.length - 1].ears);
  for (const g of groups.values()) patchLit(g);
  if (typeof window !== 'undefined' && window.wakeRender) window.wakeRender(300);   // 遊戲只在有變化時重畫：頭比較晚載完，叫它畫一次
}

// ---------- 配件 ----------
const ACC_M = new Map(), accM = (c, o = {}) => { const k = c + JSON.stringify(o); if (!ACC_M.has(k)) ACC_M.set(k, toon({ color: c, ...o })); return ACC_M.get(k); };
function hangOn(bone, obj, wp, wq) { bone.updateMatrixWorld(true); const m = new THREE.Matrix4().compose(wp, wq || new THREE.Quaternion(), V(1, 1, 1)); m.premultiply(bone.matrixWorld.clone().invert()); m.decompose(obj.position, obj.quaternion, obj.scale); bone.add(obj); }
// 項鍊、護腕的形狀在模板上量一次（站姿）；每個人物複製一份掛到自己的骨頭
function accPrep(T) {
  if (T.acc) return T.acc;
  const { root, B, parts } = T; root.updateMatrixWorld(true); const A = T.acc = {};
  const rq = root.getWorldQuaternion(new THREE.Quaternion()), sc = T.s === 'f' ? 0.93 : 1, X = V(1, 0, 0).applyQuaternion(rq), Z = V(0, 0, 1).applyQuaternion(rq);
  { const neck = wpos(B.neck_01), v = new THREE.Vector3(), surf = [];
    for (const o of [parts.jersey, parts.Human]) { o.skeleton.update(); const n = o.geometry.attributes.position.count; for (let k = 0; k < n; k++) { o.getVertexPosition(k, v).applyMatrix4(o.matrixWorld); if (v.y < neck.y - 0.012 && v.y > neck.y - 0.25 && Math.hypot(v.x - neck.x, v.z - neck.z) < 0.16) surf.push(v.clone()); } }
    const top = (x, z) => { let b = -1e9; for (const p of surf) if (Math.abs(p.x - x) < 0.011 && Math.abs(p.z - z) < 0.011) b = Math.max(b, p.y); return b; };
    const N = 40, rest = [];
    for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2, f = (1 + Math.cos(a)) / 2, r = (0.078 + 0.045 * f * f) * sc, q = neck.clone().addScaledVector(X, Math.sin(a) * r).addScaledVector(Z, Math.cos(a) * r); let y = top(q.x, q.z); if (y < -1e8) y = neck.y - 0.02 - 0.06 * f; q.y = y + 0.005; rest.push(q); }
    const floor = rest.map(q => q.y);
    for (let it = 0; it < 60; it++) { const ys = rest.map(q => q.y); for (let k = 0; k < N; k++) rest[k].y = Math.max(floor[k], (ys[(k + N - 1) % N] + ys[(k + 1) % N]) / 2 - 0.0012); }
    const back = rest[N / 2].clone(), inv = new THREE.Matrix4().compose(back, rq, V(1, 1, 1)).invert(), local = rest.map(q => q.clone().applyMatrix4(inv));
    B.spine_03.updateMatrixWorld(true); const m = new THREE.Matrix4().compose(back, rq, V(1, 1, 1)).premultiply(B.spine_03.matrixWorld.clone().invert());
    A.neckM = m; A.chainGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(local, true), 120, 0.0028, 6, true); A.tagPos = local[0].clone().add(V(0, -0.015, 0.004)); }
  A.wrist = {};
  { const H = parts.Human, si = H.geometry.attributes.skinIndex, sw = H.geometry.attributes.skinWeight, bn = H.skeleton.bones.map(b => b.name), v = new THREE.Vector3();
    for (const s of ['l', 'r']) {
      const e = wpos(B['lowerarm_' + s]), w = wpos(B['hand_' + s]), d = w.clone().sub(e), len = d.length(); d.normalize(); let rad = 0;
      for (let k = 0; k < si.count; k++) { let ok = 0; for (let j = 0; j < 4; j++) if (bn[si.getComponent(k, j)] === 'lowerarm_' + s && sw.getComponent(k, j) > 0.4) ok = 1; if (!ok) continue; H.getVertexPosition(k, v).applyMatrix4(H.matrixWorld); const t = v.clone().sub(e).dot(d) / len; if (t < 0.72 || t > 0.95) continue; rad = Math.max(rad, v.clone().sub(e).addScaledVector(d, -t * len).length()); }
      rad = (rad || 0.032) + 0.003;
      const m = new THREE.Matrix4().compose(e.clone().addScaledVector(d, len * 0.82), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d), V(1, 1, 1)); B['lowerarm_' + s].updateMatrixWorld(true); m.premultiply(B['lowerarm_' + s].matrixWorld.clone().invert());
      A.wrist[s] = { m, geo: new THREE.CylinderGeometry(rad, rad * 1.04, len * 0.2, 24, 1, true) };
    }
  }
  return A;
}
function bodyAcc(R, eq) {
  const A = accPrep(R.T);
  if (eq.neck) {
    const mat = accM(eq.neck === 2 ? 0xE8B94A : 0xD9DDE3), g = new THREE.Group(), piv = new THREE.Group(); g.add(piv);
    A.neckM.decompose(g.position, g.quaternion, g.scale); R.B.spine_03.add(g);
    const chain = new THREE.Mesh(A.chainGeo, mat), tag = new THREE.Mesh(TAG_GEO, mat); tag.position.copy(A.tagPos); tag.rotation.x = Math.PI / 2 - 0.25;
    for (const m of [chain, tag]) { m.castShadow = true; m.frustumCulled = false; piv.add(m); }
    R.neck = { piv, a: 0, v: 0, py: null, vy: 0 };
  }
  if (eq.wrist) for (const s of ['l', 'r']) { const W = A.wrist[s], m = new THREE.Mesh(W.geo, accM(eq.wrist === 2 ? 0x22252B : 0xF4F4F0, { side: THREE.DoubleSide })); W.m.decompose(m.position, m.quaternion, m.scale); m.castShadow = true; m.frustumCulled = false; R.B['lowerarm_' + s].add(m); }
}
const TAG_GEO = new THREE.CylinderGeometry(0.012, 0.012, 0.0035, 20);
// 眼鏡掛在臉那款、帽子照頭髮那款的大小（VRoid 自己的座標：朝 -Z）
function headAcc(R, L, Df, Dh, gf, gh, earsKey) {
  const eq = L.eq || {}, v = new THREE.Vector3();
  const iris = Df.face.find(f => f.kind === 'iris'), skin = Df.face.find(f => f.kind === 'skin'); if (!iris || !skin) return;
  const p = iris.geo.attributes.position, Le = V(0, 0, 0), Re = V(0, 0, 0); let nl = 0, nr = 0;
  for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); if (v.x > 0) { Le.add(v); nl++; } else { Re.add(v); nr++; } }
  Le.multiplyScalar(1 / nl); Re.multiplyScalar(1 / nr);
  const eyeD = Le.distanceTo(Re), ey = (Le.y + Re.y) / 2;
  if (eq.glasses) {
    let hw = 0; { const a = skin.geo.attributes.position; for (let k = 0; k < a.count; k++) { v.fromBufferAttribute(a, k); if (Math.abs(v.y - ey) < 0.015 && v.z < Le.z + 0.12) hw = Math.max(hw, Math.abs(v.x)); } if (!hw) hw = Math.abs(Le.x) * 1.7; }
    const kind = eq.glasses, g = new THREE.Group(), r = eyeD * 0.34, th = r * (kind === 2 ? 0.05 : 0.1), z = Math.min(Le.z, Re.z) - eyeD * 0.3;
    const frameM = accM(kind === 2 ? 0xD4A940 : 0x1C1C20), lensM = new THREE.MeshBasicMaterial({ color: kind === 3 ? 0x182030 : 0xDDEEFF, transparent: true, opacity: kind === 3 ? 0.82 : 0.12, depthWrite: false, side: THREE.DoubleSide });
    const sx = kind === 3 ? 1.15 : 1.05, sy = kind === 3 ? 0.72 : 0.8;
    for (const c of [Le, Re]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, th, 8, 32), frameM); ring.scale.set(sx, sy, 1); ring.position.set(c.x, c.y, z); g.add(ring);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(r, 32), lensM); lens.scale.set(sx, sy, 1); lens.position.set(c.x, c.y, z); lens.renderOrder = 20; g.add(lens);
      const s = Math.sign(c.x), ox = c.x + s * r * sx, ax = s * hw * 1.02, az = z + hw * 1.3, ln = Math.hypot(ax - ox, az - z);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(th * 1.4, th * 1.6, ln), frameM); arm.position.set((ox + ax) / 2, c.y + r * 0.2, (z + az) / 2); arm.rotation.y = Math.atan2(ax - ox, az - z); g.add(arm);
    }
    const br = new THREE.Mesh(new THREE.TorusGeometry(Math.max(r * 0.2, eyeD / 2 - r * sx), th * 0.8, 6, 16, Math.PI), frameM); br.position.set((Le.x + Re.x) / 2, ey + r * 0.1, z); g.add(br);
    g.traverse(o => { o.frustumCulled = false; }); gf.add(g);
  }
  if (eq.hat) {
    skin.geo.computeBoundingBox(); const sb = skin.geo.boundingBox, hb = new THREE.Box3(), cy = (sb.min.y + sb.max.y) / 2;
    for (const h of Dh.hair) { if (earsKey && h.mname.includes(earsKey)) continue; const a = h.geo.attributes.position; for (let k = 0; k < a.count; k++) { v.fromBufferAttribute(a, k); if (v.y > cy) hb.expandByPoint(v); } }
    if (hb.isEmpty()) hb.copy(sb);
    const hc = hb.getCenter(new THREE.Vector3()), hs = hb.getSize(new THREE.Vector3()), base = ey + (hb.max.y - ey) * 0.38, ch = (hb.max.y - base) * 0.92;
    const g = new THREE.Group(), m = accM(eq.hat === 1 ? 0x1C1C20 : 0xF2F2F0, { side: THREE.DoubleSide });
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m); crown.scale.set(hs.x * 0.5, ch, hs.z * 0.52); crown.position.set(hc.x, base, hc.z); g.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.006, 32, 1, false, Math.PI * 0.55, Math.PI * 0.9), m); brim.scale.set(hs.x * 0.5, 1, hs.z * 0.85); brim.position.set(hc.x, base + 0.004, hc.z); brim.rotation.x = -0.12; g.add(brim);
    g.traverse(o => { o.frustumCulled = false; o.castShadow = true; }); gh.add(g);
  }
}

// 顏色跟測試頁一致：遊戲的燈比測試頁暗、色調處理（AgX）偏灰 → 角色材質自己補亮度、飽和度（只影響新角色，球館不變）
export const REAL_LIGHT = { uBoost: { value: 1.9 }, uSat: { value: 1.25 } };
export function setRealLight(boost, sat) { if (boost != null) REAL_LIGHT.uBoost.value = boost; if (sat != null) REAL_LIGHT.uSat.value = sat; }
function patchLit(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || m.userData.lit || !(m.isMeshToonMaterial || m.isMeshBasicMaterial) || m.side === THREE.BackSide) continue;
      m.userData.lit = 1;
      const prev = m.onBeforeCompile, key = m.customProgramCacheKey();
      m.onBeforeCompile = (sh, r) => {
        if (prev) prev.call(m, sh, r);
        Object.assign(sh.uniforms, REAL_LIGHT);
        sh.fragmentShader = `uniform float uBoost, uSat;
` + sh.fragmentShader.replace('#include <opaque_fragment>',
          `outgoingLight *= ${m.isMeshBasicMaterial ? '1.0' : 'uBoost'};
          outgoingLight = max(mix(vec3(dot(outgoingLight, vec3(0.299, 0.587, 0.114))), outgoingLight, uSat), 0.0);
          #include <opaque_fragment>`);
      };
      m.customProgramCacheKey = () => key + '+lit'; m.needsUpdate = true;
    }
  });
}
// ---------- 對外 ----------
let loading = null;
const BUMP_POSE = {};   // 定案墊球手型：每根骨頭的局部旋轉（男、女各一份）
async function loadBumpPose() {
  try { const j = await (await fetch(asset('assets/models/bump_pose.json'))).json(); for (const s of ['m', 'f']) { if (!j[s]) continue; BUMP_POSE[s] = {}; for (const [n, a] of Object.entries(j[s])) BUMP_POSE[s][n] = new THREE.Quaternion().fromArray(a); } }
  catch (e) { console.warn('[real] 墊球手型載入失敗', e); }
}
export function preloadReal() {
  if (!loading) loading = Promise.all([loadBumpPose(), ...['m', 'f'].map(async s => { try { TPL[s] = await loadTpl(s); } catch (e) { console.warn('[real] 模型載入失敗', s, e); } })]).then(() => !!(TPL.m && TPL.f));
  return loading;
}
export const realReady = () => !!(TPL.m && TPL.f);
// 外觀：sx 'm'/'f'、skin、hairC、eyeC、vhead（臉）、vhair（髮型）、jersey/trim/num/shorts、no、knee/kneeC、sock/sockC、eq
export function makeReal(L) {
  const T = TPL[L.sx]; if (!T) return null;
  const root = cloneSkeleton(T.root), parts = {}; let skel = null;
  root.traverse(o => { if (o.isMesh) { parts[o.name] = o; o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; if (o.skeleton) skel = o.skeleton; } });
  const R = { T, root, parts, skel, B: boneMap(skel), look: L };
  for (const b of skel.bones) b.userData.rest = T.B[b.name].userData.rest.clone();   // 複製時 userData 走 JSON，四元數會壞掉 → 從模板重拿
  // 材質
  parts.Human.material = toon({ color: L.skin });
  R.jer = canvasTex(1024, 512); R.sho = canvasTex(512, 256);
  const J = jerseyMats(R); parts.jersey.material = J.m; R.jU.uTrim.value.set(L.trim);
  parts.shorts.material = toon({ map: R.sho.t, side: THREE.DoubleSide });
  const sh = T.parts.shoes.material, src = sh.map && sh.map.image;
  parts.shoes.material = toon({ map: src && src.width ? shoeTex(src, sh.map, L.sock ? L.sockC : L.skin, !L.sock) : sh.map });
  drawJersey(R.jer, L); drawShorts(R.sho, L);
  for (const n of ['Human', 'shorts', 'shoes']) makeOutline(parts[n], 0.0022);
  makeOutline(parts.jersey, 0.0022, J.ol);
  // 護膝、襪子
  const H = parts.Human, gear = [];
  if (L.knee) gear.push([T.knee, L.kneeC]);
  if (L.sock) gear.push([T.socks[L.sock - 1], L.sockC]);
  for (const [G, c] of gear) { const m = new THREE.SkinnedMesh(G.geo, clipToon(G.lo, G.hi, c)); m.bind(skel, H.bindMatrix); m.castShadow = true; m.frustumCulled = false; H.parent.add(m); }
  bodyAcc(R, L.eq || {});
  // 頭（VRoid，每款約 2 MB）比身體晚載好：載好之前整個人先不顯示，不會看到沒有頭的身體（2026-11-25 使用者：每次進新地圖頭先不見）
  root.visible = false;
  R.ready = attachHead(R, L).catch(e => console.warn('[real] 頭載入失敗', e)).then(() => { if (!R.dead) root.visible = true; if (typeof window !== 'undefined' && window.wakeRender) window.wakeRender(300); });
  patchLit(root);
  R.handKind = null; R.cloth = null;
  if (typeof location !== 'undefined' && /[?&]debug/.test(location.search)) (window.__realList = window.__realList || []).push(R);   /* 除錯用（網址有 debug 才記） */
  return R;
}
export function disposeReal(R) { if (R) R.dead = true; }

// ---------- 每格：跟著公仔骨架擺姿勢 ----------
const Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
function setWorldQ(b, q) { b.quaternion.copy(b.parent.getWorldQuaternion(Q2).invert().multiply(q)); b.updateMatrixWorld(true); }
function ikArm(B, s, target, pole) {
  const up = B['upperarm_' + s], lo = B['lowerarm_' + s], ha = B['hand_' + s];
  const S = wpos(up), E = wpos(lo), Wr = wpos(ha), a = S.distanceTo(E), b = E.distanceTo(Wr);
  const d = target.clone().sub(S), Ld = Math.min(d.length(), (a + b) * 0.995); d.normalize();
  const cosA = Math.max(-1, Math.min(1, (a * a + Ld * Ld - b * b) / (2 * a * Ld))), sinA = Math.sqrt(1 - cosA * cosA);
  const pp = pole.clone().sub(S); pp.addScaledVector(d, -pp.dot(d)); if (pp.lengthSq() < 1e-8) pp.set(0, -1, 0); pp.normalize();
  const elbow = S.clone().addScaledVector(d, cosA * a).addScaledVector(pp, sinA * a);
  aimBone(B, 'upperarm_' + s, 'lowerarm_' + s, elbow.sub(S));
  aimBone(B, 'lowerarm_' + s, 'hand_' + s, S.clone().addScaledVector(d, Ld).sub(wpos(lo)));
}
const TOUCH_HAND = { bump: 'bump', set: 'set', spike: 'spike', block: 'block' };
export function driveReal(av, dt) {
  const R = av.real; if (!R || R.dead) return;
  const T = R.T, B = R.B, root = R.root, g = av.g, gs = g.scale.x || 1;
  // root：掛在 av.g 底下，抵掉 av.g 的放大
  const ds = R.ds || 1;   // 顯示縮放（大廳、建角色畫面把人縮成跟原本公仔差不多高，鏡頭不用改）
  root.scale.setScalar(T.k * ds / gs);
  g.updateMatrixWorld(true);
  const gq = g.getWorldQuaternion(new THREE.Quaternion()), gp = g.getWorldPosition(new THREE.Vector3()), up = V(0, 1, 0);
  // 1. 骨頭方向：公仔關節的世界方向 × 校正
  for (const b of R.skel.bones) b.quaternion.copy(b.userData.rest);
  root.updateMatrixWorld(true);
  const rootQ = av.root.getWorldQuaternion(new THREE.Quaternion()), spQ = av.spine.getWorldQuaternion(new THREE.Quaternion()), hdQ = av.head.getWorldQuaternion(new THREE.Quaternion());
  // 骨盆＝公仔 root、上身三節從 root 漸漸轉到公仔 spine、脖子在 spine 和頭中間
  const mix = (a, b, f, n) => setWorldQ(B[n], a.clone().slerp(b, f).multiply(T.C[n]));
  mix(rootQ, spQ, 0.12, 'pelvis'); mix(rootQ, spQ, 0.42, 'spine_01'); mix(rootQ, spQ, 0.72, 'spine_02'); mix(rootQ, spQ, 1, 'spine_03');   /* 骨盆也跟著上身轉一點點（2026-11-25 使用者：側身時髖不可能完全正對前面） */
  mix(spQ, hdQ, 0.5, 'neck_01'); mix(spQ, hdQ, 1, 'head');
  for (const [k, i, n] of MAP) setWorldQ(B[n], av[k][i].getWorldQuaternion(new THREE.Quaternion()).multiply(T.C[n]));
  // 2. 髖的位置：公仔髖（扣掉跳躍）離 av.g 原點的位移照比例放大，再加真的跳躍高度
  const rigHip = av.legs[0].getWorldPosition(new THREE.Vector3()).add(av.legs[1].getWorldPosition(V1)).multiplyScalar(0.5);
  if (R.rigHip0 == null) R.rigHip0 = (av.hipH || 0.62) * gs;
  const jy = Math.max(0, av.body.position.y), jumpRig = jy * gs * (av.chibi ? (av._jk || 1) : 1);
  const s = T.hip0 * ds / R.rigHip0, rel = rigHip.sub(gp); rel.y -= jumpRig; rel.multiplyScalar(s); rel.y += jy;
  const want = gp.clone().add(rel);
  const cur = wpos(B.thigh_l).add(wpos(B.thigh_r)).multiplyScalar(0.5);
  root.position.add(g.worldToLocal(want.clone()).sub(g.worldToLocal(cur.clone()))); root.updateMatrixWorld(true);
  // 3. 碰球時手對準公仔的手（公仔的手已經對到球上）
  const tk = av._tk, w = R.ikW = (R.ikW || 0) + ((tk && tk !== 'bump' ? (av._reachW ?? 1) : 0) - (R.ikW || 0)) * Math.min(1, dt * 14);   /* 只在公仔真的伸手對準球時才對準（_reachW，球越近越大） */   /* 墊球改用定案手型（下面 4b），不用 IK 拉手 */
  if (w > 0.02) for (const [i, sd] of [[0, 'r'], [1, 'l']]) {
    const q0 = [B['upperarm_' + sd].quaternion.clone(), B['lowerarm_' + sd].quaternion.clone()], hq = B['hand_' + sd].getWorldQuaternion(new THREE.Quaternion());
    ikArm(B, sd, av.hands[i].getWorldPosition(new THREE.Vector3()), av.elbows[i].getWorldPosition(new THREE.Vector3()));
    B['upperarm_' + sd].quaternion.slerpQuaternions(q0[0], B['upperarm_' + sd].quaternion.clone(), w); B['lowerarm_' + sd].quaternion.slerpQuaternions(q0[1], B['lowerarm_' + sd].quaternion.clone(), w);
    B['upperarm_' + sd].updateMatrixWorld(true); setWorldQ(B['hand_' + sd], hq);
  }
  // 4. 手指
  const hk = TOUCH_HAND[tk] || 'natural';
  for (const sd of ['l', 'r']) { const qs = T.hands[hk][sd]; FINGER_BONES(sd).forEach((n, j) => B[n].quaternion.copy(qs[j])); }
  // 4a. 舉球：球推出去（手臂快伸直）時手腕往外翻，跟預覽頁 avatar-real.html 的舉球最後一格一樣（手指朝外上、掌心朝前外）
  { const sw = R.setW = (R.setW || 0) + ((tk === 'set' ? 1 : 0) - (R.setW || 0)) * Math.min(1, dt * 12);
    if (sw > 0.01) for (const [i, sd] of [[0, 'r'], [1, 'l']]) {
      const u = wpos(B['lowerarm_' + sd]).sub(wpos(B['upperarm_' + sd])).normalize(), l = wpos(B['hand_' + sd]).sub(wpos(B['lowerarm_' + sd])).normalize();
      const k = sw * Math.max(0, Math.min(1, (u.dot(l) - 0.8) / 0.17)) * Math.max(0, Math.min(1, (l.y - 0.4) / 0.3));   // 手臂快伸直、往上推
      if (k < 0.01) continue;
      const sx = sd === 'l' ? 1 : -1, sq = av.spine.getWorldQuaternion(new THREE.Quaternion());
      const f = V(sx * 0.4, 0.85, 0.2).applyQuaternion(sq).normalize(), n = V(sx * 0.55, 0.05, 0.85).applyQuaternion(sq);
      const Rr = T.handRest[sd], ft = f, nt = n.addScaledVector(ft, -n.dot(ft)).normalize();
      const mL = new THREE.Matrix4().makeBasis(Rr.fl, Rr.nl, new THREE.Vector3().crossVectors(Rr.fl, Rr.nl)), mT = new THREE.Matrix4().makeBasis(ft, nt, new THREE.Vector3().crossVectors(ft, nt));
      const want = new THREE.Quaternion().setFromRotationMatrix(mT.multiply(mL.transpose())), cur = B['hand_' + sd].getWorldQuaternion(new THREE.Quaternion());
      setWorldQ(B['hand_' + sd], cur.slerp(want, k));
    }
  }
  // 4a2. 攔網、扣球的手掌朝前（2026-11-25 使用者：攔網兩手掌朝內對著彼此、揮臂手掌朝左；要朝網子／朝球）
  //   照身體面對的方向（不跟著上身轉）；手臂舉越高越照這個方向，手放下來就照姿勢本身
  { const face = tk === 'block' ? { l: 1, r: 1 } : tk === 'spike' ? { r: 1 } : null, fw = R.faceW = (R.faceW || 0) + ((face ? 1 : 0) - (R.faceW || 0)) * Math.min(1, dt * 14);
    if (fw > 0.01 && (face || R.faceLast)) { if (face) R.faceLast = face; const F0 = R.faceLast;
      const gq2 = av.g.getWorldQuaternion(new THREE.Quaternion());
      for (const sd of ['l', 'r']) { if (!F0[sd]) continue;
        const l = wpos(B['hand_' + sd]).sub(wpos(B['lowerarm_' + sd])).normalize(), k = fw * Math.max(0, Math.min(1, (l.y - 0.25) / 0.35));
        if (k < 0.01) continue;
        const sx = sd === 'l' ? 1 : -1, f = V(sx * 0.08, 1, 0.12).applyQuaternion(gq2).normalize(), n = V(0, 0.1, 1).applyQuaternion(gq2);
        const Rr = T.handRest[sd], nt = n.addScaledVector(f, -n.dot(f)).normalize();
        const mL = new THREE.Matrix4().makeBasis(Rr.fl, Rr.nl, new THREE.Vector3().crossVectors(Rr.fl, Rr.nl)), mT = new THREE.Matrix4().makeBasis(f, nt, new THREE.Vector3().crossVectors(f, nt));
        const want = new THREE.Quaternion().setFromRotationMatrix(mT.multiply(mL.transpose())), cur = B['hand_' + sd].getWorldQuaternion(new THREE.Quaternion());
        setWorldQ(B['hand_' + sd], cur.slerp(want, k));
      }
      if (!face && fw < 0.02) R.faceLast = null;
    }
  }
  // 4b. 墊球：套使用者確認的定案手型（avatar-real.html 的 bumpPose，存在 assets/models/bump_pose.json：雙手掌心朝上並排、手指交疊、大拇指抬起、手腕靠攏）
  //   手型相對上身固定；整個平台繞兩肩連線轉到公仔手的方向（球的高度），兩隻手的相對位置完全不變
  { const bp = BUMP_POSE[T.s], bw = R.bumpW = (R.bumpW || 0) + ((tk === 'bump' && bp ? 1 : 0) - (R.bumpW || 0)) * Math.min(1, dt * 12);
    if (bw > 0.01 && bp) {
      const names = Object.keys(bp), q0 = names.map(n => B[n].quaternion.clone());
      names.forEach((n, j) => B[n].quaternion.copy(bp[n]));
      root.updateMatrixWorld(true);
      const SL = wpos(B.upperarm_l), SR = wpos(B.upperarm_r), axis = SL.clone().sub(SR).normalize(), S = SL.clone().add(SR).multiplyScalar(0.5);
      const C = wpos(B.hand_l).add(wpos(B.hand_r)).multiplyScalar(0.5).sub(S);
      const rS = av.arms[0].getWorldPosition(new THREE.Vector3()).add(av.arms[1].getWorldPosition(V1)).multiplyScalar(0.5);
      const D = av.hands[0].getWorldPosition(new THREE.Vector3()).add(av.hands[1].getWorldPosition(V1)).multiplyScalar(0.5).sub(rS);
      C.addScaledVector(axis, -C.dot(axis)); D.addScaledVector(axis, -D.dot(axis));
      if (C.lengthSq() > 1e-6 && D.lengthSq() > 1e-6) {
        C.normalize(); D.normalize(); let ang = Math.acos(Math.max(-1, Math.min(1, C.dot(D)))); if (new THREE.Vector3().crossVectors(C, D).dot(axis) < 0) ang = -ang;
        ang = Math.max(-0.9, Math.min(0.9, ang));
        rotWorld(B.upperarm_l, axis, ang); rotWorld(B.upperarm_r, axis, ang);
      }
      const qb = names.map(n => B[n].quaternion.clone());
      names.forEach((n, j) => B[n].quaternion.slerpQuaternions(q0[j], qb[j], bw));
      root.updateMatrixWorld(true);
    }
  }
  // 5. 貼地：在地上時最低的部位貼地面（腳用鞋底），空中維持起跳前的高度差
  root.updateMatrixWorld(true);
  const gy = gp.y + 0.022; let low = Infinity;
  for (const [n, r] of FLOOR) low = Math.min(low, wpos(B[n], V2).y - r * ds);
  // 日系頭比原本的頭大：頭的中心在頭骨頭往頭頂方向約 11 cm、半徑約 14 cm（側滾翻倒過來時頭頂才不會穿進地板）
  { const hp = wpos(B.head, V1), up = V2.copy(hp).sub(wpos(B.neck_01, new THREE.Vector3())).normalize(); low = Math.min(low, hp.y + up.y * 0.11 * ds - 0.14 * ds); }
  for (const n of ['foot_l', 'foot_r', 'ball_l', 'ball_r']) low = Math.min(low, wpos(B[n], V2).y - T.footR[n] * ds);
  const need = gy - low;   // 要往上（正）或往下（負）移多少，最低點才剛好貼地
  if (jy < 0.03) R.offY = R.offY == null || need > R.offY ? need : R.offY + (need - R.offY) * Math.min(1, dt * 20);   /* 穿進地板：馬上推上來；往下貼回地面才慢慢來 */
  else R.offY = Math.max(R.offY ?? 0, need);   // 空中：維持起跳前的差，但不穿進地板
  root.position.y += R.offY / gs; root.updateMatrixWorld(true);
  if (av.realSeat != null) {   // 坐著：髖（兩個大腿根中間）放在座位高度，不照地板貼
    const hy = (wpos(B.thigh_l).y + wpos(B.thigh_r).y) / 2, want = gp.y + av.realSeat * ds;
    root.position.y += (want - hy) / gs; root.updateMatrixWorld(true); R.offY = null;
  }
  if (OBST) netPush(R, g, ds);
  // 6. 衣服下擺、項鍊的慣性
  clothStep(R, dt); neckStep(R, dt);
}
// 網子：遊戲擋人只看站的那一點離網多遠（照以前的小公仔設的）；新角色比較高大、跑步前傾手往前擺會伸進網子 →
//   網子上緣以下，身上任何部位離網面不到 6 cm 就把整個人往自己那側挪（只動畫面，判定不變）。setRealObstacles(() => [[x1, z1, x2, z2, 上緣高], …])
let OBST = null;
export function setRealObstacles(fn) { OBST = fn; }
const NET_PTS = [['head', 0.14], ['neck_01', 0.08], ['spine_03', 0.14], ['spine_01', 0.13], ['pelvis', 0.13], ['middle_03_l', 0.02], ['middle_03_r', 0.02], ['hand_l', 0.04], ['hand_r', 0.04], ['lowerarm_l', 0.045], ['lowerarm_r', 0.045], ['upperarm_l', 0.06], ['upperarm_r', 0.06], ['calf_l', 0.07], ['calf_r', 0.07], ['foot_l', 0.06], ['foot_r', 0.06], ['ball_l', 0.05], ['ball_r', 0.05]];
function netPush(R, g, ds) {
  let segs; try { segs = OBST(); } catch (_) { return; } if (!segs || !segs.length) return;
  const B = R.B, pel = wpos(B.pelvis);
  for (const [x1, z1, x2, z2, top] of segs) {
    const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
    const along = ((pel.x - x1) * dx + (pel.z - z1) * dz) / L; if (along < -0.6 || along > L + 0.6) continue;
    const sp = (pel.x - x1) * nx + (pel.z - z1) * nz; if (Math.abs(sp) > 1.8) continue;
    const sg = Math.sign(sp) || 1; let need = 0;
    for (const [n, r] of NET_PTS) { const b = B[n]; if (!b) continue; const p = wpos(b, V2); if (p.y - r * ds > top) continue; const sd = ((p.x - x1) * nx + (p.z - z1) * nz) * sg; need = Math.max(need, 0.06 + r * ds - sd); }
    if (need <= 0) continue;
    const a = g.worldToLocal(pel.clone()), b2 = g.worldToLocal(pel.clone().add(V1.set(nx * sg * need, 0, nz * sg * need)));
    R.root.position.add(b2.sub(a)); R.root.updateMatrixWorld(true);
  }
}
const CLOTH = { k: 140, c: 9, gain: 0.3, max: 0.022 };
function clothStep(R, dt) {
  if (dt <= 0) return; const B = R.B, o = R.parts.jersey, p = wpos(B.pelvis), sag = 9.8 / CLOTH.k;
  const S = R.cloth || (R.cloth = { s: p.clone(), v: new THREE.Vector3() });
  if (dt > 0.2 || S.s.distanceTo(p) > 1) { S.s.copy(p); S.s.y -= sag; S.v.set(0, 0, 0); }
  for (let t = dt; t > 1e-6; t -= 1 / 120) { const h = Math.min(t, 1 / 120), a = p.clone().sub(S.s).multiplyScalar(CLOTH.k).addScaledVector(S.v, -CLOTH.c); a.y -= 9.8; S.v.addScaledVector(a, h); S.s.addScaledVector(S.v, h); }
  const lag = S.s.clone().sub(p); lag.y += sag; lag.multiplyScalar(CLOTH.gain);
  const L = lag.length(); if (L > 1e-6) lag.multiplyScalar(CLOTH.max * Math.tanh(L / CLOTH.max) / L);
  let lift = 0; for (const s of ['l', 'r']) lift += Math.max(0, wpos(B['lowerarm_' + s]).sub(wpos(B['upperarm_' + s])).normalize().y);
  lag.y += 0.0075 * lift;
  R.jU.uSway.value.copy(lag.applyMatrix3(new THREE.Matrix3().setFromMatrix4(o.matrixWorld).invert()));
}
function neckStep(R, dt) {
  const S = R.neck; if (!S || dt <= 0) return;
  const y = wpos(R.B.spine_03).y;
  if (dt > 0.2 || S.py == null) { S.py = y; S.vy = 0; S.a = 0; S.v = 0; return; }
  const vy = (y - S.py) / dt, acc = (vy - S.vy) / dt; S.py = y; S.vy = vy;
  const drive = -Math.max(-30, Math.min(30, acc)) * 0.6;
  for (let t = dt; t > 1e-6; t -= 1 / 120) { const h = Math.min(t, 1 / 120); S.v += (-12 * S.a - 3 * S.v + (Math.abs(acc) > 2 ? drive : 0)) * h; S.a += S.v * h; if (S.a < 0) { S.a = 0; S.v = S.v < 0 ? -S.v * 0.3 : S.v; } if (S.a > 0.9) { S.a = 0.9; S.v = 0; } }
  S.piv.rotation.x = -S.a;
}

// ---------- 給大廳、建角色畫面、遊戲用：做一個人物（看不見的公仔骨架＋新角色跟著它） ----------
// look＝decodeLook() 的結果（有 look.real＝新代碼；舊 t2 代碼照髮型、眼睛款式對應過去）；kitArg＝隊服（'orange'、球隊球衣物件…）
export function realLookOf(look, kitArg) {
  const k = kitOf(kitArg) || {};
  if (look && look.real) return realRenderLook({ ...look.real, num: look.num ?? look.real.num, eq: look.eq }, k);
  const L = look || {}, f = L.sex === 1, h = L.hair | 0;
  return { sx: f ? 'f' : 'm', skin: TOY_OPTIONS.skin[L.skin] || '#F7D2B4', hairC: TOY_OPTIONS.hairColor[L.hairColor] || '#2A2321', eyeC: '#6B4A30',
    vhead: f ? [0, 1, 2, 3, 4, 5, 7][(L.eyes | 0) % 7] : 0, vhair: f ? ({ 4: 2, 5: 4, 6: 3, 7: 0 })[h] ?? [1, 5, 6, 7][h % 4] : [0, 2, 1, 0][h % 4], no: L.num ?? 10,
    jersey: k.body || '#F4F4F4', trim: k.trim || '#1F3F8F', num: k.num || '#1F3F8F', shorts: k.shorts || '#1F2A44',
    knee: L.knee !== 2, kneeC: L.knee === 1 ? '#F2F2EE' : '#26262B', sock: 1, sockC: '#F4F4F4', eq: L.eq || {} };
}
// 先把某個外觀要用的頭下載好（自己的頭在載入畫面就準備好，進場不用等）
export function preloadHeadsFor(look, kitArg) {
  const L = realLookOf(look, kitArg);
  return Promise.all(headUrls(L.sx, L).map(loadVroid)).catch(() => {});
}
export function attachReal(av, look, kitArg, ds = 1) {
  if (!realReady()) return null;
  const R = makeReal(realLookOf(look, kitArg)); if (!R) return null;
  av.g.traverse(o => { if (o.isMesh) o.visible = false; });   // 公仔本身藏起來（骨架照常算）
  R.ds = ds; av.real = R; R.av = av; av.g.add(R.root);
  return R;
}
// 大廳、建角色畫面的人比例：縮成跟原本公仔差不多高（約 1.35 公尺），原本的鏡頭、名牌位置都不用改
export const PREVIEW_DS = 0.72;
export function makePlayer(look, kitArg, ds = PREVIEW_DS) { const av = makeToyAvatar(look, kitArg); attachReal(av, look, kitArg, ds); return av; }
export function syncReal(av, dt = 0) { if (av && av.real) driveReal(av, dt); }
export const realReadyOf = (av) => (av && av.real && av.real.ready) || Promise.resolve();
