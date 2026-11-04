// Local checks only; never connects to a multiplayer service or production storage.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function syntax(source, module = false) {
  const r = spawnSync(process.execPath, ['--check', ...(module ? ['--input-type=module'] : [])], { input: source, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}
for (const file of ['gym.html', 'index.html', 'vbtv.html']) {
  check(file + ' inline script syntax', () => {
    for (const m of read(file).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/application\/json|importmap|\bsrc=/.test(m[1])) continue;
      syntax(m[2], /type="module"/.test(m[1]));
    }
  });
}
for (const file of ['lobby.js', 'api/hall.js']) check(file + ' syntax', () => syntax(read(file)));
const gym = read('gym.html');
const previous = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'show', '4613d8a:gym.html'], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 }).replaceAll('\r\n', '\n');
const segment = (s, from, to) => { const a = s.indexOf(from), b = s.indexOf(to, a); assert(a >= 0 && b > a); return s.slice(a, b); };
check('movement / ball physics unchanged (two equipment UI text changes only)', () => {
  assert.equal(segment(gym, 'function standUp()', 'const NET ='), segment(previous, 'function standUp()', 'const NET =').replace('（NT$25）', '').replace('館內還沒有攝影機。到「加入 3D 元件」的素材庫放「網路攝影機（智慧球場）」或「監視器」，這裡就會出現畫面。', '這座球館目前沒有可用的攝影機畫面。'));
});
check('2v2 / 6v6 rules and AI unchanged since 4613d8a', () => {
  assert.equal(segment(gym, 'function vmStart(', 'function start(hot)'), segment(previous, 'function vmStart(', 'function start(hot)'));
});
check('network and avatars unchanged except user-facing errors', () => {
  let old = segment(previous, 'const NET =', 'async function coStart()');
  old = old.replace('多人連線還沒開啟：網站管理者要先照「部署說明」設定 ABLY_API_KEY', '多人連線暫時無法使用，請稍後再試或回大廳進入練習模式').replace('即時連線服務拒絕進入房間（金鑰權限不足：要有 Publish、Subscribe、Presence）', '目前無法加入這個房間，請稍後再試');
  assert.equal(segment(gym, 'const NET =', 'async function coStart()'), old);
  assert(gym.includes('const myChar = () => null;'));
  assert(gym.includes('function vmPickChar(used) { return null; }'));
  assert(!segment(gym, 'function makeAvatar(', 'function netPeer(').includes('makeChibi('));
});
check('deleted files and frontend links', () => {
  for (const f of ['demo.html', 'eval.html', 'api/geocode.js', 'checklist.html', 'plan', 'allnav.js', 'spike3d.js', 'files']) assert(!fs.existsSync(path.join(root, f)), f);
  for (const file of ['index.html', 'gym.html', 'lobby.js', 'vbtv.html']) {
    assert(!/(?:demo|eval|checklist)\.html|api\/geocode|allnav\.js|spike3d\.js|(?:href|src)=["'](?:plan|files)\//i.test(read(file)), file);
    assert(!/\b(?:valorant|jett|sage|reyna|phoenix|raze|killjoy|omen|skye|neon|viper|sova|brimstone|cypher|yoru)\b/i.test(read(file)), file);
  }
});
check('no planning content in TV, no price catalogue or hall write request', () => {
  assert(!/估價|費用|廠商|候選場地|企劃|價格|預算/.test(read('vbtv.html')));
  assert(gym.includes('const CATALOG = {}, TYPE_CATS = {};'));
  assert(!/fetch\('api\/hall',/.test(gym));
  assert(!gym.includes('api/geocode'));
  assert(gym.includes('if (GAME_ONLY) return; // Do not rebuild'));
});

// A minimal DOM double exercises actual event handlers, not browser rendering.
class Element {
  constructor() { this.children = []; this.listeners = {}; this.attrs = {}; this.parts = {}; this.value = ''; this.textContent = ''; this.dataset = {}; this.classList = { add() {} }; }
  set innerHTML(value) { this.html = value; }
  get innerHTML() { return this.html || ''; }
  querySelector(selector) { return this.parts[selector] ||= new Element(); }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  fire(name) { this.listeners[name]({ preventDefault() {} }); }
  replaceChildren() { this.children = []; }
  append(child) { child.parent = this; this.children.push(child); }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  setAttribute(name, value) { this.attrs[name] = value; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  setCustomValidity(message) { this.validation = message; }
  reportValidity() {}
}
function lobby(search = '', name = '') {
  const elements = Object.fromEntries([...read('index.html').matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], new Element()]));
  elements.filter.value = 'all'; elements.mode.value = elements['join-mode'].value = '2v2';
  const stored = { 'vb.mp.name': name };
  const context = {
    document: { getElementById(id) { assert(elements[id], 'missing DOM id ' + id); return elements[id]; }, querySelectorAll() { return []; }, createElement() { return new Element(); } },
    location: { search, href: '' }, URLSearchParams,
    localStorage: { getItem: k => stored[k], setItem: (k, v) => { stored[k] = v; } },
    sessionStorage: { setItem() {} }, crypto: require('node:crypto').webcrypto,
    setTimeout() { return 1; }, clearTimeout() {},
  };
  vm.runInNewContext(read('lobby.js'), context);
  return { el: elements, context, stored };
}
check('nickname, empty lobby, local chat is text, practice, create and join URLs', () => {
  const { el, context, stored } = lobby();
  assert(el.nickname.open); assert.equal(el.players.children.length, 1); assert(el.rooms.innerHTML.includes('公開房間列表即將開放'));
  el.name.value = '  測試球友  '; el['name-form'].fire('submit'); assert.equal(stored['vb.mp.name'], '測試球友'); assert.equal(el.nickname.open, false);
  el.message.value = '<img src=x onerror=alert(1)>'; el.chat.fire('submit');
  assert(el.messages.children[0].textContent.includes('<img')); assert.equal(el.messages.children[0].innerHTML, '');
  el.practice.fire('click'); assert.equal(context.location.href, 'gym.html?site=bs-shenjing&practice=1');
  el['room-name'].value = '練球'; el.mode.value = '6v6'; el['room-form'].fire('submit');
  assert.match(context.location.href, /^gym\.html\?site=bs-shenjing&room=[A-Z2-9]{6}&mode=6v6$/);
  el.code.value = 'abc123'; el.join.fire('submit'); assert.equal(context.location.href, 'gym.html?site=bs-shenjing&room=ABC123&mode=2v2');
});
check('demo only: six rooms, self first, preview levels, mode filter', () => {
  const { el } = lobby('?demo=1', '球友');
  assert.equal(el.rooms.children.length, 6); assert.equal(el.players.children.length, 8);
  assert.equal(el.players.children[0].className, 'player self');
  el.filter.value = '6v6'; el.filter.fire('change'); assert.equal(el.rooms.children.length, 3);
  el.rooms.children[0].fire('click'); assert(el.toast.textContent.includes('示範'));
});
check('direct gym URL redirects to lobby', () => {
  let target; vm.runInNewContext(gym.match(/<script>([\s\S]*?)<\/script>/)[1], { location: { search: '', replace: url => { target = url; } } });
  assert.equal(target, 'index.html#lobby');
});
async function apiTests() {
  let calls = 0;
  const context = { module: { exports: {} }, process: { env: { KV_REST_API_URL: 'https://storage.invalid', KV_REST_API_TOKEN: 'test-placeholder' } }, URL, AbortSignal,
    fetch: async (url, options) => { calls++; assert.deepEqual(JSON.parse(options.body), ['GET', 'hall:bs-shenjing']); return { ok: true, json: async () => ({ result: JSON.stringify({ data: { items: [], building: { L: 36 } }, picks: { private: true }, total: 1234, savedAt: 'test' }) }) }; } };
  vm.runInNewContext(read('api/hall.js'), context);
  async function request(method, url) { const result = {}; await context.module.exports({ method, url }, { setHeader(k,v) { result[k]=v; }, set statusCode(v) { result.status=v; }, end(v) { result.body=JSON.parse(v); } }); return result; }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) { const r = await request(method, '/api/hall'); assert.equal(r.status, 405); assert.equal(r.Allow, 'GET'); }
  assert.equal((await request('GET', '/api/hall?all=1')).status, 404);
  assert.equal((await request('GET', '/api/hall?site=other')).status, 404);
  assert.equal(calls, 0);
  const r = await request('GET', '/api/hall?site=bs-shenjing'); assert.equal(r.status, 200); assert.equal(calls, 1);
  assert.deepEqual(Object.keys(r.body).sort(), ['data', 'savedAt', 'site']);
  checks++; console.log('PASS hall API read-only contract and metadata exclusion (mock storage)');
}
async function httpTests() {
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const name of ['index.html', 'lobby.css', 'lobby.js', 'gym.html', 'vbtv.html', 'data/sites.json']) {
      const r = await fetch(`${origin}/${name}`); assert.equal(r.status, 200, name); await r.arrayBuffer();
    }
    for (const name of ['demo.html', 'eval.html', 'api/geocode.js']) assert.equal((await fetch(`${origin}/${name}`)).status, 404, name);
    checks++; console.log('PASS local static server: 6 pages/assets return 200; deleted files return 404');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
(async () => { await apiTests(); await httpTests(); console.log(`Completed ${checks} checks. Browser rendering and live gameplay remain manual.`); })().catch(error => { console.error(error); process.exitCode = 1; });
