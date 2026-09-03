-- 0002 granted broad CRUD to `authenticated` on every FUTURE table by default
-- (`alter default privileges ... grant ... on tables to authenticated`). That
-- means a new table created later — before RLS is added, or if RLS is simply
-- forgotten — is immediately readable and writable by any signed-in user, with no
-- explicit decision ever made about it.
--
-- This revokes that default. It only changes what happens automatically for
-- tables that don't exist yet; it does not touch the explicit grants already made
-- to `profiles`, `watchlist`, and `settings` in 0002, which remain exactly as they
-- are. Any future table must now have its privileges granted explicitly, in its
-- own migration, alongside its own RLS policies — the same reviewed pattern
-- already used for every existing table.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from authenticated;
