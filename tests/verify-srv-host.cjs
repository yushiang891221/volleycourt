// B5：伺服器當房主（server/match/host.mjs）——開賽後會送 vm（開賽）、st（狀態快照）、match-frame（比賽畫格），
// 回 ping、收到 room-match-sync 會補送開賽資料；房間伺服器不讓任何人用 srv 這個代號連進來
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
(async () => {
  const { MatchHost, HOST_ID } = await import(pathToFileURL(path.join(root, 'server/match/host.mjs')).href);
  assert.equal(HOST_ID, 'srv');
  const out = []; const h = new MatchHost((t, d) => out.push([t, d]));
  h.start({ c: { id: 'test-court', x: 0, z: -2.5, rot: 90 }, sg: -1, six: false, seats: [['p1', null], [null, null]], rules: { speed: 0.7 } });
  await new Promise(r => setTimeout(r, 1500));
  h.receive('ping', { t: 123 }, 'p1'); h.receive('room-match-sync', {}, 'p1');
  await new Promise(r => setTimeout(r, 300)); h.stop();
  const types = out.reduce((m, [t]) => (m[t] = (m[t] || 0) + 1, m), {});
  assert(types.vm >= 2, '要送開賽資料（含補送）'); assert(types.st >= 5, '要送狀態快照'); assert(types['match-frame'] >= 5, '要送比賽畫格');
  const pong = out.find(([t, d]) => t === 'pong' && d.to === 'p1' && d.t === 123); assert(pong && Number.isFinite(pong[1].hostTime), '要回 pong（加入者靠它校正時鐘）');
  const start = out.find(([t, d]) => t === 'vm' && d.e === 'start'); assert(start && start[1].wire === 2, '開賽要用畫格同步');
  assert.deepEqual(h.g.VM.team[0].slice(0, 1), ['p1'], '真人坐進指定的位置');
  const src = fs.readFileSync(path.join(root, 'server/rt/server.mjs'), 'utf8');
  assert(src.includes("if (!id || id === HOST_ID) return reject(400, 'Bad Request');"), '不能用 srv 代號連進來');
  console.log('PASS 伺服器當房主：' + JSON.stringify(types));
  // 伺服器打完一場要送戰績（e: 'result'），大家才拿得到經驗、金幣；全 AI 2 對 2 打到 15 分（直接推進，不等真的時間）
  const out2 = []; const h2 = new MatchHost((t, d) => out2.push([t, d]));
  h2.start({ c: { id: 'test-court', x: 0, z: -2.5, rot: 90 }, sg: -1, six: false, seats: [[null, null], [null, null]], rules: { speed: 1, to: 15, lv: 3 } }); h2.stop();
  for (let n = 0; n < 60 * 60 * 20 && h2.g.VM.on && h2.g.VM.phase !== 'over'; n++) h2.g.hostStep(1 / 60);
  assert.equal(h2.g.VM.phase, 'over', '20 分鐘內要打完');
  const res = out2.find(([t, d]) => t === 'vm' && d.e === 'result'); assert(res, '打完要送戰績');
  assert.equal(Object.keys(res[1].rate).length, 4, '四個人都有評分'); assert(Math.max(...res[1].sc) >= 15);
  console.log('PASS 伺服器打完送戰績：' + res[1].sc.join('：'));
})().catch(e => { console.error(e); process.exit(1); });
