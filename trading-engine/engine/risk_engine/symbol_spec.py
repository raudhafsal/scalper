"""Real MT5 symbol specification, as reported by the EA heartbeat (spec
section 26: "Never hard-code universal pip values"). Position sizing must
always use these real values, not an assumed pip size."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SymbolSpec:
    symbol: str
    tick_size: float
    tick_value: float
    point: float
    contract_size: float
    min_lot: float
    max_lot: float
    lot_step: float
    stop_level_points: float
    digits: int

    def value_per_point(self) -> float:
        """Monetary value of a 1-point move for 1.0 lot, derived from the
        broker-reported tick size/value rather than assumed."""
        if self.tick_size <= 0:
            return 0.0
        return self.tick_value * (self.point / self.tick_size)
