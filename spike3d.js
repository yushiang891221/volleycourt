// 3D opening: an outside hitter approaches, jumps and spikes the ball straight at the viewer.
// Phases follow standard spike technique: 3-step approach (L-R-L for a right-hander) with arm backswing,
// two-foot takeoff with arm drive, bow-and-arrow cocking (left arm points at ball, right elbow high and back),
// trunk rotation + elbow-led arm acceleration, contact at full reach in front of the hitting shoulder,
// wrist snap, follow-through across the body, two-foot landing.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const DOWN = new THREE.Vector3(0, -1, 0);
const sstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---------------------------------------------------------------- keyframes
// dirs are in the parent frame: arms in the chest frame, legs in the hips frame.
// frame axes: +x = athlete's left, +y = up, +z = forward (toward the camera)
const ARM_DOWN = { u: V(0.08, -1, 0.05), f: V(0.05, -1, 0.15) };
const K = [
  { t: 0.00, hip: [-0.4, 0.94, -7.4], lean: 0.12, twist: 0, arch: 0,
    lu: V(0.1, -1, 0.15), lf: V(0.1, -0.7, 0.7), ru: V(-0.1, -1, 0.15), rf: V(-0.1, -0.7, 0.7),
    lt: V(0.02, -1, 0.15), ls: V(0, -1, -0.15), rt: V(-0.02, -1, 0.1), rs: V(0, -1, -0.12) },
  // step 1 (left foot)
  { t: 0.30, hip: [-0.4, 0.92, -6.4], lean: 0.25, twist: 0.05, arch: 0,
    lu: V(0.05, -0.9, -0.45), lf: V(0.05, -0.75, 0.3), ru: V(-0.05, -0.85, 0.5), rf: V(-0.05, -0.3, 0.95),
    lt: V(0.02, -0.82, 0.57), ls: V(0, -0.98, 0.1), rt: V(-0.02, -0.92, -0.38), rs: V(0, -0.55, -0.85) },
  // step 2 (right foot, long, arms start back)
  { t: 0.62, hip: [-0.4, 0.86, -4.6], lean: 0.35, twist: -0.05, arch: 0,
    lu: V(0.05, -0.55, -0.83), lf: V(0.05, -0.45, -0.89), ru: V(-0.05, -0.55, -0.83), rf: V(-0.05, -0.45, -0.89),
    lt: V(0.02, -0.9, -0.42), ls: V(0, -0.5, -0.86), rt: V(-0.02, -0.75, 0.66), rs: V(0, -0.97, 0.15) },
  // step 3 (left closes, plant) — deep load, arms fully back
  { t: 0.90, hip: [-0.4, 0.66, -2.5], lean: 0.62, twist: 0, arch: 0,
    lu: V(0.08, 0.25, -0.97), lf: V(0.08, 0.35, -0.93), ru: V(-0.08, 0.25, -0.97), rf: V(-0.08, 0.35, -0.93),
    lt: V(0.12, -0.5, 0.86), ls: V(0.03, -0.94, -0.33), rt: V(-0.12, -0.5, 0.86), rs: V(-0.03, -0.94, -0.33) },
  // takeoff — arms drive forward-up, legs extend
  { t: 1.14, hip: [-0.4, 1.12, -2.05], lean: 0.05, twist: 0, arch: -0.05,
    lu: V(0.15, 0.95, 0.3), lf: V(0.12, 0.97, 0.22), ru: V(-0.15, 0.95, 0.3), rf: V(-0.12, 0.97, 0.22),
    lt: V(0.06, -1, 0.05), ls: V(0, -1, -0.1), rt: V(-0.06, -1, 0.05), rs: V(0, -1, -0.1) },
  // bow-and-arrow: left arm points at the ball, right elbow high and pulled back, hand by the ear
  { t: 1.36, hip: [-0.4, 1.70, -1.55], lean: -0.05, twist: -0.5, arch: -0.28,
    lu: V(0.18, 0.8, 0.57), lf: V(0.12, 0.82, 0.56), ru: V(-0.9, 0.45, 0.4), rf: V(0.35, 0.92, 0.05),
    lt: V(0.05, -0.97, 0.22), ls: V(0, -0.65, -0.76), rt: V(-0.05, -0.97, 0.2), rs: V(0, -0.6, -0.8) },
  // elbow leads forward (acceleration)
  { t: 1.44, hip: [-0.4, 1.80, -1.38], lean: 0.05, twist: -0.2, arch: -0.1,
    lu: V(0.3, -0.1, 0.95), lf: V(-0.25, 0.25, 0.93), ru: V(-0.5, 0.72, 0.48), rf: V(-0.05, 0.75, -0.66),
    lt: V(0.05, -0.97, 0.22), ls: V(0, -0.7, -0.7), rt: V(-0.05, -0.97, 0.2), rs: V(0, -0.65, -0.75) },
  // contact — full reach in front of the hitting shoulder
  { t: 1.50, hip: [-0.4, 1.82, -1.28], lean: 0.18, twist: 0.2, arch: 0.04,
    lu: V(0.22, -0.85, 0.48), lf: V(-0.6, -0.05, 0.8), ru: V(-0.14, 0.99, -0.02), rf: V(-0.08, 0.99, 0.06),
    lt: V(0.05, -0.97, 0.25), ls: V(0, -0.8, -0.6), rt: V(-0.05, -0.97, 0.22), rs: V(0, -0.8, -0.6) },
  // follow-through across the body (wrist snapped, hand toward the left hip)
  { t: 1.70, hip: [-0.4, 1.62, -1.08], lean: 0.45, twist: 0.42, arch: 0.3,
    lu: V(0.25, -0.75, 0.6), lf: V(-0.2, -0.3, 0.93), ru: V(0.5, -0.55, 0.67), rf: V(0.6, -0.78, 0.2),
    lt: V(0.05, -0.97, 0.25), ls: V(0, -0.88, -0.45), rt: V(-0.05, -0.97, 0.22), rs: V(0, -0.85, -0.5) },
  // landing on both feet, knees bent
  { t: 2.02, hip: [-0.4, 0.78, -0.95], lean: 0.4, twist: 0.15, arch: 0.25,
    lu: V(0.25, -0.75, 0.6), lf: V(0.1, -0.2, 0.97), ru: V(-0.2, -0.8, 0.55), rf: V(-0.1, -0.3, 0.95),
    lt: V(0.14, -0.62, 0.77), ls: V(0.03, -0.95, -0.3), rt: V(-0.14, -0.62, 0.77), rs: V(-0.03, -0.95, -0.3) },
  { t: 2.60, hip: [-0.4, 0.86, -0.95], lean: 0.2, twist: 0.0, arch: 0.1,
    ...{ lu: ARM_DOWN.u, lf: ARM_DOWN.f, ru: V(-0.08, -1, 0.05), rf: V(-0.05, -1, 0.15) },
    lt: V(0.08, -0.85, 0.5), ls: V(0.02, -0.98, -0.2), rt: V(-0.08, -0.85, 0.5), rs: V(-0.02, -0.98, -0.2) },
];
const T_CONTACT = 1.50;
const PHASES = [[0, '助跑'], [0.9, '踩步起跳'], [1.2, '拉弓'], [1.42, '揮臂擊球'], [1.55, '收臂'], [2.0, '落地']];

