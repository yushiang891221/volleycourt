// WEB-030 台北伺服器讀寫積分（Supabase 的 ranked_ratings_of／ranked_report，見 supabase/026_ranked.sql）
// 寫入要 service_role 金鑰：放在伺服器的環境變數 SUPABASE_SERVICE_ROLE_KEY（/etc/volleycourt/secrets.env），不能放網頁。
// 沒有金鑰時：查分數照常（用公開金鑰），比賽打完不寫分數（只記一行 log）。
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../js/auth-config.js';

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const canWrite = () => !!SERVICE;

async function rpc(fn, args, key) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// 回傳 Map(帳號 → { rating, games })；查不到（例如 SQL 還沒執行）就全部當 1000、0 場
export async function ratingsOf(players, mode) {
  const out = new Map(players.map(p => [p, { rating: 1000, games: 0 }]));
  const ids = players.filter(p => /^[0-9a-f-]{36}$/i.test(p));
  if (!ids.length) return out;
  try {
    for (const r of await rpc('ranked_ratings_of', { p_players: ids, p_mode: mode }, SERVICE || SUPABASE_ANON_KEY)) out.set(r.player, { rating: r.rating, games: r.games });
  } catch (e) { console.warn('[積分] 查分數失敗', e.message); }
  return out;
}

export async function reportMatch(match, mode, changes, data) {
  if (!SERVICE) { console.warn('[積分] 伺服器沒有 SUPABASE_SERVICE_ROLE_KEY，這場不寫分數', match); return null; }
  return rpc('ranked_report', { p_match: match, p_mode: mode, p_changes: changes.map(c => ({ player: c.player, delta: c.delta, won: c.won })), p_data: data }, SERVICE);
}
