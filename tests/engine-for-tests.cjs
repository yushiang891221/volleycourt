// 給檢查程式用：把 engine/ball.js（ES module）和遊戲裡接引擎的那段（BALL_WORLD／BALL_HOOKS）變成可以丟進 vm 跑的程式
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
function engineScript(gym) {
  const engine = fs.readFileSync(path.join(root, 'engine', 'ball.js'), 'utf8').replace(/^export /gm, '');
  const a = gym.indexOf('const BALL_WORLD = '), b = gym.indexOf('function updateBalls(', a);
  if (a < 0 || b < 0) throw new Error('找不到 BALL_WORLD／updateBalls');
  return engine + '\n' + gym.slice(a, b);
}
// 規則引擎（B2）＋遊戲裡的犯規提示文字
function rulesScript(gym) {
  const rules = fs.readFileSync(path.join(root, 'engine', 'rules.js'), 'utf8').replace(/^export /gm, '');
  const a = gym.indexOf('const FAULT_TEXT = {'), b = gym.indexOf('function vmOnTouch(', a);
  if (a < 0 || b < 0) throw new Error('找不到 FAULT_TEXT');
  return rules + '\n' + gym.slice(a, b);
}
module.exports = { engineScript, rulesScript };
