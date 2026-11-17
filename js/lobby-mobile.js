// 手機大廳的收合把手（樣式在 css/lobby-mobile.css）：只在觸控裝置（js/mobile-gate.js 加的 html.m-touch）作用
//   左邊把手「選單」：上方列（開啟房間、練習模式、快速加入…）從左邊滑出；往右拉也可以
//   上方中間「▼ 功能」：功能列（系統設定、公告、成就…）從上面滑下來；往下拉也可以
//   右邊把手「在線」「聊天」：名單／留言板從右邊滑出；收起來時有新留言會亮紅點
//   點外面（半透明底）或再點一次把手就收起來；按了選單裡的按鈕也會自動收起來
(() => {
  if (!document.documentElement.classList.contains('m-touch')) return;
  const body = document.body, $ = (id) => document.getElementById(id);
  const STATES = ['m-show-side', 'm-show-menu', 'm-show-players', 'm-show-chat'], foot = document.querySelector('footer');
  const isOn = (c) => body.classList.contains(c);
  const open = (cls) => { const on = !isOn(cls); for (const c of STATES) body.classList.remove(c); if (on) body.classList.add(cls); sync(); };
  const close = () => { for (const c of STATES) body.classList.remove(c); sync(); };
  const scrim = document.createElement('div'); scrim.className = 'm-scrim'; scrim.addEventListener('click', close); body.appendChild(scrim);

  // 把手：點一下＝開／關；往 dir 方向拉超過 24 px＝打開，反方向＝收起
  const handle = (cls, extra, label, state, dir) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'm-handle ' + extra; b.innerHTML = label; body.appendChild(b);
    let p0 = null, moved = false;
    b.addEventListener('pointerdown', (e) => { p0 = [e.clientX, e.clientY]; moved = false; try { b.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } });
    b.addEventListener('pointermove', (e) => {
      if (!p0) return; const d = dir === 'x' ? e.clientX - p0[0] : e.clientY - p0[1], s = dir === 'left' ? -1 : 1, v = dir === 'left' ? e.clientX - p0[0] : d;
      if (s * v > 24 && !isOn(state)) { moved = true; open(state); } else if (s * v < -24 && isOn(state)) { moved = true; close(); }
    });
    b.addEventListener('pointerup', () => { if (p0 && !moved) open(state); p0 = null; });
    b.addEventListener('pointercancel', () => { p0 = null; });
    return b;
  };
  const side = handle('side', 'm-side', '選單', 'm-show-side', 'x');
  const pull = handle('pull', 'm-pull', '▼ 功能', 'm-show-menu', 'y');
  const players = handle('players', 'm-right', '在線 <b id="m-pc">0</b><i hidden></i>', 'm-show-players', 'left');
  const chat = handle('chat', 'm-right', '聊天<i hidden></i>', 'm-show-chat', 'left');
  players.style.top = 'calc(50% - 96px)'; chat.style.top = 'calc(50% + 8px)';

  for (const sel of ['.players', '.chat']) { const p = document.querySelector(sel); if (!p) continue; const x = document.createElement('button'); x.type = 'button'; x.className = 'm-drawer-x'; x.setAttribute('aria-label', '收起來'); x.textContent = '×'; x.addEventListener('click', close); p.appendChild(x); }
  // 選單、功能列裡的按鈕按下去就收起來（原本的功能照常）；下拉選單（篩選）例外，不然選不到
  for (const sel of ['header.top', 'footer']) { const el = document.querySelector(sel); if (el) el.addEventListener('click', (e) => { if (e.target.closest('button')) setTimeout(close, 0); }); }

  // 在線人數跟著大廳的數字
  const pc = $('player-count'), syncCount = () => { const m = (pc && pc.textContent || '').match(/\d+/); $('m-pc').textContent = m ? m[0] : '0'; };
  if (pc) new MutationObserver(syncCount).observe(pc, { childList: true, characterData: true, subtree: true }); syncCount();
  // 留言板收起來時有新留言：聊天把手亮紅點
  const msgs = $('messages'), dot = chat.querySelector('i');
  if (msgs) new MutationObserver(() => { if (!isOn('m-show-chat')) dot.hidden = false; }).observe(msgs, { childList: true });

  function sync() {
    players.classList.toggle('on', isOn('m-show-players')); chat.classList.toggle('on', isOn('m-show-chat'));
    if (isOn('m-show-chat')) dot.hidden = true;
    pull.textContent = isOn('m-show-menu') ? '▲ 收起' : '▼ 功能';
    pull.style.top = '';   // 功能列拉下來後，把手移到功能列下緣（不蓋住按鈕）
    // 用功能列本身的高度算（不量畫面位置：滑下來的動畫還沒跑完時量到的是收起來的位置，把手會卡在最上面蓋住按鈕）
    if (isOn('m-show-menu') && foot) pull.style.top = (foot.offsetHeight + 8) + 'px';
    side.textContent = isOn('m-show-side') ? '收起' : '選單';
    side.style.left = isOn('m-show-side') ? 'calc(230px + var(--m-pl, 8px) - 8px)' : '';
  }
  sync();
})();
