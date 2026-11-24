// WEB-028 組隊：大廳裡邀好友一起排 2 對 2／6 對 6。隊伍只放在記憶體，伺服器重開就解散（沒關係）。
// server/rt/server.mjs 的大廳把 party- 開頭的訊息交給 handle()，連線關掉時呼叫 bye()。
// 隊員用「帳號」（ws.meta.player）認人：同一個帳號換分頁、重新連線還是同一個隊員；給網頁看的只有連線 id、暱稱、外觀。
import crypto from 'node:crypto';

export const PARTY_MAX = { '2v2': 2, '6v6': 6 };
const INVITE_MS = 30000;        // 邀請 30 秒沒回就失效；同一個人 30 秒內不能重複邀同一個人
const CODE_MS = 10 * 60000;     // 邀請連結代碼 10 分鐘有效
const GONE_MS = 60000;          // 隊員斷線 60 秒沒回來就移出隊伍
const clean = s => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '').trim() : '';
const lookOf = s => { const v = clean(s); return v.length <= 160 ? v : ''; };

export function createParties({ send, sockets, now = Date.now, ratingOf = () => null }) {
  const parties = new Map();    // 隊伍 id → { id, leader（帳號）, mode, members: [{ player, id, name, look, at, gone }], code, codeAt }
  const byPlayer = new Map();   // 帳號 → 隊伍 id
  const invites = new Map();    // `${隊伍}|${被邀帳號}` → { party, to, from, at }
  const cooldown = new Map();   // `${邀請人}>${被邀人}` → 時間
  const poseAt = new Map(), emoteAt = new Map(), walkAt = new Map();   // 大廳轉角色、炫技、在大廳球館走動的節流

  const live = player => sockets().filter(ws => ws.meta && ws.meta.player === player && ws.meta.name);
  const toPlayer = (player, obj) => { for (const ws of live(player)) send(ws, obj); };
  const partyOf = player => parties.get(byPlayer.get(player));
  const newId = () => crypto.randomBytes(6).toString('hex');
  const newCode = () => crypto.randomBytes(5).toString('hex').toUpperCase();

  function view(party, player) {
    return {
      k: 'party', id: party.id, mode: party.mode, max: PARTY_MAX[party.mode],
      members: party.members.map(m => ({ id: m.id, name: m.name, look: m.look, ...(ratingOf(m.player, party.mode) || { rating: null }), leader: m.player === party.leader, self: m.player === player, online: !m.gone })),
    };
  }
  function publish(party) { for (const m of party.members) toPlayer(m.player, view(party, m.player)); }
  function cleared(player) { toPlayer(player, { k: 'party', id: null, members: [] }); }

  function create(ws, mode) {
    const p = ws.meta, party = { id: newId(), leader: p.player, mode: PARTY_MAX[mode] ? mode : '2v2', members: [], code: '', codeAt: 0 };
    party.members.push({ player: p.player, id: p.id, name: p.name, look: '', at: now(), gone: 0 });
    parties.set(party.id, party); byPlayer.set(p.player, party.id);
    return party;
  }
  function remove(party, player, why) {
    const i = party.members.findIndex(m => m.player === player); if (i < 0) return;
    party.members.splice(i, 1); byPlayer.delete(player);
    cleared(player); if (why) toPlayer(player, { k: 'party-error', reason: why });
    if (!party.members.length) { parties.delete(party.id); for (const [k, v] of invites) if (v.party === party.id) invites.delete(k); return; }
    if (party.leader === player) party.leader = party.members.slice().sort((a, b) => a.at - b.at)[0].player;   // 隊長走了交給最早加入的人
    publish(party);
  }
  function enter(ws, party, look) {
    const p = ws.meta;
    if (party.members.some(m => m.player === p.player)) { publish(party); return null; }
    if (party.members.length >= PARTY_MAX[party.mode]) return '隊伍已滿';
    const old = partyOf(p.player); if (old) remove(old, p.player);   // 已經在別的隊伍：先離開
    party.members.push({ player: p.player, id: p.id, name: p.name, look: lookOf(look), at: now(), gone: 0 });
    byPlayer.set(p.player, party.id); invites.delete(`${party.id}|${p.player}`);
    publish(party); return null;
  }
  // 隊員有動作或重新連上：更新連線 id、暱稱，取消斷線倒數
  function touch(ws) {
    const p = ws.meta, party = partyOf(p.player); if (!party) return null;
    const m = party.members.find(x => x.player === p.player);
    if (m) { const changed = m.gone || m.id !== p.id || m.name !== p.name; m.gone = 0; m.id = p.id; m.name = p.name; if (changed) publish(party); }
    return party;
  }

  function handle(ws, msg) {
    if (!msg || typeof msg.k !== 'string' || !msg.k.startsWith('party-')) return false;
    const p = ws.meta, fail = reason => { send(ws, { k: 'party-error', reason }); return true; };
    if (!p || !p.player) return fail('登入後才能組隊');
    let party = touch(ws);
    const leader = party && party.leader === p.player;
    switch (msg.k) {
      case 'party-sync':
        if (party) send(ws, view(party, p.player)); else send(ws, { k: 'party', id: null, members: [] });
        return true;
      case 'party-pose': {   // 大廳轉角色的方向：轉給其他隊友（每人最多每 0.15 秒一則，多的丟掉）
        if (!party || !Number.isFinite(msg.yaw)) return true;
        const t = now(); if (t - (poseAt.get(p.player) || 0) < 150) return true; poseAt.set(p.player, t);
        const yaw = Math.max(-1000, Math.min(1000, Math.round(msg.yaw * 1000) / 1000));
        for (const m of party.members) if (m.player !== p.player) toPlayer(m.player, { k: 'party-pose', id: p.id, yaw });
        return true;
      }
      case 'party-walk': {   // 大廳球館裡一起走動（2026-11-24）：網頁遊戲的多人訊息原封不動轉給隊友（位置每人最多每 0.06 秒一則、其他每秒 20 則、一則最多 1500 字，多的丟掉）
        if (!party || party.members.length < 2 || typeof msg.t !== 'string' || !/^[a-z0-9-]{1,24}$/.test(msg.t)) return true;
        const t = now(), w = walkAt.get(p.player) || { st: 0, win: 0, n: 0 }; walkAt.set(p.player, w);
        if (msg.t === 'st') { if (t - w.st < 60) return true; w.st = t; }   /* 位置狀態：最多每 0.06 秒一則 */
        else { if (t - w.win > 1000) { w.win = t; w.n = 0; } if (++w.n > 20) return true; }   /* 其他（炫技、球、聊天）：每秒最多 20 則 */
        let d; try { d = JSON.stringify(msg.d ?? null); } catch { return true; }
        if (d.length > 1500) return true;
        for (const m of party.members) if (m.player !== p.player) toPlayer(m.player, { k: 'party-walk', id: p.id, t: msg.t, d: msg.d ?? null });
        return true;
      }
      case 'party-emote': {   // 大廳炫技：轉給其他隊友（每人每 0.8 秒最多一次）
        if (!party || typeof msg.e !== 'string' || !/^[a-z0-9]{1,12}$/.test(msg.e)) return true;
        const t = now(); if (t - (emoteAt.get(p.player) || 0) < 800) return true; emoteAt.set(p.player, t);
        for (const m of party.members) if (m.player !== p.player) toPlayer(m.player, { k: 'party-emote', id: p.id, e: msg.e });
        return true;
      }
      case 'party-look': {
        const m = party && party.members.find(x => x.player === p.player); if (!m) return true;
        const look = lookOf(msg.look); if (look !== m.look) { m.look = look; publish(party); }
        return true;
      }
      case 'party-invite': {
        const target = sockets().find(o => o.meta && o.meta.id === msg.to && o.meta.name);
        if (!target) return fail('對方已經不在大廳');
        const to = target.meta.player;
        if (!to || to === p.player) return fail('不能邀請自己');
        if (party && !leader) return fail('只有隊長可以邀請');
        if (party && party.members.some(m => m.player === to)) return fail('對方已經在隊伍裡');
        const key = `${p.player}>${to}`, last = cooldown.get(key);
        if (last && now() - last < INVITE_MS) return fail('剛邀請過對方，請等 30 秒');
        if (!party) party = create(ws, msg.mode);
        if (party.members.length >= PARTY_MAX[party.mode]) return fail(`隊伍已滿（${party.mode === '2v2' ? '2 對 2 最多 2 人' : '6 對 6 最多 6 人'}）`);
        const me = party.members.find(m => m.player === p.player); if (me && msg.look !== undefined) me.look = lookOf(msg.look);
        cooldown.set(key, now());
        invites.set(`${party.id}|${to}`, { party: party.id, to, from: p.player, at: now() });
        toPlayer(to, { k: 'party-invited', partyId: party.id, from: p.name, mode: party.mode, expiresIn: INVITE_MS });
        send(ws, { k: 'party-sent', to: msg.to, name: target.meta.name });
        publish(party); return true;
      }
      case 'party-accept': {
        const inv = invites.get(`${msg.partyId}|${p.player}`), target = parties.get(msg.partyId);
        if (!inv || !target || now() - inv.at > INVITE_MS) { invites.delete(`${msg.partyId}|${p.player}`); return fail('邀請已過期'); }
        const err = enter(ws, target, msg.look); if (err) return fail(err);
        return true;
      }
      case 'party-decline': {
        const inv = invites.get(`${msg.partyId}|${p.player}`); invites.delete(`${msg.partyId}|${p.player}`);
        if (inv) toPlayer(inv.from, { k: 'party-declined', name: p.name });
        return true;
      }
      case 'party-leave':
        if (party) remove(party, p.player); else cleared(p.player);
        return true;
      case 'party-kick': {
        if (!party) return fail('你不在隊伍裡');
        if (!leader) return fail('只有隊長可以請人離開');
        const m = party.members.find(x => x.id === msg.id && x.player !== p.player); if (!m) return fail('隊伍裡沒有這個人');
        remove(party, m.player, '你被隊長請出隊伍'); return true;
      }
      case 'party-mode': {
        if (!PARTY_MAX[msg.mode]) return fail('模式不正確');
        if (!party) return true;   // 還沒組隊：模式只存在網頁那邊
        if (!leader) return fail('只有隊長可以切換模式');
        if (party.members.length > PARTY_MAX[msg.mode]) return fail(`隊伍超過 ${PARTY_MAX[msg.mode]} 人`);
        party.mode = msg.mode; publish(party); return true;
      }
      case 'party-link': {
        if (party && !leader) return fail('只有隊長可以產生邀請連結');
        if (!party) party = create(ws, msg.mode);
        if (!party.code || now() - party.codeAt > CODE_MS) { party.code = newCode(); party.codeAt = now(); }
        send(ws, { k: 'party-link', code: party.code, expiresIn: Math.max(0, party.codeAt + CODE_MS - now()) });
        publish(party); return true;
      }
      case 'party-join-code': {
        const code = clean(msg.code).toUpperCase();
        const target = code && [...parties.values()].find(x => x.code === code);
        if (!target || now() - target.codeAt > CODE_MS) return fail('邀請已過期');
        const err = enter(ws, target, msg.look); if (err) return fail(err);
        return true;
      }
      default: return fail('不支援的組隊訊息');
    }
  }

  // 連線關掉：同一個帳號已經沒有其他連線，就開始 60 秒倒數
  function bye(ws) {
    const p = ws.meta; if (!p || !p.player) return;
    const party = partyOf(p.player); if (!party || live(p.player).some(o => o !== ws)) return;
    const m = party.members.find(x => x.player === p.player);
    if (m && !m.gone) { m.gone = now(); publish(party); }
  }

  function tick() {
    const t = now();
    for (const [k, v] of invites) if (t - v.at > INVITE_MS) invites.delete(k);
    for (const [k, at] of cooldown) if (t - at > INVITE_MS) cooldown.delete(k);
    for (const party of [...parties.values()]) for (const m of party.members.slice()) if (m.gone && t - m.gone > GONE_MS) remove(party, m.player);
  }
  const timer = setInterval(tick, 1000); if (timer.unref) timer.unref();

  return { handle, bye, tick, refresh: player => { const x = partyOf(player); if (x) publish(x); }, stop: () => clearInterval(timer), partyOf: player => { const x = partyOf(player); return x ? { id: x.id, mode: x.mode, leader: x.leader, players: x.members.map(m => m.player) } : null; } };
}
