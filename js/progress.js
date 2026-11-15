// WEB-010 玩家進度：等級、成就、稱號、表情的定義（網頁端顯示用；真正的計算在 Supabase 的 record_match）
export const EXP_PER_LEVEL = 500;   // 每等固定 500 經驗
export const TEAM_LEVEL = 10;       // Lv10 解鎖球隊
export const levelOf = (exp) => Math.floor((exp | 0) / EXP_PER_LEVEL) + 1;
export const expInLevel = (exp) => (exp | 0) % EXP_PER_LEVEL;

// 成就：代碼 → 名稱、說明、稱號
export const ACHIEVEMENTS = {
  tutorial: { name: '完成新手教學', desc: '完成移動、接球、舉球、攻擊、發球與攔網六段教學' },
  langzi: { name: '花鼓燈浪子', desc: '用浪子踢球把地上的球踢飛', title: '花鼓燈浪子', hidden: true },
  oh10: { name: '初階攻擊手', desc: '在攻擊手（大砲）位置贏 10 場', title: '初階攻擊手' },
  oh100: { name: '進階攻擊手', desc: '在攻擊手（大砲）位置贏 100 場', title: '進階攻擊手' },
  oh500: { name: '優良攻擊手', desc: '在攻擊手（大砲）位置贏 500 場', title: '優良攻擊手' },
  oh1000: { name: '最佳攻擊手', desc: '在攻擊手（大砲）位置贏 1000 場', title: '最佳攻擊手' },
  s10: { name: '初階舉球員', desc: '在舉球員位置贏 10 場', title: '初階舉球員' },
  s100: { name: '進階舉球員', desc: '在舉球員位置贏 100 場', title: '進階舉球員' },
  s500: { name: '優良舉球員', desc: '在舉球員位置贏 500 場', title: '優良舉球員' },
  s1000: { name: '最佳舉球員', desc: '在舉球員位置贏 1000 場', title: '最佳舉球員' },
  mb10: { name: '初階中間手', desc: '在中間手位置贏 10 場', title: '初階中間手' },
  mb100: { name: '進階中間手', desc: '在中間手位置贏 100 場', title: '進階中間手' },
  mb500: { name: '優良中間手', desc: '在中間手位置贏 500 場', title: '優良中間手' },
  mb1000: { name: '最佳中間手', desc: '在中間手位置贏 1000 場', title: '最佳中間手' },
  opp10: { name: '初階對角球員', desc: '在對角球員（舉對）位置贏 10 場', title: '初階對角球員' },
  opp100: { name: '進階對角球員', desc: '在對角球員（舉對）位置贏 100 場', title: '進階對角球員' },
  opp500: { name: '優良對角球員', desc: '在對角球員（舉對）位置贏 500 場', title: '優良對角球員' },
  opp1000: { name: '最佳對角球員', desc: '在對角球員（舉對）位置贏 1000 場', title: '最佳對角球員' },
  cannon1: { name: '重砲手 I', desc: '在大砲（OH）位置扣球得分累計 100 分（快攻、吊球不算）', title: '重砲手' },
  cannon2: { name: '重砲手 II', desc: '在大砲（OH）位置扣球得分累計 500 分（快攻、吊球不算）', title: '重砲達人' },
  cannon3: { name: '重砲手 III', desc: '在大砲（OH）位置扣球得分累計 1000 分（快攻、吊球不算）', title: '重砲之王' },
  cannon4: { name: '重砲手 IV', desc: '在大砲（OH）位置扣球得分累計 3000 分（快攻、吊球不算）', title: '破壞神' },
  cannon5: { name: '重砲手 V', desc: '在大砲（OH）位置扣球得分累計 5000 分（快攻、吊球不算）', title: '重砲傳說' },
  setter: { name: '精準舉球', desc: '一局舉球 10 次以上、沒有連擊或持球', title: '精準舉球員' },
  wall: { name: '禁止通行', desc: '同一球之內攔網碰到球 10 次', title: '禁止通行' },
  server: { name: '發球機器', desc: '發球得分累計 50 分', title: '發球機器' },
  libero1: { name: '自由人 I', desc: '完美接球累計 100 次', title: '守護神' },
  libero2: { name: '自由人 II', desc: '完美接球累計 500 次', title: '地板守門員' },
  libero3: { name: '自由人 III', desc: '完美接球累計 1000 次', title: '護國山河' },
  libero4: { name: '自由人 IV', desc: '完美接球累計 3000 次', title: '不落之地' },
  libero5: { name: '自由人 V', desc: '完美接球累計 5000 次', title: '自由人傳說' },
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
  save1: { name: '飛身救球 I', desc: '救回場外 2 公尺以外的球（接噴、touch out）累計 10 次', title: '救球王' },
  save2: { name: '飛身救球 II', desc: '救回場外球累計 50 次', title: '不放棄的人' },
  save3: { name: '飛身救球 III', desc: '救回場外球累計 200 次', title: '地板也是我的' },
  quick1: { name: '影子排球員 I', desc: '快攻（舉球到扣球不到 0.7 秒）直接落地得分 1 次', title: '影子排球員' },
  quick2: { name: '影子排球員 II', desc: '快攻直接落地得分累計 50 次', title: '光速快攻' },
  quick3: { name: '影子排球員 III', desc: '快攻直接落地得分累計 200 次', title: '影子之王' },
  self1: { name: '我自己來好了 I', desc: '第二下觸球（本來該舉球）直接自己扣球得分 10 次', title: '我自己來好了' },
  self2: { name: '我自己來好了 II', desc: '第二下自己扣球得分累計 50 次', title: '舉球員也會扣' },
  self3: { name: '我自己來好了 III', desc: '第二下自己扣球得分累計 200 次', title: '雙刀流' },
  magic1: { name: '魔術師 I', desc: '二次進攻：第二下觸球直接吊過網得分 10 次', title: '魔術師' },
  magic2: { name: '魔術師 II', desc: '二次進攻吊球得分累計 50 次', title: '大魔術師' },
  magic3: { name: '魔術師 III', desc: '二次進攻吊球得分累計 200 次', title: '幻影舉球員' },
  iron1: { name: '銅牆鐵壁 I', desc: '攔網得分累計 100 分', title: '銅牆' },
  iron2: { name: '銅牆鐵壁 II', desc: '攔網得分累計 500 分', title: '鐵壁' },
  iron3: { name: '銅牆鐵壁 III', desc: '攔網得分累計 1000 分', title: '銅牆鐵壁' },
  iron4: { name: '銅牆鐵壁 IV', desc: '攔網得分累計 3000 分', title: '萬里長城' },
  iron5: { name: '銅牆鐵壁 V', desc: '攔網得分累計 5000 分', title: '絕對防線' },
  assist1: { name: '請享用吧！ I', desc: '舉球出去、攻擊手得分（助攻）1 次', title: '請享用吧！' },
  assist2: { name: '請享用吧！ II', desc: '舉球助攻累計 500 次', title: '傳球職人' },
  assist3: { name: '請享用吧！ III', desc: '舉球助攻累計 1000 次', title: '指揮家' },
  assist4: { name: '請享用吧！ IV', desc: '舉球助攻累計 3000 次', title: '戰術大師' },
  assist5: { name: '請享用吧！ V', desc: '舉球助攻累計 5000 次', title: '舉球之神' },
};

