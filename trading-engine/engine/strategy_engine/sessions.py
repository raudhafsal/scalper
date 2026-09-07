"""Trading session detection, stored/computed in UTC (spec section 22).
Mirrors lib/analytics.ts:sessionForTimestamp on the web side - keep both in
sync if you change these boundaries."""
from __future__ import annotations

from datetime import datetime
from enum import Enum


class TradingSession(str, Enum):
    ASIAN = "ASIAN"
    LONDON = "LONDON"
    NEW_YORK = "NEW_YORK"
    LONDON_NY_OVERLAP = "LONDON_NY_OVERLAP"
    OFF_SESSION = "OFF_SESSION"


SESSION_KEY = {
    TradingSession.ASIAN: "asian",
    TradingSession.LONDON: "london",
    TradingSession.NEW_YORK: "newyork",
    TradingSession.LONDON_NY_OVERLAP: "overlap",
}


def session_for(ts: datetime) -> TradingSession:
    hour = ts.hour
    in_asian = 0 <= hour < 9
    in_london = 7 <= hour < 16
    in_new_york = 12 <= hour < 21
    in_overlap = 12 <= hour < 16

    if in_overlap:
        return TradingSession.LONDON_NY_OVERLAP
    if in_london:
        return TradingSession.LONDON
    if in_new_york:
        return TradingSession.NEW_YORK
    if in_asian:
        return TradingSession.ASIAN
    return TradingSession.OFF_SESSION


def is_session_allowed(ts: datetime, session_filters: dict[str, bool]) -> bool:
    session = session_for(ts)
    if session == TradingSession.OFF_SESSION:
        return False
    key = SESSION_KEY[session]
    return bool(session_filters.get(key, True))
