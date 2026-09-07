-- =============================================================================
-- MT5 Scalp Command Center - initial schema (4/12)
-- strategies, strategy_settings
-- =============================================================================

create table strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null default 'Multi-Confirmation Scalping',
  description text not null default 'Modular multi-confirmation scalping strategy (structure + liquidity + OB/FVG + indicator confluence).',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_strategies_user_id on strategies (user_id);

create trigger trg_strategies_updated_at
  before update on strategies
  for each row execute function set_updated_at();

create table strategy_settings (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null unique references strategies (id) on delete cascade,

  primary_timeframe text not null default 'M1',
  confirmation_timeframe text not null default 'M5',
  optional_timeframe text default 'M15',

  min_signal_score integer not null default 80 check (min_signal_score between 0 and 100),
  score_weights jsonb not null default '{
    "marketStructure": 20, "liquiditySweep": 15, "bosChoch": 15, "orderBlock": 15,
    "fvg": 10, "ema": 10, "rsi": 5, "atr": 5, "candleConfirmation": 5
  }'::jsonb,

  structure_lookback integer not null default 50,
  liquidity_lookback integer not null default 50,

  ema_fast integer not null default 9,
  ema_mid integer not null default 21,
  ema_slow integer not null default 50,
  ema_trend integer not null default 200,
  rsi_period integer not null default 14,
  atr_period integer not null default 14,

  max_spread_points jsonb not null default '{"default": 25, "XAUUSD": 60}'::jsonb,
  volatility_filter_enabled boolean not null default true,
  min_atr_percentile numeric(5, 2) not null default 20,
  max_atr_percentile numeric(5, 2) not null default 95,

  session_filters jsonb not null default '{"asian": true, "london": true, "newyork": true, "overlap": true}'::jsonb,

  sl_method text not null default 'ATR' check (sl_method in ('SWING', 'ATR', 'ORDER_BLOCK')),
  atr_sl_multiplier numeric(5, 2) not null default 1.5,
  tp_mode text not null default 'RR_1_2' check (tp_mode in ('RR_1_1', 'RR_1_1_5', 'RR_1_2', 'RR_1_3', 'CUSTOM')),
  custom_rr numeric(5, 2),

  breakeven_enabled boolean not null default true,
  breakeven_at_r numeric(5, 2) not null default 1,
  partial_tp_enabled boolean not null default true,
  partial_tp_at_r numeric(5, 2) not null default 1.5,
  partial_tp_pct numeric(5, 2) not null default 50,
  trailing_enabled boolean not null default false,
  trailing_activation_r numeric(5, 2) not null default 2,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_strategy_settings_updated_at
  before update on strategy_settings
  for each row execute function set_updated_at();

-- Now that strategies exists, wire up mt5_account_settings.strategy_id.
alter table mt5_account_settings
  add constraint fk_account_settings_strategy
  foreign key (strategy_id) references strategies (id) on delete set null;
