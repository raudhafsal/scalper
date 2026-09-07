"""Stop loss / take profit calculation (spec sections 24-25). Every live
trade must carry a valid stop loss - `compute_stop_loss` never returns None
for a signal that's about to become a trade command; callers should reject
the signal instead if none of the methods can produce a sane level."""
from __future__ import annotations

from dataclasses import dataclass

from engine.market_data.candles import CandleSeries
from engine.strategy_engine.order_blocks import ObDirection, OrderBlock

RR_MODE_MULTIPLIERS = {
    "RR_1_1": 1.0,
    "RR_1_1_5": 1.5,
    "RR_1_2": 2.0,
    "RR_1_3": 3.0,
}


@dataclass(frozen=True)
class SlTpResult:
    stop_loss: float
    take_profit: float
    risk_reward: float
    sl_method_used: str


def compute_stop_loss(
    method: str,
    direction: str,  # "BUY" | "SELL"
    entry_price: float,
    series: CandleSeries,
    atr: float,
    atr_multiplier: float,
    swing_lookback: int = 10,
    order_block: OrderBlock | None = None,
) -> float | None:
    if method == "ATR":
        distance = atr * atr_multiplier
        if distance <= 0:
            return None
        return entry_price - distance if direction == "BUY" else entry_price + distance

    if method == "SWING":
        recent = series[-swing_lookback:]
        if not recent:
            return None
        if direction == "BUY":
            return min(c.low for c in recent)
        return max(c.high for c in recent)

    if method == "ORDER_BLOCK":
        if order_block is None:
            return None
        if direction == "BUY" and order_block.direction == ObDirection.BULLISH:
            return order_block.zone_low
        if direction == "SELL" and order_block.direction == ObDirection.BEARISH:
            return order_block.zone_high
        return None

    raise ValueError(f"Unknown SL method: {method}")


def compute_take_profit(
    direction: str,
    entry_price: float,
    stop_loss: float,
    tp_mode: str,
    custom_rr: float | None = None,
) -> SlTpResult:
    risk_distance = abs(entry_price - stop_loss)
    if risk_distance <= 0:
        raise ValueError("Stop loss distance must be > 0")

    rr = custom_rr if tp_mode == "CUSTOM" and custom_rr else RR_MODE_MULTIPLIERS.get(tp_mode, 2.0)
    reward_distance = risk_distance * rr

    take_profit = entry_price + reward_distance if direction == "BUY" else entry_price - reward_distance

    return SlTpResult(stop_loss=stop_loss, take_profit=take_profit, risk_reward=rr, sl_method_used=tp_mode)
