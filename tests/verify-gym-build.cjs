// gym.html 是由 src/gym/ 組裝出來的（node tools/build-gym.cjs）：確認兩邊一致，免得改了原始檔卻忘了重新組裝。
const { execFileSync } = require('node:child_process'), path = require('node:path');
execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'build-gym.cjs'), '--check'], { stdio: 'inherit' });
