"""Liquidity: equal highs/lows, previous day/session high/low, and sweep
detection (spec section 16)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from enum import Enum

from engine.market_data.candles import Candle, CandleSeries
from engine.strategy_engine.structure import StructureBias


@dataclass(frozen=True)
class LiquidityLevel:
    price: float
    kind: str  # "EQUAL_HIGH" | "EQUAL_LOW" | "PDH" | "PDL" | "PSH" | "PSL" | "LOCAL_HIGH" | "LOCAL_LOW"
    touches: int = 1


def find_equal_highs(series: CandleSeries, tolerance_points: float, point: float, min_touches: int = 2) -> list[LiquidityLevel]:
    """Groups swing-ish highs that sit within `tolerance_points` of each
    other - the hallmark of resting buy-side liquidity."""
    tol = tolerance_points * point
    highs = sorted({round(c.high, 6) for c in series}, reverse=True)
    levels: list[LiquidityLevel] = []
    used: set[float] = set()

    for h in highs:
        if h in used:
            continue
        cluster = [x for x in highs if abs(x - h) <= tol]
        if len(cluster) >= min_touches:
            avg = sum(cluster) / len(cluster)
            levels.append(LiquidityLevel(price=avg, kind="EQUAL_HIGH", touches=len(cluster)))
            used.update(cluster)

    return levels


def find_equal_lows(series: CandleSeries, tolerance_points: float, point: float, min_touches: int = 2) -> list[LiquidityLevel]:
    tol = tolerance_points * point
    lows = sorted({round(c.low, 6) for c in series})
    levels: list[LiquidityLevel] = []
    used: set[float] = set()

    for lo in lows:
        if lo in used:
            continue
        cluster = [x for x in lows if abs(x - lo) <= tol]
        if len(cluster) >= min_touches:
            avg = sum(cluster) / len(cluster)
            levels.append(LiquidityLevel(price=avg, kind="EQUAL_LOW", touches=len(cluster)))
            used.update(cluster)

    return levels


def previous_day_levels(series: CandleSeries) -> tuple[LiquidityLevel | None, LiquidityLevel | None]:
    """Previous UTC day's high/low, from a series that includes at least the
    prior day's candles."""
    if not series:
        return None, None
    last_day = series[-1].time.date()
    prev_day = last_day - timedelta(days=1)
    prev_candles = [c for c in series if c.time.date() == prev_day]
    if not prev_candles:
        return None, None
    return (
        LiquidityLevel(price=max(c.high for c in prev_candles), kind="PDH"),
        LiquidityLevel(price=min(c.low for c in prev_candles), kind="PDL"),
    )


def previous_session_levels(series: CandleSeries, session_start_hour_utc: int, session_end_hour_utc: int) -> tuple[LiquidityLevel | None, LiquidityLevel | None]:
    """High/low of the most recently COMPLETED session window (spec section
    22/16 - previous session high/low), given UTC hour boundaries."""
    if not series:
        return None, None

    def in_session(c: Candle) -> bool:
        h = c.time.hour
        if session_start_hour_utc < session_end_hour_utc:
            return session_start_hour_utc <= h < session_end_hour_utc
        return h >= session_start_hour_utc or h < session_end_hour_utc  # wraps midnight

    last_time = series[-1].time
    session_candles = [c for c in series if in_session(c) and c.time < last_time.replace(hour=session_start_hour_utc, minute=0, second=0, microsecond=0)]
    if not session_candles:
        return None, None
    return (
        LiquidityLevel(price=max(c.high for c in session_candles), kind="PSH"),
        LiquidityLevel(price=min(c.low for c in session_candles), kind="PSL"),
    )


class SweepDirection(str, Enum):
    BULLISH = "BULLISH"  # swept a LOW then reclaimed -> potential BUY
    BEARISH = "BEARISH"  # swept a HIGH then reclaimed -> potential SELL


@dataclass(frozen=True)
class LiquiditySweep:
    level: LiquidityLevel
    direction: SweepDirection
    sweep_index: int
    confirmation_index: int


def detect_sweep(
    series: CandleSeries,
    levels: list[LiquidityLevel],
    lookahead: int = 3,
) -> LiquiditySweep | None:
    """
    Detects the most recent liquidity sweep among `levels`:
      Bullish: a candle pierces BELOW a low-side level (wick beyond it) and
               within `lookahead` candles price closes back ABOVE the level
               with a bullish confirmation candle -> spec section 16.
      Bearish: mirror image around a high-side level.
    Only confirmed (fully closed) candles are considered.
    """
    if len(series) < lookahead + 1:
        return None

    best: LiquiditySweep | None = None

    for level in levels:
        is_low_side = level.kind in ("EQUAL_LOW", "PDL", "PSL", "LOCAL_LOW")
        is_high_side = level.kind in ("EQUAL_HIGH", "PDH", "PSH", "LOCAL_HIGH")
        if not (is_low_side or is_high_side):
            continue

        for i in range(len(series) - lookahead - 1, len(series) - 1):
            if i < 0:
                continue
            sweep_candle = series[i]

            if is_low_side and sweep_candle.low < level.price:
                for j in range(i + 1, min(i + 1 + lookahead, len(series))):
                    confirm = series[j]
                    if confirm.close > level.price and confirm.is_bullish():
                        candidate = LiquiditySweep(level, SweepDirection.BULLISH, i, j)
                        if best is None or candidate.confirmation_index > best.confirmation_index:
                            best = candidate
                        break

            if is_high_side and sweep_candle.high > level.price:
                for j in range(i + 1, min(i + 1 + lookahead, len(series))):
                    confirm = series[j]
                    if confirm.close < level.price and confirm.is_bearish():
                        candidate = LiquiditySweep(level, SweepDirection.BEARISH, i, j)
                        if best is None or candidate.confirmation_index > best.confirmation_index:
                            best = candidate
                        break

    return best


def sweep_agrees_with_bias(sweep: LiquiditySweep, bias: StructureBias) -> bool:
    """A bullish sweep should align with a bullish (or neutral) structural
    bias for a BUY setup, and vice versa - confluence, not a standalone
    trigger (spec section 16/23)."""
    if sweep.direction == SweepDirection.BULLISH:
        return bias != StructureBias.BEARISH
    return bias != StructureBias.BULLISH
