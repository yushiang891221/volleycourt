-- 匿名建議：內容不存玩家 ID；每週資格另表記錄。整份在 SQL Editor 執行。
begin;
create table if not exists public.anonymous_feedback (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  mail_id text
);
create table if not exists public.feedback_weekly_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  primary key (user_id, week_start)
);
alter table public.anonymous_feedback enable row level security;
alter table public.feedback_weekly_claims enable row level security;
revoke all on public.anonymous_feedback, public.feedback_weekly_claims from public, anon, authenticated;
grant select, update on public.anonymous_feedback to service_role;

create or replace function public.feedback_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  wk date := date_trunc('week', now() at time zone 'Asia/Taipei')::date;
begin
  if uid is null then raise exception 'login required'; end if;
  return jsonb_build_object('submitted', exists(select 1 from public.feedback_weekly_claims where user_id=uid and week_start=wk),
    'resetsAt', (wk + interval '7 days') at time zone 'Asia/Taipei');
end $$;

create or replace function public.submit_feedback(p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  wk date := date_trunc('week', now() at time zone 'Asia/Taipei')::date;
  receipt uuid;
begin
  if uid is null then raise exception 'login required'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 10 and 2000 then raise exception 'bad feedback'; end if;
  -- 唯一鍵使同時送出、重試、換裝置都只能領一次；任何錯誤會整筆回滾。
  insert into public.feedback_weekly_claims(user_id, week_start) values(uid,wk) on conflict do nothing;
  if not found then return jsonb_build_object('submitted',false,'alreadySubmitted',true,'reward',0); end if;
  insert into public.anonymous_feedback(body) values(btrim(p_body)) returning id into receipt;
  insert into public.player_progress(user_id) values(uid) on conflict do nothing;
  update public.player_progress set coins=coins+500, updated_at=now() where user_id=uid;
  return jsonb_build_object('submitted',true,'id',receipt,'reward',500);
end $$;
revoke all on function public.feedback_status(), public.submit_feedback(text) from public, anon;
grant execute on function public.feedback_status(), public.submit_feedback(text) to authenticated;
commit;
