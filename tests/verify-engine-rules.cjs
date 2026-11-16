require('./engine-for-tests.cjs').installAi(require('node:vm'));   /* B3：AI 引擎 */
// B2 驗收：engine/rules.js 接上之後，觸球犯規、得分、發球權、輪轉、局數、換場、落地判定，跟抽出來之前（提交 e0f3cfa）完全一樣
// 隨機產生很多場比賽（2 人制、6 人制、3 局／5 局制），同一串觸球與落地事件同時丟給新舊程式，每一步比對狀態與判定。
const assert = require('node:assert/strict'), cp = require('node:child_process'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const oldSrc = cp.execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'show', 'e0f3cfa:src/gym/game/12-match-2v2.js'], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
const newSrc = fs.readFileSync(path.join(root, 'src/gym/game/12-match-2v2.js'), 'utf8');
const gym = fs.readFileSync(path.join(root, 'gym.html'), 'utf8');
const cut = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i); assert(i >= 0 && j > i, a); return s.slice(i, j); };
const pieces = s => cut(s, 'function vmOnTouch(', 'function vmGrade(') + cut(s, 'function vmPoint(', 'function vmTeamLabel(') + cut(s, 'function vmJudge(', '// 攔網碰到球：手的位置');

function context(code, seed) {
  const log = [];
  const c = { log, Math, console, BALL_R: 0.105, NETS: { men: { h: 2.43 } }, state: { net: 'men' }, NET: { on: false, peers: new Map() }, walk: {}, ROOM: null,
    performance: { now: () => 0 }, balls: [], RND: seed };
  vm.createContext(c);
  vm.runInContext(`
    function vmTeamOf(id) { return VM.team[0].includes(id) ? 0 : VM.team[1].includes(id) ? 1 : -1; }
    function vmServer() { const t = VM.srvTeam; return VM.six ? VM.rot[t][0] : VM.team[t][VM.srvIdx[t] % 2]; }
    function vmPerfTouch() {} function vmPerfPoint() {} function sfx() {} function vmSay(m) { log.push(['say', m]); } function vmBroadcast() {}
    function vmName(id) { return id; } function vmMe() { return 'nobody'; } function vmL(x, z) { return [x, z]; } function vmW(x, z) { return [x, z]; }
    function vmPos(id) { return VM.pos[id] || null; } function vmSmallCount() { return VM.small || 0; }
    function vm6Idx(id) { for (const r of VM.rot || []) { const k = r.indexOf(id); if (k >= 0) return k; } return -1; }
    function vm6Front(id) { const k = vm6Idx(id); return k >= 1 && k <= 3; }
    function vm6Overlap() { return VM.overlapNext ? { team: VM.overlapNext - 1, why: '位置錯誤' } : null; }
    function vm6SetterFor(t, id) { return VM.team[t].find(x => x !== id); } function vm6AttackerFor(t, b, id) { return VM.team[t].find(x => x !== id); }
    function vmGrade(team, b, id) { log.push(['grade', team, id]); }
    function vm6Rotate(t) { VM.rot[t] = VM.rot[t].slice(1).concat(VM.rot[t][0]); log.push(['rotate', t]); }
    function vmTeamLabel(t) { return 'T' + t; } function vmPointMsg(win, why) { return why + '/' + win; }
    function vmSetupServe() { log.push(['serve']); } function vm6NextSet() { log.push(['nextSet']); } function vmOver() { log.push(['over']); } function vm6Swap() { log.push(['swap']); }
    function vmMark(x, z, inside) { log.push(['mark', inside]); } function vmOut() { log.push(['out']); }
  ` + code, c);
  return c;
}
const oldC = s => context(pieces(oldSrc), s);
const newC = s => context(require('./engine-for-tests.cjs').rulesScript(gym).replace(/^const FAULT_TEXT[\s\S]*$/m, '') + cut(newSrc, 'const FAULT_TEXT = {', 'function vmOnTouch(') + pieces(newSrc), s);

