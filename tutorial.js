/* 教學只消費事件與快照。Three.js 場景操作由 coach 注入。 */
(function (root) {
  'use strict';
  const sections = [
    { id: 'move', name: '移動與視角', count: 6, enabled: true },
    { id: 'recv', name: '接球', count: 4, enabled: true },
    { id: 'set', name: '舉球', count: 4, enabled: true },
    { id: 'atk', name: '攻擊', count: 4, enabled: true },
    { id: 'serve', name: '發球', count: 3, enabled: true },
    { id: 'block', name: '攔網', count: 4, enabled: true }
  ];
  const empty = () => ({ v: 1, done: {}, at: {}, updated: 0 });
  const copy = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function create(options = {}) {
    const now = options.now || Date.now;
    const coach = options.coach || {};
    const settings = options.settings || (() => root.VBSettings);
    let storage;
    try { storage = options.storage === undefined ? root.localStorage : options.storage; } catch (_) { /* 儲存可能被瀏覽器封鎖。 */ }
    let saved = empty();
    try {
      const raw = JSON.parse(storage?.getItem('vb.tutorial') || 'null');
      if (raw && raw.v === 1 && raw.done && raw.at && !Array.isArray(raw.done) && !Array.isArray(raw.at)) {
        for (const section of sections) {
          if (raw.done[section.id] === true) saved.done[section.id] = true;
          const at = raw.at[section.id];
          if (Number.isInteger(at) && at >= 0 && at <= section.count) saved.at[section.id] = at;
        }
        saved.updated = Number.isFinite(raw.updated) ? raw.updated : 0;
      }
    } catch (_) { /* 壞資料當成空進度。 */ }
    let section = null, step = 0, phase = 'closed', since = 0, successAt = 0;
    let snapshot = null, previous = null, target = null, turn = 0, crouchTime = 0;
    let seen = new Set(), failures = 0, dived = false, hint = '', skipped = false;
    let menu, panel, button, lastMarkup = '';
    let full = false, nextTimer = 0;   // full＝「新手教學」從頭走完六段（一段做完自動接下一段）
    const persist = () => {
      saved.updated = now();
      try { storage?.setItem('vb.tutorial', JSON.stringify(saved)); } catch (_) { /* 本次工作階段仍可繼續。 */ }
    };
    const key = action => {
      const config = settings();
      return '<kbd>' + escape(config?.keyName(config.values.keys[action]) || '未設定') + '</kbd>';
    };
    function instruction() {
      if (!section) return '';
      const movement = ['w', 'a', 's', 'd'].map(key).join(' ');
      const texts = {
        move: [
          '點一下遊戲畫面，鎖定滑鼠。',
          `用 ${movement} 走進地上的黃色圈。`,
          '移動滑鼠轉頭，看向另一個黃色圈，左右轉動約 90 度。',
          `按住 ${key('shift')} 跑進遠一點的黃色圈。`,
          `按住 ${key('crouch')} 蹲下，持續 1 秒。`,
          `按 ${key('p')} 切換視角，看看自己。`
        ],
        recv: [
          '看地上的落點圈，在球落地前走進圈裡，這一步不用接球。',
          `球快到身前時按 ${key('v')} 接球。`,
          `按住 ${key('crouch')}，球快到時按 ${key('v')} 接球。`,
          `按住 ${key('shift')} 再按 ${key('v')}，撲向遠處的球並接住。`
        ],
        set: [
          `球快到額頭前上方時按 ${key('1')}，前舉到 4 號位。`,
          `分別完成 ${key('2')} 中間快攻${seen.has(2) ? ' ✓' : ''}、${key('3')} 後舉到 2 號位${seen.has(3) ? ' ✓' : ''}。`,
          `任選一種完成，${key('4')} 後排中間、${key('5')} 老三（右後排）、${key('6')} 後排 5 號位（左後排）。`,
          `按住 ${key('1')}、${key('2')} 或 ${key('3')}，滑鼠往左或右拖，選不同於預設的舉法再放開。`
        ],
        atk: [
          `按住 ${key('shift')} 往網前助跑，移動中按 ${key(' ')} 起跳。這一步要一般起跳。`,
          '等舉球來到身前上方，空中按住左鍵蓄力，放開打到球。',
          '空中蓄力條到金色時放開左鍵，打到球。金色甜蜜點最大力又最準，紅色表示蓄過頭。',
          '等球到身前上方，起跳後在空中按右鍵吊球。'
        ],
        serve: [
          '站在底線後，拿著球按左鍵站發。對面紅圈是落點：轉頭調左右、滾輪調深淺。',
          '拿到下一顆球後，按右鍵站飄。',
          `拿著球按 ${key(' ')} 拋球起跳，等球發亮，在空中按住左鍵蓄力再放開跳發；改用右鍵可以跳飄，這一步請完成跳發。`
        ],
        block: [
          `走進網前黃色圈（離網 1 公尺內）。看教練把球拋起來，他起跳時你也按 ${key('b')} 起跳攔網。`,
          `按 ${key('b')} 起跳後，在空中左右移動滑鼠移手，練習封直線或斜線。`,
          `教練拋球、起跳扣球時跟著按 ${key('b')}，讓球碰到攔網手；任何碰手都算。`,
          `站在隊友旁 1.5 公尺內，教練起跳時按 ${key('b')}，隊友會跟你一起跳，攔到球。`
        ]
      };
      return texts[section.id]?.[step] || '';
    }
    function view() {
      return { phase, section: section?.id || null, name: section?.name || '', step, count: section?.count || 0,
        instruction: instruction(), hint, target: target && { ...target }, failures, full,
        completed: [...seen], allDone: sections.every(s => saved.done[s.id]) };
    }
    function render() {
      options.changed?.(view());
      if (!panel) return;
      menu.hidden = phase !== 'menu';
      panel.hidden = !['running', 'success', 'complete'].includes(phase);
      if (phase === 'menu') {   // 進練習模式的大面板：自由練習（也可以單獨練一段）／新手教學（從頭走完六段）
        const doneCount = sections.filter(s => saved.done[s.id]).length, first = sections.find(s => !saved.done[s.id]);
        const fullLabel = !doneCount ? '開始新手教學' : first ? `繼續新手教學（從「${first.name}」開始）` : '再走一次新手教學';
        menu.innerHTML = '<h2>練習模式</h2><p class="vb-tut-lead">要怎麼練？</p><div class="vb-tut-cards">'
          + '<section class="vb-tut-card"><h3>🏐 自由練習</h3><p>自己在球場上練：拿球發球、叫陪練舉球或對碰，想練什麼就練什麼。</p>'
          + '<button class="vb-tut-big" data-action="free">開始自由練習</button>'
          + '<p class="vb-tut-sub">也可以只練其中一段新手教學：</p><div class="vb-tut-chips">'
          + sections.map(s => `<button data-start="${s.id}" ${s.enabled ? '' : 'disabled'}>${saved.done[s.id] ? '✓ ' : ''}${s.name}</button>`).join('')
          + '</div></section>'
          + '<section class="vb-tut-card vb-tut-main"><h3>📘 新手教學</h3><p>從移動、接球、舉球、攻擊、發球到攔網，六段一步一步帶你做一遍，每一步都會提示要按哪個鍵。</p>'
          + `<p class="vb-tut-sub">${doneCount === sections.length ? '恭喜！六段全部完成。' : `已完成 ${doneCount}／${sections.length} 段`}</p>`
          + `<button class="vb-tut-big" data-action="full">${fullLabel}</button></section></div>`
          + (doneCount || Object.keys(saved.at).length ? '<button class="vb-tut-link" data-action="reset">重設教學進度</button>' : '');
      }
      const next = sections[sections.indexOf(section) + 1];
      const body = phase === 'complete'
        ? full && next?.enabled
          ? `<p>這段完成！馬上進入下一段：${next.name}</p><button data-action="next">現在就開始</button> <button data-action="stop">離開教學</button>`
          : `<p>這段完成！${view().allDone ? '恭喜！六段教學全部完成。' : ''}</p>${!full && next?.enabled ? `<button data-start="${next.id}">下一段</button>` : ''} <button data-action="open">回選單</button> <button data-action="stop">自由練習</button>`
        : `<p>${instruction()}</p><p role="status">${phase === 'success' ? skipped ? '已略過這步' : '做到了！' + (section?.id === 'block' ? hint : '') : hint}</p><button data-action="skip">略過這步</button> <button data-action="stop">離開教學</button>`;
      const head = full && section ? `新手教學 第 ${sections.indexOf(section) + 1}／${sections.length} 段・` : '';
      const markup = `<strong>${head}${section?.name || ''} ${step + 1}／${section?.count || 0}</strong>${body}`;
      panel.dataset.phase = phase;
      if (markup !== lastMarkup) { panel.innerHTML = markup; lastMarkup = markup; }
    }
    function enter() {
      phase = 'running'; since = now(); previous = null; turn = 0; crouchTime = 0;
      seen = new Set(); failures = 0; dived = false; hint = ''; skipped = false;
      target = coach.step?.(section.id, step, snapshot) || null;
      saved.at[section.id] = step; persist(); render();
    }
    function start(id) {
      const chosen = sections.find(s => s.id === id && s.enabled);
      if (!chosen) return false;
      stop();
      if (coach.start?.(id) === false) return false;
      section = chosen; step = saved.done[id] ? 0 : Math.min(saved.at[id] || 0, chosen.count - 1);
      enter(); return true;
    }
    function startOne(id) { full = false; return start(id); }   // 單獨練一段
    function startFull() {   // 新手教學：從第一段還沒做完的開始（都做完就從頭），一段做完自動接下一段
      const first = sections.find(s => s.enabled && !saved.done[s.id]) || sections[0];
      full = true; if (!start(first.id)) full = false;
    }
    function nextSection() {
      const next = sections[sections.indexOf(section) + 1];
      if (full && next) start(next.id);
    }
    function quit() { full = false; stop(); }
    function stop() {
      clearTimeout(nextTimer); coach.stop?.(); section = null; phase = 'closed'; target = null; previous = null; snapshot = null; render();
    }
    function open() { full = false; stop(); phase = 'menu'; coach.release?.(); render(); }
    function reset() { stop(); saved = empty(); persist(); open(); }
    function missHint() {   // 每段自己的失敗提示（按鍵照玩家設定）
      const id = section?.id;
      if (id === 'recv') return step === 3 ? `球快掉到地上時才按住 ${key('shift')} 再按 ${key('v')} 撲過去，太早撲會撲空。` : '等球靠近身體、亮起來再按，先看落點站好。';
      if (id === 'set') return '球掉到額頭前上方時再按數字鍵，太早太晚都舉不到。';
      if (id === 'atk') return '等球掉到頭頂前上方再起跳，起跳後再按左鍵。';
      if (id === 'block') return `看教練：他一起跳你就按 ${key('b')}，跟他同時跳，手才來得及舉到網上。`;
      if (id === 'serve') return '拿著球再按，發完等下一顆球回到手上。';
      return '再試一次。';
    }
    function succeed(skip = false) {
      if (phase !== 'running') return;
      if (!(section?.id === 'block' && /攔網成功|碰到球/.test(hint))) hint = '';   // 做到了：清掉舊的失敗提示（攔網保留成功的那句）
      skipped = skip; phase = 'success'; successAt = now(); coach.pause?.(); render();
    }
    function advance() {
      saved.at[section.id] = step + 1;
      if (step + 1 === section.count) {
        saved.done[section.id] = true; phase = 'complete'; coach.stop?.(); persist();
        const next = sections[sections.indexOf(section) + 1];
        if (full && next?.enabled) { clearTimeout(nextTimer); nextTimer = setTimeout(() => { if (phase === 'complete' && full) nextSection(); }, 2500); }   // 新手教學：2.5 秒後自動進下一段（滑鼠不放開，接著練）
        else coach.release?.();
        render();
      } else { step++; enter(); }
    }
    function emit(name, data = {}) {
      if (phase !== 'running') return;
      if (name === 'recvMiss' || name === 'whiff' || name === 'feedMiss') {
        if (name !== 'whiff') failures++;
        hint = missHint();
        if (section.id === 'recv' && step === 3 && failures >= 3) hint = '已連續三次沒接到，這次只要有撲出去就算完成。';
      }
      if (section.id === 'recv') {
        if (name === 'dive') { dived = true; if (step === 3 && failures >= 3) succeed(); }
        if (name === 'recv' && (step === 1 || step === 2 && data.crouch || step === 3 && dived && data.dive)) succeed();
      }
      if (section.id === 'set' && name === 'set') {
        if (step === 1 && [2, 3].includes(data.n)) seen.add(data.n);
        if (step === 0 && data.n === 1 || step === 1 && seen.size === 2 || step === 2 && [4, 5, 7].includes(data.n) || step === 3 && data.menu && data.def === false) succeed();
      }
      if (section.id === 'atk') {
        if (name === 'whiff') hint = '等球發亮、掉到身前上方再放開左鍵，太早揮會打不到。';
        if (step === 0 && name === 'jump' && data.block === false && data.speed >= 2) succeed();
        if (name === 'atk' && (step === 1 && data.air && Number.isFinite(data.chg) || step === 2 && data.zone === 'sweet' || step === 3 && data.tip)) succeed();
      }
      if (section.id === 'serve' && name === 'serve' && data.type === ['std', 'float', 'jump'][step]) succeed();
      if (section.id === 'block') {
        if (step === 0 && name === 'jump' && data.block && snapshot && Number.isFinite(snapshot.nearNet) && snapshot.nearNet >= 0 && snapshot.nearNet <= 1) succeed();
        if (name === 'block' && (step === 2 || step === 3 && data.mate === true)) {
          hint = data.kind === 'stuff' ? '攔網成功！' : '碰到球了！'; succeed();
        }
      }
      render();
    }
    function frame(state) {
      snapshot = state;
      if (phase === 'success') { if (now() - successAt >= 800) advance(); return; }
      if (phase !== 'running') return;
      coach.frame?.(state);
      const dt = previous ? Math.max(0, Math.min(0.1, (now() - previous.time) / 1000)) : 0;
      if (section.id === 'move') {
        const inCircle = target && Math.hypot(state.x - target.x, state.z - target.z) <= 0.8;
        if (previous) turn += Math.abs(Math.atan2(Math.sin(state.yaw - previous.yaw), Math.cos(state.yaw - previous.yaw)));
        crouchTime = state.crouch ? crouchTime + dt : 0;
        if (step === 0 && state.locked || step === 1 && inCircle || step === 2 && turn > 1.5 || step === 3 && state.sprint && inCircle || step === 4 && crouchTime >= 1 || step === 5 && previous && state.tp !== previous.tp) succeed();
      }
      if (section.id === 'recv' && step === 0 && state.incoming && Math.hypot(state.x - state.incoming.x, state.z - state.incoming.z) <= 0.8) succeed();
      if (section.id === 'block' && step === 1 && state.air && state.airBlock && Math.abs(state.blkAim) >= 0.2) succeed();
      if (now() - since > 12000 && !hint) hint = '可以再試一次，或放開滑鼠後按「略過這步」。';
      previous = { ...state, time: now() }; render();
    }
    function mount(document) {
      if (panel) return;
      const style = document.createElement('style');
      style.textContent = '.vb-tut-panel,.vb-tut-menu{position:fixed;z-index:150;background:#172431;color:#fff;border:1px solid #7b8e9c;border-radius:12px;padding:16px;box-shadow:0 8px 30px #0006;font:15px/1.5 sans-serif}.vb-tut-panel{top:160px;left:50%;transform:translateX(-50%);width:min(440px,max(300px,calc(100vw - 680px)));box-sizing:border-box}.vb-tut-menu{top:50%;left:50%;transform:translate(-50%,-50%);width:min(780px,calc(100vw - 48px));box-sizing:border-box;padding:24px 26px;box-shadow:0 0 0 100vmax #0007,0 12px 40px #000a}.vb-tut-menu h2{margin:0;font-size:24px}.vb-tut-lead{margin:4px 0 16px;color:#b7c6d3}.vb-tut-cards{display:grid;grid-template-columns:1fr 1fr;gap:16px}.vb-tut-card{background:#1f3142;border:1px solid #3b5368;border-radius:12px;padding:16px 18px;display:flex;flex-direction:column}.vb-tut-card h3{margin:0 0 6px;font-size:20px}.vb-tut-card p{margin:0 0 12px;color:#d6e0e8}.vb-tut-main{border-color:#f2b705;background:#2a3424}.vb-tut-menu .vb-tut-big{display:block;width:100%;margin:4px 0 12px;padding:12px;border:0;border-radius:10px;background:#30a46c;color:#fff;font-size:17px;font-weight:700}.vb-tut-main .vb-tut-big{background:#f2b705;color:#1b2638;margin-top:auto}.vb-tut-sub{font-size:13px;color:#9fb3c4!important;margin-bottom:6px!important}.vb-tut-chips{display:flex;flex-wrap:wrap;gap:6px}.vb-tut-menu .vb-tut-chips button{margin:0;padding:6px 10px;border-radius:999px;border:1px solid #5d7a92;background:#26394b;color:#fff}.vb-tut-menu .vb-tut-link{margin:14px 0 0;padding:0;border:0;background:none;color:#8fb3d0;text-decoration:underline;font-size:13px}.vb-tut-panel[data-phase=success]{background:#185a3d}.vb-tut-panel kbd{border:1px solid #93a7ba;border-radius:4px;padding:1px 5px}.vb-tut-panel button,.vb-tut-menu button{cursor:pointer;margin:3px;padding:5px 9px}.vb-tut-entry{position:fixed;right:20px;bottom:22px;z-index:149}.vb-tut-menu[hidden],.vb-tut-panel[hidden]{display:none}';
      document.head.append(style);
      menu = document.createElement('section'); menu.className = 'vb-tut-menu'; menu.setAttribute('aria-label', '新手教學選單');
      panel = document.createElement('section'); panel.className = 'vb-tut-panel'; panel.setAttribute('aria-label', '教學步驟');
      button = document.createElement('button'); button.type = 'button'; button.className = 'vb-tut-entry'; button.textContent = '📘 新手教學'; button.onclick = open;
      document.body.append(menu, panel);
      const toolbar = document.querySelector('.walk-top');
      if (toolbar) toolbar.insertBefore(button, toolbar.querySelector('#w-host') || toolbar.firstChild);   // 放在「房主設定」左邊
      else document.body.append(button);
      if (toolbar) button.style.cssText = 'position:static;pointer-events:auto';
      for (const element of [menu, panel, button]) {
        for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'contextmenu', 'wheel']) {
          element.addEventListener(type, event => event.stopPropagation());
        }
      }
      button.addEventListener('click', event => event.stopPropagation());
      const actions = { open, stop: quit, free: quit, full: startFull, next: nextSection, reset, skip: () => succeed(true) };
      const click = event => {
        event.stopPropagation();
        const b = event.target.closest('button');
        if (b?.dataset.start) startOne(b.dataset.start);
        else actions[b?.dataset.action]?.();
      };
      menu.addEventListener('click', click); panel.addEventListener('click', click);
      root.addEventListener?.('vb-settings-change', render); render();
    }
    return { open, start: startOne, startFull, stop: quit, reset, emit, frame, mount, skip: () => succeed(true), view,
      get active() { return phase === 'running' || phase === 'success'; },
      progress: () => copy(saved), sections: copy(sections) };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { create, sections };
  else root.VBTutorialFactory = { create, sections };
})(typeof window === 'undefined' ? globalThis : window);
