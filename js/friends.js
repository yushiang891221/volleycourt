import { configureNotifications, reconcileInvites, queueInvites, flushInvites } from './friend-notifications.js';
import './player-menu.js';
// WEB-011 好友系統：加好友（暱稱）、接受／拒絕邀請、好友清單（大廳在線的會亮）、私訊、未讀數
// 資料在 Supabase（server/supabase/005_friends.sql）；沒登入或還沒建資料表時，按鈕會提示、不會壞掉
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function svc() {
  const { getAccountService, authMode } = await import('./auth.js');
  if (authMode() !== 'account') throw new Error('要登入才能使用好友');
  const s = await getAccountService(); if (!s || !(await s.signedIn())) throw new Error('要登入才能使用好友');
  return s;
}
const call = async (name, args) => (await svc()).rpc(name, args);

// 從清單上加好友（大廳在線玩家、比賽中的玩家）
export async function addFriend(nickname) {
  const r = await call('friend_request', { p_nickname: String(nickname || '').trim() });
  await friendList(true);
  await refreshBadge();
  return { sent: `已送出好友邀請給「${nickname}」`, pending: `已經邀請過「${nickname}」了，等對方接受`, already: `「${nickname}」已經是你的好友`, accepted: `你和「${nickname}」成為好友了！` }[r] || '已送出好友邀請';
}

// 大廳底下「好友」按鈕的未讀／邀請數字
let cachedList = null, cachedAt = 0, listPending = null;
export async function friendList(force = false) {
  if (!force && cachedList && Date.now() - cachedAt < 60000) return cachedList;
  if (force && listPending) await listPending;
  if (!listPending) listPending = call('friend_list').then(list => {
    cachedList = list || []; cachedAt = Date.now(); reconcileInvites(cachedList); return cachedList;
  }).finally(() => { listPending = null; });
  return listPending;
}
export async function respondFriend(friend, accept) {
  await call('friend_respond', { p_user: friend.id, p_accept: accept });
  await friendList(true); await refreshBadge();
}
let badgeTimer = 0, badgePending = null, lastIncoming = -1, detailedBadge = true;
export function refreshBadge() {
  if (badgePending) return badgePending;
  badgePending = (async () => {
    const badge = document.getElementById('friends-badge');
    try {
      let counts, list;
      if (detailedBadge) {
        try { counts = await call('friend_badge', { p_details: true }); }
        catch (error) { if (/還沒開通/.test(error.message)) detailedBadge = false; else throw error; }
      }
      if (!counts) {
        list = await friendList(true);
        counts = { incoming: list.filter(f => f.state === 'incoming').length, total: list.reduce((n, f) => n + (f.unread | 0) + Number(f.state === 'incoming'), 0) };
      }
      if (badge) { badge.textContent = counts.total > 99 ? '99+' : String(counts.total); badge.hidden = !counts.total; }
      if (counts.incoming > lastIncoming && counts.incoming > 0) queueInvites(list || await friendList(true));
      lastIncoming = counts.incoming;
    } catch { if (badge) badge.hidden = true; }
  })().finally(() => { badgePending = null; });
  return badgePending;
}
export function startBadge(playing = () => false) {
  configureNotifications(playing);
  if (badgeTimer) return;
  refreshBadge(); badgeTimer = setInterval(() => { if (!document.hidden) refreshBadge(); }, 60000);
  setInterval(flushInvites, 500);
  addEventListener('visibilitychange', () => { if (!document.hidden) refreshBadge(); });
}



