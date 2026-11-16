// 個人球衣客製（J1，企劃見 docs/企劃-個人球衣客製.md）
// 這個檔只管「球衣設計」本身：代碼格式、色票、現成配色、18 款樣式、字體，以及把球衣畫到畫布上。
// 不依賴 three.js：avatar-toy.js 用 drawJerseyTorso 把設計畫進角色的球衣貼圖；設計器（J2）畫縮圖也用同一套。
//
// 畫布座標（drawJerseyTorso）：寬 w＝整圈身體，正面中心在 x＝w/2，背面中心在 x＝0 和 x＝w（左右接得起來），
// 兩側在 w/4、3w/4；高 h，y＝0 是領口、y＝h 是下擺。t＝1－y/h（下擺 0 → 領口 1）。

// ---------- 色票（28 色，設計器用格子點選） ----------
export const PALETTE = [
  '#FFFFFF', '#A3CBEB', '#C9A27A', '#EE8C7A', '#C8102E', '#141414', '#96192F',
  '#0B1838', '#FBD46D', '#003F96', '#F4BFD8', '#7B2D82', '#00A040', '#DDDDDD',
  '#8DC63F', '#E03C8A', '#E86A82', '#00A3E8', '#3C4A52', '#F7BE1F', '#E85618',
  '#4A2C10', '#A8B000', '#F08C1F', '#A6D5AE', '#9384BE', '#3A0A5A', '#00B08D',
];

// ---------- 樣式（運動球衣的花紋；cat 給設計器分類，sleeve：袖子用主色或花紋色） ----------
export const STYLES = [
  { name: '素面', cat: '紋理' },
  { name: '上深下淺', cat: '漸層' },
  { name: '側邊漸層', cat: '漸層' },
  { name: '斜向漸層', cat: '漸層' },
  { name: '點陣漸層', cat: '點陣' },
  { name: '斜帶點陣', cat: '點陣' },
  { name: '散點', cat: '點陣' },
  { name: '直條紋', cat: '線條' },
  { name: '細斜線', cat: '線條' },
  { name: '波浪', cat: '線條' },
  { name: '側邊條', cat: '線條' },
  { name: '肩膀撞色', cat: '色塊', sleeve: 'accent' },
  { name: '斜切色塊', cat: '色塊' },
  { name: 'V 字色塊', cat: '色塊' },
  { name: '幾何拼塊', cat: '色塊' },
  { name: '胸前橫帶', cat: '色塊' },
  { name: '迷彩點', cat: '紋理' },
  { name: '碎紋', cat: '紋理' },
];
// 袖型（球衣自己帶，穿上時角色換成這種袖子）；CUT_TOP＝對應到角色外觀 OPTIONS.top 的位置（無袖 0、短袖 1、長袖 2、短版 3）
export const CUTS = ['短袖', '長袖', '短版', '無袖'];
export const CUT_TOP = [1, 2, 3, 0];
export const NECKS = ['圓領', '交叉領'];
// 版位：第 3 個（左胸小字＋號碼）使用者說不要，拿掉了；代碼裡的位置保留（舊的代碼還讀得懂），舊的那種一律當成「大字＋號碼」
export const LAYOUTS = ['胸前號碼', '大字＋號碼', null, '直排字＋號碼'];

// ---------- 字體（Google Fonts，只下載用得到的字；latin 給英文和號碼、cjk 給中文） ----------
export const FONTS = [
  { name: '粗黑', cjk: 'Noto Sans TC', w: 900, latin: 'Anton' },
  { name: '窄黑', cjk: 'Noto Sans TC', w: 700, latin: 'Oswald' },
  { name: '運動斜體', cjk: 'Noto Sans TC', w: 900, latin: 'Anton', skew: -0.2 },
  { name: '圓體', cjk: 'Huninn', w: 400, latin: 'Russo One' },
  { name: '圓黑', cjk: 'Chiron GoRound TC', w: 700, latin: 'Teko' },
  { name: '明體', cjk: 'Noto Serif TC', w: 900, latin: 'Noto Serif TC' },
  { name: '楷書', cjk: 'LXGW WenKai TC', w: 700, latin: 'LXGW WenKai TC' },
  { name: '粗斜方', cjk: 'Noto Sans TC', w: 900, latin: 'Russo One', skew: -0.15 },
];

