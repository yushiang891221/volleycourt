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
// AI 引擎（B3）：遊戲裡的 AI 函式變成「aiEngine().名字(...)」轉接；檢查程式的 vm 環境要能找到 aiEngine。
// installAi(vm)：之後只要丟進 vm 的程式用到 aiEngine()，就先在那個環境裡載入 AI 的函式本體。
// 檢查程式常常把某些 AI 函式換成假的（例如 aiPay），所以這裡把 engine/ai.js 的每個函式還原成「讀環境全域」的寫法（拿掉 G.），
// 放進 __ai 表；AI 函式互相呼叫時走環境裡的名字（假的或轉接），跟搬出去之前完全一樣。
function aiScript() {
  const ai = fs.readFileSync(path.join(root, 'engine', 'ai.js'), 'utf8');
  const body = ai.slice(ai.indexOf('export function createAi(G) {') + 'export function createAi(G) {'.length, ai.lastIndexOf('  return {'));
  const plain = body.replace(/\b([A-Za-z_$][\w$]*): G\.\1\b/g, '$1').replace(/(?<![\w$.])G\.([A-Za-z_$][\w$]*)/g, '$1')
    .replace(/^  (async )?function ([A-Za-z_$][\w$]*)\(/gm, (m, as, n) => `__ai.${n} = ${as || ''}function ${n}(`);
  return 'if (typeof gameRandom === "undefined") globalThis.gameRandom = () => Math.random();\nvar __ai = {};\n' + plain + '\nfunction aiEngine() { return __ai; }\n';
}
function installAi(vm) {
  if (vm.__aiInstalled) return; vm.__aiInstalled = true;
  const seen = new WeakSet(), run = vm.runInContext, runNew = vm.runInNewContext;
  const prep = (code, ctx) => {
    if (typeof code === 'string' && /gameRandom|fxRandom/.test(code) && ctx && !ctx.__gameRandom) { ctx.__gameRandom = true; run.call(vm, 'if (typeof gameRandom === "undefined") globalThis.gameRandom = () => Math.random(); if (typeof fxRandom === "undefined") globalThis.fxRandom = () => Math.random();', ctx); }   /* 比賽專用亂數與畫面亂數：測試環境照 Math.random */ if (typeof code === 'string' && code.includes('aiEngine()') && ctx && !seen.has(ctx)) { seen.add(ctx); run.call(vm, aiScript(), ctx); } };
  vm.runInContext = function (code, ctx, ...rest) { prep(code, ctx); return run.call(this, code, ctx, ...rest); };
  vm.runInNewContext = function (code, ctx = {}, ...rest) { if (typeof code === 'string' && (code.includes('aiEngine()') || /gameRandom|fxRandom/.test(code))) { vm.createContext(ctx); prep(code, ctx); return run.call(this, code, ctx, ...rest); } return runNew.call(this, code, ctx, ...rest); };
}
module.exports = { engineScript, rulesScript, aiScript, installAi };
