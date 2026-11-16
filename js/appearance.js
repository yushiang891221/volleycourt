import { encodeLook, decodeLook, randomLook, decodeEquip, encodeEquip } from './avatar-toy.js';
import { decodeJersey, CUTS, CUT_TOP } from './jersey.js';

export const LOOK_KEY = 'vb.settings.look';
export const normalizeLook = code => encodeLook(decodeLook(code));
export function readLook() {
  try { return localStorage.getItem(LOOK_KEY); } catch { return null; }
}
export function saveLook(look) {
  const { eq, ...base } = look || {}, code = encodeLook(base);   // 外觀本身（帳號裡存的）不含裝備；裝備另外存
  localStorage.setItem(LOOK_KEY, code);
  try { dispatchEvent(new Event('vb-look-change')); } catch {}   // 大廳角色卡重畫
  return code;
}
export const needsCreator = () => !readLook();
// 裝備（帽子、眼鏡、項鍊、護腕）：先存在這台電腦；護膝還是外觀的一部分
export const EQUIP_KEY = 'vb.settings.equip';
export function readEquip() { try { return decodeEquip(localStorage.getItem(EQUIP_KEY) || '') || {}; } catch { return {}; } }
export function saveEquip(eq) {
  try { const c = encodeEquip(eq); if (c) localStorage.setItem(EQUIP_KEY, c); else localStorage.removeItem(EQUIP_KEY); } catch {}
  try { dispatchEvent(new Event('vb-look-change')); } catch {}
}
// WEB-010 球隊球衣：穿上時存在這台電腦（{ name, body, trim, num }），比賽以外的時間穿（比賽照兩隊隊服）
export const TEAM_JERSEY_KEY = 'vb.teamJersey';
export function readTeamJersey() { try { const j = JSON.parse(localStorage.getItem(TEAM_JERSEY_KEY) || 'null'); return j && /^#[0-9a-fA-F]{6}$/.test(j.body || '') ? j : null; } catch { return null; } }
export function saveTeamJersey(j, takeOffMine = true) { try { if (j) localStorage.setItem(TEAM_JERSEY_KEY, JSON.stringify({ name: j.name, body: j.body, trim: j.trim, num: j.num })); else localStorage.removeItem(TEAM_JERSEY_KEY); } catch {}
  if (j && takeOffMine) { try { const v = JSON.parse(localStorage.getItem(MY_JERSEYS_KEY) || 'null'); if (v && v.wear >= 0) { v.wear = -1; localStorage.setItem(MY_JERSEYS_KEY, JSON.stringify(v)); dispatchEvent(new Event('vb-jersey-change')); } } catch {} } try { dispatchEvent(new Event('vb-look-change')); } catch {} }
// 個人球衣（J2）：最多存 3 件（代碼見 js/jersey.js），wear＝穿第幾件（-1＝沒穿自己的）。存在這台電腦，J3 再存進帳號。
// 跟球隊球衣二選一：穿自己的就脫掉球隊球衣，反過來也一樣。比賽中一律照兩隊隊服。
export const MY_JERSEYS_KEY = 'vb.myJerseys', MY_JERSEY_MAX = 3;
export function readMyJerseys() {
  try {
    const v = JSON.parse(localStorage.getItem(MY_JERSEYS_KEY) || 'null') || {};
    const list = (Array.isArray(v.list) ? v.list : []).slice(0, MY_JERSEY_MAX).map((c) => (decodeJersey(c) ? c : null));
    while (list.length < MY_JERSEY_MAX) list.push(null);
    const wear = Number.isInteger(v.wear) && list[v.wear] ? v.wear : -1;
    return { list, wear };
  } catch { return { list: Array(MY_JERSEY_MAX).fill(null), wear: -1 }; }
}
// fromAccount＝從帳號讀回來的（不用再傳上去）；其他改動會發 vb-jersey-change，帳號同步（account-flow.js）聽到就存進帳號
export function saveMyJerseys(v, fromAccount = false) {
  try { localStorage.setItem(MY_JERSEYS_KEY, JSON.stringify({ list: v.list.slice(0, MY_JERSEY_MAX), wear: v.wear })); } catch {}
  try { dispatchEvent(new Event('vb-look-change')); if (!fromAccount) dispatchEvent(new Event('vb-jersey-change')); } catch {}
}
// 存第 i 件（wear＝true 就順便穿上）
export function saveMyJersey(i, code, wear = true) {
  const d = decodeJersey(code);
  if (!d || !(i >= 0 && i < MY_JERSEY_MAX)) return false;
  const v = readMyJerseys(); v.list[i] = code; if (wear) { v.wear = i; saveTeamJersey(null, false); setLookTop(CUT_TOP[d.cut]); }
  saveMyJerseys(v); return true;
}
export function wearMyJersey(i) {   // i＝-1 脫掉自己的
  const v = readMyJerseys(); v.wear = i >= 0 && v.list[i] ? i : -1;
  if (v.wear >= 0) { saveTeamJersey(null, false); setLookTop(CUT_TOP[decodeJersey(v.list[v.wear]).cut]); }
  saveMyJerseys(v);
}
// 基本球衣（短袖、長袖、短版、無袖；照預設隊服顏色）：脫掉球隊球衣和自己的，角色換成這種袖子
export const BASIC_JERSEYS = CUTS.map((name, i) => ({ name: `基本球衣・${name}`, top: CUT_TOP[i] }));
export function wearBasicJersey(i) {
  saveTeamJersey(null, false); setLookTop(BASIC_JERSEYS[i].top);
  try { localStorage.removeItem(TEAM_WEAR_KEY); } catch {}
  try { dispatchEvent(new Event('vb-look-change')); } catch {}
}
// 袖型存在外觀裡（比賽穿隊服時也用這種袖子；外觀會同步到帳號）
function setLookTop(top) { const L = decodeLook(readLook()); if (L.top !== top) { L.top = top; saveLook(L); } }
// 球隊球衣（T3）：穿球隊的第幾件，存在這台電腦 { idx, code }（帳號裡也有，登入時 account-flow 會同步）
// 個人設計的「我的球衣」已經拿掉（使用者決定球衣只有球隊能設計），資料保留但不再穿
export const TEAM_WEAR_KEY = 'vb.teamWear';
export function readTeamWear() { try { const v = JSON.parse(localStorage.getItem(TEAM_WEAR_KEY) || 'null'); return v && Number.isInteger(v.idx) && decodeJersey(v.code) ? v : null; } catch { return null; } }
export function wearTeamJersey(idx, code) {   // idx＝-1 或 code 空＝脫掉（穿基本球衣）
  const d = idx >= 0 && decodeJersey(code);
  try { if (d) localStorage.setItem(TEAM_WEAR_KEY, JSON.stringify({ idx, code })); else localStorage.removeItem(TEAM_WEAR_KEY); } catch {}
  if (d) setLookTop(CUT_TOP[d.cut]);
  try { dispatchEvent(new Event('vb-look-change')); } catch {}
}
// 比賽以外穿什麼：球隊球衣 { design: 代碼 } ＞ null（基本球衣，照預設隊服顏色）
export function readWornJersey() {
  const w = readTeamWear();
  return w ? { design: w.code } : null;
}
// 自己的外觀＋裝備（連線送給別人、遊戲裡的角色用這個）
export const myLookCode = () => encodeLook({ ...decodeLook(readLook()), eq: readEquip() });
export const teamKit = team => team === 1 ? 'blue' : 'orange';
export function aiLook(id) {
  let seed = 0;
  for (const char of String(id)) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  return encodeLook(randomLook(seed));
}
