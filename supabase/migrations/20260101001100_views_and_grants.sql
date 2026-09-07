-- =============================================================================
-- MT5 Scalp Command Center - initial schema (12/12)
-- Convenience views for the dashboard + explicit grants.
-- =============================================================================

-- Aggregated per-user totals for the top-of-dashboard tiles. RLS on the
-- underlying tables still applies to whoever queries this view.
create or replace view account_totals as
select
  a.user_id,
  count(*) filter (where a.connection_status <> 'DISABLED') as connected_accounts,
  count(*) as total_accounts,
  coalesce(sum(a.balance), 0) as total_balance,
  coalesce(sum(a.equity), 0) as total_equity,
  coalesce(sum(a.floating_pl), 0) as total_floating_pl
from mt5_accounts a
group by a.user_id;

alter view account_totals set (security_invoker = on);

create or replace view open_trade_counts as
select account_id, count(*) as open_count
from positions
where status = 'OPEN'
group by account_id;

alter view open_trade_counts set (security_invoker = on);

-- Explicit grants (Supabase pre-grants these by default, but we set them
-- explicitly so this schema is portable to a bare Postgres + PostgREST setup
-- too). RLS policies above are still the actual gate on row visibility.
grant usage on schema public to authenticated, anon;

grant select on
  profiles, mt5_accounts, mt5_account_settings, ea_connections,
  strategies, strategy_settings, risk_settings,
  signals, trade_commands, trade_executions, positions, closed_trades,
  daily_statistics, performance_statistics, system_events, audit_logs,
  trading_state, account_totals, open_trade_counts
to authenticated;

grant insert, update, delete on
  mt5_accounts, mt5_account_settings, strategies, strategy_settings, risk_settings
to authenticated;

-- profiles: only updates flow through RLS (role change by admin); inserts are
-- handled exclusively by the handle_new_user() trigger (security definer).
grant update on profiles to authenticated;
