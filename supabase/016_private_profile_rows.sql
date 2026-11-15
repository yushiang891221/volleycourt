begin;
alter policy profiles_read on public.profiles
  using (id = (select auth.uid()));
commit;
