// WEB-030 積分加減（規則見 docs/企劃-積分天梯與快速配對.md 第四節）
// 分數放大 5 倍的 Elo：預期勝率 E = 1/(1+10^((對方−我方)/2000))，加減 K×(結果−E)，K=100（一場最多 ±100）。
import { aiRatingFor } from './matchmaker.mjs';
export const K = 100, SCALE = 2000, AI_FARM_CAP = 4500;

// teams：[[{ player, rating }…], [{…}]]（只有真人）；n：每隊人數；lv：AI 等級；winner：0／1；left：中途離開的帳號（算輸）
// 回傳 [{ player, team, before, delta, after, won }]
// sets：多局時的局數 [a, b]（2026-11-19 使用者：輸了但有贏一局，多少補一點）——輸的一隊每贏一局少扣，贏到差一局就輸（例 1:2、2:3）最多少扣 40%
// sc：只打一局時的比分 [a, b]（2026-11-19 使用者要）——輸得越接近少扣越多：輸的分數是贏的一半以下照扣，13:15 少扣約 29%，最多少扣 40%
export function rankedChanges({ teams, n, lv, winner, left = [], sets = null, sc = null }) {
  const ai = aiRatingFor(lv);   // 電腦的分數＝它的強度對應的積分
  const avg = t => (teams[t].reduce((s, p) => s + p.rating, 0) + (n - teams[t].length) * ai) / n;   // 隊伍分數＝含 AI 的平均
  const out = [];
  for (const t of [0, 1]) {
    const mine = avg(t), opp = avg(1 - t), E = 1 / (1 + 10 ** ((opp - mine) / SCALE));
    const moreHumans = teams[t].length > teams[1 - t].length, oppAllAI = teams[1 - t].length === 0;
    for (const p of teams[t]) {
      const won = winner === t && !left.includes(p.player);
      let delta;
      if (won) {
        delta = K * (1 - E);
        if (moreHumans) delta *= 0.7;                          // 真人比較多的一隊贏了加分打 7 折
        delta = Math.max(1, Math.round(delta));                // 贏了最少 +1
        if (oppAllAI && p.rating >= AI_FARM_CAP) delta = 0;    // 4500 以上打贏全 AI 不加分
      } else {
        const need = Array.isArray(sets) ? Math.max(...sets) : 0, got = need > 1 && !left.includes(p.player) && winner !== t ? Math.min(sets[t], need - 1) : 0;
        const close = !Array.isArray(sets) && Array.isArray(sc) && sc[winner] > 0 && !left.includes(p.player) && winner !== t ? Math.max(0, Math.min(1, (sc[t] / sc[winner] - 0.5) / 0.5)) : 0;
        delta = -Math.max(1, Math.round(K * E * (1 - 0.4 * got / Math.max(1, need - 1)) * (1 - 0.4 * close)));   // 輸了扣 K×E；中離的人就算隊伍贏了也算輸、也不補
      }
      delta = Math.max(-100, Math.min(100, delta));
      out.push({ player: p.player, team: t, before: p.rating, delta, after: Math.max(0, p.rating + delta), won });
    }
  }
  return out;
}
