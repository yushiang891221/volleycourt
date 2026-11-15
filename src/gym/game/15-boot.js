// ---------------------------------------------------------------- boot
function wireUi() {
  renderTemplates(); initBuildingInputs(); renderPalette(); renderZonePalette();
  for (const id of ['t-quality']) $(id).addEventListener('click', () => { quality = quality === 'high' ? 'low' : 'high'; perf.n = 0; perf.sum = 0; applyQuality(true); window.wakeRender(800); });
  applyQuality(false);
  $('v-bird').addEventListener('click', () => frameView('bird'));
  $('v-top').addEventListener('click', () => frameView('top'));
  $('v-player').addEventListener('click', () => frameView('player'));
  $('v-fly').addEventListener('click', () => setFly(!fly.on));
  $('t-labels').addEventListener('click', () => { showLabels = !showLabels; setPressed($('t-labels'), showLabels); applyLabelVisibility(); for (const o of buildingGroup.children) if (o.isCSS2DObject) o.visible = showLabels; zonesGroup.traverse((o) => { if (o.userData.isTag) o.visible = showLabels; }); window.wakeRender(); });
  $('t-snap').addEventListener('click', () => { snapOn = !snapOn; setPressed($('t-snap'), snapOn); setPressed($('p-snap'), snapOn); });
  $('btn-undo').addEventListener('click', undo); $('btn-undo').disabled = true; $('p-undo').disabled = true;
  $('btn-lock-courts').addEventListener('click', () => setLockAll(true));
  $('btn-unlock-all').addEventListener('click', () => setLockAll(false));
  $('btn-save').addEventListener('click', saveNew);
  $('btn-update').addEventListener('click', saveUpdate);
  $('btn-copy-code').addEventListener('click', copyCode);
  $('btn-paste-toggle').addEventListener('click', () => { const b = $('paste-box'); b.hidden = !b.hidden; if (!b.hidden) $('paste-text').focus(); });
  $('btn-paste-load').addEventListener('click', loadCode);
  $('hist-sel').addEventListener('change', (e) => { if (e.target.value !== '') restoreHist(Number(e.target.value)); e.target.value = ''; });
}
function start(hot) {
  wireUi();
  loadKit();
  let note = '';
  if (!GAME_ONLY && hot && hot.state) state = sanitize(hot.state);
  if (!GAME_ONLY && !state) { try { const s = sessionStorage.getItem(STASH_KEY); if (s) { state = sanitize(JSON.parse(s)); sessionStorage.removeItem(STASH_KEY); } } catch (e) { /* ignore */ } }
  if (!state && window.__siteId) { const m = loadHall(window.__siteId); if (m) { state = sanitize({ ...m.data, id: null }); window.__hallLoaded = true; } else window.__generating = true; }
  const viaLink = !!state;
  if (!state && !window.__siteId && !window.__venueId) { try { const d = localStorage.getItem(DRAFT_KEY); if (d) { state = sanitize(JSON.parse(d)); note = '已載回你上次在這台裝置的配置'; } } catch (e) { /* ignore */ } }
  if (!state) state = fromTemplate(T_PRO);
  if (!state.items.some((i) => i.type === 'camera')) { let n = 1; for (const c of state.items.filter((i) => CAT[i.type].court === 'vb')) state.items.push(cameraFor(c, n++)); }
  if (state.id && !SAVED.some((s) => s.id === state.id)) state.id = null;
  resize(); fullRefresh(); frameView(hot && hot.view ? hot.view : 'bird'); firstOrbit = false;
  renderPlan(); fitPlan(); renderPlan(); planToolState();
  tick();
  if (note) toast(note);
  renderHist();
  if (!window.__siteId && !window.__venueId && !viaLink) { markClean(); syncFreePlan(); }
  // 即時共同編輯：等雲端版本載完再連（3 秒）
  setTimeout(() => coStart(), 3000);
  window.claude?.hot?.snapshot?.(() => ({ state: { ...designData(), id: state.id }, view }));
  const use = window.claude && window.claude.use;
  if (use) {
    window.claude.use('artifact').then((ns) => { artifactNS = ns || null; renderSaved(); }).catch(() => { artifactNS = null; renderSaved(); });
  }
}


// 除錯用：網址加 ?debug 才會開放（截圖檢查鏡頭）
if (new URLSearchParams(location.search).has('debug')) window.__gym = { THREE, scene, camera, controls, renderer, walk, get state() { return state; }, setMode, frameView, get skill() { return skill; }, get net() { return NET; }, get balls() { return balls; }, hitWorldBall: (b, k) => hitWorldBall(b, k), openCamView: (it) => openCamView(it), get rec() { return REC; }, get co() { return CO; }, openPC: () => openPC(), get rk() { return RK; }, get vb() { return VB; }, get vm() { return VM; }, vmStart: (c, sg, m, o, seats) => vmStart(c, sg, m, o, seats), vm6Start: (c, sg, asg, seats) => vm6Start(c, sg, asg, seats), mkAi: (...q) => vmMkAi(...q), v6form: (t) => vm6RecvForm(t), staCost: (k, id) => staCost(k, id), v6overlap: () => vm6Overlap(), vmTouch: (b, id, k) => vmOnTouch(b, id, k), rkCourts: () => rkCourts(), rkStart: (c, o) => rkStart(c, o), rkPress: (s) => rkPress(s), sfxPlay: (...a) => sfxPlay(...a), makeAvatar: (c, ch) => makeAvatar(c, ch), vbAttack: (t, c) => vbAttack(t, c), chgOf: (c) => vbChargeOf(c), setMove: (dx, dy) => setMenuMove(dx, dy), chgStart: (k) => vbChargeStart(k), chgRelease: () => vbChargeRelease(), doSet: (b, n, q, hy, v) => vbDoSet(b, n, q, hy, v), get fov() { return camera.fov; }, npc: (m) => vbNpcToggle(m), get npcS() { return VB.npc; }, get tut() { return TUT_COACH; }, pass: () => passToFacing(), recv: () => vbReceive(), set: (n) => vbSet(n), grab: () => grabBall(), freeBall: () => vmFreeBall(), serveAim: () => vbServeAim(), netJoin: (r) => netJoin(r), emo: (k) => emoDo(k), get netq() { return NETQ; }, rng: GAME_RNG, get room() { return ROOM; }, roomReady: () => roomReady(), roomStart: () => roomStart(), roomCourtOf: (id) => roomCourtOf(id), vmOpenMenu: (c) => vmOpenMenu(c), AVP, avDrive: (...a) => avDrive(...a), avMix: (...a) => avMix(...a), step: (dt) => { lastT = performance.now() - dt * 1000; drawFrame(true); }, rebuild: () => planChanged(), fixtures: (z) => zoneFixtures(z), layout: (z) => zoneLayout(z), wake: () => window.wakeRender(2000), frame: () => { controls.update(); drawFrame(true); }, KIT };
