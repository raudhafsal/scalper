from __future__ import annotations

from datetime import datetime, timezone

from engine.strategy_engine.filters import check_session, check_spread, check_volatility


def test_spread_filter_uses_symbol_specific_override():
    limits = {"default": 25, "XAUUSD": 60}
    assert check_spread(40, limits, "XAUUSD").passed is True
    assert check_spread(40, limits, "EURUSD").passed is False


def test_spread_filter_falls_back_to_default():
    limits = {"default": 25}
    assert check_spread(20, limits, "EURUSD").passed is True
    assert check_spread(30, limits, "EURUSD").passed is False


def test_volatility_filter_rejects_too_quiet():
    history = [float(i) for i in range(1, 101)]  # ATR history ranging 1..100
    result = check_volatility(current_atr=1.0, atr_history=history, min_percentile=20, max_percentile=95)
    assert result.passed is False


def test_volatility_filter_rejects_abnormally_wild():
    history = [1.0] * 95 + [10.0] * 5
    result = check_volatility(current_atr=10.0, atr_history=history, min_percentile=20, max_percentile=95)
    assert result.passed is False


def test_volatility_filter_passes_normal_range():
    history = [float(i) for i in range(1, 101)]
    result = check_volatility(current_atr=50.0, atr_history=history, min_percentile=20, max_percentile=95)
    assert result.passed is True


def test_session_filter_blocks_disabled_session():
    ts = datetime(2026, 1, 5, 13, 0, tzinfo=timezone.utc)  # London/NY overlap hour
    filters = {"asian": True, "london": True, "newyork": True, "overlap": False}
    result = check_session(ts, filters)
    assert result.passed is False


def test_session_filter_allows_enabled_session():
    ts = datetime(2026, 1, 5, 1, 0, tzinfo=timezone.utc)  # Asian session
    filters = {"asian": True, "london": True, "newyork": True, "overlap": True}
    result = check_session(ts, filters)
    assert result.passed is True


def test_session_filter_blocks_off_session_hours():
    ts = datetime(2026, 1, 5, 22, 0, tzinfo=timezone.utc)  # after NY close, before Asian open
    filters = {"asian": True, "london": True, "newyork": True, "overlap": True}
    result = check_session(ts, filters)
    assert result.passed is False
