const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {create}=require('../js/tutorial.js');
require('./engine-for-tests.cjs').installAi(vm);
const gym=fs.readFileSync(path.join(__dirname,'../gym.html'),'utf8').replaceAll('\r\n','\n');
function source(name) {
  const start = gym.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  const lines = gym.slice(start).split('\n');
  for (let count = 1; count < lines.length; count++) {
    const body = lines.slice(0, count).join('\n');
    try { new vm.Script(body); return body; } catch (_) { /* 函式尚未完整。 */ }
  }
  throw Error(name);
}
class Vector {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  copy(p) { return this.set(p.x, p.y, p.z); }
  clone() { return new Vector(this.x, this.y, this.z); }
  add(p) { return this.addScaledVector(p, 1); }
  sub(p) { return this.addScaledVector(p, -1); }
  addScaledVector(p, n) { this.x += p.x * n; this.y += p.y * n; this.z += p.z * n; return this; }
  multiplyScalar(n) { this.x *= n; this.y *= n; this.z *= n; return this; }
  divideScalar(n) { return this.multiplyScalar(1 / n); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthSq() { return this.length() ** 2; }
  distanceTo(p) { return Math.hypot(this.x - p.x, this.y - p.y, this.z - p.z); }
  setLength(n) { return this.multiplyScalar(n / (this.length() || 1)); }
  lerp(p, n) { return this.lerpVectors(this.clone(), p, n); }
  lerpVectors(a, b, n) { return this.copy(a).multiplyScalar(1 - n).addScaledVector(b, n); }
}
class Geometry {dispose(){} setDrawRange(start,count){this.drawRange={start,count};}setFromPoints(points){this.points=points;return this;}}
class Object3D {
  constructor(geometry, material) {
    this.geometry = geometry; this.material = material; this.isMesh = !!geometry;
    this.position = new Vector(); this.rotation = new Vector(); this.scale = new Vector(1, 1, 1);
    this.userData = {}; this.children = []; this.visible = true;
  }
  add(child) { child.removeFromParent(); this.children.push(child); child.parent = this; }
  remove(child) { this.children = this.children.filter(x => x !== child); child.parent = null; }
  removeFromParent() { this.parent?.remove(this); }
  rotateOnWorldAxis() {}
  computeLineDistances(){}
  getWorldPosition(p) { return p.copy(this.position).add(this.parent?.position || new Vector()); }
}
function engine() {
  let time = 1000;
  const noop = () => {}, court = { id: 'court', type: 'vb', x: 12, z: -8, rot: 37 };
  const walk = { on: true, x: 100, z: 100, yaw: 0, pitch: 0, keys: new Set(), vel: [0, 0], down: 0 };
  const c = { console, window: {}, performance: { now: () => time },
    THREE: { Vector3: Vector, Mesh: Object3D, RingGeometry: Geometry, BoxGeometry:Geometry, BufferGeometry:Geometry, Line:Object3D, LineDashedMaterial:class{dispose(){}}, MeshStandardMaterial:class{dispose(){}}, MeshBasicMaterial: class { dispose() {} } },
    walk, state: { items: [court], building: { H: 12 }, net: 'men' }, CAT: { vb: { court: 'vb' } },
    camera: new Object3D(), scene: new Object3D(), ballsGroup: new Object3D(), balls: [],
    VM: { on: false }, NET: { on: false }, VB: { ts: 0.7, assist: true, dt: 1 / 60 },
    VBSettings: { values: { cameraAssist: true } },
    EYE: 1.62, BALL_R: 0.105, JUMP_G: 8.4, NETS: { men: { h: 2.43 } },
    VB_REACH: { atk: 1, recv: 0.95, set: 0.9 }, SETM: {}, SET_DEF: { 1: 'high', 2: 'quick', 3: 'high' },
    CHG: { sw0: 0.72, sw1: 0.88, over: 1, max: 1.2 },
    RECV_CROUCH: { crouchDy: -0.5, crouchDT: 0.15 }, BLK_FX: {},
    TOUCH_OUT: { outKeep: .09, outKeepPow: .08, outPast: [.15,.7], outLatMax: [2.6,1.2], topKeep: .14, topKeepPow: .14, topVy: [2,1.4], powVy: 1.6 },
    skill: {}, hands: {}, pose: 'hold', AVP: { idle: {} }, SFX: { floorT: 0 }, SPIN_AX: new Vector(),
    vmIsPractice: () => true, STA: { v: 1 }, locked: () => true, tpActive: () => !!c.third,
    clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)), rkGauss: () => 0,
    newBallMesh: () => new Object3D(), makeAvatar: () => ({ g: new Object3D() }), myChar: () => null,
    avDrive: noop, avBlockPose: () => ({}), setMenuClose: noop, unlockMouse: noop,
    toast: noop, recHit: noop, vbImpact: noop, vbFx: noop, vbBlockFx: noop, vbSpinFor: () => null,
    vbPep: () => null, vmSecond: () => false, vmThird: () => false, vbHardDefl: () => null,
    vmMe: () => 'me', vbMyRole: () => null, vbHangK: () => 1, vbIsSetter: () => true, ROLE_SUPER: {}, vmOnTouch: noop, vmBlockTest: noop, vbChargeStep: noop,
    RP:{on:false},staCfg:()=>({sprint:21,regStill:8,regMove:5,regDead:10}),staCost: kind => kind==='dive'?.39:.05, staEff: () => 1, staWarn: noop,
    updateTweens: noop, updateDoors: noop, updateWind: noop, netFxStep: noop, ballShadowSync: noop,
    blockers: () => [], solidSegs: () => [], vmCrossCheck: noop, sfx: noop, netFxHit: noop,
    vbNetRoll: () => 0.5, vbAntenna: noop, $: id => id==='sta'?null:({ hidden: false }),
    applyPose: noop, placeHeld: noop, vmServeOK: () => true, vbServeInside: () => false,
    vbServeZone: noop, collide: (x, z) => [x, z], ballMat: {}, ballHot: {},
    vbServeAim: () => null, serveVel: () => new Vector(-10, 8, 0)
  };
  c.vbFwd = () => [-Math.sin(walk.yaw), -Math.cos(walk.yaw)];
  vm.createContext(c);
  vm.runInContext(gym.match(/const CAM_SPIKE_MAX = [^;]+;/)[0], c);
  vm.runInContext('Math.random = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();', c);   /* 固定亂數：教練落點每次一樣，測試結果穩定 */
  for (const name of ['toWorldOf', 'toLocalOf', 'courtAt', 'vbCourt', 'solveShot', 'vbPredict', 'vbMine', 'vbLaunch',
    'netFloorHit', 'netBallSound', 'vbNetCourts', 'updateBalls', 'vbJumpVy', 'vbSpikeCamOffset', 'vbClearAir', 'vbJump', 'vbAirStep', 'vbHand', 'vbAttack', 'vbSwingStep', 'vbShotVel',
    'vbAtServeLine', 'vbChargeOf', 'vbHitAttack', 'vbReceive', 'vbDive', 'vbRecvStep', 'vbDoReceive', 'vbNext',
    'vbSet', 'vbSetStep', 'vbSpot', 'vbSendSet', 'vbDoSet', 'vbBlockTest', 'vbBlockOutcome', 'vbBlockApply',
    'staGame', 'staPay', 'staUse', 'staTick', 'staSprint', 'grabBall', 'startServe', 'updateServe', 'startJumpServe', 'updateJumpServe', 'jumpServeHit', 'serveLaunch']) {
    if (name === 'updateBalls') vm.runInContext(require('./engine-for-tests.cjs').engineScript(gym), c);   /* B1：球的物理在 engine/ball.js */
    vm.runInContext(source(name), c);
  }
  vm.runInContext(gym.slice(gym.indexOf('function tutEv('), gym.indexOf('// ---------------------------------------------------------------- loop', gym.indexOf('function tutEv('))) + '\nthis.coach = TUT_COACH;', c);
  c.window.VBTutorial = create({ now: () => time, storage: null, coach: c.coach });
  const api = c.window.VBTutorial;
  function tick(dt = 1 / 60, input = noop) {
    time += dt * 1000; c.staTick(dt);
    if (walk.serve) c.updateServe(dt);
    if (walk.jserve) c.updateJumpServe(dt);
    if (walk.dive) {
      walk.dive.t += dt;
      const e = Math.min(1, walk.dive.t / .45), factor = e < .6 ? 1 : 1 - (e - .6) / .4 * .85;
      walk.x += walk.dive.vx * factor * dt; walk.z += walk.dive.vz * factor * dt;
      if (e >= 1) { walk.dive = null; walk.down = .75; }
    } else walk.down = Math.max(0, walk.down - dt);
    const y = c.vbAirStep(dt); c.camera.position.set(walk.x, c.EYE + y, walk.z);
    input(); c.vbSwingStep(dt); c.vbRecvStep(); c.vbSetStep();
    api.frame(c.tutSnapshot()); c.updateBalls(dt);
  }
  const until = (predicate, input = noop, limit = 600) => {
    for (let i = 0; i < limit && !predicate(); i++) tick(1 / 60, input);
    assert(predicate(), JSON.stringify(api.view()));
  };
  const advance = () => { assert.equal(api.view().phase, 'success'); until(() => api.view().phase !== 'success'); };
  return { c, api, walk, tick, until, advance, setTime: n => { time = n; } };
}


module.exports={engine,Vector,source,Object3D};
