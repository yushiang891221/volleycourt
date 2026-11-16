const { configured, deliverFeedback } = require('../server/shared/feedback-mail.cjs');
module.exports = async (req, res) => {
  const reply = (status, body) => { res.setHeader('Cache-Control','no-store'); return res.status(status).json(body); };
  if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow','GET, POST'); return reply(405,{error:'method'}); }
  try {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../js/auth-config.js');
    if (req.method === 'GET') {
      if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return reply(401,{error:'unauthorized'});
      return reply(200,{sent:await deliverFeedback({url:SUPABASE_URL})});
    }
    const { verifiedPlayer } = await import('../server/shared/verify-player.mjs');
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization || '')?.[1];
    if (!await verifiedPlayer(token)) return reply(401,{error:'請重新登入後再送出。'});
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if ([...text].length < 10 || [...text].length > 2000) return reply(400,{error:'建議內容請填寫 10～2000 字。'});
    if (!configured()) return reply(503,{error:'匿名建議信箱尚未開通，請稍後再試。'});
    const result = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_feedback`, {
      method:'POST', headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_body:text}), signal:AbortSignal.timeout(8000)
    });
    if (!result.ok) return reply(503,{error:'暫時無法確認送出結果，請稍後重新開啟建議面板查詢。'});
    const data = await result.json();
    // 資料庫已經收件與發獎；寄信失敗只留待補寄，不讓玩家重領或誤以為建議遺失。
    let mailQueued = false;
    if (data.submitted) {
      try { await deliverFeedback({url:SUPABASE_URL,id:data.id}); }
      catch (error) {
        mailQueued = true;
        // 僅記錯誤階段與狀態，不記金鑰、建議內容或玩家資料。
        console.warn('feedback mail pending', JSON.stringify({stage:error.stage || 'mail_unknown',status:error.status,code:error.code}));
      }
    }
    return reply(200,{submitted:data.submitted,alreadySubmitted:!!data.alreadySubmitted,reward:data.reward,mailQueued});
  } catch (error) {
    console.warn('feedback request failed', JSON.stringify({stage:error.stage || 'request_unknown',status:error.status,code:error.code}));
    return reply(503,{error:'暫時無法確認送出結果，請稍後重新開啟建議面板查詢。'});
  }
};
