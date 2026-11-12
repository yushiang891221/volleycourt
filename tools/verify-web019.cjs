const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const gym = fs.readFileSync(path.join(root, 'gym.html'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'match-result.js'), 'utf8');
const old = cp.execFileSync('git', ['show', '6b309f6:gym.html'], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
const blank = { k: 0, b: 0, a: 0, as: 0, fs: 0, rc: 0, eb: 0, t: 50, e: 8, st: 0, sp: 0, bt: 0, sv: 0, es: 0 };
const teams = [Array.from({ length: 6 }, (_, i) => `a${i}`), Array.from({ length: 6 }, (_, i) => `b${i}`)];
function run(source, tp = [33, 50], score = [0, 2], six = true) {
  const pf = Object.fromEntries(teams.flat().map(id => [id, { ...blank }]));
  pf.a0 = { ...blank, as: 15, fs: 1, rc: 20, eb: 5, t: 86, e: 15, st: 40 };
  const ctx = { VM: { team: teams, six, sets: score, sc: score }, MREC: { tp }, mrecPf: id => pf[id] };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function vmRateMatch()'), source.indexOf('function vmSendResult()')), ctx);
  return ctx.vmRateMatch();
}
const before = run(old), loss = run(gym), win = run(gym, [50, 33], [2, 0]);
assert.equal(before.rate.a0.rt, 84);
assert(loss.rate.a0.rt >= 45 && loss.rate.a0.rt <= 70);
assert(['B', 'C'].includes(loss.rate.a0.gr));
assert(teams[1].includes(loss.mvp));
assert.equal(loss.bestLoser, 'a0');
assert.equal(win.mvp, 'a0');
assert.equal(JSON.stringify(loss.rate.a0.hx), JSON.stringify(before.rate.a0.hx));
assert.equal(loss.rate.a0.c, win.rate.a0.c);
const exactDelta = 0.15 * ((65 + (50 / 83 - 0.5) * 140) - (45 - (0.5 - 33 / 83) * 150));
assert(Math.abs(win.rate.a0.rt - loss.rate.a0.rt - exactDelta) < 1);
/* 指定公式只能增加約 7.45 分；保留這項衝突，不竄改公式以湊足 12 分。 */
assert(exactDelta < 12);
for (const [tp, scores, expected] of [
  [[100, 0], [2, 0], [100, 0]], [[51, 49], [2, 1], [66, 44]],
  [[49, 51], [1, 2], [44, 66]], [[0, 100], [0, 2], [0, 100]],
  [[40, 60], [2, 1], [65, 45]]
]) {
  const r = run(gym, tp, scores);
  assert.equal(r.rate.a0.w, expected[0]); assert.equal(r.rate.b0.w, expected[1]);
}
const tie = run(gym, [40, 40], [1, 1]);
assert.equal(tie.mvp, null); assert.equal(tie.bestLoser, null); assert.equal(tie.rate.a0.w, 50);
assert.equal(Object.keys(run(gym, [0, 0]).rate).length, 0);
assert.equal(Object.keys(run(gym, [33, 50], null).rate).length, 0);
assert.equal(Object.keys(run(gym, [33, 50], [0, 0]).rate).length, 0);
assert.equal(Object.keys(run(gym, [33, 50], [-1, 2]).rate).length, 0);
assert(teams[0].includes(run(gym, [25, 20], [25, 20], false).mvp));
const barCtx = {}; vm.createContext(barCtx);
vm.runInContext(panel.match(/const BARS = .*;/)[0] + ';globalThis.bars = BARS;', barCtx);
assert.equal(barCtx.bars.reduce((sum, b) => sum + b[2], 0), 100);
assert.equal(JSON.stringify(barCtx.bars.map(b => b[2])), '[30,20,15,20,15]');
for (const r of Object.values(loss.rate)) assert.equal(r.gr, r.rt >= 90 ? 'S' : r.rt >= 75 ? 'A' : r.rt >= 60 ? 'B' : r.rt >= 40 ? 'C' : 'D');
const element = { innerHTML: '', querySelector: () => ({}) };
const ui = { document: { getElementById: () => element }, console };
vm.createContext(ui); vm.runInContext(panel.replaceAll('export function', 'function'), ui);
ui.showMatchResult({ won: false, final: '0：2', my: loss.rate.a0, isMvp: false, st: blank, rate: loss.rate, mvp: loss.mvp, bestLoser: loss.bestLoser, teams, myTeam: 0, me: 'a0', nameOf: id => id, teamLabel: String });
assert.equal((element.innerHTML.match(/class="mr-best-loser"/g) || []).length, 2);
assert(element.innerHTML.includes('比賽結果 <small>15%'));
assert(element.innerHTML.includes('整隊評分會往下修'));
assert(!element.innerHTML.includes('undefined'));
assert(ui.commentary({ ...win.rate.a0, w: 100 }, blank, true, true).includes('贏得漂亮'));
const guards = { ROOM: { isHost: true }, MREC: { id: 'match' }, vmIsPractice: () => true };
vm.createContext(guards);
vm.runInContext(gym.slice(gym.indexOf('function vmSendResult()'), gym.indexOf('// 我是不是這一波的舉球員')), guards);
guards.vmSendResult();
guards.vmIsPractice = () => false;
guards.vmRateMatch = () => ({ rate: {} });
guards.vmSendResult();
guards.vmMe = () => 'a0';
/* 缺比分必須在讀個人統計、匯入面板或記錄戰績前返回。 */
guards.vmGotResult({ id: 'match', team: teams, six: true, sets: null }).then(() => console.log('缺比分不顯示、不記錄：通過'));
assert(gym.includes('bestLoser: RT.bestLoser'));
assert(gym.includes('bestLoser: d.bestLoser'));
assert(gym.includes('!ROOM.isHost || vmIsPractice() || !MREC.id'));
console.log(JSON.stringify({ before: before.rate.a0, loss: loss.rate.a0, win: win.rate.a0, exactDelta }, null, 2));
console.log('WEB-019 公式與流程測試通過；工作單至少 12 分條件與指定公式衝突（實際整數差 ' + (win.rate.a0.rt - loss.rate.a0.rt) + ' 分）。');
