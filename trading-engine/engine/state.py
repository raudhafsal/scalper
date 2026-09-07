"""Shared in-process runtime state between the control API (engine/control_api.py)
and the orchestration loop (engine/main.py) - they run as two asyncio tasks
inside the same process (see engine/app.py)."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class EngineState:
    market_data_ok: bool = True
    risk_engine_ok: bool = True
    last_loop_at: datetime | None = None
    last_error: str | None = None
    wake_event: asyncio.Event = field(default_factory=asyncio.Event)

    def status(self) -> str:
        if not self.market_data_ok or not self.risk_engine_ok:
            return "UNHEALTHY"
        if self.last_loop_at is None:
            return "DEGRADED"
        stale_seconds = (datetime.now(timezone.utc) - self.last_loop_at).total_seconds()
        return "DEGRADED" if stale_seconds > 60 else "HEALTHY"

    def wake(self) -> None:
        self.wake_event.set()


engine_state = EngineState()
