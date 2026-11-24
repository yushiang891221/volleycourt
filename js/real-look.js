// 新角色（寫實身體＋VRoid 日系頭）的外觀代碼：不用 three.js，大廳、帳號、伺服器都能讀。
// 代碼：'r1' ＋ 9 碼（性別、膚色、臉型、髮型、髮色、瞳孔色、護膝、襪子、襪子顏色，各一個 36 進位字）＋ 2 碼背號；'r2' 再多三碼（眉毛顏色、眼型、眉型）（2026-11-25 起新存的都是 r2），後面可接配件「~e＋4 碼」（跟舊代碼一樣）。
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
// 臉型＝臉本身的形狀（用哪顆頭的臉＋下巴寬窄/長短、臉頰、眼距、眼睛高低），不含表情；眼型、眉型另外選。
//   jaw 下巴寬窄（−窄 +寬）、chin 下巴長短（+長）、cheek 臉頰寬、eg 眼距（+開）、ey 眼睛高低（+高），單位：比例／VRoid 公尺
// 編號固定不能改順序（存在玩家外觀代碼裡）：舊代碼的女生 0～5、7＝原本那幾個頭；6 是精靈耳那顆（不當臉）
export const REAL_FACES = {
  m: [
    { n: '標準', head: 0 },
    { n: '方正臉', head: 1, p: { jaw: 0.22, cheek: 0.05 } },
    { n: '少年臉', head: 2, p: { jaw: -0.1, chin: -0.16, ey: -0.003 } },
    { n: '瘦長臉', head: 0, p: { jaw: -0.2, chin: 0.18, cheek: -0.05 } },
    { n: '圓臉', head: 1, p: { jaw: 0.18, chin: -0.2, cheek: 0.1 } },
    { n: '尖下巴', head: 2, p: { jaw: -0.32, chin: 0.13 } },
    { n: '國字臉', head: 0, p: { jaw: 0.32, chin: 0.05, cheek: 0.06 } },
    { n: '眼距寬', head: 1, p: { eg: 0.009, chin: -0.06 } },
    { n: '娃娃臉', head: 2, p: { chin: -0.24, ey: -0.008, eg: 0.004, cheek: 0.08 } },
    { n: '成熟臉', head: 0, p: { chin: 0.14, ey: 0.004, eg: -0.004, jaw: -0.08 } },
  ],
  f: [
    { n: '標準', head: 0 },
    { n: '圓臉', head: 1, p: { jaw: 0.18, chin: -0.2, cheek: 0.1 } },
    { n: '瓜子臉', head: 2, p: { jaw: -0.26, chin: 0.14 } },
    { n: '鵝蛋臉', head: 3, p: { jaw: -0.08, chin: 0.08, cheek: 0.05 } },
    { n: '娃娃臉', head: 4, p: { chin: -0.24, ey: -0.008, eg: 0.004, cheek: 0.08 } },
    { n: '長臉', head: 5, p: { jaw: -0.1, chin: 0.18, ey: 0.003 } },
    null,
    { n: '貓耳臉型', head: 7, p: { chin: -0.08 } },
    { n: '尖下巴', head: 0, p: { jaw: -0.34, chin: 0.13 } },
    { n: '方臉', head: 3, p: { jaw: 0.3, cheek: 0.05 } },
    { n: '眼距寬', head: 1, p: { eg: 0.009, chin: -0.06 } },
    { n: '成熟臉', head: 5, p: { eg: -0.004, chin: 0.14, jaw: -0.12, ey: 0.004 } },
  ],
};
// 眼型（男女共用）：src＝用哪顆頭的眼睛（眼白、瞳孔、眼線、睫毛一整組；null＝跟臉型那顆）＋形狀
//   es 大小、ew/eh 寬/高、et 眼尾（+上揚 −下垂）
export const REAL_EYES = [
  { n: '跟臉型', src: null },
  { n: '清秀眼', src: 'm0' }, { n: '平靜眼', src: 'm1' }, { n: '少年眼', src: 'm2' },
  { n: '圓亮眼', src: 'f0' }, { n: '水汪汪', src: 'f1' }, { n: '細緻眼', src: 'f2' }, { n: '溫婉眼', src: 'f3' },
  { n: '大眼睛', src: 'f4' }, { n: '簡約眼', src: 'f5' }, { n: '神秘眼', src: 'f6' }, { n: '貓咪眼', src: 'f7' },
  { n: '鳳眼', src: 'm0', p: { et: 0.22, eh: 0.78, ew: 1.06 } }, { n: '下垂眼', src: 'f3', p: { et: -0.2 } },
  { n: '細長眼', src: 'f5', p: { eh: 0.7, ew: 1.12 } }, { n: '大圓眼', src: 'f1', p: { es: 1.16, eh: 1.12 } },
  { n: '銳利眼', src: 'm1', p: { et: 0.18, eh: 0.75 } }, { n: '杏眼', src: 'f0', p: { et: 0.1, ew: 1.06, eh: 0.92 } },
];
// 眉型（男女共用）：src＝用哪顆頭的眉毛（null＝跟臉型那顆）＋ bh 粗細、bl 長短、bt 眉尾（+上揚）、by 高低、mo 眉毛形狀鍵
export const REAL_BROWS = [
  { n: '跟臉型', src: null },
  { n: '自然眉', src: 'm0' }, { n: '平直眉', src: 'm1' }, { n: '少年眉', src: 'm2' }, { n: '柔和眉', src: 'f0' },
  { n: '彎月眉', src: 'f2' }, { n: '細柳眉', src: 'f3' }, { n: '短眉', src: 'f5', p: { bl: 0.75 } },
  { n: '粗眉', src: 'm1', p: { bh: 1.8 } }, { n: '細眉', src: 'f0', p: { bh: 0.72 } }, { n: '上揚眉', src: 'm0', p: { bt: 0.22 } },
  { n: '劍眉', src: 'm1', p: { bh: 1.5, bl: 1.1 }, mo: { BRW_Angry: 0.6 } }, { n: '八字眉', src: 'f3', p: { bt: -0.28, bh: 1.15 }, mo: { BRW_Sorrow: 0.7 } },
  { n: '高挑眉', src: 'f2', p: { by: 0.004 }, mo: { BRW_Surprised: 0.4 } }, { n: '長眉', src: 'm2', p: { bl: 1.2 } },
];
// 髮型：a＝整頂用某個頭的頭髮；f＋b＝前面瀏海用 f 那頂、後面用 b 那頂（混搭）。'm0'＝REAL_HEADS.m[0]
// 編號固定不能改順序：前面幾個＝舊代碼的髮型（男 0～2、女 0～7）
export const REAL_HAIRS = {
  m: [
    { n: '碎瀏海', a: 'm0' }, { n: '短平頭', a: 'm1' }, { n: '層次短髮', a: 'm2' },
    { n: '鮑伯', a: 'f0' }, { n: '蓬鬆短髮', a: 'f1' }, { n: '短鮑伯', a: 'f6' }, { n: '短髮（髮夾）', a: 'f7' },
    { n: '斜瀏海短髮', f: 'f2', b: 'm1' }, { n: '香菇頭', f: 'f1', b: 'm1' },
    { n: '旁分短髮', f: 'f7', b: 'm1' }, { n: '瀏海短髮', f: 'f0', b: 'm1' }, { n: '長直髮', a: 'f3' }, { n: '綁馬尾', a: 'f2' },
    { n: '齊瀏海鮑伯', f: 'f3', b: 'f0' }, { n: '斜瀏海鮑伯', f: 'f2', b: 'f6' },
  ],
  f: [
    { n: '鮑伯', a: 'f0' }, { n: '蓬鬆短髮', a: 'f1' }, { n: '長髮側馬尾', a: 'f2' }, { n: '齊瀏海長直髮', a: 'f3' },
    { n: '雙馬尾（貓耳）', a: 'f4' }, { n: '短平頭', a: 'f5' }, { n: '短鮑伯', a: 'f6' }, { n: '短髮（髮夾）', a: 'f7' },
    { n: '碎瀏海', a: 'm0' }, { n: '層次短髮', a: 'm2' }, { n: '齊瀏海鮑伯', f: 'f3', b: 'f0' }, { n: '齊瀏海側馬尾', f: 'f3', b: 'f2' },
    { n: '蓬鬆瀏海長直髮', f: 'f1', b: 'f3' }, { n: '鮑伯瀏海雙馬尾', f: 'f0', b: 'f4' }, { n: '鮑伯瀏海長直髮', f: 'f0', b: 'f3' },
    { n: '齊瀏海雙馬尾', f: 'f3', b: 'f4' }, { n: '蓬鬆瀏海側馬尾', f: 'f1', b: 'f2' }, { n: '旁分長直髮', f: 'f7', b: 'f3' },
    { n: '旁分雙馬尾', f: 'f7', b: 'f4' },
    { n: '斜瀏海長直髮', f: 'f2', b: 'f3' }, { n: '雙馬尾瀏海鮑伯', f: 'f4', b: 'f0' }, { n: '旁分側馬尾', f: 'f7', b: 'f2' },
    { n: '斜瀏海短髮', f: 'f2', b: 'f5' }, { n: '香菇頭', f: 'f1', b: 'f5' },
  ],
};
export const headRef = (r) => REAL_HEADS[r[0]][+r.slice(1)];
export const REAL_OPTIONS = {
  sex: ['男', '女'],
  skin: ['#FFE3CF', '#F7D2B4', '#EBB894', '#CF9468', '#A06A47', '#6E4632', '#F5D2BC', '#E3B08D'],
  hairColor: ['#1E1A18', '#3B2A20', '#5A3C28', '#8A5A35', '#B88A55', '#E0C38A', '#C9C9C9', '#A33A2E', '#2F4FA8', '#E46FA0'],
  eyeColor: ['#6B4A30', '#3E2A1E', '#8A6A3A', '#4A5A6A', '#3A6A9A', '#3E7A50', '#8A3A4A', '#5A3A7A'],
  knee: ['不戴', '黑色護膝', '白色護膝'],
  sock: ['不穿', '短襪', '中筒襪', '長襪'],
  sockColor: ['#F4F4F4', '#26262B', '#C2264B', '#1F3F8F', '#F07C24'],
};
// 眉毛顏色：0＝跟髮色一樣，1 起＝髮色表的第 n−1 個
REAL_OPTIONS.browColor = [null, ...REAL_OPTIONS.hairColor];
export const REAL_KNEE_C = ['#26262B', '#26262B', '#F2F2EE'];
const R_KEYS = ['sex', 'skin', 'face', 'hair', 'hairColor', 'eyeColor', 'knee', 'sock', 'sockColor'];   // r1 的 9 碼
const R2_KEYS = [...R_KEYS, 'browColor', 'eye', 'brow'];   // r2 多三碼：眉毛顏色、眼型、眉型
export const REAL_DEFAULT = { sex: 0, skin: 1, face: 0, hair: 0, hairColor: 1, eyeColor: 0, knee: 1, sock: 1, sockColor: 0, browColor: 0, eye: 0, brow: 0, num: 10 };
export const REAL_CODE_RE = /^(r1[0-9a-z]{9}|r2[0-9a-z]{12})\d{2}(~e[0-9a-z]{4})?$/;
export const REAL_BASE_RE = /^(r1[0-9a-z]{9}|r2[0-9a-z]{12})\d{2}$/;   // 不含配件
export const realBaseLen = (code) => (code[1] === '2' ? 16 : 13);
// r2 → r1（拿掉眉毛顏色、眼型、眉型）：帳號資料庫還沒執行 029 SQL 時先存這個，外觀其他部分一樣
export const realToR1 = (code) => (typeof code === 'string' && /^r2[0-9a-z]{12}\d{2}$/.test(code) ? 'r1' + code.slice(2, 11) + code.slice(14, 16) : code);
const realSx = (L) => (L.sex ? 'f' : 'm');
export const faceList = (sex) => REAL_FACES[sex ? 'f' : 'm'].map((h, i) => [h && h.n, i]).filter((x) => x[0]);   // [[名字, 臉型編號]]
export const hairList = (sex) => REAL_HAIRS[sex ? 'f' : 'm'].map((h, i) => [h.n, i]);
export const eyeList = () => REAL_EYES.map((h, i) => [h.n, i]);
export const browList = () => REAL_BROWS.map((h, i) => [h.n, i]);
export function normReal(L) {
  const o = { ...REAL_DEFAULT };
  if (L && typeof L === 'object') {
    o.sex = L.sex ? 1 : 0;
    for (const k of ['skin', 'hairColor', 'eyeColor', 'knee', 'sock', 'sockColor', 'browColor']) { const n = L[k] | 0; if (n >= 0 && n < REAL_OPTIONS[k].length) o[k] = n; }
    { const e = L.eye | 0, b = L.brow | 0; o.eye = REAL_EYES[e] ? e : 0; o.brow = REAL_BROWS[b] ? b : 0; }
    const sx = realSx(o), f = L.face | 0, h = L.hair | 0;
    o.face = REAL_FACES[sx][f] ? f : faceList(o.sex)[0][1];
    o.hair = REAL_HAIRS[sx][h] ? h : 0;
    const n = L.num | 0; o.num = n >= 0 && n <= 99 ? n : 10;
  }
  return o;
}
// 一律寫成 r2（多眉毛顏色）；資料庫要先執行 supabase/029_brow_color.sql 才收得下
export function encodeReal(L) { const o = normReal(L); return 'r2' + R2_KEYS.map((k) => o[k].toString(36)).join('') + String(o.num).padStart(2, '0'); }
export function decodeReal(code) {
  if (typeof code !== 'string' || !REAL_CODE_RE.test(code)) return null;
  const keys = code[1] === '2' ? R2_KEYS : R_KEYS, L = {}; keys.forEach((k, i) => (L[k] = parseInt(code[2 + i], 36))); L.num = +code.slice(2 + keys.length, 4 + keys.length);
  return normReal(L);
}
function realRng(seed) { let s = (seed * 2654435761) >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function randomReal(seed = 1) {
  const r = realRng(seed), pick = (n) => Math.floor(r() * n), sex = pick(2), faces = faceList(sex);
  return normReal({ sex, skin: pick(6), face: faces[pick(faces.length)][1], hair: pick(REAL_HAIRS[sex ? 'f' : 'm'].length), hairColor: pick(6), eyeColor: pick(4), eye: pick(REAL_EYES.length), brow: pick(REAL_BROWS.length), knee: pick(3), sock: 1 + pick(3), sockColor: r() < 0.7 ? 0 : pick(REAL_OPTIONS.sockColor.length), num: 1 + pick(99) });
}
// 給 js/avatar-real.js 的外觀（顏色值）；kit＝隊服 { body, trim, num, shorts }
export function realRenderLook(R, kit = {}) {
  const o = normReal(R);
  return { sx: realSx(o), skin: REAL_OPTIONS.skin[o.skin], hairC: REAL_OPTIONS.hairColor[o.hairColor], browC: REAL_OPTIONS.browColor[o.browColor] || REAL_OPTIONS.hairColor[o.hairColor], eyeC: REAL_OPTIONS.eyeColor[o.eyeColor], vhead: o.face, vhair: o.hair, veye: o.eye, vbrow: o.brow, no: o.num,
    jersey: kit.body || '#F4F4F4', trim: kit.trim || '#1F3F8F', num: kit.num || '#1F3F8F', shorts: kit.shorts || '#1F2A44',
    knee: o.knee > 0, kneeC: REAL_KNEE_C[o.knee], sock: o.sock, sockC: REAL_OPTIONS.sockColor[o.sockColor], eq: R.eq || {} };
}
