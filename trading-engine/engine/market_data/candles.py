"""Core OHLCV candle type shared by every strategy module."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Candle:
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0

    def is_bullish(self) -> bool:
        return self.close > self.open

    def is_bearish(self) -> bool:
        return self.close < self.open

    def body(self) -> float:
        return abs(self.close - self.open)

    def range(self) -> float:
        return self.high - self.low


CandleSeries = list[Candle]


def closes(series: CandleSeries) -> list[float]:
    return [c.close for c in series]


def highs(series: CandleSeries) -> list[float]:
    return [c.high for c in series]


def lows(series: CandleSeries) -> list[float]:
    return [c.low for c in series]


def only_confirmed(series: CandleSeries) -> CandleSeries:
    """
    By convention, callers always pass series with the still-forming candle
    excluded (i.e. index -1 is the last *closed* candle). Every detector in
    strategy_engine/ operates only on confirmed candles to avoid repainting
    (spec section 15) - this helper exists so call sites can express that
    intent explicitly: `only_confirmed(series[:-1])` when a live/forming
    candle was appended for display purposes elsewhere.
    """
    return series
