/* Additional room-settings message only; existing game/presence payloads stay unchanged. */
(() => {
  'use strict';
  window.createRoomSettings = ({id, creator=false, send, changed, speed=.7}) => {
    let order=[], settled=false, revision=0, timer, retry;
    const members=new Map([[id,{at:Date.now(),creator}]]), departed=new Set();
    const validSpeed = n => [.55,.7,1].includes(n);
    const host=()=>order[0] || '';
    const notify=()=>changed({host:host(),isHost:settled && host()===id,speed,order:[...order]});
    const state=()=>send({e:'state',order:[...order],speed,revision});
    const hello=()=>send({e:'hello',...members.get(id)});
    function elect(){
      order=order.filter(x=>members.has(x));
      if(!order.length) order=[...members].sort((a,b)=>Number(b[1].creator)-Number(a[1].creator)||a[1].at-b[1].at||a[0].localeCompare(b[0])).map(([x])=>x);
      settled=true;revision=0;notify();if(host()===id)state();
    }
    function receive(d,from){
      if(!d || from===id || departed.has(from) || typeof from!=='string')return;
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
        order=[...d.order];for(const x of order)if(!members.has(x))members.set(x,{at:Infinity,creator:false});
        speed=d.speed;revision=d.revision;settled=true;clearTimeout(timer);notify();
      }
    }
    function join(peer){departed.delete(peer);if(settled && host()===id){if(!members.has(peer))members.set(peer,{at:Date.now(),creator:false});if(!order.includes(peer)){order.push(peer);revision++;}state();notify();}}
    function leave(peer){departed.add(peer);members.delete(peer);const wasHost=host()===peer;order=order.filter(x=>x!==peer);if(wasHost)elect();else{if(host()===id){revision++;state();}notify();}}
    function start(){send({e:'hello',...members.get(id),request:true});timer=setTimeout(()=>{if(!settled)elect();},1200);retry=setInterval(()=>{if(settled && host()===id)state();else send({e:'hello',...members.get(id),request:true});},5000);}
    return {start,receive,join,leave,get host(){return host();},get isHost(){return settled && host()===id;},get speed(){return speed;},
      setSpeed(n){if(!settled||host()!==id||!validSpeed(n))return false;speed=n;revision++;notify();state();return true;},
      close(){clearTimeout(timer);clearInterval(retry);}};
  };
})();
