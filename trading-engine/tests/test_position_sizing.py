from __future__ import annotations

from engine.risk_engine.position_sizing import compute_position_size, round_to_lot_step
from engine.risk_engine.symbol_spec import SymbolSpec


def eurusd_spec(**overrides) -> SymbolSpec:
    defaults = dict(
        symbol="EURUSD",
        tick_size=0.00001,
        tick_value=1.0,  # $1 per 0.00001 move per 1.0 lot (simplified but self-consistent)
        point=0.00001,
        contract_size=100000,
        min_lot=0.01,
        max_lot=100.0,
        lot_step=0.01,
        stop_level_points=0,
        digits=5,
    )
    defaults.update(overrides)
    return SymbolSpec(**defaults)


def test_position_size_scales_with_risk_amount():
    spec = eurusd_spec()
    small = compute_position_size(10000, 0.5, 1.1000, 1.0950, spec, account_max_lot=100)
    large = compute_position_size(10000, 1.0, 1.1000, 1.0950, spec, account_max_lot=100)
    assert large.lot_size > small.lot_size


def test_position_size_never_hardcodes_pip_value():
    """Changing tick_value alone (simulating a different broker/instrument)
    must change the resulting lot size - proves sizing is derived from the
    real symbol spec, not an assumed constant."""
    spec_a = eurusd_spec(tick_value=1.0)
    spec_b = eurusd_spec(tick_value=2.0)  # broker reports double the tick value

    result_a = compute_position_size(10000, 1.0, 1.1000, 1.0950, spec_a, account_max_lot=100)
    result_b = compute_position_size(10000, 1.0, 1.1000, 1.0950, spec_b, account_max_lot=100)

    assert result_b.lot_size < result_a.lot_size  # more $ per point -> smaller lot for same $ risk


def test_position_size_respects_min_lot():
    spec = eurusd_spec(min_lot=0.10, lot_step=0.10)
    result = compute_position_size(100, 0.01, 1.1000, 1.0950, spec, account_max_lot=100)
    assert result.below_min_lot is True
    assert result.lot_size >= spec.min_lot


def test_position_size_respects_account_max_lot_override():
    spec = eurusd_spec(max_lot=100)
    result = compute_position_size(1_000_000, 5, 1.1000, 1.0500, spec, account_max_lot=2.0)
    assert result.capped_by_max_lot is True
    assert result.lot_size <= 2.0


def test_position_size_zero_when_equity_zero():
    spec = eurusd_spec()
    result = compute_position_size(0, 1.0, 1.1000, 1.0950, spec, account_max_lot=100)
    assert result.lot_size == 0.0


def test_position_size_uses_broker_minimum_stop_distance():
    spec = eurusd_spec(stop_level_points=500)  # broker requires >= 500 points of SL distance
    tight_sl = compute_position_size(10000, 1.0, 1.10000, 1.09990, spec, account_max_lot=100)  # 10 points, too tight
    assert tight_sl.sl_distance_price >= 500 * spec.point


def test_round_to_lot_step_never_exceeds_bounds():
    assert round_to_lot_step(0.017, 0.01, 0.01, 10) == 0.01
    assert round_to_lot_step(123.4, 0.01, 0.01, 10) == 10
    assert round_to_lot_step(0.0, 0.01, 0.01, 10) == 0.01
