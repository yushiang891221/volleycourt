// 大廳首頁背景＝可以走動的球館（2026-11-24）：gym.html 的「大廳模式」放在 iframe 裡（src/gym/game/18-lobby-mode.js）。
// 不是練習模式：只能走動、坐沙發、到飲水機喝水、按 T 炫技；打球要開始配對或按「練習」。
// 組隊的隊友會一起出現在同一座球館：球館的多人訊息透過這裡用大廳的組隊連線送（party-walk），伺服器轉給隊友。
export function mountLobbyGym(host) {
  const f = document.createElement('iframe');
  f.id = 'lobby-gym'; f.title = '大廳球館（可以走動）'; f.src = 'gym.html?site=bs-shenjing&lobby=1' + (/[?&]dev/.test(location.search) ? '&dev' : '');   /* 本機開發：大廳網址有 dev 就帶過去 */
  host.prepend(f);
  let ready = false;
  const post = (m) => { try { f.contentWindow.postMessage({ vbLobby: 1, ...m }, location.origin); } catch (_) { /* 還沒載好 */ } };
  const sendParty = () => {
    const p = window.VBPartyBridge?.party, self = p?.id ? p.members?.find((x) => x.self) : null;
    post({ type: 'party', me: self ? self.id : '', members: self ? p.members.filter((x) => !x.self && x.id && x.online !== false).map((x) => ({ id: x.id, n: x.name, look: x.look })) : [] });
  };
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== f.contentWindow || !e.data || !e.data.vbLobby) return;
    const m = e.data;
    if (m.type === 'ready') { ready = true; sendParty(); }
    else if (m.type === 'send' && typeof m.t === 'string' && window.VBPartyBridge?.party?.id) window.VBPartyBridge.send({ k: 'party-walk', t: m.t, d: m.d });
  });
  addEventListener('vb-party-message', (e) => {
    const m = e.detail; if (!ready || !m) return;
    if (m.k === 'party') sendParty();
    else if (m.k === 'party-walk') post({ type: 'recv', id: m.id, t: m.t, d: m.d });
  });
  // 點大廳的按鈕、打字時，鍵盤不要繼續控制球館裡的人；點球館才把鍵盤交給它
  f.addEventListener('load', () => { try { f.contentWindow.focus(); } catch (_) {} });
  return f;
}
