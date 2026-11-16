'use strict';
// 主畫面與大廳的背景音樂：小聲、循環播放；跟著「系統設定」的主音量、音樂音量與靜音。
// 瀏覽器不允許一打開就出聲，所以等玩家第一次點擊或按鍵才開始播。
(() => {
  // 設定裡「音樂音量」顯示 100% 時，實際只播 25%（背景音樂要比音效小聲）
  const BASE = 0.25;
  const music = new Audio('assets/bgm/lobby-theme.mp3');
  music.loop = true;
  music.preload = 'auto';
  music.volume = 0;
  let started = false, fadeTimer = 0;

  const settings = () => globalThis.VBSettings?.values || { volume: 100, music: 100, mute: false };
  const pct = v => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 100)) / 100;
  const target = () => { const s = settings(); return s.mute ? 0 : BASE * pct(s.music) * pct(s.volume); };

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
