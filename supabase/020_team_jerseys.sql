-- 球隊系統 T3：球隊球衣（設計只在球隊主頁；件數＝球隊等級）＋隊員選穿哪一件。
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。要先執行過 017、018、019。
-- 退隊時的紀念球衣：019 的 team_history 已經在退隊那一刻存一份 teams.jerseys 副本，這裡不用再改。
begin;
alter table public.team_members add column if not exists wear smallint not null default -1;   -- 穿球隊的第幾件（-1＝沒穿球隊球衣，穿基本球衣）

-- 隊長、副隊長存球隊球衣：最多「球隊等級」件；每件都要符合球衣代碼格式（017／018 的 jersey_code_ok：袖型、字數、不雅字）
create or replace function public.set_team_jerseys(p_list text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare me record; n integer := coalesce(array_length(p_list, 1), 0); lv integer;
begin
  select * into me from public.team_me();
  if me.my_role not in ('owner', 'vice') then raise exception 'not manager'; end if;
  select public.team_level(exp) into lv from public.teams where id = me.tid;
  if n > lv then raise exception 'too many jerseys'; end if;
  if exists (select 1 from unnest(coalesce(p_list, '{}')) x where x is null or not public.jersey_code_ok(x)) then raise exception 'bad jersey'; end if;
  update public.teams set jerseys = coalesce(p_list, '{}') where id = me.tid;
  update public.team_members set wear = -1 where team_id = me.tid and wear >= n;   -- 刪掉的那件：穿著的人改回基本球衣
  perform public.team_log_add(me.tid, 'jersey', auth.uid(), null, jsonb_build_object('count', n));
end; $$;

-- 隊員選穿球隊的第幾件（-1＝不穿球隊球衣）
create or replace function public.set_team_wear(p_idx integer) returns void
language plpgsql security definer set search_path = '' as $$
declare me record; n integer;
begin
  select * into me from public.team_me();
  select coalesce(array_length(jerseys, 1), 0) into n from public.teams where id = me.tid;
  if p_idx is null or p_idx < -1 or p_idx >= n then raise exception 'bad wear'; end if;
  update public.team_members set wear = p_idx where user_id = auth.uid();
end; $$;

-- my_team 多帶「我穿第幾件」
create or replace function public.my_team_wear() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select wear from public.team_members where user_id = auth.uid()), -1);
$$;

revoke all on function public.set_team_jerseys(text[]) from public, anon;
revoke all on function public.set_team_wear(integer) from public, anon;
revoke all on function public.my_team_wear() from public, anon;
grant execute on function public.set_team_jerseys(text[]) to authenticated;
grant execute on function public.set_team_wear(integer) to authenticated;
grant execute on function public.my_team_wear() to authenticated;
commit;
