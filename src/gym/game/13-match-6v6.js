// ---------------------------------------------------------------- 6 對 6 室內排球
// 開局選位置：舉球、舉對、兩個主攻、兩個中間手（真人照選的坐進去，其他 AI 補）；照輪轉表輪轉，規則照正式比賽：
//   每局 25 分（決勝局 15 分）、要贏 2 分、三局兩勝／五局三勝、每局換場、決勝局 8 分換場；拿回發球權的那一隊順時針輪轉，1 號位發球
//   完整越位規則（前後＋左右，見 vm6Overlap）；後排不能攔網；後排在 3 公尺線前起跳攻擊（球在網子上緣以上）犯規
// VM.rot[隊][k]＝(k+1) 號位的人；k＝1、2、3 是前排（2、3、4 號位）
const V6_ROLES = ['S', 'OH', 'MB', 'OPP', 'OH', 'MB'];   // 開局站位（1～6 號位）：舉球和舉對對角、兩個主攻對角、兩個中間手對角
const V6_NAME = { S: '舉球', OPP: '舉對', OH: '大砲', MB: '中間手' }, V6_TAG = { S: 'S', OPP: 'OP', OH: 'OH', MB: 'M' };   // V6_TAG＝名條、輪轉表上的簡稱
const V6_COLORS = [['#30A46C', '#12A594', '#46A758', '#29A383', '#3D9A50', '#5BB98B'], ['#E5484D', '#F76B15', '#D6409F', '#E54666', '#C2410C', '#DC3E42']];
const V6_BASE = [[6.8, -3], [2.2, -3], [2.2, 0], [2.2, 3], [6.8, 3], [7.4, 0]];   // 各號位的基本站位：[離網, 往左]（從自己面向網子看）
const vm6Idx = (id) => { for (const t of [0, 1]) { const k = VM.rot && VM.rot[t] ? VM.rot[t].indexOf(id) : -1; if (k >= 0) return k; } return -1; };
const vm6Front = (id) => { const k = vm6Idx(id); return vmSmallCount() ? (vmSmallCount() === 1 || !!CourtFormations.get(vmSmallCount())[k]?.front) : k >= 1 && k <= 3; };
const vm6P = (team, d, L) => { const sd = vmSide(team); return { x: sd * d, z: sd * L }; };
// 開局選單
function vm6Menu(c, sg) {
  const peers = NET.on ? [...NET.peers.values()] : [], keep = VM.menu && VM.menu.c === c && VM.menu.asg ? VM.menu.asg : null, asg = {};
  for (const p2 of peers) {   // 朋友預設：站你這半場＝我方、對面半場＝對方；角色預設主攻
    const [lx] = toLocalOf(c, p2.x, p2.z); asg[p2.id] = keep && keep[p2.id] ? keep[p2.id] : { team: Math.sign(lx) === sg ? 0 : Math.abs(lx) < 12 ? 1 : -1, role: 'OH' };
  }
  VM.menu = { c, sg, asg, mate: null, opps: [] };
  const roleBtns = (cur, attr) => ['S', 'OPP', 'OH', 'MB'].map((r) => `<button type="button" ${attr(r)} aria-pressed="${cur === r}">${V6_NAME[r]}</button>`).join('');
  const m = $('rk-menu');
  m.innerHTML = `<div class="rk-box"><h3>🏐 6 對 6 室內排球</h3>
    <div class="rk-seg"><button type="button" data-vmmode="2">2 對 2 沙排</button><button type="button" data-vmmode="6" aria-pressed="true">6 對 6 室內</button></div>
    <p class="rk-sub">你的位置（每隊：1 舉球、1 舉對、2 主攻、2 中間手）</p><p class="rk-sub" style="font-size:12px;opacity:.85">位置能力｜舉球：舉球時按右鍵貼網吊到對面三米線中間｜大砲：蓄力條有紫色區，打到是超強重扣（發球沒有）｜中間手：跳起來滯空比較久｜舉對：幫忙舉球不太會連擊，蓄力條也有紫色區（力道比大砲小）</p><div class="rk-seg">${roleBtns(VM_OPT.role, (r) => `data-vmrole="${r}"`)}</div>
    ${peers.length ? `<p class="rk-sub">房間裡的朋友</p>${peers.map((p2) => `<div class="vm6-peer"><span>${esc(p2.n)}</span><div class="rk-seg">${[[0, '我方'], [1, '對方'], [-1, '不參加']].map(([v, l]) => `<button type="button" data-vmpt="${p2.id}|${v}" aria-pressed="${asg[p2.id].team === v}">${l}</button>`).join('')}</div>${asg[p2.id].team >= 0 ? `<div class="rk-seg">${roleBtns(asg[p2.id].role, (r) => `data-vmpr="${p2.id}|${r}"`)}</div>` : ''}</div>`).join('')}` : `<p class="rk-sub">要跟朋友打：先開「多人連線」進同一個房間，再按一次這個按鈕就能幫每個人選隊伍和位置</p>`}
    <p class="rk-sub">局數</p><div class="rk-seg">${[[1, '一局'], [3, '三戰兩勝'], [5, '五戰三勝']].map(([n, l]) => `<button type="button" data-vmsets="${n}" aria-pressed="${VM_OPT.sets === n}">${l}</button>`).join('')}</div>
    <p class="rk-sub">每局幾分（決勝局 15 分）</p><div class="rk-seg">${[15, 20, 25].map((n) => `<button type="button" data-vmto6="${n}" aria-pressed="${VM_OPT.to6 === n}">${n} 分</button>`).join('')}</div>
    <p class="rk-sub">AI 強度（隊友和對手一樣）</p><div class="rk-seg">${vmLvChoices().map((k) => `<button type="button" data-vmlv="${k}" aria-pressed="${VM_OPT.lv === k}">${VM_LEVELS[k].name}</button>`).join('')}</div>
    <p class="rk-sub">正式規則：要贏 2 分、每局換場、決勝局 8 分換場；拿回發球權順時針輪轉、1 號位發球；左上角是輪轉表（藍色＝前排）。完整越位規則：發球那一下，後排要站在對應前排的後面、同一排由右到左照號位（每球開始會自動把你放到站位）；後排不能攔網，後排攻擊要在 3 公尺線後起跳。</p>
    <p class="rk-sub">體力（畫面上的體力條；隊友腳下的圓環是隊友的體力）：每個動作耗多少、做自己專長少耗多少、回多快都可以在「⚙️ 體力設定」改。體力 30% 以下跳得比較矮、跑和扣都比較慢（AI 也一樣），但接、舉、吊永遠做得到——看隊友的體力決定誰接、舉給誰。</p>
    <div class="rk-btns"><button type="button" class="primary" data-vm="go6">開始 6 對 6</button><button type="button" data-vm="sta">⚙️ 體力設定</button><button type="button" data-vm="close">取消</button></div>
    <p class="rk-sub" style="margin-top:10px">V 接球、Q 正面舉球／E 背面舉球＋左鍵出手（AI 舉球員要舉時按 1～5＝喊球：4 號位／快攻／2 號位／後排中間／老3（舉對在後排的右邊後排攻擊））、W 助跑＋空白鍵起跳、空中左鍵攻擊、右鍵吊球、R 攔網、拿著球按左鍵發球</p></div>`;
  m.hidden = false; unlockMouse();
}
function vm6Start(c, sg, asg = {}, seats = null) {
  globalThis.VBTutorial?.stop();
  const count = seats ? seats[0].length : 6;
  if (VM.npc || VB.npc) vbNpcToggle();
  vmStop(true);
  STA.v = 1; STA.lock = false;
  Object.assign(VM, { on: true, host: true, six: true, c, sg, sg0: sg, asg0: asg, to: VM_OPT.to6, bestOf: VM_OPT.sets, sets: [0, 0], setNo: 1, swap8: false, sc: [0, 0], call: null, phase: 'idle', srvIdx: [0, 0], ball: null, touch: { team: -1, n: 0, last: null }, poss: [null, null], t: 0, next: null, srvSeq: 0, names: {}, formC: {}, rotN: [1, 1] });
  // 每隊 6 個號位的角色固定（輪轉表）；真人坐進自己選的角色，重複的就往後排到空的位置，其他 AI 補
  const humans = seats ? [[],[]] : [[{ id: vmMe(), role: VM_OPT.role }], []], clash = [];
  for (const [id, q] of Object.entries(asg)) if (q && q.team >= 0 && NET.peers.has(id)) humans[q.team].push({ id, role: q.role });
  const used = new Set([myChar()]); VM.chars = {}; VM.role = {}; VM.rot = [[], []];
  for (const t of [0, 1]) {
    const slot = seats ? seats[t].slice() : Array(6).fill(null);
    for (const h of humans[t].slice(0, 6)) {
      let k = V6_ROLES.findIndex((r, i) => r === h.role && !slot[i]);
      if (k < 0) { k = slot.findIndex((x) => !x); clash.push(`${h.id === vmMe() ? '你' : (NET.peers.get(h.id) || {}).n || '球友'}→${V6_NAME[V6_ROLES[k]]}`); }
      slot[k] = h.id;
    }
    for (let k = 0; k < count; k++) {
      if (!slot[k]) { const id = `ai${t}${k}`, ch = vmPickChar(used); VM.chars[id] = ch; slot[k] = id; vmMkAi(id, t, count === 6 ? `AI・${V6_TAG[V6_ROLES[k]]}` : `AI・${k+1}`, V6_COLORS[t][k], ch); }
      if (count === 6) VM.role[slot[k]] = V6_ROLES[k];
    }
    VM.rot[t] = slot;
  }
  for (const t of [0, 1]) for (const id of VM.rot[t]) if (!VM.ai.has(id) && id !== vmMe()) VM.names[id] = (NET.peers.get(id) || {}).n || '球友';
  VM.team = VM.rot.map((r) => r.slice()); VM.rot0 = VM.rot.map((r) => r.slice());
  VM.tactics = count === 6 && ROOM?.snapshot.tactics === 'rotation' ? 'rotation' : 'roles';
  vm6SyncRotationRoles();
  VM.srvTeam = gameRandom() < 0.5 ? 0 : 1; VM.firstSrv = VM.srvTeam;   // 擲硬幣決定誰先發球
  for (const a of VM.ai.values()) { const f = vm6Spot(a.team, a.id, 'defense'); a.x = a.tx = f.x; a.z = a.tz = f.z; }
  VM.startData = { e: 'start', ts: VB.ts, c: c.id, sg, team: VM.team, names: { ...VM.names, [vmMe()]: NET.name }, chars: VM.chars, to: VM.to, cw: [c.x, c.z, c.rot], stacfg: STA_CFG, six: { rot: VM.rot, role: VM.role, bestOf: VM.bestOf, colors: Object.fromEntries([...VM.ai.values()].map((a) => [a.id, a.color])) } };
  mrecRoles();
  VM.startData.six.tactics = VM.tactics;
  if (NET.on && globalThis.VBMatchSync) vmWireInit(true);
  if (NET.on) NET.tx.publish('vm', VM.startData);
  $('rk-menu').hidden = true; $('vm-hud').hidden = false; $('walk-ui').classList.add('vm'); peerTagsAll();
  vmSetupServe();
  if (count !== 6) { toast(`${count} 對 ${count} 開始${roomSpectator() ? ' · 你是觀眾' : ' · '+vmSmallLabel(vmMe())}`,3600); return; }
  toast(roomSpectator() ? '6 對 6 開始 · 你是觀眾' : `6 對 6 開始！${VM.bestOf > 1 ? (VM.bestOf === 3 ? '三戰兩勝・' : '五戰三勝・') : ''}每局 ${VM.to} 分・你是${V6_NAME[VM.role[vmMe()]]}（${vm6Idx(vmMe()) + 1} 號位，${vm6Front(vmMe()) ? '前排' : '後排'}）${clash.length ? '・位置重複，改成：' + clash.join('、') : ''}`, 3600);
}
// 輪轉：2 號位的人轉到 1 號位發球，其他人順時針跟著轉
function vm6Rotate(t) {
  if (vmSmallCount()) { VM.rot[t] = CourtFormations.rotate(VM.rot[t]); VM.rotN[t] = VM.rotN[t] % vmSmallCount() + 1; VM.formC = {}; if (VM.rot[t].includes(vmMe())) vm6RotToast(); return; } // WEB003B

  const meK = vm6Idx(vmMe()), mine = VM.rot[t].includes(vmMe());
  VM.rot[t] = VM.rot[t].slice(1).concat(VM.rot[t][0]); VM.rotN[t] = (VM.rotN[t] % 6) + 1; VM.formC = {};
  vm6SyncRotationRoles();
  if (mine && meK >= 0) vm6RotToast();
}
function vm6RotToast() {
  if (vmSmallCount()) { toast(`輪轉：${vmSmallLabel(vmMe())}`,2200); return; } // WEB003B
 const k = vm6Idx(vmMe()); if (k >= 0) toast(`輪轉：你到 ${k + 1} 號位（${k >= 1 && k <= 3 ? '前排' : '後排'}）`, 2200); }
