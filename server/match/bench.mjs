// 量一台機器能同時跑幾間全 AI 比賽：node server/match/bench.mjs [房間數] [秒數]
// 每間房每秒 60 格；回報「跑完全部房間的模擬時間」花了多少真實時間 → 一間房佔幾 % 的一顆 CPU
import { runAiMatch } from './run-ai-match.mjs';
const rooms = +(process.argv[2] || 10), seconds = +(process.argv[3] || 30);
const t0 = performance.now(); let points = 0;
for (let r = 0; r < rooms; r++) { const m = runAiMatch({ six: r % 2 === 0, seconds, seed: 1000 + r, every: 1e9 }); points += m.sc.split(':').reduce((a, b) => a + +b, 0); }
const ms = performance.now() - t0, perRoom = ms / rooms / (seconds * 1000);
console.log(JSON.stringify({ rooms, seconds, ms: Math.round(ms), points, cpuPerRoom: +(perRoom * 100).toFixed(2) + '%', roomsPerCore: Math.floor(0.7 / perRoom) }));
