-- =============================================================================
-- MT5 Scalp Command Center - additional migration
-- Keep daily_statistics correct automatically whenever a closed_trade is
-- inserted, regardless of which code path wrote it (heartbeat reconciliation,
-- trade-result webhook, or a future direct EA "position closed" report).
-- =============================================================================

create or replace function upsert_daily_statistics_for_closed_trade()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_date date := (new.close_time at time zone 'UTC')::date;
  v_balance numeric(18, 2);
begin
  select balance into v_balance from mt5_accounts where id = new.account_id;

  insert into daily_statistics (account_id, date, starting_balance, ending_balance, realized_pl, trades_count, wins, losses)
  values (
    new.account_id,
    v_date,
    coalesce(v_balance, 0) - new.profit,
    coalesce(v_balance, 0),
    new.profit,
    1,
    case when new.result = 'WIN' then 1 else 0 end,
    case when new.result = 'LOSS' then 1 else 0 end
  )
  on conflict (account_id, date) do update set
    ending_balance = coalesce(v_balance, daily_statistics.ending_balance),
    realized_pl = daily_statistics.realized_pl + excluded.realized_pl,
    trades_count = daily_statistics.trades_count + 1,
    wins = daily_statistics.wins + excluded.wins,
    losses = daily_statistics.losses + excluded.losses;

  return new;
end;
$$;

create trigger trg_closed_trades_daily_stats
  after insert on closed_trades
  for each row execute function upsert_daily_statistics_for_closed_trade();
