-- =============================================================================
-- MT5 Scalp Command Center - initial schema (1/12)
-- Extensions and enum types shared across the schema.
-- =============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

create type user_role as enum ('ADMIN', 'TRADER', 'VIEWER');

create type account_type as enum ('DEMO', 'LIVE');

-- The environment a signal/command/trading run is executed in.
create type run_mode as enum ('PAPER', 'DEMO', 'LIVE');

create type account_connection_status as enum (
  'CONNECTED', 'CONNECTING', 'OFFLINE', 'DISABLED', 'RISK_LOCKED'
);

create type global_trading_status as enum (
  'STOPPED', 'ACTIVE', 'STOP_NEW_TRADES', 'EMERGENCY_STOPPED'
);

create type signal_direction as enum ('BUY', 'SELL');

create type signal_status as enum ('WAITING', 'APPROVED', 'EXECUTED', 'REJECTED', 'EXPIRED');

create type trade_command_action as enum (
  'BUY', 'SELL', 'CLOSE', 'MODIFY_SL', 'MODIFY_TP', 'STOP_TRADING'
);

create type trade_command_status as enum (
  'PENDING', 'SENT', 'ACKNOWLEDGED', 'EXECUTED', 'REJECTED', 'EXPIRED', 'FAILED'
);

create type event_severity as enum ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

create type system_component as enum (
  'WEB_APP', 'SUPABASE', 'TRADING_ENGINE', 'MARKET_DATA', 'MT5_BRIDGE'
);

-- Generic updated_at trigger function, reused by every table below.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
