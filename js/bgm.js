'use strict';
// 主畫面與大廳的背景音樂：小聲、循環播放；跟著「系統設定」的主音量與靜音。
// 瀏覽器不允許一打開就出聲，所以等玩家第一次點擊或按鍵才開始播。
(() => {
  const BASE = 0.25; // 背景音樂本身就比音效小聲
  const music = new Audio('assets/bgm/lobby-theme.mp3');
  music.loop = true;
  music.preload = 'auto';
  music.volume = 0;
  let started = false, fadeTimer = 0;

  const settings = () => globalThis.VBSettings?.values || { volume: 100, mute: false };
  const target = () => { const s = settings(); return s.mute ? 0 : BASE * Math.max(0, Math.min(100, s.volume)) / 100; };

  function fadeTo(goal, ms = 1200) {
    clearInterval(fadeTimer);
    const from = music.volume, steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    fadeTimer = setInterval(() => {
      i++;
      music.volume = Math.max(0, Math.min(1, from + (goal - from) * i / steps));
      if (i >= steps) clearInterval(fadeTimer);
    }, 50);
  }

  function start() {
    if (started) return;
    started = true;
    removeEventListener('pointerdown', start, true);
    removeEventListener('keydown', start, true);
    music.play().then(() => fadeTo(target())).catch(() => { started = false; listen(); });
  }
  function listen() {
    addEventListener('pointerdown', start, true);
    addEventListener('keydown', start, true);
  }
  listen();

  addEventListener('vb-settings-change', () => { if (started) fadeTo(target(), 200); });
  // 切到別的分頁就暫停，回來再接著播
  document.addEventListener('visibilitychange', () => {
    if (!started) return;
    if (document.hidden) music.pause();
    else music.play().then(() => fadeTo(target(), 600)).catch(() => {});
  });
  // 離開這一頁（進房間、練習模式）就停掉
  addEventListener('pagehide', () => { clearInterval(fadeTimer); music.pause(); });
})();
