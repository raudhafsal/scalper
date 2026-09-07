"""
PAPER mode simulator (spec section 29). Calculates real signals, real entry/
SL/TP, real position sizing, and simulates a fill and eventual result -
but NEVER sends anything to MT5. The engine's main loop only calls the real
command dispatch path (which reaches the EA) when run_mode != PAPER.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from engine.risk_engine.position_sizing import PositionSizeResult


@dataclass(frozen=True)
class SimulatedFill:
    symbol: str
    direction: str
    volume: float
    entry_price: float
    stop_loss: float
    take_profit: float
    opened_at: str


def simulate_fill(
    symbol: str,
    direction: str,
    entry_price: float,
    stop_loss: float,
    take_profit: float,
    position_size: PositionSizeResult,
    now: datetime | None = None,
) -> SimulatedFill:
    now = now or datetime.now(timezone.utc)
    return SimulatedFill(
        symbol=symbol,
        direction=direction,
        volume=position_size.lot_size,
        entry_price=entry_price,
        stop_loss=stop_loss,
        take_profit=take_profit,
        opened_at=now.isoformat(),
    )


def simulate_outcome_from_future_candles(fill: SimulatedFill, future_highs: list[float], future_lows: list[float]) -> tuple[str, float]:
    """
    Given the candles that occurred AFTER the simulated entry, determines
    whether SL or TP was hit first (checked in chronological order, so this
    never looks further ahead than the outcome actually requires - no
    lookahead bias). Returns (result, exit_price) where result is
    "WIN" | "LOSS" | "OPEN" (still running - neither level touched yet in
    the provided window).
    """
    for high, low in zip(future_highs, future_lows):
        if fill.direction == "BUY":
            if low <= fill.stop_loss:
                return "LOSS", fill.stop_loss
            if high >= fill.take_profit:
                return "WIN", fill.take_profit
        else:
            if high >= fill.stop_loss:
                return "LOSS", fill.stop_loss
            if low <= fill.take_profit:
                return "WIN", fill.take_profit
    return "OPEN", fill.entry_price
