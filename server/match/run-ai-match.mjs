// 在伺服器（或本機 Node）上跑一場全 AI 比賽：node server/match/run-ai-match.mjs [6|2] [秒數] [亂數種子]
// 用固定亂數與固定時鐘，輸出的紀錄格式跟瀏覽器比對用的一樣
import fs from 'node:fs';
import { createGameCore } from './game-core.mjs';
export function runAiMatch({ six = true, seconds = 50, seed = 20261115, every = 15, withMe = false } = {}) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let clock = 100000; const performance = { now: () => clock };
  const realRandom = Math.random; Math.random = rnd;
  try {
    const g = createGameCore({ env: { performance } });
    g.setState(JSON.parse(fs.readFileSync(new URL('./venue-bs-shenjing.json', import.meta.url), 'utf8')));
    g.walk.x = 40; g.walk.z = 40;
    const c = g.state.items.find(i => i.type === 'vb');
    g.GAME_RNG.s = seed;   /* 比賽專用亂數：開賽這一刻設定種子，網頁用 __gym.rng.s = 種子 就會算出一樣的比賽 */
    // withMe：跟網頁 __gym.vm6Start(c, -1) 一樣，「我」站在場外但算在隊上（給瀏覽器比對用）；平常全部都是 AI
    if (six) withMe ? g.vm6Start(c, -1) : g.vm6Start(c, -1, {}, [Array(6).fill(null), Array(6).fill(null)]); else withMe ? g.vmStart(c, -1) : g.vmStart(c, -1, null, [], [[null, null], [null, null]]);
    const log = [], r3 = v => Math.round(v * 1000) / 1000;
    for (let i = 0; i < 60 * seconds; i++) {
      clock += 1000 / 60; g.step(1 / 60);
      if (i % every === 0) { const b = g.VM.ball, ai = [...g.VM.ai.values()].map(a => [a.id, r3(a.x), r3(a.z), r3(a.y || 0)].join(',')); log.push([i, g.VM.phase, g.VM.sc.join(':'), b ? b.m.position.toArray().map(r3).join(',') : '-', ai.join(';')].join('|')); }
    }
    return { log, sc: g.VM.sc.join(':'), sets: g.VM.sets };
  } finally { Math.random = realRandom; }
}
if (process.argv[1] && process.argv[1].endsWith('run-ai-match.mjs')) {
  const [, , mode = '6', sec = '50', seed = '20261115'] = process.argv, t0 = performance.now();
  const r = runAiMatch({ six: mode !== '2', seconds: +sec, seed: +seed });
  console.log(JSON.stringify({ frames: r.log.length, sc: r.sc, sets: r.sets, ms: Math.round(performance.now() - t0), last: r.log.at(-1).slice(0, 80) }));
}
