# Architecture

## Components and why they're separate

```
┌─────────────┐     HTTPS, Supabase          ┌──────────────────────┐
│   PWA        │────  session cookie   ──────▶│  Next.js on Vercel   │
│ (your device)│◀──── Supabase Realtime ──────│  (app + API routes)  │
└─────────────┘      (websocket, via SDK)     └──────────┬───────────┘
                                                            │ reads/writes via
                                                            │ anon+RLS or service-role
                                                            ▼
                                                ┌───────────────────────┐
                                                │       Supabase         │
                                                │  Postgres + Auth +      │
                                                │  Realtime + RLS         │
                                                └──────────┬─────────────┘
                                                            ▲ polls config,
                                                            │ writes signals/
                                                            │ commands/trades
                                                ┌───────────┴─────────────┐
                                                │  Python trading engine   │
                                                │  (your own VPS/container)│
                                                └──────────┬───────────────┘
                                                            │ HTTPS: poll for
                                                            │ approved commands,
                                                            │ push heartbeats
                                                            │ & results
                                                ┌───────────┴───────────────┐
                                                │  MT5 Bridge EA (MQL5)      │
                                                │  inside your MT5 terminal  │
                                                └──────────┬─────────────────┘
                                                            │ native trade API
                                                            ▼
                                                       Your broker
```

There is also one *thin, optional* arrow not shown above: the Next.js
backend can send a small "wake up and re-check now" HTTP ping to the
trading engine's control API when you press Start/Stop/Emergency Stop in
the UI (`lib/trading-engine-client.ts`). This is a convenience only — the
engine polls Supabase on its own schedule regardless, so a dropped ping
never causes a stuck state. **The trading engine is never reachable
directly from the browser**; only the Next.js server calls it, and only
with a shared secret (`TRADING_ENGINE_API_KEY` / `ENGINE_API_KEY`).

### Why not just do everything in Next.js API routes on Vercel?

Two hard requirements rule that out:

1. **Vercel functions are request-driven and short-lived.** A scalping
   strategy needs a continuously-running loop that watches the market and
   reacts within seconds, independent of anyone having a browser tab open.
   That needs a long-running process — a VPS or any always-on container
   host, not a serverless function.
2. **Security boundary.** Trade execution and risk evaluation should not
   share a runtime with the public-facing web app. Keeping the trading
   engine as a separate deployable means a web app vulnerability can't
   directly reach the code path that talks to your broker, and the engine's
   Supabase service-role credentials never need to exist inside the Vercel
   deployment at all.

### Why does an MQL5 EA exist instead of the engine placing orders over some MT5 API directly?

MetaTrader 5's trading API (order placement, position management) is native
to the terminal — the officially supported way to execute logic against a
live MT5 account is an Expert Advisor running inside that terminal (or the
terminal's own Python integration when running on the same machine as the
terminal). Since the trading engine is meant to run on a lightweight Linux
VPS or container completely independent of where MT5 itself runs, the EA is
the bridge: it is a thin client that authenticates, reports account state,
and executes only pre-approved commands. All the "thinking" (signals, risk)
happens outside the EA, in the trading engine — the EA is intentionally as
dumb and small as possible, which also makes it easier to audit.

## Data flow: how a trade actually happens

1. **Market data** — the trading engine's `MarketDataProvider` supplies
   OHLC candles for a symbol/timeframe. In this repo the default is
   `SimulatedMarketDataProvider` (a random-walk synthetic generator, safe
   for zero-setup paper trading and tests). `Mt5TerminalMarketDataProvider`
   is a documented extension point for a real feed
   (`trading-engine/engine/market_data/provider.py`).
2. **Strategy engine** (`engine/strategy_engine/`) computes market
   structure (swing points, HH/HL/LH/LL, BOS/CHoCH), liquidity (equal
   highs/lows, previous day/session levels, sweeps), order blocks, fair
   value gaps, and EMA/RSI/ATR. These are combined into a 0–100
   **signal score** (`scoring.py`) using configurable weights. Indicators
   are confluence only — they can raise or lower the score, but a
   candidate is never generated from an indicator crossover alone.
3. A candidate is only produced if the score clears the account/user's
   configured minimum (`min_signal_score`, default 80) **and** a valid
   stop-loss can be computed (`entry.py::evaluate_symbol`). A high score by
   itself never triggers a trade — it only produces a *candidate signal*
   that is then written to Supabase (`signals` table) and handed to the
   risk engine.
