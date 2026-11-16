// 台北伺服器（LightNode）：多人連線的房間＋大廳。協定跟 rt-worker/（Cloudflare 版）完全一樣，網頁不用分兩套。
// 跑在 127.0.0.1:8787，外面由 Caddy 加上 https（wss://130-94-37-34.sslip.io）轉進來。
// 跟 Cloudflare 版的差別：不按則數收費，所以每條連線每秒上限放寬到 80 則（遊戲在這條線上會送得比較密，畫面比較順）。
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { verifiedPlayer } from '../shared/verify-player.mjs';
import { MatchHost, HOST_ID } from '../match/host.mjs';

const PORT = Number(process.env.PORT || 8787);
const ALLOWED = (process.env.ALLOWED_ORIGINS || 'https://volleycourts.vercel.app').split(',').map(s => s.trim()).filter(Boolean);
const DATA = process.env.LOBBY_FILE || new URL('./lobby.json', import.meta.url).pathname;
const MAX_PEOPLE = 32, MAX_BYTES = 16384, MAX_RATE = 80;

// ---- 簡單限流（跟 Cloudflare 版一樣：每個 IP 每分鐘 120 次連線、每個帳號 30 次）
const buckets = new Map();
function allow(key, limit) {
  const now = Date.now(), b = buckets.get(key) || { t: now, n: 0 };
  if (now - b.t > 60000) { b.t = now; b.n = 0; }
  b.n++; buckets.set(key, b); return b.n <= limit;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 60000) buckets.delete(k); }, 60000).unref();

// ---- 房間：誰送的訊息就轉給同房其他人；有人進出通知大家
const rooms = new Map();   // 房號 → Set(ws)
const hosts = new Map();   // 房號 → MatchHost（B5：伺服器當房主，網頁加 &srv=1 才會用到）
function cast(set, from, obj) {
  const s = JSON.stringify(obj);
  for (const ws of set) if (ws !== from && ws.readyState === 1) { try { ws.send(s); } catch (_) { /* ignore */ } }
}
function roomJoin(ws, name, id, player) {
  const set = rooms.get(name) || new Set(); rooms.set(name, set);
  const duplicate = [...set].find(o => o.meta.id === id);
  if (duplicate && duplicate.meta.player !== player) return ws.close(4009, 'identity in use');
  const others = [...set].filter(o => o !== duplicate);
  if (others.length >= MAX_PEOPLE || others.filter(o => o.meta.player === player).length >= 2) return ws.close(4029, 'room full');
  if (duplicate) { duplicate.meta.replaced = true; set.delete(duplicate); duplicate.close(4001, 'replaced'); }
  ws.meta = { id, player, d: null, t: 0, n: 0 }; set.add(ws);
  ws.send(JSON.stringify({ k: 'hello', members: others.map(o => o.meta).filter(a => a.d).map(a => ({ id: a.id, ...a.d })) }));
  ws.on('message', (raw, binary) => {
    if (binary) return;
    const msg = raw.toString();
    if (msg === 'ping') { ws.send('pong'); return; }
    if (msg.length > MAX_BYTES) return;
    const now = Date.now(), me = ws.meta;
    if (now - me.t > 1000) { me.t = now; me.n = 0; }
    if (++me.n > MAX_RATE * 2) { ws.close(1008, 'rate limit'); return; }
    if (me.n > MAX_RATE) return;
    let m; try { m = JSON.parse(msg); } catch (_) { return; }
    if (m.k === 'enter') { me.d = m.d && typeof m.d === 'object' ? m.d : {}; cast(set, ws, { k: 'p', a: 'enter', id: me.id, d: me.d }); return; }
    if (m.k === 'm' && typeof m.t === 'string') {
      if (m.t === 'srv-start') {   // B5：房主請伺服器開賽（伺服器當房主）
        hosts.get(name)?.stop();   // 每次開賽都用全新的一份比賽，不沿用上一場（或上一次失敗）的殘留
        const h = new MatchHost((t, d) => cast(set, null, { k: 'm', t, d, f: HOST_ID }), (...a) => console.log('[比賽]', name, ...a)); hosts.set(name, h);
        try { h.start(m.d); } catch (e) {
          console.warn('[比賽] 開賽失敗', name, e && e.stack || e); h.stop(); hosts.delete(name);
          cast(set, null, { k: 'm', t: 'srv-fail', d: { why: String(e && e.message || e).slice(0, 200) }, f: HOST_ID });   // 叫大家這一場改回房主電腦裁判
        }
        return;
      }
      if (m.t === 'srv-stop') { hosts.get(name)?.stop(); hosts.delete(name); return; }
      cast(set, ws, { k: 'm', t: m.t, d: m.d, f: me.id });
      const h = hosts.get(name); if (h && h.running) h.receive(m.t, m.d, me.id);
    }
  });
  ws.on('close', () => {
    set.delete(ws);
    const me = ws.meta;
    if (me.d && !me.replaced && ![...set].some(o => o.meta.id === me.id)) cast(set, ws, { k: 'p', a: 'leave', id: me.id, d: {} });
    if (!set.size) { rooms.delete(name); hosts.get(name)?.stop(); hosts.delete(name); }
  });
}

