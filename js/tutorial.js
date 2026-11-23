/* 教學只消費事件與快照。Three.js 場景操作由 coach 注入。 */
(function (root) {
  'use strict';
  const sections = [
    { id: 'move', name: '移動與視角', count: 7, enabled: true },
    { id: 'recv', name: '接球', count: 4, enabled: true },
    { id: 'set', name: '舉球', count: 5, enabled: true },
    { id: 'atk', name: '攻擊', count: 4, enabled: true },
    { id: 'serve', name: '發球', count: 3, enabled: true },
    { id: 'block', name: '攔網', count: 4, enabled: true }
  ];
  const empty = () => ({ v: 3, done: {}, at: {}, updated: 0 });
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
      if (raw && raw.v === 3 && raw.done && raw.at && !Array.isArray(raw.done) && !Array.isArray(raw.at)) {
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
    let menu, panel, button, dots, lastMarkup = '';
    let reps=0, fraction=0, holdTime=0, turnMin=0, turnMax=0, looked=false, sprintSeen=false, repeatAt=0, landedSinceRep=true;
    const routes=[[[1,'high','4 號位高球']],[[2,'high3','3 號位高球'],[2,'wheelQuick','中間快攻'],[3,'high','2 號位高球']],[[7,'line3','後排 5 號位'],[4,'line3','後排 6 號位'],[5,'line3','後排 1 號位']],[[1,'flat','4 號位快球'],[3,'flat','2 號位快球']]];
    const route=()=>routes[step]?.[Math.min(routes[step].length-1,Math.floor(reps/3))];
    const required=()=>section?.id==='move' ? ([1,3].includes(step)?3:1) : section?.id==='set' && step<4 ? routes[step].length*3 : section?.id==='block' && step===3 ? 5 : 3;
    const drills = { atk: '攻擊', set: '舉球', block: '攔網', defense: '防守' };
    const drillHints = { atk: '後中 AI 先拋球給舉球手，再舉出指定球種。看一傳到位的時機助跑、起跳扣球。', set: '移動到球下方再舉球。約七成會到舉球區，其餘需要跑動修正。', block: '看對面舉球員把球送給誰，沿網移動，在攻擊手出手時起跳攔網。', defense: '看誰拋球，再看他的身體朝向，移動到直線或斜線上蹲低接球。' };
    const sets = { '1-high': '1｜左前高球', '1-flat': '1｜左前平球', '2-quick': '2｜中間快攻', '2-high3': '2｜3 號位高球', '3-high': '3｜右前高球', '3-flat': '3｜右前平球', '4-high': '4｜後排中間', '5-high': '5｜後排右側', '6-high': '6｜後排左側' };
    let drill = 'atk', setType = '1-high', interval = 5;
    let full = false, nextTimer = 0;   // full＝「新手教學」從頭走完六段（一段做完自動接下一段）
    const persist = () => {
      saved.updated = now();
      if (sections.every(s => saved.done[s.id])) {
        try { storage?.setItem('vb.tutorial.graduated','1'); } catch {}
      }
      try { storage?.setItem('vb.tutorial', JSON.stringify(saved)); } catch (_) { /* 本次工作階段仍可繼續。 */ }
    };
    const key = action => {
      const config = settings();
      return '<kbd>' + escape(config?.keyName(config.values.keys[action]) || '未設定') + '</kbd>';
    };
    // 說明文字的重點（秒數、次數、顏色目標、角度…）用黃色粗體；只改標籤外的文字
    const HL = /(\d+(?:\.\d+)?\s*(?:秒|顆|次|球|公尺|米|°|%|號位?)|[一二三五六]\s*(?:顆|次|個位置|處)|[黃藍紅綠金]色(?:圈|區域|區|線)?|[黃藍紅綠金](?:圈|區域|區|線)|發球線|六米|三米線|甜蜜點|完整轉一圈|落地進區)/g;
    function highlight(html) { return String(html).split(/(<[^>]+>)/).map((t, i) => i % 2 ? t : t.replace(HL, '<b class="vb-hl">$1</b>')).join(''); }
    function instruction() {
      if (!section) return '';
      const movement = ['w', 'a', 's', 'd'].map(key).join(' ');
      const texts = {
        move: [
          '點一下遊戲畫面，鎖定滑鼠。',
          '用 '+movement+' 依序走到發球線、六米、三米線的黃圈，各停留 1 秒；走出圈外會重新計時。',
          '移動滑鼠，完整轉一圈 360°。地上圓圈會隨探索過的角度填綠，來回小幅擺頭不會累加。',
          '先轉頭看向黃色圈，再走進圈內停留 1 秒。隨機換三個位置練習。',
          '按住 '+key('shift')+' 加 '+movement+' 衝刺，將體力從 100% 跑到 0%。沒體力會變慢，放開衝刺讓體力恢復。',
          '走進黃圈，按住 '+key('crouch')+' 蹲滿 1 秒，感受視野從 85° 平滑擴大到 100°。離開圈或放開按鍵都重新計時，這項做一次。',
          '按 '+key('p')+' 切換視角，看看自己。'
        ],
        recv: [
          '看球路提示線，走進落點圈，練習判斷三個落點；這一步不用接球。',
          '先練習三顆不同位置的嗆司球。按住 '+key('v')+' 擺出手臂（滑鼠左右可轉），放開收手；高球改按 '+key('oh')+' 上手接球，提前 0.25 秒內舉手或到額頭前上方時按下。',
          '教練站在台階上重扣。看提示線移動，按住 '+key('crouch')+' 緩衝，再按 '+key('v')+' 接住，成功三顆。',
          '看教練扣球方向，按住 '+key('shift')+' 再按 '+key('v')+' 撲向球；實際撲到並接住三顆才完成。'
        ],
        set: [
          '按住 '+key('q')+' 開輪盤，滑鼠移向左上「4 號位高球」，球到額頭前上方時放開。',
          '分別選右中「快攻」及左下「2 號位高球」，各完成一次舉球。',
          '按住舉球鍵，滾輪切換後排，選左側任一球路、放開，舉到三米線。',
          '切回前排，選右上「4 號位快球」或右下「2 號位快球」，完成一次快球。'
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
          `走進網前黃色圈（離網 1 公尺內）。看地面舉球員把球舉給箱上的攻擊手，球到扣球高度時按 ${key('b')} 起跳攔網。`,
          `按 ${key('b')} 起跳後，在空中左右移動滑鼠移手，練習封直線或斜線。`,
          `地面舉球員傳給箱上的攻擊手，扣球時按 ${key('b')}，讓球碰到攔網手；任何碰手都算。`,
          `你是攔中：看舉球往哪邊，跑到 2 號或 4 號位隊友旁 1.5 公尺內，扣球時按 ${key('b')}，隊友會跟你一起跳，完成五顆併攔。`
        ]
      };
      if(section.id==='set')return step===4 ? '<strong class="vb-tut-route">本球：舉球員第二球側吊 · '+(reps+1)+' / 3</strong>教練先傳第一球，跳起來按右鍵，將第二球往側邊吊過網。' : '<strong class="vb-tut-route">本球：'+route()[2]+' · '+(reps%3+1)+' / 3</strong>按住 '+key('q')+' 選指定球路，球到額頭前上方時放開；同一球路連續練三顆。';
      return (texts[section.id]?.[step] || '') + (section.id==='recv' && [1,2].includes(step)?' 面向藍色舉球區，把球傳進區域；等球落地再換球。': ['atk','serve'].includes(section.id) && !(section.id==='atk' && step===0)?' 瞄準對面藍色指定區域，落地進區才完成。':'');
    }
    function view() {
      return { phase, section: section?.id || null, name: section?.name || '', step, count: section?.count || 0,
        instruction: instruction(), hint, reps, required:required(), fraction, target: target && { ...target }, failures, full,
        completed: [...seen], allDone: sections.every(s => saved.done[s.id]) };
    }
    function render() {
      options.changed?.(view());
      if(panel)panel.ownerDocument.body.classList.toggle('vb-tut-stamina',section?.id==='move' && step===4 && phase==='running');
      if(dots){dots.hidden=!['running','success'].includes(phase);dots.innerHTML=Array.from({length:required()},(_,i)=>'<i class="'+(i<reps?'done':'')+'"></i>').join('')+'<span>'+reps+' / '+required()+(fraction>0 && phase==='running'?' · '+Math.round(fraction*100)+'%':'')+'</span>';}
      if (!panel) return;
      menu.hidden = !['menu','lessons','setup'].includes(phase);
      panel.hidden = !['running', 'success', 'complete', 'drill'].includes(phase);
      if (phase === 'setup') {
        const choices = (items, selected) => Object.entries(items).map(([id, label]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${label}</option>`).join('');
        menu.innerHTML = `<h2>專項練習</h2><label>練習項目 <select name="drill">${choices(drills, drill)}</select></label><p>${drillHints[drill]}</p>`
          + (drill === 'atk' ? `<label>電腦舉球 <select name="setType">${choices(sets, setType)}</select></label>` : '')
          + `<label>每球間隔（至少 3 秒） <input type="number" name="interval" min="3" step="1" value="${interval}" required> 秒</label><button class="vb-tut-big" data-action="beginDrill">開始練習</button><button data-action="open">返回</button>`;
        return;
      }
      if (phase === 'drill') {
        panel.dataset.phase = phase;
        panel.innerHTML = `<strong>${drills[drill]}專項${drill === 'atk' ? ' · ' + sets[setType] : ''}</strong><p>${drillHints[drill]} 每球間隔 ${interval} 秒。</p><button data-action="setup">調整練習</button> <button data-action="open">結束專項</button>`;
        return;
      }
      if (phase === 'lessons') {
        const doneCount = sections.filter(s => saved.done[s.id]).length, first = sections.find(s => !saved.done[s.id]);
        const fullLabel = !doneCount ? '開始完整新手教學' : first ? `繼續完整新手教學（從「${first.name}」開始）` : '再走一次完整新手教學';
        menu.innerHTML = '<h2>📘 新手教學</h2>'
          + `<p class="vb-tut-sub">${doneCount === sections.length ? '恭喜！六段全部完成。' : `已完成 ${doneCount}／${sections.length} 段`}</p>`
          + `<button class="vb-tut-big" data-action="full">${fullLabel}</button>`
          + '<p class="vb-tut-sub">也可以只練其中一段新手教學：</p><div class="vb-tut-chips">'
          + sections.map(s => `<button data-start="${s.id}" ${s.enabled ? '' : 'disabled'}>${saved.done[s.id] ? '✓ ' : ''}${s.name}</button>`).join('')
          + '</div><button data-action="open">返回練習模式</button>'
          + (doneCount || Object.keys(saved.at).length ? '<button class="vb-tut-link" data-action="reset">重設教學進度</button>' : '');
        return;
      }
      if (phase === 'menu') {
        menu.innerHTML = '<h2>練習模式</h2><p class="vb-tut-lead">要怎麼練？</p><div class="vb-tut-cards">'
          + '<section class="vb-tut-card vb-tut-main"><h3>📘 新手教學</h3><p>從移動、接球、舉球、攻擊、發球到攔網，六段一步一步帶你做一遍，每一步都會提示要按哪個鍵。</p>'
          + '<button class="vb-tut-big" data-action="lessons">選擇教學</button></section>'
          + '<section class="vb-tut-card"><h3>🏐 自由練習</h3><p>自己拿球發球、叫陪練舉球或對碰。靠近球車可拖著走，再放到場邊取球。</p>'
          + '<button class="vb-tut-big" data-action="free">開始自由練習</button></section>'
          + '<section class="vb-tut-card"><h3>🎯 專項練習</h3><p>選擇攻擊、舉球、攔網或防守，讓電腦重複餵球，專心練一個動作。</p><button class="vb-tut-big" data-action="setup">選擇專項</button></section></div>';
      }
      const next = sections[sections.indexOf(section) + 1];
      const body = phase === 'complete'
        ? full && next?.enabled
          ? `<p>這段完成！馬上進入下一段：${next.name}</p><button data-action="next">現在就開始</button> <button data-action="stop">離開教學</button>`
          : `<p>這段完成！${view().allDone ? '恭喜！六段教學全部完成。' : ''}</p>${!full && next?.enabled ? `<button data-start="${next.id}">下一段</button>` : ''} <button data-action="open">回選單</button> <button data-action="stop">自由練習</button>`
        : `<p>${highlight(instruction())}</p><p role="status">${phase === 'success' ? skipped ? '已略過這步' : '做到了！' + (section?.id === 'block' ? hint : '') : hint}</p><button data-action="skip">略過這步</button> <button data-action="stop">離開教學</button>`;
      const head = full && section ? `新手教學 第 ${sections.indexOf(section) + 1}／${sections.length} 段・` : '';
      const markup = `<strong>${head}${section?.name || ''} ${step + 1}／${section?.count || 0}</strong>${body}`;
      panel.dataset.phase = phase;
      if (markup !== lastMarkup) { panel.innerHTML = markup; lastMarkup = markup; }
    }
    function enter() {
      phase = 'running'; since = now(); previous = null; turn = 0; crouchTime = 0;
      seen = new Set(); failures = 0; dived = false; hint = ''; skipped = false;
      reps=0;fraction=0;holdTime=0;turnMin=0;turnMax=0;looked=false;sprintSeen=false;repeatAt=0;landedSinceRep=true;
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
    function reset() { stop(); persist(); saved = empty(); persist(); open(); }
    function missHint() {   // 每段自己的失敗提示（按鍵照玩家設定）
      const id = section?.id;
      if (id === 'recv') return step === 3 ? `球快掉到地上時才按住 ${key('shift')} 再按 ${key('v')} 撲過去，太早撲會撲空。` : '等球靠近身體、亮起來再按，先看落點站好。';
      if (id === 'set') return '按住 '+key('q')+' 選球路，球接近額頭前上方時放開舉球鍵；球不會停下等你。';
      if (id === 'atk') return '等球掉到頭頂前上方再起跳，起跳後再按左鍵。';
      if (id === 'block') return `看教練：他一起跳你就按 ${key('b')}，跟他同時跳，手才來得及舉到網上。`;
      if (id === 'serve') return '拿著球再按，發完等下一顆球回到手上。';
      return '再試一次。';
    }
    function succeed(skip = false) {
      if (phase !== 'running') return;
      if(!skip && coach.deferSuccess?.(()=>succeed()))return;
      if (!(section?.id === 'block' && /攔網成功|碰到球/.test(hint))) hint = '';   // 做到了：清掉舊的失敗提示（攔網保留成功的那句）
      if(!skip){
        if(repeatAt)return;
        reps++;fraction=1;landedSinceRep=false;coach.progress?.(1);coach.roundComplete?.();
        if(reps<required()){repeatAt=now()+850;hint='完成第 '+reps+' 次，準備下一次。';render();return;}
      }
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
      if (phase !== 'running' || repeatAt) return;
      if (name === 'recvMiss' || name === 'whiff' || name === 'feedMiss') {
        if (name !== 'whiff') failures++;
        hint = data.reason || missHint();

      }
      if (section.id === 'recv') {
        if (name === 'dive') dived = true;
        if (name === 'recv' && (step === 1 || step === 2 && data.crouch || step === 3 && dived && data.dive)) succeed();
      }
      if (section.id === 'set' && name === 'set') {
        const wanted=route();
        if(wanted && data.n===wanted[0] && data.v===wanted[1])succeed();
        else hint='這顆要練「'+(wanted?.[2]||'第二球側吊')+'」，請照提示再試一次。';
      }
      if(section.id==='set' && step===4 && name==='atk' && data.dump && data.air)succeed();
      if (section.id === 'atk') {
        if (name === 'whiff') hint = '等球發亮、掉到身前上方再放開左鍵，太早揮會打不到。';
        if (step === 0 && name === 'jump' && data.block === false && data.speed >= 2) succeed();
        if (name === 'atk' && (step === 1 && data.air && Number.isFinite(data.chg) || step === 2 && data.zone === 'sweet' || step === 3 && data.tip)) succeed();
      }
      if (section.id === 'serve' && name === 'serve' && data.type === ['std', 'float', 'jump'][step]) succeed();
      if (section.id === 'block') {
        if(step===1 && name==='jump' && data.block)landedSinceRep=true;
        if (name === 'block' && (step<=2 && (step!==1 || Math.abs(data.aim)>=.2) || step === 3 && data.mate === true)) {
          hint = data.kind === 'stuff' ? '攔網成功！' : '碰到球了！'; succeed();
        }
      }
      render();
    }
    function frame(state) {
      if (phase === 'drill') { coach.frame(); return; }
      snapshot = state;
      if (phase === 'success') { if (now() - successAt >= (skipped ? 800 : 1800)) advance(); return; }   // 做到了：停 1.8 秒讓球飛完、看清楚結果再換下一步（按跳過不用等）
      if (phase !== 'running') return;
      if(!state.air)landedSinceRep=true;
      if(state.focused===false){holdTime=0;fraction=0;previous=null;coach.progress?.(0);render();return;}
      if(repeatAt){
        if(now()<repeatAt){previous={...state,time:now()};return;}
        repeatAt=0;fraction=0;holdTime=0;turn=0;turnMin=0;turnMax=0;looked=false;sprintSeen=false;seen.clear();dived=false;hint='';
        target=coach.repeat?.(section.id,step,reps) || target;coach.progress?.(0);previous=null;
      }
      coach.frame?.(state);
      const dt = previous ? Math.max(0, Math.min(0.1, (now() - previous.time) / 1000)) : 0;
      if (section.id === 'move') {
        const inCircle=target && Math.hypot(state.x-target.x,state.z-target.z)<=.8;
        if(step===0 && state.locked)succeed();
        if(step===2){
          if(previous)turn+=Math.atan2(Math.sin(state.yaw-previous.yaw),Math.cos(state.yaw-previous.yaw));
          turnMin=Math.min(turnMin,turn);turnMax=Math.max(turnMax,turn);fraction=Math.min(1,(turnMax-turnMin)/(Math.PI*2));
          if(fraction>=1-1e-6)succeed();
        }
        if([1,3,5].includes(step)){
          if(step===3 && target && !inCircle){const bearing=Math.atan2(-(target.x-state.x),-(target.z-state.z));if(Math.abs(Math.atan2(Math.sin(bearing-state.yaw),Math.cos(bearing-state.yaw)))<.3)looked=true;}
          const valid=inCircle && (step!==5 || state.crouch) && (step!==3 || looked);
          holdTime=valid?holdTime+dt:0;fraction=Math.min(1,holdTime/1);
          hint=valid?'持續 '+holdTime.toFixed(1)+' / 1.0 秒':step===5?'走入圈內並按住蹲下，放開就重新計時。':step===3&&!looked?'先轉頭看向目標圈。':'走進圈內停留，離開會重新計時。';
          if(holdTime>=1-1e-6)succeed();
        }
        if(step===4){sprintSeen=sprintSeen||state.sprint;fraction=Math.max(0,Math.min(1,1-(state.stamina??1)));hint='體力 '+Math.round((state.stamina??1)*100)+'% · 持續衝刺直到耗盡';if(sprintSeen && state.stamina<=0)succeed();}
        if(step===6 && previous && state.tp!==previous.tp)succeed();
        coach.progress?.(fraction);
      }
      if (section.id === 'recv' && step === 0 && state.incoming && Math.hypot(state.x - state.incoming.x, state.z - state.incoming.z) <= 0.8) succeed();
      if (now() - since > 12000 && !hint) hint = '可以再試一次，或放開滑鼠後按「略過這步」。';
      previous = { ...state, time: now() }; render();
    }
    function mount(document) {
      if (panel) return;
      const style = document.createElement('style');
      style.textContent = '.vb-tut-panel,.vb-tut-menu{position:fixed;z-index:150;background:#172431;color:#fff;border:1px solid #7b8e9c;border-radius:12px;padding:16px;box-shadow:0 8px 30px #0006;font:15px/1.5 sans-serif}.vb-tut-menu{top:50%;left:50%;transform:translate(-50%,-50%);width:min(780px,calc(100vw - 48px));box-sizing:border-box;padding:24px 26px;box-shadow:0 0 0 100vmax #0007,0 12px 40px #000a}.vb-tut-menu h2{margin:0;font-size:24px}.vb-tut-lead{margin:4px 0 16px;color:#b7c6d3}.vb-tut-cards{display:grid;grid-template-columns:1fr 1fr;gap:16px}.vb-tut-card{background:#1f3142;border:1px solid #3b5368;border-radius:12px;padding:16px 18px;display:flex;flex-direction:column}.vb-tut-card h3{margin:0 0 6px;font-size:20px}.vb-tut-card p{margin:0 0 12px;color:#d6e0e8}.vb-tut-main{border-color:#f2b705;background:#2a3424}.vb-tut-menu .vb-tut-big{display:block;width:100%;margin:4px 0 12px;padding:12px;border:0;border-radius:10px;background:#30a46c;color:#fff;font-size:17px;font-weight:700}.vb-tut-main .vb-tut-big{background:#f2b705;color:#1b2638;margin-top:auto}.vb-tut-sub{font-size:13px;color:#9fb3c4!important;margin-bottom:6px!important}.vb-tut-chips{display:flex;flex-wrap:wrap;gap:6px}.vb-tut-menu .vb-tut-chips button{margin:0;padding:6px 10px;border-radius:999px;border:1px solid #5d7a92;background:#26394b;color:#fff}.vb-tut-menu .vb-tut-link{margin:14px 0 0;padding:0;border:0;background:none;color:#8fb3d0;text-decoration:underline;font-size:13px}.vb-tut-panel[data-phase=success]{background:#172431}.vb-tut-panel kbd{border:1px solid #93a7ba;border-radius:4px;padding:1px 5px}.vb-tut-panel button,.vb-tut-menu button{cursor:pointer;margin:3px;padding:5px 9px}.vb-tut-entry{position:fixed;right:20px;bottom:22px;z-index:149}.vb-tut-menu[hidden],.vb-tut-panel[hidden]{display:none}';
      style.textContent += '.vb-tut-menu{width:min(1000px,calc(100vw - 32px));max-height:92dvh;overflow:auto}.vb-tut-menu:has(select){width:min(460px,calc(100vw - 32px))}.vb-tut-menu label{display:block;margin:16px 0}.vb-tut-menu select,.vb-tut-menu input{font:inherit;padding:5px}.vb-tut-menu input{width:70px}.vb-tut-cards{grid-template-columns:repeat(3,minmax(0,1fr))}@media(max-width:720px){.vb-tut-cards{grid-template-columns:1fr}}';
      style.textContent += '.vb-tut-card .vb-tut-big{margin:auto 0 0}.vb-tut-menu:has(.vb-tut-chips){width:min(480px,calc(100vw - 32px))}.vb-tut-chips{margin:8px 0 16px}';
      style.textContent += `
        .vb-tut-panel {
          /* 放在畫面左側中段：人物和球會在畫面中間，左側中段大多是牆和地板，不擋接球；左下角留給按鍵面板 */
          top: 30vh;
          left: max(16px, env(safe-area-inset-left));
          box-sizing: border-box;
          width: min(440px, calc(100vw - 32px));
          max-height: calc(70vh - 290px);
          min-height: 0;
          overflow: auto;
          padding: 14px 18px;
          border-radius: 10px;
          background: #172431e8;
          font-size: 19px;
          line-height: 1.55;
        }
        .vb-tut-panel > strong { font-size: 17px; color: #b7c6d3; }
        .vb-tut-panel p { margin: 6px 0 8px; }
        .vb-tut-panel button { margin: 0; padding: 5px 10px; font-size: 15px; }
        .vb-tut-panel .vb-hl, .vb-tut-panel kbd { color: #ffd44b; font-weight: 800; }
        @media (max-height: 760px) { .vb-tut-panel { top: 12vh; max-height: calc(88vh - 290px); } }
      `;
      style.textContent+='.vb-tut-progress{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:151;display:flex;align-items:center;gap:10px;padding:8px 14px;background:#14212cdd;border-radius:24px;color:#fff;font:13px sans-serif;pointer-events:none}.vb-tut-progress[hidden]{display:none}.vb-tut-progress i{width:15px;height:15px;border:2px solid #f5cd4f;border-radius:50%;background:#263646}.vb-tut-progress i.done{background:#45d58a;border-color:#78f5b4}';
      style.textContent+='.vb-tut-route{display:block;font-size:21px;color:#ffdc68;padding:8px 0}.vb-tut-stamina .sta{width:min(560px,70vw);height:32px;bottom:100px}.vb-tut-stamina .sta b{font-size:19px}';
      document.head.append(style);
      menu = document.createElement('section'); menu.className = 'vb-tut-menu'; menu.setAttribute('aria-label', '新手教學選單');
      panel = document.createElement('section'); panel.className = 'vb-tut-panel'; panel.setAttribute('aria-label', '教學步驟');
      button = document.createElement('button'); button.type = 'button'; button.className = 'vb-tut-entry'; button.textContent = '🏐 練習模式'; button.onclick = open;
      dots=document.createElement('div');dots.className='vb-tut-progress';dots.setAttribute('aria-label','本項練習完成次數');
      document.body.append(menu, panel, dots);
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
      menu.setAttribute('aria-label','練習模式');
      menu.addEventListener('change', ({target}) => {
        if (target.name === 'drill') { drill = target.value; render(); }
        if (target.name === 'setType') setType = target.value;
        if (target.name === 'interval' && target.validity.valid) interval = target.valueAsNumber;
      });
      const setup = () => { stop(); coach.release?.(); phase = 'setup'; render(); };
      const beginDrill = () => {
        const input = menu.querySelector('[name=interval]');
        if (!input.reportValidity()) return;
        interval = input.valueAsNumber;
        if (!coach.startDrill(drill, setType, interval)) return;
        phase = 'drill'; render();
      };
      const lessons = () => { phase = 'lessons'; render(); };
      const actions = { open, lessons, setup, beginDrill, stop: quit, free: quit, full: startFull, next: nextSection, reset, skip: () => succeed(true) };
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
      get active() { return phase === 'running' || phase === 'success' || phase === 'drill'; },
      progress: () => copy(saved), sections: copy(sections) };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { create, sections };
  else root.VBTutorialFactory = { create, sections };
})(typeof window === 'undefined' ? globalThis : window);
