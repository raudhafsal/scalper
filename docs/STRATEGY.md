# Strategy — Multi-Confirmation Scalping

This describes the strategy implemented in
`trading-engine/engine/strategy_engine/`. It is a **confluence-based**
scalping approach: no single signal (an indicator crossing a level, a
pattern appearing) ever triggers a trade by itself. A candidate is only
produced when multiple independent forms of evidence line up, and even
then it still has to clear the risk engine (`docs/RISK_MANAGEMENT.md`)
before it becomes a trade.

## The building blocks

### Market structure (`structure.py`)

Swing highs/lows are found with a fractal, lookback-based method
(`find_swing_points`) — a candle is only confirmed as a swing point once
enough candles exist on both sides of it, so nothing is ever "repainted"
after the fact. Swings are classified into **HH/HL/LH/LL**
(`classify_swings`), and from that sequence `analyze_structure` detects
**Break of Structure (BOS)** — price breaking beyond the last swing in the
direction of the trend — and **Change of Character (CHoCH)** — the first
break against the prevailing trend, an early reversal signal.

### Liquidity (`liquidity.py`)

- **Equal highs/lows**: clusters of swing points within a tolerance,
  treated as resting liquidity.
- **Previous day / previous session levels**: the prior day's or session's
  high/low, common liquidity targets for intraday moves.
- **Sweep detection**: price briefly trades through one of the above
  levels and then reclaims back the other side with confirmation — a
  classic "stop hunt" pattern — via `detect_sweep` /
  `sweep_agrees_with_bias`.

### Order blocks (`order_blocks.py`)

The last opposing candle before a strong impulsive move — a common
proxy for where institutional orders may cluster. Order blocks are
tracked and marked `filled` once price has traded back through them
(`mark_filled`), and `price_in_zone` checks whether the current price sits
inside an unfilled block.

### Fair value gaps / FVG (`fvg.py`)

A three-candle imbalance where candle 1's high/low doesn't overlap with
candle 3's low/high, leaving a gap. Tracked with the same filled/unfilled
lifecycle as order blocks (`mark_filled`, `price_in_gap`).

### Indicators — confluence only (`indicators.py`)

- **EMA** (fast/mid/slow/trend periods, all configurable) — used to judge
  directional alignment, never as a standalone crossover trigger.
- **RSI** (Wilder's smoothing) — used to confirm momentum isn't already
  exhausted in the trade's direction.
- **ATR** (Wilder's smoothing) — used both for volatility health checks
  and, optionally, for ATR-based stop distance.

### Session and quality filters (`filters.py`, `sessions.py`)

- **Spread filter**: rejects a candidate if the current spread (in points)
  exceeds the account's configured maximum.
- **Volatility filter**: rejects if current ATR sits below a low
  percentile of recent ATR history (too quiet — scalping setups in dead
  markets are lower quality) or is used to flag abnormally wild conditions,
  depending on configuration.
- **Session filter**: restricts trading to configured sessions (Asian,
  London, New York, London/NY overlap), computed from UTC session
  boundaries (mirrored identically in `lib/analytics.ts`'s
  `sessionForTimestamp` on the TypeScript side, so the dashboard and the
  engine always agree on which session a timestamp falls in).

## Signal scoring (`scoring.py`)

Every confluence check above resolves to a simple pass/fail, and each
passing check contributes its configured weight to a 0–100 total:

| Check | Default weight |
|---|---|
| Market structure aligned | 20 |
| Liquidity sweep present | 15 |
| BOS / CHoCH aligned | 15 |
| Order block confluence | 15 |
| Fair value gap confluence | 10 |
| EMA aligned | 10 |
| RSI supportive | 5 |
| ATR healthy | 5 |
| Candle confirmation | 5 |

Weights must always sum to exactly 100 — both the Python engine
(`compute_signal_score`) and the strategy settings API
(`app/api/strategy/route.ts`) validate this and reject a save/config that
doesn't. The default minimum score to produce a candidate is **80**, and
is itself configurable per user in the **Strategy** page.

**A score at or above the minimum produces a candidate signal — it does
not place a trade.** The candidate is written to `signals`, and only the
risk engine's independent, per-account evaluation can turn it into an
actual `trade_command`. See `docs/RISK_MANAGEMENT.md`.

## Stop loss (`sl_tp.py`)

Three configurable methods, chosen per strategy profile:

- **ATR**: `entry ± (ATR × multiplier)`.
- **SWING**: the lowest low / highest high over a configurable lookback
  window (structure-based invalidation).
- **ORDER_BLOCK**: just beyond the order block that produced the setup, so
  a real break of the block invalidates the trade.

`compute_stop_loss` is designed so that a live/demo trade is never sent
without a valid stop: if the selected method can't produce a sane distance
(e.g. zero/negative ATR), it returns `None`, and the calling pipeline
(`entry.py::evaluate_symbol`) discards the candidate entirely rather than
falling back to an arbitrary default.

## Take profit (`sl_tp.py`)

Risk:reward based, off the same stop distance: **1:1, 1:1.5, 1:2 (default),
1:3**, or a **custom** ratio. Trade management on top of the initial TP is
configurable per strategy: **breakeven** (move stop to entry once price
reaches a configured R multiple), **partial take-profit** (close a
configured percentage at a configured R multiple), and **trailing stop**
(enable/disable).

## Timeframes

Each strategy profile configures a **primary** timeframe (where signals
are generated), a **confirmation** timeframe (used to corroborate
structure/trend), and an optional third timeframe — all independently
selectable from M1/M5/M15 in the Strategy page.

## Where this is and isn't configurable from the UI

The **Strategy** page (`/strategy`) exposes: timeframes, minimum signal
score, all nine score weights, structure/liquidity lookback windows,
EMA/RSI/ATR periods, SL method (+ ATR multiplier), TP mode (+ custom R:R),
breakeven/partial-TP/trailing toggles and thresholds, and session filters.
Changing these writes to `strategy_settings`, which the trading engine
reads on its next poll cycle — no redeploy needed.

## Backtesting

`trading-engine/engine/backtest/runner.py` runs the same
`evaluate_symbol` pipeline over historical candle data using a
`_WindowedProvider` that only ever exposes candles up to "now" in the
simulated timeline — this specifically prevents lookahead bias (the
strategy can never see a candle that hasn't "happened yet" in the
backtest). Backtest results are historical simulations only; they do not
predict live performance, are subject to assumptions about fill price and
slippage that a live market may not honor, and should never be presented
or relied upon as a guarantee of future results.
