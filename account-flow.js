// WEB-004：登入閘門與帳號同步（auth-config.js 兩個值都填了才會啟用；沒填就是訪客模式，什麼都不做）
// 流程：開始遊戲 → 沒登入顯示 Google 登入 → 登入後把本機暱稱／外觀帶進帳號 → 沒暱稱先取暱稱 → 沒外觀進捏臉 → 大廳
import { getAccountService, authMode, cleanNickname } from './auth.js';
import { readLook, saveLook, normalizeLook } from './appearance.js';
import { decodeLook } from './avatar-toy.js';

const OWNER_KEY = 'vb.account.owner';
let service = null, profile = null;
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: k => { try { localStorage.removeItem(k); } catch {} } };

export function accountEnabled() {
  try { return authMode() === 'account'; } catch { return false; }
}
export const currentProfile = () => (profile ? { ...profile } : null);

// ---- 畫面（深色面板、橘色主色，照大廳） ----
const CSS = `
.acct{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:#0b1220e6;font-family:inherit}
.acct-box{width:min(420px,92vw);background:#152236;border:1px solid #F07C2466;border-radius:16px;padding:28px 28px 22px;color:#e8eef8;box-shadow:0 20px 60px #0008}
.acct-box .eyebrow{font-size:12px;letter-spacing:2px;color:#F2A65A}
.acct-box h2{margin:6px 0 10px;font-size:26px}
.acct-box p{margin:0 0 16px;color:#b8c4d6;line-height:1.6}
.acct-box button{width:100%;height:46px;border:0;border-radius:10px;font:inherit;font-size:16px;font-weight:700;cursor:pointer}
.acct-google{background:#fff;color:#1f2937;display:flex;align-items:center;justify-content:center;gap:10px}
.acct-google:disabled{opacity:.6;cursor:wait}
.acct-orange{background:#F07C24;color:#fff;margin-top:10px}
.acct-box input{width:100%;box-sizing:border-box;height:44px;border-radius:10px;border:1px solid #3a4a63;background:#0e1828;color:#fff;padding:0 12px;font:inherit;font-size:16px}
.acct-err{min-height:22px;margin-top:10px;color:#ff9c8a;font-size:14px}
.acct-legal{display:block;color:#8a99b0;font-size:12.5px;line-height:1.5}
.acct-legal a{color:#F2A65A}
`;
function panel(html) {
  if (!document.getElementById('acct-css')) { const st = document.createElement('style'); st.id = 'acct-css'; st.textContent = CSS; document.head.append(st); }
  const el = document.createElement('div'); el.className = 'acct'; el.innerHTML = `<div class="acct-box">${html}</div>`; document.body.append(el); return el;
}
const GOOGLE_ICON = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>';

function loginScreen(message = '') {
  return new Promise(() => {   // 按下去會轉到 Google，回來後頁面重新載入，所以這個 Promise 不會結束
    const el = panel(`<span class="eyebrow">LET'S PLAY</span><h2>登入開始打球</h2><p>登入後，你的角色外觀和暱稱會存在帳號裡，換電腦也能用。</p>
      <button class="acct-google" data-g>${GOOGLE_ICON}使用 Google 登入</button><div class="acct-err" role="status">${message}</div>
      <small class="acct-legal">登入即表示你同意我們依 <a href="privacy.html" target="_blank" rel="noopener">隱私權政策</a> 處理你的資料。</small>`);
    const btn = el.querySelector('[data-g]'), err = el.querySelector('.acct-err');
    btn.onclick = async () => {
      btn.disabled = true; err.textContent = '正在前往 Google…';
      try { const back = new URL(location.href); back.hash = ''; await service.signIn(back.href); }
      catch (e) { btn.disabled = false; err.textContent = (e && e.message) || 'Google 登入未能開始，請重試。'; }
    };
  });
}

