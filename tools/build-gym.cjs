// 組裝 gym.html：src/gym/shell.html（網頁外框）＋ src/gym/style.css（樣式）＋ src/gym/game/*.js（遊戲主程式，照檔名順序接起來）
// 用法：node tools/build-gym.cjs          → 寫出 gym.html
//       node tools/build-gym.cjs --check  → 只檢查 gym.html 是不是最新的（tests/verify-gym-build.cjs 會用）
// 為什麼這樣做：遊戲主程式原本是 gym.html 裡一整段 1 萬多行的 <script type="module">，所有程式共用同一個範圍。
// 拆成多個檔案再原樣接回去，行為完全不變；之後改程式只要改 src/gym 裡對應的小檔案，再跑這個工具。
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), src = path.join(root, 'src', 'gym');
function build() {
  const shell = fs.readFileSync(path.join(src, 'shell.html'), 'utf8');
  const style = fs.readFileSync(path.join(src, 'style.css'), 'utf8');
  const all = fs.readdirSync(path.join(src, 'game')), parts = all.filter(f => /^\d+-.*\.js$/.test(f)).sort();
  const skipped = all.filter(f => !parts.includes(f));
  if (skipped.length) throw new Error('src/gym/game 裡有檔名格式不對、不會被組進去的檔案（要「數字-名字.js」）：' + skipped.join('、'));
  const game = parts.map(f => fs.readFileSync(path.join(src, 'game', f), 'utf8')).join('');
  for (const mark of ['/*@@APP_STYLE@@*/\n', '//@@APP_SCRIPT@@\n']) if (!shell.includes(mark)) throw new Error('shell.html 少了 ' + mark.trim());
  return shell.replace('/*@@APP_STYLE@@*/\n', () => style).replace('//@@APP_SCRIPT@@\n', () => game);
}
const out = build(), file = path.join(root, 'gym.html');
if (process.argv.includes('--check')) {
  const now = fs.readFileSync(file, 'utf8');
  if (now !== out) { console.error('gym.html 不是最新的：改了 src/gym 之後要跑 node tools/build-gym.cjs'); process.exit(1); }
  console.log('gym.html 是最新的');
} else { fs.writeFileSync(file, out); console.log('已寫出 gym.html'); }
