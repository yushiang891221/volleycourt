/* Independent lobby socket: never changes or waits on the gameplay transport. */
(() => {
  'use strict';
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  function identity() {
    let value;
    try { value=JSON.parse(sessionStorage.getItem('vb.lobby.identity')); } catch (_) {}
    if(!value || !value.id || !value.token) {
      value={id:crypto.randomUUID(),token:crypto.randomUUID()};
      try{sessionStorage.setItem('vb.lobby.identity',JSON.stringify(value));}catch(_){}
    }
    return value;
  }
  const user=identity();
  function override() { return local ? new URLSearchParams(location.search).get('lobby') : null; }
  async function endpoint() {
    let base=override();
    if(!base) {
      const response=await fetch('/api/rt-config',{signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('config');base=(await response.json()).cf;
    }
    const url=new URL(base);
    if(!['ws:','wss:'].includes(url.protocol))throw new Error('protocol');
    url.pathname=url.pathname.replace(/\/room(?:\/.*)?\/?$/, '').replace(/\/$/, '') + '/lobby';
    if(url.pathname.endsWith('/lobby/lobby'))url.pathname=url.pathname.slice(0,-6);
    url.search='';url.searchParams.set('id',user.id);url.searchParams.set('token',user.token);
    return url;
  }
  window.VBLobby={id:user.id,carry(query){const value=override();if(value)query.set('lobby',value);},home(){const q=new URLSearchParams();const value=override();if(value)q.set('lobby',value);return 'index.html'+(q.size?'?'+q:'');},connect({hello,onmessage=()=>{},onstate=()=>{}}) {
    let ws,retry,timeout,ping,attempt=0,stopped=false,lastPong=0;
    const send=m=>{if(ws?.readyState!==WebSocket.OPEN)return false;ws.send(JSON.stringify(m));return true;};
    const clear=()=>{clearTimeout(timeout);clearInterval(ping);};
    function again(){clear();if(stopped)return;onstate('offline');clearTimeout(retry);retry=setTimeout(start,Math.min(30000,1000*2**Math.min(attempt++,5))+Math.random()*300);}
    async function start(){
      if(stopped)return;onstate('connecting');
      try{
        const url=await endpoint();if(stopped)return;ws=new WebSocket(url);
        timeout=setTimeout(()=>ws.close(),10000);
        ws.onopen=()=>{clearTimeout(timeout);attempt=0;lastPong=Date.now();onstate('online');send({k:'hello',...hello()});ping=setInterval(()=>{if(Date.now()-lastPong>45000){ws.close();return;}if(ws.readyState===WebSocket.OPEN)ws.send('ping');},15000);};
        ws.onmessage=e=>{if(e.data==='pong'){lastPong=Date.now();return;}try{onmessage(JSON.parse(e.data));}catch(error){console.warn('大廳訊息處理失敗',error);}};
        ws.onerror=()=>ws.close();ws.onclose=e=>{if(e.code===4001){stopped=true;clear();onstate('offline');}else again();};
      }catch(_){again();}
    }
    start();
    return {send,close(){stopped=true;clearTimeout(retry);clear();ws?.close();}};
  }};
})();
