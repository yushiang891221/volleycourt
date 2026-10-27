// 即時連線的設定：房間伺服器（Cloudflare Workers，rt-worker/）的網址，放在 Vercel 環境變數 RT_CF_URL
//   例如 wss://volleycourt-rt.你的帳號.workers.dev；沒設定時回 { cf: null }，網頁就照舊用 Ably
//   GET /api/rt-config → { cf }
module.exports = (req, res) => {
  const u = (process.env.RT_CF_URL || '').trim().replace(/\/+$/, '');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(JSON.stringify({ cf: /^wss:\/\/[\w.-]+(\/[\w./-]*)?$/.test(u) ? u : null }));
};
