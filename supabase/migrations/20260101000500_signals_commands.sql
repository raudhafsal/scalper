-- =============================================================================
-- MT5 Scalp Command Center - initial schema (6/12)
-- signals, trade_commands
-- =============================================================================

create table signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  strategy_id uuid references strategies (id) on delete set null,

  symbol text not null,
  direction signal_direction not null,
  primary_timeframe text not null default 'M1',
  run_mode run_mode not null default 'PAPER',

  score integer not null check (score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  min_score_required integer not null default 80,

  entry_price numeric(18, 6) not null,
  stop_loss numeric(18, 6) not null,
  take_profit numeric(18, 6) not null,
  risk_reward numeric(8, 3) not null,

  status signal_status not null default 'WAITING',
  rejection_reason text,

  context jsonb not null default '{}'::jsonb, -- structure/liquidity/OB/FVG snapshot for audit + UI

  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '3 minutes')
);

create index idx_signals_user_id on signals (user_id);
create index idx_signals_status on signals (status);
create index idx_signals_symbol on signals (symbol);
create index idx_signals_created_at on signals (created_at desc);

create table trade_commands (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals (id) on delete set null,
  account_id uuid not null references mt5_accounts (id) on delete cascade,

  action trade_command_action not null,
  symbol text not null,
  volume numeric(10, 2),
  stop_loss numeric(18, 6),
  take_profit numeric(18, 6),

  -- Idempotency: the (account_id, nonce) pair is unique, so a retried or
  -- duplicated delivery of the same command can never create two trades.
  nonce text not null,

  status trade_command_status not null default 'PENDING',
  rejection_reason text,

  run_mode run_mode not null default 'PAPER',

  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 seconds'),
  sent_at timestamptz,
  acknowledged_at timestamptz,
  executed_at timestamptz,

  unique (account_id, nonce)
);

create index idx_trade_commands_account_id on trade_commands (account_id);
create index idx_trade_commands_status on trade_commands (status);
create index idx_trade_commands_signal_id on trade_commands (signal_id);
-- An account should only ever have one PENDING/SENT command in flight per
-- symbol at a time for BUY/SELL - prevents duplicate-order races even before
-- the nonce check runs.
create unique index idx_trade_commands_inflight_entry
  on trade_commands (account_id, symbol)
  where status in ('PENDING', 'SENT') and action in ('BUY', 'SELL');
