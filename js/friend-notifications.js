let pending = new Map(), cards = new Map(), seen = new Set();
const key = () => 'vb.friend.seen.' + (globalThis.VBSettings?.values.nickname || '');
let activeKey;
function loadSeen() {
  if (activeKey === key()) return;
  activeKey = key(); seen = new Set(); pending.clear();
  for (const card of cards.values()) card.remove();
  cards.clear();
  try { seen = new Set(JSON.parse(sessionStorage.getItem(activeKey) || '[]')); } catch {}
}
function save() { try { sessionStorage.setItem(key(), JSON.stringify([...seen])); } catch {} }
let playing = () => false;
export function configureNotifications(check) { playing = check; }
export function reconcileInvites(list) {
  loadSeen();
  const ids = new Set(list.filter(f => f.state === 'incoming').map(f => f.id));
  for (const id of seen) if (!ids.has(id)) seen.delete(id);
  for (const [id, card] of cards) if (!ids.has(id)) { card.remove(); cards.delete(id); }
  for (const id of pending.keys()) if (!ids.has(id)) pending.delete(id);
  save();
}
export function queueInvites(list) {
  reconcileInvites(list);
  for (const f of list) if (f.state === 'incoming' && !seen.has(f.id)) pending.set(f.id, f);
  flushInvites();
}
export function flushInvites() {
  const host = document.getElementById('friend-notices');
  if (host) host.hidden = playing();
  if (playing()) return;
  for (const [id, friend] of pending) {
    pending.delete(id);
    if (seen.has(id)) continue;
    let stack = document.getElementById('friend-notices');
    if (!stack) { stack = document.createElement('aside'); stack.id = 'friend-notices'; stack.setAttribute('aria-live', 'polite'); document.body.append(stack); }
    const card = document.createElement('section'); card.className = 'friend-notice';
    const title = document.createElement('b'); title.textContent = `${friend.nickname} 想加你好友`; card.append(title);
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    for (const label of ['接受', '拒絕', '檢視檔案']) {
      const button = document.createElement('button'); button.textContent = label; button.type = 'button';
      button.onclick = async () => {
        button.disabled = true;
        try {
          if (label === '檢視檔案') await (await import('./public-profile.js')).openPublicProfile(friend.nickname);
          else { await (await import('./friends.js')).respondFriend(friend, label === '接受'); card.remove(); cards.delete(id); }
        } catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
      };
      card.append(button);
    }
    card.append(status); stack.append(card); cards.set(id, card); seen.add(id); save();
  }
}