// ---- 大廳：照 rt-worker/src/lobby.js 搬過來（資料存在 lobby.json）
const TTL = 30000;
const STATES = ['大廳中', '房間中', '比賽中', '練習中'];
const clean = s => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '').trim() : '';
const random = () => crypto.randomBytes(16).toString('hex').toUpperCase();
const hash = (salt, password) => crypto.createHash('sha256').update(salt + ':' + password).digest('hex');
const L = {
  data: (() => { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (_) { return { next: 101, rooms: [], chats: [] }; } })(),
  socks: new Set(), alarm: 0,
  sockets() { return [...this.socks].filter(ws => ws.readyState === 1 && !ws.meta.closed); },
  send(ws, data) { try { ws.send(JSON.stringify(data)); } catch (_) { /* ignore */ } },
  cast(data) { for (const ws of this.sockets()) this.send(ws, data); },
  players() { return this.sockets().map(ws => ws.meta).filter(p => p.name).map(({ id, name, status, no }) => ({ id, name, status, no })); },
  ownerOnline(r) { return this.sockets().some(ws => { const p = ws.meta; return p.id === r.host && p.token === r.hostToken && p.no === r.no; }); },
  publicRooms() {
    return this.data.rooms.filter(r => !r.hidden && Date.now() - r.lastBeat < TTL).map(r => ({
      no: r.no, name: r.name, mode: r.mode, locked: !!r.passwordHash, count: r.count, max: 20,
      status: r.status, hostName: r.hostName, latency: r.latency, lastBeat: r.lastBeat,
    }));
  },
  publish() { this.cast({ k: 'players', players: this.players() }); this.cast({ k: 'rooms', rooms: this.publicRooms() }); },
  save() {
    try { fs.writeFileSync(DATA + '.tmp', JSON.stringify(this.data)); fs.renameSync(DATA + '.tmp', DATA); } catch (e) { console.warn('lobby save failed', e.message); }
    clearTimeout(this.alarm);
    if (this.data.rooms.length) this.alarm = setTimeout(() => { this.expire(); this.save(); this.publish(); }, Math.max(1, Math.min(...this.data.rooms.map(r => r.lastBeat + TTL)) - Date.now()));
  },
  expire() {
    const now = Date.now();
    this.data.rooms = this.data.rooms.filter(r => now - r.lastBeat < TTL);
    for (const r of this.data.rooms) r.members = r.members.filter(m => m.until > now || this.sockets().some(ws => { const p = ws.meta; return p.id === m.id && p.token === m.token && p.no === r.no; }));
    for (const ws of this.sockets()) { const p = ws.meta; if (p.no && !this.data.rooms.some(r => r.no === p.no)) { p.no = null; p.status = '大廳中'; } }
  },
  admit(ws, p, r, reply) {
    if (!r.members.some(x => x.id === p.id && x.token === p.token)) r.members.push({ id: p.id, token: p.token, until: Date.now() + TTL });
    r.count = Math.max(r.count, r.members.length); p.no = r.no; p.status = '房間中';
    if (reply) this.send(ws, { k: 'joined', no: r.no, code: r.code, mode: r.mode, host: r.host === p.id && r.hostToken === p.token });
  },
  join(ws, id, token, player) {
    const active = this.sockets();
    const others = active.filter(o => o.meta.id !== id);
    if (others.length >= 250 || others.filter(o => o.meta.player === player).length >= 2) return ws.close(4029, 'lobby full');
    for (const o of active) if (o.meta.id === id) {
      if (o.meta.player !== player || o.meta.token !== token) return ws.close(4009, 'identity in use');
      o.meta.closed = true; o.close(4001, 'replaced');
    }
    ws.meta = { id, token, player, name: '', status: '大廳中', no: null, rateAt: 0, rateN: 0, chatAt: 0, createAt: 0 };
    this.socks.add(ws); this.expire();
    this.send(ws, { k: 'state', players: this.players(), rooms: this.publicRooms(), chats: this.data.chats });
    ws.on('message', (raw, binary) => { const s = raw.toString(); if (s === 'ping') { ws.send('pong'); return; } this.message(ws, binary ? null : s); });
    ws.on('close', () => { this.socks.delete(ws); this.bye(ws); });
  },
  message(ws, raw) {
    const fail = reason => this.send(ws, { k: 'error', reason });
    const p = ws.meta; if (p.closed) return;
    const now = Date.now();
    if (now - p.rateAt >= 1000) { p.rateAt = now; p.rateN = 0; }
    p.rateN++;
    if (p.rateN > 24) { ws.close(1008, 'rate limit'); return; }
    if (p.rateN > 12) return fail('操作太頻繁，請稍後再試');
    if (typeof raw !== 'string' || raw.length > 4096) return fail('訊息太長');
    let m; try { m = JSON.parse(raw); } catch (_) { return fail('訊息格式錯誤'); }
    if (!m || typeof m !== 'object') return fail('訊息格式錯誤');
    this.expire();
    if (m.k === 'hello') {
      const name = clean(m.name); if (!name || [...name].length > 12) return fail('暱稱需為 1～12 字');
      p.name = name;
    } else if (!p.name) return fail('請先設定暱稱');
    const room = () => this.data.rooms.find(r => r.no === Number(m.no || p.no));
    const member = r => r.members.find(x => x.id === p.id && x.token === p.token);
    if (m.k === 'hello' || m.k === 'status') {
      if (!STATES.includes(m.status)) return fail('狀態不正確');
      if (m.code) {
        const r = this.data.rooms.find(r => r.code === m.code);
        if (!r) return fail('房間公告已過期，遊戲連線不受影響');
        if (!member(r) && Math.max(r.count, r.members.length) >= 20) return fail('房間已滿');
        this.admit(ws, p, r, false);
      } else if (m.status === '大廳中' || m.status === '練習中') {
        for (const r of this.data.rooms) r.members = r.members.filter(x => x.id !== p.id || x.token !== p.token);
        p.no = null;
      } else if (!p.no || (m.no && Number(m.no) !== p.no)) return fail('請先加入房間');
      p.status = m.status;
    } else if (m.k === 'refresh') {
      this.send(ws, { k: 'state', players: this.players(), rooms: this.publicRooms(), chats: this.data.chats }); return;
    } else if (m.k === 'chat') {
      const text = clean(m.text);
      if (!text || [...text].length > 200) return fail('留言需為 1～200 字');
      this.data.chatRates = (this.data.chatRates || []).filter(r => now - r.at < 1000);
      if (now - p.chatAt < 1000 || this.data.chatRates.some(r => r.player === p.player)) return fail('留言太頻繁，每秒最多一則');
      this.data.chatRates.push({ player: p.player, at: now });
      p.chatAt = now;
      const chat = { id: p.id, name: p.name, text, at: now }; this.data.chats.push(chat); this.data.chats = this.data.chats.slice(-50);
      this.save(); this.cast({ k: 'chat', chat }); return;
    } else if (m.k === 'create') {
      if (this.data.rooms.some(r => r.hostPlayer === p.player && !r.hidden) || now - p.createAt < 3000) return fail('開房太頻繁，請稍後再試');
      if (p.no) return fail('你已經加入房間');
      const name = clean(m.name);
      if (!name || [...name].length > 30 || !/^([1-6])v\1$/.test(m.mode)) return fail('請確認房名與模式');
      if (m.password != null && (typeof m.password !== 'string' || [...m.password].length > 30)) return fail('密碼最多 30 字');
      p.createAt = now;
      const salt = random(), passwordHash = m.password ? hash(salt, m.password) : '';
      const r = { no: this.data.next++, name, mode: m.mode, code: random(), salt, passwordHash, count: 1, status: 'waiting', host: p.id, hostToken: p.token, hostPlayer: p.player, hostName: p.name, latency: null, lastBeat: now, hidden: false, members: [] };
      this.data.rooms.push(r); this.admit(ws, p, r, true);
    } else if (m.k === 'join' || m.k === 'quick') {
      const r = m.k === 'quick' ? this.data.rooms.filter(r => !r.hidden && r.status === 'waiting' && !r.passwordHash && Math.max(r.count, r.members.length) < 20 && (!m.mode || m.mode === 'all' || r.mode === m.mode)).sort((a, b) => b.count - a.count || a.no - b.no)[0] : room();
      if (!r || r.hidden) return fail(m.k === 'quick' ? '目前沒有可加入的房間，要不要自己開一間？' : '房間不存在或正在交接，請稍後再試');
      if (p.no && p.no !== r.no) return fail('你已經加入其他房間');
      if (!member(r) && Math.max(r.count, r.members.length) >= 20) return fail('房間已滿');
      if (r.passwordHash && (typeof m.password !== 'string' || [...m.password].length > 30 || hash(r.salt, m.password) !== r.passwordHash)) return fail('房間密碼錯誤');
      this.admit(ws, p, r, true);
    } else if (m.k === 'room-update') {
      const r = room();
      if (!r || p.no !== r.no || !member(r)) return fail('你不是這個房間的成員');
      if ((r.host !== p.id || r.hostToken !== p.token) && this.ownerOnline(r)) return fail('只有房主可以更新房間');
      if (!Number.isInteger(m.count) || m.count < 1 || m.count > 20 || !['waiting', 'playing'].includes(m.status) || (m.latency !== null && (!Number.isFinite(m.latency) || m.latency < 0 || m.latency > 60000))) return fail('房間資料不正確');
      if (m.mode !== undefined && (!/^([1-6])v\1$/.test(m.mode) || (r.status === 'playing' && m.status === 'playing' && m.mode !== r.mode))) return fail('比賽模式不正確或比賽尚未結束');
      Object.assign(r, { host: p.id, hostToken: p.token, hostPlayer: p.player, hostName: p.name, count: m.count, status: m.status, latency: m.latency, lastBeat: now, hidden: false, ...(m.mode ? { mode: m.mode } : {}) });
    } else if (m.k === 'room-close') {
      const r = room(); if (!r || r.host !== p.id || r.hostToken !== p.token || p.no !== r.no) return fail('只有房主可以關閉房間');
      r.hidden = true; r.members = r.members.filter(x => x.id !== p.id || x.token !== p.token); p.no = null; p.status = '大廳中';
    } else return fail('不支援的訊息');
    this.save(); this.publish();
  },
  bye(ws) {
    const p = ws.meta; if (p.closed) return; p.closed = true;
    for (const r of this.data.rooms) if (r.host === p.id && r.hostToken === p.token) r.hidden = true;
    this.save(); this.publish();
  },
};

