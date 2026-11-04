(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const intro = $('intro'), motion = matchMedia('(prefers-reduced-motion: reduce)');
  const state = window.VBIntro = { entered: false };
  let stage = 'intro', spinFrame = 0, stopSpike, deadline;

  function enterLobby(immediate = false) {
    if (stage === 'leaving' || stage === 'lobby') return;
    stage = 'leaving'; clearTimeout(deadline); cancelAnimationFrame(spinFrame);
    stopSpike?.(); stopSpike = null;
    intro.classList.add('leaving');
    document.body.classList.add('intro-skip'); // 淡出時讓大廳跟著出現
    // Keep the modal and inert guard until the fade has completely finished.
    const finish = () => {
      intro.close(); intro.hidden = true;
      $('lobby-shell').inert = false;
      document.body.classList.remove('intro-active');
      stage = 'lobby'; state.entered = true;
      $('create').focus({ preventScroll: true });
      dispatchEvent(new Event('vb-lobby-enter'));
    };
    if (immediate || motion.matches) finish(); else setTimeout(finish, 420);
  }

  async function start() {
    if (stage !== 'intro') return;
    if (motion.matches) { enterLobby(); return; }
    stage = 'loading';
    $('start').disabled = true; $('start').textContent = '載入中…';
    $('ball-start').disabled = true;
    $('skip').focus({ preventScroll: true });
    deadline = setTimeout(() => enterLobby(), 10000);
    try {
      const { playSpike3D } = await import('./spike3d.js');
      if (stage !== 'loading') return; // Ignore a late load after skip or timeout.
      clearTimeout(deadline); stage = 'playing';
      cancelAnimationFrame(spinFrame);
      $('anim3d').hidden = false;
      stopSpike = playSpike3D($('anim3d'), (name, i, total) => {
        $('phase').querySelector('b').textContent = `${i + 1}/${total}`;
        $('phase').querySelector('span').textContent = name;
      }, () => enterLobby(), { onError: () => enterLobby() });
      $('intro-content').hidden = true; $('phase').hidden = false;
      $('skip-playing').hidden = false; $('skip-playing').focus({ preventScroll: true });
      deadline = setTimeout(() => enterLobby(), 20000);
    } catch (_) { enterLobby(); }
  }

  $('start').addEventListener('click', start);
  $('ball-start').addEventListener('click', start);
  for (const id of ['skip', 'skip-playing']) $(id).addEventListener('click', () => enterLobby());
  intro.addEventListener('cancel', e => { e.preventDefault(); enterLobby(); });
  motion.addEventListener('change', () => {
    if (motion.matches && (stage === 'loading' || stage === 'playing')) enterLobby();
    else if (stage === 'intro') { cancelAnimationFrame(spinFrame); spin(0); }
  });
  addEventListener('hashchange', () => { if (location.hash === '#lobby') enterLobby(); });
  addEventListener('pagehide', () => { cancelAnimationFrame(spinFrame); stopSpike?.(); clearTimeout(deadline); });
  addEventListener('pageshow', e => {
    if (!e.persisted) return;
    if (stage === 'intro') spin(0);
    else if (stage === 'loading' || stage === 'playing') enterLobby(true);
  });
  if (location.hash === '#lobby') { enterLobby(true); return; }
  if (!intro.open) intro.showModal();
  $('start').focus({ preventScroll: true });

  // 開場的球：Let's Play 的球圖，慢慢轉、上下浮動
  const bc = $('ball'), bctx = bc.getContext('2d');
  const ballImg = new Image();
  ballImg.src = 'img/brand/ball-512.webp';
  ballImg.onload = () => { if (stage === 'intro' && motion.matches) spin(0); };
  function spin(ts) {
    if (stage !== 'intro' && stage !== 'loading') return;
    if (!bctx) return;
    bctx.clearRect(0, 0, 600, 600);
    drawBall(bctx, 300, 300 + (motion.matches ? 0 : Math.sin(ts / 700) * 10), 230, motion.matches ? .4 : ts * .00036);
    if (!motion.matches) spinFrame = requestAnimationFrame(spin);
  }
  spin(0);
  function drawBall(ctx, x, y, r, rot) {
    if (!ballImg.complete || !ballImg.naturalWidth) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.drawImage(ballImg, -r, -r, 2 * r, 2 * r);
    ctx.restore();
  }

})();
