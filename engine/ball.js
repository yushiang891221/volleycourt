// 比賽引擎：球的物理（B1）。網頁和台北伺服器共用這一份。
// 規則（見 docs/架構-伺服器權威.md）：這裡不碰 THREE、畫面、音效、提示文字、連線。
// 需要「遊戲那邊決定或顯示」的地方（停住等回報、音效、提示、標誌桿、攔網判定…）一律呼叫 hooks。
//
// 向量只用 .x .y .z 三個欄位：THREE.Vector3 或一般物件 {x,y,z} 都可以。
// ball 欄位：v 速度、acc 額外加速度（可空）、float 飄球 {t,w,ph,a}（可空）、floorHit 第一次落地點 [x,z]、
//            floorT 落地時間、floorEv 這一步剛落地、netEv 這一步碰到網、spike 正在飛的扣球／發球（遊戲用）
// world 欄位：R 球半徑、H 天花板高度、segs 牆 [[x1,z1,x2,z2]…]、nets 球場（有網的）、toLocal(court,x,z)→[lx,lz]、
//             netTop 網高、netRoll(k)→0～1（連線時每台電腦要擲出一樣的數）、now()→毫秒、midpoint 是否用梯形積分
export const GRAVITY = 9.8;
export const BALL_RADIUS = 0.105;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 一整個畫面要切幾小步：每小步最多走 4 cm，快的扣球也不會一步跨過網子或牆
export function ballSubsteps(speed, seconds, maxSteps = 96) {
  return clamp(Math.ceil((speed * seconds) / 0.04), 3, maxSteps);
}

