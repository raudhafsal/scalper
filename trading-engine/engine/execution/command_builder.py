"""Builds trade_command rows with idempotency + expiry (spec section 11).
The (account_id, nonce) uniqueness is ultimately enforced by the database
migration (see supabase/migrations/...signals_commands.sql) - this module is
what generates a stable nonce so that re-processing the same signal never
produces two commands."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


@dataclass(frozen=True)
class TradeCommandDraft:
    account_id: str
    signal_id: str | None
    action: str  # BUY | SELL | CLOSE | MODIFY_SL | MODIFY_TP | STOP_TRADING
    symbol: str
    volume: float | None
    stop_loss: float | None
    take_profit: float | None
    nonce: str
    run_mode: str
    expires_at: str  # ISO 8601


def build_entry_command_nonce(account_id: str, signal_id: str, action: str) -> str:
    """
    Deterministic nonce derived from (account_id, signal_id, action) - if the
    engine's poll loop somehow evaluates the same signal for the same
    account twice (e.g. after a restart before the signal's status was
    updated), the resulting nonce is identical both times and the database's
    unique(account_id, nonce) constraint silently no-ops the second insert
    instead of creating a duplicate order.
    """
    raw = f"{account_id}:{signal_id}:{action}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def build_entry_command(
    account_id: str,
    signal_id: str,
    action: str,
    symbol: str,
    volume: float,
    stop_loss: float,
    take_profit: float,
    run_mode: str,
    expiry_seconds: int = 60,
    now: datetime | None = None,
) -> TradeCommandDraft:
    now = now or datetime.now(timezone.utc)
    return TradeCommandDraft(
        account_id=account_id,
        signal_id=signal_id,
        action=action,
        symbol=symbol,
        volume=volume,
        stop_loss=stop_loss,
        take_profit=take_profit,
        nonce=build_entry_command_nonce(account_id, signal_id, action),
        run_mode=run_mode,
        expires_at=(now + timedelta(seconds=expiry_seconds)).isoformat(),
    )
