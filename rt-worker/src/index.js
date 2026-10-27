// 排球館多人連線的房間伺服器（Cloudflare Workers＋Durable Objects，免費方案就能用）
// 每個房間一個 Durable Object：大家用 WebSocket 連上來，誰送的訊息就轉給房間裡其他人；有人進出也通知大家。
// 伺服器只轉發、不判斷遊戲內容（比賽由開局的人判定，跟用 Ably 時一樣）。
// 計費：收進來的訊息每 20 則算 1 次請求，送出去的不算；保持連線的 ping 由平台自動回 pong，不會叫醒房間。
//
// 協定（JSON 文字）：
//   用戶 → 伺服器：{k:'enter', d:{名字、顏色…}}、{k:'m', t:種類, d:內容}、'ping'
//   伺服器 → 用戶：{k:'hello', members:[{id, …}]}（剛連上：房間裡已經報到的人）
//                 {k:'p', a:'enter'|'leave', id, d}（有人進來／離開）
//                 {k:'m', t, d, f:送的人}、'pong'
import { DurableObject } from 'cloudflare:workers';

const MAX_PEOPLE = 32;   // 一間房最多幾條連線（遊戲本身限 12 人）
const MAX_BYTES = 16384;   // 一則訊息最大 16 KB（遊戲的訊息約 0.1～1 KB）
const MAX_RATE = 40;   // 每條連線每秒最多 40 則（遊戲本身約 3～5 則），超過的丟掉，免得把免費額度用完

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,64})$/);
    if (!m) return new Response('volleycourt rt', { status: 404 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    // 只讓自己的網站連（ALLOWED_ORIGINS，逗號分隔）；本機開發（localhost）一律可以
    const origin = req.headers.get('Origin') || '';
    const allow = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allow.length && !allow.includes(origin) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return new Response('origin not allowed', { status: 403 });
    const id = (url.searchParams.get('id') || '').replace(/[^\w-]/g, '').slice(0, 40);
    if (!id) return new Response('missing id', { status: 400 });
    // 房間建在第一個人連到的機房附近（預設）；要指定區域可以設 LOCATION_HINT（例如 apac）
    // 注意：台灣有些網路業者會把 Cloudflare 免費方案的流量送到美國機房，這時指定 apac 反而要繞一大圈
    const stub = env.LOCATION_HINT ? env.ROOMS.get(env.ROOMS.idFromName(m[1]), { locationHint: env.LOCATION_HINT }) : env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    return stub.fetch(new Request(`https://room/?id=${id}`, req));
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rate = new WeakMap();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  async fetch(req) {
    const id = new URL(req.url).searchParams.get('id');
    // 同一個人重新連上（換網路、斷線重連）：關掉舊的那條
    for (const ws of this.ctx.getWebSockets()) if (this.meta(ws).id === id) { try { ws.close(4001, 'replaced'); } catch (e) { /* ignore */ } }
    if (this.ctx.getWebSockets().length >= MAX_PEOPLE) return new Response('room full', { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, d: null });
    server.send(JSON.stringify({ k: 'hello', members: this.members(server) }));
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > MAX_BYTES) return;
    const now = Date.now(), r = this.rate.get(ws) || { t: now, n: 0 };
    if (now - r.t > 1000) { r.t = now; r.n = 0; }
    r.n++; this.rate.set(ws, r); if (r.n > MAX_RATE) return;
    let m; try { m = JSON.parse(msg); } catch (e) { return; }
    const me = this.meta(ws);
    if (m.k === 'enter') { me.d = m.d && typeof m.d === 'object' ? m.d : {}; ws.serializeAttachment(me); this.cast(ws, { k: 'p', a: 'enter', id: me.id, d: me.d }); return; }
    if (m.k === 'm' && typeof m.t === 'string') this.cast(ws, { k: 'm', t: m.t, d: m.d, f: me.id });
  }
  async webSocketClose(ws, code) { this.bye(ws); try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch (e) { /* ignore */ } }
  async webSocketError(ws) { this.bye(ws); }
  // 有人離開：通知其他人（同一個人已經用新的連線回來就不通知）
  bye(ws) {
    const me = this.meta(ws); if (!me.d) return;
    if (this.ctx.getWebSockets().some((o) => o !== ws && this.meta(o).id === me.id)) return;
    me.d = null; try { ws.serializeAttachment(me); } catch (e) { /* ignore */ }
    this.cast(ws, { k: 'p', a: 'leave', id: me.id, d: {} });
  }
  cast(from, obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) if (ws !== from && ws.readyState === 1) { try { ws.send(s); } catch (e) { /* ignore */ } }
  }
  members(except) { return this.ctx.getWebSockets().filter((ws) => ws !== except).map((ws) => this.meta(ws)).filter((a) => a.d).map((a) => ({ id: a.id, ...a.d })); }
  meta(ws) { try { return ws.deserializeAttachment() || { id: '', d: null }; } catch (e) { return { id: '', d: null }; } }
}
