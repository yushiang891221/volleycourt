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
// 收到別人的修改前：我這邊還沒送出去的修改先送（不然會被蓋掉）
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
