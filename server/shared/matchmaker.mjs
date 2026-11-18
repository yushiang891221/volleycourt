// WEB-029 快速配對：選 2 對 2／6 對 6 → 排隊 → 找真人（兩邊真人數盡量一樣、分數接近）→ 找不到就用 AI 補滿開打。
// createMatchmaker 只管「誰跟誰一場」（純邏輯，方便測試）；createRanked 接大廳連線：排隊訊息、每秒狀態、配到後開隱藏房間。
// 規則見 docs/企劃-積分天梯與快速配對.md 第三節。
import crypto from 'node:crypto';

export const TEAM_SIZE = { '2v2': 2, '6v6': 6 };
export const RANKED_RULES = { to: 25, bestOf: 1 };            // 積分賽固定規則（之後要調改這裡）
export const AI_RATING = { 3: 1500, 4: 2500, 5: 3500 };       // 遊戲 AI 等級：3 高手、4 校隊、5 企聯（越後面越強）
export function aiLevelFor(rating) {
  let best = 3; for (const lv of [3, 4, 5]) if (Math.abs(AI_RATING[lv] - rating) < Math.abs(AI_RATING[best] - rating)) best = lv;
  return best;
}
const windowFor = s => s < 5 ? 500 : s < 10 ? 1000 : s < 15 ? 2000 : Infinity;   // 分數範圍隨等待時間放寬
const avg = ps => ps.reduce((n, p) => n + (Number.isFinite(p.rating) ? p.rating : 1000), 0) / Math.max(1, ps.length);

// entry：{ key, mode, players: [{ player, name, rating }], since, aiNow }
export function createMatchmaker({ now = Date.now } = {}) {
  const queue = new Map();
  const waited = e => (now() - e.since) / 1000;
  const aiAfter = e => e.mode === '6v6' && e.players.length >= 4 ? 30 : 15;   // 真人多的隊伍可以多等一點

  function bestSplit(anchor, others) {
    const n = TEAM_SIZE[anchor.mode], s = waited(anchor);
    const allowed = s < 10 ? 0 : anchor.mode === '6v6' ? 2 : 1;
    const cands = others.slice(0, 9); let best = null;
    const total = 3 ** cands.length;
    for (let code = 0; code < total; code++) {
      let hA = anchor.players.length, hB = 0, x = code, age = 0; const A = [anchor], B = [];
      for (const c of cands) { const k = x % 3; x = (x - k) / 3; if (k === 1) { A.push(c); hA += c.players.length; age += c.since; } else if (k === 2) { B.push(c); hB += c.players.length; age += c.since; } }
      if (!hB || hA > n || hB > n || Math.abs(hA - hB) > allowed) continue;
      const score = [Math.abs(hA - hB), -(hA + hB), age];
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2])))) best = { A, B, hA, hB, score };
    }
    return best;
  }
  function make(mode, A, B) {
    const n = TEAM_SIZE[mode], teams = [A.flatMap(e => e.players), B.flatMap(e => e.players)];
    for (const e of [...A, ...B]) queue.delete(e.key);
    return { mode, n, teams, keys: [...A, ...B].map(e => e.key), lv: aiLevelFor(avg(teams.flat())), ai: [n - teams[0].length, n - teams[1].length] };
  }

  return {
    queue,
    add(entry) { queue.set(entry.key, { ...entry, since: entry.since ?? now(), aiNow: false }); },
    remove(key) { return queue.delete(key); },
    has: key => queue.has(key),
    aiNow(key) { const e = queue.get(key); if (!e || waited(e) < 10) return false; e.aiNow = true; return true; },
    status(key) {
      const e = queue.get(key); if (!e) return null;
      const s = waited(e);
      return { seconds: Math.floor(s), canAI: s >= 10, note: s < 10 ? `正在找 ${e.players.length} 人隊伍` : '正在找對手' };
    },
    // 每秒跑一次：回傳這一輪配好的比賽
    tick() {
      const matches = [];
      for (const anchor of [...queue.values()].sort((a, b) => a.since - b.since)) {
        if (!queue.has(anchor.key)) continue;
        const s = waited(anchor), win = windowFor(s), n = TEAM_SIZE[anchor.mode], r = avg(anchor.players);
        const others = [...queue.values()].filter(e => e !== anchor && e.mode === anchor.mode && Math.abs(avg(e.players) - r) <= win).sort((a, b) => a.since - b.since);
        const split = bestSplit(anchor, others);
        // 6 對 6 人還沒滿時先等 5 秒，讓更多真人有機會排進同一場
        if (split && (split.hA + split.hB === 2 * n || s >= 5 || anchor.mode === '2v2')) { matches.push(make(anchor.mode, split.A, split.B)); continue; }
        if (anchor.aiNow || s >= aiAfter(anchor)) matches.push(make(anchor.mode, [anchor], []));
      }
      return matches;
    },
  };
}

