// B4：伺服器版比賽核心（server/match/game-core.mjs，由 tools/build-headless.cjs 從遊戲程式產生）
// 1. 是最新的（改了 src/gym 要重新產生）
// 2. 6 對 6、2 對 2 全 AI 各打 3 分鐘：不會出錯、真的有得分、同一個種子兩次結果完全一樣（伺服器當裁判的前提）
// 註：網頁與伺服器用同一個種子時，比賽邏輯相同，但 Chrome 與 Node 的 sin/cos/exp 等最後一位小數不同，幾百格後位置會有微小差異，
//     所以兩者之間不比逐位相同（2026-11-15 實測：第一格差 4e-15，465 格後差 1 mm；B5 由伺服器決定結果，網頁照伺服器顯示）
const { execFileSync } = require('node:child_process'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(root, 'tools', 'build-headless.cjs'), '--check'], { stdio: 'inherit' });
(async () => {
  const { runAiMatch } = await import(require('node:url').pathToFileURL(path.join(root, 'server/match/run-ai-match.mjs')).href);
  for (const six of [true, false]) {
    const a = runAiMatch({ six, seconds: 180, seed: 4242, every: 30 }), b = runAiMatch({ six, seconds: 180, seed: 4242, every: 30 });
    assert.equal(JSON.stringify(a.log), JSON.stringify(b.log), '同一個種子要算出一樣的比賽');
    const pts = a.sc.split(':').reduce((x, y) => x + +y, 0) + ((a.sets || [0, 0])[0] + (a.sets || [0, 0])[1]) * 25;
    assert(pts >= 5, `3 分鐘要打出幾分（現在 ${a.sc}）`);
    assert(new Set(a.log.map(l => l.split('|')[1])).size >= 3, '要經過發球、對打、死球');
    console.log(`PASS ${six ? '6 對 6' : '2 對 2'} 全 AI 3 分鐘：比分 ${a.sc}、同種子兩次完全一樣`);
  }
})().catch(e => { console.error(e); process.exit(1); });
