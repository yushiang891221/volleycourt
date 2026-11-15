// B3 驗收（結構）：engine/ai.js 跟遊戲的接線完整——每個轉接都有對應的 AI 函式、遊戲真的有定義 aiEngine、
// AI 用到的每個遊戲東西 AI_GAME 都有提供。（行為一致另外在瀏覽器用固定亂數讓新舊版打同一場 AI 對 AI 比對過）
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const gym = fs.readFileSync(path.join(root, 'gym.html'), 'utf8');
(async () => {
  const ai = await import('file://' + path.join(root, 'engine', 'ai.js').replaceAll('\\', '/'));
  const names = Object.keys(ai.createAi(new Proxy({}, { get: () => undefined })));
  const wrappers = [...gym.matchAll(/^function (\w+)\(\.\.\.a\) \{ return aiEngine\(\)\.(\w+)\(\.\.\.a\); \}/gm)];
  assert(wrappers.length >= 40, '遊戲裡要有 AI 轉接');
  for (const [, a, b] of wrappers) { assert.equal(a, b, '轉接名字要一樣：' + a); assert(names.includes(a), 'engine/ai.js 沒有 ' + a); }
  for (const n of names) assert(wrappers.some(w => w[1] === n), '遊戲裡少了 ' + n + ' 的轉接');
  assert(/^function aiEngine\(\) \{ return AI_ENGINE \|\| \(AI_ENGINE = createAi\(AI_GAME\)\); \}/m.test(gym), '遊戲要定義 aiEngine（14-0-ai-engine.js 要被組進 gym.html）');
  assert(gym.includes("import { createAi } from './engine/ai.js';"), '遊戲要 import createAi');
  const block = gym.slice(gym.indexOf('const AI_GAME = {'), gym.indexOf('let AI_ENGINE = null;'));
  for (const d of ai.AI_DEPS) assert(block.includes(`get ${d}() { return ${d}; }`), 'AI_GAME 少了 ' + d);
  // engine/ai.js 裡不能直接用遊戲的名字（一律要經過 G.）
  const src = fs.readFileSync(path.join(root, 'engine', 'ai.js'), 'utf8').split('export function createAi(G) {')[1];
  for (const d of ai.AI_DEPS) {
    const bare = src.replace(new RegExp(`\\b${d}: G\\.${d}\\b`, 'g'), '').replace(new RegExp(`G\\.${d}(?![\\w$])`, 'g'), '');
    const left = [...bare.matchAll(new RegExp(`(?<![\\w$.'"])${d.replace('$', '\\$')}(?![\\w$'"])`, 'g'))];
    assert(left.length === 0 || ['S', 'net', 'pose', 'mode', 'pair'].includes(d), `engine/ai.js 直接用了遊戲的 ${d}`);
  }
  console.log(`PASS AI 引擎接線完整：${names.length} 個 AI 函式、${ai.AI_DEPS.length} 個遊戲依賴`);
})().catch(e => { console.error(e); process.exit(1); });
