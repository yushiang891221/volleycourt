/* Room flow presentation; authority and membership live in room-settings.js. */
(() => {
  'use strict';
  window.createRoomFlowUI=({getRoom,me,name,release,ready,start})=>{
    const $=id=>document.getElementById(id);
    const panel=document.createElement('dialog');panel.id='room-pick';panel.setAttribute('aria-labelledby','pick-title');
    panel.innerHTML='<header><h2 id="pick-title">選擇隊伍與位置</h2><strong id="pick-clock"></strong></header><p>彼此之間必須<strong class="pick-rule">維持正確的前後左右相對位置</strong>，不能隨意變更位置！</p><div class="pick-court"><div class="pick-half" data-team="0"><b>左隊</b></div><div class="pick-half" data-team="1"><b>右隊</b></div></div><p class="pick-foot">先選先鎖定，可以換到空位。倒數結束自動分配，空位由 AI 補上。</p>';
    document.body.append(panel);
    panel.addEventListener('cancel',e=>e.preventDefault());
    panel.addEventListener('click',e=>{const b=e.target.closest('[data-slot]');if(b)getRoom()?.pick(Number(b.dataset.slot));});
    $('room-ready').addEventListener('click',ready);$('room-start').addEventListener('click',start);
    $('room-size').addEventListener('input',e=>{getRoom()?.setCount(Number(e.target.value));render();});
    function render(){
      const s=getRoom()?.snapshot;if(!s)return;
      const {flow:f,count:n}=s, mine=f.ready.includes(me()), locked=f.phase!=='waiting';
      $('room-size').value=n;$('room-size').disabled=locked||!s.isHost;$('room-size-value').textContent=`${n} 對 ${n}`;
      $('room-size-note').textContent=locked?'比賽結束後才能改':'兩隊人數相同，空位補 AI';
      $('room-ready').hidden=locked;$('room-ready').textContent=mine?'取消準備':'準備';$('room-ready').setAttribute('aria-pressed',String(mine));
      $('room-start').hidden=!s.isHost||locked;$('room-start').disabled=!f.ready.length;
      $('room-flow-note').textContent=f.phase==='playing'?(f.picks.includes(me())?'比賽中 · 你已上場':'比賽中 · 你是觀眾'):f.phase==='pick'?'選位中…':'走到球場上按準備；房主開始後選位';
      $('room-ready-list').textContent=`${f.ready.length} 人準備／需要 ${2*n} 人`+(f.ready.length?'：'+f.ready.map(name).join('、'):'');
      if(f.phase!=='pick'||!mine){if(panel.open)panel.close();return;}
      if(!panel.open){release();panel.showModal();}
      $('pick-clock').textContent=`${Math.max(0,Math.ceil((f.deadline-Date.now())/1000))} 秒`;
      for(const half of panel.querySelectorAll('.pick-half')){
        const team=Number(half.dataset.team);
        if(half.dataset.count!==String(n)){
          half.querySelectorAll('button,.pick-zone').forEach(b=>b.remove());half.dataset.count=n;
          const zones=CourtFormations.get(n);
          if(zones)for(const z of zones){
            const line=document.createElement('div');line.className='pick-zone';
            line.style.left=(team===0?(9-z.d1):z.d0)/9*100+'%';
            line.style.top=(team===0?(4.5-z.l1):(z.l0+4.5))/9*100+'%';
            line.style.width=(z.d1-z.d0)/9*100+'%';line.style.height=(z.l1-z.l0)/9*100+'%';half.append(line);
          }
          for(let k=0;k<n;k++){
            const b=document.createElement('button');b.type='button';b.dataset.slot=team*n+k;
            const role=['S','OH','MB','OP','OH','MB'][k], label={S:'舉球',OH:'主攻',MB:'副攻',OP:'舉對'}[role];
            const [depth,left]=n===6?[[6.8,-3],[2.2,-3],[2.2,0],[2.2,3],[6.8,3],[7.4,0]][k]:n===2?[4.5,k===0?2.2:-2.2]:CourtFormations.home(n,k);
            b.style.left=`${team===0?(9-depth)/9*100:depth/9*100}%`;b.style.top=`${50+(team===0?-left:left)/9*100}%`;
            b.className='pick-slot'+(n===6&&role==='S'?' setter':'');
            b.innerHTML='<span class="pick-avatar"></span><span class="pick-role"></span><span class="pick-person"></span>';
            b.querySelector('.pick-role').textContent=n===6?`${k+1} 號位 · ${label} ${role}`:zones?`${k+1} 號位 · ${zones[k].name}`:`${k+1} 號位`;
            half.append(b);
          }
        }
        for(const b of half.querySelectorAll('button')){
          const who=f.picks[Number(b.dataset.slot)], self=who===me();b.disabled=!!who&&!self;b.classList.toggle('mine',self);
          b.querySelector('.pick-avatar').textContent=who?[...name(who)][0]:'♙＋';
          b.querySelector('.pick-person').textContent=who?name(who)+(self?'（你）':''):'點擊選位';
        }
      }
    }
    setInterval(()=>{if(panel.open)render();},200);
    return {render,get picking(){return panel.open;}};
  };
})();
