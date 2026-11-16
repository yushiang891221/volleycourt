import { SUPABASE_URL, SUPABASE_ANON_KEY } from './auth-config.js';

export function authMode(url = SUPABASE_URL, key = SUPABASE_ANON_KEY) {
  if (!url.trim() || !key.trim()) throw new Error('登入設定不完整，請填寫專案網址與公開金鑰。');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('登入專案網址格式錯誤。'); }
  if (parsed.protocol !== 'https:') throw new Error('登入專案網址必須使用 HTTPS。');
  return 'account';
}

export function cleanNickname(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) {
    throw new Error('暱稱不能包含控制字元或換行。');
  }
  const nickname = value.trim();
  if ([...nickname].length < 2 || [...nickname].length > 12) throw new Error('暱稱需要 2～12 字。');
  return nickname;
}

export const validAppearance = code => typeof code === 'string' && /^t2[0-9a-z]{9}[0-9]{2}$/.test(code);
export const profileStep = profile => !profile?.nickname ? 'nickname' : !profile.appearance ? 'creator' : 'lobby';

// 只補空欄位；已存在的雲端資料永遠優先。快取屬於另一帳號時不可帶入。
export function migrationPatch(profile, local = {}) {
  if (local.owner && local.owner !== profile.id) return {};
  const patch = {};
  if (!profile.nickname && local.nickname) {
    try { patch.nickname = cleanNickname(local.nickname); } catch { /* 改由取暱稱畫面處理 */ }
  }
  if (!profile.appearance && validAppearance(local.appearance)) patch.appearance = local.appearance;
  return patch;
}

function publicError(error) {
  if (error?.code === '23505') return new Error('這個暱稱已有人使用，請換一個。');
  return new Error('帳號服務暫時無法連線或儲存，請確認網路後重試。');
}

