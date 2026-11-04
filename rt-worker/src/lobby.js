import { DurableObject } from 'cloudflare:workers';

const TTL = 30000;
const STATES = ['大廳中', '房間中', '比賽中', '練習中'];
const clean = s => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim() : '';
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
const hash = async (salt, password) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + password))), x => x.toString(16).padStart(2, '0')).join('');

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.queue = Promise.resolve();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.data = await ctx.storage.get('lobby') || { next: 101, rooms: [], chats: [] };
    });
  }
  serial(fn) { const work = this.queue.then(fn); this.queue = work.catch(() => {}); return work; }
  meta(ws) { return ws.deserializeAttachment() || {}; }
  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1 && !this.meta(ws).closed); }
  send(ws, data) { try { ws.send(JSON.stringify(data)); } catch (_) {} }
  cast(data) { for (const ws of this.sockets()) this.send(ws, data); }
  players() { return this.sockets().map(ws => this.meta(ws)).filter(p => p.name).map(({id,name,status,no}) => ({id,name,status,no})); }
  ownerOnline(r) { return this.sockets().some(ws => { const p = this.meta(ws); return p.id === r.host && p.token === r.hostToken && p.no === r.no; }); }
  publicRooms() {
    return this.data.rooms.filter(r => !r.hidden && Date.now() - r.lastBeat < TTL).map(r => ({
      no:r.no, name:r.name, mode:r.mode, locked:!!r.passwordHash, count:r.count, max:20,
      status:r.status, hostName:r.hostName, latency:r.latency, lastBeat:r.lastBeat,
    }));
  }
  publish() { this.cast({k:'players',players:this.players()}); this.cast({k:'rooms',rooms:this.publicRooms()}); }
  async save() {
    await this.ctx.storage.put('lobby', this.data);
    if (this.data.rooms.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...this.data.rooms.map(r => r.lastBeat + TTL))));
    else await this.ctx.storage.deleteAlarm();
  }
  async expire() {
    const now = Date.now();
    this.data.rooms = this.data.rooms.filter(r => now - r.lastBeat < TTL);
    for (const r of this.data.rooms) r.members = r.members.filter(m => m.until > now || this.sockets().some(ws => { const p=this.meta(ws); return p.id===m.id && p.token===m.token && p.no===r.no; }));
    for (const ws of this.sockets()) { const p=this.meta(ws); if(p.no && !this.data.rooms.some(r=>r.no===p.no)){p.no=null;p.status='大廳中';ws.serializeAttachment(p);} }
  }
  async fetch(req) {
    return this.serial(async () => {
      const q = new URL(req.url).searchParams, id=q.get('id'), token=q.get('token');
      if (!/^[\w-]{8,40}$/.test(id || '') || !/^[\w-]{24,80}$/.test(token || '')) return new Response('invalid identity', {status:400});
      for (const ws of this.sockets()) if(this.meta(ws).id===id) {
        if(this.meta(ws).token!==token) return new Response('identity in use', {status:409});
        const p=this.meta(ws);p.closed=true;ws.serializeAttachment(p);ws.close(4001,'replaced');
      }
      const [client,server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({id,token,name:'',status:'大廳中',no:null,rateAt:0,rateN:0,chatAt:0,createAt:0});
      await this.expire();
      this.send(server,{k:'state',players:this.players(),rooms:this.publicRooms(),chats:this.data.chats});
      return new Response(null,{status:101,webSocket:client});
    });
  }
  async webSocketMessage(ws, raw) {
    return this.serial(async () => {
      const fail = reason => this.send(ws,{k:'error',reason});
      let p=this.meta(ws); if(p.closed) return;
      const now=Date.now();
      if(now-p.rateAt>=1000){p.rateAt=now;p.rateN=0;}
      p.rateN++; ws.serializeAttachment(p);
      if(p.rateN>12) return fail('操作太頻繁，請稍後再試');
      if(typeof raw!=='string' || raw.length>4096) return fail('訊息太長');
      let m;try{m=JSON.parse(raw);}catch(_){return fail('訊息格式錯誤');}
      if(!m || typeof m!=='object')return fail('訊息格式錯誤');
      await this.expire();
      p=this.meta(ws);
      if(m.k==='hello') {
        const name=clean(m.name);if(!name || [...name].length>12)return fail('暱稱需為 1～12 字');
        p.name=name;ws.serializeAttachment(p);
      } else if(!p.name) return fail('請先設定暱稱');
      const room = () => this.data.rooms.find(r=>r.no===Number(m.no || p.no));
      const member = r => r.members.find(x=>x.id===p.id && x.token===p.token);
      if(m.k==='hello' || m.k==='status') {
        if(!STATES.includes(m.status)) return fail('狀態不正確');
        if(m.code) {
          const r=this.data.rooms.find(r=>r.code===m.code);
          if(!r)return fail('房間公告已過期，遊戲連線不受影響');
          if(!member(r) && Math.max(r.count,r.members.length)>=20)return fail('房間已滿');
          this.admit(ws,p,r,false);
        } else if(m.status==='大廳中' || m.status==='練習中') {
          for(const r of this.data.rooms)r.members=r.members.filter(x=>x.id!==p.id || x.token!==p.token);
          p.no=null;
        } else if(!p.no || (m.no && Number(m.no)!==p.no)) return fail('請先加入房間');
        p.status=m.status;ws.serializeAttachment(p);
      } else if(m.k==='refresh') {
        this.send(ws,{k:'state',players:this.players(),rooms:this.publicRooms(),chats:this.data.chats});return;
      } else if(m.k==='chat') {
        const text=clean(m.text);
        if(!text || [...text].length>200)return fail('留言需為 1～200 字');
        // Keep the one-second limit across page navigation / reconnect too.
        this.data.chatRates=(this.data.chatRates || []).filter(r=>now-r.at<1000);
        if(now-p.chatAt<1000 || this.data.chatRates.some(r=>r.id===p.id && r.token===p.token))return fail('留言太頻繁，每秒最多一則');
        this.data.chatRates.push({id:p.id,token:p.token,at:now});
        p.chatAt=now;ws.serializeAttachment(p);
        const chat={id:p.id,name:p.name,text,at:now};this.data.chats.push(chat);this.data.chats=this.data.chats.slice(-50);
        await this.save();this.cast({k:'chat',chat});return;
      } else if(m.k==='create') {
        if(now-p.createAt<3000)return fail('開房太頻繁，請稍後再試');
        if(p.no)return fail('你已經加入房間');
        const name=clean(m.name);
        if(!name || [...name].length>30 || !/^([1-6])v\1$/.test(m.mode))return fail('請確認房名與模式');
        if(m.password!=null && (typeof m.password!=='string' || [...m.password].length>30))return fail('密碼最多 30 字');
        p.createAt=now;ws.serializeAttachment(p);
        const salt=random(), passwordHash=m.password ? await hash(salt,m.password) : '';
        const r={no:this.data.next++,name,mode:m.mode,code:random(),salt,passwordHash,count:1,status:'waiting',host:p.id,hostToken:p.token,hostName:p.name,latency:null,lastBeat:now,hidden:false,members:[]};
        this.data.rooms.push(r);this.admit(ws,p,r,true);
      } else if(m.k==='join' || m.k==='quick') {
        const r=m.k==='quick' ? this.data.rooms.filter(r=>!r.hidden && r.status==='waiting' && !r.passwordHash && Math.max(r.count,r.members.length)<20 && (!m.mode || m.mode==='all' || r.mode===m.mode)).sort((a,b)=>b.count-a.count || a.no-b.no)[0] : room();
        if(!r || r.hidden)return fail(m.k==='quick'?'目前沒有可加入的房間，要不要自己開一間？':'房間不存在或正在交接，請稍後再試');
        if(p.no && p.no!==r.no)return fail('你已經加入其他房間');
        if(!member(r) && Math.max(r.count,r.members.length)>=20)return fail('房間已滿');
        if(r.passwordHash && (typeof m.password!=='string' || [...m.password].length>30 || await hash(r.salt,m.password)!==r.passwordHash))return fail('房間密碼錯誤');
        this.admit(ws,p,r,true);
      } else if(m.k==='room-update') {
        const r=room();
        if(!r || p.no!==r.no || !member(r))return fail('你不是這個房間的成員');
        if((r.host!==p.id || r.hostToken!==p.token) && this.ownerOnline(r))return fail('只有房主可以更新房間');
        if(!Number.isInteger(m.count) || m.count<1 || m.count>20 || !['waiting','playing'].includes(m.status) || (m.latency!==null && (!Number.isFinite(m.latency) || m.latency<0 || m.latency>60000)))return fail('房間資料不正確');
        if(m.mode!==undefined && (!/^([1-6])v\1$/.test(m.mode) || (r.status==='playing' && m.status==='playing' && m.mode!==r.mode)))return fail('比賽模式不正確或比賽尚未結束');
        Object.assign(r,{host:p.id,hostToken:p.token,hostName:p.name,count:m.count,status:m.status,latency:m.latency,lastBeat:now,hidden:false,...(m.mode?{mode:m.mode}:{})});
      } else if(m.k==='room-close') {
        const r=room();if(!r || r.host!==p.id || r.hostToken!==p.token || p.no!==r.no)return fail('只有房主可以關閉房間');
        // Close the owner's membership, retain a private tombstone for takeover.
        r.hidden=true;r.members=r.members.filter(x=>x.id!==p.id || x.token!==p.token);p.no=null;p.status='大廳中';ws.serializeAttachment(p);
      } else return fail('不支援的訊息');
      await this.save();this.publish();
    });
  }
  admit(ws,p,r,reply) {
    if(!r.members.some(x=>x.id===p.id && x.token===p.token))r.members.push({id:p.id,token:p.token,until:Date.now()+TTL});
    r.count=Math.max(r.count,r.members.length);p.no=r.no;p.status='房間中';ws.serializeAttachment(p);
    if(reply)this.send(ws,{k:'joined',no:r.no,code:r.code,mode:r.mode,host:r.host===p.id && r.hostToken===p.token});
  }
  async bye(ws) {
    return this.serial(async()=>{
      const p=this.meta(ws);if(p.closed)return;p.closed=true;ws.serializeAttachment(p);
      for(const r of this.data.rooms)if(r.host===p.id && r.hostToken===p.token)r.hidden=true;
      await this.save();this.publish();
    });
  }
  async webSocketClose(ws) { await this.bye(ws);try{ws.close(1000,'bye');}catch(_){} }
  async webSocketError(ws) { await this.bye(ws); }
  async alarm() { return this.serial(async()=>{await this.expire();await this.save();this.publish();}); }
}
