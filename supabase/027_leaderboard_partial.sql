-- WEB-031 天梯排行榜＋中途離開也記成就。要先執行過 026_ranked.sql。
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。
begin;

-- 排行榜：p_mode '2v2'／'6v6'；p_scope 'all'（全服前 100）、'friends'（自己＋好友）、'team'（自己的球隊）
-- 上榜條件：打滿 10 場、14 天內有打。回傳 { rows: [{ rank, id, name, look, rating }], me: { rank, rating, games, need } }
create or replace function public.ranked_leaderboard(p_mode text, p_scope text default 'all')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); rows jsonb; me jsonb; my public.ranked_ratings;
begin
  if p_mode not in ('2v2', '6v6') then raise exception 'bad mode'; end if;
  if p_scope not in ('all', 'friends', 'team') then raise exception 'bad scope'; end if;
  with elig as (
    select r.player, r.rating, r.games from public.ranked_ratings r
    where r.mode = p_mode and r.games >= 10 and r.last_played > now() - interval '14 days'
      and (p_scope = 'all'
        or (p_scope = 'friends' and (r.player = uid or exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.a = uid and f.b = r.player) or (f.b = uid and f.a = r.player)))))
        or (p_scope = 'team' and exists (select 1 from public.team_members m1 join public.team_members m2 on m2.team_id = m1.team_id where m1.user_id = uid and m2.user_id = r.player)))
  ), ranked as (
    select e.*, row_number() over (order by e.rating desc, e.games desc, e.player) as rank from elig e
  )
  select coalesce(jsonb_agg(jsonb_build_object('rank', x.rank, 'id', x.player, 'name', p.nickname, 'look', p.appearance, 'rating', x.rating) order by x.rank), '[]'::jsonb),
         (select jsonb_build_object('rank', y.rank) from ranked y where y.player = uid)
    into rows, me
    from (select * from ranked order by rank limit 100) x left join public.profiles p on p.id = x.player;
  select * into my from public.ranked_ratings where player = uid and mode = p_mode;
  me := coalesce(me, jsonb_build_object('rank', null)) || jsonb_build_object('rating', coalesce(my.rating, 1000), 'games', coalesce(my.games, 0), 'need', greatest(0, 10 - coalesce(my.games, 0)));
  return jsonb_build_object('rows', rows, 'me', me);
end $$;
revoke all on function public.ranked_leaderboard(text, text) from public, anon;
grant execute on function public.ranked_leaderboard(text, text) to authenticated;

