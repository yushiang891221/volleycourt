// 測試用資料庫：PGlite（記憶體裡的 Postgres 16，server/node_modules 的開發套件）＋假的 Supabase 登入環境，
// 依序執行 supabase/*.sql，然後可以用「某個玩家的身分」呼叫函式——跟正式的 Supabase 一樣是 authenticated 角色＋auth.uid()。
const fs = require('node:fs'), path = require('node:path');
const req = require('node:module').createRequire(path.join(__dirname, '../server/package.json'));
const SQL_DIR = path.join(__dirname, '../supabase');
function loadPglite() { try { return req('@electric-sql/pglite').PGlite; } catch { return null; } }
async function makeDb() {
  const PGlite = loadPglite();
  if (!PGlite) return null;   // 沒裝（cd server && npm install）就略過
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  for (const f of fs.readdirSync(SQL_DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()) {
    try { await db.exec(fs.readFileSync(path.join(SQL_DIR, f), 'utf8')); } catch (e) { throw new Error(`${f}：${e.message}`); }
  }
  // 以某個玩家身分執行一句 SQL（失敗會丟出資料庫的錯誤訊息）
  db.as = async (uid, sql, params = []) => {
    await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${uid || ''}', true);`);
    try { const r = await db.query(sql, params); await db.exec('commit'); return r.rows; } catch (e) { await db.exec('rollback'); throw e; }
  };
  // 建一個玩家（有暱稱、指定經驗和金幣）
  db.player = async (nickname, { exp = 0, coins = 0 } = {}) => {
    const id = (await db.query('insert into auth.users default values returning id')).rows[0].id;
    await db.query('insert into public.profiles(id, nickname) values ($1, $2) on conflict (id) do update set nickname = $2', [id, nickname]);
    await db.query('insert into public.player_progress(user_id, exp, coins) values ($1, $2, $3)', [id, exp, coins]);
    return id;
  };
  return db;
}
module.exports = { makeDb };
