// WEB-028B：使用既有大廳 socket，不影響自訂房間訊息。
import { friendList } from './friends.js';
import { teamApi } from './progress.js';
const $ = id => document.getElementById(id);
const RECENT = 'po.party.recent';
export function installParty(api, { myLookCode, setMode }) {
  const bridge = () => window.VBPartyBridge;
  const notify = text => bridge()?.notify(text);
  const send = m => { const ok = bridge()?.send(m); if (!ok) notify('大廳尚未連線，請稍後再試'); return !!ok; };
  let party = null, incoming = null, timer = null, friends = [], team = [], loading = 0;
  const readRecent = () => { try { const value = JSON.parse(localStorage.getItem(RECENT) || '[]'); return Array.isArray(value) ? value.filter(n => typeof n === 'string').slice(0, 10) : []; } catch { return []; } };
  function remember(members) {
    const names = members.filter(m => !m.self).map(m => m.name);
    try { localStorage.setItem(RECENT, JSON.stringify([...new Set([...names, ...readRecent()])].slice(0, 10))); } catch {}
  }
  // 好友與球隊 API 只有暱稱可對應；傳送前重新查完整在線名單的連線 id。
  const online = () => (bridge()?.players || []).filter(p => p.id && p.id !== window.VBLobby.id && p.status === '大廳中' && !party?.members.some(m => m.id === p.id));
  function invite(name) {
    if (!api.canLead()) return notify('只有隊長可以邀請');
    const player = online().find(p => p.name === name);
    if (!player) return notify('對方目前不在大廳');
    send({ k:'party-invite', to:player.id, mode:api.getMode(), look:myLookCode() });
  }
  function rows(box, names) {
    box.replaceChildren();
    const available = online();
    for (const name of [...new Set(names)]) {
      if (!available.some(p => p.name === name)) continue;
      const row = document.createElement('div'), label = document.createElement('span'), button = document.createElement('button');
      row.className = 'party-invite-row'; label.textContent = name; button.type = 'button'; button.textContent = '邀請'; button.disabled = !api.canLead(); button.onclick = () => invite(name);
      row.append(label, button); box.append(row);
    }
    if (!box.children.length) box.textContent = '目前沒有可邀請的在線球友';
  }
  function drawLists() {
    const box = $('party-invite-list'); box.replaceChildren();
    for (const [title, names] of [['在線好友', friends], ['最近隊友', readRecent()], ['球隊成員', team], ['大廳在線玩家', online().map(p => p.name)]]) {
      const section = document.createElement('section'), heading = document.createElement('h3'), list = document.createElement('div');
      heading.textContent = title; rows(list, names); section.append(heading, list); box.append(section);
    }
  }
  async function loadLists() {
    const version = ++loading;
    const results = await Promise.allSettled([friendList(), teamApi('mine')]);
    if (version !== loading) return;
    friends = results[0].status === 'fulfilled' ? results[0].value.filter(f => f.state === 'friend').map(f => f.nickname || f.name) : [];
    team = results[1].status === 'fulfilled' ? (results[1].value?.members || []).map(m => m.nickname || m.name) : [];
    drawLists();
  }
  api.openInvite = name => {
    if (name) return invite(name);
    if (!api.canLead()) return notify('只有隊長可以邀請');
    drawLists(); if (!$('party-invite').open) $('party-invite').showModal(); loadLists();
  };
  api.onStartMatch = mode => { if (api.canLead()) send({ k:'mm-start', mode }); };
  api.onCancelMatch = () => send({ k:'mm-cancel' });
  api.onStartAI = () => { if (api.canLead()) send({ k:'mm-ai-now' }); };
  // 大廳轉角色、炫技：同步給隊友（轉的時候最多每 0.2 秒送一次，放開時一定送最後的方向）
  let poseT = 0, poseLater = 0;
  api.onSelfPose = (yaw, final) => {
    if (!party?.id) return; clearTimeout(poseLater);
    const go = () => { poseT = Date.now(); send({ k:'party-pose', yaw }); };
    if (final || Date.now() - poseT >= 200) go(); else poseLater = setTimeout(go, 200 - (Date.now() - poseT));
  };
  api.onSelfEmote = e => { if (party?.id) send({ k:'party-emote', e }); };
  api.leaveParty = () => send({ k:'party-leave' });
  api.kickMember = id => { if (api.canLead()) send({ k:'party-kick', id }); };
  api.onMode = mode => { if (!api.canLead()) return; if (party?.id) send({ k:'party-mode', mode }); else setMode(mode); };
  $('party-link').onclick = () => { if (api.canLead()) send({ k:'party-link', mode:api.getMode() }); };
  function clearIncoming() {
    clearInterval(timer); timer = null; incoming = null;
    if ($('party-incoming').open) $('party-incoming').close();
  }
  function respond(accept) {
    if (!incoming) return;
    if (Date.now() >= incoming.deadline) { clearIncoming(); return; }
    if (send({ k:accept ? 'party-accept' : 'party-decline', partyId:incoming.partyId, ...(accept ? { look:myLookCode() } : {}) }) || !accept) clearIncoming();   /* 拒絕：就算大廳斷線送不出去也要關掉視窗（邀請 30 秒後自己失效） */
  }
  $('party-accept').onclick = () => respond(true);
  $('party-decline').onclick = () => respond(false);
  $('party-incoming').addEventListener('cancel', e => { e.preventDefault(); respond(false); });
  async function copyLink() {
    try { await navigator.clipboard.writeText($('party-copy-url').value); notify('已複製邀請連結'); return true; }
    catch { $('party-copy-url').focus(); $('party-copy-url').select(); return false; }
  }
  $('party-copy-button').onclick = copyLink;
  async function receive(m) {
    if (m.k === 'party') {
      party = m.id ? m : null;
      const members = party ? [...m.members.filter(p => p.self), ...m.members.filter(p => !p.self)].map(p => ({ ...p, isLeader:p.leader })) : [];
      api.setPartyInfo(m); window.PlayOneLobby.setParty(members);
      if (party) {
        remember(m.members);
        // 用連結建立隊伍或重新整理後，也補齊自己目前的外觀。
        if (m.members.find(p => p.self)?.look !== myLookCode()) send({ k:'party-look', look:myLookCode() });
      }
      drawLists();
    } else if (m.k === 'party-invited') {
      clearIncoming();
      incoming = { ...m, deadline:Date.now() + Math.min(30000, Math.max(0, Number(m.expiresIn) || 0)) };
      $('party-incoming-title').textContent = `${m.from} 邀請你一起打 ${m.mode === '6v6' ? '6 對 6' : '2 對 2'}`;
      $('party-incoming').showModal();
      const tick = () => { if (!incoming) return; const seconds = Math.max(0, Math.ceil((incoming.deadline - Date.now()) / 1000)); $('party-countdown').textContent = `${seconds} 秒後邀請失效`; if (!seconds) clearIncoming(); };
      timer = setInterval(tick, 250); tick();
    } else if (m.k === 'party-link') {
      const url = new URL('index.html', location.href); url.searchParams.set('party', m.code);
      $('party-copy-url').value = url.href;
      if (!await copyLink() && !$('party-copy').open) { $('party-copy').showModal(); $('party-copy-url').select(); }
    } else if (m.k === 'party-pose') api.setRemoteYaw?.(m.id, m.yaw);
    else if (m.k === 'party-emote') api.playRemoteEmote?.(m.id, m.e);
    else if (m.k === 'party-error') notify(m.reason);
    else if (m.k === 'party-sent') notify(`已邀請 ${m.name}`);
    else if (m.k === 'party-declined') notify(`${m.name} 拒絕了邀請`);
  }
  function ready() {
    const url = new URL(location.href), code = url.searchParams.get('party');
    if (code !== null && send({ k:'party-join-code', code, look:myLookCode() })) {
      url.searchParams.delete('party'); history.replaceState(history.state, '', url.href);
    }
    loadLists();
  }
  addEventListener('vb-party-message', e => { receive(e.detail).catch(() => notify('組隊畫面更新失敗，請重新整理')); });
  addEventListener('vb-party-ready', ready);
  addEventListener('vb-look-change', () => { if (bridge()?.ready) send({ k:'party-look', look:myLookCode() }); });
  addEventListener('pagehide', clearIncoming);
  new MutationObserver(drawLists).observe($('players'), { childList:true });
  if (bridge()?.party) receive(bridge().party);
  if (bridge()?.ready) ready();
}
