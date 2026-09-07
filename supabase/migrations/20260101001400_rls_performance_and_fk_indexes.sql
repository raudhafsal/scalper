-- =============================================================================
-- MT5 Scalp Command Center - performance hardening (14/16)
--
-- Added after running Supabase's built-in performance advisor against a live
-- deployment of this schema. Two findings, both closed here:
--
-- 1. auth_rls_initplan: every RLS policy that called auth.uid()/auth.role()
--    directly was being re-evaluated once per row instead of once per query.
--    Wrapping the call as (select auth.uid()) lets Postgres hoist it into an
--    InitPlan (evaluated once), which is materially faster at scale with
--    identical semantics. See:
--    https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- 2. unindexed_foreign_keys: several FK columns had no covering index, which
--    would show up as slow joins/deletes once these tables have real rows.
-- =============================================================================

-- ---- profiles ----
drop policy profiles_select_own_or_admin on profiles;
create policy profiles_select_own_or_admin on profiles
  for select using (id = (select auth.uid()) or is_admin());

drop policy profiles_update_own_or_admin on profiles;
create policy profiles_update_own_or_admin on profiles
  for update using (id = (select auth.uid()) or is_admin());

-- ---- mt5_accounts ----
drop policy mt5_accounts_select_own on mt5_accounts;
create policy mt5_accounts_select_own on mt5_accounts
  for select using (user_id = (select auth.uid()));

drop policy mt5_accounts_insert_own on mt5_accounts;
create policy mt5_accounts_insert_own on mt5_accounts
  for insert with check (user_id = (select auth.uid()));

drop policy mt5_accounts_update_own on mt5_accounts;
create policy mt5_accounts_update_own on mt5_accounts
  for update using (user_id = (select auth.uid()));

drop policy mt5_accounts_delete_own on mt5_accounts;
create policy mt5_accounts_delete_own on mt5_accounts
  for delete using (user_id = (select auth.uid()));

-- ---- strategies ----
drop policy strategies_select_own on strategies;
create policy strategies_select_own on strategies
  for select using (user_id = (select auth.uid()));

drop policy strategies_insert_own on strategies;
create policy strategies_insert_own on strategies
  for insert with check (user_id = (select auth.uid()));

drop policy strategies_update_own on strategies;
create policy strategies_update_own on strategies
  for update using (user_id = (select auth.uid()));

drop policy strategies_delete_own on strategies;
create policy strategies_delete_own on strategies
  for delete using (user_id = (select auth.uid()));

-- ---- strategy_settings ----
drop policy strategy_settings_select_own on strategy_settings;
create policy strategy_settings_select_own on strategy_settings
  for select using (exists (select 1 from strategies s where s.id = strategy_id and s.user_id = (select auth.uid())));

drop policy strategy_settings_update_own on strategy_settings;
create policy strategy_settings_update_own on strategy_settings
  for update using (exists (select 1 from strategies s where s.id = strategy_id and s.user_id = (select auth.uid())));

-- ---- risk_settings ----
drop policy risk_settings_select_own on risk_settings;
create policy risk_settings_select_own on risk_settings
  for select using (user_id = (select auth.uid()));

drop policy risk_settings_insert_own on risk_settings;
create policy risk_settings_insert_own on risk_settings
  for insert with check (user_id = (select auth.uid()));

drop policy risk_settings_update_own on risk_settings;
create policy risk_settings_update_own on risk_settings
  for update using (user_id = (select auth.uid()));

drop policy risk_settings_delete_own on risk_settings;
create policy risk_settings_delete_own on risk_settings
  for delete using (user_id = (select auth.uid()));

-- ---- signals ----
drop policy signals_select_own on signals;
create policy signals_select_own on signals
  for select using (user_id = (select auth.uid()));

-- ---- performance_statistics ----
drop policy performance_statistics_select_own on performance_statistics;
create policy performance_statistics_select_own on performance_statistics
  for select using (user_id = (select auth.uid()));

-- ---- system_events ----
drop policy system_events_select_authenticated on system_events;
create policy system_events_select_authenticated on system_events
  for select using ((select auth.role()) = 'authenticated');

-- ---- audit_logs ----
drop policy audit_logs_select_own_or_admin on audit_logs;
create policy audit_logs_select_own_or_admin on audit_logs
  for select using (user_id = (select auth.uid()) or is_admin());

-- ---- trading_state ----
drop policy trading_state_select_own on trading_state;
create policy trading_state_select_own on trading_state
  for select using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Covering indexes for previously-unindexed foreign keys
-- ---------------------------------------------------------------------------
create index idx_closed_trades_signal_id on closed_trades (signal_id);
create index idx_mt5_account_settings_risk_settings_id on mt5_account_settings (risk_settings_id);
create index idx_mt5_account_settings_strategy_id on mt5_account_settings (strategy_id);
create index idx_positions_signal_id on positions (signal_id);
create index idx_positions_strategy_id on positions (strategy_id);
create index idx_signals_strategy_id on signals (strategy_id);
create index idx_system_events_account_id on system_events (account_id);
create index idx_trading_state_started_by on trading_state (started_by);
create index idx_trading_state_stopped_by on trading_state (stopped_by);
