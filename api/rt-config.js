// 即時連線的設定：
//   房間伺服器預設用台北伺服器（vps/，LightNode 臺北，wss://130-94-37-34.sslip.io）：延遲約 5 ms、不按則數收費
//   RT_TW_URL＝要換台北伺服器網址時才設；RT_CF_URL＝舊的 Cloudflare 房間伺服器（rt-worker/），只有 RT_TW_URL 設成 off 時才用
//   RT_PREFER＝先用哪一個：cf（預設：房間伺服器）或 ably
//   先用的那個連不上就自動改用另一個（Ably 當備援）
//   GET /api/rt-config → { cf, prefer }
const TW_DEFAULT = 'wss://130-94-37-34.sslip.io';
module.exports = (req, res) => {
  const tw = (process.env.RT_TW_URL || TW_DEFAULT).trim().replace(/\/+$/, '');
  const u = tw.toLowerCase() === 'off' ? (process.env.RT_CF_URL || '').trim().replace(/\/+$/, '') : tw;
  const prefer = (process.env.RT_PREFER || '').trim().toLowerCase() === 'ably' ? 'ably' : 'cf';
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(JSON.stringify({ cf: /^wss:\/\/[\w.-]+(\/[\w./-]*)?$/.test(u) ? u : null, prefer }));
};
