"""
Backtesting engine (spec section 31). Walks forward bar-by-bar over
historical candles, calling the SAME strategy evaluation used live
(engine.strategy_engine.entry.evaluate_symbol) with only the candles known
up to that point in time - never the full series - so there is no
look-ahead bias in the entry decision. Once a trade is "opened", its outcome
is determined by scanning forward through subsequent (already-known
historical) bars, which is legitimate: that is what actually happened next,
not information used to decide the entry.

Results are always labeled as a historical simulation (spec section 31/56) -
see the `label` field on BacktestReport - and are never used to fabricate or
imply future performance.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from engine.analytics import ClosedTradeLike, PerformanceMetrics, compute_performance_metrics
from engine.execution.paper import simulate_fill, simulate_outcome_from_future_candles
from engine.market_data.candles import CandleSeries
from engine.market_data.provider import MarketDataProvider
from engine.risk_engine.position_sizing import compute_position_size
from engine.risk_engine.symbol_spec import SymbolSpec
from engine.strategy_engine.entry import CandidateSignal, RejectedCandidate, StrategyConfig, evaluate_symbol


@dataclass(frozen=True)
class BacktestTradeRecord:
    symbol: str
    direction: str
    entry_price: float
    stop_loss: float
    take_profit: float
    volume: float
    result: str
    exit_price: float
    opened_at: str
    signal_score: float


@dataclass(frozen=True)
class BacktestReport:
    label: str
    trades: list[BacktestTradeRecord]
    metrics: PerformanceMetrics


class _WindowedProvider(MarketDataProvider):
    """Wraps a full historical series but only ever exposes candles up to
    `cursor` (exclusive) to the strategy engine, guaranteeing no look-ahead."""

    def __init__(self, full_series: dict[str, CandleSeries], spread_points: dict[str, float]):
        self._full = full_series
        self._spread = spread_points
        self.cursor = 0

    def get_candles(self, symbol: str, timeframe: str, count: int) -> CandleSeries:
        series = self._full.get(symbol, [])
        end = min(self.cursor, len(series))
        start = max(0, end - count)
        return series[start:end]

    def get_spread_points(self, symbol: str) -> float:
        return self._spread.get(symbol, 15.0)

    def is_healthy(self) -> bool:
        return True


def run_backtest(
    symbol: str,
    candles: CandleSeries,
    config: StrategyConfig,
    starting_equity: float,
    risk_per_trade_pct: float,
    symbol_spec: SymbolSpec,
    account_max_lot: float,
    spread_points: float = 15.0,
    warmup_bars: int = 250,
) -> BacktestReport:
    provider = _WindowedProvider({symbol: candles}, {symbol: spread_points})
    trades: list[BacktestTradeRecord] = []
    equity = starting_equity
    i = warmup_bars

    while i < len(candles):
        provider.cursor = i + 1  # candles[0:i+1] known, i.e. up to and including bar i
        result = evaluate_symbol(symbol, provider, config, now=candles[i].time.replace(tzinfo=timezone.utc))

        if isinstance(result, CandidateSignal):
            position = compute_position_size(
                account_equity=equity,
                risk_per_trade_pct=risk_per_trade_pct,
                entry_price=result.entry_price,
                stop_loss_price=result.stop_loss,
                spec=symbol_spec,
                account_max_lot=account_max_lot,
            )
            if position.lot_size > 0:
                fill = simulate_fill(symbol, result.direction, result.entry_price, result.stop_loss, result.take_profit, position, now=candles[i].time)
                future = candles[i + 1 :]
                outcome, exit_price = simulate_outcome_from_future_candles(fill, [c.high for c in future], [c.low for c in future])

                if outcome != "OPEN":
                    pnl_points = (exit_price - fill.entry_price) if fill.direction == "BUY" else (fill.entry_price - exit_price)
                    pnl = pnl_points / symbol_spec.point * symbol_spec.value_per_point() * fill.volume
                    equity += pnl
                    trades.append(
                        BacktestTradeRecord(
                            symbol=symbol,
                            direction=fill.direction,
                            entry_price=fill.entry_price,
                            stop_loss=fill.stop_loss,
                            take_profit=fill.take_profit,
                            volume=fill.volume,
                            result=outcome,
                            exit_price=exit_price,
                            opened_at=fill.opened_at,
                            signal_score=result.score,
                        )
                    )
                    # Advance the cursor past this trade's resolution so we
                    # don't open overlapping simulated trades on every bar.
                    resolved_index = i + 1 + next(
                        (j for j, (h, l) in enumerate(zip([c.high for c in future], [c.low for c in future]))
                         if (fill.direction == "BUY" and (l <= fill.stop_loss or h >= fill.take_profit))
                         or (fill.direction == "SELL" and (h >= fill.stop_loss or l <= fill.take_profit))),
                        len(future) - 1,
                    )
                    i = max(resolved_index, i) + 1
                    continue
        i += 1

    metric_input = [ClosedTradeLike(profit=_trade_pnl(t, symbol_spec), result=t.result, duration_seconds=0) for t in trades]
    metrics = compute_performance_metrics(metric_input)

    return BacktestReport(label="HISTORICAL SIMULATION - not a guarantee of future results", trades=trades, metrics=metrics)


def _trade_pnl(trade: BacktestTradeRecord, spec: SymbolSpec) -> float:
    pnl_points = (trade.exit_price - trade.entry_price) if trade.direction == "BUY" else (trade.entry_price - trade.exit_price)
    return pnl_points / spec.point * spec.value_per_point() * trade.volume
