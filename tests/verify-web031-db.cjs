// WEB-031 排行榜＋中途離開記成就（supabase/027_leaderboard_partial.sql）：測試資料庫裡跑
const assert = require('node:assert');
const { makeDb } = require('./supabase-db.cjs');
(async () => {
  const db = await makeDb();
  if (!db) { console.log('略過：沒有安裝測試資料庫（cd server && npm install）'); return; }
  const asServer = async (sql, params = []) => {
    await db.exec(`begin; set local role service_role;`);
    try { const r = await db.query(sql, params); await db.exec('commit'); return r.rows; } catch (e) { await db.exec('rollback'); throw e; }
  };
  const board = (uid, mode, scope) => db.as(uid, 'select public.ranked_leaderboard($1, $2) as r', [mode, scope]).then(r => r[0].r);
  const set = (player, rating, games, mode = '2v2', days = 0) => db.query(`insert into public.ranked_ratings(player, mode, rating, games, peak, last_played) values ($1, $2, $3, $4, $3, now() - ($5 || ' days')::interval)`, [player, mode, rating, games, String(days)]);

  const a = await db.player('阿明'), b = await db.player('小晴'), c = await db.player('阿哲'), d = await db.player('可可'), e = await db.player('老鳥');
  await set(a, 3200, 12); await set(b, 5400, 30); await set(c, 2100, 9); await set(d, 4000, 15); await set(e, 9000, 50, '2v2', 20);
  await set(b, 1500, 11, '6v6');

  let r = await board(a, '2v2', 'all');
  assert.deepEqual(r.rows.map(x => x.name), ['小晴', '可可', '阿明'], '照分數排；未滿 10 場、14 天沒打的不上榜');
  assert.deepEqual(r.rows.map(x => x.rank), [1, 2, 3]); assert.equal(r.rows[0].rating, 5400);
  assert.equal(r.me.rank, 3); assert.equal(r.me.need, 0);
  r = await board(c, '2v2', 'all'); assert.equal(r.me.rank, null); assert.equal(r.me.need, 1, '再打 1 場上榜');
  r = await board(a, '6v6', 'all'); assert.deepEqual(r.rows.map(x => x.name), ['小晴'], '2v2、6v6 分開');
  console.log('PASS 全服榜：排序、上榜條件、自己的名次、兩個模式分開');

  // 好友榜：自己＋好友
  const lo = a < d ? [a, d] : [d, a];
  await db.query(`insert into public.friendships(a, b, requester, status) values ($1, $2, $1, 'accepted')`, lo);
  r = await board(a, '2v2', 'friends'); assert.deepEqual(r.rows.map(x => x.name), ['可可', '阿明']); assert.equal(r.me.rank, 2);
  // 球隊榜：同一隊
  const t = (await db.query(`insert into public.teams(code, name, owner) values ('ABC123', '台北排球', $1) returning id`, [a])).rows[0].id;
  await db.query(`insert into public.team_members(user_id, team_id) values ($1, $3), ($2, $3)`, [a, b, t]);
  r = await board(a, '2v2', 'team'); assert.deepEqual(r.rows.map(x => x.name), ['小晴', '阿明']);
  r = await board(d, '2v2', 'team'); assert.deepEqual(r.rows, [], '沒有球隊就是空的');
  console.log('PASS 好友榜、球隊榜');

  // 中途離開記成就：只有伺服器能呼叫；只加次數和成就，不給經驗、金幣、勝敗
  const perf = JSON.stringify({ kc: 100, k: 5, as: 1, b: 2 });
  await assert.rejects(db.as(a, 'select public.record_partial_for($1, $2, $3, $4::jsonb)', [a, 'ROOM1-x:left', 300, perf]), /permission denied/);
  let p = (await asServer('select public.record_partial_for($1, $2, $3, $4::jsonb) as r', [a, 'ROOM1-x:left', 300, perf]))[0].r;
  assert.deepEqual(p.new.sort(), ['assist1', 'cannon1']);
  p = (await asServer('select public.record_partial_for($1, $2, $3, $4::jsonb) as r', [a, 'ROOM1-x:left', 300, perf]))[0].r;
  assert.equal(p.dup, true, '同一場只記一次');
  const row = (await db.query('select exp, coins, cannon_kills, assists, play_seconds, stats, streak from public.player_progress where user_id = $1', [a])).rows[0];
  assert.equal(row.exp, 0); assert.equal(row.coins, 0); assert.equal(row.cannon_kills, 100); assert.equal(row.assists, 1); assert.equal(row.play_seconds, 300); assert.equal(row.streak, 0);
  console.log('PASS 中途離開：只記次數與成就、不給經驗金幣、同一場只記一次、玩家不能自己呼叫');
  console.log('WEB-031 排行榜與中途成就資料庫檢查通過');
})().catch(e => { console.error(e); process.exit(1); });
