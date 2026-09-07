"""
0-100 signal quality scoring (spec section 14). A high score is necessary
but never sufficient - the risk engine still has to approve every trade
(spec section 14/23) before any command is created.
"""
from __future__ import annotations

from dataclasses import dataclass, field

DEFAULT_WEIGHTS: dict[str, float] = {
    "marketStructure": 20,
    "liquiditySweep": 15,
    "bosChoch": 15,
    "orderBlock": 15,
    "fvg": 10,
    "ema": 10,
    "rsi": 5,
    "atr": 5,
    "candleConfirmation": 5,
}


@dataclass(frozen=True)
class ScoreInputs:
    """Each field is a confluence check already resolved to True/False by
    the caller (engine/strategy_engine/entry.py) - this module only does the
    weighting/aggregation arithmetic, which keeps it trivially testable."""

    market_structure_aligned: bool
    liquidity_sweep_present: bool
    bos_or_choch_aligned: bool
    order_block_confluence: bool
    fvg_confluence: bool
    ema_aligned: bool
    rsi_supportive: bool
    atr_healthy: bool
    candle_confirmation: bool


@dataclass(frozen=True)
class ScoreResult:
    total: float
    breakdown: dict[str, float]
    passed_min_score: bool
    min_score_required: float


def compute_signal_score(inputs: ScoreInputs, weights: dict[str, float] | None = None, min_score_required: float = 80) -> ScoreResult:
    w = weights or DEFAULT_WEIGHTS
    total_weight = sum(w.values())
    if abs(total_weight - 100) > 0.01:
        raise ValueError(f"Score weights must sum to 100, got {total_weight}")

    checks = {
        "marketStructure": inputs.market_structure_aligned,
        "liquiditySweep": inputs.liquidity_sweep_present,
        "bosChoch": inputs.bos_or_choch_aligned,
        "orderBlock": inputs.order_block_confluence,
        "fvg": inputs.fvg_confluence,
        "ema": inputs.ema_aligned,
        "rsi": inputs.rsi_supportive,
        "atr": inputs.atr_healthy,
        "candleConfirmation": inputs.candle_confirmation,
    }

    breakdown = {key: (w.get(key, 0) if passed else 0.0) for key, passed in checks.items()}
    total = sum(breakdown.values())

    return ScoreResult(
        total=total,
        breakdown=breakdown,
        passed_min_score=total >= min_score_required,
        min_score_required=min_score_required,
    )
