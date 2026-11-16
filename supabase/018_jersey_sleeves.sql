-- 個人球衣：袖型改成四種（短袖、長袖、短版、無袖），代碼第一個欄位從 0～1 變成 0～3。
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。只換掉格式檢查，其他不變。
begin;
create or replace function public.jersey_code_ok(c text) returns boolean
language sql immutable set search_path = '' as $$
  select c ~ '^j1[0-3][01][0-9a-h][0-9a-r]{5}[0-3][0-7][0-3]~[^~]{0,8}~[^~]{0,8}$'
    and c !~ '[[:cntrl:]]' and c !~ U&'[\0080-\009F\2028\2029]'
    and split_part(c, '~', 2) = btrim(split_part(c, '~', 2)) and split_part(c, '~', 3) = btrim(split_part(c, '~', 3))
    and not public.jersey_text_bad(split_part(c, '~', 2)) and not public.jersey_text_bad(split_part(c, '~', 3));
$$;
revoke all on function public.jersey_code_ok(text) from public, anon;
commit;
