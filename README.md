# MT5 Scalp Command Center

A multi-account MetaTrader 5 auto-scalping control system: a Progressive Web
App control panel, a Supabase backend, an independently-deployed Python
trading/risk engine, and a MetaTrader 5 bridge Expert Advisor.

> **This is trading software. Trading forex/CFDs carries a substantial risk
> of loss and is not suitable for every investor. Nothing in this project,
> its UI, its documentation, or its default configuration is a guarantee of
> profit, and past or simulated performance is never a reliable indicator of
> future results. You are solely responsible for how you configure and use
> this software, for complying with your broker's terms and your local
> regulations, and for any losses incurred. Always start in PAPER mode, then
> DEMO, before ever enabling a LIVE account.**

## What this is

```
PWA (you, on your phone/laptop)
   │  HTTPS, Supabase Auth session
   ▼
Next.js app on Vercel  ──────────────►  Supabase (Postgres + Auth + Realtime)
   │  small "wake up" ping only               ▲
   ▼                                           │  reads config / writes signals,
Python trading engine on a VPS ─────────────────┘  commands, trades, stats
   │  HTTPS (poll for commands / push results)
   ▼
MT5 Bridge EA (MQL5, runs inside your MetaTrader 5 terminal)
   │  native MT5 trade API
   ▼
Your broker
```

The website **never** holds your MT5 broker password and **never** sends a
trade order directly from your browser. The browser only talks to Supabase
and to the Next.js API, which write *requests* (start trading, stop, change
risk settings, ...) to the database. A separate Python trading engine —
which you run yourself, on your own VPS — is the only thing that generates
trade signals and risk-approves them. The MT5 Expert Advisor is the only
thing that ever places an order, and only after polling the backend for a
command that the risk engine already approved for that specific account.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full data-flow
diagram and the reasoning behind this split.

## Is this "done"? What state is this repo in?

This is a **deep, working MVP**, not a shallow scaffold. Every layer has
real logic end-to-end for one full path (paper-mode scalping on simulated
market data, all the way to a dashboard update), backed by automated tests:

- The strategy engine really computes market structure (BOS/CHoCH, swing
  highs/lows), liquidity sweeps, order blocks, fair value gaps, EMA/RSI/ATR,
  and a 0–100 weighted signal score — not placeholders.
- The risk engine really evaluates daily loss, drawdown, max trades,
  cooldowns, spread, session filters, and real broker symbol specs for
  position sizing — per account, independently.
- The Supabase schema, RLS policies, and API routes are real and tested.
- The MT5 EA is a real, working MQL5 file (hand-rolled JSON, `CTrade`
  execution, heartbeats, idempotent command polling).

What it is **not**, out of the box: connected to a real broker feed (the
default market data provider is a synthetic simulator so you can run it
safely with zero setup), deployed anywhere, or populated with real
Supabase/Vercel/VPS credentials — you provision your own, following the
docs below. Live-market data integration is a documented extension point in
`trading-engine/engine/market_data/provider.py`.

## Repository layout

```
app/                    Next.js App Router (web app + API routes)
  (auth)/               /login, /forgot-password, /reset-password
  (dashboard)/          /dashboard, /accounts, /signals, /trades, /analytics,
                         /strategy, /risk, /settings, /system, /logs
  api/                  Backend API routes (accounts, trading controls,
                         strategy/risk settings, EA webhooks, analytics)
components/             React components (dashboard, accounts, strategy,
                         risk, settings, layout, ui primitives)
lib/                    Server/shared logic: auth, validation, security,
                         analytics, Supabase clients, trading-engine client
hooks/                  Client hooks (Supabase Realtime subscriptions)
types/                  Shared TypeScript types (domain + database)
public/                 PWA manifest, service worker, icons
supabase/migrations/    Full Postgres schema, RLS policies, triggers, views
trading-engine/         Independent Python trading/risk engine (FastAPI +
                         asyncio), deployed on your own VPS/container host
mt5/                    MT5_Scalp_Bridge.mq5 - the MetaTrader 5 Expert Advisor
tests/                  Vitest tests for the Next.js/TypeScript layer
trading-engine/tests/   pytest tests for the Python engine
docs/                   Setup, architecture, strategy and risk documentation
```

## Quick start (local development)

