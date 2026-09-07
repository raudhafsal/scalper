from __future__ import annotations

from datetime import datetime, timedelta, timezone

from engine.execution.command_builder import build_entry_command, build_entry_command_nonce


def test_nonce_is_deterministic_for_same_inputs():
    n1 = build_entry_command_nonce("acct-1", "signal-1", "BUY")
    n2 = build_entry_command_nonce("acct-1", "signal-1", "BUY")
    assert n1 == n2


def test_nonce_differs_across_accounts():
    """Commands for another account must be rejected (spec section 11) -
    the nonce alone doesn't enforce this (the DB unique constraint is scoped
    per account_id too), but nonces should still differ so cross-account
    collisions are never even possible."""
    n1 = build_entry_command_nonce("acct-1", "signal-1", "BUY")
    n2 = build_entry_command_nonce("acct-2", "signal-1", "BUY")
    assert n1 != n2


def test_nonce_differs_across_signals():
    n1 = build_entry_command_nonce("acct-1", "signal-1", "BUY")
    n2 = build_entry_command_nonce("acct-1", "signal-2", "BUY")
    assert n1 != n2


def test_reprocessing_same_signal_produces_identical_command_key():
    """Simulates the engine re-evaluating the same approved signal twice
    (e.g. after a restart) - the resulting draft's nonce must be identical
    both times so the database's unique(account_id, nonce) constraint
    silently absorbs the duplicate instead of creating two trades."""
    now = datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc)
    first = build_entry_command("acct-1", "signal-1", "BUY", "EURUSD", 0.1, 1.0950, 1.1050, "DEMO", now=now)
    second = build_entry_command("acct-1", "signal-1", "BUY", "EURUSD", 0.1, 1.0950, 1.1050, "DEMO", now=now)
    assert first.nonce == second.nonce


def test_command_has_future_expiry():
    now = datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc)
    draft = build_entry_command("acct-1", "signal-1", "BUY", "EURUSD", 0.1, 1.0950, 1.1050, "DEMO", expiry_seconds=60, now=now)
    expires_at = datetime.fromisoformat(draft.expires_at)
    assert expires_at == now + timedelta(seconds=60)
    assert expires_at > now


def test_command_expiry_is_configurable():
    now = datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc)
    short = build_entry_command("acct-1", "signal-1", "BUY", "EURUSD", 0.1, 1.0950, 1.1050, "DEMO", expiry_seconds=10, now=now)
    long = build_entry_command("acct-1", "signal-1", "BUY", "EURUSD", 0.1, 1.0950, 1.1050, "DEMO", expiry_seconds=120, now=now)
    assert datetime.fromisoformat(short.expires_at) < datetime.fromisoformat(long.expires_at)
