/* Shared, rendering-independent match ordering and flight calculations. */
(function (root) {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const vector = (value, length = 3) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
  function validBall(ball) {
    return ball && vector(ball.p) && vector(ball.v) &&
      ball.p.every(n => Math.abs(n) < 10000) && ball.v.every(n => Math.abs(n) <= 100) &&
      (!ball.a || (vector(ball.a) && ball.a.every(n => Math.abs(n) <= 100))) &&
      (!ball.s || (vector(ball.s) && ball.s.every(n => Math.abs(n) <= 200))) &&
      (!ball.q || (vector(ball.q, 4) && Math.abs(Math.hypot(...ball.q) - 1) < .02)) &&
      (!ball.f || (vector(ball.f, 4) && Math.abs(ball.f[3]) <= 30)) &&
      (!ball.floor || vector(ball.floor, 2)) && (!ball.j || vector(ball.j, 2));
  }
  function sample(ball, seconds, radius = .105, spinSeconds = seconds) {
    const t = clamp(seconds, 0, .5), p = ball.p.slice(), v = ball.v.slice();
    const a = ball.a || [0, 0, 0], acceleration = [a[0], a[1] - 9.8, a[2]];
    if (!ball.f) {
      // 推算到碰地板那一刻就停（不能讓左右前後繼續往前跑：快的扣球會多跑一公尺以上，加入者看到的落點跑到界外）
      const A = .5 * acceleration[1], B = v[1], C = p[1] - radius;
      let end = t;
      if (C <= 0 && B <= 0) end = 0;
      else if (C + B * t + A * t * t < 0) {
        const disc = B * B - 4 * A * C;
        end = Math.abs(A) < 1e-9 ? -C / B : (-B - Math.sqrt(Math.max(0, disc))) / (2 * A);
        if (!(end >= 0 && end <= t)) end = clamp(Number.isFinite(end) ? end : t, 0, t);
      }
      for (let axis = 0; axis < 3; axis++) {
        p[axis] += v[axis] * end + .5 * acceleration[axis] * end * end;
        v[axis] += acceleration[axis] * end;
      }
    } else {
      // Float serves use the same deterministic force as the match simulation.
      const steps = Math.max(1, Math.ceil(t / .004)), h = t / steps;
      const [phaseTime, w, phase, force] = ball.f;
      for (let i = 0; i < steps; i++) {
        const time = phaseTime + (i + 1) * h, hv = Math.hypot(v[0], v[2]) || 1;
        const side = Math.sin(time * w + phase) + .7 * Math.sin(time * w * 2.37 + phase * 3.1) + .45 * Math.sin(time * w * .61 + phase * 5.3);
        const up = .5 * Math.sin(time * w * 1.3 + phase) + .4 * Math.sin(time * w * 3.1 + phase * 2.2);
        const ax = acceleration[0] + v[2] / hv * side * force;
        const az = acceleration[2] - v[0] / hv * side * force;
        const ay = acceleration[1] + up * force * .15;
        const before = p.slice();
        for (const [axis, value] of [[0, ax], [1, ay], [2, az]]) {
          p[axis] += v[axis] * h + .5 * value * h * h;
          v[axis] += value * h;
        }
        if (p[1] < radius) {   // 這一小步穿過地板：退回到碰地那一點
          const k = before[1] > radius ? (before[1] - radius) / (before[1] - p[1]) : 0;
          for (let axis = 0; axis < 3; axis++) p[axis] = before[axis] + (p[axis] - before[axis]) * k;
          break;
        }
      }
    }
    // Receivers never invent a floor bounce before the authority reports it.
    if (p[1] < radius + 1e-6) { p[1] = radius; v.fill(0); }
    let q = (ball.q || [0, 0, 0, 1]).slice();
    if (ball.s && !ball.f) {
      const speed = Math.hypot(...ball.s), angle = speed * clamp(spinSeconds, 0, .5) / 2;
      if (speed > .001) {
        const [x, y, z] = ball.s.map(n => n / speed * Math.sin(angle)), w = Math.cos(angle);
        const [qx, qy, qz, qw] = q;
        q = [w*qx+x*qw+y*qz-z*qy, w*qy-x*qz+y*qw+z*qx, w*qz+x*qy-y*qx+z*qw, w*qw-x*qx-y*qy-z*qz];
      }
    }
    return { p, v, q };
  }
  class Authority {
    constructor(session) { this.session = session; this.round = 0; this.seq = 0; }
    reset(round) { this.round = round; this.seq = 0; }
    claim(request) {
      if (!request || request.session !== this.session || request.round !== this.round ||
          request.base !== this.seq || !validBall(request.ball) ||
          !['serve', 'bump', 'set', 'spike', 'hit', 'tip', 'block'].includes(request.kind)) return false;
      this.seq++;
      return true;
    }
  }
  class Receiver {
    constructor(session) { this.session = session; this.round = -1; this.seq = -1; this.frame = -1; }
    accept(packet) {
      if (!packet || packet.session !== this.session || !Number.isInteger(packet.frame) ||
          !Number.isInteger(packet.round) || !Number.isInteger(packet.seq) || !Number.isFinite(packet.at) ||
          packet.frame < 0 || packet.round < 0 || packet.seq < 0 ||
          packet.frame <= this.frame || packet.round < this.round ||
          (packet.round === this.round && packet.seq < this.seq) ||
          (packet.ball && !validBall(packet.ball))) return false;
      this.round = packet.round; this.seq = packet.seq; this.frame = packet.frame;
      return true;
    }
  }
  const api = { Authority, Receiver, sample, validBall };
  if (typeof module !== 'undefined') module.exports = api;
  else root.VBMatchSync = api;
})(globalThis);
