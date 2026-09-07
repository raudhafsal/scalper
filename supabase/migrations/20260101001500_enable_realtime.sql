-- =============================================================================
-- MT5 Scalp Command Center - enable Supabase Realtime (15/16)
--
-- Adds the tables the PWA dashboard subscribes to live
-- (hooks/use-realtime-table.ts) to the supabase_realtime publication. A new
-- Supabase project's default publication starts empty, so this step is
-- required - see docs/SUPABASE_SETUP.md step 5.
-- =============================================================================

alter publication supabase_realtime add table trading_state;
alter publication supabase_realtime add table mt5_accounts;
alter publication supabase_realtime add table ea_connections;
alter publication supabase_realtime add table signals;
alter publication supabase_realtime add table trade_commands;
alter publication supabase_realtime add table positions;
alter publication supabase_realtime add table closed_trades;
alter publication supabase_realtime add table daily_statistics;
