const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const gym = read('gym.html');
const source = gym.slice(gym.indexOf('const MREC ='), gym.indexOf('// 整場評分（0～100）'));
function point({ role = 'OH', six = true, kind = 'spike', quick = false, self = false, rotate, win = 0 } = {}) {
  const VM = { six, role: { attacker: role }, sc: [0, 0], to: 25, touch: { team: 0, n: self ? 1 : 2 } };
  const c = { VM, performance: { now: () => 1000 }, vmTeamOf: () => 0, vmPos: () => null };
  vm.createContext(c);
  vm.runInContext(source, c);
  vm.runInContext("mrecReset('web013-test')", c);
  if (quick) vm.runInContext("MREC.last = { id: 'setter', kind: 'set', team: 0, t: 500 }", c);
  c.vmPerfTouch('attacker', kind);
  if (rotate) VM.role.attacker = rotate;
  c.vmPerfPoint(win);
  return vm.runInContext("mrecPf('attacker')", c);
}
assert.equal(point().kc, 1);
for (const options of [{ role: 'OPP' }, { role: 'MB' }, { quick: true }, { kind: 'tip' }, { kind: 'hit' }, { self: true }, { six: false }, { role: null }]) {
  const p = point(options);
  assert.equal(p.kc, 0, JSON.stringify(options));
  assert.equal(p.k, 1, '原有扣球得分照舊');
}
assert.equal(point({ rotate: 'MB' }).kc, 1, '擊球後 OH 轉到 MB 仍計分');
assert.equal(point({ role: 'MB', rotate: 'OH' }).kc, 0, '擊球後轉到 OH 不計分');
assert.equal(point({ win: 1 }).kc, 0, '失分不計入');
assert.equal(point({ win: 1 }).k, 0);
assert.equal(point({ quick: true }).qk, 1);
assert.equal(point({ self: true }).ss, 1);
const perfLine = gym.split('\n').find(line => line.includes('const perf = { rt:'));
assert(perfLine.includes('kc: hp.kc | 0'));
const progress = read('progress.js');
for (const [i, n] of [100, 500, 1000, 3000, 5000].entries()) {
  assert(progress.includes(`cannon${i + 1}: [p.cannon_kills | 0, ${n}]`));
  assert(progress.includes(`在大砲（OH）位置扣球得分累計 ${n} 分（快攻、吊球不算）`));
}
const old = read('server/supabase/009_match_rating.sql');
const sql = read('server/supabase/011_cannon_oh.sql');
assert(sql.includes('add column if not exists cannon_kills integer not null default 0'));
const accumulation = "  r.cannon_kills := r.cannon_kills + least(greatest(coalesce((p_perf->>'kc')::int, 0), 0), 150);\n";
assert(sql.includes(accumulation));
assert.equal((sql.match(/if r.cannon_kills >= \d+ and not 'cannon[1-5]'/g) || []).length, 5);
const restored = sql.replace(/-- WEB-013[^\n]*\n/, '').replace('alter table public.player_progress add column if not exists cannon_kills integer not null default 0;\n', '').replace(accumulation, '').replace(/if r.cannon_kills >=/g, 'if r.kills >=').replace('    cannon_kills = r.cannon_kills, kills = r.kills,', '    kills = r.kills,');
assert.equal(restored, old, '除了新欄位、計數讀取與累加儲存、重砲判斷外，009 必須逐字相同');
console.log('PASS WEB-013 大砲計數、排除條件、擊球位置快照、既有計分、傳送欄位、成就顯示及 SQL 差異');
