// 產生「沒有畫面的比賽核心」server/match/game-core.mjs（B4）
// 做法：直接重用 src/gym/game 裡的遊戲程式——從比賽入口（開賽、每格更新、算球、AI）往下找出會用到的頂層函式與變數，
// 照原本順序抄進一個工廠函式 createGameCore(S)；畫面／音效／提示／連線這類東西換成空殼（S 可以提供自己的版本）。
// 每呼叫一次 createGameCore 就是一間獨立的比賽（VM、球、AI 都是新的），伺服器可以同時開很多間。
// 用法：node tools/build-headless.cjs          （改了 src/gym 之後要重跑；tests/verify-headless.cjs 會檢查是不是最新的）
//       node tools/build-headless.cjs --check
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const req = require('node:module').createRequire(path.join(root, 'server/package.json'));
const acorn = req('acorn'), walk = req('acorn-walk');
const dir = path.join(root, 'src/gym/game');
const files = fs.readdirSync(dir).filter(f => /^\d+-.*\.js$/.test(f)).sort();
const all = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
const ast = acorn.parse(all, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true });

// 畫面、音效、提示、連線、戰績上傳：伺服器不需要，換成空殼（S.名字 有提供就用 S 的）
const STUB = `toast sfx vmSay vbImpact vbBurst netBallHit vmSendResult vmStop vm6Menu vmOpenMenu unlockMouse peerTagsAll
vmRenderAi vbWallFx vmTrailPush vmMark vmOut netBallSound netFxHit netFxStep ballShadowSync updateTweens updateDoors updateWind vbBlockFx
vmGradeShow vmShout labelSprite vmServeHint renderRoomRules vm6RotToast recHit recEvent vbFx tutEv vmPerfTouch vmPerfPoint
makeAvatar avDrive renderUseBar setMenuClose setMenuPick vbManualSetCancel vbNpcToggle
netPeerPlayback rkOnNet refreshPeerAppearance emoOnNet avPoseOf langziReceive renderMpList rkPeerAi makeRacket sqFromMotion myPoseCode rkAiState`.split(/\s+/);
// 一開始就碰到畫面的頂層變數：換成伺服器版本（S.名字 或下面的預設值）
const REPLACE = {
  renderer: '{ domElement: {}, setSize() {}, render() {} }',
  host: '{ appendChild() {}, clientWidth: 1280, clientHeight: 720 }',
  $: '(() => dummy)',
};
// 空殼要回傳東西的（AI 的人形：伺服器只要位置，用空的 three.js 群組代替）
const STUB_DEFAULT = {
  makeAvatar: '({ g: new THREE.Group(), body: new THREE.Group(), hands: [new THREE.Group(), new THREE.Group()], phase: 0, fall: null })',
  // 伺服器不播放別人的動畫：其他玩家的位置直接用他最新送來的那一筆
  netPeerPlayback: '(a[0] && a[0].last ? [a[0].last.x, a[0].last.z, a[0].last.yaw, a[0].last.y || 0] : [0, 0, 0, 0])',
  myPoseCode: '0',
};
const IMPORT = {
  THREE: null,   // 用真的 three（伺服器上只做數學，不畫圖）
  ballSubstep: 'ball', ballSubsteps: 'ball', touchCounts: 'rules', judgeTouch: 'rules', scorePoint: 'rules', judgeLanding: 'rules', createAi: 'ai',
};
// B5：伺服器當房主——也要會收發連線訊息（收擊球請求、送比賽畫格與狀態）
const ENTRY = ['vmApplyRoomRules', 'netOnMessage', 'netTick', 'vmWireTick', 'vmBroadcast', 'vmStatePayload', 'gameRandom', 'GAME_RNG', 'vm6Start', 'vmStart', 'vmUpdate', 'updateBalls', 'vmSetupServe', 'vmAiServe', 'staTick'];

