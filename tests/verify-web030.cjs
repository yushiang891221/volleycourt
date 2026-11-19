// WEB-030 積分加減（server/shared/elo.mjs）與段位（js/ranks.js）
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const { rankedChanges } = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'shared', 'elo.mjs')).href);
  const R = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'ranks.js')).href);
  const p = (player, rating) => ({ player, rating });
  const by = (list, who) => list.find(c => c.player === who);

  // 實力相當：贏 +50、輸 -50
  let c = rankedChanges({ teams: [[p('a', 1500), p('b', 1500)], [p('c', 1500), p('d', 1500)]], n: 2, lv: 3, winner: 0 });
  assert.equal(by(c, 'a').delta, 50); assert.equal(by(c, 'c').delta, -50); assert.equal(by(c, 'c').won, false);

  // 打贏強很多的接近 +100、打贏弱很多的最少 +1；一場不超過 100
  c = rankedChanges({ teams: [[p('a', 1000)], [p('c', 9000)]], n: 1, lv: 3, winner: 0 });
  assert.ok(by(c, 'a').delta >= 99 && by(c, 'a').delta <= 100); assert.ok(by(c, 'c').delta <= -99);
  c = rankedChanges({ teams: [[p('a', 9000)], [p('c', 1000)]], n: 1, lv: 3, winner: 0 });
  assert.equal(by(c, 'a').delta, 1); assert.equal(by(c, 'c').delta, -1);

  // 隊伍分數含 AI：AI 的分數＝它的強度對應的積分（1.25 級＝1500 分）；1000 分的人＋AI（平均 1250）對兩個 AI（1500）→ 預期勝率低、加得多；但真人比較多（1 對 0）打 7 折
  c = rankedChanges({ teams: [[p('a', 1000)], []], n: 2, lv: 1.25, winner: 0 });
  const E = 1 / (1 + 10 ** ((1500 - 1250) / 2000));
  assert.equal(by(c, 'a').delta, Math.round(100 * (1 - E) * 0.7));

  // 真人比較多的一隊贏了打 7 折
  const fair = rankedChanges({ teams: [[p('a', 1500), p('b', 1500)], [p('c', 1500), p('d', 1500)]], n: 2, lv: 3, winner: 0 });
  const more = rankedChanges({ teams: [[p('a', 1500), p('b', 1500)], [p('c', 1500)]], n: 2, lv: 1.25, winner: 0 });
  assert.equal(by(more, 'a').delta, Math.round(by(fair, 'a').delta * 0.7));

  // 4500 以上打贏全 AI 不加分；輸了照扣
  c = rankedChanges({ teams: [[p('a', 4600)], []], n: 2, lv: 5, winner: 0 });
  assert.equal(by(c, 'a').delta, 0);
  c = rankedChanges({ teams: [[p('a', 4600)], []], n: 2, lv: 5, winner: 1 });
  assert.ok(by(c, 'a').delta < 0);

  // 中途離開：隊伍贏了也算輸
  c = rankedChanges({ teams: [[p('a', 1500), p('b', 1500)], [p('c', 1500), p('d', 1500)]], n: 2, lv: 3, winner: 0, left: ['b'] });
  assert.equal(by(c, 'a').won, true); assert.equal(by(c, 'b').won, false); assert.ok(by(c, 'b').delta < 0);

  // 分數最低 0
  c = rankedChanges({ teams: [[p('a', 20)], [p('c', 20)]], n: 1, lv: 3, winner: 1 });
  assert.equal(by(c, 'a').after, 0);

  // 段位表
  assert.equal(R.tierOf(0), '菜雞'); assert.equal(R.tierOf(1000), '菜雞'); assert.equal(R.tierOf(1001), '新手');
  assert.equal(R.tierOf(5000), '野場NPC'); assert.equal(R.tierOf(5001), '系隊支柱'); assert.equal(R.tierOf(9999), '校隊先發'); assert.equal(R.tierOf(10000), '職業隊');
  assert.deepEqual(R.rankView({ rating: 1200, games: 3 }), { rating: 1200, placed: 3, tier: null }, '定級中不顯示段位');
  assert.deepEqual(R.rankView({ rating: 1200, games: 10 }), { rating: 1200, placed: 10, tier: '新手' });
  // 打完結算（server/shared/ranked-result.mjs）：照伺服器裁判送的結果算每個人、寫進資料庫、回傳給畫面
  const { settleRanked } = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'shared', 'ranked-result.mjs')).href);
  const rk = { plan: { count: 2, lv: 3, picks: ['qa', 'qb', 'qc', null] }, byId: new Map([['qa', 'A'], ['qb', 'B'], ['qc', 'C']]) };
  const ratingsOf = async (ps) => new Map(ps.map(x => [x, { rating: 1500, games: x === 'A' ? 12 : 0 }]));
  let sent = null;
  const reportMatch = async (code, mode, ch) => { sent = { code, mode, ch }; return { ratings: Object.fromEntries(ch.map(x => [x.player, x.after])) }; };
  // 伺服器裡隊伍順序可能跟座位表不一樣：以 d.team 為準（qc 在第 0 隊）
  let r = await settleRanked({ code: 'ROOMX', rk, d: { sc: [25, 20], team: [['qc', 'ai1'], ['qa', 'qb']], six: false, bo: 1 }, present: new Set(['qa', 'qb', 'qc']), ratingsOf, reportMatch });
  assert.equal(sent.code, 'ROOMX'); assert.equal(sent.mode, '2v2');
  assert.equal(r.list.qc.won, true); assert.ok(r.list.qc.delta > 0); assert.equal(r.list.qa.won, false); assert.ok(r.list.qa.delta < 0);
  assert.equal(r.list.qa.tier, '新手', '已打滿 10 場顯示段位'); assert.equal(r.list.qc.tier, null, '定級中'); assert.equal(r.saved, true);
  // 中途離開（打完時不在房間）：隊伍贏了也算輸
  r = await settleRanked({ code: 'ROOMY', rk, d: { sc: [25, 20], team: [['qa', 'qb'], ['qc', 'ai1']] }, present: new Set(['qa', 'qc']), ratingsOf, reportMatch });
  assert.equal(r.list.qa.won, true); assert.equal(r.list.qb.won, false);
  // 6 對 6／多局看局數；平手不算
  r = await settleRanked({ code: 'ROOMZ', rk, d: { sc: [10, 25], sets: [2, 1], six: true, team: [['qa', 'qb'], ['qc']] }, present: new Set(['qa', 'qb', 'qc']), ratingsOf, reportMatch });
  assert.equal(r.list.qa.won, true);
  assert.equal(await settleRanked({ code: 'ROOMW', rk, d: { sc: [5, 5] }, present: new Set(), ratingsOf, reportMatch }), null);
  // 資料庫寫不進去：saved 是 false，畫面會顯示「這場積分沒有記錄」
  r = await settleRanked({ code: 'ROOMV', rk, d: { sc: [25, 20], team: [['qa', 'qb'], ['qc']] }, present: new Set(['qa', 'qb', 'qc']), ratingsOf, reportMatch: async () => null });
  assert.equal(r.saved, false);
  console.log('WEB-030 積分加減與段位檢查通過');
})().catch(e => { console.error(e); process.exit(1); });
