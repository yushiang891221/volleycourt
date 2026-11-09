import { encodeLook, decodeLook, randomLook } from './avatar-toy.js';

export const LOOK_KEY = 'vb.settings.look';
export const normalizeLook = code => encodeLook(decodeLook(code));
export function readLook() {
  try { return localStorage.getItem(LOOK_KEY); } catch { return null; }
}
export function saveLook(look) {
  const code = encodeLook(look);
  localStorage.setItem(LOOK_KEY, code);
  return code;
}
export const needsCreator = () => !readLook();
export const teamKit = team => team === 1 ? 'blue' : 'orange';
export function aiLook(id) {
  let seed = 0;
  for (const char of String(id)) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  return encodeLook(randomLook(seed));
}
