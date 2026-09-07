# MT5 Terminal Setup

This covers preparing a MetaTrader 5 terminal to run the bridge EA. Do this
once per MT5 account you want to control from the Command Center.

## 1. Install MetaTrader 5

Download and install MT5 from your broker (each broker ships their own
installer/server list) or from [metatrader5.com](https://www.metatrader5.com).
The bridge EA works with any broker's MT5 terminal — it doesn't depend on
broker-specific features.

The engine and web app never need MT5 installed anywhere themselves; only
the terminal where you actually want trades placed needs it.

**Windows VPS is the common choice** because most brokers only ship a
Windows MT5 terminal (Wine/CrossOver setups exist for Linux/Mac but are
broker-dependent and outside this doc's scope).

## 2. Log in to your trading account

Open MT5 → **File → Login to Trade Account**, enter your broker-provided
login ID, password, and server. This password stays entirely inside the
MT5 terminal — it is never entered into, stored by, or transmitted to the
web app, the trading engine, or Supabase. The Command Center only ever
sees account *metadata* (login ID, broker, server name, balance/equity
figures) that the EA itself reports.

**Start with a DEMO account.** Everything in this system defaults to safe
modes; there is no reason to point the first setup at a LIVE account.

## 3. Allow automated trading

- Toolbar: click **Algo Trading** so it's enabled (green).
- **Tools → Options → Expert Advisors** tab:
  - Check **Allow Algorithmic Trading**.
  - Check **Allow WebRequest for listed URL** and add your web app's base
    URL, e.g. `https://your-app.vercel.app` (must be HTTPS, no trailing
    slash, no path). This is required — MT5 blocks all outbound HTTP(S)
    from an EA unless the exact host is allow-listed here. The EA's
    `HttpPost`/`HttpGet` calls will silently fail (and log an error) if
    this step is skipped.

## 4. Add the account in the web app first

Before touching the EA, go to **Accounts → Add MT5 Account** in the
Command Center and fill in the account's nickname, login ID, broker,
server, and type (DEMO/LIVE). Submitting this:

- Creates the `mt5_accounts` row (metadata only — no password field exists
  in this form or in the database schema).
- Generates a **bridge token** and shows it to you **exactly once**. Copy
  it now — only its HMAC-SHA256 hash is stored server-side
  (`lib/security/bridge-token.ts`), so it cannot be retrieved again later.
  If you lose it, regenerate a new one from the account's settings.
- Gives you the account's `id` (UUID), which the EA needs as `AccountId`.

## 5. Install and configure the bridge EA

See `docs/EA_SETUP.md` for the full step-by-step EA installation using the
account ID and bridge token from the previous step.

## 6. Confirm the connection

Once the EA is attached and running, within `HeartbeatSeconds` (default
10s) the account's card on the **Accounts** page should flip to
`🟢 CONNECTED`, and `ea_connections.last_heartbeat_at` should be recent.
If it doesn't, see `docs/TROUBLESHOOTING.md`.

## 7. Repeat per account

Every MT5 account you want to trade needs its own: account entry in the
web app (its own bridge token), its own chart with the EA attached (one EA
instance per account/chart — do not reuse one `AccountId`/`BridgeToken`
pair across two terminals or two charts), and, if you're running multiple
accounts on the same terminal, one chart per account each with the correct
`AccountId`/`BridgeToken` inputs.
