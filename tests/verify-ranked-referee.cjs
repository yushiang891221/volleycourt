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
{
  const { c } = client(false);
  c.VM = { on: true, host: true, hostId: 'p', sc: [5, 5], phase: 'rally', wire: { session: 'local' } };
  const oldResult = { e: 'result', id: 'old-server', sc: [5, 25], sets: [0, 1], session: 'old' };
  c.vmOnNet(oldResult, 'srv');
  assert.equal(c.results, 0); assert.equal(c.VM.sc.join(':'), '5:5'); assert.equal(c.VM.phase, 'rally');
  let resets = 0; c.mrecReset = () => resets++;
  c.vmOnNet({ e: 'start' }, 'srv'); assert.equal(resets, 0, '忽略的重送開賽資料不清除統計');
  c.VM.host = false; c.VM.hostId = 'srv'; c.VM.wire.session = 'current';
  c.vmOnNet(oldResult, 'srv'); assert.equal(c.results, 0, '同裁判的舊場次結算也不接受');
  c.vmOnNet({ ...oldResult, id: 'current-result', session: 'current' }, 'srv'); assert.equal(c.results, 1);
  console.log('PASS stale referee and old-session results ignored; duplicate starts preserve match stats');
}
(async () => {
  for (const code of [4001, 1006, 'silent']) {
    const sockets = [], timers = [], sent = []; let now = 0, heartbeat;
    class Socket {
      constructor() { this.readyState = 1; sockets.push(this); queueMicrotask(() => this.onmessage({ data: JSON.stringify({ k: 'hello', members: [] }) })); }
      send(s) { if (s !== 'ping') sent.push(JSON.parse(s)); }
      close() {}
    }
    const c = { NET: { me: 'p', on: true }, VM: { on: true }, DEV_LOCAL: true, WebSocket: Socket,
      setTimeout: (fn, ms) => { if (ms !== 6000) timers.push(fn); return 1; }, clearTimeout() {},
      Date: { now: () => now }, setInterval: fn => { heartbeat = fn; return 1; }, clearInterval() {}, netStatus() {}, vmStop() { c.VM.on = false; }, renderMpList() {}, netCount() {} };
    vm.createContext(c); vm.runInContext(functions('src/gym/game/07-net.js', ['cfTransport']), c);
    const tx = await c.cfTransport('room', 'p', 'ws://test');
    if (code === 'silent') { now = 4000; heartbeat(); assert.equal(timers.length, 0); now = 16000; heartbeat(); tx.publish('st', {}); }
    else sockets[0].onclose({ code });
    if (code === 4001) { assert.equal(timers.length, 0); assert.equal(c.VM.on, false); assert.equal(sockets.length, 1); }
    else { assert.equal(timers.length, 1); timers.shift()(); await new Promise(setImmediate); assert.equal(sockets.length, 2); assert(sent.some(m => m.t === 'room-match-sync')); sockets[0].onclose({ code: 4001 }); assert.equal(c.VM.on, true, '舊連線晚到的關閉不會停掉新連線'); }
    tx.close();
  }
  console.log('PASS replaced connection stops retrying; ordinary disconnect reconnects and requests match sync');
})().catch(e => { console.error(e); process.exitCode = 1; });
