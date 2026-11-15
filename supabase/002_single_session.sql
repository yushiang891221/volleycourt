-- WEB-007：同一個帳號只能在一個地方登入（後登入的把先登入的踢掉）
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。
-- 每個帳號一列：記錄「目前在用這個帳號的裝置代碼」。只有本人讀得到、改得到，別人看不到。
begin;
create table if not exists public.active_sessions (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  session_id text not null check (char_length(session_id) between 8 and 64),
  updated_at timestamptz not null default now()
);
alter table public.active_sessions enable row level security;
revoke all on public.active_sessions from public, anon, authenticated;
grant select (user_id, session_id) on public.active_sessions to authenticated;
grant insert (user_id, session_id) on public.active_sessions to authenticated;
grant update (session_id) on public.active_sessions to authenticated;

drop policy if exists active_sessions_read_own on public.active_sessions;
drop policy if exists active_sessions_insert_own on public.active_sessions;
drop policy if exists active_sessions_update_own on public.active_sessions;
create policy active_sessions_read_own on public.active_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy active_sessions_insert_own on public.active_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy active_sessions_update_own on public.active_sessions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.web007_touch_session() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.web007_touch_session() from public, anon, authenticated;
drop trigger if exists web007_session_updated on public.active_sessions;
create trigger web007_session_updated before update on public.active_sessions
for each row execute function public.web007_touch_session();
commit;
