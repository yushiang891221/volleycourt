// 多人連線（排球對打）的通行證：用 Vercel 環境變數 ABLY_API_KEY 簽一張 Ably TokenRequest 給瀏覽器。
// 金鑰本身不會送到瀏覽器；通行證只能用在 vb-room-* 這些房間頻道，1 小時後失效。
// 沒設定 ABLY_API_KEY 時回 501，網頁會顯示「多人連線還沒開啟」。
//   GET /api/rt-token?clientId=<玩家代號>  → { keyName, ttl, capability, clientId, timestamp, nonce, mac }
const crypto = require('crypto');

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  const key = process.env.ABLY_API_KEY || '';
  const i = key.indexOf(':');
  if (i < 1) return send(res, 501, { error: 'realtime not configured' });
  const keyName = key.slice(0, i), secret = key.slice(i + 1);
  const q = new URL(req.url, 'http://x').searchParams;
  const clientId = (q.get('clientId') || '').replace(/[^\w-]/g, '').slice(0, 40) || 'p' + crypto.randomBytes(4).toString('hex');
  const ttl = 60 * 60 * 1000;
  const capability = JSON.stringify({ 'vb-room-*': ['publish', 'subscribe', 'presence'] });
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  // Ably 的 TokenRequest 簽章：各欄位換行串起來，用金鑰的 secret 做 HMAC-SHA256
  const text = [keyName, ttl, capability, clientId, timestamp, nonce].join('\n') + '\n';
  const mac = crypto.createHmac('sha256', secret).update(text).digest('base64');
  return send(res, 200, { keyName, ttl, capability, clientId, timestamp, nonce, mac });
};
