-- =============================================================================
-- MT5 Scalp Command Center - initial schema (8/12)
-- daily_statistics, performance_statistics
-- =============================================================================

create table daily_statistics (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references mt5_accounts (id) on delete cascade,
  date date not null,

  starting_balance numeric(18, 2) not null default 0,
  ending_balance numeric(18, 2) not null default 0,
  realized_pl numeric(18, 2) not null default 0,
  trades_count integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  max_drawdown_pct numeric(6, 3) not null default 0,

  updated_at timestamptz not null default now(),
  unique (account_id, date)
);

create index idx_daily_statistics_account_date on daily_statistics (account_id, date desc);

create trigger trg_daily_statistics_updated_at
  before update on daily_statistics
  for each row execute function set_updated_at();

create table performance_statistics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  account_id uuid references mt5_accounts (id) on delete cascade, -- null = aggregated across all of the user's accounts

  period_type text not null check (period_type in ('DAILY', 'WEEKLY', 'MONTHLY', 'ALL_TIME')),
  period_start date not null,
  period_end date not null,

  win_rate numeric(6, 3),
  profit_factor numeric(10, 3),
  avg_win numeric(18, 2),
  avg_loss numeric(18, 2),
  max_drawdown_pct numeric(6, 3),
  max_consecutive_losses integer,
  avg_trade_duration_seconds integer,
  total_trades integer not null default 0,
  net_profit numeric(18, 2) not null default 0,

  -- { bySymbol: {...}, bySession: {...}, byStrategy: {...} }
  breakdown jsonb not null default '{}'::jsonb,

  computed_at timestamptz not null default now()
);

create index idx_performance_statistics_user_id on performance_statistics (user_id);
create index idx_performance_statistics_account_period on performance_statistics (account_id, period_type, period_start desc);
