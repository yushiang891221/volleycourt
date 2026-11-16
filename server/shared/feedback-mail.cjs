const RECIPIENT = 'yushiang891221@gmail.com';
function configured(env = process.env) {
  return !!(env.RESEND_API_KEY && env.FEEDBACK_FROM && env.SUPABASE_SERVICE_ROLE_KEY);
}
// 僅伺服器使用 service role；正文與 Email 都不帶玩家資料。
async function deliverFeedback({ url, id, fetcher = fetch, env = process.env }) {
  if (!configured(env)) throw new Error('mail not configured');
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const query = new URLSearchParams({ select: 'id,body,created_at', emailed_at: 'is.null', order: 'created_at.asc', limit: id ? '1' : '10' });
  if (id) query.set('id', `eq.${id}`);
  const response = await fetcher(`${url}/rest/v1/anonymous_feedback?${query}`, { headers, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('outbox unavailable');
  const rows = await response.json();
  let sent = 0;
  for (const row of rows) {
    const mail = await fetcher('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `feedback/${row.id}` },
      body: JSON.stringify({ from: env.FEEDBACK_FROM, to: [RECIPIENT], subject: 'Play One｜收到一封匿名建議',
        text: `匿名建議編號：${row.id}\n送出時間：${row.created_at}\n\n${row.body}\n\n這封信不包含玩家姓名、帳號或 Email。` })
    });
    if (!mail.ok) throw new Error('mail provider unavailable');
    const result = await mail.json();
    const saved = await fetcher(`${url}/rest/v1/anonymous_feedback?id=eq.${row.id}&emailed_at=is.null`, {
      method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ emailed_at: new Date().toISOString(), mail_id: result.id })
    });
    if (!saved.ok) throw new Error('mail receipt unavailable');
    sent++;
  }
  return sent;
}
module.exports = { configured, deliverFeedback };
