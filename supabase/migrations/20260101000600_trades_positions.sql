-- =============================================================================
-- MT5 Scalp Command Center - initial schema (7/12)
-- trade_executions, positions, closed_trades
-- =============================================================================

create table trade_executions (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references trade_commands (id) on delete cascade,
  account_id uuid not null references mt5_accounts (id) on delete cascade,

  broker_ticket text,
  execution_price numeric(18, 6),
  executed_volume numeric(10, 2),
  success boolean not null,
  broker_error_code text,
  broker_error_message text,

  created_at timestamptz not null default now()
);

create index idx_trade_executions_command_id on trade_executions (command_id);
create index idx_trade_executions_account_id on trade_executions (account_id);

create table positions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references mt5_accounts (id) on delete cascade,
  broker_ticket text not null,

  symbol text not null,
  direction signal_direction not null,
  volume numeric(10, 2) not null,
  entry_price numeric(18, 6) not null,
  stop_loss numeric(18, 6),
  take_profit numeric(18, 6),

  current_price numeric(18, 6),
  floating_pl numeric(18, 2) not null default 0,
  swap numeric(18, 2) not null default 0,
  commission numeric(18, 2) not null default 0,

  signal_id uuid references signals (id) on delete set null,
  strategy_id uuid references strategies (id) on delete set null,
  run_mode run_mode not null default 'PAPER',

  breakeven_applied boolean not null default false,
  partial_tp_applied boolean not null default false,

  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSING')),
  open_time timestamptz not null,
  updated_at timestamptz not null default now(),

  unique (account_id, broker_ticket)
);

create index idx_positions_account_id on positions (account_id);
create index idx_positions_status on positions (status);

create trigger trg_positions_updated_at
  before update on positions
  for each row execute function set_updated_at();

create table closed_trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references mt5_accounts (id) on delete cascade,
  broker_ticket text not null,

  symbol text not null,
  direction signal_direction not null,
  volume numeric(10, 2) not null,
  entry_price numeric(18, 6) not null,
  exit_price numeric(18, 6) not null,
  stop_loss numeric(18, 6),
  take_profit numeric(18, 6),

  profit numeric(18, 2) not null,
  commission numeric(18, 2) not null default 0,
  swap numeric(18, 2) not null default 0,

  strategy_id uuid references strategies (id) on delete set null,
  signal_id uuid references signals (id) on delete set null,
  signal_score integer,
  run_mode run_mode not null default 'PAPER',

  open_time timestamptz not null,
  close_time timestamptz not null,
  duration_seconds integer generated always as
    (greatest(0, extract(epoch from (close_time - open_time))::integer)) stored,

  result text not null default 'BREAKEVEN' check (result in ('WIN', 'LOSS', 'BREAKEVEN')),

  created_at timestamptz not null default now(),
  unique (account_id, broker_ticket, close_time)
);

create index idx_closed_trades_account_id on closed_trades (account_id);
create index idx_closed_trades_close_time on closed_trades (close_time desc);
create index idx_closed_trades_symbol on closed_trades (symbol);
create index idx_closed_trades_strategy_id on closed_trades (strategy_id);
