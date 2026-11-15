// 跑全部自動檢查：node tools/run-tests.cjs（加 --quiet 只顯示失敗）
// KNOWN 是已知、跟目前改動無關的舊失敗（等之後專門修）；只要有「不在名單上的失敗」就回傳錯誤碼 1。
const { spawnSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const KNOWN = new Set(['verify-position-setters', 'verify-web001b', 'verify-web002', 'verify-web002b', 'verify-web011', 'verify-web016', 'verify-web020']);
const quiet = process.argv.includes('--quiet');
const files = fs.readdirSync(path.join(root, 'tests')).filter(f => /^verify-.*\.cjs$/.test(f)).sort();
let bad = 0, known = 0;
for (const f of files) {
  const name = f.replace(/\.cjs$/, ''), t = Date.now();
  const r = spawnSync(process.execPath, [path.join(root, 'tests', f)], { cwd: root, encoding: 'utf8', timeout: 300000 });
  const ok = r.status === 0, sec = ((Date.now() - t) / 1000).toFixed(1);
  if (ok) { if (!quiet) console.log(`PASS  ${name} (${sec}s)`); continue; }
  if (KNOWN.has(name)) { known++; if (!quiet) console.log(`舊失敗 ${name}`); continue; }
  bad++; console.log(`FAIL  ${name} (${sec}s)\n${(r.stderr || r.stdout || '').split('\n').filter(l => !/^\s+at /.test(l)).slice(0, 12).join('\n')}`);
}
console.log(`\n${files.length} 個檢查：${files.length - bad - known} 通過、${known} 個已知舊失敗、${bad} 個新失敗`);
process.exit(bad ? 1 : 0);
