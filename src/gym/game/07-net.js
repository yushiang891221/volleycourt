// ---------------------------------------------------------------- 多人連線：一間房最多 4 人，互相看得到、共用一顆球
// 連線方式：有設定 Cloudflare 房間伺服器（rt-worker/，api/rt-config 給網址）就用它，連不上或沒設定才用 Ably（api/rt-token 發通行證）；
// 網址加 &localnet 時改用同一個瀏覽器的分頁互傳（不用帳號，開發測試用）
// hitN：擊球序號，只有「擊球、接球、撿球」才會加一；位置更新沿用同一個序號，不會蓋掉別人的擊球。
// 同一個序號兩個人同時打到：代號比較大的那一下算數（每台電腦都用同一條規則，結果一致）
let ROOM = null;
let ROOM_UI = null, roomLaunched = -1, roomPlaced = -1;
const roomDefaultCount = () => { const m = new URLSearchParams(location.search).get('mode'); return /^[1-6]v[1-6]$/.test(m || '') && m[0] === m[2] ? Number(m[0]) : 2; };
function roomCourtOf(id) {
  const p = id === vmMe() ? walk : NET.peers.get(id); if (!p) return null;
  const ct = courtAt(p.x, p.z, true); return ct && Math.abs(ct.lx) <= 9 && Math.abs(ct.lz) <= 4.5 ? ct.c.id : null;
}
function roomReady() {
  if (!ROOM) { toast('正在確認房間連線'); return; }
  if (!ROOM.snapshot.flow.ready.includes(vmMe()) && !roomCourtOf(vmMe())) { toast('走到球場上再按準備'); return; }
  ROOM.toggleReady();
}
function roomStart() { if (!ROOM?.begin()) toast('由房主開始；至少一人站在球場上準備'); }
function roomRulesChanged(rules) {
  VB.ts = rules.speed; renderRoomRules(); ROOM_UI?.render(); peerTagsAll();
  const f = rules.flow;
  if (f.phase === 'waiting') { if (VM.on) vmStop(true); roomLaunched = -1; roomPlaced = -1; return; }
  if (f.phase !== 'playing') return;
  if (!rules.isHost && !VM.on && NET.tx) NET.tx.publish('room-match-sync', {});
  const c = state.items.find(i => i.id === f.court); if (!c) return;
  // Place each participant once, before the engine distributes service positions.
  const slot = f.picks.indexOf(vmMe());
  if (slot >= 0 && roomPlaced !== f.round) {
    roomPlaced = f.round; const team = Math.floor(slot / rules.count), k = slot % rules.count, sd = team === 0 ? -1 : 1;
    const [depth,left] = rules.count === 6 ? V6_BASE[k] : rules.count === 2 ? [6,k === 0 ? 2.1 : -2.1] : CourtFormations.home(rules.count,k);
    [walk.x,walk.z] = toWorldOf(c,sd*depth,sd*left); walk.keys.clear();
  }
  if (rules.isHost && roomLaunched !== f.round) {
    roomLaunched = f.round;
    const seats = [f.picks.slice(0,rules.count),f.picks.slice(rules.count)];
    // Existing host-side assistance expects the host's team at engine index 0.
    // Flip only internal team indices/sign; the selected physical left/right stays unchanged.
    const right = seats[1].includes(vmMe()), sg = right ? 1 : -1;
    if (right) seats.reverse();
    vmApplyRoomRules(rules);   // 房主設定（企聯等 AI 強度、每局分數、局數）
    if (rules.count !== 2) vm6Start(c,sg,{},seats); else vmStart(c,sg,null,[],seats);
  }
}
function roomSpectator() { return VM.on && vmTeamOf(vmMe()) < 0; }
function roomKeepSpectatorOut() {
  if (!roomSpectator() || !VM.c) return;
  const [x,z] = vmL(walk.x,walk.z);
  if (Math.abs(x)<10.7 && Math.abs(z)<5.4) [walk.x,walk.z] = vmW(x,Math.sign(z || 1)*5.7);
}
function isRoomHost() { return new URLSearchParams(location.search).has('practice') || !!(ROOM && ROOM.isHost); }
function renderRoomRules() {
  const host = isRoomHost(); $('w-host').hidden = !host; $('room-speed').value = String(VB.ts); $('room-speed').disabled = !host;
  if (!host) $('room-panel').hidden = true;
  if (!NET.on) { $('room-list').textContent = (VBSettings.values.nickname || '球友') + '（你・房主）'; }
  else $('room-title').textContent = '房間 ' + NET.room + (host ? ' · 你是房主' : ROOM && ROOM.host ? ' · 房主：' + (NET.peers.get(ROOM.host)?.n || '球友') : ' · 確認房主中…');
}
addEventListener('pagehide', () => netLeave(true));
const NET = { on: false, room: '', me: '', name: '', tx: null, peers: new Map(), lastSt: 0, lastBall: 0, hitN: 0, hitBy: '', ownBall: false, lastSent: null, lat: new Map(), pingT: 0 };
// 某個人傳過來的訊息大概晚了幾秒到（量出來的一半來回時間＋一格畫面；還沒量到先當 0.1 秒）
const netLat = (id) => clamp(((NET.lat.get(id) ?? 100) + 16) / 1000, 0.02, 0.35);
const NET_MAX = 20;
window.VBGameLobby?.start(() => ({
  name: VBSettings.values.nickname || '球友',
  practice: new URLSearchParams(location.search).has('practice'),
  active: NET.on, code: NET.room, isHost: !!ROOM?.isHost,
  playing: ROOM?.snapshot.flow.phase === 'playing', count: NET.peers.size + 1, mode: `${ROOM?.count || roomDefaultCount()}v${ROOM?.count || roomDefaultCount()}`,
  latency: NET.lat.size ? Math.round([...NET.lat.values()].reduce((a,b) => a+b,0)/NET.lat.size) : null,
}));
const NET_COLORS = ['#F2B705', '#E5484D', '#3E63DD', '#30A46C', '#8E4EC6', '#F76B15', '#12A594', '#D6409F', '#0090FF', '#978365', '#E54666', '#46A758'];
function loadScript(src) { return new Promise((ok, bad) => { const s2 = document.createElement('script'); s2.src = src; s2.onload = ok; s2.onerror = bad; document.head.appendChild(s2); }); }
// 流量保護：比賽每分鐘 660 則、其他時間 240 則；超量才放慢位置更新。
const NETQ = { ts: [], slow: 1, warned: false, sent: 0 };
function netCount() {
  const now = performance.now(); NETQ.ts.push(now); NETQ.sent++; while (NETQ.ts.length && now - NETQ.ts[0] > 60000) NETQ.ts.shift();
  const lim = (VM.on ? (VM.wire ? 1440 : 660) : 240) * (netFast() ? 4 : 1), n = NETQ.ts.length, slow = n > lim * 1.5 ? 4 : n > lim ? 2 : 1;   // 比賽中上限放寬（每分鐘 660 則）
  if (slow > NETQ.slow && !NETQ.warned) { NETQ.warned = true; console.info('[即時] 訊息太多，自動放慢位置更新'); }
  NETQ.slow = slow;
}
// 台北伺服器（自己的房間伺服器，kind 是 cf／cf-backup）不按則數收費：位置送得比較密、播放緩衝比較短；走 Ably 時維持原本的節奏
function netFast() { return !!(NET.tx && /^cf/.test(NET.tx.kind || '')); }
async function ablyTransport(room, cid = NET.me) {
  async function requestToken() {
    const response = await fetch('api/rt-token?clientId=' + encodeURIComponent(cid) + '&room=' + encodeURIComponent(room), {
      cache: 'no-store', headers: {Authorization: 'Bearer ' + await gameAccount.accessToken()}
    });
    if (!response.ok) throw new Error('無法取得連線授權');
    return response.json();
  }
  let first = await requestToken();
  if (!window.Ably) await loadScript('https://cdn.jsdelivr.net/npm/ably@2.20.0/build/ably.min.js');
  const client = new window.Ably.Realtime({ clientId: cid, echoMessages: false, authCallback: (_, callback) => {
    const result = first ? Promise.resolve(first) : requestToken();
    first = null;
    result.then(value => callback(null, value), error => callback(error.message, null));
  } });
  // Ably 的萬用權限只認「命名空間:*」，房間頻道用 vb-room:代碼
  const ch = client.channels.get('vb-room:' + room);
  await Promise.race([ch.attach(), new Promise((_, bad) => setTimeout(() => bad(new Error('timeout')), 12000))]).catch((e) => { client.close(); throw new Error(e && e.code === 40160 ? 'denied' : 'attach'); });
  return {
    publish: (t, d) => { netCount(); ch.publish(t, d).catch((e) => console.warn('[即時] 送出失敗', t, e && e.message)); },
    subscribe: (fn) => ch.subscribe((m) => fn(m.name, m.data, m.clientId)),
    enter: (info) => ch.presence.enter(info),
    members: async () => (await ch.presence.get()).map((m) => ({ id: m.clientId, ...(m.data || {}) })),
    onPresence: (fn) => ch.presence.subscribe((m) => fn(m.action, m.clientId, m.data || {})),
    close: () => { try { ch.presence.leave(); client.close(); } catch (e) { /* ignore */ } },
  };
}
function localTransport(room, cid = NET.me) {
  const bc = new BroadcastChannel('vb-room-' + room), members = new Map(); let onMsg = null, onPres = null, mine = null;
  const bcPost = bc.postMessage.bind(bc); bc.postMessage = (m) => { if (m && m.t && !String(m.t).startsWith('__')) netCount(); bcPost(m); };   // 本機測試也照樣計數
  bc.onmessage = (e) => {
    const { t, d, from } = e.data || {};
    if (t === '__enter' || t === '__here') { const isNew = !members.has(from); members.set(from, d); if (isNew && onPres) onPres('enter', from, d); if (t === '__enter' && mine) bc.postMessage({ t: '__here', d: mine, from: cid }); return; }
    if (t === '__leave') { members.delete(from); onPres && onPres('leave', from, d); return; }
    onMsg && onMsg(t, d, from);
  };
  return {
    publish: (t, d) => bc.postMessage({ t, d, from: cid }),
    subscribe: (fn) => { onMsg = fn; },
    enter: async (info) => { mine = info; members.set(cid, info); bc.postMessage({ t: '__enter', d: info, from: cid }); },
    members: async () => { await new Promise((r) => setTimeout(r, 250)); return [...members].map(([id, d]) => ({ id, ...d })); },
    onPresence: (fn) => { onPres = fn; },
    close: () => { bc.postMessage({ t: '__leave', d: {}, from: cid }); bc.close(); },
  };
}
// Cloudflare 房間伺服器（rt-worker/）：WebSocket 直接連，伺服器只轉發；斷線自動重連（最多 8 次、約 20 秒），重連後重新報到、補上這段時間進出的人
async function cfTransport(room, cid, base) {
  const url = base + '/room/' + encodeURIComponent(room) + '?id=' + encodeURIComponent(cid), members = new Map(), mainNet = cid === NET.me;
  let ws = null, onMsg = null, onPres = null, mine = null, closed = false, tries = 0, ping = 0;
  const open = async () => {
    const token = await gameAccount.accessToken();
    return new Promise((ok, bad) => {
    const w = new WebSocket(url, ['volleycourt', token]); let done = false;
    const to = setTimeout(() => { if (!done) { done = true; try { w.close(); } catch (e) { /* ignore */ } bad(new Error('timeout')); } }, 6000);
    w.onmessage = (e) => {
      if (e.data === 'pong') return;
      let m; try { m = JSON.parse(e.data); } catch (er) { return; }
      if (m.k === 'm') { onMsg && onMsg(m.t, m.d, m.f); return; }
      if (m.k === 'p') { if (m.a === 'leave') members.delete(m.id); else members.set(m.id, { id: m.id, ...(m.d || {}) }); onPres && onPres(m.a, m.id, m.d || {}); return; }
      if (m.k === 'hello') {
        const before = new Set(members.keys()); members.clear(); for (const x of m.members) members.set(x.id, x);
        if (!done) { done = true; clearTimeout(to); ok(w); return; }
        if (onPres) { for (const id of before) if (!members.has(id)) onPres('leave', id, {}); for (const x of m.members) onPres('enter', x.id, x); }   // 重連：斷線那段時間有人進出
      }
    };
    w.onclose = () => { if (!done) { done = true; clearTimeout(to); bad(new Error('closed')); return; } if (w === ws && !closed) reconnect(); };
  });
  };
  const reconnect = async () => {
    clearInterval(ping);
    if (closed) return;
    if (tries >= 8) { if (mainNet) netStatus('連線中斷了，請重新進入房間', 'warn'); return; }
    tries++; if (mainNet) netStatus('連線中斷，重新連線中…', 'busy');
    await new Promise((r) => setTimeout(r, Math.min(5000, 600 * tries)));
    if (closed) return;
    try { ws = await open(); tries = 0; keepAlive(); if (mine) ws.send(JSON.stringify({ k: 'enter', d: mine })); if (mainNet && NET.on) renderMpList(); } catch (e) { reconnect(); }
  };
  const keepAlive = () => { clearInterval(ping); ping = setInterval(() => { if (ws && ws.readyState === 1) ws.send('ping'); }, 25000); };   // 25 秒一次，免得被中間的網路設備斷掉
  ws = await open(); keepAlive();
  return {
    kind: 'cf',
    publish: (t, d) => { netCount(); if (ws.readyState === 1) ws.send(JSON.stringify({ k: 'm', t, d })); },
    subscribe: (fn) => { onMsg = fn; },
    enter: async (info) => { mine = info; if (ws.readyState === 1) ws.send(JSON.stringify({ k: 'enter', d: info })); },
    members: async () => [...members.values()],
    onPresence: (fn) => { onPres = fn; },
    close: () => { closed = true; clearInterval(ping); try { ws.close(1000, 'bye'); } catch (e) { /* ignore */ } },
  };
}
// 連線設定：網站的 api/rt-config 回傳房間伺服器網址（Vercel 環境變數 RT_CF_URL）和先用哪一個（RT_PREFER：ably 預設／cf）
// 本機測試可以在網址加 &cf=ws://localhost:8787（加了就先用 Cloudflare）
let RT_CFG = undefined;
async function rtConfig() {
  if (RT_CFG !== undefined) return RT_CFG;
  try { const r = await fetch('api/rt-config', { cache: 'no-store' }); RT_CFG = r.ok && (r.headers.get('content-type') || '').includes('json') ? await r.json() : { cf: null }; } catch (e) { RT_CFG = { cf: null }; }
  return RT_CFG;
}
// 選連線方式：&localnet＝同一個瀏覽器的分頁互傳；兩種都有設定時先用 prefer 那個（預設 Ably：台灣通常比較快），
// 連不上（例如 Ably 每月額度用完、被擋）就自動改用另一個——整個帳號額度用完時大家會一起換過去，同一間房還是看得到彼此
async function rtTransport(room, cid) {
  if (new URLSearchParams(location.search).has('localnet')) return localTransport(room, cid);
  const { cf, prefer } = await rtConfig();
  const tryCf = async () => cfTransport(room, cid, cf);
  if (cf && prefer === 'cf') { try { return await tryCf(); } catch (e) { console.info('[即時] 房間伺服器連不上，改用 Ably', e && e.message); } const tx = await ablyTransport(room, cid); tx.kind = 'ably-backup'; return tx; }
  try { const tx = await ablyTransport(room, cid); tx.kind = 'ably'; return tx; }
  catch (e) { if (!cf) throw e; console.info('[即時] Ably 連不上，改用房間伺服器', e && e.message); const tx = await tryCf(); tx.kind = 'cf-backup'; return tx; }
}
function netStatus(msg, kind) { const el = $('room-status'); if (el) { el.textContent = msg; el.dataset.kind = kind || ''; } }
function roomCode() { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s2 = ''; for (let i = 0; i < 5; i++) s2 += a[Math.floor(Math.random() * a.length)]; return s2; }
function inviteLink(room) { const u = new URL(location.href); u.searchParams.delete('debug'); u.searchParams.delete('host'); u.searchParams.set('room', room); return u.toString(); }
async function netJoin(room) {
  room = String(room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 64);
  if (!room) { netStatus('請輸入房間代碼', 'warn'); return; }
  if (NET.on) netLeave(true);
  NET.me = NET.me || 'p' + Math.random().toString(36).slice(2, 9);
  const typed = VBSettings.values.nickname;
  NET.name = [...(typed || '球友' + NET.me.slice(-3))].slice(0, 12).join('');

  netStatus('連線中…', 'busy');
  let tx;
  try { tx = await rtTransport(room, NET.me); }
  catch (e) { netStatus(e.message === 'noserver' ? '多人連線暫時無法使用，請稍後再試或回大廳進入練習模式' : e.message === 'denied' ? '目前無法加入這個房間，請稍後再試' : '連不上即時連線服務，請稍後再試（公司或學校網路可能擋住）', 'warn'); return; }
  NET.tx = tx; NET.room = room; NET.on = true; NET.peers.clear();
  tx.subscribe(netOnMessage);
  tx.onPresence((action, id, d) => { if (id === NET.me) return; if (action === 'leave' || action === 'absent') netDropPeer(id); else netPeer(id, d); renderMpList(); });
  let others;
  try { others = (await tx.members()).filter((m) => m.id !== NET.me); } catch (e) { tx.close(); NET.on = false; NET.tx = null; netStatus('進不了房間，請稍後再試', 'warn'); return; }
  if (others.length >= NET_MAX) { tx.close(); NET.on = false; NET.tx = null; netStatus(`房間 ${room} 已經滿了（最多 ${NET_MAX} 人）`, 'warn'); return; }
  const used = new Set(others.map((m) => m.c)), color = NET_COLORS.find((c) => !used.has(c)) || NET_COLORS[0];
  NET.color = color;
  ROOM = createRoomSettings({ id: NET.me, creator: new URLSearchParams(location.search).get('host') === '1', count: roomDefaultCount(), courtOf: roomCourtOf, send: d => { if (NET.on && NET.tx) NET.tx.publish('room-settings', d); }, changed: roomRulesChanged });
  await tx.enter({ n: NET.name, c: color });
  for (const m of others) netPeer(m.id, m);
  netStatus(`已進入房間 ${room}（${others.length + 1}/${NET_MAX} 人）${tx.kind === 'cf' || tx.kind === 'ably' ? '' : '・備用線路（跟走主線路的人看不到彼此）'}`, 'ok');
  ROOM.start();
  $('room-title').textContent = '房間 ' + room;
  renderMpList();
  toast(`進入房間 ${room}：把邀請連結傳給朋友，最多 ${NET_MAX} 人一起打`);
}
function netLeave(quiet) {
  RoomChat.reset();
  for (const bubble of chatBubbles.values()) { clearTimeout(bubble.timer); scene.remove(bubble.label); bubble.label.element.remove(); }
  chatBubbles.clear();
  window.VBGameLobby?.leave();
  if (!NET.on) return;
  if (ROOM) { ROOM.close(); ROOM = null; }
  try { NET.tx.close(); } catch (e) { /* ignore */ }
  for (const id of [...NET.peers.keys()]) netDropPeer(id);
  NET.on = false; NET.tx = null; NET.ownBall = false;
  renderMpList();
  if (!quiet) netStatus('已離開房間', '');
}
function renderMpList() {
  const ul = $('room-list'); if (!ul) return;
  ul.innerHTML = NET.on ? [`<li><i style="background:${NET.color}"></i>${esc(NET.name)}（你）</li>`, ...[...NET.peers.values()].map((p2) => `<li><i style="background:${p2.c}"></i><span data-player="${esc(p2.n)}" title="按右鍵查看更多">${esc(p2.n)}</span></li>`)].join('') : '';
  $('room-count').textContent = `${NET.on ? NET.peers.size + 1 : 1} / 20 人 · 名單`;
  if (NET.on) netStatus(`房間 ${NET.room}：${NET.peers.size + 1}/${NET_MAX} 人${NET.tx && /backup/.test(NET.tx.kind || '') ? '・備用線路' : ''}`, 'ok');
}
// 對方的人形：身體顏色＝他的代表色，頭上有名字；手的姿勢跟著他（舉球舉高、墊球往前下）

