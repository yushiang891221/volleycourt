// WEB-030 積分加減（規則見 docs/企劃-積分天梯與快速配對.md 第四節）
// 分數放大 5 倍的 Elo：預期勝率 E = 1/(1+10^((對方−我方)/2000))，加減 K×(結果−E)，K=100（一場最多 ±100）。
import { aiRatingFor } from './matchmaker.mjs';
export const K = 100, SCALE = 2000, AI_FARM_CAP = 4500;

// teams：[[{ player, rating }…], [{…}]]（只有真人）；n：每隊人數；lv：AI 等級；winner：0／1；left：中途離開的帳號（算輸）
// 回傳 [{ player, team, before, delta, after, won }]
export function rankedChanges({ teams, n, lv, winner, left = [] }) {
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
      } else delta = -Math.max(1, Math.round(K * E));        // 輸了扣 K×E；中離的人就算隊伍贏了也算輸
      delta = Math.max(-100, Math.min(100, delta));
      out.push({ player: p.player, team: t, before: p.rating, delta, after: Math.max(0, p.rating + delta), won });
    }
  }
  return out;
}
