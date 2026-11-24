// ---------------------------------------------------------------- 導覽互動：看著物件（畫面中間的準星）按 E，手機點下方的按鈕，或直接點物件；雙擊物件看資訊報表
const SIT_EYE = { sofa: 1.12, bench: 1.12, foldchair: 1.18, campchair: 1.05, referee: 2.55 };
function actionFor(t, it) {
  if (SIT_EYE[t]) return t === 'referee' ? '爬上裁判椅' : '坐下';
  if (t === 'bleacher') return '坐上觀眾席';
  if (t === 'ballcart' || t === 'ballbasket') return '拿一顆球';
  if (['fan', 'floorfan', 'wallfan', 'exhaust'].includes(t)) return '開／關電扇';
  if (['aircon', 'standac', 'packac'].includes(t)) return '開／關冷氣';
  if (t === 'vending') return '買飲料（隨機）';
  if (['water', 'watertall', 'purifier'].includes(t)) return '拿水壺裝水';
  if (t === 'fridge') return it && walk.open.has(it.id) ? '關冰箱' : '打開冰箱';
  if (t === 'scoreboard') return '加一分（點左半邊／右半邊）';
  if (t === 'flipscore') return '翻分數（點左邊／右邊）';
  if (['locker', 'cubby', 'lowcubby'].includes(t)) return '放／拿包包';
  if (t === 'shoerack') return '放鞋子';
  if (t === 'panel') return '開／關全館的燈';
  if (t === 'tv') return '開／關電視';
  if (t === 'desk') return '坐到電腦前';
  if (t === 'camera') return '看智慧球場即時畫面（可拍照）';
  if (t === 'whiteboard') return '看戰術板';
  if (t === 'sinkrow' || t === 'steelsink') return '洗手';
  if (t === 'bins') return '丟垃圾（點哪一格丟哪一類）';
  if (t === 'toilet') return '沖水';
  if (t === 'showerstall') return '開熱水';
  return '查看';
}
// 拖車位置只屬於本次單人球館，不改動場館設計資料。
const practiceCarts = new Map();
let draggedCart = null;
function freeCartMode() {
  return window.VBTutorial?.view().phase === 'closed' && !VM.on && !NET.on && !window.__rkOn;
}
function togglePracticeCart() {
  if (draggedCart) { draggedCart = null; updateFocus(); return; }
  const item = walk.focus?.it;
  if (!freeCartMode() || item?.type !== 'ballcart' || walk.hold) return;
  let cart = practiceCarts.get(item.id);
  if (!cart) {
    let group = itemsGroup.children.find(g => g.userData.itemId === item.id);
    if (!group) zonesGroup.traverse(g => {
      const fix = g.userData.zoneFix;
      if (!group && fix && !g.parent?.userData.zoneFix && item.id === `zf:${fix.zid}:${fix.i}`) group = g;
    });
    if (!group) return;
    cart = { group, item: { ...item } }; practiceCarts.set(item.id, cart);
  }
  draggedCart = cart; updateFocus();
}
function movePracticeCart(dt) {
  if (!freeCartMode() || walk.hold || walk.sit || !draggedCart.group.parent) { draggedCart = null; return; }
  const { item, group } = draggedCart;
  const dx = walk.x - Math.sin(walk.yaw)*1.35 - item.x, dz = walk.z - Math.cos(walk.yaw)*1.35 - item.z;
  const distance = Math.hypot(dx,dz);
  if (distance > 5) { draggedCart = null; return; }
  const scale = Math.min(1, 6*dt/Math.max(distance,0.001));
  [item.x,item.z] = collide(item.x+dx*scale,item.z+dz*scale,item.id);
  group.position.x=item.x; group.position.z=item.z;
}
$('wk-cart').addEventListener('click', togglePracticeCart);
const centerRay = new THREE.Raycaster(); centerRay.far = 20;
// 射線打到的東西 → 可以互動的目標（一般元件、區域的自動擺設、門、地上的球）
function targetFromHits(hits, maxD) {
  for (const h of hits) {
    if (h.object.visible === false || h.object.userData.noPick) continue;
    if (h.object.userData.ball) { if (h.distance <= maxD + 0.5) return { kind: 'ball', b: h.object.userData.ball, label: '撿起球' }; continue; }
    if (h.object.userData.door) { if (h.distance > maxD) return null; const d = h.object.userData.door; return { kind: 'door', d, point: h.point, label: d.open ? '關門' : '開門' }; }
    const id = h.object.userData.itemId;
    if (id) {
      const it = state.items.find((x) => x.id === id); if (!it || CAT[it.type].court) continue;
      // 攝影機掛很高：遠一點也能對著它按
      if (h.distance > (it.type === 'camera' ? 20 : maxD)) return null;
      return { kind: 'item', it, point: h.point, label: actionFor(it.type, it) };
    }
    const zf = h.object.userData.zoneFix;
    if (zf) { if (h.distance > maxD) return null; const z = state.zones.find((q) => q.id === zf.zid), f = z && zoneFixtures(z)[zf.i]; if (f) { const it = { id: `zf:${zf.zid}:${zf.i}`, ...f }; return { kind: 'item', it, point: h.point, label: actionFor(f.type, it) }; } }
    // 實心的牆擋住後面的東西；玻璃、霧面玻璃看得穿
    const m = h.object.material; if (!(m && m.transparent)) break;
  }
  return null;
}
function pickTargets(ray, maxD) { return targetFromHits(ray.intersectObjects([itemsGroup, zonesGroup, ballsGroup, buildingGroup], true), maxD); }
function updateFocus() {
  centerRay.setFromCamera(new THREE.Vector2(0, 0), camera);
  walk.focus = walk.spike ? null : pickTargets(centerRay, 3.4);
  // 球很小，準星不一定對得準：走到球旁邊 1.5 m 內、大概面向它，也算看著它
  if (!walk.spike && !walk.hold && (!walk.focus || walk.focus.kind !== 'item')) {
    const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw); let best = null;
    for (const b of balls) { const dx = b.m.position.x - walk.x, dz = b.m.position.z - walk.z, d = Math.hypot(dx, dz); if (d < 1.5 && (d < 0.4 || (dx * fx + dz * fz) / d > 0.35) && (!best || d < best.d)) best = { b, d }; }
    if (best) walk.focus = { kind: 'ball', b: best.b, label: '撿起球' };
  }
  const near = !walk.spike && nearNet();
  let t = '';
  if (skill.mode) t = '按住 Q／E 準備舉球，左鍵短按快、長按慢';
  else if (walk.serve) t = '';
  else if (walk.hold) t = coarse() ? (vbAtServeLine() ? '按住「扣」瞄準、放開發球・「跳」跳發' : '按「扣」把球打出去') : vbAtServeLine() ? '左鍵發球・空白鍵跳發・X 拋給隊友' : '左鍵扣球・Q／E 自拋舉球・X 拋給隊友';   /* 手機換成按鈕說法 */
  else if (walk.sit) t = walk.sit.desk ? '打開電腦（走路就站起來）' : '站起來';
  else if (walk.focus) t = `${walk.focus.label}・${walk.focus.kind === 'ball' ? '排球' : walk.focus.kind === 'door' ? (walk.focus.d.main ? '主入口' : '門') : labelOf(walk.focus.it)}`;
  else if (near && balls.some((b) => b.rest < 0.3 && b.m.position.y > 1 && Math.hypot(b.m.position.x - walk.x, b.m.position.z - walk.z) < 3.4)) t = coarse() ? '按住「扣」起跳蓄力、轉手機瞄準、放開扣球' : '空白鍵起跳，在空中按住左鍵蓄力、放開扣球（金色格最強最準）';
  const btn = $('wk-act'); btn.hidden = !t; if (t) $('wk-act-t').textContent = t;
  const cartButton = $('wk-cart');
  cartButton.hidden = !freeCartMode() || (!draggedCart && (walk.focus?.it?.type !== 'ballcart' || walk.hold));
  cartButton.textContent = draggedCart ? '放下球車（G）' : '拖動球車（G）';
  $('wk-cross').classList.toggle('on', !!walk.focus);
}
function doInteract(tg) {
  if (walk.emote?.keyframes) return;
  if (walk.spike || walk.serve || reachState) return;
  tg = tg || walk.focus;
  if (!walk.hold && !tg) { const nb = incomingBall('set'); if (nb) return hitWorldBall(nb, 'set'); }
  if (walk.hold) return skillPress('set');
  if (walk.sit) return walk.sit.desk ? openPC() : standUp();
  if (!tg) return;
  if (tg.kind === 'ball') return pickBall(tg.b);
  if (tg.kind === 'door') { const dp = tg.point || null; if (dp) return reach(dp, () => toggleDoor(tg.d)); return toggleDoor(tg.d); }
  useItem(tg.it, tg.point);
  updateFocus();
}
function toWorldOf(it, lx, lz) { const r = (it.rot * Math.PI) / 180; return [it.x + lx * Math.cos(r) + lz * Math.sin(r), it.z - lx * Math.sin(r) + lz * Math.cos(r)]; }
function toLocalOf(it, x, z) { const r = (it.rot * Math.PI) / 180, dx = x - it.x, dz = z - it.z; return [dx * Math.cos(r) - dz * Math.sin(r), dx * Math.sin(r) + dz * Math.cos(r)]; }
const DRINKS = [['運動飲料', '#2F6FB6'], ['礦泉水', '#9FD3F2'], ['綠茶', '#3E8E41'], ['奶茶', '#C9A06A'], ['檸檬汽水', '#E8D44D'], ['黑咖啡', '#3B2A20'], ['可樂', '#B8322B'], ['蘋果西打', '#D98E32']];
const REACH = new Set(['vending', 'water', 'watertall', 'purifier', 'fridge', 'locker', 'cubby', 'lowcubby', 'shoerack', 'sinkrow', 'steelsink', 'bins', 'ballcart', 'ballbasket', 'panel', 'scoreboard', 'flipscore', 'toilet', 'showerstall', 'standac', 'packac', 'floorfan']);
function useItem(it, point, noReach) {
  const t = it.type, { w, d } = sizeOf(it), on = !walk.off.has(it.id);
  // 先伸手過去（洗手兩隻手、丟垃圾拿著垃圾、放包包拿著包包），手到了才發生
  if (!noReach && REACH.has(t) && point && !walk.hold && !reachState) {
    let p = point.clone(), opt = {};
    if (t === 'vending') { const [x, z] = toWorldOf(it, 0, -d / 2 - 0.02); p.set(x, 0.35, z); }
    if (t === 'sinkrow' || t === 'steelsink') { const [x, z] = toWorldOf(it, clamp(toLocalOf(it, point.x, point.z)[0], -w / 2 + 0.2, w / 2 - 0.2), -0.02); p.set(x, 1.0, z); opt = { both: true, wash: true }; }
    if (t === 'bins') opt = { prop: trashProp(binSlot(it, point)) };
    if (['cubby', 'lowcubby'].includes(t)) opt = { prop: bagProp() };
    if (['water', 'watertall', 'purifier'].includes(t)) opt = { prop: bottleProp() };
    reach(p, () => useItem(it, point, true), opt);
    return;
  }
  const r = (it.rot * Math.PI) / 180;
  const side = point ? (toLocalOf(it, point.x, point.z)[0] < 0 ? 0 : 1) : 0;
  if (SIT_EYE[t] || t === 'bleacher') {
    let lz = t === 'sofa' ? 0.08 : 0, eye = SIT_EYE[t];
    if (t === 'bleacher') { const tiers = Math.max(1, Math.round(d / 0.8)); lz = d / 2 - d / tiers / 2 - 0.1; eye = 0.42 * tiers + 0.8; }
    // 坐在點到的那一格（沙發、長椅、看台沿著長邊）
    let lx = 0; if (point && w > 1.2) lx = clamp(toLocalOf(it, point.x, point.z)[0], -w / 2 + 0.35, w / 2 - 0.35);
    const [sx, sz] = toWorldOf(it, lx, lz);
    walk.sit = { x: sx, z: sz, eye, it }; walk.target = null; targetMark.visible = false;
    walk.yaw = r; walk.pitch = t === 'referee' ? -0.35 : -0.05;
    toast(t === 'referee' ? '爬上裁判椅了：從這裡看得到整面網。按 F 或開始走路就會下來' : '坐下了。按 F 或開始走路就會站起來');
    return;
  }
  if (t === 'ballcart' || t === 'ballbasket') { grabBall(); toast('拿到一顆球：C 輪盤舉球、V 接球、E 上手接球、左鍵發球、在網子前起跳按左鍵攻擊'); return; }
  if (['fan', 'floorfan', 'wallfan', 'exhaust', 'aircon', 'standac', 'packac', 'tv'].includes(t)) {
    if (on) walk.off.add(it.id); else walk.off.delete(it.id);
    const ac = ['aircon', 'standac', 'packac'].includes(t);
    if (ac) { if (on) removeWind(it.id); else addWind(it); }
    toast(t === 'tv' ? (on ? '電視關掉了' : '電視打開了：正在轉播比賽（示意）') : ac ? (on ? '冷氣關掉了' : '冷氣開了：設定 26°C') : (on ? '電扇關掉了' : '電扇打開了'));
    return;
  }
  if (t === 'vending') { dropDrink(it); return; }
  if (['water', 'watertall', 'purifier'].includes(t)) { fillBottle(it); return; }
  if (t === 'fridge') { toggleFridge(it); return; }
  if (t === 'scoreboard' || t === 'flipscore') { addPoint(side, t === 'flipscore'); return; }
  if (['locker', 'cubby', 'lowcubby'].includes(t)) { toggleBag(it, point); return; }
  if (t === 'shoerack') { toast('鞋子放好了：球場只能穿室內球鞋'); return; }
  if (t === 'panel') { setDark(!walk.dark); toast(walk.dark ? '全館的燈關掉了（再按一次打開）' : '燈全部打開了'); return; }
  if (t === 'desk') {
    // 坐到辦公椅上、面向螢幕；再按 E 才打開電腦
    const [sx, sz] = toWorldOf(it, -0.2, -0.62);
    walk.sit = { x: sx, z: sz, eye: 1.2, it, desk: true }; walk.target = null; targetMark.visible = false;
    walk.yaw = r + Math.PI; walk.pitch = -0.12;
    toast('坐到電腦前了：按 F 打開電腦，走路就站起來');
    return;
  }
  if (t === 'camera') { openCamView(it); return; }
  if (t === 'whiteboard') { toast('戰術板上畫著 5-1 輪轉的站位（示意）'); return; }
  if (t === 'sinkrow' || t === 'steelsink') { washHands(it, point); return; }
  if (t === 'bins') { throwTrash(it, point); return; }
  if (t === 'toilet') { toast('嘩啦——沖好了'); return; }
  if (t === 'showerstall') { toast('熱水來了（示意）：洗完記得把地板刮乾'); return; }
  showItemCard(it);
}
// 「查看」：左下角卡片顯示名稱與尺寸
function showItemCard(it) {
  const def = CAT[it.type], { w, d } = sizeOf(it), card = $('zcard');
  $('zc-k').textContent = `ITEM · ${def.group || ''}`; $('zc-n').textContent = it.locked ? '已鎖定' : '';
  $('zc-t').textContent = labelOf(it);
  $('zc-d').textContent = '球館設備';
  const dl = [['尺寸', `${fmt1(w)}×${fmt1(d)}${def.h ? '×' + fmt1(def.h) : ''} m`], ['角度', `${f2(it.rot)}°`]];
  $('zc-dl').innerHTML = dl.map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join('');
  card.classList.remove('out'); walk.zoneKey = 'item:' + it.id;
}
function standUp() {
  const s = walk.sit; if (!s) return; walk.sit = null;
  const r = (s.it.rot * Math.PI) / 180, fx = -Math.sin(r), fz = -Math.cos(r), k = s.it.type === 'bleacher' ? Math.max(1.2, sizeOf(s.it).d) : 0.75;
  [walk.x, walk.z] = collide(s.x + fx * k, s.z + fz * k);
  walk.pitch = -0.04;
}
function setDark(dark) {
  walk.dark = dark;
  renderer.toneMappingExposure = dark ? 0.3 : 1.05;
  ledMat.emissiveIntensity = dark ? 0.04 : 2.2;
}
// ---- 小動畫：每幀推進，做完就移除
const tweens = [];
function tween(dur, step, done) { tweens.push({ t: 0, dur, step, done }); }
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; tw.t += dt; const p = Math.min(1, tw.t / tw.dur);
    tw.step(p);
    if (p >= 1) { tweens.splice(i, 1); tw.done && tw.done(); }
  }
}
const ease = (p) => p * p * (3 - 2 * p);
// ---- 門：區域的門（鉸鍊門）、主入口（玻璃滑門）；關著的門擋路
function toggleDoor(d) {
  d.open = !d.open;
  toast(d.main ? (d.open ? '主入口的自動門打開了' : '主入口的門關上了') : (d.open ? '門開了' : '門關上了'));
}
function updateDoors(dt) {
  for (const d of [...zoneDoors, ...mainDoors]) {
    const target = d.open ? 1 : 0; if (d.t === target) continue;
    d.t = clamp(d.t + Math.sign(target - d.t) * dt * 1.8, 0, 1);
    const p = ease(d.t);
    if (d.main) for (const pn of d.panes) pn.m.position.set(pn.x + d.ux * pn.s * p * d.slide, pn.y, pn.z + d.uz * pn.s * p * d.slide);
    else d.pivot.rotation.y = d.base + d.s * (Math.PI / 2) * 0.95 * p;
  }
}
function blockers() {
  const out = colliders.slice();
  for (const d of zoneDoors) if (d.t < 0.6) out.push(d.seg);
  for (const d of mainDoors) if (d.t < 0.6) out.push(d.seg);
  return out;
}
// ---- 販賣機：隨機掉一瓶飲料到取物口
const cans = [];
function dropDrink(it) {
  const [name, col] = DRINKS[Math.floor(fxRandom() * DRINKS.length)];
  const { d } = sizeOf(it), [x, z] = toWorldOf(it, (fxRandom() - 0.5) * 0.3, -d / 2 - 0.1);
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 16), mat(col)); body.position.y = 0.06; g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.02, 16), mat('#C9CDD0', { metalness: 0.8, roughness: 0.3 })); top.position.y = 0.13; g.add(top);
  g.position.set(x, 0.55, z); g.rotation.z = Math.PI / 2; g.rotation.y = fxRandom() * 3; ballsGroup.add(g);
  cans.push(g); while (cans.length > 12) ballsGroup.remove(cans.shift());
  tween(0.45, (p) => { g.position.y = 0.55 - 0.52 * p * p; }, () => { g.position.y = 0.03; });
  walk.drinks++;
  toast(`叮咚！掉出一瓶「${name}」。這趟已經買了 ${walk.drinks} 瓶`);
}
// ---- 飲水機：拿出水壺放到出水口，水慢慢裝滿
function fillBottle(it) {
  if (walk.filling) return;
  const { d } = sizeOf(it), tall = it.type === 'watertall', [x, z] = toWorldOf(it, tall ? -0.12 : 0, -d / 2 + (tall ? 0.02 : -0.06));
  const g = new THREE.Group(); g.position.set(x, tall ? 0.87 : 0.72, z);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.22, 20), new THREE.MeshStandardMaterial({ color: '#BFE3F2', transparent: true, opacity: 0.35, roughness: 0.1 })); shell.position.y = 0.11; g.add(shell);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 16), mat('#22304A')); cap.position.y = 0.24; g.add(cap);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 20), new THREE.MeshStandardMaterial({ color: '#4FA3D9', transparent: true, opacity: 0.75, roughness: 0.05 }));
  water.position.y = 0.006; water.scale.y = 0.01; g.add(water);
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 8), new THREE.MeshStandardMaterial({ color: '#7FC4EA', transparent: true, opacity: 0.6 })); stream.position.y = 0.34; g.add(stream);
  ballsGroup.add(g); walk.filling = true;
  toast('拿出水壺放到出水口，裝水中…');
  tween(2.2, (p) => { water.scale.y = Math.max(0.01, p); water.position.y = 0.006 + 0.1 * p; stream.visible = p < 0.98; }, () => {
    toast('裝滿一壺水了（600 ml），記得多補水'); walk.filling = false;
    tween(0.9, () => {}, () => ballsGroup.remove(g));
  });
}
// ---- 冰箱：門打開，裡面是空的
function toggleFridge(it) {
  const g = itemObjs.get(it.id) || null;
  let pivot = null; (g || zonesGroup).traverse((o) => { if (o.userData.fridgeOf === it.id) pivot = o; });
  const open = !walk.open.has(it.id);
  if (open) walk.open.add(it.id); else walk.open.delete(it.id);
  if (pivot) { const a0 = pivot.rotation.y, a1 = open ? 1.95 : 0; tween(0.6, (p) => { pivot.rotation.y = a0 + (a1 - a0) * ease(p); }); }
  toast(open ? '打開冰箱……裡面什麼都沒有' : '冰箱關上了');
}
// ---- 置物櫃、木格櫃：放包包（點哪一欄就放那一欄，再按一次拿回來）
function toggleBag(it, point) {
  const { w, d } = sizeOf(it), def = CAT[it.type];
  if (it.type === 'locker') {
    const n = 1 + Math.floor(clamp(point ? toLocalOf(it, point.x, point.z)[0] + w / 2 : 0, 0, w - 0.01) / 0.45);
    const k = `${it.id}:${n}`;
    if (walk.bags.has(k)) { walk.bags.delete(k); toast(`從 ${n} 號櫃拿回包包了`); } else { walk.bags.set(k, null); toast(`包包放進 ${n} 號櫃，門鎖上了`); }
    return;
  }
  const cols = Math.max(1, Math.round(w / 0.4)), cw = w / cols;
  const col = clamp(Math.floor(((point ? toLocalOf(it, point.x, point.z)[0] : 0) + w / 2) / cw), 0, cols - 1);
  const k = `${it.id}:${col}`;
  if (walk.bags.has(k)) { const m = walk.bags.get(k); if (m) ballsGroup.remove(m); walk.bags.delete(k); toast(`拿回第 ${col + 1} 格的包包`); return; }
  const low = it.type === 'lowcubby', y0 = low ? 0.08 : 0.03, cols2 = ['#B8322B', '#22304A', '#3E8E41', '#E07B39', '#6B4FA0', '#1F2124'];
  const bag = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.3, cw - 0.06), 0.17, Math.min(0.26, d - 0.06)), mat(cols2[Math.floor(fxRandom() * cols2.length)], { roughness: 0.8 })); body.position.y = 0.085; bag.add(body);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16, Math.PI), mat('#1F2124')); strap.position.y = 0.17; bag.add(strap);
  const [x, z] = toWorldOf(it, -w / 2 + cw * (col + 0.5), -0.02);
  bag.position.set(x, y0, z); bag.rotation.y = (it.rot * Math.PI) / 180; ballsGroup.add(bag);
  walk.bags.set(k, bag);
  toast(`包包放進第 ${col + 1} 格了（再按一次拿回來）`);
}
// ---- 計分：電子計分板加分、翻分板翻頁；一局 25 分、要贏 2 分
const scoreCv = document.createElement('canvas'); scoreCv.width = 512; scoreCv.height = 256;
const scoreTex = new THREE.CanvasTexture(scoreCv); scoreTex.colorSpace = THREE.SRGBColorSpace;
function drawScore() {
  let live = null; try { live = VM.on && VM.sc; } catch (e) { /* 頁面剛載入時 VM 還沒宣告 */ }
  const [a, b] = live ? [VM.sc[1], VM.sc[0]] : walk.score, sets = live ? [(VM.sets || [0, 0])[1], (VM.sets || [0, 0])[0]] : walk.sets;   // 比賽中：記分板左右跟球場方向對齊
  const key = `${a}:${b}:${sets[0]}:${sets[1]}`; if (drawScore.k === key) return; drawScore.k = key;
  const c = scoreCv.getContext('2d');
  c.fillStyle = '#F4F4F2'; c.fillRect(0, 0, 512, 256);
  c.fillStyle = '#B8322B'; c.fillRect(0, 0, 252, 46); c.fillStyle = '#2F5FA8'; c.fillRect(260, 0, 252, 46);
  c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(`主隊  ${sets[0]}`, 126, 24); c.fillText(`${sets[1]}  客隊`, 386, 24);
  c.fillStyle = '#1B2638'; c.font = 'bold 170px sans-serif'; c.fillText(String(a), 126, 160); c.fillText(String(b), 386, 160);
  c.fillRect(254, 60, 4, 190);
  scoreTex.needsUpdate = true;
}
function addPoint(side, flip) {
  walk.score[side]++;
  const [a, b] = walk.score;
  if ((a >= 25 || b >= 25) && Math.abs(a - b) >= 2) { walk.sets[a > b ? 0 : 1]++; toast(`這局 ${a}:${b} 結束！局數 主隊 ${walk.sets[0]} : ${walk.sets[1]} 客隊`); walk.score = [0, 0]; }
  else toast(`${flip ? '翻了一頁：' : ''}${side ? '客隊' : '主隊'}得分　主隊 ${a} : ${b} 客隊`);
  drawScore();
}
drawScore();
// ---- 電腦：像真的桌面——桌布、桌面圖示、視窗（標題列、最小化、關閉）、工作列與時鐘
const PIKA_URL = 'https://gorisanson.github.io/pikachu-volleyball/zh/';
const PC_APPS = {
  pika: { name: '皮卡丘打排球', icon: '⚡', open: () => `<iframe src="${PIKA_URL}" title="皮卡丘打排球" allow="autoplay; fullscreen; gamepad" allowfullscreen></iframe><p class="pc-credit">遊戲：gorisanson/pikachu-volleyball（原作者網站，點一下遊戲畫面再用鍵盤玩）・<a href="${PIKA_URL}" target="_blank" rel="noopener">在新分頁開原作網站 ↗</a></p>` },
  cctv: { name: '監視器', icon: '📹', open: () => cctvHtml() },
  // 影音網站（vbtv.html）：版面像一般影音平台，能播的是球館頻道的影片，其他點開會說還沒上架
  video: { name: '球館TV', icon: '📺', open: () => '<iframe class="full" src="vbtv.html" title="球館TV 影音網站" allow="autoplay; fullscreen" allowfullscreen></iframe>' },
};
const pc = { app: null, cams: [], camI: 0, last: 0, clockT: 0 };
function openPC() {
  $('pcwin').hidden = false; walk.paused = true; walk.keys.clear(); unlockMouse(); updateLockHint(); $('zcard').classList.add('out'); walk.zoneKey = '';
  $('pc-desk').innerHTML = Object.entries(PC_APPS).map(([k, a]) => `<button type="button" class="pc-icon" data-app="${k}"><span>${a.icon}</span><b>${a.name}</b></button>`).join('');
  pcClose(); pcClock();
}
function closePC() { pcClose(); $('pcwin').hidden = true; walk.paused = false; updateLockHint(); }
function pcOpen(k) {
  const a = PC_APPS[k]; pc.app = k;
  $('pc-title').textContent = `${a.icon} ${a.name}`; $('pc-body').innerHTML = a.open(); $('pc-app').hidden = false; $('pc-app').classList.remove('min');
  $('pc-tasks').innerHTML = `<button type="button" class="pc-task on" data-app="${k}">${a.icon} ${a.name}</button>`;
  if (k === 'cctv') setupCctv();
}
function pcClose() { pc.app = null; pc.cams = []; $('pc-body').innerHTML = ''; $('pc-app').hidden = true; $('pc-tasks').innerHTML = ''; }
function pcClock() { const el = $('pc-clock'); if (el) el.textContent = new Date().toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) + '\n' + new Date().toLocaleDateString('zh-TW'); }
// 監視器：館內有幾支攝影機（智慧球場攝影機、安全監視器）就切幾格，每格輪流更新
function cctvList() { return state.items.filter((i) => i.type === 'camera' || i.type === 'cctv'); }
function cctvHtml() {
  const list = cctvList();
  if (!list.length) return '<p class="pc-empty">這座球館目前沒有可用的攝影機畫面。</p>';
  const cols = list.length <= 1 ? 1 : list.length <= 4 ? 2 : list.length <= 9 ? 3 : 4;
  return `<div class="cctv-bar"><b>錄影 ＋ 球路偵測</b><button type="button" id="pc-rec" class="${REC.on ? 'on' : ''}">${REC.on ? '■ 停止' : '● 錄影'}</button><button type="button" id="pc-play"${REC.on || REC.frames.length < 10 ? ' disabled' : ''}>▶ 球路回放</button><span>錄的是球和人的位置（不是影片檔），回放時可以再下載成影片</span></div><div class="cctv" style="grid-template-columns:repeat(${cols},1fr)">${list.map((it, i) => `<figure><canvas data-cam="${i}" width="480" height="270"></canvas><figcaption>CH${String(i + 1).padStart(2, '0')}・${esc(labelOf(it))}</figcaption></figure>`).join('')}</div>`;
}
function setupCctv() {
  const H = state.building.H;
  pc.cams = cctvList().map((it, i) => {
    const def = CAT[it.type], y = it.type === 'cctv' ? (def.mountY || 3.2) : Math.min(H - 1.2, 5.5);
    const courts = state.items.filter((c) => CAT[c.type].court);
    const aim = it.type === 'camera' ? (courts.sort((a, b) => Math.hypot(a.x - it.x, a.z - it.z) - Math.hypot(b.x - it.x, b.z - it.z))[0] || { x: 0, z: 0 }) : null;
    const cam = new THREE.PerspectiveCamera(it.type === 'camera' ? 78 : 70, 16 / 9, 0.1, 300);
    if (aim) { const dx = aim.x - it.x, dz = aim.z - it.z, dl = Math.hypot(dx, dz) || 1; cam.position.set(it.x + (dx / dl) * 0.4, y - 0.1, it.z + (dz / dl) * 0.4); cam.lookAt(aim.x, 0.6, aim.z); }
    else { const r = (it.rot * Math.PI) / 180, fx = Math.sin(r), fz = Math.cos(r); cam.position.set(it.x + fx * 0.3, y - 0.1, it.z + fz * 0.3); cam.lookAt(it.x + fx * 8, 0.8, it.z + fz * 8); }
    return { it, cam, canvas: $('pc-body').querySelector(`canvas[data-cam="${i}"]`) };
  });
  pc.camI = 0;
  if ($('pc-rec')) {
    $('pc-rec').addEventListener('click', () => recToggle('pc'));
    $('pc-play').addEventListener('click', () => { closePC(); openReplay(); });
  }
}
function renderCctv(now) {
  if (pc.app !== 'cctv' || !pc.cams.length || now - pc.last < 70) return;
  pc.last = now;
  const c = pc.cams[pc.camI++ % pc.cams.length]; if (!c.canvas) return;
  const g = itemObjs.get(c.it.id), vis = g ? g.visible : true; if (g) g.visible = false;
  avatar.position.set(walk.x, 0, walk.z); avatar.rotation.y = walk.yaw + Math.PI; avatar.visible = true;
  const hv = hands.visible; hands.visible = false;
  const src = renderer.domElement; c.cam.aspect = src.width / src.height; c.cam.updateProjectionMatrix();
  realSync(); renderer.render(scene, c.cam);
  const ctx = c.canvas.getContext('2d'), sw = Math.min(src.width, (src.height * 16) / 9), sh = (sw * 9) / 16;
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, c.canvas.width, c.canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, c.canvas.height - 22, c.canvas.width, 22); ctx.fillStyle = '#fff'; ctx.font = '13px monospace';
  ctx.fillText(new Date().toLocaleString('zh-TW', { hour12: false }), 8, c.canvas.height - 7);
  if (REC.on) {
    const sec = Math.floor((now - REC.t0) / 1000), on = Math.floor(now / 500) % 2;
    const X0 = c.canvas.width - 112; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(X0, 6, 104, 24);
    if (on) { ctx.fillStyle = '#E5484D'; ctx.beginPath(); ctx.arc(X0 + 12, 18, 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.fillText(`REC ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`, X0 + 24, 23);
  }
  avatar.visible = false; hands.visible = hv; if (g) g.visible = vis;
}
// ---- 電腦：播影片
const VIDEO_SRC = 'assets/video/nandian-2022-fcu-vs-nsysu-v2.mp4', VIDEO_TITLE = '2022 南電盃｜逢甲通訊 A vs 中山機電';
function playVideo(title) {
  const v = $('vplayer'); if (!v.src) v.src = VIDEO_SRC;
  $('vtitle').textContent = title; $('vmodal').hidden = false; walk.keys.clear(); walk.paused = true; unlockMouse(); updateLockHint();
  v.currentTime = 0; v.play().catch(() => {});
}
function closeModals() { const v = $('vplayer'); v.pause(); $('vmodal').hidden = true; $('pmodal').hidden = true; walk.paused = false; updateLockHint(); }
// ---- 智慧球場攝影機：從那支攝影機的位置拍你（畫面裡放一個你的人形）
const avatar = (() => {
  const g = new THREE.Group(), skin = mat('#D9A57E'), jersey = mat('#F2B705', { roughness: 0.7 }), dark = mat('#22304A', { roughness: 0.7 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(0.065, 0.055, 0.82, 12), skin, s * 0.1, 0.43, 0); add(new THREE.BoxGeometry(0.11, 0.08, 0.26), mat('#F4F4F2'), s * 0.1, 0.04, -0.04); }
  add(new THREE.CylinderGeometry(0.17, 0.15, 0.24, 16), dark, 0, 0.92, 0);
  add(new THREE.CylinderGeometry(0.18, 0.16, 0.52, 16), jersey, 0, 1.3, 0);
  for (const s of [-1, 1]) { const arm = add(new THREE.CylinderGeometry(0.045, 0.04, 0.62, 10), skin, s * 0.24, 1.28, 0); arm.rotation.z = s * 0.22; }
  add(new THREE.SphereGeometry(0.12, 18, 14), skin, 0, 1.72, 0);
  add(new THREE.SphereGeometry(0.125, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat('#1F2124'), 0, 1.75, 0);
  g.visible = false; scene.add(g); return g;
})();
// 智慧球場攝影機：右上角的即時小視窗（廣角、拍整面球場，畫面裡有你），邊走邊看；可以拍下這一張
const camView = { it: null, cam: null, last: 0, big: false };
function openCamView(camIt) {
  const H = state.building.H, cy = Math.min(H - 1.2, 5.5);
  // 對準離這支攝影機最近的排球場中心（沒有球場就對館中心）
  const courts = state.items.filter((c) => CAT[c.type].court);
  const aim = courts.sort((a, b) => Math.hypot(a.x - camIt.x, a.z - camIt.z) - Math.hypot(b.x - camIt.x, b.z - camIt.z))[0] || { x: 0, z: 0 };
  const dx = aim.x - camIt.x, dz = aim.z - camIt.z, dl = Math.hypot(dx, dz) || 1;
  const pc = new THREE.PerspectiveCamera(78, 16 / 9, 0.1, 300);   // 廣角：水平約 110°
  pc.position.set(camIt.x + (dx / dl) * 0.4, cy - 0.1, camIt.z + (dz / dl) * 0.4); pc.lookAt(aim.x, 0.6, aim.z);
  camView.it = camIt; camView.cam = pc; camView.last = 0;
  $('camview').hidden = false; $('cv-name').textContent = labelOf(camIt);
  toast('智慧球場攝影機的即時畫面在右上角，可以邊走邊看；按「拍照」存下這一張');
}
function closeCamView() { camView.it = null; $('camview').hidden = true; }
function renderCamView(now) {
  if (!camView.it || now - camView.last < 160) return;
  camView.last = now;
  const camG = itemObjs.get(camView.it.id), vis = camG ? camG.visible : true; if (camG) camG.visible = false;
  avatar.position.set(walk.x, walk.sit ? walk.sit.eye - 1.6 : 0, walk.z); avatar.rotation.y = walk.yaw + Math.PI; avatar.visible = true;
  const hv = hands.visible; hands.visible = false;
  const src = renderer.domElement; camView.cam.aspect = src.width / src.height; camView.cam.updateProjectionMatrix();
  realSync(); renderer.render(scene, camView.cam);
  // 從整張畫面裁出 16:9 放進小視窗
  const cv = $('cv-canvas'), ctx = cv.getContext('2d'), sw = Math.min(src.width, (src.height * 16) / 9), sh = (sw * 9) / 16;
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, cv.width, cv.height);
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, 112, 22); ctx.fillStyle = '#ff4d4f'; ctx.beginPath(); ctx.arc(11, 11, 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText('LIVE ' + new Date().toLocaleTimeString('zh-TW', { hour12: false }), 20, 15);
  avatar.visible = false; hands.visible = hv; if (camG) camG.visible = vis;
}
function snapCamView() {
  const a = document.createElement('a'); a.href = $('cv-canvas').toDataURL('image/jpeg', 0.92); a.download = '智慧球場.jpg'; document.body.appendChild(a); a.click(); a.remove();
  toast('喀嚓！照片存下來了');
}
// ---- 排球：第一人稱雙手。C 輪盤舉球、V 接球、E 上手接球（時機對才接得住）、網前 R 攻擊；點一下丟出去
const ballsGroup = new THREE.Group(); scene.add(ballsGroup);
const balls = [];
const BALL_R = 0.105;
// 寫實排球：黃、寶藍兩色的弧形扭轉色塊（比賽球那種），色塊之間有接縫，表面是細小的凹凸紋
// 每個像素換算成球面上的方向，在方向上決定顏色，所以貼回球上不會有接縫歪掉
// 寫實排球貼圖：tools/ball_texture.py 事先算好（顏色、法線：面板鼓起、接縫凹、點狀紋；粗糙度）
const BALL_TEX = (() => {
  const L = new THREE.TextureLoader();
  const map = L.load('assets/img/ball/ball_color.jpg'), normal = L.load('assets/img/ball/ball_normal.png'), rough = L.load('assets/img/ball/ball_rough.jpg');
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normal, rough]) t.anisotropy = 8;
  return { map, normal, rough };
})();
function ballMaterial(hot) {
  return new THREE.MeshPhysicalMaterial({ map: BALL_TEX.map, normalMap: BALL_TEX.normal, normalScale: new THREE.Vector2(1, 1), roughnessMap: BALL_TEX.rough, roughness: 1, sheen: 0.25, sheenRoughness: 0.6, sheenColor: '#FFF6D0', clearcoat: 0.35, clearcoatRoughness: 0.45, emissive: hot ? '#FFF2B8' : '#000000', emissiveIntensity: hot ? 0.12 : 0 });
}
const ballMat = ballMaterial(false), ballHot = ballMaterial(true);
const BALL_VIS = 1.125;   // 畫面上的球比實際碰撞大 1.125 倍，比較好看清楚（物理、判定仍用 BALL_R）；2026-11-18 使用者要求從 1.5 縮成 0.75 倍
// 畫面上的球變大，球心卻還在 BALL_R 高度 → 會陷進地板。畫的時候把貼近地面的球往上抬（離地 0.6 m 以上就不抬），物理位置不動。
const BALL_LIFT = (BALL_VIS - 1) * BALL_R;
function ballLift(y) { return BALL_LIFT * clamp(1 - (y - BALL_R) / 0.6, 0, 1); }
// 落地壓扁（userData.wsq＝[橫向倍數, 高度倍數]）：在世界座標上下壓（球自己在轉也一樣是貼著地板扁下去），底部仍貼地
const BALL_SAVE = new Float32Array(16);
// 手碰球（avTouch）：畫的時候把球往手那邊挪一點，球面剛好貼在手上（userData.pull＝{x,y,z,t}；只在當格有效，物理位置不動）
const LIVE_BALLS = new Set(), LIVE_AVS = new Set();   // 畫面上的球、有在動的人物（avTouch／touchPass 用）
function ballPullOn(m) { LIVE_BALLS.add(m); const p = m.userData.pull, e = m.matrixWorld.elements; if (p && p.t > (touchPass.prev || 0)) {   /* 只用這一格算出來的（上一次畫之後才設的） */ e[12] += p.x; e[13] += p.y; e[14] += p.z; m.userData.pd = p; } }
function ballPullOff(m) { const p = m.userData.pd; if (p) { const e = m.matrixWorld.elements; e[12] -= p.x; e[13] -= p.y; e[14] -= p.z; m.userData.pd = null; } }
function ballLiftBefore() {
  ballPullOn(this);
  const e = this.matrixWorld.elements, d = ballLift(e[13]), q = this.userData.wsq; this.userData.lifted = d;
  (this.userData.drawAt || (this.userData.drawAt = new THREE.Vector3())).set(e[12], e[13] + d, e[14]); this.userData.drawF = frameNo;   // 這一格球實際畫在哪（連線平滑、拉到手上、貼地抬高都算進去）：光圈跟著它
  if (q) { BALL_SAVE.set(e); this.userData.saved = true; for (const i of [0, 4, 8]) e[i] *= q[0]; for (const i of [1, 5, 9]) e[i] *= q[1]; for (const i of [2, 6, 10]) e[i] *= q[0]; e[13] += d - BALL_R * BALL_VIS * (1 - q[1]); return; }
  e[13] += d;
}
function ballLiftAfter() { if (this.userData.saved) { const e = this.matrixWorld.elements; for (let i = 0; i < 16; i++) e[i] = BALL_SAVE[i];   /* three.js 的 elements 是一般陣列，沒有 .set */ this.userData.saved = false; this.userData.lifted = 0; ballPullOff(this); return; } const d = this.userData.lifted; if (d) { this.matrixWorld.elements[13] -= d; this.userData.lifted = 0; } ballPullOff(this); }
// 畫面上的轉速（每秒幾弧度，0＝不轉）。轉太快反而看起來像不轉：排球的色塊每格剛好轉到差不多的位置（2026-11-18 使用者回報扣球、跳發不會轉）
//   扣球、跳發（強上旋）：照球速，越大力轉越快，每秒 10～26 弧度；其他照擊球時的旋轉，最多 26；飄球、落地不轉
const BALL_SPIN_STEP = 0.45;   // 每一格畫面最多轉幾弧度（超過就會出現「看起來不轉」的錯覺）
function ballSpinRate(b) {
  if (!b.spinW || b.float || b.m.position.y <= BALL_R + 0.03) return 0;
  const w = b.spinW.length(); if (w < 0.01) return 0;
  return w >= 28 ? clamp(b.v.length() * 0.9, 10, 26) : Math.min(w, 26);
}
const BALL_GEO = new THREE.SphereGeometry(BALL_R * BALL_VIS, 56, 36);   // 所有球共用一份（輪廓夠圓）
function newBallMesh(decor) { const m = new THREE.Mesh(BALL_GEO, ballMat); m.castShadow = true; m.rotation.set(fxRandom() * 6, fxRandom() * 6, fxRandom() * 6); if (!decor) { m.onBeforeRender = ballLiftBefore; m.onAfterRender = ballLiftAfter; } return m; }   /* decor＝球車、球架上的擺設球：維持原尺寸、不抬 */
// 雙手（跟著鏡頭）：前臂＋手掌＋五根手指，每幀用「手肘、手腕、手指方向、掌心方向」擺出姿勢
if (!camera.parent) scene.add(camera);
const hands = new THREE.Group(); hands.visible = false; camera.add(hands);
const skinM = new THREE.MeshStandardMaterial({ color: '#D9A57E', roughness: 0.6 }), sleeveM = new THREE.MeshStandardMaterial({ color: '#F2B705', roughness: 0.7 });
const trimM = new THREE.MeshStandardMaterial({ color: '#1C1C21', roughness: 0.7 }), wristM = new THREE.MeshStandardMaterial({ color: '#F4F4F0', roughness: 0.85 });
for (const m of [skinM, sleeveM, trimM, wristM]) m.envMapIntensity = 0.45;   // 手貼著鏡頭，環境光照滿會整片發白：調暗一點，膚色、球衣顏色才看得出來
// 第一人稱的整隻手（2026-11-23 使用者：手要完整、照自己的角色）：肩膀在鏡頭後下方（畫面外）→ 上臂 → 手肘 → 前臂 → 手
//   手肘位置用兩段手臂的長度自己算（姿勢表的 e 只當作手肘往哪邊彎的提示），所以手臂長度固定、一路延伸到畫面邊緣
const FP_UA = 0.34, FP_FA = 0.32;   // 上臂、前臂長（鏡頭座標，公尺）
const FP_SH = [0.19, -0.27, 0.06];   // 右肩（左肩 x 相反）：眼睛往右 19 cm、往下 27 cm、往後 6 cm
const unitCyl = (rTop, rBot, seg = 16) => { const g = new THREE.CylinderGeometry(rTop, rBot, 1, seg, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5); return g; };   // 長 1、沿 +z（0＝起點、1＝終點）
function mkArm(side) {
  // side：-1 左手、1 右手
  // 前臂：手肘（z=0）→ 手腕（z=1），整段長度用 scale.z 拉
  const fore = new THREE.Group(); hands.add(fore);
  const fm = new THREE.Mesh(unitCyl(0.042, 0.034), skinM); fore.add(fm);
  const foreSl = new THREE.Mesh(unitCyl(0.05, 0.043), sleeveM); foreSl.scale.set(1, 1, 0.93); fore.add(foreSl);   // 長袖：蓋住前臂
  const cuff = new THREE.Mesh(unitCyl(0.045, 0.045), trimM); cuff.position.z = 0.89; cuff.scale.set(1, 1, 0.07); fore.add(cuff);   // 長袖袖口
  const band = new THREE.Mesh(unitCyl(0.04, 0.038), wristM); band.position.z = 0.8; band.scale.set(1, 1, 0.16); fore.add(band);   // 護腕
  // 上臂：手肘（z=0）→ 肩膀（z=1）
  const upper = new THREE.Group(); hands.add(upper);
  const um = new THREE.Mesh(unitCyl(0.052, 0.044), skinM); upper.add(um);
  const upSl = new THREE.Mesh(unitCyl(0.064, 0.058), sleeveM); upper.add(upSl);   // 袖子：從肩膀往手肘蓋（長度看袖型）
  const upCuff = new THREE.Mesh(unitCyl(0.06, 0.06), trimM); upper.add(upCuff);   // 短袖袖口
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), skinM); hands.add(elbow);   // 手肘關節：前臂、上臂接起來不會有缺口
  [fore, upper, elbow].forEach((o) => o.traverse((q) => { q.userData.noPick = true; q.castShadow = false; }));
  const parts = { fm, foreSl, cuff, band, um, upSl, upCuff, elbow };
  // 手：+z 是手指的方向，+y 是掌心
  const hand = new THREE.Group(); hands.add(hand);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.024, 0.088), skinM); palm.position.z = 0.044; hand.add(palm);
  // 手指分兩節（指根關節＋中間關節）：彎曲分在兩個關節上，看起來像真的手指；c 彎曲、sp 張開（2026-11-24 舉球手要張開成碗狀）
  const fingers = [];
  [[-0.03, 0.068, 0.0085], [-0.01, 0.082, 0.0092], [0.01, 0.078, 0.009], [0.03, 0.062, 0.008]].forEach(([x, L, r]) => {
    const g = new THREE.Group(); g.position.set(x * -side, 0, 0.086); hand.add(g);
    const L1 = L * 0.52, L2 = L - L1;
    const m1 = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, L1, 8), skinM); m1.rotation.x = Math.PI / 2; m1.position.z = L1 / 2; g.add(m1);
    const kn = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 8, 6), skinM); kn.position.z = L1; g.add(kn);
    const j = new THREE.Group(); j.position.z = L1; g.add(j);
    const m2 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, L2, 8), skinM); m2.rotation.x = Math.PI / 2; m2.position.z = L2 / 2; j.add(m2);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 8, 6), skinM); tip.position.z = L2; j.add(tip);
    g.userData.spread = (x / 0.03) * 0.16 * -side; g.userData.j = j; fingers.push(g);
  });
  // 拇指在手的內側（掌心朝上、手指朝前時：右手拇指在右、左手在左 → 本地 -x／+x），也分兩節
  const th = new THREE.Group(); th.position.set(-side * 0.04, 0.004, 0.026); th.rotation.y = -side * 0.85; hand.add(th);
  const tm = new THREE.Mesh(new THREE.CylinderGeometry(0.0098, 0.0115, 0.034, 8), skinM); tm.rotation.x = Math.PI / 2; tm.position.z = 0.017; th.add(tm);
  const thj = new THREE.Group(); thj.position.z = 0.034; th.add(thj);
  const tk = new THREE.Mesh(new THREE.SphereGeometry(0.0098, 8, 6), skinM); thj.add(tk);
  const tm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0088, 0.0098, 0.028, 8), skinM); tm2.rotation.x = Math.PI / 2; tm2.position.z = 0.014; thj.add(tm2);
  const tt = new THREE.Mesh(new THREE.SphereGeometry(0.0088, 8, 6), skinM); tt.position.z = 0.028; thj.add(tt);
  th.userData.j = thj;
  hand.traverse((q) => { q.userData.noPick = true; });
  return { side, fore, upper, hand, fingers, th, parts, cur: null };
}
const armL = mkArm(-1), armR = mkArm(1);
// 手的外觀照自己的角色：膚色、袖型（無袖／短袖／長袖／短版）、球衣顏色、袖口、護腕；換了角色或隊服就跟著換
const FP_LOOK = { key: '', t: 0 };
function fpArmLook() {
  const now = performance.now(); if (now - FP_LOOK.t < 500) return; FP_LOOK.t = now;
  const code = myChar(), team = VM.on ? teamKit(vmTeamOf(vmMe())) : readWornJersey() || teamKit(-1), key = code + '|' + JSON.stringify(team);
  if (key === FP_LOOK.key) return; FP_LOOK.key = key;
  const L = decodeLook(code), kit = kitOf(team); let top = L.top;
  if (kit.design && CUT_TOP[kit.design.cut] != null) top = CUT_TOP[kit.design.cut];
  skinM.color.set(LOOK_OPTIONS.skin[L.skin] || '#F7D2B4'); sleeveM.color.set(kit.sleeve || kit.body); trimM.color.set(kit.trim);
  const wr = L.eq && L.eq.wrist; if (wr) wristM.color.set(wr === 1 ? '#F4F4F0' : '#22252B');
  const slLen = { 0: 0, 1: 0.42, 2: 1.02, 3: 0.26 }[top] ?? 0.42;   // 袖子從肩膀往下蓋到上臂的幾成
  for (const arm of [armL, armR]) {
    const P = arm.parts;
    P.upSl.visible = slLen > 0; P.upSl.position.z = 1 - slLen; P.upSl.scale.z = slLen + 0.02;
    P.upCuff.visible = slLen > 0 && slLen < 1; P.upCuff.position.z = 1 - slLen; P.upCuff.scale.z = 0.05;
    P.foreSl.visible = P.cuff.visible = top === 2; P.elbow.material = top === 2 ? sleeveM : skinM;
    P.band.visible = !!wr && top !== 2;
  }
}
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
// 姿勢（鏡頭座標：x 右、y 上、z 往後；鏡頭看 -z）。e 手肘、w 手腕、f 手指方向、n 掌心方向、c 手指彎曲
const mir = (p) => ({ ...p, e: [-p.e[0], p.e[1], p.e[2]], w: [-p.w[0], p.w[1], p.w[2]], f: [-p.f[0], p.f[1], p.f[2]], n: [-p.n[0], p.n[1], p.n[2]] });
function pair(L, ball, pitch) { return { L, R: mir(L), ball, pitch }; }
const POSE = {
  // 拿著球：兩手托在球的兩側
  hold: pair({ e: [-0.22, -0.42, -0.18], w: [-0.12, -0.25, -0.5], f: [0.05, 0.6, -0.8], n: [1, 0.1, 0], c: 0.3 }, [0, -0.17, -0.56]),
  // 舉球預備（2026-11-24 重做）：兩手在額頭前上方托住球的後下方，掌心朝球、十指張開微彎成碗狀，
  //   兩根大拇指往臉的方向、和食指圍成三角形的窗；手肘往外。sp＝手指張開幾倍、ts＝大拇指往後朝臉
  set: pair({ e: [-0.3, -0.06, -0.3], w: [-0.075, 0.085, -0.48], f: [-0.43, 0.86, 0.28], n: [0.62, 0.5, -0.6], c: 0.42, sp: 2.8, ts: 1 }, [0, 0.2, -0.55], 0.38),
  // 舉球出手：手臂往球的方向伸、手腕送出，手指還是張開但彎得少
  setPush: pair({ e: [-0.24, 0.02, -0.33], w: [-0.045, 0.2, -0.5], f: [-0.5, 0.8, 0.15], n: [0.5, 0.65, -0.55], c: 0.18, sp: 1.8, ts: 0.8 }, [0, 0.3, -0.52], 0.38),
  // 背舉出手：手往頭頂上後方推（以前姿勢表沒有這個，背舉時手會跳回拿球的樣子）
  setBack: pair({ e: [-0.24, 0.05, -0.22], w: [-0.05, 0.3, -0.32], f: [-0.4, 0.6, 0.7], n: [0.5, 0.8, 0.1], c: 0.15, sp: 1.8, ts: 0.8 }, [0, 0.4, -0.2], 0.5),
};
// 低手墊球（2026-11-23 使用者照片：疊掌式）：兩臂打直併攏（手腕貼在一起、手肘不彎），掌心朝上、右手疊在左手掌心裡，
//   兩根大拇指併排放在上面、朝前下方；前臂內側形成平台。hs＝手掌往中間／往上挪（兩手疊起來），tb＝大拇指併排
function bumpPose(wy, wz, fy) {
  const f = [0.12, fy, -0.97], n = [0, 0.96, -0.28];
  return {
    L: { e: [-0.1, wy - 0.04, wz * 0.45], w: [-0.02, wy, wz], f, n, c: 0.45, hs: [0.012, 0, 0], tb: 1 },   // 兩隻前臂貼近（手腕幾乎碰在一起）
    R: { e: [0.1, wy - 0.04, wz * 0.45], w: [0.02, wy, wz], f: [-f[0], f[1], f[2]], n, c: 0.45, hs: [-0.012, 0.021, 0.006], tb: 1 },
    ball: [0, wy + 0.13, wz + 0.08], pitch: -0.3,
  };
}
POSE.bump = bumpPose(-0.34, -0.6, -0.3);
POSE.bumpHit = bumpPose(-0.26, -0.62, -0.12);   // 觸球：用腿把平台往上送，手臂不揮
// 攻擊：左手指向球、右手拉弓到頭後上方，再揮下扣球
POSE.cock = { L: { e: [-0.2, -0.12, -0.25], w: [-0.12, 0.14, -0.5], f: [0.05, 0.75, -0.65], n: [0.2, 0, -1], c: 0.15 }, R: { e: [0.25, 0.0, 0.02], w: [0.2, 0.28, -0.04], f: [0, 1, 0.15], n: [0, 0.15, -1], c: 0.1 }, ball: [0, 0.4, -0.9] };
POSE.swing = { L: { e: [-0.2, -0.4, -0.1], w: [-0.15, -0.52, -0.32], f: [0, -0.6, -0.8], n: [1, 0, 0], c: 0.5 }, R: { e: [0.16, -0.05, -0.3], w: [0.08, -0.15, -0.6], f: [0, -0.35, -1], n: [0, -0.7, -0.7], c: 0.25 }, ball: [0, 0.2, -1.2] };
// 起跳擺臂（第一人稱）：先在身體後下方（畫面外），再一起往前上方甩過畫面
POSE.jumpBack = pair({ e: [-0.26, -0.42, 0.02], w: [-0.24, -0.62, 0.1], f: [0, -0.6, 0.8], n: [1, 0, 0], c: 0.3 });
POSE.jumpUp = pair({ e: [-0.24, -0.04, -0.28], w: [-0.17, 0.26, -0.42], f: [0, 1, -0.2], n: [0.3, 0, -1], c: 0.15 });
// 攔網：兩手往上往前伸、手掌朝前（手在畫面上緣看得到）
POSE.block = { L: { e: [-0.25, 0.0, -0.32], w: [-0.19, 0.2, -0.48], f: [0.02, 1, -0.15], n: [0, 0.15, -1], c: 0.05 }, R: { e: [0.25, 0.0, -0.32], w: [0.19, 0.2, -0.48], f: [-0.02, 1, -0.15], n: [0, 0.15, -1], c: 0.05 } };
let pose = 'hold';
const _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _w0 = new THREE.Vector3();
const _ikD = new THREE.Vector3(), _ikP = new THREE.Vector3();
const FP_PIV = new THREE.Vector3(0, -0.27, 0.06), _tiltQ = new THREE.Quaternion(), _tiltE = new THREE.Euler();   // 轉平台的軸心：兩肩中間
function fpElbow(arm, c) {
  const shP = arm.sh || (arm.sh = new THREE.Vector3(FP_SH[0] * arm.side, FP_SH[1], FP_SH[2])), E = arm.el || (arm.el = new THREE.Vector3());
  _ikD.copy(c.w).sub(shP); let d = _ikD.length(); _ikD.divideScalar(d || 1);
  const k = Math.max(1, d / ((FP_UA + FP_FA) * 0.995)), ua = FP_UA * k, fa = FP_FA * k;   // 手伸得比手臂還遠：整隻等比例拉長一點點（不會斷開）
  d = Math.max(d, Math.abs(ua - fa) + 1e-3);
  const a = (ua * ua - fa * fa + d * d) / (2 * d), h = Math.sqrt(Math.max(0, ua * ua - a * a));
  _ikP.copy(c.e).sub(shP); _ikP.addScaledVector(_ikD, -_ikP.dot(_ikD));   // 手肘往哪邊彎：姿勢表的手肘位置（扣掉沿手臂方向的部分）
  if (_ikP.lengthSq() < 1e-6) _ikP.set(arm.side, -1, 0.2).addScaledVector(_ikD, -_ikD.dot(_ikP.set(arm.side, -1, 0.2)));
  _ikP.normalize();
  E.copy(shP).addScaledVector(_ikD, a).addScaledVector(_ikP, h);
}
// 網子平面（世界座標）：自己這側的法線、網子上緣高度；手還在網子上緣以下就不能穿過網面（2026-11-24 使用者：攔網手不能穿網）
const _npW = new THREE.Vector3(), _npO = new THREE.Vector3(), _npL = new THREE.Vector3();
function fpNetPlane() {
  const ct = typeof vbCourt === 'function' && vbCourt(); if (!ct || Math.abs(ct.lx) > 1.5) return null;
  const r = (ct.c.rot * Math.PI) / 180, sg = Math.sign(ct.lx) || 1;
  return { x: ct.c.x, z: ct.c.z, nx: sg * Math.cos(r), nz: -sg * Math.sin(r), top: NETS[state.net].h };
}
function applyPose(dt, snap) {
  camera.updateMatrixWorld(true);
  const NP = fpNetPlane();
  const P = POSE[pose] || POSE.hold, k = snap ? 1 : 1 - Math.exp(-dt * 18);
  for (const [arm, tgt] of [[armL, P.L], [armR, P.R]]) {
    if (!arm.cur || snap) arm.cur = { e: V3(tgt.e), w: V3(tgt.w), f: V3(tgt.f).normalize(), n: V3(tgt.n).normalize(), c: tgt.c };
    const c = arm.cur;
    // 按住 V 轉手臂平台（照參考圖：球在哪一側就壓低那一側的肩膀）：整個上半身連肩膀一起轉（往那側轉＋那側肩膀往下），
    //   兩隻手臂跟著整組轉、長度不變（2026-11-23 使用者：轉角度時手不能變短；滑鼠往右＝右肩高、左肩低，手被帶到右邊）
    const rt = (pose === 'bump' || pose === 'bumpHit') && walk.recv && walk.recv.hold ? Math.sin(((walk.recvTilt || 0) / 0.8) * Math.PI / 2) : 0;
    arm.tilt = (arm.tilt || 0) + (rt - (arm.tilt || 0)) * k;
    const tl = arm.tilt; _tiltE.set(0, -tl * 0.55, tl * 0.32, 'YXZ'); _tiltQ.setFromEuler(_tiltE);   /* 往右轉（手到右邊）＋右肩往上 */
    const rotP = (a) => V3(a).sub(FP_PIV).applyQuaternion(_tiltQ).add(FP_PIV), rotD = (a) => V3(a).applyQuaternion(_tiltQ);
    (arm.sh || (arm.sh = new THREE.Vector3())).copy(rotP([FP_SH[0] * arm.side, FP_SH[1], FP_SH[2]]));
    c.e.lerp(rotP(tgt.e), k); c.w.lerp(rotP(tgt.w), k); c.f.lerp(rotD(tgt.f).normalize(), k).normalize(); c.n.lerp(rotD(tgt.n).normalize(), k).normalize(); c.c += (tgt.c - c.c) * k;
    // 網子：指尖（手腕往手指方向 17 cm）離網面至少 6 cm；手腕已經高過網子上緣＝手伸過網上方（攔網本來就可以），不擋
    if (NP) {
      hands.localToWorld(_npW.copy(c.w)); const wy = _npW.y;
      hands.localToWorld(_npW.copy(c.w).addScaledVector(c.f, 0.17));
      const sd = Math.min((_npW.x - NP.x) * NP.nx + (_npW.z - NP.z) * NP.nz, (hands.localToWorld(_npO.copy(c.w)).x - NP.x) * NP.nx + (_npO.z - NP.z) * NP.nz);
      if (wy < NP.top + 0.05 && sd < 0.06) {
        hands.worldToLocal(_npO.set(0, 0, 0)); hands.worldToLocal(_npL.set(NP.nx * (0.06 - sd), 0, NP.nz * (0.06 - sd))).sub(_npO);
        c.w.add(_npL); c.e.add(_npL);
      }
    }
    // 手肘：肩膀和手腕固定，兩段手臂長度固定，往姿勢表的 e 那一側彎
    fpElbow(arm, c);
    // 前臂：手肘 → 手腕；上臂：手肘 → 肩膀（肩膀在畫面外，所以手臂一路延伸到畫面邊緣）
    arm.fore.position.copy(arm.el); arm.parts.elbow.position.copy(arm.el); arm.upper.position.copy(arm.el);
    hands.localToWorld(_w1.copy(c.w)); arm.fore.lookAt(_w1); arm.fore.scale.set(1, 1, arm.el.distanceTo(c.w));
    hands.localToWorld(_w1.copy(arm.sh)); arm.upper.lookAt(_w1); arm.upper.scale.set(1, 1, arm.el.distanceTo(arm.sh));
    // 手：在手腕，手指朝 f，掌心朝 n
    c.hs = (c.hs || new THREE.Vector3()).lerp(_w0.set(...(tgt.hs || [0, 0, 0])).applyQuaternion(_tiltQ), k); c.tb = (c.tb || 0) + ((tgt.tb || 0) - (c.tb || 0)) * k;
    arm.hand.position.copy(c.w).add(c.hs);
    hands.localToWorld(_w0.set(0, 0, 0)); hands.localToWorld(_w2.copy(c.n));
    arm.hand.up.copy(_w2.sub(_w0)).normalize();
    hands.localToWorld(_w1.copy(c.w).add(c.f)); arm.hand.lookAt(_w1);
    c.sp = (c.sp ?? 1) + ((tgt.sp ?? 1) - (c.sp ?? 1)) * k; c.ts = (c.ts || 0) + ((tgt.ts || 0) - (c.ts || 0)) * k;
    for (const g of arm.fingers) { g.rotation.set(-c.c * 0.55, g.userData.spread * c.sp * (1 - 0.6 * Math.min(1, c.c)), 0); g.userData.j.rotation.x = -c.c * 0.85; }
    // 大拇指：平常往外張；墊球時併排放在手背上、跟手指同方向（tb 0→1 漸變）
    // 墊球：兩根大拇指貼在一起，放在疊好的手上面、朝前（照手掌本地 x 軸實際朝向，往兩手中間那一側放）
    const tb = c.tb || 0, inX = _w2.set(1, 0, 0).applyQuaternion(arm.hand.quaternion).x, toC = (arm.side < 0 ? 1 : -1) * (inX >= 0 ? 1 : -1);
    const tx0 = -arm.side * 0.04, tx1 = toC * 0.006, ty1 = arm.side < 0 ? 0.046 : 0.025;   // 下面那隻手（左手）的拇指要高過上面那隻手
    arm.th.position.set(tx0 + (tx1 - tx0) * tb, 0.004 + (ty1 - 0.004) * tb, 0.026 + 0.012 * tb); arm.th.rotation.set(-c.c * 0.6 * (1 - tb) + 0.1 * tb - 0.35 * c.ts, -arm.side * (0.85 + 0.75 * c.ts) * (1 - tb), 0); arm.th.userData.j.rotation.x = -c.c * 0.5 * (1 - tb) - 0.25 * c.ts;
  }
}
const skill = { mode: null, h: 0, v: 0, n: 0, best: 0, since: 9, kick: 0, dip: 0 };
const SKV = { set: 4.2, bump: 5.0 };
// 球在鏡頭座標裡沿這個方向飛出去再回來（舉球往上前方、墊球往上前方高一點）
const SKDIR = { set: [0, 0.75, -0.66, 0.5], bump: [0, 0.8, -0.6, 0.45] };
function grabBall() { if (typeof LOBBY_MODE !== 'undefined' && LOBBY_MODE) { toast('大廳只能走走逛逛、坐沙發、喝水；打球請開始配對或進練習模式', 1800); return; } if (walk.hold) return; if (VM.on && !VM.grabOK) { toast('比賽中不能拿球（輪到你發球時球會自動給你）', 1800); return; } walk.hold = newBallMesh(); walk.hold.userData.noPick = true; camera.add(walk.hold); pose = 'hold'; hands.visible = true; applyPose(0, true); placeHeld(); }
function placeHeld() {
  const m = walk.hold; if (!m) return;
  if (skill.mode) {
    const c = POSE[skill.mode].ball, d = SKDIR[skill.mode], h = skill.h * d[3];
    m.position.set(c[0] + d[0] * h, c[1] + d[1] * h, c[2] + d[2] * h);
  } else { const c = POSE.hold.ball; m.position.set(c[0], c[1], c[2]); m.material = ballMat; }
}
function releaseBall(v) {
  // 手上的球變成場上的球（世界座標＋初速）
  const m = walk.hold; if (!m) return; walk.hold = null;
  const p = new THREE.Vector3(); m.getWorldPosition(p); camera.remove(m); m.position.copy(p); m.material = ballMat; m.visible = true; delete m.userData.noPick;
  m.userData.ball = { m, v, rest: 0 }; ballsGroup.add(m); balls.push(m.userData.ball);
  while (balls.length > 8) { const old = balls.shift(); ballsGroup.remove(old.m); }
  skill.mode = null; skill.dip = 0; hands.visible = false;
  if (NET.on) netBallHit(m.userData.ball, 'throw');
  vmOnTouch(m.userData.ball, vmMe(), 'throw');
  recHit({ x: m.position.x, y: m.position.y, z: m.position.z, v: v.length(), kind: 'throw' });
}
function throwBall() {
  if (walk.emote?.keyframes) return;
  if (!walk.hold || skill.mode) return;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  releaseBall(fwd.multiplyScalar(9.5).add(new THREE.Vector3(0, 2.2, 0)));
}
function pickBall(b) {
  if (walk.hold) return;
  if (VM.on) { toast('比賽中不能撿球：按住 Q／E，瞄準後用左鍵舉球', 1800); return; }
  const i = balls.indexOf(b); if (i >= 0) balls.splice(i, 1);
  if (b.room) netGrab();
  ballsGroup.remove(b.m); delete b.m.userData.ball; b.m.userData.noPick = true; walk.hold = b.m; camera.add(b.m);
  pose = 'hold'; hands.visible = true; applyPose(0, true); placeHeld();
  toast('撿起球了：左鍵扣球（發球區改為發球）、Q／E 自拋舉球、X 拋給隊友');
}
// 判定：球往下掉、離觸球點在 -0.38～0.6 m 之間按就算接到（球會亮）；剛觸球後 0.22 秒內的連按不算
const inWindow = () => skill.v < 0 && skill.h < 0.6 && skill.h > -0.38;
function skillPress(kind) {
  if (walk.emote?.keyframes) return;
  if (walk.spike) return;
  // 有球飛到手邊：直接碰出去（不用先拿著球）
  if (!skill.mode) { const nb = incomingBall(kind); if (nb) return hitWorldBall(nb, kind); }
  if (!walk.hold) return;
  if (!skill.mode) {
    skill.mode = kind; skill.h = 0; skill.v = SKV[kind]; skill.n = 0; skill.since = 0; skill.kick = 0.16; pose = kind === 'set' ? 'setPush' : 'bumpHit';
    toast(kind === 'set' ? '舉球：手在額頭前，球掉回手上（球亮起來）時用 C 輪盤舉球' : '墊球：雙手交握、手臂伸直，球掉到前臂（球亮起來）時按 V');
    return;
  }
  if (skill.since < 0.22) return;
  if (!inWindow()) { if (skill.v > 0 && skill.h < 0.3) return; return skillMiss(skill.v > 0 || skill.h >= 0.6 ? '太早按了' : '太晚了'); }
  skill.mode = kind; skill.v = SKV[kind]; skill.h = Math.max(0, skill.h); skill.n++; skill.since = 0; skill.kick = 0.16;
  pose = kind === 'set' ? 'setPush' : 'bumpHit';
  skill.best = Math.max(skill.best, skill.n);
  $('wk-combo').textContent = `${kind === 'set' ? '舉球' : '墊球'} 連續 ${skill.n} 下${skill.best > 1 ? `（最佳 ${skill.best}）` : ''}`; $('wk-combo').hidden = false;
}
function skillMiss(why) {
  const n = skill.n;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); fwd.y = 0;
  releaseBall(fwd.multiplyScalar(0.6).add(new THREE.Vector3(0, -0.5, 0)));
  $('wk-combo').hidden = true;
  toast(`${why}，球掉了！這次連續 ${n} 下${skill.best ? `，最佳 ${skill.best} 下` : ''}。走過去空手按左鍵拿球`);
}
function updateSkill(dt) {
  // 碰完來球：手亮一下就收起來
  if (walk.flash > 0) { walk.flash -= dt; skill.dip = skill.mode ? skill.dip : 0.05 * Math.max(0, walk.flash) / 0.45; if (walk.flash <= 0 && !walk.hold && !reachState && !walk.serve) { if (walk.recv && walk.recv.hold) pose = 'bump'; else { hands.visible = false; pose = 'hold'; } } }   /* 按住 V：接完手回到接球姿勢 */
  else if (!skill.mode) skill.dip = 0;
  if (!skill.mode || !walk.hold) return;
  skill.since += dt;
  skill.v -= 9.8 * dt; skill.h += skill.v * dt;
  // 觸球：手臂送出一下再回到預備姿勢，膝蓋微蹲再站起
  if (skill.kick > 0) { skill.kick -= dt; if (skill.kick <= 0) pose = skill.mode; }
  skill.dip = skill.since < 0.35 ? Math.sin((skill.since / 0.35) * Math.PI) * 0.05 : 0;
  // 視線跟著球：舉球抬頭、墊球看前下方（滑鼠還是可以轉）
  const tp = POSE[skill.mode].pitch; if (tp != null) walk.pitch += (tp - walk.pitch) * (1 - Math.exp(-dt * 4));
  walk.hold.material = inWindow() ? ballHot : ballMat;
  walk.hold.rotation.x += dt * 6;
  if (skill.h < -0.55) skillMiss(skill.mode === 'set' ? '沒接到（舉球要在球回到額頭前用 C 輪盤舉球）' : '沒接到（墊球要在球掉到前臂時按 V）');
}
// ---- 網前攻擊：助跑、起跳、揮臂把舊舉過來的球扣過網、落地
// ---- 扣球：R 站著扣（手臂揮下去，球從頭上打過網）；按住空白鍵再按 R（或跳起來時按 R）＝助跑起跳扣球
// 球要是真的：手上的球自己拋起來打，或是飛到附近的球（隊友舉過來的）
function courtAt(x, z, far) {
  let best = null;
  for (const c of state.items) {
    if (CAT[c.type].court !== 'vb' || c.mode === 'lines') continue;
    const [lx, lz] = toLocalOf(c, x, z);
    // 先看你在不在這面場的範圍裡（場外多遠），一樣才比離網子多近；隔壁場就不會被挑到
    if (Math.abs(lx) < (far ? 15 : 4) && Math.abs(lz) < (far ? 8 : 4.6)) { const d = (Math.max(0, Math.abs(lx) - 9) + Math.max(0, Math.abs(lz) - 4.5)) * 100 + Math.abs(lx); if (!best || d < best.d) best = { c, lx, lz, d }; }
  }
  return best;
}
const nearNet = () => courtAt(walk.x, walk.z, false);
// 出手速度：讓球落在 (tx, tz)，而且如果要過網，經過網子時高度至少 2.6 m（不夠就把弧線拉高）
function solveShot(p0, tx, tz, court, sg, Tmin) {
  for (let T = Tmin; T < 2.6; T += 0.03) {
    const v = new THREE.Vector3((tx - p0.x) / T, (BALL_R - p0.y) / T + 4.9 * T, (tz - p0.z) / T);
    if (!court) return v;
    const [l0] = toLocalOf(court, p0.x, p0.z), [l1] = toLocalOf(court, tx, tz);
    if (Math.sign(l0) === Math.sign(l1) || l0 === l1) return v;
    const f = l0 / (l0 - l1), t = f * T, y = p0.y + v.y * t - 4.9 * t * t;
    if (y >= 2.6) return v;
  }
  return new THREE.Vector3((tx - p0.x) / 2.6, (BALL_R - p0.y) / 2.6 + 4.9 * 2.6, (tz - p0.z) / 2.6);
}
function startSpike(jump) {
  if (walk.emote?.keyframes) return;
  if (walk.spike || walk.sit || walk.serve) return;
  let own = null, incoming = null;
  if (walk.hold) { const p0 = new THREE.Vector3(); walk.hold.getWorldPosition(p0); own = walk.hold; camera.remove(own); own.position.copy(p0); own.material = ballMat; delete own.userData.noPick; ballsGroup.add(own); walk.hold = null; skill.mode = null; $('wk-combo').hidden = true; }
  else {
    let best = null;
    for (const b of balls) { if (b.rest > 0.3 || b.m.position.y < 1.0) continue; const d = Math.hypot(b.m.position.x - walk.x, b.m.position.z - walk.z); if (d < (jump ? 3.4 : 2.2) && (!best || d < best.d)) best = { b, d }; }
    if (!best) { toast('要有球才能扣：拿著球按左鍵（扣球），或等隊友把球舉過來時再按'); return; }
    incoming = best.b; balls.splice(balls.indexOf(incoming), 1); if (incoming.room) netGrab();
  }
  const ct = courtAt(walk.x, walk.z, true), sg = ct ? Math.sign(ct.lx) || 1 : 1;
  // 跳扣：沿著你面向的方向助跑（最多 2.2 m，不跨過網）；站著扣不助跑
  const dir = [-Math.sin(walk.yaw), -Math.cos(walk.yaw)];
  let run = 0;
  if (jump) {
    if (ct) { const r = (ct.c.rot * Math.PI) / 180, toNet = [-sg * Math.cos(r), sg * Math.sin(r)], along = dir[0] * toNet[0] + dir[1] * toNet[1]; run = along > 0.2 ? Math.max(0, Math.min(2.2, (Math.abs(ct.lx) - 0.9) / along)) : 1.2; }
    else run = 1.2;
  }
  walk.target = null; targetMark.visible = false; walk.jump = null;
  const ball = own || incoming.m; delete ball.userData.ball;
  walk.spike = { t: 0, jump: !!jump, ct, sg, dir, x0: walk.x, z0: walk.z, run, hit: false, ball, from: ball.position.clone(), self: !!own, hitT: jump ? 1.0 : 0.5, endT: jump ? 1.7 : 0.95 };
  hands.visible = true; pose = 'cock';
}
function updateSpike(dt) {
  const s = walk.spike; s.t += dt; const t = s.t;
  let eye = EYE;
  if (s.jump) {
    // 助跑 0–0.45s、蹲 0.45–0.65、跳 0.65–1.0、擊球 1.0、落地 1.0–1.45、站穩 1.7
    const runP = ease(clamp(t / 0.45, 0, 1));
    const nx = s.x0 + s.dir[0] * s.run * runP, nz = s.z0 + s.dir[1] * s.run * runP;
    const ok = !s.ct || (() => { const [nlx] = toLocalOf(s.ct.c, nx, nz); return Math.sign(nlx) === s.sg && Math.abs(nlx) > 0.5; })();
    if (ok) [walk.x, walk.z] = collide(nx, nz);
    if (t < 0.45) eye = EYE + Math.sin(t * 20) * 0.02;
    else if (t < 0.65) eye = EYE - 0.32 * ease((t - 0.45) / 0.2);
    else if (t < 1.0) eye = EYE - 0.32 + 1.05 * Math.sin(((t - 0.65) / 0.35) * Math.PI / 2);
    else if (t < 1.45) eye = EYE + 0.73 - 0.73 * ((t - 1.0) / 0.45) ** 2 - 0.12 * Math.max(0, (t - 1.35) / 0.1);
    else eye = EYE - 0.12 * (1 - ease((t - 1.45) / 0.25));
    walk.pitch = t < 0.45 ? 0.05 : t < 1.0 ? 0.05 + 0.4 * ease((t - 0.45) / 0.55) : 0.45 - 0.75 * ease(Math.min(1, (t - 1.0) / 0.4));
  } else {
    // 站著扣：拉弓（0–0.45s）、揮臂擊球（0.5s）、收手
    eye = EYE - 0.04 * Math.sin(clamp(t / s.endT, 0, 1) * Math.PI);
    walk.pitch += ((t < s.hitT ? 0.3 : -0.1) - walk.pitch) * (1 - Math.exp(-dt * 8));
  }
  // 擊球點跟著你現在面向的方向（還沒打到之前都可以用滑鼠微調）
  const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw);
  const reachY = s.jump ? EYE + 0.73 + 0.55 : EYE + 0.62;
  const hitP = new THREE.Vector3(walk.x + fx * 0.45, reachY, walk.z + fz * 0.45);
  // 球：自己的球從手上往前上方拋；隊友舉來的球從它現在的位置飄到擊球點
  if (s.ball && !s.hit) {
    const p = clamp(t / s.hitT, 0, 1), arc = Math.sin(p * Math.PI) * (s.self ? (s.jump ? 1.6 : 0.9) : 0.5);
    s.ball.position.lerpVectors(s.from, hitP, p); s.ball.position.y += arc; s.ball.rotation.x += dt * 8;
  }
  pose = t < s.hitT - 0.02 ? 'cock' : 'swing';
  if (t >= s.hitT && !s.hit) {
    s.hit = true;
    // 落點＝你面向的那條線：面向對面就落在網後（跳扣 4～7 m、站著扣 5～8 m），面向別處就照方向往前；瞄出界就是出界
    let tx = walk.x + fx * (s.jump ? 6 : 8), tz = walk.z + fz * (s.jump ? 6 : 8);
    const c = s.ct && s.ct.c;
    if (c) {
      const [lx, lz] = toLocalOf(c, walk.x, walk.z), [ax, az] = toLocalOf(c, walk.x + fx, walk.z + fz), dlx = ax - lx, dlz = az - lz;
      const depth = s.jump ? 4 + Math.random() * 3 : 5 + Math.random() * 3, k = dlx * -s.sg > 0.05 ? (-s.sg * depth - lx) / dlx : 0;
      if (k > 0) [tx, tz] = toWorldOf(c, lx + dlx * k, lz + dlz * k);
    }
    const p0 = s.ball.position.clone(), D = Math.hypot(tx - p0.x, tz - p0.z);
    const v = solveShot(p0, tx, tz, c, s.sg, s.jump ? clamp(D * 0.05, 0.3, 0.7) : clamp(D * 0.07, 0.5, 1.0));
    s.ball.userData.ball = { m: s.ball, v, rest: 0, spike: c ? { c, sg: s.sg } : null }; balls.push(s.ball.userData.ball);
    if (NET.on) netBallHit(s.ball.userData.ball, s.jump ? 'spike' : 'hit');
    recHit({ x: p0.x, y: p0.y, z: p0.z, v: v.length(), by: NET.me || 'me', kind: s.jump ? 'spike' : 'hit' });
    while (balls.length > 8) { const old = balls.shift(); ballsGroup.remove(old.m); }
    toast(s.jump ? '跳起來扣——！' : '扣！');
  }
  camera.position.set(walk.x, eye, walk.z);
  camera.rotation.order = 'YXZ'; camera.rotation.set(walk.pitch, walk.yaw, 0);
  if (t > s.endT) { walk.spike = null; hands.visible = !!walk.hold; pose = 'hold'; if (s.jump) walk.pitch = -0.04; }
}
// ---- 跳（空白鍵）：原地或邊走邊跳，0.6 秒、最高 0.5 m；跳起來時按 R 就是跳扣
function startJump() {
  if (walk.emote?.keyframes) return; if (walk.jump || walk.spike || walk.sit || walk.serve || walk.paused) return; walk.jump = { t: 0 }; }
