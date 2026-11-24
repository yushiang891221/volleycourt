-- 2026-11-25 外觀代碼多三碼（眉毛顏色、眼型、眉型）：新存的角色是 r2 開頭（r2 ＋ 12 碼 ＋ 2 碼背號，共 16 字；多眉毛顏色、眼型、眉型）。
-- 舊的 t2、r1 照樣收得下（不刪任何人的資料）。
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。一定要在新版網頁推上線「之前」執行，不然新角色存不進帳號。
begin;

alter table public.profiles drop constraint if exists profiles_appearance_check;
alter table public.profiles add constraint profiles_appearance_check
  check (appearance is null or appearance ~ '^((t2|r1)[0-9a-z]{9}|r2[0-9a-z]{12})[0-9]{2}$');

commit;

-- 檢查：下面這行應該回傳 1 列，內容含 r2[0-9a-z]{12}
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_appearance_check';
