# Risk Management

The risk engine (`trading-engine/engine/risk_engine/`) is the only thing
standing between a scoring "candidate signal" and a real order. A
candidate that scores 100/100 and fails even one risk check produces
**no trade command at all** — scoring and risk are fully independent
layers on purpose.

## Every account is evaluated independently

`evaluate_account()` in `engine/risk_engine/engine.py` runs the full rule
set separately for **each connected account** that could take a given
candidate signal, using that account's own balance, equity, open
positions, trade history, and risk profile. **The same signal can be
approved for Account A and rejected for Account B** in the same pass —
there is no shared/global "is this trade allowed" flag. This is required
because different accounts can run different risk profiles, be in
different states (one might already be at its daily loss limit while
another isn't), or simply be excluded from a symbol via
`mt5_account_settings.allowed_symbols`.

## Rule set (`rules.py`)

Each rule is a small, independently-testable pure function returning a
`RuleResult` (pass/fail + human-readable reason):

| Rule | What it checks |
|---|---|
| `check_daily_loss` | Today's realized P/L against `max_daily_loss_pct` of the day's starting balance |
| `check_drawdown` | Current equity against `max_drawdown_pct` below peak equity |
| `check_max_simultaneous_trades` | Total open trades on the account vs. `max_simultaneous_trades` |
| `check_max_trades_per_symbol` | Open trades on this symbol vs. `max_trades_per_symbol` |
| `check_max_trades_per_day` | Trades already taken today vs. `max_trades_per_day` |
| `check_max_trades_per_hour` | Trades in the last rolling hour vs. `max_trades_per_hour` |
| `check_consecutive_losses` | Current losing streak vs. `max_consecutive_losses` |
| `check_cooldown` | Time since the last loss/trade vs. `cooldown_after_loss_minutes` / `cooldown_after_trade_minutes` |
| `check_spread` | Current spread (points) vs. `max_spread_points` |
| `check_lot` | Computed lot size vs. `max_lot` |
| `check_min_equity` | Account equity vs. `min_equity` |
| `check_daily_profit_lock` | Today's realized profit vs. an optional `daily_profit_lock_pct` — once hit, no further new trades today |
| `check_account_status` | `mt5_accounts.trading_enabled` and `connection_status` (must be connected) |
| `check_symbol_allowed` | The candidate's symbol against that account's `allowed_symbols` |
| `check_global_trading_state` | The user's global `trading_state.status` — anything other than `ACTIVE` blocks new entries account-wide |

All 15 checks (14 rule functions plus the composed decision in
`engine.py`) are covered by dedicated tests in
`trading-engine/tests/test_risk_rules.py` and
`trading-engine/tests/test_risk_engine.py`.

## Default risk profile (`risk_settings`, seeded per new user)

| Setting | Default |
|---|---|
| Risk per trade | 0.5% |
| Max daily loss | 3% |
| Max drawdown | 10% |
| Max simultaneous trades | 3 |
| Max trades per symbol | 1 |
| Max trades per day | 15 |
| Max trades per hour | 4 |
| Max consecutive losses | 3 |
| Cooldown after a loss | 15 minutes |
| Cooldown after any trade | 2 minutes |
| Max spread | 25 points |
| Max lot | 5 |
| Minimum equity | 100 |
| Daily profit lock | off (null) by default |

Every one of these is editable per user (and, via
`mt5_account_settings.use_global_settings = false`, per account) from the
**Risk** page. Every field has a database-level `check` constraint (e.g.
`risk_per_trade_pct > 0`) so an invalid value can never be saved even if
application-layer validation were somehow bypassed.

## Position sizing — never a hard-coded pip value

`engine/risk_engine/position_sizing.py`'s `compute_position_size()` always
derives lot size from that account's **real, EA-reported** `SymbolSpec`
(`engine/risk_engine/symbol_spec.py`):

- `tick_size`, `tick_value`, `contract_size` — reported by the EA in its
  heartbeat (`BuildSymbolSpecsJson()` in the MQL5 file), sourced from
  MT5's own `SymbolInfoDouble`/`SymbolInfoInteger` for that symbol on that
  specific broker.
- `min_lot`, `max_lot`, `lot_step`, `stop_level_points` — also broker- and
  symbol-specific, also EA-reported.

The engine computes risk amount (`equity × risk_per_trade_pct`), divides by
the stop-loss distance converted to account-currency value via
`value_per_point()`, then rounds to the broker's `lot_step`
(`round_to_lot_step()`) and clamps to `[min_lot, max_lot]`. This means the
same percentage risk setting produces correctly different lot sizes on
XAUUSD vs. EURUSD vs. a JPY pair, and correctly different sizes across
brokers with different contract specifications — nothing about pip value
or lot sizing is assumed or hard-coded anywhere in this codebase.

## Idempotency and duplicate prevention

Three independent layers, so a duplicate trade requires all three to fail
simultaneously:

1. **Deterministic nonce**: `build_entry_command_nonce()` hashes
   `account_id:signal_id:action` (SHA-256) — the same signal can never
   produce two different commands for the same account.
2. **Database constraint**: `trade_commands` has a `unique (account_id, nonce)`
   constraint, plus a partial unique index preventing two simultaneous
   in-flight BUY/SELL commands for the same account+symbol
   (`supabase/migrations/20260101000500_signals_commands.sql`).
3. **EA-side ring buffer**: the EA keeps the last 200 executed command IDs
   in memory (`g_executedCommandIds`) and refuses to re-execute one it's
   already seen, even before any server round-trip.

Command expiry is enforced in two places: the EA never executes a command
past its `expires_at`, and `GET /api/ea/commands` itself expires stale
`PENDING` commands server-side before handing anything out.

## Emergency Stop vs. Close All — deliberately separate

- **Emergency Stop** (`app/api/trading/emergency-stop/route.ts`) sets
  global `trading_state.status = 'EMERGENCY_STOPPED'` and — as a second,
  independent enforcement layer, not just a flag the engine is trusted to
  respect — inserts explicit `STOP_TRADING` commands per account. It
  requires the caller to submit the exact confirmation phrase
  `"EMERGENCY STOP"` (validated server-side via a Zod literal, not just a
  UI checkbox) and logs a `CRITICAL` severity system event.
- **Close All Positions** (`app/api/trading/close-all/route.ts`) is a
  **separate action** that queues an idempotent `CLOSE` command
  (`nonce: close-<broker_ticket>`) for every currently open position. It
  requires the exact phrase `"CLOSE ALL POSITIONS"`.

These are intentionally never combined into one button: stopping new
trades and closing existing ones are different decisions with different
consequences (e.g. you may want to stop new entries but let existing
trades ride to their own SL/TP), and combining them behind one
confirmation makes it too easy to do both by accident.

## Modes: PAPER / DEMO / LIVE

- **PAPER** simulates the entire pipeline, including fills
  (`engine/execution/paper.py`) — no command is ever sent to any EA, no
  real MT5 account is touched, regardless of what account is "selected."
  Safe by construction.
- **DEMO** sends real commands to a real MT5 terminal, but one connected
  to a broker demo account — real execution mechanics, no real money.
- **LIVE** sends real commands to a real MT5 terminal connected to a real
  funded account. **LIVE is never enabled by default** for any new
  account or profile — you must explicitly mark an account `LIVE` and
  explicitly start trading with risk acknowledgement
  (`startTradingSchema` requires `confirmedRiskAcknowledgement: true`,
  validated server-side).

## What this system will never do

- Trust a frontend-computed value for money math — every position size,
  every P/L figure shown is either computed server-side/engine-side from
  real data or is a direct read of a value the EA itself reported.
- Allow an arbitrary symbol — every candidate is checked against that
  account's `allowed_symbols` before a command is ever built.
- Allow an unlimited lot size — `check_lot` and the broker's own
  `max_lot`/`min_lot`/`lot_step` from `SymbolSpec` always apply.
- Execute an expired or duplicate command.
- Promise, imply, or display a guarantee of profitability anywhere in the
  UI or docs. Live/simulated results shown are historical facts about what
  already happened, not predictions.