function jumpY(dt) { return vbAirStep(dt); }
// ---- 伸手：右手（洗手是兩手）伸向看著的地方，手上可以拿著東西；手到了才觸發效果
let reachState = null;
const OFF_L = { e: [-0.3, -0.9, 0.05], w: [-0.25, -0.95, -0.1], f: [0, 0, -1], n: [0, 1, 0], c: 0.5 };
const OFF_R = { e: [0.3, -0.9, 0.05], w: [0.25, -0.95, -0.1], f: [0, 0, -1], n: [0, 1, 0], c: 0.5 };
function reach(worldPoint, fn, opt = {}) {
  if (reachState || walk.hold) { fn(); return; }
  camera.updateMatrixWorld(true);
  const local = hands.worldToLocal(worldPoint.clone());
  const armFor = (sx) => {
    const sh = new THREE.Vector3(0.2 * sx, -0.3, 0.05), dir = local.clone().add(new THREE.Vector3(0.05 * sx * (opt.both ? 1 : 0), 0, 0)).sub(sh);
    const L = Math.min(dir.length(), 0.6); dir.normalize();
    const w = sh.clone().addScaledVector(dir, L), e = sh.clone().addScaledVector(dir, L * 0.42).add(new THREE.Vector3(0.07 * sx, -0.06, 0));
    return { e: e.toArray(), w: w.toArray(), f: dir.clone().add(new THREE.Vector3(0, -0.15, 0)).toArray(), n: opt.wash ? [0, 1, 0] : [-sx, 0.2, 0], c: opt.prop ? 0.9 : 0.35 };
  };
  POSE.reach = { L: opt.both ? armFor(-1) : OFF_L, R: armFor(1), ball: [0, 0, 0] };
  POSE.rest = { L: OFF_L, R: OFF_R, ball: [0, 0, 0] };
  pose = 'rest'; applyPose(0, true); hands.visible = true; pose = 'reach';
  if (opt.prop) { opt.prop.position.set(0, 0.05, 0.12); armR.hand.add(opt.prop); }
  reachState = { t: 0, fn, fired: false, opt };
}
function updateReach(dt) {
  const r = reachState; r.t += dt;
  if (r.opt.wash && r.t > 0.3 && r.t < 1.5) { const k = Math.sin(r.t * 22) * 0.025; armL.cur && armL.cur.w.add(new THREE.Vector3(k, 0, 0)); armR.cur && armR.cur.w.add(new THREE.Vector3(-k, 0, 0)); }
  if (!r.fired && r.t > 0.32) { r.fired = true; if (r.opt.prop && r.opt.prop.parent === armR.hand && !r.opt.keepProp) armR.hand.remove(r.opt.prop); r.fn(); }
  const back = r.opt.wash ? 1.6 : 0.6;
  if (r.t > back) pose = walk.hold ? 'hold' : 'rest';
  if (r.t > back + 0.35) { reachState = null; if (r.opt.prop && r.opt.prop.parent) r.opt.prop.parent.remove(r.opt.prop); pose = skill.mode || 'hold'; if (!walk.hold) hands.visible = false; }
}
// 手上的小東西
function trashProp(slot) {
  if (slot === 2) { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.18, 14), new THREE.MeshStandardMaterial({ color: '#CFE8F2', transparent: true, opacity: 0.55, roughness: 0.1 })); b.rotation.x = Math.PI / 2; g.add(b); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 10), mat('#2F5FA8')); cap.rotation.x = Math.PI / 2; cap.position.z = 0.1; g.add(cap); return g; }
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), mat(slot === 1 ? '#F4F4F0' : '#8E9399', { roughness: 0.95, flatShading: true })); m.scale.set(1, 0.85, 1.1); return m;
}
function bagProp() { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.12), mat('#22304A', { roughness: 0.8 })); g.add(b); return g; }
function bottleProp() { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 14), new THREE.MeshStandardMaterial({ color: '#BFE3F2', transparent: true, opacity: 0.45 })); g.add(b); const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 12), mat('#22304A')); c2.position.y = 0.1; g.add(c2); return g; }
// ---- 分類回收桶：一般垃圾／紙類／瓶罐，丟進點到的那一格
function binSlot(it, point) { const { w } = sizeOf(it); return point ? clamp(Math.floor((toLocalOf(it, point.x, point.z)[0] + w / 2) / (w / 3)), 0, 2) : 0; }
function throwTrash(it, point) {
  const slot = binSlot(it, point), { w } = sizeOf(it), names = ['一般垃圾', '紙類', '瓶罐'];
  const [x, z] = toWorldOf(it, -w / 3 + slot * (w / 3), 0);
  const from = new THREE.Vector3(); armR.hand.getWorldPosition(from);
  const m = trashProp(slot); m.position.copy(from); ballsGroup.add(m);
  const to = new THREE.Vector3(x, 0.82, z);
  tween(0.4, (p) => { m.position.lerpVectors(from, to, p); m.position.y += Math.sin(p * Math.PI) * 0.25; m.rotation.x += 0.2; }, () => { tween(0.2, (p) => { m.position.y = 0.82 - 0.3 * p; }, () => ballsGroup.remove(m)); });
  toast(`丟進「${names[slot]}」了${slot === 2 ? '（瓶罐要先倒乾淨）' : ''}`);
}
// ---- 洗手：水龍頭流水、兩手搓一搓
function washHands(it, point) {
  const { w } = sizeOf(it), lx = point ? clamp(toLocalOf(it, point.x, point.z)[0], -w / 2 + 0.2, w / 2 - 0.2) : 0;
  const [x, z] = toWorldOf(it, lx, 0.06);
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.14, 10), new THREE.MeshStandardMaterial({ color: '#BFE3F2', transparent: true, opacity: 0.65, roughness: 0.05 }));
  stream.position.set(x, 1.0, z); ballsGroup.add(stream);
  tween(1.3, (p) => { stream.scale.x = stream.scale.z = 1 + Math.sin(p * 60) * 0.15; }, () => { ballsGroup.remove(stream); toast('洗好手了，記得擦乾再拿球'); });
}
// ---- 冷氣涼風：出風口吹出一串淡藍色的點，慢慢散開淡掉（開著才有）
const winds = new Map();
const windTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'); const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
function addWind(it) {
  if (winds.has(it.id) || walk.off.has(it.id)) return;
  const { w, d } = sizeOf(it), def = CAT[it.type], N = 140;
  // 出風口與方向（物件自己的座標）：壁掛冷氣往下前方吹，落地／箱型冷氣從上半部往前吹
  const wall = !!def.wall, y0 = wall ? (def.mountY || 2.4) + 0.05 : it.type === 'packac' ? 1.75 : 1.45;
  const o = wall ? [0, y0, d / 2 + 0.05] : [0, y0, -d / 2 - 0.05], dir = wall ? [0, -0.55, 0.84] : [0, -0.12, -1];
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), seed = [];
  for (let i = 0; i < N; i++) seed.push({ t: fxRandom(), x: (fxRandom() - 0.5) * w * 0.85, y: (fxRandom() - 0.5) * 0.12, sp: 0.7 + fxRandom() * 0.6 });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: windTex, color: '#B9E4FF', size: 0.09, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  const g = new THREE.Group(); g.position.set(it.x, 0, it.z); g.rotation.y = (it.rot * Math.PI) / 180; g.add(pts); scene.add(g);
  pts.frustumCulled = false;
  winds.set(it.id, { g, pts, seed, o, dir, len: wall ? 2.6 : 3.2 });
}
function removeWind(id) { const wd = winds.get(id); if (!wd) return; scene.remove(wd.g); wd.pts.geometry.dispose(); winds.delete(id); }
function updateWind(dt) {
  for (const wd of winds.values()) {
    const a = wd.pts.geometry.attributes.position;
    wd.seed.forEach((s0, i) => {
      s0.t += dt * 0.45 * s0.sp; if (s0.t > 1) s0.t -= 1;
      const L = s0.t * wd.len, spread = 1 + s0.t * 1.6;
      a.setXYZ(i, wd.o[0] + s0.x * spread + wd.dir[0] * L, wd.o[1] + s0.y * spread + wd.dir[1] * L - 0.25 * s0.t * s0.t, wd.o[2] + wd.dir[2] * L);
    });
    a.needsUpdate = true;
  }
}
// ---- 發球瞄準：轉頭左右＝方向、往上看＝打深（到底線前）、往下看＝打短（網前約 3 m）；拿著球時對面場上畫一個圈（黃＝場內、紅＝出界）
function vbServeAim() {
  let court = null, sg = 1, lx = 0, lz = 0;
  for (const c of vbNetCourts()) { const [x, z] = toLocalOf(c, walk.x, walk.z); if (Math.abs(x) > 14 || Math.abs(z) > 7) continue; court = c; sg = Math.sign(x) || 1; lx = x; lz = z; break; }
  if (!court) return null;
  const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw), [ax, az] = toLocalOf(court, walk.x + fx, walk.z + fz), dlx = ax - lx, dlz = az - lz;
  if (dlx * -sg < 0.05) return null;   // 沒有面向對面
  // 深淺：電腦用滑鼠滾輪微調（每格 25 cm，離網 2.5～9.6 m）；手機沒有滾輪，照舊用抬頭低頭
  const depth = coarse() ? clamp(3 + ((walk.pitch + 0.2) / 0.7) * 5.6, 2.5, 9.6) : (VB.aimDepth ?? 6), k = (-sg * depth - lx) / dlx, tlz = lz + dlz * k, [tx, tz] = toWorldOf(court, -sg * depth, tlz);
  // 球要從兩根標誌桿中間過網：直線路徑在網子那裡的位置超過 ±4.5 m＝從標誌桿外過網（犯規）
  const kz = (0 - lx) / (-sg * depth - lx), netZ = lz + (tlz - lz) * kz, ant = Math.abs(netZ) > 4.5 - BALL_R;
  return { court, sg, tx, tz, depth, tlz, ant, inside: depth <= 9 && Math.abs(tlz) <= 4.5 && !ant };
}
function vbAimRing() {
  const show = !RP.on && (walk.hold || (walk.jserve && !walk.jserve.hit) || (walk.serve && !walk.serve.hit)) && (VM.on || vbCourt());
  const a = !show ? null : walk.jserve ? walk.jserve.aim : walk.serve ? walk.serve.aim : vbServeAim();
  // 紅色目標圈：外圈、半透明底、十字、中心點；旁邊標「離網幾 m」（出界或從標誌桿外過網＝灰色＋標出來）
  if (!VB.aim) {
    const g = new THREE.Group(), M2 = (o = 0.95) => new THREE.MeshBasicMaterial({ color: '#E5484D', transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
    const parts = [new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 40), M2()), new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), M2(0.22)), new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), M2()), new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.05), M2(0.8)), new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1.8), M2(0.8))];
    for (const m of parts) { m.rotation.x = -Math.PI / 2; m.renderOrder = 3; g.add(m); }
    // 從底線斜斜看過去地上的圈會很扁：再加一個浮在空中、往下指的紅色倒三角＋一道淡淡的光柱
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 4), M2()); arrow.rotation.x = Math.PI; arrow.position.y = 1.55; arrow.renderOrder = 3; arrow.userData.arrow = true; g.add(arrow);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), M2(0.35)); beam.position.y = 0.66; g.add(beam);
    scene.add(g); VB.aim = g;
  }
  VB.aim.visible = !!a; if (VB.aimLbl) VB.aimLbl.visible = !!a; if (!a) return;
  const col = a.inside ? '#E5484D' : '#9AA4B2', txt = a.ant ? '標誌桿外' : !a.inside ? '出界' : `離網 ${a.depth.toFixed(1)} m`;
  VB.aim.position.set(a.tx, 0.025, a.tz); for (const m of VB.aim.children) m.material.color.set(col);
  if (VB.aimTxt !== txt) { if (VB.aimLbl) { scene.remove(VB.aimLbl); VB.aimLbl.material.map.dispose(); } VB.aimLbl = labelSprite(txt, col, 1.5); VB.aimLblK = 1; scene.add(VB.aimLbl); VB.aimTxt = txt; }
  VB.aimLbl.position.set(a.tx, 2.15, a.tz);
  const ar = VB.aim.children.find((m) => m.userData.arrow); if (ar) {   // 離得越遠箭頭放越大，而且不會被網子擋住
    const k = clamp(Math.hypot(camera.position.x - a.tx, camera.position.z - a.tz) / 4.5, 1, 4); ar.scale.setScalar(k); ar.material.depthTest = false;
    ar.position.y = 1.55 + 0.3 * (k - 1) + Math.sin(performance.now() / 220) * 0.08 * k; ar.rotation.y += 0.03; VB.aimLbl.position.y = 2.2 + 0.55 * (k - 1); VB.aimLbl.scale.multiplyScalar(k / (VB.aimLblK || 1)); VB.aimLblK = k;
    for (const m of VB.aim.children) if (!m.userData.arrow && m.geometry.type !== 'CylinderGeometry') m.scale.setScalar(1 + (k - 1) * 0.35);   // 地上的圈遠的時候也放大一點（從底線看過去很扁）
  }
  if (a.ant && walk.hold && performance.now() - (VB.antT || 0) > 3000) { VB.antT = performance.now(); toast('這個方向會從標誌桿外面過網（犯規）', 1500); }

}
// 給落點、球速、重力（上旋球下墜快＝重力大）：找出手速度剛好是 spd 的拋物線；過不了網就放慢拉高
function serveVel(p, tx, tz, spd, g, court, sg, margin = 0.12) {
  const V = (T) => new THREE.Vector3((tx - p.x) / T, (BALL_R - p.y) / T + 0.5 * g * T, (tz - p.z) / T);
  // 球速最慢的那條拋物線（Tmin）；要求的球速比它快，就在 Tmin 左邊（比較平、比較快）找剛好的
  let a = 0.12, c = 4; for (let i = 0; i < 40; i++) { const m1 = a + (c - a) / 3, m2 = c - (c - a) / 3; if (V(m1).length() < V(m2).length()) c = m2; else a = m1; }
  const Tmin = (a + c) / 2; let T = Tmin;
  if (V(Tmin).length() < spd) { let lo = 0.08, hi = Tmin; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (V(m).length() > spd) lo = m; else hi = m; } T = hi; }
  const clear = (v) => { if (!court) return true; const [l0] = toLocalOf(court, p.x, p.z), [l1] = toLocalOf(court, tx, tz); if (Math.sign(l0) === Math.sign(l1)) return true; const t = (l0 / (l0 - l1)) * T; return p.y + v.y * t - 0.5 * g * t * t > NETS[state.net].h + BALL_R + margin; };
  let v = V(T); for (let i = 0; i < 40 && !clear(v); i++) { T += 0.03; v = V(T); }
  return v;
}
// 發球打出去：瞄準點＋誤差（打得越不準誤差越大；跳發最難控、站發最穩）
function serveLaunch(ball, p0, type, q, aim, chg = null) {
  const a = aim !== undefined ? aim : vbServeAim(), fwd = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));   // 沒對著對面時就往前 13 m
  let tx = a ? a.tx : walk.x + fwd.x * 13, tz = a ? a.tz : walk.z + fwd.z * 13;
  // 跳發／跳飄的蓄力（跟扣球同一條）：
  //   跳發：甜蜜點＝很重很快又準；沒對到＝比較慢、落點有偏差（蓄過頭常出界）
  //   跳飄：甜蜜點＝飄得很兇（左右上下亂晃，很難接）；沒對到＝普通的飄球；蓄過頭＝落點亂掉
  //   沒蓄力（手機按鈕）＝中等
  const C = type === 'jump' || type === 'jfloat' ? vbChargeOf(chg == null ? 0.55 : chg) : null, sweet = !!C && C.zone === 'sweet';
  if (C && C.sta > 1) staPay('jserve', C.sta - 1);   // 用力的跳發多耗體力
  const err = (1 - q) * 2.2 + { std: 0.25, float: 0.35, jump: 0.5, jfloat: 0.45 }[type] + (C ? C.err * 1.6 + (sweet ? 0 : 0.3) : 0); tx += rkGauss() * err * 0.6; tz += rkGauss() * err * 0.6;
  const jm = !C ? 1 : sweet ? 1.2 : C.zone === 'over' ? 1.12 : 0.8 + 0.3 * clamp((C.pw - 0.62) / 0.33, 0, 1);   // 跳發球速倍數：輕 0.8、中段約 0.95、甜蜜點 1.2
  const spd = { std: 13, float: 12.5, jump: (19 + 7 * q) * jm, jfloat: 14 + 3 * q }[type], g = type === 'jump' ? 14.3 : 9.8;
  if (window.__gym) window.__gym.lastServe = { type, q: +q.toFixed(2), chg, zone: C && C.zone, spd: +spd.toFixed(1) };
  const v = serveVel(p0, tx, tz, spd, g, a && a.court, a && a.sg);
  const b = { m: ball, v, rest: 0, spike: a ? { c: a.court, sg: a.sg } : null, serve: true };
  if (type === 'jump' || type === 'std') { const hv = Math.hypot(v.x, v.z) || 1, sq = typeof q === 'number' ? q : 0.8; b.spinW = new THREE.Vector3(v.z / hv, 0, -v.x / hv).multiplyScalar(type === 'jump' ? 45 + 25 * sq : 15); }   /* 跳發強上旋、一般發球輕上旋；飄球不轉 */
  if (type === 'jump') b.acc = new THREE.Vector3(0, -4.5, 0);   // 上旋：下墜比一般快
  if (type === 'float' || type === 'jfloat') b.float = { t: 0, w: 4.5 + Math.random() * 3, ph: Math.random() * 6.3, a: type === 'float' ? 4.5 : !C ? 5 : sweet ? 12 : C.zone === 'over' ? 7 : C.zone === 'light' ? 3.5 : 5 };   // 飄球：沒有旋轉，空中左右上下亂晃（跳飄甜蜜點晃最兇）
  ball.userData.ball = b; balls.push(b);
  tutEv('serve', { type, zone: C && C.zone }, b);
  if (NET.on) netBallHit(b, 'serve');
  if (VM.on) { b.spike = null; vmOnTouch(b, vmMe(), 'serve'); }
  vbImpact(b, type === 'jump' ? 'spike' : 'serve', q);
  recHit({ x: p0.x, y: p0.y, z: p0.z, v: v.length(), kind: 'serve' });
  while (balls.length > 8) { const old = balls.shift(); ballsGroup.remove(old.m); }
  const zt = C ? { sweet: '・完美蓄力', over: '・用力過猛', late: '・蓄過頭一點', light: '・輕', mid: '' }[C.zone] : '';
  toast({ std: '發球！', float: '飄球！', jump: (q >= 0.85 ? '跳發！（擊球點完美）' : '跳發！') + zt, jfloat: (sweet ? '跳飄！飄得很兇' : '跳飄！') + (sweet ? '' : zt) }[type], 1100);
}
// ---- 站發（左鍵）／站飄（右鍵）：左手把球拋到頭前上方，右手拉弓、在最高點附近揮臂
// 發球區：底線後面、兩條邊線延長線之間。比賽中輪到你發球時走不進場內；跳發的起跳也在線後（落地可以在場內）
function vbServeSide() {
  if (VM.on && VM.c) { const team = vmTeamOf(vmMe()); return team < 0 ? null : { c: VM.c, sg: vmSide(team) }; }
  const ct = vbCourt(); return ct ? { c: ct.c, sg: Math.sign(ct.lx) || 1 } : null;
}
function vbServeZone() {
  if (!VM.on || !(walk.hold || walk.serve || (walk.jserve && !walk.jserve.jumped))) return;
  const z = vbServeSide(); if (!z) return;
  const [lx, lz] = toLocalOf(z.c, walk.x, walk.z); if (lx * z.sg >= 9.1 && Math.abs(lz) <= 4.5) return;
  const [x, w] = toWorldOf(z.c, z.sg * Math.max(9.1, lx * z.sg), clamp(lz, -4.5, 4.5)); walk.x = x; walk.z = w;
  if (performance.now() - (walk.szT || 0) > 2500) { walk.szT = performance.now(); toast('發球要站在底線後面（兩條邊線延長線之間）', 1600); }
}
// 站在場內按發球：不行，要先退到底線後面
function vbServeInside() {
  if (!VM.on) return false;   // 練習時哪裡都可以發；開始比賽才照規則
  const z = vbServeSide(); if (!z) return false;
  const [lx, lz] = toLocalOf(z.c, walk.x, walk.z); if (Math.abs(lx) > 14) return false;
  if (lx * z.sg < 9.0) { toast('要退到底線後面才能發球', 1600); return true; }
  if (Math.abs(lz) > 4.5) { toast('要站在兩條邊線（標誌桿）延長線之間發球', 1800); return true; }
  return false;
}
function startServe(type = 'std') {
  if (walk.emote?.keyframes) return;
  if (walk.serve || walk.spike || walk.sit) return;
  if (walk.hold && !vmServeOK()) return;
  if (!walk.hold) { toast('先拿一顆球（看著球車按 F）才能發球'); return; }
  if (vbServeInside()) return;
  if (skill.mode) { skill.mode = null; $('wk-combo').hidden = true; }
  const p = new THREE.Vector3(); walk.hold.getWorldPosition(p); camera.remove(walk.hold);
  const ball = walk.hold; walk.hold = null; ball.position.copy(p); ball.material = ballMat; ball.visible = true; delete ball.userData.noPick; ballsGroup.add(ball);   // 第三人稱時手上的球被藏起來過，拋出去要讓它看得見
  const fwd = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
  const top = new THREE.Vector3(walk.x, EYE + 0.95, walk.z).addScaledVector(fwd, 0.45);
  walk.serve = { t: 0, ball, from: p, top, fwd, hit: false, type, aim: vbServeAim() }; staPay('serve');   // 落點在按下去那一刻就定了（拋球時鏡頭會抬頭，不能再算）
  hands.visible = true; pose = 'cock';
  toast(type === 'float' ? '拋球——（飄球）' : '拋球——');
}
// ---- 跳發／跳飄：拿著球按空白鍵＝拋球（往前上方拋高），自動跑兩步起跳；在空中按左鍵＝跳發（重、上旋下墜）、右鍵＝跳飄（不轉、會飄）
//      球最好打的時候：你跳到最高點、球剛好掉到手的高度（球會發亮）；拋了沒打到＝發球失誤
const JS_REL = 0.32, JS_GO = 0.62, JS_UP = 1.05;   // 跳發：球出手、開始助跑、起跳的時間（秒）
function startJumpServe() {
  if (walk.emote?.keyframes) return;
  if (walk.serve || walk.jserve || walk.air || walk.sit || !walk.hold) return;
  if (!vmServeOK()) return;
  if (vbServeInside()) return;
  if (skill.mode) { skill.mode = null; $('wk-combo').hidden = true; }
  const p = new THREE.Vector3(); walk.hold.getWorldPosition(p); camera.remove(walk.hold);
  const ball = walk.hold; walk.hold = null; ball.position.copy(p); ball.material = ballMat; ball.visible = true; delete ball.userData.noPick; ballsGroup.add(ball);
  const fwd = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
  // 先算好：助跑多遠（比賽中遇到底線就提早停）、0.72 秒起跳、跳到最高點時手在哪；把球拋到那個時間、那個位置
  let appr = 1.15; const zs = VM.on ? vbServeSide() : null;
  if (zs) { const [lx0] = toLocalOf(zs.c, walk.x, walk.z), [lx1] = toLocalOf(zs.c, walk.x + fwd.x, walk.z + fwd.z), dl = (lx1 - lx0) * zs.sg; if (dl < -0.05) appr = clamp((lx0 * zs.sg - 9.12) / -dl, 0, 1.15); }
  const VY = 3.7, tA = JS_UP + VY / JUMP_G, drift = 0.55 * (VY / JUMP_G), fx = fwd.x, fz = fwd.z, ox = walk.x + fx * (appr + drift), oz = walk.z + fz * (appr + drift);
  const hand = new THREE.Vector3(ox + fx * 0.35 - fz * 0.12, EYE + 0.75 + (VY * VY) / (2 * JUMP_G) - 0.05, oz + fz * 0.35 + fx * 0.12);
  // 2026-11-25 照預覽頁：左手先把球帶到身體中線、往正上方高高拋出去（JS_REL 秒出手），拋完看球才助跑
  const rel = new THREE.Vector3(walk.x + fx * 0.28, EYE + 0.5, walk.z + fz * 0.28), tF = tA - JS_REL;
  const v0 = new THREE.Vector3((hand.x - rel.x) / tF, (hand.y - rel.y + 4.9 * tF * tF) / tF, (hand.z - rel.z) / tF);
  walk.jserve = { t: 0, ball, from: rel, p0: p, fwd, v0, appr, vy: VY, hit: false, swung: false, jumped: false, aim: vbServeAim() };
  hands.visible = true; pose = 'cock';
  toast('拋球——跳起來在空中按住左鍵（跳發）或右鍵（跳飄）蓄力，放開就打；金色甜蜜點最強', 2200);
}
function updateJumpServe(dt) {
  const s = walk.jserve; s.t += dt; const t = s.t, b = s.ball;
  if (!s.hit) {
    const tf = t - JS_REL;
    if (tf < 0) { const u = t / JS_REL, e = u * u * (3 - 2 * u); b.position.lerpVectors(s.p0, s.from, e); }   // 還沒出手：球跟著左手從胸前帶到中線、往上送
    else b.position.set(s.from.x + s.v0.x * tf, s.from.y + s.v0.y * tf - 4.9 * tf * tf, s.from.z + s.v0.z * tf);
    b.rotation.y += dt * 4;
    // 拋完看球，JS_GO 秒才開始助跑（左大步 → 右左很快跟上），JS_UP 秒起跳；這樣跳到最高點時球剛好掉到手的高度
    if (t > JS_GO && t < JS_UP && !walk.air) { const sp = s.appr / (JS_UP - JS_GO), [nx, nz] = collide(walk.x + s.fwd.x * sp * dt, walk.z + s.fwd.z * sp * dt); walk.x = nx; walk.z = nz; vbServeZone(); }   // 助跑（距離已經算好，不會超過底線）
    if (!s.jumped && t >= JS_UP) { s.jumped = true; walk.air = { y: 0, vy: s.vy, vx: s.fwd.x * 0.55, vz: s.fwd.z * 0.55, block: false, serve: true, t: 0 }; staPay('jserve'); if (walk.chargeArm) { const k2 = walk.chargeArm; walk.chargeArm = null; vbChargeStart(k2); } }
    walk.pitch += (0.32 - walk.pitch) * (1 - Math.exp(-dt * 3));
    // 時機提示：球進到手邊就發亮
    const near = walk.air && b.position.distanceTo(vbHand()) < 0.7; b.material = near ? ballHot : ballMat;
    if (s.pend && walk.air) { if (b.position.distanceTo(vbHand()) <= 1.0) { const tp = s.pend.type, pc = s.pend.chg; s.pend = null; jumpServeHit(tp, pc); return; } if (s.t - s.pend.t > 0.5) { s.pend = null; s.swung = true; toast('揮空了：等球發亮（掉到手邊）再按', 1500); } }
    if (tf > 0 && b.position.y < 1.0) {   // 拋了沒打到：球掉下去，發球失誤
      b.material = ballMat; const ob = { m: b, v: new THREE.Vector3(s.v0.x, s.v0.y - 9.8 * tf, s.v0.z), rest: 0 }; b.userData.ball = ob; balls.push(ob);
      walk.jserve = null; hands.visible = false; pose = 'hold'; toast('拋了沒打到：發球失誤', 1600);
      if (VM.on && VM.host && VM.phase === 'serve') { const team = vmTeamOf(vmMe()); VM.phase = 'rally'; VM.ball = ob; VM.touch = { team, n: 3, last: vmMe(), serve: true }; vmPoint(1 - team, '發球失誤（拋了沒打到）'); }
      else if (VM.on && !VM.host && NET.on) NET.tx.publish('vm', { e: 'srvMiss', id: NET.me });
    }
  } else if (t > s.hitT + 0.5 && !walk.air) { walk.jserve = null; hands.visible = false; pose = 'hold'; }
}
// 空中擊球：手離球越近越好（0.3 m 內＝完美）；太遠就揮空（只能揮一次）
function jumpServeHit(type, chg = null) {
  const s = walk.jserve; if (!s || s.hit || s.swung || !walk.air) return;
  const H = vbHand(), d = s.ball.position.distanceTo(H);
  walk.swing = { t: 0, tip: false, done: true, doneT: 0, prev: null }; pose = 'swing';   // 揮臂動作
  if (d > 1.1) { if (!s.pend) s.pend = { type, t: s.t, chg }; return; }   // 按早了：先不算揮空，0.5 秒內球掉到手邊就自動打
  const q = clamp(1 - (Math.max(0, d - 0.3) / 0.8) * 0.65, 0.3, 1);
  s.hit = true; s.hitT = s.t; s.ball.material = ballMat;
  serveLaunch(s.ball, s.ball.position.clone(), type === 'float' ? 'jfloat' : 'jump', q, s.aim, chg);
}
function updateServe(dt) {
  const s = walk.serve; s.t += dt; const t = s.t;
  // 0–0.55s：球從手上拋到最高點再往下一點；0.6s 擊球
  if (!s.hit) {
    const p = Math.min(1, t / 0.6), arc = Math.sin(p * Math.PI * 0.85);
    s.ball.position.lerpVectors(s.from, s.top, Math.min(1, p * 1.15)); s.ball.position.y = s.from.y + (s.top.y - s.from.y) * arc; s.ball.rotation.y += dt * 3;
    walk.pitch += (0.35 - walk.pitch) * (1 - Math.exp(-dt * 6));
  }
  pose = t < 0.55 ? 'cock' : 'swing';
  if (t >= 0.6 && !s.hit) { s.hit = true; serveLaunch(s.ball, s.ball.position.clone(), s.type === 'float' ? 'float' : 'std', 1, s.aim); }   // 落點＝瞄準圈（站發誤差最小）
  if (t > 1.15) { walk.serve = null; hands.visible = false; pose = 'hold'; }
}
const ballShadows = [];
function ballShadowSync() {
  for (let i = 0; i < Math.max(balls.length, ballShadows.length); i++) {
    let m = ballShadows[i];
    if (!m && i < balls.length) { m = new THREE.Mesh(new THREE.CircleGeometry(0.13 * BALL_VIS, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; ballShadows.push(m); }
    if (!m) continue;
    if (i >= balls.length) { m.visible = false; continue; }
    if (!m.parent) ballsGroup.add(m);
    const q = balls[i].m.position; m.visible = true; m.position.set(q.x, 0.013, q.z); m.material.opacity = clamp(0.42 - q.y * 0.05, 0.08, 0.42); m.scale.setScalar(1 + q.y * 0.08);
  }
}
function vbNetCourts() { return state.items.filter((c) => CAT[c.type].court === 'vb' && c.mode !== 'lines' && !c.use); }
// 比賽中球過網：從網子下面過去、或從標誌桿（兩側紅白桿）外面過去，都是送球那一隊犯規
// 打到標誌桿：彈開、算犯規（送球那一隊失分）
function vbAntenna(b, c, from, lx, yc, lz) {
  const r = (c.rot * Math.PI) / 180, nx = Math.cos(r), nz = -Math.sin(r), vn = b.v.x * nx + b.v.z * nz, p = b.m.position;
  b.v.x -= 1.5 * vn * nx; b.v.z -= 1.5 * vn * nz; b.v.multiplyScalar(0.55); const back = Math.sign(from) * (BALL_R + 0.03) - lx; p.x += nx * back; p.z += nz * back;
  netBallSound(b, 'antenna', Math.min(1, b.v.length() / 8 + 0.4), p);
  if (VM.on && VM.host && VM.phase === 'rally' && b === VM.ball && c.id === VM.c.id) { const team = vmSide(0) === Math.sign(from) ? 0 : 1; vmPoint(1 - team, '球打到標誌桿'); }
}
function vmCrossCheck(b, c, from, yc, lz, top, bot) {
  if (!VM.on || !VM.host || VM.phase !== 'rally' || b !== VM.ball || c.id !== VM.c.id) return;
  const team = vmSide(0) === Math.sign(from) ? 0 : 1;
  if (yc <= bot - BALL_R && Math.abs(lz) < 5.3) vmPoint(1 - team, '球從網子下面過去');
  else if (Math.abs(lz) > 4.5 + BALL_R && yc > 0.3) vmPoint(1 - team, '球從標誌桿外面過網');
}
// B1：球的物理交給 engine/ball.js；下面是「遊戲這邊」要做的事（停住等回報、提示、音效、網子特效、標誌桿、攔網）
const BALL_WORLD = { R: BALL_R, H: 9, segs: [], nets: [], toLocal: toLocalOf, netTop: 2.43, netRoll: k => vbNetRoll(k), now: () => performance.now(), midpoint: false };
const BALL_HOOKS = {
  floorWait(b, p) {   /* WEB-023：別人負責的球先落地，停住等回報 */
    if (!(NET.on && b.room && !NET.ownBall && !b.floorReport && !b.waitFloor && b.v.y < 0)) return false;
    p.y = BALL_R; b.waitFloor = { t: performance.now(), v: b.v.clone() }; b.v.set(0, 0, 0); b.err = null; b.acc = null; b.float = null; return true;
  },
  floorLand(b, p) {
    if (b.spike) { const [lx, lz] = toLocalOf(b.spike.c, p.x, p.z), inside = Math.sign(lx) === -b.spike.sg && Math.abs(lx) <= 9 && Math.abs(lz) <= 4.5; toast(b.serve ? (inside ? '發球進了！Ace 🏐' : '發球出界（或沒過網）') : (inside ? '漂亮！扣球得分 🏐' : '可惜，出界了')); b.spike = null; }
    if (b.v.y < -2.5 && performance.now() - SFX.floorT > 120) { SFX.floorT = performance.now(); netBallSound(b, 'floor', Math.min(1, -b.v.y / 9), p); }
    if (b.v.y < -2.5 && typeof vbFloorImpact === 'function') vbFloorImpact(b, p, -b.v.y);
  },
  floorEvent(b) { netFloorHit(b); },
  wall(b, vn, p) { if (vn < -2.5 && performance.now() - SFX.floorT > 120) { SFX.floorT = performance.now(); netBallSound(b, 'wall', Math.min(1, -vn / 9), p); } },
  antenna(b, c, from, lx, yc, lz) { vbAntenna(b, c, from, lx, yc, lz); },
  netRemote(b) { return b.room && !NET.ownBall; },   /* 遠端網面與網帶由球權端決定，攔網仍在迴圈外執行。 */
  netTouch(b, c, lz, dir, spd, tape, p) {
    if (tape) { netFxHit(c, lz, dir, Math.min(1, spd / 12) * 0.6, true); netBallSound(b, 'tape', Math.min(1, spd / 14), p); }
    else { netFxHit(c, lz, dir, Math.min(1, spd / 10), false); netBallSound(b, 'net', Math.min(1, spd / 14), p); }
    if (b.spike) { toast('掛網了！'); b.spike = null; }
  },
  cross(b, c, from, yc, lz, top, bot) { vmCrossCheck(b, c, from, yc, lz, top, bot); },
  after(b, h) { vbBlockTest(b, h); vmBlockTest(b, h); },
};
function updateBalls(dt) {
  updateTweens(dt); updateDoors(dt); updateWind(dt); netFxStep(dt);
  ballShadowSync();
  if (!balls.length || !dt) return;
  const H = state.building.H, segs = blockers().concat(solidSegs(true)), netCourts = vbNetCourts();
  for (const b of balls) {
    if (b.fsq) { const F = b.fsq; F.t += dt; const e = F.t / F.dur; if (e >= 1.6) { b.fsq = null; b.m.userData.wsq = null; } else { const s2 = e < 1 ? Math.sin(e * Math.PI) * F.amt : -Math.sin((e - 1) / 0.6 * Math.PI) * F.amt * 0.25; b.m.userData.wsq = [1 + s2 * 0.6, 1 - s2]; } }   /* 落地：先壓扁、再微微拉長彈回 */
    if (VM.on && VM.wire && b.room && !b.langzi) {
      if (!VM.host && !b.wireLocal) { vmWireRemoteStep(b, dt); continue; }   /* 加入者：落地前照主機的球路；落地後（wireLocal）自己算彈跳滾動 */
    }
    if (b.watchOnly) { vmWatchBallFrame(b); continue; }
    if (b.snap) { const s2 = b.snap; s2.t += dt; const k = Math.min(1, s2.t / s2.dur), e = 1 - (1 - k) * (1 - k); b.m.position.lerpVectors(s2.from, s2.to, e); if (k >= 1) { b.snap = null; vbImpact(b, s2.kind, s2.q); } continue; }
    if (b.rest > 2) continue;
    if (b.waitFloor && ballWaitFloor(b)) continue;   /* WEB-023：別人負責的球先落地，停住等回報 */
    // 每一小步最多走 4 cm：快的扣球也不會一步跨過網子或牆
    const catchup = Math.min(b.wireCatchup || 0, .35); b.wireCatchup = 0;
    const flightDt = dt + catchup;
    const steps = ballSubsteps(b.v.length(), flightDt * VB.ts, catchup ? 512 : 96), h = (flightDt * VB.ts) / steps;
    BALL_WORLD.H = H; BALL_WORLD.segs = segs; BALL_WORLD.nets = netCourts; BALL_WORLD.netTop = NETS[state.net].h;
    BALL_WORLD.midpoint = VM.on && VM.wire && b === VM.ball;
    for (let k = 0; k < steps; k++) if (!ballSubstep(b, b.m.position, h, BALL_WORLD, BALL_HOOKS)) break;   /* B1：球的物理在 engine/ball.js（伺服器共用） */
    if (b.err) netSmoothBall(b, dt, netCourts);
    const sp = Math.hypot(b.v.x, b.v.z);
    if (b.netEv && VM.on && VM.wire) { b.netEv = false; VM.wire.dirty = true; }
    if (b.netEv) { b.netEv = false; if (NET.on && NET.ownBall && b.room) { const m = netBallMsg(b); m.n = 1; NET.tx.publish('ball', m); NET.lastBall = performance.now(); } }   // 碰網：負責這顆球的人馬上把結果送出去
    const sr = ballSpinRate(b);
    if (sr > 0) b.m.rotateOnWorldAxis(SPIN_AX.copy(b.spinW).normalize(), Math.min(sr * flightDt, BALL_SPIN_STEP));   // 空中：照擊球時的旋轉（每格最多轉 BALL_SPIN_STEP）
    else if (b.m.position.y <= BALL_R + 0.03) { b.spinW = null; if (sp > 0.01) {   /* 地上才滾；空中沒有旋轉的球（飄球、好的舉球）不轉 */ b.m.rotation.x += (b.v.z / BALL_R) * dt; b.m.rotation.z -= (b.v.x / BALL_R) * dt; } }   // 新同步空中零旋轉／飄球不能套用地面滾動。
    b.rest = sp < 0.05 && b.m.position.y <= BALL_R + 0.01 ? b.rest + dt : 0;
    if (b.squash > 0) { b.squash -= dt; const sq = Math.sin((Math.max(0, b.squash) / 0.12) * Math.PI) * 0.22; b.m.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5); if (b.squash <= 0) b.m.scale.set(1, 1, 1); }
  }
}
// ---- 來球：看著球過來，球進到手邊時按 E（上手接球）或 V（接球）→ 手從下往上斜斜碰到球，球往你面向的方向傳出去；
//      抬頭往上看（自己往上打）就是手打平往上擊，球直直往上
function contactPoint(kind) {
  const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw);
  return new THREE.Vector3(walk.x + fx * 0.45, kind === 'set' ? EYE + 0.22 : 0.95, walk.z + fz * 0.45);
}
function incomingBall(kind) {
  const cp = contactPoint(kind); let best = null;
  for (const b of balls) {
    if (b.rest > 0.3 || b.m.position.y < 0.35) continue;
    const d = b.m.position.distanceTo(cp);
    if (d < (kind === 'set' ? 1.05 : 1.15) && (!best || d < best.d)) best = { b, d };
  }
  return best && best.b;
}
// 準心固定在畫面正中間（第一、第三人稱都一樣；2026-11-20 使用者：第三人稱準心會一直移動不行，要固定住）
function xhairPlace() { const el = XH.el || (XH.el = $('wk-cross')); if (el && el.style.left) { el.style.left = ''; el.style.top = ''; } }
// 準心圈的擊球時機（每一格）：照每顆飛行中的球的軌跡往後推 1.2 秒，最早碰到你擊球點（下手／上手）的時間 → 外圈大小（樣式在 style.css .wk-cross）
const XH = { el: null };
function xhairTick() {
  const el = XH.el || (XH.el = $('wk-cross')); if (!el) return;
  let best = null;
  if (walk.on && !walk.hold && !walk.sit && !walk.serve) {
    const cps = [contactPoint('bump'), contactPoint('set')], near = (x, y, z) => cps.some((c) => Math.hypot(x - c.x, y - c.y, z - c.z) < 0.9);
    for (const b of balls) {
      if (b.rest > 0.3 || !b.v || b === walk.hold) continue;
      const p = b.m.position, v = b.v, g = 9.8 - (b.acc ? b.acc.y : 0);
      if (p.y < 0.3 || near(p.x, p.y, p.z)) continue;   // 已經在手邊（剛打出去的球）不算
      for (let t = 0.02; t <= 1.2; t += 0.02) {
        const y = p.y + v.y * t - 0.5 * g * t * t; if (y < 0.2) break;
        if (near(p.x + v.x * t, y, p.z + v.z * t)) { const real = t / (VB.ts || 1); if (best == null || real < best) best = real; break; }
      }
    }
  }
  const k = best == null ? 1 : clamp(best / 0.9, 0, 1);
  el.classList.toggle('in', best != null); el.classList.toggle('now', best != null && best < 0.1);
  el.style.setProperty('--k', k.toFixed(3));
}
// 面前的隊友：在你面向方向左右 25° 以內、20 m 以內最近的那位
function facingPeer(maxAng = 0.44) {
  const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw); let best = null;
  for (const p2 of NET.peers.values()) { const dx = p2.x - walk.x, dz = p2.z - walk.z, d = Math.hypot(dx, dz); if (d < 1 || d > 20) continue; const a = Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)); if (a < maxAng && (!best || d < best.d)) best = { p2, d }; }
  return best && best.p2;
}
// F：手上的球用下手拋給面前的人（沒有人就往前 6 m）
function passToFacing() {
  if (walk.emote?.keyframes) return;
  if (VM.on) { toast('比賽中：按住 Q／E，用左鍵舉球', 1500); return; }
  if (!walk.hold || walk.spike || walk.serve) { toast('先拿一顆球，再面向要傳的人按 F'); return; }
  if (skill.mode) { skill.mode = null; $('wk-combo').hidden = true; }
  let peer = facingPeer(0.6); const p0 = new THREE.Vector3(); walk.hold.getWorldPosition(p0);
  const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw);
  if (!peer && VB.npc) { const n = VB.npc, dx = n.x - walk.x, dz = n.z - walk.z, d = Math.hypot(dx, dz); if (d > 0.5 && (n.mode === 'pepper' || (dx * fx + dz * fz) / d > 0.5)) peer = { x: n.x, z: n.z, n: '陪練' }; }   // 對碰：一定拋給陪練；舉球陪練：大致面向他才拋給他
  const tx = peer ? peer.x : walk.x + fx * 6, tz = peer ? peer.z : walk.z + fz * 6, ty = peer && peer.n === '陪練' ? (VB.npc.mode === 'pepper' ? 1.6 : 2.3) : 1.4;
  const D = Math.hypot(tx - p0.x, tz - p0.z), T = clamp(0.7 + D * 0.08, 0.8, 1.9);
  releaseBall(new THREE.Vector3((tx - p0.x) / T, (ty - p0.y) / T + 0.5 * 9.8 * T, (tz - p0.z) / T));
  const bt = balls[balls.length - 1]; if (bt) { bt.lk = null; bt.lkNpc = false; }
  toast(peer && peer.n === '陪練' ? '拋給陪練了' : peer ? `拋給 ${peer.n}：等他用 E（上手接球）或 V（接球）接` : '拋出去了（面向隊友再按 F 就會拋給他）');
}
function hitWorldBall(b, kind) {
  if (walk.emote?.keyframes) return;
  if (b.langzi && VM.on) return; /* WEB-022 裝飾球排除自由推球。 */
  const p = b.m.position, up = walk.pitch > 0.55;
  const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw);
  // 傳球距離與滯空時間：舉球高而短、墊球遠一點；往上看就原地往上；大致面向隊友時直接傳到他手上
  const peer = up ? null : facingPeer();
  let D = up ? 0.25 : kind === 'set' ? 5.5 : 7.5, T = up ? 1.15 : kind === 'set' ? 1.35 : 1.2;
  let tx = walk.x + fx * D, tz = walk.z + fz * D;
  if (peer) { tx = peer.x; tz = peer.z; D = Math.hypot(tx - p.x, tz - p.z); T = clamp(0.75 + D * 0.08, 0.9, 2.0); }
  const ty = 1.2;
  b.v.set((tx - p.x) / T, (ty - p.y) / T + 0.5 * 9.8 * T, (tz - p.z) / T);
  b.rest = 0; b.spike = null; b.serve = false;
  b.squash = 0.12; sfx(kind, 0.85, p);   // 球飛到手邊直接碰出去：以前這條路沒出聲
  pose = kind === 'set' ? 'setPush' : 'bumpHit'; hands.visible = true; applyPose(0, true); walk.flash = 0.45;
  skill.dip = 0.05;
  if (NET.on) netBallHit(b, kind);
  vmOnTouch(b, vmMe(), kind);
  recHit({ x: p.x, y: p.y, z: p.z, v: b.v.length(), kind });
  toast(up ? (kind === 'set' ? '手打平往上舉' : '往上墊高') : kind === 'set' ? '舉球傳出去！' : '墊球傳出去！', 1200);
}
