const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../gym.html'), 'utf8');
function source(name) {
  const start = html.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  const end = html.indexOf('\n', start);
  if (html.slice(start, end).trimEnd().endsWith('}')) return html.slice(start, end);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
function fixture({ energy = 1, game = true, enabled = true, distance = 2, speed = 1, rest = 0, role = '', pitch = 0.2 } = {}) {
  const c = { walk: { x: 0, z: 0, pitch, vel: [0, 0] }, STA: { v: energy },
    VBSettings: { values: { cameraAssist: enabled } }, balls: [{ rest, v: { lengthSq: () => speed * speed }, m: { position: { x: distance, z: 0 } } }],
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), staGame: () => game,
    staCost: () => 0.06, vmMe: () => 0, staWarn() {}, performance: { now: () => 1000 },
    JUMP_G: 9.8, vbHangK: () => role === 'MB' ? 0.75 : 1, tutEv() {}, NET: { on: false },
    hands: {}, SETM: {}, sfx() {}, TP: {}, VB: {} };
  c.staPay = () => { const f = 0.8 + 0.2 * c.clamp(c.STA.v / 0.3, 0, 1); c.STA.v -= 0.06; return f; };
  vm.createContext(c);
  vm.runInContext(html.match(/const CAM_SPIKE_MAX = [^;]+;/)[0] + ['vbJumpVy', 'vbSpikeCamOffset', 'vbClearAir', 'vbJump', 'vbAirStep', 'vbStop'].map(source).join('\n'), c);
  return c;
}
function apex(c) { const T = c.walk.air.camT; for (let i = 0; i < 120; i++) c.vbAirStep(T / 240); return c.walk.pitch; }
function land(c) { for (let i = 0; c.walk.air && i < 1000; i++) c.vbAirStep(1 / 240); assert.equal(c.walk.air, null); }
const near = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
for (const role of ['', 'MB']) {
  const c = fixture({ role }); c.vbJump(); near(apex(c), -0.01); land(c); near(c.walk.pitch, 0.2);
}
const low = fixture({ energy: 0.08 }); low.vbJump(); near(apex(low), 0.1832); land(low); near(low.walk.pitch, 0.2);
const practice = fixture({ energy: 0, game: false }); practice.vbJump(); near(apex(practice), -0.01);
for (const opts of [{ energy: 0.01 }, { enabled: false }, { distance: 4.01 }, { speed: 0 }, { rest: 1 }]) {
  const c = fixture(opts); c.vbJump(); near(apex(c), 0.2); land(c); near(c.walk.pitch, 0.2);
}
const block = fixture(); block.vbJump('block'); near(apex(block), 0.2);
const serve = fixture();
const serveObject = html.match(/walk.air = (\{[^\n]+?\}); staPay\('jserve'\)/);
assert(serveObject, '跳發球物件'); serve.s = { vy: 4, fwd: { x: 0, z: 1 } };
vm.runInContext('walk.air = ' + serveObject[1], serve); assert.equal(serve.walk.air.serve, true);
serve.vbAirStep(0.1); near(serve.walk.pitch, 0.2); land(serve);
const mouse = fixture(); mouse.vbJump(); apex(mouse); mouse.walk.pitch += 0.17; land(mouse); near(mouse.walk.pitch, 0.37);
const stop = fixture(); stop.vbJump(); apex(stop); stop.vbStop(); near(stop.walk.pitch, 0.2); assert.equal(stop.walk.air, null);
const toggle = fixture(); toggle.vbJump(); apex(toggle); toggle.VBSettings.values.cameraAssist = false; toggle.vbAirStep(0.001); near(toggle.walk.pitch, 0.2);
for (const pitch of [-1.19, 1.1]) { const c = fixture({ pitch }); c.vbJump(); apex(c); assert(c.walk.pitch >= -1.2 && c.walk.pitch <= 1.1); land(c); near(c.walk.pitch, pitch); }
assert.equal((html.match(/walk\.air\s*=\s*null/g) || []).length, 1, '清除入口集中於 vbClearAir');
for (const name of ['vbStop', 'vbAirStep']) assert(source(name).includes('vbClearAir()'));
console.log('PASS WEB-011：滿體力偏移 -0.2100；低體力 0.08 偏移 -0.0168；小跳／攔網／跳發／無飛球／關閉皆 0；滑鼠 +0.17 落地 pitch 0.37；停止還原 0.20；MB、練習、邊界、途中關閉與清除入口通過');
