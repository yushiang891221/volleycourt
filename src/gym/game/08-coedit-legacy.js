// ---------------------------------------------------------------- 即時共同編輯：同一個球館（候選場地／現有球館／自由規劃）頁面的人自動連在一起
// 改了什麼（元件、區域、牆、建物、顏色…）只送「差異」，別人那邊立刻套用；新進來的人先跟已經在的人同步一次完整配置
const CO = { on: false, tx: null, me: '', name: '', last: null, timer: 0, applying: false, peers: new Map(), parts: new Map(), toastT: 0 };
function coSnap() {
  return { name: state.name, building: JSON.parse(JSON.stringify(state.building)), floor: state.floor, colors: { ...(state.colors || {}) }, net: state.net,
    zones: state.zones.map((z) => ({ ...z })), walls: (state.walls || []).map((w) => ({ ...w })), items: state.items.map((i) => ({ ...i })) };
}
function coDiff(a, b) {
  const d = {}; let any = false;
  for (const k of ['name', 'building', 'floor', 'colors', 'net']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { d[k] = b[k]; any = true; }
  for (const [k, ku, kr] of [['items', 'iu', 'ir'], ['zones', 'zu', 'zr'], ['walls', 'wu', 'wr']]) {
    const A = new Map(a[k].map((x) => [x.id, JSON.stringify(x)])), Bm = new Map(b[k].map((x) => [x.id, x]));
    const up = b[k].filter((x) => A.get(x.id) !== JSON.stringify(x)), rm = [...A.keys()].filter((id) => !Bm.has(id));
    if (up.length) { d[ku] = up; any = true; } if (rm.length) { d[kr] = rm; any = true; }
    if (up.length || rm.length) d[k + 'O'] = b[k].map((x) => x.id);   // 順序（疊放順序會影響畫面）
  }
  return any ? d : null;
}
function coApplyDiff(d) {
  const s0 = coSnap();
  for (const k of ['name', 'building', 'floor', 'colors', 'net']) if (k in d) s0[k] = d[k];
  for (const [k, ku, kr] of [['items', 'iu', 'ir'], ['zones', 'zu', 'zr'], ['walls', 'wu', 'wr']]) {
    const M = new Map(s0[k].map((x) => [x.id, x]));
    for (const id of d[kr] || []) M.delete(id);
    for (const x of d[ku] || []) M.set(x.id, x);
    const order = d[k + 'O'];
    s0[k] = order ? order.map((id) => M.get(id)).filter(Boolean).concat([...M.values()].filter((x) => !order.includes(x.id))) : [...M.values()];
  }
  coReplace(s0);
}
// 收到別人的修改前：我這邊還沒送出去的修改先送（不然會被蓋掉）
function coFlush() {
  if (!CO.on || !CO.timer) return;
  clearTimeout(CO.timer); CO.timer = 0;
  const now = coSnap(), d = CO.last && coDiff(CO.last, now); CO.last = now;
  if (d) { const msg = JSON.stringify(d); if (msg.length < 48000) CO.tx.publish('ed', d); else coSendFull(); }
}
function coReplace(raw) {
  const keepSel = selectedId, keepZone = selZoneId;
  CO.applying = true;
  state = sanitize({ ...raw, id: state.id });
  if (keepSel && !state.items.some((i) => i.id === keepSel)) selectedId = null;
  if (keepZone && !state.zones.some((z) => z.id === keepZone)) selZoneId = null;
  fullRefresh(); if (mode === 'plan') renderPlan(); renderZoneSel(); renderZoneTable(); planToolState();
  if (walk.on) updateZoneCard(true);
  CO.last = coSnap(); CO.applying = false;
}
function coQueue() {
  if (!CO.on || CO.applying) return;
  clearTimeout(CO.timer);
  CO.timer = setTimeout(() => {
    CO.timer = 0;
    const now = coSnap(), d = CO.last && coDiff(CO.last, now);
    CO.last = now;
    if (!d) return;
    const msg = JSON.stringify(d);
    if (msg.length < 48000) CO.tx.publish('ed', d); else coSendFull();
  }, 160);
}
// 完整配置：太大就切成好幾段送（每段 40 KB）
function coSendFull(to) {
  const txt = JSON.stringify(coSnap()), id = Math.random().toString(36).slice(2, 8), n = Math.ceil(txt.length / 40000);
  for (let i = 0; i < n; i++) CO.tx.publish('full', { id, i, n, to: to || '', part: txt.slice(i * 40000, (i + 1) * 40000) });
}
function coOnMessage(t, d, from) {
  if (from === CO.me) return;
  CO.rx = (CO.rx || 0) + 1;
  if (t === 'ed') { coFlush(); coApplyDiff(d); coNotice(from); }
  else if (t === 'full') {
    if (d.to && d.to !== CO.me) return;
    const P = CO.parts.get(d.id) || []; P[d.i] = d.part; CO.parts.set(d.id, P);
    if (P.filter((x) => x != null).length === d.n) { CO.parts.delete(d.id); try { coFlush(); coReplace(JSON.parse(P.join(''))); coNotice(from, true); } catch (e) { /* 壞掉的就略過 */ } }
  } else if (t === 'sync?') {
    // 只有代號最小的老成員回覆，避免大家一起送
    const elders = [CO.me, ...[...CO.peers.keys()].filter((id) => id !== from)].sort();
    if (elders[0] === CO.me) coSendFull(from);
  }
}
function coNotice(from, full) {
  const p2 = CO.peers.get(from), who = (p2 && p2.n) || '有人';
  if (performance.now() - CO.toastT > 4000) { CO.toastT = performance.now(); toast(full ? `已和 ${who} 同步成最新的配置` : `${who} 改了配置（你這邊已經更新）`); }
}
function coRender() {
  const el = $('co-badge'); if (!el) return;
  const names = [...CO.peers.values()].map((p2) => p2.n);
  el.hidden = !CO.on || !names.length;
  el.innerHTML = `<b>👥 ${names.length + 1} 人一起編輯</b>：你、${names.map(esc).join('、')}`;
}
async function coStart() {
  if (GAME_ONLY) return;
  if (CO.on || walk.on) return;
  CO.me = 'e' + Math.random().toString(36).slice(2, 9);
  try { CO.name = (localStorage.getItem('vb.mp.name') || '').slice(0, 12); } catch (e) { CO.name = ''; }
  CO.name = CO.name || '球友' + CO.me.slice(-3);
  const room = ('EDIT-' + cloudId()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  let tx;
  try { tx = await rtTransport(room, CO.me); }
  catch (e) { return; }   // 沒開即時服務就算了，照常用（自動存到雲端）
  CO.tx = tx; CO.on = true; CO.last = coSnap();
  tx.subscribe(coOnMessage);
  tx.onPresence((action, id, d) => { if (id === CO.me) return; if (action === 'leave' || action === 'absent') CO.peers.delete(id); else CO.peers.set(id, { n: d.n || '球友' }); coRender(); });
  await tx.enter({ n: CO.name });
  let others = []; try { others = (await tx.members()).filter((m) => m.id !== CO.me); } catch (e) { others = []; }
  for (const m of others) CO.peers.set(m.id, { n: m.n || '球友' });
  coRender();
  if (others.length) tx.publish('sync?', {});
}
addEventListener('pagehide', () => { if (CO.on) try { CO.tx.close(); } catch (e) { /* ignore */ } });
