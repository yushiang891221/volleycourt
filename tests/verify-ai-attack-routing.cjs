const assert = require('node:assert/strict');
const { setup, Vector3 } = require('./verify-3v3-back-sets.cjs');
let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }
function random(c, v) { c.Math = Object.create(Math); c.Math.random = () => v; }
function rotate(VM, turns) { for (let i = 0; i < turns; i++) for (const team of [0, 1]) VM.rot[team] = VM.rot[team].slice(1).concat(VM.rot[team][0]); }

test('6v6 automatic choices include front OP, pipe and back OP across all rotations; back 5 remains occasional', () => {
  for (const team of [0, 1]) for (let turns = 0; turns < 6; turns++) {
    const { c, VM, sd } = setup(team, 0, 'normal', 0, 6); rotate(VM, turns);
    const setter = VM.ai.get(VM.team[team].find(id => VM.role[id] === 'S'));
    VM.poss[team] = { stage: 1, setter: setter.id, grade: 'A', passer: 'other' };
    const results = new Map();
    for (let i = 0; i < 1000; i++) {
      random(c, (i + .5) / 1000);
      const p = c.vm6ChooseSet(setter, { x: sd * 1.2 });
      assert(p.id && p.id !== setter.id);
      results.set(p.n, (results.get(p.n) || 0) + 1);
      if (p.n === 3) assert.equal(VM.role[p.id], 'OPP');
      if (p.n === 4) { assert.equal(VM.role[p.id], 'OH'); assert(!c.vm6Front(p.id)); }
      if (p.n === 5) { assert.equal(VM.role[p.id], 'OPP'); assert(!c.vm6Front(p.id)); }
    }
    const opp = VM.team[team].find(id => VM.role[id] === 'OPP');
    assert(results.has(c.vm6Front(opp) ? 3 : 5), `Rotation ${turns}: OP / back OP omitted`);
    assert(results.has(4), `Rotation ${turns}: pipe omitted`);
    assert((results.get(7) || 0) < 80, 'Extra back-5 must stay a small share');
  }
});

test('all 6v6 rotations: S passing first assigns OP to set, S stays out of the setting spot', () => {
  for (const team of [0, 1]) for (let turns = 0; turns < 6; turns++) {
    const { c, VM } = setup(team, 0, 'normal', 0, 6); rotate(VM, turns);
    const S = VM.ai.get(VM.team[team].find(id => VM.role[id] === 'S'));
    const setter = c.vm6SetterFor(team, S.id); assert.equal(VM.role[setter], 'OPP');
    const P = VM.poss[team] = { stage: 1, passer: S.id, setter, attacker: null };
    VM.touch = { team, n: 1, last: S.id };
    const retreat = c.vm6Spot(team, S.id, 'attack'), spot = c.vm6Spot(team, setter, 'attack');
    assert(Math.hypot(retreat.x - spot.x, retreat.z - spot.z) > 2);
    c.vmAiRole(S, P, { x: spot.x, z: spot.z, y: 3, vx: 0, vy: -1, vz: 0 }, c.vmSide(team));
    assert.equal(S.tx, retreat.x); assert.equal(S.tz, retreat.z);
  }
});

test('3/4/5/6: normal, repair and low sets keep selected rear attacks behind the line on both sides', () => {
  for (const n of [3, 4, 5, 6]) for (const team of [0, 1]) for (let turns = 0; turns < n; turns++) for (const scenario of ['normal', 'repair', 'low']) {
    const { c, VM, setter, P, B, sd, launches } = setup(team, n - 1, scenario, 3, n); rotate(VM, turns);
    const rear = VM.team[team].find(id => id !== setter.id && !c.vm6Front(id));
    if (!rear) continue;
    c.vmAiSetAttack(setter, P, B, { n: 4, id: rear }, scenario === 'low');
    assert.equal(launches.length, 1); assert.equal(P.attacker, rear);
    const contact = c.vmPredL(c.vmBallL(VM.ball), 2.8);
    assert(contact && contact.x * sd > 3.8, `${n}v${n} ${scenario}: rear set drifted into front row`);
  }
});

test('all team sizes: only the designated setter takes second ball, support yields rather than crowding that route', () => {
  for (const n of [1, 2, 3, 4, 5, 6]) for (const team of [0, 1]) {
    const { c, VM, sd } = setup(team, 0, 'normal', 0, n);
    const setter = VM.team[team][0], P = VM.poss[team] = { stage: 1, setter, passer: VM.team[team][1], attacker: null };
    VM.phase = 'rally'; VM.touch = { team, n: 1, last: P.passer };
    const s = VM.ai.get(setter); Object.assign(s, { x: sd * 5, z: 0, tx: sd * 1.2, tz: 0 });
    VM.ball = { m: { position: new Vector3(sd * 1.2, 3, 0) }, v: new Vector3(0, -1, 0) };
    const setNav = c.vmAiYieldRoute(s); assert.equal(setNav.x, s.tx); assert.equal(setNav.z, s.tz);
    if (n === 1) continue;
    const support = VM.ai.get(VM.team[team][1]); Object.assign(support, { x: sd * 3, z: 0, tx: sd * 1.2, tz: 0 });
    const nav = c.vmAiYieldRoute(support);
    assert(Math.abs(nav.z) > .85, `${n}v${n}: support on setter route did not step aside`);
  }
});

