// 即時連線的設定：
//   房間伺服器預設用台北伺服器（vps/，LightNode 臺北，wss://130-94-37-34.sslip.io）：延遲約 5 ms、不按則數收費
//   RT_TW_URL＝要換台北伺服器網址時才設；RT_CF_URL＝舊的 Cloudflare 房間伺服器（rt-worker/），只有 RT_TW_URL 設成 off 時才用
//   RT_PREFER＝先用哪一個：cf（預設：房間伺服器）或 ably
//   先用的那個連不上就自動改用另一個（Ably 當備援）
//   RT_SERVERS＝伺服器清單（選伺服器頁面用），JSON：[{"id":"tw1","name":"台北","region":"台灣","url":"wss://…"}]；沒設就只有台北一台
//   GET /api/rt-config → { cf, prefer, servers }（cf＝第一台，舊版網頁用）
const TW_DEFAULT = 'wss://130-94-37-34.sslip.io';
module.exports = (req, res) => {
  const tw = (process.env.RT_TW_URL || TW_DEFAULT).trim().replace(/\/+$/, '');
  const u = tw.toLowerCase() === 'off' ? (process.env.RT_CF_URL || '').trim().replace(/\/+$/, '') : tw;
  const prefer = (process.env.RT_PREFER || '').trim().toLowerCase() === 'ably' ? 'ably' : 'cf';
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  const ok = (x) => typeof x === 'string' && /^wss:\/\/[\w.-]+(\/[\w./-]*)?$/.test(x);
  let servers = [];
  try { servers = JSON.parse(process.env.RT_SERVERS || '[]'); } catch (_) { servers = []; }
  servers = (Array.isArray(servers) ? servers : []).filter((v) => v && ok(v.url) && /^[\w-]{1,20}$/.test(v.id || '')).slice(0, 20)
    .map((v) => ({ id: v.id, name: String(v.name || v.id).slice(0, 20), region: String(v.region || '').slice(0, 30), url: v.url.replace(/\/+$/, '') }));
  if (!servers.length && ok(u)) servers = [{ id: 'tw1', name: '台北', region: '台灣・LightNode', url: u }];
  res.end(JSON.stringify({ cf: ok(u) ? u : servers[0] ? servers[0].url : null, prefer, servers }));
};
