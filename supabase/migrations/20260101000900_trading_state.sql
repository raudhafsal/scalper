-- =============================================================================
-- MT5 Scalp Command Center - initial schema (10/12)
-- trading_state: one row per user holding the global AUTO TRADING STATUS badge
-- (STOPPED / ACTIVE / STOP_NEW_TRADES / EMERGENCY_STOPPED) and the active
-- run_mode (PAPER / DEMO / LIVE). This table is not in the spec's literal
-- table list but is required to implement sections 6 and 32-35 safely - see
-- docs/ARCHITECTURE.md for the rationale.
-- =============================================================================

create table trading_state (
  user_id uuid primary key references profiles (id) on delete cascade,
  status global_trading_status not null default 'STOPPED',
  mode run_mode not null default 'PAPER',
  started_at timestamptz,
  started_by uuid references profiles (id),
  stopped_at timestamptz,
  stopped_by uuid references profiles (id),
  emergency_stop_reason text,
  last_engine_heartbeat_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger trg_trading_state_updated_at
  before update on trading_state
  for each row execute function set_updated_at();

create or replace function seed_trading_state_for_new_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.trading_state (user_id) values (new.id);
  return new;
end;
$$;

create trigger trg_seed_trading_state_for_new_profile
  after insert on profiles
  for each row execute function seed_trading_state_for_new_profile();