// 新的一局：比分歸零、換場、照開局的輪轉表；上一局先接發球的那隊先發（決勝局重新擲硬幣）
function vm6NextSet() {
  VM.setNo++; VM.sc = [0, 0]; VM.swap8 = false;
  VM.rot = VM.rot0.map((r) => r.slice()); VM.rotN = [1, 1]; VM.formC = {};
  vm6SyncRotationRoles();
  const deciding = VM.bestOf > 1 && VM.sets[0] + VM.sets[1] === VM.bestOf - 1;
  VM.srvTeam = deciding ? (gameRandom() < 0.5 ? 0 : 1) : 1 - VM.firstSrv; VM.firstSrv = VM.srvTeam;
  vm6Swap(); vmSetupServe();
  vmSay(`第 ${VM.setNo} 局${deciding ? '（決勝局，先到 15 分）' : ''}・換場`, 'srv', 2600);
}
function vm6Swap() { VM.sg = -VM.sg; for (const a of VM.ai.values()) { a.x = -a.x; a.tx = -a.tx; a.vx = -a.vx; } VM.formC = {}; }
// 站位（球場座標）：serve＝發球前（發球隊照號位、接發球隊排陣型）、defense＝球在對面、cover＝對面要攻擊時前排沒攔網的人退後接吊球、attack＝我們在組織進攻
function vm6Spot(...a) { return aiEngine().vm6Spot(...a); }   /* B3：AI 在 engine/ai.js */
// 接發球陣型：前排中間手、舉對、舉球員在網前（不接）；其他人（約 3～4 個）左右排開接；後排舉球員躲在對應前排的後面，發球一出手就跑去舉球點
function vm6RecvForm(...a) { return aiEngine().vm6RecvForm(...a); }   /* B3：AI 在 engine/ai.js */
// 每球開始：真人自動放到站位（發球的人另外放到底線）；連線的人收到 form 自己移過去
function vm6PlaceHumans(srv) {
  const spots = {};
  for (const t of [0, 1]) for (const id of VM.rot[t]) { if (VM.ai.has(id) || id === srv) continue; const f = vm6Spot(t, id, 'serve'); spots[id] = [+f.x.toFixed(2), +f.z.toFixed(2)]; }
  vm6GoSpot(spots[vmMe()]);
  if (NET.on) NET.tx.publish('vm', { e: 'form', spots, seq: VM.srvSeq });
}
function vm6GoSpot(...a) { return aiEngine().vm6GoSpot(...a); }   /* B3：AI 在 engine/ai.js */
// 發球那一下的位置檢查（完整越位規則）：
//   前後：後排的人要比對應的前排離網遠（1↔2、6↔3、5↔4）
//   左右：同一排由右到左照號位——前排 2 在 3 的右邊、3 在 4 的右邊；後排 1 在 6 的右邊、6 在 5 的右邊
//   發球的人（1 號位）在底線外，不算；兩個都是 AI 就不用查（AI 一定站對）
function vm6Overlap() {
  if (vmSmallCount()) return vmSmallOverlap(); // WEB003B
  if (VM.tactics === 'rotation') return null;

  for (const t of [1 - VM.srvTeam]) {   // 發球方整隊不判越位，只判接發球那一隊
    const rot = VM.rot[t], sd = vmSide(t), at = (id) => { const a = VM.ai.get(id); if (a) return { d: Math.abs(a.tx), L: a.tz / sd }; const q = vmPos(id); return q ? { d: Math.abs(q.x), L: q.z / sd } : null; };
    const skip = (k) => t === VM.srvTeam && k === 0, both = (i, j) => VM.ai.has(rot[i]) && VM.ai.has(rot[j]);
    for (const [b, f] of [[0, 1], [5, 2], [4, 3]]) {
      if (both(b, f) || skip(b)) continue;
      const B = at(rot[b]), F = at(rot[f]); if (!B || !F) continue;
      if (B.d < F.d - 0.15) return { team: t, why: `位置錯誤（前後越位：${vmName(rot[b])}在 ${b + 1} 號位，要站在 ${f + 1} 號位${vmName(rot[f])}的後面）` };
    }
    for (const [r, l] of [[1, 2], [2, 3], [0, 5], [5, 4]]) {   // [右邊的號位, 左邊的號位]（索引）
      if (both(r, l) || skip(r) || skip(l)) continue;
      const R = at(rot[r]), Lf = at(rot[l]); if (!R || !Lf) continue;
      if (R.L > Lf.L + 0.15) return { team: t, why: `位置錯誤（左右越位：${vmName(rot[r])}在 ${r + 1} 號位，要站在 ${l + 1} 號位${vmName(rot[l])}的右邊）` };
    }
  }
  return null;
}
// 誰接第一球：離落點近的人（舉球員、前排的中間手和舉對盡量不接；正在攔網的人不接）
function vm6Possession(...a) { return aiEngine().vm6Possession(...a); }   /* B3：AI 在 engine/ai.js */
function vm6SetterFor(...a) { return aiEngine().vm6SetterFor(...a); }   /* B3：AI 在 engine/ai.js */
// 舉出去的球：照它經過 2.8 m 高的地方找攻擊手（後排只有球在 3 公尺線後才能打）；真人優先（AI 不搶真人的球）
function vm6AttackerFor(...a) { return aiEngine().vm6AttackerFor(...a); }   /* B3：AI 在 engine/ai.js */
// 舉到哪個號位就是誰打：1＝前排大砲、2／6（快攻、高 3）＝前排攔中、3＝前排舉對（不在前排就前排右邊的人）、4＝後排大砲、5＝後排舉對；找不到才照離球近的
function vm6AttackerByCall(...a) { return aiEngine().vm6AttackerByCall(...a); }   /* B3：AI 在 engine/ai.js */
// AI 舉球員要舉給誰：前排主攻（4 號位）、前排中間手（快攻，傳得到位才打）、前排舉對（2 號位）、後排主攻（後排攻擊）；隊上真人喊球照喊的，沒喊也常常舉給他
function vm6ChooseSet(...a) { return aiEngine().vm6ChooseSet(...a); }   /* B3：AI 在 engine/ai.js */
// 攔網：只有前排；中間手跟著攻擊手移動，兩邊的人攔自己那一側（最多三人攔網）
function vm6BlockPick(...a) { return aiEngine().vm6BlockPick(...a); }   /* B3：AI 在 engine/ai.js */
// 離球最近、上一球不是他碰的 AI（舉壞了要有人救）
function vm6Nearest(...a) { return aiEngine().vm6Nearest(...a); }   /* B3：AI 在 engine/ai.js */
// AI 每一格：攔網 → 球在對面就守位置 → 球過來了：輪到自己接／舉／打才去碰，其他人照情況站位
function vm6Brain(...a) { return aiEngine().vm6Brain(...a); }   /* B3：AI 在 engine/ai.js */
// 對面要攻擊、前排沒上去攔網的人：中間手留在中間準備；兩邊的人（攻擊方向的斜對角）退到自己那一邊的 3 公尺線，接吊球和小斜線
function vm6OffBlock(...a) { return aiEngine().vm6OffBlock(...a); }   /* B3：AI 在 engine/ai.js */
// 前排攔中（真人或 AI）現在是不是已經跳在空中（舉球員看到就提早出手舉快攻）
function vm6AirMB(...a) { return aiEngine().vm6AirMB(...a); }   /* B3：AI 在 engine/ai.js */
// 快攻（AI 舉球員要舉時）：這一球要不要打快攻先決定好；要打就照傳過來的球倒推——先在舉球員左前方後面等，
//   球快到舉球員手上時衝兩步，在舉球員碰到球前一下起跳（舉球那一刻已經在空中），舉球員再把球又低又快地送到手上
function vm6Quick(...a) { return aiEngine().vm6Quick(...a); }   /* B3：AI 在 engine/ai.js */
// cover：照攻擊手的位置排出 5 個區域——兩側近身各一（左右，不站助跑走廊）、往場中間的斜後方中段一個、後場兩角各一；
//   每個人分到離自己最近、還沒人去的那一區（不會全部擠到前面擋住攻擊手）；後排攻擊時近身的兩個站在 3 公尺線前、攻擊手左右兩側
function vm6CoverPlan(...a) { return aiEngine().vm6CoverPlan(...a); }   /* B3：AI 在 engine/ai.js */
function vm6CoverSpot(...a) { return aiEngine().vm6CoverSpot(...a); }   /* B3：AI 在 engine/ai.js */
// 連線的人：收到主機的輪轉表、局數
function vm6Apply(d) {
  const before = vm6Idx(vmMe());
  VM.rot = d.rot; VM.sets = d.sets; VM.setNo = d.setNo; VM.rotN = d.rn || VM.rotN;
  if (d.tactics) VM.tactics = d.tactics;
  vm6SyncRotationRoles();
  const now = vm6Idx(vmMe()); if (before >= 0 && now !== before) vm6RotToast();
}
// 輪轉表（左上角）：我方、對方各一張；上面是網子，前排（藍）4 3 2、後排 5 6 1；金框＝你、🏐＝發球的人
function vm6Chart() {
  if (vmSmallCount()) { vmSmallChart(); return; } // WEB003B

  const el = $('vm-rot'); if (!VM.six || !VM.rot) { if (!el.hidden) el.hidden = true; return; }
  const srv = VM.host ? (VM.phase === 'serve' || VM.phase === 'rally' ? vmServer() : null) : VM.srvId, my = Math.max(0, vmTeamOf(vmMe()));
  const key = JSON.stringify([VM.rot, srv, my, VM.rotN]); if (el.dataset.k === key) return; el.dataset.k = key; el.hidden = false;
  const nm = (id) => id === vmMe() ? '你' : VM.ai.has(id) ? 'AI' : vmName(id);
  const cell = (t, k) => { const id = VM.rot[t][k], r = VM.role[id]; return `<i class="${k >= 1 && k <= 3 ? 'fr' : ''}${id === vmMe() ? ' me' : ''}${id === srv ? ' sv' : ''}" title="${esc(vmName(id))}・${V6_NAME[r]}"><u>${k + 1}</u><em>${V6_TAG[r]}・${esc(nm(id).slice(0, 6))}</em></i>`; };
  const team = (t) => `<div class="rt"><b>${t === my ? '我方' : '對方'}・第 ${(VM.rotN || [1, 1])[t]} 輪</b><span class="net"></span>${[3, 2, 1].map((k) => cell(t, k)).join('')}${[4, 5, 0].map((k) => cell(t, k)).join('')}</div>`;
  el.innerHTML = team(my) + team(1 - my);
}
// ---- 每一格
function vmUpdate(dt) {
  if (!VM.on) return;
  VM.t += dt;
  if (VM.host) {
    if (!state.items.some((i) => i.id === VM.c.id)) { vmStop(); toast('球場被改掉了，比賽結束'); return; }
    if (VM.next && VM.t >= VM.next.at) { const f = VM.next.fn; VM.next = null; f(); }
    if (VM.phase === 'serve') vmServeClock();
    if (VM.phase === 'rally') vmJudgePenetration();
    if (VM.phase === 'rally') vmJudge();
    if (VM.ball) for (const q of balls.slice()) if (q !== VM.ball && !q.room) { ballsGroup.remove(q.m); balls.splice(balls.indexOf(q), 1); }
    for (const a of VM.ai.values()) vmAiStep(a, dt);
  }
  vmRenderAi(dt);
  vbWallFx();
}
// WEB-015: receiver-only snapshot timeline.
function vmAiSnapshot(a, row, now) {
  const [id, x, z, y, pose, sta, bs, jp, stamp] = row;
  const buf = a.netBuf || (a.netBuf = []), last = buf[buf.length - 1];
  if (last && stamp != null && last.stamp != null && stamp <= last.stamp) return;
  if (last) a.netGap = (a.netGap || 150) * 0.85 + Math.min(500, now - last.arrival) * 0.15;
  if (a.netOffset == null && stamp != null) a.netOffset = now - stamp * 1000;
  const t = stamp == null ? now : stamp * 1000 + a.netOffset;
  buf.push({ t, arrival: now, stamp, x, z, y, pose, sta, bs });
  while (buf.length > 2 && buf[1].t < t - 1000) buf.shift();
  a.netY = y; a.wx = x; a.wz = z;
  if (jp && jp.s > (a.jpS || 0)) {
    a.jpS = jp.s; a.netLanded = false;
    const age = Math.max(0, (stamp ?? jp.t) - jp.t) + netLat(VM.hostId);
    a.netJump = { ...jp, age };
  }
}
function vmAiJumpHeight(j, t) {
  const top = j.vy / j.g;
  return Math.max(0, t <= top ? j.vy * t - 0.5 * j.g * t * t : j.vy * j.vy / (2 * j.g) - 0.5 * j.g * j.down * (t - top) ** 2);
}
function vmAiPlayback(a, dt, now, ox, oz) {
  const buf = a.netBuf;
  if (!buf?.length) return [ox, oz];
  if (VM.watchFrames) {
    const time = now - VM.watchOffset - 225;
    let left = buf[0], right = left;
    for (const row of buf) { if (row.stamp * 1000 <= time) left = row; right = row; if (row.stamp * 1000 >= time) break; }
    const fraction = right.stamp > left.stamp ? clamp((time / 1000 - left.stamp) / (right.stamp - left.stamp), 0, 1) : 0;
    a.y = left.y + (right.y - left.y) * fraction;
    if (a.poseC !== left.pose) { a.poseC = left.pose; a.poseT = 0; }
    a.poseT = (a.poseT || 0) + dt; a.pose = left.pose; a.bs = left.bs || 0; a.sta = left.sta;
    return [left.x + (right.x - left.x) * fraction, left.z + (right.z - left.z) * fraction];
  }
  const delay = VM.wire ? 0 : clamp(1.5 * (a.netGap || 150), 120, 300);
  a.netDelay = (a.netDelay ?? delay) + (delay - (a.netDelay ?? delay)) * (1 - Math.exp(-dt * 2));
  const time = Math.max(a.netTime ?? -Infinity, now - a.netDelay); a.netTime = time;
  let l = buf[0], r = l;
  for (const q of buf) { if (q.t <= time) l = q; r = q; if (q.t >= time) break; }
  let x = l.x, z = l.z, y = l.y;
  if (r.t > l.t) { const f = clamp((time - l.t) / (r.t - l.t), 0, 1); x += (r.x - x) * f; z += (r.z - z) * f; y += (r.y - y) * f; }
  else if (time > l.t && buf.length > 1) {
    const prev = buf[buf.length - 2], span = Math.max(0.05, (l.t - prev.t) / 1000), age = clamp((time - l.t) / 1000, 0, 0.2);
    x += clamp((l.x - prev.x) / span, -8, 8) * age; z += clamp((l.z - prev.z) / span, -8, 8) * age;
  }
  if (a.netJump && a.netJump.x != null) { x = a.netJump.x; z = a.netJump.z; }   // 起跳中：跳的弧線照現在時間播，人也直接靠到起跳點（不然會在助跑途中先跳）
  const err = Math.hypot(x - ox, z - oz), k = err > 3 ? 1 : Math.min(1 - Math.exp(-dt * 18), 8 * dt / Math.max(err, 0.001));
  x = ox + (x - ox) * k; z = oz + (z - oz) * k;
  const lp = buf[buf.length - 1];   // 動作用最新一筆：跟球（照現在時間）對得上，不會球飛走了才揮手
  if (a.poseC !== lp.pose) { a.poseC = lp.pose; a.poseT = 0; }
  a.poseT = (a.poseT || 0) + dt; a.pose = lp.pose; a.bs = lp.bs || 0; if (lp.sta != null) a.sta = lp.sta;
  if (a.netJump) { const j = a.netJump; j.age += dt; y = vmAiJumpHeight(j, j.age); if (j.age > j.vy / j.g && y === 0) { a.netJump = null; a.netLanded = true; a.netGroundAt = j.t + j.vy / j.g * (1 + 1 / Math.sqrt(j.down)); } }
  else if (a.netLanded) y = buf[buf.length - 1].stamp < a.netGroundAt ? 0 : a.netY;
  a.y = y;
  return [x, z];
}
function vmRenderAi(dt) {
  const k = 1 - Math.exp(-dt * 12);
  for (const a of VM.ai.values()) {
    const av = a.av; let x, z;
    if (VM.host) [x, z] = vmW(a.x, a.z);
    else [x, z] = vmAiPlayback(a, dt, performance.now(), av.g.position.x, av.g.position.z);
    const sp = Math.hypot(x - av.g.position.x, z - av.g.position.z) / Math.max(dt, 1e-3);
    if (!VM.host) sqFromMotion(a, x, z, a.y, dt);   /* 加入者：AI 的腳步聲（主機在 vmAiStep 裡播） */
    av.g.position.set(x, 0, z); av.body.position.y += (a.y - av.body.position.y) * (VM.host ? 0.6 : 1);
    const sd = vmSide(a.team), [ax, az] = vmW(0, 0), [bx, bz] = vmW(sd, 0); let ry = Math.atan2(ax - bx, az - bz);
    const bb = VM.ball && balls.includes(VM.ball) ? VM.ball : balls.find((q) => q.room);
    if (bb) { const ddx = bb.m.position.x - x, ddz = bb.m.position.z - z, dd = Math.hypot(ddx, ddz), [blx] = vmL(bb.m.position.x, bb.m.position.z); if (dd > 0.3 && dd < 10 && Math.sign(blx) === sd) ry = Math.atan2(ddx, ddz); }
    if (a.faceW) ry = Math.atan2(a.faceW.x - x, a.faceW.z - z);   // 擊掌：面向圍起來的中間
    let dr = ry - av.g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); av.g.rotation.y += dr * Math.min(1, dt * 8);
    av.phase += dt * Math.min(12, sp * 5.5);
    // AI：碰球那一下照動作做（swingT 從 0.35～0.4 倒數＝動作進度）；攔網的人在網前雙手舉在肩前；球在場上時低重心準備
    if (VM.host && (a.y > 0 || ((VM.poss[a.team] || {}).attacker !== a.id && (VM.poss[a.team] || {}).qk !== a.id))) a.appr = false;
    const P2 = !VM.host ? a.pose : a.swingT > 0 || a.y > 0 ? a.pose : a.appr ? 13 : 0, pr2 = !VM.host ? a.poseT / 0.45 : P2 === 5 ? clamp(1 - (a.vy - 1.5) / 3, 0, 1) : 1 - clamp(a.swingT / (P2 === 4 ? 0.35 : 0.4), 0, 1);
    // AI：只有這一球輪到他接、球正往他那邊來才蹲
    const Pa = VM.poss[a.team], Bl = VM.ball && balls.includes(VM.ball) ? vmBallL(VM.ball) : null, expect = VM.phase === 'rally' && Pa && ((Pa.passer === a.id && Pa.stage === 0 && Bl && Math.sign(Bl.vx) === vmSide(a.team)) || (VM.six && Pa.stage === 2 && Pa.attacker && Pa.attacker !== a.id && Pa.setter !== a.id && VM.touch.team === a.team));   // 6 對 6：隊友攻擊時，cover 的人蹲低準備救球
    let pz = P2 ? avPoseOf(P2, pr2) : a.blk ? AVP.blockReady : expect ? AVP.ready : AVP.idle, kk = P2 === 4 ? 0.5 : k;
    if (P2 === 9 && a.bs) { const [ox, oz] = vmW(0, a.bs), [cx, cz] = vmW(0, 0), r = av.g.rotation.y; pz = avBlockPose((ox - cx) * -Math.cos(r) + (oz - cz) * Math.sin(r)); }   // 攔網雙手往左右移（換算成人物的右手邊）
    if (P2 === 4 && a.y <= 0.05 && a.swingT > 0.3) pz = avMix(AVP.serveToss, AVP.spikeHit, 0.6);
    av.fall = P2 >= 10 && P2 <= 12 ? { a: 1, d: DIVE_D[P2 - 10], t: VM.host ? 1.25 - a.swingT : a.poseT } : null;   // 撲救：整個人往撲的方向倒
    avDrive(av, pz, kk, sp, a.y > 0.05);
  }
  vmStaRings();
  vmHud();
}
// 隊友腳下的體力圓環：圈越滿體力越多；綠＝夠、黃＝一半以下、紅＝快沒了（只看得到自己隊的）
const STA_RING = new Map(), staArcGeo = new Map();
function staArc(n) { if (!staArcGeo.has(n)) staArcGeo.set(n, new THREE.RingGeometry(0.46, 0.64, 48, 1, Math.PI / 2, -(Math.PI * 2 * n) / 40)); return staArcGeo.get(n); }
function vmStaRings() {
  const my = VM.on && !RP.on ? vmTeamOf(vmMe()) : -1, seen = new Set();
  if (my >= 0 && VBSettings.values.rings) for (const id of VM.team[my]) {
    if (id === vmMe()) continue;
    const a = VM.ai.get(id), p2 = a ? null : NET.peers.get(id), g = a ? a.av.g : p2 && p2.av ? p2.av.g : null, v = a ? a.sta ?? 1 : p2 ? p2.sta : null;
    if (!g || v == null) continue;
    let r = STA_RING.get(id);
    if (!r) {
      r = new THREE.Group(); const M = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });   // 深度往前推：遠處也不會跟地板打架
      const bg = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.64, 48), M('#1B2638', 0.55)), fg = new THREE.Mesh(staArc(40), M('#30A46C', 0.95));
      bg.rotation.x = fg.rotation.x = -Math.PI / 2; fg.position.y = 0.003; bg.renderOrder = 20; fg.renderOrder = 21; r.add(bg, fg); r.fg = fg; r.n = -1; scene.add(r); STA_RING.set(id, r);   // 排在所有地板貼圖（球場線、標誌）之後才畫：不會被半透明的地板貼圖蓋掉
    }
    seen.add(id); r.visible = true; r.position.set(g.position.x, 0.07, g.position.z);   // 抬高一點：球場地板比地面高幾公分，不然會被蓋住
    const n = Math.round(clamp(v, 0, 1) * 40);
    if (n !== r.n) { r.n = n; r.fg.visible = n > 0; if (n > 0) r.fg.geometry = staArc(n); r.fg.material.color.set(v > 0.5 ? '#30A46C' : v > 0.3 ? '#F2B705' : '#E5484D'); }
  }
  for (const [id, r] of STA_RING) if (!seen.has(id)) r.visible = false;
}
// ---- 連線：主機回合中每 150 ms、等待時每 400 ms 帶上比分與 AI 快照。
function vmStatePayload() {
  const matchBall = VM.ball && balls.includes(VM.ball) ? VM.ball : balls.find(b => b.room);
  const watch = { t: VM.t, ball: matchBall ? matchBall.m.position.toArray() : null, rally: VM.srvSeq };
  const ai = [...VM.ai.values()].map((a) => { const [x, z] = vmW(a.x, a.z); return [a.id, +x.toFixed(2), +z.toFixed(2), +a.y.toFixed(2), a.swingT > 0 || a.y > 0 ? a.pose : a.appr ? 13 : 0, +(a.sta ?? 1).toFixed(2), a.bs ? +a.bs.toFixed(2) : 0, a.jp || null, VM.t]; });
  return { watch, lz: [VM.langziMatch, VM.srvSeq], sc: VM.sc, ph: VM.phase, srv: vmServer(), ai, sg: VM.sg, six: VM.six ? { rot: VM.rot, sets: VM.sets, setNo: VM.setNo, rn: VM.rotN, tactics: VM.tactics } : undefined, tc: VM.phase === 'rally' && VM.touch.team >= 0 && !VM.touch.serve ? [VM.touch.team, VM.touch.n] : undefined, setter: VM.poss?.map(p=>p?.setter||null), gr: VM.grade ? [VM.grade.s, VM.grade.team, VM.grade.g, VM.grade.why] : undefined };
}
function vmWatchSnapshot(frame) {
  if (!VM.watchFrames) {
    vmClearBalls();
    VM.watchFrames = [];
    VM.watchOffset = performance.now() - frame.t * 1000;
  }
  const frames = VM.watchFrames;
  if (frames.length && frame.t <= frames[frames.length - 1].t) return;
  frames.push(frame);
  while (frames.length > 2 && frames[1].t < frame.t - 2) frames.shift();
  if (!VM.watchBall || !balls.includes(VM.watchBall)) {
    const mesh = newBallMesh();
    const ball = { m: mesh, v: new THREE.Vector3(), rest: 0, room: true, watchOnly: true };
    mesh.userData.ball = ball; mesh.visible = false;
    ballsGroup.add(mesh); balls.push(ball); VM.watchBall = ball;
  }
}
function vmWatchBallFrame(ball) {
  const frames = VM.watchFrames;
  if (!frames?.length) { ball.m.visible = false; return; }
  const time = (performance.now() - VM.watchOffset - 225) / 1000;
  let left = frames[0], right = left;
  for (const frame of frames) { if (frame.t <= time) left = frame; right = frame; if (frame.t >= time) break; }
  ball.m.visible = !!left.ball;
  if (!left.ball) return;
  const fraction = right.ball && right.rally === left.rally && right.t > left.t ? clamp((time - left.t) / (right.t - left.t), 0, 1) : 0;
  ball.m.position.set(...left.ball);
  if (fraction) ball.m.position.lerp(new THREE.Vector3(...right.ball), fraction);
}
// 比賽有事（得分、換發球、結束）：下一格就跟著主機的狀態送出去
function vmBroadcast(force, msg, pt) {
  if (!NET.on || !VM.host) return;
  if (VM.wire && force) VM.wire.dirty = true;
  if (msg || pt) NET.vmPend = { msg: msg || undefined, pt: pt || undefined };
  if (force) NET.forceSt = true;
}
function vmOnNet(d, from) {
  if (d.e === 'result') { if (!ROOM || from === ROOM.host) vmGotResult(d); return; }   // WEB-010 戰績
  if (d.e === 'start' && (!ROOM || from === ROOM.host || from === 'srv')) mrecReset('');   // WEB-010 戰績：新比賽，自己的接球／舉球重新算
  if (ROOM && (d.e === 'start' || d.e === 'end') && from !== ROOM.host && from !== 'srv') return;   /* B5：伺服器（srv）開的比賽也收 */
  if (d.e === 'start') {
    if (VM.on) return;
    const c = state.items.find((i) => i.id === d.c) || (d.cw ? { id: d.c, type: 'vb', x: d.cw[0], z: d.cw[1], rot: d.cw[2] } : null); if (!c) return;
    vmStop(true);
    Object.assign(VM, { on: true, host: false, hostId: from, c, sg: d.sg, to: d.to, sc: [0, 0], phase: 'serve', team: d.team, names: d.names || {}, t: 0, chars: d.chars || {}, six: !!d.six, rot: d.six ? d.six.rot : null, role: d.six ? d.six.role : {}, bestOf: d.six ? d.six.bestOf : 1, sets: [0, 0], setNo: 1, rotN: [1, 1], stacfg: d.stacfg || null });
    if (d.wire === 2 && globalThis.VBMatchSync) vmWireInit(false, d);
    VM.tactics = d.six?.tactics === 'rotation' ? 'rotation' : 'roles';
    vm6SyncRotationRoles();
    // Ball speed is owned by room-settings, independent of the match simulation host.
    const colors = { aiT: '#30A46C', ai1: '#E5484D', ai2: '#F76B15', ...(d.six ? d.six.colors : {}) };
    for (const id of [...d.team[0], ...d.team[1]]) if (/^ai/.test(id)) { const a = vmMkAi(id, d.team[0].includes(id) ? 0 : 1, d.names[id] || id, colors[id] || '#E5484D', d.chars && d.chars[id]); a.wx = null; }
    $('vm-hud').hidden = false; $('walk-ui').classList.add('vm'); vmClearBalls(); vmDropHeld(); peerTagsAll();
    const mode = `${d.team[0].length} 對 ${d.team[0].length}`, host = (NET.peers.get(from) || {}).n || '房主';
    toast(d.team[0].includes(NET.me) ? `${host} 開了 ${mode}，你們一隊！${vmSmallCount() ? vmSmallLabel(NET.me) : d.six ? `你是${V6_NAME[VM.role[NET.me]]}` : ''}` : d.team[1].includes(NET.me) ? `${host} 開了 ${mode}，你在對面那一隊！${vmSmallCount() ? vmSmallLabel(NET.me) : d.six ? `你是${V6_NAME[VM.role[NET.me]]}` : ''}` : `旁邊開打 ${mode} 了（你在旁邊看）`, 3000);
    return;
  }
  if (VM.on && VM.host && d.e === 'srvMiss') {   // 加入的人跳發拋了沒打到
    if (VM.phase === 'serve' && from === vmServer()) { const team = vmTeamOf(from); VM.phase = 'rally'; VM.touch = { team, n: 3, last: from, serve: true }; vmPoint(1 - team, `發球失誤（${vmName(from)}拋了沒打到）`); }
    return;
  }
  if (!VM.on || VM.host || from !== VM.hostId) return;
  if (d.e === 'st') VM.lastStT = performance.now();
  if (d.e === 'st') {
    if (Array.isArray(d.lz)) [VM.langziMatch, VM.langziSeq] = d.lz; /* WEB-022 死球訊息所屬的比賽與發球輪次。 */
    // 新的一球：清掉場上的球；但自己剛發出去（或正在發）的球不清——狀態比「輪到你發球」晚到時，會把剛跳發出去的球清掉（球不見）
    const mySrv = d.srv === NET.me && (walk.jserve || walk.serve || balls.some((q) => q.serve && q.room && NET.hitBy === NET.me));
    if (!VM.wire && d.ph === 'serve' && VM.phase !== 'serve' && !mySrv) { vmClearBalls(); if (d.srv !== NET.me) vmDropHeld(); }
    if (!VM.wire) { VM.sc = d.sc; VM.phase = d.ph; VM.srvId = d.srv; VM.tc = d.tc || null; }
    VM.remoteSetters = Array.isArray(d.setter) ? d.setter : null;
    if (d.gr && (!VM.grade || VM.grade.s !== d.gr[0])) { const first = !VM.grade; VM.grade = { s: d.gr[0], team: d.gr[1], g: d.gr[2], why: d.gr[3] }; if (!first) vmGradeShow(VM.grade); }   // 到位等級（剛加入時的舊等級不顯示）
    if (d.sg) VM.sg = d.sg;
    if (d.six) vm6Apply(d.six);
    if (d.watch && roomSpectator() && !VM.wire) vmWatchSnapshot(d.watch);
    drawScore();
    const nowS = performance.now();
    for (const row of d.ai) { const a = VM.ai.get(row[0]); if (a) vmAiSnapshot(a, row, nowS); }
    if (d.pt) { vmSay(vmPointMsg(d.pt.win, d.pt.why), VM.team[d.pt.win].includes(vmMe()) ? 'gold' : 'warn', 3000); sfx('whistle', 1); }
    else if (d.msg) { vmSay(d.msg, /你們得分/.test(d.msg) ? 'gold' : 'warn', 3000); sfx('whistle', 1); }
    if (d.ph === 'over') vmOver();
  } else if (d.e === 'serve' && d.id === NET.me) vmPrepServe(d.s);
  else if (d.e === 'whistle') vmWhistle();
  else if (d.e === 'form') vm6GoSpot(d.spots && d.spots[NET.me]);
  else if (d.e === 'ts') { /* Legacy field retained; room-settings is authoritative. */ }
  else if (d.e === 'end') { vmStop(true); toast('比賽結束了'); }
}
// ---- 計分板（左上角）
function vmSay(t, kind = '', ms = 1600) { const m = $('vm-msg'); m.textContent = t; m.dataset.k = kind; m.hidden = false; clearTimeout(VM.sayT); VM.sayT = setTimeout(() => { m.hidden = true; }, ms); }
function vmHud() {
  if ($('vm-hud').hidden) return;
  if (ROOM) { $('vm-x').hidden = !ROOM.isHost; $('vm-x').textContent = '結束比賽'; }
  vmServeHint();
  if (!VM.host && VM.lastStT && performance.now() - VM.lastStT > 4000 && performance.now() - (VM.stallSayT || 0) > 4000) { VM.stallSayT = performance.now(); vmSay(`主機（${vmName(VM.hostId)}）的遊戲畫面沒有在前景或斷線了：比賽暫停中`, 'warn', 3800); }
  const srv = VM.host ? (VM.phase === 'serve' || VM.phase === 'rally' ? vmServer() : null) : VM.srvId, sTeam = srv ? vmTeamOf(srv) : -1;
  const t = `${VM.sc[0]}：${VM.sc[1]}`; if ($('vm-sc').textContent !== t) $('vm-sc').textContent = t;
  drawScore();   // 球館裡的計分板跟著比賽比分
  $('vm-a').classList.toggle('srv', sTeam === 0); $('vm-b').classList.toggle('srv', sTeam === 1);
  const tc = VM.host ? (VM.phase === 'rally' && VM.touch.team >= 0 && !VM.touch.serve ? [VM.touch.team, VM.touch.n] : null) : VM.tc;
  const tct = VM.phase === 'rally' && !tc ? '觸球 0/3（接發球）' : tc ? `${vmTeamLabel(tc[0])}觸球 ${tc[1]}/3` : VM.six ? `第 ${VM.setNo} 局・局數 ${VM.sets[0]}：${VM.sets[1]}` : `先到 ${VM.to || 7} 分`; if ($('vm-tc').textContent !== tct) $('vm-tc').textContent = tct;
  const ttl = vmSmallCount() ? `🏐 ${vmSmallCount()} 對 ${vmSmallCount()}` : VM.six ? '🏐 6 對 6' : '🏖️ 2 對 2'; if ($('vm-title').textContent !== ttl) $('vm-title').textContent = ttl;
  vm6Chart();
  const na = vmTeamLabel(0), nb = vmTeamLabel(1); if ($('vm-a').textContent !== na) $('vm-a').textContent = na; if ($('vm-b').textContent !== nb) $('vm-b').textContent = nb;
}
$('vm-x').addEventListener('click', () => { vmStop(); toast('離開 2 對 2 了'); });
// 體力設定：每個動作耗幾 %、專職少耗幾 %、每秒回幾 %
function vmStaMenu() {
  const row = (k) => `<label class="sta-row"><span>${STA_LBL[k]}</span><input type="number" min="0" max="${k === 'spec' ? 90 : 100}" step="0.5" data-stak="${k}" value="${STA_CFG[k]}"><i>%</i></label>`;
  $('rk-menu').innerHTML = `<div class="rk-box"><h3>⚙️ 體力設定</h3>
    <p class="rk-sub">每個動作耗掉多少體力（%）</p><div class="sta-grid">${['sprint', 'jump', 'jserve', 'block', 'spike', 'hit', 'serve', 'tip', 'set', 'bump', 'dive'].map(row).join('')}</div>
    <p class="rk-sub">6 對 6 專職：做自己位置專長的動作少耗（舉球：舉球、二次球；大砲：扣、起跳、接球、撲救；舉對：扣、起跳、攔網；攔中：攔網、起跳、扣）</p><div class="sta-grid">${row('spec')}</div>
    <p class="rk-sub">回復（停下來 0.8 秒後開始回）</p><div class="sta-grid">${['regMove', 'regStill', 'regDead'].map(row).join('')}</div>
    <p class="rk-sub">存在這台電腦；連線比賽時大家照開局的人的設定。AI 也照這套扣。</p>
    <div class="rk-btns"><button type="button" class="primary" data-vm="staback">好了</button><button type="button" data-vm="stareset">恢復預設</button></div></div>`;
  $('rk-menu').hidden = false; unlockMouse();
}
$('rk-menu').addEventListener('change', (e) => {
  const k = e.target.dataset && e.target.dataset.stak; if (!k) return;
  const v = clamp(Number(e.target.value) || 0, 0, k === 'spec' ? 90 : 100); STA_CFG[k] = v; e.target.value = v;
  try { localStorage.setItem('vb.stacfg2', JSON.stringify(STA_CFG)); } catch (er) { /* ignore */ }
});
$('rk-menu').addEventListener('click', (e) => {
  const t = e.target.closest('[data-vm],[data-vmto],[data-vmlv],[data-vmmate],[data-vmmode],[data-vmrole],[data-vmsets],[data-vmto6],[data-vmpt],[data-vmpr]'); if (!t) return;
  const save = () => { try { localStorage.setItem('vb.vmopt', JSON.stringify(VM_OPT)); } catch (er) { /* ignore */ } };
  if (t.dataset.vmmode || t.dataset.vmrole || t.dataset.vmsets || t.dataset.vmto6) {
    if (t.dataset.vmmode) VM_OPT.mode = t.dataset.vmmode; if (t.dataset.vmrole) VM_OPT.role = t.dataset.vmrole; if (t.dataset.vmsets) VM_OPT.sets = +t.dataset.vmsets; if (t.dataset.vmto6) VM_OPT.to6 = +t.dataset.vmto6;
    save(); vmOpenMenu(VM.menu.c); return;
  }
  if (t.dataset.vmpt || t.dataset.vmpr) { const [pid, v] = (t.dataset.vmpt || t.dataset.vmpr).split('|'), q = VM.menu.asg && VM.menu.asg[pid]; if (q) { if (t.dataset.vmpt) q.team = +v; else q.role = v; } vmOpenMenu(VM.menu.c); return; }
  const a = t.dataset.vm || 'opt';
  if (a === 'close') { $('rk-menu').hidden = true; return; }
  if (a === 'sta') { vmStaMenu(); return; }
  if (a === 'staback') { vmOpenMenu(VM.menu.c); return; }
  if (a === 'stareset') { STA_CFG = { ...STA_DEF }; try { localStorage.removeItem('vb.stacfg2'); } catch (er) { /* ignore */ } vmStaMenu(); return; }
  if (a === 'opt') { const k = t.dataset.vmto ? 'to' : t.dataset.vmlv ? 'lv' : 'mate'; VM_OPT[k] = +(t.dataset.vmto || t.dataset.vmlv || t.dataset.vmmate); try { localStorage.setItem('vb.vmopt', JSON.stringify(VM_OPT)); } catch (er) { /* ignore */ } vmOpenMenu(VM.menu.c); return; }
  if (a === 'quit') { $('rk-menu').hidden = true; vmStop(); return; }
  if (a === 'again' && VM.six) { $('rk-menu').hidden = true; vm6Start(VM.c, VM.sg0, VM.asg0); return; }
  if (a === 'go6') { vm6Start(VM.menu.c, VM.menu.sg, VM.menu.asg || {}); return; }
  if (a === 'again') { $('rk-menu').hidden = true; const { c, sg } = VM, mate = VM.team[0][1]; vmStart(c, sg, /^ai/.test(mate) ? null : mate, VM.team[1].filter((id) => !/^ai/.test(id))); return; }
  if (a === 'go' && (VM.menu.mate || VM.menu.opps.length)) vmStart(VM.menu.c, VM.menu.sg, VM.menu.mate ? VM.menu.mate.id : null, VM.menu.opps.map((q) => q.id));
  if (a === 'goai') vmStart(VM.menu.c, VM.menu.sg, null);
});