// ---------- 現成配色（每個樣式都可以套；數字是 PALETTE 的位置） ----------
export const PRESETS = [
  { name: '海洋藍', body: 9, accent: 17, trim: 7, ink: 0, shorts: 7 },
  { name: '酒紅', body: 6, accent: 4, trim: 5, ink: 0, shorts: 5 },
  { name: '純白', body: 0, accent: 13, trim: 9, ink: 9, shorts: 9 },
  { name: '深藍綠', body: 18, accent: 27, trim: 5, ink: 0, shorts: 18 },
  { name: '黑', body: 5, accent: 18, trim: 18, ink: 0, shorts: 5 },
  { name: '海軍金', body: 7, accent: 19, trim: 19, ink: 19, shorts: 7 },
];

export const TEXT_MAX = 8;
const { name: _presetName, ...PRESET0 } = PRESETS[0];
export const DEFAULT_DESIGN = Object.freeze({ cut: 0, neck: 0, style: 4, ...PRESET0, layout: 0, font: 0, backIcon: true, shortsNum: true, front: '', back: '' });

// 文字：去掉控制字元和分隔用的 ~，最多 8 個字
export function sanitizeText(s) {
  return [...String(s ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029~]/g, '').trim()].slice(0, TEXT_MAX).join('');
}
// 不雅字（球衣上的字會給別人看）：網頁先擋、資料庫 supabase/017_my_jerseys.sql 再擋一次（兩邊清單要一樣，tests/verify-jersey.cjs 會比對）
// 比對前去掉空白、標點、大小寫，所以「F u c k」「幹.」也擋得到
export const BAD_WORDS = ['幹你', '幹妳', '幹您', '操你', '操妳', '靠北', '靠杯', '機掰', '雞掰', '機八', '雞巴', '屌', '屄', '肏', '婊', '賤人', '王八', '白痴', '白癡', '智障', '去死', '他媽', '你媽', '妳媽', '三小', '淫', '援交', '尻槍',
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'nigger', 'nigga', 'asshole', 'porn', 'wtf', 'stfu'];
const squash = (t) => String(t ?? '').toLowerCase().replace(/[\s\p{P}\p{S}_]/gu, '');
export function badWord(t) { const s = squash(t); return BAD_WORDS.find((w) => s.includes(w)) || null; }
// 這件球衣能不能存：回傳要給玩家看的原因，沒問題回傳空字串
export function jerseyProblem(d) {
  const v = normalizeJersey(d);
  if (badWord(v.front)) return '正面字有不適合的字，請換一個';
  if (badWord(v.back)) return '背面名字有不適合的字，請換一個';
  return '';
}
export function applyPreset(d, i) { const p = PRESETS[i]; if (!p) return { ...d }; const { name, ...c } = p; return { ...d, ...c }; }

