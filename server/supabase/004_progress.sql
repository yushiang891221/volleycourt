-- WEB-010：玩家進度（戰績、經驗值、金幣、成就、稱號、T 輪盤、球隊）
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。
-- 防作弊先用「A 方案」：比賽結果由玩家自己的遊戲送來，這裡只檢查數字合不合理、同一場只能記一次、每天有上限。
-- 之後改「B 方案」：改成房間伺服器呼叫 record_match（同一個函式、改成只有伺服器能呼叫）。
begin;

-- ---------- 進度：每個帳號一列，只能透過下面的函式修改 ----------
create table if not exists public.player_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  exp integer not null default 0 check (exp >= 0),
  coins integer not null default 0 check (coins >= 0),
  stats jsonb not null default '{}'::jsonb,        -- {"w":{"3":0,"4":0,"5":0,"h":0},"l":{...}}  3 高手、4 校隊、5 企聯、h 純真人
  play_seconds integer not null default 0 check (play_seconds >= 0),
  kills integer not null default 0, blocks integer not null default 0, aces integer not null default 0, perfects integer not null default 0,
  streak integer not null default 0,
  achievements text[] not null default '{}',
  title text,                                       -- 套用中的稱號（成就代碼）
  wheel text[] not null default '{hi5,taunt}',      -- T 輪盤：左、右、上、下
  updated_at timestamptz not null default now()
);
alter table public.player_progress enable row level security;
revoke all on public.player_progress from public, anon, authenticated;
grant select on public.player_progress to authenticated;
drop policy if exists progress_read_own on public.player_progress;
create policy progress_read_own on public.player_progress for select to authenticated using ((select auth.uid()) = user_id);

-- 每場比賽的紀錄（同一場只記一次；也當作稽核資料）
create table if not exists public.match_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null check (char_length(match_id) between 8 and 64),
  payload jsonb not null,
  exp_gain integer not null, coin_gain integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, match_id)
);
alter table public.match_records enable row level security;
revoke all on public.match_records from public, anon, authenticated;
grant select on public.match_records to authenticated;
drop policy if exists records_read_own on public.match_records;
create policy records_read_own on public.match_records for select to authenticated using ((select auth.uid()) = user_id);

-- ---------- 讀自己的進度（沒有就建一列） ----------
create or replace function public.my_progress() returns public.player_progress
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.player_progress;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  insert into public.player_progress(user_id) values (uid) on conflict (user_id) do nothing;
  select * into r from public.player_progress where user_id = uid;
  return r;
end; $$;

