/* Additional room-settings message only; existing game/presence payloads stay unchanged. */
(() => {
  'use strict';
  window.createRoomSettings = ({id, creator=false, send, changed, speed=.7, count=2, courtOf=()=>null}) => {
    let order=[], settled=false, revision=0, timer, retry, beat=0, tactics='roles';
    count = Number.isInteger(count) && count>=1 && count<=6 ? count : 2;
    let flow={phase:'waiting',ready:[],picks:[],court:null,deadline:0,round:0};
    const copy=v=>JSON.parse(JSON.stringify(v));
    const members=new Map([[id,{at:Date.now(),creator}]]), departed=new Set();
    const validSpeed = n => [.55,.7,1].includes(n);
    const host=()=>order[0] || '';
    const snapshot=()=>({host:host(),isHost:settled && host()===id,speed,count,tactics,order:[...order],flow:copy(flow)});
    const notify=()=>changed(snapshot());
    const state=()=>send({e:'state',order:[...order],speed,count,tactics,flow:copy(flow),revision});
    const commit=()=>{revision++;state();notify();};
    const waiting=()=>{flow={phase:'waiting',ready:[],picks:[],court:null,deadline:0,round:flow.round};};
    function finishPick(){
      if(flow.phase!=='pick')return;
      if(!flow.ready.length){waiting();commit();return;}
      for(const who of flow.ready)if(!flow.picks.includes(who)){
        const totals=[0,1].map(t=>flow.picks.slice(t*count,(t+1)*count).filter(Boolean).length);
        const team=totals[0]<=totals[1]?0:1;
        const slot=flow.picks.findIndex((x,k)=>!x && Math.floor(k/count)===team);
        if(slot>=0)flow.picks[slot]=who;
      }
      flow.phase='playing';flow.deadline=0;commit();
    }
    function request(d,from){
      if(!settled||host()!==id||!order.includes(from))return false;
      if(d.e==='ready' && flow.phase==='waiting'){
        if(flow.ready.includes(from))flow.ready=flow.ready.filter(x=>x!==from);
        else {const c=courtOf(from);if(!c || flow.ready.length>=count*2 || (flow.ready.length && c!==flow.court))return false;flow.court=c;flow.ready.push(from);}
        if(!flow.ready.length)flow.court=null;
      } else if(d.e==='pick' && flow.phase==='pick' && flow.ready.includes(from)){
        if(Date.now()>=flow.deadline){finishPick();return false;}
        const k=d.slot;if(!Number.isInteger(k)||k<0||k>=count*2||(flow.picks[k] && flow.picks[k]!==from))return false;
        flow.picks=flow.picks.map(x=>x===from?null:x);flow.picks[k]=from;
        if(flow.ready.every(x=>flow.picks.includes(x))){finishPick();return true;}
      } else return false;
      commit();return true;
    }
    function command(d){if(host()===id)return request(d,id);send(d);return true;}
    const hello=()=>send({e:'hello',...members.get(id)});
    function elect(){
      order=order.filter(x=>members.has(x));
      if(!order.length) order=[...members].sort((a,b)=>Number(b[1].creator)-Number(a[1].creator)||a[1].at-b[1].at||a[0].localeCompare(b[0])).map(([x])=>x);
      settled=true;revision=0;if(host()===id)state();notify();
    }
    function receive(d,from){
      if(!d || from===id || departed.has(from) || typeof from!=='string')return;
      if(d.e==='ready'||d.e==='pick'){request(d,from);return;}
      if(d.e==='hello'){
        if(!Number.isFinite(d.at))return;
        members.set(from,{at:d.at,creator:d.creator===true});
        if(settled && host()===id){if(!order.includes(from)){order.push(from);revision++;}state();notify();}
        // Reply to requests with our identity during discovery, without a hello loop.
        if(d.request) hello();
      } else if(d.e==='state'){
        if(!Array.isArray(d.order)||d.order.length>20||d.order[0]!==from||!d.order.includes(id)||new Set(d.order).size!==d.order.length||!d.order.every(x=>typeof x==='string' && !departed.has(x))||!validSpeed(d.speed)||!Number.isInteger(d.revision))return;
        // Once discovered, only the current host can author rules or membership order.
        if(settled && host()!==from)return;
        if(settled && d.revision<revision)return;
        if(d.count!==undefined && (!Number.isInteger(d.count)||d.count<1||d.count>6))return;
        if(d.tactics!==undefined && !['roles','rotation'].includes(d.tactics))return;
        if(d.flow){
          const f=d.flow,n=d.count||count;
          if(!['waiting','pick','playing'].includes(f.phase)||!Array.isArray(f.ready)||f.ready.length>n*2||new Set(f.ready).size!==f.ready.length||!f.ready.every(x=>d.order.includes(x))||!Array.isArray(f.picks)||!Number.isFinite(f.deadline)||!Number.isInteger(f.round))return;
          if(f.phase!=='waiting' && (f.picks.length!==n*2||typeof f.court!=='string'||!f.picks.every(x=>x===null||f.ready.includes(x))||new Set(f.picks.filter(Boolean)).size!==f.picks.filter(Boolean).length))return;
          flow=copy(f);
        }
        order=[...d.order];for(const x of order)if(!members.has(x))members.set(x,{at:Infinity,creator:false});
        speed=d.speed;count=d.count||count;tactics=d.tactics||'roles';revision=d.revision;settled=true;clearTimeout(timer);notify();
      }
    }
    function join(peer){departed.delete(peer);if(settled && host()===id){if(!members.has(peer))members.set(peer,{at:Date.now(),creator:false});if(!order.includes(peer)){order.push(peer);revision++;}state();notify();}}
    function leave(peer){
      departed.add(peer);members.delete(peer);const wasHost=host()===peer;order=order.filter(x=>x!==peer);
      flow.ready=flow.ready.filter(x=>x!==peer);flow.picks=flow.picks.map(x=>x===peer?null:x);
      if(flow.phase==='pick' && !flow.ready.length || flow.phase==='playing' && wasHost)waiting();
      if(wasHost)elect();else{if(host()===id){revision++;state();}notify();}
      if(host()===id && flow.phase==='pick' && flow.ready.every(x=>flow.picks.includes(x)))finishPick();
    }
    function start(){send({e:'hello',...members.get(id),request:true});timer=setTimeout(()=>{if(!settled)elect();},1200);retry=setInterval(()=>{if(settled && host()===id && flow.phase==='pick' && Date.now()>=flow.deadline)finishPick();if(Date.now()-beat>=5000){beat=Date.now();if(settled && host()===id)state();else if(!settled)send({e:'hello',...members.get(id),request:true});}},250);}
    return {start,receive,join,leave,get host(){return host();},get isHost(){return settled && host()===id;},get speed(){return speed;},
      get snapshot(){return snapshot();},get count(){return count;},
      setCount(n){if(!settled||host()!==id||flow.phase!=='waiting'||!Number.isInteger(n)||n<1||n>6)return false;count=n;flow.ready=flow.ready.slice(0,2*n);commit();return true;},
      setTactics(mode){if(!settled||host()!==id||flow.phase!=='waiting'||count!==6||!['roles','rotation'].includes(mode))return false;tactics=mode;commit();return true;},
      toggleReady(){return command({e:'ready'});},pick(slot){return command({e:'pick',slot});},
      begin(){
        if(!settled||host()!==id||flow.phase!=='waiting')return false;
        flow.ready=flow.ready.filter(x=>courtOf(x)===flow.court);
        if(!flow.ready.length){flow.court=null;commit();return false;}
        flow.phase='pick';flow.picks=Array(count*2).fill(null);flow.deadline=Date.now()+15000;flow.round++;commit();return true;
      },
      end(){if(host()!==id)return false;waiting();commit();return true;},
      setSpeed(n){if(!settled||host()!==id||!validSpeed(n))return false;speed=n;commit();return true;},
      close(){clearTimeout(timer);clearInterval(retry);}};
  };
})();
