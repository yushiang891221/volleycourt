-- 球隊系統 T6：球隊戰（排隊配對；球隊 Lv3 開放）。
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。要先執行過 019～022。
-- 流程：隊長／副隊長按「找對手」排隊 → 網頁每 5 秒問一次 war_status，裡面順便配對（球隊等級差 1 以內，等越久放越寬，每 2 分鐘多 1，最多差 4）
--      → 配到就產生一個房間代碼，兩隊隊員都按「進入球隊戰房間」，用原本的房間＋伺服器裁判打 6 對 6
--      → 打完兩隊的隊長／副隊長各自回報輸贏：一致就結算；不一致記「有爭議」不給獎勵；只有一隊回報、30 分鐘後照那一隊的結算。
-- 結算：贏的球隊 +25 球隊戰積分、+500 球隊經驗；輸的 -10 積分（最低 0）、+100 球隊經驗。積分從 1000 開始。
begin;
alter table public.teams add column if not exists war_wins integer not null default 0;
alter table public.teams add column if not exists war_losses integer not null default 0;
alter table public.teams add column if not exists war_points integer not null default 1000;

create table if not exists public.team_war_queue (
  team_id uuid primary key references public.teams(id) on delete cascade,
  queued_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.team_wars (
  id uuid primary key default gen_random_uuid(),
  team_a uuid references public.teams(id) on delete set null,   -- 球隊解散了也保留這場的紀錄（名字另外存）
  team_b uuid references public.teams(id) on delete set null,
  a_name text not null, b_name text not null,
  room text not null unique,
  status text not null default 'ready' check (status in ('ready', 'reported', 'done', 'disputed')),
  claim_a uuid, claim_b uuid,            -- 兩隊各自回報「哪一隊贏」
  winner uuid,
  created_at timestamptz not null default now(),
  first_report_at timestamptz,
  finished_at timestamptz
);
create index if not exists team_wars_a on public.team_wars(team_a, created_at desc);
create index if not exists team_wars_b on public.team_wars(team_b, created_at desc);
alter table public.team_war_queue enable row level security;
alter table public.team_wars enable row level security;
revoke all on public.team_war_queue, public.team_wars from public, anon, authenticated;

-- 結算一場（內部用）
create or replace function public.team_war_settle(w public.team_wars, win uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare lose uuid := case when win = w.team_a then w.team_b else w.team_a end;
begin
  update public.team_wars set status = 'done', winner = win, finished_at = now() where id = w.id;
  update public.teams set war_wins = war_wins + 1, war_points = war_points + 25 where id = win;
  update public.teams set war_losses = war_losses + 1, war_points = greatest(0, war_points - 10) where id = lose;
  if win is not null then perform public.team_add_exp(win, 500); perform public.team_log_add(win, 'warwin', null, null, jsonb_build_object('vs', case when win = w.team_a then w.b_name else w.a_name end)); end if;
  if lose is not null then perform public.team_add_exp(lose, 100); perform public.team_log_add(lose, 'warloss', null, null, jsonb_build_object('vs', case when lose = w.team_a then w.b_name else w.a_name end)); end if;
end; $$;

-- 這一隊正在打（還沒結算）的那一場
create or replace function public.team_war_active(t uuid) returns public.team_wars
language sql stable security definer set search_path = '' as $$
  select * from public.team_wars where (team_a = t or team_b = t) and status in ('ready', 'reported') order by created_at desc limit 1;
$$;

create or replace function public.war_join_queue() returns void
language plpgsql security definer set search_path = '' as $$
declare me record;
begin
  select * into me from public.team_me();
  if me.my_role not in ('owner', 'vice') then raise exception 'not manager'; end if;
  if (select public.team_level(exp) from public.teams where id = me.tid) < 3 then raise exception 'war locked'; end if;
  if (public.team_war_active(me.tid)).id is not null then raise exception 'in war'; end if;
  insert into public.team_war_queue(team_id, queued_by) values (me.tid, auth.uid()) on conflict do nothing;
end; $$;

create or replace function public.war_leave_queue() returns void
language plpgsql security definer set search_path = '' as $$
declare me record;
begin
  select * into me from public.team_me();
  if me.my_role not in ('owner', 'vice') then raise exception 'not manager'; end if;
  delete from public.team_war_queue where team_id = me.tid;
end; $$;

-- 狀態（任何隊員都能看）：順便配對、順便把超過 30 分鐘只有一隊回報的結算掉
create or replace function public.war_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me record; q public.team_war_queue; t public.teams; opp uuid; w public.team_wars; side text; ot public.teams; wait_min numeric;
begin
  select * into me from public.team_me();
  select * into t from public.teams where id = me.tid;
  w := public.team_war_active(me.tid);
  if w.id is not null and w.status = 'reported' and w.first_report_at < now() - interval '30 minutes' then
    perform public.team_war_settle(w, coalesce(w.claim_a, w.claim_b)); w := null;
    select * into t from public.teams where id = me.tid;   -- 剛結算完：重新讀戰績
  end if;
  -- 配對
  select * into q from public.team_war_queue where team_id = me.tid for update skip locked;
  if q.team_id is not null and (w is null or w.id is null) then
    wait_min := extract(epoch from now() - q.created_at) / 60;
    select o.team_id into opp from public.team_war_queue o join public.teams ot2 on ot2.id = o.team_id
      where o.team_id <> me.tid and abs(public.team_level(ot2.exp) - public.team_level(t.exp)) <= least(4, 1 + floor(wait_min / 2))
      order by o.created_at for update of o skip locked limit 1;
    if opp is not null then
      select * into ot from public.teams where id = opp;
      insert into public.team_wars(team_a, team_b, a_name, b_name, room)
        values (opp, me.tid, ot.name, t.name, 'TW' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)));   -- 先排隊的那隊當 A（房主）
      delete from public.team_war_queue where team_id in (opp, me.tid);
      perform public.team_log_add(me.tid, 'warmatch', null, null, jsonb_build_object('vs', ot.name));
      perform public.team_log_add(opp, 'warmatch', null, null, jsonb_build_object('vs', t.name));
      w := public.team_war_active(me.tid);
    end if;
  end if;
  select * into q from public.team_war_queue where team_id = me.tid;
  if w.id is not null then side := case when w.team_a = me.tid then 'a' else 'b' end; select * into ot from public.teams where id = case when side = 'a' then w.team_b else w.team_a end; end if;
  return jsonb_build_object(
    'level', public.team_level(t.exp), 'canQueue', public.team_level(t.exp) >= 3 and me.my_role in ('owner', 'vice'),
    'queued', q.team_id is not null, 'since', q.created_at,
    'war', case when w.id is null then null else jsonb_build_object('id', w.id, 'room', w.room, 'side', side, 'status', w.status, 'host', side = 'a',
        'opponent', case when side = 'a' then w.b_name else w.a_name end, 'opponentLevel', public.team_level(ot.exp), 'opponentPoints', ot.war_points,
        'myClaim', case when side = 'a' then w.claim_a else w.claim_b end, 'theirClaim', case when side = 'a' then w.claim_b else w.claim_a end, 'me', me.tid) end,
    'record', jsonb_build_object('wins', t.war_wins, 'losses', t.war_losses, 'points', t.war_points),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('vs', case when x.team_a = me.tid then x.b_name else x.a_name end, 'won', x.winner = me.tid, 'status', x.status, 'at', x.finished_at) order by x.created_at desc), '[]'::jsonb)
      from (select * from public.team_wars where (team_a = me.tid or team_b = me.tid) and status in ('done', 'disputed') order by created_at desc limit 5) x));
