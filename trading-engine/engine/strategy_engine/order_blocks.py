"""Order block detection (spec section 17). Requires confluence to trade off
of - detecting a zone here is not itself an entry signal."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from engine.market_data.candles import CandleSeries


class ObDirection(str, Enum):
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"


@dataclass(frozen=True)
class OrderBlock:
    index: int
    direction: ObDirection
    zone_high: float
    zone_low: float
    timeframe: str
    created_at: datetime
    filled: bool = False


def find_order_blocks(
    series: CandleSeries,
    timeframe: str,
    impulse_multiplier: float = 1.8,
    lookback_avg: int = 20,
) -> list[OrderBlock]:
    """
    A bullish order block is the last bearish (down-close) candle
    immediately before an impulsive bullish move; a bearish order block is
    the mirror image. "Impulsive" here means the following candle's range
    is at least `impulse_multiplier` times the recent average range - a
    simple, explainable stand-in for "strong displacement", which is
    intentionally conservative rather than reactive to every up/down tick.
    """
    blocks: list[OrderBlock] = []
    n = len(series)
    if n < lookback_avg + 2:
        return blocks

    for i in range(lookback_avg, n - 1):
        window = series[i - lookback_avg : i]
        avg_range = sum(c.range() for c in window) / len(window) if window else 0
        if avg_range <= 0:
            continue

        impulse = series[i + 1] if i + 1 < n else None
        if impulse is None:
            continue

        is_impulsive = impulse.range() >= avg_range * impulse_multiplier
        if not is_impulsive:
            continue

        candidate = series[i]
        if impulse.is_bullish() and candidate.is_bearish():
            blocks.append(
                OrderBlock(
                    index=i,
                    direction=ObDirection.BULLISH,
                    zone_high=candidate.high,
                    zone_low=candidate.low,
                    timeframe=timeframe,
                    created_at=candidate.time,
                )
            )
        elif impulse.is_bearish() and candidate.is_bullish():
            blocks.append(
                OrderBlock(
                    index=i,
                    direction=ObDirection.BEARISH,
                    zone_high=candidate.high,
                    zone_low=candidate.low,
                    timeframe=timeframe,
                    created_at=candidate.time,
                )
            )

    return blocks


def mark_filled(blocks: list[OrderBlock], series: CandleSeries) -> list[OrderBlock]:
    """An order block is considered filled/mitigated once price has fully
    traded back through its zone after formation."""
    updated: list[OrderBlock] = []
    for ob in blocks:
        filled = False
        for c in series[ob.index + 1 :]:
            if ob.direction == ObDirection.BULLISH and c.low <= ob.zone_low:
                filled = True
                break
            if ob.direction == ObDirection.BEARISH and c.high >= ob.zone_high:
                filled = True
                break
        updated.append(OrderBlock(ob.index, ob.direction, ob.zone_high, ob.zone_low, ob.timeframe, ob.created_at, filled))
    return updated


def price_in_zone(price: float, ob: OrderBlock) -> bool:
    return ob.zone_low <= price <= ob.zone_high
