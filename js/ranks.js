// 積分段位（使用者 2026-11-18 定）：網頁和台北伺服器共用這一份。前 10 場是定級賽，先不顯示段位。
export const PLACEMENT_GAMES = 10;
export const TIERS = [
  { name: '菜雞', min: 0, icon: '🐣' },
  { name: '新手', min: 1001, icon: '🌱' },
  { name: '野場小白', min: 2001, icon: '🏐' },
  { name: '野場NPC', min: 3001, icon: '🤖' },
  { name: '系隊支柱', min: 5001, icon: '🧱' },
  { name: '系隊先發', min: 6001, icon: '⭐' },
  { name: '校隊撿球', min: 8001, icon: '🎽' },
  { name: '校隊先發', min: 9001, icon: '🏅' },
  { name: '職業隊', min: 10000, icon: '👑' },
];
export const tierIcon = name => TIERS.find(t => t.name === name)?.icon || '';
export function tierOf(rating) {
  let t = TIERS[0]; for (const x of TIERS) if (rating >= x.min) t = x;
  return t.name;
}
// 給畫面用：{ rating, tier（定級中是 null）, placed（已打場數）}
export function rankView(r) {
  const rating = Number.isFinite(r?.rating) ? r.rating : 1000, games = Number.isFinite(r?.games) ? r.games : 0;
  return { rating, placed: games, tier: games >= PLACEMENT_GAMES ? tierOf(rating) : null };
}
