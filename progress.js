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
  wall: { name: '人牆', desc: '同一球之內攔網碰到球 5 次', title: '人牆' },
  server: { name: '發球機器', desc: '發球得分累計 50 分', title: '發球機器' },
  libero: { name: '自由人', desc: '完美接球累計 200 次', title: '守護神' },
  pro1: { name: '企聯挑戰者', desc: '贏一場企聯 AI 的比賽', title: '企聯挑戰者' },
  pro10: { name: '企聯殺手', desc: '贏 10 場企聯 AI 的比賽', title: '企聯殺手' },
  streak5: { name: '氣勢如虹', desc: '連贏 5 場', title: '氣勢如虹' },
};

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
