from __future__ import annotations

from datetime import datetime, timedelta, timezone

from engine.risk_engine import rules


def test_daily_loss_blocks_when_limit_reached():
    result = rules.check_daily_loss(realized_pl_today=-350, starting_balance_today=10000, max_daily_loss_pct=3)
    assert result.passed is False


def test_daily_loss_allows_when_under_limit():
    result = rules.check_daily_loss(realized_pl_today=-100, starting_balance_today=10000, max_daily_loss_pct=3)
    assert result.passed is True


def test_daily_loss_ignores_positive_pl():
    result = rules.check_daily_loss(realized_pl_today=500, starting_balance_today=10000, max_daily_loss_pct=3)
    assert result.passed is True


def test_daily_loss_fails_safe_on_unknown_balance():
    result = rules.check_daily_loss(realized_pl_today=-10, starting_balance_today=0, max_daily_loss_pct=3)
    assert result.passed is False


def test_drawdown_blocks_when_limit_reached():
    result = rules.check_drawdown(equity=8900, peak_equity=10000, max_drawdown_pct=10)
    assert result.passed is False


def test_drawdown_allows_when_under_limit():
    result = rules.check_drawdown(equity=9600, peak_equity=10000, max_drawdown_pct=10)
    assert result.passed is True


def test_max_simultaneous_trades():
    assert rules.check_max_simultaneous_trades(3, 3).passed is False
    assert rules.check_max_simultaneous_trades(2, 3).passed is True


def test_max_trades_per_symbol():
    assert rules.check_max_trades_per_symbol(1, 1).passed is False
    assert rules.check_max_trades_per_symbol(0, 1).passed is True


def test_max_trades_per_day():
    assert rules.check_max_trades_per_day(15, 15).passed is False
    assert rules.check_max_trades_per_day(14, 15).passed is True


def test_max_trades_per_hour():
    assert rules.check_max_trades_per_hour(4, 4).passed is False
    assert rules.check_max_trades_per_hour(3, 4).passed is True


def test_max_consecutive_losses():
    assert rules.check_consecutive_losses(3, 3).passed is False
    assert rules.check_consecutive_losses(2, 3).passed is True


def test_cooldown_blocks_immediately_after_loss():
    now = datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc)
    last_closed = now - timedelta(minutes=2)
    result = rules.check_cooldown(now, last_closed, last_trade_was_loss=True, cooldown_after_trade_minutes=2, cooldown_after_loss_minutes=15)
    assert result.passed is False


def test_cooldown_allows_after_loss_cooldown_elapses():
    now = datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc)
    last_closed = now - timedelta(minutes=20)
    result = rules.check_cooldown(now, last_closed, last_trade_was_loss=True, cooldown_after_trade_minutes=2, cooldown_after_loss_minutes=15)
    assert result.passed is True


def test_cooldown_uses_shorter_window_after_a_win():
    now = datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc)
    last_closed = now - timedelta(minutes=3)
    result = rules.check_cooldown(now, last_closed, last_trade_was_loss=False, cooldown_after_trade_minutes=2, cooldown_after_loss_minutes=15)
    assert result.passed is True  # only the (shorter) after-trade cooldown applies


def test_cooldown_passes_with_no_prior_trade():
    now = datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc)
    result = rules.check_cooldown(now, None, False, 2, 15)
    assert result.passed is True


def test_spread_filter_blocks_wide_spread():
    assert rules.check_spread(30, 25).passed is False
    assert rules.check_spread(20, 25).passed is True


def test_lot_filter_rejects_zero_or_oversized():
    assert rules.check_lot(0, 5).passed is False
    assert rules.check_lot(10, 5).passed is False
    assert rules.check_lot(1, 5).passed is True


def test_min_equity_filter():
    assert rules.check_min_equity(50, 100).passed is False
    assert rules.check_min_equity(150, 100).passed is True


def test_daily_profit_lock_blocks_once_target_hit():
    result = rules.check_daily_profit_lock(realized_pl_today=600, starting_balance_today=10000, daily_profit_lock_pct=5)
    assert result.passed is False


def test_daily_profit_lock_disabled_when_none():
    result = rules.check_daily_profit_lock(realized_pl_today=600, starting_balance_today=10000, daily_profit_lock_pct=None)
    assert result.passed is True


def test_account_status_blocks_disabled_trading():
    assert rules.check_account_status(False, "CONNECTED").passed is False
    assert rules.check_account_status(True, "OFFLINE").passed is False
    assert rules.check_account_status(True, "CONNECTED").passed is True


def test_symbol_allowed_blocks_disallowed_symbol():
    result = rules.check_symbol_allowed("GBPUSD", ["EURUSD", "XAUUSD"])
    assert result.passed is False


def test_symbol_allowed_passes_when_no_restriction_configured():
    result = rules.check_symbol_allowed("GBPUSD", [])
    assert result.passed is True


def test_global_trading_state_blocks_emergency_stop():
    assert rules.check_global_trading_state("EMERGENCY_STOPPED").passed is False
    assert rules.check_global_trading_state("STOPPED").passed is False
    assert rules.check_global_trading_state("STOP_NEW_TRADES").passed is False
    assert rules.check_global_trading_state("ACTIVE").passed is True
