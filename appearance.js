import { encodeLook, decodeLook, randomLook, decodeEquip, encodeEquip } from './avatar-toy.js';

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
export function saveTeamJersey(j) { try { if (j) localStorage.setItem(TEAM_JERSEY_KEY, JSON.stringify({ name: j.name, body: j.body, trim: j.trim, num: j.num })); else localStorage.removeItem(TEAM_JERSEY_KEY); } catch {} try { dispatchEvent(new Event('vb-look-change')); } catch {} }
// 自己的外觀＋裝備（連線送給別人、遊戲裡的角色用這個）
export const myLookCode = () => encodeLook({ ...decodeLook(readLook()), eq: readEquip() });
export const teamKit = team => team === 1 ? 'blue' : 'orange';
export function aiLook(id) {
  let seed = 0;
  for (const char of String(id)) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  return encodeLook(randomLook(seed));
}
