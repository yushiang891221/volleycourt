const assert = require('node:assert/strict');
const { deliverFeedback } = require('../server/shared/feedback-mail.cjs');
const handler = require('../api/feedback.js');
const env = {RESEND_API_KEY:'test-mail',FEEDBACK_FROM:'Play One <test@example.com>',SUPABASE_SERVICE_ROLE_KEY:'test-service'};
const ok = value => ({ok:true,json:async()=>value});
(async()=>{
  const calls=[];
  await deliverFeedback({url:'https://db.example',env,fetcher:async(url,init)=>{
    calls.push({url,init});
    if(url.includes('/emails'))return ok({id:'mail-1'});
    if(init.method==='PATCH')return ok(null);
    return ok([{id:'receipt-1',body:'希望可以調整練習模式的球速',created_at:'2026-11-16T01:00:00Z'}]);
  }});
  const mail=JSON.parse(calls[1].init.body);
  assert.deepEqual(mail.to,['yushiang891221@gmail.com']);
  assert.equal(calls[1].init.headers['Idempotency-Key'],'feedback/receipt-1');
  assert(!('html' in mail));assert(!('reply_to' in mail));
  let patched=false;
  await assert.rejects(()=>deliverFeedback({url:'https://db.example',env,fetcher:async(url,init)=>{
    if(init.method==='PATCH')patched=true;
    if(url.includes('/emails'))return {ok:false};
    return ok([{id:'receipt-2',body:'test feedback',created_at:'now'}]);
  }}));
  assert.equal(patched,false,'failed mail stays queued');
  const savedFetch=global.fetch;
  const savedEnv={...process.env};Object.assign(process.env,env,{CRON_SECRET:'test-cron'});
  let awarded=0, mailAttempts=0;
  global.fetch=async(url,init)=>{
    if(url.endsWith('/auth/v1/user'))return ok({id:'player',identities:[{provider:'google'}]});
    if(url.endsWith('/rpc/submit_feedback'))return ok(awarded++ ? {submitted:false,alreadySubmitted:true,reward:0} : {submitted:true,id:'receipt-3',reward:500});
    if(url.includes('/emails')){mailAttempts++;return {ok:false};}
    if(url.includes('/anonymous_feedback?'))return ok([{id:'receipt-3',body:'希望改善接球教學的提示方式',created_at:'now'}]);
    throw Error('unexpected request');
  };
  async function request(method,authorization,body){
    const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
    await handler({method,headers:{authorization},body},res);return res;
  }
  try{
    assert.equal((await request('GET','Bearer wrong')).code,401);
    assert.equal((await request('POST','',{})).code,401);
    assert.equal((await request('POST','Bearer a.b.c',{body:'短'})).code,400);
    const first=await request('POST','Bearer a.b.c',{body:'希望改善接球教學的提示方式'});
    assert.equal(first.code,200);assert.equal(first.data.reward,500);assert.equal(first.data.mailQueued,true);
    const retry=await request('POST','Bearer a.b.c',{body:'希望改善接球教學的提示方式'});
    assert.equal(retry.data.reward,0);assert.equal(retry.data.alreadySubmitted,true);assert.equal(mailAttempts,1);
    console.log('PASS feedback: fixed recipient, plain text, mail failure queue, auth, validation, retry response');
  }finally{global.fetch=savedFetch;for(const k of Object.keys(env).concat('CRON_SECRET')){if(savedEnv[k]===undefined)delete process.env[k];else process.env[k]=savedEnv[k];}}
})().catch(e=>{console.error(e);process.exitCode=1;});
