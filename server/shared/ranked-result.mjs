// WEB-030 積分賽打完：從伺服器裁判送出的結果 d 算出每個人的加減分並寫進 Supabase（server/rt/server.mjs 呼叫）
// rk：{ plan（座位表）, byId: 房間代號 → 帳號 }；present：打完時還在房間的代號（不在＝中途離開，算輸）
import { rankedChanges } from './elo.mjs';
import { rankView } from '../../js/ranks.js';

export async function settleRanked({ code, rk, d, present, ratingsOf, reportMatch }) {
  const pl = rk.plan, n = pl.count, mode = `${n}v${n}`;
  const multi = (d.six || d.bo > 1) && Array.isArray(d.sets), A = multi ? d.sets : d.sc;
  if (!Array.isArray(A) || A.length !== 2 || A[0] === A[1]) return null;
  const winner = A[0] > A[1] ? 0 : 1;
  const ids = pl.picks.filter(Boolean);
  const teamOf = id => { const t = Array.isArray(d.team) ? d.team.findIndex(x => Array.isArray(x) && x.includes(id)) : -1; return t >= 0 ? t : (pl.picks.indexOf(id) < n ? 0 : 1); };
  const ratings = await ratingsOf(ids.map(id => rk.byId.get(id)), mode);
  const teams = [[], []];
  for (const id of ids) { const player = rk.byId.get(id); teams[teamOf(id)].push({ player, rating: ratings.get(player)?.rating ?? 1000, id }); }
  const left = ids.filter(id => !present.has(id)).map(id => rk.byId.get(id));
  const changes = rankedChanges({ teams, n, lv: pl.lv, winner, left, sets: multi ? A : null, sc: multi ? null : A });
  const res = await reportMatch(code, mode, changes, { humans: teams.map(t => t.length), lv: pl.lv, sc: d.sc, sets: d.sets || null, left: left.length });
  const saved = !!(res && res.ratings);
  const idOf = new Map(teams.flat().map(p => [p.player, p.id])), games = p => (ratings.get(p)?.games || 0) + 1;
  const list = Object.fromEntries(changes.map(c => {
    const after = saved ? res.ratings[c.player] ?? c.after : c.after;
    return [idOf.get(c.player), { before: c.before, delta: c.delta, after, won: c.won, ...rankView({ rating: after, games: games(c.player) }) }];
  }));
  return { mode, saved, list, changes, games };
}
