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
    'mastery', jsonb_build_object('kills', coalesce(r.kills,0), 'assists', coalesce(r.assists,0), 'blocks', coalesce(r.blocks,0), 'perfects', coalesce(r.perfects,0)),
    'team_name', t.name, 'team_jersey', t.jersey)
    from public.profiles p
    left join public.player_progress r on r.user_id = p.id
    left join public.team_members m on m.user_id = p.id
    left join public.teams t on t.id = m.team_id
    where p.nickname = btrim(p_nickname));
end; $$;
revoke all on function public.public_profile(text) from public, anon;
grant execute on function public.public_profile(text) to authenticated;

commit;