-- ---------- 記一場比賽 ----------
-- p_level：3 高手、4 校隊、5 企聯；p_human：純真人對戰（沒有 AI）
-- p_perf：{"k":扣球得分,"b":攔網得分,"a":發球得分,"p":完美接球,"e":失誤,"clean":一局舉球10次以上沒連擊持球,"wall":一球內攔網碰5次}
create or replace function public.record_match(p_match text, p_level integer, p_human boolean, p_won boolean,
  p_sets integer, p_points integer, p_seconds integer, p_perf jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); r public.player_progress;
  k int; b int; a int; p int; e int; perf numeric; base numeric; xp int; coin int; key text;
  today int; got text[] := '{}'; ach text[]; before_lv int; after_lv int;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_match is null or char_length(p_match) not between 8 and 64 then raise exception 'bad match'; end if;
  if not p_human and p_level not in (3, 4, 5) then raise exception 'bad level'; end if;
  if p_sets not between 1 and 5 or p_points not in (15, 20, 25) then raise exception 'bad rules'; end if;
  if p_seconds not between 60 and 4 * 3600 then raise exception 'bad duration'; end if;
  select count(*) into today from public.match_records where user_id = uid and created_at > now() - interval '1 day';
  if today >= 40 then raise exception 'daily limit'; end if;
  k := least(greatest(coalesce((p_perf->>'k')::int, 0), 0), 150); b := least(greatest(coalesce((p_perf->>'b')::int, 0), 0), 80);
  a := least(greatest(coalesce((p_perf->>'a')::int, 0), 0), 80); p := least(greatest(coalesce((p_perf->>'p')::int, 0), 0), 200);
  e := least(greatest(coalesce((p_perf->>'e')::int, 0), 0), 200);
  -- 經驗值：局數分 × 分數倍數 × 難度倍數 × 結果倍數 ＋ 表現分（最多 25）；金幣＝經驗值的 30%
  base := 10 * p_sets * (case p_points when 15 then 0.7 when 20 then 0.85 else 1.0 end)
          * (case when p_human then 1.5 when p_level = 5 then 1.7 when p_level = 4 then 1.3 else 1.0 end)
          * (case when p_won then 1.4 else 1.0 end);
  perf := least(25, greatest(0, k * 1.0 + b * 1.5 + a * 1.5 + p * 0.5 - e * 0.5));
  xp := round(base + perf); coin := round(xp * 0.3);
  insert into public.match_records(user_id, match_id, payload, exp_gain, coin_gain)
    values (uid, p_match, jsonb_build_object('lv', p_level, 'human', p_human, 'won', p_won, 'sets', p_sets, 'pts', p_points, 'sec', p_seconds, 'perf', p_perf), xp, coin)
    on conflict (user_id, match_id) do nothing;
  if not found then return jsonb_build_object('dup', true); end if;
  insert into public.player_progress(user_id) values (uid) on conflict (user_id) do nothing;
  select * into r from public.player_progress where user_id = uid for update;
  before_lv := r.exp / 500 + 1;
  key := case when p_human then 'h' else p_level::text end;
  r.stats := jsonb_set(jsonb_set(coalesce(r.stats, '{}'::jsonb), '{w}', coalesce(r.stats->'w', '{}'::jsonb), true), '{l}', coalesce(r.stats->'l', '{}'::jsonb), true);
  r.stats := jsonb_set(r.stats, array[case when p_won then 'w' else 'l' end, key], to_jsonb(coalesce((r.stats #>> array[case when p_won then 'w' else 'l' end, key])::int, 0) + 1), true);
  r.exp := r.exp + xp; r.coins := r.coins + coin; r.play_seconds := r.play_seconds + p_seconds;
  r.kills := r.kills + k; r.blocks := r.blocks + b; r.aces := r.aces + a; r.perfects := r.perfects + p;
  r.streak := case when p_won then r.streak + 1 else 0 end;
  -- 成就
  ach := r.achievements;
  if r.kills >= 100 and not 'cannon1' = any(ach) then got := array_append(got, 'cannon1'); end if;
  if r.kills >= 500 and not 'cannon2' = any(ach) then got := array_append(got, 'cannon2'); end if;
  if r.kills >= 1000 and not 'cannon3' = any(ach) then got := array_append(got, 'cannon3'); end if;
  if r.aces >= 50 and not 'server' = any(ach) then got := array_append(got, 'server'); end if;
  if r.perfects >= 200 and not 'libero' = any(ach) then got := array_append(got, 'libero'); end if;
  if coalesce((p_perf->>'clean')::boolean, false) and not 'setter' = any(ach) then got := array_append(got, 'setter'); end if;
  if coalesce((p_perf->>'wall')::boolean, false) and not 'wall' = any(ach) then got := array_append(got, 'wall'); end if;
  if p_won and not p_human and p_level = 5 and not 'pro1' = any(ach) then got := array_append(got, 'pro1'); end if;
  if coalesce((r.stats #>> '{w,5}')::int, 0) >= 10 and not 'pro10' = any(ach) then got := array_append(got, 'pro10'); end if;
  if r.streak >= 5 and not 'streak5' = any(ach) then got := array_append(got, 'streak5'); end if;
  r.achievements := ach || got;
  update public.player_progress set exp = r.exp, coins = r.coins, stats = r.stats, play_seconds = r.play_seconds,
    kills = r.kills, blocks = r.blocks, aces = r.aces, perfects = r.perfects, streak = r.streak,
    achievements = r.achievements, updated_at = now() where user_id = uid;
  after_lv := r.exp / 500 + 1;
  return jsonb_build_object('exp', xp, 'coins', coin, 'level', after_lv, 'levelUp', after_lv > before_lv, 'new', to_jsonb(got));
end; $$;

-- ---------- 套用稱號（要是已經解鎖的成就；null＝不顯示） ----------
create or replace function public.set_title(p_title text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_title is not null and not exists (select 1 from public.player_progress where user_id = uid and p_title = any(achievements)) then raise exception 'locked'; end if;
  update public.player_progress set title = p_title, updated_at = now() where user_id = uid;
end; $$;

-- ---------- T 輪盤（最多 4 格；動作代碼只能是英數） ----------
create or replace function public.set_wheel(p_wheel text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_wheel is null or array_length(p_wheel, 1) > 4 or exists (select 1 from unnest(p_wheel) x where x !~ '^[a-z0-9]{1,12}$') then raise exception 'bad wheel'; end if;
  insert into public.player_progress(user_id) values (uid) on conflict (user_id) do nothing;
  update public.player_progress set wheel = p_wheel, updated_at = now() where user_id = uid;
end; $$;

-- ---------- 球隊（Lv10 解鎖） ----------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                       -- 6 碼邀請碼
  name text not null unique check (char_length(name) between 2 and 12 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  owner uuid not null references auth.users(id) on delete cascade,
  jersey jsonb not null default '{"name":"主場球衣","body":"#2B6CB0","trim":"#F2F2EE","num":"#FFFFFF"}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  joined_at timestamptz not null default now()
);
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
revoke all on public.teams, public.team_members from public, anon, authenticated;
grant select on public.teams, public.team_members to authenticated;
drop policy if exists teams_read on public.teams;
drop policy if exists team_members_read on public.team_members;
create policy teams_read on public.teams for select to authenticated using (true);
create policy team_members_read on public.team_members for select to authenticated using (true);

create or replace function public.create_team(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); lv int; t public.teams; c text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select exp / 500 + 1 into lv from public.player_progress where user_id = uid;
  if coalesce(lv, 1) < 10 then raise exception 'level'; end if;
  if exists (select 1 from public.team_members where user_id = uid) then raise exception 'already in team'; end if;
  loop c := upper(substr(md5(random()::text), 1, 6)); exit when not exists (select 1 from public.teams where code = c); end loop;
  insert into public.teams(code, name, owner) values (c, btrim(p_name), uid) returning * into t;
  insert into public.team_members(user_id, team_id) values (uid, t.id);
  return to_jsonb(t);
end; $$;

create or replace function public.join_team(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); lv int; t public.teams;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select exp / 500 + 1 into lv from public.player_progress where user_id = uid;
  if coalesce(lv, 1) < 10 then raise exception 'level'; end if;
  if exists (select 1 from public.team_members where user_id = uid) then raise exception 'already in team'; end if;
  select * into t from public.teams where code = upper(btrim(p_code));
  if not found then raise exception 'no team'; end if;
  if (select count(*) from public.team_members where team_id = t.id) >= 30 then raise exception 'full'; end if;
  insert into public.team_members(user_id, team_id) values (uid, t.id);
  return to_jsonb(t);
end; $$;

create or replace function public.leave_team() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); tid uuid; own boolean;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select m.team_id, t.owner = uid into tid, own from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = uid;
  if tid is null then return; end if;
  delete from public.team_members where user_id = uid;
  if own then   -- 隊長離開：交給最早加入的隊員；沒人了就解散
    update public.teams set owner = (select user_id from public.team_members where team_id = tid order by joined_at limit 1) where id = tid
      and exists (select 1 from public.team_members where team_id = tid);
    delete from public.teams where id = tid and not exists (select 1 from public.team_members where team_id = tid);
  end if;
end; $$;

-- 隊長設計球衣：顏色都是 #RRGGBB、球衣名稱 1～12 字
create or replace function public.set_team_jersey(p_jersey jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if char_length(coalesce(p_jersey->>'name', '')) not between 1 and 12
     or coalesce(p_jersey->>'body', '') !~ '^#[0-9A-Fa-f]{6}$' or coalesce(p_jersey->>'trim', '') !~ '^#[0-9A-Fa-f]{6}$' or coalesce(p_jersey->>'num', '') !~ '^#[0-9A-Fa-f]{6}$'
  then raise exception 'bad jersey'; end if;
  update public.teams set jersey = jsonb_build_object('name', btrim(p_jersey->>'name'), 'body', p_jersey->>'body', 'trim', p_jersey->>'trim', 'num', p_jersey->>'num') where owner = uid;
  if not found then raise exception 'not owner'; end if;
end; $$;

-- 我的球隊（含隊員暱稱）
create or replace function public.my_team() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.teams;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select tt.* into t from public.teams tt join public.team_members m on m.team_id = tt.id where m.user_id = uid;
  if not found then return null; end if;
  return to_jsonb(t) || jsonb_build_object('isOwner', t.owner = uid, 'members',
    (select coalesce(jsonb_agg(jsonb_build_object('nickname', coalesce(p.nickname, '球友'), 'owner', m.user_id = t.owner) order by m.joined_at), '[]'::jsonb)
       from public.team_members m left join public.profiles p on p.id = m.user_id where m.team_id = t.id));
end; $$;

do $$ declare f text; begin
  foreach f in array array['my_progress()', 'record_match(text,integer,boolean,boolean,integer,integer,integer,jsonb)', 'set_title(text)', 'set_wheel(text[])',
                           'create_team(text)', 'join_team(text)', 'leave_team()', 'set_team_jersey(jsonb)', 'my_team()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
commit;