const top = new Map();
function ids(p) { if (!p) return []; if (p.type === 'Identifier') return [p.name]; if (p.type === 'ObjectPattern') return p.properties.flatMap(q => ids(q.value || q.argument)); if (p.type === 'ArrayPattern') return p.elements.flatMap(ids); if (p.type === 'AssignmentPattern') return ids(p.left); if (p.type === 'RestElement') return ids(p.argument); return []; }
for (const n of ast.body) {
  if (n.type === 'FunctionDeclaration') top.set(n.id.name, { kind: 'function', stmt: n });
  else if (n.type === 'VariableDeclaration') for (const d of n.declarations) for (const id of ids(d.id)) top.set(id, { kind: n.kind, stmt: n, decl: d });
  else if (n.type === 'ImportDeclaration') for (const s of n.specifiers) top.set(s.local.name, { kind: 'import', stmt: n });
}
function refs(node) { const s = new Set(); walk.ancestor(node, { Identifier(n, anc) { const p = anc[anc.length - 2]; if (p && p.type === 'MemberExpression' && p.property === n && !p.computed) return; if (p && p.type === 'Property' && p.key === n && !p.computed && !p.shorthand) return; if (top.has(n.name)) s.add(n.name); } }); return s; }
const aiDeps = JSON.parse(fs.readFileSync(path.join(root, 'engine/ai.js'), 'utf8').match(/export const AI_DEPS = (\[.*?\]);/)[1]);
const seen = new Set(), queue = [...ENTRY, ...aiDeps];
while (queue.length) {
  const n = queue.pop(); if (seen.has(n) || !top.has(n)) continue; seen.add(n);
  const t = top.get(n); if (STUB.includes(n) || n in REPLACE || t.kind === 'import') continue;
  for (const r of refs(t.decl || t.stmt)) queue.push(r);
}
// 照原本順序輸出；同一個 const 宣告有好幾個名字時，只留用得到的
const out = [], done = new Set();
for (const n of ast.body) {
  if (n.type === 'ImportDeclaration') continue;
  if (n.type === 'FunctionDeclaration') { const name = n.id.name; if (!seen.has(name)) continue; out.push(STUB.includes(name) ? `function ${name}(...a) { return S.${name} ? S.${name}(...a) : ${STUB_DEFAULT[name] || 'undefined'}; }` : all.slice(n.start, n.end)); continue; }
  if (n.type === 'VariableDeclaration') {
    const keep = n.declarations.filter(d => ids(d.id).some(x => seen.has(x)));
    if (!keep.length) continue;
    out.push(n.kind + ' ' + keep.map(d => { const name = ids(d.id)[0]; if (name in REPLACE) return `${name} = S.${name} || ${REPLACE[name]}`; if (STUB.includes(name)) return `${name} = S.${name} || (() => {})`; return all.slice(d.start, d.end); }).join(', ') + ';');
  }
}
const imports = [...seen].filter(n => top.get(n)?.kind === 'import');
const other = imports.filter(n => !(n in IMPORT));
const text = `// 自動產生（node tools/build-headless.cjs）：不要直接改，改 src/gym/game 再重新產生。
// 沒有畫面的比賽核心（B4）：遊戲本來的比賽程式，畫面／音效／提示換成空殼。每呼叫一次 createGameCore 就是一間獨立的比賽。
import * as THREE from 'three';
import { ballSubstep, ballSubsteps } from '../../engine/ball.js';
import { touchCounts, judgeTouch, scorePoint, judgeLanding } from '../../engine/rules.js';
import { createAi } from '../../engine/ai.js';
import fs from 'node:fs';
// 比賽畫格同步（網頁是另外載入的 js/match-sync.js）：直接讀檔執行，給它一個 module 物件拿 VBMatchSync（不管 Node 把 .js 當 CommonJS 或模組都一樣）
if (!globalThis.VBMatchSync) { const mod = { exports: {} }; new Function('module', fs.readFileSync(new URL('../../js/match-sync.js', import.meta.url), 'utf8'))(mod); globalThis.VBMatchSync = mod.exports; }
export const STUBS = ${JSON.stringify(STUB)};
// 伺服器上沒有網頁：DOM／畫布一律給「什麼都不做、怎麼用都不會壞」的假物件（three.js 建貼圖時也會用到 document）
const dummy = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === 'length' ? 0 : k === 'then' ? undefined : dummy, apply: () => dummy, construct: () => dummy, set: () => true });
if (!globalThis.document) globalThis.document = { createElementNS: () => dummy, createElement: () => dummy };
export function createGameCore(S = {}) {
  const env = S.env || {};
  const document = env.document || { getElementById: () => null, createElement: () => dummy, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: dummy, head: dummy };
  const window = env.window || { addEventListener() {}, dispatchEvent() {} };
  const performance = env.performance || globalThis.performance;
  const localStorage = env.localStorage || { getItem: () => null, setItem() {} };
  const location = env.location || { search: '', hostname: 'server' };
  const requestAnimationFrame = () => 0, addEventListener = () => {}, setTimeout = env.setTimeout || globalThis.setTimeout, clearTimeout = env.clearTimeout || globalThis.clearTimeout;
${other.map(n => n === 'CSS2DObject' ? `  const CSS2DObject = S.CSS2DObject || class extends THREE.Object3D { constructor(el) { super(); this.element = el; } };` : `  const ${n} = S.${n} || (() => null);`).join('\n')}
${out.join('\n').replace(/^/gm, '  ')}
  // 一格比賽：跟網頁 drawFrame 裡比賽相關的順序一樣（體力 → 比賽 → 球）
  function step(dt) { staTick(dt); vmUpdate(dt); updateBalls(dt); }
  // 伺服器當房主時的一格：跟網頁 drawFrame 的順序一樣（連線送狀態 → 比賽 → 球 → 送比賽畫格）
  function hostStep(dt) { const now = performance.now(); staTick(dt); netTick(dt, now); vmUpdate(dt); updateBalls(dt); vmWireTick(); }
  return { GAME_RNG, VM, balls, walk, NET, VB, vmStart, vm6Start, vmUpdate, updateBalls, vmSetupServe, vmMe, step, hostStep, netOnMessage, vmApplyRoomRules, get state() { return state; }, setState(v) { state = v; } };
}
`;
const file = path.join(root, 'server/match/game-core.mjs');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) { console.error('server/match/game-core.mjs 不是最新的：改了 src/gym 之後要跑 node tools/build-headless.cjs'); process.exit(1); }
  console.log('game-core.mjs 是最新的');
} else {
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
  console.log(`已寫出 server/match/game-core.mjs：${out.length} 段宣告、空殼 ${STUB.length} 個、其他 import 改空殼：${other.join(' ') || '無'}`);
}
