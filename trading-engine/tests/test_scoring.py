from __future__ import annotations

import pytest

from engine.strategy_engine.scoring import ScoreInputs, compute_signal_score


def _all_true() -> ScoreInputs:
    return ScoreInputs(
        market_structure_aligned=True,
        liquidity_sweep_present=True,
        bos_or_choch_aligned=True,
        order_block_confluence=True,
        fvg_confluence=True,
        ema_aligned=True,
        rsi_supportive=True,
        atr_healthy=True,
        candle_confirmation=True,
    )


def test_perfect_confluence_scores_100():
    result = compute_signal_score(_all_true())
    assert result.total == 100
    assert result.passed_min_score is True


def test_no_confluence_scores_zero():
    inputs = ScoreInputs(**{k: False for k in _all_true().__dict__})
    result = compute_signal_score(inputs)
    assert result.total == 0
    assert result.passed_min_score is False


def test_partial_confluence_below_threshold_rejected():
    inputs = _all_true()
    # Turn off enough high-weight items to drop below the default 80 threshold.
    inputs = ScoreInputs(
        market_structure_aligned=False,  # -20
        liquidity_sweep_present=False,  # -15
        bos_or_choch_aligned=True,
        order_block_confluence=True,
        fvg_confluence=True,
        ema_aligned=True,
        rsi_supportive=True,
        atr_healthy=True,
        candle_confirmation=True,
    )
    result = compute_signal_score(inputs, min_score_required=80)
    assert result.total == 65
    assert result.passed_min_score is False


def test_score_breakdown_matches_weights():
    result = compute_signal_score(_all_true())
    assert result.breakdown["marketStructure"] == 20
    assert result.breakdown["candleConfirmation"] == 5
    assert sum(result.breakdown.values()) == 100


def test_custom_weights_must_sum_to_100():
    bad_weights = {"marketStructure": 50, "liquiditySweep": 10}
    with pytest.raises(ValueError):
        compute_signal_score(_all_true(), weights=bad_weights)


def test_high_score_does_not_imply_a_trade_by_itself():
    """The score module has no concept of 'trade' - it only ever returns a
    number and a pass/fail against the threshold. Whether a trade actually
    happens is decided later by the risk engine (spec section 14)."""
    result = compute_signal_score(_all_true())
    assert not hasattr(result, "should_trade")
    assert not hasattr(result, "approved")
