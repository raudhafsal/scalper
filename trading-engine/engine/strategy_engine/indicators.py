"""EMA / RSI / ATR - used as confluence, never as a standalone trigger
(spec section 19: "Do not use RSI simply as RSI < 30 = BUY")."""
from __future__ import annotations

from engine.market_data.candles import CandleSeries


def ema(values: list[float], period: int) -> list[float]:
    """Standard exponential moving average. Returns a series the same length
    as `values`; the first `period - 1` entries are seeded with a simple
    average so the output never contains NaN/None (simplifies downstream
    comparisons)."""
    if not values or period <= 0:
        return []
    if len(values) < period:
        avg = sum(values) / len(values)
        return [avg] * len(values)

    k = 2 / (period + 1)
    seed = sum(values[:period]) / period
    result = [seed] * period
    prev = seed
    for v in values[period:]:
        cur = v * k + prev * (1 - k)
        result.append(cur)
        prev = cur
    return result


def ema_series(series: CandleSeries, period: int) -> list[float]:
    return ema([c.close for c in series], period)


def rsi(values: list[float], period: int = 14) -> list[float]:
    """Wilder's RSI. Returns a series the same length as `values`; the first
    `period` entries are neutral (50.0) since there isn't enough data yet."""
    n = len(values)
    if n == 0:
        return []
    if n <= period:
        return [50.0] * n

    gains = [0.0] * n
    losses = [0.0] * n
    for i in range(1, n):
        delta = values[i] - values[i - 1]
        gains[i] = max(delta, 0.0)
        losses[i] = max(-delta, 0.0)

    avg_gain = sum(gains[1 : period + 1]) / period
    avg_loss = sum(losses[1 : period + 1]) / period

    result = [50.0] * (period + 1)
    for i in range(period + 1, n):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        rs = avg_gain / avg_loss if avg_loss > 0 else float("inf")
        value = 100.0 if avg_loss == 0 else 100 - (100 / (1 + rs))
        result.append(value)

    return result


def rsi_series(series: CandleSeries, period: int = 14) -> list[float]:
    return rsi([c.close for c in series], period)


def atr_series(series: CandleSeries, period: int = 14) -> list[float]:
    """Wilder's ATR (average true range) - used for volatility filtering and
    ATR-based stop losses."""
    n = len(series)
    if n == 0:
        return []

    true_ranges: list[float] = []
    for i, c in enumerate(series):
        if i == 0:
            true_ranges.append(c.range())
            continue
        prev_close = series[i - 1].close
        tr = max(c.high - c.low, abs(c.high - prev_close), abs(c.low - prev_close))
        true_ranges.append(tr)

    if n <= period:
        avg = sum(true_ranges) / n
        return [avg] * n

    result = [sum(true_ranges[:period]) / period] * period
    prev = result[0]
    for tr in true_ranges[period:]:
        cur = (prev * (period - 1) + tr) / period
        result.append(cur)
        prev = cur
    return result


def atr_percentile(current_atr: float, atr_history: list[float]) -> float:
    """Percentile rank of the current ATR within its own recent history -
    used by the volatility filter to reject abnormally quiet or abnormally
    wild conditions (spec section 21) without hard-coding an absolute
    threshold that would only suit one symbol."""
    if not atr_history:
        return 50.0
    below = sum(1 for v in atr_history if v <= current_atr)
    return (below / len(atr_history)) * 100
