from __future__ import annotations

from datetime import datetime, timezone

from engine.market_data.provider import SimulatedMarketDataProvider
from engine.strategy_engine.entry import CandidateSignal, RejectedCandidate, StrategyConfig, evaluate_symbol


def test_evaluate_symbol_never_crashes_on_simulated_data():
    """Smoke test for the full pipeline glue (structure + liquidity + OB +
    FVG + indicators + filters + scoring + SL/TP) - regardless of whether a
    candidate signal is produced, it must never raise and must always
    return one of the two well-defined result types."""
    provider = SimulatedMarketDataProvider()
    config = StrategyConfig()

    for symbol in ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]:
        result = evaluate_symbol(symbol, provider, config, now=datetime.now(timezone.utc))
        assert isinstance(result, (CandidateSignal, RejectedCandidate))


def test_candidate_signal_always_has_valid_stop_loss_and_positive_rr():
    provider = SimulatedMarketDataProvider()
    # Lower the bar so we're more likely to exercise the CandidateSignal path
    # in this smoke test (real thresholds are far more selective by design).
    config = StrategyConfig(min_signal_score=0, min_atr_percentile=0, max_atr_percentile=100)

    found_candidate = False
    for symbol in ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "EURJPY", "GBPJPY"]:
        result = evaluate_symbol(symbol, provider, config, now=datetime.now(timezone.utc))
        if isinstance(result, CandidateSignal):
            found_candidate = True
            assert result.stop_loss != result.entry_price
            assert result.risk_reward > 0
            assert 0 <= result.score <= 100

    assert found_candidate, "expected at least one candidate across several symbols with min_signal_score=0"


def test_rejected_candidate_always_has_a_reason():
    provider = SimulatedMarketDataProvider()
    # Impossible threshold guarantees rejection so we can assert on the
    # rejection payload's shape.
    config = StrategyConfig(min_signal_score=101)
    result = evaluate_symbol("EURUSD", provider, config, now=datetime.now(timezone.utc))
    assert isinstance(result, RejectedCandidate)
    assert result.reason
