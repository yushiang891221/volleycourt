-- 球隊系統 T4：球隊聊天室（只有隊員看得到；每隊留最近 100 則）。
-- 在 Supabase → SQL Editor 貼上整段執行一次即可（可重複執行）。要先執行過 019。
-- 網頁在聊天分頁打開時每 3 秒問一次有沒有新訊息（只抓比上次新的），送出後馬上再抓一次。
begin;
create table if not exists public.team_chat (
  id bigserial primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  author uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists team_chat_team on public.team_chat(team_id, id desc);
alter table public.team_chat enable row level security;
revoke all on public.team_chat from public, anon, authenticated;

-- 發言：1～200 字、不能有控制字元或不雅字、同一個人 1 秒內不能連發；超過 100 則刪最舊的
create or replace function public.send_team_chat(p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare me record; b text := btrim(coalesce(p_body, '')); new_id bigint;
begin
  select * into me from public.team_me();
  if char_length(b) not between 1 and 200 or b ~ '[\x01-\x1f\x7f\u0080-\u009f  ]' or public.jersey_text_bad(b) then raise exception 'bad chat'; end if;
  if exists (select 1 from public.team_chat where author = auth.uid() and created_at > now() - interval '1 second') then raise exception 'too fast'; end if;
  insert into public.team_chat(team_id, author, body) values (me.tid, auth.uid(), b) returning id into new_id;
  delete from public.team_chat where team_id = me.tid and id not in (select id from public.team_chat where team_id = me.tid order by id desc limit 100);
  return new_id;
end; $$;

-- 讀訊息：p_after＝上次拿到的最後一則 id（0＝最近 100 則），由舊到新
create or replace function public.team_chat_since(p_after bigint default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select * into me from public.team_me();
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'at', c.created_at, 'name', coalesce(p.nickname, '球友'), 'mine', c.author = auth.uid()) order by c.id)
    from (select * from public.team_chat where team_id = me.tid and id > coalesce(p_after, 0) order by id desc limit 100) c
    left join public.profiles p on p.id = c.author), '[]'::jsonb);
end; $$;

revoke all on function public.send_team_chat(text) from public, anon;
revoke all on function public.team_chat_since(bigint) from public, anon;
grant execute on function public.send_team_chat(text) to authenticated;
grant execute on function public.team_chat_since(bigint) to authenticated;
commit;