// 成就中心：成就整理成「系列」，每個系列有一到多階（照順序）；每階給成就點數
export const ACH_POINTS = { cannon1: 10, cannon2: 30, cannon3: 60, setter: 30, wall: 30, server: 25, libero1: 15, libero2: 40, libero3: 80, pro1: 20, pro10: 60, streak5: 25, cb1: 20, cb5: 30, cb10: 45, cb15: 60, cb30: 100, iron1: 15, iron2: 40, iron3: 80, line1: 15, line2: 40, line3: 80, save1: 15, save2: 40, save3: 80, magic1: 20, magic2: 40, magic3: 80, self1: 20, self2: 40, self3: 80, cannon4: 120, cannon5: 200, libero4: 120, libero5: 200, iron4: 120, iron5: 200, assist1: 10, assist2: 40, assist3: 80, assist4: 120, assist5: 200, quick1: 20, quick2: 40, quick3: 80, sky1: 15, sky2: 40, sky3: 80 };
export const ACH_CATS = [['all', '全部項目'], ['atk', '扣球進攻系列'], ['def', '防守與舉球系列'], ['pro', '企聯特訓系列'], ['mind', '心態系列'], ['special', '特殊成就'], ['role', '位置']];
export const ACH_SERIES = [
  { id: 'tutorial', cat: 'special', icon: '📘', name: '完成新手教學', desc: '完成全部六段新手教學', tiers: ['tutorial'] },
  { id: 'langzi', cat: 'special', icon: '🦶', name: '花鼓燈浪子', desc: '用浪子踢球把地上的球踢飛', hidden: true, tiers: ['langzi'] },
  { id: 'oh', cat: 'role', icon: '🏐', name: '攻擊手', desc: '六人制擔任攻擊手（大砲）累積勝場', tiers: ['oh10', 'oh100', 'oh500', 'oh1000'] },
  { id: 's', cat: 'role', icon: '🎯', name: '舉球員', desc: '六人制擔任舉球員累積勝場', tiers: ['s10', 's100', 's500', 's1000'] },
  { id: 'mb', cat: 'role', icon: '🧱', name: '中間手', desc: '六人制擔任中間手累積勝場', tiers: ['mb10', 'mb100', 'mb500', 'mb1000'] },
  { id: 'opp', cat: 'role', icon: '⚔️', name: '對角球員', desc: '六人制擔任對角球員（舉對）累積勝場', tiers: ['opp10', 'opp100', 'opp500', 'opp1000'] },
  { id: 'cannon', cat: 'atk', icon: '🏐', name: '重砲手精神（大砲扣球累計）', desc: '在大砲（OH）位置扣球得分累計 100～5000 分（快攻、吊球不算）', tiers: ['cannon1', 'cannon2', 'cannon3', 'cannon4', 'cannon5'] },
  { id: 'line', cat: 'atk', icon: '📏', name: '直線魔人（直線得分）', desc: '貼著邊線扣直線拿分', tiers: ['line1', 'line2', 'line3'] },
  { id: 'sky', cat: 'atk', icon: '☄️', name: '天空打點（三米內得分）', desc: '從高處往下壓，扣進對方三米線內', tiers: ['sky1', 'sky2', 'sky3'] },
  { id: 'quick', cat: 'atk', icon: '⚡', name: '影子排球員（快攻得分）', desc: '攔中打快攻，球直接落地得分', tiers: ['quick1', 'quick2', 'quick3'] },
  { id: 'server', cat: 'atk', icon: '🚀', name: '發球機器（發球得分）', desc: '用發球直接拿下 50 分', tiers: ['server'] },
  { id: 'assist', cat: 'def', icon: '🍽️', name: '請享用吧！（舉球助攻）', desc: '舉得漂亮，讓攻擊手盡情打下來得分', tiers: ['assist1', 'assist2', 'assist3', 'assist4', 'assist5'] },
  { id: 'libero', cat: 'def', icon: '🛡️', name: '守護神領域（完美接球）', desc: '一球一球接到位，打造後場鐵壁', tiers: ['libero1', 'libero2', 'libero3', 'libero4', 'libero5'] },
  { id: 'setter', cat: 'def', icon: '🎯', name: '場上指揮官（精準舉球）', desc: '一局舉 10 球以上都沒有連擊或持球', tiers: ['setter'] },
  { id: 'iron', cat: 'def', icon: '🛡', name: '銅牆鐵壁（攔網累計）', desc: '攔網得分從 100 分到 1000 分', tiers: ['iron1', 'iron2', 'iron3', 'iron4', 'iron5'] },
  { id: 'save', cat: 'def', icon: '🤸', name: '飛身救球（場外救回）', desc: '把接噴、touch out 飛到場外很遠的球救回來', tiers: ['save1', 'save2', 'save3'] },
  { id: 'magic', cat: 'special', icon: '🎩', name: '魔術師（二次進攻）', desc: '第二下觸球就直接吊過網得分', tiers: ['magic1', 'magic2', 'magic3'] },
  { id: 'selfspike', cat: 'special', icon: '😤', name: '我自己來好了（舉球自己扣）', desc: '第二下觸球直接自己扣球得分', tiers: ['self1', 'self2', 'self3'] },
  { id: 'wall', cat: 'special', icon: '🧱', name: '禁止通行（連續攔網）', desc: '同一球之內攔網碰到球 10 次', tiers: ['wall'] },
  { id: 'pro', cat: 'pro', icon: '👑', name: '企聯特訓與魔性挑戰', desc: '擊敗最高難度的企聯 AI', tiers: ['pro1', 'pro10'] },
  { id: 'streak', cat: 'pro', icon: '🔥', name: '氣勢如虹（連勝）', desc: '開房比賽連續贏 5 場', tiers: ['streak5'] },
  { id: 'comeback', cat: 'mind', icon: '💪', name: '絕處逢生（逆轉勝）', desc: '對方到局末點、我方落後 5 分以上，最後逆轉拿下這局', tiers: ['cb1', 'cb5', 'cb10', 'cb15', 'cb30'] },
];
export function achVisible(item, unlocked) { return item.hidden && !unlocked ? { ...item, name: '???', title: '???', desc: '隱藏成就', icon: '❔' } : item; }
export const achPoints = (got = []) => got.reduce((n, k) => n + (ACH_POINTS[k] || 0), 0);
// 成就目前的進度（顯示用）：[現在, 目標]；一場內完成的成就沒有累計進度
export function achProgress(key, p = {}) {
  if (key === 'tutorial') {
    try {
      if (localStorage.getItem('vb.tutorial.graduated') === '1') return [6,6];
      const done = JSON.parse(localStorage.getItem('vb.tutorial') || '{}').done || {};
      const count = ['move','recv','set','atk','serve','block'].filter(id => done[id] === true).length;
      if (count === 6) localStorage.setItem('vb.tutorial.graduated','1');
      return [count,6];
    } catch { return [0,6]; }
  }
  const roleTier = /^(oh|s|mb|opp)(10|100|500|1000)$/.exec(key);
  if (roleTier) return [p.role_wins?.[roleTier[1].toUpperCase()] | 0, Number(roleTier[2])];
  const w5 = (p.stats && p.stats.w && p.stats.w['5']) | 0;
  return { cannon1: [p.cannon_kills | 0, 100], cannon2: [p.cannon_kills | 0, 500], cannon3: [p.cannon_kills | 0, 1000], cannon4: [p.cannon_kills | 0, 3000], cannon5: [p.cannon_kills | 0, 5000], server: [p.aces | 0, 50], libero1: [p.perfects | 0, 100], libero2: [p.perfects | 0, 500], libero3: [p.perfects | 0, 1000], libero4: [p.perfects | 0, 3000], libero5: [p.perfects | 0, 5000], assist1: [p.assists | 0, 1], assist2: [p.assists | 0, 500], assist3: [p.assists | 0, 1000], assist4: [p.assists | 0, 3000], assist5: [p.assists | 0, 5000], magic1: [p.dumps | 0, 10], magic2: [p.dumps | 0, 50], magic3: [p.dumps | 0, 200], self1: [p.self_spikes | 0, 10], self2: [p.self_spikes | 0, 50], self3: [p.self_spikes | 0, 200], pro1: [w5, 1], pro10: [w5, 10], streak5: [p.streak | 0, 5], cb1: [p.comebacks | 0, 1], cb5: [p.comebacks | 0, 5], cb10: [p.comebacks | 0, 10], cb15: [p.comebacks | 0, 15], cb30: [p.comebacks | 0, 30], line1: [p.kills_line | 0, 30], line2: [p.kills_line | 0, 150], line3: [p.kills_line | 0, 500], sky1: [p.kills_steep | 0, 30], sky2: [p.kills_steep | 0, 150], sky3: [p.kills_steep | 0, 500], quick1: [p.quicks | 0, 1], quick2: [p.quicks | 0, 50], quick3: [p.quicks | 0, 200], save1: [p.saves_far | 0, 10], save2: [p.saves_far | 0, 50], save3: [p.saves_far | 0, 200], iron1: [p.blocks | 0, 100], iron2: [p.blocks | 0, 500], iron3: [p.blocks | 0, 1000], iron4: [p.blocks | 0, 3000], iron5: [p.blocks | 0, 5000] }[key] || null;
}
// 表情／動作（T 輪盤）：hi5、taunt 一開始就有；其他照等級或成就解鎖
export const EMOTES = {
  langzi: { name: '浪子踢球', icon: '🦶' },
  hi5: { name: '擊掌', icon: '🙌' },
  taunt: { name: '嘲諷', icon: '😜' },
  shanshen: { name: '閃身步', icon: '💨' },
  gouxiong: { name: '狗熊哆嗦毛', icon: '🐻' },
  yaotou: { name: '搖頭晃腦', icon: '🤪' },
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