export async function openFriendsPanel(onlineNames = () => [], selectedName = null) {
  let d = document.getElementById('friends-panel');
  if (d?.open) { d._selectFriend?.(selectedName); return; }
  if (!d) {
    d = document.createElement('dialog'); d.id = 'friends-panel'; d.setAttribute('aria-labelledby', 'fr-title');
    d.innerHTML = `<form method="dialog"><header class="fr-top"><button class="fr-back" aria-label="關閉">←</button><h2 id="fr-title">好友</h2></header>
      <div class="fr-cols"><section class="fr-left"><div class="fr-add"><input data-add maxlength="12" placeholder="輸入暱稱加好友"><button type="button" data-op="add" class="orange">加好友</button></div><p class="fr-msg" role="status"></p><div class="fr-list"></div></section>
      <section class="fr-chat"><div class="fr-empty">選一個好友開始私訊</div></section></div></form>`;
    document.body.append(d);
  }
  const $q = (s) => d.querySelector(s), msg = (t) => { $q('.fr-msg').textContent = t || ''; };
  let list = [], sel = null, poll = 0;
  const drawList = () => {
    const online = new Set(onlineNames()), fr = list.filter((f) => f.state === 'friend'), inc = list.filter((f) => f.state === 'incoming'), out = list.filter((f) => f.state === 'outgoing');
    const row = (f, extra) => `<div class="fr-row${sel && sel.id === f.id ? ' on' : ''}" data-id="${f.id}"><span class="fr-dot${online.has(f.nickname) ? ' online' : ''}"></span><b data-player="${esc(f.nickname)}" title="按右鍵查看更多">${esc(f.nickname)}</b>${f.unread ? `<span class="fr-unread">${f.unread}</span>` : ''}${extra || ''}</div>`;
    $q('.fr-list').innerHTML = (inc.length ? `<h4>好友邀請（${inc.length}）</h4>${inc.map((f) => row(f, `<button type="button" data-op="accept" class="orange">接受</button><button type="button" data-op="reject">拒絕</button>`)).join('')}` : '')
      + `<h4>好友（${fr.length}）・綠點＝在大廳</h4>${fr.length ? fr.map((f) => row(f)).join('') : '<p class="eq-note">還沒有好友：在玩家名字上按右鍵，或在上面輸入暱稱。</p>'}`
      + (out.length ? `<h4>等對方接受（${out.length}）</h4>${out.map((f) => row(f, '<button type="button" data-op="cancel">取消</button>')).join('')}` : '');
  };
  const load = async () => { try { list = await friendList(true); if (selectedName) { sel = list.find(f => f.nickname === selectedName && f.state === 'friend') || null; selectedName = null; } drawList(); refreshBadge(); } catch (x) { $q('.fr-list').innerHTML = `<p class="eq-note">${esc(x.message)}</p>`; } };
  const drawChat = async () => {
    if (!sel) { $q('.fr-chat').innerHTML = '<div class="fr-empty">選一個好友開始私訊</div>'; return; }
    let msgs = []; try { msgs = await call('dm_history', { p_with: sel.id }); } catch (x) { msg(x.message); }
    const keep = $q('.fr-chat input')?.value || '';
    $q('.fr-chat').innerHTML = `<div class="fr-chat-h"><b>${esc(sel.nickname)}</b><button type="button" data-op="remove">刪除好友</button></div><div class="fr-msgs">${msgs.map((m) => `<div class="fr-m${m.mine ? ' mine' : ''}"><span>${esc(m.body)}</span><small>${new Date(m.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div>`).join('') || '<p class="eq-note">還沒有訊息，打個招呼吧！</p>'}</div><div class="fr-send"><input maxlength="300" placeholder="輸入訊息（Enter 送出）"><button type="button" data-op="send" class="orange">送出</button></div>`;
    const inp = $q('.fr-chat input'); inp.value = keep; inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } };
    const box = $q('.fr-msgs'); box.scrollTop = box.scrollHeight;
    const f = list.find((x) => x.id === sel.id); if (f && f.unread) { f.unread = 0; drawList(); refreshBadge(); }
  };
  const send = async () => { const inp = $q('.fr-chat input'), t = inp.value.trim(); if (!t || !sel) return; try { await call('dm_send', { p_to: sel.id, p_body: t }); inp.value = ''; msg(''); await drawChat(); } catch (x) { msg(x.message); } };
  d._selectFriend = async nickname => { selectedName = nickname; await load(); await drawChat(); };
  d.onclick = async (e) => {
    const b = e.target.closest('button[data-op]'), r = e.target.closest('.fr-row');
    if (b) {
      const op = b.dataset.op, id = r && r.dataset.id;
      try {
        if (op === 'add') { const n = $q('[data-add]').value.trim(); if (!n) return; msg(await addFriend(n)); $q('[data-add]').value = ''; await load(); }
        if (op === 'accept') { await respondFriend({ id }, true); msg('已經成為好友'); await load(); }
        if (op === 'reject' || op === 'cancel') { await respondFriend({ id }, false); await load(); }
        if (op === 'remove' && sel && confirm(`確定要刪除好友「${sel.nickname}」嗎？`)) { await respondFriend(sel, false); sel = null; await load(); await drawChat(); }
        if (op === 'send') await send();
      } catch (x) { msg(x.message); }
      return;
    }
    if (r) { const f = list.find((x) => x.id === r.dataset.id); if (f && f.state === 'friend') { sel = f; drawList(); await drawChat(); } }
  };
  d.addEventListener('close', () => clearInterval(poll), { once: true });
  msg(''); d.showModal(); await load(); await drawChat();
  if (d.open) poll = setInterval(async () => { if (!d.open) return clearInterval(poll); if (sel) await drawChat(); else await load(); }, 8000); /* 每 8 秒更新私訊 */
}