function nicknameScreen(hint = '') {
  return new Promise(resolve => {
    const el = panel(`<span class="eyebrow">WELCOME TO THE COURT</span><h2>取一個暱稱</h2><p>球友會在球場上看到這個名字（2～12 個字）。</p>
      <form><input maxlength="12" autocomplete="nickname" placeholder="你的暱稱" value=""><button class="acct-orange">確定</button></form><div class="acct-err" role="status">${hint}</div>`);
    const input = el.querySelector('input'), err = el.querySelector('.acct-err'), btn = el.querySelector('button');
    input.value = (window.VBSettings && window.VBSettings.values.nickname) || ''; input.focus();
    el.querySelector('form').onsubmit = async e => {
      e.preventDefault(); btn.disabled = true; err.textContent = '';
      try { profile = await service.save({ nickname: cleanNickname(input.value) }); cacheNickname(profile.nickname); el.remove(); resolve(); }
      catch (x) { err.textContent = (x && x.message) || '儲存失敗，請重試。'; btn.disabled = false; }
    };
  });
}

function errorScreen(message) {
  return new Promise(resolve => {
    const el = panel(`<span class="eyebrow">CONNECTION</span><h2>連不上帳號服務</h2><p>${message}</p><button class="acct-orange">重試</button>`);
    el.querySelector('button').onclick = () => { el.remove(); resolve(); };
  });
}

function cacheNickname(name) {
  if (window.VBSettings && window.VBSettings.values.nickname !== name) { syncing = true; window.VBSettings.update({ nickname: name }); syncing = false; }
}
let syncing = false;

// ---- 閘門：intro 進大廳前呼叫。訪客模式直接回傳 ----
export async function accountGate() {
  if (!accountEnabled()) return 'guest';
  for (;;) {
    try {
      service = service || await getAccountService();
      const uid = await service.signedIn();
      if (!uid) { await loginScreen(); continue; }
      const owner = store.get(OWNER_KEY);
      const local = { owner: owner || uid, nickname: window.VBSettings && window.VBSettings.values.nickname, appearance: readLook() };
      const r = await service.migrate(local); profile = r.profile;
      store.set(OWNER_KEY, uid);
      if (!profile.nickname) await nicknameScreen(r.nicknameConflict ? '這個暱稱已有人使用，請換一個。' : '');
      else cacheNickname(profile.nickname);
      // 外觀：帳號有就用帳號的（覆蓋本機），沒有就讓 intro 開捏臉畫面
      if (profile.appearance) saveLook(decodeLook(profile.appearance));
      else if (owner && owner !== uid) store.del('vb.settings.look');
      watchNickname();
      try { const g = await import('./session-guard.js'); await g.claim(); } catch {}   // WEB-007：登記「現在是這台裝置」，別處登入的會被踢掉
      return 'account';
    } catch (e) {
      await errorScreen((e && e.message) || '帳號服務暫時無法連線，請確認網路後重試。');
    }
  }
}

// 捏臉／調整外觀存檔後呼叫：同步到帳號（失敗丟錯，讓畫面提示）
export async function syncAppearance() {
  if (!accountEnabled() || !service) return;
  const code = normalizeLook(readLook());
  profile = await service.save({ appearance: code });
}

let watching = false;
function watchNickname() {   // 設定裡改暱稱 → 同步到帳號
  if (watching) return; watching = true;
  addEventListener('vb-settings-change', async () => {
    const name = window.VBSettings && window.VBSettings.values.nickname;
    if (syncing || !service || !profile || !name || name === profile.nickname) return;
    try { profile = await service.save({ nickname: name }); }
    catch (e) { cacheNickname(profile.nickname); alert((e && e.message) || '暱稱儲存失敗'); }
  });
}

export async function signOut() {
  if (!service) return;
  await service.signOut(); store.del(OWNER_KEY); location.href = location.pathname;
}

// WEB-008 刪除帳號：資料庫刪掉後，本機的帳號標記、登入裝置代碼、暱稱和外觀也清掉，回首頁
export async function deleteAccount() {
  if (!service) service = await getAccountService();
  if (!service) return;
  await service.deleteAccount();
  for (const k of [OWNER_KEY, 'vb.account.sid', 'vb.mp.name', 'vb.settings.look']) store.del(k);
  try { const s = JSON.parse(store.get('vb.settings')); if (s && typeof s === 'object') { s.nickname = ''; store.set('vb.settings', JSON.stringify(s)); } } catch {}   // 按鍵、音量等設定保留
  location.href = location.pathname.replace(/[^/]*$/, '') + 'index.html?deleted=1';
}

// 從 Google 登入回來（網址帶 ?code=）：intro 自動接著走，不用再按一次開始
export const returningFromLogin = () => /[?&](code|error)=/.test(location.search);
