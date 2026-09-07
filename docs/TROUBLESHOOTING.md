# Troubleshooting

## Web app

**"UNAUTHENTICATED" / redirected to `/login` unexpectedly**
Your Supabase session cookie expired or `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` don't match the project your migrations
were run against. Confirm both env vars point at the same Supabase project
in every environment (local `.env.local`, Vercel).

**Sign-up works but the dashboard shows no default risk/strategy settings**
The `seed_defaults_for_new_profile()` trigger
(`supabase/migrations/20260101000400_risk_settings.sql`) didn't run. Check
that all 12 migration files were applied in order — a missing earlier
migration can silently prevent a later trigger/table from existing. Re-run
`supabase db push` or replay the SQL Editor steps in
`docs/SUPABASE_SETUP.md`.

**Build fails with `useSearchParams() should be wrapped in a suspense boundary`**
Any client component that calls `useSearchParams()` at the top level of a
page must be wrapped in `<Suspense>` (see `app/(auth)/login/page.tsx` for
the pattern already used here) — this is a Next.js App Router requirement
for static export compatibility, not specific to this project.

**Build prints "Dynamic server usage" errors for `/api/...` routes**
Expected and non-fatal. Any route handler that reads `cookies()` or
`request.url` is necessarily dynamic; Next.js prints this as an internal
diagnostic during the static-optimization pass. The build only actually
fails if the final output says `Export encountered errors` — check for
that line specifically, not the dynamic-usage noise above it.

**Strategy save rejected: "weights must sum to 100"**
This is enforced deliberately (see `docs/STRATEGY.md`) — adjust the
weights in the Strategy page until the sum shown reads exactly 100 before
saving.

## Supabase / RLS

**A logged-in user can't see their own account/data**
Confirm RLS policies were applied (migration 11,
`20260101001000_rls_policies.sql`) and that the row's `user_id` actually
matches `auth.uid()` for that user. Rows inserted via the Supabase SQL
Editor as the `postgres` role bypass RLS at insert time but are still
subject to it at select time for other roles — if you manually inserted
test data, make sure `user_id` is a real `auth.users.id`.

**Dashboard doesn't update live when a trade closes**
Confirm the relevant table is in the `supabase_realtime` publication
(Database → Replication in the Supabase dashboard) — see
`docs/SUPABASE_SETUP.md` step 5. Also confirm the browser tab actually has
an open Realtime connection (browser devtools → Network → WS).

## Trading engine

**Engine won't start / import errors**
Confirm you're running Python 3.11+ and installed
`trading-engine/requirements.txt` inside an activated virtualenv (or the
Docker image, which handles this for you). `pytest.ini` sets
`pythonpath=.`, so if you run `pytest` from anywhere other than the
`trading-engine/` directory, imports can fail — always `cd trading-engine`
first.

**Engine runs but no signals are ever produced**
This is expected initially in PAPER mode with tight defaults — the
minimum score (default 80) combined with all confluence checks failing
simultaneously is a real, valid outcome, not a bug. Try lowering
`min_signal_score` temporarily in the Strategy page to confirm the
pipeline is wired correctly, then raise it back.

**`/health` unreachable from Vercel**
Confirm `TRADING_ENGINE_URL` (Vercel) and `ENGINE_HOST`/`ENGINE_PORT`
(engine `.env`) agree, that your VPS firewall/reverse proxy actually
forwards to the engine's port, and that `TRADING_ENGINE_API_KEY`
(Vercel) exactly matches `ENGINE_API_KEY` (engine). Remember: this ping
is a convenience only — Start/Stop still work via Supabase even if this
is down (see `docs/VPS_TRADING_ENGINE.md`), so this failing does not
block trading, only the "trading_engine" line in the preflight checklist.

## MT5 / EA

**Account stays `⚪ OFFLINE` / never shows `🟢 CONNECTED`**
By far the most common cause: `BackendBaseUrl` isn't allow-listed under
**Tools → Options → Expert Advisors → Allow WebRequest for listed URL**.
MT5 silently blocks the HTTP call and logs an error in the **Experts** tab
(Toolbox, Ctrl+T) — check there first. Also confirm **Algo Trading** is
enabled both globally (toolbar) and for this EA instance (Common tab), and
that `AccountId`/`BridgeToken` were copied exactly (no trailing
whitespace) from the web app.

**EA logs "unauthorized" / 401 from the backend**
The bridge token doesn't match what's stored (hashed) server-side for that
account. Either it was mistyped, or it was rotated/regenerated in the web
app after you copied the old one. Regenerate the token in the account's
settings and update the EA's `BridgeToken` input.

**EA connects but no trades are ever executed, even with a real signal**
Working as intended if: the account's mode is PAPER (paper mode never
sends a command to any EA — see `docs/PAPER_TRADING.md`), global
`trading_state.status` isn't `ACTIVE`, or the specific account has
`trading_enabled = false`. Check the **Accounts** and **Risk** pages, and
the `signals`/`trade_commands` rows for that account to see whether a
candidate was even generated and, if so, what rejection reason the risk
engine attached.

**"WebRequest error" in the Experts log with a specific error code**
This is MT5 reporting a network-level failure (DNS, TLS, timeout) talking
to `BackendBaseUrl`. Confirm the URL is reachable from the machine running
MT5 specifically (not just from your own laptop) — a Windows VPS may have
different outbound network rules than your development machine.

## General

**Something changed and I'm not sure why a trade was or wasn't taken**
Check, in order: `system_events` (engine/risk/EA-level events),
`audit_logs` (user-initiated actions like settings changes or manual
start/stop), and the specific `signals` row's associated rejection reason
if a candidate existed but didn't become a trade. The **Logs** page in the
web app surfaces both tables.

**I need to stop everything right now**
Use **EMERGENCY STOP ALL** on the dashboard (types the confirmation phrase
`EMERGENCY STOP`) — this halts new trades at both the database level and,
redundantly, via explicit per-account stop commands. If you also want
existing open positions closed, use the separate **CLOSE ALL POSITIONS**
control (phrase `CLOSE ALL POSITIONS`) — these are intentionally two
different actions (see `docs/RISK_MANAGEMENT.md`).