/* 教學場景只組合現有球路，球仍由原本的碰撞與擊球流程處理。 */
function tutAutoOpen() {   // 進練習模式：等「進入球館中…」載入畫面收掉、真的進了球館，就跳出大面板（自由練習／新手教學）
  if (tutAutoOpen.done || !new URLSearchParams(location.search).has('practice')) return;
  const cover = $('game-loading');
  if (!window.VBTutorial || !walk.on || (cover && !cover.hidden)) { clearTimeout(tutAutoOpen.t); tutAutoOpen.t = setTimeout(tutAutoOpen, 300); return; }
  tutAutoOpen.done = true; window.VBTutorial.open();
}
function tutEv(name, data, ball) {
  const tutorial = window.VBTutorial;
  if (!tutorial?.active) return;
  if (!TUT_COACH.event(name, data, ball)) return;
  tutorial.emit(name, data);
}
function tutSnapshot() {
  const ct = vbCourt(), velocity = walk.vel || [0, 0];
  return { x: walk.x, z: walk.z, yaw: walk.yaw, pitch: walk.pitch,
    speed: Math.hypot(...velocity), sprint: (walk.keys.has('shift') || walk.joyRun) && Math.hypot(...velocity) > 0.1,
    focused:!globalThis.document?.hidden && (locked() || !!walk.noLock), stamina: STA.v, crouch: !!walk.crouch, air: !!walk.air, airBlock: !!walk.air?.block,
    blkAim: walk.blkAim || 0, locked: locked(), tp: tpActive(), hold: !!walk.hold,
    nearNet: ct ? Math.abs(ct.lx) : null, onCourt: !!ct && Math.abs(ct.lx) <= 9 && Math.abs(ct.lz) <= 4.5,
    incoming: TUT_COACH.incoming() };
}
const TUT_COACH = {
  id: null, index: 0, court: null, sg: 1, ball: null, owned: new Set(), objects: [],
  next: 0, lastServe: -Infinity, paused: false, settled: false, failed: false, mate: null, ring: null, held: null,
  coach: null, toss: null, cj: 0,
  // 攔網教練：手上 2.3 m 往上拋（約到 3.7 m），球落回 3.3 m 時扣過來；球到最高點那一刻教練起跳（玩家看這個起跳）
  TOSS: { y0: 2.3, vy: 5.2, hitY: 3.3, speed: 8, jumpH: 0.6, jumpMs: 700 },
  recvTarget(index) {   // 接球落點：照玩家「現在」的位置算，都在自己場內
    const [lx, lz] = toLocalOf(this.court, walk.x, walk.z), px = lx * this.sg;
    const ok = (x, z) => x >= 1.2 && x <= 8.5 && Math.abs(z) <= 4;
    if (index === 0) {   // 走進落點圈：落在旁邊 2～2.5 m
      for (let i = 0; i < 24; i++) { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 0.5, x = px + Math.cos(a) * r, z = lz + Math.sin(a) * r; if (ok(x, z)) return this.world(x, z); }
      return this.world(px > 4.8 ? px - 2.2 : px + 2.2, lz);
    }
    if (index === 3) {   // 撲救：落在側邊 3～3.5 m（撲救最遠 5 m）
      const r = 3 + Math.random() * 0.5, s = Math.random() < 0.5 ? 1 : -1;
      for (const d of [s, -s]) if (ok(px, lz + d * r)) return this.world(px, lz + d * r);
      return this.world(px > 4.8 ? px - r : px + r, lz);
    }
    const lanes=[-1.8,0,1.8], depths=[6,5,4];
    return this.world(depths[this.rep||0],lanes[this.rep||0]*this.sg);
  },
  tossStep(now) {
    const t = this.toss, b = t.ball;
    if (!balls.includes(b)) { this.toss = null; return; }
    if(t.receive){
      if(b.v.y<0 && b.m.position.y<=3.25){const cp=b.m.position.clone(),v=t.target.clone().sub(cp).multiplyScalar(1/t.flight);v.y+=4.9*t.flight;vbLaunch(b,cp,v,'spike');this.trajectory(cp,v);this.hitUntil=now+450;this.toss=null;}return;
    }
    if (!t.apex && b.v.y < 0) { t.apex = now; this.cj = now; }
    if (t.apex && b.m.position.y <= this.TOSS.hitY) {
      const v = this.world(-1, 0).sub(this.world(-2, 0)).multiplyScalar(this.TOSS.speed); v.y = -0.5;
      vbLaunch(b, b.m.position.clone(), v, 'spike'); this.trajectory(b.m.position,v); this.toss = null;
    }
  },
  face(av) { av.g.rotation.y = Math.atan2(walk.x - av.g.position.x, walk.z - av.g.position.z); },   // 角色面向玩家（角色朝向＝rotation.y 的 sin、cos 方向）
  coachAnim(now) {
    const av = this.coach, k = this.cj ? (now - this.cj) / this.TOSS.jumpMs : -1, air = k >= 0 && k < 1;
    av.g.position.y = air ? this.TOSS.jumpH * Math.sin(Math.PI * k) : 0;
    avDrive(av, this.toss ? (air ? AVP.airUp : AVP.serveToss) : air ? AVP.spikeHit : AVP.ready, 0.5, 0, air);
    if (k >= 1) this.cj = 0;
  },
  world(x, z, y = 0) {
    const [wx, wz] = toWorldOf(this.court, x * this.sg, z);
    return new THREE.Vector3(wx, y, wz);
  },
  place(x, z) {
    const p = this.world(x, z), net = this.world(0, z);
    walk.x = p.x; walk.z = p.z; walk.vel = [0, 0]; walk.target = null;
    walk.yaw = Math.atan2(p.x - net.x, p.z - net.z); walk.pitch = 0;
    walk.turn = null; camera.position.set(p.x, EYE, p.z);
    camera.rotation.set(0, walk.yaw, 0, 'YXZ');
  },
  circle(p, color = 0xffd34e) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.67, 0.8, 48), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.035, p.z); ring.userData.noPick = true;
    scene.add(ring); this.objects.push(ring); return ring;
  },
  progress(value) {
    const ring=this.ring;if(!ring)return;
    if(!ring.userData.progress){
      const arc=new THREE.Mesh(new THREE.RingGeometry(.67,.8,120),new THREE.MeshBasicMaterial({color:0x42dd88,side:THREE.DoubleSide,depthWrite:false}));
      arc.rotation.x=-Math.PI/2;arc.userData.noPick=true;scene.add(arc);this.objects.push(arc);ring.userData.progress=arc;
    }
    const arc=ring.userData.progress;arc.position.copy(ring.position);arc.position.y+=.003;arc.visible=value>0;arc.geometry.setDrawRange(0,Math.floor(clamp(value,0,1)*120)*6);
  },
  trajectory(from,velocity) {
    if(this.path){this.path.removeFromParent();this.path.geometry.dispose();this.path.material.dispose();this.objects=this.objects.filter(o=>o!==this.path);}
    const points=[];
    for(let i=0;i<=100;i++){const t=i*.035,p=from.clone().add(velocity.clone().multiplyScalar(t));p.y-=4.9*t*t;if(p.y<BALL_R){p.y=BALL_R;points.push(p);break;}points.push(p);}
    this.path=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:0x6ce8ff,transparent:true,opacity:.9,dashSize:.22,gapSize:.1,depthWrite:false}));
    this.path.computeLineDistances();this.path.userData.noPick=true;scene.add(this.path);this.objects.push(this.path);
  },
  moveTarget(index,rep=0){
    if(index===1)return this.world([9,6,3][rep],0);
    if(index===3){let p;for(let i=0;i<20;i++){p=this.world(2+Math.random()*6,(Math.random()-.5)*6);if(Math.hypot(p.x-walk.x,p.z-walk.z)>2)break;}return p;}
    if(index===5)return this.world([5,6,4][rep],[-1.8,1.8,0][rep]*this.sg);
    return new THREE.Vector3(walk.x,0,walk.z);
  },
  deferSuccess(done){if(this.ball && !this.ball.floorHit && !this.settled){this.afterLanding=done;return true;}return false;},
  roundComplete(){if(this.id!=='move'){this.settled=true;this.next=performance.now()+1800;}},
  repeat(id,index,rep){
    this.rep=rep;
    if(id==='move'){if(index===4){STA.v=1;STA.lock=false;STA.useT=performance.now();}const p=this.moveTarget(index,rep);if(this.ring)this.ring.position.set(p.x,.035,p.z);return {x:p.x,z:p.z};}
    this.updateZone();this.next=Math.max(this.next===Infinity?0:this.next,performance.now()+900);return null;
  },
  updateZone(){
    const needed=this.id==='recv' && [1,2].includes(this.index) || this.id==='atk' && this.index>0 || this.id==='serve';
    if(!needed)return;
    const recv=this.id==='recv',z=recv?-1.2*this.sg:[-2.4,0,2.4][(this.rep||0)%3]*this.sg;
    this.zone={p:this.world(recv?1.8:this.id==='atk' && this.index===3?-2:-6,z),r:recv?1.8:2};
    if(!this.zoneMesh){this.zoneMesh=this.circle(this.zone.p,0x65dfff);this.zoneMesh.scale.set(this.zone.r/.8, this.zone.r/.8,1);}
    this.zoneMesh.position.set(this.zone.p.x,.045,this.zone.p.z);
  },
  avatar(p) {
    const av = makeAvatar('#30A46C', myChar());
    av.g.position.copy(p); this.face(av);
    scene.add(av.g); this.objects.push(av.g); return av;
  },
  startDrill(mode, setType, interval) {
    if (!this.start('drill')) return false;
    const [slot, variant] = setType.split('-');
    this.drill = { mode, slot: Number(slot) === 6 ? 7 : Number(slot), variant,
      delay: Math.max(3, interval) * 1000, hitters: [], handBalls: [], hitter: null, target: null, strike: false, poseUntil: 0 };
    const d = this.drill;
    this.place(({ atk: 3.5, set: 1.5, block: 0.7, defense: 5.5 })[mode], 0);
    const setter = this.world(mode === 'block' ? -1.5 : mode === 'set' ? 6 : 1, (mode === 'atk' ? -2.3 : 1.2) * this.sg);
    if (mode !== 'defense') this.coach = this.avatar(setter);
    if (mode === 'atk') {
      d.feeder = this.avatar(this.world(6, 0));
      d.feeder.g.rotation.y = Math.atan2(setter.x - d.feeder.g.position.x, setter.z - d.feeder.g.position.z);
    }
    if (mode === 'block' || mode === 'defense') {
      for (const z of [-3.25, 0, 3.25]) {
        const base = this.world(-1.25, z);
        const stool = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), new THREE.MeshStandardMaterial({ color: 0x876849 }));
        stool.position.copy(base); stool.position.y = 0.425; scene.add(stool); this.objects.push(stool);
        base.y = 0.85;
        const hitter = this.avatar(base); d.hitters.push(hitter);
        if (mode === 'defense') {
          const mesh = newBallMesh(); hitter.hands[0].add(mesh); mesh.position.y = -BALL_R;
          d.handBalls.push(mesh);
        }
      }
    }
    this.settled = true; this.paused = false; this.next = performance.now() + 900;
    return true;
  },
  drillFeed(now) {
    const d = this.drill;
    const index = Math.floor(Math.random() * d.hitters.length);
    d.hitter = d.hitters[index]; d.strike = false;
    const from = d.mode === 'defense' ? d.handBalls[index].getWorldPosition(new THREE.Vector3()) : (d.feeder || this.coach).g.position.clone();
    if (d.mode !== 'defense') from.y = d.mode === 'atk' || d.mode === 'set' ? 1.1 : 2.1;
    const mesh = newBallMesh(); mesh.position.copy(from);
    const ball = { m: mesh, v: new THREE.Vector3(), rest: 0 };
    mesh.userData.ball = ball; ballsGroup.add(mesh); balls.push(ball); this.owned.add(ball);
    this.ball = ball; this.settled = false; this.next = Infinity; d.poseUntil = now + 500;
    if (d.mode === 'atk') {
      d.awaitingSet = true;
      d.feedPoseUntil = now + 500;
      d.poseUntil = 0;
      const target = this.coach.g.position.clone(); target.y = 2.1;
      const seconds = 1.5;
      const velocity = target.sub(from).multiplyScalar(1 / seconds);
      velocity.y += 4.9 * seconds;
      vbLaunch(ball, from, velocity, 'bump');
      return;
    }
    const send = (target, seconds, kind) => {
      const velocity = target.clone().sub(from).multiplyScalar(1 / seconds);
      velocity.y += 4.9 * seconds; vbLaunch(ball, from, velocity, kind);
    };
    if (d.mode === 'set') {
      const good = Math.random() < 0.7;
      const target = this.world(good ? 1.3 + Math.random() * 0.5 : 3.4 + Math.random() * 3,
        good ? this.sg * (0.5 + Math.random()) : (Math.random() - 0.5) * 7, 2.1);
      send(target, good ? 1.4 : 1.7, 'bump'); return;
    }
    const lane = [-3.25, 0, 3.25][index];
    const cross = Math.random() < 0.5;
    d.target = this.world(5.7 + Math.random() * 1.7, cross ? (lane === 0 ? (Math.random() < 0.5 ? -3 : 3) : -lane) : lane, BALL_R);
    const contact = this.world(-0.95, lane, 3.25);
    d.hitter.g.rotation.y = Math.atan2(d.target.x - contact.x, d.target.z - contact.z);
    if (d.mode === 'defense') d.handBalls[index].visible = false;
    send(contact, d.mode === 'defense' ? 0.95 : 1.18, 'set');
    d.strike = true;
  },
  drillFrame(now) {
    const d = this.drill, ball = this.ball;
    if (d.mode === 'atk') this.face(this.coach);
    if (d.feeder) avDrive(d.feeder, now < d.feedPoseUntil ? AVP.bump : AVP.ready, 0.45);
    if (this.coach) avDrive(this.coach, now < d.poseUntil ? (d.mode === 'set' ? AVP.bump : AVP.setPush) : AVP.ready, 0.45);
    for (const av of d.hitters) {
      const active = av === d.hitter;
      avDrive(av, active && d.strike ? AVP.airUp : active && now < d.hitUntil ? AVP.spikeHit : AVP.ready, 0.45);
    }
    if (ball && !this.settled) {
      if (ball.floorHit || ball.rest > 0.3 || !balls.includes(ball)) this.drillFinish(now);
      else if (d.awaitingSet && ball.v.y < 0 && ball.m.position.y <= 2.2
        && Math.hypot(ball.m.position.x - this.coach.g.position.x, ball.m.position.z - this.coach.g.position.z) < 0.8) {
        const from = ball.m.position.clone();
        const [lx, lz] = toLocalOf(this.court, from.x, from.z);
        const spot = vbSpot({ lx: this.sg }, d.slot, lx, lz, d.variant);
        if (d.slot === 2 && d.variant !== 'high3') {
          const [playerX, playerZ] = toLocalOf(this.court, walk.x, walk.z);
          spot.lx = this.sg * clamp(playerX * this.sg - 0.1, 0.7, 1.4);
          spot.lz = clamp(playerZ, -4, 4);
          spot.y = 3.05;
          spot.T = clamp(0.1 + Math.hypot(spot.lx - lx, spot.lz - lz) * 0.05, 0.15, 0.3);
        }
        const [x, z] = toWorldOf(this.court, spot.lx, spot.lz);
        vbSendSet(ball, x, z, spot.y, spot.T, d.variant === 'high3' ? 6 : d.slot, '陪練', from);
        d.awaitingSet = false;
        d.poseUntil = now + 500;
      }
      else if (d.strike && ball.v.y < 0 && ball.m.position.y <= 3.28) {
        const cp = ball.m.position.clone(), t = 0.55;
        const velocity = d.target.clone().sub(cp).multiplyScalar(1 / t);
        velocity.y += 4.9 * t; vbLaunch(ball, cp, velocity, 'spike');
        d.strike = false; d.hitUntil = now + 420;
      }
    }
    if (now < this.next || (!locked() && !coarse())) return;
    if (ball) {
      ball.m.removeFromParent(); this.owned.delete(ball);
      const i = balls.indexOf(ball); if (i >= 0) balls.splice(i, 1);
    }
    for (const mesh of d.handBalls) mesh.visible = true;
    this.drillFeed(now);
  },
  drillFinish(now) {
    this.drill.awaitingSet = false;
    this.drill.strike = false; this.settled = true; this.next = now + this.drill.delay;
  },
  clearStep() {
    if (this.held?.userData.ball) this.owned.add(this.held.userData.ball);
    for (const ball of this.owned) {
      const i = balls.indexOf(ball); if (i >= 0) balls.splice(i, 1);
      ball.m.removeFromParent();
    }
    if (VB.setSpot && this.owned.has(VB.setSpot.b)) VB.setSpot = null;
    if (VB.target && this.owned.has(VB.target.b)) VB.target = null;
    this.owned.clear();
    for (const object of this.objects) {
      object.removeFromParent();
      if (object.isMesh || object.isLine) { object.geometry.dispose(); object.material.dispose(); }
    }
    this.objects = []; this.mate = null; this.ring = null; this.ball = null; this.next = 0;
    this.coach = null; this.toss = null; this.cj = 0; this.pending=null;this.afterLanding=null;this.zone=null;this.zoneMesh=null;this.blockers=[];this.hitters=[];this.activeHitter=null;this.path=null;this.hitUntil=0;
    if (this.held) {
      this.held.removeFromParent(); if (walk.hold === this.held) walk.hold = null;
      this.held = null;
    }
    walk.serve = null; walk.jserve = null; walk.recv = null; walk.setQ = null; if (walk.setAim) vbManualSetCancel();
    walk.swing = null; walk.charge = null; walk.chargeArm = null; walk.chargeArmGround = false;
    vbClearAir(); walk.dive = null; walk.down = 0; walk.blkAim = 0; walk.blkShift = 0;
    setMenuClose(false); pose = 'hold'; hands.visible = !!walk.hold;
  },
  start(id) {
    if (!walk.on || VM.on || window.__rkOn || NET.on) { toast('請先進入單人練習房，再開始教學'); return false; }
    const current = vbCourt();
    this.court = current?.c || state.items.find(c => CAT[c.type].court === 'vb' && c.mode !== 'lines' && !c.use);
    if (!this.court) { toast('場館裡需要一座已架網的排球場'); return false; }
    this.sg = current ? Math.sign(current.lx) || 1 : 1; this.id = id;
    if (VB.npc) vbNpcToggle();
    if (walk.hold) { walk.hold.removeFromParent(); walk.hold = null; }
    skill.mode = null; walk.sit = null; walk.spike = null; walk.keys.clear();
    this.place(id === 'move' ? 12 : id === 'recv' ? 5 : id === 'serve' ? 10 : id === 'block' ? 0.7 : 1.8, 0);
    return true;
  },
  step(id, index) {
    this.clearStep(); this.id = id; this.index = index; this.rep=0; this.paused = false;
    this.settled = false; this.failed = false; this.next = performance.now() + 1200;
    if (id === 'move') {
      if(index===4){STA.v=1;STA.lock=false;STA.useT=performance.now();}
      const p=this.moveTarget(index);if(index!==4)this.ring=this.circle(p);this.progress(0);return {x:p.x,z:p.z};
    }
    this.place(id === 'recv' ? 5 : id === 'serve' ? 10 : id === 'block' ? 0.7 : 1.8, 0);
    this.updateZone();
    if (id === 'serve') {
      this.next = Math.max(performance.now(), this.lastServe + 1500);
      if (performance.now() >= this.next) this.give();
      return null;
    }
    this.coach = this.avatar(this.world(id === 'recv' ? -4 : id === 'block' ? -2 : 0.9, id === 'set' || id === 'atk' ? -1.5*this.sg : 0));
    if(id==='recv' && index>=2){
      const base=this.world(-1.25,0);const stool=new THREE.Mesh(new THREE.BoxGeometry(.85,.85,.85),new THREE.MeshStandardMaterial({color:0x876849}));
      stool.position.copy(base);stool.position.y=.425;scene.add(stool);this.objects.push(stool);base.y=.85;this.coach.g.position.copy(base);
    }
    if (id === 'block') {
      this.coach.g.position.copy(this.world(-3,1.4*this.sg));
      this.ring=this.circle(this.world(.7,0));
      for(const z of (index===3?[-3.25,0,3.25]:[0])){
        const base=this.world(-1.25,z),box=new THREE.Mesh(new THREE.BoxGeometry(.85,.85,.85),new THREE.MeshStandardMaterial({color:0x876849}));
        box.position.copy(base);box.position.y=.425;scene.add(box);this.objects.push(box);base.y=.85;this.hitters.push(this.avatar(base));
      }
      if(index===3)for(const z of [-3.25,3.25]){const av=this.avatar(this.world(.7,z));av.g.rotation.y=walk.yaw+Math.PI;this.blockers.push({av,jumping:false});}
    } else this.ring = this.circle(this.world(id === 'recv' ? 5 : 1.45, 0));
    return null;
  },
  give() {
    if (walk.hold || walk.serve || walk.jserve) return;
    if (this.held?.userData.ball) this.owned.add(this.held.userData.ball);
    for (const ball of this.owned) {
      ball.m.removeFromParent(); const i = balls.indexOf(ball); if (i >= 0) balls.splice(i, 1);
    }
    this.owned.clear();
    this.place(10, 0);
    grabBall(); this.held = walk.hold; this.next = Infinity;
  },
  feed() {
    const id = this.id;
    const hard=id==='recv' && this.index>=2;
    const from = this.world(hard?-1.25:id === 'recv' ? -4 : id === 'block' ? -2 : 0.9, id === 'set' || id === 'atk' ? -1.5*this.sg : 0, hard?3.15:id === 'block' ? this.TOSS.y0 : 2.2);
    const mesh = newBallMesh(); mesh.position.copy(from);
    const ball = { m: mesh, v: new THREE.Vector3(), rest: 0 };
    mesh.userData.ball = ball; ballsGroup.add(mesh); balls.push(ball); this.owned.add(ball);
    this.ball = ball; this.settled = false; this.failed = false; this.next = Infinity;
    if(hard){
      ball.tutorialHeavy=this.index===2;
      const target=this.recvTarget(this.index);target.y=BALL_R;
      const flight=this.index===3?.65:.32;
      vbLaunch(ball,from,new THREE.Vector3(0,2.8,0),'set');
      this.toss={ball,receive:true,target,flight};
      const contact=from.clone();contact.y=3.25;const v=target.clone().sub(contact).multiplyScalar(1/flight);v.y+=4.9*flight;this.trajectory(contact,v);
    } else if (id === 'block') {
      const lane=this.index===3?((this.rep||0)%2===0?-3.25:3.25):0;
      const hitter=this.hitters.find(av=>Math.abs(toLocalOf(this.court,av.g.position.x,av.g.position.z)[1]-lane)<.1);
      const cp=this.world(-1.25,lane,3.25),feedOrigin=this.coach.g.position.clone();feedOrigin.y=2.1;
      const v=cp.clone().sub(feedOrigin).multiplyScalar(1/1.18);v.y+=4.9*1.18;ball.m.position.copy(feedOrigin);vbLaunch(ball,feedOrigin,v,'set');
      const target=this.world(6,lane+(this.rep%2?1:-1)*.7,BALL_R);
      this.activeHitter=hitter;if(hitter)hitter.g.rotation.y=Math.atan2(target.x-cp.x,target.z-cp.z);
      this.toss={ball,receive:true,target,flight:.55,block:true,hitter};
      this.ring.position.copy(this.world(.7,lane));this.ring.position.y=.035;
      this.mate=this.blockers.find(m=>Math.abs(toLocalOf(this.court,m.av.g.position.x,m.av.g.position.z)[1]-lane)<.1)||null;
      const attackV=target.clone().sub(cp).multiplyScalar(1/.55);attackV.y+=4.9*.55;this.trajectory(cp,attackV);
    } else if (id === 'atk') {
      const target = this.world(1.45, 0);
      vbSendSet(ball, target.x, target.z, 3.05, 1.1, 2, '教練', from);this.trajectory(ball.m.position,ball.v);
    } else {
      const target = id === 'recv' ? this.recvTarget(this.index) : new THREE.Vector3(walk.x - Math.sin(walk.yaw) * 0.3, 0, walk.z - Math.cos(walk.yaw) * 0.3);
      const velocity = id === 'recv' ? solveShot(from, target.x, target.z, this.court, -this.sg, this.index === 2 ? 1.25 : 1.65)
        : new THREE.Vector3((target.x - from.x) / 1.15, (2.05 - from.y) / 1.15 + 4.9 * 1.15, (target.z - from.z) / 1.15);
      vbLaunch(ball, from, velocity, 'bump');this.trajectory(ball.m.position,ball.v);
    }
  },
  incoming() {
    if (this.id !== 'recv' || !this.ball || this.settled || this.ball.floorHit) return null;
    if(this.toss?.receive)return {x:this.toss.target.x,z:this.toss.target.z,t:this.toss.flight};
    return vbPredict(this.ball.m.position, this.ball.v, BALL_R);
  },
  together() {
    const mate = this.mate;
    return !!(mate && mate.jumping && walk.air?.block && walk.air.y > 0.02 &&
      Math.hypot(mate.av.g.position.x - walk.x, mate.av.g.position.z - walk.z) <= 1.5);
  },
  event(name, data, ball) {
    if (this.drill) {
      const expected = { set: 'set', block: 'block', defense: 'recv' }[this.drill.mode];
      if (!this.settled && expected === name && ball === this.ball) this.drillFinish(performance.now());
      return false;
    }
    if(['recv','set','atk','block'].includes(name) && ball && ball!==this.ball)return false;
    if (name === 'jump' && data.block && this.mate) this.mate.jumping = true;
    if (name === 'recvMiss') {
      if (!this.ball || this.settled || this.failed) return false;
      this.failed = true;
    }
    if (['recv','set','atk','block','serve'].includes(name) && ball) {
      if(this.pending || ball.floorHit || ball===this.ball && this.settled)return false;
      this.owned.add(ball);this.ball=ball;this.settled=false;
      if(name==='serve')this.lastServe=performance.now();
      this.pending={name,data,zoneReached:false};this.next=Infinity;this.toss=null;
      if(this.path)this.path.visible=false;
      return false;
    }
    return true;
  },
  frame() {
    if (this.paused || !this.id) return;
    const now = performance.now();
    if (this.drill) { this.drillFrame(now); return; }
    if (this.mate) {
      const air = this.mate.jumping && walk.air?.block ? walk.air : null;
      this.mate.av.g.position.y = air ? air.y : 0;
      avDrive(this.mate.av, air ? avBlockPose(walk.blkShift || 0) : AVP.idle, 0.5, 0, !!air);
      if (!air) this.mate.jumping = false;
    }
    if (this.coach) this.face(this.coach);   // 拋球／餵球的教練一直面向玩家
    if (this.toss) this.tossStep(now);
    if(this.id==='block'){if(this.coach)avDrive(this.coach,this.toss?AVP.setPush:AVP.ready,.5);for(const av of this.hitters)avDrive(av,this.toss?.hitter===av?AVP.airUp:av===this.activeHitter && now<this.hitUntil?AVP.spikeHit:AVP.ready,.5);}
    if(this.coach && this.id==='recv' && this.index>=2)avDrive(this.coach,this.toss?AVP.serveToss:now<this.hitUntil?AVP.spikeHit:AVP.ready,.5,0,false);
    const incoming = this.incoming();
    if (this.id === 'recv' && this.ring) {
      this.ring.visible = !!incoming || this.settled;
      if (incoming) this.ring.position.set(incoming.x, 0.035, incoming.z);
      const arc=this.ring.userData.progress;if(arc){arc.position.copy(this.ring.position);arc.position.y+=.003;}
    }
    if(this.pending && this.zone && this.id==='recv'){
      const p=this.ball.m.position;
      if(p.y>=1.5 && p.y<=3.2 && this.ball.v.y<0 && Math.hypot(p.x-this.zone.p.x,p.z-this.zone.p.z)<=this.zone.r)this.pending.zoneReached=true;
    }
    if (this.ball && !this.settled && (this.ball.floorHit || this.ball.rest > 0.3 || !balls.includes(this.ball))) {
      this.settled=true;this.next=now+2000;
      const pending=this.pending;this.pending=null;
      const floor=this.ball.floorHit;
      const inside=!this.zone || (this.id==='recv'?pending?.zoneReached:floor && Math.hypot(floor[0]-this.zone.p.x,floor[1]-this.zone.p.z)<=this.zone.r);
      if(this.afterLanding){const finish=this.afterLanding;this.afterLanding=null;finish();}
      else if(pending && inside)window.VBTutorial.emit(pending.name,pending.data);
      else if(!this.failed){this.failed=true;window.VBTutorial.emit('feedMiss',pending && this.zone?{reason:this.id==='recv'?'球沒有進入藍色舉球區。面向目標、站穩再接；重扣要蹲低卸力。':'落點未進入藍色區域，調整方向再試一次。'}:{});}
    }
    if (this.id === 'serve') {
      if (!this.pending && !walk.hold && !walk.serve && !walk.jserve && this.next === Infinity) this.next = now + 1500;
      if (now >= this.next) this.give();
      return;
    }
    if (this.id === 'move' || now < this.next || !locked()) return;
    if (this.id === 'block' && this.index!==3 && Math.hypot(walk.x - this.ring.position.x, walk.z - this.ring.position.z) > 0.8) return;
    if (this.ball) { this.ball.m.removeFromParent(); const i = balls.indexOf(this.ball); if (i >= 0) balls.splice(i, 1); this.owned.delete(this.ball); }
    this.feed();
  },
  pause() { this.paused = true; this.next = Infinity; },
  stop() { if (!this.id) return; this.clearStep(); this.drill = null; this.id = null; this.court = null; this.paused = false; this.lastServe = -Infinity; },
  release() { unlockMouse(); walk.keys.clear(); }
};

