const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const strip = source => source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.offsetWidth = 220; this.offsetHeight = 100; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute() {}
  addEventListener() {}
  focus() {}
  closest() { return null; }
}
function fixture(storage = new Map()) {
  const body = new Element('body'), head = new Element('head'), badge = new Element('span'); badge.id = 'friends-badge'; body.append(badge);
  const all = element => [element, ...element.children.flatMap(all)];
  const calls = [], state = { incoming: 0, unread: 0, friends: [], signedIn: true, time: 1000 };
  const document = { body, head, hidden: false, createElement: tag => new Element(tag), getElementById: id => all(body).find(e => e.id === id), addEventListener() {} };
  const context = { document, URL, innerWidth: 800, innerHeight: 600, Date: { now: () => state.time },
    sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    VBSettings: { values: { nickname: '自己' } }, setInterval: () => 1, clearInterval() {}, addEventListener() {},
    authMode: () => state.signedIn ? 'account' : 'guest',
    rpc: async (name, args) => {
      calls.push(name);
      if (name === 'friend_badge') return { incoming: state.incoming, total: state.incoming + state.unread };
      if (name === 'friend_list') return structuredClone(state.friends);
      if (name === 'friend_respond') { state.friends = state.friends.filter(f => f.id !== args.p_user); state.incoming = 0; }
    }
  };
  vm.createContext(context);
  vm.runInContext(strip(read('friend-notifications.js')), context);
  const friends = strip(read('friends.js')).replace(/async function svc\(\) \{[\s\S]*?\n\}/, 'async function svc() { return { rpc }; }');
  vm.runInContext(friends, context);
  vm.runInContext(strip(read('player-menu.js')).replace('import.meta.url', "'https://example.test/player-menu.js'"), context);
  return { context, state, calls, document, storage, cards: () => document.getElementById('friend-notices')?.children || [] };
}
async function main() {
  const f = fixture(), c = f.context;
  await c.refreshBadge(); assert.equal(f.calls.filter(n => n === 'friend_list').length, 0);
  f.state.incoming = 1; f.state.friends = [{ id: 'one', nickname: '球友', state: 'incoming' }];
  await c.refreshBadge(); assert.equal(f.cards().length, 1); assert.equal(f.cards()[0].children[0].textContent, '球友 想加你好友');
  await c.refreshBadge(); assert.equal(f.cards().length, 1); assert.equal(f.calls.filter(n => n === 'friend_list').length, 1);
  f.state.unread++; await c.refreshBadge(); assert.equal(f.calls.filter(n => n === 'friend_list').length, 1, '私訊增加不抓清單');
  const reload = fixture(f.storage); reload.state.incoming = 1; reload.state.friends = f.state.friends;
  await reload.context.refreshBadge(); assert.equal(reload.cards().length, 0, '跨頁面去重');
  await c.respondFriend({ id: 'one' }, true); assert.equal(f.cards().length, 0); assert.equal(f.document.getElementById('friends-badge').textContent, '1');
  const match = fixture(); let playing = true; match.context.configureNotifications(() => playing);
  match.state.incoming = 1; match.state.friends = [{ id: 'two', nickname: '對手', state: 'incoming' }];
  await match.context.refreshBadge(); assert.equal(match.cards().length, 0);
  playing = false; match.context.flushInvites(); assert.equal(match.cards().length, 1);
  playing = true; match.context.flushInvites(); assert.equal(match.document.getElementById('friend-notices').hidden, true);
  const menu = fixture(); menu.state.friends = [
    { id: '1', nickname: '已邀請', state: 'outgoing' }, { id: '2', nickname: '邀請我', state: 'incoming' }, { id: '3', nickname: '朋友', state: 'friend' }
  ];
  const event = { clientX: 799, clientY: 599, target: new Element('b'), preventDefault() {} };
  for (const [name, label] of [['陌生人', '加好友'], ['已邀請', '已送出邀請（取消）'], ['邀請我', '接受好友邀請'], ['朋友', '傳私訊']]) {
    await menu.context.openPlayerMenu(event, name);
    const box = menu.document.body.children.at(-1); assert.equal(box.children[1].textContent, label);
    assert.equal(box.style.left, '576px'); assert.equal(box.style.top, '496px');
  }
  assert.equal(menu.calls.filter(n => n === 'friend_list').length, 1);
  menu.state.time += 60001; await menu.context.openPlayerMenu(event, '朋友'); assert.equal(menu.calls.filter(n => n === 'friend_list').length, 2);
  const self = fixture(); await self.context.openPlayerMenu(event, '自己'); assert.equal(self.document.body.children.length, 1);
  self.state.signedIn = false; await self.context.openPlayerMenu(event, '訪客朋友');
  const disabled = self.document.body.children.at(-1).children[1]; assert.equal(disabled.textContent, '登入後才能加好友'); assert.equal(disabled.disabled, true);
  const brokenStorage = new Map(); brokenStorage.get = brokenStorage.set = () => { throw new Error('denied'); };
  const blocked = fixture(brokenStorage); blocked.state.incoming = 1; blocked.state.friends = [{ id: '3', nickname: '朋友', state: 'incoming' }];
  await blocked.context.refreshBadge(); assert.equal(blocked.cards().length, 1);
  for (const file of ['lobby.js', 'gym.html']) { assert(!read(file).includes('＋好友')); assert(read(file).includes('data-player') || read(file).includes('dataset.player')); }
  const sql = read('server/supabase/010_public_profile.sql'); assert(!/email|coins/i.test(sql)); assert(/from public, anon/.test(sql)); assert(/to authenticated/.test(sql)); assert(sql.includes("auth.uid() is null"));
  const settings = { window: {}, localStorage: { getItem: key => key === 'vb.settings' ? JSON.stringify({ keys: { j: 'KeyJ', k: 'KeyK', l: 'KeyL' }, volume: 42 }) : null }, matchMedia: () => ({ matches: false }), innerWidth: 1200 };
  vm.runInNewContext(read('settings.js'), settings);
  assert.equal(settings.window.VBSettings.values.volume, 42); assert.equal(settings.window.VBSettings.values.keys.j, 'KeyJ');
  const bindings = settings.window.VBSettings.bindings;
  const visible = bindings.filter(([a]) => !['j', 'k', 'l'].includes(a)); assert(!visible.some(([, title]) => /羽球|匹克球/.test(title)));
  assert(read('settings.js').includes("bindings.filter(([a])=>!['j','k','l'].includes(a)).map"));
  assert(read('public-profile.js').includes('P.levelOf(data.exp)'));
  assert(read('public-profile.js').includes('P.ACH_SERIES.find'));
  assert(read('auth.js').includes('個人檔案功能還沒開通'));
  console.log('PASS WEB-012 通知、去重、比賽延後、快取、選單、訪客、SQL 權限與舊設定');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
