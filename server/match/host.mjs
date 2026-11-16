// B5：伺服器當房主。房間裡有人（房主，網址 &srv=1）送「srv-start」時，伺服器開一份比賽核心當房主，
// 用跟網頁房主一模一樣的訊息（vm 開賽／事件、st 狀態快照、match-frame 比賽畫格、match-ack）跟大家溝通；
// 所有真人都當加入者：照伺服器的結果顯示，自己擊球時先預測、再送 match-claim 給伺服器確認。
import fs from 'node:fs';
import { createGameCore } from './game-core.mjs';
const VENUE = fs.readFileSync(new URL('./venue-bs-shenjing.json', import.meta.url), 'utf8');
export const HOST_ID = 'srv';
const TICK = 1000 / 60;

export class MatchHost {
  // publish(t, d)：把訊息送給房間裡所有人（寄件人是 srv）
  constructor(publish, log = () => {}) {
    this.publish = publish; this.log = log; this.timer = null; this.last = 0;
    const g = this.g = createGameCore();
    g.setState(JSON.parse(VENUE));
    g.NET.on = true; g.NET.me = HOST_ID; g.NET.name = '伺服器裁判';
    g.NET.tx = { kind: 'cf', publish: (t, d) => this.publish(t, d) };
    g.walk.x = 40; g.walk.z = 40;   // 伺服器自己不在場上
  }
  // d：{ c: {id, x, z, rot}, sg, six, count, seats: [[id|null…],[…]], rules: {speed, …} }
  start(d) {
    const g = this.g, st = g.state;
    if (!d || !d.c || !Array.isArray(d.seats) || d.seats.length !== 2) throw new Error('開賽資料不完整');
    let c = st.items.find(i => i.id === d.c.id);
    if (!c) { c = { id: String(d.c.id), type: 'vb' }; st.items.push(c); }
    Object.assign(c, { x: +d.c.x || 0, z: +d.c.z || 0, rot: +d.c.rot || 0 });   // 用網頁那邊的球場位置
    if (d.rules) { if (Number.isFinite(d.rules.speed)) g.VB.ts = d.rules.speed; if (g.vmApplyRoomRules) g.vmApplyRoomRules(d.rules); }
    const seats = d.seats.map(t => t.map(id => (typeof id === 'string' && id ? id : null)));
    if (d.six) g.vm6Start(c, d.sg === 1 ? 1 : -1, {}, seats); else g.vmStart(c, d.sg === 1 ? 1 : -1, null, [], seats);
    // 真人暱稱（房主開賽時給的）：播報（例如「發球超過 8 秒（小明）」）、結算才不會寫「球友」
    const names = d.names && typeof d.names === 'object' ? d.names : {};
    for (const id of seats.flat()) if (id && typeof names[id] === 'string' && names[id].trim()) { const n = names[id].trim().slice(0, 24); g.VM.names[id] = n; if (g.VM.startData?.names) g.VM.startData.names[id] = n; }
    this.last = performance.now();
    clearInterval(this.timer); this.timer = setInterval(() => this.tick(), TICK);
    this.log('match start', JSON.stringify({ six: !!d.six, seats }));
  }
  tick() {
    const now = performance.now(); let dt = (now - this.last) / 1000; this.last = now;
    dt = Math.min(0.05, Math.max(0, dt));
    try { this.g.hostStep(dt); } catch (e) { this.log('match error', e && e.stack || e); this.stop(); this.publish('srv-fail', { why: String(e && e.message || e).slice(0, 200) }); }   // 比賽途中出錯：叫大家改回房主電腦裁判
    if (this.g.VM.phase === 'over' || !this.g.VM.on) this.stop();
  }
  // 房裡的人送來的訊息（擊球請求、位置、量延遲…）
  receive(t, d, from) {
    if (from === HOST_ID) return;
    if (t === 'room-match-sync') { if (this.g.VM.on && this.g.VM.startData) { this.publish('vm', this.g.VM.startData); this.g.NET.forceSt = true; } return; }
    if (t === 'match-claim' && process.env.DEBUG_CLAIM === '1') this.debugClaim(d, from);
    try { this.g.netOnMessage(t, d, from); } catch (e) { this.log('receive error', t, e && e.message); }
  }
  // 除錯：擊球請求為什麼被拒（DEBUG_CLAIM=1 時才印）
  debugClaim(d, from) {
    const g = this.g, w = g.VM.wire, now = performance.now(), peer = g.NET.peers.get(from)?.last;
    const at = Math.min(now, Math.max(now - 350, d.at));
    const hist = w ? w.history.filter(h => h.seq === d.base && Math.abs(h.at - at) < 100 && !h.floor) : [];
    const near = hist.length ? Math.min(...hist.map(h => Math.hypot(...h.p.map((n, i) => n - d.ball.p[i])))) : null;
    this.log('claim', JSON.stringify({ from, kind: d.kind, phase: g.VM.phase, session: d.session === w?.session, round: [d.round, w?.order.round], base: [d.base, w?.order.seq], atAge: Math.round(now - d.at), hist: hist.length, near, peer: peer ? Math.hypot(peer.x - d.ball.p[0], peer.z - d.ball.p[2]).toFixed(2) : null, team: g.VM.team[0].includes(from) ? 0 : g.VM.team[1].includes(from) ? 1 : -1 }));
  }
  get running() { return !!this.timer; }
  stop() { clearInterval(this.timer); this.timer = null; }
}
