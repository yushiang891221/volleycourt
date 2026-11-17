// ---------------------------------------------------------------- loop
ROOM_UI = createRoomFlowUI({getRoom:()=>ROOM,me:vmMe,name:id=>id===vmMe()?(NET.name || VBSettings.values.nickname || '你'):NET.peers.get(id)?.n || '球友',release:()=>{unlockMouse();walk.keys.clear();},ready:roomReady,start:roomStart});
if (new URLSearchParams(location.search).has('practice')) {
  ROOM = createRoomSettings({id:'me',creator:true,count:roomDefaultCount(),courtOf:roomCourtOf,send:()=>{},changed:roomRulesChanged}); ROOM.start();
  const tutorialScript = document.createElement('script');
  tutorialScript.src = 'js/tutorial.js';
  tutorialScript.onload = () => {
    window.VBTutorial = window.VBTutorialFactory.create({ coach: TUT_COACH });
    window.VBTutorial.mount(document);
    tutAutoOpen();
  };
  document.head.append(tutorialScript);
}
function resize() {
  const w = CREATOR_SHOT ? innerWidth : host.clientWidth || 1, h = CREATOR_SHOT ? innerHeight : host.clientHeight || 1;
  renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
  labelRenderer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  window.wakeRender && window.wakeRender();
}
new ResizeObserver(resize).observe(host);
let renderUntil = 0, lastCamKey = '', frameNo = 0, lastT = performance.now();
window.wakeRender = (ms = 700) => { renderUntil = Math.max(renderUntil, performance.now() + ms); };
for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'click', 'touchmove']) addEventListener(ev, () => window.wakeRender(), { passive: true, capture: true });
addEventListener('resize', () => window.wakeRender(400));
// 顯示 FPS（設定 → 畫面）：每 0.5 秒更新一次，也記這段時間最慢的一格（卡頓）
const FPS = { n: 0, t0: 0, worst: 0, last: 0, el: null };
// 連線量測一行：延遲（到別人的單程，量 ping 的一半）、每秒收／送幾筆、斷糧（別人的動作緩衝空掉）佔幾 %；線路是台北伺服器還是 Ably
function netStatLine(ms) {
  if (!NET.on) return '';
  const lat = NET.lat.size ? Math.round([...NET.lat.values()].reduce((a, b) => a + b, 0) / NET.lat.size) : null;
  const inN = NETSTAT.inN - NETSTAT.in0, outN = NETQ.sent - NETSTAT.out0, starve = NETSTAT.starve - NETSTAT.starve0, peers = Math.max(1, NET.peers.size);
  NETSTAT.in0 = NETSTAT.inN; NETSTAT.out0 = NETQ.sent; NETSTAT.starve0 = NETSTAT.starve;
  const sec = ms / 1000, frames = Math.max(1, FPS.n) * peers, kind = NET.tx?.kind || '', line = /^cf/.test(kind) ? '台北' : /ably/.test(kind) ? 'Ably' : '本機測試';
  return `
${line}・延遲 ${lat == null ? '量測中' : lat + ' ms'}・收 ${Math.round(inN / sec)}／秒・送 ${Math.round(outN / sec)}／秒・斷糧 ${Math.round(starve / frames * 100)}%`;
}
function fpsTick(now) {
  if (!VBSettings.values.showFps) { if (FPS.el) FPS.el.hidden = true; FPS.last = now; return; }
  if (!FPS.el) { FPS.el = document.createElement('div'); FPS.el.style.cssText = 'white-space:pre;text-align:right;position:fixed;right:14px;bottom:70px;z-index:50;padding:4px 10px;border-radius:6px;background:#0b1220d9;color:#9ff0c8;font:13px/1.4 monospace;pointer-events:none'; document.body.appendChild(FPS.el); }
  FPS.el.hidden = false; if (FPS.last) FPS.worst = Math.max(FPS.worst, now - FPS.last); FPS.last = now; FPS.n++;
  if (!FPS.t0) FPS.t0 = now; else if (now - FPS.t0 >= 500) { FPS.el.textContent = `FPS ${Math.round(FPS.n * 1000 / (now - FPS.t0))}・最慢一格 ${Math.round(FPS.worst)} ms` + netStatLine(now - FPS.t0); FPS.n = 0; FPS.t0 = now; FPS.worst = 0; }
}
import('./js/friends.js').then(({ startBadge }) => startBadge(() => ROOM?.snapshot.flow.phase === 'playing'));
function tick(now) { requestAnimationFrame(tick); fpsTick(now || performance.now()); drawFrame(false); }
function drawFrame(force) {
  if (CREATOR_SHOT) return; // 拍照模式由 prepareCreatorShot 單次繪製，不進遊戲更新。
  const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (mode === 'plan' || !state) return;
  if (RP.on) updateReplay(dt); else if (walk.on) { if (window.__rkOn) rkUpdate(dt); else updateWalk(dt); watchPerf(dt); } else { if (moveEditCam(dt)) renderUntil = Math.max(renderUntil, now + 200); controls.update(); }
  frameNo++;
  const e = camera.matrixWorld.elements, pr = camera.projectionMatrix.elements;
  const key = e[12].toFixed(3) + e[13].toFixed(3) + e[14].toFixed(3) + e[8].toFixed(4) + e[9].toFixed(4) + e[10].toFixed(4) + pr[8].toFixed(4) + pr[9].toFixed(4) + pr[0].toFixed(4);
  const camMoved = key !== lastCamKey; lastCamKey = key;
  const spinning = !reduceMotion && spinners.some((s) => s.parent && s.parent.parent);
  if (!force && !walk.on && !camMoved && now > renderUntil && !(spinning && frameNo % 2 === 0)) return;
  const cp = camera.position;
  const { H } = state.building;
  walls.forEach((wl, i) => { if (window.__rkOn) { const [nx, nz] = wl.userData.normal, [wx, wz] = wl.userData.center; wl.visible = (cp.x - wx) * nx + (cp.z - wz) * nz < 0.2; } else wl.visible = walk.on || (typeof wallVisible === 'function' ? wallVisible(wl, i, cp) : true); });
  if (roof) roof.visible = (walk.on && !RP.on) || cp.y < H + 0.5;
  for (const r of zoneRoofs) r.visible = walk.on && !RP.on;
  if (ceilingGroup && RP.on) ceilingGroup.visible = cp.y < H + 0.5;
  if (!reduceMotion) for (const s of spinners) if (!walk.off.has(s.userData.spinOf)) s.rotation.y += 0.01;
  if (walk.on) { roomKeepSpectatorOut(); staTick(dt); stowSync(); recTick(now); hlTick(now); if (!RP.on) renderCamView(now); renderCctv(now); netTick(dt, now); rkSpecStep(dt); vmUpdate(dt); if (now - pc.clockT > 20000) { pc.clockT = now; pcClock(); } }
  if (walk.on) updateBalls(dt);
  vbTrailStep(dt);   /* 球的軌跡光帶 */
  if (walk.on) vmWireTick();
  const tp = walk.on && tpBegin(dt);
  if (walk.on) vbChgPlace();
  hideOccluders(window.__rkOn && RK.P[RK.my] && RK.P[RK.my].av ? RK.P[RK.my].av.g.position : tp && TP.av ? TP.av.g.position : null);
  vmWireRender(true);
  renderScene();
  vmWireRender(false);
  chatBubbleStep();
  labelRenderer.render(scene, camera);
  if (walk.on) vbDomFx();
  if (tp) tpEnd();
}