// 走一小步（h 秒）。回傳 false＝這顆球這一幀要停在這裡（hooks.floorWait 要求停住）。
export function ballSubstep(b, p, h, W, hk = {}) {
  const v = b.v, R = W.R;
  const ox = p.x, oy = p.y, oz = p.z, ovx = v.x, ovy = v.y, ovz = v.z;
  v.y -= GRAVITY * h;
  if (b.acc) { v.x += b.acc.x * h; v.y += b.acc.y * h; v.z += b.acc.z * h; }
  if (b.float) {
    const F = b.float, t = (F.t += h), w = F.w, ph = F.ph, hv = Math.hypot(v.x, v.z) || 1, sx = v.z / hv, sz = -v.x / hv;
    const side = Math.sin(t * w + ph) + 0.7 * Math.sin(t * w * 2.37 + ph * 3.1) + 0.45 * Math.sin(t * w * 0.61 + ph * 5.3), up = 0.5 * Math.sin(t * w * 1.3 + ph) + 0.4 * Math.sin(t * w * 3.1 + ph * 2.2);
    v.x += sx * side * F.a * h; v.z += sz * side * F.a * h; v.y += up * F.a * 0.15 * h;
  }
  p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
  if (W.midpoint) { p.x += (ovx - v.x) * h * .5; p.y += (ovy - v.y) * h * .5; p.z += (ovz - v.z) * h * .5; }
  // 地板
  if (p.y < R) {
    if (!b.floorHit) { b.floorHit = [p.x, p.z]; b.floorT = W.now(); b.floorEv = true; }
    if (hk.floorWait && hk.floorWait(b, p)) return false;
    b.acc = null; b.float = null;
    p.y = R;
    if (hk.floorLand) hk.floorLand(b, p);
    if (v.y < 0) { v.y = -v.y * 0.62; v.x *= 0.88; v.z *= 0.88; if (v.y < 0.5) v.y = 0; }
  }
  if (b.floorEv) { b.floorEv = false; if (hk.floorEvent) hk.floorEvent(b); }
  // 天花板
  if (p.y > W.H - R) { p.y = W.H - R; v.y = -Math.abs(v.y) * 0.5; }
  // 牆、隔網
  for (const [x1, z1, x2, z2] of W.segs) {
    const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, t = clamp(((p.x - x1) * dx + (p.z - z1) * dz) / l2, 0, 1);
    const ex = p.x - (x1 + dx * t), ez = p.z - (z1 + dz * t), dd = Math.hypot(ex, ez);
    if (dd < R && dd > 1e-6) {
      const nx = ex / dd, nz = ez / dd; p.x += nx * (R - dd); p.z += nz * (R - dd);
      const vn = v.x * nx + v.z * nz;
      if (hk.wall) hk.wall(b, vn, p);
      if (vn < 0) { v.x -= 1.6 * vn * nx; v.z -= 1.6 * vn * nz; }
    }
  }
  // 地面摩擦（滾動）
  if (p.y <= R + 1e-3) { const f = Math.max(0, 1 - 1.2 * h); v.x *= f; v.z *= f; }
  // 球網：每面排球場中線上 9.5 m 寬；沒過網就被網子擋回來
  for (const c of W.nets) {
    const [lx, lz0] = W.toLocal(c, p.x, p.z), [px0, pz0] = W.toLocal(c, ox, oz);
    if (Math.sign(lx) === Math.sign(px0) || px0 === 0) continue;
    // 穿過網子那一點的高度和左右位置（不是這一步結束的位置）
    const f = px0 / (px0 - lx), yc = oy + (p.y - oy) * f, lz = pz0 + (lz0 - pz0) * f, top = W.netTop, bot = top - 1.0;
    if (Math.abs(Math.abs(lz) - 4.5) < R + 0.012 && yc > top - 0.02 && yc < top + 0.82) { if (hk.antenna) hk.antenna(b, c, px0, lx, yc, lz); continue; }   // 標誌桿
    if (Math.abs(lz) < 5.3 && yc < top + R && yc > bot - 0.15) {
      if (hk.netRemote && hk.netRemote(b)) continue;   // 遠端負責的球：網面結果由負責的人決定
      const r = (c.rot * Math.PI) / 180, nx = Math.cos(r), nz = -Math.sin(r), vn = v.x * nx + v.z * nz, spd = Math.hypot(v.x, v.y, v.z);
      if (yc > top - 0.06) {
        // 白帶：擦到網子上緣，往上彈一點、速度變很慢；大概一半會滾過去
        const r1 = W.netRoll(1), r2 = W.netRoll(2); b.netEv = true;
        v.x *= 0.32; v.y *= 0.32; v.z *= 0.32; v.y = Math.abs(v.y) * 0.4 + 0.9 + r1 * 0.6;
        if (r2 < 0.5) { const back = Math.sign(px0) * (R + 0.02) - lx; p.x += nx * back; p.z += nz * back; v.x -= 1.3 * vn * 0.32 * nx; v.z -= 1.3 * vn * 0.32 * nz; }
        if (hk.netTouch) hk.netTouch(b, c, lz, -Math.sign(px0 || 1), spd, true, p);
      } else {
        // 網面是軟的：把球往回推一點點、沿著網子的速度也被拉住，往下掉在自己這邊網前
        const tx = v.x - vn * nx, tz = v.z - vn * nz; b.netEv = true;
        v.x = tx * 0.35 - vn * 0.15 * nx; v.z = tz * 0.35 - vn * 0.15 * nz; v.y = Math.min(v.y, 0) * 0.4 - 0.3;
        const back = Math.sign(px0) * (R + 0.03) - lx; p.x += nx * back; p.z += nz * back;
        if (hk.netTouch) hk.netTouch(b, c, lz, -Math.sign(px0 || 1), spd, false, p);
      }
    } else if (hk.cross) hk.cross(b, c, px0, yc, lz, top, bot);
  }
  if (hk.after) hk.after(b, h);
  return true;
}

// 沒有網子、牆、hooks 的單純飛行（伺服器預測、測試用）：把球往前推 seconds 秒
export function flyBall(b, p, seconds, W) {
  const steps = ballSubsteps(Math.hypot(b.v.x, b.v.y, b.v.z), seconds), h = seconds / steps;
  for (let k = 0; k < steps; k++) if (!ballSubstep(b, p, h, W)) break;
}
