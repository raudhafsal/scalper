# Paper Trading

Paper mode lets you run the entire system — market analysis, scoring, risk
evaluation, position sizing, simulated fills, dashboard updates — with
**zero** external dependencies and **zero** risk. No MT5 terminal, no
broker account, and no EA are required to try paper mode.

This is the recommended way to first experience the whole pipeline, and
the recommended way to validate any change to your strategy or risk
settings before ever pointing them at a demo or live account.

## How it works

1. The trading engine's default `MARKET_DATA_PROVIDER=simulated` uses
   `SimulatedMarketDataProvider` — a random-walk synthetic candle
   generator (`trading-engine/engine/market_data/provider.py`). It behaves
   like a real feed to every downstream component (candles in, same
   shape, same interface) but requires no broker connection.
2. The full strategy pipeline runs against this data exactly as it would
   against real data: market structure, liquidity, order blocks, FVGs,
   indicators, scoring.
3. Candidate signals that clear the minimum score still go through the
   full risk engine, per account, exactly as in DEMO/LIVE.
4. If approved, instead of a `trade_command` destined for an EA, paper
   mode calls `engine/execution/paper.py`'s `simulate_fill()` /
   `simulate_outcome_from_future_candles()` — a simulated entry is opened,
   and its outcome is derived by walking forward through subsequent
   simulated candles until the simulated SL or TP is hit.
5. Results are written to the same `positions` / `closed_trades` /
   `daily_statistics` tables as any other mode, so the dashboard,
   analytics page, and trade history all work identically — the UI does
   not need to know or care that a position was simulated versus real,
   beyond the mode label shown on it.

## Enabling paper mode

1. In the web app, go to **Settings** (or the account's own settings) and
   set the account/profile mode to **PAPER**. New accounts and the
   auto-seeded default profile are safe defaults — check the mode shown in
   the account list if you're unsure.
2. Start the trading engine (`docs/VPS_TRADING_ENGINE.md`, or just
   `python -m engine.app` locally for a quick look).
3. Press **START AUTO TRADING** on the dashboard. The preflight check
   (`lib/trading/preflight.ts`) runs through auth, database, emergency
   stop state, trading engine reachability, market data, risk engine,
   account status, and EA connection — in PAPER mode the EA-connection
   check is not a blocker, since paper mode never talks to an EA.
4. Watch the **Signals** and **Trades** pages populate as the simulated
   market produces candidates and the risk engine approves/rejects them.

## What paper mode proves, and what it doesn't

Paper mode validates: that your strategy settings actually produce
candidate signals at a reasonable rate, that your risk settings behave the
way you expect (try deliberately tight settings and confirm trades get
rejected with the reason you'd expect), that the whole data pipeline from
engine → Supabase → PWA works end-to-end, and that the dashboard's status
badges, analytics, and audit log all reflect reality.

Paper mode does **not** validate real execution quality (slippage,
partial fills, broker-specific spread behavior, requotes), real market
data characteristics (the simulated feed is a random walk, not a model of
real price action, and results against it are not indicative of how the
strategy performs against real markets), or EA/MT5 connectivity — those
require DEMO mode with a real MT5 terminal.

## Moving to DEMO

Once you're comfortable with paper results, connect a real MT5 **demo**
account (`docs/MT5_SETUP.md`, `docs/EA_SETUP.md`) and switch that
account's mode to DEMO. This exercises the full real pipeline — real EA
polling, real order placement, real broker fill behavior — with no real
money at stake. Only after meaningful time on DEMO should you consider
LIVE, and even then, start with the smallest risk settings you're willing
to accept and increase gradually.

## A note on backtests vs. paper trading

Paper trading (this document) runs the strategy **forward in time** against
a live (simulated) feed, exactly as it would run in production. Backtesting
(`trading-engine/engine/backtest/runner.py`, see `docs/STRATEGY.md`) runs it
against **historical** data. Both are simulations and neither is a
guarantee of future performance — a strategy that performs well in either
can still lose money in real markets, and forex/CFD trading always carries
a risk of loss.
