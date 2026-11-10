import * as THREE from 'three';
import { makeToyAvatar, decodeLook, preloadAvatars, EQUIP, OPTIONS } from './avatar-toy.js';
import { openCreator } from './creator.js';
import { readLook, saveLook, myLookCode, readEquip, saveEquip } from './appearance.js';

let editing = false;
export function editAppearance(mode = 'edit') {
  if (editing || !document.getElementById('lobby-shell')) return Promise.resolve(false);
  editing = true;
  return new Promise((resolve, reject) => {
    const shell = document.getElementById('lobby-shell'), wasInert = shell.inert;
    let close;
    shell.inert = true;
    const cleanup = () => { removeEventListener('pagehide', close); editing = false; shell.inert = wasInert; };
    const finish = result => { cleanup(); resolve(result); };
    try {
      close = openCreator({ mode, look: decodeLook(readLook()),
        async onDone(look) {
          try {
            saveLook(look);
            const { syncAppearance } = await import('./account-flow.js'); await syncAppearance();   // 登入模式：存進帳號
            finish(true);
          } catch (error) { cleanup(); reject(error); }
        },
        onCancel() { finish(false); }
      });
      addEventListener('pagehide', close, { once: true });
    } catch (error) { cleanup(); reject(error); }
  });
}

function preview(img, code = myLookCode()) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(240, 300);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#152236');
    scene.add(new THREE.HemisphereLight('#ffffff', '#67738a', 2));
    const light = new THREE.DirectionalLight('#ffffff', 3); light.position.set(2, 4, 4); scene.add(light);
    const av = makeToyAvatar(decodeLook(code), 'orange'); scene.add(av.g);   // 含裝備
    const camera = new THREE.PerspectiveCamera(32, .8, .05, 20);
    camera.position.set(.35, 1.0, 2.95); camera.lookAt(0, .78, 0);   // 角色整個人（含頭頂、帽子）都在預覽圖裡
    renderer.render(scene, camera); img.src = renderer.domElement.toDataURL();
  } finally { renderer.dispose(); renderer.forceContextLoss(); }
}

// 球衣與裝備：官方送的配件（之後商店買的也放這裡），穿上／脫下馬上生效；護膝存在外觀裡（會同步到帳號）
export function openEquipPanel() {
  if (!document.getElementById('lobby-shell') || editing) return;
  let d = document.getElementById('equip-panel');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'equip-panel'; d.setAttribute('aria-labelledby', 'equip-title');
    d.innerHTML = '<form method="dialog"><h2 id="equip-title">球衣與裝備</h2><nav class="eq-tabs" role="tablist"><button type="button" role="tab" aria-selected="true">配件</button><button type="button" role="tab" aria-selected="false" disabled title="之後開放：解鎖的動作、表情放進 T 輪盤">動作與表情（即將開放）</button></nav><div class="eq-body"><img alt="穿上裝備的角色" width="240" height="300"><div class="eq-slots"></div></div><p class="form-error" role="status"></p><div class="buttons"><button class="orange">完成</button></div></form>';
    document.body.append(d);
  }
  const slots = d.querySelector('.eq-slots'), img = d.querySelector('img'), err = d.querySelector('.form-error');
  const rows = [['knee', '護膝', OPTIONS.knee]].concat(Object.entries(EQUIP).map(([k, v]) => [k, v.name, v.items]));
  const draw = () => {
    const L = decodeLook(readLook()), eq = readEquip(), long = L.pants === 1;
    slots.innerHTML = rows.map(([k, name, items]) => {
      const cur = k === 'knee' ? L.knee : eq[k] | 0;
      return `<div class="eq-row"><span>${name}${k === 'knee' && long ? '<small>穿長褲時不戴護膝</small>' : ''}</span><div class="eq-items">${items.map((t, i) => `<button type="button" data-k="${k}" data-i="${i}" aria-pressed="${cur === i}"${k === 'knee' && long ? ' disabled' : ''}>${t}</button>`).join('')}</div></div>`;
    }).join('');
    try { preview(img); err.textContent = ''; } catch { err.textContent = '角色預覽載入失敗。'; }
  };
  slots.onclick = async (e) => {
    const b = e.target.closest('button[data-k]'); if (!b || b.disabled) return;
    const k = b.dataset.k, i = +b.dataset.i;
    if (k === 'knee') {
      const L = decodeLook(readLook()); L.knee = i; saveLook(L);
      try { const { syncAppearance } = await import('./account-flow.js'); await syncAppearance(); } catch (x) { err.textContent = (x && x.message) || '護膝存到帳號失敗，稍後會再同步。'; }
    } else { const eq = readEquip(); eq[k] = i; saveEquip(eq); }
    draw();
  };
  draw(); d.showModal();
  preloadAvatars().then(() => { if (d.open) draw(); }, () => {});   // 模型載好再畫一次（配件只有正式模型才有）
}
// 大廳右欄下半部的角色資訊卡（登出、刪除帳號在「系統設定 → 其他」）
export function mountCharacterCard(card) {
  if (!card) return;
  const img = card.querySelector('img'), name = card.querySelector('.me-name'), err = card.querySelector('.me-err');
  const draw = () => { try { preview(img); err.textContent = ''; } catch { err.textContent = '角色預覽載入失敗，請重新整理。'; } };
  const setName = () => { name.textContent = (window.VBSettings && window.VBSettings.values.nickname) || '球友'; };
  setName(); draw();
  preloadAvatars().then(draw, () => {});   // 模型載好再畫一次（一開始可能還是備用角色）
  addEventListener('vb-settings-change', setName);
  addEventListener('vb-look-change', draw);   // 從帳號同步回來的外觀
  card.querySelector('[data-edit]').onclick = async () => {
    err.textContent = '';
    try { await editAppearance('edit'); draw(); }
    catch (e) { draw(); err.textContent = (e && e.message) || '外觀儲存失敗，請重試。'; }
  };
}
