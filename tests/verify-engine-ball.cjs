// B1 驗收：engine/ball.js 算出來的球路，跟抽出來之前 gym.html 裡的寫法（提交 c65ac3c）一模一樣
// 隨機丟很多顆球（一般、加速度、飄球、擦網、撞網、撞牆、碰天花板、落地彈跳、停住等回報），每一小步比對位置、速度和觸發的事件。
const assert = require('node:assert/strict'), cp = require('node:child_process'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const oldFile = cp.execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'show', 'c65ac3c:src/gym/game/06-interact.js'], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
const a = oldFile.indexOf('    for (let k = 0; k < steps; k++) {\n'), endMark = '      vbBlockTest(b, h); vmBlockTest(b, h);\n    }\n';
const body = oldFile.slice(oldFile.indexOf('\n', a) + 1, oldFile.indexOf(endMark, a) + '      vbBlockTest(b, h); vmBlockTest(b, h);\n'.length).replace('b.v.set(0, 0, 0); b.err = null; b.acc = null; b.float = null; break; }', 'b.v.set(0, 0, 0); b.err = null; b.acc = null; b.float = null; return false; }');
assert(body.includes('return false;') && body.includes('vmCrossCheck'), '舊版球的程式要抽得出來');

class V { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } clone() { return new V(this.x, this.y, this.z); }
  addScaledVector(o, s) { this.x += o.x * s; this.y += o.y * s; this.z += o.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; } length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); } }
const toLocalOf = (it, x, z) => { const r = (it.rot * Math.PI) / 180, dx = x - it.x, dz = z - it.z; return [dx * Math.cos(r) - dz * Math.sin(r), dx * Math.sin(r) + dz * Math.cos(r)]; };
const BALL_R = 0.105, H = 9, courts = [{ x: 0, z: 0, rot: 90 }, { x: 20, z: 3, rot: 0 }], segs = [[-15, -12, 30, -12], [-15, 12, 30, 12], [-15, -12, -15, 12]];

