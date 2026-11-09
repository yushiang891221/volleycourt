// node tools/shoot-creator-bg.cjs
// 使用本機 Chrome/Edge 與 Node 22+，啟動暫時的靜態伺服器及獨立瀏覽器設定檔。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function withBrowser(run) {
  const executable = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].find(file => fs.existsSync(file));
  if (!executable) throw new Error('請用 CHROME_PATH 指定 Chrome 或 Edge 執行檔');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'volleycourt-shot-'));
  const browser = spawn(executable, ['--headless=new', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const activePort = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(activePort); i++) await delay(100);
    const port = fs.readFileSync(activePort, 'utf8').split('\n')[0];
    const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data), entry = pending.get(message.id);
      if (message.method === 'Runtime.exceptionThrown') console.error('Browser:', message.params.exceptionDetails);
      if (message.method === 'Network.loadingFailed') console.error('Network:', message.params.errorText);
      if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error))); else entry.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 60000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const waitFor = async expression => {
      for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await delay(500); }
      throw new Error(`等待逾時 ${expression}`);
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 2560, height: 1440, deviceScaleFactor: 1, mobile: false });
    await run({ send, evaluate, waitFor, origin });
  } finally {
    if (socket) socket.close();
    browser.kill(); server.close();
    await delay(500);
    // profile 只來自本次 mkdtemp，避免碰觸使用者瀏覽器資料。
    if (!path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep + 'volleycourt-shot-')) throw new Error('暫存目錄超出預期範圍');
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (require.main === module) withBrowser(async ({ send, waitFor, origin, evaluate }) => {
  await send('Page.navigate', { url: `${origin}/gym.html?site=bs-shenjing&shot=creator` });
  await waitFor('window.__creatorShot?.ready');
  const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/creator-bg.jpg'), Buffer.from(data, 'base64'));
  console.log('已儲存 assets/creator-bg.jpg (2560×1440)', await evaluate('window.__creatorShot'));
}).catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { withBrowser };
