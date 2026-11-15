const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const {engine,Vector,source,Object3D}=require('./tutorial-engine.cjs');
// Protocol-2 authority uses the actual swept-collision engine, not just the receiver sampler.
{
  const sync = require('../js/match-sync.js');
  for (const fps of [30, 60, 144]) {
    const { c } = engine(); c.state.items = []; c.vmTrailPush = () => {};
    const b = { m: c.newBallMesh(), v: new Vector(12, 4, -3), acc: new Vector(0, -4.5, 0), rest: 0, room: true };
    b.m.position.set(0, 8, 0); c.balls.push(b); Object.assign(c.VM, { on: true, host: true, wire: {}, ball: b });
    const steps = Math.round(fps * .4), dt = .4 / steps;
    for (let i = 0; i < steps; i++) c.updateBalls(dt);
    const expected = sync.sample({ p: [0,8,0], v: [12,4,-3], a: [0,-4.5,0] }, .4 * c.VB.ts);
    assert(b.m.position.distanceTo(new Vector(...expected.p)) < 1e-8, 'authority and receiver agree at ' + fps + ' FPS');
    b.m.position.set(0, .15, 0); b.v.set(1, -10, 0); c.updateBalls(.05);
    assert(b.floorHit); assert(Math.abs(b.floorHit[0]) < 0.2); assert(b.v.y > 0, '落地後照常彈起來，不再停在落點');   /* 2026-11-15 使用者要求 */
    { const first = b.floorHit.slice(); c.updateBalls(.1); c.updateBalls(.1); assert.deepEqual(b.floorHit, first, '彈跳之後，判分用的第一次落點不變'); }
  }
  const { c } = engine(); c.vmTrailPush = () => {}; c.VB.ts = 1;
  c.state.items = [{ id: 'net', type: 'vb', x: 0, z: 0, rot: 0 }];
  const b = { m: c.newBallMesh(), v: new Vector(-40, 0, 0), rest: 0, room: true, wireCatchup: .2 };
  b.m.position.set(1, 2, 0); c.balls.push(b); Object.assign(c.VM, { on: true, host: true, wire: {}, ball: b });
  c.NET.ownBall = true; c.updateBalls(1 / 60);
  assert(b.m.position.x > 0 && b.v.x >= 0, 'fast remote spike catch-up must sweep through net collision');
  console.log('PASS 新同步：實際主機物理與客戶端球路一致、落地停球、延遲快扣不穿網');
}

const game = engine(), { c, api, walk, tick, until, advance } = game;
for (const mode of ['atk', 'set', 'block', 'defense']) {
  const sim = engine(), env = sim.c, coach = env.coach;
  env.THREE.BoxGeometry = env.THREE.RingGeometry;
  env.THREE.MeshStandardMaterial = env.THREE.MeshBasicMaterial;
  env.makeAvatar = () => {
    const g = new Object3D(), hand = new Object3D();
    g.add(hand); hand.position.y = 1.2;
    hand.getWorldPosition = v => v.copy(hand.position).add(g.position);
    return { g, hands: [hand] };
  };
  assert(coach.startDrill(mode, '1-high', 3));
  sim.setTime(2000); coach.frame();
  const first = coach.ball;
  assert(first);
  if (mode === 'block' || mode === 'defense') {
    assert.equal(coach.drill.hitters.length, 3);
    for (let i = 0; i < 200 && first.lk !== 'spike'; i++) {
      sim.tick(); coach.frame();
    }
    assert.equal(first.lk, 'spike', mode);
  }
  if (mode === 'atk') {
    assert(coach.drill.feeder);
    assert.equal(first.lk, 'bump');
    assert.equal(coach.drill.awaitingSet, true);
    for (let i = 0; i < 200 && first.lk !== 'set'; i++) {
      sim.tick(); coach.frame();
    }
    assert.equal(first.lk, 'set', '後中拋球到舉球手才舉球');
    assert.equal(coach.drill.awaitingSet, false);
    first.floorHit = [0,0];
  }
  else coach.event(({ set: 'set', block: 'block', defense: 'recv' })[mode], {}, first);
  coach.frame();
  const due = coach.next; assert(Number.isFinite(due));
  sim.setTime(due-1); coach.frame(); assert.equal(coach.ball, first);
  sim.setTime(due+1); coach.frame(); assert.notEqual(coach.ball, first);
  assert.equal(env.balls.length, 1);
  if (mode === 'atk') {
    for (const lane of [-3.5, 0, 2]) {
      coach.stop();
      assert(coach.startDrill('atk', '2-quick', 3));
      sim.setTime(coach.next + 1); coach.frame();
      const quickBall = coach.ball;
      // Move after the back-row toss: choose the target at setter contact.
      const player = coach.world(1.2, lane);
      sim.walk.x = player.x; sim.walk.z = player.z;
      for (let i = 0; i < 200 && quickBall.lk !== 'set'; i++) { sim.tick(); coach.frame(); }
      assert.equal(quickBall.lk, 'set');
      const expected = coach.world(1.1, lane);
      assert(Math.abs(env.VB.setSpot.x - expected.x) < 1e-6);
      assert(Math.abs(env.VB.setSpot.z - expected.z) < 1e-6, '快攻依觸球時玩家位置舉球');
    }
  }
  coach.stop(); assert.equal(env.balls.length, 0); assert.equal(coach.objects.length, 0);
}
console.log('PASS 四種專項餵球、攻擊手扣球、回合間隔與結束清場');
for (const speed of [.55, .7, 1]) for (const side of [-1, 1]) for (const rotation of [0, 37, 90]) {
  const test = engine(), g = test.c, w = test.walk;
  g.VB.ts = speed; g.state.items[0].rot = rotation;
  [w.x, w.z] = g.toWorldOf(g.state.items[0], side * 2, 0);
  test.api.start('block');
  for (let step = 0; step < 2; step++) { test.api.skip(); test.advance(); }
  let jumped = false;
  test.until(() => test.api.view().reps>0, () => {
    if (g.coach.cj && !jumped && g.performance.now() - g.coach.cj >= 250) { jumped = true; g.vbJump('block'); }
  }, 400);
  assert(!g.coach.ball.floorHit, '碰手發生於落地前');
  test.api.stop(); assert.equal(g.balls.length, 0);
}

console.log('PASS block contacts: three ball speeds, both court sides and three rotations');
