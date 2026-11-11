// WEB-010 玩家進度：等級、成就、稱號、表情的定義（網頁端顯示用；真正的計算在 Supabase 的 record_match）
export const EXP_PER_LEVEL = 500;   // 每等固定 500 經驗
export const TEAM_LEVEL = 10;       // Lv10 解鎖球隊
export const levelOf = (exp) => Math.floor((exp | 0) / EXP_PER_LEVEL) + 1;
export const expInLevel = (exp) => (exp | 0) % EXP_PER_LEVEL;

// 成就：代碼 → 名稱、說明、稱號
export const ACHIEVEMENTS = {
  cannon1: { name: '重砲手 I', desc: '扣球得分累計 100 分', title: '重砲手' },
  cannon2: { name: '重砲手 II', desc: '扣球得分累計 500 分', title: '重砲達人' },
  cannon3: { name: '重砲手 III', desc: '扣球得分累計 1000 分', title: '重砲之王' },
  setter: { name: '精準舉球', desc: '一局舉球 10 次以上、沒有連擊或持球', title: '精準舉球員' },
  wall: { name: '禁止通行', desc: '同一球之內攔網碰到球 5 次', title: '禁止通行' },
  server: { name: '發球機器', desc: '發球得分累計 50 分', title: '發球機器' },
  libero1: { name: '自由人 I', desc: '完美接球累計 100 次', title: '守護神' },
  libero2: { name: '自由人 II', desc: '完美接球累計 500 次', title: '地板守門員' },
  libero3: { name: '自由人 III', desc: '完美接球累計 1000 次', title: '護國山河' },
  pro1: { name: '企聯挑戰者', desc: '贏一場企聯 AI 的比賽', title: '企聯挑戰者' },
  pro10: { name: '企聯殺手', desc: '贏 10 場企聯 AI 的比賽', title: '企聯殺手' },
  streak5: { name: '氣勢如虹', desc: '連贏 5 場', title: '氣勢如虹' },
  cb1: { name: '絕處逢生 I', desc: '對方到局末點、我方還在 5 分以上落後，逆轉拿下這局（1 次）', title: '絕處逢生' },
  cb5: { name: '絕處逢生 II', desc: '逆轉拿下 5 局', title: '逆轉好手' },
  cb10: { name: '絕處逢生 III', desc: '逆轉拿下 10 局', title: '逆轉達人' },
  cb15: { name: '絕處逢生 IV', desc: '逆轉拿下 15 局', title: '不死鳥' },
  cb30: { name: '絕處逢生 V', desc: '逆轉拿下 30 局', title: '心態大師' },
  line1: { name: '直線魔人 I', desc: '扣直線得分累計 30 分', title: '直線殺手' },
  line2: { name: '直線魔人 II', desc: '扣直線得分累計 150 分', title: '直線魔人' },
  line3: { name: '直線魔人 III', desc: '扣直線得分累計 500 分', title: '直線之神' },
  sky1: { name: '天空打點 I', desc: '扣進對方三米線內得分累計 30 分', title: '天空打點' },
  sky2: { name: '天空打點 II', desc: '扣進對方三米線內得分累計 150 分', title: '巨人之力' },
  sky3: { name: '天空打點 III', desc: '扣進對方三米線內得分累計 500 分', title: '擎天巨人' },
  iron1: { name: '銅牆鐵壁 I', desc: '攔網得分累計 100 分', title: '銅牆' },
  iron2: { name: '銅牆鐵壁 II', desc: '攔網得分累計 500 分', title: '鐵壁' },
  iron3: { name: '銅牆鐵壁 III', desc: '攔網得分累計 1000 分', title: '銅牆鐵壁' },
};

