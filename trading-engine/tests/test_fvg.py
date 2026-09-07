from __future__ import annotations

from engine.market_data.candles import Candle
from engine.strategy_engine.fvg import FvgDirection, find_fvgs, mark_filled, price_in_gap
from datetime import datetime, timedelta, timezone


def _candle(t_offset, o, h, l, c):
    base = datetime(2026, 1, 5, tzinfo=timezone.utc)
    return Candle(time=base + timedelta(minutes=t_offset), open=o, high=h, low=l, close=c)


def test_detects_bullish_fvg():
    # candle[0].high (1.1010) < candle[2].low (1.1030) -> bullish gap
    series = [
        _candle(0, 1.1000, 1.1010, 1.0990, 1.1005),
        _candle(1, 1.1005, 1.1050, 1.1000, 1.1045),  # impulsive middle candle
        _candle(2, 1.1045, 1.1060, 1.1030, 1.1055),
    ]
    gaps = find_fvgs(series, "M1")
    assert len(gaps) == 1
    assert gaps[0].direction == FvgDirection.BULLISH
    assert gaps[0].lower == 1.1010
    assert gaps[0].upper == 1.1030


def test_detects_bearish_fvg():
    series = [
        _candle(0, 1.1050, 1.1060, 1.1040, 1.1045),
        _candle(1, 1.1045, 1.1046, 1.1000, 1.1005),
        _candle(2, 1.1005, 1.1010, 1.0990, 1.0995),
    ]
    gaps = find_fvgs(series, "M1")
    assert len(gaps) == 1
    assert gaps[0].direction == FvgDirection.BEARISH


def test_no_fvg_when_candles_overlap():
    series = [
        _candle(0, 1.1000, 1.1020, 1.0990, 1.1010),
        _candle(1, 1.1010, 1.1030, 1.0995, 1.1015),
        _candle(2, 1.1015, 1.1025, 1.1000, 1.1005),
    ]
    gaps = find_fvgs(series, "M1")
    assert gaps == []


def test_mark_filled_when_price_returns_into_gap():
    series = [
        _candle(0, 1.1000, 1.1010, 1.0990, 1.1005),
        _candle(1, 1.1005, 1.1050, 1.1000, 1.1045),
        _candle(2, 1.1045, 1.1060, 1.1030, 1.1055),
        _candle(3, 1.1055, 1.1058, 1.1005, 1.1006),  # dips back through the gap
    ]
    gaps = find_fvgs(series, "M1")
    updated = mark_filled(gaps, series)
    assert updated[0].filled is True


def test_price_in_gap_bounds():
    gap = find_fvgs(
        [
            _candle(0, 1.1000, 1.1010, 1.0990, 1.1005),
            _candle(1, 1.1005, 1.1050, 1.1000, 1.1045),
            _candle(2, 1.1045, 1.1060, 1.1030, 1.1055),
        ],
        "M1",
    )[0]
    assert price_in_gap(1.1020, gap) is True
    assert price_in_gap(1.0999, gap) is False
