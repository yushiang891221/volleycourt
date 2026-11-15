-- WEB-016：由使用者在 SQL Editor 執行，可重複執行。
begin;
alter table public.profiles add column if not exists last_seen_at timestamptz;
revoke insert (last_seen_at), update (last_seen_at) on public.profiles from public, anon, authenticated;

create or replace function public.touch_seen() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set last_seen_at = now()
  where id = auth.uid()
    and (last_seen_at is null or last_seen_at <= now() - interval '60 seconds');
$$;

create or replace function public.lobby_accounts()
returns table (nickname text, last_seen_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.nickname, p.last_seen_at from public.profiles p
  where p.nickname is not null and auth.uid() is not null
  order by p.last_seen_at desc nulls last, p.nickname
  limit 500;
$$;

revoke all on function public.touch_seen() from public, anon, authenticated;
revoke all on function public.lobby_accounts() from public, anon, authenticated;
grant execute on function public.touch_seen() to authenticated;
grant execute on function public.lobby_accounts() to authenticated;
commit;
