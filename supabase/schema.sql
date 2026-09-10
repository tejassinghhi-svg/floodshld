-- FloodShield personalized alerts schema
-- Run this in Supabase SQL Editor once for the project.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (label in ('Home','College / Work','Custom')),
  location_name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  alert_level text not null default 'CRITICAL' check (alert_level in ('HIGH','CRITICAL')),
  email_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_locations_user_id_idx
  on public.saved_locations(user_id);

alter table public.profiles enable row level security;
alter table public.saved_locations enable row level security;

-- Users may only read/write their own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Users may only access their own saved locations.
drop policy if exists "locations_select_own" on public.saved_locations;
create policy "locations_select_own"
on public.saved_locations for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "locations_insert_own" on public.saved_locations;
create policy "locations_insert_own"
on public.saved_locations for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "locations_update_own" on public.saved_locations;
create policy "locations_update_own"
on public.saved_locations for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "locations_delete_own" on public.saved_locations;
create policy "locations_delete_own"
on public.saved_locations for delete
to authenticated
using (auth.uid() = user_id);

-- Create/update a profile automatically from Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)),
    new.email
  )
  on conflict (id) do update
    set name = excluded.name,
        email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute procedure public.handle_new_user();
