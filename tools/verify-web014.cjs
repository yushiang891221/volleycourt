const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const sql = read('server/supabase/012_role_wins.sql');
assert.equal(sql.replace(/-- WEB-014 BEGIN\n[\s\S]*?-- WEB-014 END\n/g, ''), read('server/supabase/011_cannon_oh.sql'));
assert(sql.includes("role_wins jsonb not null default '{}'::jsonb"));
assert(sql.includes('role_wins = r.role_wins,'));
assert(sql.indexOf('if not found then return') < sql.indexOf('if p_won and'));
assert(sql.indexOf('for update;') < sql.indexOf('if p_won and'));
const legal = sql.match(/if p_won and p_perf->>'role' in \(([^)]+)\) then/)[1].match(/[A-Z]+/g);
assert.deepEqual(legal, ['OH', 'S', 'MB', 'OPP']);
assert(sql.includes("r.role_wins := jsonb_set(r.role_wins, array[p_perf->>'role'], to_jsonb(coalesce((r.role_wins->>(p_perf->>'role'))::int, 0) + 1), true);"));
const rules = [...sql.matchAll(/if coalesce\(\(r.role_wins->>'(\w+)'\)::int, 0\) >= (\d+) and not '(\w+)' = any\(ach\) then got := array_append\(got, '(\w+)'\); end if;/g)];
assert.equal(rules.length, 16);
function record(state, won, role) {
  if (won && legal.includes(role)) state.role_wins[role] = (state.role_wins[role] || 0) + 1;
  const got = rules.filter(([, r, n, id, appended]) => {
    assert.equal(id, appended);
    return (state.role_wins[r] || 0) >= Number(n) && !state.achievements.includes(id);
  }).map(rule => rule[3]);
  state.achievements.push(...got);
  return got;
}
for (const [won, role, expected] of [[true, 'OH', 1], [false, 'OH', 0], [true, undefined, 0], [true, 'X', 0]]) {
  const state = { role_wins: {}, achievements: [] };
  record(state, won, role);
  assert.equal(state.role_wins.OH || 0, expected);
}
const progress = {};
vm.createContext(progress);
vm.runInContext(read('progress.js').replace(/export /g, '') + '\nthis.defs = { ACHIEVEMENTS, ACH_SERIES, ACH_CATS, achProgress };', progress);
const P = progress.defs;
for (const [role, name] of [['OH', '攻擊手'], ['S', '舉球員'], ['MB', '中間手'], ['OPP', '對角球員']]) {
  for (const [i, n] of [10, 100, 500, 1000].entries()) {
    const id = role.toLowerCase() + n;
    const state = { role_wins: { [role]: n - 1 }, achievements: [] };
    assert(!record(state, false, role).includes(id));
    assert(record(state, true, role).includes(id));
    assert.equal(state.role_wins[role], n);
    assert.deepEqual(record(state, true, role), []);
    assert.equal(P.ACHIEVEMENTS[id].name, ['初階', '進階', '優良', '最佳'][i] + name);
    assert.equal(P.ACHIEVEMENTS[id].title, P.ACHIEVEMENTS[id].name);
    assert.equal(P.achProgress(id, state)[0], n + 1);
    assert.equal(P.achProgress(id, {})[0], 0);
    assert.equal(P.achProgress(id, state)[1], n);
    const series = P.ACH_SERIES.find(s => s.tiers.includes(id));
    assert(series.icon && series.cat === 'role');
    assert.equal(series.tiers.length, 4);
  }
}
assert(P.ACH_CATS.some(([id]) => id === 'role'));
const gym = read('gym.html');
let now = 0;
const VM = { host: true, six: true, team: [Array(6), Array(6)], role: { me: 'OH', peer: 'S' } };
const context = { VM, performance: { now: () => now } };
vm.createContext(context);
vm.runInContext(gym.slice(gym.indexOf('const MREC ='), gym.indexOf('const mrecPf =')), context);
vm.runInContext("mrecReset('web014-test')", context);
context.mrecRoles();
now = 6000;
VM.role.me = 'MB'; context.mrecRoles();
now = 10000;
assert.equal(context.mrecLongestRoles().me, 'OH');
assert.equal(context.mrecLongestRoles().peer, 'S');
now = 14000;
assert.equal(context.mrecLongestRoles().me, 'MB');
vm.runInContext("mrecReset('next-match')", context);
VM.six = false;
assert.equal(Object.keys(context.mrecLongestRoles()).length, 0);
VM.six = true; VM.team = [Array(3), Array(3)];
assert.equal(Object.keys(context.mrecLongestRoles()).length, 0);
const sendRole = gym.split('\n').find(line => line.includes('perf.role ='));
for (const [six, size, role, expected] of [[true, 6, 'OH', 'OH'], [false, 6, 'OH', undefined], [true, 3, 'OH', undefined], [true, 6, 'X', undefined], [true, 6, undefined, undefined]]) {
  const c = { d: { six, team: [Array(size), Array(size)], roles: { me: role } }, me: 'me', perf: {} };
  vm.runInNewContext(sendRole, c);
  assert.equal(c.perf.role, expected);
}
assert(gym.includes("roles: mrecLongestRoles()"));
const { engine } = require('./verify-web003a.cjs');
for (const tactics of ['specialized', 'rotation']) {
  const { c, VM: match } = engine();
  let elapsed = 0;
  c.performance = { now: () => elapsed };
  c.mrecReset('integration-web014');
  match.tactics = tactics;
  c.vm6Start({ id: 'court', x: 0, z: 0, rot: 0 }, -1, {}, [Array(6).fill(null), Array(6).fill(null)]);
  const id = match.rot[0][0], firstRole = match.role[id];
  elapsed = 9000;
  match.rot[0] = match.rot[0].slice(1).concat(id);
  c.vm6SyncRotationRoles();
  elapsed = 10000;
  assert.equal(c.mrecLongestRoles()[id], firstRole);
  elapsed = 20000;
  assert.equal(c.mrecLongestRoles()[id], match.role[id]);
}
assert(gym.slice(gym.indexOf('function vm6SyncRotationRoles()'), gym.indexOf('function vmSmallLabel')).includes('mrecRoles();'));
assert(read('character-panel.js').includes('P.achProgress(k, prog)'));
assert(read('character-panel.js').includes('P.ACH_CATS.map'));
assert(read('public-profile.js').includes('P.ACH_SERIES.find(series => series.tiers.includes(id))?.icon'));
assert(read('public-profile.js').includes('P.ACHIEVEMENTS[id].name'));
console.log('PASS WEB-014 位置時間、勝場門檻、重複解鎖、傳送條件、共用面板與 SQL 逐字差異');
