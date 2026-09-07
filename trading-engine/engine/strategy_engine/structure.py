"""
Market structure: swing points, HH/HL/LH/LL classification, and BOS/CHoCH
detection (spec section 15).

Repainting avoidance: a swing point at index i is only confirmed once
`lookback` candles exist on BOTH sides of it (i.e. we know candle i was a
local extreme only after later candles fail to exceed it). Everything here
therefore lags by `lookback` candles by design - that lag is the price of
never repainting.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from engine.market_data.candles import CandleSeries


class SwingType(str, Enum):
    HIGH = "HIGH"
    LOW = "LOW"


class SwingLabel(str, Enum):
    HH = "HH"  # higher high
    HL = "HL"  # higher low
    LH = "LH"  # lower high
    LL = "LL"  # lower low
    NONE = "NONE"  # not enough prior swings of the same type to classify yet


@dataclass(frozen=True)
class SwingPoint:
    index: int
    type: SwingType
    price: float
    label: SwingLabel = SwingLabel.NONE


class StructureBias(str, Enum):
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"
    NEUTRAL = "NEUTRAL"


class StructureEventType(str, Enum):
    BOS = "BOS"
    CHOCH = "CHOCH"


@dataclass(frozen=True)
class StructureEvent:
    index: int
    type: StructureEventType
    direction: StructureBias
    broken_level: float


@dataclass(frozen=True)
class StructureAnalysis:
    swings: list[SwingPoint]
    bias: StructureBias
    events: list[StructureEvent]

    @property
    def last_event(self) -> StructureEvent | None:
        return self.events[-1] if self.events else None


def find_swing_points(series: CandleSeries, lookback: int = 5) -> list[SwingPoint]:
    """Fractal swing detection: candle i is a swing high if its high is
    strictly greater than every candle's high within `lookback` bars on
    either side (and symmetrically for swing lows)."""
    swings: list[SwingPoint] = []
    n = len(series)

    for i in range(lookback, n - lookback):
        window = series[i - lookback : i + lookback + 1]
        candle = series[i]

        if candle.high == max(c.high for c in window) and _is_unique_max(window, lookback):
            swings.append(SwingPoint(index=i, type=SwingType.HIGH, price=candle.high))
        if candle.low == min(c.low for c in window) and _is_unique_min(window, lookback):
            swings.append(SwingPoint(index=i, type=SwingType.LOW, price=candle.low))

    return swings


def _is_unique_max(window: CandleSeries, lookback: int) -> bool:
    center = window[lookback]
    return all(c.high <= center.high for j, c in enumerate(window) if j != lookback)


def _is_unique_min(window: CandleSeries, lookback: int) -> bool:
    center = window[lookback]
    return all(c.low >= center.low for j, c in enumerate(window) if j != lookback)


def classify_swings(swings: list[SwingPoint]) -> list[SwingPoint]:
    """Labels each swing HH/HL/LH/LL relative to the previous swing of the
    same type."""
    labeled: list[SwingPoint] = []
    last_high: SwingPoint | None = None
    last_low: SwingPoint | None = None

    for s in swings:
        if s.type == SwingType.HIGH:
            label = SwingLabel.NONE
            if last_high is not None:
                label = SwingLabel.HH if s.price > last_high.price else SwingLabel.LH
            labeled.append(SwingPoint(s.index, s.type, s.price, label))
            last_high = s
        else:
            label = SwingLabel.NONE
            if last_low is not None:
                label = SwingLabel.HL if s.price > last_low.price else SwingLabel.LL
            labeled.append(SwingPoint(s.index, s.type, s.price, label))
            last_low = s

    return labeled


def analyze_structure(series: CandleSeries, lookback: int = 5) -> StructureAnalysis:
    """
    Full structure analysis for the confirmed portion of `series`:
      1. Detect + classify swing points.
      2. Walk forward maintaining a "last confirmed swing high/low" and a
         running bias. A close beyond the last swing high while bias is
         bullish (or the first such break) is a BOS (continuation). A close
         beyond a swing level AGAINST the prevailing bias is a CHoCH
         (character change / potential reversal), which also flips the bias.
    """
    raw_swings = find_swing_points(series, lookback)
    swings = classify_swings(raw_swings)

    bias = StructureBias.NEUTRAL
    events: list[StructureEvent] = []
    last_swing_high: SwingPoint | None = None
    last_swing_low: SwingPoint | None = None
    swing_iter = iter(swings)
    next_swing = next(swing_iter, None)

    for i, candle in enumerate(series):
        while next_swing is not None and next_swing.index == i:
            if next_swing.type == SwingType.HIGH:
                last_swing_high = next_swing
            else:
                last_swing_low = next_swing
            next_swing = next(swing_iter, None)

        if last_swing_high is not None and candle.close > last_swing_high.price:
            if bias in (StructureBias.BEARISH, StructureBias.NEUTRAL):
                events.append(StructureEvent(i, StructureEventType.CHOCH, StructureBias.BULLISH, last_swing_high.price))
            else:
                events.append(StructureEvent(i, StructureEventType.BOS, StructureBias.BULLISH, last_swing_high.price))
            bias = StructureBias.BULLISH
            # Consume the level so we don't fire repeatedly on the same break.
            last_swing_high = None

        elif last_swing_low is not None and candle.close < last_swing_low.price:
            if bias in (StructureBias.BULLISH, StructureBias.NEUTRAL):
                events.append(StructureEvent(i, StructureEventType.CHOCH, StructureBias.BEARISH, last_swing_low.price))
            else:
                events.append(StructureEvent(i, StructureEventType.BOS, StructureBias.BEARISH, last_swing_low.price))
            bias = StructureBias.BEARISH
            last_swing_low = None

    return StructureAnalysis(swings=swings, bias=bias, events=events)