// ---- HTTP／WebSocket 入口
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok ' + rooms.size + ' rooms'); return; }
  // 選伺服器頁面用：目前人數（大廳＋房間裡的帳號，同一個人只算一次）、房間數；網頁從別的網域來問，所以開放跨網域讀取（只有數字）
  if (req.url === '/status') {
    const who = new Set();
    for (const ws of L.sockets()) if (ws.meta && ws.meta.player) who.add(ws.meta.player);
    for (const set of rooms.values()) for (const ws of set) if (ws.readyState === 1 && ws.meta && ws.meta.player) who.add(ws.meta.player);
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, players: who.size, rooms: rooms.size, t: Date.now() })); return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('volleycourt rt');
});
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BYTES * 2, perMessageDeflate: false, handleProtocols: () => 'volleycourt' });
server.on('upgrade', async (req, socket, head) => {
  const reject = (code, text) => { socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
  try {
    const url = new URL(req.url, 'http://x');
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,64})$/), lobby = url.pathname === '/lobby';
    if (!m && !lobby) return reject(404, 'Not Found');
    const origin = req.headers.origin || '';
    if (ALLOWED.length && !ALLOWED.includes(origin) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return reject(403, 'Forbidden');
    const id = (url.searchParams.get('id') || '').replace(/[^\w-]/g, '').slice(0, 40);
    if (!id || id === HOST_ID) return reject(400, 'Bad Request');   /* srv 是伺服器裁判的代號，任何人都不能用 */
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (!allow('ip:' + ip, 120)) return reject(429, 'Too Many Requests');
    const [protocol, token] = String(req.headers['sec-websocket-protocol'] || '').split(',').map(v => v.trim());
    let player;
    try { player = protocol === 'volleycourt' && (process.env.ALLOW_DEV_TOKEN === '1' && token === 'dev.local.token' ? 'dev-' + id : await verifiedPlayer(token)); }   /* 測試通行證只在本機開發時開 ALLOW_DEV_TOKEN=1 才收 */
    catch (e) { console.warn('auth unavailable', e.name); return reject(503, 'Service Unavailable'); }
    if (!player) return reject(401, 'Unauthorized');
    if (!allow('acct:' + player, 30)) return reject(429, 'Too Many Requests');
    if (lobby) {
      const t = url.searchParams.get('token');
      if (!/^[\w-]{8,40}$/.test(id) || !/^[\w-]{24,80}$/.test(t || '')) return reject(400, 'Bad Request');
      wss.handleUpgrade(req, socket, head, ws => L.join(ws, id, t, player));
    } else wss.handleUpgrade(req, socket, head, ws => roomJoin(ws, m[1], id, player));
  } catch (e) { console.warn('upgrade failed', e.message); reject(500, 'Internal Server Error'); }
});
server.listen(PORT, '127.0.0.1', () => console.log('volleycourt rt listening on', PORT));