test('2/3/4/5/6: cover targets avoid the approach corridor for every attack slot, including human OH', () => {
  for (const n of [2, 3, 4, 5, 6]) for (const team of [0, 1]) for (let slot = 0; slot < n; slot++) {
    const { c, VM, sd } = setup(team, (slot + 1) % n, 'normal', 0, n);
    VM.phase = 'rally'; VM.touch = { team, n: 2, last: VM.rot[team][(slot + 1) % n] };
    const attacker = VM.rot[team][slot], at = VM.ai.get(attacker), back = VM.six && !c.vm6Front(attacker);
    const L = VM.role[attacker] === 'OH' ? 3.3 : slot % 2 ? -2.5 : 2.5;
    Object.assign(at, { x: sd * (back ? 6.5 : 3.8), z: sd * L });
    VM.ai.delete(attacker); // A real player owns the approach; support must yield to it.
    c.vmPos = id => id === attacker ? at : VM.ai.get(id);
    VM.poss[team] = { stage: 2, attacker, setter: VM.touch.last };
    const targetD = back ? 4.4 : 1.2;
    VM.ball = { m: { position: new Vector3(sd * targetD, 3.1, sd * L) }, v: new Vector3(0, -1, 0) };
    const lane = c.vmAttackLane(team, attacker), cover = c.vm6CoverPlan(team, attacker);
    for (const id of VM.team[team]) if (id !== attacker) {
      assert(cover[id]); assert(c.vmLaneProject(cover[id], lane).d > lane.r, `${n}v${n} support target on approach`);
      if (Math.abs(L) >= 1.5) assert(cover[id].z / sd * Math.sign(L) < Math.abs(L), `${n}v${n}: cover assigned outside the wing attacker`);
      const a = VM.ai.get(id);
      // Begin inside the corridor, then simulate repeated steering calls until clear.
      Object.assign(a, { x: (lane.a.x + lane.b.x) / 2, z: (lane.a.z + lane.b.z) / 2, tx: cover[id].x, tz: cover[id].z });
      for (let frame = 0; frame < 80; frame++) {
        const nav = c.vmAiYieldRoute(a), dx = nav.x - a.x, dz = nav.z - a.z, d = Math.hypot(dx, dz);
        if (d) { const step = Math.min(d, .1); a.x += dx / d * step; a.z += dz / d * step; }
      }
      assert(c.vmLaneProject(a, lane).d >= lane.r, `${n}v${n} team ${team} slot ${slot} ${id} support remained on approach`);
    }
  }
});

test('6v6 MB stays inside OH/OP/S wings, including humans and crossed starting positions', () => {
  for (const team of [0, 1]) for (let turns = 0; turns < 6; turns++) for (const edge of [-1, 1]) {
    const { c, VM, sd } = setup(team, 0, 'normal', 0, 6); rotate(VM, turns);
    const fr = VM.team[team].filter(id => c.vm6Front(id)), midId = fr.find(id => VM.role[id] === 'MB');
    const wingId = fr.find(id => id !== midId), mid = VM.ai.get(midId), wing = VM.ai.get(wingId);
    const th = { z: sd * edge * 3.2, x: -sd, air: true };
    mid.z = sd * edge * 4.1; wing.z = sd * edge * 3.6; wing.x = sd * .5;
    const wingTarget = (th.z + c.vmBlockLane(wing, th)) / sd;
    const midTarget = (th.z + c.vmBlockLane(mid, th)) / sd;
    assert(midTarget * edge < wingTarget * edge, 'MB took the outside position');
    assert(Math.abs(midTarget - wingTarget) <= .95, 'Double block left a middle hole');
    VM.ai.delete(wingId); c.vmPos = id => id === wingId ? wing : VM.ai.get(id);
    const humanMidTarget = (th.z + c.vmBlockLane(mid, th)) / sd;
    assert(humanMidTarget * edge <= wing.z / sd * edge - .69, 'MB occupied the human wing position');
    assert(Math.abs(humanMidTarget - wing.z / sd) <= .95, 'MB failed to close to the human wing');
  }
});

test('3/4/5: eligible double blockers do not converge onto one outer position', () => {
  for (const n of [3, 4, 5]) for (const team of [0, 1]) {
    const { c, VM, sd } = setup(team, n - 1, 'normal', 0, n), th = { z: 0 };
    const pair = c.vmSmallBlockers(team, th);
    if (pair.length === 1) assert.equal(c.vmBlockLane(VM.ai.get(pair[0]), th), 0);
    if (pair.length === 2) {
      const a = c.vmBlockLane(VM.ai.get(pair[0]), th) / sd, b = c.vmBlockLane(VM.ai.get(pair[1]), th) / sd;
      assert(a > b); assert(Math.abs(a - b) > .6 && Math.abs(a - b) < .95);
    }
  }
});

console.log(`${count} all-mode attack routing checks passed`);