// ---------- 代碼：j1 ＋ 11 個 36 進位字（版型、領口、樣式、5 個顏色、版位、字體、旗標）＋ ~正面字 ~背面名字 ----------
const FIELDS = [['cut', CUTS.length], ['neck', NECKS.length], ['style', STYLES.length], ['body', PALETTE.length], ['accent', PALETTE.length], ['trim', PALETTE.length], ['ink', PALETTE.length], ['shorts', PALETTE.length], ['layout', LAYOUTS.length], ['font', FONTS.length], ['flags', 4]];
export function encodeJersey(d) {
  const v = normalizeJersey(d), flags = (v.backIcon ? 1 : 0) | (v.shortsNum ? 2 : 0);
  return 'j1' + FIELDS.map(([k]) => (k === 'flags' ? flags : v[k]).toString(36)).join('') + '~' + v.front + '~' + v.back;
}
export function decodeJersey(code) {
  const m = /^j1([0-9a-z]{11})~([^~]*)~([^~]*)$/.exec(String(code ?? ''));
  if (!m) return null;
  const d = {};
  for (let i = 0; i < FIELDS.length; i++) { const [k, n] = FIELDS[i], x = parseInt(m[1][i], 36); if (!(x < n)) return null; d[k] = x; }
  d.backIcon = !!(d.flags & 1); d.shortsNum = !!(d.flags & 2); delete d.flags;
  d.front = sanitizeText(m[2]); d.back = sanitizeText(m[3]);
  if (d.front !== m[2] || d.back !== m[3]) return null;
  return normalizeJersey(d);
}
// 任何東西進來都整理成合法設計（缺的用預設）
export function normalizeJersey(d) {
  const v = { ...DEFAULT_DESIGN };
  if (d && typeof d === 'object') for (const [k, n] of FIELDS) if (k !== 'flags' && Number.isInteger(d[k]) && d[k] >= 0 && d[k] < n) v[k] = d[k];
  if (d && typeof d.backIcon === 'boolean') v.backIcon = d.backIcon;
  if (d && typeof d.shortsNum === 'boolean') v.shortsNum = d.shortsNum;
  v.front = sanitizeText(d?.front); v.back = sanitizeText(d?.back);
  if (!LAYOUTS[v.layout]) v.layout = 1;
  v.neck = 0;   // 使用者決定全部都是圓領（交叉領拿掉；代碼裡的位置保留，舊的一律當圓領）
  return v;
}
// 實際顏色（號碼外框自動挑對比色）
export function jerseyColors(d) {
  const v = normalizeJersey(d), c = k => PALETTE[v[k]];
  const ink = c('ink');
  return { body: c('body'), accent: c('accent'), trim: c('trim'), ink, shorts: c('shorts'), inkEdge: luma(ink) > 0.6 ? '#141414' : '#FFFFFF', sleeve: STYLES[v.style].sleeve === 'accent' ? c('accent') : c('body') };
}
function luma(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }

// ---------- 字體下載（只抓這件球衣用到的字） ----------
const fontLinks = new Map(), fontReady = new Set();
const fontKey = (d) => { const f = FONTS[normalizeJersey(d).font]; return f.name + '|' + jerseyText(d); };
const jerseyText = (d) => { const v = normalizeJersey(d); return [...new Set(v.front + v.back + '0123456789')].join(''); };
export function jerseyFontsReady(d) { return fontReady.has(fontKey(d)); }
export function ensureJerseyFonts(d) {
  const key = fontKey(d);
  if (fontReady.has(key) || typeof document === 'undefined' || !document.fonts) return Promise.resolve(true);
  if (fontLinks.has(key)) return fontLinks.get(key);
  const f = FONTS[normalizeJersey(d).font], text = jerseyText(d);
  const fam = (name, w) => 'family=' + name.replace(/ /g, '+') + (w ? ':wght@' + w : '');
  const latinW = ['Anton', 'Russo One'].includes(f.latin) ? 0 : f.latin === f.cjk ? f.w : 700;
  const url = 'https://fonts.googleapis.com/css2?' + [fam(f.cjk, f.w), f.latin !== f.cjk ? fam(f.latin, latinW) : ''].filter(Boolean).join('&') + '&text=' + encodeURIComponent(text) + '&display=swap';
  const p = new Promise((ok) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url;
    l.onload = () => ok(); l.onerror = () => ok(); document.head.append(l);
  }).then(() => Promise.race([
    Promise.all([document.fonts.load(`${f.w} 64px "${f.cjk}"`, text), document.fonts.load(`64px "${f.latin}"`, text)]),
    new Promise((r) => setTimeout(r, 5000)),
  ])).catch(() => {}).then(() => { fontReady.add(key); return true; });
  fontLinks.set(key, p); return p;
}
const fontCss = (f, size) => `${f.w} ${size}px "${f.latin}", "${f.cjk}", "Noto Sans TC", sans-serif`;

