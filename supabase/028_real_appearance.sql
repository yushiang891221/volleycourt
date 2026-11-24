-- 2026-11-24 新角色（寫實身體＋日系頭）：外觀代碼改成 r1 開頭。
-- 舊的公仔代碼（t2）資料庫照樣收得下（不刪任何人的資料）；網頁只認 r1，還是 t2 的人登入時會被帶去重新建角色。
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。一定要在新版網頁推上線「之前」執行，不然新角色存不進帳號。
begin;

alter table public.profiles drop constraint if exists profiles_appearance_check;
alter table public.profiles add constraint profiles_appearance_check
  check (appearance is null or appearance ~ '^(t2|r1)[0-9a-z]{9}[0-9]{2}$');

commit;

-- 檢查：下面這行應該回傳 1 列，內容含 (t2|r1)
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_appearance_check';
