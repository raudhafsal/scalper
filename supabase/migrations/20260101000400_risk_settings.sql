-- =============================================================================
-- MT5 Scalp Command Center - initial schema (5/12)
-- risk_settings - one or more named risk profiles per user; an account either
-- uses the user's default profile or a custom one (see mt5_account_settings).
-- =============================================================================

create table risk_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null default 'default',
  is_default boolean not null default false,

  risk_per_trade_pct numeric(6, 3) not null default 0.5 check (risk_per_trade_pct > 0),
  max_daily_loss_pct numeric(6, 3) not null default 3 check (max_daily_loss_pct > 0),
  max_drawdown_pct numeric(6, 3) not null default 10 check (max_drawdown_pct > 0),
  max_simultaneous_trades integer not null default 3 check (max_simultaneous_trades > 0),
  max_trades_per_symbol integer not null default 1 check (max_trades_per_symbol > 0),
  max_trades_per_day integer not null default 15 check (max_trades_per_day > 0),
  max_trades_per_hour integer not null default 4 check (max_trades_per_hour > 0),
  max_consecutive_losses integer not null default 3 check (max_consecutive_losses > 0),
  cooldown_after_loss_minutes integer not null default 15 check (cooldown_after_loss_minutes >= 0),
  cooldown_after_trade_minutes integer not null default 2 check (cooldown_after_trade_minutes >= 0),
  max_spread_points numeric(10, 2) not null default 25 check (max_spread_points > 0),
  max_lot numeric(10, 2) not null default 5 check (max_lot > 0),
  min_equity numeric(18, 2) not null default 100 check (min_equity >= 0),
  daily_profit_lock_pct numeric(6, 3),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index idx_risk_settings_user_id on risk_settings (user_id);

create trigger trg_risk_settings_updated_at
  before update on risk_settings
  for each row execute function set_updated_at();

alter table mt5_account_settings
  add constraint fk_account_settings_risk
  foreign key (risk_settings_id) references risk_settings (id) on delete set null;

-- Give every new user a sensible default risk profile + strategy automatically.
create or replace function seed_defaults_for_new_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_strategy_id uuid;
begin
  insert into public.risk_settings (user_id, name, is_default)
  values (new.id, 'default', true);

  insert into public.strategies (user_id, name)
  values (new.id, 'Multi-Confirmation Scalping')
  returning id into v_strategy_id;

  insert into public.strategy_settings (strategy_id)
  values (v_strategy_id);

  return new;
end;
$$;

create trigger trg_seed_defaults_for_new_profile
  after insert on profiles
  for each row execute function seed_defaults_for_new_profile();
