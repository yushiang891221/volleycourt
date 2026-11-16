// 大廳跑馬燈動態（supabase/024_lobby_feed.sql）：在測試資料庫（PGlite）真的執行全部 SQL，確認五種事情都會自動記下來
const assert = require('node:assert');
const { makeDb } = require('./supabase-db.cjs');
(async () => {
  const db = await makeDb();
  if (!db) { console.log('略過：沒有安裝測試資料庫（cd server && npm install）'); return; }
  const feed = async (uid) => (await db.as(uid, 'select public.lobby_feed(50) as r'))[0].r;
  const kinds = (f) => f.map((x) => x.kind);
  const LV10 = 4500;

  // 新玩家：取好暱稱
  const a = await db.player('阿翔', { exp: LV10, coins: 5000 });
  let f = await feed(a);
  assert.equal(f[0].kind, 'join'); assert.equal(f[0].data.nick, '阿翔');
  await db.query("update public.profiles set nickname = '阿翔改名' where id = $1", [a]);   // 改名不算新加入
  assert.equal(kinds(await feed(a)).filter((k) => k === 'join').length, 1);
  console.log('PASS 新玩家取好暱稱會記一筆（改名不算）');

  // 新球隊、球隊升級
  const t = (await db.as(a, "select public.create_team('台北排球') as r"))[0].r;
  f = await feed(a); assert.equal(f[0].kind, 'team_new'); assert.equal(f[0].data.team, '台北排球'); assert.equal(f[0].data.nick, '阿翔改名');
  await db.as(a, 'select public.donate_coins(1000)');
  await db.query('update public.teams set exp = 2999 where id = $1', [t.id]);
  await db.as(a, 'select public.donate_coins(1)');   // 升到 Lv2
  f = await feed(a); assert(f.some((x) => x.kind === 'team_level' && x.data.team === '台北排球' && Number(x.data.level) === 2));
  console.log('PASS 新球隊、球隊升級');

  // 比賽：贏才記；解成就
  const rec = (id, won) => db.query("insert into public.match_records(user_id, match_id, payload, exp_gain, coin_gain) values ($1, $2, $3, 10, 3)", [a, id, JSON.stringify({ lv: 5, human: false, won })]);
  await rec('match-feed-1', false);
  assert(!kinds(await feed(a)).includes('win'), '輸球不記');
  await rec('match-feed-2', true);
  f = await feed(a); assert.equal(f[0].kind, 'win'); assert.equal(f[0].data.nick, '阿翔改名'); assert.equal(Number(f[0].data.lv), 5);
  await db.query("update public.player_progress set achievements = array['first_win'] where user_id = $1", [a]);
  await db.query("update public.player_progress set achievements = array['first_win', 'kill_10'] where user_id = $1", [a]);
  f = await feed(a); assert.deepEqual(f.filter((x) => x.kind === 'ach').map((x) => x.data.key), ['kill_10', 'first_win'], '每個新成就各記一筆');
  await db.query("update public.player_progress set achievements = array['first_win', 'kill_10'], coins = 5 where user_id = $1", [a]);
  assert.equal(kinds(await feed(a)).filter((k) => k === 'ach').length, 2, '沒有新成就不記');
  console.log('PASS 比賽只記贏球、解成就每個記一筆');

  // 球隊戰結算
  const b = await db.player('小美', { exp: LV10, coins: 1000 });
  await db.as(b, "select public.create_team('新竹飛鷹')");
  await db.query('update public.teams set exp = 9000');
  await db.as(a, 'select public.war_join_queue()'); await db.as(b, 'select public.war_join_queue()');
  await db.as(b, 'select public.war_status()');
  await db.as(a, 'select public.war_report(true)'); await db.as(b, 'select public.war_report(false)');
  f = await feed(a); const w = f.find((x) => x.kind === 'war'); assert(w); assert.equal(w.data.win, '台北排球'); assert.equal(w.data.lose, '新竹飛鷹');
  console.log('PASS 球隊戰結算');

  // 只留 100 則、沒登入不能讀、表格不能直接動
  for (let i = 0; i < 120; i++) await db.query("select public.lobby_feed_add('join', jsonb_build_object('nick', 'n' || $1::text))", [i]);
  assert.equal((await db.query('select count(*)::int n from public.lobby_feed')).rows[0].n, 100);
  assert.equal((await feed(a)).length, 50); assert.equal((await feed(a))[0].data.nick, 'n119');
  await assert.rejects(db.as(null, 'select public.lobby_feed(10)'), /not signed in/);
  await assert.rejects(db.as(a, 'select * from public.lobby_feed'), /permission denied/);
  await assert.rejects(db.as(a, "select public.lobby_feed_add('join', '{}')"), /permission denied/);
  console.log('PASS 只留最近 100 則、要登入才能讀、不能自己塞動態');
})().catch((e) => { console.error(e); process.exit(1); });