// 所有玩家與 AI 統一使用內建人形；通用造型工具保留給後續外觀系統。
const myChar = () => (readLook() ? myLookCode() : normalizeLook(readLook()));   // 外觀＋裝備
// 卡通著色：三階明暗（亮、中、暗）；發光的部分不受光（會被泛光帶出光暈）
const TOON_RAMP = (() => { const t = new THREE.DataTexture(new Uint8Array([88, 165, 220, 255]), 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const toonCache = new Map();
function toon(c, kind) {   // kind：'glow' 發光、'ds' 兩面都畫（敞開的外套、帽子內側）
  const k = c + (kind || ''); if (toonCache.has(k)) return toonCache.get(k);
  const m = kind === 'glow' ? new THREE.MeshBasicMaterial({ color: c, toneMapped: false }) : new THREE.MeshToonMaterial({ color: c, gradientMap: TOON_RAMP, side: kind === 'ds' ? THREE.DoubleSide : THREE.FrontSide });
  toonCache.set(k, m); return m;
}
const chGeo = new Map(), cg = (k, f) => { let q = chGeo.get(k); if (!q) { q = f(); chGeo.set(k, q); } return q; };
const latheGeo = (pts, seg = 18, p0 = 0, pl = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg, p0, pl);
// 四肢：從關節往下長 len；上粗下細、中段微鼓（肌肉）、兩端圓
const limbGeo = (r0, r1, len, bulge = 0.08) => cg(`limb${r0}|${r1}|${len}|${bulge}`, () => latheGeo([[0, -len - r1 * 0.9], [r1 * 0.75, -len - r1 * 0.62], [r1, -len], [((r0 + r1) / 2) * (1 + bulge), -len * 0.45], [r0, -len * 0.08], [r0 * 0.8, r0 * 0.5], [0, r0 * 0.85]], 14));
// 軀幹剖面 [高度, 半徑]（腰窄、胸寬、肩膀收進脖子）；女生肩窄、腰細
const TORSO = {
  m: [[-0.085, 0], [-0.08, 0.11], [0, 0.126], [0.08, 0.13], [0.18, 0.143], [0.28, 0.166], [0.35, 0.176], [0.402, 0.155], [0.432, 0.09], [0.445, 0.05], [0.447, 0]],
  f: [[-0.085, 0], [-0.08, 0.112], [0, 0.118], [0.08, 0.112], [0.18, 0.128], [0.28, 0.15], [0.35, 0.158], [0.4, 0.14], [0.43, 0.085], [0.445, 0.045], [0.447, 0]],
};
const torsoR = (P, y) => { for (let i = 1; i < P.length; i++) if (y <= P[i][0]) { const [ya, ra] = P[i - 1], [yb, rb] = P[i], t = (y - ya) / (yb - ya || 1); return ra + (rb - ra) * t; } return 0; };
// 同一個身形放大 d 的一段（衣服、配色條）：y0～y1
const torsoBand = (P, y0, y1, d, n = 8, rMin = 0) => { const pts = []; for (let i = 0; i <= n; i++) { const y = y0 + ((y1 - y0) * i) / n; pts.push([Math.max(rMin, torsoR(P, Math.max(-0.07, y))) + d, y]); } return pts; };
// 同一個部位、同一個材質的小零件合併成一個（一個人約 40 次繪製，不然會上百次）
function chMerge(top) {
  const groups = []; top.traverse((o) => { if (!o.isMesh) groups.push(o); });
  for (const grp of groups) {
    const byM = new Map();
    for (const o of grp.children) if (o.isMesh) { o.updateMatrix(); if (!byM.has(o.material)) byM.set(o.material, []); byM.get(o.material).push(o); }
    for (const [m, list] of byM) {
      if (list.length < 2) continue;
      const geos = list.map((o) => { const q = (o.geometry.index ? o.geometry : o.geometry).clone(); for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') q.deleteAttribute(k); q.applyMatrix4(o.matrix); return q; });
      const mg = mergeGeometries(geos); geos.forEach((q) => q.dispose()); if (!mg) continue;
      for (const o of list) grp.remove(o);
      grp.add(new THREE.Mesh(mg, m));
    }
  }
  top.traverse((o) => { if (o.isMesh) o.castShadow = true; });
}
// 頭（hc＝頭骨中心）：橢球半徑
const HRX = 0.118, HRY = 0.13, HRZ = 0.122;
// 頭髮：頭頂、後腦兩片髮殼＋一束一束的髮絲（瀏海、側邊、後面）＋各髮型的馬尾、雙馬尾、包頭、捲髮、辮子、刺刺
const HAIR = {
  pony: { bangs: 7, bang: 0.06, side: 0.15, back: 0.09, n: 9, pony: 0.46, ponyEl: 0.95 },
  long: { bangs: 6, bang: 0.065, sweep: 0.15, side: 0.3, back: 0.4, n: 11 },
  twists: { cap: 1.2, curls: 46, curlR: 0.024, side: 0.02 },
  braids: { cap: 1.15, side: 0.06, back: 0.08, n: 7, braids: 5 },
  short: { cap: 1.12, bangs: 6, bang: 0.04, side: 0.035, back: 0.05, n: 9, top: 7 },
  spiky: { cap: 1.12, bangs: 5, bang: 0.07, sweep: 0.2, side: 0.05, back: 0.07, n: 9, spikes: 13, spike: 0.1 },
  slick: { cap: 1.0, back: 0.04, n: 9, slick: true },
  pigtails: { bangs: 7, bang: 0.06, side: 0.1, back: 0.08, n: 9, pig: 0.44 },
  messy: { cap: 1.12, bangs: 6, bang: 0.07, side: 0.06, back: 0.07, n: 9, spikes: 10, spike: 0.075 },
  wavy: { bangs: 4, bang: 0.07, sweep: -0.35, side: 0.2, back: 0.24, n: 11, wave: true },
  afro: { cap: 1.25, curls: 70, curlR: 0.03, puffs: true },
  bob: { bangs: 9, bang: 0.065, side: 0.15, back: 0.13, n: 11 },
  bun: { bangs: 6, bang: 0.055, side: 0.07, back: 0.06, n: 9, bun: true },
};
function makeChibi(C) {
  const g = new THREE.Group(), body = new THREE.Group(), root = new THREE.Group(); g.add(body); body.add(root);
  const fem = !!C.fem, P = fem ? TORSO.f : TORSO.m, T = toon, rnd = (() => { let x = 0; for (const ch of C.name) x = (x * 31 + ch.charCodeAt(0)) % 9973; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); })();
  const add = (geo, m, x = 0, y = 0, z = 0, parent = root, s) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (s) o.scale.set(s[0], s[1], s[2]); parent.add(o); return o; };
  const sph = (r, m, x, y, z, parent, s, ws = 14, hs = 10) => add(cg(`s${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs)), m, x, y, z, parent, s);
  const cyl = (r0, r1, h, m, x, y, z, parent, s, open) => add(cg(`c${r0}|${r1}|${h}|${!!open}`, () => new THREE.CylinderGeometry(r0, r1, h, 16, 1, !!open)), m, x, y, z, parent, s);
  const box = (w, h, d, m, x, y, z, parent) => add(cg(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z, parent);
  const tor = (R, r, m, x, y, z, parent, s, rx = Math.PI / 2) => { const o = add(cg(`t${R}|${r}`, () => new THREE.TorusGeometry(R, r, 8, 30)), m, x, y, z, parent, s); o.rotation.x = rx; return o; };
  const skin = T(C.skin), top = T(C.top[0]), ac = T(C.top[1]), J = C.jk;
  // ---- 腿：大腿、護膝、小腿、襪子、鞋（鞋面＋鞋底）；長褲就整條褲管、短褲是大腿上一截
  const pantsM = C.pants && !C.shorts ? T(C.pants) : null, shortsM = T(C.shorts || C.pants || '#2B2B2B'), legM = pantsM || skin;
  const shoeM = T(C.shoe[0]), soleM = T(C.shoe[1] || '#F2F2F0'), padM = T(C.pad || '#24262C');
  const legs = [], knees = [], feet = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.092, 0.98, 0); root.add(hip);
    add(limbGeo(pantsM ? 0.088 : 0.08, pantsM ? 0.068 : 0.06, 0.46), legM, 0, 0, 0, hip);
    if (!pantsM) cyl(0.09, 0.085, 0.2, shortsM, 0, -0.07, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
    add(limbGeo(pantsM ? 0.068 : 0.06, pantsM ? 0.052 : 0.043, 0.46, 0.14), legM, 0, 0, 0, knee);
    sph(0.07, padM, 0, -0.01, 0.024, knee, [1, 1.1, 0.72]);   // 護膝
    if (!pantsM && !C.boots) cyl(0.049, 0.046, 0.13, T('#F2F2F0'), 0, -0.39, 0, knee);   // 襪子
    const ank = new THREE.Group(); ank.position.y = -0.46; knee.add(ank);
    if (C.boots) cyl(0.062, 0.058, 0.2, shoeM, 0, 0.06, 0.004, ank);   // 靴筒
    sph(0.058, shoeM, 0, -0.02, 0.05, ank, [0.95, 0.72, 2.05]);   // 鞋面
    box(0.104, 0.026, 0.25, soleM, 0, -0.047, 0.046, ank);   // 鞋底
    legs.push(hip); knees.push(knee); feet.push(ank);
  }
  add(latheGeo([[0, 0.875], [0.12, 0.88], [0.152, 0.93], [0.152, 1.0], [0.132, 1.06], [0, 1.066]]), pantsM || shortsM, 0, 0, 0, root, [1, 1, 0.78]);   // 骨盆／褲頭
  if (C.belt) { tor(0.14, 0.014, T(C.belt), 0, 1.035, 0, root, [1, 0.78, 1]); box(0.05, 0.035, 0.012, T('#C9C2B0'), 0, 1.035, 0.112, root); }
  if (J && J.len === 'coat') {   // 長大衣下擺：從腰到膝蓋，前面敞開
    const cp = []; for (let i = 0; i <= 6; i++) cp.push([0.24 - (0.075 * i) / 6, 0.5 + (0.46 * i) / 6]);
    add(latheGeo(cp, 22, 0.62, Math.PI * 2 - 1.24), T(J.c, 'ds'), 0, 0, 0, root, [1, 1, 0.82]);
    for (const s of [-1, 1]) add(latheGeo(cp.map(([r, y]) => [r + 0.004, y]), 2, s > 0 ? 0.62 : Math.PI * 2 - 0.62 - 0.1, 0.1), T(J.c2 || J.c, 'ds'), 0, 0, 0, root, [1, 1, 0.82]);
  }
  // ---- 上身：有腰身的軀幹（前後扁）＋胸前配色＋外套
  const spine = new THREE.Group(); spine.position.y = 1.03; root.add(spine);
  const tz = [1, 1, 0.72];
  add(latheGeo(P.map(([y, r]) => [r, y]), 20), top, 0, 0, 0, spine, tz);
  add(latheGeo(torsoBand(P, 0.25, 0.285, 0.004, 3), 20, -1.1, 2.2), ac, 0, 0, 0, spine, tz);   // 胸前一條配色
  add(latheGeo(torsoBand(P, -0.02, 0.4, 0.005, 10), 3, -0.035, 0.07), ac, 0, 0, 0, spine, tz);   // 中線拉鍊
  if (C.collarTop) add(latheGeo([[0.068, 0.41], [0.07, 0.48], [0.074, 0.5]], 16), top, 0, 0, 0, spine);
  if (J) {
    const gap = J.open ? 0.4 : 0, yb = J.len === 'short' ? 0.12 : -0.17, jm = T(J.c, 'ds'), j2 = T(J.c2 || J.c, 'ds');
    const pts = torsoBand(P, yb, 0.43, 0.018, 14, 0).map(([r, y]) => [y < 0.02 ? Math.max(r, 0.172) : r, y]);
    add(latheGeo(pts, 22, gap, Math.PI * 2 - gap * 2), jm, 0, 0, 0, spine, tz);
    if (gap) for (const s of [-1, 1]) add(latheGeo(pts.map(([r, y]) => [r + 0.003, y]), 2, s > 0 ? gap : Math.PI * 2 - gap - 0.12, 0.12), j2, 0, 0, 0, spine, tz);   // 門襟滾邊
    else add(latheGeo(pts.map(([r, y]) => [r + 0.003, y]), 2, -0.03, 0.06), j2, 0, 0, 0, spine, tz);
    add(latheGeo(torsoBand(P, yb, yb + 0.03, 0.022, 2, 0).map(([r, y]) => [y < 0.02 ? Math.max(r, 0.176) : r, y]), 22, gap, Math.PI * 2 - gap * 2), j2, 0, 0, 0, spine, tz);   // 下擺收邊
    if (J.collar === 'high') add(latheGeo([[0.074, 0.405], [0.08, 0.47], [0.088, 0.515]], 18, gap ? 0.55 : 0, gap ? Math.PI * 2 - 1.1 : Math.PI * 2), j2, 0, 0, 0, spine);
    if (J.collar === 'fur') tor(0.105, 0.04, T(J.fur || '#E3E0D6'), 0, 0.42, -0.01, spine, [1, 0.78, 1]);
    if (J.collar === 'hood') sph(0.105, jm, 0, 0.405, -0.11, spine, [1.2, 0.62, 0.7]);
  }
  // ---- 手：肩頭、上臂（短袖露手臂／長袖）、前臂、手掌（掌心朝身體）＋拇指
  const slvM = J ? T(J.c) : C.sleeve ? T(C.sleeve) : C.metal ? skin : null, glM = C.gl ? T(C.gl) : skin, bio = C.bionic ? T(C.bionic) : null, ar = bio ? 1.3 : 1;
  const arms = [], elbows = [], hands = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * (fem ? 0.178 : 0.194), 0.392, 0); spine.add(sh);
    sph(0.054 * (bio ? 1.25 : 1), bio || slvM || top, 0, -0.012, 0, sh);
    const t = slvM ? 0.008 : 0;
    add(limbGeo(0.05 * ar + t, 0.041 * ar + t, 0.33, 0.12), bio || slvM || skin, 0, 0, 0, sh);
    if (!slvM && !bio) cyl(0.064, 0.06, 0.12, top, 0, -0.045, 0, sh);   // 短袖
    if (C.pads) sph(0.078, T(C.pads), 0, 0.035, 0, sh, [1, 0.6, 1.05]);
    const el = new THREE.Group(); el.position.y = -0.33; sh.add(el);
    add(limbGeo(0.042 * ar + t, 0.033 * ar + t * 1.2, 0.3, 0.14), bio || slvM || skin, 0, 0, 0, el);
    if (slvM && J && J.c2) cyl(0.047, 0.047, 0.03, T(J.c2), 0, -0.28, 0, el);   // 袖口
    if (C.wrist) tor(0.043 * ar, 0.011, T(C.wrist, 'glow'), 0, -0.24, 0, el);
    const hd = new THREE.Group(); hd.position.y = -0.3; el.add(hd);
    sph(0.05, glM, 0, -0.048, 0.004, hd, [0.48 * ar, 1.12, 0.9]);
    sph(0.017, glM, sx * -0.004, -0.028, 0.036, hd, [0.8, 1.7, 0.85]);
    arms.push(sh); elbows.push(el); hands.push(hd);
  }
  // ---- 頭：脖子、頭骨＋下巴臉頰、耳朵、鼻子；臉：眼白、虹膜、瞳孔、反光、上睫毛、眉毛、嘴
  cyl(0.046, 0.052, 0.12, C.metal ? T('#3A4048') : skin, 0, 0.47, 0, spine);
  const head = new THREE.Group(); head.position.y = 0.5; spine.add(head);
  const hc = new THREE.Group(); hc.position.set(0, 0.132, 0.006); hc.scale.setScalar(1.08); head.add(hc);   // 頭稍微大一點（遠遠看也認得出臉）
  if (!C.metal) {
    sph(1, skin, 0, 0, 0, hc, [HRX, HRY, HRZ], 26, 18);
    sph(1, skin, 0, -0.055, 0.022, hc, [0.092, 0.08, 0.098], 22, 14);
    for (const sx of [-1, 1]) sph(0.03, skin, sx * HRX * 0.96, -0.015, -0.006, hc, [0.42, 1, 0.75]);
    const ns = add(cg('nose', () => new THREE.ConeGeometry(0.012, 0.028, 8)), skin, 0, -0.033, 0.121, hc); ns.rotation.x = Math.PI / 2;
  }
  const dk = T('#1C1A1E'), browM = T(C.hair ? C.hair[1] : '#3A2C22');
  if (!C.faceless) {
    const iris = T(C.eyes, C.glow ? 'glow' : ''), wh = T('#FBFBF8'), hl = T('#FFFFFF', 'glow');
    for (const sx of [-1, 1]) {
      const ex = sx * 0.043, ey = -0.004, ez = 0.108;
      sph(1, wh, ex, ey, ez, hc, [0.026, 0.021, 0.012]);
      sph(1, iris, ex, ey - 0.001, ez + 0.007, hc, [0.0145, 0.0168, 0.008]);
      sph(1, dk, ex, ey - 0.001, ez + 0.0105, hc, [0.0068, 0.0085, 0.004]);
      sph(1, hl, ex + 0.0055, ey + 0.0065, ez + 0.0125, hc, [0.0036, 0.0036, 0.002]);
      const lid = box(0.054, fem ? 0.008 : 0.006, 0.01, dk, ex, ey + 0.0195, ez + 0.003, hc); lid.rotation.z = sx * -0.12;
      const br = box(0.044, 0.008, 0.008, browM, ex + sx * 0.002, ey + 0.043, ez + 0.003, hc); br.rotation.z = sx * (C.brow ?? -0.08);
    }
    box(0.03, 0.005, 0.006, T('#8E4B45'), 0, -0.078, 0.114, hc);
  }
  // ---- 頭髮
  if (C.hair) {
    const H = HAIR[C.hair[0]] || HAIR.short, hm = T(C.hair[1]), sm = C.hair[2] ? T(C.hair[2]) : hm, up = new THREE.Vector3(0, 1, 0);
    const S = (az, el, k = 1.04) => new THREE.Vector3(HRX * Math.sin(az) * Math.cos(el) * k, HRY * Math.sin(el) * k, HRZ * Math.cos(az) * Math.cos(el) * k);
    const lockGeo = (len, w) => cg(`L${len.toFixed(3)}|${w.toFixed(3)}`, () => { const q = new THREE.ConeGeometry(w, len, 7); q.rotateX(Math.PI); q.translate(0, -len / 2, 0); return q; });
    const lock = (p, dir, len, w, m = hm, flat = 0.55) => {   // 一束頭髮：從 p 往 dir 長，扁的那面貼著頭
      const o = add(lockGeo(len, w), m, p.x, p.y, p.z, hc), Y = dir.clone().normalize().negate(), n = p.clone().normalize(), Z = n.sub(Y.clone().multiplyScalar(n.dot(Y))); if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1); Z.normalize();
      o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(Y, Z), Y, Z)); o.scale.z = flat; return o;
    };
    const k = 1.055, capT = H.cap || 1.12;
    add(cg(`hcap${capT}`, () => new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, capT)), hm, 0, 0.004, -0.004, hc, [HRX * k, HRY * k, HRZ * k]);
    add(cg(`hback${H.back > 0.2 ? 2.3 : 1.85}`, () => new THREE.SphereGeometry(1, 28, 16, Math.PI - 0.62, Math.PI + 1.24, 0, H.back > 0.2 ? 2.3 : 1.85)), hm, 0, 0.004, -0.008, hc, [HRX * k, HRY * k, HRZ * k]);
    if (H.bangs) for (let i = 0; i < H.bangs; i++) {
      const u = i / (H.bangs - 1) - 0.5, az = u * 1.55 + (H.sweep || 0) * 0.25, p = S(az, 0.6, 1.05);
      lock(p, new THREE.Vector3(Math.sin(az) * 0.3 + (H.sweep || 0) * (0.6 + u), -1, 0.34), H.bang * (0.8 + rnd() * 0.45), 0.03, i === 1 && C.hair[2] ? sm : hm);
    }
    if (H.side) for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const az = sx * (1.2 + i * 0.25), p = S(az, 0.42, 1.05); lock(p, new THREE.Vector3(Math.sin(az) * 0.12, -1, 0.06 - i * 0.06), H.side * (0.85 + rnd() * 0.3) + 0.03, 0.036); }
    if (H.back) for (let i = 0; i < (H.n || 9); i++) { const az = 1.9 + (i / ((H.n || 9) - 1)) * (Math.PI * 2 - 3.8), p = S(az, 0.32, 1.05); lock(p, new THREE.Vector3(Math.sin(az) * (H.wave ? 0.3 : 0.14), -1, Math.cos(az) * (H.back > 0.2 ? 0.42 : 0.22)), H.back * (0.85 + rnd() * 0.3) + 0.04, 0.045, i === 2 && C.hair[2] ? sm : hm); }
    if (H.top) for (let i = 0; i < H.top; i++) { const az = (i / H.top) * Math.PI * 2, p = S(az, 1.15, 1.04); lock(p, p.clone().normalize().add(new THREE.Vector3(0, 0.3, 0.4)), 0.06, 0.035); }
    if (H.spikes) for (let i = 0; i < H.spikes; i++) { const az = (i / H.spikes) * Math.PI * 2 + rnd() * 0.3, el = 0.75 + rnd() * 0.6, p = S(az, el, 1.02); lock(p, p.clone().normalize().add(new THREE.Vector3(0, 0.6, -0.25)), H.spike * (0.8 + rnd() * 0.5), 0.04, i % 4 === 0 && C.hair[2] ? sm : hm, 0.7); }
    if (H.curls) for (let i = 0; i < H.curls; i++) {   // 捲髮／小辮子：一顆一顆貼在頭上（臉的前面不放）
      const az = rnd() * Math.PI * 2, el = 0.15 + rnd() * 1.35; if (Math.cos(az) > 0.55 && el < 0.85) continue;
      const p = S(az, el, 1.08 + (H.puffs ? 0.12 : 0)); sph(H.curlR, i % 7 === 0 && C.hair[2] ? sm : hm, p.x, p.y, p.z, hc);
    }
    if (H.puffs) for (const sx of [-1, 1]) { const p = S(sx * 1.1, 0.95, 1.35); sph(0.085, hm, p.x, p.y, p.z, hc); }
    if (H.pony) { const p = S(Math.PI, H.ponyEl, 1.04); sph(0.034, sm, p.x, p.y, p.z, hc); lock(p, new THREE.Vector3(0, -1, -0.45), H.pony, 0.05, hm, 0.75); }
    if (H.pig) for (const sx of [-1, 1]) { const p = S(sx * 2.15, 0.62, 1.06); sph(0.03, T('#59E0FF', 'glow'), p.x, p.y, p.z, hc); lock(p, new THREE.Vector3(sx * 0.35, -1, -0.15), H.pig, 0.05, hm, 0.8); }
    if (H.bun) { const p = S(Math.PI, 0.85, 1.22); sph(0.06, hm, p.x, p.y, p.z, hc); }
    if (H.braids) for (let i = 0; i < H.braids; i++) { const az = Math.PI + (i - (H.braids - 1) / 2) * 0.32, p = S(az, 0.2, 1.05); for (let j = 0; j < 6; j++) sph(0.019, hm, p.x + Math.sin(az) * 0.01 * j, p.y - 0.045 * j, p.z - 0.012 * j, hc); sph(0.012, T('#E8C35A'), p.x, p.y - 0.28, p.z - 0.07, hc); }
    void up;
  }
  // ---- 配件
  for (const [kind, col] of C.acc || []) {
    const am = T(col), gm = T(col, 'glow');
    if (kind === 'beanie') { add(cg('beanie', () => new THREE.SphereGeometry(1, 26, 14, 0, Math.PI * 2, 0, 1.4)), am, 0, 0.02, -0.006, hc, [HRX * 1.16, HRY * 1.14, HRZ * 1.16]); tor(HRX * 1.13, 0.024, am, 0, 0.045, -0.004, hc, [1, HRZ / HRX, 1]); }
    if (kind === 'cap') { add(cg('capdome', () => new THREE.SphereGeometry(1, 26, 14, 0, Math.PI * 2, 0, 1.45)), am, 0, 0.012, -0.004, hc, [HRX * 1.14, HRY * 1.1, HRZ * 1.14]); const b = add(cg('capbrim', () => new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20, 1, false, -Math.PI / 2, Math.PI)), am, 0, 0.05, 0.08, hc, [1, 1, 0.9]); b.rotation.x = 0.12; }
    if (kind === 'goggles') { tor(HRX * 1.12, 0.013, T('#2B2B2B'), 0, 0.075, -0.004, hc, [1, HRZ / HRX, 1]); for (const sx of [-1, 1]) sph(0.034, T('#FFB25A', 'glow'), sx * 0.047, 0.088, HRZ * 1.02, hc, [1, 0.8, 0.5]); }
    if (kind === 'glassesRound') { for (const sx of [-1, 1]) tor(0.024, 0.0045, am, sx * 0.043, -0.004, 0.124, hc, undefined, 0); box(0.035, 0.005, 0.005, am, 0, 0.004, 0.126, hc); }
    if (kind === 'glassesRect') for (const sx of [-1, 1]) { box(0.05, 0.03, 0.004, new THREE.MeshBasicMaterial({ color: '#B9D6FF', transparent: true, opacity: 0.35 }), sx * 0.043, -0.004, 0.124, hc); box(0.052, 0.006, 0.006, am, sx * 0.043, 0.012, 0.125, hc); }
    if (kind === 'headband') tor(HRX * 1.08, 0.014, am, 0, 0.07, -0.004, hc, [1, HRZ / HRX, 1], Math.PI / 2 - 0.15);
    if (kind === 'gasMask') { sph(1, am, 0, -0.05, 0.05, hc, [0.098, 0.065, 0.085]); for (const sx of [-1, 1]) { const c2 = cyl(0.026, 0.026, 0.045, T('#1E2A20'), sx * 0.06, -0.07, 0.1, hc); c2.rotation.z = sx * 1.1; } sph(0.012, T('#4CC66A', 'glow'), 0, -0.06, 0.134, hc); }
    if (kind === 'faceMask') { sph(1, am, 0, -0.012, 0.035, hc, [0.112, 0.125, 0.098]); sph(0.011, T(C.eyes, 'glow'), 0, 0.012, 0.133, hc); box(0.09, 0.006, 0.006, T('#BFB9AC'), 0, -0.055, 0.128, hc); }
    if (kind === 'hat') { cyl(0.22, 0.22, 0.014, am, 0, 0.085, 0, hc); cyl(0.12, 0.128, 0.11, am, 0, 0.15, 0, hc); cyl(0.13, 0.13, 0.02, T('#7A6A5A'), 0, 0.1, 0, hc); }
    if (kind === 'beret') { const o = cyl(HRX * 1.18, HRX * 1.08, 0.06, am, 0.03, 0.115, -0.01, hc); o.rotation.z = -0.28; tor(HRX * 1.05, 0.012, T('#2B2B2B'), 0, 0.075, -0.004, hc, [1, HRZ / HRX, 1]); }
    if (kind === 'beard') { add(cg('beard', () => new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5)), am, 0, -0.035, 0.03, hc, [0.098, 0.1, 0.1]); box(0.075, 0.016, 0.02, am, 0, -0.058, 0.118, hc); }
    if (kind === 'beardShort') { add(cg('beard', () => new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5)), am, 0, -0.045, 0.026, hc, [0.094, 0.072, 0.1]); }
    if (kind === 'goatee') { box(0.03, 0.035, 0.016, am, 0, -0.1, 0.105, hc); box(0.05, 0.008, 0.01, am, 0, -0.063, 0.118, hc); }
    if (kind === 'robotHead') {
      const mm = T('#9AA4AE'), md = T('#3A4048');
      add(cg('rbox', () => new THREE.BoxGeometry(0.22, 0.22, 0.22, 2, 2, 2)), mm, 0, 0.01, 0, hc);
      box(0.24, 0.07, 0.03, md, 0, 0.0, 0.11, hc); box(0.19, 0.035, 0.012, gm, 0, 0.0, 0.127, hc);   // 面罩＋發光的眼
      cyl(0.012, 0.012, 0.08, md, 0.07, 0.15, -0.02, hc); sph(0.016, gm, 0.07, 0.19, -0.02, hc);
      box(0.24, 0.03, 0.2, md, 0, 0.12, 0, hc);
    }
    if (kind === 'hoodUp') { add(cg('hoodUp', () => new THREE.SphereGeometry(1, 26, 18, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, 2.25)), T(col, 'ds'), 0, 0.012, -0.012, hc, [0.165, 0.175, 0.17]); add(cg('hoodTip', () => new THREE.ConeGeometry(0.12, 0.2, 14)), am, 0, 0.13, -0.09, hc).rotation.x = -0.75; }
    if (kind === 'bionicEye') { tor(0.022, 0.006, T('#2B2B2B'), -0.043, -0.004, 0.122, hc, undefined, 0); sph(0.012, gm, -0.043, -0.004, 0.124, hc); }
    if (kind === 'earrings') for (const sx of [-1, 1]) sph(0.011, am, sx * HRX * 0.98, -0.055, 0.0, hc);
    if (kind === 'butterfly') for (const sx of [-1, 1]) { const o = sph(0.03, gm, 0.075 + sx * 0.022, 0.1, 0.06, hc, [1, 0.7, 0.25]); o.rotation.z = sx * 0.5; }
    if (kind === 'orb') sph(0.032, gm, 0, 0.33, 0.13, spine);
    if (kind === 'bolt') for (const sx of [-1, 1]) { const o = box(0.016, 0.24, 0.016, gm, sx * 0.13, 0.17, 0.085, spine); o.rotation.z = sx * 0.35; }
  }
  chMerge(g);
  return { g, body, root, spine, head, hc, arms, elbows, hands, legs, knees, feet, phase: 0, rig: true, L1: 0.46, L2: 0.52, hipH: 0.98, chibi: true };
}
const tjOk = (j) => (j && typeof j === 'object' && /^#[0-9a-fA-F]{6}$/.test(j.body || '') ? { name: String(j.name || '').slice(0, 12), body: j.body, trim: j.trim, num: j.num } : null);
function makeAvatar(color, ch, team = -1, tj = null) {   // tj＝球隊球衣（比賽以外才穿）
  const av = tj && team < 0 ? makeToyAvatar(decodeLook(ch), tj) : makeToyAvatar(decodeLook(ch), teamKit(team));
  av.g.scale.setScalar(AV_SCALE);   // 遊戲裡整個人放大一點（維持 Q 版比例；捏臉畫面不放大）
  av.gameKit = teamKit(team);
  return av;
}
function refreshPeerAppearance(p2) {
  const kit = teamKit(VM.on ? vmTeamOf(p2.id) : -1);
  const tj = VM.on ? null : tjOk(p2.tj), tjKey = tj ? JSON.stringify(tj) : '';   // WEB-010 球隊球衣
  if (p2.av.gameKit === kit && p2.avCode === p2.ch && (p2.avTj || '') === tjKey) return;
  const old = p2.av, av = makeAvatar(p2.c, p2.ch, VM.on ? vmTeamOf(p2.id) : -1, tj); p2.avTj = tjKey;
  av.g.position.copy(old.g.position); av.g.rotation.copy(old.g.rotation);
  av.body.position.copy(old.body.position); av.phase = old.phase;
  av.g.add(p2.tag);
  if (p2.racket) av.hands[0].add(p2.racket);
  scene.remove(old.g); scene.add(av.g); p2.av = av; p2.avCode = p2.ch;
}
// ---- 全身姿勢（弧度）：sh＝肩膀 [往前抬（負）, 往外張]、el＝手肘彎、hip＝大腿往前抬、kn＝膝蓋彎、sp＝上身前傾（負＝後仰）、tw＝上身轉、arm＝跑步時手要不要擺
// 參考排球動作：接球低重心、前臂伸直併攏成平台；舉球雙手在額頭前、手肘彎成窗戶再一起推出去；扣球起跳拉弓（右手肘高、左手指球）、揮臂、收在身體另一側；攔網雙手伸直往網子上方壓
const AVP = {
  idle: { sh: [[-0.08, 0.1], [-0.08, 0.1]], el: [0.3, 0.3], hip: [0.02, 0.02], kn: [0.06, 0.06], sp: 0.04, tw: 0 },
  ready: { sh: [[-0.62, 0.22], [-0.62, 0.22]], el: [0.95, 0.95], hip: [0.85, 0.85], kn: [1.3, 1.3], hab: [0.2, 0.2], sp: 0.58, tw: 0, arm: 0.15, gait: 0.6 },
  crouch: { sh: [[-0.75, 0.2], [-0.75, 0.2]], el: [0.7, 0.7], hip: [1.25, 1.25], kn: [1.95, 1.95], hab: [0.28, 0.28], sp: 0.72, tw: 0, arm: 0.1, gait: 0.45 },   // 按住 Ctrl 蹲低：膝蓋彎更多、重心更低   // 接球準備：腳比肩寬、膝蓋彎、重心往前、雙手在腰前
  bump: { sh: [[-0.98, -0.14], [-0.98, -0.14]], el: [0.02, 0.02], hip: [0.92, 0.92], kn: [1.42, 1.42], hab: [0.2, 0.2], sp: 0.55, tw: 0, arm: 0, gait: 0.5 },   // 墊球：手臂打直併攏成平台、壓低
  bumpStand: { sh: [[-0.98, -0.14], [-0.98, -0.14]], el: [0.02, 0.02], hip: [0.38, 0.38], kn: [0.52, 0.52], hab: [0.18, 0.18], sp: 0.32, tw: 0, arm: 0, gait: 0.5 },   // 站著墊球（沒按 Ctrl）：膝蓋微彎，重心比蹲接高
  bumpHit: { sh: [[-1.12, -0.14], [-1.12, -0.14]], el: [0, 0], hip: [0.55, 0.55], kn: [0.8, 0.8], hab: [0.16, 0.16], sp: 0.36, tw: 0, arm: 0, gait: 0.4 },   // 墊到球：腿往上送、平台抬到胸前（手不甩）
  setReady: { sh: [[-2.55, 0.45], [-2.55, 0.45]], el: [1.75, 1.75], hip: [0.38, 0.3], kn: [0.68, 0.55], hab: [0.08, 0.08], sp: -0.04, tw: 0, arm: 0, gait: 0.6 },   // 舉球準備：雙手在額頭前上方（手肘張開成窗戶）
  setPush: { sh: [[-2.98, 0.16], [-2.98, 0.16]], el: [0.18, 0.18], hip: [0.1, 0.06], kn: [0.14, 0.1], hab: [0.06, 0.06], sp: -0.14, tw: 0, arm: 0, gait: 0.4 },   // 舉出去：腿、手一起伸直往上推
  setBack: { sh: [[-3.2, 0.12], [-3.2, 0.12]], el: [0.12, 0.12], hip: [-0.05, -0.05], kn: [0.12, 0.12], sp: -0.48, tw: 0, arm: 0, gait: 0.4 },   // 背舉：上身往後仰
  hold: { sh: [[-0.85, -0.1], [-0.85, -0.1]], el: [1.0, 1.0], hip: [0.03, 0.03], kn: [0.08, 0.08], sp: 0.04, tw: 0, arm: 0 },
  approach: { sh: [[0.95, 0.18], [0.95, 0.18]], el: [0.12, 0.12], hip: [0.8, 0.45], kn: [1.3, 0.95], hab: [0.1, 0.1], sp: 0.62, tw: 0, arm: 0, gait: 0.8 },   // 助跑最後一步：雙手甩到後面、蹲低
  takeoff: { sh: [[-2.75, 0.22], [-2.75, 0.22]], el: [0.35, 0.35], hip: [0.12, 0.08], kn: [0.22, 0.18], sp: 0.02, tw: 0, arm: 0, gait: 0, shy: [0.07, 0.07] },   // 起跳：雙手從後面往上甩（帶著身體往上）、腿蹬直
  airUp: { sh: [[-2.6, 0.75], [-2.75, 0.12]], el: [2.15, 0.22], hip: [-0.18, 0.12], kn: [1.3, 0.95], sp: -0.42, tw: 0.45, arm: 0, gait: 0 },   // 空中拉弓：身體往後彎成弓、右手肘拉高到耳後、左手指球、小腿往後收
  spikeHit: { sh: [[-3.0, 0.1], [-0.85, 0.3]], el: [0.05, 1.3], hip: [0.5, 0.32], kn: [0.8, 0.6], sp: 0.34, tw: -0.28, arm: 0, gait: 0, shy: [0.1, 0] },   // 擊球：收腹把弓放掉，右手在最高點往前下壓、左手收到腰
  spikeFollow: { sh: [[-0.4, -0.38], [-0.3, 0.28]], el: [0.4, 1.1], hip: [0.7, 0.5], kn: [1.0, 0.8], sp: 0.55, tw: -0.42, arm: 0, gait: 0.3 },   // 收手：手揮到身體另一側
  serveToss: { sh: [[-2.4, 0.6], [-2.9, 0.1]], el: [1.9, 0.1], hip: [0.05, 0.25], kn: [0.12, 0.3], sp: -0.12, tw: 0.35, arm: 0 },
  blockReady: { sh: [[-2.15, 0.28], [-2.15, 0.28]], el: [1.7, 1.7], hip: [0.35, 0.35], kn: [0.7, 0.7], sp: 0.08, tw: 0, arm: 0 },
  block: { sh: [[-2.78, 0.08], [-2.78, 0.08]], el: [0.05, 0.05], hip: [0.12, 0.12], kn: [0.3, 0.3], sp: 0.08, tw: 0, arm: 0, gait: 0, shy: [0.08, 0.08] },   // 攔網：雙手伸直往網子對面上方壓
  land: { sh: [[-0.55, 0.35], [-0.55, 0.35]], el: [0.75, 0.75], hip: [0.9, 0.9], kn: [1.5, 1.5], hab: [0.16, 0.16], sp: 0.45, tw: 0, arm: 0, gait: 0.5 },   // 落地：雙腳張開彎膝緩衝
  dive: { sh: [[-3.05, 0.22], [-3.05, 0.22]], el: [0.05, 0.05], hip: [-0.12, 0.05], kn: [0.25, 0.75], sp: -0.2, tw: 0, arm: 0, gait: 0 },   // 往前撲（魚躍）：雙手往前伸、抬頭挺胸、腳往後伸
  sideDive: { sh: [[-3.0, 0.35], [-1.1, -0.25]], el: [0.05, 1.5], hip: [0.3, 0.8], kn: [0.45, 1.25], hab: [0.05, 0.2], sp: 0.12, tw: 0.25, arm: 0, gait: 0 },   // 往右邊撲（側倒）：右手往球的方向伸長、左手收在胸前、腿彎著側躺；往左撲＝左右對調
  down: { sh: [[-1.55, 0.55], [-1.55, 0.55]], el: [1.45, 1.45], hip: [0.05, 0.15], kn: [0.25, 0.55], sp: 0, tw: 0, arm: 0, gait: 0 },   // 撲完趴在地上：雙手撐地準備起來
  downSide: { sh: [[-2.3, 0.55], [-1.25, 0.65]], el: [0.5, 1.25], hip: [0.65, 0.95], kn: [1.05, 1.45], hab: [0.05, 0.15], sp: 0.25, tw: 0.2, arm: 0, gait: 0 },   // 側倒在地上：手撐著、腿收起來準備翻身站起
  // 魚躍（參考實際動作）：飛出去身體接近水平、雙手往前伸、抬頭挺胸、腿往後伸直 → 手先撐地、手肘彎緩衝、小腿開始往上翹 → 胸口貼地往前滑、小腿翹高（蠍子）
  diveFly: { sh: [[-3.05, 0.15], [-3.05, 0.15]], el: [0.05, 0.05], hip: [-0.18, -0.08], kn: [0.12, 0.3], hab: [0.04, 0.04], sp: -0.32, tw: 0, arm: 0, gait: 0 },
  diveCatch: { sh: [[-2.15, 0.45], [-2.15, 0.45]], el: [0.75, 0.75], hip: [-0.12, -0.12], kn: [0.95, 1.15], hab: [0.06, 0.06], sp: -0.5, tw: 0, arm: 0, gait: 0 },
  diveSlide: { sh: [[-2.65, 0.45], [-2.0, 0.6]], el: [0.35, 0.95], hip: [-0.06, 0.08], kn: [1.75, 1.95], hab: [0.08, 0.1], sp: -0.58, tw: 0, arm: 0, gait: 0 },
  // 側接（往右；往左＝鏡像）：右腳往旁邊大跨一步蹲很低、左腳往旁邊伸直，上身往球那邊壓低、雙手併攏往下伸 → 坐到右邊屁股上、右手往球伸長 → 往後滾成仰躺、腳翹起來
  sideLunge: { sh: [[-1.05, -0.1], [-1.05, -0.32]], el: [0.02, 0.02], hip: [1.05, 0.15], kn: [1.85, 0.05], hab: [0.75, 0.65], sp: 0.72, tw: -0.85, arm: 0, gait: 0 },
  sideFall: { sh: [[-3.0, 0.35], [-0.9, 0.65]], el: [0.05, 1.2], hip: [1.05, 0.65], kn: [1.45, 1.05], hab: [0.3, 0.3], sp: 0.22, tw: 0.3, arm: 0, gait: 0 },
  sideRoll: { sh: [[-2.4, 0.95], [-1.6, 0.95]], el: [0.3, 0.6], hip: [1.75, 1.55], kn: [1.0, 1.35], hab: [0.1, 0.25], sp: -0.1, tw: 0.1, arm: 0, gait: 0 },
  // 照影片補的：魚躍起步的低弓箭步（右腳在前蹲很低、左腳往後伸直、右手往球伸低）；滾翻的側躺（球那側的手沿著地板往頭上伸）、腳翻過肩膀時縮成一團、最後跪著雙手撐地
  diveLunge: { sh: [[-1.45, 0.08], [-0.85, 0.22]], el: [0.05, 0.35], hip: [1.25, -0.25], kn: [1.75, 0.18], hab: [0.06, 0.06], sp: 0.55, tw: 0, arm: 0, gait: 0 },
  sideFlat: { sh: [[-3.05, 0.25], [-0.55, 0.55]], el: [0.05, 0.5], hip: [0.35, 0.2], kn: [0.35, 0.45], hab: [0.1, 0.15], sp: 0.1, tw: 0.2, arm: 0, gait: 0 },
  sideTuck: { sh: [[-2.1, 0.55], [-1.7, 0.75]], el: [1.0, 1.2], hip: [2.0, 2.0], kn: [2.1, 2.1], hab: [0.12, 0.12], sp: 0.55, tw: 0, arm: 0, gait: 0 },
  kneel: { sh: [[-1.25, 0.22], [-1.25, 0.22]], el: [0.15, 0.15], hip: [1.45, 1.45], kn: [2.3, 2.3], hab: [0.14, 0.14], sp: 0.45, tw: 0, arm: 0, gait: 0 },
  // 互動：擊掌（舉手等、拍下去）、嘲諷（挺胸、雙手掌心朝上比「來啊」）
  hi5Up: { sh: [[-2.95, 0.3], [-2.95, 0.3]], el: [0.15, 0.15], hip: [0.05, 0.05], kn: [0.1, 0.1], sp: -0.06, tw: 0, arm: 0, gait: 0.6 },   // 雙手舉高等隊友
  hi5Two: { sh: [[-2.9, 0.2], [-2.9, 0.2]], el: [0.75, 0.75], hip: [0.08, 0.08], kn: [0.18, 0.18], sp: 0.0, tw: 0, arm: 0, gait: 0.6 },   // 雙手舉到面前上方、靠過去
  hi5Hit: { sh: [[-2.62, 0.12], [-2.62, 0.12]], el: [0.15, 0.15], hip: [0.14, 0.14], kn: [0.26, 0.26], sp: 0.16, tw: 0, arm: 0, gait: 0.6 },   // 雙手往前推、身體往前靠：掌心拍在一起
  taunt: { sh: [[-1.25, 0.55], [-1.25, 0.55]], el: [1.3, 1.3], hip: [0.1, 0.1], kn: [0.25, 0.25], hab: [0.12, 0.12], sp: -0.22, tw: 0, arm: 0, gait: 0.5 },
  // 球拍：準備（拍頭在前上方）、上手（拉拍→擊球→收拍）、側身抽球
  rkReady: { sh: [[-1.2, 0.6], [-0.8, 0.25]], el: [1.5, 0.9], hip: [0.55, 0.55], kn: [0.95, 0.95], sp: 0.35, tw: 0, arm: 0 },
  rkOverCock: { sh: [[-2.6, 0.75], [-2.7, 0.1]], el: [2.1, 0.2], hip: [0.2, 0.4], kn: [0.3, 0.6], sp: -0.25, tw: 0.5, arm: 0 },
  rkOverHit: { sh: [[-3.05, 0.1], [-1.2, 0.2]], el: [0.05, 1.0], hip: [0.2, 0.3], kn: [0.3, 0.5], sp: 0.05, tw: -0.1, arm: 0 },
  rkOverFollow: { sh: [[-0.7, -0.5], [-0.5, 0.2]], el: [0.4, 1.1], hip: [0.4, 0.3], kn: [0.6, 0.5], sp: 0.4, tw: -0.5, arm: 0 },
  rkSideBack: { sh: [[-1.2, 1.3], [-0.9, 0.2]], el: [0.9, 0.8], hip: [0.6, 0.4], kn: [1.0, 0.7], sp: 0.3, tw: 0.7, arm: 0 },
  rkSideFollow: { sh: [[-1.5, -0.6], [-0.6, 0.3]], el: [0.6, 0.9], hip: [0.5, 0.5], kn: [0.9, 0.9], sp: 0.3, tw: -0.6, arm: 0 },
};
function avMix(a, b, t) {
  t = clamp(t, 0, 1); const L = (x, y) => x + (y - x) * t, ha = a.hab || [0, 0], hb = b.hab || [0, 0];
  return { sh: [0, 1].map((i) => [L(a.sh[i][0], b.sh[i][0]), L(a.sh[i][1], b.sh[i][1])]), el: [0, 1].map((i) => L(a.el[i], b.el[i])), hip: [0, 1].map((i) => L(a.hip[i], b.hip[i])), kn: [0, 1].map((i) => L(a.kn[i], b.kn[i])), hab: [0, 1].map((i) => L(ha[i], hb[i])), ankle: [0, 1].map(i => L(a.ankle?.[i] || 0, b.ankle?.[i] || 0)), head: [0, 1].map(i => L(a.head?.[i] || 0, b.head?.[i] || 0)), lean: L(a.lean || 0, b.lean || 0), sp: L(a.sp, b.sp), tw: L(a.tw || 0, b.tw || 0), arm: L(a.arm ?? 1, b.arm ?? 1), gait: L(a.gait ?? 1, b.gait ?? 1), shy: [0, 1].map((i) => L((a.shy || [0, 0])[i], (b.shy || [0, 0])[i])) };
}
// 左右對調的姿勢（往左撲＝往右撲的鏡像）
const AVP_MIR = new Map();
function avMirror(P) { if (AVP_MIR.has(P)) return AVP_MIR.get(P); const sw = (a) => (a ? [a[1], a[0]] : a), M = { ...P, sh: sw(P.sh), el: sw(P.el), hip: sw(P.hip), kn: sw(P.kn), hab: sw(P.hab), tw: -(P.tw || 0) }; AVP_MIR.set(P, M); return M; }
// 撲救的姿勢：dir＝撲出去的方向（自己身體的角度：0＝正前方、−π/2＝右手邊、π/2＝左手邊）；down＝已經倒在地上
const DIVE_D = [0, -Math.PI / 2, Math.PI / 2];
// 撲救動作的關鍵格（照實際影片）：[秒, 髖往撲的方向移多少, 髖多高, 往前倒（弧度）, 往撲的那側倒（弧度）, 姿勢]；中間平滑接
//   魚躍：低弓箭步往前倒 → 貼地平飛、腳往後上翹 → 手撐地（頭比腳低、腳翹高）→ 胸口滑出去 → 趴著準備撐起來
//   左右滾翻：側弓箭步、雙手往球那側伸到地上 → 坐到球那側屁股上、手伸長 → 側躺 → 腳從肩膀上方翻過去（整個人往球那側翻一圈）→ 跪著雙手撐地 → 站起來
const DIVE_KF = {
  fwd: [[0, 0, 0.98, 0, 0, 'idle'], [0.15, 0.1, 0.6, 0.75, 0, 'diveLunge'], [0.3, -0.55, 0.42, 1.45, 0, 'diveFly'], [0.45, -0.8, 0.28, 1.8, 0, 'diveCatch'], [0.7, -0.9, 0.04, 1.62, 0, 'diveSlide'], [1.0, -0.95, 0.04, 1.56, 0, 'down']],
  side: [[0, 0, 0.98, 0, 0, 'idle'], [0.22, 0.12, 0.55, 0.35, 0.35, 'sideLunge'], [0.42, 0.2, 0.1, 0.15, 1.15, 'sideFall'], [0.6, 0.25, 0.04, -0.15, 1.55, 'sideFlat'], [0.8, 0.35, 0.3, 0.0, 3.0, 'sideTuck'], [0.98, 0.45, 0.25, 0.2, 4.6, 'sideTuck'], [1.15, 0.55, 0.3, 0.4, Math.PI * 2, 'kneel']],
  // 髖的高度故意放低一點：貼地的時候由「不陷進地板」把人剛好抬到貼著地板
};
function avDiveKey(dir, t) {
  const sn = Math.sin(dir), side = Math.abs(sn) > 0.6, K = side ? DIVE_KF.side : DIVE_KF.fwd, M = (p) => (side && sn > 0 ? avMirror(AVP[p]) : AVP[p]);
  let i = 0; while (i < K.length - 2 && t >= K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1], u0 = clamp((t - a[0]) / (b[0] - a[0]), 0, 1), u = u0 * u0 * (3 - 2 * u0), L = (j) => a[j] + (b[j] - a[j]) * u;
  return { side, sn, d: L(1), y: L(2), pitch: L(3), roll: L(4), pose: u >= 1 ? M(b[5]) : avMix(M(a[5]), M(b[5]), u) };
}
function avDivePose(dir, down) { const sn = Math.sin(dir), side = Math.abs(sn) > 0.6, P = down ? (side ? AVP.downSide : AVP.down) : side ? AVP.sideDive : AVP.dive; return side && sn > 0 ? avMirror(P) : P; }
// 攔網的姿勢加上雙手往左右移（s＞0＝往人物的右手邊；右手往外張、左手往內收）
function avBlockPose(s) { if (!s) return AVP.block; const k = s * 1.1; return { ...AVP.block, sh: [[-2.78, 0.08 + k], [-2.78, 0.08 - k]], tw: -k * 0.3 }; }
// 套用姿勢：姿勢本身（接球、舉球…）每個關節平滑靠過去；走路／跑步的步伐另外疊上去（不會被平滑吃掉，步伐才有力）
//   步伐：照速度在走路和跑步之間漸變——擺腿幅度、膝蓋在擺盪期收起來、支撐腳微彎緩衝、腳掌貼地／後腳蹬地踮腳尖
//   手跟對側的腳一起擺（跑步手肘彎 90 度）；骨盆和肩膀反向扭轉；加速時整個人前傾、轉彎時往內倒；站著時呼吸、重心左右微移
const DIVE_HV = new THREE.Vector3(), GP_V = new THREE.Vector3();
// 檢查會不會碰到地板的點：鞋底四角、膝蓋（護膝前後）、手、手肘、肩、頭（前後左右和頂）、胸口、屁股
function avGroundPts(av) {
  const P = [];
  if (av.feet) for (const f of av.feet) for (const x of [-0.052, 0.052]) for (const z of [-0.08, 0.17]) P.push([f, x, -0.062, z]);
  else for (const k of av.knees) P.push([k, 0, -0.5, 0.05]);
  for (const k of av.knees) P.push([k, 0, 0, 0.075], [k, 0, 0, -0.05]);
  for (const h of av.hands) P.push([h, 0, -0.03, 0], [h, 0, -0.12, 0], [h, 0.045, -0.08, 0], [h, -0.045, -0.08, 0], [h, 0, -0.08, 0.035], [h, 0, -0.08, -0.035]);   // 手掌、手指
  for (const e of av.elbows) P.push([e, 0, 0, 0], [e, 0.05, 0, 0], [e, -0.05, 0, 0], [e, 0, 0, 0.05], [e, 0, 0, -0.05], [e, 0, -0.15, 0.04], [e, 0, -0.15, -0.04], [e, 0.04, -0.15, 0], [e, -0.04, -0.15, 0]);   // 手肘、前臂
  for (const a of av.arms) P.push([a, 0, 0, 0]);
  const hr = av.chibi ? 0.17 : 0.12; for (const [x, y, z] of [[0, 0.13, hr], [0, 0.13, -hr], [hr, 0.13, 0], [-hr, 0.13, 0], [0, 0.13 + hr, 0]]) P.push([av.head, x, y, z]);
  for (const [x, y, z] of [[0, 0.3, 0.15], [0, 0.3, -0.15], [0.18, 0.35, 0], [-0.18, 0.35, 0]]) P.push([av.spine, x, y, z]);
  for (const [x, y, z] of [[0, 0.9, 0.13], [0, 0.9, -0.13], [0.15, 0.95, 0], [-0.15, 0.95, 0]]) P.push([av.root, x, y, z]);
  return P;
}
function avDrive(av, P, k, sp = 0, air = false) {
  if (!av.rig) return;
  const now = performance.now(), dt = Math.min(0.1, Math.max(0.001, (now - (av._t || now - 16)) / 1000)); av._t = now;
  // 撲救（av.fall＝{a 0～1, d 方向, t 撲出去幾秒}）：姿勢照時間換（avDiveAnim）；沒給 t 就自己計時
  const F = av.fall, fT = F ? clamp(F.a, 0, 1) : 0;
  if (F && !av._fOn) av._ft = 0; av._fOn = !!F;
  av._fa = (av._fa || 0) + (fT - (av._fa || 0)) * (1 - Math.exp(-dt * (fT > (av._fa || 0) ? 9 : 3.2)));
  if (F) { av._fd = F.d; av._ft = F.t != null ? F.t : (av._ft || 0) + dt; }
  const fa = av._fa, fd = av._fd || 0, ft = av._ft || 0;
  const DK = fa > 0.01 ? avDiveKey(fd, ft) : null;
  if (DK) { P = fa > 0.995 ? DK.pose : avMix(P, DK.pose, fa); k = Math.max(k, 0.35); }
  const B = av._b || (av._b = { sh: [[P.sh[0][0], P.sh[0][1]], [P.sh[1][0], P.sh[1][1]]], el: [...P.el], hip: [...P.hip], kn: [...P.kn], hab: [...(P.hab || [0, 0])], shy: [...(P.shy || [0, 0])], sp: P.sp, tw: P.tw || 0, arm: P.arm ?? 1, gait: P.gait ?? 1 });
  const L = (a, b) => a + (b - a) * k;
  for (let i = 0; i < 2; i++) { B.sh[i][0] = L(B.sh[i][0], P.sh[i][0]); B.sh[i][1] = L(B.sh[i][1], P.sh[i][1]); B.el[i] = L(B.el[i], P.el[i]); B.hip[i] = L(B.hip[i], P.hip[i]); B.kn[i] = L(B.kn[i], P.kn[i]); B.hab[i] = L(B.hab[i], (P.hab || [0, 0])[i]); B.shy[i] = L(B.shy[i], (P.shy || [0, 0])[i]); }
  B.sp = L(B.sp, P.sp); B.tw = L(B.tw, P.tw || 0); B.arm = L(B.arm, P.arm ?? 1); B.gait = L(B.gait, P.gait ?? 1);
  B.ankle = [0, 1].map(i => L(B.ankle?.[i] || 0, P.ankle?.[i] || 0));
  B.head = [0, 1].map(i => L(B.head?.[i] || 0, P.head?.[i] || 0)); B.lean = L(B.lean || 0, P.lean || 0);
  // 速度、加速度、轉彎速度（都平滑過，不會一頓一頓）
  av._v = (av._v ?? 0) + ((air ? 0 : sp) - (av._v ?? 0)) * (1 - Math.exp(-dt * 7)); const v = av._v;
  const accRaw = (v - (av._vp ?? v)) / dt; av._vp = v; av._acc = (av._acc || 0) + (accRaw - (av._acc || 0)) * Math.min(1, dt * 5);
  let dry = av.g.rotation.y - (av._ry ?? av.g.rotation.y); dry = Math.atan2(Math.sin(dry), Math.cos(dry)); av._ry = av.g.rotation.y; av._turn = (av._turn || 0) + (dry / dt - (av._turn || 0)) * Math.min(1, dt * 6);
  const w = clamp((v - 1.6) / 2.4, 0, 1), on = clamp(v / 0.8, 0, 1), stride = 1.25 + 1.4 * w;   // w：0＝走、1＝跑；stride＝一個完整步伐（左右各一步）走多遠
  av.gp = ((av.gp || 0) + (dt * Math.PI * 2 * v) / stride) % (Math.PI * 200);
  const g2 = B.gait, A = on * (0.36 + 0.36 * w) * g2, armA = on * (0.28 + 0.6 * w) * B.arm, ext = [0, 0];
  for (let i = 0; i < 2; i++) {
    const sx = i === 0 ? -1 : 1, ph = av.gp + i * Math.PI, s = Math.sin(ph), c = Math.cos(ph);
    const hipG = A * s;   // 往前擺為正
    const knG = on * g2 * ((0.3 + 1.15 * w) * Math.pow(Math.max(0, Math.cos(ph + 0.45)), 1.6) + (0.06 + 0.22 * w) * Math.max(0, -c));   // 擺盪期收腿、支撐期緩衝
    const a = av.arms[i], e = av.elbows[i], h = av.legs[i], kn = av.knees[i], armG = armA * Math.sin(ph + Math.PI);
    if (a.userData.y0 == null) a.userData.y0 = a.position.y; a.position.y = a.userData.y0 + B.shy[i];
    a.rotation.x = B.sh[i][0] - armG; a.rotation.z = sx * (B.sh[i][1] + on * 0.06 * w + (1 - on) * 0.012 * Math.sin(now / 900 + i));
    e.rotation.x = -(B.el[i] + B.arm * on * (0.18 + 1.25 * w) + B.arm * 0.12 * w * Math.max(0, Math.sin(ph + Math.PI)));
    h.rotation.x = -(B.hip[i] + hipG); kn.rotation.x = B.kn[i] + knG; h.rotation.z = sx * B.hab[i];
    const hh = -h.rotation.x, kk = kn.rotation.x; ext[i] = ((av.L1 || 0.44) * Math.cos(hh) + (av.L2 || 0.46) * Math.cos(hh - kk)) * Math.cos(B.hab[i]);
    if (av.feet) av.feet[i].rotation.z = -h.rotation.z;
    if (av.feet) av.feet[i].rotation.x = air ? 0.45 : -(h.rotation.x + kn.rotation.x) * 0.9 + on * (0.2 + 0.4 * w) * Math.max(0, -s) * (c > 0 ? 1 : 0.35);   // 腳掌貼地；後腳離地前踮腳尖；空中腳尖朝下
  }
  if (av.feet) for (let i = 0; i < 2; i++) av.feet[i].rotation.x += B.ankle[i];
  // 身體：加速前傾、轉彎內倒（以腳底為軸）、骨盆扭轉；上身反向扭、往前傾；頭保持看前方
  const R = av.root, lean = air ? 0 : clamp(av._acc * 0.035, -0.12, 0.2) + 0.08 * w * on, bank = air ? 0 : clamp(-av._turn * v * 0.03, -0.2, 0.2), idle = 1 - on;
  av._lean = (av._lean || 0) + (lean - (av._lean || 0)) * Math.min(1, dt * 8); av._bank = (av._bank || 0) + (bank + idle * 0.012 * Math.sin(now / 1400) - (av._bank || 0)) * Math.min(1, dt * 8);
  // 撲救的身體：照關鍵格擺好髖的位置和身體的角度（魚躍往前倒、滾翻往球那側整圈翻過去），腳底不再當軸；起來時慢慢撐起
  let rx = av._lean, rz = av._bank;
  if (DK) {
    const sg = Math.sign(DK.sn) || 1, dRoll = DK.side ? Math.atan2(Math.sin(DK.roll), Math.cos(DK.roll)) : 0;
    const dx = DK.side ? DK.pitch : DK.pitch * Math.cos(fd), dz = DK.side ? -dRoll * sg : -DK.pitch * DK.sn;
    rx = fa > 0.9 ? dx : av._lean * (1 - fa) + dx * fa; rz = fa > 0.9 ? dz : av._bank * (1 - fa) + dz * fa;
  }
  R.rotation.set(rx, on * (0.08 + 0.06 * w) * Math.sin(av.gp) * (1 - fa), rz);
  av.spine.rotation.x = B.sp + 0.1 * w * on + idle * 0.014 * Math.sin(now / 650);   // 跑步上身前傾；站著時呼吸
  av.spine.rotation.z = B.lean;
  av.spine.rotation.y = B.tw - on * (0.16 + 0.1 * w) * Math.sin(av.gp);
  av.head.rotation.x = -B.sp * 0.6 - R.rotation.x * 0.7 * (1 - 0.6 * fa) - 0.1 * w * on; av.head.rotation.z = -R.rotation.z * 0.6 * (1 - fa);
  av.head.rotation.x += B.head[0]; av.head.rotation.y = B.head[1];
  const drop = air ? 0 : Math.max(0, (av.hipH || 0.9) - Math.max(ext[0], ext[1]));
  if (DK) {   // 髖要在關鍵格的位置：根節點（腳底）＝髖的位置 − 轉過的「腳底到髖」
    const hp = DIVE_HV.set(0, av.hipH || 0.9, 0).applyEuler(R.rotation), tx = Math.sin(fd) * DK.d, tz = Math.cos(fd) * DK.d;
    R.position.x = (tx - hp.x) * fa; R.position.z = (tz - hp.z) * fa; R.position.y = -drop * (1 - fa) + (DK.y - hp.y) * fa; av._rootY = R.position.y;
  } else {   // 跳躍：Q 版角色比判定用的身高矮，畫面上的離地高度乘 AV_JUMP_K（等於起跳速度和重力乘同倍數：到頂時間不變、手能到網子上方；判定不變）
    R.position.x = 0; R.position.z = 0; av._rootY = av._rootY == null ? R.position.y : av._rootY; av._rootY += (-drop - av._rootY) * (1 - Math.exp(-dt * 22));
    R.position.y = av._rootY + (av.chibi ? Math.max(0, av.body.position.y) * (AV_JUMP_K - 1) : 0);
  }
  // 不陷進地板（翻滾時身體、跑步時鞋尖鞋跟）：全身最低的點比地板低，就把整個人往上抬
  av.g.updateMatrixWorld(true);
  const gy = av.g.getWorldPosition(GP_V).y; let minY = Infinity;
  for (const [o, x, y, z] of av._gp || (av._gp = avGroundPts(av))) { GP_V.set(x, y, z); o.localToWorld(GP_V); if (GP_V.y < minY) minY = GP_V.y; }
  if (minY < gy + 0.022) { R.position.y += (gy + 0.022 - minY) / (av.g.scale.y || 1); R.updateMatrixWorld(true); }   // 場地表面比 0 高一點（最多約 2.2 cm）
}
// 姿勢代碼（連線、回放、AI 共用）→ 全身姿勢；t＝這個動作做到哪（0～1）
function avPoseOf(code, t = 0.5, ready = false) {
  switch (code) {
    case 1: return AVP.hold;
    case 2: return t < 0.15 ? AVP.setReady : AVP.setPush;
    case 3: return t < 0.3 ? AVP.bumpHit : avMix(AVP.bumpHit, AVP.bump, (t - 0.3) / 0.5);
    case 4: return t < 0.18 ? avMix(AVP.airUp, AVP.spikeHit, t / 0.18) : avMix(AVP.spikeHit, AVP.spikeFollow, (t - 0.18) / 0.5);
    case 5: return t < 0.28 ? AVP.takeoff : avMix(AVP.takeoff, AVP.airUp, (t - 0.28) / 0.4);
    case 13: return AVP.approach;
    case 19: return t < 0.3 ? AVP.bumpHit : avMix(AVP.bumpHit, AVP.bumpStand, (t - 0.3) / 0.5);   // 站著接球
    case 18: return AVP.crouch;
    case 6: return AVP.rkReady;
    case 7: return t < 0.4 ? avMix(AVP.rkOverCock, AVP.rkOverHit, t / 0.4) : avMix(AVP.rkOverHit, AVP.rkOverFollow, (t - 0.4) / 0.6);
    case 8: return avMix(AVP.rkSideBack, AVP.rkSideFollow, t);
    case 9: return AVP.block;
    case 10: case 11: case 12: return avDivePose(DIVE_D[code - 10], t > 1);
    case 14: return AVP.hi5Up;
    case 15: return AVP.hi5Hit;
    case 17: return AVP.hi5Two;
    case 16: return emoPose('taunt', t * 0.45);
    default: return ready ? AVP.ready : AVP.idle;
  }
}
// 名條：6 對 6 時前面加位置簡稱（S、OP、OH、M）
function peerTag(p2) { const tag = (p2.tt ? `「${p2.tt}」` : '') + VM.on && VM.six && VM.role && VM.role[p2.id] ? `${V6_TAG[VM.role[p2.id]]}・${p2.n}` : p2.n; return tag + (ROOM?.snapshot.flow.ready.includes(p2.id) && ROOM.snapshot.flow.phase !== 'playing' ? ' · 準備' : ''); }
function peerTagsAll() { for (const p2 of NET.peers.values()) if (p2.tag) p2.tag.element.textContent = peerTag(p2); }
function netPeer(id, d) {
  let p2 = NET.peers.get(id);
  if (!p2) {
    const av = makeAvatar(d.c || '#3E63DD');
    const el = document.createElement('div'); el.className = 'mp-tag'; el.textContent = d.n || '球友';
    const tag = new CSS2DObject(el); tag.position.set(0, 2.05, 0); av.g.add(tag);
    scene.add(av.g);
    p2 = { id, n: d.n || '球友', c: d.c || '#3E63DD', av, tag, x: 0, z: 0, y: 0, yaw: 0, pose: 0, ball: null, buf: [], vx: 0, vz: 0 };
    NET.peers.set(id, p2); if (ROOM) ROOM.join(id);
    if (NET.on) toast(`${p2.n} 進來了`);
  } else { p2.n = d.n || p2.n; p2.tag.element.textContent = peerTag(p2); }
  return p2;
}
function netDropPeer(id) {
  const p2 = NET.peers.get(id); if (!p2) return;
  scene.remove(p2.av.g); p2.tag.element.remove(); if (p2.ball) scene.remove(p2.ball); rkPeerAi(p2, null);
  NET.peers.delete(id); if (ROOM) ROOM.leave(id); toast(`${p2.n} 離開了`);
}
// 姿勢代碼：0 一般、1 拿球、2 舉球、3 墊球、4 攻擊／發球
// ---- T：互動——按住 T 叫出選單（游標往左＝擊掌、往右＝嘲諷），放開 T 或點一下確定
//   擊掌：先舉一隻手邀請（2.5 秒）；身邊 2.5 m 內的隊友這段時間也按 T 選擊掌（旁邊的 AI 隊友大多會回）
//     → 時間到大家往中間靠、面對面（兩個人相隔不到 1 m，人多就圍一圈），雙手一起拍；太遠的人不算、旁邊沒人回就放下手
//   嘲諷：對對面挺胸比「來啊」，名條上冒表情（大家都看得到）
const EMO = { menu: null, hi5: new Map(), WIN: 2500, R: 2.5 };
/* 關鍵格的 dt 是從上一格到這一格的秒數，ease 控制該段，move 為角色右方／前方公尺。 */
const langziArmsDown = { sh: [[Math.PI / 2, Math.PI / 2], [Math.PI / 2, Math.PI / 2]], el: [Math.PI / 2, Math.PI / 2] };
const EMO_KEYS = {
  langzi: [
    { dt: 0, pose: 'idle', move: [0, 0] },
    { dt: 0.22, pose: { ...AVP.idle, hip: [0.12, 0.12], kn: [0.23, 0.23], sp: 0.12, tw: -Math.PI / 12 }, move: [0, 0] },
    { dt: 0.36, pose: { ...langziArmsDown, hip: [0.26, 0.26], kn: [0.52, 0.52], sp: 0.26, tw: -Math.PI / 12 }, move: [0, 0] },
    { dt: 0.12, pose: { ...langziArmsDown, hip: [0.1, 0.35], kn: [0.8, 0.6], sp: 0, tw: -0.3, lean: 0, head: [0.3, -0.65], ankle: [-0.65, 0] }, move: [0, 0] },
    { dt: 0.09, pose: { ...langziArmsDown, hip: [-0.35, 0.35], kn: [1.55, 0.65], hab: [0.32, 0.05], sp: 0, tw: -0.4, lean: 0, head: [0.35, -0.85], ankle: [-0.85, 0] }, ease: 'out', kick: 0, move: [0, 0] },
    { dt: 0.58, pose: { ...langziArmsDown, hip: [-0.35, 0.35], kn: [1.55, 0.65], hab: [0.32, 0.05], sp: 0, tw: -0.4, lean: 0, head: [0.35, -0.85], ankle: [-0.85, 0] }, move: [0, 0] },
    { dt: 0.18, pose: { sh: [[0.4, 0.3], [0.4, 0.3]], el: [0.36, 0.36], hip: [-0.42, 0.3], kn: [1.65, 0.7], sp: 0.12, tw: 0.2, lean: 0.12, head: [0.2, 0.6], ankle: [-0.7, 0] }, move: [0, 0] },
    { dt: 0.09, pose: { sh: [[-1.65, 1.25], [-1.65, 1.25]], el: [1.5, 1.5], hip: [0.9, 0.3], kn: [0.2, 0.5], hab: [-0.65, 0.06], sp: 0.1, tw: 0.35, lean: 0.16, head: [0.3, 0.8], ankle: [-0.75, 0] }, ease: 'out', kick: 0, move: [0, 0] },
    { dt: 0.18, pose: { sh: [[-1.65, 1.25], [-1.65, 1.25]], el: [1.5, 1.5], hip: [0.9, 0.3], kn: [0.2, 0.5], hab: [-0.65, 0.06], sp: 0.1, tw: 0.35, lean: 0.16, head: [0.3, 0.8], ankle: [-0.75, 0] }, move: [0, 0] },
    { dt: 0.37, pose: 'idle', move: [0, 0] },
  ],
  gouxiong: [   /* 狗熊哆嗦毛（照示範影片，第 6 版：加快、一次跳兩遍）：整體蹲低、踩步時一腳前一腳後、上身前彎側倒扭轉跟著手；手連續畫圈（垂下→張平→V→頭頂合→臉前交叉→張開）兩圈；節拍 0.099 秒、動作之間連續不停頓（spline），甩手和拍手用力甩過頭再彈回；只在 13 個踩步移動，繞小圈（半徑約 0.35 m）回到原點 */
    { dt: 0, pose: 'idle', move: [0, 0] },
    { dt: 0.198, pose: { sh: [[-0.35, 0.15], [-0.35, 0.15]], el: [0.45, 0.45], hip: [0.4, 0.4], kn: [0.75, 0.75], hab: [0.15, 0.15], sp: 0.18 }, ease: 'spline', move: [0, 0] },
    { dt: 0.099, pose: { sh: [[-0.55, -0.35], [-0.35, 0.55]], el: [0.4, 0.5], hip: [0.65, -0.15], kn: [0.8, 0.65], hab: [-0.3, 0.2], sp: 0.35, lean: -0.38, tw: 0.32, head: [0.25, -0.2] }, ease: 'spline', move: [0.163, 0.032] },
    { dt: 0.063, pose: { sh: [[-0.15, 1.62], [-0.15, 1.62]], el: [0.05, 0.05], hip: [0.45, 0.05], kn: [0.8, 0.7], hab: [0.45, 0.4], sp: 0.25, lean: -0.25, tw: 0.15 }, ease: 'out', move: [0.288, 0.121] },
    { dt: 0.0495, pose: { sh: [[-0.25, 1.4], [-0.25, 1.4]], el: [0.25, 0.25], hip: [0.45, 0.05], kn: [0.8, 0.7], hab: [0.45, 0.4], sp: 0.25, lean: -0.25, tw: 0.15 }, ease: 'spline', move: [0.288, 0.121] },
    { dt: 0.099, pose: { sh: [[-2.35, 0.75], [-2.35, 0.75]], el: [0.55, 0.55], hip: [0.45, 0.05], kn: [0.8, 0.7], hab: [0.45, 0.4], sp: 0.12, lean: -0.1, tw: 0.05, head: [-0.15, 0] }, ease: 'spline', move: [0.288, 0.121] },
    { dt: 0.063, pose: { sh: [[-2.85, -0.42], [-2.85, -0.42]], el: [0.95, 0.95], hip: [0.45, 0.05], kn: [0.8, 0.7], hab: [0.45, 0.4], sp: 0.1, lean: 0, head: [-0.1, 0] }, ease: 'out', move: [0.288, 0.121] },
    { dt: 0.0495, pose: { sh: [[-2.85, -0.25], [-2.85, -0.25]], el: [0.85, 0.85], hip: [0.45, 0.05], kn: [0.8, 0.7], hab: [0.45, 0.4], sp: 0.1, lean: 0, head: [-0.1, 0] }, ease: 'spline', move: [0.288, 0.121] },
    { dt: 0.099, pose: { sh: [[-1.75, -0.55], [-1.75, -0.55]], el: [1.6, 1.6], hip: [0.45, 0.05], kn: [0.95, 0.85], hab: [0.45, 0.4], sp: 0.35, lean: 0.05, tw: -0.12 }, ease: 'spline', move: [0.288, 0.121] },
    { dt: 0.099, pose: { sh: [[-1.05, 0.7], [-1.05, 0.7]], el: [0.95, 0.95], hip: [0.45, 0.05], kn: [0.8, 0.7], hab: [0.45, 0.4], sp: 0.28, lean: 0.1, tw: -0.08 }, ease: 'spline', move: [0.288, 0.121] },
    { dt: 0.099, pose: { sh: [[-2.35, 0.75], [-2.35, 0.75]], el: [0.55, 0.55], hip: [-0.15, 0.65], kn: [0.65, 0.8], hab: [0.2, -0.3], sp: 0.2, lean: 0.25, tw: -0.28 }, ease: 'spline', move: [0.347, 0.246] },
    { dt: 0.063, pose: { sh: [[-2.85, -0.42], [-2.85, -0.42]], el: [0.95, 0.95], hip: [-0.15, 0.65], kn: [0.65, 0.8], hab: [0.2, -0.3], sp: 0.25, lean: 0.42, tw: -0.3, head: [0.15, 0.25] }, ease: 'out', move: [0.347, 0.246] },
    { dt: 0.0495, pose: { sh: [[-2.85, -0.25], [-2.85, -0.25]], el: [0.85, 0.85], hip: [-0.15, 0.65], kn: [0.65, 0.8], hab: [0.2, -0.3], sp: 0.25, lean: 0.42, tw: -0.3, head: [0.15, 0.25] }, ease: 'spline', move: [0.347, 0.246] },
    { dt: 0.063, pose: { sh: [[-0.7, 1.6], [-0.45, 1.62]], el: [0.05, 0.05], hip: [-0.5, 0.65], kn: [0.25, 0.95], hab: [0.3, 0.15], sp: 0.38, lean: 0.45, tw: -0.32, head: [0.2, 0.3] }, ease: 'out', move: [0.327, 0.379] },
    { dt: 0.0495, pose: { sh: [[-0.75, 1.35], [-0.5, 1.4]], el: [0.25, 0.25], hip: [-0.5, 0.65], kn: [0.25, 0.95], hab: [0.3, 0.15], sp: 0.38, lean: 0.45, tw: -0.32, head: [0.2, 0.3] }, ease: 'spline', move: [0.327, 0.379] },
    { dt: 0.0594, pose: { sh: [[-0.75, 1.35], [-0.5, 1.4]], el: [0.25, 0.25], hip: [-0.5, 0.65], kn: [0.25, 0.95], hab: [0.3, 0.15], sp: 0.38, lean: 0.45, tw: -0.32, head: [0.2, 0.3] }, ease: 'spline', move: [0.327, 0.379] },
    { dt: 0.099, pose: { sh: [[-2.35, 0.75], [-2.35, 0.75]], el: [0.55, 0.55], hip: [0.65, -0.15], kn: [0.8, 0.65], hab: [-0.3, 0.2], sp: 0.18, lean: 0.15, tw: 0.2 }, ease: 'spline', move: [0.232, 0.49] },
    { dt: 0.063, pose: { sh: [[-2.85, -0.42], [-2.85, -0.42]], el: [0.95, 0.95], hip: [0.05, 0.45], kn: [0.7, 0.8], hab: [0.4, 0.45], sp: 0.12, lean: 0, tw: 0.05 }, ease: 'out', move: [0.084, 0.552] },
    { dt: 0.0495, pose: { sh: [[-2.85, -0.25], [-2.85, -0.25]], el: [0.85, 0.85], hip: [0.05, 0.45], kn: [0.7, 0.8], hab: [0.4, 0.45], sp: 0.12, lean: 0, tw: 0.05 }, ease: 'spline', move: [0.084, 0.552] },
    { dt: 0.099, pose: { sh: [[-1.75, -0.55], [-1.75, -0.55]], el: [1.6, 1.6], hip: [0.05, 0.45], kn: [0.85, 0.95], hab: [0.4, 0.45], sp: 0.35, lean: -0.05, tw: 0.12 }, ease: 'spline', move: [0.084, 0.552] },
    { dt: 0.063, pose: { sh: [[-0.15, 1.62], [-0.15, 1.62]], el: [0.05, 0.05], hip: [0.05, 0.45], kn: [0.7, 0.8], hab: [0.4, 0.45], sp: 0.22, lean: -0.1 }, ease: 'out', move: [0.084, 0.552] },
    { dt: 0.0495, pose: { sh: [[-0.25, 1.4], [-0.25, 1.4]], el: [0.25, 0.25], hip: [0.05, 0.45], kn: [0.7, 0.8], hab: [0.4, 0.45], sp: 0.22, lean: -0.1 }, ease: 'spline', move: [0.084, 0.552] },
    { dt: 0.0792, pose: { sh: [[-0.25, 1.4], [-0.25, 1.4]], el: [0.25, 0.25], hip: [0.05, 0.45], kn: [0.7, 0.8], hab: [0.4, 0.45], sp: 0.22, lean: -0.1 }, ease: 'spline', move: [0.084, 0.552] },
    { dt: 0.099, pose: { sh: [[-0.55, -0.35], [-0.35, 0.55]], el: [0.4, 0.5], hip: [0.65, -0.15], kn: [0.8, 0.65], hab: [-0.3, 0.2], sp: 0.35, lean: -0.38, tw: 0.32, head: [0.25, -0.2] }, ease: 'spline', move: [-0.084, 0.552] },
    { dt: 0.063, pose: { sh: [[-0.15, 1.62], [-0.15, 1.62]], el: [0.05, 0.05], hip: [0.45, 0.05], kn: [0.8, 0.7], hab: [0.45, 0.4], sp: 0.25, lean: -0.25, tw: 0.15 }, ease: 'out', move: [-0.232, 0.49] },
    { dt: 0.0495, pose: { sh: [[-0.25, 1.4], [-0.25, 1.4]], el: [0.25, 0.25], hip: [0.45, 0.05], kn: [0.8, 0.7], hab: [0.45, 0.4], sp: 0.25, lean: -0.25, tw: 0.15 }, ease: 'spline', move: [-0.232, 0.49] },
    { dt: 0.099, pose: { sh: [[-2.35, 0.75], [-2.35, 0.75]], el: [0.55, 0.55], hip: [0.45, 0.05], kn: [0.8, 0.7], hab: [0.45, 0.4], sp: 0.12, lean: -0.1, tw: 0.05, head: [-0.15, 0] }, ease: 'spline', move: [-0.232, 0.49] },
    { dt: 0.063, pose: { sh: [[-2.85, -0.42], [-2.85, -0.42]], el: [0.95, 0.95], hip: [0.45, 0.05], kn: [0.8, 0.7], hab: [0.45, 0.4], sp: 0.1, lean: 0, head: [-0.1, 0] }, ease: 'out', move: [-0.232, 0.49] },
    { dt: 0.0495, pose: { sh: [[-2.85, -0.25], [-2.85, -0.25]], el: [0.85, 0.85], hip: [0.45, 0.05], kn: [0.8, 0.7], hab: [0.45, 0.4], sp: 0.1, lean: 0, head: [-0.1, 0] }, ease: 'spline', move: [-0.232, 0.49] },
    { dt: 0.099, pose: { sh: [[-1.75, -0.55], [-1.75, -0.55]], el: [1.6, 1.6], hip: [0.45, 0.05], kn: [0.95, 0.85], hab: [0.45, 0.4], sp: 0.35, lean: 0.05, tw: -0.12 }, ease: 'spline', move: [-0.232, 0.49] },
    { dt: 0.099, pose: { sh: [[-1.05, 0.7], [-1.05, 0.7]], el: [0.95, 0.95], hip: [0.45, 0.05], kn: [0.8, 0.7], hab: [0.45, 0.4], sp: 0.28, lean: 0.1, tw: -0.08 }, ease: 'spline', move: [-0.232, 0.49] },
    { dt: 0.099, pose: { sh: [[-2.35, 0.75], [-2.35, 0.75]], el: [0.55, 0.55], hip: [-0.15, 0.65], kn: [0.65, 0.8], hab: [0.2, -0.3], sp: 0.2, lean: 0.25, tw: -0.28 }, ease: 'spline', move: [-0.327, 0.379] },
    { dt: 0.063, pose: { sh: [[-2.85, -0.42], [-2.85, -0.42]], el: [0.95, 0.95], hip: [-0.15, 0.65], kn: [0.65, 0.8], hab: [0.2, -0.3], sp: 0.25, lean: 0.42, tw: -0.3, head: [0.15, 0.25] }, ease: 'out', move: [-0.327, 0.379] },
    { dt: 0.0495, pose: { sh: [[-2.85, -0.25], [-2.85, -0.25]], el: [0.85, 0.85], hip: [-0.15, 0.65], kn: [0.65, 0.8], hab: [0.2, -0.3], sp: 0.25, lean: 0.42, tw: -0.3, head: [0.15, 0.25] }, ease: 'spline', move: [-0.327, 0.379] },
    { dt: 0.063, pose: { sh: [[-0.7, 1.6], [-0.45, 1.62]], el: [0.05, 0.05], hip: [-0.5, 0.65], kn: [0.25, 0.95], hab: [0.3, 0.15], sp: 0.38, lean: 0.45, tw: -0.32, head: [0.2, 0.3] }, ease: 'out', move: [-0.347, 0.246] },
    { dt: 0.0495, pose: { sh: [[-0.75, 1.35], [-0.5, 1.4]], el: [0.25, 0.25], hip: [-0.5, 0.65], kn: [0.25, 0.95], hab: [0.3, 0.15], sp: 0.38, lean: 0.45, tw: -0.32, head: [0.2, 0.3] }, ease: 'spline', move: [-0.347, 0.246] },
    { dt: 0.0594, pose: { sh: [[-0.75, 1.35], [-0.5, 1.4]], el: [0.25, 0.25], hip: [-0.5, 0.65], kn: [0.25, 0.95], hab: [0.3, 0.15], sp: 0.38, lean: 0.45, tw: -0.32, head: [0.2, 0.3] }, ease: 'spline', move: [-0.347, 0.246] },
    { dt: 0.099, pose: { sh: [[-2.35, 0.75], [-2.35, 0.75]], el: [0.55, 0.55], hip: [0.65, -0.15], kn: [0.8, 0.65], hab: [-0.3, 0.2], sp: 0.18, lean: 0.15, tw: 0.2 }, ease: 'spline', move: [-0.288, 0.121] },
    { dt: 0.063, pose: { sh: [[-2.85, -0.42], [-2.85, -0.42]], el: [0.95, 0.95], hip: [0.05, 0.45], kn: [0.7, 0.8], hab: [0.4, 0.45], sp: 0.12, lean: 0, tw: 0.05 }, ease: 'out', move: [-0.163, 0.032] },
    { dt: 0.0495, pose: { sh: [[-2.85, -0.25], [-2.85, -0.25]], el: [0.85, 0.85], hip: [0.05, 0.45], kn: [0.7, 0.8], hab: [0.4, 0.45], sp: 0.12, lean: 0, tw: 0.05 }, ease: 'spline', move: [-0.163, 0.032] },
    { dt: 0.099, pose: { sh: [[-1.75, -0.55], [-1.75, -0.55]], el: [1.6, 1.6], hip: [0.05, 0.45], kn: [0.85, 0.95], hab: [0.4, 0.45], sp: 0.35, lean: -0.05, tw: 0.12 }, ease: 'spline', move: [-0.163, 0.032] },
    { dt: 0.063, pose: { sh: [[-0.15, 1.62], [-0.15, 1.62]], el: [0.05, 0.05], hip: [0.05, 0.45], kn: [0.7, 0.8], hab: [0.4, 0.45], sp: 0.22, lean: -0.1 }, ease: 'out', move: [-0.163, 0.032] },
    { dt: 0.0495, pose: { sh: [[-0.25, 1.4], [-0.25, 1.4]], el: [0.25, 0.25], hip: [0.05, 0.45], kn: [0.7, 0.8], hab: [0.4, 0.45], sp: 0.22, lean: -0.1 }, ease: 'spline', move: [-0.163, 0.032] },
    { dt: 0.0792, pose: { sh: [[-0.25, 1.4], [-0.25, 1.4]], el: [0.25, 0.25], hip: [0.05, 0.45], kn: [0.7, 0.8], hab: [0.4, 0.45], sp: 0.22, lean: -0.1 }, ease: 'spline', move: [-0.163, 0.032] },
    { dt: 0.27, pose: 'idle', ease: 'smooth', move: [0, 0] },
  ],
  yaotou: [   /* 搖頭晃腦（第 3 版，照使用者觀察）：馬步、左右腳輪流原地踏步；固定的手前臂橫放在胸口稍下，會動的手一直高過肩膀；頭不規則亂晃；右手快速甩出 → 在外面停久一點（附點的長）→ 很快甩回來（短）跟橫在胸前的左手擊掌，重複 4 次 */
    { dt: 0, pose: 'idle', move: [0, 0] },
    { dt: 0.2, pose: { sh: [[-1, -0.35], [-0.45, -0.45]], el: [0.25, 1.55], hip: [0.35, 0.35], kn: [0.65, 0.65], hab: [0.45, 0.45], sp: 0.08, head: [0.05, 0.45], lean: 0.113 }, ease: 'spline', move: [0, 0] },
    { dt: 0.12, pose: { sh: [[-0.35, 1.95], [-0.45, -0.45]], el: [0.35, 1.55], hip: [0.7, 0.35], kn: [1.15, 0.65], hab: [0.3, 0.45], sp: 0.04, head: [-0.08, -0.3], lean: -0.075, tw: -0.12 }, ease: 'out', move: [0, 0] },
    { dt: 0.28, pose: { sh: [[-0.4, 1.85], [-0.45, -0.45]], el: [0.4, 1.55], hip: [0.35, 0.35], kn: [0.65, 0.65], hab: [0.45, 0.45], sp: 0.05, head: [0.1, 0.12], lean: 0.03, tw: -0.1 }, ease: 'spline', move: [0, 0] },
    { dt: 0.08, pose: { sh: [[-1, -0.35], [-0.45, -0.45]], el: [0.25, 1.55], hip: [0.35, 0.7], kn: [0.65, 1.15], hab: [0.45, 0.3], sp: 0.12, head: [0, -0.55], lean: -0.138, tw: 0.1 }, ease: 'out', move: [0, 0] },
    { dt: 0.2, pose: { sh: [[-1.15, -0.15], [-0.45, -0.45]], el: [0.35, 1.55], hip: [0.35, 0.35], kn: [0.65, 0.65], hab: [0.45, 0.45], sp: 0.1, head: [0.06, 0.35], lean: 0.087, tw: 0.05 }, ease: 'spline', move: [0, 0] },
    { dt: 0.12, pose: { sh: [[-0.35, 1.95], [-0.45, -0.45]], el: [0.35, 1.55], hip: [0.7, 0.35], kn: [1.15, 0.65], hab: [0.3, 0.45], sp: 0.04, head: [-0.05, -0.15], lean: -0.037, tw: -0.12 }, ease: 'out', move: [0, 0] },
    { dt: 0.28, pose: { sh: [[-0.4, 1.85], [-0.45, -0.45]], el: [0.4, 1.55], hip: [0.35, 0.35], kn: [0.65, 0.65], hab: [0.45, 0.45], sp: 0.05, head: [0.08, 0.5], lean: 0.125, tw: -0.1 }, ease: 'spline', move: [0, 0] },
    { dt: 0.08, pose: { sh: [[-1, -0.35], [-0.45, -0.45]], el: [0.25, 1.55], hip: [0.35, 0.7], kn: [0.65, 1.15], hab: [0.45, 0.3], sp: 0.12, head: [-0.06, -0.4], lean: -0.1, tw: 0.1 }, ease: 'out', move: [0, 0] },
    { dt: 0.2, pose: { sh: [[-1.15, -0.15], [-0.45, -0.45]], el: [0.35, 1.55], hip: [0.35, 0.35], kn: [0.65, 0.65], hab: [0.45, 0.45], sp: 0.1, head: [0.02, 0.2], lean: 0.05, tw: 0.05 }, ease: 'spline', move: [0, 0] },
    { dt: 0.12, pose: { sh: [[-0.35, 1.95], [-0.45, -0.45]], el: [0.35, 1.55], hip: [0.7, 0.35], kn: [1.15, 0.65], hab: [0.3, 0.45], sp: 0.04, head: [0.07, -0.5], lean: -0.125, tw: -0.12 }, ease: 'out', move: [0, 0] },
    { dt: 0.28, pose: { sh: [[-0.4, 1.85], [-0.45, -0.45]], el: [0.4, 1.55], hip: [0.35, 0.35], kn: [0.65, 0.65], hab: [0.45, 0.45], sp: 0.05, head: [-0.04, 0.4], lean: 0.1, tw: -0.1 }, ease: 'spline', move: [0, 0] },
    { dt: 0.08, pose: { sh: [[-1, -0.35], [-0.45, -0.45]], el: [0.25, 1.55], hip: [0.35, 0.7], kn: [0.65, 1.15], hab: [0.45, 0.3], sp: 0.12, head: [0.05, -0.05], lean: -0.013, tw: 0.1 }, ease: 'out', move: [0, 0] },
    { dt: 0.2, pose: { sh: [[-1.15, -0.15], [-0.45, -0.45]], el: [0.35, 1.55], hip: [0.35, 0.35], kn: [0.65, 0.65], hab: [0.45, 0.45], sp: 0.1, head: [-0.08, 0.55], lean: 0.138, tw: 0.05 }, ease: 'spline', move: [0, 0] },
    { dt: 0.12, pose: { sh: [[-0.35, 1.95], [-0.45, -0.45]], el: [0.35, 1.55], hip: [0.7, 0.35], kn: [1.15, 0.65], hab: [0.3, 0.45], sp: 0.04, head: [0.04, -0.35], lean: -0.087, tw: -0.12 }, ease: 'out', move: [0, 0] },
    { dt: 0.28, pose: { sh: [[-0.4, 1.85], [-0.45, -0.45]], el: [0.4, 1.55], hip: [0.35, 0.35], kn: [0.65, 0.65], hab: [0.45, 0.45], sp: 0.05, head: [0.06, 0.25], lean: 0.063, tw: -0.1 }, ease: 'spline', move: [0, 0] },
    { dt: 0.08, pose: { sh: [[-1, -0.35], [-0.45, -0.45]], el: [0.25, 1.55], hip: [0.35, 0.7], kn: [0.65, 1.15], hab: [0.45, 0.3], sp: 0.12, head: [-0.02, -0.45], lean: -0.113, tw: 0.1 }, ease: 'out', move: [0, 0] },
    { dt: 0.2, pose: { sh: [[-1.15, -0.15], [-0.45, -0.45]], el: [0.35, 1.55], hip: [0.35, 0.35], kn: [0.65, 0.65], hab: [0.45, 0.45], sp: 0.1, head: [0.05, 0.1], lean: 0.025, tw: 0.05 }, ease: 'spline', move: [0, 0] },
    { dt: 0.3, pose: 'idle', ease: 'smooth', move: [0, 0] },
  ],
  shanshen: [
    { dt: 0, pose: 'idle', move: [0, 0] },
    { dt: 0.15, pose: { sh: [[0, 0.12], [0, 0.12]], el: [0.12, 0.12] }, ease: 'smooth', move: [0, 0] },
    { dt: 0.25, pose: { sh: [[-0.35, -0.5], [-0.1, 0.5]], el: [0.65, 0.2], tw: 0.2 }, ease: 'smooth', move: [0, 0] },
    { dt: 0.05, pose: { sh: [[-0.15, 0.9], [-0.3, -0.9]], el: [0.12, 0.2], hip: [0.08, -0.18], kn: [0.2, 0.12], hab: [-0.25, -0.18], tw: -0.08 }, ease: 'linear', move: [0.28, 0] },
    { dt: 0.07, pose: { sh: [[-0.1, 1.5], [-0.28, -1.4]], el: [0.12, 0.18], hip: [0.25, -0.25], kn: [0.48, 0.08], hab: [0.48, 0.65], tw: -0.12 }, ease: 'out', move: [0.7, 0] },
    { dt: 0.15, pose: { sh: [[-0.1, 1.5], [-0.28, -1.4]], el: [0.12, 0.18], hip: [0.25, -0.25], kn: [0.48, 0.08], hab: [0.48, 0.65], tw: -0.12 }, ease: 'linear', move: [0.7, 0] },
    { dt: 0.3, pose: 'idle', ease: 'smooth', move: [0.7, 0] },
  ],
};
function emoKeyDuration(key) { return EMO_KEYS[key].reduce((sum, frame) => sum + frame.dt, 0); }
function emoKeyPose(pose) {
  return { ...AVP.idle, ...(typeof pose === 'string' ? AVP[pose] : pose), arm: 0, gait: 0 };
}
function emoKeySpline(P, u) {
  P = P.map((p) => avMix(p, p, 0));   /* 先補齊所有欄位（腳踝、肩、頭、側傾…），左右鏡像才不會讀到空的 */
  const w = [(-u * u * u + 2 * u * u - u) / 2, (3 * u * u * u - 5 * u * u + 2) / 2, (-3 * u * u * u + 4 * u * u + u) / 2, (u * u * u - u * u) / 2];
  const mix = (vals) => typeof vals[1] === 'number' ? vals.reduce((sum, v, k) => sum + (typeof v === 'number' ? v : vals[1]) * w[k], 0) : Array.isArray(vals[1]) ? vals[1].map((_, j) => mix(vals.map((v) => (Array.isArray(v) ? v[j] : undefined)))) : vals[2];
  const out = {}; for (const key of Object.keys(P[1])) out[key] = mix(P.map((p) => p[key])); return out;
}
function emoKeySample(key, time, dir = 1) {
  const frames = EMO_KEYS[key];
  let start = 0, i = 1;
  while (i < frames.length - 1 && time > start + frames[i].dt) { start += frames[i].dt; i++; }
  const a = frames[i - 1], b = frames[i], u = clamp((time - start) / b.dt, 0, 1);
  const ease = b.ease === 'linear' ? u : b.ease === 'out' ? 1 - (1 - u) ** 2 : u * u * (3 - 2 * u);
  /* spline：穿過前後的關鍵姿勢、中間不停頓（Catmull-Rom），跳舞的連續動作用；其他照舊 */
  let pose = b.ease === 'spline' ? emoKeySpline([frames[Math.max(0, i - 2)], a, b, frames[Math.min(frames.length - 1, i + 1)]].map((f) => emoKeyPose(f.pose)), u) : avMix(emoKeyPose(a.pose), emoKeyPose(b.pose), ease);
  if (dir < 0) pose = { ...pose, sh: [pose.sh[1], pose.sh[0]], el: [pose.el[1], pose.el[0]], hip: [pose.hip[1], pose.hip[0]], kn: [pose.kn[1], pose.kn[0]], hab: [pose.hab[1], pose.hab[0]], shy: [pose.shy[1], pose.shy[0]], tw: -pose.tw, ankle: [pose.ankle[1], pose.ankle[0]], head: [pose.head[0], -pose.head[1]], lean: -pose.lean };
  return { pose, move: [dir * (a.move[0] + (b.move[0] - a.move[0]) * ease), a.move[1] + (b.move[1] - a.move[1]) * ease], done: time >= emoKeyDuration(key) };
}
function emoKeyPosition(event, time) {
  /* 從起點以固定 1 cm 子步重播曲線，碰到阻擋就停，與兩端 FPS 無關。 */
  let x = event.x, z = event.z, start = 0;
  const frames = EMO_KEYS[event.k];
  for (let i = 1; i < frames.length; i++) {
    const end = Math.min(time, start + frames[i].dt), sample = emoKeySample(event.k, end, event.dir);
    const dx = Math.cos(event.yaw) * sample.move[0] - Math.sin(event.yaw) * sample.move[1];
    const dz = -Math.sin(event.yaw) * sample.move[0] - Math.cos(event.yaw) * sample.move[1];
    const tx = event.x + dx, tz = event.z + dz, count = Math.max(1, Math.ceil(Math.hypot(tx - x, tz - z) / 0.01));
    const sx = (tx - x) / count, sz = (tz - z) / count;
    for (let j = 0; j < count; j++) {
      const nx = x + sx, nz = z + sz, hit = collide(nx, nz);
      if (Math.hypot(hit[0] - nx, hit[1] - nz) > 0.00001) return [x, z];
      x = nx; z = nz;
    }
    start += frames[i].dt;
    if (time <= start) break;
  }
  return [x, z];
}
function emoKeyBlocked(id) {
  if (!VM.on || VM.phase !== 'serve') EMO.tossLock = null;
  if (!VM.on || vmTeamOf(id) < 0) return false;
  if (VM.phase === 'rally') return true;
  if (VM.phase !== 'serve') return false;
  const server = VM.host ? vmServer() : VM.srvId;
  const tossing = server === vmMe() ? !!(walk.serve || walk.jserve) : !!NET.peers.get(server)?.tossing;
  if (tossing) EMO.tossLock = { server, seq: VM.srvSeq };
  return tossing || !!(EMO.tossLock && EMO.tossLock.server === server && EMO.tossLock.seq === VM.srvSeq);
}
function emoKeyDirection() {
  const right = walk.keys.has('d') || walk.keys.has('arrowright'), left = walk.keys.has('a') || walk.keys.has('arrowleft');
  if (right !== left) return right ? 1 : -1;
  EMO.nextDir = -(EMO.nextDir || -1);
  return EMO.nextDir;
}
function emoKeyActive() { return !!walk.emote?.keyframes; }
function emoKeyStart(key) {
  if (emoKeyBlocked(vmMe())) { toast('發球後到死球前不能用'); return; }
  if (emoKeyActive() || walk.air || walk.dive || walk.down > 0 || walk.sit || walk.paused || walk.spike || walk.serve || walk.jserve || window.__rkOn) return;
  const now = performance.now(), dir = key === 'langzi' ? 1 : emoKeyDirection();
  walk.emote = { k: key, keyframes: true, t0: now, until: now + emoKeyDuration(key) * 1000, dir, x: walk.x, z: walk.z, yaw: walk.yaw, match: VM.on };
  walk.target = null; targetMark.visible = false; walk.vel = [0, 0];
  walk.recv = null; walk.setQ = null; walk.swing = null; walk.charge = null; walk.chargeArm = null;
  if (skill.mode) { skill.mode = null; skill.dip = 0; $('wk-combo').hidden = true; }
  if (SETM.m) setMenuClose(false);
  if (NET.on) NET.tx.publish('emo', { e: 'em', k: key, id: vmMe(), dir, x: walk.x, z: walk.z, yaw: walk.yaw });
}
function emoKeyWalk() {
  const event = walk.emote;
  if (!event?.keyframes) return false;
  if (emoKeyInterrupted(event, vmMe(), walk.x, walk.z) || walk.dive || walk.down > 0) { walk.emote = null; return false; }
  const time = (performance.now() - event.t0) / 1000;
  [walk.x, walk.z] = emoKeyPosition(event, time); walk.vel = [0, 0]; walk.target = null; walk.yaw = event.yaw;
  if (event.k === 'langzi') langziStep(event, time);
  if (time >= emoKeyDuration(event.k)) walk.emote = null;
  return true;
}
/* WEB-022：由髖、膝與外展角算踢腳接觸點，座標為人物右方／前方。 */
function langziFoot(event, frame) {
  const i = frame.kick, p = emoKeyPose(frame.pose), side = i === 0 ? 1 : -1;
  const extension = 0.44 * Math.cos(p.hip[i]) + 0.46 * Math.cos(p.hip[i] - p.kn[i]);
  const right = event.dir * side * (0.12 + extension * Math.sin(p.hab[i]));
  const forward = 0.44 * Math.sin(p.hip[i]) + 0.46 * Math.sin(p.hip[i] - p.kn[i]);
  const dx = Math.cos(event.yaw) * right - Math.sin(event.yaw) * forward;
  const dz = -Math.sin(event.yaw) * right - Math.cos(event.yaw) * forward;
  return { x: event.x + dx, z: event.z + dz, dx, dz };
}
function langziCanKick() {
  if (!VM.on) return true;
  return ['point', 'serve'].includes(VM.phase) && !emoKeyBlocked(VM.host ? vmServer() : VM.srvId);
}
function langziLaunch(b, velocity) {
  b.v.set(...velocity); b.rest = 0; b.room = false; b.langzi = true;
  b.spike = null; b.acc = null; b.float = null; b.spinW = null; b.snap = null; b.err = null;
  b.floorHit = null; b.floorReport = null; b.floorEv = false; b.mine = false;
  if (VM.ball === b) VM.ball = null;
}
function langziStep(event, time) {
  if (event.kicked || !langziCanKick()) return;
  let at = 0;
  for (const frame of EMO_KEYS.langzi) {
    at += frame.dt;
    if (frame.kick == null || at > time || at <= (event.kickTime || 0)) continue;
    event.kickTime = at;
    const foot = langziFoot(event, frame);
    const b = balls.find(q => q.m.position.y <= BALL_R + 0.08 && q.v.length() < 1.5 && Math.hypot(q.m.position.x - foot.x, q.m.position.z - foot.z) <= 0.8);
    if (!b) continue;
    const speed = 7 + Math.random() * 3, angle = (25 + Math.random() * 15) * Math.PI / 180;
    const yaw = Math.atan2(foot.dx, foot.dz) + (Math.random() - 0.5) * 0.12, horizontal = speed * Math.cos(angle);
    b.kickSource = { p: b.m.position.toArray(), room: !!b.room, h: NET.hitN, by: NET.hitBy, id: b.kickId || null };
    langziLaunch(b, [Math.sin(yaw) * horizontal, speed * Math.sin(angle), Math.cos(yaw) * horizontal]);
    event.kicked = true;
    if (VM.on && !vmIsPractice() && vmTeamOf(vmMe()) >= 0) MREC.local.lk = (MREC.local.lk || 0) + 1;
    if (NET.on) netBallHit(b, 'kick');
    return;
  }
}
function langziSend(b) {
  b.kickId = NET.me + '-' + Date.now() + '-' + (NET.kickN = (NET.kickN || 0) + 1);
  const message = netBallMsg(b, 'kick');
  Object.assign(message, { kid: b.kickId, source: b.kickSource, match: VM.on ? (VM.host ? MREC.id : VM.langziMatch) : '', seq: VM.on ? (VM.host ? VM.srvSeq : VM.langziSeq) : null });
  NET.tx.publish('ball', message);
}
function langziReceive(d, from) {
  if (!langziCanKick() || d.by !== from || typeof d.kid !== 'string' || d.kid.length > 120) return;
  if (d.match !== (VM.on ? (VM.host ? MREC.id : VM.langziMatch) : '') || (VM.on && d.seq !== (VM.host ? VM.srvSeq : VM.langziSeq))) return;
  if (![d.p, d.v, d.source?.p].every(a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite))) return;
  const speed = Math.hypot(...d.v);
  if (speed < 6.99 || speed > 10.01 || d.p[1] > BALL_R + 0.08) return;
  if (d.source.room && (d.source.h !== NET.hitN || d.source.by !== NET.hitBy)) return;
  const seen = NET.kickSeen || (NET.kickSeen = new Set());
  if (seen.has(d.kid)) return;
  seen.add(d.kid); if (seen.size > 256) seen.delete(seen.values().next().value);
  let b = d.source.id ? balls.find(q => q.kickId === d.source.id) : null;
  if (!b && d.source.room && d.source.h === NET.hitN && d.source.by === NET.hitBy) b = balls.find(q => q.room);
  if (!b) b = balls.find(q => !q.room && q.v.length() < 1.5 && q.m.position.distanceTo(new THREE.Vector3(...d.source.p)) < 0.8);
  if (!b) { const m = newBallMesh(); ballsGroup.add(m); b = { m, v: new THREE.Vector3() }; m.userData.ball = b; balls.push(b); }
  b.kickSource = d.source; b.m.position.set(...d.p); langziLaunch(b, d.v); b.kickId = d.kid;
}
function emoKeyReceive(d) {
  if (![d.x, d.z, d.yaw].every(Number.isFinite) || ![-1, 1].includes(d.dir) || emoKeyBlocked(d.id)) return;
  const peer = NET.peers.get(d.id) || netPeer(d.id, {});
  if (!peer.last) { peer.last = { t: performance.now(), x: d.x, z: d.z, yaw: d.yaw, y: 0, vx: 0, vz: 0 }; peer.buf = [peer.last]; }
  peer.keyEmote = { k: d.k, dir: d.dir, x: d.x, z: d.z, yaw: d.yaw, t0: performance.now() - netLat(d.id) * 1000, match: VM.on };
  peer.jump = null;
}
function emoKeyInterrupted(event, id, x, z) {
  return emoKeyBlocked(id) || event.match !== VM.on || balls.some((ball) => ball.rest < 0.3 && ball.m.position.y > 0.2 && ball.m.position.y < 2.1 && Math.hypot(ball.m.position.x - x, ball.m.position.z - z) < 0.35);
}
function emoKeyPeer(peer, now) {
  const event = peer.keyEmote, time = Math.max(0, (now - event.t0) / 1000);
  const stop = emoKeyInterrupted(event, peer.id, peer.x, peer.z);
  const [x, z] = stop ? [peer.x, peer.z] : emoKeyPosition(event, time);
  peer.keyPose = stop ? AVP.idle : emoKeySample(event.k, time, event.dir).pose;
  if (stop || time >= emoKeyDuration(event.k)) {
    peer.keyEmote = null; peer.pose = 0;
    /* 丟掉動作前的延遲位置，下一筆狀態才恢復一般同步。 */
    const row = { ...peer.last, t: now, x, z, yaw: event.yaw, y: 0, vx: 0, vz: 0 };
    peer.buf = [row]; peer.netTime = now; peer.netLanded = true;
    peer.keyStateAfter = now + netLat(peer.id) * 1000;
  }
  return [x, z, event.yaw, 0];
}
const emoTeam = (id) => (VM.on ? vmTeamOf(id) : 'all');
const emoName = (id) => (VM.names && VM.names[id]) || (NET.peers.get(id) || {}).n || '隊友';
const emoD = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
function emoMenuOpen() {
  if (EMO.menu || walk.dive || walk.down > 0 || walk.sit || walk.paused || window.__rkOn) return;
  // WEB-010：T 輪盤四格（左、右、上、下），放的是玩家在「球衣與裝備 → 動作與表情」選的
  const w = myWheel(), menu = $('emo-menu'); menu.querySelectorAll('button').forEach((b) => b.remove());
  w.forEach((k, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.emo = k; b.dataset.slot = i; b.textContent = `${EMOTES[k].icon} ${EMOTES[k].name}`; menu.append(b); });
  EMO.menu = { dx: 0, dy: 0, pick: null, w }; menu.hidden = false; emoMenuDraw();
}
function emoMenuMove(dx, dy = 0) {
  const m = EMO.menu; if (!m) return; m.dx = clamp(m.dx + dx, -90, 90); m.dy = clamp(m.dy + dy, -70, 70);
  const ax = Math.abs(m.dx), ay = Math.abs(m.dy), slot = Math.max(ax, ay) < 25 ? -1 : ax >= ay ? (m.dx < 0 ? 0 : 1) : (m.dy < 0 ? 2 : 3);
  m.pick = slot >= 0 ? m.w[slot] || null : null; emoMenuDraw();
}
function emoMenuDraw() { const m = EMO.menu; if (!m) return; $('emo-cur').style.transform = `translate(${m.dx}px, ${m.dy}px)`; for (const el of $('emo-menu').querySelectorAll('[data-emo]')) el.classList.toggle('on', el.dataset.emo === m.pick); }
function emoMenuClose(ok) { const m = EMO.menu; if (!m) return; EMO.menu = null; $('emo-menu').hidden = true; if (ok && m.pick) emoDo(m.pick); }
function emoDo(k) {
  if (Object.hasOwn(EMO_KEYS, k)) { emoKeyStart(k); return; }
  const me = vmMe(), now = performance.now();
  if (k === 'taunt') { walk.emote = { k: 'taunt', t0: now, until: now + 1600 }; toast('😜 嘲諷！', 1100); if (NET.on) NET.tx.publish('emo', { e: 'taunt', id: me }); return; }
  if (k !== 'hi5' && EMOTES[k]) { walk.emote = { k: 'up', t0: now, until: now + 1100 }; toast(`${EMOTES[k].icon} ${EMOTES[k].name}`, 1100); if (NET.on) NET.tx.publish('emo', { e: 'em', k, id: me }); return; }   // WEB-010 解鎖的表情：頭上冒圖示
  // 旁邊（2.5 m 內）有同隊的人正舉手等擊掌 → 回他；沒有就自己舉手邀請
  const mp = emoPos(me); let sid = me;
  for (const H of EMO.hi5.values()) if (H.stage === 'wait' && H.team === emoTeam(me) && H.by !== me) { const bp = emoPos(H.by); if (bp && mp && emoD(bp, mp) <= EMO.R + 0.3) { sid = H.by; break; } }
  emoHi5Join(sid, me, emoTeam(me));
  if (NET.on) NET.tx.publish('emo', { e: 'hi5', s: sid, id: me, tm: emoTeam(me) });
}
function emoHi5Join(sid, id, team) {
  const now = performance.now(); let H = EMO.hi5.get(sid);
  if (H && H.stage !== 'wait') { if (now < H.end + 600 || H.stage !== 'off') return; H = null; }
  if (!H) { H = { sid, by: sid, team, t0: now, members: new Set(), plan: [], stage: 'wait', end: 0 }; EMO.hi5.set(sid, H); if (VM.on && VM.host) emoAiPlan(H); }
  if (H.members.has(id)) return;
  if (id !== sid) { const p = emoPos(id), q = emoPos(sid); if (!p || !q || emoD(p, q) > EMO.R + 0.6) return; }   // 離太遠的不算
  H.members.add(id); const left = H.t0 + EMO.WIN - now;
  if (id === vmMe()) { walk.emote = { k: 'up', t0: now, until: now + left }; toast(id === sid ? '🙌 舉手等旁邊的隊友按 T 回擊掌…' : '🙌 回擊掌！', 1400); return; }
  const a = VM.ai.get(id); if (a) { a.pose = 14; a.swingT = left / 1000 + 0.1; }
  emoBubble(id, '🙌');
  if (id === sid && !a && emoTeam(vmMe()) === team) { const mp = emoPos(vmMe()), q = emoPos(id); toast(mp && q && emoD(mp, q) <= EMO.R ? `${emoName(id)} 想擊掌：按住 T 往左回擊掌` : `${emoName(id)} 想擊掌：走到他旁邊按 T`, 1600); }
}
// AI 隊友：只有站在旁邊（2.5 m 內）、而且是死球（等下一球發球前）才會回擊掌
function emoAiPlan(H) {
  if (H.team === 'all' || VM.phase !== 'dead') return;
  const c = emoPos(H.by); if (!c) return;
  for (const id of VM.team[H.team]) { if (!VM.ai.has(id) || id === H.by) continue; const p = emoPos(id); if (p && emoD(p, c) <= EMO.R && Math.random() < 0.85) H.plan.push({ id, at: H.t0 + 300 + Math.random() * 900 }); }
}
function emoPos(id) {
  if (id === vmMe()) return new THREE.Vector3(walk.x, 2.1, walk.z);
  const a = VM.ai.get(id); if (a) { const [x, z] = vmW(a.x, a.z); return new THREE.Vector3(x, 2.1 + a.y, z); }
  const p2 = NET.peers.get(id); return p2 ? new THREE.Vector3(p2.av.g.position.x, 2.1, p2.av.g.position.z) : null;
}
function emoSet(id, k, sec) { const now = performance.now(); if (id === vmMe()) walk.emote = { k, t0: now, until: now + sec * 1000 }; else { const a = VM.ai.get(id); if (a) { a.pose = k === 'slap' ? 15 : 17; a.swingT = sec; } } }
// 靠過去、轉向中間（自己和 AI；連線的人在他自己的畫面做，位置會傳過來）
function emoMove(id, q, C) {
  if (id === vmMe()) { walk.x += (q.x - walk.x) * 0.25; walk.z += (q.z - walk.z) * 0.25; let d = Math.atan2(-(C.x - walk.x), -(C.z - walk.z)) - walk.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); walk.yaw += d * 0.3; return; }
  const a = VM.ai.get(id); if (!a || !VM.host) return;
  a.faceW = { x: C.x, z: C.z }; if (VM.phase !== 'dead') return;   // 已經要發球了：不拉走（讓他回站位）
  const [lx, lz] = vmL(q.x, q.z); a.x += (lx - a.x) * 0.25; a.z += (lz - a.z) * 0.25; a.tx = a.x; a.tz = a.z;
}
function emoStep() {
  const now = performance.now();
  for (const [sid, H] of EMO.hi5) {
    if (H.stage === 'wait') {
      for (const p of H.plan) if (!p.done && now >= p.at) { p.done = true; emoHi5Join(sid, p.id, H.team); if (NET.on) NET.tx.publish('emo', { e: 'hi5', s: sid, id: p.id, tm: H.team }); }
      if (now < H.t0 + EMO.WIN) continue;
      const mine = H.members.has(vmMe());
      if (H.members.size < 2) { H.stage = 'off'; H.end = now; if (mine) { walk.emote = null; toast('旁邊沒人回擊掌…😅（要站近一點）', 1500); } continue; }
      // 往中間靠、面對面：兩個人各站中間點兩邊 0.38 m（相隔 0.76 m，伸手剛好碰到），人多就圍一圈
      const ps = [...H.members].map((id) => [id, emoPos(id)]).filter((q) => q[1]), C = new THREE.Vector3();
      for (const [, p] of ps) C.add(p); C.divideScalar(ps.length || 1);
      const r = ps.length === 2 ? 0.38 : 0.3 + 0.1 * ps.length;
      H.C = C; H.t1 = now; H.to = new Map(); H.stage = 'gather';
      ps.forEach(([id, p], i) => { let dx = p.x - C.x, dz = p.z - C.z, d = Math.hypot(dx, dz); if (d < 1e-3) { dx = Math.cos(i); dz = Math.sin(i); d = 1; } H.to.set(id, { x: C.x + (dx / d) * r, z: C.z + (dz / d) * r }); });
      for (const id of H.members) emoSet(id, 'gather', 0.95);
    } else if (H.stage === 'gather' || H.stage === 'slap') {
      for (const [id, q] of H.to) emoMove(id, q, H.C);
      if (H.stage === 'gather' && now - H.t1 > 400) {   // 雙手往中間一拍
        H.stage = 'slap'; for (const id of H.members) emoSet(id, 'slap', 0.6);
        const c = H.C.clone(); c.y = 1.95; vbBurst(c, '#F2B705', 26, 2.6); sfx('block', 0.8, c);
        if (H.members.has(vmMe())) toast(`擊掌！🙌 ×${H.members.size}`, 1500);
      }
      if (H.stage === 'slap' && now - H.t1 > 1000) { H.stage = 'off'; H.end = now; for (const id of H.members) { const a = VM.ai.get(id); if (a) a.faceW = null; } }
    } else if (now > H.end + 3000) EMO.hi5.delete(sid);
  }
}
/* Chat labels are independent of name tags, which can be hidden or refreshed. */
const chatBubbles = new Map();
function chatBubble(id, text) {
  if (id !== NET.me && !NET.peers.has(id)) return;
  let bubble = chatBubbles.get(id);
  if (!bubble) {
    const el = document.createElement('div'); el.className = 'room-chat-bubble';
    bubble = { label: new CSS2DObject(el), timer: null }; chatBubbles.set(id, bubble); scene.add(bubble.label);
  }
  bubble.label.element.textContent = text;
  clearTimeout(bubble.timer);
  bubble.timer = setTimeout(() => { scene.remove(bubble.label); bubble.label.element.remove(); chatBubbles.delete(id); }, 4000);
  chatBubbleStep();
}
function chatBubbleStep() {
  for (const [id, bubble] of chatBubbles) {
    const peer = NET.peers.get(id), self = id === NET.me;
    bubble.label.visible = self ? tpActive() : !!peer;
    if (self) bubble.label.position.set(walk.x, 2.5 + (walk.air?.y || 0), walk.z);
    else if (peer) { bubble.label.position.copy(peer.av.g.position); bubble.label.position.y += 2.5; }
  }
}
RoomChat.configure({
  online: () => NET.on,
  available: () => walk.on && !coarse() && !walk.paused && !VBSettings.isOpen,
  mount: () => $('walk-ui'),
  identity: () => ({ id: NET.me, n: NET.name }),
  publish: data => NET.tx.publish('chat', data),
  notice: text => toast(text),
  hold: () => {
    walk.keys.clear(); fly.keys.clear(); walk.target = null; walk.vel = [0, 0]; walk.crouch = false;
    walk.joy.x = walk.joy.y = 0; targetMark.visible = false;
    setMenuClose(false); emoMenuClose(false); unlockMouse();
  },
  release: () => { walk.keys.clear(); updateLockHint(); },
  bubble: chatBubble
});
function emoBubble(id, txt) {
  const a = VM.ai.get(id), p2 = NET.peers.get(id), el = (a && a.tag && a.tag.element) || (p2 && p2.tag && p2.tag.element); if (!el) return;
  let b = el.querySelector('.emo-b'); if (!b) { b = document.createElement('span'); b.className = 'emo-b'; el.prepend(b); }
  b.textContent = txt; clearTimeout(b._t); b._t = setTimeout(() => b.remove(), 2200);
}
function emoOnNet(d, from) {
  if (d.e === 'em' && Object.hasOwn(EMO_KEYS, d.k)) { emoKeyReceive({ ...d, id: from || d.id }); return; }
  if (d.e === 'taunt') { emoBubble(d.id, '😜'); if (VM.on && emoTeam(d.id) >= 0 && emoTeam(d.id) !== emoTeam(vmMe())) toast(`${emoName(d.id)} 在嘲諷你們 😜`, 1400); }
  else if (d.e === 'hi5') emoHi5Join(d.s || d.id, d.id, d.tm);
  else if (d.e === 'em' && EMOTES[d.k]) emoBubble(d.id, EMOTES[d.k].icon);   // WEB-010
}
function emoPose(k, t) {
  if (k === 'slap') return AVP.hi5Hit;
  if (k === 'gather') return AVP.hi5Two;
  if (k === 'taunt') { const w = Math.sin(t * 9); return { ...AVP.taunt, el: [1.3 + 0.45 * w, 1.3 + 0.45 * w] }; }   // 手掌朝上一勾一勾
  return AVP.hi5Up;
}
function myPoseCode() { if (walk.emote?.keyframes) return 0; if (walk.dive || walk.down > 0) { const sn = Math.sin(walk.diveDir || 0); return Math.abs(sn) > 0.6 ? (sn < 0 ? 11 : 12) : 10; } if (walk.emote && performance.now() < walk.emote.until) return { taunt: 16, slap: 15, gather: 17 }[walk.emote.k] || 14; if (window.__rkOn) { const P = RK.P[RK.my]; return P.swing ? (P.swing.over ? 7 : 8) : 6; } if (walk.air && walk.air.block) return 9; if (walk.spike || walk.serve || walk.swing) return 4; if (walk.air) return 5; if (walk.setQ || walk.setAim) return 2; if (walk.recv) return walk.crouch ? 3 : 19; if (skill.mode === 'set' || pose === 'setPush') return 2; if (skill.mode === 'bump' || pose === 'bumpHit') return walk.crouch ? 3 : 19; return walk.hold ? 1 : vbApproachK() > 0.4 ? 13 : walk.crouch && !walk.air ? 18 : 0; }
// WEB-018 network correction only.
function netSmoothBall(b, dt, courts) {
  const p = b.m.position, before = p.clone();
  const dx = p.x - walk.x, dz = p.z - walk.z;
  const speed2 = b.v.x * b.v.x + b.v.z * b.v.z;
  const ahead = clamp(-(dx * b.v.x + dz * b.v.z) / Math.max(speed2, 0.001), 0, 0.4 * VB.ts);
  const coming = dx * b.v.x + dz * b.v.z < 0 || speed2 < 1;   /* WEB-023：球往我這邊來（或幾乎不動）才算近身；隊友在旁邊把球打走時照樣柔和修正，不會瞬移 */
  const near = (Math.hypot(dx, dz) <= 3 && coming) || Math.hypot(dx + b.v.x * ahead, dz + b.v.z * ahead) <= 3;
  const age = b.errTime || 0, next = Math.min(0.25, age + dt);
  const remaining = t => 1 - 3 * (t / 0.25) ** 2 + 2 * (t / 0.25) ** 3;
  const k = near ? Math.min(1, dt * 10) : 1 - remaining(next) / Math.max(1e-9, remaining(age));
  b.errTime = near ? 0 : next;
  p.addScaledVector(b.err, k); b.err.multiplyScalar(1 - k);
  for (const c of courts) {
    if (b.room && !NET.ownBall) continue; /* 遠端路線以 n 事件確認碰網，不以顯示修正線段判斷。 */
    const [a0, z0] = toLocalOf(c, before.x, before.z), [a1, z1] = toLocalOf(c, p.x, p.z);
    if (a0 * a1 >= 0) continue;
    const f = a0 / (a0 - a1), y = before.y + (p.y - before.y) * f, z = z0 + (z1 - z0) * f;
    if (Math.abs(z) < 5.3 && y < NETS[state.net].h + BALL_R) { p.add(b.err); b.err = null; break; }
  }
  if (b.err && b.err.lengthSq() < 1e-5) b.err = null;
}
function netPeerSnapshot(p2, d, now) {
  const stamp = Number.isFinite(d.tm) ? d.tm * 1000 : null;
  if (p2.keyStateAfter != null && (stamp == null ? now : stamp + (p2.netOffset ?? now - stamp)) < p2.keyStateAfter) return false;
  p2.keyStateAfter = null;
  if (stamp != null && p2.netStamp != null && stamp <= p2.netStamp) return false;
  const hadState = !!p2.last, buf = p2.buf || (p2.buf = []);
  if (p2.last) p2.netGap = (p2.netGap || 150) * 0.85 + clamp(now - p2.last.t, 0, 500) * 0.15;
  if (stamp != null && p2.netOffset == null) p2.netOffset = now - stamp;
  const t = Math.max((buf[buf.length - 1]?.t ?? -Infinity) + 0.001, stamp == null ? now : stamp + p2.netOffset);
  if (stamp != null) p2.netStamp = stamp;
  const row = { t, x: d.x, z: d.z, y: d.y || 0, yaw: d.yaw, vx: d.vx || 0, vz: d.vz || 0 };
  buf.push(row);
  while (buf.length > 2 && (buf[1].t < t - 1000 || buf.length > 30)) buf.shift();
  p2.last = { ...row, t: now };
  if (d.jp && d.jp.s !== p2.jpS) {
    const first = p2.jpS == null; p2.jpS = d.jp.s;
    if (!first || hadState || row.y > 0) {
      const L = netLat(p2.id), g = d.jp.g || JUMP_G;
      p2.jump = d.jp.vy ? { g, vy: d.jp.vy - g * L, y: d.jp.vy * L - 0.5 * g * L * L } : { h: d.jp.h, T: d.jp.T, t: L };
      p2.jump.x = d.x; p2.jump.z = d.z; p2.netLanded = false;
      p2.x = d.x; p2.z = d.z;
    }
  }
  if (!p2.jump && row.y === 0) p2.netLanded = false;
  return true;
}
function netPeerPlayback(p2, dt, now) {
  if (p2.keyEmote) return emoKeyPeer(p2, now);
  const buf = p2.buf, latest = buf[buf.length - 1];
  const delay = clamp(1.5 * (p2.netGap || 150), typeof netFast === 'function' && netFast() ? 60 : 120, 300);   /* 台北伺服器：每 50 ms 一筆，緩衝 75 ms 就夠 */
  p2.netDelay = (p2.netDelay ?? delay) + (delay - (p2.netDelay ?? delay)) * (1 - Math.exp(-dt * 2));
  const time = Math.max(p2.netTime ?? -Infinity, now - p2.netDelay); p2.netTime = time;
  let l = buf[0], r = l;
  for (const row of buf) { if (row.t <= time) l = row; r = row; if (row.t >= time) break; }
  let x = l.x, z = l.z, yaw = l.yaw;
  if (r.t > l.t) {
    const f = clamp((time - l.t) / (r.t - l.t), 0, 1);
    x += (r.x - x) * f; z += (r.z - z) * f;
    yaw += Math.atan2(Math.sin(r.yaw - yaw), Math.cos(r.yaw - yaw)) * f;
  } else if (time > l.t) {
    /* Bound missing-stop overshoot to 4 cm as well as 0.2 seconds. */
    const age = Math.min(0.2, (time - l.t) / 1000), speed = Math.hypot(l.vx, l.vz);
    const span = Math.min(age, 0.04 / Math.max(speed, 0.001));
    x += l.vx * span; z += l.vz * span;
  }
  if (Math.hypot(latest.x - p2.x, latest.z - p2.z) > 3) { x = latest.x; z = latest.z; p2.netTime = latest.t; }
  const err = Math.hypot(x - p2.x, z - p2.z);
  const k = p2.seen == null || err > 3 ? 1 : Math.min(1 - Math.exp(-dt * 18), 8 * dt / Math.max(err, 0.001));
  x = p2.x + (x - p2.x) * k; z = p2.z + (z - p2.z) * k;
  yaw = p2.yaw + Math.atan2(Math.sin(yaw - p2.yaw), Math.cos(yaw - p2.yaw)) * k;
  p2.seen = true;
  let y = p2.netLanded ? 0 : p2.last.y;
  const j = p2.jump;
  if (j) {
    x = j.x; z = j.z;
    if (j.vy != null) { j.y += j.vy * dt - 0.5 * j.g * dt * dt; j.vy -= j.g * dt; y = Math.max(0, j.y); }
    else { j.t += dt; y = j.h * Math.sin(Math.PI * Math.min(1, j.t / j.T)); }
    if ((j.vy != null && j.y <= 0 && j.vy < 0) || (j.vy == null && j.t >= j.T)) {
      y = 0; p2.jump = null; p2.netLanded = true;
      p2.netTime = Math.max(p2.netTime, latest.t); p2.buf = [latest];
    }
  }
  return [x, z, yaw, y];
}
// Match protocol 2: only the host advances the accepted touch sequence.
function vmWireInit(host, data = VM.startData) {
  const session = host ? `${NET.me}:${Date.now()}:${Math.random().toString(36).slice(2)}` : data.session;
  VM.wire = { session, order: host ? new VBMatchSync.Authority(session) : new VBMatchSync.Receiver(session), frame: 0, sent: -Infinity, dirty: true, history: [], seen: new Map(), offset: null, pending: null, event: null, eventSeen: '', serial: 0 };
  if (host) Object.assign(data, { wire: 2, session });
  NET.ownBall = host; NET.hitBy = host ? NET.me : VM.hostId;
}
function vmWireBall(b) {
  return { p: b.m.position.toArray(), v: b.v.toArray(), q: b.m.quaternion.toArray(), s: b.spinW?.toArray(), a: b.acc?.toArray(), f: b.float ? [b.float.t, b.float.w, b.float.ph, b.float.a] : undefined, floor: b.floorHit?.slice(), sf: b.setFault, j: b.jump0 };
}
function vmWireApply(b, data) {
  b.m.position.set(...data.p); b.v.set(...data.v); b.m.quaternion.set(...(data.q || [0, 0, 0, 1]));
  b.spinW = data.s ? new THREE.Vector3(...data.s) : null; b.acc = data.a ? new THREE.Vector3(...data.a) : null;
  b.float = data.f ? { t: data.f[0], w: data.f[1], ph: data.f[2], a: data.f[3] } : null;
  b.floorHit = data.floor || null; b.floorReport = !!data.floor; b.floorT = performance.now();
  b.err = null; b.snap = null; b.waitFloor = null; b.floorEv = false; b.rest = 0; b.wireLocal = false;   /* 新的球路來了：切回照主機的球 */
  b.jump0 = data.j || null; b.setFault = data.sf || null; b.room = true;
}
function vmWireGetBall() {
  let b = VM.ball && balls.includes(VM.ball) ? VM.ball : balls.find(q => q.room && !q.langzi);
  if (!b) { const m = newBallMesh(); b = { m, v: new THREE.Vector3(), rest: 0, room: true }; m.userData.ball = b; ballsGroup.add(m); balls.push(b); }
  VM.ball = b; return b;
}
function vmWireHit(b, kind, quality) {
  const w = VM.wire;
  if (vmTeamOf(vmMe()) < 0 && !VM.host) return;
  if (!['serve', 'bump', 'set', 'spike', 'hit', 'tip', 'block'].includes(kind)) return;
  b.room = true; b.floorHit = null; b.floorReport = null; b.waitFloor = null; b.err = null;
  const data = vmWireBall(b);
  if (walk.air?.x0 != null) data.j = [walk.air.x0, walk.air.z0];
  if (VM.host) {
    w.order.seq++; NET.hitN = w.order.seq; NET.ownBall = true; NET.hitBy = NET.me;
    w.event = { seq: w.order.seq, actor: vmMe(), kind, quality, p: data.p }; w.dirty = true;
  } else {
    // Predict the local action immediately, but never claim authority over its result.
    if (w.pending) return;
    const now = performance.now(), request = { session: w.session, round: w.order.round, base: w.order.seq, id: ++w.serial, at: now + (w.offset || 0), kind, quality, ball: data };
    VM.ball = b; b.wireRemote = true;
    w.pending = { request, since: now, sent: now }; b.wirePrediction = { ball: data, at: now };
    NET.tx.publish('match-claim', request);
  }
}
function vmWireClaim(d, from) {
  const w = VM.wire, now = performance.now();
  if (!VM.host || !d || d.session !== w.session || vmTeamOf(from) < 0 || !Number.isInteger(d.id)) return;
  const key = `${from}:${d.id}`;
  if (w.seen.has(key)) { NET.tx.publish('match-ack', { session: w.session, to: from, id: d.id, accepted: w.seen.get(key) }); w.dirty = true; return; }
  let valid = VBMatchSync.validBall(d.ball) && Number.isFinite(d.at) && d.at <= now + 100 && d.at >= now - 600;
  if (valid && VM.phase === 'serve') valid = d.kind === 'serve' && from === vmServer();
  else if (valid && VM.phase === 'rally' && d.kind !== 'serve') {
    const at = clamp(d.at, now - 350, now);
    const history = w.history.filter(h => h.seq === d.base && Math.abs(h.at - at) < 100 && !h.floor);
    valid = history.some(h => Math.hypot(...h.p.map((n, i) => n - d.ball.p[i])) < .95);
    const peer = NET.peers.get(from)?.last;
    valid = valid && !!peer && Math.hypot(peer.x - d.ball.p[0], peer.z - d.ball.p[2]) < 3.5;
  } else valid = false;
  const accepted = !!(valid && w.order.claim(d));
  w.seen.set(key, accepted); if (w.seen.size > 128) w.seen.delete(w.seen.keys().next().value);
  NET.tx.publish('match-ack', { session: w.session, to: from, id: d.id, accepted });
  if (!accepted) { w.dirty = true; return; }
  const b = vmWireGetBall(); vmWireApply(b, d.ball); b.mine = false; b.lk = d.kind;
  NET.hitN = w.order.seq; NET.hitBy = NET.me; NET.ownBall = true;
  w.event = { seq: w.order.seq, actor: from, kind: d.kind, quality: clamp(Number(d.quality) || 1, 0, 1.5), p: d.ball.p, id: d.id };
  vmOnTouch(b, from, d.kind); vbImpact(b, d.kind, w.event.quality);
  // Advance only the accepted outgoing flight, using elapsed host time.
  if (VM.phase === 'rally') {
    const age = clamp((now - d.at) / 1000, 0, .35);
    // Let normal swept collision steps handle the network catch-up, not a position teleport.
    b.wireCatchup = age;
  }
  w.dirty = true;
}
function vmWireReceive(d, from) {
  const w = VM.wire, previousRound = w.order.round;
  if (VM.host || from !== VM.hostId || !w.order.accept(d)) return;
  if (d.round !== previousRound && d.server !== NET.me) vmDropHeld();
  const now = performance.now();
  if (w.offset == null) w.offset = d.at + netLat(from) * 1000 - now;
  if (Number.isFinite(d.time)) for (const row of d.ai || []) {
    const ai = VM.ai.get(row[0]); if (!ai) continue;
    ai.netOffset = d.at - d.time * 1000 - w.offset;
    vmAiSnapshot(ai, row, now);
  }
  w.latest = d; VM.sc = d.sc; VM.phase = d.phase; VM.srvId = d.server; VM.tc = d.tc;
  NET.hitN = d.seq; NET.hitBy = from; NET.ownBall = false;
  if (w.pending && (d.round !== w.pending.request.round || d.seq > w.pending.request.base)) w.pending = null;
  if (!d.ball) { if (!w.pending) { vmClearBalls(); VM.ball = null; } return; }
  const b = vmWireGetBall(), hadFrame = !!b.wireFrame;
  const before = b.m.position.clone(); if (b.wireVisualError) before.add(b.wireVisualError);
  b.wireRemote = true;
  if (!w.pending && !(d.ball.floor && b.wireLocal)) {   /* 已經落地、本機在算彈跳：同一個落地的球路不要再把球拉回落點 */
    b.wirePrediction = null; vmWireApply(b, d.ball);
    const age = clamp((now + w.offset - d.at) / 1000, 0, .35), flight = VBMatchSync.sample(d.ball, age * VB.ts, BALL_R, age);
    const error = before.sub(new THREE.Vector3(...flight.p));
    b.m.position.set(...flight.p); b.v.set(...flight.v); b.m.quaternion.set(...flight.q);
    b.wireVisualError = hadFrame && !d.ball.floor && error.length() < 2 ? error : null;
  }
  b.wireFrame = d;
  const event = d.event, eventKey = `${d.round}:${event?.seq}`;
  if (event && w.eventSeen !== eventKey) {
    w.eventSeen = eventKey; b.lk = event.kind; b.mine = event.actor === NET.me;
    if (event.kind === 'set') vbMarkSet(b);
    if (event.actor !== NET.me) sfx(event.kind, event.quality, new THREE.Vector3(...event.p));
  }
}
function vmWireRemoteStep(b, dt) {
  const prevV = b.v.clone();   /* 落地前一刻的速度：落地後拿來彈跳 */
  const w = VM.wire, now = performance.now(), prediction = w.pending && b.wirePrediction;
  const frame = b.wireFrame || w.latest;
  if (!prediction && !frame?.ball) return;
  const ball = prediction ? prediction.ball : frame.ball;
  const age = clamp((prediction ? now - prediction.at : now + (w.offset || 0) - frame.at) / 1000, 0, .35);
  const flight = VBMatchSync.sample(ball, age * VB.ts, BALL_R, age);
  b.m.position.set(...flight.p); b.v.set(...flight.v); b.m.quaternion.set(...flight.q);
  if (b.wireVisualError) b.wireVisualError.multiplyScalar(Math.exp(-dt / .08));
  if (ball.floor) { b.m.position.set(ball.floor[0], BALL_R, ball.floor[1]); b.v.copy(prevV); if (b.v.y > -0.5) b.v.y = -0.5; b.floorHit = ball.floor.slice(); b.floorReport = true; b.waitFloor = null; b.wireLocal = true; }   /* 落地後交給本機物理彈跳滾動，不再釘在落點 */
  if (!prediction && !ball.floor && vmTeamOf(vmMe()) >= 0) vbBlockTest(b, dt * VB.ts);
  if (b === VM.ball) vmTrailPush(b.m.position);
}
function vmWireRender(begin) {
  const b = VM.on && VM.wire && !VM.host && VM.ball;
  if (!b) return;
  if (begin && b.wireVisualError) { b.wireRenderPosition = b.m.position.clone(); b.m.position.add(b.wireVisualError); }
  else if (!begin && b.wireRenderPosition) { b.m.position.copy(b.wireRenderPosition); b.wireRenderPosition = null; }
}
function vmWireTick() {
  if (!VM.on || !VM.wire || !NET.on) return;
  const w = VM.wire, now = performance.now();
  if (!VM.host) {
    const p = w.pending;
    if (p && now - p.since > 1000) { w.pending = null; if (VM.ball) VM.ball.wirePrediction = null; }
    else if (p && now - p.sent > 200) { p.sent = now; NET.tx.publish('match-claim', p.request); }
    return;
  }
  const b = VM.ball && balls.includes(VM.ball) ? VM.ball : null;
  if (b) w.history.push({ at: now, seq: w.order.seq, p: b.m.position.toArray(), floor: !!b.floorHit });
  while (w.history.length && w.history[0].at < now - 700) w.history.shift();
  if (!w.dirty && now - w.sent < (VM.phase === 'rally' ? (typeof netFast === 'function' && netFast() ? 50 : 100) : (typeof netFast === 'function' && netFast() ? 200 : 400))) return;
  w.sent = now; w.dirty = false;
  NET.tx.publish('match-frame', { session: w.session, frame: ++w.frame, round: w.order.round, seq: w.order.seq, at: now, time: VM.t, ai: vmStatePayload().ai, ball: b ? vmWireBall(b) : null, event: w.event, sc: VM.sc, phase: VM.phase, server: vmServer(), tc: VM.phase === 'rally' && VM.touch.team >= 0 && !VM.touch.serve ? [VM.touch.team, VM.touch.n] : null });
}
function vmJudgePenetration() {
  if (!VM.host || VM.phase !== 'rally') return;
  for (const team of [0, 1]) for (const id of VM.team[team]) {
    const ai = VM.ai.get(id), peer = NET.peers.get(id)?.last;
    const p = ai ? { x: ai.x, z: ai.z, y: ai.y } : id === vmMe() ? { x: vmL(walk.x, walk.z)[0], z: vmL(walk.x, walk.z)[1], y: walk.air?.y || 0 } : peer ? { x: vmL(peer.x, peer.z)[0], z: vmL(peer.x, peer.z)[1], y: peer.y || 0 } : null;
    // Approximate the sole as 20 cm: touching the centre line is still permitted.
    if (p && p.y < .08 && Math.abs(p.z) < 4.5 && p.x * vmSide(team) < -.2 && Math.abs(p.x) < 9) { vmPoint(1 - team, `越過中線犯規（${vmName(id)}的腳完全進入對方球場）`); return; }
  }
}
function netOnMessage(t, d, from) {
  if (from === NET.me) return;
  if (VM.on && VM.wire) {
    if (t === 'match-claim') { vmWireClaim(d, from); return; }
    if (t === 'match-frame') { vmWireReceive(d, from); return; }
    if (t === 'match-ack') {
      if (from === VM.hostId && d.session === VM.wire.session && d.to === NET.me && d.id === VM.wire.pending?.request.id && !d.accepted) { VM.wire.pending = null; if (VM.ball) VM.ball.wirePrediction = null; }
      return;
    }
    if (t === 'ball' && d.w !== 'kick') return;
  }
  if (t === 'chat') { RoomChat.receive(d, from); return; }
  if (t === 'room-settings') { if (ROOM) ROOM.receive(d, from); return; }
  if (t === 'room-match-sync') { if (ROOM?.isHost && VM.on && VM.host && VM.startData) { NET.tx.publish('vm', VM.startData); vmBroadcast(true); } return; }
  if (t === 'ping') { NET.tx.publish('pong', { to: from, t: d.t, hostTime: performance.now() }); return; }   // 量延遲
  if (t === 'pong') { if (d.to === NET.me) { const half = (performance.now() - d.t) / 2, o = NET.lat.get(from); NET.lat.set(from, o == null ? half : o * 0.7 + half * 0.3); if (VM.wire && !VM.host && from === VM.hostId && Number.isFinite(d.hostTime)) { const offset = d.hostTime + half - performance.now(); VM.wire.offset = VM.wire.offset == null ? offset : VM.wire.offset * .8 + offset * .2; } } return; }
  if (t === 'st') {
    const p2 = NET.peers.get(from) || netPeer(from, { n: d.n, c: d.c });
    // 位置與朝向依個別真人時間軸播放，動作保留最新狀態。
    if (!netPeerSnapshot(p2, d, performance.now())) return;
    if (d.vm && !VM.on && (!ROOM || from === ROOM.host) && performance.now() - (NET.matchSyncAt || -Infinity) > 1000) {
      NET.matchSyncAt = performance.now();
      NET.tx.publish('room-match-sync', {});
    }
    if (d.vm && VM.on && !VM.host && from === VM.hostId) vmOnNet({ e: 'st', ...d.vm }, from);
    const dch = normalizeLook(d.ch);
    p2.ch = dch; refreshPeerAppearance(p2);
    p2.tj = d.tj || null;   // WEB-010 球隊球衣
    if ((d.tt || '') !== (p2.tt || '')) { p2.tt = String(d.tt || '').slice(0, 12); p2.tag.element.textContent = peerTag(p2); }   // WEB-010 稱號
    if (d.n && p2.n !== d.n) { p2.n = String(d.n).slice(0, 24); p2.tag.element.textContent = peerTag(p2); renderMpList(); }
    p2.pose = d.p; p2.rk = d.rk || null; rkPeerAi(p2, d.ai); p2.sta = d.sta ?? null;
    p2.tossing = !!d.ts; p2.bs = d.bs || 0;   // 攔網雙手往哪邊移
    if (d.b) { if (!p2.ball) { p2.ball = newBallMesh(); scene.add(p2.ball); } if (d.ts && !p2.ball.visible) p2.ball.position.set(...d.b); p2.ballT = d.b; p2.ball.visible = true; }
    else if (p2.ball) p2.ball.visible = false;
  } else if (t === 'ball') {
    if (d.w === 'kick') { langziReceive(d, from); return; }
    if (d.w !== 'serve' && balls.some(q => q.langzi && q.kickSource?.room && q.kickSource.h === d.h && q.kickSource.by === d.by)) return;
    if (VM.on && vmTeamOf(from) < 0 && from !== VM.hostId) return;
    // 擊球序號：比我新的＝別人打到了；一樣的序號而且是現在負責的人＝一般位置更新；一樣的序號但不同人＝同時打到，代號大的算
    if (VM.on && d.w === 'throw') return;   // 比賽中有人把手上的球丟出來：不理，不會取代比賽球
    // 比賽中輪到的人發出去的那一下：不管序號一定收（序號剛好被別的事件超過時，主機會整個忽略發球＝球不見、不判分）
    const srvHit = VM.on && d.w === 'serve' && VM.phase === 'serve' && d.by === (VM.host ? vmServer() : VM.srvId);
    if (d.g && (d.h !== NET.hitN || d.by !== NET.hitBy || from !== d.by)) return;
    const newer = d.h > NET.hitN || srvHit, sameOwner = d.h === NET.hitN && d.by === NET.hitBy, tie = d.h === NET.hitN && d.by !== NET.hitBy && d.by > NET.hitBy;
    if (!newer && !sameOwner && !tie) { if (d.w && VM.on) console.warn('[連線] 忽略一下擊球', d.w, d.by, d.h, NET.hitN, NET.hitBy); return; }
    if (newer || tie) { NET.hitN = Math.max(NET.hitN, d.h); NET.hitBy = d.by; NET.ownBall = false; }
    if (VM.on && !VM.host && roomSpectator() && VM.watchFrames) {
      if ((newer || tie) && ['serve', 'hit', 'spike', 'tip', 'bump', 'set', 'block'].includes(d.w)) {
        sfx(d.w, d.q ?? 1, new THREE.Vector3(...d.p));
      }
      return;
    }
    let b = balls.find((q) => q.room);
    if (b && sameOwner && b.floorReport) return; /* 落地後舊校正不能覆蓋落點。 */
    const P = new THREE.Vector3(d.p[0], d.p[1], d.p[2]);
    if (!b) { const m = newBallMesh(); ballsGroup.add(m); b = { m, v: new THREE.Vector3(), rest: 0, room: true }; m.userData.ball = b; balls.push(b); b.m.position.copy(P); }
    if (VM.on && !VM.host) VM.ball = b;
    // 訊息裡的球是對方「送出那一刻」的位置；傳到我這裡已經過了一小段時間（約 0.1 秒），不能照舊位置把球拉回去（會閃）
    //   新的擊球：沿著新的路線往前補上延遲那一段，再在約 0.25 秒內平滑靠過去
    //   一般校正：在對方的路線上找離我這顆球最近的一點；差不到 35 cm 就不動，差多了才慢慢拉過去
    const V = new THREE.Vector3(d.v[0], d.v[1], d.v[2]), A = d.a ? new THREE.Vector3(d.a[0], d.a[1], d.a[2]) : new THREE.Vector3(), gy = -9.8 + A.y;
    const at = (tau) => [new THREE.Vector3(P.x + V.x * tau + 0.5 * A.x * tau * tau, Math.max(BALL_R, P.y + V.y * tau + 0.5 * gy * tau * tau), P.z + V.z * tau + 0.5 * A.z * tau * tau), new THREE.Vector3(V.x + A.x * tau, V.y + gy * tau, V.z + A.z * tau)];
    const cur = b.m.position; let tgt = null, vel = null;
    if (newer || tie) [tgt, vel] = at(netLat(from) * VB.ts);   // 照這個人實際的延遲往前補
    else { let best = 1e9; for (let tau = 0; tau <= 0.6 * VB.ts; tau += 0.01) { const [q, w] = at(tau), dd = q.distanceTo(cur); if (dd < best) { best = dd; tgt = q; vel = w; } } if (best < 0.35) tgt = null; }
    if (tgt) { b.err = tgt.clone().sub(cur); b.errTime = 0; b.v.copy(vel); }
    b.acc = d.a ? A.clone() : null; if (newer || tie || !b.float) b.float = d.f ? { t: d.f[0], w: d.f[1], ph: d.f[2], a: d.f[3] } : null; if (newer || tie) { b.floorHit = null; b.floorReport = null; b.floorEv = false; b.waitFloor = null; }
    b.rest = 0; b.spike = d.k ? { c: state.items.find((c) => c.id === d.k.c) || null, sg: d.k.sg } : null; if (b.spike && !b.spike.c) b.spike = null;
    if (newer) recHit({ x: P.x, y: P.y, z: P.z, v: b.v.length(), by: d.by, kind: d.w || 'hit' });
    if (newer || tie) { b.mine = false; if (d.w === 'set') vbMarkSet(b); }
    if ((newer || tie) && d.w) {
      b.lk = d.w;
      if (d.w !== 'set') { b.setT = null; if (VB.setSpot?.b === b) VB.setSpot = null; }
      if (['serve', 'hit', 'spike', 'tip', 'bump', 'set', 'block'].includes(d.w)) vbImpact(b, d.w, d.q ?? 1);
    }
    if (newer || tie) b.spinW = d.s ? new THREE.Vector3(d.s[0], d.s[1], d.s[2]) : null;
    if (d.n && sameOwner) { const [q2, w2] = at(0.05 * VB.ts); cur.copy(q2); b.v.copy(w2); b.err = null; b.floorHit = null; }   // 碰網：照負責的人那邊的結果直接對齊（不會在你這邊過網、他那邊掛網）
    if (d.g && sameOwner && Array.isArray(d.g) && d.g.length === 2 && d.g.every(Number.isFinite)) {
      b.floorHit = d.g.slice(); b.floorReport = true; b.floorT = performance.now(); b.waitFloor = null;
      cur.set(d.g[0], BALL_R, d.g[1]); b.v.copy(V); b.err = null; b.snap = null; b.acc = null; b.float = null;
    }
    if (newer) { b.jump0 = d.j || null; b.setFault = d.sf || null; vmOnTouch(b, d.by, d.w); }
    for (const q of balls.filter((q2) => q2 !== b && q2.room)) { ballsGroup.remove(q.m); balls.splice(balls.indexOf(q), 1); }
  } else if (t === 'ball-sound') {
    if (from !== NET.hitBy || !['floor', 'wall', 'net', 'tape', 'antenna'].includes(d.kind)) return;
    if (!Array.isArray(d.p) || d.p.length !== 3 || !d.p.every(Number.isFinite) || !Number.isFinite(d.seq)) return;
    const peer = NET.peers.get(from); if (!peer || d.seq <= (peer.soundSeq || 0)) return;
    peer.soundSeq = d.seq;
    sfx(d.kind, clamp(Number(d.q) || 1, 0, 1.5), new THREE.Vector3(...d.p));
  } else if (t === 'emo') { emoOnNet(d, from);
  } else if (t === 'vm') { vmOnNet(d, from);
  } else if (t === 'rk') { rkOnNet(d, from);
  } else if (t === 'grab') {
    if (VM.on) return;   // 比賽中不能拿球：別人拿球的訊息不理（不然比賽球會被收走）
    if (d.h < NET.hitN || (d.h === NET.hitN && d.by <= NET.hitBy)) return;
    NET.hitN = d.h; NET.hitBy = d.by; NET.ownBall = false;
    for (const q of balls.filter((q2) => q2.room)) { ballsGroup.remove(q.m); balls.splice(balls.indexOf(q), 1); }
  }
}
// 我碰到／丟出球：這顆變成房間共用的球，由我廣播它的位置與速度
function netFloorHit(b) {
  if (!NET.on || !b.room || !NET.ownBall || b.floorReport) return;
  b.floorReport = true;
  if (VM.on && VM.wire) { VM.wire.dirty = true; return; }
  const m = netBallMsg(b); m.g = b.floorHit.slice();
  NET.tx.publish('ball', m); /* 每段球權第一次落地才送，不更動一般校正節奏。 */
}
function netBallHit(b, kind, quality = 1) {
  if (kind === 'kick') { if (NET.on) langziSend(b); return; }
  if (VM.on && VM.wire) { vmWireHit(b, kind, quality); return; }
  if (b.langzi && VM.on) return;
  b.langzi = false;
  if (!NET.on) return;
  for (const q of balls) if (q !== b && q.room) { ballsGroup.remove(q.m); balls.splice(balls.indexOf(q), 1); }
  b.floorHit = null; b.floorReport = null; b.floorEv = false;
  b.room = true; NET.hitN++; NET.hitBy = NET.me; NET.ownBall = true; NET.lastBall = performance.now(); b.err = null;
  NET.tx.publish('ball', { ...netBallMsg(b, kind), q: quality });
}
function recHit(e) { if (typeof recEvent === 'function') recEvent('hit', e); }
function netBallMsg(b, kind) {
  const m = { h: NET.hitN, by: NET.me, p: b.m.position.toArray().map((v) => +v.toFixed(3)), v: b.v.toArray().map((v) => +v.toFixed(3)) };
  if (kind) m.w = kind;
  if (b.spike && b.spike.c) m.k = { c: b.spike.c.id, sg: b.spike.sg };
  if (b.acc) m.a = b.acc.toArray().map((q) => +q.toFixed(2));
  if (b.spinW) m.s = b.spinW.toArray().map((q) => +q.toFixed(1));
  if (b.setFault) m.sf = b.setFault;
  if (b.float) m.f = [+b.float.t.toFixed(3), +b.float.w.toFixed(3), +b.float.ph.toFixed(3), +b.float.a.toFixed(2)];
  if ((kind === 'spike' || kind === 'tip' || kind === 'hit') && walk.air && walk.air.x0 != null) m.j = [+walk.air.x0.toFixed(2), +walk.air.z0.toFixed(2)];   // 起跳點：開局的人照這個判後排攻擊（不用猜你在哪起跳）
  return m;
}
function netGrab() { if (!NET.on) return; NET.hitN++; NET.hitBy = NET.me; NET.ownBall = false; NET.tx.publish('grab', { h: NET.hitN, by: NET.me }); }
function netTick(dt, now) {
  if (!NET.on) return;
  if (NET.peers.size && now - NET.pingT > (VM.on ? 5000 : 3000)) { NET.pingT = now; NET.tx.publish('ping', { t: now }); }   /* 比賽每 5 秒量一次延遲 */
  // 我的狀態：移動中每秒 3 次、站著每 2 秒 1 次；帶上移動速度，別人用速度往前推算，畫面不用等下一筆
  const kv = 1 - Math.exp(-dt * 10); NET.vx = (NET.vx || 0) + (((walk.x - (NET.px ?? walk.x)) / Math.max(dt, 1e-3)) - (NET.vx || 0)) * kv; NET.vz = (NET.vz || 0) + (((walk.z - (NET.pz ?? walk.z)) / Math.max(dt, 1e-3)) - (NET.vz || 0)) * kv; NET.px = walk.x; NET.pz = walk.z;
  const toss = walk.jserve && !walk.jserve.hit ? walk.jserve.ball : walk.serve && !walk.serve.hit ? walk.serve.ball : null;   // 正在拋球發球
  let bp = null; if (walk.hold || toss) { const v = new THREE.Vector3(); (toss || walk.hold).getWorldPosition(v); bp = v.toArray().map((q) => +q.toFixed(2)); }
  const st = { tm: +(now / 1000).toFixed(2), sta: staGame() ? +STA.v.toFixed(2) : undefined, x: +walk.x.toFixed(2), z: +walk.z.toFixed(2), y: +(window.__rkOn ? RK.P[RK.my].jy || 0 : Math.max(0, camera.position.y - EYE)).toFixed(2), yaw: +walk.yaw.toFixed(3), p: myPoseCode(), n: NET.name, tt: myTitle() || undefined, tj: VM.on ? undefined : readTeamJersey() || undefined, c: NET.color, ch: myChar() || 'none', b: bp, bs: walk.air && walk.air.block && walk.blkShift ? +walk.blkShift.toFixed(2) : undefined, rk: window.__rkOn ? RK.k : undefined, ai: window.__rkOn ? rkAiState() : undefined, vx: +NET.vx.toFixed(2), vz: +NET.vz.toFixed(2), jp: NET.jp || undefined };
  // 2 對 2 的主機：比分、階段、AI 位置一起放在自己的狀態裡送（不另外送）；有事（得分、換發球、觸球數變了）馬上送
  if (VM.on && VM.host) { st.vm = vmStatePayload(); if (NET.vmPend) { Object.assign(st.vm, NET.vmPend); NET.vmPend = null; } }
  const L = NET.lastSent, poseChanged = !L || st.p !== L.p, moved = !L || JSON.stringify(st.ai) !== JSON.stringify(L.ai) || Math.hypot(st.x - L.x, st.z - L.z) > 0.05 || Math.hypot(st.vx - L.vx, st.vz - L.vz) > 0.4 || Math.abs(st.yaw - L.yaw) > 0.07 || Math.abs(st.y - L.y) > 0.05 || !!st.b !== !!L.b || (VM.on && VM.host);
  if (toss) st.ts = 1;   // 拋球中：主機知道你正在發，不會在拋球途中判 8 秒
  const rally = VM.on && VM.phase === 'rally';
  const fast = netFast();
  const gap = fast ? (toss ? 50 : document.hidden ? 10000 : rally ? (moved ? 50 : 300) : moved ? 100 : 1000) : toss ? 80 : VM.on && VM.host ? (document.hidden ? 10000 : rally ? 150 : 400) * NETQ.slow :(document.hidden ? 10000 : rally ? (moved ? 150 : 600) : moved ? 330 : 2000) * NETQ.slow;
  if (NET.forceSt || (poseChanged && now - NET.lastSt > (fast ? 40 : 120)) || now - NET.lastSt > gap) { NET.forceSt = false; NET.lastSt = now; NET.lastSent = st; NET.tx.publish('st', st); }
  // 我負責的球：擊球那一下已經送了（位置＋速度，大家各自算物理）；飛行中每秒校正 1 次就好
  const rb = !VM.wire && NET.ownBall && balls.find((q) => q.room);
  if (rb && rb.rest < 0.5 && now - NET.lastBall > (VM.on && VM.phase === 'rally' ? 400 : 1000) * NETQ.slow) { NET.lastBall = now; NET.tx.publish('ball', netBallMsg(rb)); }
  // 對方的人形：緩衝位置與朝向；起跳、動作維持現在時間。
  const k = 1 - Math.exp(-dt * 14);
  for (const p2 of NET.peers.values()) {
    refreshPeerAppearance(p2);
    const Ls = p2.last; if (!Ls) continue;
    const ox = p2.x, oz = p2.z;
    p2.keyPose = null;
    const [x, z, yaw, y] = netPeerPlayback(p2, dt, now);
    p2.vx = (x - ox) / Math.max(dt, 1e-3); p2.vz = (z - oz) / Math.max(dt, 1e-3);
    const sp = Math.hypot(p2.vx, p2.vz);
    p2.x = x; p2.z = z; p2.y = y; p2.yaw = yaw;
    sqFromMotion(p2, x, z, y, dt);   /* WEB-023：別的真人的腳步聲 */
    const av = p2.av; av.g.position.set(x, 0, z); av.g.rotation.y = yaw + Math.PI; av.body.position.y = y;
    // 走路：速度越快腿擺越大；空中時兩腳收起
    av.phase += dt * Math.min(12, sp * 5.5);
    // 手臂：0 一般（跟著走路擺）、1 拿球、2 舉球（兩手高舉）、3 墊球（兩手併攏往前下）、4 攻擊（右手高舉）、5 跳
    if (p2.rk && p2.racketK !== p2.rk) { if (p2.racket) av.hands[0].remove(p2.racket); p2.racket = makeRacket(p2.rk); av.hands[0].add(p2.racket); p2.racketK = p2.rk; }
    else if (!p2.rk && p2.racket) { av.hands[0].remove(p2.racket); p2.racket = null; p2.racketK = null; }
    // 姿勢代碼換了就從頭做一次那個動作（扣球揮臂、舉球推出去…）
    if (p2.pose !== p2.poseC) { p2.poseC = p2.pose; p2.poseT = 0; } p2.poseT = (p2.poseT || 0) + dt;
    av.fall = p2.pose >= 10 && p2.pose <= 12 ? { a: 1, d: DIVE_D[p2.pose - 10], t: p2.poseT } : null;   // 撲救：整個人往撲的方向倒
    avDrive(av, p2.keyPose || (p2.pose === 9 ? avBlockPose(p2.bs) : avPoseOf(p2.pose, p2.poseT / 0.45)), p2.keyPose ? 1 : Math.min(1, k * 1.3), p2.keyPose ? 0 : sp, y > 0.08);   /* 攔網偏移與關鍵影格姿勢 */
    if (p2.ball && p2.ballT) p2.ball.position.lerp(new THREE.Vector3(...p2.ballT), k);
    if (p2.aiAv && p2.aiT) { const A = p2.aiAv, T = p2.aiT; A.g.position.lerp(new THREE.Vector3(T[0], 0, T[1]), k); A.g.rotation.y = T[2]; avDrive(A, avPoseOf(T[3], 0.5), k, 0); }
  }
}