// 成就中心：成就整理成「系列」，每個系列有一到多階（照順序）；每階給成就點數
export const ACH_POINTS = { cannon1: 10, cannon2: 30, cannon3: 60, setter: 30, wall: 30, server: 25, libero1: 15, libero2: 40, libero3: 80, pro1: 20, pro10: 60, streak5: 25, cb1: 20, cb5: 30, cb10: 45, cb15: 60, cb30: 100, iron1: 15, iron2: 40, iron3: 80, line1: 15, line2: 40, line3: 80, sky1: 15, sky2: 40, sky3: 80 };
export const ACH_CATS = [['all', '全部項目'], ['atk', '扣球進攻系列'], ['def', '防守與舉球系列'], ['pro', '企聯特訓系列'], ['mind', '心態系列'], ['special', '特殊成就']];
export const ACH_SERIES = [
  { id: 'cannon', cat: 'atk', icon: '🏐', name: '重砲手精神（扣球累計）', desc: '扣球得分從 100 分到 1000 分的重砲考驗', tiers: ['cannon1', 'cannon2', 'cannon3'] },
  { id: 'line', cat: 'atk', icon: '📏', name: '直線魔人（直線得分）', desc: '貼著邊線扣直線拿分', tiers: ['line1', 'line2', 'line3'] },
  { id: 'sky', cat: 'atk', icon: '☄️', name: '天空打點（三米內得分）', desc: '從高處往下壓，扣進對方三米線內', tiers: ['sky1', 'sky2', 'sky3'] },
  { id: 'server', cat: 'atk', icon: '🚀', name: '發球機器（發球得分）', desc: '用發球直接拿下 50 分', tiers: ['server'] },
  { id: 'libero', cat: 'def', icon: '🛡️', name: '守護神領域（完美接球）', desc: '一球一球接到位，打造後場鐵壁', tiers: ['libero1', 'libero2', 'libero3'] },
  { id: 'setter', cat: 'def', icon: '🎯', name: '場上指揮官（精準舉球）', desc: '一局舉 10 球以上都沒有連擊或持球', tiers: ['setter'] },
  { id: 'iron', cat: 'def', icon: '🛡', name: '銅牆鐵壁（攔網累計）', desc: '攔網得分從 100 分到 1000 分', tiers: ['iron1', 'iron2', 'iron3'] },
  { id: 'wall', cat: 'special', icon: '🧱', name: '禁止通行（連續攔網）', desc: '同一球之內攔網碰到球 5 次', tiers: ['wall'] },
  { id: 'pro', cat: 'pro', icon: '👑', name: '企聯特訓與魔性挑戰', desc: '擊敗最高難度的企聯 AI', tiers: ['pro1', 'pro10'] },
  { id: 'streak', cat: 'pro', icon: '🔥', name: '氣勢如虹（連勝）', desc: '開房比賽連續贏 5 場', tiers: ['streak5'] },
  { id: 'comeback', cat: 'mind', icon: '💪', name: '絕處逢生（逆轉勝）', desc: '對方到局末點、我方落後 5 分以上，最後逆轉拿下這局', tiers: ['cb1', 'cb5', 'cb10', 'cb15', 'cb30'] },
];
export const achPoints = (got = []) => got.reduce((n, k) => n + (ACH_POINTS[k] || 0), 0);
// 成就目前的進度（顯示用）：[現在, 目標]；一場內完成的成就沒有累計進度
export function achProgress(key, p = {}) {
  const w5 = (p.stats && p.stats.w && p.stats.w['5']) | 0;
  return { cannon1: [p.kills | 0, 100], cannon2: [p.kills | 0, 500], cannon3: [p.kills | 0, 1000], server: [p.aces | 0, 50], libero1: [p.perfects | 0, 100], libero2: [p.perfects | 0, 500], libero3: [p.perfects | 0, 1000], pro1: [w5, 1], pro10: [w5, 10], streak5: [p.streak | 0, 5], cb1: [p.comebacks | 0, 1], cb5: [p.comebacks | 0, 5], cb10: [p.comebacks | 0, 10], cb15: [p.comebacks | 0, 15], cb30: [p.comebacks | 0, 30], line1: [p.kills_line | 0, 30], line2: [p.kills_line | 0, 150], line3: [p.kills_line | 0, 500], sky1: [p.kills_steep | 0, 30], sky2: [p.kills_steep | 0, 150], sky3: [p.kills_steep | 0, 500], iron1: [p.blocks | 0, 100], iron2: [p.blocks | 0, 500], iron3: [p.blocks | 0, 1000] }[key] || null;
}
// 表情／動作（T 輪盤）：hi5、taunt 一開始就有；其他照等級或成就解鎖
export const EMOTES = {
  hi5: { name: '擊掌', icon: '🙌' },
  taunt: { name: '嘲諷', icon: '😜' },
  thumb: { name: '比讚', icon: '👍', lv: 2 },
  clap: { name: '拍手', icon: '👏', lv: 3 },
  cheer: { name: '歡呼', icon: '🎉', lv: 5 },
  fire: { name: '火力全開', icon: '🔥', ach: 'cannon1' },
  wall: { name: '推牆', icon: '🧱', ach: 'wall' },
  crown: { name: '王者', icon: '👑', ach: 'pro1' },
};
export const DEFAULT_WHEEL = ['hi5', 'taunt'];
export function emoteUnlocked(key, prog) {
  const e = EMOTES[key]; if (!e) return false;
  if (e.lv) return levelOf(prog?.exp) >= e.lv;
  if (e.ach) return !!prog?.achievements?.includes(e.ach);
  return true;
}

// 戰績分類（record_match 的 stats key）
export const STAT_KEYS = [['5', '企聯'], ['4', '校隊'], ['3', '高手'], ['h', '真人對戰']];

// 本機快取（離線、還沒建資料表時也能顯示上次的值；T 輪盤也存在這裡）
const KEY = 'vb.progress';
export function cachedProgress() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
export function cacheProgress(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} try { dispatchEvent(new Event('vb-progress-change')); } catch {} }
export function myWheel() { const p = cachedProgress(); const w = Array.isArray(p?.wheel) && p.wheel.length ? p.wheel : DEFAULT_WHEEL; return w.filter((k) => EMOTES[k]).slice(0, 4); }
export function myTitle() { const t = cachedProgress()?.title; return t && ACHIEVEMENTS[t] ? ACHIEVEMENTS[t].title : ''; }

// 帳號服務（沒登入、或資料表還沒建時回 null，不丟錯）
async function svc() { try { const { getAccountService, authMode } = await import('./auth.js'); if (authMode() !== 'account') return null; const s = await getAccountService(); return s && (await s.signedIn()) ? s : null; } catch { return null; } }
export async function loadProgress() {
  const s = await svc(); if (!s) return cachedProgress();
  try { const p = await s.progress(); if (p) cacheProgress(p); return p || cachedProgress(); } catch { return cachedProgress(); }
}
export async function recordMatch(m) { const s = await svc(); if (!s) return null; const r = await s.recordMatch(m); await loadProgress(); return r; }
export async function setTitle(key) { const s = await svc(); if (!s) throw new Error('要登入才能套用稱號'); await s.setTitle(key); await loadProgress(); }
export async function setWheel(w) {
  const p = cachedProgress() || {}; p.wheel = w; cacheProgress(p);
  const s = await svc(); if (s) { try { await s.setWheel(w); } catch { /* 資料表還沒建：先存在這台電腦 */ } }
}
export async function teamApi(op, arg) { const s = await svc(); if (!s) throw new Error('要登入才能使用球隊'); return s.team(op, arg); }
