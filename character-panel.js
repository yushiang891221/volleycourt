import * as THREE from 'three';
import { makeToyAvatar, decodeLook } from './avatar-toy.js';
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
    camera.position.set(.5, 1.1, 3.6); camera.lookAt(0, .9, 0);
    renderer.render(scene, camera); img.src = renderer.domElement.toDataURL();
  } finally { renderer.dispose(); renderer.forceContextLoss(); }
}

export function openCharacterPanel() {
  if (!document.getElementById('lobby-shell') || editing) return;
  let dialog = document.getElementById('character-panel');
  if (!dialog) {
    dialog = document.createElement('dialog'); dialog.id = 'character-panel';
    dialog.setAttribute('aria-labelledby', 'character-title');
    dialog.innerHTML = '<form method="dialog"><h2 id="character-title">角色資訊</h2><div class="character-info"><img alt="你的角色預覽" width="240" height="300"><div><h3></h3><dl><dt>等級</dt><dd>—</dd><dt>場數</dt><dd>—</dd><dt>勝率</dt><dd>—</dd><dt>遊玩時數</dt><dd>—</dd></dl></div></div><p class="form-error" role="status"></p><div class="buttons"><button type="button" class="orange" data-edit>調整外觀</button><button type="button" data-logout hidden>登出</button><button>關閉</button></div></form>';
    document.body.append(dialog);
    import('./account-flow.js').then(({ accountEnabled, signOut }) => {
      const b = dialog.querySelector('[data-logout]'); b.hidden = !accountEnabled();
      b.onclick = async () => { try { await signOut(); } catch (e) { dialog.querySelector('.form-error').textContent = (e && e.message) || '登出失敗'; } };
    });
    dialog.querySelector('[data-edit]').onclick = async () => {
      dialog.close();
      try { await editAppearance('edit'); openCharacterPanel(); }
      catch (e) { openCharacterPanel(); dialog.querySelector('.form-error').textContent = (e && e.message) || '外觀儲存失敗，請重試。'; }
    };
  }
  dialog.querySelector('h3').textContent = window.VBSettings.values.nickname || '球友';
  dialog.querySelector('.form-error').textContent = '';
  try { preview(dialog.querySelector('img')); }
  catch { dialog.querySelector('.form-error').textContent = '角色預覽載入失敗，請重新開啟。'; }
  dialog.showModal();
}
