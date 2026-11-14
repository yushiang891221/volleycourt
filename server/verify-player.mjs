import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../auth-config.js';

export async function verifiedPlayer(token) {
  if (!token || token.length > 16384 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null;
  const response = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
    redirect: 'manual', signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) return null;
  const user = await response.json();
  return !user.is_anonymous && user.identities?.some(i => i.provider === 'google') ? user.id : null;
}
