import * as THREE from 'three';
import { makeToyAvatar, decodeLook, preloadAvatars } from './avatar-toy.js';
import { openCreator } from './creator.js';
import { readLook, saveLook } from './appearance.js';

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

function preview(img) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(240, 300);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#152236');
    scene.add(new THREE.HemisphereLight('#ffffff', '#67738a', 2));
    const light = new THREE.DirectionalLight('#ffffff', 3); light.position.set(2, 4, 4); scene.add(light);
    const av = makeToyAvatar(decodeLook(readLook()), 'orange'); scene.add(av.g);
    const camera = new THREE.PerspectiveCamera(32, .8, .05, 20);
    camera.position.set(.35, .95, 2.5); camera.lookAt(0, .68, 0);   // 拉近：角色填滿預覽圖
    renderer.render(scene, camera); img.src = renderer.domElement.toDataURL();
  } finally { renderer.dispose(); renderer.forceContextLoss(); }
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