function slerpDir(a, b, k) { return a.clone().lerp(b, k).normalize(); }
function poseAt(t) {
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1];
  const k = sstep((t - a.t) / (b.t - a.t));
  const out = { hip: a.hip.map((v, j) => v + (b.hip[j] - v) * k) };
  for (const key of ['lean', 'twist', 'arch']) out[key] = a[key] + (b[key] - a[key]) * k;
  for (const key of ['lu', 'lf', 'ru', 'rf', 'lt', 'ls', 'rt', 'rs']) out[key] = slerpDir(a[key], b[key], k);
  // ballistic flight between takeoff and landing
  if (t > 1.14 && t < 2.02) {
    const u = (t - 1.14) / (2.02 - 1.14);
    out.hip[1] = 1.12 + (0.78 - 1.12) * u + 4 * 0.92 * u * (1 - u);   // parabola: ~1 m vertical jump, peak near contact
  }
  return out;
}

// ---------------------------------------------------------------- textures
function netTexture() {
  // one 10 cm mesh cell, repeated across the net
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const g = c.getContext('2d'); g.clearRect(0, 0, 32, 32);
  g.fillStyle = 'rgba(10,10,10,.8)'; g.fillRect(0, 0, 32, 2); g.fillRect(0, 0, 2, 32);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(95, 9); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; return t;
}
function ballTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const cols = ['#F4C21E', '#1F5FB4', '#FFFFFF'];
  for (let i = 0; i < 9; i++) { g.fillStyle = cols[i % 3]; g.fillRect(0, (i * 256) / 9, 512, 256 / 9 + 1); }
  // curved seams so the panels read as a volleyball when it spins
  g.strokeStyle = 'rgba(30,40,60,.45)'; g.lineWidth = 3;
  for (let i = 0; i < 9; i++) { g.beginPath(); for (let x = 0; x <= 512; x += 8) { const y = (i * 256) / 9 + Math.sin((x / 512) * Math.PI * 2) * 10; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// ---------------------------------------------------------------- athlete rig
function makeAthlete() {
  const skin = new THREE.MeshStandardMaterial({ color: 0xC98E66, roughness: 0.6 });
  const jersey = new THREE.MeshStandardMaterial({ color: 0x1C3F8C, roughness: 0.75 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0x101826, roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xF2F2F2, roughness: 0.7 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x15171C, roughness: 0.9 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xF4F4F4, roughness: 0.5 });
  const sole = new THREE.MeshStandardMaterial({ color: 0xE2582B, roughness: 0.5 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1A1410, roughness: 0.95 });
  const cap = (r, l, m, seg = 14) => { const g = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, seg), m); g.castShadow = true; return g; };
  const root = new THREE.Group();
  const hips = new THREE.Group(); root.add(hips);
  const pelvis = cap(0.13, 0.12, shorts); pelvis.rotation.z = Math.PI / 2; pelvis.scale.set(1, 1.05, 0.85); hips.add(pelvis);
  const chest = new THREE.Group(); chest.position.y = 0.06; hips.add(chest);
  const torso = cap(0.17, 0.3, jersey); torso.position.y = 0.26; torso.scale.set(1.15, 1, 0.74); chest.add(torso);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.3), new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#1C3F8C'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#FFFFFF'; g.font = 'bold 84px Oswald, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('7', 64, 70); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.8, transparent: false }));
  front.position.set(0, 0.3, 0.123); chest.add(front);
  const neck = cap(0.045, 0.06, skin); neck.position.y = 0.52; chest.add(neck);
  const head = new THREE.Group(); head.position.y = 0.66; chest.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18), skin); skull.scale.set(0.92, 1.08, 1); skull.castShadow = true; head.add(skull);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); hairCap.position.set(0, 0.012, -0.012); hairCap.scale.set(0.95, 1.08, 1.03); head.add(hairCap);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), skin); ear.position.set(s * 0.097, 0, 0); head.add(ear); }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), skin); nose.position.set(0, -0.01, 0.103); head.add(nose);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.012, 6, 24), white); band.rotation.x = Math.PI / 2 + 0.15; band.position.y = 0.04; head.add(band);
  const limbs = {};
  const arm = (side) => {
    const sh = new THREE.Group(); sh.position.set(side * 0.2, 0.43, 0); chest.add(sh);
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 12), jersey); delt.castShadow = true; sh.add(delt);
    const up = cap(0.06, 0.2, skin); up.scale.set(1, 1, 0.92); up.position.y = -0.155; sh.add(up);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.06, 0.13, 14), jersey); sleeve.position.y = -0.06; sleeve.castShadow = true; sh.add(sleeve);
    const el = new THREE.Group(); el.position.y = -0.31; sh.add(el);
    const fo = cap(0.05, 0.19, skin); fo.scale.set(1, 1, 0.85); fo.position.y = -0.14; el.add(fo);
    const hand = new THREE.Group(); hand.position.y = -0.31; el.add(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.1, 0.032), skin); palm.position.y = -0.02; palm.castShadow = true; hand.add(palm);
    const fing = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.06, 4, 8), skin); for (let k = 0; k < 4; k++) { const f = fing.clone(); f.position.set(-0.03 + k * 0.02, -0.1, 0.004); hand.add(f); }
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.045, 4, 8), skin); th.position.set(-side * 0.05, -0.04, 0.012); th.rotation.z = side * 0.6; hand.add(th);
    return { sh, el, hand };
  };
  const leg = (side) => {
    const hp = new THREE.Group(); hp.position.set(side * 0.1, -0.03, 0); hips.add(hp);
    const th = cap(0.09, 0.27, skin); th.scale.set(1, 1, 1.05); th.position.y = -0.225; hp.add(th);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.2, 14), shorts); sh.position.y = -0.08; sh.castShadow = true; hp.add(sh);
    const kn = new THREE.Group(); kn.position.y = -0.45; hp.add(kn);
    const kp = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), pad); kp.scale.set(1, 1.15, 0.9); kp.position.set(0, -0.02, 0.02); kn.add(kp);
    const shin = cap(0.062, 0.28, skin);
    const calf = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), skin); calf.scale.set(0.95, 1.6, 0.95); calf.position.set(0, -0.15, -0.012); kn.add(calf); shin.position.y = -0.22; kn.add(shin);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.16, 12), white); sock.position.y = -0.36; kn.add(sock);
    const ft = new THREE.Group(); ft.position.y = -0.45; kn.add(ft);
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.25), shoe); s1.position.set(0, -0.02, 0.06); s1.castShadow = true; ft.add(s1);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.02, 0.26), sole); s2.position.set(0, -0.06, 0.06); ft.add(s2);
    return { hp, kn, ft };
  };
  limbs.la = arm(1); limbs.ra = arm(-1); limbs.ll = leg(1); limbs.rl = leg(-1);
  return { root, hips, chest, head, limbs };
}
const BODY = 1.08;   // ≈1.88 m outside hitter
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
function aim(joint, child, dirUpper, dirLower) {
  joint.quaternion.setFromUnitVectors(DOWN, dirUpper);
  _qi.copy(joint.quaternion).invert();
  const local = dirLower.clone().applyQuaternion(_qi);
  child.quaternion.setFromUnitVectors(DOWN, local.normalize());
}
function applyPose(A, p) {
  A.root.scale.setScalar(BODY); A.root.position.set(p.hip[0], p.hip[1] * BODY, p.hip[2]);
  A.hips.rotation.set(p.lean * 0.35, p.twist * 0.35, 0);
  A.chest.rotation.set(p.lean * 0.75 + p.arch, p.twist, 0, 'YXZ');
  A.head.rotation.set(-p.lean * 0.6 - p.arch * 0.8 - 0.1, -p.twist * 0.6, 0);
  aim(A.limbs.la.sh, A.limbs.la.el, p.lu, p.lf);
  aim(A.limbs.ra.sh, A.limbs.ra.el, p.ru, p.rf);
  aim(A.limbs.ll.hp, A.limbs.ll.kn, p.lt, p.ls);
  aim(A.limbs.rl.hp, A.limbs.rl.kn, p.rt, p.rs);
  // feet stay roughly level
  for (const L of [A.limbs.ll, A.limbs.rl]) { L.ft.quaternion.copy(L.kn.getWorldQuaternion(_q).invert()); }
}