function makeWorlds(remoteOwner) {
  // 兩邊用同一套假的遊戲環境，記錄每個事件
  const mk = () => {
    const log = [], roll = { n: 0 }, clock = { t: 1000 };
    const env = { log, roll, clock,
      NET: { on: remoteOwner, ownBall: !remoteOwner }, VM: { on: false, wire: false, ball: null }, SFX: { floorT: 0 },
      state: { net: 'men' }, NETS: { men: { h: 2.43 } }, Math, performance: { now: () => clock.t },
      toast: m => log.push(['toast', m]), netBallSound: (b, k, q) => log.push(['sound', k, +q.toFixed(9)]), netFloorHit: () => log.push(['floorEv']),
      vbAntenna: (b, c, f, lx, yc, lz) => { log.push(['antenna', +yc.toFixed(9)]); b.v.x *= -0.5; },
      vmCrossCheck: (b, c, f, yc) => log.push(['cross', +yc.toFixed(9)]), netFxHit: (c, lz, d, amp, tape) => log.push(['fx', tape, d, +amp.toFixed(6)]),
      vbBlockTest: () => {}, vmBlockTest: () => {}, vbNetRoll: k => { roll.n++; return ((roll.n * 0.6180339887) % 1); },
      clamp: (v, l, h) => Math.max(l, Math.min(h, v)), toLocalOf, BALL_R, H, segs, netCourts: courts, V };
    return env;
  };
  return [mk(), mk()];
}
const oldCtx = makeWorlds(false)[0]; vm.createContext(oldCtx);
vm.runInContext(`function oldStep(b, h) {\n${body}  return true; }`, oldCtx);
(async () => {
  const E = await import('file://' + path.join(root, 'engine', 'ball.js').replaceAll('\\', '/'));
  let rnd = 7; const R = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  let checked = 0, events = 0, maxErr = 0;
  for (let n = 0; n < 400; n++) {
    const remote = n % 7 === 6;
    const [envOld, envNew] = makeWorlds(remote);
    Object.assign(oldCtx, envOld);
    const start = () => {
      const kind = n % 5;   // 0 一般 1 加速度 2 飄球 3 往網子打 4 往牆打
      const p = new V(-6 + R() * 12 + (n % 3 === 2 ? 20 : 0), 0.5 + R() * 3, -4 + R() * 8);
      const v = kind === 3 ? new V(-Math.sign(p.x - (n % 3 === 2 ? 20 : 0)) * (6 + R() * 12), R() * 6, (R() - .5) * 4)
        : kind === 4 ? new V((R() - .5) * 6, R() * 8, (R() < .5 ? -1 : 1) * (10 + R() * 10)) : new V((R() - .5) * 24, R() * 12, (R() - .5) * 18);
      const b = { m: { position: p }, v, acc: kind === 1 ? new V(0, -6 - R() * 8, (R() - .5) * 3) : null, float: kind === 2 ? { t: R(), w: 4 + R() * 6, ph: R() * 6, a: 1 + R() * 3 } : null,
        floorHit: null, room: true, spike: R() < .3 ? { c: courts[0], sg: 1 } : null, serve: R() < .5, floorReport: null, waitFloor: null };
      return b;
    };
    const s0 = rnd, bOld = start(); rnd = s0; const bNew = start();
    const W = { R: BALL_R, H, segs, nets: courts, toLocal: toLocalOf, netTop: 2.43, netRoll: envNew.vbNetRoll, now: () => envNew.clock.t, midpoint: false };
    const hooks = {
      floorWait(b, p) { if (!(envNew.NET.on && b.room && !envNew.NET.ownBall && !b.floorReport && !b.waitFloor && b.v.y < 0)) return false; p.y = BALL_R; b.waitFloor = { t: envNew.clock.t, v: b.v.clone() }; b.v.set(0, 0, 0); b.err = null; b.acc = null; b.float = null; return true; },
      floorLand(b, p) {
        if (b.spike) { const [lx, lz] = toLocalOf(b.spike.c, p.x, p.z), inside = Math.sign(lx) === -b.spike.sg && Math.abs(lx) <= 9 && Math.abs(lz) <= 4.5; envNew.toast(b.serve ? (inside ? '發球進了！Ace 🏐' : '發球出界（或沒過網）') : (inside ? '漂亮！扣球得分 🏐' : '可惜，出界了')); b.spike = null; }
        if (b.v.y < -2.5 && envNew.clock.t - envNew.SFX.floorT > 120) { envNew.SFX.floorT = envNew.clock.t; envNew.netBallSound(b, 'floor', Math.min(1, -b.v.y / 9), p); }
      },
      floorEvent: b => envNew.netFloorHit(b),
      wall(b, vn, p) { if (vn < -2.5 && envNew.clock.t - envNew.SFX.floorT > 120) { envNew.SFX.floorT = envNew.clock.t; envNew.netBallSound(b, 'wall', Math.min(1, -vn / 9), p); } },
      antenna: (...x) => envNew.vbAntenna(...x), netRemote: b => b.room && !envNew.NET.ownBall,
      netTouch(b, c, lz, dir, spd, tape, p) {
        if (tape) { envNew.netFxHit(c, lz, dir, Math.min(1, spd / 12) * 0.6, true); envNew.netBallSound(b, 'tape', Math.min(1, spd / 14), p); }
        else { envNew.netFxHit(c, lz, dir, Math.min(1, spd / 10), false); envNew.netBallSound(b, 'net', Math.min(1, spd / 14), p); }
        if (b.spike) { envNew.toast('掛網了！'); b.spike = null; }
      },
      cross: (b, c, f, yc, lz, top, bot) => envNew.vmCrossCheck(b, c, f, yc, lz, top, bot), after() {},
    };
    for (let step = 0; step < 900; step++) {
      const h = 1 / 60 / (3 + (step % 4));
      envOld.clock.t += 5; envNew.clock.t += 5;
      const ro = oldCtx.oldStep(bOld, h), rn = E.ballSubstep(bNew, bNew.m.position, h, W, hooks);
      assert.equal(rn, ro, `第 ${n} 顆第 ${step} 步：要不要停住不一樣`);
      for (const k of ['x', 'y', 'z']) {
        const e1 = Math.abs(bOld.m.position[k] - bNew.m.position[k]), e2 = Math.abs(bOld.v[k] - bNew.v[k]);
        maxErr = Math.max(maxErr, e1, e2);
        assert(e1 < 1e-9 && e2 < 1e-9, `第 ${n} 顆第 ${step} 步 ${k} 不一樣：位置差 ${e1}、速度差 ${e2}`);
      }
      assert.equal(JSON.stringify(bNew.floorHit), JSON.stringify(bOld.floorHit)); assert.equal(!!bNew.waitFloor, !!bOld.waitFloor); assert.equal(!!bNew.netEv, !!bOld.netEv);
      checked++;
      if (!ro) break;
    }
    assert.deepEqual(JSON.parse(JSON.stringify(envNew.log)).map(x => x.map(y => typeof y === 'number' ? +y.toFixed(5) : y)), JSON.parse(JSON.stringify(envOld.log)).map(x => x.map(y => typeof y === 'number' ? +y.toFixed(5) : y)), `第 ${n} 顆的事件不一樣`);
    events += envNew.log.length;
  }
  console.log(`PASS 球的引擎與舊版一致：400 顆球、${checked} 小步、${events} 個事件，最大誤差 ${maxErr}`);
})().catch(e => { console.error(e); process.exit(1); });