-- 中途離開（伺服器裁判的比賽，打到一半斷線或離開）：只記這場已經做到的次數與成就，不給經驗、金幣、勝敗、連勝。
-- 只有台北伺服器（service_role）能呼叫；p_match 跟整場的比賽代碼不同（後面加 :left），同一場只記一次。
create or replace function public.record_partial_for(p_player uuid, p_match text, p_seconds integer, p_perf jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.player_progress; ach text[]; got text[] := '{}';
  k int; b int; a int; kl int; ks int; fs int; md int; qk int; ss int; asn int; kc int;
begin
  if p_player is null or p_match is null or char_length(p_match) not between 8 and 64 then raise exception 'bad match'; end if;
  k := least(greatest(coalesce((p_perf->>'k')::int, 0), 0), 150); b := least(greatest(coalesce((p_perf->>'b')::int, 0), 0), 80);
  a := least(greatest(coalesce((p_perf->>'a')::int, 0), 0), 80); kc := least(greatest(coalesce((p_perf->>'kc')::int, 0), 0), 150);
  kl := least(greatest(coalesce((p_perf->>'kl')::int, 0), 0), 150); ks := least(greatest(coalesce((p_perf->>'ks')::int, 0), 0), 150);
  fs := least(greatest(coalesce((p_perf->>'fs')::int, 0), 0), 60); md := least(greatest(coalesce((p_perf->>'md')::int, 0), 0), 60);
  qk := least(greatest(coalesce((p_perf->>'qk')::int, 0), 0), 100); ss := least(greatest(coalesce((p_perf->>'ss')::int, 0), 0), 60);
  asn := least(greatest(coalesce((p_perf->>'as')::int, 0), 0), 150);
  insert into public.match_records(user_id, match_id, payload, exp_gain, coin_gain)
    values (p_player, p_match, jsonb_build_object('partial', true, 'sec', p_seconds, 'perf', p_perf), 0, 0)
    on conflict (user_id, match_id) do nothing;
  if not found then return jsonb_build_object('dup', true); end if;
  insert into public.player_progress(user_id) values (p_player) on conflict (user_id) do nothing;
  select * into r from public.player_progress where user_id = p_player for update;
  r.play_seconds := r.play_seconds + least(greatest(coalesce(p_seconds, 0), 0), 4 * 3600);
  r.cannon_kills := r.cannon_kills + kc; r.kills := r.kills + k; r.blocks := r.blocks + b; r.aces := r.aces + a;
  r.kills_line := r.kills_line + kl; r.kills_steep := r.kills_steep + ks; r.saves_far := r.saves_far + fs; r.dumps := r.dumps + md;
  r.quicks := r.quicks + qk; r.self_spikes := r.self_spikes + ss; r.assists := r.assists + asn;
  ach := r.achievements;
  -- 跟 record_match 一樣的「累計次數」成就（要贏才算的、整場才算的不在這裡）
  if (p_perf->>'lk')::int >= 1 and not 'langzi' = any(ach) then got := array_append(got, 'langzi'); end if;
  if coalesce((p_perf->>'wall')::boolean, false) and not 'wall' = any(ach) then got := array_append(got, 'wall'); end if;
  if r.cannon_kills >= 100 and not 'cannon1' = any(ach) then got := array_append(got, 'cannon1'); end if;
  if r.cannon_kills >= 500 and not 'cannon2' = any(ach) then got := array_append(got, 'cannon2'); end if;
  if r.cannon_kills >= 1000 and not 'cannon3' = any(ach) then got := array_append(got, 'cannon3'); end if;
  if r.cannon_kills >= 3000 and not 'cannon4' = any(ach) then got := array_append(got, 'cannon4'); end if;
  if r.cannon_kills >= 5000 and not 'cannon5' = any(ach) then got := array_append(got, 'cannon5'); end if;
  if r.blocks >= 100 and not 'iron1' = any(ach) then got := array_append(got, 'iron1'); end if;
  if r.blocks >= 500 and not 'iron2' = any(ach) then got := array_append(got, 'iron2'); end if;
  if r.blocks >= 1000 and not 'iron3' = any(ach) then got := array_append(got, 'iron3'); end if;
  if r.blocks >= 3000 and not 'iron4' = any(ach) then got := array_append(got, 'iron4'); end if;
  if r.blocks >= 5000 and not 'iron5' = any(ach) then got := array_append(got, 'iron5'); end if;
  if r.assists >= 1 and not 'assist1' = any(ach) then got := array_append(got, 'assist1'); end if;
  if r.assists >= 500 and not 'assist2' = any(ach) then got := array_append(got, 'assist2'); end if;
  if r.assists >= 1000 and not 'assist3' = any(ach) then got := array_append(got, 'assist3'); end if;
  if r.assists >= 3000 and not 'assist4' = any(ach) then got := array_append(got, 'assist4'); end if;
  if r.assists >= 5000 and not 'assist5' = any(ach) then got := array_append(got, 'assist5'); end if;
  if r.dumps >= 10 and not 'magic1' = any(ach) then got := array_append(got, 'magic1'); end if;
  if r.dumps >= 50 and not 'magic2' = any(ach) then got := array_append(got, 'magic2'); end if;
  if r.dumps >= 200 and not 'magic3' = any(ach) then got := array_append(got, 'magic3'); end if;
  if r.self_spikes >= 10 and not 'self1' = any(ach) then got := array_append(got, 'self1'); end if;
  if r.self_spikes >= 50 and not 'self2' = any(ach) then got := array_append(got, 'self2'); end if;
  if r.self_spikes >= 200 and not 'self3' = any(ach) then got := array_append(got, 'self3'); end if;
  if r.kills_line >= 30 and not 'line1' = any(ach) then got := array_append(got, 'line1'); end if;
  if r.kills_line >= 150 and not 'line2' = any(ach) then got := array_append(got, 'line2'); end if;
  if r.kills_line >= 500 and not 'line3' = any(ach) then got := array_append(got, 'line3'); end if;
  if r.kills_steep >= 30 and not 'sky1' = any(ach) then got := array_append(got, 'sky1'); end if;
  if r.kills_steep >= 150 and not 'sky2' = any(ach) then got := array_append(got, 'sky2'); end if;
  if r.kills_steep >= 500 and not 'sky3' = any(ach) then got := array_append(got, 'sky3'); end if;
  if r.saves_far >= 10 and not 'save1' = any(ach) then got := array_append(got, 'save1'); end if;
  if r.saves_far >= 50 and not 'save2' = any(ach) then got := array_append(got, 'save2'); end if;
  if r.saves_far >= 200 and not 'save3' = any(ach) then got := array_append(got, 'save3'); end if;
  if r.quicks >= 1 and not 'quick1' = any(ach) then got := array_append(got, 'quick1'); end if;
  if r.quicks >= 50 and not 'quick2' = any(ach) then got := array_append(got, 'quick2'); end if;
  if r.quicks >= 200 and not 'quick3' = any(ach) then got := array_append(got, 'quick3'); end if;
  if r.aces >= 50 and not 'server' = any(ach) then got := array_append(got, 'server'); end if;
  r.achievements := ach || got;
  update public.player_progress set play_seconds = r.play_seconds, cannon_kills = r.cannon_kills, kills = r.kills, blocks = r.blocks, aces = r.aces,
    kills_line = r.kills_line, kills_steep = r.kills_steep, saves_far = r.saves_far, dumps = r.dumps, quicks = r.quicks, self_spikes = r.self_spikes,
    assists = r.assists, achievements = r.achievements, updated_at = now() where user_id = p_player;
  return jsonb_build_object('new', to_jsonb(got));
end $$;
revoke all on function public.record_partial_for(uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.record_partial_for(uuid, text, integer, jsonb) to service_role;
commit;