// 注入 client 供離線驗證；不讀寫 UI 或遊戲設定，也不記錄服務回傳內容。
// 球隊錯誤（資料庫丟出的英文代碼）→ 給玩家看的中文
export function teamError(error) {
  const m = (error && error.message) || '', code = error && error.code;
  if (code === 'PGRST202') return '球隊功能還沒開通（要先在 Supabase 執行 019_team_guild.sql）';
  const map = [['level', '要 Lv10 才能加入或建立球隊'], ['already in team', '你已經在一個球隊裡了'], ['cooldown', '離開球隊 24 小時內不能加入或建立別的球隊'],
    ['coins', '金幣不夠'], ['bad name', '隊名要 2～12 字，不能有不適合的字'], ['name taken', '隊名已經有人用了'], ['no team', '找不到這個球隊（邀請碼錯了嗎？）'],
    ['full', '這個球隊滿了'], ['closed', '這個球隊沒有開放申請'], ['too many applications', '同時最多申請 5 個球隊'], ['not manager', '只有隊長、副隊長可以做這件事'],
    ['not owner', '只有隊長可以做這件事'], ['no permission', '你沒有權限對這位隊員這樣做'], ['too many vice', '副隊長最多 2 個'], ['bad role', '職位只能是副隊長或隊員'], ['not member', '這個人不是隊員'],
    ['no application', '找不到這個申請（可能已經處理過了）'], ['bad notice', '公告要 1～200 字，不能有不適合的字'], ['bad amount', '捐款金額不對'], ['not in team', '你還沒有球隊'],
    ['bad jersey', '球衣的款式或文字不符合規定'], ['too many jerseys', '球衣件數超過球隊等級可以設計的數量'], ['bad wear', '這件球衣已經不在了'], ['not signed in', '尚未登入或登入已失效']];
  const hit = map.find(([k]) => m.includes(k));
  return hit ? hit[1] : `球隊操作失敗（${m.slice(0, 60)}）`;
}
export function createAccountService(client) {
  let profile = null;
  const columns = 'id,nickname,appearance';
  async function userId() {
    const { data, error } = await client.auth.getSession();
    if (error) throw publicError(error);
    if (!data?.session?.user?.id) throw new Error('尚未登入或登入已失效，請重新使用 Google 登入。');
    return data.session.user.id;
  }
  async function read() {
    const id = await userId();
    const { data, error } = await client.from('profiles').select(columns).eq('id', id).single();
    if (error || !data) throw publicError(error);
    profile = data;
    return { ...profile };
  }
  async function save(patch) {
    const id = await userId();
    const changes = {};
    if (Object.hasOwn(patch, 'nickname')) changes.nickname = cleanNickname(patch.nickname);
    if (Object.hasOwn(patch, 'appearance')) {
      if (!validAppearance(patch.appearance)) throw new Error('角色外觀格式錯誤，請重新建立角色。');
      changes.appearance = patch.appearance;
    }
    if (!Object.keys(changes).length) return read();
    const { data, error } = await client.from('profiles').update(changes).eq('id', id).select(columns).single();
    if (error || !data) throw publicError(error);
    profile = data;
    return { ...profile };
  }
  return {
    read, save,
    async accessToken() {
      const { data, error } = await client.auth.getSession();
      if (error || !data?.session?.access_token || !data.session.user?.identities?.some(i => i.provider === 'google')) throw new Error('請先登入 Google 帳號。');
      return data.session.access_token;
    },
    async whoami() {   // 目前登入的帳號（給玩家自己看：信箱、Google 名字）
      try { const { data } = await client.auth.getSession(); const u = data?.session?.user; return u ? { email: u.email || '', name: u.user_metadata?.full_name || u.user_metadata?.name || '' } : null; } catch { return null; }
    },
    async signedIn() {   // 只判斷有沒有登入，不丟錯
      try { const { data } = await client.auth.getSession(); return data?.session?.user?.id || null; } catch { return null; }
    },
    async migrate(local) {
      const current = await read();
      const patch = migrationPatch(current, local);
      if (!Object.keys(patch).length) return { profile: current, nicknameConflict: false };
      // 暱稱撞名仍保存有效外觀，讓畫面只要求重取暱稱。
      const id = current.id;
      if (await userId() !== id) throw new Error('登入帳號已變更，請重試。');
      const { data, error } = await client.from('profiles').update(patch).eq('id', id).select(columns).single();
      if (error?.code === '23505' && patch.nickname) {
        if (patch.appearance) {
          const result = await client.from('profiles').update({ appearance: patch.appearance }).eq('id', id).select(columns).single();
          if (result.error || !result.data) throw publicError(result.error);
          profile = result.data;
        } else profile = current;
        return { profile: { ...profile }, nicknameConflict: true };
      }
      if (error || !data) throw publicError(error);
      profile = data;
      return { profile: { ...profile }, nicknameConflict: false };
    },
    async signIn(redirectTo) {
      const target = new URL(redirectTo);
      for (const key of ['code', 'error', 'error_code', 'error_description']) target.searchParams.delete(key);
      target.hash = '';
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: target.href, queryParams: { prompt: 'select_account' } } });   // 每次都讓玩家選 Google 帳號（可以換帳號）
      if (error) throw new Error('Google 登入未能開始，請確認網路後重試。');
    },
    // WEB-007 單一登入：登記「目前是這台裝置在用」、查目前登記的是誰（資料表還沒建會丟錯，呼叫端當作功能未開）
    async claimSession(sid) {
      await userId();
      const { error } = await client.from('active_sessions').upsert({ session_id: sid }, { onConflict: 'user_id' });
      if (error) throw new Error('session');
    },
    async activeSession() {
      const id = await userId();
      const { data, error } = await client.from('active_sessions').select('session_id').eq('user_id', id).maybeSingle();
      if (error) throw new Error('session');
      return data?.session_id || null;
    },
    // WEB-010 玩家進度（server/supabase/004_progress.sql）：讀進度、記比賽、稱號、T 輪盤、球隊
    async progress() {
      await userId();
      const { data, error } = await client.rpc('my_progress');
      if (error) throw new Error(error.code === 'PGRST202' ? '戰績功能還沒開通' : '讀取戰績失敗');
      return data;
    },
    async recordMatch(m) {
      await userId();
      const { data, error } = await client.rpc('record_match', { p_match: m.id, p_level: m.level, p_human: !!m.human, p_won: !!m.won, p_sets: m.sets, p_points: m.points, p_seconds: m.seconds, p_perf: m.perf || {} });
      if (error) throw new Error(error.code === 'PGRST202' ? '戰績功能還沒開通' : error.message.includes('daily') ? '今天記錄的場數到上限了' : `戰績記錄失敗（${String(error.message || error.code || '').slice(0, 60)}）`);   // 附上原因，方便查
      return data;
    },
    async setTitle(key) { await userId(); const { error } = await client.rpc('set_title', { p_title: key }); if (error) throw new Error(error.message.includes('locked') ? '這個稱號還沒解鎖' : '套用稱號失敗'); },
    // 個人球衣 J3（supabase/017_my_jerseys.sql）：讀／存我的球衣（最多 3 件）和穿哪一件
    async myJerseys() {
      await userId();
      const { data, error } = await client.rpc('my_jerseys');
      if (error) throw Object.assign(new Error(error.code === 'PGRST202' ? '球衣存帳號功能還沒開通' : '讀取球衣失敗'), { notReady: error.code === 'PGRST202' });
      return data;
    },
    async setMyJerseys(list, wear) {
      await userId();
      const { error } = await client.rpc('set_my_jerseys', { p_list: list, p_wear: wear });
      if (error) { const m = error.message || ''; throw Object.assign(new Error(error.code === 'PGRST202' ? '球衣存帳號功能還沒開通' : m.includes('bad jersey') ? '球衣的款式或文字不符合規定，沒有存進帳號' : '球衣存進帳號失敗，稍後會再試'), { notReady: error.code === 'PGRST202' }); }
    },
    async setWheel(w) { await userId(); const { error } = await client.rpc('set_wheel', { p_wheel: w }); if (error) throw new Error('T 輪盤儲存失敗'); },
    // 球隊（004 + 019_team_guild.sql）：op 對到資料庫函式，錯誤轉成中文
    async team(op, arg) {
      await userId();
      const a = arg || {};
      const call = {
        mine: ['my_team'], create: ['create_team', { p_name: arg }], join: ['join_team', { p_code: arg }], leave: ['leave_team'], jersey: ['set_team_jersey', { p_jersey: arg }],
        list: ['team_list', { p_query: arg || '' }], apply: ['apply_team', { p_team: arg }], cancelApply: ['cancel_application', { p_team: arg }],
        applications: ['team_applications'], decide: ['decide_application', { p_user: a.user, p_accept: !!a.accept }],
        kick: ['kick_member', { p_user: arg }], role: ['set_member_role', { p_user: a.user, p_role: a.role }], transfer: ['transfer_owner', { p_user: arg }],
        disband: ['disband_team'], rename: ['set_team_name', { p_name: arg }], open: ['set_team_open', { p_open: !!arg }],
        post: ['post_notice', { p_body: a.body, p_pinned: !!a.pinned }], unpost: ['delete_notice', { p_id: arg }], pin: ['pin_notice', { p_id: a.id, p_pinned: !!a.pinned }],
        donate: ['donate_coins', { p_amount: arg }], history: ['my_team_history'],
        jerseys: ['set_team_jerseys', { p_list: arg }], wear: ['set_team_wear', { p_idx: arg }], myWear: ['my_team_wear'],
      }[op];
      if (!call) throw new Error('不認得的球隊操作：' + op);
      const { data, error } = await client.rpc(...call);
      if (error) throw new Error(teamError(error));
      return data;
    },
    // WEB-011 好友、私訊（server/supabase/005_friends.sql）：通用呼叫，錯誤轉成中文
    async rpc(name, args = {}) {
      await userId();
      const { data, error } = await client.rpc(name, args);
      if (error) {
        const m = error.message || '';
        if (name === 'public_profile') throw new Error(error.code === 'PGRST202' ? '個人檔案功能還沒開通' : '個人檔案暫時連不上，請稍後重試');
        throw new Error(error.code === 'PGRST202' ? '好友功能還沒開通' : m.includes('no user') ? '找不到這個暱稱' : m.includes('self') ? '不能加自己好友' : m.includes('too many') ? '好友數量到上限了' : m.includes('not friends') ? '要先成為好友才能私訊' : m.includes('too fast') ? '訊息傳太快了，休息一下' : m.includes('bad text') ? '訊息要 1～300 字' : '好友功能暫時連不上');
      }
      return data;
    },
    // WEB-008 刪除帳號：只能刪自己（server/supabase/003_delete_account.sql），刪完把本機登入狀態也清掉
    async deleteAccount() {
      await userId();
      const { error } = await client.rpc('delete_my_account');
      if (error) throw new Error(error.code === 'PGRST202' ? '刪除帳號功能還沒開通，請稍後再試。' : '刪除帳號失敗，請確認網路後重試。');
      await client.auth.signOut({ scope: 'local' }).catch(() => {});
      profile = null;
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new Error('登出失敗，請確認網路後重試。');
      profile = null;
    }
  };
}

let servicePromise;
export async function getAccountService() {
  authMode();
  if (!servicePromise) servicePromise = (async () => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, debug: false },
      global: { fetch: (input, init = {}) => fetch(input, { ...init, signal: init.signal || AbortSignal.timeout(15000) }) }
    });
    return createAccountService(client);
  })().catch(() => { servicePromise = null; throw new Error('登入服務載入失敗，請確認網路後重試。'); });
  return servicePromise;
}
