// ---------------------------------------------------------------- 2 對 2 沙排模式：你們（兩個玩家，或你＋AI 隊友）對 AI 隊，先到 7 分（要贏 2 分，最多打到 9 分）
// 開局的人負責比賽：跑 AI、判界內／OUT／四次觸球、計分，再把比分和 AI 位置廣播給房間裡的人（隊友照常用自己的按鍵打）
// 判定：球落在哪一邊的場內，那一邊失分；落在界外（OUT）＝最後碰球的那一隊失分；同一隊碰超過 3 次也失分
const VM = { on: false, host: false, c: null, sg: 1, to: 7, sc: [0, 0], phase: 'idle', srvTeam: 0, srvIdx: [0, 0], team: [[], []], ai: new Map(), ball: null, touch: { team: -1, n: 0, last: null }, poss: [null, null], t: 0, next: null, sendT: 0, srvSeq: 0, names: {} };
// AI 程度：對手（team 1）好打一點、會失誤；AI 隊友（team 0）比較穩
// AI 強度：跑速、反應、接／舉的誤差、扣球速度、失誤率、重扣漏接率；block＝會上來攔網的機率、blockSkill＝攔得好不好
const VM_LEVELS = {
  1: { name: '新手', speed: 4.2, react: 0.28, passErr: 0.6, setErr: 0.33, spike: [14, 19], out: 0.09, net: 0.05, tip: 0.25, miss: 0.2, block: 0.55, blockSkill: 0.5, judge: 0.6, serve: { jump: 0.05, jfloat: 0.05, float: 0.3 }, sweet: 0.1, flat: 0.1 },
  2: { name: '球友', speed: 4.7, react: 0.2, passErr: 0.4, setErr: 0.21, spike: [17, 23], out: 0.055, net: 0.035, tip: 0.22, miss: 0.11, block: 0.8, blockSkill: 0.68, judge: 0.35, serve: { jump: 0.2, jfloat: 0.25, float: 0.3 }, sweet: 0.25, flat: 0.2 },
  3: { name: '高手', speed: 5.2, react: 0.13, passErr: 0.25, setErr: 0.13, spike: [20, 26], out: 0.03, net: 0.018, tip: 0.2, miss: 0.06, block: 0.95, blockSkill: 0.85, judge: 0.18, serve: { jump: 0.35, jfloat: 0.35, float: 0.2 }, sweet: 0.45, flat: 0.35 },
  4: { name: '校隊', speed: 5.6, react: 0.09, passErr: 0.16, setErr: 0.085, spike: [23, 28.5], out: 0.017, net: 0.009, tip: 0.18, miss: 0.03, block: 1, blockSkill: 0.95, judge: 0.09, serve: { jump: 0.45, jfloat: 0.4, float: 0.1 }, sweet: 0.65, flat: 0.45 },
};
// 企聯（pro）：數值最高、幾乎不失誤；球風自由（誰離舉球點近誰舉、舉球員也會攻擊），而且會用位置技能（舉球員跳起來吊、大砲／舉對超強重扣、中間手滯空）
VM_LEVELS[5] = { name: '企聯', pro: true, speed: 6.1, react: 0.06, passErr: 0.08, setErr: 0.045, spike: [26, 31], out: 0.006, net: 0.003, tip: 0.2, miss: 0.01, block: 1, blockSkill: 1, judge: 0.04, serve: { jump: 0.55, jfloat: 0.35, float: 0.05 }, sweet: 0.8, flat: 0.55 };
const VM_ROOM_LV = [5, 4, 3];   // 開房只能選企聯、校隊、高手；練習模式五級都能選
// 房主設定：AI 強度（隊友和對手一樣；開房只能企聯／校隊／高手）、每局分數、局數
function vmApplyRoomRules(rules) {
  mrecReset(vmIsPractice() ? '' : `${NET.room || 'room'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);   // WEB-010：房主開賽＝新的比賽代碼
  VM.langziMatch = MREC.id; /* WEB-022 比賽識別。 */
  VM_OPT.lv = vmLvChoices().includes(rules.lv) ? rules.lv : 3; VM_OPT.to = VM_OPT.to6 = [15, 20, 25].includes(rules.to) ? rules.to : 25; VM_OPT.sets = [1, 3, 5].includes(rules.bestOf) ? rules.bestOf : 1; }
const practiceRoom = new URLSearchParams(location.search).has('practice');
function vmIsPractice() { return practiceRoom; }
const vmLvChoices = () => (vmIsPractice() ? [1, 2, 3, 4, 5] : VM_ROOM_LV);
const VM_OPT = { to: 7, lv: 2, mate: 3, mode: '2', role: 'OH', sets: 3, to6: 25 };
try { Object.assign(VM_OPT, JSON.parse(localStorage.getItem('vb.vmopt') || '{}')); } catch (e) { /* ignore */ }
const vmLv = (a) => VM_LEVELS[VM_OPT.lv] || VM_LEVELS[2];   // AI 隊友和對手同一級
const vmPro = (a) => !!vmLv(a).pro;
const vmProLv = () => !!VM_LEVELS[VM_OPT.lv]?.pro;
// 企聯：專職舉球員（AI）離舉球點太遠，就由離球最近的 AI 來舉（每個位置都會舉）；真人是舉球員就照舊
function vmProSetter(team, passer, b = VM.ball) {
  if (!vmProLv() || !b || vmSmallCount() || VM.tactics === 'rotation') return null;
  const sp = vmPredL(vmBallL(b), 2.3); if (!sp) return null;
  const s0 = VM.team[team].find((id) => VM.role[id] === 'S' && id !== passer), far = (id) => { const q = vmPos(id); return q ? Math.hypot(q.x - sp.x, q.z - sp.z) : 99; };
  if (s0 && !VM.ai.has(s0)) return null;
  let best = s0 || null; for (const id of VM.team[team]) if (id !== passer && VM.ai.has(id) && (!best || far(id) < far(best) - 1.5)) best = id;
  return best;
}
const vmMe = () => (NET.on ? NET.me : 'me');
const vmL = (x, z) => toLocalOf(VM.c, x, z);
const vmW = (lx, lz) => toWorldOf(VM.c, lx, lz);
const vmSide = (team) => (team === 0 ? VM.sg : -VM.sg);
function vmTeamOf(id) { return VM.team[0].includes(id) ? 0 : VM.team[1].includes(id) ? 1 : -1; }
// 球的位置、速度換成球場座標
function vmBallL(b) { const [lx, lz] = vmL(b.m.position.x, b.m.position.z), r = (VM.c.rot * Math.PI) / 180; return { x: lx, y: b.m.position.y, z: lz, vx: b.v.x * Math.cos(r) - b.v.z * Math.sin(r), vy: b.v.y, vz: b.v.x * Math.sin(r) + b.v.z * Math.cos(r) }; }
function vmPredL(B, y) { const a = -4.9, d = B.vy * B.vy - 4 * a * (B.y - y); if (d < 0) return null; const t = (-B.vy - Math.sqrt(d)) / (2 * a); return t > 0 ? { t: t / VB.ts, x: B.x + B.vx * t, z: B.z + B.vz * t } : null; }
// 每個人在球場座標裡的位置
function vmPos(id) {
  if (VM.ai.has(id)) { const a = VM.ai.get(id); return { x: a.x, z: a.z }; }
  if (id === vmMe()) { const [x, z] = vmL(walk.x, walk.z); return { x, z }; }
  const p2 = NET.peers.get(id); if (p2) { const [x, z] = vmL(p2.x, p2.z); return { x, z }; }
  return null;
}
const vmName = (id) => (id === vmMe() ? '你' : VM.names[id] || (NET.peers.get(id) || {}).n || '隊友');
// ---- 開局
function vmOpenMenu(c) {
  if (ROOM) { roomReady(); return; }
  const ct = courtAt(walk.x, walk.z, true); if (!ct || ct.c.id !== c.id) { toast('站到排球場上再開打'); return; }
  if (VM_OPT.mode === '6') { vm6Menu(c, Math.sign(ct.lx) || 1); return; }
  const sg = Math.sign(ct.lx) || 1, onSide = (s2) => [...NET.peers.values()].filter((p2) => { const [lx, lz] = toLocalOf(c, p2.x, p2.z); return Math.sign(lx) === s2 && Math.abs(lx) < 12 && Math.abs(lz) < 7; });
  const mates = onSide(sg), opps = onSide(-sg).slice(0, 2);
  VM.menu = { c, sg, mate: mates[0] || null, opps };
  const oppTxt = opps.length ? `${opps.map((q) => esc(q.n)).join('＋')}${opps.length < 2 ? '＋AI' : ''}` : 'AI 隊', m = $('rk-menu');
  m.innerHTML = `<div class="rk-box"><h3>🏖️ 2 對 2 沙排</h3>
    <div class="rk-seg"><button type="button" data-vmmode="2" aria-pressed="true">2 對 2 沙排</button><button type="button" data-vmmode="6">6 對 6 室內</button></div>
    <p class="rk-sub">${NET.on ? `你這半場：<b style="color:#fff">你${mates[0] ? '、' + esc(mates[0].n) : ''}</b>　對面半場：<b style="color:#fff">${opps.length ? opps.map((q) => esc(q.n)).join('、') : '沒有人'}</b>　（站在哪個半場就是哪一隊，人不夠的位置由 AI 補）` : '要跟朋友打：先開「多人連線」、進同一個房間，隊友站你這半場、對手站對面半場，再按一次這個按鈕'}</p>
    <p class="rk-sub">打到幾分</p><div class="rk-seg">${[7, 11, 15, 21, 25].map((n) => `<button type="button" data-vmto="${n}" aria-pressed="${VM_OPT.to === n}">${n} 分</button>`).join('')}</div>
    <p class="rk-sub">AI 強度（隊友和對手一樣）</p><div class="rk-seg">${vmLvChoices().map((k) => `<button type="button" data-vmlv="${k}" aria-pressed="${VM_OPT.lv === k}">${VM_LEVELS[k].name}</button>`).join('')}</div>
    <p class="rk-sub">要贏 2 分，最多打到 ${VM_OPT.to + 2} 分。球落在哪一邊的場內那一邊失分；打出界是最後碰球的那一隊失分（攔網碰到出界＝打手出界，攻擊方得分）；同一隊最多碰 3 次。高手以上的 AI 會上網攔網。</p>
    <div class="rk-btns">${mates[0] || opps.length ? `<button type="button" class="primary" data-vm="go">開始：你＋${mates[0] ? esc(mates[0].n) : 'AI'} 對 ${oppTxt}</button>` : ''}<button type="button"${mates[0] || opps.length ? '' : ' class="primary"'} data-vm="goai">開始：你＋AI 對 AI 隊</button><button type="button" data-vm="sta">⚙️ 體力設定</button><button type="button" data-vm="close">取消</button></div>
    <p class="rk-sub" style="margin-top:10px">V 接球、C 按住開輪盤、放開舉球（滾輪換前／後排）（AI 隊友要舉球時按 1～4＝喊球：4 號位／快攻／2 號位／後排中間）、W 助跑＋空白鍵起跳、空中按住滑鼠左鍵蓄力、放開扣球（金色格最強最準）、右鍵吊球、B 攔網、拿著球按左鍵發球</p></div>`;
  m.hidden = false; unlockMouse();
}
function vmStart(c, sg, mateId, opps = [], seats = null) {
  globalThis.VBTutorial?.stop();
  if (VM.npc || VB.npc) vbNpcToggle();
  vmStop(true);
  STA.v = 1; STA.lock = false;
  Object.assign(VM, { on: true, host: true, six: false, c, sg, to: VM_OPT.to, sc: [0, 0], call: null, phase: 'idle', srvTeam: 0, srvIdx: [0, 0], ball: null, touch: { team: -1, n: 0, last: null }, poss: [null, null], t: 0, next: null, srvSeq: 0, names: {} });
  VM.team = [[vmMe(), mateId || 'aiT'], [opps[0] || 'ai1', opps[1] || 'ai2']];
  const used = new Set([myChar()]); VM.role = {}; VM.chars = {};
  for (const id of ['aiT', 'ai1', 'ai2']) VM.chars[id] = vmPickChar(used);
  if (!mateId) vmMkAi('aiT', 0, 'AI 隊友', '#30A46C', VM.chars.aiT);
  if (!opps[0]) vmMkAi('ai1', 1, 'AI 對手', '#E5484D', VM.chars.ai1); if (!opps[1]) vmMkAi('ai2', 1, 'AI 對手', '#F76B15', VM.chars.ai2);
  for (const id of [mateId, ...opps]) if (id) VM.names[id] = (NET.peers.get(id) || {}).n || '球友';
  if (seats) {
    for (const a of VM.ai.values()) { scene.remove(a.av.g); a.tag.element.remove(); } VM.ai.clear(); VM.names = {};
    VM.team = seats.map((row,t) => row.map((id,k) => id || `ai${t}${k}`));
    for (const t of [0,1]) for (const [k,id] of VM.team[t].entries()) {
      if (/^ai/.test(id)) vmMkAi(id,t,'AI',t===0?'#30A46C':'#E5484D',null);
      else VM.names[id] = id === vmMe() ? NET.name : NET.peers.get(id)?.n || '球友';
      const a = VM.ai.get(id); if (a) { a.x = sg*(t===0?1:-1)*6; a.z = k===0?2.1:-2.1; }
    }
  }
  VM.startData = { e: 'start', ts: VB.ts, c: c.id, sg, team: VM.team, names: { ...VM.names, [vmMe()]: NET.name }, chars: VM.chars, to: VM.to, cw: [c.x, c.z, c.rot], stacfg: STA_CFG };
  if (NET.on && globalThis.VBMatchSync) vmWireInit(true);
  if (NET.on) NET.tx.publish('vm', VM.startData);
  $('rk-menu').hidden = true; $('vm-hud').hidden = false; $('walk-ui').classList.add('vm');
  vmSetupServe();
  toast(`2 對 2 開始！先到 ${VM.to} 分・對手：${opps.length ? VM.team[1].map(vmName).join('＋') : 'AI（' + VM_LEVELS[VM_OPT.lv].name + '）'}`, 2400);
}
function vmPickChar(used) {
  const code = aiLook(used.size); used.add(code); return code;
}
function vmMkAi(id, team, name, color, ch) {
  ch = aiLook(id); VM.chars[id] = ch;
  const av = makeAvatar(color, ch, team), el = document.createElement('div'); el.className = 'mp-tag'; el.textContent = name;
  const tag = new CSS2DObject(el); tag.position.set(0, 2.05, 0); av.g.add(tag); scene.add(av.g);
  const side = vmSide(team), a = { id, team, name, color, ch, av, tag, x: side * 6, z: id === 'ai2' ? -2 : 2, vx: 0, vz: 0, y: 0, vy: 0, pose: 0, swingT: 0, reactAt: 0, tx: side * 6, tz: 0 };
  VM.ai.set(id, a); VM.names[id] = name; return a;
}
function vmStop(silent) {
  if (!silent && ROOM) { if (ROOM.isHost) ROOM.end(); return; }
  if (!VM.on) return;
  if (VM.watchBall) { VM.watchBall.m.removeFromParent(); const i = balls.indexOf(VM.watchBall); if (i >= 0) balls.splice(i, 1); }
  VM.wire = null;
  VM.watchFrames = null; VM.watchBall = null; VM.watchOffset = null;
  if (VM.trail) { scene.remove(VM.trail); VM.trail = null; }
  if (VM.host && NET.on && !silent) NET.tx.publish('vm', { e: 'end' });
  for (const a of VM.ai.values()) { scene.remove(a.av.g); a.tag.element.remove(); }
  VM.ai.clear(); VM.on = false; VM.host = false; VM.phase = 'idle'; VM.six = false; peerTagsAll();
  $('vm-rot').hidden = true; $('vm-rot').dataset.k = '';
  $('vm-hud').hidden = true; $('walk-ui').classList.remove('vm');
  if (!$('rk-menu').hidden && $('rk-menu').querySelector('[data-vm]')) $('rk-menu').hidden = true;
}
// ---- 發球：贏球的那一隊發；同一隊兩個人輪流（每次拿回發球權換人）
function vmServer() { const t = VM.srvTeam; return VM.six ? VM.rot[t][0] : VM.team[t][VM.srvIdx[t] % 2]; }
function vmSetupServe() {
  VM.phase = 'serve'; VM.ball = null; VM.touch = { team: -1, n: 0, last: null }; VM.poss = [null, null]; VM.srvSeq++;
  if (VM.wire) { VM.wire.order.reset(VM.srvSeq); VM.wire.history = []; VM.wire.event = null; VM.wire.dirty = true; }
  vmClearBalls(); if (vmServer() !== vmMe()) vmDropHeld(); if (VM.trailPts) VM.trailPts.length = 0; if (VM.trail) VM.trail.visible = false; VM.whT = performance.now() + 2500; VM.srvDl = VM.whT + 8000; VM.whDone = false; VM.cdN = null;   // 正式規則：裁判吹哨後才能發，8 秒內要發出去
  const srv = vmServer(), s = vmSide(VM.srvTeam);
  VM.serveAt = VM.t + 3.0 + Math.random() * 1.6;   // AI：吹哨（2.5 秒）後 0.5～2 秒發
  // AI 先站位：發球的人在底線後，其他人在自己半場
  for (const a of VM.ai.values()) {
    const sd = vmSide(a.team); a.blk = null;
    if (VM.six) { const f = vm6Spot(a.team, a.id, 'serve'); a.tx = f.x; a.tz = f.z; if (Math.hypot(a.x - f.x, a.z - f.z) > 5) { a.x = f.x; a.z = f.z; } continue; }   // 6 對 6：發球隊照號位、接發球隊排接發球陣型
    if (a.id === srv) { a.tx = sd * 9.8; a.tz = -sd * 1.0; }
    else if (a.team === VM.srvTeam) { a.tx = sd * 3.5; a.tz = 0; }
    else { const k = VM.team[a.team].indexOf(a.id); a.tx = sd * 6.2; a.tz = k === 0 ? 2.1 : -2.1; }
  }
  vmSay(`輪到 ${vmName(srv)} 發球${VM.ai.has(srv) ? '' : srv === vmMe() ? '：拿著球按滑鼠左鍵' : ''}`, 'srv', 3200);
  if (VM.six) vm6PlaceHumans(srv);
  if (srv === vmMe()) vmPrepServe(s);
  else if (!VM.ai.has(srv) && NET.on) NET.tx.publish('vm', { e: 'serve', id: srv, seq: VM.srvSeq, s });
  vmBroadcast(true);
}
// 比賽中只有一顆比賽球：開打、每次換發球時，手上拿著的球一律收掉（輪到自己發球的那顆除外）
function vmDropHeld() { if (walk.hold) { camera.remove(walk.hold); walk.hold = null; } walk.jserve = null; walk.serve = null; if (skill.mode) { skill.mode = null; $('wk-combo').hidden = true; } }
// 自己要發球：站到底線後、手上給一顆球
function vmClearBalls() { for (const b of balls) ballsGroup.remove(b.m); balls.length = 0; VB.setSpot = null; VB.target = null; }
// 發球的哨音和 8 秒：主機吹哨（大家都聽得到）；真人發球員 8 秒（連線多給 1.5 秒傳送時間）還沒把球發出去＝發球失誤
function vmServeClock() {
  const now = performance.now(), srv = vmServer();
  if (!VM.whDone && now >= VM.whT) { VM.whDone = true; vmWhistle(); if (NET.on) NET.tx.publish('vm', { e: 'whistle', seq: VM.srvSeq }); }
  if (!VM.whDone || VM.ai.has(srv)) return;
  const p2 = NET.peers.get(srv), busy = srv === vmMe() ? !!(walk.serve || walk.jserve) : !!(p2 && p2.tossing);   // 已經拋球了（自己、或連線的人正在拋）
  if (!busy && now > VM.srvDl + (srv === vmMe() ? 0 : 1500)) { const team = vmTeamOf(srv); VM.phase = 'rally'; VM.touch = { team, n: 3, last: srv, serve: true }; vmDropHeld(); vmPoint(1 - team, `發球超過 8 秒（${vmName(srv)}）`); }
}
function vmWhistle() {
  const now = performance.now(); VM.whT = Math.min(VM.whT ?? now, now); VM.srvDl = now + 8000; VM.cdN = null;
  sfx('whistle1', 1);
}
// 輪到你發球時：吹哨前提示等一下，吹哨後倒數 8 秒（在計分板下面）
function vmServeHint() {
  const el = $('vm-cd'); if (!el) return;
  const me = vmMe(), mine = VM.on && VM.phase === 'serve' && (VM.host ? vmServer() === me : VM.srvId === me) && !walk.serve && !walk.jserve, now = performance.now();
  if (!mine) { el.hidden = true; return; }
  const txt = !(now >= VM.whT) ? '等裁判吹哨…' : `發球倒數 ${Math.max(0, Math.ceil((VM.srvDl - now) / 1000))} 秒`;
  el.hidden = false; if (el.textContent !== txt) el.textContent = txt; el.dataset.k = !(now >= VM.whT) ? 'wait' : VM.srvDl - now < 3000 ? 'hurry' : 'go';
}
// 拿著球按發球：吹哨前、超過 8 秒都不行
function vmServeOK() {
  if (!VM.on) return true;
  if (VM.phase !== 'serve') { toast('還沒輪到發球', 1000); return false; }
  const now = performance.now();
  if (!(now >= VM.whT)) { toast('等裁判吹哨才能發球', 1100); return false; }
  if (now > VM.srvDl) { toast('超過 8 秒了：發球失誤', 1200); return false; }
  return true;
}
function vmPrepServe(s = VM.sg) {
  if (walk.emote?.k === 'langzi') walk.emote = null; /* WEB-022 換發球正常拿球。 */
  if (!VM.host) { VM.phase = 'serve'; VM.srvId = NET.me; VM.whT = Infinity; VM.srvDl = Infinity; }   // 連線：通知先到、狀態後到也沒關係（不會把等一下發出去的球當成上一球清掉）；等主機吹哨
  if (walk.jserve && walk.jserve.ball && !walk.jserve.hit) ballsGroup.remove(walk.jserve.ball);   // 上一個還沒打完的拋球收掉
  walk.jserve = null; walk.serve = null; walk.charge = null; walk.chargeArm = null;
  if (walk.hold) { camera.remove(walk.hold); walk.hold = null; }
  const [x, z] = vmW(s * 9.8, -s * 1.0); walk.x = x; walk.z = z; vbClearAir();
  const [ax, az] = vmW(0, 0); walk.yaw = Math.atan2(-(ax - x), -(az - z)); walk.pitch = 0.05;
  VM.grabOK = true; grabBall(); VM.grabOK = false; toast('輪到你發球：等裁判吹哨，8 秒內發出去。對面紅圈是落點（轉頭調左右、滾輪調深淺）。左鍵站發、右鍵站飄、空白鍵拋球起跳後按住左鍵跳發／右鍵跳飄', 4600);
}
function vmAiServe(a) {
  const sd = vmSide(a.team), err = Math.random(), L = vmLv(a), S = L.serve || {}, rt = Math.random();
  const type = rt < S.jump ? 'jump' : rt < S.jump + S.jfloat ? 'jfloat' : rt < S.jump + S.jfloat + S.float ? 'float' : 'std', sweet = (type === 'jump' || type === 'jfloat') && Math.random() < L.sweet;
  const g0 = vmPickGap(a, sd, 3, 8.3, 3.6); let tx = g0.tx, tz = g0.tz, net = false;
  const outK = type === 'jump' ? (sweet ? 1 : 1.8) : 1;   // 跳發比較容易失誤（沒打到甜蜜點更容易）
  if (err < L.out * 0.8 * outK) { if (Math.random() < 0.5) tx = -sd * (9.6 + Math.random() * 1.5); else tz = Math.sign(tz || 1) * (4.9 + Math.random()); }
  else if (err < (L.out * 0.8 + L.net) * outK) net = true;   // 太平，掛網
  const jumpH = type === 'jump' || type === 'jfloat';
  if (jumpH) { a.vy = aiJump(a, 4.2, 'jserve'); }   // 跳發／跳飄：跳起來在空中打
  const p = new THREE.Vector3(...(() => { const [x, z] = vmW(a.x - sd * (jumpH ? 0.6 : 0.3), a.z); return [x, jumpH ? 3.25 : 2.6, z]; })()), [wx, wz] = vmW(tx, tz);
  const m = newBallMesh(); m.position.copy(p); ballsGroup.add(m);
  const spd = type === 'jump' ? (sweet ? 28 + Math.random() * 3 : 20 + Math.random() * 5) : type === 'jfloat' ? 15 + Math.random() * 2 : type === 'float' ? 12.5 : 13, g = type === 'jump' ? 14.3 : 9.8;
  let v = serveVel(p, wx, wz, spd, g, VM.c, 0, type === 'float' || type === 'jfloat' ? 0.45 : 0.22); if (net) v.y -= 1.6;   // 過網留餘裕：飄球會晃，留多一點
  const b = { m, v, rest: 0 }; m.userData.ball = b; balls.push(b);
  if (type === 'jump' || type === 'std') { const hv = Math.hypot(v.x, v.z) || 1, sq = typeof q === 'number' ? q : 0.8; b.spinW = new THREE.Vector3(v.z / hv, 0, -v.x / hv).multiplyScalar(type === 'jump' ? 45 + 25 * sq : 15); }   /* 跳發強上旋、一般發球輕上旋；飄球不轉 */
  if (type === 'jump') b.acc = new THREE.Vector3(0, -4.5, 0);   // 上旋：下墜比一般快
  if (type === 'float' || type === 'jfloat') b.float = { t: 0, w: 4.5 + Math.random() * 3, ph: Math.random() * 6.3, a: type === 'float' ? 4.5 : sweet ? 12 : 5 };   // 飄球
  while (balls.length > 8) { const old = balls.shift(); ballsGroup.remove(old.m); }
  a.pose = 4; a.swingT = 0.35; aiPay(a, 'serve');
  if (NET.on) netBallHit(b, 'serve');
  vbImpact(b, 'serve', 1);
  vmOnTouch(b, a.id, 'serve');
}
// ---- 觸球紀錄（只有開局的人判）
function vmOnTouch(b, id, kind) {
  if (b.langzi || kind === 'kick') return; /* WEB-022 裝飾球不計比賽事件。 */
  if (!VM.on || !VM.host) return;
  const team = vmTeamOf(id); if (team < 0 || kind === 'throw') return;
  // 只有比賽球算：發球階段只認輪到的人發出去的那一下；開打之後別顆球（有人手上本來拿著的、場外的）碰到、落地都不算
  if (VM.phase === 'serve' && (kind !== 'serve' || id !== vmServer())) return;
  if (VM.wire) { VM.wire.dirty = true; if (VM.wire.event) VM.wire.event.actor = id; }
  vmPerfTouch(id, kind, b);   // WEB-010 戰績
  if (VM.phase === 'rally' && VM.ball && balls.includes(VM.ball) && b !== VM.ball) return;
  VM.ball = b; b.spike = null; b.floorHit = null; if (kind !== 'block') b.blkDone = false;
  if (VM.phase === 'serve') {   // 發球那一下：對方要接，自己這隊不能再碰
    VM.phase = 'rally'; VM.touch = { team, n: 3, last: id, serve: true }; VM.poss = [null, null];
    if (VM.six) { const ov = vm6Overlap(); if (ov) vmPoint(1 - ov.team, ov.why); }
    return;
  }
  if (VM.phase !== 'rally') return;
  // 6 對 6：後排的人不能攔網；後排的人在 3 公尺線前起跳、球整顆在網子上緣以上就打過去＝後排攻擊犯規
  if (VM.six) {
    const k6 = vm6Idx(id), back = vmSmallCount() ? !vm6Front(id) : k6 === 0 || k6 >= 4;
    if (back && kind === 'block') { vmPoint(1 - team, `後排攔網犯規（${vmName(id)}在後排）`); return; }
    if (back && (kind === 'spike' || kind === 'tip' || kind === 'hit') && b.m.position.y > NETS[state.net].h + BALL_R) {
      const ai = VM.ai.get(id);
      const exact = ai ? ((ai.y > 0 || ai.vy > 0) && ai.jp ? [ai.jp.x, ai.jp.z] : vmW(ai.x, ai.z)) : id === vmMe() ? (walk.air && walk.air.x0 != null ? [walk.air.x0, walk.air.z0] : null) : b.jump0;   // 起跳點（自己的、或連線的人隨擊球訊息送來的）
      const q = exact ? { x: vmL(exact[0], exact[1])[0] } : VM.ai.has(id) ? null : vmPos(id);
      if (q && Math.abs(q.x) < (exact ? 3 : 2.6)) { vmPoint(1 - team, `後排攻擊犯規（${vmName(id)}在後排，要在 3 公尺線後起跳）`); return; }
    }
  }
  // 正式規則：發球不能攔網；也不能在前區（3 公尺線內）把整顆高過網子的發球直接打回去
  if (VM.touch.serve && team !== VM.touch.team) {
    if (kind === 'block') { vmPoint(1 - team, `攔網發球犯規（${vmName(id)}攔了發球）`); return; }
    if ((kind === 'spike' || kind === 'tip' || kind === 'hit') && b.m.position.y > NETS[state.net].h + BALL_R) { const [blx] = vmL(b.m.position.x, b.m.position.z); if (Math.abs(blx) < 3) { vmPoint(1 - team, `攻擊發球犯規（${vmName(id)}在前區把高過網的發球直接打回去）`); return; } }
  }
  // 正式規則：同一人不能連續碰兩次（連擊）、一隊最多碰三次；攔網不算一次，攔網的人也可以再碰下一球
  const block = kind === 'block';
  if (team === VM.touch.team) {
    if (block) { VM.touch.last = id; VM.touch.blk = true; VM.poss[team] = null; return; }
    if (VM.touch.last === id && !VM.touch.blk) { vmPoint(1 - team, `連擊（${vmName(id)} 連續碰兩次）`); return; }
    VM.touch.n++; VM.touch.last = id; VM.touch.blk = false;
    if (VM.touch.n > 3) { vmPoint(1 - team, '四次擊球（一隊最多碰三次）'); return; }
  } else { VM.touch = { team, n: block ? 0 : 1, last: id, blk: block }; if (block) VM.poss[team] = null; }
  if (b.setFault) { const f = b.setFault; b.setFault = null; if (kind === 'set') { vmPoint(1 - team, f === 'held' ? `持球（${vmName(id)}舉球時球在手上停太久）` : `連擊（${vmName(id)}舉球兩手沒同時碰到）`); return; } }
  if (!block && VM.six) {   // 6 對 6：第一球誰接都好，舉球員（他接了就換舉對／前排的人）舉；舉出去的球照落點找攻擊手
    let P = VM.poss[team]; if (!P) P = VM.poss[team] = { stage: 0, passer: id, setter: null, attacker: null };
    if (VM.touch.n === 1) { P.passer = id; P.setter = vm6SetterFor(team, id); P.attacker = null; } else if (VM.touch.n === 2) { P.setter = id; P.attacker = vm6AttackerFor(team, b, id); }
    P.stage = VM.touch.n;
  } else if (!block) {
    const mate = VM.team[team].find((x) => x !== id); let P = VM.poss[team]; if (!P) P = VM.poss[team] = { stage: 0, passer: id, setter: mate, attacker: id };
    if (VM.touch.n === 1) { P.passer = id; P.setter = mate; P.attacker = id; } else if (VM.touch.n === 2) { P.setter = id; P.attacker = mate; }
    P.stage = VM.touch.n;
  }
  if (!block && VM.touch.team === team && VM.touch.n === 1 && kind !== 'spike' && kind !== 'tip' && kind !== 'hit') vmGrade(team, b, id);
  if (NET.on) NET.forceSt = true;
}
// 第一球（接發、防守）的到位等級：看球會掉到舉球高度（2.3 m）的地方離舉球區多遠
//   A 到位（1.2 m 內：什麼都能打）、B 半到位（3 m 內：不能打快攻、後排攻擊）、C 不到位（更遠、出界、直接回對面：只能舉高球修正）
function vmGrade(team, b, id) {
  const sd = vmSide(team), B = vmBallL(b), p = vmPredL(B, 2.3) || vmPredL(B, 1.0) || vmPredL(B, BALL_R);
  let g = 'C', why = '';
  if (!p || Math.sign(p.x) !== sd) why = '直接回對面';
  else if (Math.abs(p.x) > 9.2 || Math.abs(p.z) > 4.7) why = '出界';
  else { const zz = VM.six ? -0.9 : clamp(p.z / sd, -2, 2), dd = Math.hypot(Math.abs(p.x) - 1.8, p.z / sd - zz); g = dd < 1.2 ? 'A' : dd < 3 ? 'B' : 'C'; }
  const P = VM.poss[team]; if (P) { P.grade = g; P.fix = g === 'C'; }
  VM.grade = { s: (VM.grade ? VM.grade.s : 0) + 1, team, g, why };
  vmGradeShow(VM.grade);
  if (P && g !== 'A' && p && Math.sign(p.x) === sd) vmFixSetter(team, P, p, id);
}
function vmGradeShow(G) {
  const el = $('vm-grade'); if (!el || !G) return;
  const mine = VM.team[G.team] && VM.team[G.team].includes(vmMe());
  el.textContent = `${mine ? '我方' : '對方'}接球 ${G.g} ${{ A: '到位', B: '半到位', C: '不到位' }[G.g]}${G.why ? `（${G.why}）` : ''}`; el.dataset.g = G.g; el.hidden = false;
  clearTimeout(VM.gradeT); VM.gradeT = setTimeout(() => { el.hidden = true; }, 1800);
}
// 不到位的球：AI 舉球員追得到就跑過去修正；追不到就換最近、追得到的 AI 隊友（接第一球的人不行）用下手舉高球（真人舉球員自己跑）
function vmFixSetter(team, P, p, passer) {
  if (!P.setter || !VM.ai.has(P.setter)) return;
  const eta = (id) => { const a = VM.ai.get(id); return a ? Math.hypot(a.x - p.x, a.z - p.z) / vmLv(a).speed + vmLv(a).react : 99; };
  const e0 = eta(P.setter); if (e0 <= p.t + 0.35) return;
  let best = null; for (const id of VM.team[team]) { if (id === passer || id === P.setter || !VM.ai.has(id)) continue; const e = eta(id); if (!best || e < best.e) best = { id, e }; }
  if (best && best.e < e0) { P.setter = best.id; P.fix = true; }
}
function vmPoint(win, why) {
  if (VM.phase !== 'rally') return;
  vmPerfPoint(win);   // WEB-010 戰績
  VM.phase = 'dead'; VM.sc[win]++;
  sfx('whistle', 1);
  if (win !== VM.srvTeam) { VM.srvTeam = win; if (VM.six) vm6Rotate(win); else VM.srvIdx[win]++; }   // 拿回發球權：6 對 6 要輪轉
  const a = VM.sc[0], b = VM.sc[1], hi = Math.max(a, b);
  let fn = vmSetupServe;
  if (VM.six) {
    const deciding = VM.bestOf > 1 && VM.sets[0] + VM.sets[1] === VM.bestOf - 1, to = deciding ? 15 : VM.to;
    if (hi >= to && Math.abs(a - b) >= 2) { VM.sets[win]++; const done = VM.sets[win] >= Math.ceil(VM.bestOf / 2); fn = done ? () => vmOver() : vm6NextSet; why += `・${vmTeamLabel(win)}拿下第 ${VM.setNo} 局（局數 ${VM.sets[0]}：${VM.sets[1]}）`; }
    else if (deciding && !VM.swap8 && hi === 8) { VM.swap8 = true; fn = () => { vm6Swap(); vmSetupServe(); vmSay('決勝局 8 分換場', 'srv', 2200); }; }
  } else if ((hi >= VM.to && Math.abs(a - b) >= 2) || hi >= VM.to + 2) fn = () => vmOver();
  vmSay(vmPointMsg(win, why), VM.team[win].includes(vmMe()) ? 'gold' : 'warn', 3000);
  VM.next = { at: VM.t + 3.2, fn };
  vmBroadcast(true, null, { win, why });
}
function vmTeamLabel(t) { const ids = VM.team[t] || [], hs = ids.filter((id) => !/^ai/.test(id)); return ids.includes(vmMe()) ? '你們' : !hs.length ? 'AI 隊' : hs.map(vmName).join('＋') + (hs.length < ids.length ? '＋AI' : ''); }
function vmPointMsg(win, why) { return `${why}・${vmTeamLabel(win)}得分　${VM.sc[0]}：${VM.sc[1]}`; }
function vmOver() {
  vmSendResult();   // WEB-010 戰績（開房比賽才送）
  if (ROOM) { if (ROOM.isHost) { toast(`比賽結束 ${VM.sc[0]}：${VM.sc[1]}，請重新準備`,4000); ROOM.end(); } return; }
  VM.phase = 'over'; vmBroadcast(true);
  const my = Math.max(0, vmTeamOf(vmMe())), A = VM.six ? VM.sets : VM.sc, won = A[my] > A[1 - my], m = $('rk-menu');
  m.innerHTML = `<div class="rk-box"><h3>${won ? '🏆 你們贏了！' : `${vmTeamLabel(A[0] > A[1] ? 0 : 1)}贏了`}</h3><p class="rk-final">${VM.six ? `局數 ${VM.sets[0]}：${VM.sets[1]}` : `${VM.sc[0]}：${VM.sc[1]}`}</p>${VM.six ? `<p class="rk-sub" style="text-align:center">最後一局 ${VM.sc[0]}：${VM.sc[1]}</p>` : ''}<div class="rk-btns">${VM.host ? '<button type="button" class="primary" data-vm="again">再一局</button>' : ''}<button type="button" data-vm="quit">離開比賽</button></div></div>`;
  m.hidden = false; unlockMouse();
}
function vmJudge() {
  const b = VM.ball; if (!b || !balls.includes(b) || !b.floorHit) return;
  // 連線：落點附近有別的真人玩家時，先等 0.6 秒——他可能在自己的畫面上已經接到了，只是「接到球」的訊息還在路上（收到就取消這次落地）
  if (b.room && !NET.ownBall && !b.floorReport && performance.now() - b.floorT < 500) return;
  if (NET.on && !(b.room && !NET.ownBall) && performance.now() - (b.floorT || 0) < 600) {
    const near = [...VM.team[0], ...VM.team[1]].some((id) => { if (id === vmMe() || VM.ai.has(id)) return false; const q = NET.peers.get(id); return q && Math.hypot(q.x - b.floorHit[0], q.z - b.floorHit[1]) < 3.5; });
    if (near) return;
  }
  const [fx, fz] = vmL(b.floorHit[0], b.floorHit[1]), B = { x: fx, z: fz }, inside = Math.abs(B.x) <= 9 + BALL_R && Math.abs(B.z) <= 4.5 + BALL_R, sideTeam = Math.sign(B.x) === VM.sg ? 0 : 1;
  vmMark(b.floorHit[0], b.floorHit[1], inside);
  if (inside) vmPoint(1 - sideTeam, '落地得分');
  else { const lose = VM.touch.team < 0 ? sideTeam : VM.touch.team; vmPoint(1 - lose, 'OUT 出界'); vmOut(B); }
}
// 比賽球的軌跡：最近 0.5 秒的路線（越舊越淡），看得出球是從網子上面還是旁邊過去
function vmTrailPush(q) {
  if (!VM.trail) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(30 * 3), 3)); VM.trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 })); VM.trail.frustumCulled = false; VM.trailPts = []; scene.add(VM.trail); }
  VM.trailPts.push(q.clone()); if (VM.trailPts.length > 30) VM.trailPts.shift();
  const pa = VM.trail.geometry.attributes.position, ca = VM.trail.geometry.attributes.color, n = VM.trailPts.length;
  VM.trailPts.forEach((v, i) => { pa.setXYZ(i, v.x, v.y, v.z); const a = i / Math.max(1, n - 1); ca.setXYZ(i, 1, 0.85 * a + 0.15, 0.3 * a); });
  pa.needsUpdate = ca.needsUpdate = true; VM.trail.geometry.setDrawRange(0, n); VM.trail.visible = !RP.on;
}
// 攔網碰到球：手的位置閃一圈白光、跳出 TOUCH（打手出界時特別標出來，裁判也是看這個判）
// 攔網碰到球的動畫：衝擊光圈（兩圈往外擴）、火花、彈出來的大字；攔死時鏡頭震一下
//   stuff＝攔死、out＝打手出界、soft＝撐起來、through＝打穿、touch＝碰到
const BLOCK_FX = { stuff: ['攔死！BLOCK', '#F2B705', 30, 1.15], out: ['TOUCH OUT', '#E5484D', 22, 1.0], soft: ['撐起來', '#FFFFFF', 14, 0.85], through: ['打穿！', '#9AA4B2', 16, 0.9], touch: ['TOUCH', '#FFFFFF', 12, 0.8] };
function vbBlockFx(pos, type) {
  const [txt, col, n, big] = BLOCK_FX[type] || BLOCK_FX.touch, g = new THREE.Group(); g.position.copy(pos);
  const M = (o) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: o, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false });
  const r1 = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 36), M(0.95)), r2 = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.14, 36), M(0.8)), flash = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), M(0.9));
  for (const m of [r1, r2, flash]) { m.renderOrder = 22; g.add(m); }
  const sp = labelSprite(txt, col, big); sp.position.y = 0.5; sp.renderOrder = 23; g.add(sp); scene.add(g);
  vbBurst(pos, col, n, type === 'stuff' ? 3.6 : 2.4); if (type === 'stuff' || type === 'out') vbBurst(pos, '#FFFFFF', 10, 1.6);
  if (type === 'stuff' && pos.distanceTo(camera.position) < 10) VB.shake = Math.max(VB.shake || 0, 0.26);
  const base = sp.scale.clone(), t0 = performance.now();
  (function anim() {
    const k = (performance.now() - t0) / 1100; if (k >= 1 || !g.parent) { scene.remove(g); return; }
    for (const m of [r1, r2, flash]) m.quaternion.copy(camera.quaternion);   // 光圈一直正對鏡頭
    r1.scale.setScalar(1 + k * 5); r1.material.opacity = 0.95 * (1 - k); r2.scale.setScalar(1 + Math.max(0, k - 0.12) * 7); r2.material.opacity = 0.8 * Math.max(0, 1 - k * 1.3);
    flash.scale.setScalar(1 + k * 2); flash.material.opacity = Math.max(0, 0.9 - k * 3);
    const pop = k < 0.12 ? 0.4 + (k / 0.12) * 0.8 : k < 0.22 ? 1.2 - ((k - 0.12) / 0.1) * 0.2 : 1;   // 字彈出來：先放大再縮回
    sp.scale.copy(base).multiplyScalar(pop); sp.position.y = 0.5 + k * 0.5; sp.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    requestAnimationFrame(anim);
  })();
}
// 攔網併好了（兩個或三個人一起跳、手之間沒有空隙＝沒有中洞）：網子上方亮起一面半透明的牆
function vbWallFx() {
  if (!VM.on || !VM.c) return;
  for (const t of [0, 1]) {
    const L = [];   // 這一隊現在在空中攔網的人：在網前 1 m 內、跳起來 0.4 m 以上
    for (const a of VM.ai.values()) if (a.team === t && a.pose === 9 && a.y > 0.4) { const [lx, lz] = vmL(a.av.g.position.x, a.av.g.position.z); if (Math.abs(lx) < 1.1) L.push(lz); }
    if (vmTeamOf(vmMe()) === t && walk.air && walk.air.block && walk.air.y > 0.3) { const [lx, lz] = vmL(walk.x, walk.z); if (Math.abs(lx) < 1.1) L.push(lz); }
    for (const p2 of NET.peers.values()) if (VM.team[t].includes(p2.id) && p2.pose === 9 && (p2.y || 0) > 0.4) { const [lx, lz] = vmL(p2.x, p2.z); if (Math.abs(lx) < 1.1) L.push(lz); }
    if (L.length < 2) { if (VM.wallT && VM.wallT[t]) VM.wallT[t] = 0; continue; }
    L.sort((x, y) => x - y); let ok = true; for (let i = 1; i < L.length; i++) if (L[i] - L[i - 1] > 0.95) ok = false;   // 兩人中心隔 0.95 m 以內＝手碰得到手，沒有中洞
    VM.wallT = VM.wallT || [0, 0]; if (!ok || VM.wallT[t]) continue; VM.wallT[t] = 1;
    const sd = vmSide(t), z0 = L[0] - 0.45, z1 = L[L.length - 1] + 0.45, netH = NETS[state.net].h, w = z1 - z0, [wx, wz] = vmW(sd * 0.28, (z0 + z1) / 2), col = t === Math.max(0, vmTeamOf(vmMe())) ? '#3E9BFF' : '#E5484D';
    const g = new THREE.Group(); g.position.set(wx, netH + 0.48, wz); g.rotation.y = (VM.c.rot * Math.PI) / 180 - Math.PI / 2;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.9), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.05), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); edge.position.y = 0.45;
    const sp = labelSprite(L.length >= 3 ? '三人攔網・一面牆' : '雙人攔網！', col, 1.05); sp.position.y = 0.85; g.add(wall, edge, sp); scene.add(g);
    const t0 = performance.now(), base = sp.scale.clone();
    (function anim() { const k = (performance.now() - t0) / 1000; if (k >= 1 || !g.parent) { scene.remove(g); return; } wall.material.opacity = 0.32 * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85); edge.material.opacity = 0.9 * (1 - k); sp.scale.copy(base).multiplyScalar(k < 0.12 ? 0.5 + k * 4.2 : 1); sp.material.opacity = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1; requestAnimationFrame(anim); })();
  }
}
// 人跟人不能重疊：每個人身體半徑約 0.3 m，兩個人中心至少隔 0.6 m——被擋住就停在旁邊，不會穿過去、疊在一起搶同一顆球
function vbBodyPush() {
  const others = []; if (VM.on) for (const a of VM.ai.values()) others.push(a.av.g.position);
  for (const p2 of NET.peers.values()) if (p2.av && p2.av.g.visible !== false) others.push(p2.av.g.position);
  if (VB.npc) others.push(VB.npc.av.g.position);
  for (const o of others) { const dx = walk.x - o.x, dz = walk.z - o.z, d = Math.hypot(dx, dz); if (d > 0.001 && d < 0.6) { walk.x = o.x + (dx / d) * 0.6; walk.z = o.z + (dz / d) * 0.6; } }
}
// 落點：場內綠圈 IN、場外紅圈 OUT，停 2.5 秒
function vmMark(x, z, inside) {
  const g = new THREE.Group(), ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.28, 32), new THREE.MeshBasicMaterial({ color: inside ? '#30A46C' : '#E5484D', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  const sp = labelSprite(inside ? 'IN' : 'OUT', inside ? '#30A46C' : '#E5484D', 0.7); sp.position.y = 0.7; g.add(sp);
  g.position.set(x, 0, z); scene.add(g); setTimeout(() => scene.remove(g), 2500);
}
// OUT：落點插一支小旗子一下
function vmOut(B) {
  const [x, z] = vmW(B.x, B.z), g = new THREE.Group(); cyl(g, 0.012, 0.012, 1.1, '#FFFFFF', 0, 0, 0); box(g, 0.3, 0.2, 0.01, '#E5484D', 0.15, 0.88, 0);
  g.position.set(x, 0, z); scene.add(g); setTimeout(() => scene.remove(g), 2500);
}
// ---- AI 球員
// 一次進攻：誰接（離落點最近的人）、誰舉（另一個）、誰攻（接球的人）
// 頭上冒一下喊的話
function vmShout(t) {
  const el = document.createElement('div'); el.className = 'mp-tag mp-shout'; el.style.background = '#F2B705'; el.style.color = '#1B2638'; el.textContent = t;
  const o = new CSS2DObject(el); o.position.set(walk.x, 2.3, walk.z); scene.add(o); setTimeout(() => { scene.remove(o); el.remove(); }, 1200);
}
function vmPossession(team, B) {
  if (VM.poss[team]) return VM.poss[team];
  const p = vmPredL(B, 0.9); if (!p) return null;
  const ids = VM.team[team], d = ids.map((id) => { const q = vmPos(id); return q ? Math.hypot(q.x - p.x, q.z - p.z) : 99; });
  const passer = d[0] <= d[1] ? ids[0] : ids[1], setter = ids.find((i) => i !== passer);
  VM.poss[team] = { stage: 0, passer, setter, attacker: passer };
  return VM.poss[team];
}
function vmAiStep(a, dt) {
  const sd = vmSide(a.team), b = VM.ball, live = VM.phase === 'rally' && b && balls.includes(b);
  a.swingT = Math.max(0, a.swingT - dt);
  if (VM.phase === 'serve' && vmServer() === a.id && VM.t > VM.serveAt && Math.hypot(a.x - a.tx, a.z - a.tz) < 0.4) { vmAiServe(a); VM.serveAt = 1e9; }
  if (VM.six) vm6Brain(a, sd, b, live);
  else if (live && vmAiBlock(a, sd, b)) { /* 正在攔網 */ }
  else if (live) {
    // 自己隊友剛打向對面、還在我這邊飛的球（扣球、推過去）不要去碰
    const B = vmBallL(b), onMine = Math.sign(B.x) === sd, land = vmPredL(B, BALL_R), outgoing = VM.touch.team === a.team && VM.touch.last !== a.id && (VM.touch.n >= 3 || ['spike', 'tip', 'hit'].includes(b.lk)) && Math.sign(B.vx) === -sd && land && Math.sign(land.x) === -sd;   // 隊友打出去、會落在對面的球才不碰（傳給我的球要接）
    const coming = !outgoing && (Math.sign(B.vx) === sd || onMine) && !vmLetGo(a.team, b);   // 會出界的球放掉
    const myTurn = VM.touch.team !== a.team || VM.touch.n < 3;
    if (coming && myTurn && !(VM.touch.team === a.team && VM.touch.n >= 3)) {
      if (VM.touch.team !== a.team && VM.poss[a.team] && VM.poss[a.team].stage > 0) VM.poss[a.team] = null;   // 球剛從對面過來：重新分工
      const P = vmPossession(a.team, B);
      if (P && VM.t >= a.reactAt) vmAiRole(a, P, B, sd);
    } else {
      // 球在對面：回防守位置；隊友在網前（AI 在攔網、或真人站在網前 2.2 m 內）→ 我退到後排中間補位，偏向攔網擋不到的斜線
      const k = VM.team[a.team].indexOf(a.id), mate = VM.team[a.team].find((id) => id !== a.id), mp = vmPos(mate), ma = VM.ai.get(mate);
      const mateFront = (ma && ma.blk) || (!ma && mp && Math.abs(mp.x) < 2.2), th = mateFront ? vmThreat(a.team) : null;
      if (mateFront) { a.tx = sd * 6.2; a.tz = clamp(th ? -th.z * 0.35 : 0, -2.2, 2.2); }
      else { a.tx = sd * (vmLv(a).block > 0.8 ? 5.5 : 6); a.tz = k === 0 ? 2 : -2; }
      a.reactAt = VM.t + vmLv(a).react;
      if (VM.touch.team !== a.team) VM.poss[a.team] = null;
    }
  }
  // AI 球員急停、急轉：球鞋吱一聲
  { const ps = Math.hypot(a.pvx || 0, a.pvz || 0), cs = Math.hypot(a.vx, a.vz), cosA = ps > 0.1 && cs > 0.1 ? ((a.pvx || 0) * a.vx + (a.pvz || 0) * a.vz) / (ps * cs) : 1;
    if (a.y <= 0 && ((ps > 2 && (cs < ps * 0.55 || cosA < 0.6)) || (ps < 1 && cs > 3.2)) && VM.t - (a.sqT || 0) > 0.5) { a.sqT = VM.t; const [wx, wz] = vmW(a.x, a.z); sfx('squeak', 0.6 + Math.random() * 0.3, new THREE.Vector3(wx, 0.05, wz)); }
    const kf = Math.min(1, dt * 4); a.pvx = (a.pvx || 0) + (a.vx - (a.pvx || 0)) * kf; a.pvz = (a.pvz || 0) + (a.vz - (a.pvz || 0)) * kf; }   // 跟著慢慢走的速度：跟現在差很多＝剛急停／急轉
  // 移動、跳
  { const v0 = Math.hypot(a.vx, a.vz); const c = staCfg(); if (v0 > 3.6 && a.y <= 0) a.sta = Math.max(0, (a.sta ?? 1) - (c.sprint / 100) * 0.6 * dt); else a.sta = Math.min(1, (a.sta ?? 1) + ((VM.phase === 'rally' ? (v0 < 0.5 ? c.regStill : c.regMove) : c.regDead) / 100) * dt); }   // AI 體力：全速跑會耗、停下來慢慢回
  const spMax = vmLv(a).speed * (0.85 + 0.15 * clamp((a.sta ?? 1) / 0.3, 0, 1));   // 累了跑比較慢
  const nav = vmAiYieldRoute(a);
  const dx = nav.x - a.x, dz = nav.z - a.z, d = Math.hypot(dx, dz), sp = d > 0.05 ? (a.run ? Math.max(spMax, 4.8 * (0.85 + 0.15 * clamp((a.sta ?? 1) / 0.3, 0, 1))) : Math.min(spMax, d * 5)) : 0, kk = 1 - Math.exp(-dt * (a.run ? 12 : 9));   // 助跑：不減速一路衝到起跳點
  if (a.y <= 0) { a.vx += ((d > 0.05 ? dx / d : 0) * sp - a.vx) * kk; a.vz += ((d > 0.05 ? dz / d : 0) * sp - a.vz) * kk; }
  a.x += a.vx * dt; a.z += a.vz * dt; a.x = sd * clamp(a.x * sd, 0.35, 12); a.z = clamp(a.z, -7, 7);
  {   // 人跟人不能重疊：AI 跟其他 AI、真人至少隔 0.6 m（互相撞到就被推開，不會兩個人疊著接同一顆球）
    const bodies = []; for (const o of VM.ai.values()) if (o !== a) bodies.push([o.x, o.z]);
    for (const id of [...VM.team[0], ...VM.team[1]]) if (!VM.ai.has(id)) { const q = vmPos(id); if (q) bodies.push([q.x, q.z]); }
    for (const [ox, oz] of bodies) { const ex = a.x - ox, ez = a.z - oz, e = Math.hypot(ex, ez); if (e > 0.001 && e < 0.62) { a.x += (ex / e) * (0.62 - e) * 0.6; a.z += (ez / e) * (0.62 - e) * 0.6; } }
  }
  if (a.y > 0 || a.vy > 0) { a.vy -= JUMP_G * (a.vy < 0 && VM.six && VM.role[a.id] === 'MB' && vmPro(a) ? 0.6 : 1) * dt; a.y += a.vy * dt;   /* 企聯中間手：下降比較慢＝滯空久 */ if (a.y <= 0) { a.y = 0; a.vy = 0; a.tdFake = false; } }
  { const want = a.blk && a.y > 0.05 ? a.blk.bsZ || 0 : 0, d = want - (a.bs || 0); a.bs = (a.bs || 0) + clamp(d, -1.6 * dt, 1.6 * dt); }   // 攔網雙手往左右移（跟你一樣有速度上限）
}
// 對面的攻擊手（你、真人隊友或 AI）：位置、是不是已經起跳
function vmThreat(team) {
  const opp = 1 - team, B = VM.ball && vmBallL(VM.ball); if (!B) return null;
  const sdO = vmSide(opp); if (Math.sign(B.x) !== sdO && !(Math.abs(B.x) < 1.5 && Math.sign(B.vx) === sdO)) return null;   // 球要在對面（或剛要過網過去）
  if (VM.phase !== 'rally' || VM.touch.team !== opp || VM.touch.serve) return null;   // 球要是對面的（他們碰過、正在組織）：只是有人站在網前不算要攻擊
  for (const id of VM.team[opp]) {
    if (VM.ai.has(id)) { const q = VM.ai.get(id), P = VM.poss[opp]; if (P && P.attacker === id && P.stage === 2 && Math.abs(q.x) < 5) return { x: q.x, z: q.z, air: q.y > 0.05, id, fake: !!q.tdFake }; continue; }
    const pos = vmPos(id); if (!pos || Math.abs(pos.x) > 4.5) continue;
    const air = id === vmMe() ? !!(walk.air && !walk.air.block) : false, ballNear = Math.hypot(B.x - pos.x, B.z - pos.z) < 3 && B.y > 1.8;
    if (air || (ballNear && Math.abs(pos.x) < 4)) return { x: pos.x, z: pos.z, air, id };
  }
  return null;
}
function vmAiBlock(a, sd, b) {
  if (a.blk && a.y <= 0 && a.vy <= 0 && VM.t > a.blk.until) a.blk = null;
  const th = vmThreat(a.team);
  if (!th) { if (a.blk && a.y <= 0) a.blk = null; return !!a.blk; }
  // 一隊只派一個人攔：離攻擊手左右比較近、而且這一球還沒碰的人
  let lane = 0;
  if (VM.six) { if (!vm6BlockPick(a, th)) return false; lane = vmBlockLane(a, th); }   // 攔中固定在內側，邊翼固定在外側，不依當下誰站哪一邊交換
  else {
    if (VM.team[a.team].some((id) => !VM.ai.has(id) && (() => { const q = vmPos(id); return q && Math.abs(q.x) < 1.8; })())) return false;   // 真人隊友在網前：他攔，我退後防守
    const mates = VM.team[a.team].filter((id) => VM.ai.has(id)).map((id) => VM.ai.get(id));
    const pick = mates.sort((p, q) => Math.abs(p.z - th.z) + Math.abs(p.x) * 0.3 - (Math.abs(q.z - th.z) + Math.abs(q.x) * 0.3))[0];
    if (pick !== a) return false;
  }
  const L = vmLv(a);
  if (a.blkRoll !== VM.srvSeq * 100 + VM.touch.n + VM.touch.team * 10) { a.blkRoll = VM.srvSeq * 100 + VM.touch.n + VM.touch.team * 10; a.blkGo = Math.random() < L.block; }
  if (!a.blkGo) return false;
  if (!a.blk) a.blk = { until: VM.t + 3 };
  a.tx = sd * 0.45; a.tz = clamp(th.z + lane + (Math.random() - 0.5) * 0.1, -4.2, 4.2);
  if (a.blk.bsZ == null) { const cross = -Math.sign(th.z || (Math.random() < 0.5 ? 1 : -1)); a.blk.bsZ = (Math.random() < 0.65 ? cross : -cross) * (0.15 + Math.random() * 0.3); }   // 雙手要往哪邊（球場座標的左右）：多半封往場中間的斜線
  // 攻擊手起跳後，過反應時間就跟著跳
  const bite = !th.fake || (a.blk.bite ??= Math.random() < 1.15 - L.blockSkill);   // 時間差的假跳：程度越高越不會被騙
  if (th.air && bite && a.y <= 0 && a.vy <= 0 && !a.blk.jumped) { a.blk.jumpAt = a.blk.jumpAt || VM.t + Math.max(0, L.react * 0.6 + rkGauss() * (0.16 - 0.12 * L.blockSkill)); if (VM.t >= a.blk.jumpAt) { a.vy = aiJump(a, 4.0, 'block'); a.pose = 9; a.swingT = 0.9; a.blk.jumped = true; a.blk.until = VM.t + 1.2; } }   // 起跳時機有誤差：程度低的常常跳早或跳晚
  if (!th.air) a.blk.jumpAt = 0;
  return true;
}
// 攔網的結果（你攔、AI 攔都用這一套）：off＝球離雙手中心多遠（左右，以 0.75 m 的手寬算）、low＝球在手裡多深（0＝擦過指尖，1＝很低很釘）、pow＝扣球力道、skill＝攔網程度
//   正中又低＝容易攔死；打外側那隻手＝越用力越容易打手出界；擦過指尖＝彈大（彈高往攔網這邊後場飛，常常出界）；力道大＝可能打穿；其他＝撐起來
function vbBlockOutcome(off, low, pow, skill) {
  const centered = off < 0.4, edge = off > 0.42;
  if (low < 0.18 && Math.random() < 0.45 + 0.35 * pow) return 'top';
  const pStuff = skill * 0.6 * (centered ? 1 : 0.35) * (1 - 0.55 * pow) * (0.5 + 1.0 * low), pOut = (edge ? 0.1 + 0.6 * pow : 0.05) * (1.3 - 0.7 * low), pThrough = 0.32 * pow * (1.2 - skill), r = Math.random();
  return r < pStuff ? 'stuff' : r < pStuff + pOut ? 'out' : r < pStuff + pOut + pThrough ? 'through' : 'soft';
}
// 照結果改球：plane＝攔網那一側的網面（球場座標 lx）、sd＝攔網那一隊在哪一側、hz＝雙手中心（lz）、e＝沿著網子的方向、n＝網子的法線；回傳那一下叫什麼
// 碰手後球還剩多少力道（使用者 2026-11-04：touch out 彈太遠救不到 → 縮小；扣得越大力（pow 越大）保留越多，大力或打點好還是常救不到，但偶爾救得到）
const TOUCH_OUT = { outKeep: 0.09, outKeepPow: 0.08, outPast: [0.15, 0.7], outLatMax: [2.6, 1.2], topKeep: 0.14, topKeepPow: 0.14, topVy: [2.0, 1.4], powVy: 1.6 };   // powVy：扣得越大力，碰手後彈得越高（比較有時間跑去救）   // 2026-11-04 第二次調小
function vbBlockApply(b, kind, lx, lz, hz, plane, sd, ex, ez, nx, nz, pow) {
  const p = b.m.position, vl = b.v.x * nx + b.v.z * nz;
  if (kind === 'stuff') { b.v.x -= 1.5 * vl * nx; b.v.z -= 1.5 * vl * nz; b.v.multiplyScalar(0.55); b.v.y = -Math.abs(b.v.y) * 0.3 - 2; const back = plane - sd * (BALL_R + 0.03) - lx; p.x += nx * back; p.z += nz * back; return '被攔死了！'; }
  if (kind === 'out') {   // 打手出界：球擦到外側那隻手，力道被吃掉大半，往旁邊輕輕彈起、偏出邊線外 0.6～1.8 m
    const side = Math.sign(lz - hz) || (Math.random() < 0.5 ? 1 : -1);
    b.v.multiplyScalar(TOUCH_OUT.outKeep + TOUCH_OUT.outKeepPow * pow);
    const vy = 1.2 + Math.random() * 1.6 + TOUCH_OUT.powVy * pow, t = (vy + Math.sqrt(vy * vy + 19.6 * Math.max(0.1, p.y - BALL_R))) / 9.8;
    const vlat = clamp((4.5 + BALL_R + TOUCH_OUT.outPast[0] + Math.random() * (TOUCH_OUT.outPast[1] - TOUCH_OUT.outPast[0]) * (0.5 + pow) - side * lz) / t, 1.0, TOUCH_OUT.outLatMax[0] + TOUCH_OUT.outLatMax[1] * pow);
    b.v.x += ex * side * vlat; b.v.z += ez * side * vlat; b.v.y = vy;
    const lz2 = lz + (b.v.x * ex + b.v.z * ez) * t, lx2 = lx + (b.v.x * nx + b.v.z * nz) * t;
    return Math.abs(lz2) > 4.5 + BALL_R || Math.abs(lx2) > 9 + BALL_R ? '打手出界！' : '碰手了！';
  }
  if (kind === 'top') { b.v.multiplyScalar(TOUCH_OUT.topKeep + TOUCH_OUT.topKeepPow * pow); b.v.y = TOUCH_OUT.topVy[0] + Math.random() * TOUCH_OUT.topVy[1] + TOUCH_OUT.powVy * pow; return '擦手彈大！'; }   // 擦過指尖：彈高，繼續往攔網這邊的後場飛
  if (kind === 'through') { b.v.multiplyScalar(0.82); b.v.y -= 0.8; return '打穿攔網！'; }
  b.v.multiplyScalar(0.25); b.v.y = 3 + Math.random() * 1.5; return '撐起來了';
}
const BLK_FX = { stuff: 'stuff', soft: 'soft', through: 'through', out: 'out', top: 'touch' };
// AI 攔網：球穿過 AI 雙手的位置才算；手頂＝站著 2.7 m＋跳起來的高度（最高點約 3.65 m，比完美助跑、在最高點扣的擊球點低一點：攻擊手跳得好就能打過手）
function vmBlockTest(b, h) {
  if (!VM.on || !VM.host || VM.phase !== 'rally' || b !== VM.ball || b.blkDone) return;
  for (const a of VM.ai.values()) {
    if (!a.blk || !a.blk.jumped || a.y < 0.05 || VM.touch.last === a.id) continue;
    const sd = vmSide(a.team), p = b.m.position, [lx, lz] = vmL(p.x, p.z), [l0] = vmL(p.x - b.v.x * h, p.z - b.v.z * h), plane = sd * 0.1;
    if (!((l0 - plane) * (lx - plane) <= 0 && (lx - l0) * sd > 0)) continue;
    const off = Math.abs(lz - (a.z + (a.bs || 0))), top = a.y + 2.7, netH = NETS[state.net].h;   // 雙手的中心跟著左右移
    if (off > 0.75 + BALL_R || p.y > top + BALL_R || p.y < netH - 0.05) continue;   // 從手上面過去＝打過手；從旁邊過去＝繞過攔網
    const L = vmLv(a), pow = clamp((b.v.length() - 8) / 18, 0, 1), low = clamp((top - p.y) / Math.max(0.3, top - netH), 0, 1);
    const rr = (VM.c.rot * Math.PI) / 180, kind = vbBlockOutcome(off, low, pow, L.blockSkill);
    const word = vbBlockApply(b, kind, lx, lz, a.z + (a.bs || 0), plane, sd, Math.sin(rr), Math.cos(rr), Math.cos(rr), -Math.sin(rr), pow);
    b.blkDone = true;
    vbImpact(b, 'block', 1); netFxHit(VM.c, lz, sd, 0.4, true); vbBlockFx(p.clone(), word === '碰手了！' ? 'touch' : BLK_FX[kind]);
    vmOnTouch(b, a.id, 'block');
    if (NET.on) netBallHit(b, 'block');
    const mine = a.team !== 0; vmSay(word, kind === 'soft' ? '' : (mine ? kind !== 'stuff' : kind === 'stuff') ? 'gold' : 'warn', 1400);
    recHit({ x: p.x, y: p.y, z: p.z, v: b.v.length(), kind: 'block' });
    return;
  }
}
function vmAiRole(a, P, B, sd) {
  const st = P.stage;
  if (VM.touch.team === a.team && VM.touch.last === a.id && VM.touch.n > 0) { if (VM.six) { const f = vm6Spot(a.team, a.id, 'attack'); a.tx = f.x; a.tz = f.z; } else if (st === 1 && P.setter !== a.id) { a.tx = vmSide(a.team) * 4.0; a.tz = clamp(a.z, -3.5, 3.5); } return; }   // 接完球退到網後 4 m 準備助跑
  const hand = () => { const [x, z] = vmW(a.x, a.z); return new THREE.Vector3(x, a.y + 2.4, z); };
  if (st === 0 && P.passer === a.id) {           // 接球：跑到球落到 0.85 m 的地方後面
    const p = vmPredL(B, 0.85); if (p) { a.tx = p.x + sd * 0.4; a.tz = p.z; }
    const dh = Math.hypot(B.x - a.x, B.z - a.z);
    if (dh < (VM.six && VM.touch.blk && VM.touch.team !== a.team ? 1.4 : 1.05) && B.y < 1.5 && B.y > 0.3) {   // 被攔回來的球：蹲在旁邊 cover 的人撲得比較遠
      const vin = Math.hypot(B.vx, B.vy, B.vz), fast = vin > 15, L = vmLv(a), onLine = dh < 0.55 - 0.25 * clamp((vin - 10) / 15, 0, 1);   // 有沒有站在球路上（越重容許偏差越小）
      if (fast && Math.random() < L.miss * (onLine ? 0.7 : 1.3)) { a.reactAt = VM.t + 1.2; return; }   // 重扣沒接到
      if (fast && !onLine) {   // 沒對到球路：撲過去撈，球高高的落在自己附近（往場中間一點），讓隊友修正
        const dz = (B.z - a.z) * sd;
        vmAiTouch(a, sd * clamp(Math.abs(a.x) - 0.5, 2.2, 7), a.z * 0.6, 1.0, 1.5, 0.8 + L.passErr, 'bump', Math.abs(dz) < 0.35 ? 10 : dz > 0 ? 11 : 12); a.swingT = 1.25; return;
      }
      let tlx = sd * 1.8, tlz = VM.six ? -sd * 0.9 + (Math.random() - 0.5) * 1.2 : (Math.random() - 0.5) * 2, ty = 2.4, T = 1.35;   // 6 對 6 傳到舉球點（網前偏右）
      const flt = VM.ball && VM.ball.float ? 1 + VM.ball.float.a / 8 : 1;   // 飄球：越飄越難接
      const d = vbHardDefl(vin, 1 - L.passErr * 0.5, onLine, B.vz, 0.6 + 0.6 * L.passErr);   // 重球被推走（站到位也會，程度越高越會卸力）
      if (Math.random() < 0.012 + 0.05 * L.passErr) { vmAiTouch(a, sd * 0.05, a.z * 0.5 + rkGauss() * 0.6, 1.8, 0.8, 0.2, 'bump', 3, true); return; }   // 接過頭：撞到網子
      if (d && 1.8 + d.dx < 0.3) { vmAiTouch(a, -sd * (2 + Math.random() * 4), (Math.random() - 0.5) * 5, BALL_R, 1.5, 0.5, 'bump', 3); return; }   // 太衝：直接回對面
      if (d) { tlx = sd * (1.8 + d.dx); tlz += d.dz; ty += d.dy; T += d.dT; }
      vmAiTouch(a, tlx, tlz, ty, T, L.passErr * (fast ? 1.3 : 1) * flt, 'bump', 3);
    }
  } else if (P.setter === a.id && st <= 1) {      // 舉球：先到網前，球傳過來就跑到它下面
    if (st === 0) { a.tx = sd * (VM.six ? 1.1 : 1.4); a.tz = VM.six ? -sd * 1.0 : 0; return; }
    const pHi = vmPredL(B, 2.2), pLo = pHi ? null : vmPredL(B, 1.0), p = pHi || pLo; if (p) { a.tx = p.x + sd * 0.25; a.tz = p.z; }
    const dh = Math.hypot(B.x - a.x, B.z - a.z);
    if (!pHi && dh < 1.2 && B.y < 1.5 && B.y > 0.35 && B.vy < 0 && VM.six) {
      vmAiSetAttack(a, P, B, vm6ChooseSet(a, B), true); return;
    }
    if (!pHi && dh < 1.2 && B.y < 1.5 && B.y > 0.35 && B.vy < 0) { const ap = vmPos(P.attacker) || { z: 0 }; vmAiTouch(a, sd * 1.2, clamp(ap.z, -3.6, 3.6), 2.9, 1.3, vmLv(a).setErr * 1.5, 'set', 3); return; }   // 傳得太低：低手墊舉
    const activeCall = a.team === vmTeamOf(vmMe()) && VM.call && VM.t - VM.call.t < 8 ? VM.call : null;
    const qmb = VM.six && !vmSmallCount() && (!activeCall || (activeCall.n === 2 && activeCall.v !== 'high3')) && !P.fix && (!P.grade || P.grade === 'A') ? vm6AirMB(a.team, a.id) : null, early = !!qmb && dh < 1.45 && B.y < 3.8 && B.y > 1.8;
    if (early && B.y > 2.9 && a.y <= 0 && a.vy <= 0) { a.vy = aiJump(a, 2.6, 'set'); }   // 球還很高：舉球員跳起來舉
    if (early || (dh < 1.25 && B.y < 3.1 && B.y > 1.5 && B.vy < 1.5)) {
      if (vmPro(a) && !P.dumpChk && !P.fix && Math.abs(a.x) < 1.8 && (!VM.six || vm6Front(a.id)) && B.y > 2.0) {   // 企聯技能：舉球員跳起來雙手往右推，貼網吊到對面三米線中間（每波最多想一次）
        P.dumpChk = true;
        if (Math.random() < 0.14) {
          if (a.y <= 0 && a.vy <= 0) a.vy = aiJump(a, 2.6, 'set');
          const netH = NETS[state.net].h, f = clamp(Math.abs(B.x) / (Math.abs(B.x) + 3), 0.05, 0.95), base = B.y + (BALL_R - B.y) * f, T = Math.max(0.55, Math.sqrt(Math.max(0.02, netH + BALL_R + 0.12 - base) / (4.9 * f * (1 - f))));
          vmAiTouch(a, -sd * 3, (Math.random() - 0.5) * 0.6, BALL_R, T, 0.05, 'tip', 2, true); return;
        }
      }
      let ap = vmPos(P.attacker) || { z: 0 }, call = a.team === 0 && VM.call && VM.t - VM.call.t < 8 ? VM.call.n : 0, pick = null;
      const callV = call ? VM.call.v : null, mb3 = callV === 'high3' && VM.six ? VM.team[a.team].find((id) => id !== a.id && VM.role[id] === 'MB' && vm6Front(id)) : null;   // 喊平球／3 號位高球
      if (VM.six) { pick = mb3 ? { n: 2, id: mb3 } : early ? { n: 2, id: qmb.id } : vm6ChooseSet(a, B); if (mb3) VM.call = null; call = pick.n; ap = vmPos(pick.id) || ap; if (early && VM.call) VM.call = null; } else if (call) VM.call = null;
      if (VM.six && pick && (vmSmallCount() || !vm6Front(pick.id))) { vmAiSetAttack(a, P, B, pick, false); return; }
      // 修正球：傳得不到位（C）、離網太遠、或不是舉球員在舉（舉球員追不到、第一球是他接的）→ 又高又慢的高球到兩邊（大多 4 號位），比較不準
      const far = Math.max(0, Math.abs(a.x) - 2.6), fixS = !early && call !== 2 && (P.fix || far > 0.8 || (VM.six && !vmSmallCount() && VM.role[a.id] !== 'S' && !vmPro(a)));   // 小人數沒有專職舉球員：誰舉都照正常舉
      if (fixS) {
        const e = vmLv(a).setErr * (VM.six && !vmSmallCount() && VM.role[a.id] !== 'S' ? 2.2 : 1.3) * (1 + 0.15 * far), lz = VM.six ? (call === 3 ? -sd : sd) * 3.0 : clamp(ap.z, -3.3, 3.3);
        vmAiTouch(a, sd * 1.3, lz, 3.1, 1.45 + far * 0.06, e, 'set', far > 2.5 || B.y < 1.6 ? 3 : 2);
        P.fix = true; if (pick && P.stage === 2) P.attacker = pick.id;
        return;
      }
      // 有喊球就照喊的舉：快攻＝在舉球員旁邊、又低又快；4 號位／2 號位＝高球到兩邊；沒喊就舉到攻擊手那邊
      if (call === 2 && callV === 'high3') { vmAiTouch(a, sd * 1.0, VM.six ? clamp(ap.z, -1.2, 1.2) : 0, 2.95, 1.1, vmLv(a).setErr, 'set', 2); P.td = true; }   // 3 號位高球：打時間差
      else if (call === 2 && VM.six) vmAiTouch(a, sd * clamp(Math.abs(ap.x ?? 1) - 0.1, 0.7, 1.4), clamp(ap.z, a.z - 1.6, a.z + 1.6), 3.05, 0.19, vmLv(a).setErr * 0.4, 'set', 2);   // 6 對 6 快攻：又低又快直接送到已經跳起來的中間手手上
      else if (call === 2) vmAiTouch(a, sd * 0.75, clamp(ap.z, a.z - 1.5, a.z + 1.5), 2.95, 0.32, vmLv(a).setErr * 0.6, 'set', 2);
      else if (call === 1 || call === 3) { const flat = callV ? callV === 'flat' : Math.random() < (vmLv(a).flat || 0); vmAiTouch(a, sd * 1.0, (call === 1 ? sd : -sd) * 3.3, 2.95, flat ? 0.82 : 1.2, vmLv(a).setErr, 'set', 2); }   // 平球：又平又快（喊的照喊，沒喊照程度自己選）
      else if (call === 6) { vmAiTouch(a, sd * 1.0, clamp(ap.z, -1.2, 1.2), 2.95, 1.1, vmLv(a).setErr, 'set', 2); P.td = true; }   // 3 號位高球：打時間差
      else if (call === 4) vmAiTouch(a, sd * 3.6, 0, 3.0, 1.2, vmLv(a).setErr, 'set', 2);
      else if (call === 5) vmAiTouch(a, sd * 3.6, -sd * 3.0, 3.0, 1.3, vmLv(a).setErr, 'set', 2);
      else if (call === 7) vmAiTouch(a, sd * 3.6, sd * 3.0, 3.0, 1.3, vmLv(a).setErr, 'set', 2);   // 後排 5 號位（左邊後排攻擊）   // 右邊後排攻擊（舉對在後排時）
      else vmAiTouch(a, sd * 1.0, clamp(ap.z, -3.6, 3.6), 2.85, Math.random() < (vmLv(a).flat || 0) ? 0.85 : 1.25, vmLv(a).setErr, 'set', 2);   // 2 對 2：照程度有時舉平球
      if (pick && VM.poss[a.team] && VM.poss[a.team].stage === 2) VM.poss[a.team].attacker = pick.id;
    }
  } else if (P.attacker === a.id && st === 2) {
    if (P.td && !P.tdDone && (VM.role || {})[a.id] === 'MB' && a.y <= 0 && a.vy <= 0) { P.tdDone = true; a.vy = aiJump(a, 2.0, 'jump'); a.pose = 5; a.tdFake = true; return; }   // 時間差：先小跳假裝打快攻（騙攔網），落地再照高球的時間助跑起跳   // 攻擊：照球掉到 2.8 m 的時間倒推——先在助跑起點等，時間到就三步衝進去，踩到起跳點剛好起跳（不會跑進去站著等）
    const p = vmPredL(B, 2.8);
    if (a.runFor !== P) { a.runFor = P; a.run = false; }
    if (p && a.y === 0) {
      let tx = p.x + sd * 0.55; if (VM.six && !vm6Front(a.id)) tx = sd * Math.max(3.25, tx * sd);   // 後排攻擊（6 對 6）：在 3 公尺線後起跳
      const tz = p.z, uz = clamp((a.z - tz) * 0.35, -0.6, 0.6), un = Math.hypot(1, uz), sx = tx + (sd / un) * 2.8, sz = tz + (uz / un) * 2.8;   // 助跑起點：起跳點往後（斜斜的從場內）2.8 m＝三步
      const dT = Math.hypot(a.x - tx, a.z - tz), tUp = 4.7 / JUMP_G, wait = p.t - tUp - dT / 4.8;   // 起跳到最高點的時間（約 0.5 秒）；助跑約每秒 4.8 m
      if (!a.run && wait > 0.04) { a.tx = sx; a.tz = sz; a.appr = false; }
      else { a.run = true; a.tx = tx; a.tz = tz; a.appr = true; }
      if (a.run && (dT < 0.45 || p.t < tUp)) { a.vy = aiJump(a, 4.7, 'jump'); a.pose = 5; a.appr = false; a.run = false; a.vx *= 0.25; a.vz *= 0.25; }   // 踩到起跳點就跳：衝的速度大多變成高度，空中只往前飄一點
    }
    const H = hand();
    if (b2d(H) < 1.0 && B.y > 2.0) vmAiSpike(a, sd);
    else if (!p && B.y < 1.6 && Math.hypot(B.x - a.x, B.z - a.z) < 1.1) vmAiFree(a, sd);   // 舉得太低：推過去
  } else if (st >= 1 && st < 3 && VM.touch.last !== a.id && (!VM.six || (st === 2 && !P.attacker))) {   // 其他情況（例如隊友沒接好）：不是剛碰過球的人去救（同一人不能連碰兩下）
    const p = vmPredL(B, 1.0); if (p) { a.tx = p.x + sd * 0.4; a.tz = p.z; }
    if (Math.hypot(B.x - a.x, B.z - a.z) < 1.0 && B.y < 1.3 && B.y > 0.3 && B.vy < 0) vmAiFree(a, sd);
  }
  function b2d(H) { return VM.ball.m.position.distanceTo(H); }
}
// AI 碰球：照目標（球場座標）算出初速；err＝落點誤差（公尺）
function vmAiOwnSide(a) { const [lx] = vmL(VM.ball.m.position.x, VM.ball.m.position.z); return lx * vmSide(a.team) > -0.02; }
// AI 的體力（跟玩家同一套扣法）：累了跳得矮、跑得慢、扣得慢；連線時跟著狀態送給大家（隊友腳下的圓環）
function aiEff(a) { return 0.8 + 0.2 * clamp((a.sta ?? 1) / 0.3, 0, 1); }
function aiPay(a, kind) { const f = aiEff(a); a.sta = Math.max(0, (a.sta ?? 1) - staCost(kind, a.id)); return f; }
function aiJump(a, vy, kind) {
  const v = vy * (0.4 + 0.6 * aiPay(a, kind));
  if (VM.host && a.y <= 0 && a.vy <= 0 && v > 0) {
    const [jx, jz] = vmW(a.x, a.z);
    a.jp = { s: (a.jp?.s || 0) + 1, vy: v, g: JUMP_G, down: VM.six && VM.role[a.id] === 'MB' && vmPro(a) ? 0.6 : 1, t: VM.t, x: +jx.toFixed(2), z: +jz.toFixed(2) };
    if (NET.on) NET.forceSt = true;
  }
  return v;
}
function vmAiTouch(a, tlx, tlz, ty, T, err, kind, pose, free = false, backSet = false) {
  if (!vmAiOwnSide(a)) return;
  if (!free && (kind === 'set' || (kind === 'bump' && ty > 1)) && tlx * vmSide(a.team) < 0.7) tlx = vmSide(a.team) * 0.7;   // 傳、舉都留在自己這邊（free＝接過頭撞網那種）
  let targetX = tlx + rkGauss() * err * 0.5, targetZ = tlz + rkGauss() * err;
  if (kind === 'set' && (backSet || vmSmallCount() === 3)) { targetX = vmSide(a.team) * clamp(targetX * vmSide(a.team), 4.2, 8.0); targetZ = clamp(targetZ, -3.3, 3.3); }   // 所有人數的後排舉球：誤差也不能把球帶進 3 公尺線
  const b = VM.ball, [wx, wz] = vmW(targetX, targetZ), [ax0, az0] = vmW(a.x, a.z);
  const p = b.m.position.clone().lerp(new THREE.Vector3(ax0, a.y + (kind === 'set' ? 2.35 : 0.75), az0).lerp(b.m.position, 0.25), 0.65);
  b.mine = false; b.setT = kind === 'set' ? performance.now() : 0; aiPay(a, kind === 'set' ? 'set' : 'bump');
  a.pose = pose; a.swingT = 0.4; a.reactAt = VM.t + 0.25;
  vbLaunch(b, p, new THREE.Vector3((wx - p.x) / T, (ty - p.y) / T + 4.9 * T, (wz - p.z) / T), kind, 0.85);
  if (kind === 'set') vbMarkSet(b);
  vmOnTouch(b, a.id, kind);
}
// 對面的人在哪裡（球場座標）
function vmOppPos(team) { return VM.team[1 - team].map((id) => vmPos(id)).filter(Boolean); }
// 找空檔：在 x 範圍內抽幾個落點，挑離對面最近的人最遠的；程度越高挑得越準
function vmPickGap(a, sd, x0, x1, zMax) {
  const opp = vmOppPos(a.team), L = vmLv(a); let best = null;
  for (let i = 0; i < 12; i++) {
    const tx = -sd * (x0 + Math.random() * (x1 - x0)), tz = (Math.random() - 0.5) * 2 * zMax, d = Math.min(9, ...opp.map((q) => Math.hypot(q.x - tx, q.z - tz)));
    const score = d + rkGauss() * (1.2 - L.blockSkill) * 1.5;
    if (!best || score > best.score) best = { tx, tz, score, d };
  }
  return best;
}
function vmAiSpike(a, sd) {
  if (!vmAiOwnSide(a)) return;
  const b = VM.ball, r = Math.random(), L = vmLv(a), [ax0, az0] = vmW(a.x - sd * 0.25, a.z), p = b.m.position.clone().lerp(new THREE.Vector3(ax0, a.y + 2.45, az0), 0.7);
  const gap = vmPickGap(a, sd, 2.5, 8.3, 3.9), netGuard = vmOppPos(a.team).some((q) => Math.abs(q.x) < 2.5);
  const fixB = !!(VM.poss[a.team] && VM.poss[a.team].fix), Lo = L.out * (fixB ? 1.6 : 1), Lt = L.tip + (fixB ? 0.08 : 0), Ln = L.net * (fixB ? 1.6 : 1);   // 修正球：打不重、出界掛網多、常常吊
  let tx = gap.tx, tz = gap.tz, spd = (L.spike[0] + Math.random() * (L.spike[1] - L.spike[0])) * (0.6 + 0.4 * aiEff(a)) * (fixB ? 0.85 : 1), tip = false;
  const mix = Math.random();
  const sup = L.pro && !fixB && VM.six && ROLE_SUPER[VM.role[a.id]] && Math.random() < 0.25 ? ROLE_SUPER[VM.role[a.id]] : null;   // 企聯技能：大砲／舉對打到紫色區
  if (sup) { spd = L.spike[1] * sup.pw * (0.6 + 0.4 * aiEff(a)); const g2 = vmPickGap(a, sd, 2.5, 6.5, 3.9); tx = g2.tx; tz = g2.tz; }
  else if (!fixB && mix < L.sweet * 0.6) { spd = L.spike[1] * 1.1 * (0.6 + 0.4 * aiEff(a)); const g2 = vmPickGap(a, sd, 2.5, 6, 3.9); tx = g2.tx; tz = g2.tz; }   // 蓄到甜蜜點的重扣：又重又釘
  else if (mix > 0.9) { spd = 12 + Math.random() * 2.5; const g2 = vmPickGap(a, sd, 6.5, 8.2, 3.9); tx = g2.tx; tz = g2.tz; }   // 輕打：吊到後場深角
  if (r < Lo) { if (Math.random() < 0.5) tx = -sd * (9.5 + Math.random() * 1.8); else tz = Math.sign(tz || 1) * (4.8 + Math.random() * 1.2); }
  else if (!netGuard && r < Lo + Lt) { tip = true; tx = -sd * (1.5 + Math.random() * 1.5); }   // 網前沒人才吊，吊在網後
  if (!tip && r >= Lo) {
    const bl = vmBlockerFacing(a);
    if (bl) {
      const rc = Math.random(), side = Math.sign(bl.z) || (Math.random() < 0.5 ? 1 : -1), f = Math.max(0.15, Math.abs(a.x) / (Math.abs(a.x) + Math.abs(tx)));
      if (rc < 0.15 + 0.35 * L.blockSkill) { tz = clamp(a.z + (bl.z + side * 0.55 - a.z) / f, -4.4, 4.4); spd = Math.max(spd, L.spike[1] * 0.95); }   // 打手出界：瞄外側那隻手、用力，落點壓邊線
      else if (rc < 0.45 + 0.35 * L.blockSkill) tz = clamp(a.z + (bl.z - side * 1.0 - a.z) / f, -4.2, 4.2);   // 繞手：打攔網沒封到的裡面那邊
    }
  }
  const [wx, wz] = vmW(tx, tz);
  let v;
  if (tip) { const T = 0.85; v = new THREE.Vector3((wx - p.x) / T, (BALL_R - p.y) / T + 4.9 * T, (wz - p.z) / T); }
  else {
    v = vbShotVel(p, wx, wz, spd);
    const netY = (vv) => { for (let t = 0.01; t < 2; t += 0.01) { const [l] = vmL(p.x + vv.x * t, p.z + vv.z * t); if (Math.sign(l) !== sd) return p.y + vv.y * t - 4.9 * t * t; } return 99; };
    // 過網：先往深處打（速度不變），還不夠才放慢一點；不會變成慢慢飄過去的球
    if (r > Lo + Lt + Ln || (netGuard && r >= Lo && r < Lo + Lt)) { let sp2 = spd; for (let i = 0; i < 12 && netY(v) < NETS[state.net].h + BALL_R + 0.08; i++) { if (i < 6 && Math.abs(tx) < 8.4) tx -= sd * 0.6; else sp2 *= 0.92; const w2 = vmW(tx, tz); v = vbShotVel(p, w2[0], w2[1], sp2); } }
  }
  b.mine = false; a.pose = 4; a.swingT = 0.35; aiPay(a, tip ? 'tip' : 'spike');
  vbLaunch(b, p, v, tip ? 'tip' : 'spike', 0.85);
  vmOnTouch(b, a.id, tip ? 'tip' : 'spike');
}
// 這顆球 AI 要不要放掉：會落在界外（照程度判斷，越強越準）而且是對面碰的；自己隊碰過的（傳壞、攔網碰出去）都去救
//   一隊一起決定（同一顆、同一次觸球只算一次），不會有人放有人追
function vmLetGo(team, b) {
  if (!b) return false;
  const B = vmBallL(b), gE = 9.8 - (b.acc ? b.acc.y : 0), d = B.vy * B.vy + 2 * gE * (B.y - BALL_R); if (d < 0) return false;
  const t = (B.vy + Math.sqrt(d)) / gE, lx = B.x + B.vx * t, lz = B.z + B.vz * t;   // 落地點（有上旋的下墜比較快）
  if (Math.sign(lx) !== vmSide(team)) return false;
  const key = VM.srvSeq * 1000 + VM.touch.n * 10 + (VM.touch.team + 1) + (VM.touch.blk ? 500 : 0);
  const C = VM.letGo || (VM.letGo = [{}, {}]);
  if (C[team].key !== key) { const ids = VM.team[team].filter((id) => VM.ai.has(id)), L = ids.length ? vmLv(VM.ai.get(ids[0])) : VM_LEVELS[2]; C[team] = { key, noise: rkGauss() * (L.judge ?? 0.3) * 0.5, v: false }; }
  const c = C[team], outBy = Math.max(Math.abs(lx) - 9, Math.abs(lz) - 4.5) - BALL_R + c.noise - (b.float ? 0.6 : 0);   // 飄球不好預測：靠近邊線的保守接
  c.v = outBy > 0 && VM.touch.team !== team;   // 對面打的／發球（含被對方攔網碰回來的）：放掉；自己隊碰過的（含自己攔網碰出去的 touch out）：去追救
  return c.v;
}
// 對面有沒有人在攻擊手前面攔網（AI 在攔、你或連線的人站在網前）：回傳那個人的位置（球場座標）
function vmBlockerFacing(a) {
  for (const id of VM.team[1 - a.team]) {
    const o = VM.ai.get(id), q = o ? { x: o.x, z: o.z } : vmPos(id); if (!q || Math.abs(q.x) > 1.5 || Math.abs(q.z - a.z) > 1.4) continue;
    if (o ? o.y > 0.05 : id === vmMe() ? !!(walk.air && walk.air.block) : ((NET.peers.get(id) || {}).y || 0) > 0.3) return q;   // 真的跳起來攔網才算
  }
  return null;
}
// 救球／推過去：高高的往對面深處
function vmAiFree(a, sd) { const g = vmPickGap(a, sd, 5.5, 8.2, 3.6); vmAiTouch(a, Math.abs(g.tx) * -sd, g.tz, BALL_R, 1.45, 0.8, 'bump', 3); }