// 接大廳：mm-start／mm-cancel／mm-ai-now；每秒送 mm-status；配到送 mm-found
// openRoom(match) 由 server.mjs 提供：開隱藏房間、記下這場的座位，回傳 { code }
export function createRanked({ send, sockets, parties, openRoom, now = Date.now }) {
  const mm = createMatchmaker({ now });
  const live = player => sockets().filter(ws => ws.meta && ws.meta.player === player && ws.meta.name);
  const toPlayer = (player, obj) => { for (const ws of live(player)) send(ws, obj); };
  const keyOf = player => { for (const e of mm.queue.values()) if (e.players.some(p => p.player === player)) return e.key; return null; };
  const roster = new Map();   // 排隊的 key → 當時的隊員（隊伍有變動就取消）

  function cancel(key, reason) {
    const e = mm.queue.get(key); if (!e) return;
    mm.remove(key); roster.delete(key);
    for (const p of e.players) toPlayer(p.player, { k: 'mm-status', state: 'idle', ...(reason ? { reason } : {}) });
  }

  function handle(ws, m) {
    if (!m || typeof m.k !== 'string' || !m.k.startsWith('mm-')) return false;
    const p = ws.meta, fail = reason => { send(ws, { k: 'mm-error', reason }); return true; };
    if (!p || !p.player) return fail('登入後才能排積分賽');
    if (m.k === 'mm-start') {
      if (!TEAM_SIZE[m.mode]) return fail('模式不正確');
      const party = parties.partyOf(p.player);
      if (party && party.leader !== p.player) return fail('只有隊長可以開始配對');
      if (party && party.mode !== m.mode) return fail('隊伍模式和選的模式不一樣');
      const players = party ? party.players : [p.player];
      const names = new Map(sockets().filter(o => o.meta && players.includes(o.meta.player)).map(o => [o.meta.player, o.meta.name]));
      if (players.some(x => !names.has(x))) return fail('有隊友不在大廳，等他回來再開始');
      for (const x of players) { const k = keyOf(x); if (k) cancel(k); }
      const key = party ? 'party:' + party.id : 'solo:' + p.player;
      mm.add({ key, mode: m.mode, players: players.map(x => ({ player: x, name: names.get(x), rating: 1000 })) });   // 積分 WEB-030 才有，先一律 1000
      roster.set(key, players.slice().sort().join('|'));
      for (const x of players) toPlayer(x, { k: 'mm-status', state: 'searching', mode: m.mode, ...mm.status(key) });
      return true;
    }
    const key = keyOf(p.player);
    if (m.k === 'mm-cancel') { if (key) cancel(key, `${p.name} 取消了配對`); else send(ws, { k: 'mm-status', state: 'idle' }); return true; }
    if (m.k === 'mm-ai-now') { if (!key || !mm.aiNow(key)) return fail('等 10 秒後才能直接用 AI 開打'); return true; }
    return fail('不支援的配對訊息');
  }

  function tick() {
    // 隊伍有變動、有人離開大廳 → 取消排隊
    for (const e of [...mm.queue.values()]) {
      const party = e.key.startsWith('party:') ? parties.partyOf(e.players[0].player) : null;
      const now2 = party ? party.players.slice().sort().join('|') : roster.get(e.key);
      if (now2 !== roster.get(e.key) || (party && 'party:' + party.id !== e.key)) { cancel(e.key, '隊伍有變動，已取消配對'); continue; }
      if (e.players.some(x => !live(x.player).length)) cancel(e.key, '有人離開大廳，已取消配對');
    }
    for (const match of mm.tick()) {
      for (const k of match.keys) roster.delete(k);
      let room;
      try { room = openRoom(match); } catch (err) { console.warn('[配對] 開房失敗', err && err.message); for (const p of match.teams.flat()) toPlayer(p.player, { k: 'mm-status', state: 'idle', reason: '開房失敗，請再按一次開始配對' }); continue; }
      for (const p of match.teams.flat()) toPlayer(p.player, { k: 'mm-found', ...room.forPlayer(p.player) });
    }
    for (const e of mm.queue.values()) for (const p of e.players) toPlayer(p.player, { k: 'mm-status', state: 'searching', mode: e.mode, ...mm.status(e.key) });
  }
  const timer = setInterval(tick, 1000); if (timer.unref) timer.unref();
  return { handle, tick, stop: () => clearInterval(timer), mm };
}

// 開一場積分賽要用的座位表：每個真人一個房間用 id（網頁用它當自己在房間裡的代號），AI 位置是 null
export function planFor(match) {
  const n = match.n, ids = new Map(), names = {};
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const picks = [];
  match.teams.forEach((team, t) => {
    const seats = shuffle(team).map(p => { const id = 'q' + crypto.randomBytes(5).toString('hex'); ids.set(p.player, id); names[id] = p.name; return id; });
    while (seats.length < n) seats.push(null);
    picks.push(...seats);
  });
  const host = ids.get(match.teams[0][0].player);   // 房間流程由排頭那隊的第一個人（通常是隊長）的網頁帶
  return { count: n, lv: match.lv, ...RANKED_RULES, picks, names, host, ids };
}
