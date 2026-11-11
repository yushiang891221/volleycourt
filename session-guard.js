// WEB-007：同一個帳號只能在一個地方登入（後登入的把先登入的踢掉）
// claim()：登入完成時呼叫（account-flow 的閘門），登記「現在是這台裝置」。
// watch()：已登入的頁面（大廳、球場）每 10 秒、切回視窗時檢查；被別處登記走了就回首頁並提示。
// 資料表（server/supabase/002_single_session.sql）還沒建時，登記會失敗 → 不啟用，遊戲照常。
import { authMode, getAccountService } from './auth.js';

const KEY = 'vb.account.sid';
// 每個分頁各自一個代碼（sessionStorage）：同一個瀏覽器開兩個分頁也算兩個地方，後進大廳的把前面的踢掉
const ls = {
  get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  del: k => { try { sessionStorage.removeItem(k); } catch {} }
};
const on = () => { try { return authMode() === 'account'; } catch { return false; } };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
let svc = null, mine = null, timer = null, busy = false;

export async function claim() {
  if (!on()) return;
  try {
    svc = svc || await getAccountService();
    const sid = newId();
    await svc.claimSession(sid);
    ls.set(KEY, sid); mine = sid;
    watch();
  } catch { /* 資料表還沒建或連不上：不啟用單一登入 */ }
}

export async function watch() {
  if (!on() || timer || kickedPage()) return;
  mine = mine || ls.get(KEY);
  if (!mine) return;   // 這個瀏覽器還沒經過登入閘門：不檢查（也不自己登記，免得只是開頁面就把別人踢掉）
  try { svc = svc || await getAccountService(); if (!(await svc.signedIn())) return; } catch { return; }
  const check = async () => {
    if (busy || document.hidden) return; busy = true;
    try { const cur = await svc.activeSession(); if (cur && cur !== mine) kicked(); }
    catch { /* 網路暫時不通：下次再查 */ }
    busy = false;
  };
  timer = setInterval(check, 10000);
  addEventListener('visibilitychange', check);
  check();
}

function kicked() {
  clearInterval(timer); ls.del(KEY);
  location.replace('index.html?kicked=1');   // 換頁＝離開房間、斷開連線
}

function kickedPage() { return /[?&]kicked=1/.test(location.search); }

// 被踢回首頁（或刪除帳號後）：顯示提示，按「知道了」後網址拿掉 ?kicked=1。之後按「開始遊戲」就會在這裡重新登入（換另一邊被踢）
const deletedPage = /[?&]deleted=1/.test(location.search);   // WEB-008：刪除帳號後回到首頁
if (kickedPage() || deletedPage) {
  const [eyebrow, title, text] = deletedPage
    ? ['ACCOUNT DELETED', '帳號已刪除', '你的帳號、暱稱和角色外觀都已從伺服器刪除。之後想再玩，按「開始遊戲」用 Google 登入就會建立新帳號。']
    : ['SIGNED IN ELSEWHERE', '帳號在其他地方登入了', '同一個帳號只能在一個地方玩，所以這裡已經離開遊戲。要在這裡繼續玩，按「開始遊戲」重新進入就好（另一邊會被登出）。'];
  const show = () => {
    // 用 <dialog>.showModal()：首頁開場畫面也是 modal，後開的才會蓋在上面（一般 div 的 z-index 蓋不過）
    const el = document.createElement('dialog');
    el.setAttribute('aria-labelledby', 'kick-t');
    el.style.cssText = 'padding:0;border:0;background:transparent;font-family:inherit';
    if (!document.getElementById('kick-css')) { const st = document.createElement('style'); st.id = 'kick-css'; st.textContent = '#kick-note::backdrop{background:#0b1220e6}'; document.head.append(st); }
    el.id = 'kick-note';
    el.innerHTML = `<div role="alertdialog" aria-labelledby="kick-t" style="width:min(420px,92vw);background:#152236;border:1px solid #F07C2466;border-radius:16px;padding:26px 26px 20px;color:#e8eef8;box-shadow:0 20px 60px #0008">
      <div style="font-size:12px;letter-spacing:2px;color:#F2A65A">${eyebrow}</div>
      <h2 id="kick-t" style="margin:6px 0 10px;font-size:24px">${title}</h2>
      <p style="margin:0 0 16px;color:#b8c4d6;line-height:1.6">${text}</p>
      <button type="button" style="width:100%;height:44px;border:0;border-radius:10px;background:#F07C24;color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer">知道了</button></div>`;
    el.querySelector('button').onclick = () => { el.close(); el.remove(); history.replaceState(null, '', location.pathname + location.hash); };
    document.body.append(el); el.showModal(); el.querySelector('button').focus();
  };
  addEventListener('load', () => setTimeout(show, 0));   // 等開場畫面開好再開，才會在最上層
} else {
  watch();
}
