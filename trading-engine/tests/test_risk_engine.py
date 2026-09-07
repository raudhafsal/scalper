from __future__ import annotations

from datetime import datetime, timezone

from engine.risk_engine.engine import AccountRiskContext, RiskProfile, evaluate_account
from engine.risk_engine.symbol_spec import SymbolSpec


def base_profile(**overrides) -> RiskProfile:
    defaults = dict(
        risk_per_trade_pct=0.5,
        max_daily_loss_pct=3,
        max_drawdown_pct=10,
        max_simultaneous_trades=3,
        max_trades_per_symbol=1,
        max_trades_per_day=15,
        max_trades_per_hour=4,
        max_consecutive_losses=3,
        cooldown_after_loss_minutes=15,
        cooldown_after_trade_minutes=2,
        max_spread_points=25,
        max_lot=5,
        min_equity=100,
        daily_profit_lock_pct=None,
    )
    defaults.update(overrides)
    return RiskProfile(**defaults)


def base_ctx(**overrides) -> AccountRiskContext:
    defaults = dict(
        account_id="acct-1",
        trading_enabled=True,
        connection_status="CONNECTED",
        global_trading_status="ACTIVE",
        equity=10000,
        balance=10000,
        peak_equity=10000,
        starting_balance_today=10000,
        realized_pl_today=0,
        open_trades_total=0,
        open_trades_for_symbol=0,
        trades_today=0,
        trades_last_hour=0,
        consecutive_losses=0,
        last_trade_closed_at=None,
        last_trade_was_loss=False,
        allowed_symbols=[],
    )
    defaults.update(overrides)
    return AccountRiskContext(**defaults)


def eurusd_spec() -> SymbolSpec:
    return SymbolSpec("EURUSD", 0.00001, 1.0, 0.00001, 100000, 0.01, 100, 0.01, 0, 5)


def test_healthy_account_is_approved():
    decision = evaluate_account(
        base_ctx(), base_profile(), "EURUSD", 1.1000, 1.0950, spread_points=10, symbol_spec=eurusd_spec(), now=datetime.now(timezone.utc)
    )
    assert decision.approved is True
    assert decision.position_size is not None
    assert decision.position_size.lot_size > 0


def test_emergency_stop_rejects_regardless_of_everything_else():
    decision = evaluate_account(
        base_ctx(global_trading_status="EMERGENCY_STOPPED"),
        base_profile(),
        "EURUSD",
        1.1000,
        1.0950,
        spread_points=10,
        symbol_spec=eurusd_spec(),
        now=datetime.now(timezone.utc),
    )
    assert decision.approved is False
    assert any(r.rule == "global_trading_state" for r in decision.failed_rules)


def test_missing_symbol_spec_fails_safe():
    decision = evaluate_account(
        base_ctx(), base_profile(), "EURUSD", 1.1000, 1.0950, spread_points=10, symbol_spec=None, now=datetime.now(timezone.utc)
    )
    assert decision.approved is False
    assert decision.position_size is None


def test_two_accounts_same_signal_can_diverge():
    """Spec section 27: the same signal can be APPROVED for one account and
    REJECTED for another, based on each account's own independent risk
    profile."""
    conservative_ctx = base_ctx(account_id="acct-conservative")
    conservative_profile = base_profile(risk_per_trade_pct=0.25, max_daily_loss_pct=1)

    aggressive_ctx = base_ctx(account_id="acct-aggressive", realized_pl_today=-300)  # exactly at the daily loss limit
    aggressive_profile = base_profile(risk_per_trade_pct=2, max_daily_loss_pct=3)

    now = datetime.now(timezone.utc)
    spec = eurusd_spec()

    decision_a = evaluate_account(conservative_ctx, conservative_profile, "EURUSD", 1.1000, 1.0950, 10, spec, now)
    decision_b = evaluate_account(aggressive_ctx, aggressive_profile, "EURUSD", 1.1000, 1.0950, 10, spec, now)

    assert decision_a.approved is True
    assert decision_b.approved is False  # -2.9% daily loss already, 3% limit, would be at/over


def test_account_specific_symbol_restriction_is_enforced():
    ctx = base_ctx(allowed_symbols=["XAUUSD"])
    decision = evaluate_account(ctx, base_profile(), "EURUSD", 1.1000, 1.0950, 10, eurusd_spec(), datetime.now(timezone.utc))
    assert decision.approved is False
    assert any(r.rule == "symbol_allowed" for r in decision.failed_rules)


def test_disabled_account_rejects_new_trades():
    ctx = base_ctx(trading_enabled=False)
    decision = evaluate_account(ctx, base_profile(), "EURUSD", 1.1000, 1.0950, 10, eurusd_spec(), datetime.now(timezone.utc))
    assert decision.approved is False
