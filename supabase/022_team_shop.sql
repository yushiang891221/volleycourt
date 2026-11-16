-- 球隊系統 T5：球隊商店（用球隊資金買全隊共用的東西；隊長購買；球隊 Lv2 開放）。
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。要先執行過 019、020、021。
-- 商品：額外球衣格（+1 件，最多 +3，2000）、擴充人數（+5 人，最多 +10，3000）、球隊徽章（每個 1000，隊名旁邊顯示）、金色隊名（5000）。
-- 人數上限、球衣件數要算上買的：下面幾個 019／020 的函式照原樣抄過來，只把上限換成 team_cap_of／team_jersey_cap。
begin;
alter table public.teams add column if not exists extra_jerseys integer not null default 0 check (extra_jerseys between 0 and 3);
alter table public.teams add column if not exists extra_cap integer not null default 0 check (extra_cap between 0 and 10);
alter table public.teams add column if not exists badges text[] not null default '{}';   -- 買過的徽章
alter table public.teams add column if not exists badge text;                            -- 正在用的徽章
alter table public.teams add column if not exists gold_name boolean not null default false;

-- 這一隊的人數上限、球衣件數（等級＋商店買的）
create or replace function public.team_cap_of(t uuid) returns integer
language sql stable security definer set search_path = '' as $$ select public.team_cap(exp) + extra_cap from public.teams where id = t; $$;
create or replace function public.team_jersey_cap(t uuid) returns integer
language sql stable security definer set search_path = '' as $$ select public.team_level(exp) + extra_jerseys from public.teams where id = t; $$;
create or replace function public.team_badge_ok(b text) returns boolean
language sql immutable set search_path = '' as $$ select b = any (array['🏐', '🔥', '⚡', '🦅', '🐯', '🌊', '⭐', '👑']); $$;

-- 買東西（隊長）：p_item＝jersey_slot／cap5／badge／gold；徽章用 p_arg 指定哪一個
create or replace function public.team_buy(p_item text, p_arg text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me record; t public.teams; price integer;
begin
  select * into me from public.team_me();
  if me.my_role <> 'owner' then raise exception 'not owner'; end if;
  select * into t from public.teams where id = me.tid for update;
  if public.team_level(t.exp) < 2 then raise exception 'shop locked'; end if;
  if p_item = 'jersey_slot' then price := 2000; if t.extra_jerseys >= 3 then raise exception 'max owned'; end if;
  elsif p_item = 'cap5' then price := 3000; if t.extra_cap >= 10 then raise exception 'max owned'; end if;
  elsif p_item = 'badge' then price := 1000; if not public.team_badge_ok(p_arg) then raise exception 'bad item'; end if; if p_arg = any (t.badges) then raise exception 'max owned'; end if;
  elsif p_item = 'gold' then price := 5000; if t.gold_name then raise exception 'max owned'; end if;
  else raise exception 'bad item'; end if;
  if t.funds < price then raise exception 'funds'; end if;
  update public.teams set funds = funds - price,
    extra_jerseys = extra_jerseys + (case when p_item = 'jersey_slot' then 1 else 0 end),
    extra_cap = extra_cap + (case when p_item = 'cap5' then 5 else 0 end),
    badges = case when p_item = 'badge' then badges || p_arg else badges end,
    badge = case when p_item = 'badge' then p_arg else badge end,
    gold_name = gold_name or p_item = 'gold'
  where id = me.tid;
  perform public.team_log_add(me.tid, 'buy', auth.uid(), null, jsonb_build_object('item', p_item, 'arg', p_arg, 'price', price));
  return jsonb_build_object('funds', t.funds - price);
end; $$;

-- 換徽章（隊長、副隊長）：只能用買過的；null＝不顯示
create or replace function public.set_team_badge(p_badge text) returns void
language plpgsql security definer set search_path = '' as $$
declare me record;
begin
  select * into me from public.team_me();
  if me.my_role not in ('owner', 'vice') then raise exception 'not manager'; end if;
  if p_badge is not null and not exists (select 1 from public.teams where id = me.tid and p_badge = any (badges)) then raise exception 'bad item'; end if;
  update public.teams set badge = p_badge where id = me.tid;
end; $$;

-- ---------- 以下抄自 019／020，只改上限 ----------
create or replace function public.team_add_member(uid uuid, t uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e bigint;
begin
  select exp into e from public.teams where id = t for update;
  if (select count(*) from public.team_members where team_id = t) >= public.team_cap_of(t) then raise exception 'full'; end if;
  insert into public.team_members(user_id, team_id, role) values (uid, t, 'member');
  delete from public.team_applications where user_id = uid;
  perform public.team_log_add(t, 'join', uid, null);
end; $$;

create or replace function public.team_list(p_query text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); q text := btrim(coalesce(p_query, ''));
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(x order by x->>'rank') from (
    select jsonb_build_object('id', t.id, 'name', t.name, 'level', public.team_level(t.exp), 'members', (select count(*) from public.team_members m where m.team_id = t.id),
      'cap', public.team_cap_of(t.id), 'open', t.open, 'badge', t.badge, 'gold', t.gold_name, 'applied', exists (select 1 from public.team_applications a where a.team_id = t.id and a.user_id = uid),
      'owner', (select coalesce(p.nickname, '球友') from public.profiles p where p.id = t.owner), 'rank', lpad((1000000000 - t.exp)::text, 12, '0') || t.name) x
    from public.teams t where q = '' or position(lower(q) in lower(t.name)) > 0
    order by t.exp desc, t.created_at limit 50) s), '[]'::jsonb);