4. **Risk engine** (`engine/risk_engine/`) evaluates the candidate
   independently for every connected account that could take it
   (`engine.py::evaluate_account`), checking (among others) daily loss,
   drawdown, max simultaneous/per-symbol/per-day/per-hour trades,
   consecutive losses, cooldowns, spread, minimum equity, and daily profit
   lock. **The same signal can be approved for one account and rejected for
   another** — every account's own balance, open positions, and risk
   profile are used, never a shared/global calculation.
5. **Position sizing** (`risk_engine/position_sizing.py`) is computed from
   that account's real MT5 `SymbolSpec` (tick size, tick value, contract
   size, min/max/step lot, broker stop-level distance) — reported by the EA
   itself via heartbeat — never a hard-coded pip value.
6. If approved, the engine builds a **trade command**
   (`execution/command_builder.py`) with a deterministic **nonce**
   (SHA-256 of `account_id:signal_id:action`) and inserts it into
   `trade_commands` with status `PENDING` and an expiry timestamp.
7. The MT5 EA polls `GET /api/ea/commands` (using its bridge token) every
   few seconds. The Next.js route atomically flips matching `PENDING`
   commands to `SENT` so a command is only ever handed out once. The EA
   also has an in-memory ring buffer to guard against acting twice on a
   response it already saw.
8. The EA executes the command with MT5's `CTrade` class and reports the
   result to `POST /api/ea/trade-result`, which is itself idempotent
   (replays of an already-processed command return
   `{ alreadyProcessed: true }` rather than double-booking a trade).
9. `trade_executions`, `positions`, and (on close) `closed_trades` are
   updated; a database trigger keeps `daily_statistics` correct
   automatically. Supabase Realtime pushes the change to any open PWA
   session, and the dashboard/analytics pages update live.

## Fail-safe defaults (spec section 45)

These are enforced at the point closest to the actual trade, not just in
the UI:

- No market data for a symbol → no candidate is ever generated for it.
- Risk engine cannot evaluate an account (missing/invalid risk profile,
  stale data) → that account is skipped, not defaulted to "approved".
- EA hasn't sent a heartbeat recently / `ea_connections.connected = false`
  → the engine does not queue new commands for that account.
- Global `trading_state` is anything other than `ACTIVE` → no new entry
  commands are generated, regardless of what any individual account's
  settings say.
- `EMERGENCY_STOPPED` is enforced twice: once by the engine refusing to
  queue anything, and again by the emergency-stop API route itself
  inserting `STOP_TRADING`/close-adjacent commands per account as a second,
  independent layer (see `app/api/trading/emergency-stop/route.ts`).
- A trade command that has expired (past `expires_at`) is never executed by
  the EA even if delivered, and the polling endpoint itself expires stale
  `PENDING` commands before handing anything out.
- SL calculation always produces a value for a live/demo trade; if none of
  the configured methods can produce a valid stop, the candidate is
  discarded rather than sent without one.

## Why a `trading_state` table beyond the spec's literal 16 tables

The spec's global "AUTO TRADING STATUS" badge (`🟢 ACTIVE` / `⚪ STOPPED` /
`🟡 PAPER MODE` / `🔴 EMERGENCY STOP`) and mode (PAPER/DEMO/LIVE) are
account-independent, user-scoped, and need a single source of truth that
both the web app and the trading engine read and react to instantly via
Realtime. Rather than overload another table with mixed concerns, a small
dedicated `trading_state` table (one row per user) makes the state machine
explicit and easy to audit (`supabase/migrations/20260101000900_trading_state.sql`).

## Roles and permissions

Three roles (`profiles.role`): `ADMIN`, `TRADER`, `VIEWER`. Permission
checks live in `lib/auth/permissions.ts` and are enforced server-side in
every API route — the UI hiding a button is a convenience, not the
security boundary. `VIEWER` can read everything but change nothing;
`TRADER` can do everything except manage other users' roles; `ADMIN` can do
both. Row Level Security in Postgres is the final backstop: even a bug in
an API route's authorization check cannot let one user read or write
another user's rows, because RLS is enforced by Postgres itself for every
query that isn't made through the service-role key.