// ---------------------------------------------------------------- arena
function makeArena(scene) {
  const teal = 0x2DA69A, court = 0xE58E66;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 50), new THREE.MeshStandardMaterial({ color: teal, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const c = new THREE.Mesh(new THREE.PlaneGeometry(9, 18), new THREE.MeshStandardMaterial({ color: court, roughness: 0.85 }));
  c.rotation.x = -Math.PI / 2; c.position.y = 0.002; c.receiveShadow = true; scene.add(c);
  const lineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const line = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineM); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, z); scene.add(m); };
  line(9.1, 0.05, 0, -9); line(9.1, 0.05, 0, 9); line(0.05, 18.05, -4.5, 0); line(0.05, 18.05, 4.5, 0);
  line(9, 0.05, 0, -3); line(9, 0.05, 0, 3); line(9, 0.05, 0, 0);
  for (const z of [-3, 3]) for (let k = 0; k < 5; k++) { line(0.15, 0.05, -4.8 - k * 0.35, z); line(0.15, 0.05, 4.8 + k * 0.35, z); }
  // posts, net, antennas
  const postM = new THREE.MeshStandardMaterial({ color: 0x2F6FD1, roughness: 0.6 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.6, 20), postM); p.position.set(s * 5.5, 1.3, 0); p.castShadow = true; scene.add(p);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.12, 20), postM); base.position.set(s * 5.5, 0.06, 0); scene.add(base);
    const ant = new THREE.Group(); ant.position.set(s * 4.5, 2.43 - 1.0, 0);
    for (let i = 0; i < 18; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffffff : 0xE02424 })); seg.position.y = 0.05 + i * 0.1; ant.add(seg); }
    scene.add(ant);
  }
  const net = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 0.9), new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  net.position.set(0, 2.43 - 0.5, 0); net.renderOrder = 2; scene.add(net);
  const tapeM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.07, 0.01), tapeM); top.position.set(0, 2.43 - 0.035, 0); scene.add(top);
  const bot = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.05, 0.01), tapeM); bot.position.set(0, 1.43 + 0.025, 0); scene.add(bot);
  for (const s of [-1, 1]) { const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.0, 6), new THREE.MeshBasicMaterial({ color: 0x222222 })); cab.rotation.z = Math.PI / 2; cab.position.set(s * 5.0, 2.42, 0); scene.add(cab); }
  // arena: blue padded lower walls, grey upper walls, ceiling light panels, sponsor board behind the far court
  const upperM = new THREE.MeshStandardMaterial({ color: 0x3A4656, roughness: 0.95 });
  const padM = new THREE.MeshStandardMaterial({ color: 0x24508F, roughness: 0.8 });
  const wall = (w, x, z, ry) => {
    const up = new THREE.Mesh(new THREE.PlaneGeometry(w, 10), upperM); up.position.set(x, 7, z); up.rotation.y = ry; scene.add(up);
    const pd = new THREE.Mesh(new THREE.PlaneGeometry(w, 2), padM); pd.position.set(x, 1, z); pd.rotation.y = ry; scene.add(pd);
    pd.position.add(new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)).multiplyScalar(0.02));
  };
  wall(40, 0, -16, 0); wall(44, -12, 0, Math.PI / 2); wall(44, 12, 0, -Math.PI / 2); wall(40, 0, 16, Math.PI);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(40, 44), new THREE.MeshStandardMaterial({ color: 0x2A3442, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 12; scene.add(ceil);
  const lampM = new THREE.MeshBasicMaterial({ color: 0xFFF8E8 });
  for (const x of [-6, 0, 6]) for (const z of [-12, -6, 0, 6, 12]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), lampM); l.rotation.x = Math.PI / 2; l.position.set(x, 11.95, z); scene.add(l); }
  const boardC = document.createElement('canvas'); boardC.width = 2048; boardC.height = 96; const bg = boardC.getContext('2d');
  bg.fillStyle = '#0B1626'; bg.fillRect(0, 0, 2048, 96); bg.fillStyle = '#F2B705'; bg.font = 'bold 54px Oswald, Arial, sans-serif'; bg.textBaseline = 'middle';
  for (let x = 40; x < 2048; x += 700) bg.fillText('HSINCHU VOLLEYBALL', x, 50);
  const boardT = new THREE.CanvasTexture(boardC); boardT.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(22, 1.0), new THREE.MeshBasicMaterial({ map: boardT })); board.position.set(0, 0.5, -13.5); scene.add(board);
}

