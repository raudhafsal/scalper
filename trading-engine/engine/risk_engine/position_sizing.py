"""Position sizing (spec section 26). Always derived from the account's real
equity, the configured risk %, the actual SL distance, and the broker's real
symbol specification - never a hard-coded pip value."""
from __future__ import annotations

import math
from dataclasses import dataclass

from engine.risk_engine.symbol_spec import SymbolSpec


@dataclass(frozen=True)
class PositionSizeResult:
    lot_size: float
    risk_amount: float
    sl_distance_price: float
    capped_by_max_lot: bool
    below_min_lot: bool


def round_to_lot_step(lot: float, lot_step: float, min_lot: float, max_lot: float) -> float:
    if lot_step <= 0:
        return max(min_lot, min(lot, max_lot))
    steps = math.floor(lot / lot_step)
    rounded = steps * lot_step
    rounded = max(min_lot, min(rounded, max_lot))
    return round(rounded, 8)


def compute_position_size(
    account_equity: float,
    risk_per_trade_pct: float,
    entry_price: float,
    stop_loss_price: float,
    spec: SymbolSpec,
    account_max_lot: float,
) -> PositionSizeResult:
    """
    lot = risk_amount / (sl_distance_in_points * value_per_point_per_lot)

    where value_per_point_per_lot comes from the broker's real tick
    size/value (spec.value_per_point()), never an assumed $10/pip or similar.
    """
    if account_equity <= 0 or risk_per_trade_pct <= 0:
        return PositionSizeResult(0.0, 0.0, 0.0, False, True)

    sl_distance_price = abs(entry_price - stop_loss_price)
    if sl_distance_price <= 0 or spec.point <= 0:
        return PositionSizeResult(0.0, 0.0, sl_distance_price, False, True)

    # Respect the broker's minimum stop distance where known.
    min_distance = spec.stop_level_points * spec.point
    if min_distance > 0 and sl_distance_price < min_distance:
        sl_distance_price = min_distance

    risk_amount = account_equity * (risk_per_trade_pct / 100)
    sl_distance_points = sl_distance_price / spec.point
    value_per_point = spec.value_per_point()

    if value_per_point <= 0 or sl_distance_points <= 0:
        return PositionSizeResult(0.0, risk_amount, sl_distance_price, False, True)

    raw_lot = risk_amount / (sl_distance_points * value_per_point)

    effective_max_lot = min(spec.max_lot, account_max_lot)
    capped = raw_lot > effective_max_lot
    below_min = raw_lot < spec.min_lot

    final_lot = round_to_lot_step(raw_lot, spec.lot_step, spec.min_lot, effective_max_lot)

    return PositionSizeResult(
        lot_size=final_lot,
        risk_amount=risk_amount,
        sl_distance_price=sl_distance_price,
        capped_by_max_lot=capped,
        below_min_lot=below_min,
    )
