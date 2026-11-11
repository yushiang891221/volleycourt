import { friendList, addFriend, respondFriend, openFriendsPanel } from './friends.js';
import { authMode } from './auth.js';

const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('./player-social.css', import.meta.url).href; document.head.append(css);
export function relationshipLabel(state, signedIn) {
  if (!signedIn) return '登入後才能加好友';
  return { outgoing: '已送出邀請（取消）', incoming: '接受好友邀請', friend: '傳私訊' }[state] || '加好友';
}
export async function bindFriendAction(button, nickname, after = () => {}) {
  const signedIn = authMode() === 'account';
  button.disabled = true;
  button.textContent = '讀取好友關係…';
  const friend = signedIn ? (await friendList()).find(f => f.nickname === nickname) : null;
  button.textContent = relationshipLabel(friend?.state, signedIn); button.disabled = !signedIn;
  button.onclick = async () => {
    button.disabled = true;
    try {
      if (friend?.state === 'friend') { after(); await openFriendsPanel(undefined, nickname); return; }
      if (friend) await respondFriend(friend, friend.state === 'incoming');
      else await addFriend(nickname);
      await bindFriendAction(button, nickname, after);
    } catch (error) { button.textContent = error.message; button.disabled = false; }
  };
}
let menu = null, generation = 0;
function closeMenu() { generation++; menu?.remove(); menu = null; }
export async function openPlayerMenu(event, nickname) {
  if (!nickname || nickname === globalThis.VBSettings?.values.nickname) return;
  event.preventDefault(); closeMenu();
  const current = generation;
  const box = document.createElement('div'); box.className = 'player-menu'; box.setAttribute('role', 'menu');
  const profile = document.createElement('button'); profile.type = 'button'; profile.textContent = '檢視個人檔案';
  profile.onclick = async () => { closeMenu(); await (await import('./public-profile.js')).openPublicProfile(nickname); };
  const action = document.createElement('button'); action.type = 'button';
  box.append(profile, action);
  const parent = event.target?.closest('dialog[open]') || document.body; parent.append(box); menu = box;
  const position = () => {
    box.style.left = Math.max(4, Math.min(event.clientX, innerWidth - box.offsetWidth - 4)) + 'px';
    box.style.top = Math.max(4, Math.min(event.clientY, innerHeight - box.offsetHeight - 4)) + 'px';
  };
  position(); profile.focus();
  try { await bindFriendAction(action, nickname, closeMenu); }
  catch (error) { action.textContent = error.message; action.disabled = true; }
  if (current === generation) position();
}
document.addEventListener('contextmenu', event => {
  const name = event.target.closest('[data-player]');
  if (name) openPlayerMenu(event, name.dataset.player);
});
document.addEventListener('pointerdown', event => { if (menu && !menu.contains(event.target)) closeMenu(); }, true);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu) { event.preventDefault(); event.stopPropagation(); closeMenu(); } }, true);
document.addEventListener('keydown', event => {
  if (event.target.closest('.player-menu, .public-profile, #friends-panel, #friend-notices')) event.stopPropagation();
});
document.addEventListener('scroll', closeMenu, true);
addEventListener('resize', closeMenu);