// ---------------------------------------------------------------- player
export function playSpike3D(canvas, onPhase, done, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1A2230); scene.fog = new THREE.Fog(0x1A2230, 24, 48);
  scene.add(new THREE.HemisphereLight(0xFFFFFF, 0x2A4A50, 0.9));
  const sun = new THREE.DirectionalLight(0xFFFFFF, 2.2); sun.position.set(4, 12, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 }); sun.shadow.bias = -0.0005; scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9FC4FF, 0.8); rim.position.set(-6, 6, -10); scene.add(rim);
  makeArena(scene);
  const A = makeAthlete(); scene.add(A.root);
  A.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // where the hand is at contact → that is where the set ball must arrive
  applyPose(A, poseAt(T_CONTACT)); A.root.updateMatrixWorld(true);
  const contact = A.limbs.ra.hand.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0.05));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.105, 32, 24), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.45 }));
  ball.castShadow = true; scene.add(ball);
  const ghosts = Array.from({ length: 6 }, (_, i) => { const g = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), new THREE.MeshBasicMaterial({ color: 0xFFE38A, transparent: true, opacity: 0.18 - i * 0.025 })); scene.add(g); g.visible = false; return g; });
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 120);
  const CAM_A = new THREE.Vector3(-3.4, 3.0, 8.0), CAM_B = new THREE.Vector3(-2.3, 3.45, 4.4), camAt = CAM_B.clone();
  let baseFov = 42;
  const resize = () => { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; baseFov = w / h < 0.8 ? 64 : 42; camera.fov = baseFov; camera.updateProjectionMatrix(); };
  resize(); addEventListener('resize', resize);
  // set: from the setter (right front of the far court) up and down into the hitter's hand
  const setFrom = new THREE.Vector3(2.8, 2.3, -0.9), T_SET = 0.45;
  const apex = new THREE.Vector3((setFrom.x + contact.x) / 2, Math.max(contact.y + 1.6, 4.6), -0.9);
  const setAt = (u) => { const a = setFrom.clone().lerp(apex, u), b = apex.clone().lerp(contact, u); return a.lerp(b, u); };
  const camFront = () => camAt.clone().add(new THREE.Vector3().subVectors(contact, camAt).normalize().multiplyScalar(0.06));
  const T_END = T_CONTACT + 0.62;
  const look = new THREE.Vector3();
  let t0 = 0; let lastPhase = -1; let shake = 0;
  function frame(now) {
    if (!t0) t0 = now;
    // cap the step so a slow first frame (shader compile) never skips the approach
    const t = opts.fixedT != null ? opts.fixedT : (frame.last = Math.min((now - t0) / 1000 * 0.82, (frame.last ?? -0.05) + 0.05));     // slightly slowed so the technique reads
    applyPose(A, poseAt(Math.min(t, 2.6)));
    // ball
    let bp;
    if (t < T_SET) bp = setFrom.clone().add(new THREE.Vector3(0, -0.4 * (1 - t / T_SET), 0));
    else if (t < T_CONTACT) bp = setAt(sstep(0.15 + 0.85 * (t - T_SET) / (T_CONTACT - T_SET)) * 0.0 + (t - T_SET) / (T_CONTACT - T_SET));
    else { const u = Math.min(1, (t - T_CONTACT) / (T_END - T_CONTACT)); const e = u * u * (1.35 - 0.35 * u); bp = contact.clone().lerp(camFront(), e); if (!shake) shake = 1; }
    ball.position.copy(bp); ball.rotation.x += t > T_CONTACT ? 0.55 : 0.08; ball.rotation.z += 0.03;
    ghosts.forEach((g, i) => { g.visible = t > T_CONTACT && t < T_END; if (g.visible) { const u = Math.max(0, (t - T_CONTACT - (i + 1) * 0.025) / (T_END - T_CONTACT)); g.position.copy(contact.clone().lerp(camFront(), u * u * (1.35 - 0.35 * u))); } });
    // camera: 3/4 front view, slow push-in while the hitter approaches, then hold while the ball comes at us
    const p = CAM_A.clone().lerp(CAM_B, sstep(Math.min(1, t / T_CONTACT)));
    if (t >= T_CONTACT && !camAt.locked) { camAt.copy(p); camAt.locked = true; }
    if (shake > 0) { p.x += (Math.random() - 0.5) * 0.05 * shake; p.y += (Math.random() - 0.5) * 0.05 * shake; shake *= 0.88; }
    camera.position.copy(p);
    camera.fov = baseFov * (1 - 0.24 * sstep(Math.min(1, t / T_CONTACT))); camera.updateProjectionMatrix();
    const hip = A.root.position;
    look.set(hip.x + 0.2, hip.y + 0.55 + 0.35 * sstep((t - 1.0) / 0.4), hip.z);
    if (t > T_CONTACT) look.lerp(ball.position, sstep((t - T_CONTACT) / 0.35) * 0.6);
    if (opts.cam) { camera.position.set(...opts.cam); look.set(hip.x, hip.y + 0.6, hip.z); }
    camera.lookAt(look);
    renderer.render(scene, camera);
    let pi = 0; for (let i = 0; i < PHASES.length; i++) if (t >= PHASES[i][0]) pi = i;
    if (pi !== lastPhase) { lastPhase = pi; onPhase && onPhase(PHASES[pi][1], pi, PHASES.length); }
    if (opts.fixedT != null) { canvas.dataset.ready = '1'; return; }
    if (t < T_END) requestAnimationFrame(frame);
    else { removeEventListener('resize', resize); done && done(); setTimeout(() => renderer.dispose(), 1500); }
  }
  // warm-up: compile shaders and upload textures before the clock starts
  applyPose(A, poseAt(0)); camera.position.copy(CAM_A); camera.lookAt(0, 1.5, -3);
  try { renderer.compile(scene, camera); } catch (e) { /* older drivers */ }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
window.playSpike3D = playSpike3D;
window.dispatchEvent(new Event('spike3d-ready'));
export { poseAt, makeAthlete, applyPose };
