// WEB-030 積分（supabase/026_ranked.sql）：測試資料庫裡跑——只有伺服器（service_role）能寫、同一場只記一次、分數不會變負、查分數
const assert = require('node:assert');
const { makeDb } = require('./supabase-db.cjs');
(async () => {
  const db = await makeDb();
  if (!db) { console.log('略過：沒有安裝測試資料庫（cd server && npm install）'); return; }
  const asServer = async (sql, params = []) => {
    await db.exec(`begin; set local role service_role;`);
    try { const r = await db.query(sql, params); await db.exec('commit'); return r.rows; } catch (e) { await db.exec('rollback'); throw e; }
  };
  const report = (id, mode, changes) => asServer('select public.ranked_report($1, $2, $3::jsonb) as r', [id, mode, JSON.stringify(changes)]).then(r => r[0].r);
  const a = await db.player('阿明'), b = await db.player('小晴');

  // 玩家自己不能寫分數
  await assert.rejects(db.as(a, 'select public.ranked_report($1, $2, $3::jsonb)', ['ROOM1-1-abcdef', '2v2', JSON.stringify([{ player: a, delta: 100, won: true }])]), /permission denied/);
  await assert.rejects(db.as(a, 'update public.ranked_ratings set rating = 9999'), /permission denied/);
  console.log('PASS 玩家不能自己寫分數');

  // 沒打過：1000 分、0 場
  let mine = (await db.as(a, 'select public.ranked_mine() as r'))[0].r;
  assert.deepEqual(mine['2v2'], { rating: 1000, games: 0, wins: 0, losses: 0, peak: 1000 });

  // 伺服器回報：贏 +50、輸 -50；同一場再送一次不重複記
  let r = await report('ROOM1-1-abcdef', '2v2', [{ player: a, delta: 50, won: true }, { player: b, delta: -50, won: false }]);
  assert.equal(r.ratings[a], 1050); assert.equal(r.ratings[b], 950);
  r = await report('ROOM1-1-abcdef', '2v2', [{ player: a, delta: 50, won: true }]); assert.equal(r.dup, true);
  mine = (await db.as(a, 'select public.ranked_mine() as r'))[0].r;
  assert.deepEqual(mine['2v2'], { rating: 1050, games: 1, wins: 1, losses: 0, peak: 1050 }); assert.equal(mine['6v6'].games, 0, '兩個模式分開算');
  console.log('PASS 伺服器回報、同一場只記一次、2v2／6v6 分開');

  // 一場最多 ±100；分數最低 0
  r = await report('ROOM2-1-abcdef', '2v2', [{ player: b, delta: -5000, won: false }]); assert.equal(r.ratings[b], 850);
  for (let i = 0; i < 10; i++) await report(`ROOM3-${i}-abcdef`, '2v2', [{ player: b, delta: -100, won: false }]);
  const of = await db.as(a, 'select * from public.ranked_ratings_of($1::uuid[], $2)', [[a, b, '00000000-0000-0000-0000-000000000000'], '2v2']);
  assert.equal(of.find(x => x.player === b).rating, 0, '分數最低 0');
  assert.equal(of.find(x => x.player === a).rating, 1050);
  assert.equal(of.find(x => x.player === '00000000-0000-0000-0000-000000000000').rating, 1000, '沒打過的人當 1000');
  console.log('PASS 一場最多 ±100、分數最低 0、查別人分數');

  await assert.rejects(report('ROOM4-1-abcdef', '3v3', [{ player: a, delta: 1, won: true }]), /bad mode/);
  console.log('WEB-030 積分資料庫檢查通過');
})().catch(e => { console.error(e); process.exit(1); });