// ---------- 畫圖小工具 ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PANELS = [0, 0.5, 1];   // 背面（左半）、正面、背面（右半）中心，乘 w
// 對每一片（正面、背面）畫：fn(cx, front)；先把範圍限制在那一片，畫超出去也不會蓋到別片
function eachPanel(x, w, h, fn) {
  for (const p of PANELS) { x.save(); x.beginPath(); x.rect(p * w - w * 0.25, 0, w * 0.5, h); x.clip(); fn(p * w, p === 0.5); x.restore(); }
}
function alpha(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

// 18 款花紋：c＝顏色，r＝固定亂數（同一款每次畫都一樣）
const PATTERNS = [
  () => {},
  (x, w, h, c) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, c.accent); g.addColorStop(0.75, alpha(c.accent, 0)); x.fillStyle = g; x.fillRect(0, 0, w, h); },
  (x, w, h, c) => { const g = x.createLinearGradient(0, 0, w, 0); for (const [s, a] of [[0, 0], [0.25, 1], [0.5, 0], [0.75, 1], [1, 0]]) g.addColorStop(s, alpha(c.accent, a)); x.fillStyle = g; x.fillRect(0, 0, w, h); },
  (x, w, h, c) => eachPanel(x, w, h, (cx) => { const g = x.createLinearGradient(cx - w * 0.25, h, cx + w * 0.25, 0); g.addColorStop(0, c.accent); g.addColorStop(0.7, alpha(c.accent, 0)); x.fillStyle = g; x.fillRect(cx - w * 0.25, 0, w * 0.5, h); }),
  (x, w, h, c) => halftone(x, w, h, c, (u, t) => Math.max(0.12, 1 - t * 1.15)),
  (x, w, h, c) => halftone(x, w, h, c, (u, t) => { const d = Math.abs(u * 1.6 + t - 0.75); return Math.max(0.08, 1 - d * 3.2); }),
  (x, w, h, c, r) => { for (let i = 0; i < 150; i++) { const rad = w * (0.003 + r() * 0.012); x.fillStyle = alpha(r() < 0.75 ? c.accent : c.trim, 0.55 + r() * 0.4); x.beginPath(); x.arc(r() * w, r() * h, rad, 0, 7); x.fill(); } },
  (x, w, h, c) => { x.fillStyle = c.accent; for (let px = 0; px < w; px += w * 0.07) x.fillRect(px, 0, w * 0.024, h); },
  (x, w, h, c) => { x.strokeStyle = alpha(c.accent, 0.85); x.lineWidth = w * 0.006; for (let s = -h; s < w; s += w * 0.028) { x.beginPath(); x.moveTo(s, h); x.lineTo(s + h, 0); x.stroke(); } },
  (x, w, h, c) => { x.lineWidth = h * 0.045; for (const [y0, col] of [[0.55, c.accent], [0.68, c.trim], [0.81, c.accent]]) { x.strokeStyle = col; x.beginPath(); for (let px = 0; px <= w; px += w / 120) { const y = h * y0 + Math.sin(px / w * Math.PI * 12) * h * 0.035; px ? x.lineTo(px, y) : x.moveTo(px, y); } x.stroke(); } },
  (x, w, h, c) => { for (const u of [0.25, 0.75]) { x.fillStyle = '#FFFFFF'; x.fillRect(u * w - w * 0.05, 0, w * 0.1, h); x.fillStyle = c.accent; x.fillRect(u * w - w * 0.04, 0, w * 0.08, h); x.fillStyle = c.trim; x.fillRect(u * w - w * 0.012, 0, w * 0.024, h); } },
  (x, w, h, c) => eachPanel(x, w, h, (cx) => { x.fillStyle = c.accent; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * w * 0.06, 0); x.lineTo(cx + s * w * 0.25, 0); x.lineTo(cx + s * w * 0.25, h * 0.42); x.lineTo(cx + s * w * 0.19, h * 0.42); x.closePath(); x.fill(); } x.strokeStyle = c.trim; x.lineWidth = w * 0.006; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * w * 0.06, 0); x.lineTo(cx + s * w * 0.19, h * 0.42); x.stroke(); } }),
  (x, w, h, c) => eachPanel(x, w, h, (cx) => { x.fillStyle = c.accent; x.beginPath(); x.moveTo(cx - w * 0.25, h * 0.3); x.lineTo(cx + w * 0.25, h * 1.02); x.lineTo(cx - w * 0.25, h * 1.02); x.closePath(); x.fill(); x.strokeStyle = c.trim; x.lineWidth = w * 0.012; x.beginPath(); x.moveTo(cx - w * 0.25, h * 0.22); x.lineTo(cx + w * 0.25, h * 0.94); x.stroke(); }),
  (x, w, h, c) => eachPanel(x, w, h, (cx) => { x.lineJoin = 'miter'; for (const [lw, col] of [[h * 0.2, c.trim], [h * 0.15, c.accent]]) { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.moveTo(cx - w * 0.3, h * 0.12); x.lineTo(cx, h * 0.5); x.lineTo(cx + w * 0.3, h * 0.12); x.stroke(); } }),
  (x, w, h, c, r) => { for (let i = 0; i < 40; i++) { const bw = w * (0.03 + r() * 0.09), bh = h * (0.05 + r() * 0.2); x.fillStyle = alpha(r() < 0.65 ? c.accent : c.trim, 0.55 + r() * 0.45); x.fillRect(Math.floor(r() * 24) / 24 * w, Math.floor(r() * 12) / 12 * h, bw, bh); } },
  (x, w, h, c) => { x.fillStyle = c.trim; x.fillRect(0, h * 0.27, w, h * 0.19); x.fillStyle = c.accent; x.fillRect(0, h * 0.29, w, h * 0.15); },
  (x, w, h, c, r) => { for (let i = 0; i < 110; i++) { x.fillStyle = alpha([c.accent, c.trim, c.accent][i % 3], 0.85); x.beginPath(); x.ellipse(r() * w, r() * h, w * (0.012 + r() * 0.03), h * (0.02 + r() * 0.05), r() * 3, 0, 7); x.fill(); } },
  (x, w, h, c, r) => { for (let i = 0; i < 90; i++) { const px = r() * w, py = h * (0.35 + r() * 0.7), s = w * (0.015 + r() * 0.04); x.fillStyle = alpha(r() < 0.7 ? c.accent : c.trim, 0.45 + r() * 0.5); x.beginPath(); x.moveTo(px, py); x.lineTo(px + s, py - s * (0.4 + r())); x.lineTo(px + s * (0.3 + r()), py + s * 0.6); x.closePath(); x.fill(); } },
];
// 點陣：size(u, t) 回傳 0～1，u 是離那一片中心的距離（-0.5～0.5，往右正），t 是高度比例
function halftone(x, w, h, c, size) {
  const step = w * 0.016;
  x.fillStyle = alpha(c.accent, 0.9);
  for (let py = step / 2; py < h; py += step) for (let px = step / 2; px < w; px += step) {
    const pu = ((px / w + 0.25) % 0.5) - 0.25, s = size(pu * 2, 1 - py / h);   // 每一片（正面、背面）用一樣的花紋
    if (s <= 0.05) continue;
    x.beginPath(); x.arc(px, py, step * 0.48 * s, 0, 7); x.fill();
  }
}

