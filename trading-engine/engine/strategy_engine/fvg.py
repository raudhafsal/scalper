"""Fair Value Gap detection (spec section 18). Used as confluence only."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from engine.market_data.candles import CandleSeries


class FvgDirection(str, Enum):
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"


@dataclass(frozen=True)
class FairValueGap:
    index: int  # index of the middle candle of the 3-candle pattern
    direction: FvgDirection
    upper: float
    lower: float
    timeframe: str
    created_at: datetime
    filled: bool = False


def find_fvgs(series: CandleSeries, timeframe: str) -> list[FairValueGap]:
    """
    Classic 3-candle imbalance:
      Bullish FVG: candle[i-1].high < candle[i+1].low  (gap left behind the
                   middle impulsive candle[i])
      Bearish FVG: candle[i-1].low  > candle[i+1].high
    """
    gaps: list[FairValueGap] = []
    n = len(series)

    for i in range(1, n - 1):
        c1, c3 = series[i - 1], series[i + 1]

        if c1.high < c3.low:
            gaps.append(
                FairValueGap(index=i, direction=FvgDirection.BULLISH, upper=c3.low, lower=c1.high, timeframe=timeframe, created_at=series[i].time)
            )
        elif c1.low > c3.high:
            gaps.append(
                FairValueGap(index=i, direction=FvgDirection.BEARISH, upper=c1.low, lower=c3.high, timeframe=timeframe, created_at=series[i].time)
            )

    return gaps


def mark_filled(gaps: list[FairValueGap], series: CandleSeries) -> list[FairValueGap]:
    updated: list[FairValueGap] = []
    for g in gaps:
        filled = False
        for c in series[g.index + 2 :]:
            if g.direction == FvgDirection.BULLISH and c.low <= g.lower:
                filled = True
                break
            if g.direction == FvgDirection.BEARISH and c.high >= g.upper:
                filled = True
                break
        updated.append(FairValueGap(g.index, g.direction, g.upper, g.lower, g.timeframe, g.created_at, filled))
    return updated


def price_in_gap(price: float, gap: FairValueGap) -> bool:
    return gap.lower <= price <= gap.upper
