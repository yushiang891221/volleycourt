// ---------------------------------------------------------------- 大廳模式（2026-11-24）
// index.html 的首頁背景就是這座球館（gym.html?site=bs-shenjing&lobby=1 放在 iframe 裡）：可以走動、坐沙發、到飲水機裝水、按 T 炫技。
// 組隊的隊友會一起出現在同一座球館：遊戲本來的多人訊息（位置、動作、炫技…）不另外開房間，改走大廳的組隊通道——
//   這裡把訊息交給上層網頁（postMessage），上層用組隊連線送 party-walk，伺服器轉給隊友，隊友的上層再交回他的球館。
//   上層送進來的：{ type:'party', me, members:[{ id, n, look }] }（members 不含自己）、{ type:'recv', id, t, d }
//   送出去的：{ type:'ready' }、{ type:'send', t, d }
if (LOBBY_MODE) {
  document.body.classList.add('lobby-mode');
  TP.manual = true;   // 第三人稱：看得到自己的角色（開場套用個人設定時會被清掉：前 8 秒內再設回來，之後玩家按 P 換第一人稱就照玩家的）
  { const t0 = performance.now(), keep = setInterval(() => { if (performance.now() - t0 > 8000) clearInterval(keep); else if (TP.manual !== true) TP.manual = true; }, 200); }
  const up = (m) => { try { parent.postMessage({ vbLobby: 1, ...m }, location.origin); } catch (_) { /* 沒有上層：單獨開也能走 */ } };
  const subs = [], pres = [];
  let others = [], me = '';
  const tx = {
    kind: 'party',
    publish: (t, d) => { netCount(); up({ type: 'send', t, d }); },
    subscribe: (fn) => subs.push(fn),
    enter: async () => {},
    members: async () => others.map((m) => ({ id: m.id, n: m.n, c: m.c })),
    onPresence: (fn) => pres.push(fn),
    close: () => {},
  };
  const colorOf = (id) => { let h = 0; for (const ch of String(id)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0; return NET_COLORS[h % NET_COLORS.length]; };
  function lobbyJoin() {
    NET.me = me; NET.name = [...(VBSettings.values.nickname || '球友')].slice(0, 12).join(''); NET.color = colorOf(me);
    NET.tx = tx; NET.room = 'lobby'; NET.on = true; NET.peers.clear(); NET.forceSt = true;
    if (!subs.length) { tx.subscribe(netOnMessage); tx.onPresence((action, id, d) => { if (id === NET.me) return; if (action === 'leave') netDropPeer(id); else netPeer(id, d); renderMpList(); }); }
    for (const m of others) netPeer(m.id, m);
  }
  function lobbyLeave() {
    for (const id of [...NET.peers.keys()]) netDropPeer(id);
    NET.on = false; NET.tx = null; NET.ownBall = false;
  }
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || !e.data.vbLobby) return;
    const m = e.data;
    if (m.type === 'party') {
      const next = (Array.isArray(m.members) ? m.members : []).filter((x) => x && x.id && x.id !== m.me).map((x) => ({ id: String(x.id), n: String(x.n || '球友').slice(0, 12), c: colorOf(x.id), ch: x.look }));
      if (!m.me || !next.length) { others = []; if (NET.on) lobbyLeave(); return; }   // 沒組隊：自己一個人逛
      if (!NET.on || me !== m.me) { me = String(m.me); others = next; lobbyJoin(); return; }
      const gone = others.filter((o) => !next.some((x) => x.id === o.id)), fresh = next.filter((x) => !others.some((o) => o.id === x.id));
      others = next;
      for (const o of gone) for (const fn of pres) fn('leave', o.id, o);
      for (const x of fresh) { for (const fn of pres) fn('enter', x.id, x); NET.forceSt = true; }   // 新隊友進來：馬上送一次自己的位置
    } else if (m.type === 'recv' && NET.on && typeof m.t === 'string') {
      for (const fn of subs) fn(m.t, m.d, String(m.id));
    }
  });
  up({ type: 'ready' });
}
