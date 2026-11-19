// WEB-029 快速配對：server/shared/matchmaker.mjs 的配對規則（假時鐘，不開伺服器）
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const M = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'shared', 'matchmaker.mjs')).href);
  let t = 0;
  const mk = () => M.createMatchmaker({ now: () => t });
  const ppl = (tag, n, rating = 1000) => Array.from({ length: n }, (_, i) => ({ player: `${tag}${i}`, name: `${tag}${i}`, rating }));
  const step = (mm, sec) => { const out = []; for (let i = 0; i < sec; i++) { t += 1000; out.push(...mm.tick()); } return out; };
  const humans = m => m.teams.map(x => x.length);

  // AI 強度照積分內插（2026-11-19）：0 分 0.6 級、1000 新手、3000 球友、5000 高手、8000 校隊、10000 以上企聯；0.05 級一格
  assert.equal(M.aiLevelFor(0), 0.6); assert.equal(M.aiLevelFor(1000), 1); assert.equal(M.aiLevelFor(2000), 1.5); assert.equal(M.aiLevelFor(9000), 4.5); assert.equal(M.aiLevelFor(20000), 5);
  assert.equal(M.aiRatingFor(3), 5000); assert.equal(M.aiRatingFor(M.aiLevelFor(6500)), 6500);
  assert.deepEqual(M.RANKED_RULES, { to: 15, bestOf: 1 });

  // 單人 2v2，沒人 → 15 秒後 AI 補位
  t = 0; let mm = mk(); mm.add({ key: 's1', mode: '2v2', players: ppl('a', 1) });
  assert.equal(step(mm, 14).length, 0);
  let got = step(mm, 1); assert.equal(got.length, 1); assert.deepEqual(humans(got[0]), [1, 0]); assert.deepEqual(got[0].ai, [1, 2]);

  // 兩個單人 2v2 → 同一場、各在一邊（真人數一樣優先）
  t = 0; mm = mk(); mm.add({ key: 's1', mode: '2v2', players: ppl('a', 1) }); mm.add({ key: 's2', mode: '2v2', players: ppl('b', 1) });
  got = step(mm, 1); assert.equal(got.length, 1); assert.deepEqual(humans(got[0]), [1, 1]);

  // 2v2：組隊 2 人 ＋ 兩個單人 → 2 對 2 全真人
  t = 0; mm = mk(); mm.add({ key: 'p1', mode: '2v2', players: ppl('p', 2) }); mm.add({ key: 's1', mode: '2v2', players: ppl('a', 1) }); mm.add({ key: 's2', mode: '2v2', players: ppl('b', 1) });
  got = step(mm, 1); assert.equal(got.length, 1); assert.deepEqual(humans(got[0]), [2, 2]);

  // 6v6：4 人隊 vs 2 人隊＋2 單排 → 湊成 4 對 4（隊伍不拆開）
  t = 0; mm = mk(); mm.add({ key: 'p4', mode: '6v6', players: ppl('x', 4) }); mm.add({ key: 'p2', mode: '6v6', players: ppl('y', 2) });
  mm.add({ key: 's1', mode: '6v6', players: ppl('a', 1) }); mm.add({ key: 's2', mode: '6v6', players: ppl('b', 1) });
  got = step(mm, 5); assert.equal(got.length, 1); assert.deepEqual(humans(got[0]), [4, 4]);
  const teamOf = p => got[0].teams.findIndex(team => team.some(x => x.player === p));
  assert.ok(['x0', 'x1', 'x2', 'x3'].every(p => teamOf(p) === teamOf('x0')), '組隊的人在同一邊');
  assert.equal(teamOf('y0'), teamOf('y1'));

  // 4 人隊 vs 1 人：差 3 超過 6v6 允許的 2 → 不配；4 人以上 30 秒後 AI 補
  t = 0; mm = mk(); mm.add({ key: 'p4', mode: '6v6', players: ppl('x', 4) }); mm.add({ key: 's1', mode: '6v6', players: ppl('a', 1), since: 20000 });
  assert.equal(step(mm, 29).filter(m => m.keys.includes('p4')).length, 0);
  got = step(mm, 1).filter(m => m.keys.includes('p4')); assert.equal(got.length, 1); assert.deepEqual(humans(got[0]), [4, 0]);

  // 10 秒前要真人數一樣；10 秒後 2v2 允許差 1
  t = 0; mm = mk(); mm.add({ key: 'p2', mode: '2v2', players: ppl('x', 2) }); mm.add({ key: 's1', mode: '2v2', players: ppl('a', 1) });
  assert.equal(step(mm, 9).length, 0);
  got = step(mm, 1); assert.equal(got.length, 1); assert.deepEqual(humans(got[0]), [2, 1]);

  // 分數範圍：差 1500 的兩人，10 秒內不配、10 秒後配
  t = 0; mm = mk(); mm.add({ key: 'lo', mode: '2v2', players: ppl('l', 1, 1000) }); mm.add({ key: 'hi', mode: '2v2', players: ppl('h', 1, 2500) });
  assert.equal(step(mm, 9).length, 0); assert.equal(step(mm, 1).length, 1);

  // 不同模式不會配在一起
  t = 0; mm = mk(); mm.add({ key: 'a', mode: '2v2', players: ppl('a', 1) }); mm.add({ key: 'b', mode: '6v6', players: ppl('b', 1) });
  assert.equal(step(mm, 3).length, 0);

  // 直接用 AI 開打：10 秒前無效、10 秒後下一輪就開
  t = 0; mm = mk(); mm.add({ key: 's1', mode: '2v2', players: ppl('a', 1) });
  step(mm, 5); assert.equal(mm.aiNow('s1'), false); step(mm, 5); assert.equal(mm.aiNow('s1'), true); assert.equal(step(mm, 1).length, 1);

  // 取消後不會被配到
  t = 0; mm = mk(); mm.add({ key: 's1', mode: '2v2', players: ppl('a', 1) }); mm.remove('s1'); mm.add({ key: 's2', mode: '2v2', players: ppl('b', 1) });
  got = step(mm, 1); assert.equal(got.length, 0);

  // 座位表：每邊 n 格、AI 是 null、真人有自己的房間 id 和暱稱、房主是第一隊的人
  const plan = M.planFor({ n: 6, lv: 3, teams: [ppl('x', 4), ppl('y', 2)] });
  assert.equal(plan.picks.length, 12); assert.equal(plan.picks.slice(0, 6).filter(Boolean).length, 4); assert.equal(plan.picks.slice(6).filter(Boolean).length, 2);
  assert.equal(Object.keys(plan.names).length, 6); assert.ok(plan.picks.slice(0, 6).includes(plan.host)); assert.equal(plan.ids.get('x0').length, 11);

  // 接大廳：隊長才能開始、狀態每秒送、配到送 mm-found、隊伍變動取消
  t = 0; const inbox = new Map(), socks = [];
  const sock = (id, player, name) => { const ws = { meta: { id, player, name } }; socks.push(ws); inbox.set(player, []); return ws; };
  let party = { id: 'P', mode: '2v2', leader: 'A', players: ['A', 'B'] };
  const R = M.createRanked({ send: (ws, o) => inbox.get(ws.meta.player).push(o), sockets: () => socks, parties: { partyOf: p => party && party.players.includes(p) ? party : null }, now: () => t,
    openRoom: m => { const pl = M.planFor(m); return { forPlayer: p => ({ room: 'ROOM1', mode: m.mode, me: pl.ids.get(p), host: pl.host === pl.ids.get(p) }) }; } });
  const a = sock('ca', 'A', '阿明'), b = sock('cb', 'B', '小晴'), c = sock('cc', 'C', '阿哲');
  const lastOf = (p, k) => inbox.get(p).filter(o => o.k === k).pop();
  R.handle(b, { k: 'mm-start', mode: '2v2' }); assert.equal(lastOf('B', 'mm-error').reason, '只有隊長可以開始配對');
  R.handle(a, { k: 'mm-start', mode: '6v6' }); assert.equal(lastOf('A', 'mm-error').reason, '隊伍模式和選的模式不一樣');
  R.handle(a, { k: 'mm-start', mode: '2v2' }); assert.equal(lastOf('B', 'mm-status').state, 'searching');
  party = { ...party, players: ['A'] }; t += 1000; R.tick();
  assert.equal(lastOf('A', 'mm-status').state, 'idle'); assert.equal(lastOf('A', 'mm-status').reason, '隊伍有變動，已取消配對');
  party = { id: 'P', mode: '2v2', leader: 'A', players: ['A', 'B'] };
  R.handle(a, { k: 'mm-start', mode: '2v2' }); R.handle(c, { k: 'mm-start', mode: '2v2' });
  t += 1000; R.tick(); assert.equal(lastOf('C', 'mm-found'), undefined, '2 人對 1 人：10 秒內不配');
  assert.equal(lastOf('C', 'mm-status').note, '正在找 1 人隊伍');
  t += 9000; R.tick();
  for (const p of ['A', 'B', 'C']) { const f = lastOf(p, 'mm-found'); assert.ok(f && f.room === 'ROOM1' && /^q[0-9a-f]{10}$/.test(f.me), p + ' 收到 mm-found'); }
  assert.equal(['A', 'B', 'C'].filter(p => lastOf(p, 'mm-found').host).length, 1, '只有一個人帶房間流程');
  R.handle(c, { k: 'mm-cancel' }); assert.equal(lastOf('C', 'mm-status').state, 'idle');
  R.stop();
  console.log('WEB-029 配對規則檢查通過');
})().catch(e => { console.error(e); process.exit(1); });
