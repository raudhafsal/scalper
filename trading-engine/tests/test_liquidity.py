from __future__ import annotations

from datetime import datetime, timedelta, timezone

from engine.strategy_engine.liquidity import (
    LiquidityLevel,
    SweepDirection,
    detect_sweep,
    find_equal_highs,
    find_equal_lows,
    previous_day_levels,
)
from engine.strategy_engine.structure import StructureBias
from engine.strategy_engine.liquidity import sweep_agrees_with_bias
from tests.conftest import make_series


def test_find_equal_lows_clusters_close_prices():
    prices = [1.1000, 1.1010, 1.0950, 1.1005, 1.1020, 1.0952, 1.1030]
    series = make_series(prices)
    levels = find_equal_lows(series, tolerance_points=5, point=0.0001, min_touches=2)
    assert any(lvl.touches >= 2 for lvl in levels)


def test_find_equal_highs_requires_min_touches():
    prices = [1.1000, 1.1050, 1.1100, 1.1150, 1.1200]  # no repeated highs
    series = make_series(prices)
    levels = find_equal_highs(series, tolerance_points=1, point=0.0001, min_touches=2)
    assert levels == []


def test_previous_day_levels_uses_prior_calendar_day():
    start = datetime(2026, 1, 5, 0, 0, tzinfo=timezone.utc)
    day1 = make_series([1.10, 1.11, 1.09, 1.12], start=start, minutes=360)  # spans day 1
    day2_start = start + timedelta(days=1)
    day2 = make_series([1.20, 1.21], start=day2_start, minutes=60)
    series = day1 + day2

    pdh, pdl = previous_day_levels(series)
    assert pdh is not None and pdl is not None
    assert pdh.price == max(c.high for c in day1)
    assert pdl.price == min(c.low for c in day1)


def test_detect_bullish_sweep_requires_reclaim_and_confirmation():
    # Price dips below a known low, then closes back above it with a
    # bullish candle - a textbook bullish liquidity sweep.
    prices = [1.1000, 1.1005, 1.1010, 1.0990, 1.0940, 1.1020, 1.1040]
    series = make_series(prices)
    level = LiquidityLevel(price=1.0950, kind="LOCAL_LOW")

    sweep = detect_sweep(series, [level], lookahead=3)
    assert sweep is not None
    assert sweep.direction == SweepDirection.BULLISH


def test_detect_sweep_returns_none_without_reclaim():
    # Price pierces the level but never closes back above it.
    prices = [1.1000, 1.0990, 1.0940, 1.0930, 1.0920]
    series = make_series(prices)
    level = LiquidityLevel(price=1.0950, kind="LOCAL_LOW")

    sweep = detect_sweep(series, [level], lookahead=3)
    assert sweep is None


def test_sweep_agrees_with_bias():
    level = LiquidityLevel(price=1.0950, kind="LOCAL_LOW")
    from engine.strategy_engine.liquidity import LiquiditySweep

    bullish_sweep = LiquiditySweep(level, SweepDirection.BULLISH, 2, 4)
    assert sweep_agrees_with_bias(bullish_sweep, StructureBias.BULLISH) is True
    assert sweep_agrees_with_bias(bullish_sweep, StructureBias.BEARISH) is False
    assert sweep_agrees_with_bias(bullish_sweep, StructureBias.NEUTRAL) is True