let rnd = 99; const R = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647), pick = a => a[Math.floor(R() * a.length)];
const KINDS = ['bump', 'set', 'spike', 'tip', 'hit', 'block', 'block', 'serve'];
let events = 0, points = 0, faults = 0; const ends = { nextSet: 0, swap: 0, over: 0 };
for (let m = 0; m < 300; m++) {
  const six = m % 3 !== 0, n = six ? 6 : 2, team = [[...Array(n)].map((_, i) => 'a' + i), [...Array(n)].map((_, i) => 'b' + i)];
  const bestOf = pick([1, 3, 5]), to = pick([7, 11, 15, 25]);   /* 兩邊同一組設定 */
  const setup = () => ({ on: true, host: true, six, phase: 'serve', team, rot: six ? team.map(t => t.slice()) : undefined, srvTeam: m % 2, srvIdx: [0, 0], sc: [0, 0], sets: [0, 0], bestOf, to, setNo: 1, swap8: false,
    touch: { team: -1, n: 0, last: null }, poss: [null, null], ai: new Map(), pos: {}, sg: -1, t: 0, ball: null, small: 0, overlapNext: 0 });
  const A = oldC(m), B = newC(m);
  A.VM = setup(); B.VM = setup();
  for (let e = 0; e < 4000 && A.VM.phase !== 'over'; e++) {
    const r = R();
    if (A.VM.phase === 'serve') {
      const srv = vm.runInContext('vmServer()', A), kind = R() < .9 ? 'serve' : pick(KINDS), id = R() < .9 ? srv : pick(team.flat());
      const overlap = R() < .05 ? 1 + Math.floor(R() * 2) : 0; A.VM.overlapNext = B.VM.overlapNext = overlap;
      for (const C of [A, B]) { const b = { m: { position: { x: 0, y: 2, z: 0 } } }; C.balls.length = 0; C.balls.push(b); C.VM.ball = b; C.vmOnTouch(b, id, kind); }
    } else if (A.VM.phase === 'rally' && r < .82) {
      const id = pick(team.flat()), kind = pick(KINDS), y = R() < .5 ? 2.2 : 3.2, x = (R() - .5) * 18, setFault = R() < .06 ? pick(['held', 'double']) : null;
      const jump = R() < .5 ? [(R() - .5) * 12, 0] : null;
      for (const C of [A, B]) {
        const b = C.VM.ball || { m: { position: {} } }; b.m.position = { x, y, z: 0 }; b.setFault = setFault; b.jump0 = jump;
        C.VM.pos[id] = { x: (R() - .5) * 0 + x * .3, z: 0 }; C.vmOnTouch(b, id, kind);
      }
    } else if (A.VM.phase === 'rally') {
      const fx = (R() - .5) * 22, fz = (R() - .5) * 11;
      for (const C of [A, B]) { const b = C.VM.ball; b.floorHit = [fx, fz]; b.room = false; C.balls.length = 0; C.balls.push(b); C.vmJudge(); }
    } else {
      // 死球：執行下一步（發球、下一局、換場…），兩邊各自照自己排的下一步做
      for (const C of [A, B]) { const f = C.VM.next && C.VM.next.fn; C.VM.next = null; if (f) f(); if (C.log.at(-1)?.[0] === 'nextSet') { C.VM.sc = [0, 0]; C.VM.setNo++; C.VM.swap8 = false; } C.VM.phase = C.log.at(-1)?.[0] === 'over' ? 'over' : 'serve'; C.VM.touch = { team: -1, n: 0, last: null }; }
    }
    events++;
    const snap = C => JSON.stringify({ phase: C.VM.phase, sc: C.VM.sc, sets: C.VM.sets, srvTeam: C.VM.srvTeam, srvIdx: C.VM.srvIdx, rot: C.VM.rot, swap8: C.VM.swap8, touch: C.VM.touch, poss: C.VM.poss, sf: C.VM.ball && C.VM.ball.setFault, log: C.log });
    assert.equal(snap(B), snap(A), `第 ${m} 場第 ${e} 個事件不一樣`);
  }
  for (const x of A.log) if (x[0] in ends) ends[x[0]]++;
  points += A.log.filter(x => x[0] === 'say').length; faults += A.log.filter(x => x[0] === 'say' && !/落地得分|OUT/.test(x[1])).length;
}
console.log(`PASS 規則引擎與舊版一致：300 場、${events} 個事件、${points} 分（其中 ${faults} 分是犯規判定）；換局 ${ends.nextSet}、決勝局換場 ${ends.swap}、比賽結束 ${ends.over}`);
assert(ends.nextSet > 20 && ends.swap > 5 && ends.over > 100, '要涵蓋換局、換場、比賽結束');
