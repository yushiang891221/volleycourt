// 量遊戲 FPS（用顯示卡，不是軟體算繪）：node tools/measure-fps.cjs [網址參數]
// 例：node tools/measure-fps.cjs "site=bs-shenjing&practice&mode=6v6"   ；比較舊角色加 &avatar=legacy
// 需要本機伺服器在 http://localhost:5190 開著（volleycourt 資料夾）
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(f => fs.existsSync(f));
const q = process.argv[2] || 'site=bs-shenjing&practice&mode=6v6';
const url = `http://localhost:5190/gym.html?${q}&debug`;
const delay = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fps-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const br = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1600,900', '--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 40; i++) { await delay(250); try { targets = await new Promise((res, rej) => http.get(`http://127.0.0.1:${port}/json`, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); break; } catch {} }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Page.enable'); await send('Page.navigate', { url });
  await delay(20000);   // 載入球館、模型、開始比賽
  if (process.env.PROBE) console.log('PROBE', JSON.stringify(await ev(process.env.PROBE)));
  if (process.env.PRE) { console.log('PRE', JSON.stringify(await ev(process.env.PRE))); await delay(8000); }
  const r = await ev(`(async () => {
    const gl = window.__gym && window.__gym.renderer, info = gl && gl.getContext().getParameter(gl.getContext().getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL || 0x1F01);
    let n = 0, worst = 0, last = performance.now(); const t0 = last;
    await new Promise(res => { function f(now) { n++; worst = Math.max(worst, now - last); last = now; window.wakeRender && window.wakeRender(200); (window.__avs || []).forEach((a, i) => { a.g.rotation.y = now / 700 + i; if (a.arms) { a.arms[0].rotation.x = Math.sin(now / 300 + i) * 1.2; a.arms[1].rotation.x = Math.cos(now / 300 + i) * 1.2; a.legs[0].rotation.x = Math.sin(now / 250 + i) * 0.6; } }); if (now - t0 < 8000) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
    let avatars = 0, tris = 0, calls = 0;
    window.__gym && window.__gym.scene.traverse(o => { if (o.isSkinnedMesh && o.visible) avatars++; });
    return { fps: Math.round(n / ((last - t0) / 1000)), worstMs: Math.round(worst), gpu: String(info), skinnedMeshes: avatars, triangles: tris, drawCalls: calls };
  })()`);
  console.log(q, JSON.stringify(r));
  br.kill(); process.exit(0);
})();
