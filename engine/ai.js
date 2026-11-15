// 比賽引擎：AI 球員的大腦（B3）。網頁和台北伺服器共用。
// 由 tools 從 gym 搬過來：函式內容沒有改，只把用到的遊戲東西改成 G.名字（G 由使用的人提供，見 src/gym/game/13a-ai-engine.js）。
// G 需要提供：BALL_R、JUMP_G、NET、NETS、ROLE_SUPER、THREE、V6_BASE、V6_NAME、VM、VM_LEVELS、balls、ballsGroup、clamp、netBallHit、newBallMesh、rkGauss、serveVel、sfx、staCfg、staCost、state、toast、vbClearAir、vbHardDefl、vbImpact、vbLaunch、vbMarkSet、vbShotVel、vm6Front、vm6Idx、vm6P、vmBallL、vmL、vmLv、vmMe、vmOnTouch、vmOppPos、vmPos、vmPositionSetters、vmPredL、vmPro、vmProLv、vmServer、vmSide、vmSmallCount、vmSmallLabel、vmTeamOf、vmW、walk、gameRandom（比賽專用亂數）
// 之後在伺服器上跑時，G 換成伺服器版本（沒有畫面，只有位置與規則）。
export const AI_DEPS = ["BALL_R","JUMP_G","NET","NETS","ROLE_SUPER","THREE","V6_BASE","V6_NAME","VM","VM_LEVELS","balls","ballsGroup","clamp","gameRandom","netBallHit","newBallMesh","rkGauss","serveVel","sfx","staCfg","staCost","state","toast","vbClearAir","vbHardDefl","vbImpact","vbLaunch","vbMarkSet","vbShotVel","vm6Front","vm6Idx","vm6P","vmBallL","vmL","vmLv","vmMe","vmOnTouch","vmOppPos","vmPos","vmPositionSetters","vmPredL","vmPro","vmProLv","vmServer","vmSide","vmSmallCount","vmSmallLabel","vmTeamOf","vmW","walk"];
export function createAi(G) {
  function vmProSetter(team, passer, b = G.VM.ball) {
    if (!G.vmProLv() || !b || G.vmSmallCount() || G.VM.tactics === 'rotation') return null;
    const sp = G.vmPredL(G.vmBallL(b), 2.3); if (!sp) return null;
    const s0 = G.VM.team[team].find((id) => G.VM.role[id] === 'S' && id !== passer), far = (id) => { const q = G.vmPos(id); return q ? Math.hypot(q.x - sp.x, q.z - sp.z) : 99; };
    if (s0 && !G.VM.ai.has(s0)) return null;
    let best = s0 || null; for (const id of G.VM.team[team]) if (id !== passer && G.VM.ai.has(id) && (!best || far(id) < far(best) - 1.5)) best = id;
    return best;
  }
  function vmAiServe(a) {
    const sd = G.vmSide(a.team), err = G.gameRandom(), L = G.vmLv(a), S = L.serve || {}, rt = G.gameRandom();
    const type = rt < S.jump ? 'jump' : rt < S.jump + S.jfloat ? 'jfloat' : rt < S.jump + S.jfloat + S.float ? 'float' : 'std', sweet = (type === 'jump' || type === 'jfloat') && G.gameRandom() < L.sweet;
    const g0 = vmPickGap(a, sd, 3, 8.3, 3.6); let tx = g0.tx, tz = g0.tz, net = false;
    const outK = type === 'jump' ? (sweet ? 1 : 1.8) : 1;   // 跳發比較容易失誤（沒打到甜蜜點更容易）
    if (err < L.out * 0.8 * outK) { if (G.gameRandom() < 0.5) tx = -sd * (9.6 + G.gameRandom() * 1.5); else tz = Math.sign(tz || 1) * (4.9 + G.gameRandom()); }
    else if (err < (L.out * 0.8 + L.net) * outK) net = true;   // 太平，掛網
    const jumpH = type === 'jump' || type === 'jfloat';
    if (jumpH) { a.vy = aiJump(a, 4.2, 'jserve'); }   // 跳發／跳飄：跳起來在空中打
    const p = new G.THREE.Vector3(...(() => { const [x, z] = G.vmW(a.x - sd * (jumpH ? 0.6 : 0.3), a.z); return [x, jumpH ? 3.25 : 2.6, z]; })()), [wx, wz] = G.vmW(tx, tz);
    const m = G.newBallMesh(); m.position.copy(p); G.ballsGroup.add(m);
    const spd = type === 'jump' ? (sweet ? 28 + G.gameRandom() * 3 : 20 + G.gameRandom() * 5) : type === 'jfloat' ? 15 + G.gameRandom() * 2 : type === 'float' ? 12.5 : 13, g = type === 'jump' ? 14.3 : 9.8;
    let v = G.serveVel(p, wx, wz, spd, g, G.VM.c, 0, type === 'float' || type === 'jfloat' ? 0.45 : 0.22); if (net) v.y -= 1.6;   // 過網留餘裕：飄球會晃，留多一點
    const b = { m, v, rest: 0 }; m.userData.ball = b; G.balls.push(b);
    if (type === 'jump' || type === 'std') { const hv = Math.hypot(v.x, v.z) || 1, sq = typeof q === 'number' ? q : 0.8; b.spinW = new G.THREE.Vector3(v.z / hv, 0, -v.x / hv).multiplyScalar(type === 'jump' ? 45 + 25 * sq : 15); }   /* 跳發強上旋、一般發球輕上旋；飄球不轉 */
    if (type === 'jump') b.acc = new G.THREE.Vector3(0, -4.5, 0);   // 上旋：下墜比一般快
    if (type === 'float' || type === 'jfloat') b.float = { t: 0, w: 4.5 + G.gameRandom() * 3, ph: G.gameRandom() * 6.3, a: type === 'float' ? 4.5 : sweet ? 12 : 5 };   // 飄球
    while (G.balls.length > 8) { const old = G.balls.shift(); G.ballsGroup.remove(old.m); }
    a.pose = 4; a.swingT = 0.35; aiPay(a, 'serve');
    if (G.NET.on) G.netBallHit(b, 'serve');
    G.vbImpact(b, 'serve', 1);
    G.vmOnTouch(b, a.id, 'serve');
  }
  function vmFixSetter(team, P, p, passer) {
    if (!P.setter || !G.VM.ai.has(P.setter)) return;
    const eta = (id) => { const a = G.VM.ai.get(id); return a ? Math.hypot(a.x - p.x, a.z - p.z) / G.vmLv(a).speed + G.vmLv(a).react : 99; };
    const e0 = eta(P.setter); if (e0 <= p.t + 0.35) return;
    let best = null; for (const id of G.VM.team[team]) { if (id === passer || id === P.setter || !G.VM.ai.has(id)) continue; const e = eta(id); if (!best || e < best.e) best = { id, e }; }
    if (best && best.e < e0) { P.setter = best.id; P.fix = true; }
  }
  function vmPossession(team, B) {
    if (G.VM.poss[team]) return G.VM.poss[team];
    const p = G.vmPredL(B, 0.9); if (!p) return null;
    const ids = G.VM.team[team], d = ids.map((id) => { const q = G.vmPos(id); return q ? Math.hypot(q.x - p.x, q.z - p.z) : 99; });
    const passer = d[0] <= d[1] ? ids[0] : ids[1], setter = ids.find((i) => i !== passer);
    G.VM.poss[team] = { stage: 0, passer, setter, attacker: passer };
    return G.VM.poss[team];
  }
  function vmAiStep(a, dt) {
    const sd = G.vmSide(a.team), b = G.VM.ball, live = G.VM.phase === 'rally' && b && G.balls.includes(b);
    a.swingT = Math.max(0, a.swingT - dt);
    if (G.VM.phase === 'serve' && G.vmServer() === a.id && G.VM.t > G.VM.serveAt && Math.hypot(a.x - a.tx, a.z - a.tz) < 0.4) { vmAiServe(a); G.VM.serveAt = 1e9; }
    if (G.VM.six) vm6Brain(a, sd, b, live);
    else if (live && vmAiBlock(a, sd, b)) { /* 正在攔網 */ }
    else if (live) {
      // 自己隊友剛打向對面、還在我這邊飛的球（扣球、推過去）不要去碰
      const B = G.vmBallL(b), onMine = Math.sign(B.x) === sd, land = G.vmPredL(B, G.BALL_R), outgoing = G.VM.touch.team === a.team && G.VM.touch.last !== a.id && (G.VM.touch.n >= 3 || ['spike', 'tip', 'hit'].includes(b.lk)) && Math.sign(B.vx) === -sd && land && Math.sign(land.x) === -sd;   // 隊友打出去、會落在對面的球才不碰（傳給我的球要接）
      const coming = !outgoing && (Math.sign(B.vx) === sd || onMine) && !vmLetGo(a.team, b);   // 會出界的球放掉
      const myTurn = G.VM.touch.team !== a.team || G.VM.touch.n < 3;
      if (coming && myTurn && !(G.VM.touch.team === a.team && G.VM.touch.n >= 3)) {
        if (G.VM.touch.team !== a.team && G.VM.poss[a.team] && G.VM.poss[a.team].stage > 0) G.VM.poss[a.team] = null;   // 球剛從對面過來：重新分工
        const P = vmPossession(a.team, B);
        if (P && G.VM.t >= a.reactAt) vmAiRole(a, P, B, sd);
      } else {
        // 球在對面：回防守位置；隊友在網前（AI 在攔網、或真人站在網前 2.2 m 內）→ 我退到後排中間補位，偏向攔網擋不到的斜線
        const k = G.VM.team[a.team].indexOf(a.id), mate = G.VM.team[a.team].find((id) => id !== a.id), mp = G.vmPos(mate), ma = G.VM.ai.get(mate);
        const mateFront = (ma && ma.blk) || (!ma && mp && Math.abs(mp.x) < 2.2), th = mateFront ? vmThreat(a.team) : null;
        if (mateFront) { a.tx = sd * 6.2; a.tz = G.clamp(th ? -th.z * 0.35 : 0, -2.2, 2.2); }
        else { a.tx = sd * (G.vmLv(a).block > 0.8 ? 5.5 : 6); a.tz = k === 0 ? 2 : -2; }
        a.reactAt = G.VM.t + G.vmLv(a).react;
        if (G.VM.touch.team !== a.team) G.VM.poss[a.team] = null;
      }
    }
    // AI 球員急停、急轉：球鞋吱一聲
    { const ps = Math.hypot(a.pvx || 0, a.pvz || 0), cs = Math.hypot(a.vx, a.vz), cosA = ps > 0.1 && cs > 0.1 ? ((a.pvx || 0) * a.vx + (a.pvz || 0) * a.vz) / (ps * cs) : 1;
      if (a.y <= 0 && ((ps > 2 && (cs < ps * 0.55 || cosA < 0.6)) || (ps < 1 && cs > 3.2)) && G.VM.t - (a.sqT || 0) > 0.5) { a.sqT = G.VM.t; const [wx, wz] = G.vmW(a.x, a.z); G.sfx('squeak', 0.6 + G.gameRandom() * 0.3, new G.THREE.Vector3(wx, 0.05, wz)); }
      const kf = Math.min(1, dt * 4); a.pvx = (a.pvx || 0) + (a.vx - (a.pvx || 0)) * kf; a.pvz = (a.pvz || 0) + (a.vz - (a.pvz || 0)) * kf; }   // 跟著慢慢走的速度：跟現在差很多＝剛急停／急轉
    // 移動、跳
    { const v0 = Math.hypot(a.vx, a.vz); const c = G.staCfg(); if (v0 > 3.6 && a.y <= 0) a.sta = Math.max(0, (a.sta ?? 1) - (c.sprint / 100) * 0.6 * dt); else a.sta = Math.min(1, (a.sta ?? 1) + ((G.VM.phase === 'rally' ? (v0 < 0.5 ? c.regStill : c.regMove) : c.regDead) / 100) * dt); }   // AI 體力：全速跑會耗、停下來慢慢回
    const spMax = G.vmLv(a).speed * (0.85 + 0.15 * G.clamp((a.sta ?? 1) / 0.3, 0, 1));   // 累了跑比較慢
    const nav = vmAiYieldRoute(a);
    const dx = nav.x - a.x, dz = nav.z - a.z, d = Math.hypot(dx, dz), sp = d > 0.05 ? (a.run ? Math.max(spMax, 4.8 * (0.85 + 0.15 * G.clamp((a.sta ?? 1) / 0.3, 0, 1))) : Math.min(spMax, d * 5)) : 0, kk = 1 - Math.exp(-dt * (a.run ? 12 : 9));   // 助跑：不減速一路衝到起跳點
    if (a.y <= 0) { a.vx += ((d > 0.05 ? dx / d : 0) * sp - a.vx) * kk; a.vz += ((d > 0.05 ? dz / d : 0) * sp - a.vz) * kk; }
    a.x += a.vx * dt; a.z += a.vz * dt; a.x = sd * G.clamp(a.x * sd, 0.35, 12); a.z = G.clamp(a.z, -7, 7);
    {   // 人跟人不能重疊：AI 跟其他 AI、真人至少隔 0.6 m（互相撞到就被推開，不會兩個人疊著接同一顆球）
      const bodies = []; for (const o of G.VM.ai.values()) if (o !== a) bodies.push([o.x, o.z]);
      for (const id of [...G.VM.team[0], ...G.VM.team[1]]) if (!G.VM.ai.has(id)) { const q = G.vmPos(id); if (q) bodies.push([q.x, q.z]); }
      for (const [ox, oz] of bodies) { const ex = a.x - ox, ez = a.z - oz, e = Math.hypot(ex, ez); if (e > 0.001 && e < 0.62) { a.x += (ex / e) * (0.62 - e) * 0.6; a.z += (ez / e) * (0.62 - e) * 0.6; } }
    }
    if (a.y > 0 || a.vy > 0) { a.vy -= G.JUMP_G * (a.vy < 0 && G.VM.six && G.VM.role[a.id] === 'MB' && G.vmPro(a) ? 0.6 : 1) * dt; a.y += a.vy * dt;   /* 企聯中間手：下降比較慢＝滯空久 */ if (a.y <= 0) { a.y = 0; a.vy = 0; a.tdFake = false; } }
    { const want = a.blk && a.y > 0.05 ? a.blk.bsZ || 0 : 0, d = want - (a.bs || 0); a.bs = (a.bs || 0) + G.clamp(d, -1.6 * dt, 1.6 * dt); }   // 攔網雙手往左右移（跟你一樣有速度上限）
  }
  function vmThreat(team) {
    const opp = 1 - team, B = G.VM.ball && G.vmBallL(G.VM.ball); if (!B) return null;
    const sdO = G.vmSide(opp); if (Math.sign(B.x) !== sdO && !(Math.abs(B.x) < 1.5 && Math.sign(B.vx) === sdO)) return null;   // 球要在對面（或剛要過網過去）
    if (G.VM.phase !== 'rally' || G.VM.touch.team !== opp || G.VM.touch.serve) return null;   // 球要是對面的（他們碰過、正在組織）：只是有人站在網前不算要攻擊
    for (const id of G.VM.team[opp]) {
      if (G.VM.ai.has(id)) { const q = G.VM.ai.get(id), P = G.VM.poss[opp]; if (P && P.attacker === id && P.stage === 2 && Math.abs(q.x) < 5) return { x: q.x, z: q.z, air: q.y > 0.05, id, fake: !!q.tdFake }; continue; }
      const pos = G.vmPos(id); if (!pos || Math.abs(pos.x) > 4.5) continue;
      const air = id === G.vmMe() ? !!(G.walk.air && !G.walk.air.block) : false, ballNear = Math.hypot(B.x - pos.x, B.z - pos.z) < 3 && B.y > 1.8;
      if (air || (ballNear && Math.abs(pos.x) < 4)) return { x: pos.x, z: pos.z, air, id };
    }
    return null;
  }
  function vmAiBlock(a, sd, b) {
    if (a.blk && a.y <= 0 && a.vy <= 0 && G.VM.t > a.blk.until) a.blk = null;
    const th = vmThreat(a.team);
    if (!th) { if (a.blk && a.y <= 0) a.blk = null; return !!a.blk; }
    // 一隊只派一個人攔：離攻擊手左右比較近、而且這一球還沒碰的人
    let lane = 0;
    if (G.VM.six) { if (!vm6BlockPick(a, th)) return false; lane = vmBlockLane(a, th); }   // 攔中固定在內側，邊翼固定在外側，不依當下誰站哪一邊交換
    else {
      if (G.VM.team[a.team].some((id) => !G.VM.ai.has(id) && (() => { const q = G.vmPos(id); return q && Math.abs(q.x) < 1.8; })())) return false;   // 真人隊友在網前：他攔，我退後防守
      const mates = G.VM.team[a.team].filter((id) => G.VM.ai.has(id)).map((id) => G.VM.ai.get(id));
      const pick = mates.sort((p, q) => Math.abs(p.z - th.z) + Math.abs(p.x) * 0.3 - (Math.abs(q.z - th.z) + Math.abs(q.x) * 0.3))[0];
      if (pick !== a) return false;
    }
    const L = G.vmLv(a);
    if (a.blkRoll !== G.VM.srvSeq * 100 + G.VM.touch.n + G.VM.touch.team * 10) { a.blkRoll = G.VM.srvSeq * 100 + G.VM.touch.n + G.VM.touch.team * 10; a.blkGo = G.gameRandom() < L.block; }
    if (!a.blkGo) return false;
    if (!a.blk) a.blk = { until: G.VM.t + 3 };
    a.tx = sd * 0.45; a.tz = G.clamp(th.z + lane + (G.gameRandom() - 0.5) * 0.1, -4.2, 4.2);
    if (a.blk.bsZ == null) { const cross = -Math.sign(th.z || (G.gameRandom() < 0.5 ? 1 : -1)); a.blk.bsZ = (G.gameRandom() < 0.65 ? cross : -cross) * (0.15 + G.gameRandom() * 0.3); }   // 雙手要往哪邊（球場座標的左右）：多半封往場中間的斜線
    // 攻擊手起跳後，過反應時間就跟著跳
    const bite = !th.fake || (a.blk.bite ??= G.gameRandom() < 1.15 - L.blockSkill);   // 時間差的假跳：程度越高越不會被騙
    if (th.air && bite && a.y <= 0 && a.vy <= 0 && !a.blk.jumped) { a.blk.jumpAt = a.blk.jumpAt || G.VM.t + Math.max(0, L.react * 0.6 + G.rkGauss() * (0.16 - 0.12 * L.blockSkill)); if (G.VM.t >= a.blk.jumpAt) { a.vy = aiJump(a, 4.0, 'block'); a.pose = 9; a.swingT = 0.9; a.blk.jumped = true; a.blk.until = G.VM.t + 1.2; } }   // 起跳時機有誤差：程度低的常常跳早或跳晚
    if (!th.air) a.blk.jumpAt = 0;
    return true;
  }
  function vmAiRole(a, P, B, sd) {
    const st = P.stage;
    if (G.VM.touch.team === a.team && G.VM.touch.last === a.id && G.VM.touch.n > 0) { if (G.VM.six) { const f = vm6Spot(a.team, a.id, 'attack'); a.tx = f.x; a.tz = f.z; } else if (st === 1 && P.setter !== a.id) { a.tx = G.vmSide(a.team) * 4.0; a.tz = G.clamp(a.z, -3.5, 3.5); } return; }   // 接完球退到網後 4 m 準備助跑
    const hand = () => { const [x, z] = G.vmW(a.x, a.z); return new G.THREE.Vector3(x, a.y + 2.4, z); };
    if (st === 0 && P.passer === a.id) {           // 接球：跑到球落到 0.85 m 的地方後面
      const p = G.vmPredL(B, 0.85); if (p) { a.tx = p.x + sd * 0.4; a.tz = p.z; }
      const dh = Math.hypot(B.x - a.x, B.z - a.z);
      if (dh < (G.VM.six && G.VM.touch.blk && G.VM.touch.team !== a.team ? 1.4 : 1.05) && B.y < 1.5 && B.y > 0.3) {   // 被攔回來的球：蹲在旁邊 cover 的人撲得比較遠
        const vin = Math.hypot(B.vx, B.vy, B.vz), fast = vin > 15, L = G.vmLv(a), onLine = dh < 0.55 - 0.25 * G.clamp((vin - 10) / 15, 0, 1);   // 有沒有站在球路上（越重容許偏差越小）
        if (fast && G.gameRandom() < L.miss * (onLine ? 0.7 : 1.3)) { a.reactAt = G.VM.t + 1.2; return; }   // 重扣沒接到
        if (fast && !onLine) {   // 沒對到球路：撲過去撈，球高高的落在自己附近（往場中間一點），讓隊友修正
          const dz = (B.z - a.z) * sd;
          vmAiTouch(a, sd * G.clamp(Math.abs(a.x) - 0.5, 2.2, 7), a.z * 0.6, 1.0, 1.5, 0.8 + L.passErr, 'bump', Math.abs(dz) < 0.35 ? 10 : dz > 0 ? 11 : 12); a.swingT = 1.25; return;
        }
        let tlx = sd * 1.8, tlz = G.VM.six ? -sd * 0.9 + (G.gameRandom() - 0.5) * 1.2 : (G.gameRandom() - 0.5) * 2, ty = 2.4, T = 1.35;   // 6 對 6 傳到舉球點（網前偏右）
        const flt = G.VM.ball && G.VM.ball.float ? 1 + G.VM.ball.float.a / 8 : 1;   // 飄球：越飄越難接
        const d = G.vbHardDefl(vin, 1 - L.passErr * 0.5, onLine, B.vz, 0.6 + 0.6 * L.passErr);   // 重球被推走（站到位也會，程度越高越會卸力）
        if (G.gameRandom() < 0.012 + 0.05 * L.passErr) { vmAiTouch(a, sd * 0.05, a.z * 0.5 + G.rkGauss() * 0.6, 1.8, 0.8, 0.2, 'bump', 3, true); return; }   // 接過頭：撞到網子
        if (d && 1.8 + d.dx < 0.3) { vmAiTouch(a, -sd * (2 + G.gameRandom() * 4), (G.gameRandom() - 0.5) * 5, G.BALL_R, 1.5, 0.5, 'bump', 3); return; }   // 太衝：直接回對面
        if (d) { tlx = sd * (1.8 + d.dx); tlz += d.dz; ty += d.dy; T += d.dT; }
        vmAiTouch(a, tlx, tlz, ty, T, L.passErr * (fast ? 1.3 : 1) * flt, 'bump', 3);
      }
    } else if (P.setter === a.id && st <= 1) {      // 舉球：先到網前，球傳過來就跑到它下面
      if (st === 0) { a.tx = sd * (G.VM.six ? 1.1 : 1.4); a.tz = G.VM.six ? -sd * 1.0 : 0; return; }
      const pHi = G.vmPredL(B, 2.2), pLo = pHi ? null : G.vmPredL(B, 1.0), p = pHi || pLo; if (p) { a.tx = p.x + sd * 0.25; a.tz = p.z; }
      const dh = Math.hypot(B.x - a.x, B.z - a.z);
      if (!pHi && dh < 1.2 && B.y < 1.5 && B.y > 0.35 && B.vy < 0 && G.VM.six) {
        vmAiSetAttack(a, P, B, vm6ChooseSet(a, B), true); return;
      }
      if (!pHi && dh < 1.2 && B.y < 1.5 && B.y > 0.35 && B.vy < 0) { const ap = G.vmPos(P.attacker) || { z: 0 }; vmAiTouch(a, sd * 1.2, G.clamp(ap.z, -3.6, 3.6), 2.9, 1.3, G.vmLv(a).setErr * 1.5, 'set', 3); return; }   // 傳得太低：低手墊舉
      const activeCall = a.team === G.vmTeamOf(G.vmMe()) && G.VM.call && G.VM.t - G.VM.call.t < 8 ? G.VM.call : null;
      const qmb = G.VM.six && !G.vmSmallCount() && (!activeCall || (activeCall.n === 2 && activeCall.v !== 'high3')) && !P.fix && (!P.grade || P.grade === 'A') ? vm6AirMB(a.team, a.id) : null, early = !!qmb && dh < 1.45 && B.y < 3.8 && B.y > 1.8;
      if (early && B.y > 2.9 && a.y <= 0 && a.vy <= 0) { a.vy = aiJump(a, 2.6, 'set'); }   // 球還很高：舉球員跳起來舉
      if (early || (dh < 1.25 && B.y < 3.1 && B.y > 1.5 && B.vy < 1.5)) {
        if (G.vmPro(a) && !P.dumpChk && !P.fix && Math.abs(a.x) < 1.8 && (!G.VM.six || G.vm6Front(a.id)) && B.y > 2.0) {   // 企聯技能：舉球員跳起來雙手往右推，貼網吊到對面三米線中間（每波最多想一次）
          P.dumpChk = true;
          if (G.gameRandom() < 0.14) {
            if (a.y <= 0 && a.vy <= 0) a.vy = aiJump(a, 2.6, 'set');
            const netH = G.NETS[G.state.net].h, f = G.clamp(Math.abs(B.x) / (Math.abs(B.x) + 3), 0.05, 0.95), base = B.y + (G.BALL_R - B.y) * f, T = Math.max(0.55, Math.sqrt(Math.max(0.02, netH + G.BALL_R + 0.12 - base) / (4.9 * f * (1 - f))));
            vmAiTouch(a, -sd * 3, (G.gameRandom() - 0.5) * 0.6, G.BALL_R, T, 0.05, 'tip', 2, true); return;
          }
        }
        let ap = G.vmPos(P.attacker) || { z: 0 }, call = a.team === 0 && G.VM.call && G.VM.t - G.VM.call.t < 8 ? G.VM.call.n : 0, pick = null;
        const callV = call ? G.VM.call.v : null, mb3 = callV === 'high3' && G.VM.six ? G.VM.team[a.team].find((id) => id !== a.id && G.VM.role[id] === 'MB' && G.vm6Front(id)) : null;   // 喊平球／3 號位高球
        if (G.VM.six) { pick = mb3 ? { n: 2, id: mb3 } : early ? { n: 2, id: qmb.id } : vm6ChooseSet(a, B); if (mb3) G.VM.call = null; call = pick.n; ap = G.vmPos(pick.id) || ap; if (early && G.VM.call) G.VM.call = null; } else if (call) G.VM.call = null;
        if (G.VM.six && pick && (G.vmSmallCount() || !G.vm6Front(pick.id))) { vmAiSetAttack(a, P, B, pick, false); return; }
        // 修正球：傳得不到位（C）、離網太遠、或不是舉球員在舉（舉球員追不到、第一球是他接的）→ 又高又慢的高球到兩邊（大多 4 號位），比較不準
        const far = Math.max(0, Math.abs(a.x) - 2.6), fixS = !early && call !== 2 && (P.fix || far > 0.8 || (G.VM.six && !G.vmSmallCount() && G.VM.role[a.id] !== 'S' && !G.vmPro(a)));   // 小人數沒有專職舉球員：誰舉都照正常舉
        if (fixS) {
          const e = G.vmLv(a).setErr * (G.VM.six && !G.vmSmallCount() && G.VM.role[a.id] !== 'S' ? 2.2 : 1.3) * (1 + 0.15 * far), lz = G.VM.six ? (call === 3 ? -sd : sd) * 3.0 : G.clamp(ap.z, -3.3, 3.3);
          vmAiTouch(a, sd * 1.3, lz, 3.1, 1.45 + far * 0.06, e, 'set', far > 2.5 || B.y < 1.6 ? 3 : 2);
          P.fix = true; if (pick && P.stage === 2) P.attacker = pick.id;
          return;
        }
        // 有喊球就照喊的舉：快攻＝在舉球員旁邊、又低又快；4 號位／2 號位＝高球到兩邊；沒喊就舉到攻擊手那邊
        if (call === 2 && callV === 'high3') { vmAiTouch(a, sd * 1.0, G.VM.six ? G.clamp(ap.z, -1.2, 1.2) : 0, 2.95, 1.1, G.vmLv(a).setErr, 'set', 2); P.td = true; }   // 3 號位高球：打時間差
        else if (call === 2 && G.VM.six) vmAiTouch(a, sd * G.clamp(Math.abs(ap.x ?? 1) - 0.1, 0.7, 1.4), G.clamp(ap.z, a.z - 1.6, a.z + 1.6), 3.05, 0.19, G.vmLv(a).setErr * 0.4, 'set', 2);   // 6 對 6 快攻：又低又快直接送到已經跳起來的中間手手上
        else if (call === 2) vmAiTouch(a, sd * 0.75, G.clamp(ap.z, a.z - 1.5, a.z + 1.5), 2.95, 0.32, G.vmLv(a).setErr * 0.6, 'set', 2);
        else if (call === 1 || call === 3) { const flat = callV ? callV === 'flat' : G.gameRandom() < (G.vmLv(a).flat || 0); vmAiTouch(a, sd * 1.0, (call === 1 ? sd : -sd) * 3.3, 2.95, flat ? 0.82 : 1.2, G.vmLv(a).setErr, 'set', 2); }   // 平球：又平又快（喊的照喊，沒喊照程度自己選）
        else if (call === 6) { vmAiTouch(a, sd * 1.0, G.clamp(ap.z, -1.2, 1.2), 2.95, 1.1, G.vmLv(a).setErr, 'set', 2); P.td = true; }   // 3 號位高球：打時間差
        else if (call === 4) vmAiTouch(a, sd * 3.6, 0, 3.0, 1.2, G.vmLv(a).setErr, 'set', 2);
        else if (call === 5) vmAiTouch(a, sd * 3.6, -sd * 3.0, 3.0, 1.3, G.vmLv(a).setErr, 'set', 2);
        else if (call === 7) vmAiTouch(a, sd * 3.6, sd * 3.0, 3.0, 1.3, G.vmLv(a).setErr, 'set', 2);   // 後排 5 號位（左邊後排攻擊）   // 右邊後排攻擊（舉對在後排時）
        else vmAiTouch(a, sd * 1.0, G.clamp(ap.z, -3.6, 3.6), 2.85, G.gameRandom() < (G.vmLv(a).flat || 0) ? 0.85 : 1.25, G.vmLv(a).setErr, 'set', 2);   // 2 對 2：照程度有時舉平球
        if (pick && G.VM.poss[a.team] && G.VM.poss[a.team].stage === 2) G.VM.poss[a.team].attacker = pick.id;
      }
    } else if (P.attacker === a.id && st === 2) {
      if (P.td && !P.tdDone && (G.VM.role || {})[a.id] === 'MB' && a.y <= 0 && a.vy <= 0) { P.tdDone = true; a.vy = aiJump(a, 2.0, 'jump'); a.pose = 5; a.tdFake = true; return; }   // 時間差：先小跳假裝打快攻（騙攔網），落地再照高球的時間助跑起跳   // 攻擊：照球掉到 2.8 m 的時間倒推——先在助跑起點等，時間到就三步衝進去，踩到起跳點剛好起跳（不會跑進去站著等）
      const p = G.vmPredL(B, 2.8);
      if (a.runFor !== P) { a.runFor = P; a.run = false; }
      if (p && a.y === 0) {
        let tx = p.x + sd * 0.55; if (G.VM.six && !G.vm6Front(a.id)) tx = sd * Math.max(3.25, tx * sd);   // 後排攻擊（6 對 6）：在 3 公尺線後起跳
        const tz = p.z, uz = G.clamp((a.z - tz) * 0.35, -0.6, 0.6), un = Math.hypot(1, uz), sx = tx + (sd / un) * 2.8, sz = tz + (uz / un) * 2.8;   // 助跑起點：起跳點往後（斜斜的從場內）2.8 m＝三步
        const dT = Math.hypot(a.x - tx, a.z - tz), tUp = 4.7 / G.JUMP_G, wait = p.t - tUp - dT / 4.8;   // 起跳到最高點的時間（約 0.5 秒）；助跑約每秒 4.8 m
        if (!a.run && wait > 0.04) { a.tx = sx; a.tz = sz; a.appr = false; }
        else { a.run = true; a.tx = tx; a.tz = tz; a.appr = true; }
        if (a.run && (dT < 0.45 || p.t < tUp)) { a.vy = aiJump(a, 4.7, 'jump'); a.pose = 5; a.appr = false; a.run = false; a.vx *= 0.25; a.vz *= 0.25; }   // 踩到起跳點就跳：衝的速度大多變成高度，空中只往前飄一點
      }
      const H = hand();
      if (b2d(H) < 1.0 && B.y > 2.0) vmAiSpike(a, sd);
      else if (!p && B.y < 1.6 && Math.hypot(B.x - a.x, B.z - a.z) < 1.1) vmAiFree(a, sd);   // 舉得太低：推過去
    } else if (st >= 1 && st < 3 && G.VM.touch.last !== a.id && (!G.VM.six || (st === 2 && !P.attacker))) {   // 其他情況（例如隊友沒接好）：不是剛碰過球的人去救（同一人不能連碰兩下）
      const p = G.vmPredL(B, 1.0); if (p) { a.tx = p.x + sd * 0.4; a.tz = p.z; }
      if (Math.hypot(B.x - a.x, B.z - a.z) < 1.0 && B.y < 1.3 && B.y > 0.3 && B.vy < 0) vmAiFree(a, sd);
    }
    function b2d(H) { return G.VM.ball.m.position.distanceTo(H); }
  }
  function vmAiOwnSide(a) { const [lx] = G.vmL(G.VM.ball.m.position.x, G.VM.ball.m.position.z); return lx * G.vmSide(a.team) > -0.02; }
  function aiEff(a) { return 0.8 + 0.2 * G.clamp((a.sta ?? 1) / 0.3, 0, 1); }
  function aiPay(a, kind) { const f = aiEff(a); a.sta = Math.max(0, (a.sta ?? 1) - G.staCost(kind, a.id)); return f; }
  function aiJump(a, vy, kind) {
    const v = vy * (0.4 + 0.6 * aiPay(a, kind));
    if (G.VM.host && a.y <= 0 && a.vy <= 0 && v > 0) {
      const [jx, jz] = G.vmW(a.x, a.z);
      a.jp = { s: (a.jp?.s || 0) + 1, vy: v, g: G.JUMP_G, down: G.VM.six && G.VM.role[a.id] === 'MB' && G.vmPro(a) ? 0.6 : 1, t: G.VM.t, x: +jx.toFixed(2), z: +jz.toFixed(2) };
      if (G.NET.on) G.NET.forceSt = true;
    }
    return v;
  }
  function vmAiTouch(a, tlx, tlz, ty, T, err, kind, pose, free = false, backSet = false) {
    if (!vmAiOwnSide(a)) return;
    if (!free && (kind === 'set' || (kind === 'bump' && ty > 1)) && tlx * G.vmSide(a.team) < 0.7) tlx = G.vmSide(a.team) * 0.7;   // 傳、舉都留在自己這邊（free＝接過頭撞網那種）
    let targetX = tlx + G.rkGauss() * err * 0.5, targetZ = tlz + G.rkGauss() * err;
    if (kind === 'set' && (backSet || G.vmSmallCount() === 3)) { targetX = G.vmSide(a.team) * G.clamp(targetX * G.vmSide(a.team), 4.2, 8.0); targetZ = G.clamp(targetZ, -3.3, 3.3); }   // 所有人數的後排舉球：誤差也不能把球帶進 3 公尺線
    const b = G.VM.ball, [wx, wz] = G.vmW(targetX, targetZ), [ax0, az0] = G.vmW(a.x, a.z);
    const p = b.m.position.clone().lerp(new G.THREE.Vector3(ax0, a.y + (kind === 'set' ? 2.35 : 0.75), az0).lerp(b.m.position, 0.25), 0.65);
    b.mine = false; b.setT = kind === 'set' ? performance.now() : 0; aiPay(a, kind === 'set' ? 'set' : 'bump');
    a.pose = pose; a.swingT = 0.4; a.reactAt = G.VM.t + 0.25;
    G.vbLaunch(b, p, new G.THREE.Vector3((wx - p.x) / T, (ty - p.y) / T + 4.9 * T, (wz - p.z) / T), kind, 0.85);
    if (kind === 'set') G.vbMarkSet(b);
    G.vmOnTouch(b, a.id, kind);
  }
  function vmPickGap(a, sd, x0, x1, zMax) {
    const opp = G.vmOppPos(a.team), L = G.vmLv(a); let best = null;
    for (let i = 0; i < 12; i++) {
      const tx = -sd * (x0 + G.gameRandom() * (x1 - x0)), tz = (G.gameRandom() - 0.5) * 2 * zMax, d = Math.min(9, ...opp.map((q) => Math.hypot(q.x - tx, q.z - tz)));
      const score = d + G.rkGauss() * (1.2 - L.blockSkill) * 1.5;
      if (!best || score > best.score) best = { tx, tz, score, d };
    }
    return best;
  }
  function vmAiSpike(a, sd) {
    if (!vmAiOwnSide(a)) return;
    const b = G.VM.ball, r = G.gameRandom(), L = G.vmLv(a), [ax0, az0] = G.vmW(a.x - sd * 0.25, a.z), p = b.m.position.clone().lerp(new G.THREE.Vector3(ax0, a.y + 2.45, az0), 0.7);
    const gap = vmPickGap(a, sd, 2.5, 8.3, 3.9), netGuard = G.vmOppPos(a.team).some((q) => Math.abs(q.x) < 2.5);
    const fixB = !!(G.VM.poss[a.team] && G.VM.poss[a.team].fix), Lo = L.out * (fixB ? 1.6 : 1), Lt = L.tip + (fixB ? 0.08 : 0), Ln = L.net * (fixB ? 1.6 : 1);   // 修正球：打不重、出界掛網多、常常吊
    let tx = gap.tx, tz = gap.tz, spd = (L.spike[0] + G.gameRandom() * (L.spike[1] - L.spike[0])) * (0.6 + 0.4 * aiEff(a)) * (fixB ? 0.85 : 1), tip = false;
    const mix = G.gameRandom();
    const sup = L.pro && !fixB && G.VM.six && G.ROLE_SUPER[G.VM.role[a.id]] && G.gameRandom() < 0.25 ? G.ROLE_SUPER[G.VM.role[a.id]] : null;   // 企聯技能：大砲／舉對打到紫色區
    if (sup) { spd = L.spike[1] * sup.pw * (0.6 + 0.4 * aiEff(a)); const g2 = vmPickGap(a, sd, 2.5, 6.5, 3.9); tx = g2.tx; tz = g2.tz; }
    else if (!fixB && mix < L.sweet * 0.6) { spd = L.spike[1] * 1.1 * (0.6 + 0.4 * aiEff(a)); const g2 = vmPickGap(a, sd, 2.5, 6, 3.9); tx = g2.tx; tz = g2.tz; }   // 蓄到甜蜜點的重扣：又重又釘
    else if (mix > 0.9) { spd = 12 + G.gameRandom() * 2.5; const g2 = vmPickGap(a, sd, 6.5, 8.2, 3.9); tx = g2.tx; tz = g2.tz; }   // 輕打：吊到後場深角
    if (r < Lo) { if (G.gameRandom() < 0.5) tx = -sd * (9.5 + G.gameRandom() * 1.8); else tz = Math.sign(tz || 1) * (4.8 + G.gameRandom() * 1.2); }
    else if (!netGuard && r < Lo + Lt) { tip = true; tx = -sd * (1.5 + G.gameRandom() * 1.5); }   // 網前沒人才吊，吊在網後
    if (!tip && r >= Lo) {
      const bl = vmBlockerFacing(a);
      if (bl) {
        const rc = G.gameRandom(), side = Math.sign(bl.z) || (G.gameRandom() < 0.5 ? 1 : -1), f = Math.max(0.15, Math.abs(a.x) / (Math.abs(a.x) + Math.abs(tx)));
        if (rc < 0.15 + 0.35 * L.blockSkill) { tz = G.clamp(a.z + (bl.z + side * 0.55 - a.z) / f, -4.4, 4.4); spd = Math.max(spd, L.spike[1] * 0.95); }   // 打手出界：瞄外側那隻手、用力，落點壓邊線
        else if (rc < 0.45 + 0.35 * L.blockSkill) tz = G.clamp(a.z + (bl.z - side * 1.0 - a.z) / f, -4.2, 4.2);   // 繞手：打攔網沒封到的裡面那邊
      }
    }
    const [wx, wz] = G.vmW(tx, tz);
    let v;
    if (tip) { const T = 0.85; v = new G.THREE.Vector3((wx - p.x) / T, (G.BALL_R - p.y) / T + 4.9 * T, (wz - p.z) / T); }
    else {
      v = G.vbShotVel(p, wx, wz, spd);
      const netY = (vv) => { for (let t = 0.01; t < 2; t += 0.01) { const [l] = G.vmL(p.x + vv.x * t, p.z + vv.z * t); if (Math.sign(l) !== sd) return p.y + vv.y * t - 4.9 * t * t; } return 99; };
      // 過網：先往深處打（速度不變），還不夠才放慢一點；不會變成慢慢飄過去的球
      if (r > Lo + Lt + Ln || (netGuard && r >= Lo && r < Lo + Lt)) { let sp2 = spd; for (let i = 0; i < 12 && netY(v) < G.NETS[G.state.net].h + G.BALL_R + 0.08; i++) { if (i < 6 && Math.abs(tx) < 8.4) tx -= sd * 0.6; else sp2 *= 0.92; const w2 = G.vmW(tx, tz); v = G.vbShotVel(p, w2[0], w2[1], sp2); } }
    }
    b.mine = false; a.pose = 4; a.swingT = 0.35; aiPay(a, tip ? 'tip' : 'spike');
    G.vbLaunch(b, p, v, tip ? 'tip' : 'spike', 0.85);
    G.vmOnTouch(b, a.id, tip ? 'tip' : 'spike');
  }
  function vmLetGo(team, b) {
    if (!b) return false;
    const B = G.vmBallL(b), gE = 9.8 - (b.acc ? b.acc.y : 0), d = B.vy * B.vy + 2 * gE * (B.y - G.BALL_R); if (d < 0) return false;
    const t = (B.vy + Math.sqrt(d)) / gE, lx = B.x + B.vx * t, lz = B.z + B.vz * t;   // 落地點（有上旋的下墜比較快）
    if (Math.sign(lx) !== G.vmSide(team)) return false;
    const key = G.VM.srvSeq * 1000 + G.VM.touch.n * 10 + (G.VM.touch.team + 1) + (G.VM.touch.blk ? 500 : 0);
    const C = G.VM.letGo || (G.VM.letGo = [{}, {}]);
    if (C[team].key !== key) { const ids = G.VM.team[team].filter((id) => G.VM.ai.has(id)), L = ids.length ? G.vmLv(G.VM.ai.get(ids[0])) : G.VM_LEVELS[2]; C[team] = { key, noise: G.rkGauss() * (L.judge ?? 0.3) * 0.5, v: false }; }
    const c = C[team], outBy = Math.max(Math.abs(lx) - 9, Math.abs(lz) - 4.5) - G.BALL_R + c.noise - (b.float ? 0.6 : 0);   // 飄球不好預測：靠近邊線的保守接
    c.v = outBy > 0 && G.VM.touch.team !== team;   // 對面打的／發球（含被對方攔網碰回來的）：放掉；自己隊碰過的（含自己攔網碰出去的 touch out）：去追救
    return c.v;
  }
  function vmBlockerFacing(a) {
    for (const id of G.VM.team[1 - a.team]) {
      const o = G.VM.ai.get(id), q = o ? { x: o.x, z: o.z } : G.vmPos(id); if (!q || Math.abs(q.x) > 1.5 || Math.abs(q.z - a.z) > 1.4) continue;
      if (o ? o.y > 0.05 : id === G.vmMe() ? !!(G.walk.air && G.walk.air.block) : ((G.NET.peers.get(id) || {}).y || 0) > 0.3) return q;   // 真的跳起來攔網才算
    }
    return null;
  }
  function vmAiFree(a, sd) { const g = vmPickGap(a, sd, 5.5, 8.2, 3.6); vmAiTouch(a, Math.abs(g.tx) * -sd, g.tz, G.BALL_R, 1.45, 0.8, 'bump', 3); }
  function vm6Spot(team, id, mode) {
    if (G.vmSmallCount() > 1 && mode === 'attack') { const k = Math.max(0, G.vm6Idx(id)), z = CourtFormations.get(G.vmSmallCount())[k], P = G.VM.poss[team]; if (P && P.setter === id) return G.vm6P(team, 0.9, -1.0); return z.front ? G.vm6P(team, 3.6, G.clamp(z.L, -3.4, 3.4)) : G.vm6P(team, 6.3, G.clamp(z.L, -3.2, 3.2)); }   // 小人數：舉球的人到舉球點，前排退到 3.6 m、後排退到 6.3 m 準備攻擊
    if (G.vmSmallCount()) { const k = G.vm6Idx(id); return mode === "serve" && team === G.VM.srvTeam && k === 0 ? G.vm6P(team,9.8,G.vmSmallCount() === 1 ? 0 : CourtFormations.get(G.vmSmallCount())[0].L) : G.vm6P(team,...CourtFormations.home(G.vmSmallCount(),Math.max(0,k))); } // WEB003B
  
    const k = G.vm6Idx(id), r = G.VM.role[id], front = k >= 1 && k <= 3;
    if (k < 0) return G.vm6P(team, 6, 0);
    if (G.VM.tactics === 'rotation') {
      if (mode === 'serve') return G.vm6P(team, ...(team === G.VM.srvTeam && k === 0 ? [9.8,-2.2] : G.V6_BASE[k]));
      if (mode === 'attack' && G.VM.poss[team]?.setter === id) return G.vm6P(team,.9,0);
      return G.vm6P(team, front ? (mode === 'attack' ? 3.8 : mode === 'cover' ? 3.4 : 1.8) : 6.8, G.V6_BASE[k][1]);
    }
    if (mode === 'serve') {
      if (team === G.VM.srvTeam) return k === 0 ? G.vm6P(team, 9.8, -2.2) : G.vm6P(team, ...G.V6_BASE[k]);
      return vm6RecvForm(team)[id] || G.vm6P(team, ...G.V6_BASE[k]);
    }
    if (mode === 'attack') {   // 舉球員到舉球點；前排攻擊手退到助跑起點（主攻左、中間手在舉球員旁、舉對右）；後排主攻準備後排攻擊；其他人補位
      if (G.VM.poss[team]?.setter === id) return G.vm6P(team, 0.9, -1.0);
      if (r === 'S') return G.vm6P(team, front ? 3.8 : 5.8, -2.4);   // S 接了第一球、交給 OP 舉：退開，不能再搶舉球點
      if (front) return r === 'MB' ? G.vm6P(team, 2.6, 0.6) : r === 'OH' ? G.vm6P(team, 3.8, 3.2) : G.vm6P(team, 3.8, -3.2);   // 中間手在舉球員左後方準備快攻（不擋舉球員跑位）
      if (r === 'OH') return G.vm6P(team, 6.4, 0);
      return r === 'MB' ? G.vm6P(team, 5.4, 2.4) : G.vm6P(team, 5.4, -2.4);
    }
    // 防守：前排照專長站（主攻左、中間手中、舉對或前排的舉球員右）；後排：主攻中後、中間手左後、舉球員和舉對右後
    if (front) { const L = r === 'OH' ? 3 : r === 'MB' ? 0 : -3; return G.vm6P(team, mode === 'cover' && r !== 'MB' ? 3.4 : r === 'MB' ? 1.2 : 2.0, L); }
    return r === 'S' ? G.vm6P(team, 6.6, -2.6) : r === 'OH' ? G.vm6P(team, 7.6, 0) : r === 'MB' ? G.vm6P(team, 6.9, 2.8) : G.vm6P(team, 6.9, -2.8);
  }
  function vm6RecvForm(team) {
    const key = G.VM.srvSeq * 2 + team; if (G.VM.formC && G.VM.formC[key]) return G.VM.formC[key];
    const rot = G.VM.rot[team], out = {}, P = [];
    for (let k = 0; k < 6; k++) {
      const id = rot[k], r = G.VM.role[id], front = k >= 1 && k <= 3;
      if (r === 'S') { out[id] = { d: front ? 0.8 : 0, L: G.V6_BASE[k][1] * 0.5 }; continue; }
      if (front && (r === 'MB' || r === 'OPP')) { out[id] = { d: 1.0, L: G.V6_BASE[k][1] }; continue; }
      P.push(k);
    }
    P.sort((p, q) => G.V6_BASE[q][1] - G.V6_BASE[p][1] || p - q);
    P.forEach((k, i) => { out[rot[k]] = { d: k >= 1 && k <= 3 ? 4.6 : 6.9, L: P.length > 1 ? 3.2 - (6.4 * i) / (P.length - 1) : 0 }; });
    for (const [b, f] of [[0, 1], [5, 2], [4, 3]]) { const B = out[rot[b]], F = out[rot[f]]; if (B.d < F.d + 0.5) B.d = F.d + 0.6; }   // 前後不能越位
    for (const row of [[1, 2, 3], [0, 5, 4]]) {   // 左右不能越位：同一排的左右位置照號位由右到左重新分配（2→3→4、1→6→5）
      const Ls = row.map((k) => out[rot[k]].L).sort((x, y) => x - y); row.forEach((k, i) => { out[rot[k]].L = Ls[i]; });
      for (let i = 1; i < 3; i++) if (out[rot[row[i]]].L < out[rot[row[i - 1]]].L + 0.4) out[rot[row[i]]].L = out[rot[row[i - 1]]].L + 0.4;
    }
    const m = {}; for (const id of rot) m[id] = G.vm6P(team, out[id].d, out[id].L);
    if (!G.VM.formC) G.VM.formC = {}; G.VM.formC[key] = m; return m;
  }
  function vm6GoSpot(sp) {
    if (!sp || !G.VM.on) return;
    const [x, z] = G.vmW(sp[0], sp[1]), [ax, az] = G.vmW(0, sp[1]); G.walk.x = x; G.walk.z = z; G.vbClearAir(); G.walk.vel = [0, 0];
    G.walk.yaw = Math.atan2(-(ax - x), -(az - z)); G.walk.pitch = 0.05;
    if (G.vmSmallCount()) { G.toast(G.vmSmallLabel(G.vmMe()),1600); return; } // WEB003B
    const k = G.vm6Idx(G.vmMe()); if (k >= 0) G.toast(`你在 ${k + 1} 號位（${k >= 1 && k <= 3 ? '前排' : '後排'}・${G.V6_NAME[G.VM.role[G.vmMe()]]}）`, 1600);
  }
  function vm6Possession(team, B) {
    if (G.vmSmallCount()) return vmSmallPossession(team,B); // WEB003B
  
    if (G.VM.poss[team]) return G.VM.poss[team];
    const p = G.vmPredL(B, 0.9); if (!p) return null;
    let best = null;
    for (const id of G.VM.team[team]) {
      const a = G.VM.ai.get(id), q = a ? { x: a.x, z: a.z } : G.vmPos(id); if (!q) continue;
      const r = G.VM.role[id], dq = Math.hypot(q.x - p.x, q.z - p.z), cost = dq + (r === 'S' && dq > 1.3 ? 3 : 0) + (G.vm6Front(id) && (r === 'MB' || r === 'OPP') ? 1.2 : 0) + (a && (a.blk || a.y > 0.05) ? 6 : 0);
      if (!best || cost < best.cost) best = { id, cost };
    }
    if (!best) return null;
    G.VM.poss[team] = { stage: 0, passer: best.id, setter: vm6SetterFor(team, best.id), attacker: null };
    return G.VM.poss[team];
  }
  function vm6SetterFor(team, passer) {
    { const pr = vmProSetter(team, passer); if (pr) return pr; }   // 企聯：誰離舉球點近誰舉
    if (G.vmSmallCount() > 1 || G.VM.tactics === 'rotation') {
      const order = G.vmPositionSetters(team);
      return order.find(id => id !== passer) || null;
    }
    const s = G.VM.team[team].find((id) => G.VM.role[id] === 'S'); if (s && s !== passer) return s;
    return G.VM.team[team].find((id) => id !== passer && G.VM.role[id] === 'OPP') || G.VM.team[team].find((id) => id !== passer && G.vm6Front(id)) || G.VM.team[team].find((id) => id !== passer);   // 舉球員自己接了第一球：舉對或前排的人來舉
  }
  function vm6AttackerFor(team, b, setterId) {
    const sp = G.vmPredL(G.vmBallL(b), 2.8); if (!sp) return null;
    const sd = G.vmSide(team); let best = null;
    for (const id of G.VM.team[team]) {
      if (id === setterId) continue;
      const q = G.vmPos(id); if (!q) continue;
      if (!G.vm6Front(id) && sp.x * sd < 2.9) continue;
      const cost = Math.hypot(q.x - sp.x, q.z - sp.z) * (G.VM.ai.has(id) ? 1 : 0.6) + (G.VM.role[id] === 'S' ? 4 : 0);
      if (G.VM.role[id] === 'S' && G.vmProLv()) { if (!best || cost - 4 < best.cost) best = { id, cost: cost - 4 }; continue; }   // 企聯：舉球員也會打（不再避開 S）
      if (!best || cost < best.cost) best = { id, cost };
    }
    return best ? best.id : null;
  }
  function vm6AttackerByCall(team, n, setterId) {
    const ids = G.VM.team[team].filter((id) => id !== setterId), at = (role, front) => ids.find((id) => G.VM.role[id] === role && G.vm6Front(id) === front);
    if (n === 1) return at('OH', true) || null;
    if (n === 2 || n === 6) return at('MB', true) || null;
    if (n === 3) return at('OPP', true) || ids.find((id) => G.vm6Idx(id) === 1) || null;   // 2 號位（右前）
    if (n === 4) return at('OH', false) || null;
    if (n === 5) return at('OPP', false) || null;
    if (n === 7) return ids.find((id) => G.vm6Idx(id) === 4) || null;   // 後排 5 號位
    return null;
  }
  function vm6ChooseSet(a, B) {
    if (G.vmSmallCount()) return vmSmallChooseSet(a,B); // WEB003B
  
    const ids = G.VM.team[a.team].filter((id) => id !== a.id), at = (role, front) => ids.find((id) => G.VM.role[id] === role && G.vm6Front(id) === front);
    const Pg = G.VM.poss[a.team] || {}, oh = at('OH', true), mb = at('MB', true), opp = at('OPP', true), pipe = at('OH', false), good = Math.abs(B.x) < 2.6 && (!Pg.grade || Pg.grade === 'A'), opt = [];   // 快攻、後排攻擊只有到位球
    const oppB = opp ? null : at('OPP', false);   // 舉對在後排：右邊後排攻擊（3 公尺線後起跳）
    const mbAir = mb && (G.VM.ai.has(mb) ? G.VM.ai.get(mb).y > 0.02 || G.VM.ai.get(mb).vy > 0 : mb === G.vmMe() ? !!(G.walk.air && !G.walk.air.block) : ((G.NET.peers.get(mb) || {}).y || 0) > 0.3);   // 快攻要中間手先跳：舉球那一刻已經在空中才舉
    if (oh) opt.push([1, oh, 4]);
    if (mb && good && mbAir) opt.push([2, mb, G.VM.ai.has(mb) ? 9 : 4]);
    if (mb && good && !mbAir && G.VM.ai.has(mb)) opt.push([6, mb, 1.5]);   // 6＝3 號位高球（中間手沒先跳時）
    if (opp) opt.push([3, opp, 3]);
    if (oppB && good) opt.push([5, oppB, 2]);
    if (pipe && good) opt.push([4, pipe, 1.5]);
    { const p5 = ids.find((id) => G.vm6Idx(id) === 4); if (p5 && good) opt.push([7, p5, 0.35]); }   // 後排 5 號位：少量變化球，不能取代 OP／後排中間／老三
    if (G.vmPro(a)) for (const id of ids) if (G.vm6Front(id) && !opt.some((q) => q[1] === id)) { const k = G.vm6Idx(id); opt.push([k === 3 ? 1 : k === 1 ? 3 : 6, id, 1.5]); }   // 企聯：前排每個人都可能被舉（包含平常不攻擊的位置）
    if (Pg.fix || Math.abs(B.x) > 3.4) { const o2 = opt.filter((q) => q[0] === 1 || q[0] === 3).map((q) => [q[0], q[1], q[0] === 1 ? 5 : 2]); if (o2.length) opt.splice(0, opt.length, ...o2); }   // 修正球：只舉兩邊高球（大多 4 號位）
    if (!opt.length) return { n: 1, id: ids.find((id) => G.vm6Front(id)) || ids[0] };
    const call = a.team === G.vmTeamOf(G.vmMe()) && G.VM.call && G.VM.t - G.VM.call.t < 8 ? G.VM.call : null;
    if (call) { G.VM.call = null; const o = opt.find((q) => q[0] === call.n); if (o) return { n: o[0], id: o[1] }; }   // 喊的那球沒辦法舉（例如喊快攻但沒跳起來）就照平常選
    const human = opt.filter((q) => !G.VM.ai.has(q[1]));
    if (human.length && G.gameRandom() < 0.55) return { n: human[0][0], id: human[0][1] };
    let r = G.gameRandom() * opt.reduce((sum, q) => sum + q[2], 0);
    for (const q of opt) { r -= q[2]; if (r <= 0) return { n: q[0], id: q[1] }; }
    return { n: opt[0][0], id: opt[0][1] };
  }
  function vm6BlockPick(a, th) {
    if (G.vmSmallCount()) return vmSmallBlockers(a.team, th).includes(a.id); // WEB003B
  
    if (!G.vm6Front(a.id)) return false;
    // 前排三個人照現在站的位置：中間的人（中間手）一定上；再加攻擊手那一側的人——對面 4 號位打＝我方 2 號位＋3 號位，對面 2 號位打＝我方 4 號位＋3 號位
    const fr = G.VM.rot[a.team].slice(1, 4).map((id) => ({ id, q: G.vmPos(id) })).filter((o) => o.q);
    const mid = (G.VM.tactics === 'rotation' ? fr.find(o=>G.vm6Idx(o.id)===2) : fr.find((o) => G.VM.role[o.id] === 'MB')) || [...fr].sort((p, q) => Math.abs(p.q.z) - Math.abs(q.q.z))[0];
    if (!mid) return false; if (mid.id === a.id) return true;
    const side = fr.filter((o) => o.id !== mid.id).sort((p, q) => Math.abs(p.q.z - th.z) - Math.abs(q.q.z - th.z))[0];
    return !!side && side.id === a.id && Math.abs(side.q.z - th.z) < 3.4;
  }
  function vm6Nearest(team, B) {
    const p = G.vmPredL(B, 1.0) || B; let best = null;
    for (const id of G.VM.team[team]) { const a = G.VM.ai.get(id); if (!a || G.VM.touch.last === id) continue; const d = Math.hypot(a.x - p.x, a.z - p.z); if (!best || d < best.d) best = { id, d }; }
    return best ? best.id : null;
  }
  function vm6Brain(a, sd, b, live) {
    if (G.vmSmallCount() === 1) { vmSoloBrain(a,sd,b,live); return; } // WEB003B
  
    if (!live) return;
    if (vmAiBlock(a, sd, b)) return;
    const B = G.vmBallL(b), onMine = Math.sign(B.x) === sd, land = G.vmPredL(B, G.BALL_R);
    const sent = G.VM.touch.n >= 3 || b.lk === 'spike' || b.lk === 'tip' || b.lk === 'hit';   // 已經打過去了（第三下、攻擊）；舉球再快也還是自己的球
    const outgoing = G.VM.touch.team === a.team && sent && Math.sign(B.vx) === -sd && land && Math.sign(land.x) === -sd;
    // 球在對面時，只有「會落在我們這邊」的球（攻擊、推過來、發球）才算過來了；對面在傳、在舉的球不算
    const coming = !outgoing && (onMine || (Math.sign(B.vx) === sd && land && Math.sign(land.x) === sd)) && !(G.VM.touch.team === a.team && G.VM.touch.n >= 3) && !vmLetGo(a.team, b);   // 會出界的球放掉
    if (coming && !onMine && G.VM.touch.team !== a.team) G.VM.poss[a.team] = null;   // 還沒過網：誰接每一格照最新的落點重算，過網才定
    if (!coming) {
      const th = G.vm6Front(a.id) ? vmThreat(a.team) : null;
      const f = th ? vm6OffBlock(a, th) : vm6Spot(a.team, a.id, 'defense'); a.tx = f.x; a.tz = f.z;
      a.reactAt = G.VM.t + G.vmLv(a).react; if (G.VM.touch.team !== a.team) G.VM.poss[a.team] = null; return;
    }
    if (G.VM.touch.team !== a.team && G.VM.poss[a.team] && G.VM.poss[a.team].stage > 0) G.VM.poss[a.team] = null;   // 球剛從對面過來：重新分工
    const P = vm6Possession(a.team, B); if (!P) return;
    const st = P.stage, inv = (st === 0 && P.passer === a.id) || ((st === 1 || (st === 0 && G.VM.touch.serve)) && P.setter === a.id && G.VM.touch.last !== a.id) || (st === 2 && P.attacker === a.id) || (st === 2 && !P.attacker && vm6Nearest(a.team, B) === a.id);
    if (inv) { if (G.VM.t >= a.reactAt) vmAiRole(a, P, B, sd); return; }
    // 沒輪到碰球：發球還在飛＝留在接發球陣型；第一球還沒碰到＝守住位置；舉出去了＝圍到攻擊手旁邊 cover（被攔回來的球要救）；其他時候準備進攻
    if (st === 1 && G.VM.role[a.id] === 'MB' && G.vm6Front(a.id) && P.passer !== a.id && P.setter && P.setter !== a.id && vm6Quick(a, P, B, sd)) return;   // 舉球員是 AI 或真人都一樣：攔中先跳
    const f = st === 2 && P.attacker && P.attacker !== a.id ? vm6CoverSpot(a, P.attacker) : vm6Spot(a.team, a.id, G.VM.touch.serve ? 'serve' : st === 0 ? 'defense' : 'attack');
    a.run = false; a.appr = false;   // 接完球／沒被選為攻擊手時取消上一段助跑，正常補位
    if (f) { a.tx = f.x; a.tz = f.z; }
  }
  function vm6OffBlock(a, th) {
    if (G.vmSmallCount()) return vm6Spot(a.team,a.id,"defense"); // WEB003B
  
    const sd = G.vmSide(a.team), r = G.VM.role[a.id];
    if (r === 'MB') return G.vm6P(a.team, 1.6, G.clamp(th.z / sd, -1.5, 1.5));
    const L = Math.sign(a.z / sd || vm6Spot(a.team, a.id, 'defense').z / sd || 1) * 3.0;
    return G.vm6P(a.team, 3.0, L);
  }
  function vm6AirMB(team, setterId) {
    const id = G.VM.team[team].find((x) => x !== setterId && G.VM.role[x] === 'MB' && G.vm6Front(x) && G.VM.touch.last !== x); if (!id) return null;
    const left = (y, vy) => (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G.JUMP_G * y))) / G.JUMP_G;   // 還要多久落地：至少 0.35 秒才來得及（快要落地的不算）
    const a = G.VM.ai.get(id), air = a ? (a.y > 0.02 || a.vy > 0) && left(a.y, a.vy) > 0.35 : id === G.vmMe() ? !!(G.walk.air && !G.walk.air.block) && left(G.walk.air.y, G.walk.air.vy) > 0.35 : ((G.NET.peers.get(id) || {}).y || 0) > 0.5;
    return air ? { id } : null;
  }
  function vm6Quick(a, P, B, sd) {
    if (P.qk === undefined) P.qk = G.gameRandom() < (G.VM.ai.has(P.setter) ? 0.5 : 0.75) ? a.id : null;   // 真人舉球時攔中比較常先跳，讓你有快攻可以舉
    if (P.qk !== a.id) return false;
    const pr = G.vmPredL(B, G.VM.ai.has(P.setter) ? 2.3 : 2.0); if (!pr || Math.abs(pr.x) > 2.6) { P.qk = null; return false; }   // 真人舉球員在額頭前碰球（比較低）   // 傳得不到位：不打快攻
    if (a.y > 0) return true;
    if (P.qkJ) return false;   // 跳過了、落地了（舉球員沒舉給他）：照平常當誘敵、準備
    const tx = sd * Math.max(0.95, Math.abs(pr.x) - 0.1), tz = G.clamp(pr.z + sd * 0.9, -4, 4), D = Math.hypot(a.x - tx, a.z - tz);
    const tJ = 0.25;   // 球到舉球員手上前多久起跳（起跳到最高點約 0.5 秒、快攻球飛約 0.27 秒：舉出去時剛好快到最高點）
    if (!a.run && pr.t - tJ > D / 4.5 + 0.05) { a.tx = tx + sd * 2.0; a.tz = tz; a.appr = false; }
    else { a.run = true; a.tx = tx; a.tz = tz; a.appr = true; }
    if (a.run && pr.t < tJ) { a.vy = aiJump(a, 4.3, 'jump'); a.pose = 5; a.run = false; a.appr = false; a.vx *= 0.25; a.vz *= 0.25; P.qkJ = true; }
    return true;
  }
  function vm6CoverPlan(team, attId) {
    const P = G.VM.poss[team]; if (P?.cover?.att === attId && G.VM.t - P.cover.at < 0.15) return P.cover.map;
    const at = G.vmPos(attId); if (!at) return null;
    const sd = G.vmSide(team), lane = vmAttackLane(team, attId), contact = lane ? lane.b : at;
    const d0 = Math.abs(contact.x), L0 = contact.z / sd, back = !G.vm6Front(attId), mid = L0 >= 0 ? -1 : 1;
    const spots = back ? [[2.0, L0 + 2.1], [2.0, L0 - 2.1], [5.2, L0 + mid * 2.6], [7.3, 2.6], [7.3, -2.6]]
      : [[d0 + 1.3, L0 + 1.9], [d0 + 1.3, L0 - 1.9], [d0 + 3.4, L0 + mid * 2.4], [7.2, 2.6], [7.2, -2.6]];
    const edge = Math.abs(L0) >= 1.5 ? Math.sign(L0) : 0;
    const pts = spots.map(([d, L]) => {
      // 邊翼攻擊只在場內側與後方掩護：OH 左外側、OP 右外側不站人。
      if (edge) L = edge * Math.min(edge * L, Math.abs(L0) - 1.4);
      const q = G.vm6P(team, G.clamp(d, 1.0, 8.4), G.clamp(L, -4.2, 4.2));
      const safe = lane ? vmLaneClearPoint(q, lane) : q;
      if (edge && safe.z / sd * edge > Math.abs(L0) - .5) return G.vm6P(team, G.clamp(d, 1.0, 8.4), L0 - edge * 2.6);
      return safe;
    });
    const pos = {}; for (const id of G.VM.team[team]) if (id !== attId) { const q = G.vmPos(id); if (q) pos[id] = q; }
    const map = {}, free = pts.map((_, i) => i); let rest = Object.keys(pos);
    while (rest.length && free.length) {   // 每次挑「人到那一區」最近的一組配對
      let best = null; for (const id of rest) for (const i of free) { const d = Math.hypot(pos[id].x - pts[i].x, pos[id].z - pts[i].z); if (!best || d < best.d) best = { id, i, d }; }
      map[best.id] = pts[best.i]; rest = rest.filter((x) => x !== best.id); free.splice(free.indexOf(best.i), 1);
    }
    if (P) P.cover = { att: attId, map, at: G.VM.t };
    return map;
  }
  function vm6CoverSpot(a, attId) {
   const m = vm6CoverPlan(a.team, attId); return m && m[a.id] ? m[a.id] : null; }
  function vmSmallPossession(team,B) {
    if(G.VM.poss[team])return G.VM.poss[team];
    const p=G.vmPredL(B,G.BALL_R)||G.vmPredL(B,0.9);if(!p)return null;
    const sd=G.vmSide(team),k=CourtFormations.owner(G.vmSmallCount(),p.x*sd,p.z/sd),passer=G.VM.rot[team][k];
    return G.VM.poss[team]={stage:0,passer,setter:vm6SetterFor(team,passer),attacker:null};
  }
  function vmBlockLane(a, th) {
    const sd = G.vmSide(a.team), L = th.z / sd, edge = Math.sign(L) || 1;
    const small = G.vmSmallCount(), pair = small ? vmSmallBlockers(a.team, th) : null;
    if (pair?.length === 1) return 0;
    const inner = small ? pair[1] === a.id : G.VM.tactics === 'rotation' ? G.vm6Idx(a.id) === 2 : G.VM.role[a.id] === 'MB';
    if (!inner) return sd * edge * .4;
    let target = L - edge * .4;
    // 真人邊翼已經在網前時，攔中也不能跨過他的外側；保留約 0.7 m 接縫距離。
    for (const id of G.VM.team[a.team]) {
      if (id === a.id || G.VM.ai.has(id) || !G.vm6Front(id)) continue;
      const q = G.vmPos(id); if (!q || Math.abs(q.x) > 1.8 || q.z / sd * edge < .5 || Math.abs(q.z / sd - L) > 1.3) continue;
      target = edge * Math.min(target * edge, q.z / sd * edge - .7);
    }
    return sd * target - th.z;
  }
  function vmSmallBlockers(team, th) {
    const ids = G.VM.team[team].filter(id => G.vm6Front(id) && G.vmPos(id) && Math.abs(G.vmPos(id).z - th.z) < 3.4);
    ids.sort((a, b) => Math.abs(G.vmPos(a).z - th.z) - Math.abs(G.vmPos(b).z - th.z));
    return ids.slice(0, 2);   // 小人數沒有專職攔中：靠攻擊邊的在外側，另一位在內側
  }
  function vmAttackLane(team, id) {
    const at = G.vmPos(id); if (!at) return null;
    const sd = G.vmSide(team), P = G.VM.poss[team], ball = G.VM.ball && G.vmBallL(G.VM.ball);
    const pred = P?.stage === 2 && P.attacker === id && ball ? G.vmPredL(ball, 2.8) : null;
    const back = G.VM.six && !G.vm6Front(id);
    const L = G.VM.six && !G.vmSmallCount() ? (G.VM.tactics === 'rotation' ? G.V6_BASE[G.vm6Idx(id)]?.[1] || 0 : G.VM.role[id] === 'OH' ? (back ? 0 : 3.3) : G.VM.role[id] === 'OPP' ? -3.3 : 0) : at.z / sd;
    const b = { x: sd * (pred ? Math.max(back ? 3.5 : 0.7, pred.x * sd + .55) : back ? 4.4 : 1.2), z: pred ? G.clamp(pred.z, -4, 4) : sd * L };
    let dx = at.x - b.x, dz = at.z - b.z, len = Math.hypot(dx, dz);
    if (len < .5) { dx = sd; dz = 0; len = 1; }
    const run = Math.max(3.4, len);
    return { a: { x: b.x + dx / len * run, z: b.z + dz / len * run }, b, r: 1.1, id };
  }
  function vmLaneProject(q, lane) {
    const dx = lane.b.x - lane.a.x, dz = lane.b.z - lane.a.z, len = Math.hypot(dx, dz) || 1;
    const t = G.clamp(((q.x - lane.a.x) * dx + (q.z - lane.a.z) * dz) / (len * len), 0, 1);
    const x = lane.a.x + dx * t, z = lane.a.z + dz * t;
    return { x, z, d: Math.hypot(q.x - x, q.z - z), side: ((q.x - x) * -dz + (q.z - z) * dx) / len, ux: dx / len, uz: dz / len };
  }
  function vmLaneClearPoint(q, lane) {
    const p = vmLaneProject(q, lane); if (p.d >= lane.r + .15) return q;
    const sign = Math.sign(p.side) || (q.z > 0 ? -1 : 1), step = lane.r + .3;
    return { x: p.x - p.uz * sign * step, z: p.z + p.ux * sign * step };
  }
  function vmLanePathHits(a, b, lane) {
    const path = { a, b }, side = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
    const crosses = side(a, b, lane.a) * side(a, b, lane.b) < 0 && side(lane.a, lane.b, a) * side(lane.a, lane.b, b) < 0;
    return crosses || Math.min(vmLaneProject(a, lane).d, vmLaneProject(b, lane).d, vmLaneProject(lane.a, path).d, vmLaneProject(lane.b, path).d) < lane.r;
  }
  function vmAiYieldRoute(a) {
    const goal = { x: a.tx, z: a.tz }, P = G.VM.poss[a.team];
    if (G.VM.phase !== 'rally' || !P || G.VM.touch.team !== a.team || a.y > .05) return goal;
    if ((P.stage === 1 && P.setter === a.id) || (P.stage === 2 && P.attacker === a.id) || P.stage < 1 || P.stage > 2) return goal;
    const lanes = [];
    if (P.stage === 1 && P.setter) {
      const q = G.vmPos(P.setter), b = G.VM.ball && G.vmBallL(G.VM.ball), p = b && (G.vmPredL(b, 2.2) || G.vmPredL(b, 1));
      if (q && p) lanes.push({ a: q, b: p, r: .85, id: P.setter });
      // 球還沒舉出去時，真人 OH 也需要先助跑，掩護者不能卡住他的起步。
      for (const id of G.VM.team[a.team]) if (id !== a.id && id !== P.setter && !G.VM.ai.has(id)) { const lane = vmAttackLane(a.team, id); if (lane) lanes.push(lane); }
    } else if (P.attacker && P.attacker !== a.id) { const lane = vmAttackLane(a.team, P.attacker); if (lane) lanes.push(lane); }
    let nav = goal;
    for (const lane of lanes) {
      const here = vmLaneProject(a, lane);
      if (here.d < lane.r) { nav = vmLaneClearPoint(a, lane); continue; }
      nav = vmLaneClearPoint(nav, lane);
      // 跑位兩端在助跑線不同側：從起跳點前方繞過，不直穿攻擊手的路。
      if (vmLanePathHits(a, nav, lane)) {
        const sign = Math.sign(here.side) || 1, pad = lane.r + .45;
        nav = { x: lane.b.x + here.ux * pad - here.uz * sign * pad, z: lane.b.z + here.uz * pad + here.ux * sign * pad };
      }
    }
    return nav;
  }
  function vmAiSetAttack(a, P, B, pick, low) {
    if (!pick.id || pick.id === a.id) { vmAiFree(a, G.vmSide(a.team)); return; }
    const sd = G.vmSide(a.team), back = !G.vm6Front(pick.id), far = Math.max(0, Math.abs(a.x) - 2.6);
    const fix = low || !!P.fix || far > 0.8;
    const zone = G.vmSmallCount() ? CourtFormations.get(G.vmSmallCount())[G.vm6Idx(pick.id)] : null;
    const L = zone ? G.clamp(zone.L, -3.0, 3.0) : pick.n === 7 || pick.n === 1 ? 3 : pick.n === 5 || pick.n === 3 ? -3 : 0;
    // 所有人數共用：依選中的攻擊手是否在後排決定球深度，修正球與低手舉球也不能強制送到網前。
    const T = (low ? 1.65 : fix ? 1.5 : 1.3) + Math.min(far, 4) * 0.06;
    vmAiTouch(a, sd * (back ? 4.4 : 1.2), sd * L, 3.1, T, Math.min(G.vmLv(a).setErr * (fix ? 1.5 : 1), 0.5), 'set', low ? 3 : 2, false, back);
    if (G.VM.poss[a.team]?.stage === 2) { G.VM.poss[a.team].attacker = pick.id; G.VM.poss[a.team].fix = fix; G.VM.poss[a.team].td = false; }
  }
  function vmSmallChooseSet(a,B) {
    // 沒有固定分工：舉球的人以外每個人都可以打，照他現在的區域選球路（前排左＝1、前排右＝3、後排左＝7、後排中＝4、後排右＝5）
    const n=G.vmSmallCount(),zones=CourtFormations.get(n),P=G.VM.poss[a.team]||{},opt=[];
    for(const id of G.VM.team[a.team]){
      if(id===a.id)continue;const k=G.vm6Idx(id),z=k>=0?zones[k]:null;if(!z)continue;
      if(n===3&&z.front)continue;   // 3 對 3：球都舉給後排的兩個人打（前排那位負責舉）
      const kind=z.front?(z.L<-1?3:1):(z.L>1.5?7:z.L<-1.5?5:4),w=(G.VM.ai.has(id)?2:3)*(id===P.passer?0.6:1);
      opt.push([kind,id,w]);
    }
    if(!opt.length)return {id:a.id,n:4};
    const call=a.team===G.vmTeamOf(G.vmMe())&&G.VM.call&&G.VM.t-G.VM.call.t<8?G.VM.call:null;
    if(call){G.VM.call=null;const o=opt.find(q=>q[0]===call.n);if(o)return {n:o[0],id:o[1]};}
    const human=opt.filter(q=>!G.VM.ai.has(q[1]));if(human.length&&G.gameRandom()<0.55)return {n:human[0][0],id:human[0][1]};
    let r=G.gameRandom()*opt.reduce((s,q)=>s+q[2],0);for(const q of opt){r-=q[2];if(r<=0)return {n:q[0],id:q[1]};}
    return {n:opt[0][0],id:opt[0][1]};
  }
  function vmSoloBrain(a,sd,b,live) {
    if(!live)return;
    const B=G.vmBallL(b),land=G.vmPredL(B,G.BALL_R);
    const coming=G.VM.touch.team!==a.team&&(Math.sign(B.x)===sd||(Math.sign(B.vx)===sd&&land&&Math.sign(land.x)===sd))&&!vmLetGo(a.team,b);
    if(!coming){const f=vm6Spot(a.team,a.id,'defense');a.tx=f.x;a.tz=f.z;a.reactAt=G.VM.t+G.vmLv(a).react;return;}
    // With no teammate, reuse the existing rescue/free-ball action for a one-touch return.
    if(G.VM.t>=a.reactAt)vmAiRole(a,{stage:2,passer:a.id,setter:null,attacker:null},B,sd);
  }
  return { vmProSetter, vmAiServe, vmFixSetter, vmPossession, vmAiStep, vmThreat, vmAiBlock, vmAiRole, vmAiOwnSide, aiEff, aiPay, aiJump, vmAiTouch, vmPickGap, vmAiSpike, vmLetGo, vmBlockerFacing, vmAiFree, vm6Spot, vm6RecvForm, vm6GoSpot, vm6Possession, vm6SetterFor, vm6AttackerFor, vm6AttackerByCall, vm6ChooseSet, vm6BlockPick, vm6Nearest, vm6Brain, vm6OffBlock, vm6AirMB, vm6Quick, vm6CoverPlan, vm6CoverSpot, vmSmallPossession, vmBlockLane, vmSmallBlockers, vmAttackLane, vmLaneProject, vmLaneClearPoint, vmLanePathHits, vmAiYieldRoute, vmAiSetAttack, vmSmallChooseSet, vmSoloBrain };
}
