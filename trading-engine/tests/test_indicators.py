from __future__ import annotations

from engine.strategy_engine.indicators import atr_percentile, atr_series, ema, ema_series, rsi, rsi_series
from tests.conftest import make_series


def test_ema_converges_toward_trend():
    prices = [1.0] * 20 + [2.0] * 40
    result = ema(prices, period=10)
    assert len(result) == len(prices)
    # After a strong sustained move, EMA should be much closer to the new
    # level than the old one.
    assert result[-1] > 1.8


def test_ema_short_series_returns_simple_average():
    prices = [1.0, 2.0, 3.0]
    result = ema(prices, period=10)
    assert all(abs(v - 2.0) < 1e-9 for v in result)


def test_rsi_high_after_sustained_gains():
    prices = [100 + i for i in range(30)]  # straight up every bar
    result = rsi(prices, period=14)
    assert result[-1] > 70


def test_rsi_low_after_sustained_losses():
    prices = [100 - i for i in range(30)]
    result = rsi(prices, period=14)
    assert result[-1] < 30


def test_rsi_neutral_when_insufficient_data():
    prices = [1.0, 1.1, 1.2]
    result = rsi(prices, period=14)
    assert all(v == 50.0 for v in result)


def test_atr_series_positive_for_volatile_series():
    series = make_series([1.10, 1.12, 1.09, 1.13, 1.08, 1.14, 1.07, 1.15] * 5)
    atr = atr_series(series, period=14)
    assert len(atr) == len(series)
    assert all(v >= 0 for v in atr)
    assert atr[-1] > 0


def test_atr_percentile_bounds():
    history = [1.0, 2.0, 3.0, 4.0, 5.0]
    assert atr_percentile(0.5, history) == 0
    assert atr_percentile(5.0, history) == 100
    assert 0 <= atr_percentile(3.0, history) <= 100
