# Supabase Setup

Supabase provides Postgres, Auth, and Realtime for this project. You need
one project shared by the web app and the trading engine.

> **A project has already been provisioned for you** (`mt5-scalp-command-center`,
> region `ap-southeast-1`, in your Supabase organization) with all 16
> migrations below applied, RLS enabled on every table, the security/
> performance advisor findings resolved, and Realtime turned on for the
> dashboard tables. If you're using that project, skip to step 6 (Auth
> settings) and fetch its URL/anon key/service-role key from
> **Project Settings → API** in the Supabase dashboard to fill in your
> `.env.local` / `trading-engine/.env`. The rest of this document is here so
> you can reproduce the same setup on a different project (a second
> environment, your own account, etc).

## 1. Create a project

1. Go to [supabase.com](https://supabase.com) and create a new project
   (any region close to your Vercel/VPS deployment is fine).
2. Wait for provisioning to finish, then open **Project Settings → API**.
   You'll need three values later:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (web app, server-only)
     and `trading-engine`'s `SUPABASE_SERVICE_ROLE_KEY`

   The service-role key bypasses Row Level Security. Never put it in a
   `NEXT_PUBLIC_*` variable, never commit it, and never send it to the
   browser. It belongs in two places only: Vercel's server-side environment
   variables, and your VPS's `trading-engine/.env`.

## 2. Run the migrations

The full schema lives in `supabase/migrations/`, as 16 plain SQL files
applied in filename order (they're timestamp-prefixed, so any tool that
runs them alphabetically runs them in the right order). The last three
(security hardening, RLS performance + FK indexes, enable Realtime) were
added after applying the first 13 to a live project and running Supabase's
own security/performance advisors against it — see their file headers for
exactly what each one fixes and why.

### Option A — Supabase CLI (recommended)

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

`supabase db push` applies every migration in `supabase/migrations/` that
hasn't been applied yet.

### Option B — SQL editor (no CLI)

Open **SQL Editor** in the Supabase dashboard and run each file in
`supabase/migrations/` **in order**, one at a time, from
`20260101000000_extensions_and_enums.sql` through
`20260101001500_enable_realtime.sql`. Do not skip files — later migrations
add foreign keys, policies, and grants that assume earlier ones already ran.

## 3. What gets created

| # | File | Creates |
|---|---|---|
| 1 | `..._extensions_and_enums.sql` | `pgcrypto`, all enum types, `set_updated_at()` trigger fn |
| 2 | `..._profiles.sql` | `profiles` table; first signup becomes `ADMIN`, everyone after is `TRADER` |
| 3 | `..._mt5_accounts.sql` | `mt5_accounts`, `mt5_account_settings`, `ea_connections` |
| 4 | `..._strategy.sql` | `strategies`, `strategy_settings` |
| 5 | `..._risk_settings.sql` | `risk_settings` + trigger that seeds a default risk profile & strategy for every new user |
| 6 | `..._signals_commands.sql` | `signals`, `trade_commands` (with idempotency constraints) |
| 7 | `..._trades_positions.sql` | `trade_executions`, `positions`, `closed_trades` |
| 8 | `..._stats.sql` | `daily_statistics`, `performance_statistics` |
| 9 | `..._system_logs.sql` | `system_events`, `audit_logs` |
| 10 | `..._trading_state.sql` | `trading_state` (global AUTO TRADING STATUS + mode, per user) |
| 11 | `..._rls_policies.sql` | Enables RLS on every table + helper functions (`current_user_role()`, `is_admin()`, `owns_account()`) |
| 12 | `..._views_and_grants.sql` | `account_totals`, `open_trade_counts` views, explicit grants |
| 13 | `..._stats_triggers.sql` | Trigger that keeps `daily_statistics` correct automatically whenever a trade closes |
| 14 | `..._security_hardening.sql` | Pins `search_path` on `set_updated_at()`; revokes unnecessary `anon`/`authenticated` EXECUTE on trigger-only and RLS-helper functions |
| 15 | `..._rls_performance_and_fk_indexes.sql` | Rewrites every RLS policy to call `(select auth.uid())` instead of `auth.uid()` (evaluated once per query, not once per row); adds 9 missing FK indexes |
| 16 | `..._enable_realtime.sql` | Adds the dashboard's tables to the `supabase_realtime` publication (see step 5 — a new project's publication starts empty) |

