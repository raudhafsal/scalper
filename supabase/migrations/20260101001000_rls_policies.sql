-- =============================================================================
-- MT5 Scalp Command Center - initial schema (11/12)
-- Row Level Security.
--
-- Design: every row is scoped to the user that owns it (user_id, or the
-- user_id of the mt5_account it belongs to). This is true regardless of role
-- - ADMIN/TRADER/VIEWER only govern *which actions* a user may take on their
-- OWN data (enforced in the API layer, see lib/auth/permissions.ts), not
-- cross-user visibility. The one exception is `profiles`, where ADMIN can
-- read/update all profiles in order to manage roles.
--
-- Write access for signals/trade_commands/trade_executions/positions/
-- closed_trades/daily_statistics/performance_statistics/system_events is
-- intentionally NOT granted to the anon/authenticated role at all: those
-- tables are only ever written by trusted server-side code using the
-- Supabase service-role key (Next.js API routes and the trading engine),
-- which bypasses RLS. Browsers only ever get SELECT on those tables. This
-- guarantees the frontend can never fabricate a fill, a signal, or a balance.
-- =============================================================================

alter table profiles enable row level security;
alter table mt5_accounts enable row level security;
alter table mt5_account_settings enable row level security;
alter table ea_connections enable row level security;
alter table strategies enable row level security;
alter table strategy_settings enable row level security;
alter table risk_settings enable row level security;
alter table signals enable row level security;
alter table trade_commands enable row level security;
alter table trade_executions enable row level security;
alter table positions enable row level security;
alter table closed_trades enable row level security;
alter table daily_statistics enable row level security;
alter table performance_statistics enable row level security;
alter table system_events enable row level security;
alter table audit_logs enable row level security;
alter table trading_state enable row level security;

-- NOTE: named current_user_role(), not current_role() - `current_role` is a
-- reserved SQL-standard function name in Postgres and cannot be used as a
-- plain identifier without quoting (this was caught when actually applying
-- this migration - see docs/SUPABASE_SETUP.md).
create or replace function current_user_role()
returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'ADMIN' from profiles where id = auth.uid()), false);
$$;

create or replace function owns_account(p_account_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from mt5_accounts where id = p_account_id and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_own_or_admin on profiles
  for select using (id = auth.uid() or is_admin());
create policy profiles_update_own_or_admin on profiles
  for update using (id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------------
-- mt5_accounts
-- ---------------------------------------------------------------------------
create policy mt5_accounts_select_own on mt5_accounts
  for select using (user_id = auth.uid());
create policy mt5_accounts_insert_own on mt5_accounts
  for insert with check (user_id = auth.uid());
create policy mt5_accounts_update_own on mt5_accounts
  for update using (user_id = auth.uid());
create policy mt5_accounts_delete_own on mt5_accounts
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- mt5_account_settings (scoped via parent account)
-- ---------------------------------------------------------------------------
create policy mt5_account_settings_select_own on mt5_account_settings
  for select using (owns_account(account_id));
create policy mt5_account_settings_insert_own on mt5_account_settings
  for insert with check (owns_account(account_id));
create policy mt5_account_settings_update_own on mt5_account_settings
  for update using (owns_account(account_id));
create policy mt5_account_settings_delete_own on mt5_account_settings
  for delete using (owns_account(account_id));

-- ---------------------------------------------------------------------------
-- ea_connections (read-only from the browser; bridge_token_hash never leaves
-- the server anyway because API responses explicitly omit it)
-- ---------------------------------------------------------------------------
create policy ea_connections_select_own on ea_connections
  for select using (owns_account(account_id));

-- ---------------------------------------------------------------------------
-- strategies / strategy_settings
-- ---------------------------------------------------------------------------
create policy strategies_select_own on strategies
  for select using (user_id = auth.uid());
create policy strategies_insert_own on strategies
  for insert with check (user_id = auth.uid());
create policy strategies_update_own on strategies
  for update using (user_id = auth.uid());
create policy strategies_delete_own on strategies
  for delete using (user_id = auth.uid());

create policy strategy_settings_select_own on strategy_settings
  for select using (exists (select 1 from strategies s where s.id = strategy_id and s.user_id = auth.uid()));
create policy strategy_settings_update_own on strategy_settings
  for update using (exists (select 1 from strategies s where s.id = strategy_id and s.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- risk_settings
-- ---------------------------------------------------------------------------
create policy risk_settings_select_own on risk_settings
  for select using (user_id = auth.uid());
create policy risk_settings_insert_own on risk_settings
  for insert with check (user_id = auth.uid());
create policy risk_settings_update_own on risk_settings
  for update using (user_id = auth.uid());
create policy risk_settings_delete_own on risk_settings
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- signals - browser read-only (engine writes with service role)
-- ---------------------------------------------------------------------------
create policy signals_select_own on signals
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- trade_commands / trade_executions / positions / closed_trades - browser
-- read-only, scoped through the owning account
-- ---------------------------------------------------------------------------
create policy trade_commands_select_own on trade_commands
  for select using (owns_account(account_id));
create policy trade_executions_select_own on trade_executions
  for select using (owns_account(account_id));
create policy positions_select_own on positions
  for select using (owns_account(account_id));
create policy closed_trades_select_own on closed_trades
  for select using (owns_account(account_id));

-- ---------------------------------------------------------------------------
-- daily_statistics / performance_statistics - browser read-only
-- ---------------------------------------------------------------------------
create policy daily_statistics_select_own on daily_statistics
  for select using (owns_account(account_id));
create policy performance_statistics_select_own on performance_statistics
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- system_events - readable by any authenticated user of this deployment
-- (operational status only, contains no per-user secrets); tighten to
-- per-account scoping if you deploy this as a shared multi-tenant service.
-- ---------------------------------------------------------------------------
create policy system_events_select_authenticated on system_events
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- audit_logs - a user can see their own actions; admins see everything
-- ---------------------------------------------------------------------------
create policy audit_logs_select_own_or_admin on audit_logs
  for select using (user_id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------------
-- trading_state
-- ---------------------------------------------------------------------------
create policy trading_state_select_own on trading_state
  for select using (user_id = auth.uid());
