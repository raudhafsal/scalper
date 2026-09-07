"""
Market data provider abstraction.

IMPORTANT: MT5 does not expose a server-side/VPS-friendly market data API on
its own - the MetaTrader 5 terminal itself has to be running somewhere to
source live ticks (either via the `MetaTrader5` Python package talking to a
terminal on the same Windows host, or by having the bridge EA itself stream
prices back to the engine over the same channel it already uses for
heartbeats). This module defines the interface the strategy engine consumes;
`SimulatedMarketDataProvider` is a safe, clearly-labeled synthetic feed used
for local development and PAPER mode demos so the rest of the system is
runnable out of the box. Wire up `Mt5TerminalMarketDataProvider` (a small
stub is included below) to a real feed before doing anything beyond paper
trading - see docs/VPS_TRADING_ENGINE.md.
"""
from __future__ import annotations

import math
import random
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone

from engine.market_data.candles import Candle, CandleSeries

TIMEFRAME_MINUTES = {"M1": 1, "M5": 5, "M15": 15, "H1": 60}


class MarketDataProvider(ABC):
    @abstractmethod
    def get_candles(self, symbol: str, timeframe: str, count: int) -> CandleSeries:
        """Returns the last `count` CLOSED candles, oldest first."""

    @abstractmethod
    def get_spread_points(self, symbol: str) -> float:
        """Current spread in points (not pips) for the symbol."""

    @abstractmethod
    def is_healthy(self) -> bool:
        """Whether this provider currently has usable data (fail-safe gate)."""


class SimulatedMarketDataProvider(MarketDataProvider):
    """
    Deterministic-ish synthetic random-walk feed, seeded per symbol so
    repeated calls within a process are self-consistent. NOT connected to
    any real market - safe for paper mode / local dev only. Never select
    this provider for DEMO or LIVE mode (the engine's pre-flight /health
    check reports market data as unhealthy unless a real provider is
    configured for those modes - see engine/main.py).
    """

    def __init__(self) -> None:
        self._series_cache: dict[tuple[str, str], CandleSeries] = {}

    def _base_price(self, symbol: str) -> float:
        seed = sum(ord(c) for c in symbol)
        random.seed(seed)
        return 1.0 + (seed % 100) / 50.0 if "JPY" not in symbol else 100 + seed % 50

    def get_candles(self, symbol: str, timeframe: str, count: int) -> CandleSeries:
        key = (symbol, timeframe)
        cached = self._series_cache.get(key)
        if cached and len(cached) >= count:
            return cached[-count:]

        minutes = TIMEFRAME_MINUTES.get(timeframe, 1)
        price = self._base_price(symbol)
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        series: CandleSeries = []
        rnd = random.Random(f"{symbol}:{timeframe}")

        for i in range(count, 0, -1):
            t = now - timedelta(minutes=minutes * i)
            drift = math.sin(i / 12) * price * 0.0006
            vol = price * 0.0009
            open_ = price
            close = max(0.0001, open_ + rnd.uniform(-vol, vol) + drift)
            high = max(open_, close) + rnd.uniform(0, vol * 0.6)
            low = min(open_, close) - rnd.uniform(0, vol * 0.6)
            series.append(Candle(time=t, open=open_, high=high, low=low, close=close, volume=rnd.uniform(50, 500)))
            price = close

        self._series_cache[key] = series
        return series[-count:]

    def get_spread_points(self, symbol: str) -> float:
        rnd = random.Random(symbol)
        base = 8 if "JPY" not in symbol else 12
        return base + rnd.uniform(0, 6)

    def is_healthy(self) -> bool:
        return True


class Mt5TerminalMarketDataProvider(MarketDataProvider):
    """
    Stub for a real feed. The straightforward option is to run this engine
    on (or reachable from) the same Windows VPS as an MT5 terminal and use
    the official `MetaTrader5` Python package (`pip install MetaTrader5`,
    Windows-only) to pull rates/ticks directly:

        import MetaTrader5 as mt5
        mt5.initialize()
        rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M1, 0, count)

    Implement get_candles/get_spread_points/is_healthy using that package
    (or your own broker/data-vendor API) and set MARKET_DATA_PROVIDER=custom
    plus wire this class up in engine/main.py. Left unimplemented here
    deliberately - shipping a fake "real" data path would be worse than
    clearly marking the seam.
    """

    def get_candles(self, symbol: str, timeframe: str, count: int) -> CandleSeries:
        raise NotImplementedError("Wire up a real MT5/broker market data source before using DEMO/LIVE mode.")

    def get_spread_points(self, symbol: str) -> float:
        raise NotImplementedError("Wire up a real MT5/broker market data source before using DEMO/LIVE mode.")

    def is_healthy(self) -> bool:
        return False


def get_provider(name: str) -> MarketDataProvider:
    if name == "simulated":
        return SimulatedMarketDataProvider()
    if name == "custom":
        return Mt5TerminalMarketDataProvider()
    raise ValueError(f"Unknown MARKET_DATA_PROVIDER: {name}")
