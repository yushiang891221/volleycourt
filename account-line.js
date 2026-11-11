// 開始畫面：顯示目前登入的帳號＋切換帳號（沒登入就不顯示；訪客模式不顯示）
import { accountInfo, switchAccount } from './account-flow.js';
const el = document.getElementById('intro-account');
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function show() {
  if (!el) return;
  const me = await accountInfo();
  if (!me) { el.hidden = true; return; }
  const nick = (window.VBSettings && window.VBSettings.values.nickname) || '';
  el.innerHTML = `目前登入：<b>${esc(me.email || me.name || 'Google 帳號')}</b>${nick ? `（${esc(nick)}）` : ''}<button type="button">切換帳號</button>`;
  el.querySelector('button').onclick = async (e) => { e.target.disabled = true; e.target.textContent = '正在前往 Google…'; try { await switchAccount(); } catch { e.target.disabled = false; e.target.textContent = '切換帳號'; } };
  el.hidden = false;
}
show();
addEventListener('vb-settings-change', show);