// 文字：縮到放得下（maxW）；斜體字型用歪斜變形
function drawText(x, f, txt, cx, cy, size, maxW, fill, edge) {
  if (!txt) return;
  x.save(); x.font = fontCss(f, size); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  const tw = x.measureText(txt).width || 1, k = Math.min(1, maxW / tw);
  x.translate(cx, cy); if (f.skew) x.transform(1, 0, f.skew, 1, 0, 0); x.scale(k, 1);
  if (edge) { x.lineWidth = size * 0.1; x.strokeStyle = edge; x.strokeText(txt, 0, 0); }
  x.fillStyle = fill; x.fillText(txt, 0, 0); x.restore();
}
function drawNum(x, f, num, cx, cy, size, c) { drawText(x, f, String(num), cx, cy, size, size * 1.6, c.ink, c.inkEdge); }
function drawIcon(x, cx, cy, r, c) {   // 背後領口下的小排球記號
  x.save(); x.strokeStyle = c.ink; x.lineWidth = r * 0.22; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
  x.beginPath(); x.moveTo(cx - r, cy); x.quadraticCurveTo(cx, cy - r * 0.6, cx + r, cy); x.moveTo(cx, cy - r); x.quadraticCurveTo(cx - r * 0.5, cy, cx, cy + r); x.stroke(); x.restore();
}

