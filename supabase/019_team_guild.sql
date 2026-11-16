-- 球隊系統 T1（像公會；企劃見 docs/企劃-球隊系統.md）
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。接在 004（舊的球隊）後面，不會刪掉原本的球隊和隊員。
-- 內容：建隊扣 1000 金幣、球隊等級／經驗／資金、人數上限、職位（隊長／副隊長／隊員）、申請加入與審核、踢人、轉讓、解散、
--       改隊名、公佈欄、捐金幣、隊員比賽經驗自動算進球隊（每人每天最多 300）、球隊動態、退隊紀錄（之後的紀念球衣用）。
-- 所有修改都只能透過下面的函式（會檢查身分和職位），表格本身不開放直接寫。
begin;

-- ---------- 欄位 ----------
alter table public.teams add column if not exists exp bigint not null default 0 check (exp >= 0);      -- 球隊經驗
alter table public.teams add column if not exists funds bigint not null default 0 check (funds >= 0);  -- 球隊資金（捐的金幣）
alter table public.teams add column if not exists open boolean not null default true;                  -- 開放申請加入
alter table public.teams add column if not exists jerseys text[] not null default '{}';                -- 球隊球衣（T3 用，代碼見 js/jersey.js）
alter table public.team_members add column if not exists role text not null default 'member';
alter table public.team_members add column if not exists contrib bigint not null default 0;            -- 對球隊的貢獻（比賽＋捐款）
alter table public.team_members add column if not exists day date;                                     -- 今天（台灣時間）已經算進球隊的比賽經驗
alter table public.team_members add column if not exists day_exp integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'team_members_role_check') then
    alter table public.team_members add constraint team_members_role_check check (role in ('owner', 'vice', 'member'));
  end if;
end $$;
-- 舊球隊：隊長補上職位
update public.team_members m set role = 'owner' from public.teams t where t.id = m.team_id and t.owner = m.user_id and m.role <> 'owner';

