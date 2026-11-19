// WEB-028 組隊：server/shared/party.mjs 用假連線、假時鐘測邀請、接受、拒絕、過期、人數上限、隊長交接、踢人、切模式、邀請代碼、斷線 60 秒。
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const { createParties } = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'shared', 'party.mjs')).href);
  let t = 1000000;
  const socks = [];
  const sock = (id, player, name) => { const ws = { meta: { id, player, name }, inbox: [], open: true }; socks.push(ws); return ws; };
  const P = createParties({ send: (ws, o) => ws.inbox.push(o), sockets: () => socks.filter(s => s.open), now: () => t });
  const last = (ws, k) => ws.inbox.filter(o => o.k === k).pop();
  const go = (ws, m) => assert.equal(P.handle(ws, m), true);
  const err = ws => (last(ws, 'party-error') || {}).reason;
  const clear = () => socks.forEach(s => { s.inbox.length = 0; });

  const a = sock('conn-a', 'A', '阿明'), b = sock('conn-b', 'B', '小晴'), c = sock('conn-c', 'C', '阿哲');
  assert.equal(P.handle(a, { k: 'chat' }), false, '不是 party- 開頭的訊息不處理');

  // 訪客（沒有帳號）不能組隊
  const guest = sock('conn-g', '', '訪客'); go(guest, { k: 'party-sync' }); assert.equal(err(guest), '登入後才能組隊'); guest.open = false;

  // 邀請 → 接受
  go(a, { k: 'party-invite', to: 'conn-b', mode: '2v2' });
  const inv = last(b, 'party-invited'); assert.ok(inv, 'B 收到邀請'); assert.equal(inv.from, '阿明'); assert.equal(inv.mode, '2v2'); assert.equal(inv.expiresIn, 30000);
  go(a, { k: 'party-invite', to: 'conn-a' }); assert.equal(err(a), '不能邀請自己');
  go(a, { k: 'party-invite', to: 'conn-b' }); assert.equal(err(a), '剛邀請過對方，請等 30 秒');
  go(b, { k: 'party-accept', partyId: inv.partyId });
  let pa = last(a, 'party'), pb = last(b, 'party');
  assert.equal(pa.members.length, 2); assert.deepEqual(pa.members.map(m => m.name), ['阿明', '小晴']);
  assert.ok(pa.members[0].leader && pa.members[0].self && !pa.members[1].self); assert.ok(pb.members[1].self);
  assert.ok(!JSON.stringify(pa).includes('"A"'), '不把帳號 id 給網頁');

  // WEB-028B 前端依賴：同步保留 self／leader、未定級、外觀變更廣播。
  go(b, { k: 'party-sync' });
  assert.equal(last(b, 'party').members[1].self, true);
  assert.equal(last(b, 'party').members[1].rating, null);
  go(b, { k: 'party-look', look: 'web028b-look' });
  assert.equal(last(a, 'party').members[1].look, 'web028b-look');

  // 2 對 2 滿了不能再邀；隊員不能邀
  go(a, { k: 'party-invite', to: 'conn-c' }); assert.match(err(a), /隊伍已滿/);
  go(b, { k: 'party-invite', to: 'conn-c' }); assert.equal(err(b), '只有隊長可以邀請');

  // 切 6 對 6 後可以邀；邀請 30 秒過期
  go(b, { k: 'party-mode', mode: '6v6' }); assert.equal(err(b), '只有隊長可以切換模式');
  go(a, { k: 'party-mode', mode: '6v6' }); assert.equal(last(b, 'party').mode, '6v6');
  t += 31000; P.tick();
  go(a, { k: 'party-invite', to: 'conn-c' }); const invC = last(c, 'party-invited');
  t += 31000; P.tick();
  go(c, { k: 'party-accept', partyId: invC.partyId }); assert.equal(err(c), '邀請已過期');

  // 拒絕：邀請人收到通知
  t += 31000; go(a, { k: 'party-invite', to: 'conn-c' });
  go(c, { k: 'party-decline', partyId: last(c, 'party-invited').partyId }); assert.equal(last(a, 'party-declined').name, '阿哲');

  // 邀請代碼：只有隊長能拿；10 分鐘內可加入、過期不行
  go(b, { k: 'party-link' }); assert.equal(err(b), '只有隊長可以產生邀請連結');
  go(a, { k: 'party-link' }); const code = last(a, 'party-link').code; assert.match(code, /^[0-9A-F]{10}$/);
  go(c, { k: 'party-join-code', code: code.toLowerCase() }); assert.equal(last(a, 'party').members.length, 3);
  go(a, { k: 'party-mode', mode: '2v2' }); assert.equal(err(a), '隊伍超過 2 人');
  const d = sock('conn-d', 'D', '可可'); t += 10 * 60000 + 1;
  go(d, { k: 'party-join-code', code }); assert.equal(err(d), '邀請已過期');

  // 踢人：只有隊長；被踢的人收到通知、隊伍清空
  go(b, { k: 'party-kick', id: 'conn-c' }); assert.equal(err(b), '只有隊長可以請人離開');
  go(a, { k: 'party-kick', id: 'conn-c' }); assert.equal(err(c), '你被隊長請出隊伍'); assert.equal(last(c, 'party').id, null);
  assert.equal(last(a, 'party').members.length, 2);

  // 隊長離開：交給最早加入的人（B）
  go(a, { k: 'party-leave' }); assert.equal(last(a, 'party').id, null);
  pb = last(b, 'party'); assert.equal(pb.members.length, 1); assert.ok(pb.members[0].leader && pb.members[0].self);

  // 已經在別隊的人接受邀請：先離開原本的隊伍
  clear(); t += 31000;
  go(c, { k: 'party-invite', to: 'conn-d', mode: '2v2' }); go(d, { k: 'party-accept', partyId: last(d, 'party-invited').partyId });
  go(b, { k: 'party-invite', to: 'conn-d' }); go(d, { k: 'party-accept', partyId: last(d, 'party-invited').partyId });
  assert.equal(last(c, 'party').members.length, 1, 'D 離開 C 的隊伍');
  assert.deepEqual(last(b, 'party').members.map(m => m.name), ['小晴', '可可']);

  // 斷線 60 秒內回來還在隊上；超過就移出
  d.open = false; P.bye(d); assert.equal(last(b, 'party').members[1].online, false);
  t += 30000; P.tick();
  const d2 = sock('conn-d2', 'D', '可可'); go(d2, { k: 'party-sync' });
  assert.equal(last(d2, 'party').members.length, 2); assert.equal(last(b, 'party').members[1].online, true); assert.equal(last(b, 'party').members[1].id, 'conn-d2');
  d2.open = false; P.bye(d2); t += 61000; P.tick();
  assert.equal(last(b, 'party').members.length, 1, '斷線超過 60 秒移出隊伍');

  // 同帳號還有別的分頁開著：關掉一個不算斷線
  const e1 = sock('conn-e1', 'E', '阿凱'), e2 = sock('conn-e2', 'E', '阿凱'); t += 31000;
  go(b, { k: 'party-invite', to: 'conn-e1' }); go(e2, { k: 'party-accept', partyId: last(e2, 'party-invited').partyId });
  e1.open = false; P.bye(e1); t += 61000; P.tick();
  assert.equal(last(b, 'party').members.length, 2);

  // 大廳轉角色、炫技：轉給其他隊友（不回給自己），而且有節流
  clear(); t += 1000;
  go(b, { k: 'party-pose', yaw: 1.234 }); assert.deepEqual(last(e2, 'party-pose'), { k: 'party-pose', id: 'conn-b', yaw: 1.234 }); assert.equal(last(b, 'party-pose'), undefined);
  go(b, { k: 'party-pose', yaw: 2 }); assert.equal(last(e2, 'party-pose').yaw, 1.234, '0.15 秒內第二則丟掉');
  t += 200; go(b, { k: 'party-pose', yaw: 2 }); assert.equal(last(e2, 'party-pose').yaw, 2);
  go(b, { k: 'party-emote', e: 'taunt' }); assert.deepEqual(last(e2, 'party-emote'), { k: 'party-emote', id: 'conn-b', e: 'taunt' });
  go(b, { k: 'party-emote', e: '<script>' }); go(b, { k: 'party-emote', e: 'hi5' }); assert.equal(last(e2, 'party-emote').e, 'taunt', '亂寫的、太密的都不轉');

  // partyOf：給之後的配對用
  assert.deepEqual(P.partyOf('B').players, ['B', 'E']);
  P.stop();
  console.log('WEB-028 組隊伺服器邏輯檢查通過');
})().catch(e => { console.error(e); process.exit(1); });