// 整件身體：底色 → 花紋 → 交叉領 → 正面字與號碼 → 背面記號、名字、號碼
// opt：{ frontNumT, frontNumSize, backNumT, backNumSize }（大小是 w 的比例）
export function drawJerseyTorso(x, w, h, d, num, opt = {}) {
  const v = normalizeJersey(d), c = jerseyColors(v), f = FONTS[v.font];
  x.fillStyle = c.body; x.fillRect(0, 0, w, h);
  x.save(); PATTERNS[v.style](x, w, h, c, rng(0x9E37 + v.style * 7919)); x.restore();
  const Y = (t) => h * (1 - t);
  if (v.neck === 1) {   // 交叉領：正面領口兩條邊條交疊成 V（角色頭大，衣服最上面會被下巴擋住，所以 V 從 t＝0.95 畫到 0.7）
    const top = Y(0.95), tip = Y(0.7), cx0 = w * 0.5;
    x.save(); x.lineCap = 'butt';
    x.fillStyle = c.body; x.beginPath(); x.moveTo(cx0 - w * 0.06, top); x.lineTo(cx0, tip); x.lineTo(cx0 + w * 0.06, top); x.closePath(); x.fill();
    for (const s of [-1, 1]) {   // 先畫右邊、再畫左邊蓋上去，各帶一條細白邊，看起來像交疊
      for (const [col, lw] of [['#FFFFFF', 0.03], [c.trim, 0.022]]) { x.strokeStyle = col; x.lineWidth = w * lw; x.beginPath(); x.moveTo(cx0 + s * w * 0.075, top); x.lineTo(cx0 - s * w * 0.018, tip + h * 0.02); x.stroke(); }
    }
    x.restore();
  }
  const ny = v.neck === 1 ? 0.07 : 0;   // 交叉領：正面的字和號碼往下移，不要壓到 V 領
  // 正面的字和號碼：t 越大越靠近領口（角色頭大，太高會貼在領口下面），胸口中間大約 t＝0.45～0.65
  const fn = opt.frontNumSize ?? 0.13, ft = opt.frontNumT ?? 0.57, bn = opt.backNumSize ?? 0.21, bt = opt.backNumT ?? 0.6, cx = w * 0.5;
  if (v.layout === 0 || !v.front) drawNum(x, f, num, cx, Y(ft - ny), w * fn, c);
  else if (v.layout === 1) { drawText(x, f, v.front, cx, Y(0.66 - ny), w * 0.07, w * 0.3, c.ink, c.inkEdge); drawNum(x, f, num, cx, Y(0.47 - ny), w * fn * 0.85, c); }
  else { const ch = [...v.front], s = Math.min(w * 0.055, h * 0.55 / ch.length); ch.forEach((t, i) => drawText(x, f, t, cx + w * 0.11, Y(0.74 - ny) + s * (i + 0.5), s, s * 1.1, c.ink, c.inkEdge)); drawNum(x, f, num, cx - w * 0.07, Y(0.63 - ny), w * 0.08, c); }
  for (const bx of [0, w]) {   // 背面在左右兩端各畫一次（接縫兩邊各一半）
    if (v.backIcon) drawIcon(x, bx, Y(0.88), w * 0.014, c);
    if (v.back) drawText(x, f, v.back, bx, Y(0.745), w * 0.065, w * 0.24, c.ink, c.inkEdge);   // 名字放低一點：太高會被頭髮擋住
    drawNum(x, f, num, bx, Y(v.back ? bt - 0.1 : bt), w * (v.back ? bn * 0.9 : bn), c);
  }
  return c;
}