create table if not exists public.team_applications (   -- 申請加入
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);
create table if not exists public.team_board (           -- 公佈欄
  id bigserial primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  author uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 200),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.team_log (             -- 球隊動態（誰加入、升職、升級…），每隊留最近 50 則
  id bigserial primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null,
  actor uuid references auth.users(id) on delete set null,
  target uuid references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.team_history (         -- 待過的球隊（退出、被踢、解散都記；紀念球衣用退出那一刻的副本）
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid,
  team_name text not null,
  joined_at timestamptz not null,
  left_at timestamptz not null default now(),
  jerseys text[] not null default '{}',
  how text not null default 'leave'                      -- leave 自己退出、kick 被踢、disband 解散
);
create index if not exists team_board_team on public.team_board(team_id, created_at desc);
create index if not exists team_log_team on public.team_log(team_id, id desc);
create index if not exists team_history_user on public.team_history(user_id, left_at desc);
create index if not exists team_applications_team on public.team_applications(team_id, created_at);
alter table public.team_applications enable row level security;
alter table public.team_board enable row level security;
alter table public.team_log enable row level security;
alter table public.team_history enable row level security;
revoke all on public.team_applications, public.team_board, public.team_log, public.team_history from public, anon, authenticated;

-- ---------- 小工具 ----------
-- 球隊等級：累積經驗 0／3000／8000／15000／25000 → Lv1～5；人數上限 10／15／20／25／30
create or replace function public.team_level(e bigint) returns integer
language sql immutable set search_path = '' as $$
  select case when e >= 25000 then 5 when e >= 15000 then 4 when e >= 8000 then 3 when e >= 3000 then 2 else 1 end;
$$;
create or replace function public.team_cap(e bigint) returns integer
language sql immutable set search_path = '' as $$ select 5 + 5 * public.team_level(e); $$;
create or replace function public.team_next_exp(e bigint) returns integer
language sql immutable set search_path = '' as $$
  select case public.team_level(e) when 1 then 3000 when 2 then 8000 when 3 then 15000 when 4 then 25000 else null end;
$$;
create or replace function public.team_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Taipei')::date; $$;
-- 玩家等級（跟 004 一樣：每 500 經驗一級）
create or replace function public.player_level(uid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select exp / 500 + 1 from public.player_progress where user_id = uid), 1);
$$;
-- 記一筆動態，每隊只留最近 50 則
create or replace function public.team_log_add(t uuid, k text, a uuid, tg uuid, d jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.team_log(team_id, kind, actor, target, data) values (t, k, a, tg, coalesce(d, '{}'::jsonb));
  delete from public.team_log where team_id = t and id not in (select id from public.team_log where team_id = t order by id desc limit 50);
end; $$;
-- 球隊經驗增加（升級就記一筆動態）
create or replace function public.team_add_exp(t uuid, amount bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare before_lv integer; after_lv integer;
begin
  if amount <= 0 then return; end if;
  select public.team_level(exp) into before_lv from public.teams where id = t;
  update public.teams set exp = exp + amount where id = t returning public.team_level(exp) into after_lv;
  if after_lv > before_lv then perform public.team_log_add(t, 'levelup', null, null, jsonb_build_object('level', after_lv)); end if;
end; $$;
-- 離開球隊時記下經歷（紀念球衣用當下的球衣副本）
create or replace function public.team_remember(uid uuid, t uuid, how text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.team_history(user_id, team_id, team_name, joined_at, jerseys, how)
    select m.user_id, tt.id, tt.name, m.joined_at, tt.jerseys, how
    from public.team_members m join public.teams tt on tt.id = m.team_id where m.user_id = uid and m.team_id = t;
end; $$;
-- 隊名：2～12 字、前後沒空白、沒有控制字元、沒有不雅字（跟球衣同一份清單）
create or replace function public.team_name_ok(n text) returns boolean
language sql immutable set search_path = '' as $$
  select n is not null and char_length(n) between 2 and 12 and n = btrim(n) and n !~ '[[:cntrl:]]' and not public.jersey_text_bad(n);
$$;
-- 我在哪一隊、什麼職位（沒有就丟錯）
create or replace function public.team_me(out tid uuid, out my_role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select m.team_id, m.role into tid, my_role from public.team_members m where m.user_id = auth.uid();
  if tid is null then raise exception 'not in team'; end if;
end; $$;
-- 退隊冷卻：離開（自己退、被踢）24 小時內不能加入或建立別的球隊；解散不算
create or replace function public.team_cooling(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_history where user_id = uid and how in ('leave', 'kick') and left_at > now() - interval '24 hours');
$$;
-- 加入一個隊員（呼叫前已確認他沒有球隊）
create or replace function public.team_add_member(uid uuid, t uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e bigint;
begin
  select exp into e from public.teams where id = t for update;
  if (select count(*) from public.team_members where team_id = t) >= public.team_cap(e) then raise exception 'full'; end if;
  insert into public.team_members(user_id, team_id, role) values (uid, t, 'member');
  delete from public.team_applications where user_id = uid;
  perform public.team_log_add(t, 'join', uid, null);
end; $$;

-- ---------- 建隊、加入、離開 ----------
create or replace function public.create_team(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.teams; c text; n text := btrim(coalesce(p_name, ''));
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if public.player_level(uid) < 10 then raise exception 'level'; end if;
  if exists (select 1 from public.team_members where user_id = uid) then raise exception 'already in team'; end if;
  if public.team_cooling(uid) then raise exception 'cooldown'; end if;
  if not public.team_name_ok(n) then raise exception 'bad name'; end if;
  if exists (select 1 from public.teams where name = n) then raise exception 'name taken'; end if;
  update public.player_progress set coins = coins - 1000, updated_at = now() where user_id = uid and coins >= 1000;   -- 建隊 1000 金幣
  if not found then raise exception 'coins'; end if;
  loop c := upper(substr(md5(random()::text), 1, 6)); exit when not exists (select 1 from public.teams where code = c); end loop;
  insert into public.teams(code, name, owner) values (c, n, uid) returning * into t;
  insert into public.team_members(user_id, team_id, role) values (uid, t.id, 'owner');
  delete from public.team_applications where user_id = uid;
  perform public.team_log_add(t.id, 'create', uid, null);
  return to_jsonb(t);
end; $$;

create or replace function public.join_team(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.teams;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if public.player_level(uid) < 10 then raise exception 'level'; end if;
  if exists (select 1 from public.team_members where user_id = uid) then raise exception 'already in team'; end if;
  if public.team_cooling(uid) then raise exception 'cooldown'; end if;
  select * into t from public.teams where code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'no team'; end if;
  perform public.team_add_member(uid, t.id);
  return to_jsonb(t);
end; $$;

create or replace function public.leave_team() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); tid uuid; r text; heir uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select team_id, role into tid, r from public.team_members where user_id = uid;
  if tid is null then return; end if;
  perform public.team_remember(uid, tid, 'leave');
  delete from public.team_members where user_id = uid;
  perform public.team_log_add(tid, 'leave', uid, null);
  if r = 'owner' then   -- 隊長離開：先交給副隊長（最早加入的），沒有就交給最早加入的隊員；沒人了就解散
    select user_id into heir from public.team_members where team_id = tid order by (role = 'vice') desc, joined_at limit 1;
    if heir is null then delete from public.teams where id = tid;
    else
      update public.teams set owner = heir where id = tid;
      update public.team_members set role = 'owner' where user_id = heir;
      perform public.team_log_add(tid, 'owner', null, heir);
    end if;
  end if;
end; $$;

-- ---------- 球隊列表、申請、審核 ----------
-- 列表（給還沒有球隊的人找）：不包含邀請碼；p_query 用隊名搜尋
create or replace function public.team_list(p_query text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); q text := btrim(coalesce(p_query, ''));
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(x order by x->>'rank') from (
    select jsonb_build_object('id', t.id, 'name', t.name, 'level', public.team_level(t.exp), 'members', (select count(*) from public.team_members m where m.team_id = t.id),
      'cap', public.team_cap(t.exp), 'open', t.open, 'applied', exists (select 1 from public.team_applications a where a.team_id = t.id and a.user_id = uid),
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
  if (select count(*) from public.team_members where team_id = t.id) >= public.team_cap(t.exp) then raise exception 'full'; end if;
  if (select count(*) from public.team_applications where user_id = uid) >= 5 then raise exception 'too many applications'; end if;
  insert into public.team_applications(user_id, team_id) values (uid, t.id) on conflict do nothing;
end; $$;

create or replace function public.cancel_application(p_team uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.team_applications where user_id = auth.uid() and team_id = p_team;
$$;

-- 隊長、副隊長看申請名單
create or replace function public.team_applications() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select * into me from public.team_me();
  if me.my_role not in ('owner', 'vice') then raise exception 'not manager'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.user_id, 'nickname', coalesce(p.nickname, '球友'), 'level', public.player_level(a.user_id), 'at', a.created_at) order by a.created_at)
    from public.team_applications a left join public.profiles p on p.id = a.user_id where a.team_id = me.tid), '[]'::jsonb);
end; $$;

create or replace function public.decide_application(p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me record;
begin
  select * into me from public.team_me();
  if me.my_role not in ('owner', 'vice') then raise exception 'not manager'; end if;
  if not exists (select 1 from public.team_applications where user_id = p_user and team_id = me.tid) then raise exception 'no application'; end if;
  if not p_accept then delete from public.team_applications where user_id = p_user and team_id = me.tid; return; end if;
  if exists (select 1 from public.team_members where user_id = p_user) then
    delete from public.team_applications where user_id = p_user; raise exception 'already in team';
  end if;
  perform public.team_add_member(p_user, me.tid);
end; $$;

-- ---------- 管理成員 ----------
-- 踢人：隊長可以踢副隊長和隊員；副隊長只能踢隊員
create or replace function public.kick_member(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me record; r text;
begin
  select * into me from public.team_me();
  select role into r from public.team_members where user_id = p_user and team_id = me.tid;
  if r is null then raise exception 'not member'; end if;
  if p_user = auth.uid() or r = 'owner' or me.my_role = 'member' or (me.my_role = 'vice' and r <> 'member') then raise exception 'no permission'; end if;
  perform public.team_remember(p_user, me.tid, 'kick');
  delete from public.team_members where user_id = p_user;
  perform public.team_log_add(me.tid, 'kick', auth.uid(), p_user);
end; $$;

-- 升降職位（隊長）：vice＝副隊長（最多 2 個）、member＝隊員
create or replace function public.set_member_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare me record; r text;
begin
  select * into me from public.team_me();
  if me.my_role <> 'owner' then raise exception 'not owner'; end if;
  if p_role not in ('vice', 'member') then raise exception 'bad role'; end if;
  select role into r from public.team_members where user_id = p_user and team_id = me.tid;
  if r is null or r = 'owner' then raise exception 'not member'; end if;
  if r = p_role then return; end if;
  if p_role = 'vice' and (select count(*) from public.team_members where team_id = me.tid and role = 'vice') >= 2 then raise exception 'too many vice'; end if;
  update public.team_members set role = p_role where user_id = p_user;
  perform public.team_log_add(me.tid, p_role, auth.uid(), p_user);
end; $$;

-- 轉讓隊長（隊長）：自己變成副隊長
create or replace function public.transfer_owner(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me record;
begin
  select * into me from public.team_me();
  if me.my_role <> 'owner' then raise exception 'not owner'; end if;
  if p_user = auth.uid() or not exists (select 1 from public.team_members where user_id = p_user and team_id = me.tid) then raise exception 'not member'; end if;
  update public.team_members set role = 'vice' where user_id = auth.uid();
  update public.team_members set role = 'owner' where user_id = p_user;
  update public.teams set owner = p_user where id = me.tid;
  perform public.team_log_add(me.tid, 'owner', auth.uid(), p_user);
end; $$;

-- 解散（隊長）：每個人都記一筆經歷（紀念球衣），然後整隊刪除
create or replace function public.disband_team() returns void
language plpgsql security definer set search_path = '' as $$
declare me record; m record;
begin
  select * into me from public.team_me();
  if me.my_role <> 'owner' then raise exception 'not owner'; end if;
  for m in select user_id from public.team_members where team_id = me.tid loop perform public.team_remember(m.user_id, me.tid, 'disband'); end loop;
  delete from public.teams where id = me.tid;
end; $$;

create or replace function public.set_team_name(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare me record; n text := btrim(coalesce(p_name, ''));
begin
  select * into me from public.team_me();
  if me.my_role <> 'owner' then raise exception 'not owner'; end if;
  if not public.team_name_ok(n) then raise exception 'bad name'; end if;
  if exists (select 1 from public.teams where name = n and id <> me.tid) then raise exception 'name taken'; end if;
  update public.teams set name = n where id = me.tid;
  perform public.team_log_add(me.tid, 'rename', auth.uid(), null, jsonb_build_object('name', n));
end; $$;

create or replace function public.set_team_open(p_open boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me record;
begin
  select * into me from public.team_me();
  if me.my_role not in ('owner', 'vice') then raise exception 'not manager'; end if;
  update public.teams set open = coalesce(p_open, true) where id = me.tid;
  if not coalesce(p_open, true) then delete from public.team_applications where team_id = me.tid; end if;
end; $$;

-- ---------- 公佈欄 ----------
-- 隊長、副隊長發：1～200 字、不雅字擋掉；最多留 10 則（超過刪最舊的沒置頂的）；置頂只能 1 則
create or replace function public.post_notice(p_body text, p_pinned boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare me record; b text := btrim(coalesce(p_body, ''));
begin
  select * into me from public.team_me();
  if me.my_role not in ('owner', 'vice') then raise exception 'not manager'; end if;
  if char_length(b) not between 1 and 200 or b ~ '[\x01-\x09\x0b-\x1f\x7f\u0080-\u009f\u2028\u2029]' or public.jersey_text_bad(b) then raise exception 'bad notice'; end if;
  if coalesce(p_pinned, false) then update public.team_board set pinned = false where team_id = me.tid; end if;
  insert into public.team_board(team_id, author, body, pinned) values (me.tid, auth.uid(), b, coalesce(p_pinned, false));
  delete from public.team_board where id in (select id from public.team_board where team_id = me.tid and not pinned order by created_at desc offset 9);
end; $$;

create or replace function public.delete_notice(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare me record;
begin
  select * into me from public.team_me();
  if me.my_role not in ('owner', 'vice') then raise exception 'not manager'; end if;
  delete from public.team_board where id = p_id and team_id = me.tid;
end; $$;

create or replace function public.pin_notice(p_id bigint, p_pinned boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me record;
begin
  select * into me from public.team_me();
  if me.my_role not in ('owner', 'vice') then raise exception 'not manager'; end if;
  if coalesce(p_pinned, false) then update public.team_board set pinned = false where team_id = me.tid; end if;
  update public.team_board set pinned = coalesce(p_pinned, false) where id = p_id and team_id = me.tid;
end; $$;

-- ---------- 捐金幣：1 金幣＝1 球隊經驗＋1 球隊資金 ----------
create or replace function public.donate_coins(p_amount integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me record;
begin
  select * into me from public.team_me();
  if p_amount is null or p_amount < 1 or p_amount > 100000 then raise exception 'bad amount'; end if;
  update public.player_progress set coins = coins - p_amount, updated_at = now() where user_id = auth.uid() and coins >= p_amount;
  if not found then raise exception 'coins'; end if;
  update public.teams set funds = funds + p_amount where id = me.tid;
  update public.team_members set contrib = contrib + p_amount where user_id = auth.uid();
  perform public.team_add_exp(me.tid, p_amount);
  perform public.team_log_add(me.tid, 'donate', auth.uid(), null, jsonb_build_object('amount', p_amount));
  return jsonb_build_object('coins', (select coins from public.player_progress where user_id = auth.uid()), 'funds', (select funds from public.teams where id = me.tid));
end; $$;

-- ---------- 隊員比賽經驗自動算進球隊（每人每天最多 300） ----------
create or replace function public.team_match_exp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m public.team_members; today date := public.team_today(); add integer;
begin
  select * into m from public.team_members where user_id = new.user_id for update;
  if not found or coalesce(new.exp_gain, 0) <= 0 then return new; end if;
  if m.day is distinct from today then m.day_exp := 0; end if;
  add := least(new.exp_gain, greatest(0, 300 - m.day_exp));
  update public.team_members set day = today, day_exp = m.day_exp + add, contrib = contrib + add where user_id = new.user_id;
  perform public.team_add_exp(m.team_id, add);
  return new;
end; $$;
drop trigger if exists team_match_exp on public.match_records;
create trigger team_match_exp after insert on public.match_records for each row execute function public.team_match_exp();

-- ---------- 我的球隊（球隊主頁要的全部資料） ----------
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
    'level', public.team_level(t.exp), 'cap', public.team_cap(t.exp), 'next', public.team_next_exp(t.exp),
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

-- 我待過的球隊（紀念球衣，T3 用）
create or replace function public.my_team_history() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('team', h.team_name, 'joined', h.joined_at, 'left', h.left_at, 'jerseys', to_jsonb(h.jerseys), 'how', h.how) order by h.left_at desc)
    from public.team_history h where h.user_id = auth.uid()), '[]'::jsonb);
end; $$;

-- ---------- 權限：小工具不給外面呼叫；給玩家用的開放給登入的人 ----------
do $$ declare f text; begin
  foreach f in array array['team_level(bigint)', 'team_cap(bigint)', 'team_next_exp(bigint)', 'team_today()', 'player_level(uuid)', 'team_log_add(uuid,text,uuid,uuid,jsonb)',
                           'team_add_exp(uuid,bigint)', 'team_remember(uuid,uuid,text)', 'team_name_ok(text)', 'team_me()', 'team_cooling(uuid)', 'team_add_member(uuid,uuid)', 'team_match_exp()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['create_team(text)', 'join_team(text)', 'leave_team()', 'team_list(text)', 'apply_team(uuid)', 'cancel_application(uuid)', 'team_applications()',
                           'decide_application(uuid,boolean)', 'kick_member(uuid)', 'set_member_role(uuid,text)', 'transfer_owner(uuid)', 'disband_team()', 'set_team_name(text)',
                           'set_team_open(boolean)', 'post_notice(text,boolean)', 'delete_notice(bigint)', 'pin_notice(bigint,boolean)', 'donate_coins(integer)', 'my_team()', 'my_team_history()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
commit;
