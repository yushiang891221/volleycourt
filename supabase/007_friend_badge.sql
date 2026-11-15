-- WEB-011 省流量：大廳「好友」按鈕的紅色數字只要一個數字（未讀私訊＋好友邀請），不用每次抓整份好友清單
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。要先執行過 005_friends.sql。
begin;
create or replace function public.friend_badge() returns integer
language sql security definer set search_path = '' as $$
  select (select count(*) from public.direct_messages where to_id = auth.uid() and read_at is null)::int
       + (select count(*) from public.friendships where (a = auth.uid() or b = auth.uid()) and status = 'pending' and requester <> auth.uid())::int;
$$;
revoke all on function public.friend_badge() from public, anon;
grant execute on function public.friend_badge() to authenticated;
commit;
