// 比賽引擎：排球規則（B2）。網頁和台北伺服器共用。
// 只做「判定」：輸入比賽狀態和事實，輸出判定結果（犯規代碼、下一步）。不碰畫面、位置計算、AI、提示文字、時間。
// 犯規的提示文字由遊戲那邊照代碼組出來（FAULT 代碼見下方）。
//
// 比賽狀態 M（遊戲裡就是 VM）會用到的欄位：
//   phase 'serve'｜'rally'｜'dead'｜'over'；touch {team, n, last, blk, serve}；sc [0,0]；srvTeam；
//   six 是否照 6 人制規則（含 3～5 人的小人數輪轉）；to 每局幾分；bestOf 幾局制；sets [0,0]；swap8 決勝局 8 分換場了沒
export const FAULT = {
  BACK_BLOCK: 'backBlock',     // 後排攔網
  BACK_ATTACK: 'backAttack',   // 後排在 3 公尺線前起跳攻擊
  SERVE_BLOCK: 'serveBlock',   // 攔網發球
  SERVE_ATTACK: 'serveAttack', // 在前區把高過網的發球直接打回去
  DOUBLE: 'double',            // 同一人連續碰兩次
  FOUR: 'four',                // 一隊碰四次
  HELD: 'held',                // 舉球持球
  SET_DOUBLE: 'setDouble',     // 舉球兩手沒同時碰到
};
const ATTACK = new Set(['spike', 'tip', 'hit']);

// 這一下觸球要不要算進比賽：發球階段只認輪到的人發出去的那一下
export function touchCounts(M, id, kind, server) {
  return !(M.phase === 'serve' && (kind !== 'serve' || id !== server));
}

// 判一次觸球（呼叫前遊戲已經確認 touchCounts、而且是比賽球）。會更新 M.phase／M.touch。
// t：{ team, id, kind,
//      back（6 人制：這個人在後排）, aboveNet（擊球點整顆高過網子上緣）, jumpX（起跳點離中線多遠，不知道時 null）, exactJump（jumpX 是真的起跳點）,
//      ballX（球離中線多遠）, setFault（這顆球帶著的舉球犯規 'held'｜'double'｜null） }
// 回傳：{ serveStart: true }｜{ fault: 代碼, loser: 輸掉的隊 }｜{ ok: true, block, first（這隊的第一下）}
export function judgeTouch(M, t) {
  const { team, id, kind } = t;
  if (M.phase === 'serve') { M.phase = 'rally'; M.touch = { team, n: 3, last: id, serve: true }; return { serveStart: true }; }
  if (M.phase !== 'rally') return { ignored: true };
  if (M.six && t.back) {
    if (kind === 'block') return { fault: FAULT.BACK_BLOCK, loser: team };
    if (ATTACK.has(kind) && t.aboveNet && t.jumpX != null && Math.abs(t.jumpX) < (t.exactJump ? 3 : 2.6)) return { fault: FAULT.BACK_ATTACK, loser: team };
  }
  if (M.touch.serve && team !== M.touch.team) {
    if (kind === 'block') return { fault: FAULT.SERVE_BLOCK, loser: team };
    if (ATTACK.has(kind) && t.aboveNet && Math.abs(t.ballX) < 3) return { fault: FAULT.SERVE_ATTACK, loser: team };
  }
  // 連擊、四次擊球；攔網不算一次，攔網的人也可以再碰下一球
  const block = kind === 'block';
  if (team === M.touch.team) {
    if (block) { M.touch.last = id; M.touch.blk = true; return { ok: true, block: true, sameTeamBlock: true }; }
    if (M.touch.last === id && !M.touch.blk) return { fault: FAULT.DOUBLE, loser: team };
    M.touch.n++; M.touch.last = id; M.touch.blk = false;
    if (M.touch.n > 3) return { fault: FAULT.FOUR, loser: team };
  } else M.touch = { team, n: block ? 0 : 1, last: id, blk: block };
  if (t.setFault && kind === 'set') return { fault: t.setFault === 'held' ? FAULT.HELD : FAULT.SET_DOUBLE, loser: team, setFaultUsed: true };
  return { ok: true, block, first: !block && M.touch.team === team && M.touch.n === 1, setFaultUsed: !!t.setFault };
}

// 得一分。會更新 M.sc、M.srvTeam、M.sets、M.swap8、M.phase。
// 回傳：{ sideOut（換發球權：6 人制要輪轉、2 人要換發球員）, next: 'serve'｜'nextSet'｜'over'｜'swap', setWon }
export function scorePoint(M, win) {
  M.phase = 'dead'; M.sc[win]++;
  const sideOut = win !== M.srvTeam; if (sideOut) M.srvTeam = win;
  const a = M.sc[0], b = M.sc[1], hi = Math.max(a, b);
  if (M.six) {
    const deciding = M.bestOf > 1 && M.sets[0] + M.sets[1] === M.bestOf - 1, to = deciding ? 15 : M.to;
    if (hi >= to && Math.abs(a - b) >= 2) { M.sets[win]++; return { sideOut, setWon: true, next: M.sets[win] >= Math.ceil(M.bestOf / 2) ? 'over' : 'nextSet' }; }
    if (deciding && !M.swap8 && hi === 8) { M.swap8 = true; return { sideOut, next: 'swap' }; }
    return { sideOut, next: 'serve' };
  }
  // 2 對 2：一局（舊的）或多局（M.bestOf 3／5，決勝局先到 15 分）；打到 to＋2 分直接拿下這局
  const multi = M.bestOf > 1, deciding2 = multi && M.sets[0] + M.sets[1] === M.bestOf - 1, to2 = deciding2 ? Math.min(15, M.to) : M.to;
  const won2 = (hi >= to2 && Math.abs(a - b) >= 2) || hi >= to2 + 2;
  if (!multi) return { sideOut, next: won2 ? 'over' : 'serve' };
  if (won2) { M.sets[win]++; return { sideOut, setWon: true, next: M.sets[win] >= Math.ceil(M.bestOf / 2) ? 'over' : 'nextSet' }; }
  return { sideOut, next: 'serve' };
}

// 球落地：x、z 是落點在球場座標（x 離中線、z 離中心線），sg 是 0 隊在哪一邊（-1／1），touchTeam 最後碰球的隊（沒有人碰過是 -1）
// 回傳：{ inside, winner, out }
export function judgeLanding(x, z, sg, touchTeam, R) {
  const inside = Math.abs(x) <= 9 + R && Math.abs(z) <= 4.5 + R, sideTeam = Math.sign(x) === sg ? 0 : 1;
  if (inside) return { inside, winner: 1 - sideTeam, out: false };
  const lose = touchTeam < 0 ? sideTeam : touchTeam;
  return { inside, winner: 1 - lose, out: true };
}

// 發球：裁判在換發球後 2.5 秒吹哨，吹哨後 8 秒內要發出去（連線的人多給 1.5 秒傳送時間）
export const SERVE_WHISTLE_MS = 2500, SERVE_LIMIT_MS = 8000, SERVE_NET_GRACE_MS = 1500;
