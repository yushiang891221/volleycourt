import { SUPABASE_URL, SUPABASE_ANON_KEY } from './auth-config.js';

export function authMode(url = SUPABASE_URL, key = SUPABASE_ANON_KEY) {
  if (!url.trim() && !key.trim()) return 'guest';
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
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: target.href } });
      if (error) throw new Error('Google 登入未能開始，請確認網路後重試。');
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
  if (authMode() === 'guest') return null; // 訪客不下載 SDK、不連 Supabase。
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
