// 個人球衣設計器（J2）：左＝角色即時預覽（拖曳轉、正面／背面），右＝版型、樣式、顏色、設計、球褲五個分頁。
// openJerseyDesigner({ code, slot }) → Promise<代碼或 null>（null＝取消）。存檔由呼叫的人處理。
import * as THREE from 'three';
import { makeToyAvatar, decodeLook, preloadAvatars } from './avatar-toy.js';
import { myLookCode } from './appearance.js';
import { PALETTE, STYLES, PRESETS, CUTS, NECKS, LAYOUTS, FONTS, TEXT_MAX, DEFAULT_DESIGN, applyPreset, normalizeJersey, encodeJersey, decodeJersey, drawJerseyTorso, jerseyColors, ensureJerseyFonts } from './jersey.js';

const TABS = [['cut', '版型'], ['style', '樣式'], ['color', '顏色'], ['design', '設計'], ['shorts', '球褲']];
const COLOR_PARTS = [['body', '主色'], ['accent', '花紋色'], ['trim', '領口／袖口邊'], ['ink', '字與號碼']];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
#jersey-designer{width:min(1180px,96vw);height:min(760px,94vh);max-width:none;max-height:none;padding:0;border:1px solid #3b5368;border-radius:14px;background:#101a2a;color:#eef3f8;overflow:hidden}
#jersey-designer::backdrop{background:#000a}
#jersey-designer form{display:grid;grid-template-rows:auto 1fr auto;height:100%;margin:0}
.jd-top{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid #26384c}.jd-top h2{margin:0;font-size:20px}.jd-top small{color:#9fb3c4}
.jd-body{display:grid;grid-template-columns:minmax(300px,42%) 1fr;min-height:0}
.jd-left{position:relative;background:#0c1522;border-right:1px solid #26384c;min-height:0}
.jd-left canvas{width:100%;height:100%;display:block;cursor:grab;touch-action:none}
.jd-face{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:6px}
.jd-face button,.jd-chip{padding:6px 14px;border-radius:999px;border:1px solid #4b647c;background:#1d2c3e;color:#fff;cursor:pointer;font:inherit}
.jd-face button[aria-pressed=true],.jd-chip[aria-pressed=true]{background:#f2b705;color:#16202e;border-color:#f2b705;font-weight:700}
.jd-hint{position:absolute;left:12px;top:10px;color:#8fa6ba;font-size:12px}
.jd-right{display:grid;grid-template-rows:auto 1fr;min-height:0}
.jd-tabs{display:flex;border-bottom:1px solid #26384c}.jd-tabs button{flex:1;padding:12px 4px;background:none;border:0;border-bottom:3px solid transparent;color:#b9c8d6;font:inherit;font-size:15px;cursor:pointer}
.jd-tabs button[aria-selected=true]{color:#fff;font-weight:700;border-bottom-color:#f2b705}
.jd-pane{overflow:auto;padding:16px 18px}
.jd-pane h4{margin:14px 0 8px;font-size:14px;color:#b9c8d6}.jd-pane h4:first-child{margin-top:0}
.jd-row{display:flex;flex-wrap:wrap;gap:8px}
.jd-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px}
.jd-card{padding:6px;border:2px solid #2a3d52;border-radius:10px;background:#16233a;color:#dfe8f1;cursor:pointer;font:inherit;font-size:13px;text-align:center}
.jd-card[aria-pressed=true]{border-color:#f2b705;background:#24324a}
.jd-card canvas{width:100%;display:block;margin-bottom:4px}
.jd-sw{display:grid;grid-template-columns:repeat(7,36px);gap:6px}
.jd-sw button{width:36px;height:36px;border-radius:6px;border:2px solid #ffffff30;cursor:pointer;padding:0}
.jd-sw button[aria-pressed=true]{outline:3px solid #f2b705;outline-offset:2px}
.jd-field{display:flex;align-items:center;gap:8px;margin:6px 0}.jd-field input[type=text]{flex:1;max-width:260px;padding:8px 10px;border-radius:8px;border:1px solid #4b647c;background:#0c1522;color:#fff;font:inherit;font-size:16px}
.jd-note{color:#8fa6ba;font-size:12px;margin:6px 0}
.jd-foot{display:flex;justify-content:flex-end;gap:10px;padding:12px 18px;border-top:1px solid #26384c}
.jd-foot button{padding:9px 20px;border-radius:10px;border:1px solid #4b647c;background:#1d2c3e;color:#fff;font:inherit;font-size:15px;cursor:pointer}.jd-foot .orange{background:#f07c24;border-color:#f07c24;font-weight:700}
`;

// 縮圖：球衣剪影裡畫正面（樣式、配色、版位、字體卡片都用這個）
function shirtThumb(d, w = 112, h = 96, side = 'front') {
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const x = c.getContext('2d'), W = c.width, H = c.height;
  const col = jerseyColors(d);
  const shirt = new Path2D(); const P = (a, b) => [a * W, b * H];
  const pts = [P(.36, .08), P(.44, .14), P(.56, .14), P(.64, .08), P(.92, .24), P(.84, .42), P(.76, .36), P(.76, .94), P(.24, .94), P(.24, .36), P(.16, .42), P(.08, .24)];
  shirt.moveTo(...pts[0]); for (const p of pts.slice(1)) shirt.lineTo(...p); shirt.closePath();
  x.save(); x.clip(shirt);
  x.fillStyle = col.sleeve; x.fillRect(0, 0, W, H);
  // 身體：畫整圈再取正面（或背面）那一片
  const tw = 4 * 0.52 * W, th = 0.86 * H, o = document.createElement('canvas'); o.width = tw; o.height = th;
  drawJerseyTorso(o.getContext('2d'), tw, th, d, 10);
  const sx = side === 'front' ? tw * 0.25 : tw * 0.75;
  x.drawImage(o, sx, 0, tw * 0.5, th, 0.24 * W, 0.08 * H, 0.52 * W, th);
  x.restore();
  x.lineWidth = 3; x.strokeStyle = '#0006'; x.stroke(shirt);
  x.strokeStyle = col.trim; x.lineWidth = 6; x.beginPath(); x.moveTo(...P(.44, .14)); x.quadraticCurveTo(.5 * W, .2 * H, .56 * W, .14 * H); x.stroke();
  return c;
}

let open = false;
export function openJerseyDesigner({ code, slot = 0 } = {}) {
  if (open) return Promise.resolve(null);
  open = true;
  if (!document.getElementById('jd-css')) { const s = document.createElement('style'); s.id = 'jd-css'; s.textContent = CSS; document.head.append(s); }
  let d = normalizeJersey(decodeJersey(code) || DEFAULT_DESIGN), tab = 'style', part = 'body', sub = 'front', face = 'front';
  const dlg = document.createElement('dialog'); dlg.id = 'jersey-designer'; dlg.setAttribute('aria-labelledby', 'jd-title');
  dlg.innerHTML = `<form method="dialog">
    <header class="jd-top"><h2 id="jd-title">設計我的球衣</h2><small>第 ${slot + 1} 件・走動、大廳、練習時穿；正式比賽照兩隊隊服</small></header>
    <div class="jd-body">
      <section class="jd-left"><span class="jd-hint">拖曳轉動・滾輪拉近拉遠</span><canvas aria-label="球衣預覽（按住拖曳可以轉）"></canvas>
        <div class="jd-face"><button type="button" data-face="front">正面</button><button type="button" data-face="back">背面</button></div></section>
      <section class="jd-right"><nav class="jd-tabs" role="tablist"></nav><div class="jd-pane"></div></section>
    </div>
    <footer class="jd-foot"><button type="button" data-act="cancel">取消</button><button type="button" class="orange" data-act="save">存檔並穿上</button></footer>
  </form>`;
  document.body.append(dlg);
  const $q = (s) => dlg.querySelector(s);

  // ---------- 左邊：角色預覽 ----------
  const canvas = $q('.jd-left canvas'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0c1522');
  scene.add(new THREE.HemisphereLight('#ffffff', '#67738a', 2)); const sun = new THREE.DirectionalLight('#ffffff', 3); sun.position.set(2, 4, 4); scene.add(sun);
  const back = new THREE.DirectionalLight('#ffffff', 1.6); back.position.set(-2, 3, -4); scene.add(back);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  let av = null, yaw = 0, pitch = 0.05, dist = 3.3, drag = null, raf = 0, rebuildT = 0;
  const draw = () => {
    raf = 0; const w = canvas.clientWidth || 400, h = canvas.clientHeight || 500; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    const ty = 0.82; cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist); cam.lookAt(0, ty, 0);
    renderer.render(scene, cam);
  };
  const ask = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const rebuild = () => { clearTimeout(rebuildT); rebuildT = setTimeout(() => { if (av) scene.remove(av.g); av = makeToyAvatar(decodeLook(myLookCode()), { design: d }); scene.add(av.g); ask(); }, 60); };
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; yaw = drag.yaw - (e.clientX - drag.x) * 0.012; pitch = Math.max(-0.6, Math.min(0.9, drag.pitch + (e.clientY - drag.y) * 0.008)); ask(); });
  const up = () => { drag = null; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.max(1.3, Math.min(4.5, dist * Math.exp(e.deltaY * 0.0012))); ask(); }, { passive: false });
  const ro = new ResizeObserver(ask); ro.observe(canvas);
  const setFace = (f) => { face = f; yaw = f === 'back' ? Math.PI : 0; for (const b of dlg.querySelectorAll('[data-face]')) b.setAttribute('aria-pressed', b.dataset.face === face); ask(); };

  // ---------- 右邊：分頁 ----------
  const pressed = (on) => `aria-pressed="${!!on}"`;
  const cards = (list, cur, attr, thumb) => `<div class="jd-cards">${list.map((name, i) => `<button type="button" class="jd-card" data-${attr}="${i}" ${pressed(cur === i)}><canvas data-thumb="${attr}:${i}"></canvas>${esc(name)}</button>`).join('')}</div>`;
  const swatches = (key) => `<div class="jd-sw">${PALETTE.map((c, i) => `<button type="button" data-color="${key}:${i}" style="background:${c}" ${pressed(d[key] === i)} aria-label="顏色 ${i + 1}"></button>`).join('')}</div>`;
  const chips = (list, cur, attr) => `<div class="jd-row">${list.map(([k, name]) => `<button type="button" class="jd-chip" data-${attr}="${k}" ${pressed(cur === k)}>${esc(name)}</button>`).join('')}</div>`;
  const panes = {
    cut: () => `<h4>衣服</h4>${chips(CUTS.map((n, i) => [i, n]), d.cut, 'cut')}<p class="jd-note">練習 T：素面（不能選樣式），只能放字和號碼。</p>
      <h4>領口</h4>${chips(NECKS.map((n, i) => [i, n]), d.neck, 'neck')}`,
    style: () => d.cut === 1 ? '<p class="jd-note">練習 T 只有素面；要花紋請到「版型」換成運動球衣。</p>' : `<h4>選一款花紋（${STYLES.length} 款）</h4>${cards(STYLES.map((s) => s.name), d.style, 'style')}`,
    color: () => `<h4>現成配色（點一下整件換好）</h4>${cards(PRESETS.map((p) => p.name), PRESETS.findIndex((p) => ['body', 'accent', 'trim', 'ink', 'shorts'].every((k) => p[k] === d[k])), 'preset')}
      <h4>自己調</h4>${chips(COLOR_PARTS, part, 'part')}<div style="height:10px"></div>${swatches(part)}`,
    design: () => `${chips([['front', '正面'], ['back', '背面'], ['font', '字體']], sub, 'sub')}<div style="height:12px"></div>` + (
      sub === 'front' ? `<div class="jd-field"><label for="jd-front">正面字</label><input type="text" id="jd-front" maxlength="${TEXT_MAX}" value="${esc(d.front)}" placeholder="例如隊名（最多 ${TEXT_MAX} 字）"></div>
          <h4>版位</h4>${cards(LAYOUTS, d.layout, 'layout')}<p class="jd-note">沒有填正面字時，只放胸前號碼。</p>`
      : sub === 'back' ? `<div class="jd-field"><label for="jd-back">背面名字</label><input type="text" id="jd-back" maxlength="${TEXT_MAX}" value="${esc(d.back)}" placeholder="可以不填（最多 ${TEXT_MAX} 字）"></div>
          <label class="jd-field"><input type="checkbox" id="jd-icon" ${d.backIcon ? 'checked' : ''}> 領口下方放小排球記號</label><p class="jd-note">背後大號碼用捏臉時選的號碼。</p>`
      : `<h4>字體（正面字、背面名字、號碼一起換）</h4><div class="jd-cards">${FONTS.map((f, i) => `<button type="button" class="jd-card" data-font="${i}" ${pressed(d.font === i)}><canvas data-thumb="font:${i}"></canvas>${esc(f.name)}</button>`).join('')}</div>`),
    shorts: () => `<h4>球褲顏色</h4>${swatches('shorts')}
      <label class="jd-field"><input type="checkbox" id="jd-snum" ${d.shortsNum ? 'checked' : ''}> 球褲左下角放號碼</label><p class="jd-note">球褲號碼之後會加到角色模型上（目前先記住這個選項）。</p>`,
  };
  const drawThumbs = () => {
    for (const cv of dlg.querySelectorAll('canvas[data-thumb]')) {
      const [k, iS] = cv.dataset.thumb.split(':'), i = +iS;
      let t, img;
      if (k === 'style') t = { ...d, style: i, layout: 0, front: '' };
      else if (k === 'preset') t = applyPreset(d, i);
      else if (k === 'layout') t = { ...d, layout: i, front: d.front || '隊名' };
      if (k === 'font') {   // 字體：樣字「隊伍名稱 / NAME / 20」
        const c = document.createElement('canvas'); c.width = 224; c.height = 150; const x = c.getContext('2d'), f = FONTS[i];
        x.fillStyle = '#eef2f6'; x.fillRect(0, 0, 224, 150); x.fillStyle = '#16202e'; x.textAlign = 'center'; x.textBaseline = 'middle';
        [['隊伍名稱', 30, 34], ['NAME', 34, 78], ['20', 38, 122]].forEach(([s, size, y]) => { x.save(); x.font = `${f.w} ${size}px "${f.latin}", "${f.cjk}", sans-serif`; x.translate(112, y); if (f.skew) x.transform(1, 0, f.skew, 1, 0, 0); x.fillText(s, 0, 0); x.restore(); });
        img = c;
      } else img = shirtThumb(t);
      cv.width = img.width; cv.height = img.height; cv.getContext('2d').drawImage(img, 0, 0);
    }
  };
  const render = () => {
    $q('.jd-tabs').innerHTML = TABS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${n}</button>`).join('');
    $q('.jd-pane').innerHTML = panes[tab]();
    drawThumbs();
    if (tab === 'design' && sub === 'font') Promise.all(FONTS.map((_, i) => ensureJerseyFonts({ font: i, front: '隊伍名稱', back: 'NAME' }))).then(() => { if (open && tab === 'design' && sub === 'font') drawThumbs(); });
    if (tab === 'design' && sub !== 'font') ensureJerseyFonts(d).then(() => { if (open) drawThumbs(); });
  };
  const change = (patch, again = true) => { d = normalizeJersey({ ...d, ...patch }); rebuild(); if (again) render(); else drawThumbs(); };

  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const ds = b.dataset;
    if (ds.tab) { tab = ds.tab; render(); return; }
    if (ds.face) { setFace(ds.face); return; }
    if (ds.cut) return change({ cut: +ds.cut });
    if (ds.neck) return change({ neck: +ds.neck });
    if (ds.style) return change({ style: +ds.style });
    if (ds.preset) return change(applyPreset(d, +ds.preset));
    if (ds.part) { part = ds.part; render(); return; }
    if (ds.color) { const [k, i] = ds.color.split(':'); return change({ [k]: +i }); }
    if (ds.sub) { sub = ds.sub; if (sub === 'back') setFace('back'); else setFace('front'); render(); return; }
    if (ds.layout) return change({ layout: +ds.layout });
    if (ds.font) return change({ font: +ds.font });
    if (ds.act) finish(ds.act === 'save' ? encodeJersey(d) : null);
  });
  dlg.addEventListener('input', (e) => {
    if (e.target.id === 'jd-front') change({ front: e.target.value }, false);
    if (e.target.id === 'jd-back') change({ back: e.target.value }, false);
  });
  dlg.addEventListener('change', (e) => {
    if (e.target.id === 'jd-icon') change({ backIcon: e.target.checked }, false);
    if (e.target.id === 'jd-snum') change({ shortsNum: e.target.checked }, false);
    if (e.target.id === 'jd-front' || e.target.id === 'jd-back') { e.target.value = e.target.id === 'jd-front' ? d.front : d.back; }
  });
  let resolveFn;
  const finish = (result) => { if (!open) return; open = false; cancelAnimationFrame(raf); clearTimeout(rebuildT); ro.disconnect(); renderer.dispose(); renderer.forceContextLoss(); dlg.close(); dlg.remove(); resolveFn(result); };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });   // Esc＝取消
  setFace('front'); render(); dlg.showModal(); rebuild();
  preloadAvatars().then(rebuild, () => {});
  return new Promise((r) => { resolveFn = r; });
}
