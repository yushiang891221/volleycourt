(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const intro = $('intro'), motion = matchMedia('(prefers-reduced-motion: reduce)');
  const state = window.VBIntro = { entered: false };
  let creatorReady = false;
  let stage = 'intro', spinFrame = 0, stopSpike, deadline;

  async function enterLobby(immediate = false) {
    if (stage === 'leaving' || stage === 'lobby' || stage === 'creator') return;
    if (!creatorReady) {
      stage = 'creator'; clearTimeout(deadline); cancelAnimationFrame(spinFrame);
      stopSpike?.(); stopSpike = null;
      try {
        intro.close(); intro.hidden = true;
        const { accountGate } = await import('./account-flow.js');
        await accountGate();
        if (/[?&](code|error|error_description)=/.test(location.search)) history.replaceState(null, '', location.pathname);
        const { needsCreator } = await import('./appearance.js');
        if (needsCreator()) {
          const { editAppearance } = await import('./character-panel.js');
          intro.close(); intro.hidden = true;
          await editAppearance('create');
        }
        creatorReady = true;
        // 選伺服器：從開場進來都會問；從比賽回大廳（#lobby）且已經選過就不問
        try {
          const S = await import('./servers.js');
          if (location.hash !== '#lobby' || !S.savedServerId()) { if ((await S.serverList()).length) await S.openServerSelect(); }
        } catch (e) { console.warn('[選伺服器] 載入失敗，用預設伺服器', e); }
      } catch (err) {
        console.error('[進大廳] 失敗', err);   /* 看得到真正的原因 */
        stage = 'intro'; intro.hidden = false;
        $('intro-content').hidden = false; $('anim3d').hidden = true;
        $('phase').hidden = true; $('skip-playing').hidden = true;
        $('start').disabled = false; $('ball-start').disabled = false;
        $('start').textContent = '載入或儲存失敗，按此重試';
        { let why = $('start-why'); if (!why) { why = document.createElement('p'); why.id = 'start-why'; why.style.cssText = 'color:#f3d9b0;font-size:13px;margin:8px auto 0;max-width:520px;text-align:center'; $('start').after(why); } why.textContent = '原因：' + String((err && err.message) || err || '未知').slice(0, 160); }
        intro.showModal(); return;
      }
    }
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

  function start() {
    if (stage === 'intro') enterLobby();
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
  if (location.hash === '#lobby' || /[?&](code|error)=/.test(location.search)) { enterLobby(true); return; }   // 從 Google 登入回來就直接接著走
  if (!intro.open) intro.showModal();
  $('start').focus({ preventScroll: true });

  // 開場的球：Play One 的球圖，慢慢轉、上下浮動
  const bc = $('ball'), bctx = bc.getContext('2d');
  const ballImg = new Image();
  ballImg.src = 'assets/img/brand/ball-512.webp';
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
