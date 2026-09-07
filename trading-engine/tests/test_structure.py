from __future__ import annotations

from engine.strategy_engine.structure import (
    StructureBias,
    SwingLabel,
    analyze_structure,
    classify_swings,
    find_swing_points,
)
from tests.conftest import make_series


def test_find_swing_points_detects_local_extremes():
    # A clean V shape: down then up, with a single low in the middle.
    prices = [1.10, 1.09, 1.08, 1.07, 1.06, 1.07, 1.08, 1.09, 1.10, 1.11, 1.10, 1.09]
    series = make_series(prices)
    swings = find_swing_points(series, lookback=3)
    assert len(swings) > 0
    # At least one swing low should be near the trough of the V.
    lows = [s for s in swings if s.type.value == "LOW"]
    assert any(abs(s.index - 4) <= 2 for s in lows)


def test_classify_swings_labels_higher_highs_and_lows(uptrend_series):
    swings = find_swing_points(uptrend_series, lookback=4)
    labeled = classify_swings(swings)
    highs = [s for s in labeled if s.type.value == "HIGH" and s.label != SwingLabel.NONE]
    lows = [s for s in labeled if s.type.value == "LOW" and s.label != SwingLabel.NONE]
    # In a staircase uptrend, most classified highs/lows should be HH/HL.
    assert highs, "expected at least one classified swing high"
    assert lows, "expected at least one classified swing low"
    assert sum(1 for s in highs if s.label == SwingLabel.HH) >= sum(1 for s in highs if s.label == SwingLabel.LH)
    assert sum(1 for s in lows if s.label == SwingLabel.HL) >= sum(1 for s in lows if s.label == SwingLabel.LL)


def test_analyze_structure_bullish_bias_in_uptrend(uptrend_series):
    result = analyze_structure(uptrend_series, lookback=4)
    assert result.bias == StructureBias.BULLISH
    assert len(result.events) > 0


def test_analyze_structure_bearish_bias_in_downtrend(downtrend_series):
    result = analyze_structure(downtrend_series, lookback=4)
    assert result.bias == StructureBias.BEARISH


def test_analyze_structure_neutral_when_flat():
    series = make_series([1.1000] * 40)
    result = analyze_structure(series, lookback=4)
    assert result.bias == StructureBias.NEUTRAL
    assert result.events == []


def test_structure_never_uses_unclosed_future_data(uptrend_series):
    """Repainting guard: analyzing a truncated prefix of the series must not
    retroactively change swing points that were already confirmed within
    that prefix."""
    full = analyze_structure(uptrend_series, lookback=4)
    prefix = uptrend_series[:50]
    partial = analyze_structure(prefix, lookback=4)

    # Every swing confirmed in the partial run (index comfortably inside the
    # confirmed region, i.e. not within `lookback` of the prefix's end) must
    # also appear identically in the full run.
    safe_partial_swings = [s for s in partial.swings if s.index < len(prefix) - 4]
    full_swings_by_index = {(s.index, s.type): s for s in full.swings}
    for s in safe_partial_swings:
        assert (s.index, s.type) in full_swings_by_index
        assert full_swings_by_index[(s.index, s.type)].price == s.price
