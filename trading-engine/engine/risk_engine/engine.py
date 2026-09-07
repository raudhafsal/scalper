"""
Per-account risk evaluation (spec sections 26-28). Every account is
evaluated independently against its OWN risk profile - the same signal can
be APPROVED for one account and REJECTED for another (spec section 27).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from engine.risk_engine import rules
from engine.risk_engine.position_sizing import PositionSizeResult, compute_position_size
from engine.risk_engine.symbol_spec import SymbolSpec


@dataclass(frozen=True)
class RiskProfile:
    risk_per_trade_pct: float
    max_daily_loss_pct: float
    max_drawdown_pct: float
    max_simultaneous_trades: int
    max_trades_per_symbol: int
    max_trades_per_day: int
    max_trades_per_hour: int
    max_consecutive_losses: int
    cooldown_after_loss_minutes: int
    cooldown_after_trade_minutes: int
    max_spread_points: float
    max_lot: float
    min_equity: float
    daily_profit_lock_pct: float | None = None


@dataclass(frozen=True)
class AccountRiskContext:
    account_id: str
    trading_enabled: bool
    connection_status: str
    global_trading_status: str
    equity: float
    balance: float
    peak_equity: float
    starting_balance_today: float
    realized_pl_today: float
    open_trades_total: int
    open_trades_for_symbol: int
    trades_today: int
    trades_last_hour: int
    consecutive_losses: int
    last_trade_closed_at: datetime | None
    last_trade_was_loss: bool
    allowed_symbols: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class RiskDecision:
    account_id: str
    approved: bool
    position_size: PositionSizeResult | None
    failed_rules: list[rules.RuleResult]
    all_results: list[rules.RuleResult]


def evaluate_account(
    ctx: AccountRiskContext,
    profile: RiskProfile,
    symbol: str,
    entry_price: float,
    stop_loss_price: float,
    spread_points: float,
    symbol_spec: SymbolSpec | None,
    now: datetime,
) -> RiskDecision:
    results: list[rules.RuleResult] = [
        rules.check_global_trading_state(ctx.global_trading_status),
        rules.check_account_status(ctx.trading_enabled, ctx.connection_status),
        rules.check_symbol_allowed(symbol, ctx.allowed_symbols),
        rules.check_min_equity(ctx.equity, profile.min_equity),
        rules.check_daily_loss(ctx.realized_pl_today, ctx.starting_balance_today, profile.max_daily_loss_pct),
        rules.check_drawdown(ctx.equity, ctx.peak_equity, profile.max_drawdown_pct),
        rules.check_daily_profit_lock(ctx.realized_pl_today, ctx.starting_balance_today, profile.daily_profit_lock_pct),
        rules.check_max_simultaneous_trades(ctx.open_trades_total, profile.max_simultaneous_trades),
        rules.check_max_trades_per_symbol(ctx.open_trades_for_symbol, profile.max_trades_per_symbol),
        rules.check_max_trades_per_day(ctx.trades_today, profile.max_trades_per_day),
        rules.check_max_trades_per_hour(ctx.trades_last_hour, profile.max_trades_per_hour),
        rules.check_consecutive_losses(ctx.consecutive_losses, profile.max_consecutive_losses),
        rules.check_cooldown(
            now, ctx.last_trade_closed_at, ctx.last_trade_was_loss, profile.cooldown_after_trade_minutes, profile.cooldown_after_loss_minutes
        ),
        rules.check_spread(spread_points, profile.max_spread_points),
    ]

    # Fail-safe: no real symbol spec yet (e.g. EA hasn't sent one) -> cannot
    # size a position responsibly, so reject rather than guess.
    if symbol_spec is None:
        results.append(rules.RuleResult(False, "symbol_spec", "No symbol specification reported by EA yet"))
        return RiskDecision(ctx.account_id, False, None, [r for r in results if not r.passed], results)

    position_size = compute_position_size(
        account_equity=ctx.equity,
        risk_per_trade_pct=profile.risk_per_trade_pct,
        entry_price=entry_price,
        stop_loss_price=stop_loss_price,
        spec=symbol_spec,
        account_max_lot=profile.max_lot,
    )
    results.append(rules.check_lot(position_size.lot_size, profile.max_lot))

    failed = [r for r in results if not r.passed]
    approved = len(failed) == 0

    return RiskDecision(ctx.account_id, approved, position_size, failed, results)
