// Shared venue memory: one 3D layout + product picks per candidate site, visible to everyone who opens the site.
// Storage: Upstash Redis (Vercel Marketplace → Storage → "Upstash for Redis"). Without a store the API answers 501
// and the pages keep working with browser-only memory.
//   GET  /api/hall?site=<id>   → { site, data, picks, savedAt, name, courts, total, by }
//   GET  /api/hall?all=1       → { halls: { <id>: { savedAt, name, courts, total } } }
//   POST /api/hall  { site, data, picks, savedAt, name, courts, total }   (header x-edit-key when EDIT_KEY is set)
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const EDIT_KEY = process.env.EDIT_KEY || '';
const ID_RE = /^[a-z0-9-]{1,64}$/;

async function redis(cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `redis ${r.status}`);
  return j.result;
}
function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 300000) throw new Error('too large'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

module.exports = async (req, res) => {
  if (!URL_ || !TOKEN) return send(res, 501, { error: 'shared storage not configured' });
  try {
    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams;
      if (q.get('all')) {
        const flat = (await redis(['HGETALL', 'hall:index'])) || [];
        const halls = {};
        for (let i = 0; i < flat.length; i += 2) { try { halls[flat[i]] = JSON.parse(flat[i + 1]); } catch (e) { /* skip */ } }
        return send(res, 200, { halls, edit: EDIT_KEY ? 'key' : 'open' });
      }
      const site = q.get('site') || '';
      if (!ID_RE.test(site)) return send(res, 400, { error: 'bad site' });
      const v = await redis(['GET', 'hall:' + site]);
      return send(res, v ? 200 : 404, v ? JSON.parse(v) : { error: 'none' });
    }
    if (req.method === 'POST') {
      if (EDIT_KEY && req.headers['x-edit-key'] !== EDIT_KEY) return send(res, 403, { error: 'edit key required' });
      const b = await readBody(req);
      const site = String(b.site || '');
      if (!ID_RE.test(site)) return send(res, 400, { error: 'bad site' });
      if (!b.data || !Array.isArray(b.data.items) || b.data.items.length > 2000) return send(res, 400, { error: 'bad data' });
      const rec = {
        site, data: b.data, picks: b.picks && typeof b.picks === 'object' ? b.picks : { sel: {}, custom: {} },
        savedAt: new Date().toISOString(), name: String(b.name || '').slice(0, 120),
        courts: Number.isFinite(b.courts) ? b.courts : null, total: Number.isFinite(b.total) ? b.total : null,
      };
      const s = JSON.stringify(rec);
      if (s.length > 250000) return send(res, 413, { error: 'too large' });
      await redis(['SET', 'hall:' + site, s]);
      await redis(['HSET', 'hall:index', site, JSON.stringify({ savedAt: rec.savedAt, name: rec.name, courts: rec.courts, total: rec.total })]);
      return send(res, 200, { ok: true, savedAt: rec.savedAt });
    }
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'method' });
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) });
  }
};
