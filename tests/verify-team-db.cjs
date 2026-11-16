// 球隊系統 T1（supabase/019_team_guild.sql）：在測試資料庫（PGlite）裡真的執行全部 SQL，再用不同玩家的身分把每個功能走一遍
const assert = require('node:assert');
const { makeDb } = require('./supabase-db.cjs');
(async () => {
  const db = await makeDb();
  if (!db) { console.log('略過：沒有安裝測試資料庫（cd server && npm install）'); return; }
  const ok = (m) => console.log('PASS ' + m);
  const call = (uid, fn, args = []) => db.as(uid, `select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args).then((r) => r[0].r);
  const fails = async (uid, fn, args, msg) => { await assert.rejects(call(uid, fn, args), (e) => (e.message.includes(msg) ? true : assert.fail(`${fn} 應該因為「${msg}」失敗，結果是：${e.message}`))); };
  const coins = async (uid) => (await db.query('select coins from public.player_progress where user_id = $1', [uid])).rows[0].coins;
  const LV10 = 4500;

  // ---------- 建隊 ----------
  const cap = await db.player('隊長阿翔', { exp: LV10, coins: 1500 });
  const low = await db.player('新手', { exp: 4000, coins: 5000 });
  const poor = await db.player('沒錢', { exp: LV10, coins: 999 });
  await fails(low, 'create_team', ['低等隊'], 'level');
  await fails(poor, 'create_team', ['窮隊'], 'coins');
  assert.equal(await coins(poor), 999, '沒建成不能扣錢');
  await fails(cap, 'create_team', ['幹你'], 'bad name');
  await fails(cap, 'create_team', ['A'], 'bad name');
  const t = await call(cap, 'create_team', ['台北排球']);
  assert.equal(t.name, '台北排球'); assert.equal(await coins(cap), 500, '建隊扣 1000 金幣');
  await fails(cap, 'create_team', ['第二隊'], 'already in team');
  const rich = await db.player('有錢人', { exp: LV10, coins: 5000 });
  await fails(rich, 'create_team', ['台北排球'], 'name taken');
  ok('建隊：Lv10＋1000 金幣、扣錢跟建隊一起成功、隊名檢查（字數、不雅字、重複）');

  // ---------- 加入、人數上限、職位 ----------
  let my = await call(cap, 'my_team');
  assert.equal(my.myRole, 'owner'); assert.equal(my.level, 1); assert.equal(my.cap, 10); assert.equal(my.next, 3000); assert.equal(my.members.length, 1);
  const players = [];
  for (let i = 0; i < 9; i++) players.push(await db.player('隊員' + i, { exp: LV10 }));
  for (const p of players) await call(p, 'join_team', [my.code.toLowerCase()]);
  my = await call(cap, 'my_team'); assert.equal(my.members.length, 10);
  const extra = await db.player('第十一人', { exp: LV10 });
  await fails(extra, 'join_team', [my.code], 'full');
  await fails(low, 'join_team', [my.code], 'level');
  await fails(extra, 'join_team', ['ZZZZZZ'], 'no team');
  ok('加入：邀請碼（大小寫都可以）、Lv1 球隊最多 10 人、等級不夠不能加入');

  const [p0, p1, p2, p3] = players;
  await call(cap, 'set_member_role', [p0, 'vice']); await call(cap, 'set_member_role', [p1, 'vice']);
  await fails(cap, 'set_member_role', [p2, 'vice'], 'too many vice');
  await fails(p0, 'set_member_role', [p2, 'vice'], 'not owner');
  await fails(p0, 'kick_member', [p1], 'no permission');   // 副隊長不能踢副隊長
  await fails(p2, 'kick_member', [p3], 'no permission');   // 隊員不能踢人
  await fails(p0, 'kick_member', [cap], 'no permission');
  await call(p0, 'kick_member', [p3]);                      // 副隊長可以踢隊員
  my = await call(cap, 'my_team'); assert.equal(my.members.length, 9);
  assert.deepEqual(my.members.slice(0, 3).map((m) => m.role), ['owner', 'vice', 'vice'], '成員照職位排');
  const hist = await call(p3, 'my_team_history'); assert.equal(hist.length, 1); assert.equal(hist[0].team, '台北排球'); assert.equal(hist[0].how, 'kick');
  await fails(p3, 'join_team', [my.code], 'cooldown');      // 被踢 24 小時內不能再加入
  ok('職位：副隊長最多 2 個、只有隊長能升降；踢人權限（副隊長只能踢隊員）；被踢會留紀錄、24 小時冷卻');

  // ---------- 申請、審核 ----------
  const a1 = await db.player('申請者', { exp: LV10 });
  const list = await call(a1, 'team_list', ['台北']);
  assert.equal(list.length, 1); assert.equal(list[0].members, 9); assert.equal(list[0].cap, 10); assert(!('code' in list[0]), '列表不能看到邀請碼');
  await call(a1, 'apply_team', [t.id]);
  assert.equal((await call(a1, 'team_list', ['']))[0].applied, true);
  await fails(p2, 'team_applications', [], 'not manager');
  const apps = await call(p0, 'team_applications'); assert.equal(apps.length, 1); assert.equal(apps[0].nickname, '申請者');
  await call(p0, 'decide_application', [a1, true]);
  my = await call(cap, 'my_team'); assert.equal(my.members.length, 10); assert.equal(my.applications, 0);
  const a2 = await db.player('又一個', { exp: LV10 });
  await fails(a2, 'apply_team', [t.id], 'full');
  await call(cap, 'set_team_open', [false]);
  const a3 = await db.player('關門', { exp: LV10 });
  await fails(a3, 'apply_team', [t.id], 'closed');
  await call(cap, 'set_team_open', [true]);
  ok('申請：球隊列表（不露邀請碼）、申請→副隊長同意就加入、滿了不能申請、關閉申請');

  // ---------- 公佈欄 ----------
  await fails(p2, 'post_notice', ['隊員不能發', false], 'not manager');
  await fails(cap, 'post_notice', ['', false], 'bad notice');
  await fails(cap, 'post_notice', ['x'.repeat(201), false], 'bad notice');
  await fails(cap, 'post_notice', ['去死啦', false], 'bad notice');
  for (let i = 0; i < 12; i++) await call(i % 2 ? cap : p0, 'post_notice', ['公告 ' + i, false]);
  await call(cap, 'post_notice', ['置頂：週六練球', true]);
  my = await call(cap, 'my_team');
  assert.equal(my.board.length, 10, '最多留 10 則'); assert.equal(my.board[0].body, '置頂：週六練球'); assert.equal(my.board[0].pinned, true);
  await call(cap, 'post_notice', ['新的置頂', true]);
  my = await call(cap, 'my_team'); assert.equal(my.board.filter((b) => b.pinned).length, 1, '置頂只能 1 則');
  await call(p0, 'delete_notice', [my.board[1].id]);
  assert.equal((await call(cap, 'my_team')).board.length, 9);
  ok('公佈欄：只有隊長／副隊長能發、1～200 字、擋不雅字、最多 10 則、置頂只有 1 則、可以刪');

  // ---------- 捐金幣、比賽經驗、升級 ----------
  await fails(p2, 'donate_coins', [100], 'coins');
  await db.query('update public.player_progress set coins = 4000 where user_id = $1', [p2]);
  const d = await call(p2, 'donate_coins', [2900]);
  assert.equal(d.coins, 1100); assert.equal(d.funds, 2900);
  const rec = (uid, id, xp) => db.query("insert into public.match_records(user_id, match_id, payload, exp_gain, coin_gain) values ($1, $2, '{}', $3, 0)", [uid, id, xp]);
  await rec(p2, 'match-0001', 200); await rec(p2, 'match-0002', 200);   // 第二場只算 100（每天上限 300）
  await rec(extra, 'match-0003', 999);                                    // 沒有球隊：不影響
  my = await call(cap, 'my_team');
  assert.equal(my.exp, 2900 + 300); assert.equal(my.level, 2); assert.equal(my.cap, 15); assert.equal(my.next, 8000); assert.equal(my.funds, 2900);
  assert.equal(my.members.find((m) => m.id === p2).contrib, 3200);
  assert(my.log.some((l) => l.kind === 'levelup' && l.data.level === 2), '升級記在動態');
  await db.query("update public.team_members set day = public.team_today() - 1 where user_id = $1", [p2]);
  await rec(p2, 'match-0004', 50);
  assert.equal((await call(cap, 'my_team')).exp, 3250, '隔天上限重算');
  ok('經驗：捐金幣 1:1 變資金＋經驗、隊員比賽經驗自動算進球隊（每人每天 300）、升到 Lv2 人數上限變 15');

  // ---------- 轉讓、離開、解散、紀念 ----------
  await fails(p0, 'transfer_owner', [p2], 'not owner');
  await call(cap, 'transfer_owner', [p2]);
  my = await call(p2, 'my_team'); assert.equal(my.myRole, 'owner'); assert.equal(my.owner, p2);
  assert.equal(my.members.find((m) => m.id === cap).role, 'vice', '舊隊長變副隊長');
  await call(p2, 'leave_team');   // 隊長離開：交給最早加入的副隊長
  my = await call(cap, 'my_team'); assert.equal(my.myRole, 'owner', '副隊長裡最早加入的接隊長');
  await fails(p2, 'create_team', ['新隊'], 'cooldown');
  await call(cap, 'set_team_name', ['台北排球隊']);
  await fails(p0, 'set_team_name', ['亂改'], 'not owner');
  await fails(p0, 'disband_team', [], 'not owner');
  const before = (await call(cap, 'my_team')).members.map((m) => m.id);
  await call(cap, 'disband_team');
  for (const id of before) { const h = await call(id, 'my_team_history'); assert.equal(h[0].team, '台北排球隊'); assert.equal(h[0].how, 'disband'); assert.equal(await call(id, 'my_team'), null); }
  assert.equal((await db.query('select count(*)::int n from public.team_board')).rows[0].n, 0, '解散後公佈欄一起刪');
  await db.query("update public.player_progress set coins = 1000 where user_id = $1", [p0]);
  await call(p0, 'create_team', ['新的開始']);   // 解散不算冷卻
  ok('轉讓隊長、隊長離開自動交給副隊長、改隊名、解散（每個人都留紀念、解散不算冷卻）');

  // ---------- 權限：表格不能直接改、沒登入不能用 ----------
  await assert.rejects(db.as(p0, "update public.teams set funds = 999999"), /permission denied/);
  await assert.rejects(db.as(p0, "insert into public.team_board(team_id, body) select id, 'x' from public.teams limit 1"), /permission denied/);
  await assert.rejects(db.as(p0, 'select * from public.team_history'), /permission denied/);
  await assert.rejects(db.as(p0, "select public.team_add_exp(id, 99999) from public.teams limit 1"), /permission denied/);
  await assert.rejects(call(null, 'my_team'), /not signed in/);
  ok('權限：表格不能直接改、內部小工具不能從外面呼叫、沒登入不能用');

  // ---------- 每個資料庫錯誤都有中文訊息 ----------
  const { teamError } = await import(require('node:url').pathToFileURL(require('node:path').join(__dirname, '../js/auth.js')).href);
  const sql019 = require('node:fs').readFileSync(require('node:path').join(__dirname, '../supabase/019_team_guild.sql'), 'utf8');
  const codes = [...new Set([...sql019.matchAll(/raise exception '([^']+)'/g)].map((m) => m[1]))];
  for (const c of codes) assert(!teamError({ message: c }).startsWith('球隊操作失敗'), `資料庫錯誤「${c}」沒有中文訊息`);
  assert.equal(teamError({ code: 'PGRST202', message: '' }).includes('019'), true);
  ok(`資料庫的 ${codes.length} 種錯誤都有中文訊息`);

  // ---------- 舊球隊（004 建的）升級後隊長補上職位 ----------
  const old = await db.player('老隊長', { exp: LV10 });
  const ot = (await db.query("insert into public.teams(code, name, owner) values ('OLD123', '老球隊', $1) returning id", [old])).rows[0].id;
  await db.query("insert into public.team_members(user_id, team_id) values ($1, $2)", [old, ot]);
  await db.exec(require('node:fs').readFileSync(require('node:path').join(__dirname, '../supabase/019_team_guild.sql'), 'utf8'));   // 可重複執行
  assert.equal((await call(old, 'my_team')).myRole, 'owner');
  ok('019 可以重複執行；舊球隊的隊長自動變成隊長職位');
})().catch((e) => { console.error(e); process.exit(1); });
