create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles: user can view own row"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles: user can update own row"
  on profiles for update
  using (auth.uid() = id);

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id integer not null,
  title text not null,
  poster_path text,
  release_date text,
  vote_average numeric,
  added_at timestamptz not null default now(),
  unique (user_id, movie_id)
);

alter table watchlist enable row level security;

create policy "watchlist: user can view own rows"
  on watchlist for select
  using (auth.uid() = user_id);

create policy "watchlist: user can insert own rows"
  on watchlist for insert
  with check (auth.uid() = user_id);

create policy "watchlist: user can delete own rows"
  on watchlist for delete
  using (auth.uid() = user_id);

create table if not exists settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme_override text not null default 'auto' check (theme_override in ('auto', 'light', 'dark')),
  country text not null default 'US',
  updated_at timestamptz not null default now()
);

alter table settings enable row level security;

create policy "settings: user can view own row"
  on settings for select
  using (auth.uid() = user_id);

create policy "settings: user can insert own row"
  on settings for insert
  with check (auth.uid() = user_id);

create policy "settings: user can update own row"
  on settings for update
  using (auth.uid() = user_id);
