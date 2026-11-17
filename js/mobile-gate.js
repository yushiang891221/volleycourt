// 手機關卡（2026-11-17 使用者要求）：只在觸控裝置（手機、平板）作用，電腦完全不跑
//   1. 不是從「主畫面圖示」打開（還在瀏覽器裡）＝不能玩，整頁換成「怎麼加入主畫面」教學
//      LINE 內建瀏覽器自動改用手機的預設瀏覽器打開；FB／IG 等內建瀏覽器教他用瀏覽器開
//   2. 從主畫面打開後：直拿手機＝黑畫面「請將手機轉過來」，要橫拿才看得到、按得到東西（包含開始遊戲）
//   3. 頁面固定大小、不能捲動、不能縮放；大廳（data-fit＝設計寬度）整個等比縮進手機畫面
//   本機測試：網址加 ?pwa=skip（只在 localhost 有效）跳過第 1 關
(() => {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const de = document.documentElement, me = document.currentScript, fitW = +(me && me.dataset.fit) || 0, fitH = +(me && me.dataset.fitH) || 560;
  de.classList.add('m-touch');
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname), q = new URLSearchParams(location.search);
  try { if (local && q.get('pwa') === 'skip') sessionStorage.setItem('vb.pwa.skip', '1'); } catch (e) { /* ignore */ }
  let skip = false; try { skip = local && sessionStorage.getItem('vb.pwa.skip') === '1'; } catch (e) { /* ignore */ }
  const app = navigator.standalone === true || ['fullscreen', 'standalone', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
  const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const line = /\bLine\//i.test(ua), inApp = line || /FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|Messenger|Threads/i.test(ua);
  if (line && !app && !q.has('openExternalBrowser')) { q.set('openExternalBrowser', '1'); location.replace(location.pathname + '?' + q + location.hash); return; }

  // 安裝成 App 需要的檔案
  const head = document.head || de;
  const add = (tag, attrs) => { const el = document.createElement(tag); for (const k in attrs) el.setAttribute(k, attrs[k]); head.appendChild(el); };
  if (!document.querySelector('link[rel=manifest]')) add('link', { rel: 'manifest', href: '/manifest.webmanifest' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'Play One' });
  add('meta', { name: 'theme-color', content: '#111B2B' });
  const vp = document.querySelector('meta[name=viewport]'); if (vp) vp.setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

  const css = `
html.m-touch, html.m-touch body { overflow: hidden !important; overscroll-behavior: none; -webkit-text-size-adjust: 100%; touch-action: manipulation; }
html.m-touch { --m-sl: env(safe-area-inset-left, 0px); --m-sr: env(safe-area-inset-right, 0px); --m-sb: env(safe-area-inset-bottom, 0px); }
html.m-touch body { position: fixed; inset: 0; }
html.m-touch.m-fit body { left: 0; right: auto; zoom: var(--m-zoom); width: var(--m-w) !important; min-width: 0 !important; height: var(--m-h) !important; box-sizing: border-box; padding-left: var(--m-pl) !important; padding-right: var(--m-pr) !important; padding-bottom: var(--m-pb) !important; }
html.m-touch.m-fit body dialog { max-width: calc(100vw - var(--m-sl) - var(--m-sr) - 8px); max-height: calc(100dvh - 8px); overflow: auto; box-sizing: border-box; }
dialog.m-rotate, dialog.m-gate { max-width: none; max-height: none; width: 100vw; height: 100dvh; margin: 0; border: 0; }
dialog.m-rotate::backdrop, dialog.m-gate::backdrop { background: transparent; }
.m-rotate { position: fixed; inset: 0; z-index: 2147483000; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 26px; background: rgba(12, 14, 18, .88); color: #fff; font: 600 16px/1.5 "Noto Sans TC", system-ui, sans-serif; text-align: center; padding: 24px; -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
.m-rotate svg { width: 96px; height: 96px; }
.m-rotate[open] { display: flex; }
.m-gate { position: fixed; inset: 0; z-index: 2147483001; overflow: auto; background: radial-gradient(120% 80% at 20% 0%, #13414a 0%, #111B2B 55%, #0b1220 100%); color: #EEF2F7; font: 500 16px/1.6 "Noto Sans TC", system-ui, sans-serif; padding: max(28px, env(safe-area-inset-top)) 22px 32px; box-sizing: border-box; touch-action: pan-y; }
.m-gate * { box-sizing: border-box; }
.m-gate .m-in { max-width: 520px; margin: 0 auto; }
.m-gate .m-logo { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.m-gate .m-logo img { width: 56px; height: 56px; border-radius: 14px; }
.m-gate .m-logo b { font: 900 28px/1 system-ui, sans-serif; letter-spacing: .06em; } .m-gate .m-logo b i { font-style: normal; color: #E2B865; }
.m-gate h1 { font-size: 22px; line-height: 1.35; margin: 0 0 6px; } .m-gate .m-sub { color: #B9C4D2; margin: 0 0 20px; font-size: 15px; }
.m-gate ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.m-gate li { display: flex; gap: 14px; align-items: flex-start; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 14px; }
.m-gate li .n { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: #E2B865; color: #1B2638; font-weight: 900; }
.m-gate li strong { color: #FFE7A8; } .m-gate .ic { display: inline-block; vertical-align: -5px; width: 22px; height: 22px; margin: 0 2px; }
.m-gate .m-btn { display: block; width: 100%; margin: 4px 0 18px; padding: 15px; border: 0; border-radius: 14px; background: linear-gradient(90deg, #E8C273, #D39A3E); color: #1B2638; font: 900 18px/1 system-ui, sans-serif; }
.m-gate .m-btn[hidden] { display: none; }
.m-gate .m-why { margin-top: 18px; color: #93A1B3; font-size: 13px; }
.m-gate .m-ok { margin-top: 16px; padding: 14px; border-radius: 14px; background: rgba(48,164,108,.18); border: 1px solid rgba(48,164,108,.6); color: #CFF5DE; font-weight: 700; }
.m-gate .m-ok[hidden] { display: none; }`;
  const st = document.createElement('style'); st.textContent = css; head.appendChild(st);

  const mine = new Set();   // 我們自己的視窗（教學頁、轉向畫面）
  // 大廳：整個畫面等比縮進手機（設計寬度 fitW，太矮的手機也照高度縮）
  if (fitW && (app || skip)) {   // 教學頁蓋著時不用縮
    de.classList.add('m-fit');
    const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
    const fit = () => {
      if (!probe.isConnected) de.appendChild(probe);
      const ps = getComputedStyle(probe), sl = parseFloat(ps.paddingLeft) || 0, sr = parseFloat(ps.paddingRight) || 0, sb = parseFloat(ps.paddingBottom) || 0;
      const w = innerWidth - sl - sr, h = innerHeight - sb, k = Math.max(0.4, Math.min(1, w / fitW, h / fitH));
      // 底色鋪滿整個螢幕（不留黑邊），瀏海／動態島／底部橫條那幾邊用內距讓開
      de.style.setProperty('--m-zoom', String(k)); de.style.setProperty('--m-unzoom', String(1 / k));
      de.style.setProperty('--m-w', (innerWidth / k).toFixed(1) + 'px'); de.style.setProperty('--m-h', (innerHeight / k).toFixed(1) + 'px');
      de.style.setProperty('--m-pl', ((8 + sl) / k).toFixed(1) + 'px'); de.style.setProperty('--m-pr', ((8 + sr) / k).toFixed(1) + 'px'); de.style.setProperty('--m-pb', ((8 + sb) / k).toFixed(1) + 'px');
      // 打開的視窗（開場、取暱稱、建房間…）：先量原本大小，太大就再縮到剛好放進螢幕
      for (const d of document.querySelectorAll('body dialog[open]')) {
        d.style.zoom = String(1 / k); d.style.maxHeight = 'none'; d.style.maxWidth = 'none';
        const b = d.getBoundingClientRect();
        if (b.width >= innerWidth - 20 && b.height >= innerHeight - 20) {   // 滿版的視窗（開場畫面）：視窗本身不縮，縮裡面的內容
          const c = d.firstElementChild;   // 滿版就維持滿版（maxWidth／maxHeight 保持 none）
          if (c) { c.style.zoom = ''; const z = Math.min(1, (innerHeight - 12) / (d.scrollHeight || 1), (w - 8) / (d.scrollWidth || 1)); c.style.zoom = String(z); }
          continue;
        }
        const z = Math.min(1, (h - 8) / (Math.max(b.height, d.scrollHeight) || 1), (w - 8) / (Math.max(b.width, d.scrollWidth) || 1));
        d.style.zoom = String(z / k); d.style.maxHeight = ''; d.style.maxWidth = '';
      }
    };
    new MutationObserver((ms) => { if (ms.some((m) => m.target.tagName === 'DIALOG' && m.target.open && !mine.has(m.target))) requestAnimationFrame(fit); })
      .observe(de, { subtree: true, attributes: true, attributeFilter: ['open'] });
    fit(); addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 200));
  }
  // 雙指縮放（iPhone 不理 user-scalable=no）
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const phoneSvg = '<svg viewBox="0 0 96 96" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="12" y="8" width="34" height="48" rx="6"/><path d="M22 18h14"/><path d="M58 18c10 2 16 9 17 19"/><path d="M69 33l6 6 6-7"/><rect x="10" y="52" width="76" height="36" rx="7" fill="#fff"/><rect x="18" y="58" width="56" height="24" rx="2" fill="#0c0e12" stroke="none"/><circle cx="80" cy="70" r="2.6" fill="#0c0e12" stroke="none"/></svg>';
  const shareSvg = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#FFE7A8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>';
  const plusSvg = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#FFE7A8" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
  const dotsSvg = '<svg class="ic" viewBox="0 0 24 24" fill="#FFE7A8"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

  // 用 <dialog>（showModal）放到瀏覽器最上層：網頁自己的開場、設定視窗也是 dialog，一般 z-index 蓋不過；
  //   之後網頁又打開別的 dialog 時，再把我們的拉回最上面。Esc 不能關掉
  const front = (d) => { try { if (d.open) d.close(); d.showModal(); } catch (e) { /* ignore */ } };
  const make = (cls) => { const d = document.createElement('dialog'); d.className = cls; d.addEventListener('cancel', (e) => e.preventDefault()); mine.add(d); de.appendChild(d); return d; };
  const watchDialogs = (again) => new MutationObserver((ms) => { if (ms.some((m) => !mine.has(m.target) && m.target.open)) again(); }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
  const mount = () => {
    if (app || skip) {   // 從主畫面打開：只管橫直
      de.classList.add('m-app');
      const r = make('m-rotate'); r.setAttribute('role', 'alert');
      r.innerHTML = phoneSvg + '<div>為了更好的體驗，請將手機轉過來</div>';
      for (const t of ['touchstart', 'touchmove', 'pointerdown', 'click']) r.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
      const portrait = matchMedia('(orientation: portrait)');
      const sync = () => { if (portrait.matches) { if (!r.open || document.querySelector('dialog[open]:not(.m-rotate)')) front(r); } else if (r.open) r.close(); };
      portrait.addEventListener('change', sync); addEventListener('resize', sync); sync(); watchDialogs(() => { if (portrait.matches) front(r); });
      try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ }
      return;
    }
    // 還在瀏覽器裡：整頁換成加入主畫面教學（底下的網頁不載入畫面、不能玩）
    let steps;
    if (inApp) steps = [
      `點右上角的 <strong>${dotsSvg}⋯</strong>，選<strong>「用瀏覽器開啟」</strong>（iPhone 選 Safari，Android 選 Chrome）`,
      '在瀏覽器打開後，這一頁會教你把 Play One 加到主畫面'];
    else if (ios) steps = [
      `點 Safari 下方的<strong>分享按鈕 ${shareSvg}</strong>（新版 iOS 要先點網址列旁的 <strong>⋯</strong>，再點<strong>「分享」</strong>）`,
      `往下滑，點<strong>「加入主畫面」${plusSvg}</strong>`,
      '確認<strong>「以網頁 App 打開」</strong>是打開的（有這個選項的話），再點右上角<strong>「新增」</strong>',
      '回到手機主畫面，點 <strong>Play One</strong> 圖示開始玩'];
    else steps = [
      `點瀏覽器右上角的 <strong>${dotsSvg}</strong>`,
      '點<strong>「安裝應用程式」</strong>或<strong>「加到主畫面」</strong>，再按<strong>「安裝」</strong>',
      '回到手機主畫面，點 <strong>Play One</strong> 圖示開始玩'];
    const g = make('m-gate');
    g.innerHTML = `<div class="m-in"><div class="m-logo"><img src="/assets/img/brand/apple-touch-180.png" alt=""><b>PLAY <i>ONE</i></b></div>
<h1>先把 Play One 加到主畫面</h1><p class="m-sub">手機要從主畫面的圖示打開才能玩：全螢幕、畫面不會亂捲，操作比較順。</p>
<button type="button" class="m-btn" id="m-install" hidden>一鍵安裝 Play One</button>
<ol>${steps.map((s, i) => `<li><span class="n">${i + 1}</span><span>${s}</span></li>`).join('')}</ol>
<div class="m-ok" id="m-ok" hidden>安裝好了！回到手機主畫面，點 Play One 圖示開始玩。</div>
<p class="m-why">${ios && !/Safari/.test(ua.replace(/CriOS|FxiOS|EdgiOS/, 'X')) && !inApp ? '找不到「加入主畫面」：請改用 Safari 打開這個網址。' : '已經加過了？直接到主畫面點 Play One 圖示。'}</p></div>`;
    front(g); watchDialogs(() => front(g));
    de.classList.add('m-gated');
    // Android Chrome：可以直接跳出安裝視窗
    let ask = window.__vbInstall || null; const btn = g.querySelector('#m-install');
    const showBtn = () => { btn.hidden = !ask; };
    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ask = e; showBtn(); });
    btn.addEventListener('click', async () => { if (!ask) return; ask.prompt(); try { await ask.userChoice; } catch (e) { /* ignore */ } ask = null; showBtn(); });
    addEventListener('appinstalled', () => { g.querySelector('#m-ok').hidden = false; btn.hidden = true; });
    showBtn();
  };
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__vbInstall = e; });
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  // 教學頁蓋著時，底下的網頁不要偷跑（不播開場音樂、不自動進大廳）：其他程式可以看 window.__vbGated
  window.__vbGated = !(app || skip);
})();
