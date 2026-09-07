-- =============================================================================
-- MT5 Scalp Command Center - initial schema (2/12)
-- profiles: one row per Supabase Auth user, carries role for authorization.
-- =============================================================================

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role user_role not null default 'TRADER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Auto-create a profile row whenever a new auth user signs up.
-- First user in the system becomes ADMIN automatically; everyone after is TRADER
-- by default (an ADMIN can promote/demote later via the app).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;

  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when is_first then 'ADMIN' else 'TRADER' end
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
