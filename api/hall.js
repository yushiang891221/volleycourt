// Fixed game venue, read only. Existing Redis data is never changed by this route.
const envKey = suffixes => Object.keys(process.env).find(k => suffixes.some(x => k === x || k.endsWith('_' + x)) && process.env[k]);
const uKey = envKey(['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']);
const URL_ = uKey && process.env[uKey];
const TOKEN = uKey && process.env[uKey.replace(/URL$/, 'TOKEN')];
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'read only' });
  }
  const q = new URL(req.url, 'http://localhost').searchParams;
  if (q.get('site') !== 'bs-shenjing' || q.has('all')) return send(res, 404, { error: 'not found' });
  if (!URL_ || !TOKEN) return send(res, 501, { error: 'venue storage unavailable' });
  try {
    const r = await fetch(URL_, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', 'hall:bs-shenjing']),
      signal: AbortSignal.timeout(3500),
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('storage');
    if (!j.result) return send(res, 404, { error: 'not found' });
    const rec = JSON.parse(j.result);
    if (!rec.data || !Array.isArray(rec.data.items)) throw new Error('layout');
    // Product selections, estimates, and the candidate-site index are not public game data.
    return send(res, 200, { site: 'bs-shenjing', data: rec.data, savedAt: rec.savedAt });
  } catch (_) {
    return send(res, 503, { error: 'venue temporarily unavailable' });
  }
};