Note: the helper function is named **`current_user_role()`**, not
`current_role` — `current_role` is a reserved SQL-standard function name in
Postgres and fails with a syntax error if you try to create a function
with that exact name unquoted. This was caught by actually running these
migrations against a live project.

## 4. Row Level Security — what it actually does

Every table has RLS enabled. Two access patterns exist:

- **Browser (anon key + user session)**: can `SELECT` its own rows on
  system-owned tables (`signals`, `trade_commands`, `trade_executions`,
  `positions`, `closed_trades`, `daily_statistics`,
  `performance_statistics`, `system_events`, `audit_logs`) and can
  `SELECT`/`UPDATE`/`INSERT` its own `mt5_accounts`, `mt5_account_settings`,
  `strategies`, `strategy_settings`, `risk_settings` — always scoped by
  `owns_account(...)` / `user_id = auth.uid()`. It can never write to the
  system-owned tables directly.
- **Service role (Next.js API routes, trading engine)**: bypasses RLS
  entirely, but every write path that uses it (API routes, the EA webhook
  handlers, the trading engine's repository layer) still validates input
  and checks role/ownership in application code before writing — RLS is a
  backstop, not the only check.

If you ever add a new table, follow the same pattern in
`20260101001000_rls_policies.sql`'s style: enable RLS immediately, and
never leave a table with RLS disabled "temporarily."

## 5. Enable Realtime

Realtime is used for the live dashboard (status badge, account cards,
positions, signals). **A new Supabase project's `supabase_realtime`
publication starts completely empty** — nothing is enabled by default, so
this step is not optional. Migration 16 (`..._enable_realtime.sql`) handles
it for you; to verify, go to **Database → Replication** in the Supabase
dashboard and confirm these tables are listed: `trading_state`,
`mt5_accounts`, `ea_connections`, `signals`, `trade_commands`, `positions`,
`closed_trades`, `daily_statistics`. You can also check directly with SQL:

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

## 5a. Security and performance advisors

After running the migrations, open **Advisors → Security** and
**Advisors → Performance** in the Supabase dashboard (or call the
equivalent Supabase MCP tools if you're doing this from an agent). On the
already-provisioned project, this surfaced and fixed:

- `set_updated_at()` had a mutable `search_path` — fixed in migration 14.
- Every `SECURITY DEFINER` helper/trigger function was directly callable
  via `/rest/v1/rpc/<name>` by `anon`/`authenticated` because Supabase
  grants `EXECUTE` on new public-schema functions to those roles by
  default — fixed in migration 14 by revoking it from the four
  trigger-only functions entirely, and from `anon` (but not
  `authenticated`, which needs it for RLS) on the three RLS-helper
  functions.
- Every RLS policy re-evaluated `auth.uid()`/`auth.role()` per row instead
  of once per query — fixed in migration 15.
- Several foreign keys had no covering index — fixed in migration 15.

The remaining, expected findings after all of that: `current_user_role()`,
`is_admin()`, and `owns_account()` still show as "callable by
`authenticated`" — that's correct and required, since RLS policies on
every protected table call them as the `authenticated` role for every
query. Revoking that would break Row Level Security entirely, not improve
it. You'll also see `unused_index` INFO-level notices on a fresh project
with zero rows and zero query history — those clear up on their own once
the app has real traffic and are not something to act on.

## 6. Auth settings

- **Email confirmations**: enable them for production (Authentication →
  Providers → Email). For quick local testing you can disable "Confirm
  email" so signups are usable immediately.
- **Site URL / Redirect URLs**: set to your deployed app URL (and
  `http://localhost:3000` for local dev) under Authentication → URL
  Configuration, so password-reset links in `app/(auth)/reset-password`
  work correctly.

## 7. Verify

After migrations run, `select count(*) from information_schema.tables where table_schema = 'public';`
should show 16 base tables (the spec's list) plus `trading_state` = 17, and
`select * from pg_policies where schemaname = 'public';` should show
policies on every one of them. Sign up once in the running web app and
confirm a row appeared in `profiles` with `role = 'ADMIN'` and that
`risk_settings` / `strategies` / `strategy_settings` were auto-seeded.
