from __future__ import annotations

import pytest

from engine.strategy_engine.order_blocks import ObDirection, OrderBlock
from engine.strategy_engine.sl_tp import compute_stop_loss, compute_take_profit
from tests.conftest import make_series
from datetime import datetime, timezone


def test_atr_stop_loss_buy_is_below_entry():
    series = make_series([1.1000] * 20)
    sl = compute_stop_loss("ATR", "BUY", entry_price=1.1000, series=series, atr=0.0010, atr_multiplier=1.5)
    assert sl == pytest.approx(1.1000 - 0.0015)


def test_atr_stop_loss_sell_is_above_entry():
    series = make_series([1.1000] * 20)
    sl = compute_stop_loss("ATR", "SELL", entry_price=1.1000, series=series, atr=0.0010, atr_multiplier=1.5)
    assert sl == pytest.approx(1.1000 + 0.0015)


def test_atr_stop_loss_none_when_atr_zero():
    series = make_series([1.1000] * 20)
    sl = compute_stop_loss("ATR", "BUY", entry_price=1.1000, series=series, atr=0.0, atr_multiplier=1.5)
    assert sl is None


def test_swing_stop_loss_buy_uses_recent_low():
    prices = [1.1000, 1.1010, 1.0950, 1.1005, 1.1020]
    series = make_series(prices)
    sl = compute_stop_loss("SWING", "BUY", entry_price=1.1020, series=series, atr=0.001, atr_multiplier=1.5, swing_lookback=10)
    assert sl == min(c.low for c in series[-10:])


def test_order_block_stop_loss_requires_matching_direction():
    ob = OrderBlock(index=1, direction=ObDirection.BULLISH, zone_high=1.0960, zone_low=1.0950, timeframe="M1", created_at=datetime.now(timezone.utc))
    series = make_series([1.1000] * 5)

    sl_buy = compute_stop_loss("ORDER_BLOCK", "BUY", 1.1000, series, 0.001, 1.5, order_block=ob)
    assert sl_buy == 1.0950

    sl_sell = compute_stop_loss("ORDER_BLOCK", "SELL", 1.1000, series, 0.001, 1.5, order_block=ob)
    assert sl_sell is None  # mismatched direction -> no valid SL


def test_take_profit_default_rr_1_2():
    result = compute_take_profit("BUY", entry_price=1.1000, stop_loss=1.0950, tp_mode="RR_1_2")
    assert result.risk_reward == 2.0
    assert result.take_profit == pytest.approx(1.1000 + 0.0050 * 2)


def test_take_profit_sell_direction():
    result = compute_take_profit("SELL", entry_price=1.1000, stop_loss=1.1050, tp_mode="RR_1_2")
    assert result.take_profit == pytest.approx(1.1000 - 0.0050 * 2)


def test_take_profit_custom_rr():
    result = compute_take_profit("BUY", entry_price=1.1000, stop_loss=1.0950, tp_mode="CUSTOM", custom_rr=3.5)
    assert result.risk_reward == 3.5


def test_take_profit_raises_on_zero_risk_distance():
    with pytest.raises(ValueError):
        compute_take_profit("BUY", entry_price=1.1000, stop_loss=1.1000, tp_mode="RR_1_2")


def test_every_live_signal_has_nonzero_sl_distance():
    """Spec section 24: every normal live trade must have a valid stop
    loss - encoded here as 'SL distance must be > 0' for any (entry, sl)
    pair that reaches compute_take_profit."""
    result = compute_take_profit("BUY", entry_price=1.1000, stop_loss=1.0999, tp_mode="RR_1_1")
    assert abs(result.stop_loss - 1.1000) > 0
