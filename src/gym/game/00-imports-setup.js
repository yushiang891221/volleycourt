import * as THREE from 'three';
import { preloadAvatars, makeToyAvatar, decodeLook, kitOf, OPTIONS as LOOK_OPTIONS } from './js/avatar-toy.js';
import { readLook, normalizeLook, teamKit, aiLook, myLookCode, readTeamJersey, readWornJersey } from './js/appearance.js';
import { preloadReal, attachReal, driveReal, setRealObstacles, preloadHeadsFor } from './js/avatar-real.js';   // 新角色（寫實身體＋VRoid 日系頭）
import { decodeJersey, CUT_TOP } from './js/jersey.js';
import { pickServer } from './js/servers.js';   // 選伺服器：房間連哪一台   // 個人球衣 J4：別人送來的球衣代碼
import { myTitle, myWheel, EMOTES } from './js/progress.js';   // WEB-010：稱號、T 輪盤
import { getAccountService } from './js/auth.js';
import { ballSubstep, ballSubsteps } from './engine/ball.js';   // B1：球的物理（伺服器共用）
import { touchCounts, judgeTouch, scorePoint, judgeLanding } from './engine/rules.js';   // B2：排球規則（伺服器共用）
import { createAi } from './engine/ai.js';   // B3：AI 球員（伺服器共用）
// 純畫面／聲音效果（粒子、音高、鏡頭晃動、腳步聲、環境動畫）用自己的亂數：比賽邏輯的 Math.random 不受畫面影響，伺服器（沒有畫面）跟網頁才會算出一樣的比賽
// 比賽邏輯專用亂數（AI、發球、擦網、攔網結果…）：平常照 Math.random；設定種子（GAME_RNG.s）後每次算出一樣的比賽（伺服器與網頁比對用）
const GAME_RNG = { s: 0 };
function gameRandom() { if (!GAME_RNG.s) return Math.random(); GAME_RNG.s = (GAME_RNG.s * 16807) % 2147483647; return GAME_RNG.s / 2147483647; }
const fxRandom = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const gameAccount = await getAccountService();
// 開發模式：只有在本機（localhost）網址加 &dev 才能不登入進練習房，方便測試；正式網站一律要登入
const DEV_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('dev');
try { if (!DEV_LOCAL) await gameAccount.accessToken(); } catch {
  if (new URLSearchParams(location.search).get('lobby') === '1') throw new Error('大廳球館：還沒登入');   /* 放在大廳背景時不要跳頁（不然大廳裡又套一個大廳） */
  location.replace('index.html#lobby');
  throw new Error('請先登入。');
}
await preloadAvatars(); // 首次建立玩家／AI 之前等待；失敗由模型模組回退。
// 新角色：預設就用（2026-11-24 起全部換新角色）；網址 ?real=0 是開發用的退路（舊公仔）。載入失敗也退回公仔
const REAL_ON = new URLSearchParams(location.search).get('real') !== '0' && await preloadReal();
if (REAL_ON) { try { await preloadHeadsFor(decodeLook(myLookCode())); } catch {} }   // 自己的頭在載入畫面就下載好，進場不會先看到沒有頭的身體
const REAL_AVS = new Set();
const LOBBY_MODE = new URLSearchParams(location.search).get('lobby') === '1';   // 大廳背景的球館（18-lobby-mode.js）
const GAME_ONLY = true; // Fixed venue; editor code remains isolated from gameplay.
const CREATOR_SHOT = new URLSearchParams(location.search).get('shot') === 'creator';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const $ = (id) => document.getElementById(id);
// Page sources, captured before anything changes the DOM, so a save can rebuild the page.
const SRC = {
  app: $('app').outerHTML,
  style: $('app-style').textContent,
  importmap: $('app-importmap').textContent,
  script: $('app-script').textContent,
};
const FONT_LINK = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap">';
let SAVED = [];
try { const v = JSON.parse($('saved-designs').textContent || '[]'); if (Array.isArray(v)) SAVED = v; } catch (e) { SAVED = []; }
// 網站上（不是 Claude 預覽）沒辦法改寫頁面本身，「存成新方案」改存在這台裝置的瀏覽器（localStorage）
const LOCAL_SAVED_KEY = 'vb.saved.v1';
const EMBED_IDS = new Set(SAVED.map((x) => x.id));
try { const v = JSON.parse(localStorage.getItem(LOCAL_SAVED_KEY) || '[]'); if (Array.isArray(v)) SAVED = SAVED.concat(v.filter((x) => x && x.id && x.data && !EMBED_IDS.has(x.id))); } catch (e) { /* ignore */ }

