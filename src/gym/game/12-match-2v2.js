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
  VM_OPT.lv = vmLvChoices().includes(rules.lv) ? rules.lv : 3; VM_OPT.to = VM_OPT.to6 = [15, 20, 25].includes(rules.to) ? rules.to : 25; VM_OPT.sets = VM_OPT.sets2 = [1, 3, 5].includes(rules.bestOf) ? rules.bestOf : 1; }   // sets2：2 對 2 開房用的局數（沒開房的 2 對 2 只打一局）
const practiceRoom = new URLSearchParams(location.search).has('practice');
function vmIsPractice() { return practiceRoom; }
const vmLvChoices = () => (vmIsPractice() ? [1, 2, 3, 4, 5] : VM_ROOM_LV);
const VM_OPT = { to: 7, lv: 2, mate: 3, mode: '2', role: 'OH', sets: 3, to6: 25 };
try { Object.assign(VM_OPT, JSON.parse(localStorage.getItem('vb.vmopt') || '{}')); } catch (e) { /* ignore */ }
const vmLv = (a) => VM_LEVELS[VM_OPT.lv] || VM_LEVELS[2];   // AI 隊友和對手同一級
const vmPro = (a) => !!vmLv(a).pro;
const vmProLv = () => !!VM_LEVELS[VM_OPT.lv]?.pro;
// 企聯：專職舉球員（AI）離舉球點太遠，就由離球最近的 AI 來舉（每個位置都會舉）；真人是舉球員就照舊
function vmProSetter(...a) { return aiEngine().vmProSetter(...a); }   /* B3：AI 在 engine/ai.js */
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
  Object.assign(VM, { on: true, host: true, six: false, c, sg, to: VM_OPT.to, bestOf: VM_OPT.sets2 || 1, sets: [0, 0], setNo: 1, firstSrv: 0, sc: [0, 0], call: null, phase: 'idle', srvTeam: 0, srvIdx: [0, 0], ball: null, touch: { team: -1, n: 0, last: null }, poss: [null, null], t: 0, next: null, srvSeq: 0, names: {} });
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
      const a = VM.ai.get(id); if (a) { const sd = sg*(t===0?1:-1); a.x = sd*6; a.z = sd*(k===0?2.1:-2.1); }   /* 1 號位＝面向網子的左手邊（跟選位畫面、真人開場站位一樣；以前左隊的 AI 左右顛倒，會跑去站真人的位置） */
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
  vbTrailClear();
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
  vmClearBalls(); if (vmServer() !== vmMe()) vmDropHeld(); vbTrailClear(); VM.whT = performance.now() + 2500; VM.srvDl = VM.whT + 8000; VM.whDone = false; VM.cdN = null;   // 正式規則：裁判吹哨後才能發，8 秒內要發出去
  const srv = vmServer(), s = vmSide(VM.srvTeam);
  VM.serveAt = VM.t + 3.0 + gameRandom() * 1.6;   // AI：吹哨（2.5 秒）後 0.5～2 秒發
  // AI 先站位：發球的人在底線後，其他人在自己半場
  for (const a of VM.ai.values()) {
    const sd = vmSide(a.team); a.blk = null;
    if (VM.six) { const f = vm6Spot(a.team, a.id, 'serve'); a.tx = f.x; a.tz = f.z; if (Math.hypot(a.x - f.x, a.z - f.z) > 5) { a.x = f.x; a.z = f.z; } continue; }   // 6 對 6：發球隊照號位、接發球隊排接發球陣型
    if (a.id === srv) { a.tx = sd * 9.8; a.tz = -sd * 1.0; }
    else if (a.team === VM.srvTeam) { a.tx = sd * 1.5; a.tz = 0; }   // 發球員的隊友：站網前準備攔網（2 對 2 分工）
    else { const k = VM.team[a.team].indexOf(a.id); a.tx = sd * 6.2; a.tz = sd * (k === 0 ? 2.1 : -2.1); }   /* 面向網子的左右：兩隊都一樣 */
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
function vmAiServe(...a) { return aiEngine().vmAiServe(...a); }   /* B3：AI 在 engine/ai.js */
// ---- 觸球紀錄（只有開局的人判）
// 犯規提示文字（引擎只回代碼）
const FAULT_TEXT = {
  backBlock: n => `後排攔網犯規（${n}在後排）`,
  backAttack: n => `後排攻擊犯規（${n}在後排，要在 3 公尺線後起跳）`,
  serveBlock: n => `攔網發球犯規（${n}攔了發球）`,
  serveAttack: n => `攻擊發球犯規（${n}在前區把高過網的發球直接打回去）`,
  double: n => `連擊（${n} 連續碰兩次）`,
  four: () => '四次擊球（一隊最多碰三次）',
  held: n => `持球（${n}舉球時球在手上停太久）`,
  setDouble: n => `連擊（${n}舉球兩手沒同時碰到）`,
};
function vmOnTouch(b, id, kind) {
  if (b.langzi || kind === 'kick') return; /* WEB-022 裝飾球不計比賽事件。 */
  if (!VM.on || !VM.host) return;
  const team = vmTeamOf(id); if (team < 0 || kind === 'throw') return;
  // 只有比賽球算：發球階段只認輪到的人發出去的那一下；開打之後別顆球（有人手上本來拿著的、場外的）碰到、落地都不算
  if (!touchCounts(VM, id, kind, VM.phase === 'serve' ? vmServer() : null)) return;   /* B2：規則判定在 engine/rules.js */
  if (VM.wire) { VM.wire.dirty = true; if (VM.wire.event) VM.wire.event.actor = id; }
  vmPerfTouch(id, kind, b);   // WEB-010 戰績
  if (VM.phase === 'rally' && VM.ball && balls.includes(VM.ball) && b !== VM.ball) return;
  VM.ball = b; b.spike = null; b.floorHit = null; if (kind !== 'block') b.blkDone = false;
  // 引擎要的事實：後排與否、擊球點高過網沒、起跳點、球離中線多遠（位置都在遊戲這邊算）
  const fact = { team, id, kind, setFault: b.setFault || null };
  if (VM.phase === 'rally') {
    const attack = kind === 'spike' || kind === 'tip' || kind === 'hit';
    fact.aboveNet = attack && b.m.position.y > NETS[state.net].h + BALL_R;   /* 跟以前一樣：只有攻擊才需要看網高、球的位置 */
    if (fact.aboveNet) fact.ballX = vmL(b.m.position.x, b.m.position.z)[0];
    if (VM.six) {
      const k6 = vm6Idx(id); fact.back = vmSmallCount() ? !vm6Front(id) : k6 === 0 || k6 >= 4;
      if (fact.back && attack && fact.aboveNet) {
        const ai = VM.ai.get(id);
        const exact = ai ? ((ai.y > 0 || ai.vy > 0) && ai.jp ? [ai.jp.x, ai.jp.z] : vmW(ai.x, ai.z)) : id === vmMe() ? (walk.air && walk.air.x0 != null ? [walk.air.x0, walk.air.z0] : null) : b.jump0;   // 起跳點（自己的、或連線的人隨擊球訊息送來的）
        const q = exact ? { x: vmL(exact[0], exact[1])[0] } : VM.ai.has(id) ? null : vmPos(id);
        fact.jumpX = q ? q.x : null; fact.exactJump = !!exact;
      }
    }
  }
  const res = judgeTouch(VM, fact);
  if (res.serveStart) {   // 發球那一下：對方要接，自己這隊不能再碰
    VM.poss = [null, null];
    if (VM.six) { const ov = vm6Overlap(); if (ov) vmPoint(1 - ov.team, ov.why); }
    return;
  }
  if (res.ignored) return;
  if (res.setFaultUsed) b.setFault = null;
  if (res.fault) { vmPoint(1 - team, FAULT_TEXT[res.fault](vmName(id))); return; }
  const block = res.block;
  if (block) { VM.poss[team] = null; if (res.sameTeamBlock) return; }
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
function vmFixSetter(...a) { return aiEngine().vmFixSetter(...a); }   /* B3：AI 在 engine/ai.js */
// 得分精華（WEB-025）：有人打出得分時，下一球等這麼久再擺發球位置（之後 2.5 秒吹哨）。重播一般在 6.6～7.9 秒播完回到現場，
//   所以播完後約 2～3 秒就吹哨；重播太長還沒播完時（只剩落地後的畫面），擺發球位置會直接把它收掉。伺服器裁判也用同一個數字
const HL_GAP = 7.0;
function vmPoint(win, why) {
  if (VM.phase !== 'rally') return;
  const L = VM.hlLast; VM.hlLast = null;   // 得分精華：最後碰球的是得分這一隊＝他打出這一分；對手失誤送分＝null（不重播）
  const by = L && L.team === win ? L.id : null, byK = by ? L.kind : undefined;
  vmPerfPoint(win);   // WEB-010 戰績
  const r = scorePoint(VM, win);   /* B2：比分、發球權、局數、換場判定在 engine/rules.js */
  sfx('whistle', 1);
  if (r.sideOut) { if (VM.six) vm6Rotate(win); else VM.srvIdx[win]++; }   // 拿回發球權：6 對 6 要輪轉
  let fn = vmSetupServe;
  if (r.setWon) why += `・${vmTeamLabel(win)}拿下第 ${VM.setNo} 局（局數 ${VM.sets[0]}：${VM.sets[1]}）`;
  if (r.next === 'over') fn = () => vmOver();
  else if (r.next === 'nextSet') fn = VM.six ? vm6NextSet : vm2NextSet;
  else if (r.next === 'swap') fn = () => { vm6Swap(); vmSetupServe(); vmSay('決勝局 8 分換場', 'srv', 2200); };
  vmSay(vmPointMsg(win, why), VM.team[win].includes(vmMe()) ? 'gold' : 'warn', 3000);
  VM.next = { at: VM.t + (by ? HL_GAP : 3.2), fn };   // 有得分重播的球：等大家看完重播再發下一球
  vmBroadcast(true, null, { win, why, by, k: byK });   // by／k 跟著原本的得分訊息走，不多送訊息
  if (typeof hlOnPoint === 'function') hlOnPoint(win, why, by, byK);
}
// 2 對 2 多局：比分歸零，上一局先發球的另一隊先發（決勝局抽籤）；不換場（換場要把真人搬到另一邊，先不做）
function vm2NextSet() {
  VM.setNo++; VM.sc = [0, 0];
  const deciding = VM.sets[0] + VM.sets[1] === VM.bestOf - 1;
  VM.srvTeam = deciding ? (gameRandom() < 0.5 ? 0 : 1) : 1 - (VM.firstSrv || 0); VM.firstSrv = VM.srvTeam;
  vmSetupServe();
  vmSay(`第 ${VM.setNo} 局${deciding ? `（決勝局，先到 ${Math.min(15, VM.to)} 分）` : ''}`, 'srv', 2600);
}
// 有沒有局數（6 對 6 一定有；2 對 2 選了三戰兩勝、五戰三勝才有）
function vmMulti() { return !!VM.six || (VM.bestOf || 1) > 1; }
function vmTeamLabel(t) { const ids = VM.team[t] || [], hs = ids.filter((id) => !/^ai/.test(id)); return ids.includes(vmMe()) ? '你們' : !hs.length ? 'AI 隊' : hs.map(vmName).join('＋') + (hs.length < ids.length ? '＋AI' : ''); }
function vmPointMsg(win, why) { return `${why}・${vmTeamLabel(win)}得分　${VM.sc[0]}：${VM.sc[1]}`; }
function vmOver() {
  vmSendResult();   // WEB-010 戰績（開房比賽才送）
  if (ROOM) { if (ROOM.isHost) { toast(`比賽結束 ${VM.sc[0]}：${VM.sc[1]}，請重新準備`,4000); ROOM.end(); } return; }
  VM.phase = 'over'; vmBroadcast(true);
  const my = Math.max(0, vmTeamOf(vmMe())), A = vmMulti() ? VM.sets : VM.sc, won = A[my] > A[1 - my], m = $('rk-menu');
  m.innerHTML = `<div class="rk-box"><h3>${won ? '🏆 你們贏了！' : `${vmTeamLabel(A[0] > A[1] ? 0 : 1)}贏了`}</h3><p class="rk-final">${vmMulti() ? `局數 ${VM.sets[0]}：${VM.sets[1]}` : `${VM.sc[0]}：${VM.sc[1]}`}</p>${vmMulti() ? `<p class="rk-sub" style="text-align:center">最後一局 ${VM.sc[0]}：${VM.sc[1]}</p>` : ''}<div class="rk-btns">${VM.host ? '<button type="button" class="primary" data-vm="again">再一局</button>' : ''}<button type="button" data-vm="quit">離開比賽</button></div></div>`;
  m.hidden = false; unlockMouse();
  if (typeof hlPanelBtn === 'function') hlPanelBtn(m.querySelector('.rk-btns'), m);   // 得分精華下載
}
function vmJudge() {
  const b = VM.ball; if (!b || !balls.includes(b) || !b.floorHit) return;
  // 連線：落點附近有別的真人玩家時，先等 0.6 秒——他可能在自己的畫面上已經接到了，只是「接到球」的訊息還在路上（收到就取消這次落地）
  if (b.room && !NET.ownBall && !b.floorReport && performance.now() - b.floorT < 500) return;
  if (NET.on && !(b.room && !NET.ownBall) && performance.now() - (b.floorT || 0) < 600) {
    const near = [...VM.team[0], ...VM.team[1]].some((id) => { if (id === vmMe() || VM.ai.has(id)) return false; const q = NET.peers.get(id); return q && Math.hypot(q.x - b.floorHit[0], q.z - b.floorHit[1]) < 3.5; });
    if (near) return;
  }
  const [fx, fz] = vmL(b.floorHit[0], b.floorHit[1]), B = { x: fx, z: fz }, L = judgeLanding(B.x, B.z, VM.sg, VM.touch.team, BALL_R);   /* B2 */
  vmMark(b.floorHit[0], b.floorHit[1], L.inside);
  if (L.inside) vmPoint(L.winner, '落地得分');
  else { vmPoint(L.winner, 'OUT 出界'); vmOut(B); }
}
// 攔網碰到球：手的位置閃一圈白光、跳出 TOUCH（打手出界時特別標出來，裁判也是看這個判）
function vbTouchFx(pos, word) {
  const out = /出界/.test(word || ''), g = new THREE.Group(); g.position.copy(pos);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.17, 28), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })); ring.lookAt(camera.position.clone().sub(pos).add(pos)); g.add(ring);
  const sp = labelSprite(out ? 'TOUCH・出界' : 'TOUCH', out ? '#E5484D' : '#FFFFFF', 0.65); sp.position.y = 0.45; g.add(sp); scene.add(g);
  vbBurst(pos, '#FFFFFF', 10, 1.2);
  const t0 = performance.now(); (function anim() { const k = (performance.now() - t0) / 900; if (k >= 1 || !g.parent) { scene.remove(g); return; } ring.scale.setScalar(1 + k * 2.2); ring.material.opacity = 0.95 * (1 - k); sp.position.y = 0.45 + k * 0.35; requestAnimationFrame(anim); })();
}
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
  if (type === 'stuff' && pos.distanceTo(camera.position) < 10) vbShake(0.32, 0.11);
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
function vmPossession(...a) { return aiEngine().vmPossession(...a); }   /* B3：AI 在 engine/ai.js */
function vmAiStep(...a) { return aiEngine().vmAiStep(...a); }   /* B3：AI 在 engine/ai.js */
// 對面的攻擊手（你、真人隊友或 AI）：位置、是不是已經起跳
function vmThreat(...a) { return aiEngine().vmThreat(...a); }   /* B3：AI 在 engine/ai.js */
function vmAiBlock(...a) { return aiEngine().vmAiBlock(...a); }   /* B3：AI 在 engine/ai.js */
// 攔網的結果（你攔、AI 攔都用這一套）：off＝球離雙手中心多遠（左右，以 0.75 m 的手寬算）、low＝球在手裡多深（0＝擦過指尖，1＝很低很釘）、pow＝扣球力道、skill＝攔網程度
//   正中又低＝容易攔死；打外側那隻手＝越用力越容易打手出界；擦過指尖＝彈大（彈高往攔網這邊後場飛，常常出界）；力道大＝可能打穿；其他＝撐起來
function vbBlockOutcome(off, low, pow, skill) {
  const centered = off < 0.4, edge = off > 0.42;
  if (low < 0.18 && gameRandom() < 0.45 + 0.35 * pow) return 'top';
  const pStuff = skill * 0.6 * (centered ? 1 : 0.35) * (1 - 0.55 * pow) * (0.5 + 1.0 * low), pOut = (edge ? 0.1 + 0.6 * pow : 0.05) * (1.3 - 0.7 * low), pThrough = 0.32 * pow * (1.2 - skill), r = gameRandom();
  return r < pStuff ? 'stuff' : r < pStuff + pOut ? 'out' : r < pStuff + pOut + pThrough ? 'through' : 'soft';
}
// 照結果改球：plane＝攔網那一側的網面（球場座標 lx）、sd＝攔網那一隊在哪一側、hz＝雙手中心（lz）、e＝沿著網子的方向、n＝網子的法線；回傳那一下叫什麼
// 碰手後球還剩多少力道（使用者 2026-11-04：touch out 彈太遠救不到 → 縮小；扣得越大力（pow 越大）保留越多，大力或打點好還是常救不到，但偶爾救得到）
const TOUCH_OUT = { outKeep: 0.09, outKeepPow: 0.08, outPast: [0.15, 0.7], outLatMax: [2.6, 1.2], topKeep: 0.14, topKeepPow: 0.14, topVy: [2.0, 1.4], powVy: 1.6 };   // powVy：扣得越大力，碰手後彈得越高（比較有時間跑去救）   // 2026-11-04 第二次調小
function vbBlockApply(b, kind, lx, lz, hz, plane, sd, ex, ez, nx, nz, pow) {
  const p = b.m.position, vl = b.v.x * nx + b.v.z * nz;
  if (kind === 'stuff') { b.v.x -= 1.5 * vl * nx; b.v.z -= 1.5 * vl * nz; b.v.multiplyScalar(0.55); b.v.y = -Math.abs(b.v.y) * 0.3 - 2; const back = plane - sd * (BALL_R + 0.03) - lx; p.x += nx * back; p.z += nz * back; return '被攔死了！'; }
  if (kind === 'out') {   // 打手出界：球擦到外側那隻手，力道被吃掉大半，往旁邊輕輕彈起、偏出邊線外 0.6～1.8 m
    const side = Math.sign(lz - hz) || (gameRandom() < 0.5 ? 1 : -1);
    b.v.multiplyScalar(TOUCH_OUT.outKeep + TOUCH_OUT.outKeepPow * pow);
    const vy = 1.2 + gameRandom() * 1.6 + TOUCH_OUT.powVy * pow, t = (vy + Math.sqrt(vy * vy + 19.6 * Math.max(0.1, p.y - BALL_R))) / 9.8;
    const vlat = clamp((4.5 + BALL_R + TOUCH_OUT.outPast[0] + gameRandom() * (TOUCH_OUT.outPast[1] - TOUCH_OUT.outPast[0]) * (0.5 + pow) - side * lz) / t, 1.0, TOUCH_OUT.outLatMax[0] + TOUCH_OUT.outLatMax[1] * pow);
    b.v.x += ex * side * vlat; b.v.z += ez * side * vlat; b.v.y = vy;
    const lz2 = lz + (b.v.x * ex + b.v.z * ez) * t, lx2 = lx + (b.v.x * nx + b.v.z * nz) * t;
    return Math.abs(lz2) > 4.5 + BALL_R || Math.abs(lx2) > 9 + BALL_R ? '打手出界！' : '碰手了！';
  }
  if (kind === 'top') { b.v.multiplyScalar(TOUCH_OUT.topKeep + TOUCH_OUT.topKeepPow * pow); b.v.y = TOUCH_OUT.topVy[0] + gameRandom() * TOUCH_OUT.topVy[1] + TOUCH_OUT.powVy * pow; return '擦手彈大！'; }   // 擦過指尖：彈高，繼續往攔網這邊的後場飛
  if (kind === 'through') { b.v.multiplyScalar(0.82); b.v.y -= 0.8; return '打穿攔網！'; }
  b.v.multiplyScalar(0.25); b.v.y = 3 + gameRandom() * 1.5; return '撐起來了';
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
    vbImpact(b, 'block', (kind === 'stuff' ? 1 : kind === 'through' ? 0.3 : 0.7)); netFxHit(VM.c, lz, sd, 0.4, true); vbBlockFx(p.clone(), word === '碰手了！' ? 'touch' : BLK_FX[kind]);
    vmOnTouch(b, a.id, 'block');
    if (NET.on) netBallHit(b, 'block', (kind === 'stuff' ? 1 : kind === 'through' ? 0.3 : 0.7));
    const mine = a.team !== 0; vmSay(word, kind === 'soft' ? '' : (mine ? kind !== 'stuff' : kind === 'stuff') ? 'gold' : 'warn', 1400);
    recHit({ x: p.x, y: p.y, z: p.z, v: b.v.length(), kind: 'block' });
    return;
  }
}
function vmAiRole(...a) { return aiEngine().vmAiRole(...a); }   /* B3：AI 在 engine/ai.js */
// AI 碰球：照目標（球場座標）算出初速；err＝落點誤差（公尺）
function vmAiOwnSide(...a) { return aiEngine().vmAiOwnSide(...a); }   /* B3：AI 在 engine/ai.js */
// AI 的體力（跟玩家同一套扣法）：累了跳得矮、跑得慢、扣得慢；連線時跟著狀態送給大家（隊友腳下的圓環）
function aiEff(...a) { return aiEngine().aiEff(...a); }   /* B3：AI 在 engine/ai.js */
function aiPay(...a) { return aiEngine().aiPay(...a); }   /* B3：AI 在 engine/ai.js */
function aiJump(...a) { return aiEngine().aiJump(...a); }   /* B3：AI 在 engine/ai.js */
function vmAiTouch(...a) { return aiEngine().vmAiTouch(...a); }   /* B3：AI 在 engine/ai.js */
// 對面的人在哪裡（球場座標）
function vmOppPos(team) { return VM.team[1 - team].map((id) => vmPos(id)).filter(Boolean); }
// 找空檔：在 x 範圍內抽幾個落點，挑離對面最近的人最遠的；程度越高挑得越準
function vmPickGap(...a) { return aiEngine().vmPickGap(...a); }   /* B3：AI 在 engine/ai.js */
function vmAiSpike(...a) { return aiEngine().vmAiSpike(...a); }   /* B3：AI 在 engine/ai.js */
// 這顆球 AI 要不要放掉：會落在界外（照程度判斷，越強越準）而且是對面碰的；自己隊碰過的（傳壞、攔網碰出去）都去救
//   一隊一起決定（同一顆、同一次觸球只算一次），不會有人放有人追
function vmLetGo(...a) { return aiEngine().vmLetGo(...a); }   /* B3：AI 在 engine/ai.js */
// 對面有沒有人在攻擊手前面攔網（AI 在攔、你或連線的人站在網前）：回傳那個人的位置（球場座標）
function vmBlockerFacing(...a) { return aiEngine().vmBlockerFacing(...a); }   /* B3：AI 在 engine/ai.js */
// 救球／推過去：高高的往對面深處
function vmAiFree(...a) { return aiEngine().vmAiFree(...a); }   /* B3：AI 在 engine/ai.js */
