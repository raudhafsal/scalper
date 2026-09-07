from __future__ import annotations

import pytest

from engine.analytics import ClosedTradeLike, compute_performance_metrics


def test_empty_trades_returns_nulls_not_fabricated_numbers():
    metrics = compute_performance_metrics([])
    assert metrics.total_trades == 0
    assert metrics.win_rate is None
    assert metrics.profit_factor is None
    assert metrics.net_profit == 0


def test_win_rate_and_profit_factor():
    trades = [
        ClosedTradeLike(profit=100, result="WIN", duration_seconds=60),
        ClosedTradeLike(profit=100, result="WIN", duration_seconds=60),
        ClosedTradeLike(profit=-50, result="LOSS", duration_seconds=60),
    ]
    metrics = compute_performance_metrics(trades)
    assert metrics.win_rate == pytest.approx(66.666, abs=0.01)
    assert metrics.profit_factor == pytest.approx(4.0, abs=0.01)
    assert metrics.net_profit == 150


def test_max_consecutive_losses():
    trades = [
        ClosedTradeLike(profit=-10, result="LOSS", duration_seconds=1),
        ClosedTradeLike(profit=-10, result="LOSS", duration_seconds=1),
        ClosedTradeLike(profit=10, result="WIN", duration_seconds=1),
        ClosedTradeLike(profit=-10, result="LOSS", duration_seconds=1),
    ]
    metrics = compute_performance_metrics(trades)
    assert metrics.max_consecutive_losses == 2


def test_max_drawdown_from_equity_curve():
    trades = [
        ClosedTradeLike(profit=100, result="WIN", duration_seconds=1),
        ClosedTradeLike(profit=-60, result="LOSS", duration_seconds=1),
        ClosedTradeLike(profit=-20, result="LOSS", duration_seconds=1),
    ]
    metrics = compute_performance_metrics(trades)
    # Peak equity = 100, trough after two losses = 20 -> drawdown 80%.
    assert metrics.max_drawdown_pct == 80.0


def test_profit_factor_infinite_when_no_losses():
    trades = [ClosedTradeLike(profit=50, result="WIN", duration_seconds=1)]
    metrics = compute_performance_metrics(trades)
    assert metrics.profit_factor == float("inf")
