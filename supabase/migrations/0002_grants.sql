grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.watchlist to authenticated;
grant select, insert, update on public.settings to authenticated;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
