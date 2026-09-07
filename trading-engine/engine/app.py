"""
Process entrypoint: runs the control API (FastAPI/uvicorn) and the
orchestration loop (engine.main.run_forever) concurrently in one asyncio
event loop. Start with:  python -m engine.app
See docs/VPS_TRADING_ENGINE.md for systemd/Docker deployment.
"""
from __future__ import annotations

import asyncio
import logging

import uvicorn

from engine.config import settings
from engine.control_api import app as control_app
from engine.main import run_forever

log = logging.getLogger("trading-engine")


async def main() -> None:
    config = uvicorn.Config(control_app, host=settings.engine_host, port=settings.engine_port, log_level=settings.log_level.lower())
    server = uvicorn.Server(config)

    await asyncio.gather(server.serve(), run_forever())


if __name__ == "__main__":
    asyncio.run(main())