You need: Node.js 18+, Python 3.11+, a free [Supabase](https://supabase.com)
project, and (later, for real trading) a Windows VPS running MetaTrader 5.

1. **Install dependencies**

   ```bash
   npm install
   cd trading-engine && pip install -r requirements.txt --break-system-packages && cd ..
   ```

2. **Set up Supabase.** Follow [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)
   to create a project and run the migrations in `supabase/migrations/`.

3. **Configure environment variables.**

   ```bash
   cp .env.example .env.local
   cp trading-engine/.env.example trading-engine/.env
   ```

   Fill in the Supabase URL/keys in both files (see the comments inside each
   file for exactly what each value is for and why it is or isn't safe to
   expose to the browser).

4. **Run the web app.**

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`, sign up (the first account created becomes
   `ADMIN` automatically), and you'll land on the dashboard with an
   `⚪ STOPPED` status and a default PAPER-mode risk/strategy profile already
   seeded for you.

5. **Run the trading engine** (separate terminal).

   ```bash
   cd trading-engine
   python -m engine.app
   ```

   By default it uses a **simulated market data provider** — no broker
   connection required — so you can safely exercise the full pipeline
   (signal → risk decision → paper trade → dashboard update) with zero
   external dependencies. See [`docs/PAPER_TRADING.md`](docs/PAPER_TRADING.md).

6. **Add an MT5 account** (once you're ready to move beyond paper mode) and
   install the bridge EA — see [`docs/MT5_SETUP.md`](docs/MT5_SETUP.md) and
   [`docs/EA_SETUP.md`](docs/EA_SETUP.md).

## Deploying

- Web app → Vercel: [`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md)
- Trading engine → your own VPS: [`docs/VPS_TRADING_ENGINE.md`](docs/VPS_TRADING_ENGINE.md)
- MT5 terminal + EA: [`docs/MT5_SETUP.md`](docs/MT5_SETUP.md) and
  [`docs/EA_SETUP.md`](docs/EA_SETUP.md)

## Documentation index

| Doc | Covers |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Full system design, data flow, why the split exists |
| [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) | Creating the project, running migrations, RLS, Realtime |
| [`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md) | Deploying the Next.js app |
| [`docs/VPS_TRADING_ENGINE.md`](docs/VPS_TRADING_ENGINE.md) | Running the Python engine on a VPS, systemd/Docker |
| [`docs/MT5_SETUP.md`](docs/MT5_SETUP.md) | Installing MetaTrader 5, terminal settings |
| [`docs/EA_SETUP.md`](docs/EA_SETUP.md) | Installing and configuring `MT5_Scalp_Bridge.mq5` |
| [`docs/STRATEGY.md`](docs/STRATEGY.md) | The multi-confirmation scalping strategy, scoring, SL/TP |
| [`docs/RISK_MANAGEMENT.md`](docs/RISK_MANAGEMENT.md) | Every risk rule, position sizing, fail-safes |
| [`docs/PAPER_TRADING.md`](docs/PAPER_TRADING.md) | Running safely with zero broker connection |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | Common problems and fixes |

## Testing

```bash
npm run typecheck   # TypeScript, strict mode
npm run lint         # ESLint
npm test             # Vitest - 44 tests (permissions, validation, analytics,
                      # trading status, bridge tokens)

cd trading-engine
python -m pytest -q  # 104 tests (indicators, structure, liquidity, FVG,
                      # order blocks, scoring, position sizing, SL/TP, risk
                      # rules, filters, command idempotency, analytics)
```

## Security posture (short version)

- No broker password is ever stored, transmitted to, or requested by the
  web app. The EA authenticates with a per-account bridge token whose
  **hash** (HMAC-SHA256) is stored server-side; the raw token is shown
  exactly once when you add the account.
- The Supabase service-role key is used only in server-only code
  (`lib/supabase/admin.ts`, guarded by the `server-only` package) and in the
  trading engine on your VPS — never in the browser bundle.
- Row Level Security is enabled on every table; a user can only ever see
  their own accounts, signals, trades, and settings.
- The service worker explicitly never caches or replays trade commands —
  only the static app shell, for offline/installable PWA support.
- Every state-changing action (start trading, emergency stop, close all,
  risk/strategy changes) is authenticated, authorized by role, validated
  with Zod, and written to an audit log.
- Fail-safe defaults throughout: no market data → no trade; EA offline →
  no trade for that account; risk engine can't evaluate → no trade;
  emergency stop is enforced at the database level, not just in the UI.

See [`docs/RISK_MANAGEMENT.md`](docs/RISK_MANAGEMENT.md) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for full detail.

## License

No license file is included by default — this repository is delivered to
you directly rather than published; add a license of your choosing before
distributing or open-sourcing it further.
