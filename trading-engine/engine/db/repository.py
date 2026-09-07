"""
Data access layer between the engine's orchestration loop (engine/main.py)
and Supabase. Kept deliberately thin and function-based (no ORM) so it's
easy to see exactly what queries the engine runs against a production
database.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import Client

ACTIVE_STATUSES = ("ACTIVE", "STOP_NEW_TRADES")


def fetch_active_trading_states(db: Client) -> list[dict[str, Any]]:
    res = db.table("trading_state").select("*").in_("status", ACTIVE_STATUSES).execute()
    return res.data or []


def fetch_accounts_for_user(db: Client, user_id: str) -> list[dict[str, Any]]:
    res = (
        db.table("mt5_accounts")
        .select("*, mt5_account_settings(*), ea_connections(*)")
        .eq("user_id", user_id)
        .execute()
    )
    return res.data or []


def fetch_default_strategy(db: Client, user_id: str) -> dict[str, Any] | None:
    res = (
        db.table("strategies")
        .select("*, strategy_settings(*)")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def fetch_risk_profile(db: Client, user_id: str, risk_settings_id: str | None) -> dict[str, Any] | None:
    query = db.table("risk_settings").select("*").eq("user_id", user_id)
    if risk_settings_id:
        query = query.eq("id", risk_settings_id)
    else:
        query = query.eq("is_default", True)
    res = query.limit(1).execute()
    return res.data[0] if res.data else None


def fetch_open_positions(db: Client, account_id: str) -> list[dict[str, Any]]:
    res = db.table("positions").select("*").eq("account_id", account_id).eq("status", "OPEN").execute()
    return res.data or []


def fetch_trades_today_count(db: Client, account_id: str) -> int:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    res = db.table("closed_trades").select("id", count="exact").eq("account_id", account_id).gte("close_time", start).execute()
    return res.count or 0


def fetch_trades_last_hour_count(db: Client, account_id: str) -> int:
    start = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    res = db.table("closed_trades").select("id", count="exact").eq("account_id", account_id).gte("close_time", start).execute()
    return res.count or 0


def fetch_recent_closed_trades(db: Client, account_id: str, limit: int = 20) -> list[dict[str, Any]]:
    res = (
        db.table("closed_trades")
        .select("*")
        .eq("account_id", account_id)
        .order("close_time", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def fetch_daily_stat(db: Client, account_id: str) -> dict[str, Any] | None:
    today = datetime.now(timezone.utc).date().isoformat()
    res = db.table("daily_statistics").select("*").eq("account_id", account_id).eq("date", today).limit(1).execute()
    return res.data[0] if res.data else None


def insert_signal(db: Client, row: dict[str, Any]) -> dict[str, Any]:
    res = db.table("signals").insert(row).execute()
    return res.data[0]


def update_signal_status(db: Client, signal_id: str, status: str, rejection_reason: str | None = None) -> None:
    db.table("signals").update({"status": status, "rejection_reason": rejection_reason}).eq("id", signal_id).execute()


def insert_trade_command(db: Client, row: dict[str, Any]) -> dict[str, Any] | None:
    # upsert on (account_id, nonce) so a re-processed signal is a no-op, not
    # a duplicate order (spec section 11).
    res = db.table("trade_commands").upsert(row, on_conflict="account_id,nonce", ignore_duplicates=True).execute()
    return res.data[0] if res.data else None


def touch_engine_heartbeat(db: Client, user_id: str) -> None:
    db.table("trading_state").update({"last_engine_heartbeat_at": datetime.now(timezone.utc).isoformat()}).eq("user_id", user_id).execute()


def write_system_event(db: Client, component: str, event_type: str, message: str, severity: str = "INFO", metadata: dict | None = None, account_id: str | None = None) -> None:
    db.table("system_events").insert(
        {
            "component": component,
            "event_type": event_type,
            "severity": severity,
            "message": message,
            "metadata": metadata or {},
            "account_id": account_id,
        }
    ).execute()


def fetch_symbol_spec(account: dict[str, Any], symbol: str) -> dict[str, Any] | None:
    ea = account.get("ea_connections")
    if isinstance(ea, list):
        ea = ea[0] if ea else None
    if not ea:
        return None
    specs = ea.get("symbol_specs") or {}
    return specs.get(symbol)
