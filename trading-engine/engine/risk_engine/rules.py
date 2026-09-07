"""
Individual risk rule checks (spec section 26). Each function is a pure,
independently-testable gate; engine/risk_engine/engine.py composes them into
one per-account approval decision. Every check defaults to REJECT on
ambiguous/missing data - fail-safe (spec section 45).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass(frozen=True)
class RuleResult:
    passed: bool
    rule: str
    reason: str | None = None


def check_daily_loss(realized_pl_today: float, starting_balance_today: float, max_daily_loss_pct: float) -> RuleResult:
    if starting_balance_today <= 0:
        return RuleResult(False, "max_daily_loss", "Unknown starting balance - failing safe")
    loss_pct = max(0.0, -realized_pl_today) / starting_balance_today * 100
    if loss_pct >= max_daily_loss_pct:
        return RuleResult(False, "max_daily_loss", f"Daily loss {loss_pct:.2f}% >= limit {max_daily_loss_pct}%")
    return RuleResult(True, "max_daily_loss")


def check_drawdown(equity: float, peak_equity: float, max_drawdown_pct: float) -> RuleResult:
    if peak_equity <= 0:
        return RuleResult(False, "max_drawdown", "Unknown peak equity - failing safe")
    dd_pct = max(0.0, (peak_equity - equity) / peak_equity) * 100
    if dd_pct >= max_drawdown_pct:
        return RuleResult(False, "max_drawdown", f"Drawdown {dd_pct:.2f}% >= limit {max_drawdown_pct}%")
    return RuleResult(True, "max_drawdown")


def check_max_simultaneous_trades(open_trades: int, max_simultaneous: int) -> RuleResult:
    if open_trades >= max_simultaneous:
        return RuleResult(False, "max_simultaneous_trades", f"{open_trades} open >= limit {max_simultaneous}")
    return RuleResult(True, "max_simultaneous_trades")


def check_max_trades_per_symbol(open_trades_for_symbol: int, max_per_symbol: int) -> RuleResult:
    if open_trades_for_symbol >= max_per_symbol:
        return RuleResult(False, "max_trades_per_symbol", f"{open_trades_for_symbol} open for symbol >= limit {max_per_symbol}")
    return RuleResult(True, "max_trades_per_symbol")


def check_max_trades_per_day(trades_today: int, max_per_day: int) -> RuleResult:
    if trades_today >= max_per_day:
        return RuleResult(False, "max_trades_per_day", f"{trades_today} trades today >= limit {max_per_day}")
    return RuleResult(True, "max_trades_per_day")


def check_max_trades_per_hour(trades_last_hour: int, max_per_hour: int) -> RuleResult:
    if trades_last_hour >= max_per_hour:
        return RuleResult(False, "max_trades_per_hour", f"{trades_last_hour} trades in last hour >= limit {max_per_hour}")
    return RuleResult(True, "max_trades_per_hour")


def check_consecutive_losses(current_consecutive_losses: int, max_consecutive_losses: int) -> RuleResult:
    if current_consecutive_losses >= max_consecutive_losses:
        return RuleResult(
            False, "max_consecutive_losses", f"{current_consecutive_losses} consecutive losses >= limit {max_consecutive_losses}"
        )
    return RuleResult(True, "max_consecutive_losses")


def check_cooldown(
    now: datetime,
    last_trade_closed_at: datetime | None,
    last_trade_was_loss: bool,
    cooldown_after_trade_minutes: int,
    cooldown_after_loss_minutes: int,
) -> RuleResult:
    if last_trade_closed_at is None:
        return RuleResult(True, "cooldown")

    required_minutes = cooldown_after_loss_minutes if last_trade_was_loss else cooldown_after_trade_minutes
    elapsed = now - last_trade_closed_at
    if elapsed < timedelta(minutes=required_minutes):
        remaining = timedelta(minutes=required_minutes) - elapsed
        return RuleResult(False, "cooldown", f"Cooldown active for {remaining.seconds // 60}m more")
    return RuleResult(True, "cooldown")


def check_spread(current_spread_points: float, max_spread_points: float) -> RuleResult:
    if current_spread_points > max_spread_points:
        return RuleResult(False, "max_spread", f"Spread {current_spread_points:.1f} > limit {max_spread_points}")
    return RuleResult(True, "max_spread")


def check_lot(lot_size: float, max_lot: float) -> RuleResult:
    if lot_size <= 0:
        return RuleResult(False, "max_lot", "Computed lot size is zero or invalid")
    if lot_size > max_lot:
        return RuleResult(False, "max_lot", f"Lot {lot_size} > limit {max_lot}")
    return RuleResult(True, "max_lot")


def check_min_equity(equity: float, min_equity: float) -> RuleResult:
    if equity < min_equity:
        return RuleResult(False, "min_equity", f"Equity {equity} < minimum {min_equity}")
    return RuleResult(True, "min_equity")


def check_daily_profit_lock(realized_pl_today: float, starting_balance_today: float, daily_profit_lock_pct: float | None) -> RuleResult:
    """Optional: once today's profit reaches the configured lock-in
    threshold, stop opening new trades for the rest of the day to protect
    gains (spec section 26)."""
    if daily_profit_lock_pct is None or starting_balance_today <= 0:
        return RuleResult(True, "daily_profit_lock")
    profit_pct = max(0.0, realized_pl_today) / starting_balance_today * 100
    if profit_pct >= daily_profit_lock_pct:
        return RuleResult(False, "daily_profit_lock", f"Daily profit {profit_pct:.2f}% reached lock threshold {daily_profit_lock_pct}%")
    return RuleResult(True, "daily_profit_lock")


def check_account_status(trading_enabled: bool, connection_status: str) -> RuleResult:
    if not trading_enabled:
        return RuleResult(False, "account_status", "Trading disabled for this account")
    if connection_status not in ("CONNECTED",):
        return RuleResult(False, "account_status", f"Account not connected (status={connection_status})")
    return RuleResult(True, "account_status")


def check_symbol_allowed(symbol: str, allowed_symbols: list[str]) -> RuleResult:
    if allowed_symbols and symbol not in allowed_symbols:
        return RuleResult(False, "symbol_allowed", f"{symbol} not in this account's allowed symbol list")
    return RuleResult(True, "symbol_allowed")


def check_global_trading_state(status: str) -> RuleResult:
    if status == "EMERGENCY_STOPPED":
        return RuleResult(False, "global_trading_state", "Global emergency stop is active")
    if status in ("STOPPED", "STOP_NEW_TRADES"):
        return RuleResult(False, "global_trading_state", f"Global trading state is {status}")
    return RuleResult(True, "global_trading_state")
