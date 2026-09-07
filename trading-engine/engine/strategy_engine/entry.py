"""
Entry logic: combines market structure, liquidity, order blocks, FVG, and
indicator confluence into a candidate signal (spec section 23). This module
produces a *candidate* only - it still has to clear the signal score
threshold and, separately, full risk engine approval before it can become a
trade command (see engine/risk_engine/engine.py and engine/main.py).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from engine.market_data.candles import CandleSeries
from engine.market_data.provider import MarketDataProvider
from engine.strategy_engine import fvg as fvg_mod
from engine.strategy_engine import liquidity as liq_mod
from engine.strategy_engine import order_blocks as ob_mod
from engine.strategy_engine.filters import check_session, check_spread, check_volatility
from engine.strategy_engine.indicators import atr_series, ema_series, rsi_series
from engine.strategy_engine.scoring import ScoreInputs, compute_signal_score
from engine.strategy_engine.sl_tp import compute_stop_loss, compute_take_profit
from engine.strategy_engine.structure import StructureBias, analyze_structure


@dataclass(frozen=True)
class StrategyConfig:
    primary_timeframe: str = "M1"
    confirmation_timeframe: str = "M5"
    min_signal_score: int = 80
    score_weights: dict[str, float] | None = None
    structure_lookback: int = 5
    liquidity_lookback: int = 50
    ema_fast: int = 9
    ema_mid: int = 21
    ema_slow: int = 50
    ema_trend: int = 200
    rsi_period: int = 14
    atr_period: int = 14
    max_spread_points: dict[str, float] | None = None
    min_atr_percentile: float = 20
    max_atr_percentile: float = 95
    session_filters: dict[str, bool] | None = None
    sl_method: str = "ATR"
    atr_sl_multiplier: float = 1.5
    tp_mode: str = "RR_1_2"
    custom_rr: float | None = None


@dataclass(frozen=True)
class CandidateSignal:
    symbol: str
    direction: str  # "BUY" | "SELL"
    timeframe: str
    entry_price: float
    stop_loss: float
    take_profit: float
    risk_reward: float
    score: float
    score_breakdown: dict[str, float]
    min_score_required: float
    context: dict


@dataclass(frozen=True)
class RejectedCandidate:
    symbol: str
    reason: str


def evaluate_symbol(
    symbol: str,
    provider: MarketDataProvider,
    config: StrategyConfig,
    now: datetime | None = None,
) -> CandidateSignal | RejectedCandidate:
    now = now or datetime.now(timezone.utc)

    primary = provider.get_candles(symbol, config.primary_timeframe, max(config.structure_lookback * 4, 200))
    confirmation = provider.get_candles(symbol, config.confirmation_timeframe, 100)

    if len(primary) < config.structure_lookback * 3 or len(confirmation) < 30:
        return RejectedCandidate(symbol, "Insufficient candle history")

    spread = provider.get_spread_points(symbol)
    spread_check = check_spread(spread, config.max_spread_points or {"default": 25}, symbol)
    if not spread_check.passed:
        return RejectedCandidate(symbol, spread_check.reason or "Spread filter failed")

    session_check = check_session(now, config.session_filters or {"asian": True, "london": True, "newyork": True, "overlap": True})
    if not session_check.passed:
        return RejectedCandidate(symbol, session_check.reason or "Session filter failed")

    atr_p = atr_series(primary, config.atr_period)
    current_atr = atr_p[-1]
    vol_check = check_volatility(current_atr, atr_p[-100:], config.min_atr_percentile, config.max_atr_percentile)
    if not vol_check.passed:
        return RejectedCandidate(symbol, vol_check.reason or "Volatility filter failed")

    structure_primary = analyze_structure(primary, config.structure_lookback)
    structure_confirm = analyze_structure(confirmation, config.structure_lookback)

    bias = structure_primary.bias
    if bias == StructureBias.NEUTRAL:
        return RejectedCandidate(symbol, "No confirmed market structure bias yet")

    # Higher-timeframe confirmation must agree (or be neutral) - spec section 13.
    if structure_confirm.bias != StructureBias.NEUTRAL and structure_confirm.bias != bias:
        return RejectedCandidate(symbol, "Higher-timeframe structure disagrees with primary bias")

    direction = "BUY" if bias == StructureBias.BULLISH else "SELL"

    equal_highs = liq_mod.find_equal_highs(primary[-config.liquidity_lookback :], tolerance_points=3, point=_infer_point(symbol))
    equal_lows = liq_mod.find_equal_lows(primary[-config.liquidity_lookback :], tolerance_points=3, point=_infer_point(symbol))
    pdh, pdl = liq_mod.previous_day_levels(primary)
    levels = equal_highs + equal_lows + [lvl for lvl in (pdh, pdl) if lvl]

    sweep = liq_mod.detect_sweep(primary[-config.liquidity_lookback :], levels)
    sweep_ok = sweep is not None and liq_mod.sweep_agrees_with_bias(sweep, bias)

    obs = ob_mod.mark_filled(ob_mod.find_order_blocks(primary, config.primary_timeframe), primary)
    active_obs = [o for o in obs if not o.filled]
    matching_ob = next(
        (o for o in reversed(active_obs) if (direction == "BUY") == (o.direction.value == "BULLISH")),
        None,
    )

    gaps = fvg_mod.mark_filled(fvg_mod.find_fvgs(primary, config.primary_timeframe), primary)
    active_gaps = [g for g in gaps if not g.filled]
    matching_gap = next(
        (g for g in reversed(active_gaps) if (direction == "BUY") == (g.direction.value == "BULLISH")),
        None,
    )

    ema_fast = ema_series(primary, config.ema_fast)[-1]
    ema_mid = ema_series(primary, config.ema_mid)[-1]
    ema_trend = ema_series(primary, config.ema_trend)[-1]
    ema_aligned = (ema_fast > ema_mid > ema_trend) if direction == "BUY" else (ema_fast < ema_mid < ema_trend)

    rsi_val = rsi_series(primary, config.rsi_period)[-1]
    # Momentum confluence, not a standalone trigger: for a BUY we want RSI
    # showing upward momentum without already being extremely overbought;
    # mirror image for SELL (spec section 19).
    rsi_supportive = 45 < rsi_val < 80 if direction == "BUY" else 20 < rsi_val < 55

    last_candle = primary[-1]
    candle_confirmation = last_candle.is_bullish() if direction == "BUY" else last_candle.is_bearish()

    last_event = structure_primary.last_event
    bos_or_choch_aligned = last_event is not None and last_event.direction.value == direction_to_bias(direction)

    score_result = compute_signal_score(
        ScoreInputs(
            market_structure_aligned=bias.value == direction_to_bias(direction),
            liquidity_sweep_present=sweep_ok,
            bos_or_choch_aligned=bos_or_choch_aligned,
            order_block_confluence=matching_ob is not None,
            fvg_confluence=matching_gap is not None,
            ema_aligned=ema_aligned,
            rsi_supportive=rsi_supportive,
            atr_healthy=vol_check.passed,
            candle_confirmation=candle_confirmation,
        ),
        weights=config.score_weights,
        min_score_required=config.min_signal_score,
    )

    if not score_result.passed_min_score:
        return RejectedCandidate(symbol, f"Score {score_result.total} below minimum {config.min_signal_score}")

    entry_price = last_candle.close
    stop_loss = compute_stop_loss(
        method=config.sl_method,
        direction=direction,
        entry_price=entry_price,
        series=primary,
        atr=current_atr,
        atr_multiplier=config.atr_sl_multiplier,
        order_block=matching_ob,
    )
    if stop_loss is None:
        return RejectedCandidate(symbol, f"Could not compute a valid stop loss using method {config.sl_method}")

    sl_tp = compute_take_profit(direction, entry_price, stop_loss, config.tp_mode, config.custom_rr)

    return CandidateSignal(
        symbol=symbol,
        direction=direction,
        timeframe=config.primary_timeframe,
        entry_price=entry_price,
        stop_loss=sl_tp.stop_loss,
        take_profit=sl_tp.take_profit,
        risk_reward=sl_tp.risk_reward,
        score=score_result.total,
        score_breakdown=score_result.breakdown,
        min_score_required=config.min_signal_score,
        context={
            "bias": bias.value,
            "sweep": sweep.level.kind if sweep else None,
            "orderBlock": matching_ob is not None,
            "fvg": matching_gap is not None,
            "atr": current_atr,
            "spreadPoints": spread,
            "rsi": rsi_val,
        },
    )


def direction_to_bias(direction: str) -> str:
    return "BULLISH" if direction == "BUY" else "BEARISH"


def _infer_point(symbol: str) -> float:
    """Fallback point size when a real symbol spec hasn't been supplied yet
    (e.g. before the first EA heartbeat) - JPY pairs use 0.001, gold/indices
    vary, everything else defaults to 0.0001. Prefer the EA-reported
    SymbolSpec.point wherever one is available (see risk_engine/symbol_spec.py) -
    this is only a reasonable default for liquidity clustering tolerance,
    never used for position sizing or SL/TP.
    """
    if "JPY" in symbol:
        return 0.001
    if symbol in ("XAUUSD", "XAGUSD"):
        return 0.01
    return 0.0001
