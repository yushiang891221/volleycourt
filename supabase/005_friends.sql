-- WEB-011：好友與私訊
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。
-- 加好友用暱稱（暱稱是唯一的）；對方接受才算好友；只有好友之間能私訊。資料表不開放直接讀寫，只能透過下面的函式。
begin;

create table if not exists public.friendships (
  a uuid not null references auth.users(id) on delete cascade,   -- 兩個人裡 uuid 比較小的
  b uuid not null references auth.users(id) on delete cascade,   -- 比較大的
  requester uuid not null,                                        -- 誰送出邀請
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b), check (a < b)
);
create table if not exists public.direct_messages (
  id bigserial primary key,
  from_id uuid not null references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists dm_pair on public.direct_messages (least(from_id, to_id), greatest(from_id, to_id), id desc);
create index if not exists dm_unread on public.direct_messages (to_id) where read_at is null;
alter table public.friendships enable row level security;
alter table public.direct_messages enable row level security;
revoke all on public.friendships, public.direct_messages from public, anon, authenticated;

-- 送好友邀請（用暱稱）；對方已經邀請過我＝直接成為好友
create or replace function public.friend_request(p_nickname text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); other uuid; x uuid; y uuid; f public.friendships;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select id into other from public.profiles where nickname = btrim(p_nickname);
  if other is null then raise exception 'no user'; end if;
  if other = uid then raise exception 'self'; end if;
  x := least(uid, other); y := greatest(uid, other);
  select * into f from public.friendships where a = x and b = y;
  if found then
    if f.status = 'accepted' then return 'already'; end if;
    if f.requester = uid then return 'pending'; end if;
    update public.friendships set status = 'accepted' where a = x and b = y; return 'accepted';
  end if;
  if (select count(*) from public.friendships where (a = uid or b = uid)) >= 200 then raise exception 'too many'; end if;
  insert into public.friendships(a, b, requester) values (x, y, uid);
  return 'sent';
end; $$;

-- 接受／拒絕邀請、刪除好友（p_accept=false 或已是好友時＝刪除）
create or replace function public.friend_respond(p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); x uuid; y uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  x := least(uid, p_user); y := greatest(uid, p_user);
  if p_accept then update public.friendships set status = 'accepted' where a = x and b = y and requester <> uid;
  else delete from public.friendships where a = x and b = y; end if;
end; $$;

-- 我的好友清單：好友、別人邀請我的、我邀請別人的；附上未讀私訊數
create or replace function public.friend_list() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'nickname', coalesce(p.nickname, '球友'), 'appearance', p.appearance,
      'state', case when f.status = 'accepted' then 'friend' when f.requester = uid then 'outgoing' else 'incoming' end,
      'unread', (select count(*) from public.direct_messages m where m.from_id = o.id and m.to_id = uid and m.read_at is null))
      order by f.status, p.nickname)
    from public.friendships f
    cross join lateral (select case when f.a = uid then f.b else f.a end as id) o
    left join public.profiles p on p.id = o.id
    where f.a = uid or f.b = uid), '[]'::jsonb);
end; $$;

-- 傳私訊（只有好友之間）；每分鐘最多 30 則
create or replace function public.dm_send(p_to uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 300 then raise exception 'bad text'; end if;
  if not exists (select 1 from public.friendships where a = least(uid, p_to) and b = greatest(uid, p_to) and status = 'accepted') then raise exception 'not friends'; end if;
  if (select count(*) from public.direct_messages where from_id = uid and created_at > now() - interval '1 minute') >= 30 then raise exception 'too fast'; end if;
  insert into public.direct_messages(from_id, to_id, body) values (uid, p_to, btrim(p_body));
end; $$;

-- 讀和某個好友的私訊（最近 50 則，順便標成已讀）
create or replace function public.dm_history(p_with uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('mine', m.from_id = uid, 'body', m.body, 'at', m.created_at) order by m.id), '[]'::jsonb) into r
    from (select * from public.direct_messages where (from_id = uid and to_id = p_with) or (from_id = p_with and to_id = uid) order by id desc limit 50) m;
  update public.direct_messages set read_at = now() where from_id = p_with and to_id = uid and read_at is null;
  return r;
end; $$;

do $$ declare f text; begin
  foreach f in array array['friend_request(text)', 'friend_respond(uuid,boolean)', 'friend_list()', 'dm_send(uuid,text)', 'dm_history(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
commit;
