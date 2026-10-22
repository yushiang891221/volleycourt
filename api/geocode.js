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
// 310新竹縣竹東鎮榮華里水資路42號 → parts; NLSC matches loosely, so results are checked against road + number
const half = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\s+/g, '');
function parse(q) {
  let t = half(q).replace(/^\d{3,6}/, '').replace(/台/g, '臺');
  const m = t.match(/^(\S{2}[縣市])?(\S{1,3}?[鄉鎮市區])?(\S{1,4}?[里村])?(\d+鄰)?(\S+?(?:路|街|大道|道)(?:[一二三四五六七八九十\d]+段)?)(\S*?巷)?(\S*?弄)?(\d+(?:之\d+)?號)?/);
  if (!m) return { clean: t, road: null, no: null };
  const [, city = '', town = '', , , road = '', lane = '', alley = '', no = ''] = m;
  return { clean: (city + town + road + lane + alley + no).replace(/臺/g, '台'), roadQ: city + town + road, road, no: no.replace('號', ''), lane, town };
}
async function nlsc(word) {
  const w = encodeURIComponent(word), all = [];
  for (const u of [`https://api.nlsc.gov.tw/MapSearch/QuerySearch?word=${w}&feedback=XML`, `https://api.nlsc.gov.tw/MapSearch/ContentSearch?word=${w}&mode=AutoComplete&count=8&feedback=XML`]) {
    try { const r = await fetch(u, { headers: { 'User-Agent': 'volleycourts/1.0', Referer: 'https://maps.nlsc.gov.tw/' } }); all.push(...pick(await r.text())); if (all.length) break; } catch (e) { /* next */ }
  }
  return all.map((x) => ({ ...x, label: half(x.label) }));
}
module.exports = async (req, res) => {
  const q = String(new URL(req.url, 'http://x').searchParams.get('q') || '').trim().slice(0, 80);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  if (!q) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'q required' })); }
  const P = parse(q), roadKey = P.road ? P.road.replace(/臺/g, '台') : null;
  const onRoad = (x) => !roadKey || x.label.replace(/臺/g, '台').includes(roadKey);
  const inTown = (x) => !P.town || x.label.includes(P.town);
  // 1) exact door number
  let r = (await nlsc(P.clean)).filter((x) => onRoad(x) && inTown(x));
  const exact = P.no ? r.filter((x) => new RegExp(`${roadKey}${P.lane ? '\\S*' : ''}${P.no}號`).test(x.label.replace(/臺/g, '台'))) : [];
  if (exact.length) return res.end(JSON.stringify({ results: exact, precision: 'exact', source: 'NLSC' }));
  // 2) the road itself (intersections / other numbers on the same road)
  if (P.roadQ) {
    const r2 = (await nlsc(P.roadQ)).filter((x) => onRoad(x) && inTown(x));
    const pool = [...r, ...r2];
    if (pool.length) return res.end(JSON.stringify({ results: pool, precision: 'road', road: P.road, source: 'NLSC' }));
  }
  res.statusCode = 404; res.end(JSON.stringify({ results: [], precision: 'none', parsed: P }));
};
