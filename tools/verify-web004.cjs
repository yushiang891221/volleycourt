// 離線帳號服務測試：不需金鑰，不下載 SDK，不代表登入介面已接線。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'auth.js'), 'utf8').replace(
  "import { SUPABASE_URL, SUPABASE_ANON_KEY } from './auth-config.js';",
  "const SUPABASE_URL = '', SUPABASE_ANON_KEY = '';"
);
const look = 't201010100010';
function fake(profile = { id: 'A', nickname: null, appearance: null }) {
  const state = { profile: { ...profile }, updates: [], signedIn: true, fail: false, oauth: null };
  return { state, client: {
    auth: {
      async getSession() { return { data: { session: state.signedIn ? { user: { id: 'A' } } : null } }; },
      async signInWithOAuth(options) { state.oauth = options; return {}; },
      async signOut() { state.signedIn = false; return {}; }
    },
    from(table) {
      assert.equal(table, 'profiles');
      let patch, id;
      const query = {
        select(columns) { assert.equal(columns, 'id,nickname,appearance'); return query; },
        update(value) { patch = value; return query; },
        eq(key, value) { assert.equal(key, 'id'); id = value; return query; },
        async single() {
          assert.equal(id, 'A');
          if (state.fail) return { error: { message: 'PRIVATE RAW ERROR', code: '500' } };
          if (patch?.nickname === '撞名') return { error: { code: '23505' } };
          if (patch) { state.updates.push(patch); Object.assign(state.profile, patch); }
          return { data: { ...state.profile } };
        }
      };
      return query;
    }
  } };
}
(async () => {
  const auth = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.throws(() => auth.authMode('', ''));
  await assert.rejects(auth.getAccountService());
  assert.equal(auth.authMode('https://example.supabase.co', 'public-key'), 'account');
  assert.throws(() => auth.authMode('https://example.supabase.co', ''));
  assert.throws(() => auth.authMode('', 'public-key'));
  assert.throws(() => auth.authMode('http://example.supabase.co', 'public-key'));
  assert.equal(auth.cleanNickname('  球友  '), '球友');
  assert.equal(auth.cleanNickname('😀😀'), '😀😀');
  for (const n of ['', '甲', 'a'.repeat(13), '球\n友', '\t球友', '球\u0085友', '球\u2028友', null]) {
    assert.throws(() => auth.cleanNickname(n));
  }
  assert.equal(auth.validAppearance(look), true);
  assert.equal(auth.validAppearance('legacy'), false);
  assert.deepEqual(auth.migrationPatch({ id: 'A', nickname: '雲端', appearance: look }, { nickname: '本機', appearance: look }), {});
  assert.deepEqual(auth.migrationPatch({ id: 'A' }, { owner: 'B', nickname: '乙方', appearance: look }), {});
  assert.deepEqual(auth.migrationPatch({ id: 'A' }, { nickname: 'x', appearance: 'old' }), {});
  assert.equal(auth.profileStep({}), 'nickname');
  assert.equal(auth.profileStep({ nickname: '球友' }), 'creator');
  assert.equal(auth.profileStep({ nickname: '球友', appearance: look }), 'lobby');
  console.log('PASS 模式、設定錯誤、暱稱、外觀格式、帳號隔離與流程判斷');

  const { state, client } = fake();
  const service = auth.createAccountService(client);
  const migrated = await service.migrate({ nickname: '  本機  ', appearance: look });
  assert.equal(migrated.profile.nickname, '本機');
  assert.equal(migrated.profile.appearance, look);
  assert.equal(migrated.nicknameConflict, false);
  await service.migrate({ nickname: '不可蓋掉', appearance: look });
  assert.equal(state.updates.length, 1);
  await service.save({ nickname: '新名字', id: 'B', created_at: 'unsafe' });
  assert.deepEqual(state.updates.at(-1), { nickname: '新名字' });
  await assert.rejects(service.save({ appearance: 'bad' }), /格式錯誤/);
  await assert.rejects(service.save({ nickname: '撞名' }), /已有人使用/);
  state.fail = true;
  await assert.rejects(service.read(), error => /重試/.test(error.message) && !error.message.includes('PRIVATE'));
  state.fail = false;
  await service.signIn('https://example.com/index.html?demo=1&code=secret&error_description=private#lobby');
  assert.deepEqual(state.oauth, { provider: 'google', options: { redirectTo: 'https://example.com/index.html?demo=1', queryParams: { prompt: 'select_account' } } });   // 每次讓玩家選 Google 帳號（可以切換帳號）
  await service.signOut();
  await assert.rejects(service.read(), /尚未登入/);
  console.log('PASS 假 Supabase 讀寫、遷移不覆蓋、欄位白名單、錯誤訊息、OAuth 與登出');

  const collision = fake();
  const collisionService = auth.createAccountService(collision.client);
  const result = await collisionService.migrate({ nickname: '撞名', appearance: look });
  assert.equal(result.nicknameConflict, true);
  assert.equal(result.profile.nickname, null);
  assert.equal(result.profile.appearance, look);
  assert.equal(auth.profileStep(result.profile), 'nickname');
  assert.deepEqual(collision.state.updates, [{ appearance: look }]);
  console.log('PASS 暱稱撞名仍帶入外觀，回到取暱稱階段');
})().catch(error => { console.error(error); process.exitCode = 1; });
