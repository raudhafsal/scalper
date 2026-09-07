"""Spread, volatility, and session filters (spec sections 20-22). Every
filter here is a hard gate - a failure means REJECT TRADE, full stop, no
partial credit in the score."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from engine.strategy_engine.indicators import atr_percentile
from engine.strategy_engine.sessions import is_session_allowed


@dataclass(frozen=True)
class FilterResult:
    passed: bool
    reason: str | None = None


def check_spread(current_spread_points: float, max_spread_points_by_symbol: dict[str, float], symbol: str) -> FilterResult:
    """
    Never assume all symbols share one spread limit (spec section 20) -
    `max_spread_points_by_symbol` should carry a "default" key plus any
    symbol-specific overrides, e.g. {"default": 25, "XAUUSD": 60}.
    """
    max_allowed = max_spread_points_by_symbol.get(symbol, max_spread_points_by_symbol.get("default", 25))
    if current_spread_points > max_allowed:
        return FilterResult(False, f"Spread {current_spread_points:.1f} exceeds max {max_allowed} for {symbol}")
    return FilterResult(True)


def check_volatility(
    current_atr: float,
    atr_history: list[float],
    min_percentile: float = 20,
    max_percentile: float = 95,
) -> FilterResult:
    """Rejects both abnormally quiet (likely to chop out a scalp) and
    abnormally wild (spread/slippage risk, news-spike) conditions, relative
    to the symbol's own recent volatility distribution (spec section 21)."""
    pct = atr_percentile(current_atr, atr_history)
    if pct < min_percentile:
        return FilterResult(False, f"Volatility too low (ATR percentile {pct:.0f} < {min_percentile})")
    if pct > max_percentile:
        return FilterResult(False, f"Volatility abnormal (ATR percentile {pct:.0f} > {max_percentile})")
    return FilterResult(True)


def check_session(ts: datetime, session_filters: dict[str, bool]) -> FilterResult:
    if not is_session_allowed(ts, session_filters):
        return FilterResult(False, "Outside allowed trading sessions")
    return FilterResult(True)
