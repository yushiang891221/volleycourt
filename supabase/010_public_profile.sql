-- WEB-012 個人檔案與邀請計數，可重複執行。先完成 004、005、007。
begin;
create or replace function public.public_profile(p_nickname text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return (select jsonb_build_object(
    'nickname', p.nickname, 'appearance', p.appearance,
    'exp', coalesce(r.exp, 0), 'title', r.title,
    'achievements', coalesce(r.achievements, '{}'::text[]),
    'wins', (select coalesce(sum(value::bigint), 0) from jsonb_each_text(coalesce(r.stats->'w', '{}'::jsonb))),
    'losses', (select coalesce(sum(value::bigint), 0) from jsonb_each_text(coalesce(r.stats->'l', '{}'::jsonb))),
    'team_name', t.name, 'team_jersey', t.jersey)
    from public.profiles p
    left join public.player_progress r on r.user_id = p.id
    left join public.team_members m on m.user_id = p.id
    left join public.teams t on t.id = m.team_id
    where p.nickname = btrim(p_nickname));
end; $$;
revoke all on function public.public_profile(text) from public, anon;
grant execute on function public.public_profile(text) to authenticated;

-- 保留 007 的無參數整數介面，新介面只讀取兩個計數。
create or replace function public.friend_badge(p_details boolean) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('incoming', n, 'total', n +
    (select count(*) from public.direct_messages where to_id = auth.uid() and read_at is null))
  from (select count(*) as n from public.friendships
    where (a = auth.uid() or b = auth.uid()) and status = 'pending' and requester <> auth.uid()) counts;
$$;
revoke all on function public.friend_badge(boolean) from public, anon;
grant execute on function public.friend_badge(boolean) to authenticated;
commit;
