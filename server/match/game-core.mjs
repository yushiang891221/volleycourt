// 自動產生（node tools/build-headless.cjs）：不要直接改，改 src/gym/game 再重新產生。
// 沒有畫面的比賽核心（B4）：遊戲本來的比賽程式，畫面／音效／提示換成空殼。每呼叫一次 createGameCore 就是一間獨立的比賽。
import * as THREE from 'three';
import { ballSubstep, ballSubsteps } from '../../engine/ball.js';
import { touchCounts, judgeTouch, scorePoint, judgeLanding } from '../../engine/rules.js';
import { createAi } from '../../engine/ai.js';
import fs from 'node:fs';
// 比賽畫格同步（網頁是另外載入的 js/match-sync.js）：直接讀檔執行，給它一個 module 物件拿 VBMatchSync（不管 Node 把 .js 當 CommonJS 或模組都一樣）
if (!globalThis.VBMatchSync) { const mod = { exports: {} }; new Function('module', fs.readFileSync(new URL('../../js/match-sync.js', import.meta.url), 'utf8'))(mod); globalThis.VBMatchSync = mod.exports; }
// 3～5 人制的站位（網頁是另外載入的 js/court-formations.js，會掛在 globalThis.CourtFormations）
if (!globalThis.CourtFormations) new Function(fs.readFileSync(new URL('../../js/court-formations.js', import.meta.url), 'utf8'))();
export const STUBS = ["toast","sfx","vmSay","vbImpact","vbBurst","vbFloorImpact","vbShake","vbScreenFlash","netBallHit","vmStop","vm6Menu","vmOpenMenu","unlockMouse","peerTagsAll","vmRenderAi","vbWallFx","vmTrailPush","vmMark","vmOut","netBallSound","netFxHit","netFxStep","ballShadowSync","updateTweens","updateDoors","updateWind","vbBlockFx","vmGradeShow","vmShout","labelSprite","vmServeHint","renderRoomRules","vm6RotToast","recHit","recEvent","vbFx","tutEv","makeAvatar","avDrive","renderUseBar","setMenuClose","setMenuPick","vbManualSetCancel","vbNpcToggle","netPeerPlayback","rkOnNet","refreshPeerAppearance","emoOnNet","avPoseOf","langziReceive","renderMpList","rkPeerAi","makeRacket","sqFromMotion","myPoseCode","rkAiState","hlOnPoint","hlReset","hlPanelBtn","vmResultHlBtn"];
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
  const normalizeLook = S.normalizeLook || (() => null);
  const myLookCode = S.myLookCode || (() => null);
  const readLook = S.readLook || (() => null);
  const CSS2DObject = S.CSS2DObject || class extends THREE.Object3D { constructor(el) { super(); this.element = el; } };
  const aiLook = S.aiLook || (() => null);
  const readWornJersey = S.readWornJersey || (() => null);
  const myTitle = S.myTitle || (() => null);
  const GAME_RNG = { s: 0 };
  function gameRandom() { if (!GAME_RNG.s) return Math.random(); GAME_RNG.s = (GAME_RNG.s * 16807) % 2147483647; return GAME_RNG.s / 2147483647; }
  const fxRandom = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const $ = S.$ || (() => dummy);
  const NETS = { men: { label: '男網 2.43 m', h: 2.43 }, women: { label: '女網 2.24 m', h: 2.24 }, mixed: { label: '混網 2.35 m', h: 2.35 } };
  const CAT = {
    vb: { label: '排球場（標準規格）', group: '球場', w: 25, d: 18, court: 'vb', play: [18, 9], color: '#4E9468', tag: true },
    vbs: { label: '排球場（精簡）', group: '球場', w: 24, d: 15, court: 'vb', play: [18, 9], color: '#4E9468', tag: true },
    vbt: { label: '排球場（並排、兩側不留緩衝）', group: '球場', w: 25, d: 9, court: 'vb', play: [18, 9], color: '#4E9468', tag: true },
    bd: { label: '羽球場', group: '球場', w: 17.4, d: 8.1, court: 'bd', play: [13.4, 6.1], color: '#3C8A63', tag: true },
    pb: { label: '匹克球場', group: '球場', w: 18.3, d: 9.1, court: 'pb', play: [13.41, 6.1], color: '#2F6F86', tag: true },
    bk: { label: '籃球 3 對 3 半場', group: '球場', w: 17, d: 13, court: 'bk', play: [15, 11], color: '#B5763E', tag: true },
    bench: { label: '長椅', group: '休息與服務', w: 2, d: 0.45, h: 0.45, color: '#B98A57' },
    sofa: { label: '沙發', group: '休息與服務', w: 2.2, d: 0.9, h: 0.85, color: '#3E4A5E' },
    table: { label: '桌椅組', group: '休息與服務', w: 1.6, d: 1.6, h: 0.75, color: '#D8C3A0' },
    rug: { label: '休息區地墊', group: '休息與服務', w: 6, d: 4, h: 0.02, color: '#8A8F7A', resize: true, tag: true },
    counter: { label: '櫃台', group: '休息與服務', w: 3, d: 0.8, h: 1.1, color: '#2A2F3A', resize: true, tag: true },
    vending: { label: '販賣機', group: '休息與服務', w: 1, d: 0.8, h: 1.8, color: '#B8352E', tag: true },
    water: { label: '飲水機', group: '休息與服務', w: 0.5, d: 0.5, h: 1.15, color: '#D9E2EA' },
    locker: { label: '置物櫃', group: '休息與服務', w: 1.8, d: 0.5, h: 1.9, color: '#5E6B7A', resize: true, tag: true },
    plant: { label: '植栽', group: '休息與服務', w: 0.6, d: 0.6, h: 1.5, color: '#4F7A4A' },
    aed: { label: 'AED', group: '休息與服務', w: 0.45, d: 0.2, h: 0.5, color: '#2E9E5B', tag: true },
    foldtable: { label: '白色折疊桌', group: '休息與服務', w: 1.8, d: 0.75, h: 0.74, color: '#EDEFF0', resize: true },
    foldchair: { label: '折疊椅', group: '休息與服務', w: 0.46, d: 0.5, h: 0.82, color: '#ECEEF0' },
    campchair: { label: '木製露營椅', group: '休息與服務', w: 0.55, d: 0.62, h: 0.8, color: '#9C7A55' },
    camptable: { label: '木製露營小桌', group: '休息與服務', w: 0.6, d: 0.6, h: 0.6, color: '#9C7A55' },
    desk: { label: '辦公桌（電腦）', group: '休息與服務', w: 1.4, d: 0.7, h: 0.75, color: '#F2F2F0' },
    cubby: { label: '木格置物櫃', group: '休息與服務', w: 1.6, d: 0.35, h: 1.5, color: '#C89A62', resize: 'w', tag: true },
    shoerack: { label: '鞋架', group: '休息與服務', w: 0.6, d: 0.3, h: 1.0, color: '#1F2124' },
    fridge: { label: '小冰箱', group: '休息與服務', w: 0.55, d: 0.55, h: 1.3, color: '#E9ECEE', tag: true },
    standac: { label: '落地冷氣', group: '休息與服務', w: 0.55, d: 0.38, h: 1.8, color: '#F1F2F3' },
    floorfan: { label: '立扇', group: '休息與服務', w: 0.45, d: 0.45, h: 1.2, color: '#1F2124' },
    curtain: { label: '更衣簾', group: '休息與服務', w: 1.2, d: 1.0, h: 2.1, color: '#7A5A3E', tag: true },
    steelsink: { label: '不鏽鋼洗手台', group: '休息與服務', w: 0.6, d: 0.5, h: 0.9, color: '#C8CCD0', tag: true },
    purifier: { label: '淨水器', group: '休息與服務', w: 0.3, d: 0.4, h: 0.45, color: '#E9ECEE' },
    coffee: { label: '長茶几（矮桌）', group: '休息與服務', w: 1.2, d: 0.5, h: 0.42, color: '#B98A57', resize: 'w' },
    lowcubby: { label: '矮木格置物櫃', group: '休息與服務', w: 1.2, d: 0.35, h: 0.9, color: '#C89A62', resize: 'w', tag: true },
    shelf: { label: '置物鐵架', group: '休息與服務', w: 1.8, d: 0.45, h: 2.0, color: '#2A2F3A', resize: 'w' },
    toilet: { label: '馬桶', group: '休息與服務', w: 0.45, d: 0.7, h: 0.8, color: '#F6F6F3', zoneOK: true },
    stall: { label: '廁所隔間（含馬桶）', group: '休息與服務', w: 0.95, d: 1.5, h: 2.0, color: '#D9D4CB', resize: true, zoneOK: true },
    urinal: { label: '小便斗', group: '休息與服務', w: 0.45, d: 0.4, h: 1.4, color: '#F6F6F3', zoneOK: true },
    sinkrow: { label: '洗手台（含鏡子）', group: '休息與服務', w: 1.2, d: 0.55, h: 1.9, color: '#ECEAE5', resize: 'w', zoneOK: true },
    showerstall: { label: '淋浴間', group: '休息與服務', w: 1.0, d: 1.1, h: 2.1, color: '#D7E6EA', zoneOK: true },
    warmmat: { label: '暖身墊＋滾筒', group: '比賽設備', w: 0.6, d: 1.7, h: 0.15, color: '#22304A', zoneOK: true },
    ballbasket: { label: '可折疊球籃', group: '比賽設備', w: 0.62, d: 0.62, h: 0.8, color: '#22304A' },
    flipscore: { label: '翻分板（桌上型）', group: '比賽設備', w: 0.6, d: 0.35, h: 0.6, color: '#F4F4F2' },
    whiteboard: { label: '戰術白板（移動式）', group: '比賽設備', w: 1.3, d: 0.6, h: 1.85, color: '#F4F4F2', tag: true },
    packac: { label: '箱型冷氣（落地大台）', group: '空調', w: 1.2, d: 0.6, h: 1.9, color: '#E9ECEE', tag: true },
    watertall: { label: '飲水機（冰溫熱）', group: '休息與服務', w: 0.45, d: 0.45, h: 1.4, color: '#C8CCD0', tag: true },
    speaker: { label: '音響喇叭（腳架）', group: '牆面', w: 0.9, d: 0.9, h: 1.95, color: '#1F2124' },
    bins: { label: '分類回收桶', group: '休息與服務', w: 0.95, d: 0.36, h: 0.78, color: '#8E9399', tag: true },
    wallfan: { label: '工業壁扇', group: '空調', w: 0.6, d: 0.35, h: 0.6, mountY: 2.6, color: '#1F2124', wall: true, zoneOK: true },
    exhaust: { label: '排風扇（牆面）', group: '空調', w: 0.64, d: 0.12, h: 0.64, mountY: 4.5, color: '#B9BCC0', wall: true, zoneOK: true },
    tv: { label: '壁掛電視', group: '牆面', w: 1.24, d: 0.06, h: 0.72, mountY: 2.0, color: '#15181D', wall: true, zoneOK: true, tag: true },
    clock: { label: '掛鐘', group: '牆面', w: 0.35, d: 0.05, h: 0.35, mountY: 3.0, color: '#1F2124', wall: true, zoneOK: true },
    wc: { label: '廁所（舊版房間）', group: '空間', w: 5, d: 4.5, h: 2.6, color: '#C9D6DC', room: true, resize: true, tag: true },
    shower: { label: '淋浴間（舊版房間）', group: '空間', w: 3, d: 4, h: 2.6, color: '#C3D6D3', room: true, resize: true, tag: true },
    changing: { label: '更衣室（舊版房間）', group: '空間', w: 4, d: 4, h: 2.6, color: '#D3CBDC', room: true, resize: true, tag: true },
    office: { label: '辦公室（舊版房間）', group: '空間', w: 4, d: 3, h: 2.6, color: '#D9CBB0', room: true, resize: true, tag: true },
    referee: { label: '裁判台', group: '比賽設備', w: 0.8, d: 0.8, h: 2.2, color: '#E8E2D6', zoneOK: true },
    scoreboard: { label: '計分板', group: '比賽設備', w: 1.4, d: 0.5, h: 1.6, color: '#1F2933', zoneOK: true, tag: true },
    ballcart: { label: '球車', group: '比賽設備', w: 1, d: 0.6, h: 1, color: '#E0B33A' },
    bleacher: { label: '觀眾席', group: '比賽設備', w: 6, d: 2.4, h: 1.2, color: '#8D99A6', resize: true, tag: true },
    netwall: { label: '隔網', group: '比賽設備', w: 18, d: 0.1, h: 5, color: '#1F2933', resize: 'w', tag: true },
    banner: { label: '牆面布幕／海報', group: '牆面、消防與安全', w: 8, d: 0.04, h: 3.6, mountY: 0.4, color: '#E9E9E6', wall: true, zoneOK: true, resize: 'w' },
    aircon: { label: '冷氣（掛牆）', group: '牆面、消防與安全', w: 1.2, d: 0.32, h: 0.42, mountY: 2.8, color: '#F2F4F6', wall: true, zoneOK: true },
    extinguisher: { label: '滅火器', group: '牆面、消防與安全', w: 0.35, d: 0.3, h: 0.6, mountY: 0, color: '#D7262B', wall: true, zoneOK: true },
    emlight: { label: '緊急照明燈', group: '牆面、消防與安全', w: 0.4, d: 0.12, h: 0.15, mountY: 2.6, color: '#F4F4F2', wall: true, zoneOK: true },
    exitsign: { label: '避難方向指示燈', group: '牆面、消防與安全', w: 0.45, d: 0.06, h: 0.2, mountY: 2.3, color: '#1E9E4A', wall: true, zoneOK: true },
    smoke: { label: '偵煙器（天花板）', group: '牆面、消防與安全', w: 0.2, d: 0.2, h: 0.06, color: '#F4F4F2', ceiling: true },
    crashpad: { label: '防撞墊（牆面）', group: '牆面、消防與安全', w: 6, d: 0.06, h: 2, mountY: 0, color: '#1E2A44', wall: true, zoneOK: true, resize: 'w', tag: true },
    firstaid: { label: '急救箱', group: '牆面、消防與安全', w: 0.42, d: 0.16, h: 0.32, mountY: 1.4, color: '#F4F4F2', wall: true, zoneOK: true },
    cctv: { label: '監視器（安全）', group: '牆面、消防與安全', w: 0.25, d: 0.25, h: 0.15, mountY: 3.2, color: '#1F2933', wall: true, zoneOK: true },
    heater: { label: '熱水器', group: '牆面、消防與安全', w: 0.45, d: 0.45, h: 0.9, mountY: 1.2, color: '#E8ECEF', wall: true, zoneOK: true },
    panel: { label: '配電盤', group: '牆面、消防與安全', w: 0.8, d: 0.25, h: 1.2, mountY: 0.6, color: '#8A96A6', wall: true, zoneOK: true, tag: true },
    light: { label: 'LED 條燈', group: '天花板', w: 2.4, d: 0.2, h: 0.1, color: '#F4F1E6', ceiling: true },
    fan: { label: '大型吊扇', group: '天花板', w: 7.3, d: 7.3, h: 1.2, color: '#3A4654', ceiling: true, diam: true, tag: true },
    camera: { label: '網路攝影機（智慧球場，掛牆）', group: '天花板', w: 0.4, d: 0.4, h: 0.3, color: '#22303F', ceiling: true, tag: true },
  };
  let state = null;
  let history = [];
  let snapOn = true;
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function sizeOf(it) { const d = CAT[it.type]; return { w: it.w ?? d.w, d: it.d ?? d.d }; }
  const host = S.host || { appendChild() {}, clientWidth: 1280, clientHeight: 720 };
  const renderer = S.renderer || { domElement: {}, setSize() {}, render() {} };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
  const perf = { n: 0, sum: 0 };
  let cols = [];
  let colliders = [];
  const matCache = new Map();
  function mat(color, extra) {
    const key = color + (extra ? JSON.stringify(extra) : '');
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.3, ...(extra || {}) }));
    return matCache.get(key);
  }
  function worldUV(geo) {
    const p = geo.parameters, uv = geo.attributes.uv;
    const dims = [[p.depth, p.height], [p.depth, p.height], [p.width, p.depth], [p.width, p.depth], [p.width, p.height], [p.width, p.height]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    return geo;
  }
  function box(g, w, h, d, color, x = 0, y = 0, z = 0, extra) {
    const m = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, h, d)), color && color.isMaterial ? color : mat(color, extra));
    m.position.set(x, y + h / 2, z);
    g.add(m);
    return m;
  }
  function tag(g, text, y, cls = '', x = 0, z = 0) {
    const el = document.createElement('div');
    el.className = 'tag ' + cls;
    el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.set(x, y, z);
    o.userData.isTag = true;
    g.add(o);
    return o;
  }
  const PX = 40;
  const PLAY = { vb: [18, 9], bd: [13.4, 6.1], pb: [13.41, 6.1], bk: [15, 11] };
  function extraLayout(kind, fw, fd) {
    const [pw, pd] = PLAY[kind];
    if (kind === 'bk' || kind === 'vb') return [{ x: 0, z: 0, r: (fw >= fd) !== (pw >= pd) }];
    const gap = 0.9, m = 0.3, fit = (a, b) => Math.max(0, Math.floor((a - 2 * m + gap) / (b + gap)));
    const A = [fit(fw, pw), fit(fd, pd)], Bv = [fit(fw, pd), fit(fd, pw)];
    const useB = Bv[0] * Bv[1] > A[0] * A[1], [nx, nz] = useB ? Bv : A, [sx, sz] = useB ? [pd, pw] : [pw, pd];
    const out = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) out.push({ x: (i - (nx - 1) / 2) * (sx + gap), z: (j - (nz - 1) / 2) * (sz + gap), r: useB });
    return out.slice(0, 6);
  }
  let netTex = null;
  const netTexW = (() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const c = cv.getContext('2d'); c.strokeStyle = 'rgba(245,245,240,0.9)'; c.lineWidth = 1.4;
    for (let x = 0; x <= 256; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 64); c.stroke(); } for (let y = 0; y <= 64; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  function netTexture(tone) {
    if (tone === 'white') return netTexW;
    if (netTex) return netTex;
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const c = cv.getContext('2d');
    c.strokeStyle = 'rgba(20,20,20,0.85)'; c.lineWidth = 1.2;
    for (let x = 0; x <= 256; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 64); c.stroke(); }
    for (let y = 0; y <= 64; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); }
    netTex = new THREE.CanvasTexture(cv);
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    return netTex;
  }
  const NET_TEXT_TEX = new Map();
  function netTextTexture(span, depth, text, band = 4.5) {
    const key = `${span}|${depth}|${text}|${band}`; if (NET_TEXT_TEX.has(key)) return NET_TEXT_TEX.get(key);
    const CELL = 0.0625, PX = 12, cols = Math.round(span / CELL), rows = Math.round(depth / CELL), W = cols * PX, H = rows * PX, PPM = W / span;   // PPM＝每公尺幾像素
    // 2026-11-19 使用者給的樣子：細的無襯線字、字距拉開、整排排滿兩條側邊白帶中間；字高撐滿上下白帶之間，只留一點點空隙
    const TOP = 0.07, BOT = 0.05, SIDE = 0.05, GAP = 0.035;   // 上白帶、下白帶、側邊白帶寬（公尺）、字跟白帶的空隙
    const mk = document.createElement('canvas'); mk.width = W; mk.height = H; const m = mk.getContext('2d');   // 字的遮罩
    const FONT = (px) => `900 ${px}px "Helvetica Neue", Helvetica, "Arial Black", Arial, "Noto Sans TC", sans-serif`;
    const capH = (depth - TOP - BOT - GAP * 2) * PPM, base = (depth - BOT - GAP) * PPM;
    m.font = FONT(100); const asc = m.measureText('E').actualBoundingBoxAscent || 72, size = 100 * capH / asc; m.font = FONT(size); m.textBaseline = 'alphabetic';
    const chars = [...text], ws = chars.map((ch) => (ch === ' ' ? 0 : m.measureText(ch).width)), sum = ws.reduce((n, w) => n + w, 0);
    const gaps = chars.length - 1 + chars.filter((ch) => ch === ' ').length * 0.7;   // 空白＝字距的 1.7 倍
    const total = Math.min(span * 0.86, band * 2 - 0.7) * PPM, gap = Math.max(size * 0.12, (total - sum) / Math.max(1, gaps));
    let x = (W - (sum + gap * gaps)) / 2;
    m.fillStyle = '#fff';
    chars.forEach((ch, i) => { if (ch !== ' ') m.fillText(ch, x, base); x += ws[i] + (i < chars.length - 1 ? gap : 0) + (ch === ' ' ? gap * 0.7 : 0); });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    const grid = (ctx, color, lw) => { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); for (let i = 0; i <= cols; i++) { ctx.moveTo(i * PX, 0); ctx.lineTo(i * PX, H); } for (let j = 0; j <= rows; j++) { ctx.moveTo(0, j * PX); ctx.lineTo(W, j * PX); } ctx.stroke(); };
    grid(c, 'rgba(20,20,20,0.85)', 1.8);
    // 字＝印在網線上：只有字經過的那段網線變白（網目一樣是空的，看得到對面）；字裡面的網線畫粗一點，細字也看得出形狀
    const lit = document.createElement('canvas'); lit.width = W; lit.height = H; const l = lit.getContext('2d');
    grid(l, 'rgba(255,255,255,0.38)', 6.5);   /* 2026-11-20：再粗一點、淡一點 */ l.globalCompositeOperation = 'destination-in'; l.drawImage(mk, 0, 0);
    c.globalAlpha = 0.06; c.drawImage(mk, 0, 0); c.globalAlpha = 1;   // 字裡面的網目鋪一層極淡的白（2026-11-19 使用者：太細太深 → 加粗；又說太深 → 字的網線半透明、底更淡）
    c.drawImage(lit, 0, 0);
    // 下白帶＋兩條側邊白帶（在邊線正上方、天線下面）：畫在網面上，網子被打到晃的時候一起晃
    c.fillStyle = '#F7F7F2'; c.fillRect(0, H - BOT * PPM, W, BOT * PPM);
    for (const z of [-band, band]) c.fillRect(W / 2 + z * PPM - SIDE * PPM / 2, 0, SIDE * PPM, H);
    const t = new THREE.CanvasTexture(cv); t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.colorSpace = THREE.SRGBColorSpace;
    NET_TEXT_TEX.set(key, t); return t;
  }
  function net(g, span, top, depth, tape = '#FFFFFF', text = '') {
    const t = text ? netTextTexture(span, depth, text) : netTexture().clone(); if (!text) { t.needsUpdate = true; t.repeat.set(span / 2, depth / 0.5); }
    // 網面分格：被球打到時可以讓網子局部鼓起來、晃幾下
    const m = new THREE.Mesh(new THREE.PlaneGeometry(span, depth, 24, 4), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.y = Math.PI / 2;
    m.position.set(0, top - depth / 2, 0);
    m.userData.netMesh = { span, depth, base: m.geometry.attributes.position.array.slice() };
    g.add(m);
    const tp = box(g, 0.02, 0.07, span, tape, 0, top - 0.07, 0); if (tp) tp.userData.netTape = true;
  }
  function netFxHit(...a) { return S.netFxHit ? S.netFxHit(...a) : undefined; }
  function netFxStep(...a) { return S.netFxStep ? S.netFxStep(...a) : undefined; }
  function inside(poly) { if (state.building.poly) return poly.every(([x, z]) => pip(x, z, state.building.poly) || nearestEdge(x, z, state.building.poly).d < 0.05); const { L, W } = state.building; return poly.every(([x, z]) => Math.abs(x) <= L / 2 + 0.03 && Math.abs(z) <= W / 2 + 0.03); }
  function toast(...a) { return S.toast ? S.toast(...a) : undefined; }
  function snap(v) { return snapOn ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100; }
  const share = { mode: 'unknown', known: null, timer: null, busy: false, pending: false };
  function polyArea(P) { let a = 0; for (let i = 0; i < P.length; i++) { const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % P.length]; a += x1 * z2 - x2 * z1; } return a / 2; }
  function pip(x, z, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; }
  function edgesOf(P) {
    const ccw = polyArea(P) > 0;   // with x east / z south, positive area means clockwise on the map
    return P.map((a, i) => {
      const b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
      let nx = dz / len, nz = -dx / len;            // one of the two normals
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (pip(mx + nx * 0.3, mz + nz * 0.3, P)) { nx = -nx; nz = -nz; }   // make it point outward
      return { a, b, dx: dx / len, dz: dz / len, len, nx, nz, mx, mz, ccw };
    });
  }
  function nearestEdge(x, z, P) {
    let best = null;
    for (const e of edgesOf(P)) {
      const t = Math.max(0, Math.min(e.len, (x - e.a[0]) * e.dx + (z - e.a[1]) * e.dz));
      const px = e.a[0] + e.dx * t, pz = e.a[1] + e.dz * t, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { e, t, px, pz, d };
    }
    return best;
  }
  let mode = 'plan';
  const walk = { on: false, x: 0, z: 0, yaw: 0, pitch: -0.04, keys: new Set(), target: null, joy: { x: 0, y: 0 }, zoneKey: '', lastZ: 0, saved: null, look: null, off: new Set(), sit: null, hold: null, focus: null, lastF: 0, score: [0, 0], sets: [0, 0], drinks: 0, dark: false, open: new Set(), bags: new Map(), spike: null, paused: false, clickT: 0 };
  const EYE = 1.62;
  const STOW = new Set();
  function solidSegs(ballOnly) {
    const out = [];
    for (const it of state.items) {
      const def = CAT[it.type]; if (!def || STOW.has(it.id)) continue;
      if (it.type === 'netwall') { const { w } = sizeOf(it); out.push([...toWorldOf(it, -w / 2, 0), ...toWorldOf(it, w / 2, 0)]); continue; }
      if (ballOnly || !def.court) continue;
      const use = it.mode === 'lines' ? def.court : it.use || def.court;
      if (use === 'vb') out.push([...toWorldOf(it, 0, -5.5), ...toWorldOf(it, 0, 5.5)]);
      else if (use === 'bd' || use === 'pb') {
        const hw = use === 'bd' ? 3.05 : 3.35;
        for (const L of use === def.court ? [{ x: 0, z: 0, r: false }] : extraLayout(use, def.w, def.d)) out.push(L.r ? [...toWorldOf(it, L.x - hw, L.z), ...toWorldOf(it, L.x + hw, L.z)] : [...toWorldOf(it, L.x, L.z - hw), ...toWorldOf(it, L.x, L.z + hw)]);
      }
    }
    return out;
  }
  function toWorldOf(it, lx, lz) { const r = (it.rot * Math.PI) / 180; return [it.x + lx * Math.cos(r) + lz * Math.sin(r), it.z - lx * Math.sin(r) + lz * Math.cos(r)]; }
  function toLocalOf(it, x, z) { const r = (it.rot * Math.PI) / 180, dx = x - it.x, dz = z - it.z; return [dx * Math.cos(r) - dz * Math.sin(r), dx * Math.sin(r) + dz * Math.cos(r)]; }
  function updateTweens(...a) { return S.updateTweens ? S.updateTweens(...a) : undefined; }
  function updateDoors(...a) { return S.updateDoors ? S.updateDoors(...a) : undefined; }
  function blockers() {
    const out = colliders.slice();
    for (const d of zoneDoors) if (d.t < 0.6) out.push(d.seg);
    for (const d of mainDoors) if (d.t < 0.6) out.push(d.seg);
    return out;
  }
  const scoreCv = document.createElement('canvas');
  const scoreTex = new THREE.CanvasTexture(scoreCv);
  function drawScore() {
    let live = null; try { live = VM.on && VM.sc; } catch (e) { /* 頁面剛載入時 VM 還沒宣告 */ }
    const [a, b] = live ? [VM.sc[1], VM.sc[0]] : walk.score, sets = live ? [(VM.sets || [0, 0])[1], (VM.sets || [0, 0])[0]] : walk.sets;   // 比賽中：記分板左右跟球場方向對齊
    const key = `${a}:${b}:${sets[0]}:${sets[1]}`; if (drawScore.k === key) return; drawScore.k = key;
    const c = scoreCv.getContext('2d');
    c.fillStyle = '#F4F4F2'; c.fillRect(0, 0, 512, 256);
    c.fillStyle = '#B8322B'; c.fillRect(0, 0, 252, 46); c.fillStyle = '#2F5FA8'; c.fillRect(260, 0, 252, 46);
    c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`主隊  ${sets[0]}`, 126, 24); c.fillText(`${sets[1]}  客隊`, 386, 24);
    c.fillStyle = '#1B2638'; c.font = 'bold 170px sans-serif'; c.fillText(String(a), 126, 160); c.fillText(String(b), 386, 160);
    c.fillRect(254, 60, 4, 190);
    scoreTex.needsUpdate = true;
  }
  const ballsGroup = new THREE.Group();
  const balls = [];
  const BALL_R = 0.105;
  const BALL_TEX = (() => {
    const L = new THREE.TextureLoader();
    const map = L.load('assets/img/ball/ball_color.jpg'), normal = L.load('assets/img/ball/ball_normal.png'), rough = L.load('assets/img/ball/ball_rough.jpg');
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map, normal, rough]) t.anisotropy = 8;
    return { map, normal, rough };
  })();
  function ballMaterial(hot) {
    return new THREE.MeshPhysicalMaterial({ map: BALL_TEX.map, normalMap: BALL_TEX.normal, normalScale: new THREE.Vector2(1, 1), roughnessMap: BALL_TEX.rough, roughness: 1, sheen: 0.25, sheenRoughness: 0.6, sheenColor: '#FFF6D0', clearcoat: 0.35, clearcoatRoughness: 0.45, emissive: hot ? '#FFF2B8' : '#000000', emissiveIntensity: hot ? 0.12 : 0 });
  }
  const ballMat = ballMaterial(false);
  const BALL_VIS = 1.125;
  const BALL_LIFT = (BALL_VIS - 1) * BALL_R;
  function ballLift(y) { return BALL_LIFT * clamp(1 - (y - BALL_R) / 0.6, 0, 1); }
  const BALL_SAVE = new Float32Array(16);
  const LIVE_BALLS = new Set(), LIVE_AVS = new Set();
  function ballPullOn(m) { LIVE_BALLS.add(m); const p = m.userData.pull, e = m.matrixWorld.elements; if (p && p.t > (touchPass.prev || 0)) {   /* 只用這一格算出來的（上一次畫之後才設的） */ e[12] += p.x; e[13] += p.y; e[14] += p.z; m.userData.pd = p; } }
  function ballPullOff(m) { const p = m.userData.pd; if (p) { const e = m.matrixWorld.elements; e[12] -= p.x; e[13] -= p.y; e[14] -= p.z; m.userData.pd = null; } }
  function ballLiftBefore() {
    ballPullOn(this);
    const e = this.matrixWorld.elements, d = ballLift(e[13]), q = this.userData.wsq; this.userData.lifted = d;
    (this.userData.drawAt || (this.userData.drawAt = new THREE.Vector3())).set(e[12], e[13] + d, e[14]); this.userData.drawF = frameNo;   // 這一格球實際畫在哪（連線平滑、拉到手上、貼地抬高都算進去）：光圈跟著它
    if (q) { BALL_SAVE.set(e); this.userData.saved = true; for (const i of [0, 4, 8]) e[i] *= q[0]; for (const i of [1, 5, 9]) e[i] *= q[1]; for (const i of [2, 6, 10]) e[i] *= q[0]; e[13] += d - BALL_R * BALL_VIS * (1 - q[1]); return; }
    e[13] += d;
  }
  function ballLiftAfter() { if (this.userData.saved) { const e = this.matrixWorld.elements; for (let i = 0; i < 16; i++) e[i] = BALL_SAVE[i];   /* three.js 的 elements 是一般陣列，沒有 .set */ this.userData.saved = false; this.userData.lifted = 0; ballPullOff(this); return; } const d = this.userData.lifted; if (d) { this.matrixWorld.elements[13] -= d; this.userData.lifted = 0; } ballPullOff(this); }
  const BALL_SPIN_STEP = 0.45;
  function ballSpinRate(b) {
    if (!b.spinW || b.float || b.m.position.y <= BALL_R + 0.03) return 0;
    const w = b.spinW.length(); if (w < 0.01) return 0;
    return w >= 28 ? clamp(b.v.length() * 0.9, 10, 26) : Math.min(w, 26);
  }
  const BALL_GEO = new THREE.SphereGeometry(BALL_R * BALL_VIS, 56, 36);
  function newBallMesh(decor) { const m = new THREE.Mesh(BALL_GEO, ballMat); m.castShadow = true; m.rotation.set(fxRandom() * 6, fxRandom() * 6, fxRandom() * 6); if (!decor) { m.onBeforeRender = ballLiftBefore; m.onAfterRender = ballLiftAfter; } return m; }
  const hands = new THREE.Group();
  const skinM = new THREE.MeshStandardMaterial({ color: '#D9A57E', roughness: 0.6 }), sleeveM = new THREE.MeshStandardMaterial({ color: '#F2B705', roughness: 0.7 });
  function mkArm(side) {
    // side：-1 左手、1 右手
    const fore = new THREE.Group(); hands.add(fore);
    const fm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.3, 14), skinM); fm.rotation.x = Math.PI / 2; fm.position.z = 0.15; fore.add(fm);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.07, 14), sleeveM); sl.rotation.x = Math.PI / 2; sl.position.z = 0.01; fore.add(sl);
    // 手：+z 是手指的方向，+y 是掌心
    const hand = new THREE.Group(); hands.add(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.024, 0.088), skinM); palm.position.z = 0.044; hand.add(palm);
    const fingers = [];
    [[-0.03, 0.068], [-0.01, 0.082], [0.01, 0.078], [0.03, 0.062]].forEach(([x, L], i) => {
      const g = new THREE.Group(); g.position.set(x * -side, 0, 0.086); hand.add(g);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0095, L, 8), skinM); m.rotation.x = Math.PI / 2; m.position.z = L / 2; g.add(m);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0088, 8, 6), skinM); tip.position.z = L; g.add(tip);
      g.userData.spread = (x / 0.03) * 0.16 * -side; fingers.push(g);
    });
    // 拇指在手的內側（掌心朝上、手指朝前時：右手拇指在右、左手在左 → 本地 -x／+x）
    const th = new THREE.Group(); th.position.set(-side * 0.04, 0.004, 0.026); th.rotation.y = -side * 0.85; hand.add(th);
    const tm = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.011, 0.058, 8), skinM); tm.rotation.x = Math.PI / 2; tm.position.z = 0.029; th.add(tm);
    [fore, hand].forEach((o) => o.traverse((q) => { q.userData.noPick = true; }));
    return { side, fore, hand, fingers, th, cur: null };
  }
  const armL = mkArm(-1), armR = mkArm(1);
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const mir = (p) => ({ e: [-p.e[0], p.e[1], p.e[2]], w: [-p.w[0], p.w[1], p.w[2]], f: [-p.f[0], p.f[1], p.f[2]], n: [-p.n[0], p.n[1], p.n[2]], c: p.c });
  function pair(L, ball, pitch) { return { L, R: mir(L), ball, pitch }; }
  const POSE = {
    // 拿著球：兩手托在球的兩側
    hold: pair({ e: [-0.22, -0.42, -0.18], w: [-0.12, -0.25, -0.5], f: [0.05, 0.6, -0.8], n: [1, 0.1, 0], c: 0.3 }, [0, -0.17, -0.56]),
    // 舉球預備：手在額頭前上方，手肘向外，掌心朝上前方對著球，十指張開微彎，兩手拇指與食指圍成三角形的窗
    set: pair({ e: [-0.25, -0.13, -0.16], w: [-0.085, 0.05, -0.33], f: [-0.22, 0.88, -0.42], n: [0.45, 0.7, -0.55], c: 0.35 }, [0, 0.2, -0.55], 0.38),
    // 舉球出手：手臂往球的方向伸直、手腕送出、手指朝上
    setPush: pair({ e: [-0.19, 0.0, -0.3], w: [-0.08, 0.2, -0.47], f: [-0.08, 0.96, -0.25], n: [0.3, 0.55, -0.78], c: 0.12 }, [0, 0.3, -0.52], 0.38),
    // 低手墊球預備：兩臂伸直在身體前下方併攏，雙手交握（拇指平行朝下前），前臂內側形成平台
    bump: pair({ e: [-0.12, -0.36, -0.16], w: [-0.03, -0.27, -0.5], f: [0.02, -0.35, -0.94], n: [1, 0, 0], c: 1.35 }, [0, -0.14, -0.42], -0.3),
    // 墊球觸球：用腿把平台往上送，手臂不揮
    bumpHit: pair({ e: [-0.12, -0.31, -0.2], w: [-0.03, -0.19, -0.52], f: [0.02, -0.15, -0.99], n: [1, 0, 0], c: 1.35 }, [0, -0.07, -0.45], -0.3),
  };
  let pose = 'hold';
  const _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _w0 = new THREE.Vector3();
  function applyPose(dt, snap) {
    camera.updateMatrixWorld(true);
    const P = POSE[pose] || POSE.hold, k = snap ? 1 : 1 - Math.exp(-dt * 18);
    for (const [arm, tgt] of [[armL, P.L], [armR, P.R]]) {
      if (!arm.cur || snap) arm.cur = { e: V3(tgt.e), w: V3(tgt.w), f: V3(tgt.f).normalize(), n: V3(tgt.n).normalize(), c: tgt.c };
      const c = arm.cur;
      c.e.lerp(V3(tgt.e), k); c.w.lerp(V3(tgt.w), k); c.f.lerp(V3(tgt.f).normalize(), k).normalize(); c.n.lerp(V3(tgt.n).normalize(), k).normalize(); c.c += (tgt.c - c.c) * k;
      // 前臂：手肘 → 手腕
      arm.fore.position.copy(c.e);
      hands.localToWorld(_w1.copy(c.w)); arm.fore.lookAt(_w1);
      arm.fore.scale.set(1, 1, c.e.distanceTo(c.w) / 0.3);
      // 手：在手腕，手指朝 f，掌心朝 n
      arm.hand.position.copy(c.w);
      hands.localToWorld(_w0.set(0, 0, 0)); hands.localToWorld(_w2.copy(c.n));
      arm.hand.up.copy(_w2.sub(_w0)).normalize();
      hands.localToWorld(_w1.copy(c.w).add(c.f)); arm.hand.lookAt(_w1);
      for (const g of arm.fingers) { g.rotation.set(-c.c, g.userData.spread * (1 - Math.min(1, c.c)), 0); }
      arm.th.rotation.x = -c.c * 0.6;
    }
  }
  const skill = { mode: null, h: 0, v: 0, n: 0, best: 0, since: 9, kick: 0, dip: 0 };
  const SKDIR = { set: [0, 0.75, -0.66, 0.5], bump: [0, 0.8, -0.6, 0.45] };
  function grabBall() { if (walk.hold) return; if (VM.on && !VM.grabOK) { toast('比賽中不能拿球（輪到你發球時球會自動給你）', 1800); return; } walk.hold = newBallMesh(); walk.hold.userData.noPick = true; camera.add(walk.hold); pose = 'hold'; hands.visible = true; applyPose(0, true); placeHeld(); }
  function placeHeld() {
    const m = walk.hold; if (!m) return;
    if (skill.mode) {
      const c = POSE[skill.mode].ball, d = SKDIR[skill.mode], h = skill.h * d[3];
      m.position.set(c[0] + d[0] * h, c[1] + d[1] * h, c[2] + d[2] * h);
    } else { const c = POSE.hold.ball; m.position.set(c[0], c[1], c[2]); m.material = ballMat; }
  }
  function courtAt(x, z, far) {
    let best = null;
    for (const c of state.items) {
      if (CAT[c.type].court !== 'vb' || c.mode === 'lines') continue;
      const [lx, lz] = toLocalOf(c, x, z);
      // 先看你在不在這面場的範圍裡（場外多遠），一樣才比離網子多近；隔壁場就不會被挑到
      if (Math.abs(lx) < (far ? 15 : 4) && Math.abs(lz) < (far ? 8 : 4.6)) { const d = (Math.max(0, Math.abs(lx) - 9) + Math.max(0, Math.abs(lz) - 4.5)) * 100 + Math.abs(lx); if (!best || d < best.d) best = { c, lx, lz, d }; }
    }
    return best;
  }
  function solveShot(p0, tx, tz, court, sg, Tmin) {
    for (let T = Tmin; T < 2.6; T += 0.03) {
      const v = new THREE.Vector3((tx - p0.x) / T, (BALL_R - p0.y) / T + 4.9 * T, (tz - p0.z) / T);
      if (!court) return v;
      const [l0] = toLocalOf(court, p0.x, p0.z), [l1] = toLocalOf(court, tx, tz);
      if (Math.sign(l0) === Math.sign(l1) || l0 === l1) return v;
      const f = l0 / (l0 - l1), t = f * T, y = p0.y + v.y * t - 4.9 * t * t;
      if (y >= 2.6) return v;
    }
    return new THREE.Vector3((tx - p0.x) / 2.6, (BALL_R - p0.y) / 2.6 + 4.9 * 2.6, (tz - p0.z) / 2.6);
  }
  let reachState = null;
  const OFF_L = { e: [-0.3, -0.9, 0.05], w: [-0.25, -0.95, -0.1], f: [0, 0, -1], n: [0, 1, 0], c: 0.5 };
  const OFF_R = { e: [0.3, -0.9, 0.05], w: [0.25, -0.95, -0.1], f: [0, 0, -1], n: [0, 1, 0], c: 0.5 };
  function reach(worldPoint, fn, opt = {}) {
    if (reachState || walk.hold) { fn(); return; }
    camera.updateMatrixWorld(true);
    const local = hands.worldToLocal(worldPoint.clone());
    const armFor = (sx) => {
      const sh = new THREE.Vector3(0.2 * sx, -0.3, 0.05), dir = local.clone().add(new THREE.Vector3(0.05 * sx * (opt.both ? 1 : 0), 0, 0)).sub(sh);
      const L = Math.min(dir.length(), 0.6); dir.normalize();
      const w = sh.clone().addScaledVector(dir, L), e = sh.clone().addScaledVector(dir, L * 0.42).add(new THREE.Vector3(0.07 * sx, -0.06, 0));
      return { e: e.toArray(), w: w.toArray(), f: dir.clone().add(new THREE.Vector3(0, -0.15, 0)).toArray(), n: opt.wash ? [0, 1, 0] : [-sx, 0.2, 0], c: opt.prop ? 0.9 : 0.35 };
    };
    POSE.reach = { L: opt.both ? armFor(-1) : OFF_L, R: armFor(1), ball: [0, 0, 0] };
    POSE.rest = { L: OFF_L, R: OFF_R, ball: [0, 0, 0] };
    pose = 'rest'; applyPose(0, true); hands.visible = true; pose = 'reach';
    if (opt.prop) { opt.prop.position.set(0, 0.05, 0.12); armR.hand.add(opt.prop); }
    reachState = { t: 0, fn, fired: false, opt };
  }
  function updateWind(...a) { return S.updateWind ? S.updateWind(...a) : undefined; }
  function serveVel(p, tx, tz, spd, g, court, sg, margin = 0.12) {
    const V = (T) => new THREE.Vector3((tx - p.x) / T, (BALL_R - p.y) / T + 0.5 * g * T, (tz - p.z) / T);
    // 球速最慢的那條拋物線（Tmin）；要求的球速比它快，就在 Tmin 左邊（比較平、比較快）找剛好的
    let a = 0.12, c = 4; for (let i = 0; i < 40; i++) { const m1 = a + (c - a) / 3, m2 = c - (c - a) / 3; if (V(m1).length() < V(m2).length()) c = m2; else a = m1; }
    const Tmin = (a + c) / 2; let T = Tmin;
    if (V(Tmin).length() < spd) { let lo = 0.08, hi = Tmin; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (V(m).length() > spd) lo = m; else hi = m; } T = hi; }
    const clear = (v) => { if (!court) return true; const [l0] = toLocalOf(court, p.x, p.z), [l1] = toLocalOf(court, tx, tz); if (Math.sign(l0) === Math.sign(l1)) return true; const t = (l0 / (l0 - l1)) * T; return p.y + v.y * t - 0.5 * g * t * t > NETS[state.net].h + BALL_R + margin; };
    let v = V(T); for (let i = 0; i < 40 && !clear(v); i++) { T += 0.03; v = V(T); }
    return v;
  }
  function ballShadowSync(...a) { return S.ballShadowSync ? S.ballShadowSync(...a) : undefined; }
  function vbNetCourts() { return state.items.filter((c) => CAT[c.type].court === 'vb' && c.mode !== 'lines' && !c.use); }
  function vbAntenna(b, c, from, lx, yc, lz) {
    const r = (c.rot * Math.PI) / 180, nx = Math.cos(r), nz = -Math.sin(r), vn = b.v.x * nx + b.v.z * nz, p = b.m.position;
    b.v.x -= 1.5 * vn * nx; b.v.z -= 1.5 * vn * nz; b.v.multiplyScalar(0.55); const back = Math.sign(from) * (BALL_R + 0.03) - lx; p.x += nx * back; p.z += nz * back;
    netBallSound(b, 'antenna', Math.min(1, b.v.length() / 8 + 0.4), p);
    if (VM.on && VM.host && VM.phase === 'rally' && b === VM.ball && c.id === VM.c.id) { const team = vmSide(0) === Math.sign(from) ? 0 : 1; vmPoint(1 - team, '球打到標誌桿'); }
  }
  function vmCrossCheck(b, c, from, yc, lz, top, bot) {
    if (!VM.on || !VM.host || VM.phase !== 'rally' || b !== VM.ball || c.id !== VM.c.id) return;
    const team = vmSide(0) === Math.sign(from) ? 0 : 1;
    if (yc <= bot - BALL_R && Math.abs(lz) < 5.3) vmPoint(1 - team, '球從網子下面過去');
    else if (Math.abs(lz) > 4.5 + BALL_R && yc > 0.3) vmPoint(1 - team, '球從標誌桿外面過網');
  }
  const BALL_WORLD = { R: BALL_R, H: 9, segs: [], nets: [], toLocal: toLocalOf, netTop: 2.43, netRoll: k => vbNetRoll(k), now: () => performance.now(), midpoint: false };
  const BALL_HOOKS = {
    floorWait(b, p) {   /* WEB-023：別人負責的球先落地，停住等回報 */
      if (!(NET.on && b.room && !NET.ownBall && !b.floorReport && !b.waitFloor && b.v.y < 0)) return false;
      p.y = BALL_R; b.waitFloor = { t: performance.now(), v: b.v.clone() }; b.v.set(0, 0, 0); b.err = null; b.acc = null; b.float = null; return true;
    },
    floorLand(b, p) {
      if (b.spike) { const [lx, lz] = toLocalOf(b.spike.c, p.x, p.z), inside = Math.sign(lx) === -b.spike.sg && Math.abs(lx) <= 9 && Math.abs(lz) <= 4.5; toast(b.serve ? (inside ? '發球進了！Ace 🏐' : '發球出界（或沒過網）') : (inside ? '漂亮！扣球得分 🏐' : '可惜，出界了')); b.spike = null; }
      if (b.v.y < -2.5 && performance.now() - SFX.floorT > 120) { SFX.floorT = performance.now(); netBallSound(b, 'floor', Math.min(1, -b.v.y / 9), p); }
      if (b.v.y < -2.5 && typeof vbFloorImpact === 'function') vbFloorImpact(b, p, -b.v.y);
    },
    floorEvent(b) { netFloorHit(b); },
    wall(b, vn, p) { if (vn < -2.5 && performance.now() - SFX.floorT > 120) { SFX.floorT = performance.now(); netBallSound(b, 'wall', Math.min(1, -vn / 9), p); } },
    antenna(b, c, from, lx, yc, lz) { vbAntenna(b, c, from, lx, yc, lz); },
    netRemote(b) { return b.room && !NET.ownBall; },   /* 遠端網面與網帶由球權端決定，攔網仍在迴圈外執行。 */
    netTouch(b, c, lz, dir, spd, tape, p) {
      if (tape) { netFxHit(c, lz, dir, Math.min(1, spd / 12) * 0.6, true); netBallSound(b, 'tape', Math.min(1, spd / 14), p); }
      else { netFxHit(c, lz, dir, Math.min(1, spd / 10), false); netBallSound(b, 'net', Math.min(1, spd / 14), p); }
      if (b.spike) { toast('掛網了！'); b.spike = null; }
    },
    cross(b, c, from, yc, lz, top, bot) { vmCrossCheck(b, c, from, yc, lz, top, bot); },
    after(b, h) { vbBlockTest(b, h); vmBlockTest(b, h); },
  };
  function updateBalls(dt) {
    updateTweens(dt); updateDoors(dt); updateWind(dt); netFxStep(dt);
    ballShadowSync();
    if (!balls.length || !dt) return;
    const H = state.building.H, segs = blockers().concat(solidSegs(true)), netCourts = vbNetCourts();
    for (const b of balls) {
      if (b.fsq) { const F = b.fsq; F.t += dt; const e = F.t / F.dur; if (e >= 1.6) { b.fsq = null; b.m.userData.wsq = null; } else { const s2 = e < 1 ? Math.sin(e * Math.PI) * F.amt : -Math.sin((e - 1) / 0.6 * Math.PI) * F.amt * 0.25; b.m.userData.wsq = [1 + s2 * 0.6, 1 - s2]; } }   /* 落地：先壓扁、再微微拉長彈回 */
      if (VM.on && VM.wire && b.room && !b.langzi) {
        if (!VM.host && !b.wireLocal) { vmWireRemoteStep(b, dt); continue; }   /* 加入者：落地前照主機的球路；落地後（wireLocal）自己算彈跳滾動 */
      }
      if (b.watchOnly) { vmWatchBallFrame(b); continue; }
      if (b.snap) { const s2 = b.snap; s2.t += dt; const k = Math.min(1, s2.t / s2.dur), e = 1 - (1 - k) * (1 - k); b.m.position.lerpVectors(s2.from, s2.to, e); if (k >= 1) { b.snap = null; vbImpact(b, s2.kind, s2.q); } continue; }
      if (b.rest > 2) continue;
      if (b.waitFloor && ballWaitFloor(b)) continue;   /* WEB-023：別人負責的球先落地，停住等回報 */
      // 每一小步最多走 4 cm：快的扣球也不會一步跨過網子或牆
      const catchup = Math.min(b.wireCatchup || 0, .35); b.wireCatchup = 0;
      const flightDt = dt + catchup;
      const steps = ballSubsteps(b.v.length(), flightDt * VB.ts, catchup ? 512 : 96), h = (flightDt * VB.ts) / steps;
      BALL_WORLD.H = H; BALL_WORLD.segs = segs; BALL_WORLD.nets = netCourts; BALL_WORLD.netTop = NETS[state.net].h;
      BALL_WORLD.midpoint = VM.on && VM.wire && b === VM.ball;
      for (let k = 0; k < steps; k++) if (!ballSubstep(b, b.m.position, h, BALL_WORLD, BALL_HOOKS)) break;   /* B1：球的物理在 engine/ball.js（伺服器共用） */
      if (b.err) netSmoothBall(b, dt, netCourts);
      const sp = Math.hypot(b.v.x, b.v.z);
      if (b.netEv && VM.on && VM.wire) { b.netEv = false; VM.wire.dirty = true; }
      if (b.netEv) { b.netEv = false; if (NET.on && NET.ownBall && b.room) { const m = netBallMsg(b); m.n = 1; NET.tx.publish('ball', m); NET.lastBall = performance.now(); } }   // 碰網：負責這顆球的人馬上把結果送出去
      const sr = ballSpinRate(b);
      if (sr > 0) b.m.rotateOnWorldAxis(SPIN_AX.copy(b.spinW).normalize(), Math.min(sr * flightDt, BALL_SPIN_STEP));   // 空中：照擊球時的旋轉（每格最多轉 BALL_SPIN_STEP）
      else if (b.m.position.y <= BALL_R + 0.03) { b.spinW = null; if (sp > 0.01) {   /* 地上才滾；空中沒有旋轉的球（飄球、好的舉球）不轉 */ b.m.rotation.x += (b.v.z / BALL_R) * dt; b.m.rotation.z -= (b.v.x / BALL_R) * dt; } }   // 新同步空中零旋轉／飄球不能套用地面滾動。
      b.rest = sp < 0.05 && b.m.position.y <= BALL_R + 0.01 ? b.rest + dt : 0;
      if (b.squash > 0) { b.squash -= dt; const sq = Math.sin((Math.max(0, b.squash) / 0.12) * Math.PI) * 0.22; b.m.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5); if (b.squash <= 0) b.m.scale.set(1, 1, 1); }
    }
  }
  let ROOM = null;
  let ROOM_UI = null, roomLaunched = -1, roomPlaced = -1;
  function roomRulesChanged(rules) {
    VB.ts = rules.speed; renderRoomRules(); ROOM_UI?.render(); peerTagsAll();
    const f = rules.flow;
    if (f.phase === 'waiting') { if (rules.isHost && roomLaunched >= 0 && NET.tx) NET.tx.publish('srv-stop', {}); if (VM.on) vmStop(true); roomLaunched = -1; roomPlaced = -1; return; }   /* 結束比賽：也叫伺服器停掉那一場（不然它還在送資料，大家又自動跟上） */
    if (f.phase !== 'playing') return;
    if (!rules.isHost && !VM.on && NET.tx) NET.tx.publish('room-match-sync', {});
    const c = state.items.find(i => i.id === f.court); if (!c) return;
    // Place each participant once, before the engine distributes service positions.
    const slot = f.picks.indexOf(vmMe());
    if (slot >= 0 && roomPlaced !== f.round) {
      roomPlaced = f.round; const team = Math.floor(slot / rules.count), k = slot % rules.count, sd = team === 0 ? -1 : 1;
      const [depth,left] = rules.count === 6 ? V6_BASE[k] : rules.count === 2 ? [6,k === 0 ? 2.1 : -2.1] : CourtFormations.home(rules.count,k);
      [walk.x,walk.z] = toWorldOf(c,sd*depth,sd*left); walk.keys.clear();
    }
    if (rules.isHost && roomLaunched !== f.round && typeof SRV_MODE !== 'undefined' && SRV_MODE && NET.srvDown !== f.round && NET.tx && /^cf/.test(NET.tx.kind || '')) {   /* B5：請伺服器開賽 */
      roomLaunched = f.round; const round = f.round;
      setTimeout(() => {   /* 伺服器 4 秒沒開賽（連不上、舊版）：這一場改回房主電腦裁判 */
        if (VM.on || !ROOM?.isHost || roomLaunched !== round || ROOM.snapshot?.flow?.phase !== 'playing' || ROOM.snapshot.flow.round !== round) return;
        NET.srvDown = round; roomLaunched = -1; NET.tx?.publish('srv-stop', {}); netStatus('伺服器沒回應：這場改由房主電腦裁判', 'warn'); roomRulesChanged(ROOM.snapshot);   /* 只有這一場；下一場還是先請伺服器 */
      }, 4000);
      const seats = [f.picks.slice(0, rules.count), f.picks.slice(rules.count)].map(t => t.map(id => id || null));
      const names = {}; for (const id of seats.flat()) if (id) names[id] = id === vmMe() ? NET.name : NET.peers.get(id)?.n || '';   /* 伺服器不知道暱稱：開賽時一起給（播報、結算才不會寫「球友」） */
      NET.tx.publish('srv-start', { c: { id: c.id, x: c.x, z: c.z, rot: c.rot }, sg: -1, six: rules.count !== 2, count: rules.count, seats, names, rules: JSON.parse(JSON.stringify(rules)) });
      netStatus('比賽由台北伺服器裁判', 'ok');
      return;
    }
    if (rules.isHost && roomLaunched !== f.round) {
      roomLaunched = f.round;
      const seats = [f.picks.slice(0,rules.count),f.picks.slice(rules.count)];
      // Existing host-side assistance expects the host's team at engine index 0.
      // Flip only internal team indices/sign; the selected physical left/right stays unchanged.
      const right = seats[1].includes(vmMe()), sg = right ? 1 : -1;
      if (right) seats.reverse();
      vmApplyRoomRules(rules);   // 房主設定（企聯等 AI 強度、每局分數、局數）
      if (rules.count !== 2) vm6Start(c,sg,{},seats); else vmStart(c,sg,null,[],seats);
    }
  }
  function srvJudgeFailed(why) {
    if (VM.on && !VM.host && VM.hostId === 'srv') vmStop(true);
    const f = ROOM?.snapshot?.flow;
    if (ROOM?.isHost && f?.phase === 'playing' && NET.srvDown !== f.round) { NET.srvDown = f.round; roomLaunched = -1; NET.tx?.publish('srv-stop', {}); netStatus('伺服器裁判出問題：這場改由房主電腦裁判', 'warn'); roomRulesChanged(ROOM.snapshot); }
    console.warn('[伺服器裁判]', why);
  }
  function roomSpectator() { return VM.on && vmTeamOf(vmMe()) < 0; }
  function renderRoomRules(...a) { return S.renderRoomRules ? S.renderRoomRules(...a) : undefined; }
  const SRV_MODE = new URLSearchParams(location.search).get('srv') !== '0';
  const NET = { on: false, room: '', me: '', name: '', tx: null, peers: new Map(), lastSt: 0, lastBall: 0, hitN: 0, hitBy: '', ownBall: false, lastSent: null, lat: new Map(), pingT: 0 };
  const netLat = (id) => clamp(((NET.lat.get(id) ?? 100) + 16) / 1000, 0.02, 0.35);
  const NETQ = { ts: [], slow: 1, warned: false, sent: 0 };
  const NETSTAT = { inN: 0, starve: 0, in0: 0, out0: 0, starve0: 0 };
  function netFast() { return !!(NET.tx && /^cf/.test(NET.tx.kind || '')); }
  function netStatus(msg, kind) { const el = $('room-status'); if (el) { el.textContent = msg; el.dataset.kind = kind || ''; } }
  function renderMpList(...a) { return S.renderMpList ? S.renderMpList(...a) : undefined; }
  const myChar = () => (readLook() ? myLookCode() : normalizeLook(readLook()));
  function myWornForNet(now) {
    if (!NET.worn || now - NET.worn.at > 1000) { const w = readWornJersey(); NET.worn = { at: now, v: w ? (w.design || w) : 0 }; }
    return NET.worn.v;
  }
  function makeAvatar(...a) { return S.makeAvatar ? S.makeAvatar(...a) : ({ g: new THREE.Group(), body: new THREE.Group(), hands: [new THREE.Group(), new THREE.Group()], phase: 0, fall: null }); }
  function refreshPeerAppearance(...a) { return S.refreshPeerAppearance ? S.refreshPeerAppearance(...a) : undefined; }
  const AVP = {
    idle: { sh: [[-0.08, 0.1], [-0.08, 0.1]], el: [0.3, 0.3], hip: [0.02, 0.02], kn: [0.06, 0.06], sp: 0.04, tw: 0 },
    ready: { sh: [[-0.62, 0.22], [-0.62, 0.22]], el: [0.95, 0.95], hip: [0.85, 0.85], kn: [1.3, 1.3], hab: [0.2, 0.2], sp: 0.58, tw: 0, arm: 0.15, gait: 0.6 },
    crouch: { sh: [[-0.75, 0.2], [-0.75, 0.2]], el: [0.7, 0.7], hip: [1.25, 1.25], kn: [1.95, 1.95], hab: [0.28, 0.28], sp: 0.72, tw: 0, arm: 0.1, gait: 0.45 },   // 按住 Ctrl 蹲低：膝蓋彎更多、重心更低   // 接球準備：腳比肩寬、膝蓋彎、重心往前、雙手在腰前
    bump: { sh: [[-0.98, -0.14], [-0.98, -0.14]], el: [0.02, 0.02], hip: [0.92, 0.92], kn: [1.42, 1.42], hab: [0.2, 0.2], sp: 0.55, tw: 0, arm: 0, gait: 0.5 },   // 墊球：手臂打直併攏成平台、壓低
    bumpStand: { sh: [[-0.98, -0.14], [-0.98, -0.14]], el: [0.02, 0.02], hip: [0.38, 0.38], kn: [0.52, 0.52], hab: [0.18, 0.18], sp: 0.32, tw: 0, arm: 0, gait: 0.5 },   // 站著墊球（沒按 Ctrl）：膝蓋微彎，重心比蹲接高
    bumpHit: { sh: [[-1.12, -0.14], [-1.12, -0.14]], el: [0, 0], hip: [0.55, 0.55], kn: [0.8, 0.8], hab: [0.16, 0.16], sp: 0.36, tw: 0, arm: 0, gait: 0.4 },   // 墊到球：腿往上送、平台抬到胸前（手不甩）
    setReady: { sh: [[-2.55, 0.45], [-2.55, 0.45]], el: [1.75, 1.75], hip: [0.38, 0.3], kn: [0.68, 0.55], hab: [0.08, 0.08], sp: -0.04, tw: 0, arm: 0, gait: 0.6 },   // 舉球準備：雙手在額頭前上方（手肘張開成窗戶）
    setPush: { sh: [[-2.98, 0.16], [-2.98, 0.16]], el: [0.18, 0.18], hip: [0.1, 0.06], kn: [0.14, 0.1], hab: [0.06, 0.06], sp: -0.14, tw: 0, arm: 0, gait: 0.4 },   // 舉出去：腿、手一起伸直往上推
    setBack: { sh: [[-3.2, 0.12], [-3.2, 0.12]], el: [0.12, 0.12], hip: [-0.05, -0.05], kn: [0.12, 0.12], sp: -0.48, tw: 0, arm: 0, gait: 0.4 },   // 背舉：上身往後仰
    hold: { sh: [[-0.85, -0.1], [-0.85, -0.1]], el: [1.0, 1.0], hip: [0.03, 0.03], kn: [0.08, 0.08], sp: 0.04, tw: 0, arm: 0 },
    approach: { sh: [[0.95, 0.18], [0.95, 0.18]], el: [0.12, 0.12], hip: [0.8, 0.45], kn: [1.3, 0.95], hab: [0.1, 0.1], sp: 0.62, tw: 0, arm: 0, gait: 0.8 },   // 助跑最後一步：雙手甩到後面、蹲低
    takeoff: { sh: [[-2.75, 0.22], [-2.75, 0.22]], el: [0.35, 0.35], hip: [0.12, 0.08], kn: [0.22, 0.18], sp: 0.02, tw: 0, arm: 0, gait: 0, shy: [0.07, 0.07] },   // 起跳：雙手從後面往上甩（帶著身體往上）、腿蹬直
    airUp: { sh: [[-2.6, 0.75], [-2.75, 0.12]], el: [2.15, 0.22], hip: [-0.18, 0.12], kn: [1.3, 0.95], sp: -0.42, tw: 0.45, arm: 0, gait: 0 },   // 空中拉弓：身體往後彎成弓、右手肘拉高到耳後、左手指球、小腿往後收
    spikeHit: { sh: [[-3.0, 0.1], [-0.85, 0.3]], el: [0.05, 1.3], hip: [0.5, 0.32], kn: [0.8, 0.6], sp: 0.34, tw: -0.28, arm: 0, gait: 0, shy: [0.1, 0] },   // 擊球：收腹把弓放掉，右手在最高點往前下壓、左手收到腰
    spikeFollow: { sh: [[-0.4, -0.38], [-0.3, 0.28]], el: [0.4, 1.1], hip: [0.7, 0.5], kn: [1.0, 0.8], sp: 0.55, tw: -0.42, arm: 0, gait: 0.3 },   // 收手：手揮到身體另一側
    serveToss: { sh: [[-2.4, 0.6], [-2.9, 0.1]], el: [1.9, 0.1], hip: [0.05, 0.25], kn: [0.12, 0.3], sp: -0.12, tw: 0.35, arm: 0 },
    blockReady: { sh: [[-2.15, 0.28], [-2.15, 0.28]], el: [1.7, 1.7], hip: [0.35, 0.35], kn: [0.7, 0.7], sp: 0.08, tw: 0, arm: 0 },
    block: { sh: [[-2.78, 0.08], [-2.78, 0.08]], el: [0.05, 0.05], hip: [0.12, 0.12], kn: [0.3, 0.3], sp: 0.08, tw: 0, arm: 0, gait: 0, shy: [0.08, 0.08] },   // 攔網：雙手伸直往網子對面上方壓
    land: { sh: [[-0.55, 0.35], [-0.55, 0.35]], el: [0.75, 0.75], hip: [0.9, 0.9], kn: [1.5, 1.5], hab: [0.16, 0.16], sp: 0.45, tw: 0, arm: 0, gait: 0.5 },   // 落地：雙腳張開彎膝緩衝
    dive: { sh: [[-3.05, 0.22], [-3.05, 0.22]], el: [0.05, 0.05], hip: [-0.12, 0.05], kn: [0.25, 0.75], sp: -0.2, tw: 0, arm: 0, gait: 0 },   // 往前撲（魚躍）：雙手往前伸、抬頭挺胸、腳往後伸
    sideDive: { sh: [[-3.0, 0.35], [-1.1, -0.25]], el: [0.05, 1.5], hip: [0.3, 0.8], kn: [0.45, 1.25], hab: [0.05, 0.2], sp: 0.12, tw: 0.25, arm: 0, gait: 0 },   // 往右邊撲（側倒）：右手往球的方向伸長、左手收在胸前、腿彎著側躺；往左撲＝左右對調
    down: { sh: [[-1.55, 0.55], [-1.55, 0.55]], el: [1.45, 1.45], hip: [0.05, 0.15], kn: [0.25, 0.55], sp: 0, tw: 0, arm: 0, gait: 0 },   // 撲完趴在地上：雙手撐地準備起來
    downSide: { sh: [[-2.3, 0.55], [-1.25, 0.65]], el: [0.5, 1.25], hip: [0.65, 0.95], kn: [1.05, 1.45], hab: [0.05, 0.15], sp: 0.25, tw: 0.2, arm: 0, gait: 0 },   // 側倒在地上：手撐著、腿收起來準備翻身站起
    // 魚躍（參考實際動作）：飛出去身體接近水平、雙手往前伸、抬頭挺胸、腿往後伸直 → 手先撐地、手肘彎緩衝、小腿開始往上翹 → 胸口貼地往前滑、小腿翹高（蠍子）
    diveFly: { sh: [[-3.05, 0.15], [-3.05, 0.15]], el: [0.05, 0.05], hip: [-0.18, -0.08], kn: [0.12, 0.3], hab: [0.04, 0.04], sp: -0.32, tw: 0, arm: 0, gait: 0 },
    diveCatch: { sh: [[-2.15, 0.45], [-2.15, 0.45]], el: [0.75, 0.75], hip: [-0.12, -0.12], kn: [0.95, 1.15], hab: [0.06, 0.06], sp: -0.5, tw: 0, arm: 0, gait: 0 },
    diveSlide: { sh: [[-2.65, 0.45], [-2.0, 0.6]], el: [0.35, 0.95], hip: [-0.06, 0.08], kn: [1.75, 1.95], hab: [0.08, 0.1], sp: -0.58, tw: 0, arm: 0, gait: 0 },
    // 魚躍（2026-11-19 使用者給的分解圖）：蹬地飛撲、單手往球伸 → 雙前臂和手肘先著地、抬頭 → 胸口著地、手肘貼地往前滑、雙腿懸空 → 腹部貼地、腿還抬著 → 大腿貼地順勢滑 → 雙手推地起身
    diveReach: { sh: [[-3.0, 0.05], [-2.3, 0.35]], el: [0.05, 0.45], hip: [-0.15, -0.05], kn: [0.25, 0.5], hab: [0.05, 0.08], sp: -0.25, tw: 0.1, arm: 0, gait: 0, head: [-0.35, 0] },
    diveForearm: { sh: [[-1.85, 0.32], [-1.85, 0.32]], el: [1.45, 1.45], hip: [-0.5, -0.45], kn: [0.45, 0.6], hab: [0.06, 0.06], sp: -0.45, tw: 0, arm: 0, gait: 0, head: [-0.75, 0] },
    diveChest: { sh: [[-1.85, 0.34], [-1.85, 0.34]], el: [1.5, 1.5], hip: [-0.55, -0.5], kn: [0.55, 0.7], hab: [0.06, 0.06], sp: -0.5, tw: 0, arm: 0, gait: 0, head: [-0.8, 0] },
    diveBelly: { sh: [[-1.8, 0.34], [-1.8, 0.34]], el: [1.5, 1.5], hip: [-0.38, -0.34], kn: [0.75, 0.9], hab: [0.06, 0.06], sp: -0.38, tw: 0, arm: 0, gait: 0, head: [-0.7, 0] },
    diveThigh: { sh: [[-1.75, 0.34], [-1.75, 0.34]], el: [1.45, 1.45], hip: [-0.08, -0.06], kn: [0.95, 1.1], hab: [0.06, 0.06], sp: -0.22, tw: 0, arm: 0, gait: 0, head: [-0.55, 0] },
    // 側接（往右；往左＝鏡像）：右腳往旁邊大跨一步蹲很低、左腳往旁邊伸直，上身往球那邊壓低、雙手併攏往下伸 → 坐到右邊屁股上、右手往球伸長 → 往後滾成仰躺、腳翹起來
    sideLunge: { sh: [[-1.05, -0.1], [-1.05, -0.32]], el: [0.02, 0.02], hip: [1.05, 0.15], kn: [1.85, 0.05], hab: [0.75, 0.65], sp: 0.72, tw: -0.85, arm: 0, gait: 0 },
    sideFall: { sh: [[-3.0, 0.35], [-0.9, 0.65]], el: [0.05, 1.2], hip: [1.05, 0.65], kn: [1.45, 1.05], hab: [0.3, 0.3], sp: 0.22, tw: 0.3, arm: 0, gait: 0 },
    sideRoll: { sh: [[-2.4, 0.95], [-1.6, 0.95]], el: [0.3, 0.6], hip: [1.75, 1.55], kn: [1.0, 1.35], hab: [0.1, 0.25], sp: -0.1, tw: 0.1, arm: 0, gait: 0 },
    // 照影片補的：魚躍起步的低弓箭步（右腳在前蹲很低、左腳往後伸直、右手往球伸低）；滾翻的側躺（球那側的手沿著地板往頭上伸）、腳翻過肩膀時縮成一團、最後跪著雙手撐地
    diveLunge: { sh: [[-1.45, 0.08], [-0.85, 0.22]], el: [0.05, 0.35], hip: [1.25, -0.25], kn: [1.75, 0.18], hab: [0.06, 0.06], sp: 0.55, tw: 0, arm: 0, gait: 0 },
    sideFlat: { sh: [[-3.05, 0.25], [-0.55, 0.55]], el: [0.05, 0.5], hip: [0.35, 0.2], kn: [0.35, 0.45], hab: [0.1, 0.15], sp: 0.1, tw: 0.2, arm: 0, gait: 0 },
    sideTuck: { sh: [[-2.1, 0.55], [-1.7, 0.75]], el: [1.0, 1.2], hip: [2.0, 2.0], kn: [2.1, 2.1], hab: [0.12, 0.12], sp: 0.55, tw: 0, arm: 0, gait: 0 },
    kneel: { sh: [[-1.25, 0.22], [-1.25, 0.22]], el: [0.15, 0.15], hip: [1.45, 1.45], kn: [2.3, 2.3], hab: [0.14, 0.14], sp: 0.45, tw: 0, arm: 0, gait: 0 },
    // 互動：擊掌（舉手等、拍下去）、嘲諷（挺胸、雙手掌心朝上比「來啊」）
    hi5Up: { sh: [[-2.95, 0.3], [-2.95, 0.3]], el: [0.15, 0.15], hip: [0.05, 0.05], kn: [0.1, 0.1], sp: -0.06, tw: 0, arm: 0, gait: 0.6 },   // 雙手舉高等隊友
    hi5Two: { sh: [[-2.9, 0.2], [-2.9, 0.2]], el: [0.75, 0.75], hip: [0.08, 0.08], kn: [0.18, 0.18], sp: 0.0, tw: 0, arm: 0, gait: 0.6 },   // 雙手舉到面前上方、靠過去
    hi5Hit: { sh: [[-2.62, 0.12], [-2.62, 0.12]], el: [0.15, 0.15], hip: [0.14, 0.14], kn: [0.26, 0.26], sp: 0.16, tw: 0, arm: 0, gait: 0.6 },   // 雙手往前推、身體往前靠：掌心拍在一起
    taunt: { sh: [[-1.25, 0.55], [-1.25, 0.55]], el: [1.3, 1.3], hip: [0.1, 0.1], kn: [0.25, 0.25], hab: [0.12, 0.12], sp: -0.22, tw: 0, arm: 0, gait: 0.5 },
    // 球拍：準備（拍頭在前上方）、上手（拉拍→擊球→收拍）、側身抽球
    rkReady: { sh: [[-1.2, 0.6], [-0.8, 0.25]], el: [1.5, 0.9], hip: [0.55, 0.55], kn: [0.95, 0.95], sp: 0.35, tw: 0, arm: 0 },
    rkOverCock: { sh: [[-2.6, 0.75], [-2.7, 0.1]], el: [2.1, 0.2], hip: [0.2, 0.4], kn: [0.3, 0.6], sp: -0.25, tw: 0.5, arm: 0 },
    rkOverHit: { sh: [[-3.05, 0.1], [-1.2, 0.2]], el: [0.05, 1.0], hip: [0.2, 0.3], kn: [0.3, 0.5], sp: 0.05, tw: -0.1, arm: 0 },
    rkOverFollow: { sh: [[-0.7, -0.5], [-0.5, 0.2]], el: [0.4, 1.1], hip: [0.4, 0.3], kn: [0.6, 0.5], sp: 0.4, tw: -0.5, arm: 0 },
    rkSideBack: { sh: [[-1.2, 1.3], [-0.9, 0.2]], el: [0.9, 0.8], hip: [0.6, 0.4], kn: [1.0, 0.7], sp: 0.3, tw: 0.7, arm: 0 },
    rkSideFollow: { sh: [[-1.5, -0.6], [-0.6, 0.3]], el: [0.6, 0.9], hip: [0.5, 0.5], kn: [0.9, 0.9], sp: 0.3, tw: -0.6, arm: 0 },
  };
  const DIVE_D = [0, -Math.PI / 2, Math.PI / 2];
  function avBlockPose(s) { if (!s) return AVP.block; const k = s * 1.1; return { ...AVP.block, sh: [[-2.78, 0.08 + k], [-2.78, 0.08 - k]], tw: -k * 0.3 }; }
  function avDrive(...a) { return S.avDrive ? S.avDrive(...a) : undefined; }
  function avKick(av, kind, speed, now) { if (!av || !['spike', 'bump', 'set', 'block'].includes(kind)) return; av._kick = { kind, t0: now, amp: clamp(speed / 18, 0.35, 1), arms: (TCH_CFG[kind] && TCH_CFG[kind].arms) || [0, 1] }; }
  const TCH = { S: new THREE.Vector3(), M: new THREE.Vector3(), E: new THREE.Vector3(), H: new THREE.Vector3(), F: new THREE.Vector3(), T: new THREE.Vector3(), B: new THREE.Vector3(), Bb: new THREE.Vector3(), n: new THREE.Vector3(), r: new THREE.Vector3(), g: new THREE.Vector3(), P: new THREE.Vector3(), V: new THREE.Vector3(), q: new THREE.Quaternion(), qw: new THREE.Quaternion(), qp: new THREE.Quaternion(), UP: new THREE.Vector3(0, 1, 0) };
  const TCH_CFG = { spike: { arms: [0], band: 0.45, bend: true, maxBend: 0.45 }, set: { arms: [0, 1], band: 0.7, bend: true }, bump: { arms: [0, 1], band: 0.7, bend: false }, block: { arms: [0, 1], band: 0.5, bend: false }, reach: { arms: null, band: 0.4, bend: true, maxBend: 0.6 } };
  const HIT_LOCK = { spike: [0.22, 0], block: [0.18, 0], set: [0.2, 0], bump: [0.2, 0], reach: [0.18, 0] };
  function ballShown(m) { for (let o = m; o; o = o.parent) { if (!o.visible) return false; if (o === scene) return true; } return false; }
  function avTouchEnd(av, i, kind, out) { av.elbows[i].getWorldPosition(TCH.E); av.hands[i].getWorldPosition(TCH.H); return kind === 'bump' ? out.lerpVectors(TCH.E, TCH.H, 0.6) : out.copy(TCH.H).sub(TCH.E).normalize().multiplyScalar(0.05 * (av.g.scale.x || 1)).add(TCH.H); }
  function avShoulders(av) { av.arms[0].getWorldPosition(TCH.S); av.arms[1].getWorldPosition(TCH.M); TCH.M.add(TCH.S).multiplyScalar(0.5); av.elbows[0].getWorldPosition(TCH.E); av.hands[0].getWorldPosition(TCH.H); return TCH.S.distanceTo(TCH.E) + TCH.E.distanceTo(TCH.H) + 0.05 * (av.g.scale.x || 1); }
  function avReachTo(av, kind, B, w) {
    const C = TCH_CFG[kind], Rv = BALL_R * BALL_VIS, sc = av.g.scale.x || 1;
    avShoulders(av);
    TCH.r.setFromMatrixColumn(av.g.matrixWorld, 0).normalize().negate();   // 人物的右手邊（arms[0] 在 -x 那側）
    TCH.n.copy(B).sub(TCH.M).normalize();
    let arms = C.arms;
    if (!arms) { av.arms[0].getWorldPosition(TCH.S); const d0 = TCH.S.distanceTo(B); av.arms[1].getWorldPosition(TCH.S); arms = [d0 <= TCH.S.distanceTo(B) ? 0 : 1]; }
    TCH.P.set(0, 0, 0);
    for (const i of arms) {
      const sd = i === 0 ? 1 : -1, arm = av.arms[i], el = av.elbows[i];
      arm.getWorldPosition(TCH.S);
      const T = TCH.T.copy(B);
      if (kind === 'spike' || kind === 'reach') T.addScaledVector(TCH.g.copy(B).sub(TCH.S).normalize(), -(Rv + 0.015));
      else if (kind === 'set') T.addScaledVector(TCH.n, -Rv * 0.5).addScaledVector(TCH.UP, -Rv * 0.4).addScaledVector(TCH.r, sd * Rv * 0.78);
      else if (kind === 'block') T.addScaledVector(TCH.n, -Rv * 0.8).addScaledVector(TCH.r, sd * Rv * 0.55);
      else T.addScaledVector(TCH.UP, -(Rv + 0.04 * sc)).addScaledVector(TCH.r, sd * 0.045 * sc);
      // 手肘：兩節手臂照目標距離算要彎多少（接球、攔網手臂打直；扣球幾乎打直）
      avTouchEnd(av, i, kind, TCH.F); el.getWorldPosition(TCH.E);
      const a = TCH.S.distanceTo(TCH.E), c = TCH.E.distanceTo(TCH.F), dT = clamp(TCH.S.distanceTo(T), Math.abs(a - c) + 1e-3, a + c - 1e-3);
      const bend = C.bend ? clamp(Math.PI - Math.acos(clamp((a * a + c * c - dT * dT) / (2 * a * c), -1, 1)), 0, C.maxBend || 2.4) : 0;
      el.rotation.x += (-bend - el.rotation.x) * w; arm.updateMatrixWorld(true);
      // 整隻手臂轉過去，讓碰球的點對準目標
      avTouchEnd(av, i, kind, TCH.F);
      TCH.g.copy(TCH.F).sub(TCH.S).normalize(); TCH.V.copy(T).sub(TCH.S).normalize();
      TCH.q.setFromUnitVectors(TCH.g, TCH.V); TCH.qw.identity().slerp(TCH.q, w);
      arm.getWorldQuaternion(TCH.qp); TCH.qw.multiply(TCH.qp); arm.parent.getWorldQuaternion(TCH.qp).invert();
      arm.quaternion.copy(TCH.qp.multiply(TCH.qw)); arm.updateMatrixWorld(true);
      avTouchEnd(av, i, kind, TCH.F); TCH.P.add(TCH.F.sub(T));
    }
    TCH.P.multiplyScalar(1 / arms.length); return TCH.P.length();
  }
  const TOUCH_LOG = [];
  function touchLog(L, src) { if (!window.__gym) return; const kd = L.ev ? L.kind : L.av._tk || L.kind, g = avReachTo(L.av, kd, L.C, 1), r3 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]; L.av.g.getWorldPosition(TCH.F); TOUCH_LOG.push({ src, kind: kd, gap: +g.toFixed(3), tk: L.av._tk, C: r3(L.C), M: r3(TCH.M), at: r3(TCH.F), off: r3(TCH.P), br: L.av._br ? [+L.av._br.x.toFixed(2), +L.av._br.z.toFixed(2), +L.av._br.dip.toFixed(2), +(L.av._br.up || 0).toFixed(2)] : null, keep: !!L.av._bodyKeep }); if (TOUCH_LOG.length > 400) TOUCH_LOG.shift(); }
  const TCH_KIND = { spike: 'spike', hit: 'spike', tip: 'spike', serve: 'spike', set: 'set', bump: 'bump', block: 'block' };
  function touchEvent(m, kind) { if (m && m.userData) m.userData.tev = { t: performance.now(), kind: TCH_KIND[kind] || 'reach' }; }
  function touchPass() {
    const now = performance.now(); if (now - (touchPass.t || 0) < 4) return; touchPass.prev = touchPass.t || 0; touchPass.t = now;
    for (const m of LIVE_BALLS) {
      const U = m.userData;
      if (!m.parent || !ballShown(m)) { U.hp = null; U.hv = null; U.lock = null; continue; }
      const p = TCH.B.setFromMatrixPosition(m.matrixWorld), dtm = U.hp ? (now - U.ht) / 1000 : 0;
      if (U.tev) {   // A1：遊戲剛擊球——擊球點＝上一格畫面上的球，找離它最近、正在做那個動作的人
        const E = U.tev; U.tev = null;
        if (now - E.t < 150 && U.hp && !window.__tchEvOff) {
          let who = null, wd = Infinity;
          for (const av of LIVE_AVS) {
            if (now - av._drv > 150 || !av.g.parent || !ballShown(av.g)) continue;
            const reach = avShoulders(av), d = TCH.M.distanceTo(U.hp) - reach - BALL_R * BALL_VIS, sc = d - (av._tk === E.kind ? 0.4 : av._tk || (av._fa || 0) > 0.5 ? 0.2 : 0);
            if (d < 1.6 && sc < wd) { wd = sc; who = av; }
          }
          if (who) { U.lock = { av: who, t0: now, C: U.hp.clone(), kind: (who._fa || 0) > 0.5 ? 'reach' : E.kind, ev: true }; touchLog(U.lock, 'event'); avKick(who, U.lock.kind, U.hv ? U.hv.length() : 8, now); }
        }
      }
      if (U.hp && dtm > 0.004 && dtm < 0.25) {
        const v = TCH.Bb.copy(p).sub(U.hp).divideScalar(dtm);
        if (v.lengthSq() > 45 * 45) { U.hv = null; U.hp.copy(p); U.ht = now; U.lock = null; continue; }   // 球被瞬間移走（重新發球、換場）不算擊球
        if (U.hv && U.hv.lengthSq() > 4 && v.lengthSq() > 4 && U.hv.angleTo(v) > 0.45 && U.hp.y > 0.4 && p.y > 0.4 && !(U.lock && now - U.lock.t0 < 120)) {
          const Rv = BALL_R * BALL_VIS, sp = v.length(); let who = null, wd = Infinity;
          for (const av of LIVE_AVS) {
            if (now - av._drv > 150 || !av.g.parent || !ballShown(av.g)) { if (now - av._drv > 3000) LIVE_AVS.delete(av); continue; }
            const reach = avShoulders(av), d = TCH.M.distanceTo(U.hp) - reach - Rv, lim = av._tk ? 1.4 : 0.6, sc = d - (av._tk ? 0.3 : 0);
            if (d < lim && sc < wd) { wd = sc; who = av; }
          }
          if (who) { avShoulders(who); const dy = U.hp.y - TCH.M.y; U.lock = { av: who, t0: now, C: U.hp.clone(), kind: dy > 0.25 ? (sp > 12 ? 'spike' : 'set') : dy < -0.15 ? 'bump' : 'reach' }; touchLog(U.lock, 'detect'); avKick(who, who._tk || U.lock.kind, U.hv.length(), now); }
        }
        U.hv = (U.hv || new THREE.Vector3()).copy(v);
      }
      U.hp = (U.hp || new THREE.Vector3()).copy(p); U.ht = now;
      const L = U.lock; if (!L) continue;
      const kd = L.ev ? L.kind : L.av._tk || L.kind, LK = HIT_LOCK[kd] || HIT_LOCK.reach, u = (now - L.t0) / 1000 / LK[0];
      // 2026-11-20 使用者：球路會飄、不像正常拋物線。原因是下面「畫面上的球接回真正位置」用頭尾平滑（smoothstep）在 0.2 秒內縮完，
      //   等於在球上多加一段很大的加速度（差 0.5 m 時約 ±25 m/s²），球看起來在空中轉彎。
      //   改成照「球的時間」等速縮小：差距對時間是直線，二次微分＝0，畫面上的球加速度跟真正的重力完全一樣（只是從手上出發），
      //   縮完的時間 tau＝球落地前的 8 成（0.15～1.0 球秒）：舉球、接球約 1 秒，扣球約 0.25 秒；差距 0.5 m 時速度只差 0.5～2 m/s，看不出轉折。
      if (L.tau == null) { const bo = m.userData.ball, v = bo && bo.v, g = 9.8 - (bo && bo.acc ? bo.acc.y : 0); let tf = 0.6; if (v && g > 0) { const y = Math.max(0, p.y - BALL_R); tf = (v.y + Math.sqrt(Math.max(0, v.y * v.y + 2 * g * y))) / g; } L.tau = clamp(tf * 0.8, 0.15, 1.0); }
      const ub = (now - L.t0) / 1000 * (VB.ts || 1) / L.tau;   // 球的時間（房間球速放慢時球的時間也慢）
      if ((u >= 1 && ub >= 1) || !LIVE_AVS.has(L.av)) { U.lock = null; continue; }
      const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
      if (u < 1) avReachTo(L.av, kd, L.C, 1 - sm(((now - L.t0) / 1000 / 0.1 - 0.55) / 0.45));   // 手只在擊球點停 0.1 秒（跟以前一樣），之後交給跟隨動作（avKick）
      // 球心：先在「剛好貼著手」的位置（擊球點＋手還差的距離），再照球的時間等速接回真正的位置
      if (!L.off) L.off = TCH.V.copy(L.C).add(TCH.P).sub(p).clone();
      const hold = TCH.V.copy(L.off).multiplyScalar(Math.max(0, 1 - ub)); U.pull = { x: hold.x, y: hold.y, z: hold.z, w: 1, t: now };
    }
  }
  function avPoseOf(...a) { return S.avPoseOf ? S.avPoseOf(...a) : undefined; }
  function peerTag(p2) { const tag = (p2.tt ? `「${p2.tt}」` : '') + VM.on && VM.six && VM.role && VM.role[p2.id] ? `${V6_TAG[VM.role[p2.id]]}・${p2.n}` : p2.n; return tag + (ROOM?.snapshot.flow.ready.includes(p2.id) && ROOM.snapshot.flow.phase !== 'playing' ? ' · 準備' : ''); }
  function peerTagsAll(...a) { return S.peerTagsAll ? S.peerTagsAll(...a) : undefined; }
  function netPeer(id, d) {
    let p2 = NET.peers.get(id);
    if (!p2) {
      const av = makeAvatar(d.c || '#3E63DD');
      const el = document.createElement('div'); el.className = 'mp-tag'; el.textContent = d.n || '球友';
      const tag = new CSS2DObject(el); tag.position.set(0, 2.05, 0); av.g.add(tag);
      scene.add(av.g);
      p2 = { id, n: d.n || '球友', c: d.c || '#3E63DD', av, tag, x: 0, z: 0, y: 0, yaw: 0, pose: 0, ball: null, buf: [], vx: 0, vz: 0 };
      NET.peers.set(id, p2); if (ROOM) ROOM.join(id);
      if (NET.on) toast(`${p2.n} 進來了`);
    } else { p2.n = d.n || p2.n; p2.tag.element.textContent = peerTag(p2); }
    return p2;
  }
  function langziReceive(...a) { return S.langziReceive ? S.langziReceive(...a) : undefined; }
  function emoOnNet(...a) { return S.emoOnNet ? S.emoOnNet(...a) : undefined; }
  function myPoseCode(...a) { return S.myPoseCode ? S.myPoseCode(...a) : 0; }
  function netSmoothBall(b, dt, courts) {
    const p = b.m.position, before = p.clone();
    const dx = p.x - walk.x, dz = p.z - walk.z;
    const speed2 = b.v.x * b.v.x + b.v.z * b.v.z;
    const ahead = clamp(-(dx * b.v.x + dz * b.v.z) / Math.max(speed2, 0.001), 0, 0.4 * VB.ts);
    const coming = dx * b.v.x + dz * b.v.z < 0 || speed2 < 1;   /* WEB-023：球往我這邊來（或幾乎不動）才算近身；隊友在旁邊把球打走時照樣柔和修正，不會瞬移 */
    const near = (Math.hypot(dx, dz) <= 3 && coming) || Math.hypot(dx + b.v.x * ahead, dz + b.v.z * ahead) <= 3;
    const age = b.errTime || 0, next = Math.min(0.25, age + dt);
    const remaining = t => 1 - 3 * (t / 0.25) ** 2 + 2 * (t / 0.25) ** 3;
    const k = near ? Math.min(1, dt * 10) : 1 - remaining(next) / Math.max(1e-9, remaining(age));
    b.errTime = near ? 0 : next;
    p.addScaledVector(b.err, k); b.err.multiplyScalar(1 - k);
    for (const c of courts) {
      if (b.room && !NET.ownBall) continue; /* 遠端路線以 n 事件確認碰網，不以顯示修正線段判斷。 */
      const [a0, z0] = toLocalOf(c, before.x, before.z), [a1, z1] = toLocalOf(c, p.x, p.z);
      if (a0 * a1 >= 0) continue;
      const f = a0 / (a0 - a1), y = before.y + (p.y - before.y) * f, z = z0 + (z1 - z0) * f;
      if (Math.abs(z) < 5.3 && y < NETS[state.net].h + BALL_R) { p.add(b.err); b.err = null; break; }
    }
    if (b.err && b.err.lengthSq() < 1e-5) b.err = null;
  }
  function netPeerSnapshot(p2, d, now) {
    const stamp = Number.isFinite(d.tm) ? d.tm * 1000 : null;
    if (p2.keyStateAfter != null && (stamp == null ? now : stamp + (p2.netOffset ?? now - stamp)) < p2.keyStateAfter) return false;
    p2.keyStateAfter = null;
    if (stamp != null && p2.netStamp != null && stamp <= p2.netStamp) return false;
    const hadState = !!p2.last, buf = p2.buf || (p2.buf = []);
    if (p2.last) p2.netGap = (p2.netGap || 150) * 0.85 + clamp(now - p2.last.t, 0, 500) * 0.15;
    if (stamp != null && p2.netOffset == null) p2.netOffset = now - stamp;
    const t = Math.max((buf[buf.length - 1]?.t ?? -Infinity) + 0.001, stamp == null ? now : stamp + p2.netOffset);
    if (stamp != null) p2.netStamp = stamp;
    const row = { t, x: d.x, z: d.z, y: d.y || 0, yaw: d.yaw, vx: d.vx || 0, vz: d.vz || 0 };
    buf.push(row);
    while (buf.length > 2 && (buf[1].t < t - 1000 || buf.length > 30)) buf.shift();
    p2.last = { ...row, t: now };
    if (d.jp && d.jp.s !== p2.jpS) {
      const first = p2.jpS == null; p2.jpS = d.jp.s;
      if (!first || hadState || row.y > 0) {
        const L = netLat(p2.id), g = d.jp.g || JUMP_G;
        p2.jump = d.jp.vy ? { g, vy: d.jp.vy - g * L, y: d.jp.vy * L - 0.5 * g * L * L } : { h: d.jp.h, T: d.jp.T, t: L };
        p2.jump.x = d.x; p2.jump.z = d.z; p2.netLanded = false;
        p2.x = d.x; p2.z = d.z;
      }
    }
    if (!p2.jump && row.y === 0) p2.netLanded = false;
    return true;
  }
  function netPeerPlayback(...a) { return S.netPeerPlayback ? S.netPeerPlayback(...a) : (a[0] && a[0].last ? [a[0].last.x, a[0].last.z, a[0].last.yaw, a[0].last.y || 0] : [0, 0, 0, 0]); }
  function vmWireInit(host, data = VM.startData) {
    const session = host ? `${NET.me}:${Date.now()}:${gameRandom().toString(36).slice(2)}` : data.session;
    VM.wire = { session, order: host ? new VBMatchSync.Authority(session) : new VBMatchSync.Receiver(session), frame: 0, sent: -Infinity, dirty: true, history: [], seen: new Map(), offset: null, pending: null, event: null, eventSeen: '', serial: 0 };
    if (host) Object.assign(data, { wire: 2, session });
    NET.ownBall = host; NET.hitBy = host ? NET.me : VM.hostId;
  }
  function vmWireBall(b) {
    return { p: b.m.position.toArray(), v: b.v.toArray(), q: b.m.quaternion.toArray(), s: b.spinW?.toArray(), a: b.acc?.toArray(), f: b.float ? [b.float.t, b.float.w, b.float.ph, b.float.a] : undefined, floor: b.floorHit?.slice(), sf: b.setFault, j: b.jump0 };
  }
  function vmWireApply(b, data) {
    b.m.position.set(...data.p); b.v.set(...data.v); b.m.quaternion.set(...(data.q || [0, 0, 0, 1]));
    b.spinW = data.s ? new THREE.Vector3(...data.s) : null; b.acc = data.a ? new THREE.Vector3(...data.a) : null;
    b.float = data.f ? { t: data.f[0], w: data.f[1], ph: data.f[2], a: data.f[3] } : null;
    b.floorHit = data.floor || null; b.floorReport = !!data.floor; b.floorT = performance.now();
    b.err = null; b.snap = null; b.waitFloor = null; b.floorEv = false; b.rest = 0; b.wireLocal = false;   /* 新的球路來了：切回照主機的球 */
    b.jump0 = data.j || null; b.setFault = data.sf || null; b.room = true;
  }
  function vmWireGetBall() {
    let b = VM.ball && balls.includes(VM.ball) ? VM.ball : balls.find(q => q.room && !q.langzi);
    if (!b) { const m = newBallMesh(); b = { m, v: new THREE.Vector3(), rest: 0, room: true }; m.userData.ball = b; ballsGroup.add(m); balls.push(b); }
    VM.ball = b; return b;
  }
  function vmWireClaim(d, from) {
    const w = VM.wire, now = performance.now();
    if (!VM.host || !d || d.session !== w.session || vmTeamOf(from) < 0 || !Number.isInteger(d.id)) return;
    const key = `${from}:${d.id}`;
    if (w.seen.has(key)) { NET.tx.publish('match-ack', { session: w.session, to: from, id: d.id, accepted: w.seen.get(key) }); w.dirty = true; return; }
    /* 審核放寬（2026-11-16 玩家回報擊球常被判不成立）：時間差 150 ms 內、離裁判那邊的球 1.3 m 內、人離球 4.5 m 內都算；網路慢到 0.9 秒內的請求也收 */
    let valid = VBMatchSync.validBall(d.ball) && Number.isFinite(d.at) && d.at <= now + 150 && d.at >= now - 900;
    if (valid && VM.phase === 'serve') valid = d.kind === 'serve' && from === vmServer();
    else if (valid && VM.phase === 'rally' && d.kind !== 'serve') {
      const at = clamp(d.at, now - 900, now);
      const history = w.history.filter(h => h.seq === d.base && Math.abs(h.at - at) < 150 && !h.floor);
      valid = history.some(h => Math.hypot(...h.p.map((n, i) => n - d.ball.p[i])) < 1.3);
      const peer = NET.peers.get(from)?.last;
      valid = valid && !!peer && Math.hypot(peer.x - d.ball.p[0], peer.z - d.ball.p[2]) < 4.5;
    } else valid = false;
    const accepted = !!(valid && w.order.claim(d));
    w.seen.set(key, accepted); if (w.seen.size > 128) w.seen.delete(w.seen.keys().next().value);
    NET.tx.publish('match-ack', { session: w.session, to: from, id: d.id, accepted });
    if (!accepted) { w.dirty = true; return; }
    const b = vmWireGetBall(); vmWireApply(b, d.ball); b.mine = false; b.lk = d.kind;
    NET.hitN = w.order.seq; NET.hitBy = NET.me; NET.ownBall = true;
    w.event = { seq: w.order.seq, actor: from, kind: d.kind, quality: clamp(Number(d.quality) || 1, 0, 1.5), p: d.ball.p, id: d.id };
    vmOnTouch(b, from, d.kind); vbImpact(b, d.kind, w.event.quality);
    // Advance only the accepted outgoing flight, using elapsed host time.
    if (VM.phase === 'rally') {
      const age = clamp((now - d.at) / 1000, 0, .35);
      // Let normal swept collision steps handle the network catch-up, not a position teleport.
      b.wireCatchup = age;
    }
    w.dirty = true;
  }
  function vmWireReceive(d, from) {
    const w = VM.wire, previousRound = w.order.round;
    if (VM.host || from !== VM.hostId || !w.order.accept(d)) return;
    w.rxAt = performance.now();   /* 看門狗：最後一次收到房主（伺服器）的比賽畫格 */
    if (d.round !== previousRound && d.server !== NET.me) vmDropHeld();
    const now = performance.now();
    if (w.offset == null) w.offset = d.at + netLat(from) * 1000 - now;
    if (Number.isFinite(d.time)) for (const row of d.ai || []) {
      const ai = VM.ai.get(row[0]); if (!ai) continue;
      ai.netOffset = d.at - d.time * 1000 - w.offset;
      vmAiSnapshot(ai, row, now);
    }
    w.latest = d; VM.sc = d.sc; VM.phase = d.phase; VM.srvId = d.server; VM.tc = d.tc;
    NET.hitN = d.seq; NET.hitBy = from; NET.ownBall = false;
    if (w.pending && (d.round !== w.pending.request.round || d.seq > w.pending.request.base)) w.pending = null;
    if (!d.ball) { if (!w.pending) { vmClearBalls(); VM.ball = null; } return; }
    const b = vmWireGetBall(), hadFrame = !!b.wireFrame;
    const before = b.m.position.clone(); if (b.wireVisualError) before.add(b.wireVisualError);
    b.wireRemote = true;
    if (!w.pending && !(d.ball.floor && b.wireLocal)) {   /* 已經落地、本機在算彈跳：同一個落地的球路不要再把球拉回落點 */
      b.wirePrediction = null; vmWireApply(b, d.ball);
      const age = clamp((now + w.offset - d.at) / 1000, 0, .35), flight = VBMatchSync.sample(d.ball, age * VB.ts, BALL_R, age);
      const error = before.sub(new THREE.Vector3(...flight.p));
      b.m.position.set(...flight.p); b.v.set(...flight.v);   /* 球的轉向在本機自己轉（vmWireRemoteStep），不用伺服器的：伺服器那邊球不會轉 */
      b.wireVisualError = hadFrame && !d.ball.floor && error.length() < 2 ? error : null;
    }
    b.wireFrame = d;
    const event = d.event, eventKey = `${d.round}:${event?.seq}`;
    if (event && w.eventSeen !== eventKey) {
      w.eventSeen = eventKey; b.lk = event.kind; b.mine = event.actor === NET.me;
      if (event.kind === 'set') vbMarkSet(b);
      if (event.actor !== NET.me) sfx(event.kind, event.quality, new THREE.Vector3(...event.p));
    }
  }
  function vmWireRemoteStep(b, dt) {
    const w = VM.wire, now = performance.now(), prediction = w.pending && b.wirePrediction;
    const frame = b.wireFrame || w.latest;
    if (!prediction && !frame?.ball) return;
    const ball = prediction ? prediction.ball : frame.ball;
    const age = clamp((prediction ? now - prediction.at : now + (w.offset || 0) - frame.at) / 1000, 0, .35);
    const flight = VBMatchSync.sample(ball, age * VB.ts, BALL_R, age);
    b.m.position.set(...flight.p); b.v.set(...flight.v);
    {   /* 旋轉：照主機給的轉速在本機轉（以前每次收到都把轉向拉回伺服器的值，扣球看起來不會轉） */
      const s0 = !ball.f && !ball.floor && ball.s, w = s0 ? Math.hypot(s0[0], s0[1], s0[2]) : 0;
      if (w > 0.01 && b.m.position.y > BALL_R + 0.03) { const r = w >= 28 ? clamp(Math.hypot(...flight.v) * 0.9, 10, 26) : Math.min(w, 26); b.m.rotateOnWorldAxis(SPIN_AX.set(s0[0] / w, s0[1] / w, s0[2] / w), Math.min(r * dt, BALL_SPIN_STEP)); }
    }
    if (b.wireVisualError) b.wireVisualError.multiplyScalar(Math.exp(-dt / .08));
    if (ball.floor && !prediction) {   /* 落地後：直接用房主回報的位置和速度（已經彈起來了），交給本機物理接著彈跳滾動，不再釘在落點 */
      b.m.position.set(ball.p[0], Math.max(BALL_R, ball.p[1]), ball.p[2]); b.v.set(...ball.v); b.acc = null; b.float = null;
      if (!b.wireLocal && typeof vbFloorImpact === 'function') vbFloorImpact(b, b.m.position, Math.abs(b.v.y) / 0.62); b.floorHit = ball.floor.slice(); b.floorReport = true; b.waitFloor = null; b.wireLocal = true; b.wireCatchup = age; b.wireVisualError = null;
    }
    if (!prediction && !ball.floor && vmTeamOf(vmMe()) >= 0) vbBlockTest(b, dt * VB.ts);
  }
  function vmWireTick() {
    if (!VM.on || !VM.wire || !NET.on) return;
    const w = VM.wire, now = performance.now();
    if (!VM.host) {
      if (VM.hostId === 'srv' && !VM.srvDone && VM.phase !== 'over' && now - (w.rxAt || w.startAt || (w.startAt = now)) > 3000) { srvJudgeFailed('超過 3 秒沒收到伺服器的比賽資料'); return; }   /* 2026-11-20：打完以後伺服器本來就不再送，不能當成斷線（以前會在背景自動開一局） */
      const p = w.pending;
      if (p && now - p.since > 1000) { w.pending = null; if (VM.ball) VM.ball.wirePrediction = null; }
      else if (p && now - p.sent > 200) { p.sent = now; NET.tx.publish('match-claim', p.request); }
      return;
    }
    const b = VM.ball && balls.includes(VM.ball) ? VM.ball : null;
    if (b) w.history.push({ at: now, seq: w.order.seq, p: b.m.position.toArray(), floor: !!b.floorHit });
    while (w.history.length && w.history[0].at < now - 1100) w.history.shift();   /* 要涵蓋審核時往回找的 0.9 秒 */
    if (!w.dirty && now - w.sent < (VM.phase === 'rally' ? (typeof netFast === 'function' && netFast() ? 66 : 100) : (typeof netFast === 'function' && netFast() ? 200 : 400))) return;
    w.sent = now; w.dirty = false;
    NET.tx.publish('match-frame', { session: w.session, frame: ++w.frame, round: w.order.round, seq: w.order.seq, at: now, time: VM.t, ai: vmStatePayload().ai, ball: b ? vmWireBall(b) : null, event: w.event, sc: VM.sc, phase: VM.phase, server: vmServer(), tc: VM.phase === 'rally' && VM.touch.team >= 0 && !VM.touch.serve ? [VM.touch.team, VM.touch.n] : null });
  }
  function vmJudgePenetration() {
    if (!VM.host || VM.phase !== 'rally') return;
    for (const team of [0, 1]) for (const id of VM.team[team]) {
      const ai = VM.ai.get(id), peer = NET.peers.get(id)?.last;
      const p = ai ? { x: ai.x, z: ai.z, y: ai.y } : id === vmMe() ? { x: vmL(walk.x, walk.z)[0], z: vmL(walk.x, walk.z)[1], y: walk.air?.y || 0 } : peer ? { x: vmL(peer.x, peer.z)[0], z: vmL(peer.x, peer.z)[1], y: peer.y || 0 } : null;
      // Approximate the sole as 20 cm: touching the centre line is still permitted.
      if (p && p.y < .08 && Math.abs(p.z) < 4.5 && p.x * vmSide(team) < -.2 && Math.abs(p.x) < 9) { vmPoint(1 - team, `越過中線犯規（${vmName(id)}的腳完全進入對方球場）`); return; }
    }
  }
  function netOnMessage(t, d, from) {
    if (from === NET.me) return;
    if (typeof NETSTAT === 'object') NETSTAT.inN++;   /* 連線量測：每秒收到幾筆 */
    if (VM.on && VM.wire) {
      if (t === 'match-claim') { vmWireClaim(d, from); return; }
      if (t === 'match-frame') { vmWireReceive(d, from); return; }
      if (t === 'match-ack') {
        if (from === VM.hostId && d.session === VM.wire.session && d.to === NET.me && d.id === VM.wire.pending?.request.id && !d.accepted) { const k = VM.wire.pending.request.kind; VM.wire.pending = null; if (VM.ball) VM.ball.wirePrediction = null; toast(`這一下${{ serve: '發球', bump: '接球', set: '舉球', spike: '扣球', hit: '擊球', tip: '吊球', block: '攔網' }[k] || '擊球'}裁判沒算到（球照裁判那邊的走）`, 1600); }   /* 以前被拒絕沒有任何提示，球會突然甩到別的方向 */
        return;
      }
      if (t === 'ball' && d.w !== 'kick') return;
    }
    if (t === 'chat') { RoomChat.receive(d, from); return; }
    if (t === 'room-settings') { if (ROOM) ROOM.receive(d, from); return; }
    if (t === 'ranked-result') { if (from === 'srv' && d && d.list) import('./js/match-result.js').then(mr => mr.setRankedResult?.(d.list[NET.me], d)).catch(() => {}); return; }   /* WEB-030 積分賽加減分 */
    if (t === 'srv-fail') { if (from === 'srv') srvJudgeFailed(d?.why || '伺服器裁判出錯'); return; }   /* B5：伺服器開賽失敗／比賽途中出錯 */
    if (t === 'room-match-sync') { if (ROOM?.isHost && VM.on && VM.host && VM.startData) { NET.tx.publish('vm', VM.startData); vmBroadcast(true); } return; }
    if (t === 'ping') { NET.tx.publish('pong', { to: from, t: d.t, hostTime: performance.now() }); return; }   // 量延遲
    if (t === 'pong') { if (d.to === NET.me) { const half = (performance.now() - d.t) / 2, o = NET.lat.get(from); NET.lat.set(from, o == null ? half : o * 0.7 + half * 0.3); if (VM.wire && !VM.host && from === VM.hostId && Number.isFinite(d.hostTime)) { const offset = d.hostTime + half - performance.now(); VM.wire.offsetN = (VM.wire.offsetN || 0) + 1; VM.wire.offset = VM.wire.offset == null || VM.wire.offsetN === 1 ? offset : VM.wire.offset * .8 + offset * .2; }   /* 第一次量到就直接用（開賽時的估計可能差 0.1 秒），之後再慢慢平均 */ } return; }
    if (t === 'st') {
      if (from === 'srv' && d.vm && VM.on && !VM.host && from === VM.hostId) {   /* B5：伺服器不是球員，只拿它的比賽狀態 */
        vmOnNet({ e: 'st', ...d.vm }, from);
        if (d.vm.phase === 'over' && ROOM?.isHost && ROOM.snapshot?.flow?.phase === 'playing') ROOM.end();   /* 伺服器打完，房主把房間流程收回等待 */
        return;
      }
      if (from === 'srv') return;   /* 伺服器不是球員：其他時候送來的狀態不要當成一個人（以前會多一個看不到的「伺服器裁判」，斷糧也被它灌高） */
      const p2 = NET.peers.get(from) || netPeer(from, { n: d.n, c: d.c });
      // 位置與朝向依個別真人時間軸播放，動作保留最新狀態。
      if (!netPeerSnapshot(p2, d, performance.now())) return;
      if (d.vm && !VM.on && (!ROOM || from === ROOM.host || (from === 'srv' && ROOM.snapshot?.flow?.phase === 'playing')) && performance.now() - (NET.matchSyncAt || -Infinity) > 1000) {   /* 伺服器的比賽：房間在比賽中才跟上 */
        NET.matchSyncAt = performance.now();
        NET.tx.publish('room-match-sync', {});
      }
      if (d.vm && VM.on && !VM.host && from === VM.hostId) vmOnNet({ e: 'st', ...d.vm }, from);
      const dch = normalizeLook(d.ch);
      if ('tj' in d) p2.tj = d.tj || null;   // WEB-010 球隊球衣／J4 個人球衣：只有換衣服或每 4 秒才帶，沒帶就照舊（先存再換外觀，馬上穿上）
      p2.ch = dch; refreshPeerAppearance(p2);
      if ((d.tt || '') !== (p2.tt || '')) { p2.tt = String(d.tt || '').slice(0, 12); p2.tag.element.textContent = peerTag(p2); }   // WEB-010 稱號
      if (d.n && p2.n !== d.n) { p2.n = String(d.n).slice(0, 24); p2.tag.element.textContent = peerTag(p2); renderMpList(); }
      p2.pose = d.p; p2.rk = d.rk || null; rkPeerAi(p2, d.ai); p2.sta = d.sta ?? null;
      p2.tossing = !!d.ts; p2.bs = d.bs || 0;   // 攔網雙手往哪邊移
      if (d.b) { if (!p2.ball) { p2.ball = newBallMesh(); scene.add(p2.ball); } if (d.ts && !p2.ball.visible) p2.ball.position.set(...d.b); p2.ballT = d.b; p2.ball.visible = true; }
      else if (p2.ball) p2.ball.visible = false;
    } else if (t === 'ball') {
      if (d.w === 'kick') { langziReceive(d, from); return; }
      if (d.w !== 'serve' && balls.some(q => q.langzi && q.kickSource?.room && q.kickSource.h === d.h && q.kickSource.by === d.by)) return;
      if (VM.on && vmTeamOf(from) < 0 && from !== VM.hostId) return;
      // 擊球序號：比我新的＝別人打到了；一樣的序號而且是現在負責的人＝一般位置更新；一樣的序號但不同人＝同時打到，代號大的算
      if (VM.on && d.w === 'throw') return;   // 比賽中有人把手上的球丟出來：不理，不會取代比賽球
      // 比賽中輪到的人發出去的那一下：不管序號一定收（序號剛好被別的事件超過時，主機會整個忽略發球＝球不見、不判分）
      const srvHit = VM.on && d.w === 'serve' && VM.phase === 'serve' && d.by === (VM.host ? vmServer() : VM.srvId);
      if (d.g && (d.h !== NET.hitN || d.by !== NET.hitBy || from !== d.by)) return;
      const newer = d.h > NET.hitN || srvHit, sameOwner = d.h === NET.hitN && d.by === NET.hitBy, tie = d.h === NET.hitN && d.by !== NET.hitBy && d.by > NET.hitBy;
      if (!newer && !sameOwner && !tie) { if (d.w && VM.on) console.warn('[連線] 忽略一下擊球', d.w, d.by, d.h, NET.hitN, NET.hitBy); return; }
      if (newer || tie) { NET.hitN = Math.max(NET.hitN, d.h); NET.hitBy = d.by; NET.ownBall = false; }
      if (VM.on && !VM.host && roomSpectator() && VM.watchFrames) {
        if ((newer || tie) && ['serve', 'hit', 'spike', 'tip', 'bump', 'set', 'block'].includes(d.w)) {
          sfx(d.w, d.q ?? 1, new THREE.Vector3(...d.p));
        }
        return;
      }
      let b = balls.find((q) => q.room);
      if (b && sameOwner && b.floorReport) return; /* 落地後舊校正不能覆蓋落點。 */
      const P = new THREE.Vector3(d.p[0], d.p[1], d.p[2]);
      if (!b) { const m = newBallMesh(); ballsGroup.add(m); b = { m, v: new THREE.Vector3(), rest: 0, room: true }; m.userData.ball = b; balls.push(b); b.m.position.copy(P); }
      if (VM.on && !VM.host) VM.ball = b;
      // 訊息裡的球是對方「送出那一刻」的位置；傳到我這裡已經過了一小段時間（約 0.1 秒），不能照舊位置把球拉回去（會閃）
      //   新的擊球：沿著新的路線往前補上延遲那一段，再在約 0.25 秒內平滑靠過去
      //   一般校正：在對方的路線上找離我這顆球最近的一點；差不到 35 cm 就不動，差多了才慢慢拉過去
      const V = new THREE.Vector3(d.v[0], d.v[1], d.v[2]), A = d.a ? new THREE.Vector3(d.a[0], d.a[1], d.a[2]) : new THREE.Vector3(), gy = -9.8 + A.y;
      const at = (tau) => [new THREE.Vector3(P.x + V.x * tau + 0.5 * A.x * tau * tau, Math.max(BALL_R, P.y + V.y * tau + 0.5 * gy * tau * tau), P.z + V.z * tau + 0.5 * A.z * tau * tau), new THREE.Vector3(V.x + A.x * tau, V.y + gy * tau, V.z + A.z * tau)];
      const cur = b.m.position; let tgt = null, vel = null;
      if (newer || tie) [tgt, vel] = at(netLat(from) * VB.ts);   // 照這個人實際的延遲往前補
      else { let best = 1e9; for (let tau = 0; tau <= 0.6 * VB.ts; tau += 0.01) { const [q, w] = at(tau), dd = q.distanceTo(cur); if (dd < best) { best = dd; tgt = q; vel = w; } } if (best < 0.35) tgt = null; }
      if (tgt) { b.err = tgt.clone().sub(cur); b.errTime = 0; b.v.copy(vel); }
      b.acc = d.a ? A.clone() : null; if (newer || tie || !b.float) b.float = d.f ? { t: d.f[0], w: d.f[1], ph: d.f[2], a: d.f[3] } : null; if (newer || tie) { b.floorHit = null; b.floorReport = null; b.floorEv = false; b.waitFloor = null; }
      b.rest = 0; b.spike = d.k ? { c: state.items.find((c) => c.id === d.k.c) || null, sg: d.k.sg } : null; if (b.spike && !b.spike.c) b.spike = null;
      if (newer) recHit({ x: P.x, y: P.y, z: P.z, v: b.v.length(), by: d.by, kind: d.w || 'hit' });
      if (newer || tie) { b.mine = false; if (d.w === 'set') vbMarkSet(b); }
      if ((newer || tie) && d.w) {
        b.lk = d.w;
        if (d.w !== 'set') { b.setT = null; if (VB.setSpot?.b === b) VB.setSpot = null; }
        if (['serve', 'hit', 'spike', 'tip', 'bump', 'set', 'block'].includes(d.w)) vbImpact(b, d.w, d.q ?? 1);
      }
      if (newer || tie) b.spinW = d.s ? new THREE.Vector3(d.s[0], d.s[1], d.s[2]) : null;
      if (d.n && sameOwner) { const [q2, w2] = at(0.05 * VB.ts); cur.copy(q2); b.v.copy(w2); b.err = null; b.floorHit = null; }   // 碰網：照負責的人那邊的結果直接對齊（不會在你這邊過網、他那邊掛網）
      if (d.g && sameOwner && Array.isArray(d.g) && d.g.length === 2 && d.g.every(Number.isFinite)) {
        b.floorHit = d.g.slice(); b.floorReport = true; b.floorT = performance.now(); b.waitFloor = null;
        cur.set(d.g[0], BALL_R, d.g[1]); b.v.copy(V); b.err = null; b.snap = null; b.acc = null; b.float = null;
      }
      if (newer) { b.jump0 = d.j || null; b.setFault = d.sf || null; vmOnTouch(b, d.by, d.w); }
      for (const q of balls.filter((q2) => q2 !== b && q2.room)) { ballsGroup.remove(q.m); balls.splice(balls.indexOf(q), 1); }
    } else if (t === 'ball-sound') {
      if (from !== NET.hitBy || !['floor', 'wall', 'net', 'tape', 'antenna'].includes(d.kind)) return;
      if (!Array.isArray(d.p) || d.p.length !== 3 || !d.p.every(Number.isFinite) || !Number.isFinite(d.seq)) return;
      const peer = NET.peers.get(from); if (!peer || d.seq <= (peer.soundSeq || 0)) return;
      peer.soundSeq = d.seq;
      sfx(d.kind, clamp(Number(d.q) || 1, 0, 1.5), new THREE.Vector3(...d.p));
    } else if (t === 'emo') { emoOnNet(d, from);
    } else if (t === 'vm') { vmOnNet(d, from);
    } else if (t === 'rk') { rkOnNet(d, from);
    } else if (t === 'grab') {
      if (VM.on) return;   // 比賽中不能拿球：別人拿球的訊息不理（不然比賽球會被收走）
      if (d.h < NET.hitN || (d.h === NET.hitN && d.by <= NET.hitBy)) return;
      NET.hitN = d.h; NET.hitBy = d.by; NET.ownBall = false;
      for (const q of balls.filter((q2) => q2.room)) { ballsGroup.remove(q.m); balls.splice(balls.indexOf(q), 1); }
    }
  }
  function netFloorHit(b) {
    if (!NET.on || !b.room || !NET.ownBall || b.floorReport) return;
    b.floorReport = true;
    if (VM.on && VM.wire) { VM.wire.dirty = true; return; }
    const m = netBallMsg(b); m.g = b.floorHit.slice();
    NET.tx.publish('ball', m); /* 每段球權第一次落地才送，不更動一般校正節奏。 */
  }
  function netBallHit(...a) { return S.netBallHit ? S.netBallHit(...a) : undefined; }
  function recHit(...a) { return S.recHit ? S.recHit(...a) : undefined; }
  function netBallMsg(b, kind) {
    const m = { h: NET.hitN, by: NET.me, p: b.m.position.toArray().map((v) => +v.toFixed(3)), v: b.v.toArray().map((v) => +v.toFixed(3)) };
    if (kind) m.w = kind;
    if (b.spike && b.spike.c) m.k = { c: b.spike.c.id, sg: b.spike.sg };
    if (b.acc) m.a = b.acc.toArray().map((q) => +q.toFixed(2));
    if (b.spinW) m.s = b.spinW.toArray().map((q) => +q.toFixed(1));
    if (b.setFault) m.sf = b.setFault;
    if (b.float) m.f = [+b.float.t.toFixed(3), +b.float.w.toFixed(3), +b.float.ph.toFixed(3), +b.float.a.toFixed(2)];
    if ((kind === 'spike' || kind === 'tip' || kind === 'hit') && walk.air && walk.air.x0 != null) m.j = [+walk.air.x0.toFixed(2), +walk.air.z0.toFixed(2)];   // 起跳點：開局的人照這個判後排攻擊（不用猜你在哪起跳）
    return m;
  }
  function netTick(dt, now) {
    if (!NET.on) return;
    /* 比賽每 5 秒量一次延遲；剛開賽的加入者先密集量 4 次（每 0.5 秒）校正跟房主的時鐘。房主是伺服器（srv）時它不算玩家，也要量（B5） */
    const srvHost = VM.on && !VM.host && VM.hostId === 'srv', calibrating = VM.on && !VM.host && VM.wire && (VM.wire.offsetN || 0) < 4;
    if ((NET.peers.size || srvHost) && now - NET.pingT > (calibrating ? 500 : VM.on ? 5000 : 3000)) { NET.pingT = now; NET.tx.publish('ping', { t: now }); }
    // 我的狀態：移動中每秒 3 次、站著每 2 秒 1 次；帶上移動速度，別人用速度往前推算，畫面不用等下一筆
    const kv = 1 - Math.exp(-dt * 10); NET.vx = (NET.vx || 0) + (((walk.x - (NET.px ?? walk.x)) / Math.max(dt, 1e-3)) - (NET.vx || 0)) * kv; NET.vz = (NET.vz || 0) + (((walk.z - (NET.pz ?? walk.z)) / Math.max(dt, 1e-3)) - (NET.vz || 0)) * kv; NET.px = walk.x; NET.pz = walk.z;
    const toss = walk.jserve && !walk.jserve.hit ? walk.jserve.ball : walk.serve && !walk.serve.hit ? walk.serve.ball : null;   // 正在拋球發球
    let bp = null; if (walk.hold || toss) { const v = new THREE.Vector3(); (toss || walk.hold).getWorldPosition(v); bp = v.toArray().map((q) => +q.toFixed(2)); }
    const st = { tm: +(now / 1000).toFixed(2), sta: staGame() ? +STA.v.toFixed(2) : undefined, x: +walk.x.toFixed(2), z: +walk.z.toFixed(2), y: +(window.__rkOn ? RK.P[RK.my].jy || 0 : Math.max(0, camera.position.y - EYE)).toFixed(2), yaw: +walk.yaw.toFixed(3), p: myPoseCode(), n: NET.name, tt: myTitle() || undefined, c: NET.color, ch: myChar() || 'none', b: bp, bs: walk.air && walk.air.block && walk.blkShift ? +walk.blkShift.toFixed(2) : undefined, rk: window.__rkOn ? RK.k : undefined, ai: window.__rkOn ? rkAiState() : undefined, vx: +NET.vx.toFixed(2), vz: +NET.vz.toFixed(2), jp: NET.jp || undefined };
    // 2 對 2 的主機：比分、階段、AI 位置一起放在自己的狀態裡送（不另外送）；有事（得分、換發球、觸球數變了）馬上送
    if (VM.on && VM.host) { st.vm = vmStatePayload(); if (NET.vmPend) { Object.assign(st.vm, NET.vmPend); NET.vmPend = null; } }
    const L = NET.lastSent, poseChanged = !L || st.p !== L.p, moved = !L || JSON.stringify(st.ai) !== JSON.stringify(L.ai) || Math.hypot(st.x - L.x, st.z - L.z) > 0.05 || Math.hypot(st.vx - L.vx, st.vz - L.vz) > 0.4 || Math.abs(st.yaw - L.yaw) > 0.07 || Math.abs(st.y - L.y) > 0.05 || !!st.b !== !!L.b || (VM.on && VM.host);
    // 球衣（比賽以外）：換了衣服、或每 4 秒才帶一次（新進來的人也拿得到），平常不帶，訊息比較小
    if (!VM.on) { const wv = myWornForNet(now), wk = JSON.stringify(wv); if (wk !== NET.tjKey || now - (NET.tjAt || 0) > 4000) st.tj = wv; }
    if (toss) st.ts = 1;   // 拋球中：主機知道你正在發，不會在拋球途中判 8 秒
    const rally = VM.on && VM.phase === 'rally';
    const fast = netFast();
    const gap = fast ? (toss ? 66 : document.hidden ? 10000 : rally ? (moved ? 66 : 300) : moved ? 100 : 1000) : toss ? 80 : VM.on && VM.host ? (document.hidden ? 10000 : rally ? 150 : 400) * NETQ.slow :(document.hidden ? 10000 : rally ? (moved ? 150 : 600) : moved ? 330 : 2000) * NETQ.slow;
    if (NET.forceSt || (poseChanged && now - NET.lastSt > (fast ? 60 : 120)) || now - NET.lastSt > gap) { NET.forceSt = false; NET.lastSt = now; NET.lastSent = st; NET.tx.publish('st', st); if ('tj' in st) { NET.tjKey = JSON.stringify(st.tj); NET.tjAt = now; } }
    // 我負責的球：擊球那一下已經送了（位置＋速度，大家各自算物理）；飛行中每秒校正 1 次就好
    const rb = !VM.wire && NET.ownBall && balls.find((q) => q.room);
    if (rb && rb.rest < 0.5 && now - NET.lastBall > (VM.on && VM.phase === 'rally' ? 400 : 1000) * NETQ.slow) { NET.lastBall = now; NET.tx.publish('ball', netBallMsg(rb)); }
    // 對方的人形：緩衝位置與朝向；起跳、動作維持現在時間。
    const k = 1 - Math.exp(-dt * 14);
    for (const p2 of NET.peers.values()) {
      refreshPeerAppearance(p2);
      const Ls = p2.last; if (!Ls) continue;
      const ox = p2.x, oz = p2.z;
      p2.keyPose = null;
      const [x, z, yaw, y] = netPeerPlayback(p2, dt, now);
      p2.vx = (x - ox) / Math.max(dt, 1e-3); p2.vz = (z - oz) / Math.max(dt, 1e-3);
      const sp = Math.hypot(p2.vx, p2.vz);
      p2.x = x; p2.z = z; p2.y = y; p2.yaw = yaw;
      sqFromMotion(p2, x, z, y, dt);   /* WEB-023：別的真人的腳步聲 */
      const av = p2.av; av.g.position.set(x, 0, z); av.g.rotation.y = yaw + Math.PI; av.body.position.y = y;
      // 走路：速度越快腿擺越大；空中時兩腳收起
      av.phase += dt * Math.min(12, sp * 5.5);
      // 手臂：0 一般（跟著走路擺）、1 拿球、2 舉球（兩手高舉）、3 墊球（兩手併攏往前下）、4 攻擊（右手高舉）、5 跳
      if (p2.rk && p2.racketK !== p2.rk) { if (p2.racket) av.hands[0].remove(p2.racket); p2.racket = makeRacket(p2.rk); av.hands[0].add(p2.racket); p2.racketK = p2.rk; }
      else if (!p2.rk && p2.racket) { av.hands[0].remove(p2.racket); p2.racket = null; p2.racketK = null; }
      // 姿勢代碼換了就從頭做一次那個動作（扣球揮臂、舉球推出去…）
      if (p2.pose !== p2.poseC) { p2.poseC = p2.pose; p2.poseT = 0; } p2.poseT = (p2.poseT || 0) + dt;
      av.fall = p2.pose >= 10 && p2.pose <= 12 ? { a: 1, d: DIVE_D[p2.pose - 10], t: p2.poseT } : null;   // 撲救：整個人往撲的方向倒
      avDrive(av, p2.keyPose || (p2.pose === 9 ? avBlockPose(p2.bs) : avPoseOf(p2.pose, p2.poseT / 0.45)), p2.keyPose ? 1 : Math.min(1, k * 1.3), p2.keyPose ? 0 : sp, y > 0.08);   /* 攔網偏移與關鍵影格姿勢 */
      if (p2.ball && p2.ballT) p2.ball.position.lerp(new THREE.Vector3(...p2.ballT), k);
      if (p2.aiAv && p2.aiT) { const A = p2.aiAv, T = p2.aiT; A.g.position.lerp(new THREE.Vector3(T[0], 0, T[1]), k); A.g.rotation.y = T[2]; avDrive(A, avPoseOf(T[3], 0.5), k, 0); }
    }
  }
  const RP = { on: false, t: 0, playing: true, speed: 1, view: 'cam', A: null, g: null, actors: new Map(), ballsM: new Map(), trails: new Map(), marks: [], hud: null, hudT: 0, recorder: null, chunks: [] };
  function rpDispose(root) {
    if (!root) return;
    const live = new Set(); scene.traverse((o) => { if (o.skeleton) live.add(o.skeleton); if (o.geometry) live.add(o.geometry); for (const m of [].concat(o.material || [])) { live.add(m); for (const k in m) if (m[k] && m[k].isTexture) live.add(m[k]); } });
    const done = new Set(), drop = (x) => { if (x && !live.has(x) && !done.has(x)) { done.add(x); x.dispose(); } };
    root.traverse((o) => { drop(o.skeleton); drop(o.geometry); for (const m of [].concat(o.material || [])) { for (const k in m) if (m[k] && m[k].isTexture) drop(m[k]); drop(m); } });
  }
  function fxDrop(g) { if (g.parent) g.parent.remove(g); rpDispose(g); }
  function hlReset(...a) { return S.hlReset ? S.hlReset(...a) : undefined; }
  function hlOnPoint(...a) { return S.hlOnPoint ? S.hlOnPoint(...a) : undefined; }
  function hlPanelBtn(...a) { return S.hlPanelBtn ? S.hlPanelBtn(...a) : undefined; }
  const zoneDoors = [], mainDoors = [];
  const coarse = () => matchMedia('(pointer: coarse)').matches;
  const locked = () => document.pointerLockElement === renderer.domElement;
  function unlockMouse(...a) { return S.unlockMouse ? S.unlockMouse(...a) : undefined; }
  const RK = { on: false, opt: { lv: 2, to: 11, assist: null, hint: true }, ask: null, peerAsk: null, P: {}, acc: 0 };
  const rkGauss = () => (gameRandom() + gameRandom() + gameRandom() - 1.5) * 1.15;
  function makeRacket(...a) { return S.makeRacket ? S.makeRacket(...a) : undefined; }
  function rkOnNet(...a) { return S.rkOnNet ? S.rkOnNet(...a) : undefined; }
  const STA = { v: 1, lock: false, useT: 0, warnT: 0 };
  const JUMP_G = 8.4;
  const STA_DEF = { sprint: 21, jump: 15.5, jserve: 15.5, block: 11.5, spike: 8, hit: 4, serve: 4, tip: 2.6, set: 2.6, bump: 2, dive: 39, spec: 30, regMove: 5, regStill: 8, regDead: 10 };
  let STA_CFG = { ...STA_DEF };
  const STA_SPEC = { S: ['set', 'tip'], OH: ['spike', 'jump', 'bump', 'dive'], OPP: ['spike', 'jump', 'block'], MB: ['block', 'jump', 'spike'] };
  function staCfg() { return VM.on && !VM.host && VM.stacfg ? VM.stacfg : STA_CFG; }
  function staCost(kind, id) { if (kind === 'overhead') kind = 'bump'; const c = staCfg(), r = VM.on && VM.six && VM.role ? VM.role[id] : null, base = (+c[kind] || 0) / 100 * (VM.on ? 0.7 : 1); return r && (STA_SPEC[r] || []).includes(kind) ? base * (1 - clamp(+c.spec || 0, 0, 90) / 100) : base; }
  function staGame() { return !!(vmIsPractice() || window.__rkOn || VM.on || VB.npc); }
  function staTick(dt) {
    const on = staGame() && !RP.on, el = $('sta');
    if (!on) { STA.v = 1; STA.lock = false; if (el && !el.hidden) el.hidden = true; return; }
    if (performance.now() - STA.useT > 800) {
      const live = window.__rkOn ? RK.phase === 'rally' : VM.on ? VM.phase === 'rally' : true, still = Math.hypot(...(walk.vel || [0, 0])) < 0.5;
      const c = staCfg(), recovery = live ? (still ? c.regStill : c.regMove) : c.regDead;
      STA.v = Math.min(1, STA.v + recovery / 100 * dt * (vmIsPractice() ? 5 : 1));
    }
    if (STA.lock && STA.v >= 0.25) STA.lock = false;
    if (!el) return;
    const staminaLabel=el.querySelector('b');if(staminaLabel)staminaLabel.textContent='體力 '+Math.round(STA.v*100)+'%';
    el.hidden = false; el.style.setProperty('--v', STA.v.toFixed(3)); const k = STA.lock ? 'lock' : STA.v < 0.3 ? 'low' : ''; if (el.dataset.k !== k) el.dataset.k = k;
  }
  const VB = { assist: true, target: null, setSpot: null, npc: null, ringLand: null, ringSet: null, ts: 0.7 };
  function vbCourt() { const ct = courtAt(walk.x, walk.z, true); return ct && !ct.c.use ? ct : null; }
  function vbPredict(p, v, y) {
    const a = -4.9, b = v.y, c = p.y - y, d = b * b - 4 * a * c; if (d < 0) return null;
    const t = (-b - Math.sqrt(d)) / (2 * a); return t > 0 ? { t: t / VB.ts, x: p.x + v.x * t, z: p.z + v.z * t } : null;
  }
  function vbMine(b) { b.mine = true; b.mineT = performance.now(); walk.contactUntil = b.mineT + 900; walk.turn = null; }
  const SPIN_AX = new THREE.Vector3();
  function vbLaunch(b, cp, v, kind, q = 1, localReturn = false) {
    const from = b.m.position.clone(); b.acc = null; b.float = null;   // 被碰到：上旋、飄的效果就沒了
    if (from.distanceTo(cp) > 0.2) cp = from.clone().add(cp.clone().sub(from).setLength(0.2));
    for (const c of vbNetCourts()) { const [a0, z0] = toLocalOf(c, from.x, from.z), [a1] = toLocalOf(c, cp.x, cp.z); if (Math.sign(a0) !== Math.sign(a1) && Math.abs(z0) < 5.3) cp = from.clone(); }
    b.thirdReturn = !!(localReturn && vmThird() && (kind === 'bump' || kind === 'set') && vbCourt());
    if (b.thirdReturn) v = vbThirdOverVel(cp, vbCourt(), q);
    b.m.position.copy(cp); b.v.copy(v); b.rest = 0; b.serve = false; b.err = null; b.lk = kind; b.lkNpc = false;
    if (kind !== 'set') b.setFault = null;
    b.spinW = vbSpinFor(b, v, kind, q);
    if (NET.on) netBallHit(b, kind, q);   // 別人收到的是「碰到的位置＋出去的速度」
    b.snap = null;
    vbImpact(b, kind, q); if (typeof touchEvent === 'function') touchEvent(b.m, kind);   // A1（測試只抽出這個函式時沒有 touchEvent）：告訴動畫這一下是誰、什麼動作（下一格鎖定）
  }
  function vbSpinFor(b, v, kind, q) {
    const h = Math.hypot(v.x, v.z) || 1, top = new THREE.Vector3(v.z / h, 0, -v.x / h);   // 水平、跟飛行方向垂直的轉軸：正轉＝上旋
    const rnd = () => new THREE.Vector3(rkGauss(), rkGauss() * 0.5, rkGauss()).normalize();
    if (kind === 'spike') return top.multiplyScalar(40 + 30 * q);   /* 扣球：強上旋，每秒約 6～11 圈（比賽同步後不再自動滾動，轉速要夠才看得出來） */
    if (kind === 'set') { const r = b.setFault === 'double' ? 16 + gameRandom() * 6 : q >= 0.85 ? 0 : (0.85 - q) * 22; return r ? top.multiplyScalar(0.5).add(rnd()).normalize().multiplyScalar(r) : null; }
    if (kind === 'tip') return top.multiplyScalar(-3);
    return top.multiplyScalar(12 + 6 * (1 - q)).add(rnd().multiplyScalar(4 + 6 * (1 - q)));   /* 接球、墊球：每秒約 2～3 圈，接得越差越亂 */
  }
  function vbNetRoll(k) { if (!NET.on) return gameRandom(); const x = Math.sin(NET.hitN * 12.9898 + k * 78.233 + (NET.hitBy || '').length * 3.7) * 43758.5453; return x - Math.floor(x); }
  function vbImpact(...a) { return S.vbImpact ? S.vbImpact(...a) : undefined; }
  const TRAIL = { list: [], max: 160, step: 0.12, tex: null, halo: null, haloR: BALL_R * BALL_VIS * 1.45 };
  function vbTrailDrop(T) {
    for (const m of [T.glow, T.core]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    scene.remove(T.halo); T.halo.material.dispose();
    const i = TRAIL.list.indexOf(T); if (i >= 0) TRAIL.list.splice(i, 1);
  }
  function vbTrailClear() { while (TRAIL.list.length) vbTrailDrop(TRAIL.list[0]); }
  function vbFloorImpact(...a) { return S.vbFloorImpact ? S.vbFloorImpact(...a) : undefined; }
  const SFX = { on: true, ctx: null, floorT: 0, bus: null, noise: null };
  function netBallSound(...a) { return S.netBallSound ? S.netBallSound(...a) : undefined; }
  function sfx(...a) { return S.sfx ? S.sfx(...a) : undefined; }
  const ROLE_SUPER = { OH: { lo: 0.78, hi: 0.86, pw: 1.3, sta: 1.9 }, OPP: { lo: 0.78, hi: 0.86, pw: 1.15, sta: 1.7 } };
  function vbSpikeCamOffset(a, off) {
    const base = walk.pitch - (a.camOff || 0);
    walk.pitch = clamp(base + off, -1.2, 1.1);
    a.camOff = walk.pitch - base;   /* 記錄實際套用量，碰到視角上限也不殘留偏移 */
  }
  function vbClearAir() {
    if (walk.air) vbSpikeCamOffset(walk.air, 0);
    walk.air = null;
  }
  function vbShotVel(p, tx, tz, spd) {
    const V = (T) => new THREE.Vector3((tx - p.x) / T, (BALL_R - p.y) / T + 4.9 * T, (tz - p.z) / T);
    let a = 0.12, b = 4; for (let i = 0; i < 40; i++) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (V(m1).length() < V(m2).length()) b = m2; else a = m1; }
    const Tmin = (a + b) / 2; if (V(Tmin).length() >= spd) return V(Tmin);
    let lo = 0.08, hi = Tmin; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (V(m).length() > spd) lo = m; else hi = m; }
    return V(hi);
  }
  const RECV_CROUCH = { stand: 1.45, crouch: 0.3, crouchMag: 0.5, crouchDy: -0.5, crouchDT: 0.15 };
  function vbHardDefl(vin, q, absorb, vzIn, skill = 1, crouch = null) {
    const ex = clamp((vin - 13) / 14, 0, 1), cm = crouch === true ? RECV_CROUCH.crouch : crouch === false ? RECV_CROUCH.stand : 1;
    if (!ex || gameRandom() > ex * (0.35 + 0.65 * (1 - q)) * (absorb ? 0.65 : 1) * skill * cm) return null;
    const m = (0.6 + 1.4 * ex) * (0.6 + gameRandom() * 0.8) * (crouch === true ? RECV_CROUCH.crouchMag : 1), r = gameRandom();
    if (crouch === true) return r < 0.6 ? { kind: 'side', dx: rkGauss() * 0.3, dz: (Math.sign(vzIn) || (gameRandom() < 0.5 ? -1 : 1)) * m, dy: 0, dT: 0 } : { kind: 'high', dx: m * 0.5, dz: rkGauss() * 0.4, dy: 0.6, dT: 0.2 };   // 蹲著接：偏一點也留在自己場上
    if (r < 0.5) return { kind: 'long', dx: -m * 1.1, dz: rkGauss() * 0.5, dy: -0.3, dT: -0.15 };
    if (r < 0.8) return { kind: 'side', dx: rkGauss() * 0.5, dz: (Math.sign(vzIn) || (gameRandom() < 0.5 ? -1 : 1)) * m * 1.3, dy: 0, dT: 0 };
    return { kind: 'high', dx: m * 0.7, dz: rkGauss() * 0.6, dy: 1.2 + gameRandom() * 0.8, dT: 0.35 };
  }
  function vmThird() { if (!VM.on || VM.phase !== 'rally') return false; const tc = VM.host ? (VM.touch && !VM.touch.serve ? [VM.touch.team, VM.touch.n] : null) : VM.tc; return !!tc && tc[0] === vmTeamOf(vmMe()) && tc[1] >= 2; }
  function vbThirdOverVel(cp, ct, q) {
    const sg = vmSide(vmTeamOf(vmMe())), [lx] = toLocalOf(ct.c, cp.x, cp.z), poor = q < 0.32;
    const dep = clamp(6.5 + rkGauss() * (1 - q), 4, 8.6);
    const z = clamp((gameRandom() - 0.5) * 5 + rkGauss() * (1 - q) * (poor ? 3 : 1), poor ? -6 : -4.1, poor ? 6 : 4.1);
    const [tx, tz] = toWorldOf(ct.c, -sg * dep, z);
    const f = Math.abs(lx) / Math.max(0.001, Math.abs(lx) + dep), clear = NETS[state.net].h + BALL_R + 0.6;
    const T = Math.max(1.55, Math.sqrt(Math.max(0, (clear - cp.y - (BALL_R - cp.y) * f) / Math.max(0.0001, 4.9 * f * (1 - f)))));
    return new THREE.Vector3((tx - cp.x) / T, (BALL_R - cp.y) / T + 4.9 * T, (tz - cp.z) / T);
  }
  function setMenuClose(...a) { return S.setMenuClose ? S.setMenuClose(...a) : undefined; }
  function vbManualSetCancel(...a) { return S.vbManualSetCancel ? S.vbManualSetCancel(...a) : undefined; }
  function vbSpot(ct, n, fromLx, fromLz, v = null) {
    const sg = Math.sign(ct.lx) || 1, sp = n === 2 && v === 'high3' ? { lx: sg * 1.0, lz: 0, y: 2.95 } : n === 2 ? { lx: sg * 0.7, lz: 0, y: 2.85 } : n === 1 ? { lx: sg * 1.0, lz: sg * 3.3, y: 2.95 } : n === 4 ? { lx: sg * 3.6, lz: 0, y: 3.0 } : n === 5 ? { lx: sg * 3.6, lz: -sg * 3.0, y: 3.0 } : n === 7 ? { lx: sg * 3.6, lz: sg * 3.0, y: 3.0 } : { lx: sg * 1.0, lz: -sg * 3.3, y: 2.95 };   // 7＝後排 5 號位（左邊後排，按 6）   // 5＝老3：右邊後排攻擊
    if(v === 'line3')sp.lx=sg*3;
    const d = Math.hypot(sp.lx - fromLx, sp.lz - fromLz);
    sp.T = n === 2 && v !== 'high3' ? clamp(0.22 + d * 0.05, 0.24, 0.4) : v === 'flat' ? clamp(0.58 + d * 0.05, 0.7, 0.95) : clamp(0.75 + d * 0.09, 0.95, 1.3);   // 快攻又低又快；平球（長攻、背）又平又快；高球最高點約 4～4.5 m
    sp.T *= sp.T < 0.45 ? 1.25 : sp.T < 0.98 ? 1.2 : sp.T < 1.4 ? 1.22 : 1.05;   // 舉球弧線拉高（跟 engine/ai.js 的 setArcT 同一組數字）：落點、高度不變，只拉長飛行時間
    return sp;
  }
  function vbSendSet(b, tx, tz, ty, T, n, who, cp, q = 0.9) {
    const p = cp || b.m.position.clone();
    b.spike = null;
    VB.setSpot = { x: tx, z: tz, until: performance.now() + (T / VB.ts) * 1000 + 1500, b }; b.setT = performance.now();
    vbLaunch(b, p, new THREE.Vector3((tx - p.x) / T, (ty - p.y) / T + 4.9 * T, (tz - p.z) / T), 'set', q, true);
    recHit({ x: p.x, y: p.y, z: p.z, v: b.v.length(), kind: 'set' });
    toast(b.thirdReturn ? '第三下：自動送回對面' : `${who}${['', '舉到 4 號位', '快攻（中間）', '舉到 2 號位', '舉到後排中間', '老3（右邊後排）', '3 號位高球', '後排 5 號位（左邊後排）'][n] || ''}：跑到黃圈、起跳、按左鍵`, 1800);
  }
  function vbMarkSet(b) { b.setT = performance.now(); const pr = vbPredict(b.m.position, b.v, 2.9); if (pr) VB.setSpot = { x: pr.x, z: pr.z, until: performance.now() + pr.t * 1000 + 1500, b }; }
  function vbBlockTest(b, h) {
    const BLOCK_HALF = 0.72;   // 攔網雙手中心往左右各算多寬（2026-11-19 使用者：寬一點點，0.62 → 0.72）
    if (b.langzi && VM.on) return; /* WEB-022 裝飾球不觸發攔網。 */
    if (!walk.air || !walk.air.block || (b.mine && performance.now() - b.mineT < 300)) return;
    const ct = vbCourt(); if (!ct || Math.abs(ct.lx) > 1.3) return;
    const sg = Math.sign(ct.lx) || 1, p = b.m.position, [lx, lz] = toLocalOf(ct.c, p.x, p.z), [l0] = toLocalOf(ct.c, p.x - b.v.x * h, p.z - b.v.z * h), plane = sg * 0.12;
    if (!((l0 - plane) * (lx - plane) <= 0 && (lx - l0) * sg > 0)) return;
    const sh = walk.blkShift || 0, [, hz] = toLocalOf(ct.c, walk.x + Math.cos(walk.yaw) * sh, walk.z - Math.sin(walk.yaw) * sh), off = Math.abs(lz - hz), cy = camera.position.y;   // 雙手的中心：跟著滑鼠往左右移
    const top = cy + 0.95, netH = NETS[state.net].h;
    if (off > BLOCK_HALF + BALL_R || p.y > top + BALL_R || p.y < cy + 0.2) return;   // 從手上面過去＝被打過手（攻擊手跳得比你高、或你跳早跳晚了）
    const r = (ct.c.rot * Math.PI) / 180, pow = clamp((b.v.length() - 8) / 18, 0, 1), low = clamp((top - p.y) / Math.max(0.3, top - netH), 0, 1);
    const kind = vbBlockOutcome(off * 0.75 / BLOCK_HALF, low, pow, 0.8);   // 你的手寬 BLOCK_HALF：換算成 0.75 m 的比例
    const word = vbBlockApply(b, kind, lx, lz, hz, plane, sg, Math.sin(r), Math.cos(r), Math.cos(r), -Math.sin(r), pow);
    tutEv('block', { kind, aim: walk.blkAim || 0, mate: TUT_COACH.together() }, b);
    vbFx(b, kind === 'stuff' ? 1 : 0.7); vbImpact(b, 'block', (kind === 'stuff' ? 1 : kind === 'through' ? 0.3 : 0.7)); vbBlockFx(p.clone(), word === '碰手了！' ? 'touch' : BLK_FX[kind]);
    toast({ stuff: '攔網成功！🧱', soft: '撐到球了（球留在你這邊，快接起來）', through: '被打穿了', top: '球擦過指尖彈大了' }[kind] || (word === '打手出界！' ? '被打手出界了' : '碰到手了（球留在你這邊）'), 1500);
    b.spike = null; vbMine(b);
    if (NET.on) netBallHit(b, 'block', (kind === 'stuff' ? 1 : kind === 'through' ? 0.3 : 0.7));
    vmOnTouch(b, vmMe(), 'block');
    recHit({ x: p.x, y: p.y, z: p.z, v: b.v.length(), kind: 'block' });
  }
  function sqFromMotion(...a) { return S.sqFromMotion ? S.sqFromMotion(...a) : undefined; }
  function ballWaitFloor(b) {
    if (b.floorReport || !b.room || NET.ownBall || performance.now() - b.waitFloor.t > 500) {
      if (!b.floorReport && b.room && !NET.ownBall) { const v0 = b.waitFloor.v; b.v.set(v0.x * 0.88, Math.max(0, -v0.y * 0.62), v0.z * 0.88); if (b.v.y < 0.5) b.v.y = 0; }
      b.waitFloor = null; return false;
    }
    return true;
  }
  function vbNpcToggle(...a) { return S.vbNpcToggle ? S.vbNpcToggle(...a) : undefined; }
  const MREC = { id: '', t0: 0, pf: {}, blkR: {}, last: null, cbF: [false, false], cb: [0, 0], local: { p: 0, sets: {} } };
  function mrecReset(id) { Object.assign(MREC, { id: id || '', t0: Date.now(), pf: {}, roleTime: {}, roleSnapshot: {}, roleAt: null, tp: [0, 0], blkR: {}, last: null, save: null, cbF: [false, false], cb: [0, 0], local: { p: 0, sets: {} } }); if (typeof hlReset === 'function') hlReset(); }
  function mrecRoles() {
    if (!MREC.id || !VM.host || !VM.six || VM.team?.[0]?.length !== 6) return;
    const now = performance.now();
    if (MREC.roleAt !== null) for (const [id, role] of Object.entries(MREC.roleSnapshot)) {
      if (!['OH', 'S', 'MB', 'OPP'].includes(role)) continue;
      const times = MREC.roleTime[id] || (MREC.roleTime[id] = {});
      times[role] = (times[role] || 0) + Math.max(0, now - MREC.roleAt);
    }
    MREC.roleSnapshot = { ...VM.role }; MREC.roleAt = now;
  }
  function mrecLongestRoles() {
    mrecRoles();
    const roles = {};
    for (const [id, times] of Object.entries(MREC.roleTime)) {
      roles[id] = Object.keys(times).reduce((best, role) => times[role] > times[best] ? role : best);
    }
    return roles;
  }
  const mrecPf = (id) => MREC.pf[id] || (MREC.pf[id] = { k: 0, kc: 0, b: 0, a: 0, e: 0, kl: 0, ks: 0, fs: 0, md: 0, qk: 0, ss: 0, as: 0, t: 0, sp: 0, sv: 0, rc: 0, st: 0, bt: 0, eb: 0, es: 0, wall: false });
  function vmPerfTouch(id, kind, b) {   // 房主：每次有效觸球
    VM.hlLast = { id, kind, team: vmTeamOf(id) };   // 得分精華：誰最後碰球（練習也要記，所以放在戰績判斷前面）
    if (!MREC.id) return;
    const prev = MREC.last, team = vmTeamOf(id), P = mrecPf(id);
    P.t++; if (['spike', 'tip', 'hit'].includes(kind)) P.sp++; else if (kind === 'serve') P.sv++; else if (kind === 'bump') P.rc++; else if (kind === 'set') P.st++; else if (kind === 'block') P.bt++;
    if (MREC.save && MREC.save.id !== id) mrecPf(MREC.save.id).fs++;   // 救起來的球有人再碰到＝救球成功
    MREC.save = null;
    MREC.last = { id, kind, team, role: VM.six ? VM.role?.[id] : null, t: performance.now() };
    if (kind === 'spike' && prev && prev.kind === 'set' && prev.team === team && MREC.last.t - prev.t < 700) MREC.last.quick = true;
    if ((kind === 'spike' || kind === 'tip') && prev && prev.kind === 'set' && prev.team === team && prev.id !== id) MREC.last.setBy = prev.id;   // 這球是誰舉的（請享用吧！）   // 快攻：舉球到扣球不到 0.7 秒
    if (kind === 'tip' && VM.touch && VM.touch.team === team && VM.touch.n === 1) MREC.last.dump = true;   // 第二下就吊過去＝二次進攻
    if (kind === 'spike' && VM.touch && VM.touch.team === team && VM.touch.n === 1) MREC.last.self = true;   // 第二下就自己扣＝我自己來好了
    // 救回場外球：球在場外 2 m 以外，而且是被打飛出去的（前一下是自己隊碰的，或攔網碰出來的 touch out）
    if (b && VM.c && ['bump', 'set', 'hit'].includes(kind) && prev && (prev.team === team || prev.kind === 'block')) { const B = vmBallL(b); if (Math.abs(B.x) > 11 || Math.abs(B.z) > 6.5) MREC.save = { id, team }; }
    if (kind === 'spike') { const q = vmPos(id); MREC.last.az = q ? q.z : null; }   // 扣球時攻擊手站的左右位置（判斷直線）
    if (kind === 'block') { MREC.blkR[id] = (MREC.blkR[id] || 0) + 1; if (MREC.blkR[id] >= 10) mrecPf(id).wall = true;   /* 禁止通行：同一球內攔網碰到 10 次 */ }
  }
  function vmPerfPoint(win) {   // 房主：得分歸給誰（最後碰球的人）；順便記絕處逢生
    const L = MREC.last; MREC.blkR = {}; MREC.last = null;
    if (MREC.save) { if (win === MREC.save.team) mrecPf(MREC.save.id).fs++; MREC.save = null; }   // 救起來後直接得分也算；救起來直接失分不算
    if (MREC.id) {   // 絕處逢生：對方到局末點（例：24）、我方還在 to−5 以下（例：20），最後這局是我方拿下
      const sc = [VM.sc[0] + (win === 0 ? 1 : 0), VM.sc[1] + (win === 1 ? 1 : 0)], deciding = VM.bestOf > 1 && (VM.sets?.[0] || 0) + (VM.sets?.[1] || 0) === VM.bestOf - 1, to = deciding ? (VM.six ? 15 : Math.min(15, VM.to)) : VM.to;
      for (const t of [0, 1]) for (const now of [VM.sc, sc]) if (now[1 - t] >= to - 1 && now[t] <= to - 5) MREC.cbF[t] = true;   /* 得分前、後的比分都看（例：20:24 這一刻） */
      if (Math.max(...sc) >= to && Math.abs(sc[0] - sc[1]) >= 2) { const w = sc[0] > sc[1] ? 0 : 1; if (MREC.cbF[w]) MREC.cb[w]++; MREC.cbF = [false, false]; }
    }
    if (MREC.id) MREC.tp[win] = (MREC.tp[win] || 0) + 1;
    if (!MREC.id || !L || L.team < 0) return;
    if (L.team === win) {
      if (L.kind === 'serve') mrecPf(L.id).a++; else if (L.kind === 'block') mrecPf(L.id).b++; else if (['spike', 'tip', 'hit'].includes(L.kind)) mrecPf(L.id).k++;
      if (L.kind === 'spike' && !L.quick && !L.self && L.role === 'OH') mrecPf(L.id).kc++;
      if (L.dump) mrecPf(L.id).md++;   // 二次進攻吊球得分
      if (L.quick) mrecPf(L.id).qk++;
      if (L.self) mrecPf(L.id).ss++;
      if (L.setBy) mrecPf(L.setBy).as++;   // 舉球助攻：攻擊手得分，舉球員記一顆   // 快攻直接落地得分（最後一下就是扣球，中間沒被攔網碰到）
      if (L.kind === 'spike' && VM.ball && VM.c) {   // 落點（球場座標）：直線＝攻擊手靠邊線、球沿同一條邊線下去；三米內＝落在對方三米線以內
        const B = vmBallL(VM.ball); if (L.az != null && Math.abs(L.az) > 2.2 && Math.abs(B.z - L.az) < 1.0 && Math.sign(B.z) === Math.sign(L.az)) mrecPf(L.id).kl++;
        if (Math.abs(B.x) < 3) mrecPf(L.id).ks++;
      }
    }
    else { mrecPf(L.id).e++; if (L.kind === 'bump') mrecPf(L.id).eb++; else if (L.kind === 'serve') mrecPf(L.id).es++; }
  }
  function vmRateMatch() {
    const cl = (v) => Math.max(0, Math.min(100, v)), out = {};
    const score = VM.six || VM.bestOf > 1 ? VM.sets : VM.sc, total = (MREC.tp?.[0] || 0) + (MREC.tp?.[1] || 0);
    if (!Array.isArray(score) || score.length !== 2 || !score.every(Number.isFinite) || score.some((v) => v < 0) || score[0] + score[1] <= 0 || total <= 0) return { rate: out, mvp: null, bestLoser: null };
    const winner = score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1;
    const average = total / Math.max(1, VM.team.reduce((sum, ids) => sum + ids.filter(Boolean).length, 0));
    for (const t of [0, 1]) {
      const ids = (VM.team[t] || []).filter(Boolean), n = Math.max(1, ids.length), share = (MREC.tp[t] || 0) / total;
      const setBonus = winner >= 0 && t !== winner && score === VM.sets && score[winner] > 1 ? 24 * Math.min(score[t], score[winner] - 1) / (score[winner] - 1) : 0;   // 多局輸了但有贏局：補一點（三戰兩勝輸 1:2 補 24、五戰三勝輸 1:3 補 12、2:3 補 24），還是比贏的一隊低
      const result = winner < 0 ? 50 : t === winner ? Math.max(65, Math.min(100, 65 + (share - 0.5) * 140)) : Math.min(60, Math.max(0, Math.min(45, 45 - (0.5 - share) * 150)) + setBonus);
      const touches = ids.reduce((sum, id) => sum + (mrecPf(id).t || 0), 0) || 1;
      for (const id of ids) {
        const P = mrecPf(id), pts = P.k + P.b + P.a;
        const contrib = cl(((pts + P.as * 0.5 + P.fs + Math.max(0, P.rc - P.eb) * 0.2) / average) * 50);   /* 跟全場每人平均一樣＝50，兩倍＝100 */
        const eff = P.t ? cl(100 * (1 - (2.5 * P.e) / P.t)) : 0;   /* 失誤直接送對手一分 */
        const part = cl((P.t / (touches / n)) * 50);   // 碰球次數跟隊上平均一樣＝50
        const main = [['st', P.st], ['rc', P.rc], ['sp', P.sp], ['bt', P.bt]].sort((x, y) => y[1] - x[1])[0];   // 這場主要在做什麼
        const role = !main[1] ? 50 : main[0] === 'st' ? cl((P.as / P.st) * 200) : main[0] === 'rc' ? cl((1 - P.eb / P.rc) * 100) : main[0] === 'sp' ? cl((P.k / P.sp) * 160) : cl((P.b / P.bt) * 200);
        const rt = Math.round(0.30 * contrib + 0.20 * eff + 0.15 * part + 0.20 * role + 0.15 * result);
        // 戰力六角圖：攻擊、攔網、發球、接球、舉球、穩定（各 0～100）
        const hx = [P.sp ? cl((P.k / P.sp) * 110 + Math.min(P.k, 12) * 3.5) : 0, cl(P.b * 22 + P.bt * 4), P.sv ? cl((1 - P.es / P.sv) * 65 + P.a * 15) : 0,
          P.rc ? cl((1 - P.eb / P.rc) * 65 + Math.min(P.rc, 20) * 1.75 + P.fs * 8) : 0, P.st ? cl((P.as / P.st) * 130 + Math.min(P.st, 25) * 1.4) : 0, P.t ? Math.round(cl(100 * (1 - (1.5 * P.e) / P.t))) : 0].map((v) => Math.round(v));
        out[id] = { rt, gr: rt >= 90 ? 'S' : rt >= 75 ? 'A' : rt >= 60 ? 'B' : rt >= 40 ? 'C' : 'D', c: Math.round(contrib), f: Math.round(eff), p: Math.round(part), r: Math.round(role), w: Math.round(result), m: main[1] ? main[0] : '', hx };
      }
    }
    const best = (t) => (VM.team[t] || []).filter((id) => out[id]).reduce((id, next) => !id || out[next].rt > out[id].rt ? next : id, null);
    return { rate: out, mvp: winner < 0 ? null : best(winner), bestLoser: winner < 0 ? null : best(1 - winner) };
  }
  function vmSendResult() {   // 房主：比賽結束，把結果送給大家（也給自己）
    if ((NET.me !== 'srv' && (!ROOM || !ROOM.isHost)) || vmIsPractice() || !MREC.id) return;   /* B5：伺服器當房主時由伺服器送 */
    const RT = vmRateMatch();
    if (!Object.keys(RT.rate).length) return;
    const d = { e: 'result', roles: mrecLongestRoles(), rate: RT.rate, mvp: RT.mvp, bestLoser: RT.bestLoser, id: MREC.id, six: !!VM.six, bo: VM.bestOf || 1, sets: VM.sets ? [...VM.sets] : null, setLog: Array.isArray(VM.setLog) ? VM.setLog.map((x) => [...x]) : null, sc: [...VM.sc], team: VM.team, perf: MREC.pf, cb: [...MREC.cb], lv: VM_OPT.lv, human: VM.ai.size === 0, pts: VM.to, sec: Math.round((Date.now() - MREC.t0) / 1000) };
    if (NET.on) NET.tx.publish('vm', d);
    vmGotResult(d); MREC.id = '';
  }
  async function vmGotResult(d) {
    if (!d || typeof d.id !== 'string' || vmIsPractice()) return;
    const me = vmMe(), team = Array.isArray(d.team) ? d.team.findIndex((t) => Array.isArray(t) && t.includes(me)) : -1; if (team < 0) return;   // 觀眾不記
    const multi = (d.six || d.bo > 1) && Array.isArray(d.sets), A = multi ? d.sets : d.sc;   // 有局數（6 對 6、2 對 2 多局）看局數
    if (!Array.isArray(A) || A.length !== 2 || !A.every(Number.isFinite) || A.some((v) => v < 0) || A[0] + A[1] <= 0) return;
    const won = A[team] > A[1 - team], sets = multi ? Math.max(1, d.sets[0] + d.sets[1]) : 1;
    const hp = (d.perf && d.perf[me]) || {}, clean = Object.values(MREC.local.sets).some((x) => x.n >= 10 && !x.f);
    const my = (d.rate && d.rate[me]) || null, mvp = d.mvp === me;
    const perf = { rt: my ? Math.max(0, Math.min(100, my.rt | 0)) : undefined, mvp, k: hp.k | 0, kc: hp.kc | 0, b: hp.b | 0, a: hp.a | 0, e: hp.e | 0, kl: hp.kl | 0, ks: hp.ks | 0, fs: hp.fs | 0, md: hp.md | 0, qk: hp.qk | 0, ss: hp.ss | 0, as: hp.as | 0, wall: !!hp.wall, p: MREC.local.p, clean, cb: Array.isArray(d.cb) ? d.cb[team] | 0 : 0 };
    if (MREC.local.lk > 0) perf.lk = MREC.local.lk;
    if (d.six && d.team.every(ids => ids.length === 6) && ['OH', 'S', 'MB', 'OPP'].includes(d.roles?.[me])) perf.role = d.roles[me];
    MREC.local = { p: 0, sets: {} };
    const MR = my ? await import('./js/match-result.js').catch(() => null) : null;   // 結算面板（等級、六角圖、長條圖、解說、排名）
    if (MR) { try { MR.showMatchResult({ won, final: multi ? `局數 ${d.sets[0]}：${d.sets[1]}${Array.isArray(d.setLog) && d.setLog.length > 1 ? `（${d.setLog.filter((x) => Array.isArray(x) && x.length === 2).map((x) => x.join(':')).join('、')}）` : ''}` : `${d.sc[0]}：${d.sc[1]}`, my, isMvp: mvp, rate: d.rate, mvp: d.mvp, bestLoser: d.bestLoser, teams: d.team, myTeam: team, me, nameOf: vmName, teamLabel: vmTeamLabel, st: { k: hp.k | 0, b: hp.b | 0, a: hp.a | 0, as: hp.as | 0, rc: hp.rc | 0, fs: hp.fs | 0, t: hp.t | 0, e: hp.e | 0, sp: hp.sp | 0, bt: hp.bt | 0, sv: hp.sv | 0, es: hp.es | 0, eb: hp.eb | 0, st: hp.st | 0 } }); unlockMouse(); vmResultHlBtn(); } catch (x) { console.warn('結算面板', x); } }
    try {
      const { recordMatch, ACHIEVEMENTS, cachedProgress, EXP_PER_LEVEL } = await import('./js/progress.js');
      const r = await recordMatch({ id: d.id, level: [3, 4, 5].includes(d.lv) ? d.lv : 3, human: !!d.human, won, sets, points: [15, 20, 25].includes(d.pts) ? d.pts : 25, seconds: clamp(d.sec | 0, 60, 4 * 3600), perf });
      if (MR) { if (!r) MR.setMatchReward(null); else if (r.dup) MR.setMatchRewardError('這場已經記過了'); else MR.setMatchReward(r, cachedProgress(), EXP_PER_LEVEL); }
      if (!r || r.dup) return;
      if (!MR) toast(`${won ? '🏆 贏了！' : '比賽結束'}${my ? `　評分 ${my.gr}・${my.rt}` : ''}${mvp ? '　⭐MVP' : ''}　+${r.exp} 經驗　+${r.coins} 金幣${r.levelUp ? `　⬆ 升到 Lv${r.level}！` : ''}`, 5200);
      (r.new || []).forEach((k, i) => setTimeout(() => toast(`🎖 解鎖成就「${ACHIEVEMENTS[k]?.name || k}」・可以套用稱號「${ACHIEVEMENTS[k]?.title || ''}」`, 3600), 4400 + i * 3800));
    } catch (e) { if (MR) MR.setMatchRewardError((e && e.message) || '戰績記錄失敗'); toast((e && e.message) || '戰績記錄失敗', 2600); }
  }
  function vmResultHlBtn(...a) { return S.vmResultHlBtn ? S.vmResultHlBtn(...a) : undefined; }
  function vbFx(...a) { return S.vbFx ? S.vbFx(...a) : undefined; }
  function rkAiState(...a) { return S.rkAiState ? S.rkAiState(...a) : undefined; }
  function rkPeerAi(...a) { return S.rkPeerAi ? S.rkPeerAi(...a) : undefined; }
  const VM = { on: false, host: false, c: null, sg: 1, to: 7, sc: [0, 0], phase: 'idle', srvTeam: 0, srvIdx: [0, 0], team: [[], []], ai: new Map(), ball: null, touch: { team: -1, n: 0, last: null }, poss: [null, null], t: 0, next: null, sendT: 0, srvSeq: 0, names: {} };
  const VM_LEVELS = {
    1: { name: '新手', speed: 4.2, react: 0.28, passErr: 0.6, setErr: 0.33, spike: [14, 19], out: 0.09, net: 0.05, tip: 0.25, miss: 0.2, block: 0.55, blockSkill: 0.5, judge: 0.6, serve: { jump: 0.05, jfloat: 0.05, float: 0.3 }, sweet: 0.1, flat: 0.1 },
    2: { name: '球友', speed: 4.7, react: 0.2, passErr: 0.4, setErr: 0.21, spike: [17, 23], out: 0.055, net: 0.035, tip: 0.22, miss: 0.11, block: 0.8, blockSkill: 0.68, judge: 0.35, serve: { jump: 0.2, jfloat: 0.25, float: 0.3 }, sweet: 0.25, flat: 0.2 },
    3: { name: '高手', speed: 5.2, react: 0.13, passErr: 0.25, setErr: 0.13, spike: [20, 26], out: 0.03, net: 0.018, tip: 0.2, miss: 0.06, block: 0.95, blockSkill: 0.85, judge: 0.18, serve: { jump: 0.35, jfloat: 0.35, float: 0.2 }, sweet: 0.45, flat: 0.35 },
    4: { name: '校隊', speed: 5.6, react: 0.09, passErr: 0.16, setErr: 0.085, spike: [23, 28.5], out: 0.017, net: 0.009, tip: 0.18, miss: 0.03, block: 1, blockSkill: 0.95, judge: 0.09, serve: { jump: 0.45, jfloat: 0.4, float: 0.1 }, sweet: 0.65, flat: 0.45 },
    5: { name: '企聯', pro: true, speed: 6.1, react: 0.06, passErr: 0.08, setErr: 0.045, spike: [26, 31], out: 0.006, net: 0.003, tip: 0.2, miss: 0.01, block: 1, blockSkill: 1, judge: 0.04, serve: { jump: 0.55, jfloat: 0.35, float: 0.05 }, sweet: 0.8, flat: 0.55 },   /* 寫在表裡面：伺服器版比賽核心只抄宣告，以前另外一行 VM_LEVELS[5] = … 沒被抄過去，伺服器裁判的企聯其實是球友強度 */
  };
  function vmLevelAt(lv) {
    if (!Number.isFinite(lv) || lv < 0.5 || lv > 5) return null;
    if (VM_LEVELS[lv]) return VM_LEVELS[lv];
    const lo = Math.max(1, Math.min(4, Math.floor(lv))), A = VM_LEVELS[lo], B = VM_LEVELS[lo + 1], k = lv - lo;
    const mix = (a, b) => (typeof a === 'number' ? Math.max(0, a + (b - a) * k) : Array.isArray(a) ? a.map((x, i) => mix(x, b[i])) : a && typeof a === 'object' ? Object.fromEntries(Object.keys(a).map((q) => [q, mix(a[q], b[q] ?? a[q])])) : a);
    const L = mix(A, B); L.name = VM_LEVELS[Math.max(1, Math.min(5, Math.round(lv)))].name; delete L.pro;
    return (VM_LEVELS[lv] = L);
  }
  const VM_ROOM_LV = [5, 4, 3];
  function vmApplyRoomRules(rules) {
    mrecReset(vmIsPractice() ? '' : `${NET.room || 'room'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);   // WEB-010：房主開賽＝新的比賽代碼
    VM.langziMatch = MREC.id; /* WEB-022 比賽識別。 */
    VM_OPT.lv = vmLvChoices().includes(rules.lv) ? rules.lv : vmLevelAt(rules.lv) ? rules.lv : 3; VM_OPT.to = VM_OPT.to6 = [15, 20, 25].includes(rules.to) ? rules.to : 25; VM_OPT.sets = VM_OPT.sets2 = [1, 3, 5].includes(rules.bestOf) ? rules.bestOf : 1; }
  const practiceRoom = new URLSearchParams(location.search).has('practice');
  function vmIsPractice() { return practiceRoom; }
  const vmLvChoices = () => (vmIsPractice() ? [1, 2, 3, 4, 5] : VM_ROOM_LV);
  const VM_OPT = { to: 7, lv: 2, mate: 3, mode: '2', role: 'OH', sets: 3, to6: 25 };
  const vmLv = (a) => VM_LEVELS[VM_OPT.lv] || VM_LEVELS[2];
  const vmPro = (a) => !!vmLv(a).pro;
  const vmProLv = () => !!VM_LEVELS[VM_OPT.lv]?.pro;
  const vmMe = () => (NET.on ? NET.me : 'me');
  const vmL = (x, z) => toLocalOf(VM.c, x, z);
  const vmW = (lx, lz) => toWorldOf(VM.c, lx, lz);
  const vmSide = (team) => (team === 0 ? VM.sg : -VM.sg);
  function vmTeamOf(id) { return VM.team[0].includes(id) ? 0 : VM.team[1].includes(id) ? 1 : -1; }
  function vmBallL(b) { const [lx, lz] = vmL(b.m.position.x, b.m.position.z), r = (VM.c.rot * Math.PI) / 180; return { x: lx, y: b.m.position.y, z: lz, vx: b.v.x * Math.cos(r) - b.v.z * Math.sin(r), vy: b.v.y, vz: b.v.x * Math.sin(r) + b.v.z * Math.cos(r) }; }
  function vmPredL(B, y) { const a = -4.9, d = B.vy * B.vy - 4 * a * (B.y - y); if (d < 0) return null; const t = (-B.vy - Math.sqrt(d)) / (2 * a); return t > 0 ? { t: t / VB.ts, x: B.x + B.vx * t, z: B.z + B.vz * t } : null; }
  function vmPos(id) {
    if (VM.ai.has(id)) { const a = VM.ai.get(id); return { x: a.x, z: a.z }; }
    if (id === vmMe()) { const [x, z] = vmL(walk.x, walk.z); return { x, z }; }
    const p2 = NET.peers.get(id); if (p2) { const [x, z] = vmL(p2.x, p2.z); return { x, z }; }
    return null;
  }
  const vmName = (id) => (id === vmMe() ? '你' : VM.names[id] || (NET.peers.get(id) || {}).n || '隊友');
  function vmStart(c, sg, mateId, opps = [], seats = null) {
    globalThis.VBTutorial?.stop();
    if (VM.npc || VB.npc) vbNpcToggle();
    vmStop(true);
    STA.v = 1; STA.lock = false;
    Object.assign(VM, { on: true, host: true, srvDone: false, six: false, c, sg, to: VM_OPT.to, bestOf: VM_OPT.sets2 || 1, sets: [0, 0], setLog: [], setNo: 1, firstSrv: 0, sc: [0, 0], call: null, phase: 'idle', srvTeam: 0, srvIdx: [0, 0], ball: null, touch: { team: -1, n: 0, last: null }, poss: [null, null], t: 0, next: null, srvSeq: 0, names: {} });
    VM.team = [[vmMe(), mateId || 'aiT'], [opps[0] || 'ai1', opps[1] || 'ai2']];
    const used = new Set([myChar()]); VM.role = {}; VM.chars = {};
    for (const id of ['aiT', 'ai1', 'ai2']) VM.chars[id] = vmPickChar(used);
    if (!mateId) vmMkAi('aiT', 0, 'AI 隊友', '#30A46C', VM.chars.aiT);
    if (!opps[0]) vmMkAi('ai1', 1, 'AI 對手', '#E5484D', VM.chars.ai1); if (!opps[1]) vmMkAi('ai2', 1, 'AI 對手', '#F76B15', VM.chars.ai2);
    for (const id of [mateId, ...opps]) if (id) VM.names[id] = (NET.peers.get(id) || {}).n || '球友';
    if (seats) {
      for (const a of VM.ai.values()) { if (typeof fxDrop === 'function') fxDrop(a.av.g); else scene.remove(a.av.g); a.tag.element.remove(); } VM.ai.clear(); VM.names = {};
      VM.team = seats.map((row,t) => row.map((id,k) => id || `ai${t}${k}`));
      for (const t of [0,1]) for (const [k,id] of VM.team[t].entries()) {
        if (/^ai/.test(id)) vmMkAi(id,t,'AI',t===0?'#30A46C':'#E5484D',null);
        else VM.names[id] = id === vmMe() ? NET.name : NET.peers.get(id)?.n || '球友';
        const a = VM.ai.get(id); if (a) { const sd = sg*(t===0?1:-1); a.x = sd*6; a.z = sd*(k===0?2.1:-2.1); }   /* 1 號位＝面向網子的左手邊（跟選位畫面、真人開場站位一樣；以前左隊的 AI 左右顛倒，會跑去站真人的位置） */
      }
    }
    VM.startData = { e: 'start', ts: VB.ts, c: c.id, sg, team: VM.team, names: { ...VM.names, [vmMe()]: NET.name }, chars: VM.chars, to: VM.to, cw: [c.x, c.z, c.rot], stacfg: STA_CFG };
    if (NET.on && globalThis.VBMatchSync) vmWireInit(true);
    if (NET.on) NET.tx.publish('vm', VM.startData);
    $('rk-menu').hidden = true; $('vm-hud').hidden = false; $('walk-ui').classList.add('vm');
    vmSetupServe();
    toast(`2 對 2 開始！先到 ${VM.to} 分・對手：${opps.length ? VM.team[1].map(vmName).join('＋') : 'AI（' + VM_LEVELS[VM_OPT.lv].name + '）'}`, 2400);
  }
  function vmPickChar(used) {
    const code = aiLook(used.size); used.add(code); return code;
  }
  function vmMkAi(id, team, name, color, ch) {
    ch = aiLook(id); VM.chars[id] = ch;
    const av = makeAvatar(color, ch, team), el = document.createElement('div'); el.className = 'mp-tag'; el.textContent = name;
    const tag = new CSS2DObject(el); tag.position.set(0, 2.05, 0); av.g.add(tag); scene.add(av.g);
    const side = vmSide(team), a = { id, team, name, color, ch, av, tag, x: side * 6, z: id === 'ai2' ? -2 : 2, vx: 0, vz: 0, y: 0, vy: 0, pose: 0, swingT: 0, reactAt: 0, tx: side * 6, tz: 0 };
    VM.ai.set(id, a); VM.names[id] = name; return a;
  }
  function vmStop(...a) { return S.vmStop ? S.vmStop(...a) : undefined; }
  function vmServer() { const t = VM.srvTeam; return VM.six ? VM.rot[t][0] : VM.team[t][VM.srvIdx[t] % 2]; }
  function vmSetupServe() {
    VM.phase = 'serve'; VM.ball = null; VM.touch = { team: -1, n: 0, last: null }; VM.poss = [null, null]; VM.srvSeq++;
    if (VM.wire) { VM.wire.order.reset(VM.srvSeq); VM.wire.history = []; VM.wire.event = null; VM.wire.dirty = true; }
    vmClearBalls(); if (vmServer() !== vmMe()) vmDropHeld(); vbTrailClear(); VM.whT = performance.now() + 2500; VM.srvDl = VM.whT + 8000; VM.whDone = false; VM.cdN = null;   // 正式規則：裁判吹哨後才能發，8 秒內要發出去
    const srv = vmServer(), s = vmSide(VM.srvTeam);
    VM.serveAt = VM.t + 3.0 + gameRandom() * 1.6;   // AI：吹哨（2.5 秒）後 0.5～2 秒發
    // AI 先站位：發球的人在底線後，其他人在自己半場
    for (const a of VM.ai.values()) {
      const sd = vmSide(a.team); a.blk = null;
      if (VM.six) { const f = vm6Spot(a.team, a.id, 'serve'); a.tx = f.x; a.tz = f.z; if (Math.hypot(a.x - f.x, a.z - f.z) > 5) { a.x = f.x; a.z = f.z; } continue; }   // 6 對 6：發球隊照號位、接發球隊排接發球陣型
      if (a.id === srv) { a.tx = sd * 9.8; a.tz = -sd * 1.0; }
      else if (a.team === VM.srvTeam) { a.tx = sd * 1.5; a.tz = 0; }   // 發球員的隊友：站網前準備攔網（2 對 2 分工）
      else { const k = VM.team[a.team].indexOf(a.id); a.tx = sd * 6.2; a.tz = sd * (k === 0 ? 2.1 : -2.1); }   /* 面向網子的左右：兩隊都一樣 */
    }
    vmSay(`輪到 ${vmName(srv)} 發球${VM.ai.has(srv) ? '' : srv === vmMe() ? '：拿著球按滑鼠左鍵' : ''}`, 'srv', 3200);
    if (VM.six) vm6PlaceHumans(srv);
    if (srv === vmMe()) vmPrepServe(s);
    else if (!VM.ai.has(srv) && NET.on) NET.tx.publish('vm', { e: 'serve', id: srv, seq: VM.srvSeq, s });
    vmBroadcast(true);
  }
  function vmDropHeld() { if (walk.hold) { camera.remove(walk.hold); walk.hold = null; } walk.jserve = null; walk.serve = null; if (skill.mode) { skill.mode = null; $('wk-combo').hidden = true; } }
  function vmClearBalls() { for (const b of balls) ballsGroup.remove(b.m); balls.length = 0; VB.setSpot = null; VB.target = null; }
  function vmServeClock() {
    const now = performance.now(), srv = vmServer();
    if (!VM.whDone && now >= VM.whT) { VM.whDone = true; vmWhistle(); if (NET.on) NET.tx.publish('vm', { e: 'whistle', seq: VM.srvSeq }); }
    if (!VM.whDone || VM.ai.has(srv)) return;
    const p2 = NET.peers.get(srv), busy = srv === vmMe() ? !!(walk.serve || walk.jserve) : !!(p2 && p2.tossing);   // 已經拋球了（自己、或連線的人正在拋）
    if (!busy && now > VM.srvDl + (srv === vmMe() ? 0 : 1500)) { const team = vmTeamOf(srv); VM.phase = 'rally'; VM.touch = { team, n: 3, last: srv, serve: true }; vmDropHeld(); vmPoint(1 - team, `發球超過 8 秒（${vmName(srv)}）`); }
  }
  function vmWhistle() {
    const now = performance.now(); VM.whT = Math.min(VM.whT ?? now, now); VM.srvDl = now + 8000; VM.cdN = null;
    sfx('whistle1', 1);
  }
  function vmPrepServe(s = VM.sg) {
    if (walk.emote?.k === 'langzi') walk.emote = null; /* WEB-022 換發球正常拿球。 */
    if (!VM.host) { VM.phase = 'serve'; VM.srvId = NET.me; VM.whT = Infinity; VM.srvDl = Infinity; }   // 連線：通知先到、狀態後到也沒關係（不會把等一下發出去的球當成上一球清掉）；等主機吹哨
    if (walk.jserve && walk.jserve.ball && !walk.jserve.hit) ballsGroup.remove(walk.jserve.ball);   // 上一個還沒打完的拋球收掉
    walk.jserve = null; walk.serve = null; walk.charge = null; walk.chargeArm = null;
    if (walk.hold) { camera.remove(walk.hold); walk.hold = null; }
    const [x, z] = vmW(s * 9.8, -s * 1.0); walk.x = x; walk.z = z; vbClearAir();
    const [ax, az] = vmW(0, 0); walk.yaw = Math.atan2(-(ax - x), -(az - z)); walk.pitch = 0.05;
    VM.grabOK = true; grabBall(); VM.grabOK = false; toast('輪到你發球：等裁判吹哨，8 秒內發出去。對面紅圈是落點（轉頭調左右、滾輪調深淺）。左鍵站發、右鍵站飄、空白鍵拋球起跳後按住左鍵跳發／右鍵跳飄', 4600);
  }
  function vmAiServe(...a) { return aiEngine().vmAiServe(...a); }
  const FAULT_TEXT = {
    backBlock: n => `後排攔網犯規（${n}在後排）`,
    backAttack: n => `後排攻擊犯規（${n}在後排，要在 3 公尺線後起跳）`,
    serveBlock: n => `攔網發球犯規（${n}攔了發球）`,
    serveAttack: n => `攻擊發球犯規（${n}在前區把高過網的發球直接打回去）`,
    double: n => `連擊（${n} 連續碰兩次）`,
    four: () => '四次擊球（一隊最多碰三次）',
    held: n => `持球（${n}舉球時球在手上停太久）`,
    setDouble: n => `連擊（${n}舉球兩手沒同時碰到）`,
    netReturn: n => `觸網（${n}把對方攻擊過來的球直接扣回去，只能攔網）`,
  };
  function vmOnTouch(b, id, kind) {
    if (b.langzi || kind === 'kick') return; /* WEB-022 裝飾球不計比賽事件。 */
    if (!VM.on || !VM.host) return;
    const team = vmTeamOf(id); if (team < 0 || kind === 'throw') return;
    // 只有比賽球算：發球階段只認輪到的人發出去的那一下；開打之後別顆球（有人手上本來拿著的、場外的）碰到、落地都不算
    if (!touchCounts(VM, id, kind, VM.phase === 'serve' ? vmServer() : null)) return;   /* B2：規則判定在 engine/rules.js */
    if (VM.wire) { VM.wire.dirty = true; if (VM.wire.event) VM.wire.event.actor = id; }
    vmPerfTouch(id, kind, b);   // WEB-010 戰績
    if (VM.phase === 'rally' && VM.ball && balls.includes(VM.ball) && b !== VM.ball) return;
    VM.ball = b; b.spike = null; b.floorHit = null; if (kind !== 'block') b.blkDone = false;
    // 引擎要的事實：後排與否、擊球點高過網沒、起跳點、球離中線多遠（位置都在遊戲這邊算）
    const fact = { team, id, kind, setFault: b.setFault || null };
    if (VM.phase === 'rally') {
      const attack = kind === 'spike' || kind === 'tip' || kind === 'hit';
      fact.aboveNet = attack && b.m.position.y > NETS[state.net].h + BALL_R;   /* 跟以前一樣：只有攻擊才需要看網高、球的位置 */
      if (fact.aboveNet) fact.ballX = vmL(b.m.position.x, b.m.position.z)[0];
      if (VM.six) {
        const k6 = vm6Idx(id); fact.back = vmSmallCount() ? !vm6Front(id) : k6 === 0 || k6 >= 4;
        if (fact.back && attack && fact.aboveNet) {
          const ai = VM.ai.get(id);
          const exact = ai ? ((ai.y > 0 || ai.vy > 0) && ai.jp ? [ai.jp.x, ai.jp.z] : vmW(ai.x, ai.z)) : id === vmMe() ? (walk.air && walk.air.x0 != null ? [walk.air.x0, walk.air.z0] : null) : b.jump0;   // 起跳點（自己的、或連線的人隨擊球訊息送來的）
          const q = exact ? { x: vmL(exact[0], exact[1])[0] } : VM.ai.has(id) ? null : vmPos(id);
          fact.jumpX = q ? q.x : null; fact.exactJump = !!exact;
        }
      }
    }
    const res = judgeTouch(VM, fact);
    if (res.serveStart) {   // 發球那一下：對方要接，自己這隊不能再碰
      VM.poss = [null, null];
      if (VM.six) { const ov = vm6Overlap(); if (ov) vmPoint(1 - ov.team, ov.why); }
      return;
    }
    if (res.ignored) return;
    if (res.setFaultUsed) b.setFault = null;
    if (res.fault) { vmPoint(1 - team, FAULT_TEXT[res.fault](vmName(id))); return; }
    const block = res.block;
    if (block) { VM.poss[team] = null; if (res.sameTeamBlock) return; }
    if (!block && VM.six) {   // 6 對 6：第一球誰接都好，舉球員（他接了就換舉對／前排的人）舉；舉出去的球照落點找攻擊手
      let P = VM.poss[team]; if (!P) P = VM.poss[team] = { stage: 0, passer: id, setter: null, attacker: null };
      if (VM.touch.n === 1) { P.passer = id; P.setter = vm6SetterFor(team, id); P.attacker = null; } else if (VM.touch.n === 2) { P.setter = id; P.attacker = vm6AttackerFor(team, b, id); }
      P.stage = VM.touch.n;
    } else if (!block) {
      const mate = VM.team[team].find((x) => x !== id); let P = VM.poss[team]; if (!P) P = VM.poss[team] = { stage: 0, passer: id, setter: mate, attacker: id };
      if (VM.touch.n === 1) { P.passer = id; P.setter = mate; P.attacker = id; } else if (VM.touch.n === 2) { P.setter = id; P.attacker = mate; }
      P.stage = VM.touch.n;
    }
    if (!block && VM.touch.team === team && VM.touch.n === 1 && kind !== 'spike' && kind !== 'tip' && kind !== 'hit') vmGrade(team, b, id);
    if (NET.on) NET.forceSt = true;
  }
  function vmGrade(team, b, id) {
    const sd = vmSide(team), B = vmBallL(b), p = vmPredL(B, 2.3) || vmPredL(B, 1.0) || vmPredL(B, BALL_R);
    let g = 'C', why = '';
    if (!p || Math.sign(p.x) !== sd) why = '直接回對面';
    else if (Math.abs(p.x) > 9.2 || Math.abs(p.z) > 4.7) why = '出界';
    else { const zz = VM.six ? -0.9 : clamp(p.z / sd, -2, 2), dd = Math.hypot(Math.abs(p.x) - 1.8, p.z / sd - zz); g = dd < 1.2 ? 'A' : dd < 3 ? 'B' : 'C'; }
    const P = VM.poss[team]; if (P) { P.grade = g; P.fix = g === 'C'; }
    VM.grade = { s: (VM.grade ? VM.grade.s : 0) + 1, team, g, why };
    vmGradeShow(VM.grade);
    if (P && g !== 'A' && p && Math.sign(p.x) === sd) vmFixSetter(team, P, p, id);
  }
  function vmGradeShow(...a) { return S.vmGradeShow ? S.vmGradeShow(...a) : undefined; }
  function vmFixSetter(...a) { return aiEngine().vmFixSetter(...a); }
  const HL_GAP = 7.0;
  function vmPoint(win, why) {
    if (VM.phase !== 'rally') return;
    const L = VM.hlLast; VM.hlLast = null;   // 得分精華：最後碰球的是得分這一隊＝他打出這一分；對手失誤送分＝null（不重播）
    const by = L && L.team === win ? L.id : null, byK = by ? L.kind : undefined;
    vmPerfPoint(win);   // WEB-010 戰績
    const r = scorePoint(VM, win);   /* B2：比分、發球權、局數、換場判定在 engine/rules.js */
    sfx('whistle', 1);
    if (r.sideOut) { if (VM.six) vm6Rotate(win); else VM.srvIdx[win]++; }   // 拿回發球權：6 對 6 要輪轉
    let fn = vmSetupServe;
    if (r.setWon) { why += `・${vmTeamLabel(win)}拿下第 ${VM.setNo} 局（局數 ${VM.sets[0]}：${VM.sets[1]}）`; (VM.setLog || (VM.setLog = [])).push([...VM.sc]); }   // 每局比分：結算面板列出來
    if (r.next === 'over') fn = () => vmOver();
    else if (r.next === 'nextSet') fn = VM.six ? vm6NextSet : vm2NextSet;
    else if (r.next === 'swap') fn = () => { vm6Swap(); vmSetupServe(); vmSay('決勝局 8 分換場', 'srv', 2200); };
    vmSay(vmPointMsg(win, why), VM.team[win].includes(vmMe()) ? 'gold' : 'warn', 3000);
    VM.next = { at: VM.t + (by ? HL_GAP : 3.2), fn };   // 有得分重播的球：等大家看完重播再發下一球
    const land = VM.land; VM.land = null;
    vmBroadcast(true, null, { win, why, by, k: byK, ...(land ? { fl: land } : {}) });   // by／k 跟著原本的得分訊息走，不多送訊息
    if (typeof hlOnPoint === 'function') hlOnPoint(win, why, by, byK);
  }
  function vm2NextSet() {
    VM.setNo++; VM.sc = [0, 0];
    const deciding = VM.sets[0] + VM.sets[1] === VM.bestOf - 1;
    VM.srvTeam = deciding ? (gameRandom() < 0.5 ? 0 : 1) : 1 - (VM.firstSrv || 0); VM.firstSrv = VM.srvTeam;
    vmSetupServe();
    vmSay(`第 ${VM.setNo} 局${deciding ? `（決勝局，先到 ${Math.min(15, VM.to)} 分）` : ''}`, 'srv', 2600);
  }
  function vmMulti() { return !!VM.six || (VM.bestOf || 1) > 1; }
  function vmTeamLabel(t) { const ids = VM.team[t] || [], hs = ids.filter((id) => !/^ai/.test(id)); return ids.includes(vmMe()) ? '你們' : !hs.length ? 'AI 隊' : hs.map(vmName).join('＋') + (hs.length < ids.length ? '＋AI' : ''); }
  function vmPointMsg(win, why) { return `${why}・${vmTeamLabel(win)}得分　${VM.sc[0]}：${VM.sc[1]}`; }
  function vmOver() {
    vmSendResult();   // WEB-010 戰績（開房比賽才送）
    // 練習房也有 ROOM（練習模式），但練習沒有開房的評分面板：照樣結束這場（回到準備），再顯示比分框（2026-11-18 使用者回報結算面板不見了）
    if (ROOM && !vmIsPractice()) { if (ROOM.isHost) { toast(`比賽結束 ${VM.sc[0]}：${VM.sc[1]}，請重新準備`,4000); ROOM.end(); } return; }
    const multi = vmMulti(), sets = VM.sets ? [...VM.sets] : null, sc = [...VM.sc], my = Math.max(0, vmTeamOf(vmMe())), A = multi ? sets : sc, won = A[my] > A[1 - my], winLabel = vmTeamLabel(A[0] > A[1] ? 0 : 1), m = $('rk-menu');
    const inRoom = !!ROOM;   // 先記好比分、隊名：結束這場（ROOM.end）會把比賽收掉
    if (inRoom) { if (ROOM.isHost) ROOM.end(); } else { VM.phase = 'over'; vmBroadcast(true); }
    const btns = inRoom ? '<button type="button" class="primary" data-vm="close">確定</button>' : `${VM.host ? '<button type="button" class="primary" data-vm="again">再一局</button>' : ''}<button type="button" data-vm="quit">離開比賽</button>`;
    m.innerHTML = `<div class="rk-box"><h3>${won ? '🏆 你們贏了！' : `${winLabel}贏了`}</h3><p class="rk-final">${multi ? `局數 ${sets[0]}：${sets[1]}` : `${sc[0]}：${sc[1]}`}</p>${multi ? `<p class="rk-sub" style="text-align:center">最後一局 ${sc[0]}：${sc[1]}</p>` : ''}${inRoom ? '<p class="rk-sub" style="text-align:center">想再打一場：站上球場按「準備」</p>' : ''}<div class="rk-btns">${btns}</div></div>`;
    m.hidden = false; unlockMouse();
    if (typeof hlPanelBtn === 'function') hlPanelBtn(m.querySelector('.rk-btns'), m);   // 得分精華下載
  }
  function vmJudge() {
    const b = VM.ball; if (!b || !balls.includes(b) || !b.floorHit) return;
    // 連線：落點附近有別的真人玩家時，先等 0.6 秒——他可能在自己的畫面上已經接到了，只是「接到球」的訊息還在路上（收到就取消這次落地）
    if (b.room && !NET.ownBall && !b.floorReport && performance.now() - b.floorT < 500) return;
    if (NET.on && !(b.room && !NET.ownBall) && performance.now() - (b.floorT || 0) < 600) {
      const near = [...VM.team[0], ...VM.team[1]].some((id) => { if (id === vmMe() || VM.ai.has(id)) return false; const q = NET.peers.get(id); return q && Math.hypot(q.x - b.floorHit[0], q.z - b.floorHit[1]) < 3.5; });
      if (near) return;
    }
    const [fx, fz] = vmL(b.floorHit[0], b.floorHit[1]), B = { x: fx, z: fz }, L = judgeLanding(B.x, B.z, VM.sg, VM.touch.team, BALL_R);   /* B2 */
    vmMark(b.floorHit[0], b.floorHit[1], L.inside);
    VM.land = [+b.floorHit[0].toFixed(3), +b.floorHit[1].toFixed(3), L.inside ? 1 : 0];   // 跟著得分訊息送給大家（伺服器裁判時每個真人都是加入者，以前看不到落點）
    if (L.inside) vmPoint(L.winner, '落地得分');
    else vmPoint(L.winner, 'OUT 出界');
  }
  function vbBlockFx(...a) { return S.vbBlockFx ? S.vbBlockFx(...a) : undefined; }
  function vbWallFx(...a) { return S.vbWallFx ? S.vbWallFx(...a) : undefined; }
  function vmMark(...a) { return S.vmMark ? S.vmMark(...a) : undefined; }
  function vmAiStep(...a) { return aiEngine().vmAiStep(...a); }
  function vbBlockOutcome(off, low, pow, skill) {
    const centered = off < 0.4, edge = off > 0.42;
    if (low < 0.18 && gameRandom() < 0.45 + 0.35 * pow) return 'top';
    const pStuff = skill * 0.6 * (centered ? 1 : 0.35) * (1 - 0.55 * pow) * (0.5 + 1.0 * low), pOut = (edge ? 0.1 + 0.6 * pow : 0.05) * (1.3 - 0.7 * low), pThrough = 0.32 * pow * (1.2 - skill), r = gameRandom();
    return r < pStuff ? 'stuff' : r < pStuff + pOut ? 'out' : r < pStuff + pOut + pThrough ? 'through' : 'soft';
  }
  const TOUCH_OUT = { outKeep: 0.09, outKeepPow: 0.08, outPast: [0.15, 0.7], outLatMax: [2.6, 1.2], topKeep: 0.14, topKeepPow: 0.14, topVy: [2.0, 1.4], powVy: 1.6 };
  function vbBlockApply(b, kind, lx, lz, hz, plane, sd, ex, ez, nx, nz, pow) {
    if (typeof touchEvent === 'function') touchEvent(b.m, 'block');   // A1：攔網碰到球，告訴動畫
    const p = b.m.position, vl = b.v.x * nx + b.v.z * nz;
    if (kind === 'stuff') { b.v.x -= 1.5 * vl * nx; b.v.z -= 1.5 * vl * nz; b.v.multiplyScalar(0.55); b.v.y = -Math.abs(b.v.y) * 0.3 - 2; const back = plane - sd * (BALL_R + 0.03) - lx; p.x += nx * back; p.z += nz * back; return '被攔死了！'; }
    if (kind === 'out') {   // 打手出界：球擦到外側那隻手，力道被吃掉大半，往旁邊輕輕彈起、偏出邊線外 0.6～1.8 m
      const side = Math.sign(lz - hz) || (gameRandom() < 0.5 ? 1 : -1);
      b.v.multiplyScalar(TOUCH_OUT.outKeep + TOUCH_OUT.outKeepPow * pow);
      const vy = 1.2 + gameRandom() * 1.6 + TOUCH_OUT.powVy * pow, t = (vy + Math.sqrt(vy * vy + 19.6 * Math.max(0.1, p.y - BALL_R))) / 9.8;
      const vlat = clamp((4.5 + BALL_R + TOUCH_OUT.outPast[0] + gameRandom() * (TOUCH_OUT.outPast[1] - TOUCH_OUT.outPast[0]) * (0.5 + pow) - side * lz) / t, 1.0, TOUCH_OUT.outLatMax[0] + TOUCH_OUT.outLatMax[1] * pow);
      b.v.x += ex * side * vlat; b.v.z += ez * side * vlat; b.v.y = vy;
      const lz2 = lz + (b.v.x * ex + b.v.z * ez) * t, lx2 = lx + (b.v.x * nx + b.v.z * nz) * t;
      return Math.abs(lz2) > 4.5 + BALL_R || Math.abs(lx2) > 9 + BALL_R ? '打手出界！' : '碰手了！';
    }
    if (kind === 'top') { b.v.multiplyScalar(TOUCH_OUT.topKeep + TOUCH_OUT.topKeepPow * pow); b.v.y = TOUCH_OUT.topVy[0] + gameRandom() * TOUCH_OUT.topVy[1] + TOUCH_OUT.powVy * pow; return '擦手彈大！'; }   // 擦過指尖：彈高，繼續往攔網這邊的後場飛
    if (kind === 'through') { b.v.multiplyScalar(0.82); b.v.y -= 0.8; return '打穿攔網！'; }
    b.v.multiplyScalar(0.25); b.v.y = 3 + gameRandom() * 1.5; return '撐起來了';
  }
  const BLK_FX = { stuff: 'stuff', soft: 'soft', through: 'through', out: 'out', top: 'touch' };
  function vmBlockTest(b, h) {
    if (!VM.on || !VM.host || VM.phase !== 'rally' || b !== VM.ball || b.blkDone) return;
    for (const a of VM.ai.values()) {
      if (!a.blk || !a.blk.jumped || a.y < 0.05 || VM.touch.last === a.id) continue;
      const sd = vmSide(a.team), p = b.m.position, [lx, lz] = vmL(p.x, p.z), [l0] = vmL(p.x - b.v.x * h, p.z - b.v.z * h), plane = sd * 0.1;
      if (!((l0 - plane) * (lx - plane) <= 0 && (lx - l0) * sd > 0)) continue;
      const off = Math.abs(lz - (a.z + (a.bs || 0))), top = a.y + 2.7, netH = NETS[state.net].h;   // 雙手的中心跟著左右移
      if (off > 0.75 + BALL_R || p.y > top + BALL_R || p.y < netH - 0.05) continue;   // 從手上面過去＝打過手；從旁邊過去＝繞過攔網
      const L = vmLv(a), pow = clamp((b.v.length() - 8) / 18, 0, 1), low = clamp((top - p.y) / Math.max(0.3, top - netH), 0, 1);
      const rr = (VM.c.rot * Math.PI) / 180, kind = vbBlockOutcome(off, low, pow, L.blockSkill);
      const word = vbBlockApply(b, kind, lx, lz, a.z + (a.bs || 0), plane, sd, Math.sin(rr), Math.cos(rr), Math.cos(rr), -Math.sin(rr), pow);
      b.blkDone = true;
      vbImpact(b, 'block', (kind === 'stuff' ? 1 : kind === 'through' ? 0.3 : 0.7)); netFxHit(VM.c, lz, sd, 0.4, true); vbBlockFx(p.clone(), word === '碰手了！' ? 'touch' : BLK_FX[kind]);
      vmOnTouch(b, a.id, 'block');
      if (NET.on) netBallHit(b, 'block', (kind === 'stuff' ? 1 : kind === 'through' ? 0.3 : 0.7));
      const mine = a.team !== 0; vmSay(word, kind === 'soft' ? '' : (mine ? kind !== 'stuff' : kind === 'stuff') ? 'gold' : 'warn', 1400);
      recHit({ x: p.x, y: p.y, z: p.z, v: b.v.length(), kind: 'block' });
      return;
    }
  }
  function vmOppPos(team) { return VM.team[1 - team].map((id) => vmPos(id)).filter(Boolean); }
  const V6_ROLES = ['S', 'OH', 'MB', 'OPP', 'OH', 'MB'];
  const V6_NAME = { S: '舉球', OPP: '舉對', OH: '大砲', MB: '中間手' }, V6_TAG = { S: 'S', OPP: 'OP', OH: 'OH', MB: 'M' };
  const V6_COLORS = [['#30A46C', '#12A594', '#46A758', '#29A383', '#3D9A50', '#5BB98B'], ['#E5484D', '#F76B15', '#D6409F', '#E54666', '#C2410C', '#DC3E42']];
  const V6_BASE = [[6.8, -3], [2.2, -3], [2.2, 0], [2.2, 3], [6.8, 3], [7.4, 0]];
  const vm6Idx = (id) => { for (const t of [0, 1]) { const k = VM.rot && VM.rot[t] ? VM.rot[t].indexOf(id) : -1; if (k >= 0) return k; } return -1; };
  const vm6Front = (id) => { const k = vm6Idx(id); return vmSmallCount() ? (vmSmallCount() === 1 || !!CourtFormations.get(vmSmallCount())[k]?.front) : k >= 1 && k <= 3; };
  const vm6P = (team, d, L) => { const sd = vmSide(team); return { x: sd * d, z: sd * L }; };
  function vm6Start(c, sg, asg = {}, seats = null) {
    globalThis.VBTutorial?.stop();
    const count = seats ? seats[0].length : 6;
    if (VM.npc || VB.npc) vbNpcToggle();
    vmStop(true);
    STA.v = 1; STA.lock = false;
    Object.assign(VM, { on: true, host: true, srvDone: false, six: true, c, sg, sg0: sg, asg0: asg, to: VM_OPT.to6, bestOf: VM_OPT.sets, sets: [0, 0], setLog: [], setNo: 1, swap8: false, sc: [0, 0], call: null, phase: 'idle', srvIdx: [0, 0], ball: null, touch: { team: -1, n: 0, last: null }, poss: [null, null], t: 0, next: null, srvSeq: 0, names: {}, formC: {}, rotN: [1, 1] });
    // 每隊 6 個號位的角色固定（輪轉表）；真人坐進自己選的角色，重複的就往後排到空的位置，其他 AI 補
    const humans = seats ? [[],[]] : [[{ id: vmMe(), role: VM_OPT.role }], []], clash = [];
    for (const [id, q] of Object.entries(asg)) if (q && q.team >= 0 && NET.peers.has(id)) humans[q.team].push({ id, role: q.role });
    const used = new Set([myChar()]); VM.chars = {}; VM.role = {}; VM.rot = [[], []];
    for (const t of [0, 1]) {
      const slot = seats ? seats[t].slice() : Array(6).fill(null);
      for (const h of humans[t].slice(0, 6)) {
        let k = V6_ROLES.findIndex((r, i) => r === h.role && !slot[i]);
        if (k < 0) { k = slot.findIndex((x) => !x); clash.push(`${h.id === vmMe() ? '你' : (NET.peers.get(h.id) || {}).n || '球友'}→${V6_NAME[V6_ROLES[k]]}`); }
        slot[k] = h.id;
      }
      for (let k = 0; k < count; k++) {
        if (!slot[k]) { const id = `ai${t}${k}`, ch = vmPickChar(used); VM.chars[id] = ch; slot[k] = id; vmMkAi(id, t, count === 6 ? `AI・${V6_TAG[V6_ROLES[k]]}` : `AI・${k+1}`, V6_COLORS[t][k], ch); }
        if (count === 6) VM.role[slot[k]] = V6_ROLES[k];
      }
      VM.rot[t] = slot;
    }
    for (const t of [0, 1]) for (const id of VM.rot[t]) if (!VM.ai.has(id) && id !== vmMe()) VM.names[id] = (NET.peers.get(id) || {}).n || '球友';
    VM.team = VM.rot.map((r) => r.slice()); VM.rot0 = VM.rot.map((r) => r.slice());
    VM.tactics = count === 6 && ROOM?.snapshot.tactics === 'rotation' ? 'rotation' : 'roles';
    vm6SyncRotationRoles();
    VM.srvTeam = gameRandom() < 0.5 ? 0 : 1; VM.firstSrv = VM.srvTeam;   // 擲硬幣決定誰先發球
    for (const a of VM.ai.values()) { const f = vm6Spot(a.team, a.id, 'defense'); a.x = a.tx = f.x; a.z = a.tz = f.z; }
    VM.startData = { e: 'start', ts: VB.ts, c: c.id, sg, team: VM.team, names: { ...VM.names, [vmMe()]: NET.name }, chars: VM.chars, to: VM.to, cw: [c.x, c.z, c.rot], stacfg: STA_CFG, six: { rot: VM.rot, role: VM.role, bestOf: VM.bestOf, colors: Object.fromEntries([...VM.ai.values()].map((a) => [a.id, a.color])) } };
    mrecRoles();
    VM.startData.six.tactics = VM.tactics;
    if (NET.on && globalThis.VBMatchSync) vmWireInit(true);
    if (NET.on) NET.tx.publish('vm', VM.startData);
    $('rk-menu').hidden = true; $('vm-hud').hidden = false; $('walk-ui').classList.add('vm'); peerTagsAll();
    vmSetupServe();
    if (count !== 6) { toast(`${count} 對 ${count} 開始${roomSpectator() ? ' · 你是觀眾' : ' · '+vmSmallLabel(vmMe())}`,3600); return; }
    toast(roomSpectator() ? '6 對 6 開始 · 你是觀眾' : `6 對 6 開始！${VM.bestOf > 1 ? (VM.bestOf === 3 ? '三戰兩勝・' : '五戰三勝・') : ''}每局 ${VM.to} 分・你是${V6_NAME[VM.role[vmMe()]]}（${vm6Idx(vmMe()) + 1} 號位，${vm6Front(vmMe()) ? '前排' : '後排'}）${clash.length ? '・位置重複，改成：' + clash.join('、') : ''}`, 3600);
  }
  function vm6Rotate(t) {
    if (vmSmallCount()) { VM.rot[t] = CourtFormations.rotate(VM.rot[t]); VM.rotN[t] = VM.rotN[t] % vmSmallCount() + 1; VM.formC = {}; if (VM.rot[t].includes(vmMe())) vm6RotToast(); return; } // WEB003B
  
    const meK = vm6Idx(vmMe()), mine = VM.rot[t].includes(vmMe());
    VM.rot[t] = VM.rot[t].slice(1).concat(VM.rot[t][0]); VM.rotN[t] = (VM.rotN[t] % 6) + 1; VM.formC = {};
    vm6SyncRotationRoles();
    if (mine && meK >= 0) vm6RotToast();
  }
  function vm6RotToast(...a) { return S.vm6RotToast ? S.vm6RotToast(...a) : undefined; }
  function vm6NextSet() {
    VM.setNo++; VM.sc = [0, 0]; VM.swap8 = false;
    VM.rot = VM.rot0.map((r) => r.slice()); VM.rotN = [1, 1]; VM.formC = {};
    vm6SyncRotationRoles();
    const deciding = VM.bestOf > 1 && VM.sets[0] + VM.sets[1] === VM.bestOf - 1;
    VM.srvTeam = deciding ? (gameRandom() < 0.5 ? 0 : 1) : 1 - VM.firstSrv; VM.firstSrv = VM.srvTeam;
    vm6Swap(); vmSetupServe();
    vmSay(`第 ${VM.setNo} 局${deciding ? '（決勝局，先到 15 分）' : ''}・換場`, 'srv', 2600);
  }
  function vm6Swap() { VM.sg = -VM.sg; for (const a of VM.ai.values()) { a.x = -a.x; a.tx = -a.tx; a.vx = -a.vx; } VM.formC = {}; }
  function vm6Spot(...a) { return aiEngine().vm6Spot(...a); }
  function vm6PlaceHumans(srv) {
    const spots = {};
    for (const t of [0, 1]) for (const id of VM.rot[t]) { if (VM.ai.has(id) || id === srv) continue; const f = vm6Spot(t, id, 'serve'); spots[id] = [+f.x.toFixed(2), +f.z.toFixed(2)]; }
    vm6GoSpot(spots[vmMe()]);
    if (NET.on) NET.tx.publish('vm', { e: 'form', spots, seq: VM.srvSeq });
  }
  function vm6GoSpot(...a) { return aiEngine().vm6GoSpot(...a); }
  function vm6Overlap() {
    if (vmSmallCount()) return vmSmallOverlap(); // WEB003B
    if (VM.tactics === 'rotation') return null;
  
    for (const t of [1 - VM.srvTeam]) {   // 發球方整隊不判越位，只判接發球那一隊
      const rot = VM.rot[t], sd = vmSide(t), at = (id) => { const a = VM.ai.get(id); if (a) return { d: Math.abs(a.tx), L: a.tz / sd }; const q = vmPos(id); return q ? { d: Math.abs(q.x), L: q.z / sd } : null; };
      const skip = (k) => t === VM.srvTeam && k === 0, both = (i, j) => VM.ai.has(rot[i]) && VM.ai.has(rot[j]);
      for (const [b, f] of [[0, 1], [5, 2], [4, 3]]) {
        if (both(b, f) || skip(b)) continue;
        const B = at(rot[b]), F = at(rot[f]); if (!B || !F) continue;
        if (B.d < F.d - 0.15) return { team: t, why: `位置錯誤（前後越位：${vmName(rot[b])}在 ${b + 1} 號位，要站在 ${f + 1} 號位${vmName(rot[f])}的後面）` };
      }
      for (const [r, l] of [[1, 2], [2, 3], [0, 5], [5, 4]]) {   // [右邊的號位, 左邊的號位]（索引）
        if (both(r, l) || skip(r) || skip(l)) continue;
        const R = at(rot[r]), Lf = at(rot[l]); if (!R || !Lf) continue;
        if (R.L > Lf.L + 0.15) return { team: t, why: `位置錯誤（左右越位：${vmName(rot[r])}在 ${r + 1} 號位，要站在 ${l + 1} 號位${vmName(rot[l])}的右邊）` };
      }
    }
    return null;
  }
  function vm6SetterFor(...a) { return aiEngine().vm6SetterFor(...a); }
  function vm6AttackerFor(...a) { return aiEngine().vm6AttackerFor(...a); }
  function vm6Apply(d) {
    const before = vm6Idx(vmMe());
    VM.rot = d.rot; VM.sets = d.sets; VM.setNo = d.setNo; VM.rotN = d.rn || VM.rotN;
    if (d.tactics) VM.tactics = d.tactics;
    vm6SyncRotationRoles();
    const now = vm6Idx(vmMe()); if (before >= 0 && now !== before) vm6RotToast();
  }
  function vmUpdate(dt) {
    if (!VM.on) return;
    VM.t += dt;
    if (VM.host) {
      if (!state.items.some((i) => i.id === VM.c.id)) { vmStop(); toast('球場被改掉了，比賽結束'); return; }
      if (VM.next && VM.t >= VM.next.at) { const f = VM.next.fn; VM.next = null; f(); }
      if (VM.phase === 'serve') vmServeClock();
      if (VM.phase === 'rally') vmJudgePenetration();
      if (VM.phase === 'rally') vmJudge();
      if (VM.ball) for (const q of balls.slice()) if (q !== VM.ball && !q.room) { ballsGroup.remove(q.m); balls.splice(balls.indexOf(q), 1); }
      for (const a of VM.ai.values()) vmAiStep(a, dt);
    }
    vmRenderAi(dt);
    vbWallFx();
  }
  function vmAiSnapshot(a, row, now) {
    const [id, x, z, y, pose, sta, bs, jp, stamp] = row;
    const buf = a.netBuf || (a.netBuf = []), last = buf[buf.length - 1];
    if (last && stamp != null && last.stamp != null && stamp <= last.stamp) return;
    if (last) a.netGap = (a.netGap || 150) * 0.85 + Math.min(500, now - last.arrival) * 0.15;
    if (a.netOffset == null && stamp != null) a.netOffset = now - stamp * 1000;
    const t = stamp == null ? now : stamp * 1000 + a.netOffset;
    buf.push({ t, arrival: now, stamp, x, z, y, pose, sta, bs });
    while (buf.length > 2 && buf[1].t < t - 1000) buf.shift();
    a.netY = y; a.wx = x; a.wz = z;
    if (jp && jp.s > (a.jpS || 0)) {
      a.jpS = jp.s; a.netLanded = false;
      const age = Math.max(0, (stamp ?? jp.t) - jp.t) + netLat(VM.hostId);
      a.netJump = { ...jp, age };
    }
  }
  function vmRenderAi(...a) { return S.vmRenderAi ? S.vmRenderAi(...a) : undefined; }
  function vmStatePayload() {
    const matchBall = VM.ball && balls.includes(VM.ball) ? VM.ball : balls.find(b => b.room);
    const watch = { t: VM.t, ball: matchBall ? matchBall.m.position.toArray() : null, rally: VM.srvSeq };
    const ai = [...VM.ai.values()].map((a) => { const [x, z] = vmW(a.x, a.z); return [a.id, +x.toFixed(2), +z.toFixed(2), +a.y.toFixed(2), a.swingT > 0 || a.y > 0 ? a.pose : a.appr ? 13 : 0, +(a.sta ?? 1).toFixed(2), a.bs ? +a.bs.toFixed(2) : 0, a.jp || null, VM.t]; });
    return { watch, lz: [VM.langziMatch, VM.srvSeq], sc: VM.sc, ph: VM.phase, srv: vmServer(), ai, sg: VM.sg, six: VM.six ? { rot: VM.rot, sets: VM.sets, setNo: VM.setNo, rn: VM.rotN, tactics: VM.tactics } : undefined, s2: !VM.six && VM.bestOf > 1 ? [VM.sets[0], VM.sets[1], VM.setNo, VM.bestOf] : undefined,   /* 2 對 2 多局：局數、第幾局、幾戰幾勝 */ tc: VM.phase === 'rally' && VM.touch.team >= 0 && !VM.touch.serve ? [VM.touch.team, VM.touch.n] : undefined, setter: VM.poss?.map(p=>p?.setter||null), gr: VM.grade ? [VM.grade.s, VM.grade.team, VM.grade.g, VM.grade.why] : undefined };
  }
  function vmWatchSnapshot(frame) {
    if (!VM.watchFrames) {
      vmClearBalls();
      VM.watchFrames = [];
      VM.watchOffset = performance.now() - frame.t * 1000;
    }
    const frames = VM.watchFrames;
    if (frames.length && frame.t <= frames[frames.length - 1].t) return;
    frames.push(frame);
    while (frames.length > 2 && frames[1].t < frame.t - 2) frames.shift();
    if (!VM.watchBall || !balls.includes(VM.watchBall)) {
      const mesh = newBallMesh();
      const ball = { m: mesh, v: new THREE.Vector3(), rest: 0, room: true, watchOnly: true };
      mesh.userData.ball = ball; mesh.visible = false;
      ballsGroup.add(mesh); balls.push(ball); VM.watchBall = ball;
    }
  }
  function vmWatchBallFrame(ball) {
    const frames = VM.watchFrames;
    if (!frames?.length) { ball.m.visible = false; return; }
    const time = (performance.now() - VM.watchOffset - 225) / 1000;
    let left = frames[0], right = left;
    for (const frame of frames) { if (frame.t <= time) left = frame; right = frame; if (frame.t >= time) break; }
    ball.m.visible = !!left.ball;
    if (!left.ball) return;
    const fraction = right.ball && right.rally === left.rally && right.t > left.t ? clamp((time - left.t) / (right.t - left.t), 0, 1) : 0;
    ball.m.position.set(...left.ball);
    if (fraction) ball.m.position.lerp(new THREE.Vector3(...right.ball), fraction);
  }
  function vmBroadcast(force, msg, pt) {
    if (!NET.on || !VM.host) return;
    if (VM.wire && force) VM.wire.dirty = true;
    if (msg || pt) NET.vmPend = { msg: msg || undefined, pt: pt || undefined };
    if (force) NET.forceSt = true;
  }
  function vmOnNet(d, from) {
    if (d.e === 'result') { if (from === 'srv') VM.srvDone = true; /* 伺服器打完了：不要再當成伺服器斷線而改由房主接手開新的一場 */ if (!ROOM || from === ROOM.host || from === 'srv') vmGotResult(d); return; }   // WEB-010 戰績（B5：伺服器裁判的也收）   // WEB-010 戰績
    if (from === 'srv' && ROOM && ROOM.snapshot?.flow?.phase !== 'playing' && d.e !== 'result') return;   /* 房間已經結束比賽：伺服器晚到的開賽、狀態都不收 */
    if (d.e === 'start' && (!ROOM || from === ROOM.host || from === 'srv')) mrecReset('');   // WEB-010 戰績：新比賽，自己的接球／舉球重新算
    if (ROOM && (d.e === 'start' || d.e === 'end') && from !== ROOM.host && from !== 'srv') return;   /* B5：伺服器（srv）開的比賽也收 */
    if (d.e === 'start') {
      if (VM.on) return;
      const c = state.items.find((i) => i.id === d.c) || (d.cw ? { id: d.c, type: 'vb', x: d.cw[0], z: d.cw[1], rot: d.cw[2] } : null); if (!c) return;
      vmStop(true);
      Object.assign(VM, { on: true, host: false, srvDone: false, hostId: from, c, sg: d.sg, to: d.to, sc: [0, 0], phase: 'serve', team: d.team, names: d.names || {}, t: 0, chars: d.chars || {}, six: !!d.six, rot: d.six ? d.six.rot : null, role: d.six ? d.six.role : {}, bestOf: d.six ? d.six.bestOf : 1, sets: [0, 0], setNo: 1, rotN: [1, 1], stacfg: d.stacfg || null });
      VM.names = { ...VM.names }; for (const id of [...d.team[0], ...d.team[1]]) if (id && !/^ai/.test(id) && NET.peers.get(id)?.n) VM.names[id] = NET.peers.get(id).n;   /* 伺服器開賽時不知道暱稱（名單寫「球友」）：真人一律用自己這邊知道的暱稱 */
      if (d.wire === 2 && globalThis.VBMatchSync) vmWireInit(false, d);
      VM.tactics = d.six?.tactics === 'rotation' ? 'rotation' : 'roles';
      vm6SyncRotationRoles();
      // Ball speed is owned by room-settings, independent of the match simulation host.
      const colors = { aiT: '#30A46C', ai1: '#E5484D', ai2: '#F76B15', ...(d.six ? d.six.colors : {}) };
      for (const id of [...d.team[0], ...d.team[1]]) if (/^ai/.test(id)) { const a = vmMkAi(id, d.team[0].includes(id) ? 0 : 1, d.names[id] || id, colors[id] || '#E5484D', d.chars && d.chars[id]); a.wx = null; }
      $('vm-hud').hidden = false; $('walk-ui').classList.add('vm'); vmClearBalls(); vmDropHeld(); peerTagsAll();
      const mode = `${d.team[0].length} 對 ${d.team[0].length}`, host = (NET.peers.get(from) || {}).n || '房主';
      toast(d.team[0].includes(NET.me) ? `${host} 開了 ${mode}，你們一隊！${vmSmallCount() ? vmSmallLabel(NET.me) : d.six ? `你是${V6_NAME[VM.role[NET.me]]}` : ''}` : d.team[1].includes(NET.me) ? `${host} 開了 ${mode}，你在對面那一隊！${vmSmallCount() ? vmSmallLabel(NET.me) : d.six ? `你是${V6_NAME[VM.role[NET.me]]}` : ''}` : `旁邊開打 ${mode} 了（你在旁邊看）`, 3000);
      return;
    }
    if (VM.on && VM.host && d.e === 'srvMiss') {   // 加入的人跳發拋了沒打到
      if (VM.phase === 'serve' && from === vmServer()) { const team = vmTeamOf(from); VM.phase = 'rally'; VM.touch = { team, n: 3, last: from, serve: true }; vmPoint(1 - team, `發球失誤（${vmName(from)}拋了沒打到）`); }
      return;
    }
    if (!VM.on || VM.host || from !== VM.hostId) return;
    if (d.e === 'st') VM.lastStT = performance.now();
    if (d.e === 'st') {
      if (Array.isArray(d.lz)) [VM.langziMatch, VM.langziSeq] = d.lz; /* WEB-022 死球訊息所屬的比賽與發球輪次。 */
      // 新的一球：清掉場上的球；但自己剛發出去（或正在發）的球不清——狀態比「輪到你發球」晚到時，會把剛跳發出去的球清掉（球不見）
      const mySrv = d.srv === NET.me && (walk.jserve || walk.serve || balls.some((q) => q.serve && q.room && NET.hitBy === NET.me));
      if (!VM.wire && d.ph === 'serve' && VM.phase !== 'serve' && !mySrv) { vmClearBalls(); if (d.srv !== NET.me) vmDropHeld(); }
      if (!VM.wire) { VM.sc = d.sc; VM.phase = d.ph; VM.srvId = d.srv; VM.tc = d.tc || null; }
      VM.remoteSetters = Array.isArray(d.setter) ? d.setter : null;
      if (d.gr && (!VM.grade || VM.grade.s !== d.gr[0])) { const first = !VM.grade; VM.grade = { s: d.gr[0], team: d.gr[1], g: d.gr[2], why: d.gr[3] }; if (!first) vmGradeShow(VM.grade); }   // 到位等級（剛加入時的舊等級不顯示）
      if (d.sg) VM.sg = d.sg;
      if (d.six) vm6Apply(d.six);
      else if (Array.isArray(d.s2) && d.s2.length === 4 && d.s2.every(Number.isFinite)) { VM.sets = [d.s2[0], d.s2[1]]; VM.setNo = d.s2[2]; VM.bestOf = d.s2[3]; }
      if (d.watch && roomSpectator() && !VM.wire) vmWatchSnapshot(d.watch);
      drawScore();
      const nowS = performance.now();
      for (const row of d.ai) { const a = VM.ai.get(row[0]); if (a) vmAiSnapshot(a, row, nowS); }
      if (d.pt && Array.isArray(d.pt.fl) && d.pt.fl.length === 3 && d.pt.fl.slice(0, 2).every(Number.isFinite)) vmMark(d.pt.fl[0], d.pt.fl[1], !!d.pt.fl[2]);   // 落點旗子（房主／伺服器判的）
      if (d.pt) { vmSay(vmPointMsg(d.pt.win, d.pt.why), VM.team[d.pt.win].includes(vmMe()) ? 'gold' : 'warn', 3000); sfx('whistle', 1); if (typeof hlOnPoint === 'function') hlOnPoint(d.pt.win, d.pt.why, 'by' in d.pt ? d.pt.by : undefined, d.pt.k); }
      else if (d.msg) { vmSay(d.msg, /你們得分/.test(d.msg) ? 'gold' : 'warn', 3000); sfx('whistle', 1); }
      if (d.ph === 'over') vmOver();
    } else if (d.e === 'serve' && d.id === NET.me) vmPrepServe(d.s);
    else if (d.e === 'whistle') vmWhistle();
    else if (d.e === 'form') vm6GoSpot(d.spots && d.spots[NET.me]);
    else if (d.e === 'ts') { /* Legacy field retained; room-settings is authoritative. */ }
    else if (d.e === 'end') { vmStop(true); toast('比賽結束了'); }
  }
  function vmSay(...a) { return S.vmSay ? S.vmSay(...a) : undefined; }
  function tutEv(...a) { return S.tutEv ? S.tutEv(...a) : undefined; }
  const TUT_COACH = {
    id: null, index: 0, court: null, sg: 1, ball: null, owned: new Set(), objects: [],
    next: 0, lastServe: -Infinity, paused: false, settled: false, failed: false, mate: null, ring: null, held: null,
    coach: null, toss: null, cj: 0,
    // 攔網教練：手上 2.3 m 往上拋（約到 3.7 m），球落回 3.3 m 時扣過來；球到最高點那一刻教練起跳（玩家看這個起跳）
    TOSS: { y0: 2.3, vy: 5.2, hitY: 3.3, speed: 8, jumpH: 0.6, jumpMs: 700 },
    recvTarget(index) {   // 接球落點：照玩家「現在」的位置算，都在自己場內
      const [lx, lz] = toLocalOf(this.court, walk.x, walk.z), px = lx * this.sg;
      const ok = (x, z) => x >= 1.2 && x <= 8.5 && Math.abs(z) <= 4;
      if (index === 0) {   // 走進落點圈：落在旁邊 2～2.5 m
        for (let i = 0; i < 24; i++) { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 0.5, x = px + Math.cos(a) * r, z = lz + Math.sin(a) * r; if (ok(x, z)) return this.world(x, z); }
        return this.world(px > 4.8 ? px - 2.2 : px + 2.2, lz);
      }
      if (index === 3) {   // 撲救：落在側邊 3～3.5 m（撲救最遠 5 m）
        const r = 3 + Math.random() * 0.5, s = Math.random() < 0.5 ? 1 : -1;
        for (const d of [s, -s]) if (ok(px, lz + d * r)) return this.world(px, lz + d * r);
        return this.world(px > 4.8 ? px - r : px + r, lz);
      }
      const lanes=[-1.8,0,1.8], depths=[6,5,4];
      return this.world(depths[this.rep||0],lanes[this.rep||0]*this.sg);
    },
    tossStep(now) {
      const t = this.toss, b = t.ball;
      if (!balls.includes(b)) { this.toss = null; return; }
      if(t.receive){
        if(b.v.y<0 && b.m.position.y<=3.25){const cp=b.m.position.clone(),v=t.target.clone().sub(cp).multiplyScalar(1/t.flight);v.y+=4.9*t.flight;vbLaunch(b,cp,v,'spike');this.trajectory(cp,v);this.hitUntil=now+450;this.toss=null;}return;
      }
      if (!t.apex && b.v.y < 0) { t.apex = now; this.cj = now; }
      if (t.apex && b.m.position.y <= this.TOSS.hitY) {
        const v = this.world(-1, 0).sub(this.world(-2, 0)).multiplyScalar(this.TOSS.speed); v.y = -0.5;
        vbLaunch(b, b.m.position.clone(), v, 'spike'); this.trajectory(b.m.position,v); this.toss = null;
      }
    },
    face(av) { av.g.rotation.y = Math.atan2(walk.x - av.g.position.x, walk.z - av.g.position.z); },   // 角色面向玩家（角色朝向＝rotation.y 的 sin、cos 方向）
    coachAnim(now) {
      const av = this.coach, k = this.cj ? (now - this.cj) / this.TOSS.jumpMs : -1, air = k >= 0 && k < 1;
      av.g.position.y = air ? this.TOSS.jumpH * Math.sin(Math.PI * k) : 0;
      avDrive(av, this.toss ? (air ? AVP.airUp : AVP.serveToss) : air ? AVP.spikeHit : AVP.ready, 0.5, 0, air);
      if (k >= 1) this.cj = 0;
    },
    world(x, z, y = 0) {
      const [wx, wz] = toWorldOf(this.court, x * this.sg, z);
      return new THREE.Vector3(wx, y, wz);
    },
    place(x, z) {
      const p = this.world(x, z), net = this.world(0, z);
      walk.x = p.x; walk.z = p.z; walk.vel = [0, 0]; walk.target = null;
      walk.yaw = Math.atan2(p.x - net.x, p.z - net.z); walk.pitch = 0;
      walk.turn = null; camera.position.set(p.x, EYE, p.z);
      camera.rotation.set(0, walk.yaw, 0, 'YXZ');
    },
    circle(p, color = 0xffd34e) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.67, 0.8, 48), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.035, p.z); ring.userData.noPick = true;
      scene.add(ring); this.objects.push(ring); return ring;
    },
    progress(value) {
      const ring=this.ring;if(!ring)return;
      if(!ring.userData.progress){
        const arc=new THREE.Mesh(new THREE.RingGeometry(.67,.8,120),new THREE.MeshBasicMaterial({color:0x42dd88,side:THREE.DoubleSide,depthWrite:false}));
        arc.rotation.x=-Math.PI/2;arc.userData.noPick=true;scene.add(arc);this.objects.push(arc);ring.userData.progress=arc;
      }
      const arc=ring.userData.progress;arc.position.copy(ring.position);arc.position.y+=.003;arc.visible=value>0;arc.geometry.setDrawRange(0,Math.floor(clamp(value,0,1)*120)*6);
    },
    trajectory(from,velocity) {
      if(this.path){this.path.removeFromParent();this.path.geometry.dispose();this.path.material.dispose();this.objects=this.objects.filter(o=>o!==this.path);}
      const points=[];
      for(let i=0;i<=100;i++){const t=i*.035,p=from.clone().add(velocity.clone().multiplyScalar(t));p.y-=4.9*t*t;if(p.y<BALL_R){p.y=BALL_R;points.push(p);break;}points.push(p);}
      this.path=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:0x6ce8ff,transparent:true,opacity:.9,dashSize:.22,gapSize:.1,depthWrite:false}));
      this.path.computeLineDistances();this.path.userData.noPick=true;scene.add(this.path);this.objects.push(this.path);
    },
    moveTarget(index,rep=0){
      if(index===1)return this.world([9,6,3][rep],0);
      if(index===3){let p;for(let i=0;i<20;i++){p=this.world(2+Math.random()*6,(Math.random()-.5)*6);if(Math.hypot(p.x-walk.x,p.z-walk.z)>2)break;}return p;}
      if(index===5)return this.world([5,6,4][rep],[-1.8,1.8,0][rep]*this.sg);
      return new THREE.Vector3(walk.x,0,walk.z);
    },
    deferSuccess(done){if(this.ball && !this.ball.floorHit && !this.settled){this.afterLanding=done;return true;}return false;},
    roundComplete(){if(this.id!=='move'){this.settled=true;this.next=performance.now()+1800;}},
    repeat(id,index,rep){
      this.rep=rep;
      if(id==='move'){if(index===4){STA.v=1;STA.lock=false;STA.useT=performance.now();}const p=this.moveTarget(index,rep);if(this.ring)this.ring.position.set(p.x,.035,p.z);return {x:p.x,z:p.z};}
      this.updateZone();this.next=Math.max(this.next===Infinity?0:this.next,performance.now()+900);return null;
    },
    updateZone(){
      const needed=this.id==='recv' && [1,2].includes(this.index) || this.id==='atk' && this.index>0 || this.id==='serve';
      if(!needed)return;
      const recv=this.id==='recv',z=recv?-1.2*this.sg:[-2.4,0,2.4][(this.rep||0)%3]*this.sg;
      this.zone={p:this.world(recv?1.8:this.id==='atk' && this.index===3?-2:-6,z),r:recv?1.8:2};
      if(!this.zoneMesh){this.zoneMesh=this.circle(this.zone.p,0x65dfff);this.zoneMesh.scale.set(this.zone.r/.8, this.zone.r/.8,1);}
      this.zoneMesh.position.set(this.zone.p.x,.045,this.zone.p.z);
    },
    avatar(p) {
      const av = makeAvatar('#30A46C', myChar());
      av.g.position.copy(p); this.face(av);
      scene.add(av.g); this.objects.push(av.g); return av;
    },
    startDrill(mode, setType, interval) {
      if (!this.start('drill')) return false;
      const [slot, variant] = setType.split('-');
      this.drill = { mode, slot: Number(slot) === 6 ? 7 : Number(slot), variant,
        delay: Math.max(3, interval) * 1000, hitters: [], handBalls: [], hitter: null, target: null, strike: false, poseUntil: 0 };
      const d = this.drill;
      this.place(({ atk: 3.5, set: 1.5, block: 0.7, defense: 5.5 })[mode], 0);
      const setter = this.world(mode === 'block' ? -1.5 : mode === 'set' ? 6 : 1, (mode === 'atk' ? -2.3 : 1.2) * this.sg);
      if (mode !== 'defense') this.coach = this.avatar(setter);
      if (mode === 'atk') {
        d.feeder = this.avatar(this.world(6, 0));
        d.feeder.g.rotation.y = Math.atan2(setter.x - d.feeder.g.position.x, setter.z - d.feeder.g.position.z);
      }
      if (mode === 'block' || mode === 'defense') {
        for (const z of [-3.25, 0, 3.25]) {
          const base = this.world(-1.25, z);
          const stool = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), new THREE.MeshStandardMaterial({ color: 0x876849 }));
          stool.position.copy(base); stool.position.y = 0.425; scene.add(stool); this.objects.push(stool);
          base.y = 0.85;
          const hitter = this.avatar(base); d.hitters.push(hitter);
          if (mode === 'defense') {
            const mesh = newBallMesh(); hitter.hands[0].add(mesh); mesh.position.y = -(mesh.geometry?.parameters?.radius ?? BALL_R);   /* 球放大後手上的球也跟著往下挪 */
            d.handBalls.push(mesh);
          }
        }
      }
      this.settled = true; this.paused = false; this.next = performance.now() + 900;
      return true;
    },
    drillFeed(now) {
      const d = this.drill;
      const index = Math.floor(Math.random() * d.hitters.length);
      d.hitter = d.hitters[index]; d.strike = false;
      const from = d.mode === 'defense' ? d.handBalls[index].getWorldPosition(new THREE.Vector3()) : (d.feeder || this.coach).g.position.clone();
      if (d.mode !== 'defense') from.y = d.mode === 'atk' || d.mode === 'set' ? 1.1 : 2.1;
      const mesh = newBallMesh(); mesh.position.copy(from);
      const ball = { m: mesh, v: new THREE.Vector3(), rest: 0 };
      mesh.userData.ball = ball; ballsGroup.add(mesh); balls.push(ball); this.owned.add(ball);
      this.ball = ball; this.settled = false; this.next = Infinity; d.poseUntil = now + 500;
      if (d.mode === 'atk') {
        d.awaitingSet = true;
        d.feedPoseUntil = now + 500;
        d.poseUntil = 0;
        const target = this.coach.g.position.clone(); target.y = 2.1;
        const seconds = 1.5;
        const velocity = target.sub(from).multiplyScalar(1 / seconds);
        velocity.y += 4.9 * seconds;
        vbLaunch(ball, from, velocity, 'bump');
        return;
      }
      const send = (target, seconds, kind) => {
        const velocity = target.clone().sub(from).multiplyScalar(1 / seconds);
        velocity.y += 4.9 * seconds; vbLaunch(ball, from, velocity, kind);
      };
      if (d.mode === 'set') {
        const good = Math.random() < 0.7;
        const target = this.world(good ? 1.3 + Math.random() * 0.5 : 3.4 + Math.random() * 3,
          good ? this.sg * (0.5 + Math.random()) : (Math.random() - 0.5) * 7, 2.1);
        send(target, good ? 1.4 : 1.7, 'bump'); return;
      }
      const lane = [-3.25, 0, 3.25][index];
      const cross = Math.random() < 0.5;
      d.target = this.world(5.7 + Math.random() * 1.7, cross ? (lane === 0 ? (Math.random() < 0.5 ? -3 : 3) : -lane) : lane, BALL_R);
      const contact = this.world(-0.95, lane, 3.25);
      d.hitter.g.rotation.y = Math.atan2(d.target.x - contact.x, d.target.z - contact.z);
      if (d.mode === 'defense') d.handBalls[index].visible = false;
      send(contact, d.mode === 'defense' ? 0.95 : 1.18, 'set');
      d.strike = true;
    },
    drillFrame(now) {
      const d = this.drill, ball = this.ball;
      if (d.mode === 'atk') this.face(this.coach);
      if (d.feeder) avDrive(d.feeder, now < d.feedPoseUntil ? AVP.bump : AVP.ready, 0.45);
      if (this.coach) avDrive(this.coach, now < d.poseUntil ? (d.mode === 'set' ? AVP.bump : AVP.setPush) : AVP.ready, 0.45);
      for (const av of d.hitters) {
        const active = av === d.hitter;
        avDrive(av, active && d.strike ? AVP.airUp : active && now < d.hitUntil ? AVP.spikeHit : AVP.ready, 0.45);
      }
      if (ball && !this.settled) {
        if (ball.floorHit || ball.rest > 0.3 || !balls.includes(ball)) this.drillFinish(now);
        else if (d.awaitingSet && ball.v.y < 0 && ball.m.position.y <= 2.2
          && Math.hypot(ball.m.position.x - this.coach.g.position.x, ball.m.position.z - this.coach.g.position.z) < 0.8) {
          const from = ball.m.position.clone();
          const [lx, lz] = toLocalOf(this.court, from.x, from.z);
          const spot = vbSpot({ lx: this.sg }, d.slot, lx, lz, d.variant);
          if (d.slot === 2 && d.variant !== 'high3') {
            const [playerX, playerZ] = toLocalOf(this.court, walk.x, walk.z);
            spot.lx = this.sg * clamp(playerX * this.sg - 0.1, 0.7, 1.4);
            spot.lz = clamp(playerZ, -4, 4);
            spot.y = 3.05;
            spot.T = clamp(0.1 + Math.hypot(spot.lx - lx, spot.lz - lz) * 0.05, 0.15, 0.3);
          }
          const [x, z] = toWorldOf(this.court, spot.lx, spot.lz);
          vbSendSet(ball, x, z, spot.y, spot.T, d.variant === 'high3' ? 6 : d.slot, '陪練', from);
          d.awaitingSet = false;
          d.poseUntil = now + 500;
        }
        else if (d.strike && ball.v.y < 0 && ball.m.position.y <= 3.28) {
          const cp = ball.m.position.clone(), t = 0.55;
          const velocity = d.target.clone().sub(cp).multiplyScalar(1 / t);
          velocity.y += 4.9 * t; vbLaunch(ball, cp, velocity, 'spike');
          d.strike = false; d.hitUntil = now + 420;
        }
      }
      if (now < this.next || (!locked() && !coarse())) return;
      if (ball) {
        ball.m.removeFromParent(); this.owned.delete(ball);
        const i = balls.indexOf(ball); if (i >= 0) balls.splice(i, 1);
      }
      for (const mesh of d.handBalls) mesh.visible = true;
      this.drillFeed(now);
    },
    drillFinish(now) {
      this.drill.awaitingSet = false;
      this.drill.strike = false; this.settled = true; this.next = now + this.drill.delay;
    },
    clearStep() {
      if (this.held?.userData.ball) this.owned.add(this.held.userData.ball);
      for (const ball of this.owned) {
        const i = balls.indexOf(ball); if (i >= 0) balls.splice(i, 1);
        ball.m.removeFromParent();
      }
      if (VB.setSpot && this.owned.has(VB.setSpot.b)) VB.setSpot = null;
      if (VB.target && this.owned.has(VB.target.b)) VB.target = null;
      this.owned.clear();
      for (const object of this.objects) {
        object.removeFromParent();
        if (object.isMesh || object.isLine) { object.geometry.dispose(); object.material.dispose(); }
      }
      this.objects = []; this.mate = null; this.ring = null; this.ball = null; this.next = 0;
      this.coach = null; this.toss = null; this.cj = 0; this.pending=null;this.afterLanding=null;this.zone=null;this.zoneMesh=null;this.blockers=[];this.hitters=[];this.activeHitter=null;this.path=null;this.hitUntil=0;
      if (this.held) {
        this.held.removeFromParent(); if (walk.hold === this.held) walk.hold = null;
        this.held = null;
      }
      walk.serve = null; walk.jserve = null; walk.recv = null; walk.ohQ = null; walk.setQ = null; if (walk.setAim) vbManualSetCancel();
      walk.swing = null; walk.charge = null; walk.chargeArm = null; walk.chargeArmGround = false;
      vbClearAir(); walk.dive = null; walk.down = 0; walk.blkAim = 0; walk.blkShift = 0;
      setMenuClose(false); pose = 'hold'; hands.visible = !!walk.hold;
    },
    start(id) {
      if (!walk.on || VM.on || window.__rkOn || NET.on) { toast('請先進入單人練習房，再開始教學'); return false; }
      const current = vbCourt();
      this.court = current?.c || state.items.find(c => CAT[c.type].court === 'vb' && c.mode !== 'lines' && !c.use);
      if (!this.court) { toast('場館裡需要一座已架網的排球場'); return false; }
      this.sg = current ? Math.sign(current.lx) || 1 : 1; this.id = id;
      if (VB.npc) vbNpcToggle();
      if (walk.hold) { walk.hold.removeFromParent(); walk.hold = null; }
      skill.mode = null; walk.sit = null; walk.spike = null; walk.keys.clear();
      this.place(id === 'move' ? 12 : id === 'recv' ? 5 : id === 'serve' ? 10 : id === 'block' ? 0.7 : 1.8, 0);
      return true;
    },
    step(id, index) {
      this.clearStep(); this.id = id; this.index = index; this.rep=0; this.paused = false;
      this.settled = false; this.failed = false; this.next = performance.now() + 1200;
      if (id === 'move') {
        if(index===4){STA.v=1;STA.lock=false;STA.useT=performance.now();}
        const p=this.moveTarget(index);if(index!==4)this.ring=this.circle(p);this.progress(0);return {x:p.x,z:p.z};
      }
      this.place(id === 'recv' ? 5 : id === 'serve' ? 10 : id === 'block' ? 0.7 : 1.8, 0);
      this.updateZone();
      if (id === 'serve') {
        this.next = Math.max(performance.now(), this.lastServe + 1500);
        if (performance.now() >= this.next) this.give();
        return null;
      }
      this.coach = this.avatar(this.world(id === 'recv' ? -4 : id === 'block' ? -2 : 0.9, id === 'set' || id === 'atk' ? -1.5*this.sg : 0));
      if(id==='recv' && index>=2){
        const base=this.world(-1.25,0);const stool=new THREE.Mesh(new THREE.BoxGeometry(.85,.85,.85),new THREE.MeshStandardMaterial({color:0x876849}));
        stool.position.copy(base);stool.position.y=.425;scene.add(stool);this.objects.push(stool);base.y=.85;this.coach.g.position.copy(base);
      }
      if (id === 'block') {
        this.coach.g.position.copy(this.world(-3,1.4*this.sg));
        this.ring=this.circle(this.world(.7,0));
        for(const z of (index===3?[-3.25,0,3.25]:[0])){
          const base=this.world(-1.25,z),box=new THREE.Mesh(new THREE.BoxGeometry(.85,.85,.85),new THREE.MeshStandardMaterial({color:0x876849}));
          box.position.copy(base);box.position.y=.425;scene.add(box);this.objects.push(box);base.y=.85;this.hitters.push(this.avatar(base));
        }
        if(index===3)for(const z of [-3.25,3.25]){const av=this.avatar(this.world(.7,z));av.g.rotation.y=walk.yaw+Math.PI;this.blockers.push({av,jumping:false});}
      } else this.ring = this.circle(this.world(id === 'recv' ? 5 : 1.45, 0));
      return null;
    },
    give() {
      if (walk.hold || walk.serve || walk.jserve) return;
      if (this.held?.userData.ball) this.owned.add(this.held.userData.ball);
      for (const ball of this.owned) {
        ball.m.removeFromParent(); const i = balls.indexOf(ball); if (i >= 0) balls.splice(i, 1);
      }
      this.owned.clear();
      this.place(10, 0);
      grabBall(); this.held = walk.hold; this.next = Infinity;
    },
    feed() {
      const id = this.id;
      const hard=id==='recv' && this.index>=2;
      const from = this.world(hard?-1.25:id === 'recv' ? -4 : id === 'block' ? -2 : 0.9, id === 'set' || id === 'atk' ? -1.5*this.sg : 0, hard?3.15:id === 'block' ? this.TOSS.y0 : 2.2);
      const mesh = newBallMesh(); mesh.position.copy(from);
      const ball = { m: mesh, v: new THREE.Vector3(), rest: 0 };
      mesh.userData.ball = ball; ballsGroup.add(mesh); balls.push(ball); this.owned.add(ball);
      this.ball = ball; this.settled = false; this.failed = false; this.next = Infinity;
      if(hard){
        ball.tutorialHeavy=this.index===2;
        const target=this.recvTarget(this.index);target.y=BALL_R;
        const flight=this.index===3?.65:.32;
        vbLaunch(ball,from,new THREE.Vector3(0,2.8,0),'set');
        this.toss={ball,receive:true,target,flight};
        const contact=from.clone();contact.y=3.25;const v=target.clone().sub(contact).multiplyScalar(1/flight);v.y+=4.9*flight;this.trajectory(contact,v);
      } else if (id === 'block') {
        const lane=this.index===3?((this.rep||0)%2===0?-3.25:3.25):0;
        const hitter=this.hitters.find(av=>Math.abs(toLocalOf(this.court,av.g.position.x,av.g.position.z)[1]-lane)<.1);
        const cp=this.world(-1.25,lane,3.25),feedOrigin=this.coach.g.position.clone();feedOrigin.y=2.1;
        const v=cp.clone().sub(feedOrigin).multiplyScalar(1/1.18);v.y+=4.9*1.18;ball.m.position.copy(feedOrigin);vbLaunch(ball,feedOrigin,v,'set');
        const target=this.world(6,lane+(this.rep%2?1:-1)*.7,BALL_R);
        this.activeHitter=hitter;if(hitter)hitter.g.rotation.y=Math.atan2(target.x-cp.x,target.z-cp.z);
        this.toss={ball,receive:true,target,flight:.55,block:true,hitter};
        this.ring.position.copy(this.world(.7,lane));this.ring.position.y=.035;
        this.mate=this.blockers.find(m=>Math.abs(toLocalOf(this.court,m.av.g.position.x,m.av.g.position.z)[1]-lane)<.1)||null;
        const attackV=target.clone().sub(cp).multiplyScalar(1/.55);attackV.y+=4.9*.55;this.trajectory(cp,attackV);
      } else if (id === 'atk') {
        const target = this.world(1.45, 0);
        vbSendSet(ball, target.x, target.z, 3.05, 1.1, 2, '教練', from);this.trajectory(ball.m.position,ball.v);
      } else {
        const target = id === 'recv' ? this.recvTarget(this.index) : new THREE.Vector3(walk.x - Math.sin(walk.yaw) * 0.3, 0, walk.z - Math.cos(walk.yaw) * 0.3);
        const velocity = id === 'recv' ? solveShot(from, target.x, target.z, this.court, -this.sg, this.index === 2 ? 1.25 : 1.65)
          : new THREE.Vector3((target.x - from.x) / 1.15, (2.05 - from.y) / 1.15 + 4.9 * 1.15, (target.z - from.z) / 1.15);
        vbLaunch(ball, from, velocity, 'bump');this.trajectory(ball.m.position,ball.v);
      }
    },
    incoming() {
      if (this.id !== 'recv' || !this.ball || this.settled || this.ball.floorHit) return null;
      if(this.toss?.receive)return {x:this.toss.target.x,z:this.toss.target.z,t:this.toss.flight};
      return vbPredict(this.ball.m.position, this.ball.v, BALL_R);
    },
    together() {
      const mate = this.mate;
      return !!(mate && mate.jumping && walk.air?.block && walk.air.y > 0.02 &&
        Math.hypot(mate.av.g.position.x - walk.x, mate.av.g.position.z - walk.z) <= 1.5);
    },
    event(name, data, ball) {
      if (this.drill) {
        const expected = { set: 'set', block: 'block', defense: 'recv' }[this.drill.mode];
        if (!this.settled && expected === name && ball === this.ball) this.drillFinish(performance.now());
        return false;
      }
      if(['recv','set','atk','block'].includes(name) && ball && ball!==this.ball)return false;
      if (name === 'jump' && data.block && this.mate) this.mate.jumping = true;
      if (name === 'recvMiss') {
        if (!this.ball || this.settled || this.failed) return false;
        this.failed = true;
      }
      if (['recv','set','atk','block','serve'].includes(name) && ball) {
        if(this.pending || ball.floorHit || ball===this.ball && this.settled)return false;
        this.owned.add(ball);this.ball=ball;this.settled=false;
        if(name==='serve')this.lastServe=performance.now();
        this.pending={name,data,zoneReached:false};this.next=Infinity;this.toss=null;
        if(this.path)this.path.visible=false;
        return false;
      }
      return true;
    },
    frame() {
      if (this.paused || !this.id) return;
      const now = performance.now();
      if (this.drill) { this.drillFrame(now); return; }
      if (this.mate) {
        const air = this.mate.jumping && walk.air?.block ? walk.air : null;
        this.mate.av.g.position.y = air ? air.y : 0;
        avDrive(this.mate.av, air ? avBlockPose(walk.blkShift || 0) : AVP.idle, 0.5, 0, !!air);
        if (!air) this.mate.jumping = false;
      }
      if (this.coach) this.face(this.coach);   // 拋球／餵球的教練一直面向玩家
      if (this.toss) this.tossStep(now);
      if(this.id==='block'){if(this.coach)avDrive(this.coach,this.toss?AVP.setPush:AVP.ready,.5);for(const av of this.hitters)avDrive(av,this.toss?.hitter===av?AVP.airUp:av===this.activeHitter && now<this.hitUntil?AVP.spikeHit:AVP.ready,.5);}
      if(this.coach && this.id==='recv' && this.index>=2)avDrive(this.coach,this.toss?AVP.serveToss:now<this.hitUntil?AVP.spikeHit:AVP.ready,.5,0,false);
      const incoming = this.incoming();
      if (this.id === 'recv' && this.ring) {
        this.ring.visible = !!incoming || this.settled;
        if (incoming) this.ring.position.set(incoming.x, 0.035, incoming.z);
        const arc=this.ring.userData.progress;if(arc){arc.position.copy(this.ring.position);arc.position.y+=.003;}
      }
      if(this.pending && this.zone && this.id==='recv'){
        const p=this.ball.m.position;
        if(p.y>=1.5 && p.y<=3.2 && this.ball.v.y<0 && Math.hypot(p.x-this.zone.p.x,p.z-this.zone.p.z)<=this.zone.r)this.pending.zoneReached=true;
      }
      if (this.ball && !this.settled && (this.ball.floorHit || this.ball.rest > 0.3 || !balls.includes(this.ball))) {
        this.settled=true;this.next=now+2000;
        const pending=this.pending;this.pending=null;
        const floor=this.ball.floorHit;
        const inside=!this.zone || (this.id==='recv'?pending?.zoneReached:floor && Math.hypot(floor[0]-this.zone.p.x,floor[1]-this.zone.p.z)<=this.zone.r);
        if(this.afterLanding){const finish=this.afterLanding;this.afterLanding=null;finish();}
        else if(pending && inside)window.VBTutorial.emit(pending.name,pending.data);
        else if(!this.failed){this.failed=true;window.VBTutorial.emit('feedMiss',pending && this.zone?{reason:this.id==='recv'?'球沒有進入藍色舉球區。面向目標、站穩再接；重扣要蹲低卸力。':'落點未進入藍色區域，調整方向再試一次。'}:{});}
      }
      if (this.id === 'serve') {
        if (!this.pending && !walk.hold && !walk.serve && !walk.jserve && this.next === Infinity) this.next = now + 1500;
        if (now >= this.next) this.give();
        return;
      }
      if (this.id === 'move' || now < this.next || !locked()) return;
      if (this.id === 'block' && this.index!==3 && Math.hypot(walk.x - this.ring.position.x, walk.z - this.ring.position.z) > 0.8) return;
      if (this.ball) { this.ball.m.removeFromParent(); const i = balls.indexOf(this.ball); if (i >= 0) balls.splice(i, 1); this.owned.delete(this.ball); }
      this.feed();
    },
    pause() { this.paused = true; this.next = Infinity; },
    stop() { if (!this.id) return; this.clearStep(); this.drill = null; this.id = null; this.court = null; this.paused = false; this.lastServe = -Infinity; },
    release() { unlockMouse(); walk.keys.clear(); }
  };
  const AI_GAME = {
    get gameRandom() { return gameRandom; },
    get BALL_R() { return BALL_R; },
    get JUMP_G() { return JUMP_G; },
    get NET() { return NET; },
    get NETS() { return NETS; },
    get ROLE_SUPER() { return ROLE_SUPER; },
    get THREE() { return THREE; },
    get V6_BASE() { return V6_BASE; },
    get V6_NAME() { return V6_NAME; },
    get VM() { return VM; },
    get VM_LEVELS() { return VM_LEVELS; },
    get balls() { return balls; },
    get ballsGroup() { return ballsGroup; },
    get clamp() { return clamp; },
    get netBallHit() { return netBallHit; },
    get newBallMesh() { return newBallMesh; },
    get rkGauss() { return rkGauss; },
    get serveVel() { return serveVel; },
    get sfx() { return sfx; },
    get staCfg() { return staCfg; },
    get staCost() { return staCost; },
    get state() { return state; },
    get toast() { return toast; },
    get vbClearAir() { return vbClearAir; },
    get vbHardDefl() { return vbHardDefl; },
    get vbImpact() { return vbImpact; },
    get vbLaunch() { return vbLaunch; },
    get vbMarkSet() { return vbMarkSet; },
    get vbShotVel() { return vbShotVel; },
    get vm6Front() { return vm6Front; },
    get vm6Idx() { return vm6Idx; },
    get vm6P() { return vm6P; },
    get vmBallL() { return vmBallL; },
    get vmL() { return vmL; },
    get vmLv() { return vmLv; },
    get vmMe() { return vmMe; },
    get vmOnTouch() { return vmOnTouch; },
    get vmOppPos() { return vmOppPos; },
    get vmPos() { return vmPos; },
    get vmPositionSetters() { return vmPositionSetters; },
    get vmPredL() { return vmPredL; },
    get vmPro() { return vmPro; },
    get vmProLv() { return vmProLv; },
    get vmServer() { return vmServer; },
    get vmSide() { return vmSide; },
    get vmSmallCount() { return vmSmallCount; },
    get vmSmallLabel() { return vmSmallLabel; },
    get vmTeamOf() { return vmTeamOf; },
    get vmW() { return vmW; },
    get walk() { return walk; },
  };
  let AI_ENGINE = null;
  function aiEngine() { return AI_ENGINE || (AI_ENGINE = createAi(AI_GAME)); }
  let frameNo = 0;
  function vmSmallCount() { const n = VM.six && VM.team?.[0]?.length; return n === 1 || n === 3 || n === 4 || n === 5 ? n : 0; }
  function vmPositionSetters(team) {
    const rot = VM.rot[team], n = vmSmallCount();
    if (!n) return [rot[2],rot[1],rot[3],rot[5],rot[0],rot[4]].filter(Boolean);
    const zones = CourtFormations.get(n);
    return rot.map((id,k)=>({id,k,z:zones[k]})).sort((a,b)=>Number(b.z.front)-Number(a.z.front) || a.z.L-b.z.L || a.k-b.k).map(q=>q.id);
  }
  function vm6SyncRotationRoles() {
    if (!VM.six || VM.tactics !== 'rotation' || VM.team?.[0]?.length !== 6) return;
    const roles=['MB','OPP','S','OH','MB','OH'];
    for (const rot of VM.rot) rot.forEach((id,k)=>{
      VM.role[id]=roles[k];const a=VM.ai.get(id);
      if(a){a.name=VM.names[id]=`AI・${k+1}號位`;if(a.tag?.element)a.tag.element.textContent=a.name;}
    });
    mrecRoles();
  }
  function vmSmallLabel(id) { const k = vm6Idx(id); return k < 0 ? '觀眾' : `${k+1} 號位 · ${CourtFormations.get(vmSmallCount())[k].name}`; }
  function vmSmallOverlap() {
    const t = 1-VM.srvTeam, sd = vmSide(t);
    const positions = VM.rot[t].map(id=>{const q=vmPos(id);return q?{d:q.x*sd,L:q.z/sd}:null;});
    const fault = CourtFormations.overlap(vmSmallCount(),positions);
    return fault ? {team:t,why:`位置錯誤（${fault.axis==='d'?'前後':'左右'}越位：${fault.low+1} 與 ${fault.high+1} 號位）`} : null;
  }
  // 一格比賽：跟網頁 drawFrame 裡比賽相關的順序一樣（體力 → 比賽 → 球）
  function step(dt) { staTick(dt); vmUpdate(dt); updateBalls(dt); }
  // 伺服器當房主時的一格：跟網頁 drawFrame 的順序一樣（連線送狀態 → 比賽 → 球 → 送比賽畫格）
  function hostStep(dt) { const now = performance.now(); staTick(dt); netTick(dt, now); vmUpdate(dt); updateBalls(dt); vmWireTick(); }
  return { GAME_RNG, VM, MREC, balls, walk, NET, VB, vmStart, vm6Start, vmUpdate, updateBalls, vmSetupServe, vmMe, step, hostStep, netTick, vmWireTick, netOnMessage, vmApplyRoomRules, get state() { return state; }, setState(v) { state = v; } };
}
