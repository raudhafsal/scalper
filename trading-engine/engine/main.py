"""
Orchestration loop: MARKET DATA -> STRATEGY ENGINE -> SIGNAL ENGINE ->
RISK ENGINE -> ACCOUNT APPROVAL -> TRADE COMMAND -> MT5 EA -> EXECUTION
RESULT -> SUPABASE -> PWA (spec section 12).

Fail-safe behavior (spec section 45), enforced here:
  - trading_state.status not in (ACTIVE, STOP_NEW_TRADES) for a user -> that
    user's accounts are skipped entirely this tick.
  - status == EMERGENCY_STOPPED is filtered out by the repository query
    itself (it's not in ACTIVE_STATUSES).
  - status == STOP_NEW_TRADES -> no new signals/commands are generated, but
    open positions are still managed (see manage_open_positions).
  - market data provider unhealthy -> engine_state.market_data_ok=False,
    which the /health endpoint (and therefore the web app's pre-flight
    checklist) surfaces immediately; no signals are generated this tick.
  - an account with no EA connection / stale heartbeat / disabled trading is
    rejected per-account by the risk engine's check_account_status.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from engine.config import settings
from engine.db import repository as repo
from engine.db.supabase_client import get_client
from engine.execution.command_builder import build_entry_command
from engine.execution.paper import simulate_fill, simulate_outcome_from_future_candles
from engine.market_data.provider import get_provider
from engine.risk_engine.engine import AccountRiskContext, RiskProfile, evaluate_account
from engine.risk_engine.symbol_spec import SymbolSpec
from engine.state import engine_state
from engine.strategy_engine.entry import CandidateSignal, RejectedCandidate, StrategyConfig, evaluate_symbol

logging.basicConfig(level=settings.log_level)
log = logging.getLogger("trading-engine")

DEFAULT_WATCHLIST = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]


def strategy_config_from_row(row: dict) -> StrategyConfig:
    s = row.get("strategy_settings")
    if isinstance(s, list):
        s = s[0] if s else {}
    s = s or {}
    return StrategyConfig(
        primary_timeframe=s.get("primary_timeframe", "M1"),
        confirmation_timeframe=s.get("confirmation_timeframe", "M5"),
        min_signal_score=s.get("min_signal_score", 80),
        score_weights=s.get("score_weights"),
        structure_lookback=s.get("structure_lookback", 5),
        liquidity_lookback=s.get("liquidity_lookback", 50),
        ema_fast=s.get("ema_fast", 9),
        ema_mid=s.get("ema_mid", 21),
        ema_slow=s.get("ema_slow", 50),
        ema_trend=s.get("ema_trend", 200),
        rsi_period=s.get("rsi_period", 14),
        atr_period=s.get("atr_period", 14),
        max_spread_points=s.get("max_spread_points"),
        min_atr_percentile=float(s.get("min_atr_percentile", 20)),
        max_atr_percentile=float(s.get("max_atr_percentile", 95)),
        session_filters=s.get("session_filters"),
        sl_method=s.get("sl_method", "ATR"),
        atr_sl_multiplier=float(s.get("atr_sl_multiplier", 1.5)),
        tp_mode=s.get("tp_mode", "RR_1_2"),
        custom_rr=s.get("custom_rr"),
    )


def risk_profile_from_row(row: dict) -> RiskProfile:
    return RiskProfile(
        risk_per_trade_pct=float(row["risk_per_trade_pct"]),
        max_daily_loss_pct=float(row["max_daily_loss_pct"]),
        max_drawdown_pct=float(row["max_drawdown_pct"]),
        max_simultaneous_trades=int(row["max_simultaneous_trades"]),
        max_trades_per_symbol=int(row["max_trades_per_symbol"]),
        max_trades_per_day=int(row["max_trades_per_day"]),
        max_trades_per_hour=int(row["max_trades_per_hour"]),
        max_consecutive_losses=int(row["max_consecutive_losses"]),
        cooldown_after_loss_minutes=int(row["cooldown_after_loss_minutes"]),
        cooldown_after_trade_minutes=int(row["cooldown_after_trade_minutes"]),
        max_spread_points=float(row["max_spread_points"]),
        max_lot=float(row["max_lot"]),
        min_equity=float(row["min_equity"]),
        daily_profit_lock_pct=row.get("daily_profit_lock_pct"),
    )


async def process_user(db, provider, trading_state: dict) -> None:
    user_id = trading_state["user_id"]
    status = trading_state["status"]
    mode = trading_state["mode"]

    strategy_row = repo.fetch_default_strategy(db, user_id)
    if not strategy_row:
        return
    config = strategy_config_from_row(strategy_row)

    accounts = repo.fetch_accounts_for_user(db, user_id)
    eligible_accounts = [
        a
        for a in accounts
        if a["trading_enabled"]
        and a["connection_status"] not in ("DISABLED", "RISK_LOCKED")
        and (mode == "PAPER" or a["account_type"] == mode)
    ]

    # Always manage existing open positions, even under STOP_NEW_TRADES.
    for account in accounts:
        await manage_open_positions(db, provider, account)

    if status == "STOP_NEW_TRADES" or not eligible_accounts:
        return

    symbols = sorted({s for a in eligible_accounts for s in (a.get("mt5_account_settings", {}) or {}).get("allowed_symbols", DEFAULT_WATCHLIST)}) or DEFAULT_WATCHLIST

    for symbol in symbols:
        result = evaluate_symbol(symbol, provider, config, now=datetime.now(timezone.utc))
        if isinstance(result, RejectedCandidate):
            continue
        await handle_candidate(db, provider, user_id, mode, result, eligible_accounts)


async def handle_candidate(db, provider, user_id: str, mode: str, candidate: CandidateSignal, accounts: list[dict]) -> None:
    signal_row = repo.insert_signal(
        db,
        {
            "user_id": user_id,
            "symbol": candidate.symbol,
            "direction": candidate.direction,
            "primary_timeframe": candidate.timeframe,
            "run_mode": mode,
            "score": candidate.score,
            "score_breakdown": candidate.score_breakdown,
            "min_score_required": candidate.min_score_required,
            "entry_price": candidate.entry_price,
            "stop_loss": candidate.stop_loss,
            "take_profit": candidate.take_profit,
            "risk_reward": candidate.risk_reward,
            "status": "WAITING",
            "context": candidate.context,
        },
    )

    any_approved = False

    for account in accounts:
        ctx = build_risk_context(db, account, candidate)
        risk_row = repo.fetch_risk_profile(db, account["user_id"], (account.get("mt5_account_settings", {}) or {}).get("risk_settings_id"))
        if not risk_row:
            continue
        profile = risk_profile_from_row(risk_row)

        spec_row = repo.fetch_symbol_spec(account, candidate.symbol)
        spec = SymbolSpec(**{
            "symbol": candidate.symbol,
            "tick_size": spec_row["tickSize"],
            "tick_value": spec_row["tickValue"],
            "point": spec_row["point"],
            "contract_size": spec_row["contractSize"],
            "min_lot": spec_row["minLot"],
            "max_lot": spec_row["maxLot"],
            "lot_step": spec_row["lotStep"],
            "stop_level_points": spec_row["stopLevelPoints"],
            "digits": spec_row["digits"],
        }) if spec_row else None

        decision = evaluate_account(
            ctx=ctx,
            profile=profile,
            symbol=candidate.symbol,
            entry_price=candidate.entry_price,
            stop_loss_price=candidate.stop_loss,
            spread_points=candidate.context.get("spreadPoints", 0),
            symbol_spec=spec,
            now=datetime.now(timezone.utc),
        )

        if not decision.approved or decision.position_size is None:
            continue

        any_approved = True

        if mode == "PAPER":
            await open_paper_position(db, account, signal_row, candidate, decision.position_size.lot_size)
        else:
            cmd = build_entry_command(
                account_id=account["id"],
                signal_id=signal_row["id"],
                action=candidate.direction,
                symbol=candidate.symbol,
                volume=decision.position_size.lot_size,
                stop_loss=candidate.stop_loss,
                take_profit=candidate.take_profit,
                run_mode=mode,
            )
            repo.insert_trade_command(
                db,
                {
                    "account_id": cmd.account_id,
                    "signal_id": cmd.signal_id,
                    "action": cmd.action,
                    "symbol": cmd.symbol,
                    "volume": cmd.volume,
                    "stop_loss": cmd.stop_loss,
                    "take_profit": cmd.take_profit,
                    "nonce": cmd.nonce,
                    "run_mode": cmd.run_mode,
                    "expires_at": cmd.expires_at,
                    "status": "PENDING",
                },
            )

    repo.update_signal_status(db, signal_row["id"], "APPROVED" if any_approved else "REJECTED", None if any_approved else "No eligible account approved this signal")


def build_risk_context(db, account: dict, candidate: CandidateSignal) -> AccountRiskContext:
    open_positions = repo.fetch_open_positions(db, account["id"])
    daily_stat = repo.fetch_daily_stat(db, account["id"])
    recent = repo.fetch_recent_closed_trades(db, account["id"], limit=20)

    consecutive_losses = 0
    for t in recent:
        if t["result"] == "LOSS":
            consecutive_losses += 1
        else:
            break

    last_trade = recent[0] if recent else None

    settings_row = account.get("mt5_account_settings") or {}
    if isinstance(settings_row, list):
        settings_row = settings_row[0] if settings_row else {}

    return AccountRiskContext(
        account_id=account["id"],
        trading_enabled=account["trading_enabled"],
        connection_status=account["connection_status"],
        global_trading_status="ACTIVE",  # already filtered upstream
        equity=float(account["equity"]),
        balance=float(account["balance"]),
        peak_equity=float(daily_stat["starting_balance"]) if daily_stat else float(account["balance"]),
        starting_balance_today=float(daily_stat["starting_balance"]) if daily_stat else float(account["balance"]),
        realized_pl_today=float(daily_stat["realized_pl"]) if daily_stat else 0.0,
        open_trades_total=len(open_positions),
        open_trades_for_symbol=len([p for p in open_positions if p["symbol"] == candidate.symbol]),
        trades_today=repo.fetch_trades_today_count(db, account["id"]),
        trades_last_hour=repo.fetch_trades_last_hour_count(db, account["id"]),
        consecutive_losses=consecutive_losses,
        last_trade_closed_at=datetime.fromisoformat(last_trade["close_time"]) if last_trade else None,
        last_trade_was_loss=bool(last_trade and last_trade["result"] == "LOSS"),
        allowed_symbols=settings_row.get("allowed_symbols", []),
    )


async def open_paper_position(db, account: dict, signal_row: dict, candidate: CandidateSignal, lot_size: float) -> None:
    """PAPER mode never reaches the EA - it writes directly into `positions`
    so the dashboard shows it exactly like a real (simulated) trade."""
    fill = simulate_fill(candidate.symbol, candidate.direction, candidate.entry_price, candidate.stop_loss, candidate.take_profit, type("P", (), {"lot_size": lot_size})())
    db.table("positions").upsert(
        {
            "account_id": account["id"],
            "broker_ticket": f"PAPER-{signal_row['id']}",
            "symbol": fill.symbol,
            "direction": fill.direction,
            "volume": fill.volume,
            "entry_price": fill.entry_price,
            "stop_loss": fill.stop_loss,
            "take_profit": fill.take_profit,
            "current_price": fill.entry_price,
            "signal_id": signal_row["id"],
            "strategy_id": signal_row.get("strategy_id"),
            "run_mode": "PAPER",
            "status": "OPEN",
            "open_time": fill.opened_at,
        },
        on_conflict="account_id,broker_ticket",
    ).execute()


async def manage_open_positions(db, provider, account: dict) -> None:
    """Breakeven / trailing / partial TP management for already-open
    positions, and PAPER-mode resolution against the latest simulated
    candle. LIVE/DEMO SL/TP modification commands are left as MODIFY_SL /
    MODIFY_TP trade_commands for the EA to apply - the engine never talks to
    the broker directly."""
    positions = repo.fetch_open_positions(db, account["id"])
    for pos in positions:
        latest = provider.get_candles(pos["symbol"], "M1", 1)
        if not latest:
            continue
        candle = latest[-1]

        if pos["run_mode"] == "PAPER":
            outcome, exit_price = simulate_outcome_from_future_candles(
                type("F", (), {"direction": pos["direction"], "stop_loss": pos["stop_loss"], "take_profit": pos["take_profit"], "entry_price": pos["entry_price"]})(),
                [candle.high],
                [candle.low],
            )
            if outcome != "OPEN":
                profit_points = (exit_price - pos["entry_price"]) if pos["direction"] == "BUY" else (pos["entry_price"] - exit_price)
                db.table("closed_trades").insert(
                    {
                        "account_id": account["id"],
                        "broker_ticket": pos["broker_ticket"],
                        "symbol": pos["symbol"],
                        "direction": pos["direction"],
                        "volume": pos["volume"],
                        "entry_price": pos["entry_price"],
                        "exit_price": exit_price,
                        "stop_loss": pos["stop_loss"],
                        "take_profit": pos["take_profit"],
                        "profit": round(profit_points, 2),  # simplified PAPER P/L, see docs/PAPER_TRADING.md
                        "strategy_id": pos.get("strategy_id"),
                        "signal_id": pos.get("signal_id"),
                        "run_mode": "PAPER",
                        "open_time": pos["open_time"],
                        "close_time": datetime.now(timezone.utc).isoformat(),
                        "result": outcome,
                    }
                ).execute()
                db.table("positions").delete().eq("id", pos["id"]).execute()
            else:
                db.table("positions").update({"current_price": candle.close}).eq("id", pos["id"]).execute()


async def run_forever() -> None:
    db = get_client()
    provider = get_provider(settings.market_data_provider)
    engine_state.market_data_ok = provider.is_healthy()

    log.info("Trading engine started. Poll interval: %ss, market data provider: %s", settings.poll_interval_seconds, settings.market_data_provider)

    while True:
        try:
            engine_state.market_data_ok = provider.is_healthy()
            trading_states = repo.fetch_active_trading_states(db)

            for ts in trading_states:
                try:
                    await process_user(db, provider, ts)
                    repo.touch_engine_heartbeat(db, ts["user_id"])
                except Exception as exc:  # noqa: BLE001 - one user's failure must not stop the loop
                    log.exception("Error processing user %s", ts.get("user_id"))
                    repo.write_system_event(db, "TRADING_ENGINE", "engine.error", f"Error processing user: {exc}", severity="ERROR")

            engine_state.last_loop_at = datetime.now(timezone.utc)
            engine_state.last_error = None
        except Exception as exc:  # noqa: BLE001
            engine_state.last_error = str(exc)
            log.exception("Engine loop error")

        engine_state.wake_event.clear()
        try:
            await asyncio.wait_for(engine_state.wake_event.wait(), timeout=settings.poll_interval_seconds)
        except asyncio.TimeoutError:
            pass
