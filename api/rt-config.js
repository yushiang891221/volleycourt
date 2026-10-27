// 即時連線的設定：
//   RT_CF_URL＝房間伺服器（Cloudflare Workers，rt-worker/）的網址，例如 wss://volleycourt-rt.你的帳號.workers.dev
//   RT_PREFER＝先用哪一個：ably（預設：在台灣通常比較快）或 cf（Cloudflare：免費額度大，但有些網路業者會繞到美國、比較慢）
//   先用的那個連不上（例如 Ably 每月額度用完）就自動改用另一個
//   GET /api/rt-config → { cf, prefer }
module.exports = (req, res) => {
  const u = (process.env.RT_CF_URL || '').trim().replace(/\/+$/, '');
  const prefer = (process.env.RT_PREFER || '').trim().toLowerCase() === 'cf' ? 'cf' : 'ably';
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(JSON.stringify({ cf: /^wss:\/\/[\w.-]+(\/[\w./-]*)?$/.test(u) ? u : null, prefer }));
};