const PING = 3.3058;
const DRAFT_KEY = 'vbgym3d.draft.v1';
const STASH_KEY = 'vbgym3d.after-save.v1';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// pu = 綠色 PU 球場、木地板周邊（新版預設）；其他是舊方案的配色，保留給已存的方案
const SCHEMES = {
  pu: { name: '綠色 PU＋灰色地坪', base: '#C9C5BE', free: '#5E9378', court: '#73A88C', bd: '#3C8A63', pb: '#2F6F86', kitchen: '#4B93A6', bk: '#B5763E', key: '#8E4F2E' },
  blue: { name: '藍底橘場', base: '#5D7F9E', free: '#2F5D8C', court: '#E07B39', bd: '#2E8B57', pb: '#2F7F86', kitchen: '#4BA3AB', bk: '#B5763E', key: '#8E4F2E' },
  green: { name: '綠底藍場', base: '#5E8A72', free: '#2E6B4F', court: '#3F7FBF', bd: '#3C9A6A', pb: '#2F6F9F', kitchen: '#4B8EC0', bk: '#B07A44', key: '#7E4C2C' },
  wood: { name: '全木地板', base: '#A88458', wood: true, free: '#C79A63', court: '#DDB27A', bd: '#4F9A6B', pb: '#3C7F8C', kitchen: '#5AA1AC', bk: '#C08850', key: '#94582F' },
  fivb: { name: 'PVC 地墊・國際賽配色（陶紅＋藍綠）', base: '#C9C5BE', hall: 'pvc', free: '#2E8C8C', court: '#C4553A', pad: '#22304A', bd: '#3C8A63', pb: '#2F6F86', kitchen: '#4B93A6', bk: '#B5763E', key: '#8E4F2E' },
  tiles: { name: '拼裝式地墊（藍＋橘）', base: '#8E9399', hall: 'concrete', free: '#2D5DA1', court: '#E07B39', tiles: true, pad: '#22304A', bd: '#3C8A63', pb: '#2F6F86', kitchen: '#4B93A6', bk: '#B5763E', key: '#8E4F2E' },
  hardwood: { name: '實木地板（楓木）', base: '#C9C5BE', hall: 'concrete', free: '#E3C08C', court: '#E3C08C', grain: true, pad: '#22304A', bd: '#3C8A63', pb: '#2F6F86', kitchen: '#4B93A6', bk: '#B5763E', key: '#8E4F2E' },
  yb: { name: '黃色球場＋藍灰邊區', base: '#C9C5BE', hall: 'vinyl', free: '#6F8CAF', court: '#E9B53A', pad: '#B8352E', bd: '#3C8A63', pb: '#2F6F86', kitchen: '#4B93A6', bk: '#B5763E', key: '#8E4F2E' },
  maple: { name: '淺色木紋運動地板', base: '#B9B5AE', hall: 'concrete', free: '#D9B07A', court: '#D9B07A', grain: true, pad: '#C0392B', bd: '#3C8A63', pb: '#2F6F86', kitchen: '#4B93A6', bk: '#B5763E', key: '#8E4F2E' },
  honey: { name: '蜂蜜色木紋地板', base: '#7C7F84', hall: 'concrete', free: '#D59A55', court: '#D59A55', grain: true, pad: '#2F5FA8', bd: '#3C8A63', pb: '#2F6F86', kitchen: '#4B93A6', bk: '#B5763E', key: '#8E4F2E' },
  og: { name: '橘色球場＋綠色邊區', base: '#8E9399', hall: 'pvc', free: '#2F8A6A', court: '#E2843A', pad: '#2F5FA8', bd: '#3C8A63', pb: '#2F6F86', kitchen: '#4B93A6', bk: '#B5763E', key: '#8E4F2E' },
  grey: { name: '灰底紅場', base: '#7A828C', free: '#5B6470', court: '#B5473A', bd: '#3E8C62', pb: '#3B7480', kitchen: '#5296A0', bk: '#A9733F', key: '#7C4A2B' },
};
const NETS = { men: { label: '男網 2.43 m', h: 2.43 }, women: { label: '女網 2.24 m', h: 2.24 }, mixed: { label: '混網 2.35 m', h: 2.35 } };

