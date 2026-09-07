-- =============================================================================
-- MT5 Scalp Command Center - initial schema (3/12)
-- mt5_accounts, mt5_account_settings, ea_connections
--
-- IMPORTANT: no broker password column exists anywhere in this schema, by
-- design (see docs/RISK_MANAGEMENT.md and section 9 of the product spec).
-- The EA authenticates with a bridge token whose hash is stored below;
-- the raw token is shown to the user exactly once at creation time.
-- =============================================================================

create table mt5_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  nickname text not null,
  login_id text not null,
  broker text not null,
  server text not null,
  account_type account_type not null default 'DEMO',
  connection_status account_connection_status not null default 'OFFLINE',
  trading_enabled boolean not null default true,
  balance numeric(18, 2) not null default 0,
  equity numeric(18, 2) not null default 0,
  margin numeric(18, 2) not null default 0,
  free_margin numeric(18, 2) not null default 0,
  floating_pl numeric(18, 2) not null default 0,
  currency text not null default 'USD',
  leverage integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, login_id, server)
);

create index idx_mt5_accounts_user_id on mt5_accounts (user_id);
create index idx_mt5_accounts_connection_status on mt5_accounts (connection_status);

create trigger trg_mt5_accounts_updated_at
  before update on mt5_accounts
  for each row execute function set_updated_at();

create table mt5_account_settings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references mt5_accounts (id) on delete cascade,
  use_global_settings boolean not null default true,
  strategy_id uuid, -- FK added after strategies table exists (see 000300 migration)
  risk_settings_id uuid, -- FK added after risk_settings table exists (see 000400 migration)
  allowed_symbols text[] not null default array['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'],
  max_trades_override integer,
  max_lot_override numeric(10, 2),
  sessions_enabled jsonb not null default '{"asian": true, "london": true, "newyork": true, "overlap": true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_mt5_account_settings_updated_at
  before update on mt5_account_settings
  for each row execute function set_updated_at();

create table ea_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references mt5_accounts (id) on delete cascade,
  bridge_token_hash text not null,
  bridge_token_last_rotated_at timestamptz not null default now(),
  ea_version text,
  terminal_build integer,
  connected boolean not null default false,
  last_heartbeat_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  symbol_specs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ea_connections_account_id on ea_connections (account_id);
create index idx_ea_connections_last_heartbeat on ea_connections (last_heartbeat_at);

create trigger trg_ea_connections_updated_at
  before update on ea_connections
  for each row execute function set_updated_at();
