const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const acorn = require(require.resolve('acorn', { paths: [path.join(root, 'server')] }));
function functions(file, names) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  return acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body
    .filter(n => n.type === 'FunctionDeclaration' && names.includes(n.id.name))
    .map(n => source.slice(n.start, n.end)).join('\n');
}
function client(ranked) {
  const sent = [], timers = [];
  const rules = { isHost: true, count: 2, flow: { phase: 'playing', round: 1, court: 'c', picks: [] } };
  const c = { URLSearchParams, location: { search: ranked ? '?ranked=1' : '' }, performance: { now: () => 10000 }, console,
    NET: { tx: { kind: 'cf', publish: (t,d) => sent.push([t,d]) }, peers: new Map() }, VM: { on: false },
    ROOM: { isHost: true, host: 'p', snapshot: rules }, ROOM_UI: null, VB: {}, SRV_MODE: true,
    roomLaunched: -1, roomPlaced: -1, state: { items: [{ id: 'c' }] },
    renderRoomRules() {}, peerTagsAll() {}, vmMe: () => 'p', netStatus() {}, vmSay() {}, toast() {},
    setTimeout: fn => timers.push(fn), vmApplyRoomRules() {}, vmStart() { c.localStarts++; },
    localStarts: 0, vmStop() { c.stops++; }, stops: 0, drawScore() { c.draws++; }, draws: 0,
    vmGotResult() { c.results++; }, results: 0 };
  vm.createContext(c);
  vm.runInContext(functions('src/gym/game/07-net.js', ['roomRulesChanged', 'netRanked', 'srvJudgeStalled', 'srvJudgeFailed']), c);
  vm.runInContext(functions('src/gym/game/13-match-6v6.js', ['vmOnNet']), c);
  return { c, rules, sent, timers };
}
{
  const { c, rules, sent, timers } = client(true);
  c.roomRulesChanged(rules); timers.shift()();
  assert.equal(c.localStarts, 0); assert(!sent.some(([t]) => t === 'srv-stop'));
  assert(sent.some(([t]) => t === 'room-match-sync')); assert.equal(timers.length, 1);
  c.VM.on = true; timers.shift()(); assert.equal(timers.length, 0);
  Object.assign(c.VM, { host: false, hostId: 'srv' });
  c.srvJudgeFailed('超過 3 秒沒收到伺服器的比賽資料'); assert.equal(c.stops, 0);
  c.vmOnNet({ e: 'result', id: 'm', sc: [2,15], sets: [0,1] }, 'p'); assert.equal(c.results, 0);
  c.vmOnNet({ e: 'result', id: 'm', sc: [2,15], sets: [0,1] }, 'srv');
  assert.equal(c.VM.sc.join(':'), '2:15'); assert.equal(c.VM.phase, 'over'); assert.equal(c.draws, 1);
  c.vmOnNet({ e: 'result', id: 'm', sc: [2,15] }, 'srv'); assert.equal(c.results, 1);
}
{
  const { c, rules, sent, timers } = client(false);
  c.roomRulesChanged(rules); timers.shift()();
  assert.equal(c.localStarts, 1); assert(sent.some(([t]) => t === 'srv-stop'));
}
console.log('PASS ranked startup timeout, stalled referee, authoritative score, duplicate result, casual fallback');
