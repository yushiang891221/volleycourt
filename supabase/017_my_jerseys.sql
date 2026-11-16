-- 個人球衣 J3：把「我的球衣」（最多 3 件）和「現在穿哪一件」存進帳號，換電腦也在。
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。
-- 玩家只能讀寫自己的；寫入一律經過 set_my_jerseys() 檢查（代碼格式、字數、不雅字），不能直接改表。
-- 刪除帳號時跟著自動刪除（on delete cascade）。
begin;

create table if not exists public.player_jerseys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  list text[] not null default '{}',     -- 最多 3 件，空的格子是 null；代碼格式見 js/jersey.js
  wear smallint not null default -1,     -- 穿第幾件（0～2），-1＝沒穿自己的
  updated_at timestamptz not null default now()
);
alter table public.player_jerseys enable row level security;
revoke all on public.player_jerseys from public, anon, authenticated;

-- 不雅字：跟 js/jersey.js 的 BAD_WORDS 一樣（tests/verify-jersey.cjs 會比對兩邊）。比對前去掉空白、標點、大小寫。
create or replace function public.jersey_text_bad(t text) returns boolean
language sql immutable set search_path = '' as $$
  select exists (
    select 1 from unnest(array['幹你','幹妳','幹您','操你','操妳','靠北','靠杯','機掰','雞掰','機八','雞巴','屌','屄','肏','婊','賤人','王八','白痴','白癡','智障','去死','他媽','你媽','妳媽','三小','淫','援交','尻槍',
      'fuck','shit','bitch','cunt','dick','pussy','nigger','nigga','asshole','porn','wtf','stfu']) w
    where position(w in lower(regexp_replace(coalesce(t, ''), '[[:space:][:punct:]_]', '', 'g'))) > 0
  );
$$;

-- 一件球衣的代碼合不合法：j1 ＋ 11 個欄位（每個欄位的範圍都檢查）＋ ~正面字 ~背面名字（各 0～8 字、前後沒有空白、沒有控制字元、沒有不雅字）
create or replace function public.jersey_code_ok(c text) returns boolean
language sql immutable set search_path = '' as $$
  select c ~ '^j1[01][01][0-9a-h][0-9a-r]{5}[0-3][0-7][0-3]~[^~]{0,8}~[^~]{0,8}$'
    and c !~ '[[:cntrl:]]' and c !~ U&'[\0080-\009F\2028\2029]'
    and split_part(c, '~', 2) = btrim(split_part(c, '~', 2)) and split_part(c, '~', 3) = btrim(split_part(c, '~', 3))
    and not public.jersey_text_bad(split_part(c, '~', 2)) and not public.jersey_text_bad(split_part(c, '~', 3));
$$;

create or replace function public.my_jerseys() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.player_jerseys;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into r from public.player_jerseys where user_id = uid;
  if not found then return jsonb_build_object('list', '[]'::jsonb, 'wear', -1); end if;
  return jsonb_build_object('list', to_jsonb(r.list), 'wear', r.wear);
end; $$;

create or replace function public.set_my_jerseys(p_list text[], p_wear integer) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_list is null or coalesce(array_length(p_list, 1), 0) > 3 then raise exception 'bad jersey list'; end if;
  if exists (select 1 from unnest(p_list) x where x is not null and not public.jersey_code_ok(x)) then raise exception 'bad jersey'; end if;
  if p_wear is null or p_wear < -1 or p_wear > 2 or (p_wear >= 0 and p_list[p_wear + 1] is null) then raise exception 'bad wear'; end if;
  insert into public.player_jerseys(user_id, list, wear) values (uid, p_list, p_wear)
  on conflict (user_id) do update set list = excluded.list, wear = excluded.wear, updated_at = now();
end; $$;

revoke all on function public.jersey_text_bad(text) from public, anon;
revoke all on function public.jersey_code_ok(text) from public, anon;
revoke all on function public.my_jerseys() from public, anon;
revoke all on function public.set_my_jerseys(text[], integer) from public, anon;
grant execute on function public.my_jerseys() to authenticated;
grant execute on function public.set_my_jerseys(text[], integer) to authenticated;
commit;

-- 驗證（以登入的玩家身分）：
-- select public.my_jerseys();                                                -- {"list": [], "wear": -1}
-- select public.set_my_jerseys(array['j10049h707003~~', null, null], 0);     -- 成功
-- select public.set_my_jerseys(array['j10049h707003~幹你~'], 0);              -- bad jersey（不雅字）
-- select public.set_my_jerseys(array['j10049h707003~一二三四五六七八九~'], 0); -- bad jersey（超過 8 字）
-- select public.set_my_jerseys(array[null, null, null], 1);                  -- bad wear（第 2 件是空的）
