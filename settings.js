/* Shared desktop preferences. Storage and migration live here only. */
(() => {
  'use strict';
  const bindings = [
    ['w','前進','KeyW'],['s','後退／打短','KeyS'],['a','左移','KeyA'],['d','右移','KeyD'],
    ['arrowup','前進（別名）','ArrowUp'],['arrowdown','後退（別名）','ArrowDown'],['arrowleft','左移（別名）','ArrowLeft'],['arrowright','右移（別名）','ArrowRight'],
    ['shift','衝刺／撲救修飾鍵','Shift'],['crouch','蹲下（按住；接重扣比較穩）','Control'],['e','互動／拿球','KeyE'],['v','接球','KeyV'],['q','接球（別名）','KeyQ'],
    [' ','跳／跳發','Space'],['b','攔網','KeyB'],['t','擊掌／嘲諷選單','KeyT'],['p','切換視角','KeyP'],['f','拋給隊友','KeyF'],
    ['1','舉球：4 號位','Digit1'],['2','舉球：快攻','Digit2'],['3','舉球：2 號位','Digit3'],['4','舉球：後排中間','Digit4'],['5','舉球：老三','Digit5'],['6','舉球：後排 5 號位（左後）','Digit6'],
    ['[','視野變窄','BracketLeft'],[']','視野變廣','BracketRight'],
    ['j','羽球／匹克球：軟球','KeyJ'],['k','羽球／匹克球：抽球','KeyK'],['l','羽球／匹克球：挑球','KeyL']
    ,['ready','準備／取消準備','KeyR'],['start','房主開始遊戲','KeyG']
  ];
  const defaultKeys = () => Object.fromEntries(bindings.map(([a,,k]) => [a,k]));
  const defaults = () => ({ assist:true, cameraAssist:true, landing:true, cues:true, third:true, rings:true, showFps:false, nameTags:true, bloom:true,
    quality: matchMedia('(pointer: coarse)').matches || innerWidth < 900 ? 'low' : 'high', fov:80,
    sensitivity:1, swap:[false,false,false], volume:100, mute:false, nickname:'', keys:defaultKeys() });
  const read = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  function clean(raw) {
    const v=defaults(); if (!raw || typeof raw !== 'object') return v;
    for (const k of ['assist','cameraAssist','landing','cues','third','rings','mute','showFps','nameTags','bloom']) if (typeof raw[k]==='boolean') v[k]=raw[k];
    for (const [k,min,max] of [['fov',60,100],['sensitivity',.1,5],['volume',0,100]]) if (Number.isFinite(raw[k])) v[k]=Math.max(min,Math.min(max,raw[k]));
    if (['high','low'].includes(raw.quality)) v.quality=raw.quality;
    if (typeof raw.nickname==='string' && !nicknameError(raw.nickname)) v.nickname=raw.nickname.trim();
    if (Array.isArray(raw.swap)) v.swap=v.swap.map((_,i)=>raw.swap[i]===true);
    if (raw.keys) {
      const known=bindings.filter(([a])=>Object.hasOwn(raw.keys,a));
      if(known.every(([a])=>validCode(raw.keys[a])) && new Set(known.map(([a])=>raw.keys[a])).size===known.length){
        const keys=Object.fromEntries(known.map(([a])=>[a,raw.keys[a]]));
        for(const [a,,fallback] of bindings)if(!keys[a])keys[a]=[fallback,...bindings.map(x=>x[2]),'KeyZ','KeyX','KeyC','KeyG','KeyH','KeyU','KeyI','KeyO'].find(k=>!Object.values(keys).includes(k));
        v.keys=keys;
      }
    }
    if (v.keys.start === 'Enter') {
      const displaced = bindings.find(([a]) => a !== 'start' && v.keys[a] === 'KeyG')?.[0];
      v.keys.start = 'KeyG';
      if (displaced) v.keys[displaced] = 'Enter';
    }
    for (const [action] of bindings) if (v.keys[action] === 'Enter') {
      v.keys[action] = [...bindings.map(b => b[2]), 'KeyZ','KeyX','KeyC','KeyH','KeyU','KeyI','KeyO'].find(k => !Object.values(v.keys).includes(k));
    }
    return v;
  }
  function validCode(c) { return typeof c==='string' && /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift|Control|Space|Bracket(Left|Right)|Backquote|Minus|Equal|Backslash|Semicolon|Quote|Comma|Period|Slash|Tab|Enter|Backspace|Delete|Home|End|PageUp|PageDown|Numpad[0-9])$/.test(c); }
  function nicknameError(n) { return /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(n) ? '暱稱不能包含控制字元' : [...n.trim()].length<2 || [...n.trim()].length>12 ? '暱稱需要 2～12 字' : ''; }
  let raw; try { raw=JSON.parse(read('vb.settings')); } catch (_) {}
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) raw={ quality:read('vb.quality'), fov:Number(read('vb.fov'))||80, mute:read('vb.sfx')==='0' };
  raw.nickname=read('vb.mp.name') || raw.nickname;
  let values=clean(raw), dialog, capture='', previousFocus;
  function save() { try { localStorage.setItem('vb.settings',JSON.stringify(values)); localStorage.setItem('vb.mp.name',values.nickname); return true; } catch (_) { return false; } }
  function update(patch) { values=clean({...values,...patch}); const saved=save(); dispatchEvent(new CustomEvent('vb-settings-change',{detail:values})); if(dialog) dialog.querySelector('.settings-note').textContent=saved?'已儲存，立即生效':'已套用；瀏覽器無法儲存設定'; return saved; }
  const code = e => /^Shift/.test(e.code) ? 'Shift' : /^Control/.test(e.code) ? 'Control' : e.code || bindings.find(([a])=>a===e.key.toLowerCase())?.[2];
  const key = e => e.key==='Escape' ? 'escape' : bindings.find(([a])=>values.keys[a]===code(e))?.[0] || '';
  const keyName = c => ({Space:'空白鍵',Shift:'Shift',BracketLeft:'[',BracketRight:']',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'}[c] || c.replace(/^Key|^Digit/,''));
  function bind(action,c) { if (c === 'Enter' || !validCode(c) || !Object.hasOwn(values.keys,action)) return false; const keys={...values.keys}, other=bindings.find(([a])=>a!==action && keys[a]===c)?.[0]; if(other) keys[other]=keys[action]; keys[action]=c; update({keys}); return true; }
  function render() {
    for(const el of dialog.querySelectorAll('[data-pref]')) { const val=values[el.dataset.pref]; if(el.type==='checkbox') el.checked=val; else el.value=val; if(el.type==='range') el.nextElementSibling.textContent=val; }
    for(const b of dialog.querySelectorAll('[data-bind]')) b.textContent=capture===b.dataset.bind?'按下新按鍵…':keyName(values.keys[b.dataset.bind]);
    for(const b of dialog.querySelectorAll('[data-swap]')) { const i=+b.dataset.swap; b.textContent=values.swap[i]?'已左右對調':'原本左右順序'; b.setAttribute('aria-pressed',String(values.swap[i])); }
    dialog.querySelector('[data-fullscreen]').textContent=document.fullscreenElement?'切回視窗':'進入全螢幕';
  }
  function build() {
    dialog=document.createElement('dialog'); dialog.className='vb-settings'; dialog.setAttribute('aria-labelledby','settings-title');
    const check=(k,t)=>`<label class="settings-row"><span>${t}</span><input type="checkbox" data-pref="${k}"></label>`;
    const slider=(k,t,min,max,step)=>`<label class="settings-row"><span>${t}</span><input type="range" data-pref="${k}" min="${min}" max="${max}" step="${step}"><output></output></label>`;
    const pages=[
      ['遊戲',check('assist','接球輔助：身體輕輕帶向落點')+check('cameraAssist','視角輔助')+check('landing','落點圈')+check('cues','按鍵提示')+check('third','比賽／陪練預設第三人稱')+check('rings','顯示隊友耐力圈')+check('nameTags','顯示球員名牌')],
      ['畫面','<div class="settings-row"><span>顯示模式</span><button data-fullscreen>進入全螢幕</button></div><label class="settings-row"><span>畫質</span><select data-pref="quality"><option value="high">高</option><option value="low">省電</option></select></label>'+check('showFps','顯示 FPS（畫面右上角）')+check('bloom','泛光效果（亮的地方會暈開；關掉畫面比較清楚、不霧）')+slider('fov','視野（廣角）',60,100,1)],
      ['控制',slider('sensitivity','滑鼠靈敏度',.1,5,.05)+'<p>點按鍵，再按新鍵；重複時互換。Esc 取消。滑鼠按鈕維持原操作。</p><div class="settings-bindings">'+bindings.filter(([a])=>!['j','k','l'].includes(a)).map(([a,t])=>`<div class="settings-row"><span>${t}</span><button data-bind="${a}"></button></div>`).join('')+'<div class="settings-row"><span>聊天（房間中，固定按鍵）</span><span>Enter</span></div></div><h3>舉球面板左右</h3>'+['4 號位','快攻','2 號位'].map((t,i)=>`<div class="settings-row"><span>${t}</span><button data-swap="${i}"></button></div>`).join('')+'<button data-reset-keys>全部還原預設按鍵</button>'],
      ['音效',slider('volume','主音量',0,100,1)+check('mute','靜音')],
      ['其他','<label class="settings-row"><span>暱稱（2～12 字）</span><input data-pref="nickname" maxlength="48" autocomplete="off"></label><button data-reset>還原所有設定</button><div class="settings-account" data-account hidden><h3>帳號</h3><div class="settings-row"><span data-who>目前登入：—</span><button data-switch>切換帳號</button></div><div class="settings-row"><span>登出這個 Google 帳號</span><button data-logout>登出</button></div><div class="settings-row"><span>永久刪除帳號、暱稱和角色外觀（無法復原）・<a href="privacy.html" target="_blank" rel="noopener">隱私權政策</a></span><button data-delete-account class="settings-danger">刪除帳號</button></div><p class="settings-account-err" role="status"></p></div>']
    ];
    dialog.innerHTML='<header><div><small>VOLLEYCOURT · PREFERENCES</small><h2 id="settings-title">個人設定</h2></div><button data-close aria-label="關閉設定">✕</button></header><nav role="tablist" aria-label="設定分頁">'+pages.map(([t],i)=>`<button role="tab" id="settings-tab-${i}" aria-controls="settings-page-${i}" aria-selected="${i===0}" data-tab="${i}">${t}</button>`).join('')+'</nav><div class="settings-pages">'+pages.map(([,body],i)=>`<section role="tabpanel" id="settings-page-${i}" aria-labelledby="settings-tab-${i}" ${i?'hidden':''}>${body}</section>`).join('')+'</div><footer><span class="settings-note" role="status">變更立即生效</span><button data-close>完成</button></footer>';
    document.body.append(dialog);
    // 帳號（登入模式才顯示）：登出、刪除帳號
    import('./account-flow.js').then(async m=>{ if(!m.accountEnabled()) return; dialog.querySelector('[data-account]').hidden=false; const me=await m.accountInfo(); const w=dialog.querySelector('[data-who]'); w.textContent=me?`目前登入：${me.email||me.name||'Google 帳號'}`:'目前沒有登入'; }).catch(()=>{});
    dialog.addEventListener('click',async e=>{
      const b=e.target.closest('button'); if(!b)return;
      const accErr=dialog.querySelector('.settings-account-err');
      if(b.hasAttribute('data-switch')) { b.disabled=true; try { await (await import('./account-flow.js')).switchAccount(); } catch(err) { accErr.textContent=(err&&err.message)||'切換帳號失敗'; b.disabled=false; } return; }
      if(b.hasAttribute('data-logout')) { try { await (await import('./account-flow.js')).signOut(); } catch(err) { accErr.textContent=(err&&err.message)||'登出失敗'; } return; }
      if(b.hasAttribute('data-delete-account')) {
        const ans=prompt('刪除後，帳號、暱稱和角色外觀都會永久刪除，無法復原。\n確定要刪除，請輸入「刪除」兩個字：');
        if(ans===null) return;
        if(ans.trim()!=='刪除') { accErr.textContent='沒有輸入「刪除」，帳號沒有刪除。'; return; }
        accErr.textContent='正在刪除帳號…';
        try { await (await import('./account-flow.js')).deleteAccount(); } catch(err) { accErr.textContent=(err&&err.message)||'刪除帳號失敗，請重試。'; }
        return;
      }
      if(b.hasAttribute('data-close')) close();
      if(b.dataset.tab!==undefined) { capture=''; for(const tab of dialog.querySelectorAll('[data-tab]')) tab.setAttribute('aria-selected',String(tab===b)); for(const p of dialog.querySelectorAll('[role=tabpanel]')) p.hidden=p.id!==`settings-page-${b.dataset.tab}`; }
      if(b.dataset.bind!==undefined)capture=b.dataset.bind;
      if(b.dataset.swap!==undefined) { const swap=[...values.swap]; swap[+b.dataset.swap]=!swap[+b.dataset.swap]; update({swap}); }
      if(b.hasAttribute('data-reset-keys')) {capture='';update({keys:defaultKeys(),swap:[false,false,false]});}
      if(b.hasAttribute('data-reset')) {capture='';update({...defaults(),nickname:values.nickname});}
      if(b.hasAttribute('data-fullscreen')) try { if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen(); }catch(_){dialog.querySelector('.settings-note').textContent='瀏覽器未允許全螢幕';}
      render();
    });
    const change=e=>{const el=e.target,k=el.dataset.pref;if(!k)return;if(k==='nickname'){const err=nicknameError(el.value);if(err){dialog.querySelector('.settings-note').textContent=err;render();return;}}
      update({[k]:el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value}); if(el.type==='range')el.nextElementSibling.textContent=values[k];};
    dialog.addEventListener('change',change); dialog.addEventListener('input',e=>{if(e.target.type==='range')change(e);});
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('keydown',e=>{if(capture){e.preventDefault();e.stopPropagation();if(e.key==='Escape')capture='';else if(bind(capture,code(e)))capture='';else dialog.querySelector('.settings-note').textContent='此鍵保留給瀏覽器，請選其他鍵';render();}});
    document.addEventListener('fullscreenchange',render);
  }
  function open(){if(!dialog)build();previousFocus=document.activeElement;capture='';dispatchEvent(new Event('vb-settings-open'));render();dialog.showModal();}
  function close(){capture='';dialog.close();dispatchEvent(new Event('vb-settings-close'));previousFocus?.focus();}
  window.VBSettings={get values(){return values;},bindings,defaults,update,bind,key,keyName,open,close,nicknameError,get isOpen(){return !!dialog?.open;}};
  // Personal preferences are intentionally tab-local until reload; room rules never use storage events.
})();
