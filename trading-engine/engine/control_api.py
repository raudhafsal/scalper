"""
Tiny HTTP control API the Next.js backend talks to (see
lib/trading-engine-client.ts on the web side). Deliberately minimal: it does
NOT accept trade commands directly - those only ever flow through Supabase
(trading_state, trade_commands), which this engine polls independently. This
API exists purely for health-checking and an optional "wake up now" nudge.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from engine.config import settings
from engine.state import engine_state

app = FastAPI(title="MT5 Scalp Command Center - Trading Engine Control API")


def _check_auth(authorization: str | None) -> None:
    if not settings.engine_api_key:
        raise HTTPException(500, "ENGINE_API_KEY not configured on the engine")
    expected = f"Bearer {settings.engine_api_key}"
    if authorization != expected:
        raise HTTPException(401, "Unauthorized")


class RefreshRequest(BaseModel):
    userId: str


@app.get("/health")
def health(authorization: str | None = Header(default=None)):
    _check_auth(authorization)
    return {
        "status": engine_state.status(),
        "marketDataOk": engine_state.market_data_ok,
        "riskEngineOk": engine_state.risk_engine_ok,
        "lastHeartbeatAt": (engine_state.last_loop_at or datetime.now(timezone.utc)).isoformat(),
    }


@app.post("/control/refresh")
def refresh(body: RefreshRequest, authorization: str | None = Header(default=None)):
    _check_auth(authorization)
    engine_state.wake()
    return {"ok": True}
