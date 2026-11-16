// node tests/feedback-db.cjs <path-to-@electric-sql/pglite>
const {PGlite}=require(process.argv[2] || '@electric-sql/pglite');
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.player_progress(user_id uuid primary key references auth.users(id),coins integer default 0 check(coins>=0),updated_at timestamptz default now());
    insert into auth.users values('00000000-0000-0000-0000-000000000001');
    set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';`);
  const migration=fs.readFileSync(path.join(__dirname,'../supabase/025_anonymous_feedback.sql'),'utf8');
  await db.exec(migration);await db.exec(migration);
  await db.exec('set role authenticated');
  const call=async(text)=>(await db.query('select public.submit_feedback($1) as result',[text])).rows[0].result;
  await assert.rejects(()=>call('短'));
  const results=await Promise.all([call('希望可以調整練習模式的球速'),call('希望可以調整練習模式的球速')]);
  assert.equal(results.filter(r=>r.reward===500).length,1);
  assert.equal((await db.query('select public.feedback_status() as result')).rows[0].result.submitted,true);
  await assert.rejects(()=>db.query('select * from public.anonymous_feedback'));
  await assert.rejects(()=>db.query('select * from public.feedback_weekly_claims'));
  await db.exec('reset role');
  assert.equal((await db.query('select coins from player_progress')).rows[0].coins,500);
  assert.equal((await db.query('select count(*)::int as n from anonymous_feedback')).rows[0].n,1);
  await db.exec("update feedback_weekly_claims set week_start=week_start-7; set role authenticated");
  assert.equal((await call('下週還希望能加入更多練習選項')).reward,500);
  await db.exec("reset role; update feedback_weekly_claims set week_start=week_start-14; update player_progress set coins=2147483647; set role authenticated");
  await assert.rejects(()=>call('這次交易失敗不應留下建議與資格'));
  assert.equal((await db.query('select public.feedback_status() as result')).rows[0].result.submitted,false);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from anonymous_feedback')).rows[0].n,2);
  const boundary=await db.query(`select date_trunc('week', '2026-11-15 15:59:59+00'::timestamptz at time zone 'Asia/Taipei')::date::text as before,
    date_trunc('week', '2026-11-15 16:00:00+00'::timestamptz at time zone 'Asia/Taipei')::date::text as after`);
  assert.deepEqual(boundary.rows[0],{before:'2026-11-09',after:'2026-11-16'});
  await db.exec("set role anon; set request.jwt.claim.sub=''");
  await assert.rejects(()=>call('沒有登入也不能拿到任何獎勵'));
  console.log('PASS feedback DB: migration repeat, 500 coins, duplicate requests, next week, Taipei boundary, rollback, privacy permissions');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
