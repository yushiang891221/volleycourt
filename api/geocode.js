// Address → coordinates through the NLSC (國土測繪中心) map search, called server-side because the browser is blocked by CORS.
//   GET /api/geocode?q=<地址>  → { results: [{ lat, lng, label }] }
const pick = (txt) => {
  const out = [];
  // XML: <ITEM><CONTENT>名稱</CONTENT><LOCATION>121.1,24.7</LOCATION></ITEM>  (also tolerate JSON-ish payloads)
  const re = /<CONTENT>([^<]*)<\/CONTENT>[\s\S]*?<LOCATION>\s*([\d.]+)\s*,\s*([\d.]+)\s*<\/LOCATION>/g;
  let m; while ((m = re.exec(txt)) && out.length < 8) out.push({ label: m[1], lng: +m[2], lat: +m[3] });
  if (!out.length) {
    const re2 = /"(?:CONTENT|content|name)"\s*:\s*"([^"]*)"[\s\S]*?"(?:LOCATION|location)"\s*:\s*"([\d.]+)\s*,\s*([\d.]+)"/g;
    while ((m = re2.exec(txt)) && out.length < 8) out.push({ label: m[1], lng: +m[2], lat: +m[3] });
  }
  return out.filter((r) => r.lat > 21 && r.lat < 27 && r.lng > 118 && r.lng < 123);
};
module.exports = async (req, res) => {
  const q = String(new URL(req.url, 'http://x').searchParams.get('q') || '').trim().slice(0, 80);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  if (!q) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'q required' })); }
  const w = encodeURIComponent(q), tried = [];
  for (const u of [`https://api.nlsc.gov.tw/MapSearch/QuerySearch?word=${w}&feedback=XML`, `https://api.nlsc.gov.tw/MapSearch/ContentSearch?word=${w}&mode=AutoComplete&count=8&feedback=XML`]) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'volleycourts/1.0', Referer: 'https://maps.nlsc.gov.tw/' } });
      const txt = await r.text(); tried.push(`${r.status}:${txt.length}`);
      const results = pick(txt);
      if (results.length) return res.end(JSON.stringify({ results, source: 'NLSC' }));
      if (req.url.includes('debug=1')) tried.push(txt.slice(0, 300));
    } catch (e) { tried.push('ERR ' + e.message); }
  }
  res.statusCode = 404; res.end(JSON.stringify({ results: [], tried }));
};
