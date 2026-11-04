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
  intro.showModal();
  $('start').focus({ preventScroll: true });

  // The original canvas ball is restored below; it needs no external assets.
  const bc = $('ball'), bctx = bc.getContext('2d');
  function spin(ts) {
    if (stage !== 'intro' && stage !== 'loading') return;
    if (!bctx) return;
    bctx.clearRect(0, 0, 600, 600);
    drawBall(bctx, 300, 300 + (motion.matches ? 0 : Math.sin(ts / 700) * 10), 230, motion.matches ? .4 : ts * .00036);
    if (!motion.matches) spinFrame = requestAnimationFrame(spin);
  }
  spin(0);
  function drawBall(ctx, x, y, r, rot, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-r, -r, 2 * r, 2 * r);
  // three wedges, each with three curved strips (classic volleyball panels)
  const cols = [['#F4C21E', '#1F5FB4', '#FFFFFF'], ['#1F5FB4', '#FFFFFF', '#F4C21E'], ['#FFFFFF', '#F4C21E', '#1F5FB4']];
  for (let k = 0; k < 3; k++) {
    ctx.save(); ctx.rotate(rot + k * Math.PI * 2 / 3);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 1.1, -Math.PI / 2 - Math.PI / 3, -Math.PI / 2 + Math.PI / 3); ctx.closePath(); ctx.clip();
    for (let i = 2; i >= 0; i--) {
      ctx.beginPath(); ctx.arc(r * 0.35, r * 0.75, r * (0.95 + 0.42 * (i + 1)), 0, Math.PI * 2);
      ctx.fillStyle = cols[k][i]; ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.02); ctx.strokeStyle = 'rgba(20,30,50,.35)'; ctx.stroke();
    }
    ctx.restore();
  }
  ctx.save(); ctx.rotate(rot); ctx.strokeStyle = 'rgba(20,30,50,.4)'; ctx.lineWidth = Math.max(1, r * 0.022);
  for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + Math.PI / 3 + k * Math.PI * 2 / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
  ctx.restore();
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
  g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,30,.45)');
  ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = alpha * 0.6; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = Math.max(1, r * 0.02); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke(); ctx.restore();
}

})();
