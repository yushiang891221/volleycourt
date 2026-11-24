// 新角色（寫實身體＋VRoid 日系頭）的外觀代碼：不用 three.js，大廳、帳號、伺服器都能讀。
// 代碼：'r1' ＋ 9 碼（性別、膚色、臉型、髮型、髮色、瞳孔色、護膝、襪子、襪子顏色，各一個 36 進位字）＋ 2 碼背號，後面可接配件「~e＋4 碼」（跟舊代碼一樣）。
// 舊的公仔代碼（t2 開頭）不再當作有效外觀：玩家要重新建角色。
export const REAL_HEADS = {
  m: [
    { n: '碎瀏海', fn: '臉型', url: 'assets/models/vroid/hairsample_male.glb' },
    { n: '短平頭', url: 'assets/models/vroid/base_male.glb' },
    { n: '層次短髮', url: 'assets/models/vroid/sakurada_fumiriya.glb' },
  ],
  f: [
    { n: '鮑伯', fn: '臉型 1', url: 'assets/models/vroid/avatarsample_d.glb' },
    { n: '蓬鬆短髮', fn: '臉型 2', url: 'assets/models/vroid/avatarsample_e.glb' },
    { n: '長髮側馬尾', fn: '臉型 3', url: 'assets/models/vroid/avatarsample_g.glb' },
    { n: '齊瀏海長直髮', fn: '臉型 4', url: 'assets/models/vroid/sendagaya_shino.glb' },
    { n: '雙馬尾（貓耳）', fn: '臉型 5', url: 'assets/models/vroid/hairsample_female.glb' },
    { n: '短平頭', fn: '臉型 6', url: 'assets/models/vroid/base_female.glb' },
    { n: '短鮑伯', url: 'assets/models/vroid/avatarsample_d_darkness.glb' },   /* 精靈耳長在臉上 → 不當臉型，只用頭髮 */
    { n: '短髮（髮夾）', fn: '貓耳臉型', ears: 'HAIR_03', url: 'assets/models/vroid/avatarsample_f.glb' },
  ],
};
export const REAL_OPTIONS = {
  sex: ['男', '女'],
  skin: ['#FFE3CF', '#F7D2B4', '#EBB894', '#CF9468', '#A06A47', '#6E4632', '#F5D2BC', '#E3B08D'],
  hairColor: ['#1E1A18', '#3B2A20', '#5A3C28', '#8A5A35', '#B88A55', '#E0C38A', '#C9C9C9', '#A33A2E', '#2F4FA8', '#E46FA0'],
  eyeColor: ['#6B4A30', '#3E2A1E', '#8A6A3A', '#4A5A6A', '#3A6A9A', '#3E7A50', '#8A3A4A', '#5A3A7A'],
  knee: ['不戴', '黑色護膝', '白色護膝'],
  sock: ['不穿', '短襪', '中筒襪', '長襪'],
  sockColor: ['#F4F4F4', '#26262B', '#C2264B', '#1F3F8F', '#F07C24'],
};
export const REAL_KNEE_C = ['#26262B', '#26262B', '#F2F2EE'];
const R_KEYS = ['sex', 'skin', 'face', 'hair', 'hairColor', 'eyeColor', 'knee', 'sock', 'sockColor'];
export const REAL_DEFAULT = { sex: 0, skin: 1, face: 0, hair: 0, hairColor: 1, eyeColor: 0, knee: 1, sock: 1, sockColor: 0, num: 10 };
export const REAL_CODE_RE = /^r1[0-9a-z]{9}\d{2}(~e[0-9a-z]{4})?$/;
const realSx = (L) => (L.sex ? 'f' : 'm');
export const faceList = (sex) => REAL_HEADS[sex ? 'f' : 'm'].map((h, i) => [h.fn, i]).filter((x) => x[0]);   // [[名字, 頭的編號]]
export const hairList = (sex) => REAL_HEADS[sex ? 'f' : 'm'].map((h, i) => [h.n, i]);
export function normReal(L) {
  const o = { ...REAL_DEFAULT };
  if (L && typeof L === 'object') {
    o.sex = L.sex ? 1 : 0;
    for (const k of ['skin', 'hairColor', 'eyeColor', 'knee', 'sock', 'sockColor']) { const n = L[k] | 0; if (n >= 0 && n < REAL_OPTIONS[k].length) o[k] = n; }
    const heads = REAL_HEADS[realSx(o)], f = L.face | 0, h = L.hair | 0;
    o.face = heads[f] && heads[f].fn ? f : faceList(o.sex)[0][1];
    o.hair = heads[h] ? h : 0;
    const n = L.num | 0; o.num = n >= 0 && n <= 99 ? n : 10;
  }
  return o;
}
export function encodeReal(L) { const o = normReal(L); return 'r1' + R_KEYS.map((k) => o[k].toString(36)).join('') + String(o.num).padStart(2, '0'); }
export function decodeReal(code) {
  if (typeof code !== 'string' || !REAL_CODE_RE.test(code)) return null;
  const L = {}; R_KEYS.forEach((k, i) => (L[k] = parseInt(code[2 + i], 36))); L.num = +code.slice(11, 13);
  return normReal(L);
}
function realRng(seed) { let s = (seed * 2654435761) >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function randomReal(seed = 1) {
  const r = realRng(seed), pick = (n) => Math.floor(r() * n), sex = pick(2), faces = faceList(sex);
  return normReal({ sex, skin: pick(6), face: faces[pick(faces.length)][1], hair: pick(REAL_HEADS[sex ? 'f' : 'm'].length), hairColor: pick(6), eyeColor: pick(4), knee: pick(3), sock: 1 + pick(3), sockColor: r() < 0.7 ? 0 : pick(REAL_OPTIONS.sockColor.length), num: 1 + pick(99) });
}
// 給 js/avatar-real.js 的外觀（顏色值）；kit＝隊服 { body, trim, num, shorts }
export function realRenderLook(R, kit = {}) {
  const o = normReal(R);
  return { sx: realSx(o), skin: REAL_OPTIONS.skin[o.skin], hairC: REAL_OPTIONS.hairColor[o.hairColor], eyeC: REAL_OPTIONS.eyeColor[o.eyeColor], vhead: o.face, vhair: o.hair, no: o.num,
    jersey: kit.body || '#F4F4F4', trim: kit.trim || '#1F3F8F', num: kit.num || '#1F3F8F', shorts: kit.shorts || '#1F2A44',
    knee: o.knee > 0, kneeC: REAL_KNEE_C[o.knee], sock: o.sock, sockC: REAL_OPTIONS.sockColor[o.sockColor], eq: R.eq || {} };
}
