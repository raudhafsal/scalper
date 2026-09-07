"""Performance metrics, mirroring lib/analytics.ts:computePerformanceMetrics
on the web side so live dashboard numbers and backtest reports are computed
identically. Keep both in sync if you change the formulas."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ClosedTradeLike:
    profit: float
    result: str  # "WIN" | "LOSS" | "BREAKEVEN"
    duration_seconds: int


@dataclass(frozen=True)
class PerformanceMetrics:
    total_trades: int
    wins: int
    losses: int
    breakevens: int
    win_rate: float | None
    profit_factor: float | None
    avg_win: float
    avg_loss: float
    net_profit: float
    max_drawdown_pct: float
    max_consecutive_losses: int
    avg_trade_duration_seconds: int


def compute_performance_metrics(trades: list[ClosedTradeLike]) -> PerformanceMetrics:
    total = len(trades)
    wins = [t for t in trades if t.result == "WIN"]
    losses = [t for t in trades if t.result == "LOSS"]
    breakevens = [t for t in trades if t.result == "BREAKEVEN"]

    gross_profit = sum(t.profit for t in wins)
    gross_loss = abs(sum(t.profit for t in losses))
    net_profit = sum(t.profit for t in trades)

    running = 0.0
    peak = 0.0
    max_dd = 0.0
    for t in trades:
        running += t.profit
        peak = max(peak, running)
        if peak > 0:
            max_dd = max(max_dd, (peak - running) / peak * 100)

    max_streak = 0
    streak = 0
    for t in trades:
        if t.result == "LOSS":
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    avg_duration = int(sum(t.duration_seconds for t in trades) / total) if total else 0

    return PerformanceMetrics(
        total_trades=total,
        wins=len(wins),
        losses=len(losses),
        breakevens=len(breakevens),
        win_rate=(len(wins) / total * 100) if total else None,
        profit_factor=(gross_profit / gross_loss) if gross_loss > 0 else (float("inf") if gross_profit > 0 else None),
        avg_win=(gross_profit / len(wins)) if wins else 0.0,
        avg_loss=(-gross_loss / len(losses)) if losses else 0.0,
        net_profit=net_profit,
        max_drawdown_pct=max_dd,
        max_consecutive_losses=max_streak,
        avg_trade_duration_seconds=avg_duration,
    )
