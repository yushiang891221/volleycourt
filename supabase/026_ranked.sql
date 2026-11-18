-- WEB-030 積分賽（天梯）：每個帳號在 2v2、6v6 各有一個分數（從 1000 開始）。
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。
-- 分數只能由台北伺服器（用 service_role 金鑰）寫入：網頁、玩家自己都改不了。加減分在伺服器算好（server/shared/elo.mjs），這裡負責「同一場只記一次」和一次寫完。
begin;
create table if not exists public.ranked_ratings (
  player uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('2v2', '6v6')),
  rating integer not null default 1000 check (rating >= 0),
  games integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  peak integer not null default 1000,
  last_played timestamptz,
  primary key (player, mode)
);
create index if not exists ranked_ratings_board on public.ranked_ratings(mode, rating desc);
create table if not exists public.ranked_matches (
  id text primary key,                     -- 伺服器的比賽代碼（房號＋第幾場），同一場只記一次
  mode text not null,
  created_at timestamptz not null default now(),
  data jsonb not null                      -- 雙方名單、比分、每個人的加減分（查帳用）
);
alter table public.ranked_ratings enable row level security;
alter table public.ranked_matches enable row level security;
revoke all on public.ranked_ratings, public.ranked_matches from public, anon, authenticated;

-- 查分數（沒打過的人回 1000、0 場）。分數是公開的（之後排行榜也會顯示），誰都可以查。
create or replace function public.ranked_ratings_of(p_players uuid[], p_mode text)
returns table (player uuid, rating integer, games integer, wins integer, losses integer)
language sql stable security definer set search_path = '' as $$
  select u.id, coalesce(r.rating, 1000), coalesce(r.games, 0), coalesce(r.wins, 0), coalesce(r.losses, 0)
  from unnest(p_players[1:12]) as u(id)
  left join public.ranked_ratings r on r.player = u.id and r.mode = p_mode
$$;

-- 自己兩個模式的分數（大廳角色頭上顯示）
create or replace function public.ranked_mine()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_object_agg(m.mode, jsonb_build_object('rating', coalesce(r.rating, 1000), 'games', coalesce(r.games, 0), 'wins', coalesce(r.wins, 0), 'losses', coalesce(r.losses, 0), 'peak', coalesce(r.peak, 1000)))
  from (values ('2v2'), ('6v6')) as m(mode)
  left join public.ranked_ratings r on r.player = auth.uid() and r.mode = m.mode
  where auth.uid() is not null
$$;

-- 伺服器回報一場：p_changes = [{ "player": uuid, "delta": 整數, "won": true/false }, …]
-- 回傳 { dup: true }（這場記過了）或 { ratings: { player: 新分數 } }
create or replace function public.ranked_report(p_match text, p_mode text, p_changes jsonb, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c jsonb; pid uuid; d integer; w boolean; out jsonb := '{}'::jsonb; nr integer;
begin
  if p_mode not in ('2v2', '6v6') then raise exception 'bad mode'; end if;
  if p_match is null or length(p_match) < 8 or length(p_match) > 80 then raise exception 'bad match'; end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) < 1 or jsonb_array_length(p_changes) > 12 then raise exception 'bad changes'; end if;
  insert into public.ranked_matches(id, mode, data) values (p_match, p_mode, coalesce(p_data, '{}'::jsonb) || jsonb_build_object('changes', p_changes))
    on conflict (id) do nothing;
  if not found then return jsonb_build_object('dup', true); end if;
  for c in select * from jsonb_array_elements(p_changes) loop
    pid := (c->>'player')::uuid; d := greatest(-100, least(100, coalesce((c->>'delta')::integer, 0))); w := coalesce((c->>'won')::boolean, false);
    insert into public.ranked_ratings as r (player, mode, rating, games, wins, losses, peak, last_played)
      values (pid, p_mode, greatest(0, 1000 + d), 1, case when w then 1 else 0 end, case when w then 0 else 1 end, greatest(1000, 1000 + d), now())
      on conflict (player, mode) do update set
        rating = greatest(0, r.rating + d), games = r.games + 1,
        wins = r.wins + case when w then 1 else 0 end, losses = r.losses + case when w then 0 else 1 end,
        peak = greatest(r.peak, r.rating + d), last_played = now()
      returning rating into nr;
    out := out || jsonb_build_object(pid::text, nr);
  end loop;
  return jsonb_build_object('ratings', out);
end $$;

revoke all on function public.ranked_report(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ranked_report(text, text, jsonb, jsonb) to service_role;
revoke all on function public.ranked_ratings_of(uuid[], text) from public;
grant execute on function public.ranked_ratings_of(uuid[], text) to anon, authenticated, service_role;
revoke all on function public.ranked_mine() from public, anon;
grant execute on function public.ranked_mine() to authenticated;
commit;
