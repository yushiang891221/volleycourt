-- WEB-004；在全新的 Supabase 專案以 SQL Editor 執行一次。
begin;
create table public.profiles (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  nickname text unique check (nickname is null or (
    char_length(nickname) between 2 and 12
    and nickname = btrim(nickname)
    and nickname !~ '[[:cntrl:]]'
    and nickname !~ U&'[\0080-\009F\2028\2029]'
  )),
  appearance text check (appearance is null or appearance ~ '^t2[0-9a-z]{9}[0-9]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select (id, nickname, appearance) on public.profiles to authenticated;
grant insert (nickname, appearance) on public.profiles to authenticated;
grant update (nickname, appearance) on public.profiles to authenticated;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create function public.web004_create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;
revoke all on function public.web004_create_profile() from public, anon, authenticated;
create trigger web004_user_created after insert on auth.users
for each row execute function public.web004_create_profile();

create function public.web004_touch_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.web004_touch_profile() from public, anon, authenticated;
create trigger web004_profile_updated before update on public.profiles
for each row execute function public.web004_touch_profile();
-- 也支援先建立了登入帳號、才執行本 SQL 的專案。
insert into public.profiles(id) select id from auth.users on conflict (id) do nothing;
commit;

-- RLS 驗證：先以 Google 建立兩個測試帳號，將下面 A_UUID/B_UUID 換成真實 UUID。
-- 每段單獨執行，保留 rollback；不可只以 SQL Editor 的 postgres 身分測試。
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claim.sub', 'A_UUID', true);
-- select id,nickname,appearance from public.profiles; -- 能讀兩人的公開欄位
-- update public.profiles set nickname='測試甲方' where id='A_UUID'; -- UPDATE 1
-- update public.profiles set nickname='不可修改' where id='B_UUID'; -- UPDATE 0（被 RLS 過濾）
-- rollback;
-- 另開交易，同樣 set local role / set_config，再試以下每一條：
-- update public.profiles set id='B_UUID' where id='A_UUID'; -- 權限錯誤
-- update public.profiles set created_at=now() where id='A_UUID'; -- 權限錯誤
-- insert into public.profiles(id,nickname) values('B_UUID','不可新增'); -- 權限錯誤
-- select created_at from public.profiles; -- 權限錯誤
-- delete from public.profiles where id='A_UUID'; -- 權限錯誤
-- 每次錯誤後執行 rollback，再開始下一段測試。
