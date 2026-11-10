// Exercise the actual setter, launch, prediction and attack handlers, including repair/low passes.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { engine, block } = require('./verify-web003a.cjs');

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  lerp(v, k) { for (const axis of ['x', 'y', 'z']) this[axis] += (v[axis] - this[axis]) * k; return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
}

function setup(team, setterSlot, scenario, noise = 0, count = 3) {
  const e = engine(), { c, VM } = e, launches = [];
  Object.assign(c, {
    THREE: { Vector3 }, performance: { now: () => 1000 }, BALL_R: .12, JUMP_G: 8.4,
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), rkGauss: () => noise,
    vmSide: t => t === 0 ? -1 : 1, vmW: (x, z) => [x, z],
    vmBallL: b => ({ ...b.m.position, vx: b.v.x, vy: b.v.y, vz: b.v.z }),
    vmPos: id => VM.ai.get(id), vmTeamOf: id => VM.team.findIndex(t => t.includes(id)),
    vmLv: () => ({ setErr: .3, react: .2 }), vmPro: () => false, vmProSetter: () => null, vmProLv: () => false, VM_OPT: { lv: 2 }, VM_LEVELS: { 2: {} }, aiPay() {}, vbMarkSet() {},
    vmAiOwnSide: () => true, aiJump: (a, vy) => vy,
    vmAiFree() { throw Error('A valid rear teammate is available; do not replace the set with a free ball'); },
    vbLaunch(b, p, v, kind) { b.m.position = p; b.v = v; launches.push({ p: p.clone(), v: v.clone(), kind }); },
    vmOnTouch(b, id, kind) {
      const P = VM.poss[team]; P.stage = 2; P.setter = id;
      P.attacker = c.vm6AttackerFor(team, b, id);
      VM.touch = { team, n: 2, last: id };
    }
  });
  vm.runInContext(block('function vmPredL(', '// 每個人在球場座標裡的位置'), c);
  vm.runInContext(block('function vm6Rotate(', '// ---- 每一格'), c);
  vm.runInContext(block('function vmAiRole(', '// AI 碰球：'), c);
  vm.runInContext(block('function vmAiTouch(', '// 對面的人在哪裡'), c);
  if (count === 2) c.vmStart({ id: 'court', x: 0, z: 0, rot: 0 }, -1, null, [], [Array(2).fill(null), Array(2).fill(null)]);
  else c.vm6Start({ id: 'court', x: 0, z: 0, rot: 0 }, -1, {}, [Array(count).fill(null), Array(count).fill(null)]);
  if (count === 2) VM.rot = VM.team.map(ids => ids.slice()); // Test enumeration only; 2v2 has no rotation rules.
  c.vm6Idx = vm.runInContext('vm6Idx', c);
  c.vm6Front = vm.runInContext('vm6Front', c);
  // Prediction uses ball simulation time; production converts to display time for approach timing.
  c.VB.ts = 1;
  VM.t = 3; VM.call = null;
  for (const a of VM.ai.values()) Object.assign(a, { y: 0, vy: 0, vx: 0, vz: 0 });
  const sd = c.vmSide(team), setter = VM.ai.get(VM.rot[team][setterSlot]);
  setter.x = sd * (scenario === 'far' ? 5.5 : 1.2); setter.z = 0;
  VM.touch = { team, n: 1, last: VM.rot[team].find(id => id !== setter.id) };
  const P = VM.poss[team] = { stage: 1, setter: setter.id, passer: VM.touch.last, attacker: null, fix: scenario === 'repair' };
  const low = scenario === 'low';
  const B = { x: setter.x, z: 0, y: low ? 1 : 2.5, vx: 0, vz: 0, vy: -1 };
  VM.ball = { m: { position: new Vector3(B.x, B.y, B.z) }, v: new Vector3(0, B.vy, 0) };
  return { c, VM, setter, P, B, sd, launches };
}

module.exports = { setup, Vector3 };
if (require.main === module) {
let cases = 0;
for (const team of [0, 1]) for (const slot of [0, 1, 2]) for (const scenario of ['normal', 'repair', 'far', 'low']) for (const noise of [-3, 0, 3]) for (const speed of [.55, .7, 1]) {
  const { c, VM, setter, P, B, sd, launches } = setup(team, slot, scenario, noise);
  c.VB.ts = speed;
  // Even a front-row request must not redirect 3v3 to the front row.
  if (team === 0) { c.vmMe = () => setter.id; VM.call = { n: 2, v: 'high3', t: VM.t }; }
  c.vmAiRole(setter, P, B, sd);
  assert.equal(launches.length, 1, `${team}/${slot}/${scenario}: setter must touch the ball`);
  assert.equal(launches[0].kind, 'set');
  assert.equal(P.stage, 2);
  assert(P.attacker && P.attacker !== setter.id);
  assert.equal(c.vm6Front(P.attacker), false, 'Attack assignment must stay on a rear player');
  assert.equal(P.td, false, 'Do not launch a front-row quick-attack fake');
  const ball = c.vmBallL(VM.ball), contact = c.vmPredL(ball, 2.8);
  assert(contact && contact.x * sd >= 4, `${scenario}: set must descend behind the attack line, including error`);
  assert(Math.abs(contact.z) <= 3.7, 'Set must remain reachable inside a sideline');
  // Give the attacker time to finish its approach, then execute its real jump/contact path.
  const attacker = VM.ai.get(P.attacker), jumpX = contact.x + sd * .55;
  Object.assign(attacker, { x: jumpX, z: contact.z });
  const runAt = Math.max(0, contact.t - 4.7 / c.JUMP_G) * speed;
  const jumpBall = { x: ball.x + ball.vx * runAt, y: ball.y + ball.vy * runAt - 4.9 * runAt * runAt,
    z: ball.z + ball.vz * runAt, vx: ball.vx, vy: ball.vy - 9.8 * runAt, vz: ball.vz };
  VM.ball.m.position = new Vector3(jumpBall.x, jumpBall.y, jumpBall.z);
  c.vmAiRole(attacker, P, jumpBall, sd);
  assert(attacker.vy > 0, 'The assigned rear attacker must jump');
  assert(attacker.x * sd > 3, 'Takeoff must remain behind the 3 m line');
  const contactT = contact.t * speed;
  const future = new Vector3(ball.x + ball.vx * contactT, 2.8, ball.z + ball.vz * contactT);
  VM.ball.m.position = future;
  Object.assign(attacker, { y: .4, vy: 1 });
  let hits = 0; c.vmAiSpike = a => { assert.equal(a.id, P.attacker); hits++; };
  c.vmAiRole(attacker, P, { ...future, vx: ball.vx, vy: ball.vy - 9.8 * contactT, vz: ball.vz }, sd);
  assert.equal(hits, 1, 'A legal rear takeoff must reach the set and attempt a hit');
  cases++;
}
console.log(`PASS ${cases} mirrored 3v3 setter/rotation/pass/error cases reach a legal rear attack`);

// The launch correction is scoped to 3v3. Do not shift ordinary front-row sets in other modes.
for (const count of [4, 5, 6]) {
  const { c, VM, setter, sd, launches } = setup(0, 2, 'normal', 0, count);
  c.vmAiTouch(setter, sd * 1.2, 0, 3, 1.2, 0, 'set', 2);
  const { p, v } = launches[0], target = p.x + v.x * 1.2;
  assert(Math.abs(target - sd * 1.2) < 1e-9, `${count}v${count} front-row sets must stay unchanged`);
}
console.log('PASS 4v4 / 5v5 / 6v6 front-row launch targets unchanged');
}
