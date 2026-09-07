# VPS Trading Engine Deployment

The trading engine (`trading-engine/`) is a Python service that must run
continuously, independent of Vercel. It needs to be reachable from Vercel
(for the optional health-check/wake ping) but does **not** need to be
reachable from the public internet at large — restrict it as tightly as
you can (see "Network exposure" below).

It does **not** need to run on the same machine as your MT5 terminal. The
engine talks to MT5 only indirectly, through the bridge EA, over HTTPS.

## 1. Choose a host

Any always-on Linux host works: a small VPS (DigitalOcean, Hetzner,
Linode, ...), a container on Railway/Fly.io/Render, or your own hardware.
Minimum spec is modest — this is not a compute-heavy workload (Python,
asyncio, occasional Postgres reads/writes).

## 2. Install

```bash
git clone <your-repo> mt5-scalp-command-center
cd mt5-scalp-command-center/trading-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env`:

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your service role key - keep this on the VPS only>
ENGINE_API_KEY=<same long random value as Vercel's TRADING_ENGINE_API_KEY>
ENGINE_HOST=0.0.0.0
ENGINE_PORT=8088
POLL_INTERVAL_SECONDS=5
MARKET_DATA_PROVIDER=simulated
LOG_LEVEL=INFO
```

## 3. Run it

Directly (for testing):

```bash
python -m engine.app
```

This starts both the FastAPI control API (`/health`, `/control/refresh`)
and the main orchestration loop concurrently, via `asyncio.gather`
(`engine/app.py`).

### Option A — systemd (recommended for a bare VPS)

Create `/etc/systemd/system/mt5-trading-engine.service`:

```ini
[Unit]
Description=MT5 Scalp Command Center - trading engine
After=network.target

[Service]
Type=simple
User=trading
WorkingDirectory=/home/trading/mt5-scalp-command-center/trading-engine
EnvironmentFile=/home/trading/mt5-scalp-command-center/trading-engine/.env
ExecStart=/home/trading/mt5-scalp-command-center/trading-engine/.venv/bin/python -m engine.app
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mt5-trading-engine
sudo systemctl status mt5-trading-engine
journalctl -u mt5-trading-engine -f
```

`Restart=on-failure` matters: if the engine crashes, no trades happen until
it's back up — that's the fail-safe default working as intended, but you
still want it to come back automatically.

### Option B — Docker

A `Dockerfile` is included:

```bash
cd trading-engine
docker build -t mt5-trading-engine .
docker run -d --name mt5-trading-engine \
  --env-file .env \
  -p 8088:8088 \
  --restart unless-stopped \
  mt5-trading-engine
```

## 4. Network exposure

The control API only needs to be reachable by your Vercel deployment, for
`/health` and `/control/refresh`. Recommended:

- Put it behind a reverse proxy (Caddy/Nginx) with TLS, and restrict access
  either by firewall rule (allow only Vercel's outbound IP ranges, which
  change — so in practice this is hard to pin down) or, more simply, rely
  on the fact that every request to `/control/refresh` must present the
  `ENGINE_API_KEY` bearer token (`engine/control_api.py`) and treat that
  key as the real access control, same as any other API secret.
- The engine itself never accepts inbound trade instructions from anyone —
  it only reads `trading_state`, account, risk, and strategy rows from
  Supabase (using its own service-role credentials) and only *writes*
  signals/commands/executions back to Supabase. The `/control/refresh`
  endpoint is a "please re-check now" nudge, not a way to inject a trade.
- If Vercel can't reach the engine at all, nothing breaks: Start/Stop still
  update `trading_state` in Supabase (the source of truth), and the engine
  picks the change up on its own poll cycle (`POLL_INTERVAL_SECONDS`,
  default 5s) shortly after. The health ping only affects the preflight
  check's "trading_engine" line on the Start Auto Trading modal.

## 5. Point Vercel at it

Set, in Vercel's environment variables:

```
TRADING_ENGINE_URL=https://your-engine-host-or-proxy
TRADING_ENGINE_API_KEY=<same value as ENGINE_API_KEY>
```

## 6. Market data

By default `MARKET_DATA_PROVIDER=simulated` uses
`engine/market_data/provider.py`'s `SimulatedMarketDataProvider` — a
random-walk synthetic candle generator. This is intentional: it lets you
run the entire pipeline (structure → liquidity → scoring → risk → paper
fill → dashboard update) with zero external dependencies, safely, before
connecting anything real. See `docs/PAPER_TRADING.md`.

To use real market data, implement your own provider (subclass the
`MarketDataProvider` ABC) — for example, pulling candles the MT5 EA itself
reports, or from a market data vendor — and wire it in via
`MARKET_DATA_PROVIDER` / `engine/config.py`. This is a deliberate extension
point, not an oversight: real market data integration depends heavily on
which broker/feed you use, so it isn't hard-coded here.

## 7. Updating

```bash
git pull
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart mt5-trading-engine   # or: docker restart mt5-trading-engine
```

Because all trading state lives in Supabase, restarting the engine is safe
at any time — it re-reads current state on startup rather than keeping
anything important only in memory. In-flight `PENDING`/`SENT` commands are
still tracked by the database and their expiry, so a brief restart does not
strand a command in an ambiguous state.