end; $$;

create or replace function public.apply_team(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.teams;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if public.player_level(uid) < 10 then raise exception 'level'; end if;
  if exists (select 1 from public.team_members where user_id = uid) then raise exception 'already in team'; end if;
  if public.team_cooling(uid) then raise exception 'cooldown'; end if;
  select * into t from public.teams where id = p_team;
  if not found then raise exception 'no team'; end if;
  if not t.open then raise exception 'closed'; end if;
  if (select count(*) from public.team_members where team_id = t.id) >= public.team_cap_of(t.id) then raise exception 'full'; end if;
  if (select count(*) from public.team_applications where user_id = uid) >= 5 then raise exception 'too many applications'; end if;
  insert into public.team_applications(user_id, team_id) values (uid, t.id) on conflict do nothing;
end; $$;

create or replace function public.my_team() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.teams; r text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select tt.* into t from public.teams tt join public.team_members m on m.team_id = tt.id where m.user_id = uid;
  if t.id is null then return null; end if;
  select role into r from public.team_members where user_id = uid;
  return to_jsonb(t) || jsonb_build_object(
    'isOwner', t.owner = uid, 'myRole', r,
    'level', public.team_level(t.exp), 'cap', public.team_cap_of(t.id), 'jerseyCap', public.team_jersey_cap(t.id), 'next', public.team_next_exp(t.exp),
    'applications', case when r in ('owner', 'vice') then (select count(*) from public.team_applications where team_id = t.id) else 0 end,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'nickname', coalesce(p.nickname, '球友'), 'owner', m.role = 'owner', 'role', m.role,
        'level', public.player_level(m.user_id), 'contrib', m.contrib, 'joined', m.joined_at, 'seen', p.last_seen_at)
        order by case m.role when 'owner' then 0 when 'vice' then 1 else 2 end, m.joined_at), '[]'::jsonb)
      from public.team_members m left join public.profiles p on p.id = m.user_id where m.team_id = t.id),
    'board', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'body', b.body, 'pinned', b.pinned, 'at', b.created_at, 'author', coalesce(p.nickname, '球友'))
        order by b.pinned desc, b.created_at desc), '[]'::jsonb)
      from public.team_board b left join public.profiles p on p.id = b.author where b.team_id = t.id),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('kind', l.kind, 'at', l.created_at, 'actor', pa.nickname, 'target', pt.nickname, 'data', l.data) order by l.id desc), '[]'::jsonb)
      from (select * from public.team_log where team_id = t.id order by id desc limit 20) l
      left join public.profiles pa on pa.id = l.actor left join public.profiles pt on pt.id = l.target));
end; $$;

create or replace function public.set_team_jerseys(p_list text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare me record; n integer := coalesce(array_length(p_list, 1), 0); lv integer;
begin
  select * into me from public.team_me();
  if me.my_role not in ('owner', 'vice') then raise exception 'not manager'; end if;
  select public.team_jersey_cap(me.tid) into lv;
  if n > lv then raise exception 'too many jerseys'; end if;
  if exists (select 1 from unnest(coalesce(p_list, '{}')) x where x is null or not public.jersey_code_ok(x)) then raise exception 'bad jersey'; end if;
  update public.teams set jerseys = coalesce(p_list, '{}') where id = me.tid;
  update public.team_members set wear = -1 where team_id = me.tid and wear >= n;   -- 刪掉的那件：穿著的人改回基本球衣
  perform public.team_log_add(me.tid, 'jersey', auth.uid(), null, jsonb_build_object('count', n));
end; $$;

do $$ declare f text; begin
  foreach f in array array['team_cap_of(uuid)', 'team_jersey_cap(uuid)', 'team_badge_ok(text)', 'team_add_member(uuid,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['team_buy(text,text)', 'set_team_badge(text)', 'team_list(text)', 'apply_team(uuid)', 'my_team()', 'set_team_jerseys(text[])'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
commit;
