from __future__ import annotations

from datetime import datetime, timedelta, timezone

from engine.market_data.candles import Candle
from engine.strategy_engine.order_blocks import ObDirection, find_order_blocks, mark_filled, price_in_zone


def _flat_series(n, price=1.1000):
    base = datetime(2026, 1, 5, tzinfo=timezone.utc)
    series = []
    for i in range(n):
        series.append(Candle(time=base + timedelta(minutes=i), open=price, high=price + 0.0002, low=price - 0.0002, close=price))
    return series


def test_detects_bullish_order_block_before_impulsive_up_move():
    series = _flat_series(25, price=1.1000)
    base = datetime(2026, 1, 5, tzinfo=timezone.utc)

    # Last candle of the flat window is bearish (down-close) - the candidate OB.
    down_candle = Candle(time=base + timedelta(minutes=25), open=1.1000, high=1.1001, low=1.0995, close=1.0996)
    # Followed immediately by a strong impulsive bullish candle.
    impulse = Candle(time=base + timedelta(minutes=26), open=1.0996, high=1.1050, low=1.0995, close=1.1048)

    series = series + [down_candle, impulse]
    blocks = find_order_blocks(series, "M1", impulse_multiplier=1.5, lookback_avg=20)

    assert any(b.direction == ObDirection.BULLISH and b.zone_low == down_candle.low and b.zone_high == down_candle.high for b in blocks)


def test_detects_bearish_order_block_before_impulsive_down_move():
    series = _flat_series(25, price=1.1000)
    base = datetime(2026, 1, 5, tzinfo=timezone.utc)

    up_candle = Candle(time=base + timedelta(minutes=25), open=1.1000, high=1.1005, low=1.0999, close=1.1004)
    impulse = Candle(time=base + timedelta(minutes=26), open=1.1004, high=1.1005, low=1.0950, close=1.0952)

    series = series + [up_candle, impulse]
    blocks = find_order_blocks(series, "M1", impulse_multiplier=1.5, lookback_avg=20)

    assert any(b.direction == ObDirection.BEARISH for b in blocks)


def test_no_order_block_without_impulsive_follow_through():
    series = _flat_series(30, price=1.1000)  # no impulsive move anywhere
    blocks = find_order_blocks(series, "M1", impulse_multiplier=1.5, lookback_avg=20)
    assert blocks == []


def test_mark_filled_when_price_trades_back_through_zone():
    series = _flat_series(25, price=1.1000)
    base = datetime(2026, 1, 5, tzinfo=timezone.utc)
    down_candle = Candle(time=base + timedelta(minutes=25), open=1.1000, high=1.1001, low=1.0995, close=1.0996)
    impulse = Candle(time=base + timedelta(minutes=26), open=1.0996, high=1.1050, low=1.0995, close=1.1048)
    retrace = Candle(time=base + timedelta(minutes=27), open=1.1048, high=1.1049, low=1.0990, close=1.0992)

    series = series + [down_candle, impulse, retrace]
    blocks = find_order_blocks(series, "M1", impulse_multiplier=1.5, lookback_avg=20)
    updated = mark_filled(blocks, series)

    assert any(b.filled for b in updated)


def test_price_in_zone():
    series = _flat_series(25, price=1.1000)
    base = datetime(2026, 1, 5, tzinfo=timezone.utc)
    down_candle = Candle(time=base + timedelta(minutes=25), open=1.1000, high=1.1001, low=1.0995, close=1.0996)
    impulse = Candle(time=base + timedelta(minutes=26), open=1.0996, high=1.1050, low=1.0995, close=1.1048)
    series = series + [down_candle, impulse]

    blocks = find_order_blocks(series, "M1", impulse_multiplier=1.5, lookback_avg=20)
    ob = blocks[0]
    assert price_in_zone((ob.zone_high + ob.zone_low) / 2, ob) is True
    assert price_in_zone(ob.zone_high + 1, ob) is False
