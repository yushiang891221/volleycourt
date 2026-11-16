-- 大廳跑馬燈（LIVE TICKER）的動態：新玩家加入、球隊消息、賽事結果、解成就。
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。要先執行過 004、019、023。
-- 事情發生時由資料庫自動記一筆（觸發器），只留最近 100 則；登入的玩家用 lobby_feed() 讀。公告不在這裡（網頁上的公告直接放進跑馬燈）。
begin;
create table if not exists public.lobby_feed (
  id bigserial primary key,
  kind text not null,            -- join 新玩家、team_new 新球隊、team_level 球隊升級、war 球隊戰結果、win 比賽贏球、ach 解成就
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lobby_feed_id on public.lobby_feed(id desc);
alter table public.lobby_feed enable row level security;
revoke all on public.lobby_feed from public, anon, authenticated;

-- 記一筆，只留最近 100 則
create or replace function public.lobby_feed_add(k text, d jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lobby_feed(kind, data) values (k, coalesce(d, '{}'::jsonb));
  delete from public.lobby_feed where id < (select min(id) from (select id from public.lobby_feed order by id desc limit 100) x);
end; $$;
create or replace function public.lobby_feed_nick(uid uuid) returns text
language sql stable security definer set search_path = '' as $$ select coalesce((select nickname from public.profiles where id = uid), '球友'); $$;

-- 新玩家：第一次取好暱稱
create or replace function public.feed_on_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.nickname is not null and (tg_op = 'INSERT' or old.nickname is null) then perform public.lobby_feed_add('join', jsonb_build_object('nick', new.nickname)); end if;
  return new;
end; $$;
drop trigger if exists feed_on_profile on public.profiles;
create trigger feed_on_profile after insert or update of nickname on public.profiles for each row execute function public.feed_on_profile();

-- 新球隊
create or replace function public.feed_on_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.lobby_feed_add('team_new', jsonb_build_object('team', new.name, 'nick', public.lobby_feed_nick(new.owner)));
  return new;
end; $$;
drop trigger if exists feed_on_team on public.teams;
create trigger feed_on_team after insert on public.teams for each row execute function public.feed_on_team();

-- 球隊升級（019 的球隊動態裡記了 levelup）
create or replace function public.feed_on_team_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'levelup' then perform public.lobby_feed_add('team_level', jsonb_build_object('team', (select name from public.teams where id = new.team_id), 'level', new.data->'level')); end if;
  return new;
end; $$;
drop trigger if exists feed_on_team_log on public.team_log;
create trigger feed_on_team_log after insert on public.team_log for each row execute function public.feed_on_team_log();

-- 球隊戰結算（023）
create or replace function public.feed_on_war() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' and new.winner is not null then
    perform public.lobby_feed_add('war', jsonb_build_object('win', case when new.winner = new.team_a then new.a_name else new.b_name end, 'lose', case when new.winner = new.team_a then new.b_name else new.a_name end));
  end if;
  return new;
end; $$;
drop trigger if exists feed_on_war on public.team_wars;
create trigger feed_on_war after update on public.team_wars for each row execute function public.feed_on_war();

-- 比賽贏球（開房比賽才會記戰績）：難度 3 高手、4 校隊、5 企聯，human＝真人對戰
create or replace function public.feed_on_match() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((new.payload->>'won')::boolean, false) then
    perform public.lobby_feed_add('win', jsonb_build_object('nick', public.lobby_feed_nick(new.user_id), 'lv', new.payload->'lv', 'human', coalesce((new.payload->>'human')::boolean, false)));
  end if;
  return new;
end; $$;
drop trigger if exists feed_on_match on public.match_records;
create trigger feed_on_match after insert on public.match_records for each row execute function public.feed_on_match();

-- 解成就：achievements 多了新的
create or replace function public.feed_on_progress() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  for k in select x from unnest(new.achievements) x where not (x = any (coalesce(old.achievements, '{}'))) loop
    perform public.lobby_feed_add('ach', jsonb_build_object('nick', public.lobby_feed_nick(new.user_id), 'key', k));
  end loop;
  return new;
end; $$;
drop trigger if exists feed_on_progress on public.player_progress;
create trigger feed_on_progress after update of achievements on public.player_progress for each row execute function public.feed_on_progress();

-- 讀最近的動態（新的在前）
create or replace function public.lobby_feed(p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'data', f.data, 'at', f.created_at) order by f.id desc)
    from (select * from public.lobby_feed order by id desc limit least(greatest(coalesce(p_limit, 30), 1), 100)) f), '[]'::jsonb);
end; $$;

do $$ declare f text; begin
  foreach f in array array['lobby_feed_add(text,jsonb)', 'lobby_feed_nick(uuid)', 'feed_on_profile()', 'feed_on_team()', 'feed_on_team_log()', 'feed_on_war()', 'feed_on_match()', 'feed_on_progress()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
revoke all on function public.lobby_feed(integer) from public, anon;
grant execute on function public.lobby_feed(integer) to authenticated;
commit;
