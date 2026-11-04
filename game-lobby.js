(() => {
  'use strict';
  let socket,timer,read,no=null,last='',lastBeat=0,closed=false,wasHost=false;
  function snapshot(){try{return read?.();}catch(_){return null;}}
  function sync(force=false){
    const s=snapshot();if(!s || closed)return;
    const status=s.practice?'練習中':s.active?(s.playing?'比賽中':'房間中'):'大廳中';
    const next=JSON.stringify([s.name,status,s.code,s.count,s.isHost]);
    const changed=next!==last;
    if(force || changed){
      socket.send({k:'hello',name:s.name,status,...(s.active&&!s.practice?{code:s.code}:{})});
      last=next;wasHost=s.isHost;
    }
    if(s.active && !s.practice && s.isHost && no && (force || changed || Date.now()-lastBeat>=10000)) {
      if(socket.send({k:'room-update',no,count:s.count,status:s.playing?'playing':'waiting',latency:s.latency}))lastBeat=Date.now();
    }
  }
  window.VBGameLobby={start(getState){
    read=getState;
    socket=VBLobby.connect({hello:()=>{const s=snapshot();return {name:s?.name||'球友',status:s?.practice?'練習中':'大廳中'};},onstate:state=>{if(state==='online'){last='';lastBeat=0;}},onmessage:m=>{
      if(m.k==='players' || m.k==='state') {
        const me=m.players.find(p=>p.id===VBLobby.id);no=me?.no||null;
      }
      // Lobby failures intentionally do not call any game API.
    }});
    timer=setInterval(()=>sync(),1000);
  },leave(){
    if(closed)return;closed=true;clearInterval(timer);
    const s=snapshot();if(no && (s?.isHost || wasHost))socket?.send({k:'room-close',no});
    socket?.close();
  }};
  addEventListener('pagehide',()=>window.VBGameLobby.leave());
})();