end; $$;

-- 回報輸贏（隊長、副隊長）：p_won＝我們贏了嗎
create or replace function public.war_report(p_won boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me record; w public.team_wars; side text; claim uuid;
begin
  select * into me from public.team_me();
  if me.my_role not in ('owner', 'vice') then raise exception 'not manager'; end if;
  if p_won is null then raise exception 'bad report'; end if;
  select * into w from public.team_wars where id = (public.team_war_active(me.tid)).id for update;
  if w.id is null then raise exception 'no war'; end if;
  side := case when w.team_a = me.tid then 'a' else 'b' end;
  claim := case when p_won then me.tid when side = 'a' then w.team_b else w.team_a end;
  if side = 'a' then w.claim_a := claim; else w.claim_b := claim; end if;
  if w.claim_a is not null and w.claim_b is not null then
    if w.claim_a = w.claim_b then perform public.team_war_settle(w, w.claim_a); return jsonb_build_object('status', 'done');
    else update public.team_wars set claim_a = w.claim_a, claim_b = w.claim_b, status = 'disputed', finished_at = now() where id = w.id; return jsonb_build_object('status', 'disputed'); end if;
  end if;
  update public.team_wars set claim_a = w.claim_a, claim_b = w.claim_b, status = 'reported', first_report_at = coalesce(first_report_at, now()) where id = w.id;
  return jsonb_build_object('status', 'reported');
end; $$;

do $$ declare f text; begin
  foreach f in array array['team_war_settle(public.team_wars,uuid)', 'team_war_active(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['war_join_queue()', 'war_leave_queue()', 'war_status()', 'war_report(boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
commit;
