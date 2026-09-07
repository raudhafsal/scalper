from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from engine.market_data.candles import Candle


def make_series(prices: list[float], start: datetime | None = None, minutes: int = 1, wick: float = 0.0002) -> list[Candle]:
    """Builds a simple candle series from a list of close prices - each
    candle's open is the previous close, with a small wick on either side.
    Deterministic and easy to reason about in tests."""
    start = start or datetime(2026, 1, 5, 0, 0, tzinfo=timezone.utc)  # a Monday
    candles = []
    prev_close = prices[0]
    for i, price in enumerate(prices):
        t = start + timedelta(minutes=minutes * i)
        open_ = prev_close
        close = price
        high = max(open_, close) + wick
        low = min(open_, close) - wick
        candles.append(Candle(time=t, open=open_, high=high, low=low, close=close, volume=100))
        prev_close = close
    return candles


@pytest.fixture
def uptrend_series():
    """A clean staircase uptrend: swing lows rising, swing highs rising."""
    vals = []
    price = 1.1000
    for i in range(80):
        leg = i % 8
        if leg < 5:
            price += 0.0010
        else:
            price -= 0.0004
        vals.append(round(price, 5))
    return make_series(vals)


@pytest.fixture
def downtrend_series():
    vals = []
    price = 1.2000
    for i in range(80):
        leg = i % 8
        if leg < 5:
            price -= 0.0010
        else:
            price += 0.0004
        vals.append(round(price, 5))
    return make_series(vals)
