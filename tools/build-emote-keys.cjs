// 從遊戲（src/gym/game/07-net.js）抽出 T 輪盤動作的關鍵影格，寫成 js/emote-keys.js 給大廳用。
// 大廳的炫技要跟遊戲裡「一模一樣」（使用者 2026-11-19），所以不另外抄一份：遊戲動作改了就重跑這支。
//   node tools/build-emote-keys.cjs          產生
//   node tools/build-emote-keys.cjs --check  只檢查是不是最新的（tests 用）
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/gym/game/07-net.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => { const a = src.indexOf(from); const b = src.indexOf(to, a + from.length); if (a < 0 || b < 0) throw new Error('07-net.js 找不到：' + from + ' … ' + to); return src.slice(a, b).trimEnd(); };
const fn = name => { const a = src.indexOf(`function ${name}(`); if (a < 0) throw new Error('07-net.js 找不到 function ' + name); let i = src.indexOf('{', a), depth = 0; for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; } return src.slice(a, i + 1); };
const out = `// 自動產生：node tools/build-emote-keys.cjs（來源 src/gym/game/07-net.js）——不要手改，改遊戲那邊再重跑
/* eslint-disable */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
${cut('const AVP = {', '\n// 會碰到球的姿勢')}
${fn('avMix')}
${cut('const langziArmsDown', '\nfunction emoKeyPosition')}
${fn('emoPose')}
export { AVP, EMO_KEYS, avMix, emoKeyDuration, emoKeySample, emoPose };
`;
const file = path.join(root, 'js/emote-keys.js');
if (process.argv.includes('--check')) {
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
  if (now !== out) { console.error('js/emote-keys.js 跟遊戲的動作不一樣了：請跑 node tools/build-emote-keys.cjs'); process.exit(1); }
  console.log('js/emote-keys.js 跟遊戲動作一致');
} else { fs.writeFileSync(file, out); console.log('已寫出 js/emote-keys.js'); }
