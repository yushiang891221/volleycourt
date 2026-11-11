-- WEB-010 更新：①修正戰績寫不進去（解鎖成就時 text[] || '代碼' 會報錯，改用 array_append）
--              ②新成就：絕處逢生（逆轉拿下的局數 1／5／10／15／30）、銅牆鐵壁（攔網得分 100／500／1000）、
--                直線魔人（直線得分 30／150／500）、天空打點（扣進三米線內得分 30／150／500）、
--                自由人改成三階（完美接球 100／500／1000）
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。要先執行過 004_progress.sql。
begin;
alter table public.player_progress add column if not exists comebacks integer not null default 0;
alter table public.player_progress add column if not exists kills_line integer not null default 0;   -- 直線得分
alter table public.player_progress add column if not exists kills_steep integer not null default 0;  -- 扣進三米線內得分
-- ---------- 記一場比賽 ----------
-- p_level：3 高手、4 校隊、5 企聯；p_human：純真人對戰（沒有 AI）
-- p_perf：{"k":扣球得分,"b":攔網得分,"a":發球得分,"p":完美接球,"e":失誤,"clean":一局舉球10次以上沒連擊持球,"wall":一球內攔網碰5次}
create or replace function public.record_match(p_match text, p_level integer, p_human boolean, p_won boolean,
  p_sets integer, p_points integer, p_seconds integer, p_perf jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); r public.player_progress;
  k int; b int; a int; p int; e int; c int; kl int; ks int; perf numeric; base numeric; xp int; coin int; key text;
  today int; got text[] := '{}'; ach text[]; before_lv int; after_lv int;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_match is null or char_length(p_match) not between 8 and 64 then raise exception 'bad match'; end if;
  if not p_human and p_level not in (3, 4, 5) then raise exception 'bad level'; end if;
  if p_sets not between 1 and 5 or p_points not in (15, 20, 25) then raise exception 'bad rules'; end if;
  if p_seconds not between 60 and 4 * 3600 then raise exception 'bad duration'; end if;
  select count(*) into today from public.match_records where user_id = uid and created_at > now() - interval '1 day';
  if today >= 40 then raise exception 'daily limit'; end if;
  k := least(greatest(coalesce((p_perf->>'k')::int, 0), 0), 150); b := least(greatest(coalesce((p_perf->>'b')::int, 0), 0), 80);
  a := least(greatest(coalesce((p_perf->>'a')::int, 0), 0), 80); p := least(greatest(coalesce((p_perf->>'p')::int, 0), 0), 200);
  e := least(greatest(coalesce((p_perf->>'e')::int, 0), 0), 200); c := least(greatest(coalesce((p_perf->>'cb')::int, 0), 0), 5); kl := least(greatest(coalesce((p_perf->>'kl')::int, 0), 0), 150); ks := least(greatest(coalesce((p_perf->>'ks')::int, 0), 0), 150);   -- c＝這場絕處逢生（逆轉）拿下幾局
  -- 經驗值：局數分 × 分數倍數 × 難度倍數 × 結果倍數 ＋ 表現分（最多 25）；金幣＝經驗值的 30%
  base := 10 * p_sets * (case p_points when 15 then 0.7 when 20 then 0.85 else 1.0 end)
          * (case when p_human then 1.5 when p_level = 5 then 1.7 when p_level = 4 then 1.3 else 1.0 end)
          * (case when p_won then 1.4 else 1.0 end);
  perf := least(25, greatest(0, k * 1.0 + b * 1.5 + a * 1.5 + p * 0.5 - e * 0.5));
  xp := round(base + perf); coin := round(xp * 0.3);
  insert into public.match_records(user_id, match_id, payload, exp_gain, coin_gain)
    values (uid, p_match, jsonb_build_object('lv', p_level, 'human', p_human, 'won', p_won, 'sets', p_sets, 'pts', p_points, 'sec', p_seconds, 'perf', p_perf), xp, coin)
    on conflict (user_id, match_id) do nothing;
  if not found then return jsonb_build_object('dup', true); end if;
  insert into public.player_progress(user_id) values (uid) on conflict (user_id) do nothing;
  select * into r from public.player_progress where user_id = uid for update;
  before_lv := r.exp / 500 + 1;
  key := case when p_human then 'h' else p_level::text end;
  r.stats := jsonb_set(jsonb_set(coalesce(r.stats, '{}'::jsonb), '{w}', coalesce(r.stats->'w', '{}'::jsonb), true), '{l}', coalesce(r.stats->'l', '{}'::jsonb), true);
  r.stats := jsonb_set(r.stats, array[case when p_won then 'w' else 'l' end, key], to_jsonb(coalesce((r.stats #>> array[case when p_won then 'w' else 'l' end, key])::int, 0) + 1), true);
  r.exp := r.exp + xp; r.coins := r.coins + coin; r.play_seconds := r.play_seconds + p_seconds;
  r.kills := r.kills + k; r.blocks := r.blocks + b; r.aces := r.aces + a; r.perfects := r.perfects + p; r.comebacks := r.comebacks + c; r.kills_line := r.kills_line + kl; r.kills_steep := r.kills_steep + ks;
  r.streak := case when p_won then r.streak + 1 else 0 end;
  -- 成就
  ach := r.achievements;
  if r.kills >= 100 and not 'cannon1' = any(ach) then got := array_append(got, 'cannon1'); end if;
  if r.kills >= 500 and not 'cannon2' = any(ach) then got := array_append(got, 'cannon2'); end if;
  if r.kills >= 1000 and not 'cannon3' = any(ach) then got := array_append(got, 'cannon3'); end if;
  if r.aces >= 50 and not 'server' = any(ach) then got := array_append(got, 'server'); end if;
  -- 自由人：完美接球 100／500／1000
  if r.perfects >= 100 and not 'libero1' = any(ach) then got := array_append(got, 'libero1'); end if;
  if r.perfects >= 500 and not 'libero2' = any(ach) then got := array_append(got, 'libero2'); end if;
  if r.perfects >= 1000 and not 'libero3' = any(ach) then got := array_append(got, 'libero3'); end if;
  if coalesce((p_perf->>'clean')::boolean, false) and not 'setter' = any(ach) then got := array_append(got, 'setter'); end if;
  if coalesce((p_perf->>'wall')::boolean, false) and not 'wall' = any(ach) then got := array_append(got, 'wall'); end if;
  if p_won and not p_human and p_level = 5 and not 'pro1' = any(ach) then got := array_append(got, 'pro1'); end if;
  if coalesce((r.stats #>> '{w,5}')::int, 0) >= 10 and not 'pro10' = any(ach) then got := array_append(got, 'pro10'); end if;
  if r.streak >= 5 and not 'streak5' = any(ach) then got := array_append(got, 'streak5'); end if;
  -- 絕處逢生：逆轉拿下的局數 1／5／10／15／30
  if r.comebacks >= 1 and not 'cb1' = any(ach) then got := array_append(got, 'cb1'); end if;
  if r.comebacks >= 5 and not 'cb5' = any(ach) then got := array_append(got, 'cb5'); end if;
  if r.comebacks >= 10 and not 'cb10' = any(ach) then got := array_append(got, 'cb10'); end if;
  if r.comebacks >= 15 and not 'cb15' = any(ach) then got := array_append(got, 'cb15'); end if;
  if r.comebacks >= 30 and not 'cb30' = any(ach) then got := array_append(got, 'cb30'); end if;
  -- 直線魔人：直線得分 30／150／500；天空打點：扣進三米線內得分 30／150／500
  if r.kills_line >= 30 and not 'line1' = any(ach) then got := array_append(got, 'line1'); end if;
  if r.kills_line >= 150 and not 'line2' = any(ach) then got := array_append(got, 'line2'); end if;
  if r.kills_line >= 500 and not 'line3' = any(ach) then got := array_append(got, 'line3'); end if;
  if r.kills_steep >= 30 and not 'sky1' = any(ach) then got := array_append(got, 'sky1'); end if;
  if r.kills_steep >= 150 and not 'sky2' = any(ach) then got := array_append(got, 'sky2'); end if;
  if r.kills_steep >= 500 and not 'sky3' = any(ach) then got := array_append(got, 'sky3'); end if;
  -- 銅牆鐵壁：攔網得分累計 100／500／1000
  if r.blocks >= 100 and not 'iron1' = any(ach) then got := array_append(got, 'iron1'); end if;
  if r.blocks >= 500 and not 'iron2' = any(ach) then got := array_append(got, 'iron2'); end if;
  if r.blocks >= 1000 and not 'iron3' = any(ach) then got := array_append(got, 'iron3'); end if;
  r.achievements := ach || got;
  update public.player_progress set exp = r.exp, coins = r.coins, stats = r.stats, play_seconds = r.play_seconds,
    kills = r.kills, blocks = r.blocks, aces = r.aces, perfects = r.perfects, comebacks = r.comebacks, kills_line = r.kills_line, kills_steep = r.kills_steep, streak = r.streak,
    achievements = r.achievements, updated_at = now() where user_id = uid;
  after_lv := r.exp / 500 + 1;
  return jsonb_build_object('exp', xp, 'coins', coin, 'level', after_lv, 'levelUp', after_lv > before_lv, 'new', to_jsonb(got));
end; $$;

grant execute on function public.record_match(text,integer,boolean,boolean,integer,integer,integer,jsonb) to authenticated;
revoke all on function public.record_match(text,integer,boolean,boolean,integer,integer,integer,jsonb) from public, anon;
commit;
