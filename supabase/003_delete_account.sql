-- WEB-008：玩家自己刪除帳號（角色資訊 → 刪除帳號）
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。
-- 只能刪「自己」：函式裡用 auth.uid()，不接受任何參數，所以沒辦法拿來刪別人。
-- 刪掉 auth.users 那一列後，profiles（暱稱、外觀）和 active_sessions 會跟著自動刪除（on delete cascade）。
begin;
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
commit;
